import { withRoute } from '@/lib/api/withRoute';
import { ok, err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { dispatchDueCommMessages } from '@/lib/communications/dispatcher';
import { rateLimit } from '@/lib/security/rateLimit';

export const POST = withRoute(async (req: Request) => {
  const url = new URL(req.url);
  const searchOrgId = url.searchParams.get('orgId');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const rateLimitResult = rateLimit({
    req,
    key: 'comm:dispatch',
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimitResult.ok) return rateLimitResult;

  const orgId = typeof body?.orgId === 'string' ? body.orgId : searchOrgId;
  const limit = typeof body?.limit === 'number' ? body.limit : undefined;
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = req.headers.get('x-cron-secret');

  if (cronSecret && headerSecret === cronSecret) {
    await dispatchDueCommMessages({ orgId: orgId ?? undefined, limit });
    return ok({ dispatched: true });
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  await dispatchDueCommMessages({ orgId: context.data.orgId, limit });
  return ok({ dispatched: true });
});
