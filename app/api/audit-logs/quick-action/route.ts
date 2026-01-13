import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';

/**
 * POST /api/audit-logs/quick-action
 * Body: { orgId, entityType, entityId, actionId, label }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const entityType = typeof body?.entityType === 'string' ? body.entityType : null;
  const entityId = body?.entityId ? String(body.entityId) : null;
  const actionId = typeof body?.actionId === 'string' ? body.actionId : null;
  const label = typeof body?.label === 'string' ? body.label : null;

  if (!entityType || !actionId) {
    return err('VALIDATION_ERROR', 'entityType and actionId are required');
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;

  void logAuditEvent({
    orgId: context.data.orgId,
    actorUserId: actor.userId,
    actorType: 'user',
    action: 'VIEW',
    entityType,
    entityId,
    before: null,
    after: null,
    metadata: buildAuditMetadata(req, { actionId, label }),
  });

  return ok({ logged: true });
});
