import { withRoute } from '@/lib/api/withRoute';
import { ok, err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { runDailyCrewDigest } from '@/lib/communications/digest';
import { rateLimit } from '@/lib/security/rateLimit';

export const POST = withRoute(async (req: Request) => {
  const url = new URL(req.url);
  const searchOrgId = url.searchParams.get('orgId');
  const queryDate = url.searchParams.get('date');
  const queryForce = url.searchParams.get('force');
  const queryIncludeTomorrow = url.searchParams.get('includeTomorrow');
  const querySendEmpty = url.searchParams.get('sendEmpty');
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const rateLimitResult = rateLimit({
    req,
    key: 'comm:daily-digest',
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimitResult.ok) return rateLimitResult;

  const orgId = typeof body?.orgId === 'string' ? body.orgId : searchOrgId;
  const date = typeof body?.date === 'string' ? body.date : queryDate;
  const force = typeof body?.force === 'boolean' ? body.force : queryForce === 'true';
  const includeTomorrow =
    typeof body?.includeTomorrow === 'boolean' ? body.includeTomorrow : queryIncludeTomorrow === 'true';
  const sendEmpty = typeof body?.sendEmpty === 'boolean' ? body.sendEmpty : querySendEmpty === 'true';
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = req.headers.get('x-cron-secret');

  if (cronSecret && headerSecret === cronSecret) {
    await runDailyCrewDigest({
      orgId: orgId ?? undefined,
      date: date ?? undefined,
      includeTomorrow,
      sendEmpty,
      force,
      source: 'cron',
    });
    return ok({ dispatched: true });
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  await runDailyCrewDigest({
    orgId: context.data.orgId,
    date: date ?? undefined,
    includeTomorrow,
    sendEmpty,
    force,
    source: 'api',
  });
  return ok({ dispatched: true });
});
