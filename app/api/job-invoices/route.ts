import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listJobInvoices } from '@/lib/queries/job_invoices';
import { requireOrgContext } from '@/lib/auth/require';
import { canAccessFinancials } from '@/lib/auth/routeAccess';

/**
 * GET /api/job-invoices
 * Query:
 * - orgId (required)
 * - jobId (optional)
 * - limit (optional)
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canAccessFinancials(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const limit = searchParams.get('limit');
  return await listJobInvoices({
    orgId: context.data.orgId,
    jobId: searchParams.get('jobId') || undefined,
    limit: limit ? Number(limit) : undefined,
    actor: context.data.actor,
  });
});
