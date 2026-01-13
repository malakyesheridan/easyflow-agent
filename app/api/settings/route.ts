import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { upsertOrgSettings } from '@/lib/mutations/org_settings';
import { canManageOrgSettings } from '@/lib/authz';
import { requireOrgContext } from '@/lib/auth/require';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

/**
 * GET /api/settings?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await getOrgSettings({ orgId: context.data.orgId });
});

/**
 * PATCH /api/settings
 * Body: OrgSettingsUpdateInput
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageOrgSettings(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const before = await getOrgSettings({ orgId: context.data.orgId });
  const result = await upsertOrgSettings({ ...body, orgId: context.data.orgId });
  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: actor.userId,
      actorType: 'user',
      action: 'SETTINGS_CHANGE',
      entityType: 'org_settings',
      entityId: context.data.orgId,
      before: before.ok ? before.data : null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
  }
  return result;
});
