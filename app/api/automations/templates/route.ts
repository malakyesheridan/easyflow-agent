import { withRoute } from '@/lib/api/withRoute';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { err, ok } from '@/lib/result';
import { AUTOMATION_TEMPLATES } from '@/lib/automations/templates';

/**
 * GET /api/automations/templates?orgId=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
  return ok(AUTOMATION_TEMPLATES);
});
