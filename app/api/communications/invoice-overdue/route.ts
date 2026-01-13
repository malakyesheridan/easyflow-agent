import { withRoute } from '@/lib/api/withRoute';
import { ok, err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { runInvoiceOverdueCheck } from '@/lib/financials/invoiceOverdue';
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
    key: 'comm:invoice-overdue',
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimitResult.ok) return rateLimitResult;

  const orgId = typeof body?.orgId === 'string' ? body.orgId : searchOrgId;
  const cronSecret = process.env.CRON_SECRET?.trim();
  const headerSecret = req.headers.get('x-cron-secret');

  if (cronSecret && headerSecret === cronSecret) {
    const results = await runInvoiceOverdueCheck({
      orgId: orgId ?? undefined,
      source: 'cron',
    });
    return ok({ dispatched: true, results });
  }

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const results = await runInvoiceOverdueCheck({
    orgId: context.data.orgId,
    source: 'api',
  });
  return ok({ dispatched: true, results });
});
