import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listAuditLogs } from '@/lib/queries/audit_logs';
import { requireOrgContext } from '@/lib/auth/require';
import { canViewAuditLogs } from '@/lib/authz';

/**
 * GET /api/audit-logs?orgId=...&limit=...&cursor=...&entityType=...&entityId=...&action=...&actorUserId=...&actor=...&startDate=...&endDate=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewAuditLogs(context.data.actor)) {
    return err('FORBIDDEN', 'Insufficient permissions');
  }

  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  const result = await listAuditLogs({
    orgId: context.data.orgId,
    limit: Number.isFinite(limit as number) ? limit : undefined,
    cursor: searchParams.get('cursor') || undefined,
    entityType: searchParams.get('entityType') || undefined,
    entityId: searchParams.get('entityId') || undefined,
    action: searchParams.get('action') || undefined,
    actorUserId: searchParams.get('actorUserId') || undefined,
    actorQuery: searchParams.get('actor') || undefined,
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
  });

  return result;
});
