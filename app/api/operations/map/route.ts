import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getOperationsMapData } from '@/lib/queries/operations_map';
import { canViewOperations } from '@/lib/authz';

const handler = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canViewOperations(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await getOperationsMapData({ orgId: context.data.orgId, actor: context.data.actor });
});

/**
 * GET /api/operations/map
 */
export async function GET(req: Request): Promise<Response> {
  const response = await handler(req);
  response.headers.set('Cache-Control', 'private, max-age=15, stale-while-revalidate=30');
  return response;
}
