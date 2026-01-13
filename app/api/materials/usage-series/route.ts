import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { getMaterialUsageSeries } from '@/lib/queries/materials';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageWarehouse } from '@/lib/authz';

/**
 * GET /api/materials/usage-series?orgId=...&materialId=...&days=7|30|180
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const materialId = searchParams.get('materialId');
  const days = searchParams.get('days');
  if (!materialId) return err('VALIDATION_ERROR', 'materialId is required');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageWarehouse(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  const parsedDays = days ? Number(days) : 30;
  if (![7, 30, 180].includes(parsedDays)) return err('VALIDATION_ERROR', 'days must be 7, 30, or 180');
  return await getMaterialUsageSeries({ orgId: context.data.orgId, materialId, days: parsedDays as 7 | 30 | 180 });
});
