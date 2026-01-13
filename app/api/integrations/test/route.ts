import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { IntegrationRegistry, isIntegrationProvider } from '@/lib/integrations/registry';
import { getMissingRequiredFields } from '@/lib/integrations/validation';
import { testIntegrationConnection } from '@/lib/integrations/testHandlers';
import { saveIntegrationTestResult } from '@/lib/mutations/integrations';
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
 * POST /api/integrations/test
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
  const credentialsWithMode = {
    ...credentials,
    ...(mode ? { mode } : {}),
  };

  let testResult;
  try {
    testResult = await testIntegrationConnection(provider, credentialsWithMode);
  } catch (error) {
    testResult = { ok: false, error: error instanceof Error ? error.message : 'Integration test failed' };
  }

  const status = testResult.ok ? 'connected' : 'error';
  const saveResult = await saveIntegrationTestResult({
    orgId: context.data.orgId,
    provider,
    displayName,
    credentials: credentialsWithMode,
    status,
    lastError: testResult.ok ? null : testResult.error ?? 'Integration test failed',
  });

  if (!saveResult.ok) return saveResult;
  if (!testResult.ok) {
    return err('INTEGRATION_TEST_FAILED', testResult.error ?? 'Integration test failed');
  }

  void emitCommEvent({
    orgId: context.data.orgId,
    eventKey: 'integration_connected',
    entityType: 'system',
    entityId: saveResult.data.id,
    triggeredByUserId: context.data.actor.userId,
    payload: {
      integrationId: saveResult.data.id,
      provider,
      displayName: saveResult.data.displayName,
      status: saveResult.data.status,
    },
    actorRoleKey: context.data.actor.roleKey,
  });

  return saveResult;
});
