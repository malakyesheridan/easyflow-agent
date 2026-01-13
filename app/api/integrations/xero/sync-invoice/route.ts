import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageJobs } from '@/lib/authz';
import { queueXeroInvoiceSync } from '@/lib/integrations/xeroSync';

export const POST = withRoute(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const orgId = body?.orgId ? String(body.orgId) : null;
  const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId : null;
  const jobId = typeof body?.jobId === 'string' ? body.jobId : null;

  if (!invoiceId) return err('VALIDATION_ERROR', 'invoiceId is required');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  return await queueXeroInvoiceSync({
    orgId: context.data.orgId,
    invoiceId,
    jobId,
    source: 'manual',
    actorUserId: context.data.actor.userId ?? null,
  });
});
