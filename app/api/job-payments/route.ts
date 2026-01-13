import { randomUUID } from 'crypto';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { listJobPayments } from '@/lib/queries/job_payments';
import { getJobById } from '@/lib/queries/jobs';
import { getIntegration } from '@/lib/integrations/getIntegration';
import { runStripeAction } from '@/lib/integrations/actions/stripe';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageJobs } from '@/lib/authz';
import { canAccessFinancials } from '@/lib/auth/routeAccess';

/**
 * GET /api/job-payments
 * Query:
 * - orgId (required)
 * - jobId (optional)
 * - limit (optional)
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canAccessFinancials(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const limit = searchParams.get('limit');
  return await listJobPayments({
    orgId: context.data.orgId,
    jobId: searchParams.get('jobId') || undefined,
    invoiceId: searchParams.get('invoiceId') || undefined,
    limit: limit ? Number(limit) : undefined,
    actor: context.data.actor,
  });
});

/**
 * POST /api/job-payments
 * Body:
 * - orgId (required)
 * - jobId (required)
 * - amountCents (required)
 * - currency (optional)
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageJobs(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const jobId = typeof body?.jobId === 'string' ? body.jobId : '';
  const amountCents = typeof body?.amountCents === 'number' ? Math.round(body.amountCents) : null;
  const currency = typeof body?.currency === 'string' ? body.currency : 'AUD';
  if (!jobId || !amountCents || amountCents <= 0) {
    return err('VALIDATION_ERROR', 'jobId and amountCents are required');
  }

  const integration = await getIntegration(context.data.orgId, 'stripe');
  if (!integration.enabled || !integration.credentials || integration.status !== 'connected') {
    return err('VALIDATION_ERROR', 'Stripe integration is not enabled');
  }

  const jobResult = await getJobById(jobId, context.data.orgId);
  const jobTitle = jobResult.ok ? jobResult.data.title : undefined;

  const actionResult = await runStripeAction({
    orgId: context.data.orgId,
    eventType: 'payment.link.created',
    actionType: 'stripe.create_payment_link',
    payload: {
      event: {
        jobId,
        amountCents,
        currency,
        jobTitle,
      },
      action: {
        amountCents,
        currency,
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

  return ok(actionResult.response ?? null);
});
