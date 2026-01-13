import { desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobs } from '@/db/schema/jobs';
import { createJobInvoiceDraft } from '@/lib/mutations/job_invoices';
import { queueXeroInvoiceSync } from '@/lib/integrations/xeroSync';

export const POST = withRoute(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const orgId = body?.orgId ? String(body.orgId) : null;

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const invoiceRow = await withIntegrationOrgScope(context.data.orgId, async (db) => {
    const [row] = await db
      .select({
        id: jobInvoices.id,
        jobId: jobInvoices.jobId,
      })
      .from(jobInvoices)
      .where(eq(jobInvoices.orgId, context.data.orgId))
      .orderBy(desc(jobInvoices.createdAt))
      .limit(1);
    return row ?? null;
  });

  let invoiceId = invoiceRow?.id ?? null;
  let jobId = invoiceRow?.jobId ?? null;

  if (!invoiceId) {
    const jobRow = await withIntegrationOrgScope(context.data.orgId, async (db) => {
      const [row] = await db
        .select({ id: jobs.id })
        .from(jobs)
        .where(eq(jobs.orgId, context.data.orgId))
        .orderBy(desc(jobs.createdAt))
        .limit(1);
      return row ?? null;
    });

    if (!jobRow?.id) {
      return err('NOT_FOUND', 'No job available for a test invoice');
    }

    const draftResult = await createJobInvoiceDraft({
      orgId: context.data.orgId,
      jobId: jobRow.id,
      amountCents: 10000,
      currency: 'AUD',
      summary: 'Xero test invoice',
      createdBy: context.data.actor.userId ?? null,
    });
    if (!draftResult.ok) return draftResult;
    invoiceId = draftResult.data.id;
    jobId = draftResult.data.jobId;
  }

  const queued = await queueXeroInvoiceSync({
    orgId: context.data.orgId,
    invoiceId,
    jobId,
    source: 'test',
    actorUserId: context.data.actor.userId ?? null,
  });
  if (!queued.ok) return queued;

  return queued;
});
