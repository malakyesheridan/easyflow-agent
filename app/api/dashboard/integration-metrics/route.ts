import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { getIntegrationMetrics } from '@/lib/queries/integration_metrics';
import { requireOrgContext } from '@/lib/auth/require';

/**
 * GET /api/dashboard/integration-metrics?orgId=...&days=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const daysParam = searchParams.get('days');
  const days = daysParam ? Number(daysParam) : 7;

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!Number.isFinite(days) || days <= 0) {
    return err('VALIDATION_ERROR', 'Invalid days parameter');
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  return await getIntegrationMetrics({ orgId: context.data.orgId, since });
});
