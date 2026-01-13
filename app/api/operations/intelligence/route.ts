import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getOperationsIntelligence } from '@/lib/queries/operations_intelligence';
import { canViewOperations } from '@/lib/authz';

const handler = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewOperations(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const severityParams = searchParams.getAll('severity');
  const severity = severityParams.length > 0 ? severityParams.join(',') : searchParams.get('severity');
  const crewId = searchParams.get('crewId');
  const jobId = searchParams.get('jobId');
  const timeWindowRaw = searchParams.get('timeWindow');
  const timeWindowMinutes = timeWindowRaw ? Number.parseFloat(timeWindowRaw) : null;

  return await getOperationsIntelligence({
    orgId: context.data.orgId,
    actor: context.data.actor,
    filters: {
      severity,
      crewId,
      jobId,
      timeWindowMinutes: Number.isFinite(timeWindowMinutes ?? Number.NaN) ? timeWindowMinutes : null,
    },
  });
});

/**
 * GET /api/operations/intelligence
 */
export async function GET(req: Request): Promise<Response> {
  const response = await handler(req);
  response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
  return response;
}
