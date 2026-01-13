import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listIntegrations } from '@/lib/queries/integrations';
import { saveIntegrationCredentials, updateIntegration, deleteIntegration } from '@/lib/mutations/integrations';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { IntegrationRegistry, isIntegrationProvider } from '@/lib/integrations/registry';
import { getMissingRequiredFields } from '@/lib/integrations/validation';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { getIntegrationById } from '@/lib/queries/integrations';
import { emitCommEvent } from '@/lib/communications/emit';

function normalizeCredentials(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string') return null;
    normalized[key] = value;
  }
  return normalized;
}

/**
 * GET /api/integrations?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await listIntegrations({ orgId: context.data.orgId });
});

/**
 * POST /api/integrations
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const provider = typeof body?.provider === 'string' ? body.provider.trim() : '';
  if (!provider || !isIntegrationProvider(provider)) {
    return err('VALIDATION_ERROR', 'Unsupported integration provider');
  }

  const credentials = normalizeCredentials(body?.credentials);
  if (!credentials) return err('VALIDATION_ERROR', 'Credentials are required');

  const missing = getMissingRequiredFields(provider, credentials);
  if (missing.length > 0) {
    return err('VALIDATION_ERROR', `Missing required fields: ${missing.join(', ')}`);
  }

  const registry = IntegrationRegistry[provider];
  const displayName = typeof body?.displayName === 'string' && body.displayName.trim()
    ? body.displayName.trim()
    : registry.name;
  const mode = body?.mode === 'test' || body?.mode === 'live' ? body.mode : undefined;

  const result = await saveIntegrationCredentials({
    orgId: context.data.orgId,
    provider,
    displayName,
    credentials,
    mode,
  });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'integration',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req, { provider }),
    });
  }
  return result;
});

/**
 * PATCH /api/integrations
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = await getIntegrationById({ orgId: context.data.orgId, id: String(body.id) });
  const result = await updateIntegration({
    id: String(body.id),
    orgId: context.data.orgId,
    displayName: typeof body?.displayName === 'string' ? body.displayName.trim() : undefined,
    enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
    rules: Array.isArray(body?.rules) ? body.rules : undefined,
  });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'INTEGRATION_CHANGE',
      entityType: 'integration',
      entityId: result.data.id,
      before: before.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
    const beforeStatus = before.ok && before.data ? before.data.status : null;
    if (beforeStatus && beforeStatus !== result.data.status && result.data.status === 'disabled') {
      void emitCommEvent({
        orgId: context.data.orgId,
        eventKey: 'integration_disconnected',
        entityType: 'system',
        entityId: result.data.id,
        triggeredByUserId: context.data.actor.userId,
        payload: {
          integrationId: result.data.id,
          provider: result.data.provider,
          displayName: result.data.displayName,
          status: result.data.status,
        },
        actorRoleKey: context.data.actor.roleKey,
      });
    }
    if (beforeStatus && beforeStatus !== result.data.status && result.data.status === 'connected') {
      void emitCommEvent({
        orgId: context.data.orgId,
        eventKey: 'integration_connected',
        entityType: 'system',
        entityId: result.data.id,
        triggeredByUserId: context.data.actor.userId,
        payload: {
          integrationId: result.data.id,
          provider: result.data.provider,
          displayName: result.data.displayName,
          status: result.data.status,
        },
        actorRoleKey: context.data.actor.roleKey,
      });
    }
  }
  return result;
});

/**
 * DELETE /api/integrations
 */
export const DELETE = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = await getIntegrationById({ orgId: context.data.orgId, id: String(body.id) });
  const result = await deleteIntegration({
    id: String(body.id),
    orgId: context.data.orgId,
  });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'DELETE',
      entityType: 'integration',
      entityId: String(body.id),
      before: before.ok ? before.data : null,
      after: null,
      metadata: buildAuditMetadata(req),
    });
    if (before.ok && before.data) {
      void emitCommEvent({
        orgId: context.data.orgId,
        eventKey: 'integration_disconnected',
        entityType: 'system',
        entityId: before.data.id,
        triggeredByUserId: context.data.actor.userId,
        payload: {
          integrationId: before.data.id,
          provider: before.data.provider,
          displayName: before.data.displayName,
          status: before.data.status,
        },
        actorRoleKey: context.data.actor.roleKey,
      });
    }
  }
  return result;
});
