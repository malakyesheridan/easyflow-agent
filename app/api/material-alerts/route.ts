import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { canManageWarehouse } from '@/lib/authz';
import { listActiveMaterialAlerts } from '@/lib/queries/material_alerts';
import { requireOrgContext } from '@/lib/auth/require';

/**
 * GET /api/material-alerts?orgId=...&limit=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageWarehouse(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined;
  return await listActiveMaterialAlerts({ orgId: context.data.orgId, limit });
});
