import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listIntegrationEvents } from '@/lib/queries/integration_events';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageWarehouse } from '@/lib/authz';

/**
 * GET /api/warehouse/integration-activity
 * Query:
 * - orgId (required)
 * - limit (optional)
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageWarehouse(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const limit = searchParams.get('limit');
  return await listIntegrationEvents({
    orgId: context.data.orgId,
    provider: 'inventory_generic',
    limit: limit ? Number(limit) : 100,
  });
});
