import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { listBuyerPipelineStages } from '@/lib/queries/buyer_pipeline_stages';
import { replaceBuyerPipelineStages } from '@/lib/mutations/buyer_pipeline_stages';

/**
 * GET /api/buyer-pipeline?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await listBuyerPipelineStages({ orgId: context.data.orgId });
});

/**
 * PUT /api/buyer-pipeline
 */
export const PUT = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await replaceBuyerPipelineStages({ ...body, orgId: context.data.orgId });
});
