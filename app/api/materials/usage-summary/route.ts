import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { getMaterialUsageSummary } from '@/lib/queries/material_usage_summary';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageWarehouse } from '@/lib/authz';

/**
 * GET /api/materials/usage-summary?orgId=...&startDate=...&endDate=...
 * Returns usage totals grouped by material unit.
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageWarehouse(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  if (!startDate || !endDate) return err('VALIDATION_ERROR', 'startDate and endDate query parameters are required');

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid startDate or endDate');
  }

  return await getMaterialUsageSummary({ orgId: context.data.orgId, startDate: start, endDate: end });
});
