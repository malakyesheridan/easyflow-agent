import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listDashboardActivity } from '@/lib/queries/dashboard_activity';
import { requireOrgContext } from '@/lib/auth/require';

/**
 * GET /api/dashboard/activity?orgId=...&startDate=...&endDate=...&limit=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const limitParam = searchParams.get('limit');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!startDate || !endDate) return err('VALIDATION_ERROR', 'startDate and endDate query parameters are required');

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid startDate or endDate');
  }

  const limit = limitParam ? Number(limitParam) : undefined;
  if (limitParam && !Number.isFinite(limit)) {
    return err('VALIDATION_ERROR', 'Invalid limit');
  }

  return await listDashboardActivity({
    orgId: context.data.orgId,
    startDate: start,
    endDate: end,
    limit,
    actor: context.data.actor,
  });
});
