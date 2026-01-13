import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { dispatchAutomationActions } from '@/lib/automations/dispatcher';
import { rateLimit } from '@/lib/security/rateLimit';

/**
 * POST /api/automations/dispatch
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const rateLimitResult = rateLimit({
    req,
    key: 'automations:dispatch',
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimitResult.ok) return rateLimitResult;

  const limit = typeof body?.limit === 'number' ? body.limit : undefined;
  const result = await dispatchAutomationActions({ orgId: context.data.orgId, limit });
  return ok(result);
});
