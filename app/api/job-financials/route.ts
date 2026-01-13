import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getJobProfitability } from '@/lib/financials/jobProfitability';
import { canManageJobs } from '@/lib/authz';

/**
 * GET /api/job-financials?orgId=...&jobId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!jobId) return err('VALIDATION_ERROR', 'jobId query parameter is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await getJobProfitability({ orgId: context.data.orgId, jobId });
});
