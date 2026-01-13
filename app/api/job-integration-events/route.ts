import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listIntegrationEvents } from '@/lib/queries/integration_events';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageJobs } from '@/lib/authz';

/**
 * GET /api/job-integration-events
 * Query:
 * - orgId (required)
 * - jobId (required)
 * - limit (optional)
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const jobId = searchParams.get('jobId');
  if (!jobId) return err('VALIDATION_ERROR', 'jobId is required');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const limit = searchParams.get('limit');
  return await listIntegrationEvents({
    orgId: context.data.orgId,
    jobId,
    limit: limit ? Number(limit) : undefined,
  });
});
