import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getMatchingConfig } from '@/lib/queries/matching_config';
import { upsertMatchingConfig } from '@/lib/mutations/matching_config';

/**
 * GET /api/matching-config?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await getMatchingConfig({ orgId: context.data.orgId });
});

/**
 * PUT /api/matching-config
 */
export const PUT = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await upsertMatchingConfig({ ...body, orgId: context.data.orgId });
});
