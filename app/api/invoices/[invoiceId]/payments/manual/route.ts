import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { getJobInvoiceById } from '@/lib/queries/job_invoices';
import { listJobPayments } from '@/lib/queries/job_payments';
import { createJobPayment } from '@/lib/mutations/job_payments';
import { isSuccessfulPaymentStatus } from '@/lib/financials/invoiceState';

interface RouteParams {
  params: Promise<{ invoiceId: string }>;
}

const METHOD_ALLOWLIST = new Set(['eft', 'cash', 'cheque', 'pos', 'xero', 'other']);

/**
 * POST /api/invoices/[invoiceId]/payments/manual
 * Body:
 * - orgId (required)
 * - amountCents or amount (required)
 * - method (required)
 * - paidAt (optional, ISO)
 * - reference (optional)
 * - notes (optional)
 */
export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
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

    const status = String(invoiceResult.data.status ?? '').toLowerCase();
    if (status === 'void' || status === 'draft') {
      return err('VALIDATION_ERROR', 'Invoice must be issued before recording payment');
    }

    const amountRaw = typeof body?.amountCents === 'number' ? body.amountCents : body?.amount;
    const amountCents = typeof amountRaw === 'number' && Number.isFinite(amountRaw) ? Math.round(amountRaw) : null;
    if (!amountCents || amountCents <= 0) {
      return err('VALIDATION_ERROR', 'amountCents must be greater than zero');
    }

    const methodRaw = typeof body?.method === 'string' ? body.method : '';
    const method = methodRaw.toLowerCase();
    if (!METHOD_ALLOWLIST.has(method)) {
      return err('VALIDATION_ERROR', 'Invalid payment method');
    }

    const paidAtInput = typeof body?.paidAt === 'string' ? new Date(body.paidAt) : null;
    const paidAt = paidAtInput && !Number.isNaN(paidAtInput.getTime()) ? paidAtInput : new Date();
    const reference = typeof body?.reference === 'string' ? body.reference : null;
    const notes = typeof body?.notes === 'string' ? body.notes : null;

    const existingPayments = await listJobPayments({
      orgId: context.data.orgId,
      invoiceId,
      actor: context.data.actor,
    });
    if (!existingPayments.ok) return existingPayments;

    const totalCents = Number(invoiceResult.data.totalCents ?? invoiceResult.data.amountCents ?? 0);
    const paidCents = (existingPayments.data ?? []).reduce((sum, payment) => {
      if (isSuccessfulPaymentStatus(payment.status)) {
        return sum + Number(payment.amountCents ?? 0);
      }
      return sum;
    }, 0);
    const outstandingCents = Math.max(0, totalCents - paidCents);
    if (outstandingCents <= 0 && isSuccessfulPaymentStatus(invoiceResult.data.status)) {
      return err('VALIDATION_ERROR', 'Invoice is already paid');
    }

    return await createJobPayment({
      orgId: context.data.orgId,
      jobId: invoiceResult.data.jobId,
      invoiceId,
      provider: 'external',
      method,
      amountCents,
      currency: invoiceResult.data.currency ?? 'AUD',
      status: 'succeeded',
      paidAt,
      reference,
      notes,
      createdBy: context.data.actor.userId ?? null,
    });
  });

  return handler(req);
}
