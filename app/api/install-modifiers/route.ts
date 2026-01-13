import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listInstallModifiers } from '@/lib/queries/install_modifiers';
import { createInstallModifier, updateInstallModifier, seedDefaultInstallModifiers } from '@/lib/mutations/install_modifiers';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';

/**
 * GET /api/install-modifiers?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const listResult = await listInstallModifiers({ orgId: context.data.orgId });
  if (listResult.ok && listResult.data.length === 0) {
    await seedDefaultInstallModifiers(context.data.orgId);
    return await listInstallModifiers({ orgId: context.data.orgId });
  }
  return listResult;
});

/**
 * POST /api/install-modifiers
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await createInstallModifier({ ...body, orgId: context.data.orgId });
});

/**
 * PATCH /api/install-modifiers
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.id) return err('VALIDATION_ERROR', 'id is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return await updateInstallModifier({ ...body, orgId: context.data.orgId });
});
