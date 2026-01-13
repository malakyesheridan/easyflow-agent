import { randomUUID } from 'crypto';
import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { assertJobWriteAccess, canManageJobs } from '@/lib/authz';
import { getJobById } from '@/lib/queries/jobs';
import { getJobInvoiceById } from '@/lib/queries/job_invoices';
import { listJobPayments } from '@/lib/queries/job_payments';
import { getIntegration } from '@/lib/integrations/getIntegration';
import { runStripeAction } from '@/lib/integrations/actions/stripe';
import { isSuccessfulPaymentStatus } from '@/lib/financials/invoiceState';

interface RouteParams {
  params: Promise<{ id: string; invoiceId: string }>;
}

/**
 * POST /api/jobs/[id]/invoices/[invoiceId]/stripe-link
 */
export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { id, invoiceId } = await params;
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
    if (invoiceResult.data.jobId !== id) return err('VALIDATION_ERROR', 'Invoice does not belong to job');

    const jobResult = await getJobById(invoiceResult.data.jobId, context.data.orgId, context.data.actor);
    if (!jobResult.ok) return jobResult;
    const access = assertJobWriteAccess(jobResult.data, context.data.actor);
    if (!access.ok) return access;

    const integration = await getIntegration(context.data.orgId, 'stripe');
    if (!integration.enabled || !integration.credentials || integration.status !== 'connected') {
      return err('VALIDATION_ERROR', 'Stripe integration is not enabled');
    }

    const invoiceStatus = String(invoiceResult.data.status ?? '').toLowerCase();
    if (invoiceStatus === 'draft' || invoiceStatus === 'void') {
      return err('VALIDATION_ERROR', 'Invoice must be issued before creating a payment link');
    }

    const paymentsResult = await listJobPayments({
      orgId: context.data.orgId,
      invoiceId,
      actor: context.data.actor,
    });
    if (!paymentsResult.ok) return paymentsResult;

    const totalCents = Number(invoiceResult.data.totalCents ?? invoiceResult.data.amountCents ?? 0);
    const paidCents = (paymentsResult.data ?? []).reduce((sum, payment) => {
      if (isSuccessfulPaymentStatus(payment.status)) {
        return sum + Number(payment.amountCents ?? 0);
      }
      return sum;
    }, 0);
    const outstandingCents = Math.max(0, totalCents - paidCents);
    if (outstandingCents <= 0) {
      return err('VALIDATION_ERROR', 'Invoice is already paid');
    }

    const jobTitle = jobResult.ok ? jobResult.data.title : undefined;

    const actionResult = await runStripeAction({
      orgId: context.data.orgId,
      eventType: 'payment.link.created',
      actionType: 'stripe.create_payment_link',
      payload: {
        event: {
          jobId: invoiceResult.data.jobId,
          invoiceId,
          amountCents: outstandingCents,
          currency: invoiceResult.data.currency ?? 'AUD',
          jobTitle,
        },
        action: {
          amountCents: outstandingCents,
          currency: invoiceResult.data.currency ?? 'AUD',
          invoiceId,
        },
      },
      integrationId: integration.integrationId ?? '',
      provider: 'stripe',
      credentials: integration.credentials,
      idempotencyKey: randomUUID(),
    });

    if (!actionResult.ok) {
      return err('INTERNAL_ERROR', actionResult.error ?? 'Failed to create payment link');
    }

    return { ok: true, data: actionResult.response ?? null } as any;
  });

  return handler(req);
}
