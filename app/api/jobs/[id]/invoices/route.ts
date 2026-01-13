import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { createJobInvoiceDraft } from '@/lib/mutations/job_invoices';
import { computeInvoiceTotals, validateInvoiceLineItems } from '@/lib/financials/invoiceState';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/jobs/[id]/invoices
 * Body:
 * - orgId (required)
 * - amountCents (optional, cents)
 * - currency (optional)
 * - invoiceNumber (optional)
 * - summary (optional)
 * - lineItems (optional)
 * - issuedAt (optional, ISO)
 * - dueAt (optional, ISO)
 * - externalRef (optional)
 */
export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { id } = await params;
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

    const jobResult = await getJobById(id, context.data.orgId, context.data.actor);
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, context.data.actor);
    if (!access.ok) return access;

    const amountCents = typeof body?.amountCents === 'number' ? Math.round(body.amountCents) : null;
    const currency = typeof body?.currency === 'string' ? body.currency : 'AUD';
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

    const totals = computeInvoiceTotals({ lineItems, amountCents });
    if (totals.totalCents <= 0) {
      return err('VALIDATION_ERROR', 'Invoice total must be greater than zero');
    }

    return await createJobInvoiceDraft({
      orgId: context.data.orgId,
      jobId: id,
      amountCents: totals.totalCents,
      currency,
      invoiceNumber,
      summary,
      lineItems,
      issuedAt,
      dueAt: dueAtValue,
      externalRef,
      createdBy: context.data.actor.userId ?? null,
    });
  });

  return handler(req);
}
