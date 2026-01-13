import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { getJobInvoiceById } from '@/lib/queries/job_invoices';
import { updateJobInvoiceDraft } from '@/lib/mutations/job_invoices';
import { computeInvoiceTotals, validateInvoiceLineItems } from '@/lib/financials/invoiceState';

interface RouteParams {
  params: Promise<{ invoiceId: string }>;
}

/**
 * PATCH /api/invoices/[invoiceId]
 * Updates a draft invoice.
 */
export async function PATCH(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { invoiceId } = await params;
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const orgId = typeof body?.orgId === 'string' ? body.orgId : null;
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    const invoiceResult = await getJobInvoiceById({
      orgId: context.data.orgId,
      invoiceId,
      actor: context.data.actor,
    });
    if (!invoiceResult.ok || !invoiceResult.data) return err('NOT_FOUND', 'Invoice not found');

    const jobResult = await getJobById(invoiceResult.data.jobId, context.data.orgId, context.data.actor);
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, context.data.actor);
    if (!access.ok) return access;

    const amountCents = typeof body?.amountCents === 'number' ? Math.round(body.amountCents) : null;
    const subtotalCents = typeof body?.subtotalCents === 'number' ? Math.round(body.subtotalCents) : null;
    const taxCents = typeof body?.taxCents === 'number' ? Math.round(body.taxCents) : null;
    const totalCents = typeof body?.totalCents === 'number' ? Math.round(body.totalCents) : null;
    const currency = typeof body?.currency === 'string' ? body.currency : null;
    const invoiceNumber = typeof body?.invoiceNumber === 'string' ? body.invoiceNumber : null;
    const summary = typeof body?.summary === 'string' ? body.summary : null;
    const dueAt = typeof body?.dueAt === 'string' ? new Date(body.dueAt) : null;
    const dueAtValue = dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null;
    const issuedAtInput = typeof body?.issuedAt === 'string' ? new Date(body.issuedAt) : null;
    const issuedAt = issuedAtInput && !Number.isNaN(issuedAtInput.getTime()) ? issuedAtInput : null;
    const externalRef = typeof body?.externalRef === 'string' ? body.externalRef : null;
    const lineItems = body?.lineItems;

    const validation = validateInvoiceLineItems(lineItems);
    if (!validation.ok) {
      return err('VALIDATION_ERROR', validation.error);
    }

    const totals = computeInvoiceTotals({ lineItems, amountCents, subtotalCents, taxCents, totalCents });
    if (totals.totalCents <= 0) {
      return err('VALIDATION_ERROR', 'Invoice total must be greater than zero');
    }

    return await updateJobInvoiceDraft({
      orgId: context.data.orgId,
      id: invoiceId,
      amountCents: totals.totalCents,
      subtotalCents: totals.subtotalCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      currency: currency ?? undefined,
      invoiceNumber,
      summary,
      externalRef,
      lineItems,
      issuedAt,
      dueAt: dueAtValue,
      updatedBy: context.data.actor.userId ?? null,
    });
  });

  return handler(req);
}
