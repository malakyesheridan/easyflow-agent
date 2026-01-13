import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { and, eq, or } from 'drizzle-orm';
import { jobPayments } from '@/db/schema/job_payments';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { getIntegration } from '@/lib/integrations/getIntegration';
import { shouldSkipStripePaymentUpdate } from '@/lib/integrations/stripeWebhook';
import { rateLimit, getClientId } from '@/lib/security/rateLimit';
import { createJobPayment, updateJobPaymentStatus } from '@/lib/mutations/job_payments';

export const runtime = 'nodejs';

function parseStripeSignature(header: string): { timestamp: string; signatures: string[] } | null {
  const parts = header.split(',').map((item) => item.trim());
  const timestamp = parts
    .map((item) => item.split('='))
    .find(([key]) => key === 't')?.[1];
  const signatures = parts
    .map((item) => item.split('='))
    .filter(([key]) => key === 'v1')
    .map(([, value]) => value)
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) return null;
  return { timestamp, signatures };
}

function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  const parsed = parseStripeSignature(header);
  if (!parsed) return false;

  const signedPayload = `${parsed.timestamp}.${payload}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

  return parsed.signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  });
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  if (!orgId) {
    return NextResponse.json({ ok: false, error: 'orgId is required' }, { status: 400 });
  }

  const rateLimitResult = rateLimit({
    req,
    key: 'stripe:webhook',
    limit: 120,
    windowMs: 60_000,
    identifier: `${orgId}:${getClientId(req)}`,
  });
  if (!rateLimitResult.ok) {
    return NextResponse.json({ ok: false, error: rateLimitResult.error.message }, { status: 429 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'Missing Stripe signature' }, { status: 400 });
  }

  const payload = await req.text();
  const integration = await getIntegration(orgId, 'stripe');
  if (!integration.enabled || !integration.credentials) {
    return NextResponse.json({ ok: false, error: 'Stripe integration is not enabled' }, { status: 400 });
  }

  const secret = integration.credentials.webhook_secret || integration.credentials.webhookSecret;
  if (!secret || !verifyStripeSignature(payload, signature, secret)) {
    return NextResponse.json({ ok: false, error: 'Invalid Stripe signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  if (event?.type === 'checkout.session.completed') {
    const session = event.data?.object ?? {};
    const paymentLinkId = session.payment_link ? String(session.payment_link) : null;
    const checkoutSessionId = session.id ? String(session.id) : null;
    const paymentStatus = session.payment_status ? String(session.payment_status) : null;
    const paymentIntentId = session.payment_intent ? String(session.payment_intent) : null;
    const metadata = session.metadata ?? {};
    const jobId = typeof metadata.jobId === 'string' ? metadata.jobId : null;
    const invoiceId = typeof metadata.invoiceId === 'string' ? metadata.invoiceId : null;
    const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : null;
    const currency = typeof session.currency === 'string' ? session.currency.toUpperCase() : null;

    if (paymentStatus === 'paid' && (paymentLinkId || checkoutSessionId)) {
      await withIntegrationOrgScope(orgId, async (db) => {
        let matched = null as null | { id: string; jobId: string; status: string };

        if (paymentIntentId) {
          const [byIntent] = await db
            .select({ id: jobPayments.id, jobId: jobPayments.jobId, status: jobPayments.status })
            .from(jobPayments)
            .where(and(eq(jobPayments.orgId, orgId), eq(jobPayments.providerPaymentId, paymentIntentId)))
            .limit(1);
          matched = byIntent ?? null;
        }

        if (!matched) {
          let matchClause = null;
          if (paymentLinkId && checkoutSessionId) {
            matchClause = or(
              eq(jobPayments.stripePaymentLinkId, paymentLinkId),
              eq(jobPayments.stripeCheckoutSessionId, checkoutSessionId)
            );
          } else if (paymentLinkId) {
            matchClause = eq(jobPayments.stripePaymentLinkId, paymentLinkId);
          } else if (checkoutSessionId) {
            matchClause = eq(jobPayments.stripeCheckoutSessionId, checkoutSessionId);
          }

          if (matchClause) {
            const [row] = await db
              .select({ id: jobPayments.id, jobId: jobPayments.jobId, status: jobPayments.status })
              .from(jobPayments)
              .where(and(eq(jobPayments.orgId, orgId), matchClause))
              .limit(1);
            matched = row ?? null;
          }
        }

        if (matched) {
          if (shouldSkipStripePaymentUpdate(matched.status)) return;
          await updateJobPaymentStatus({
            orgId,
            id: matched.id,
            status: 'succeeded',
            providerPaymentId: paymentIntentId ?? checkoutSessionId ?? undefined,
            stripeCheckoutSessionId: checkoutSessionId ?? undefined,
            paidAt: new Date(),
          });
        } else if (jobId) {
          await createJobPayment({
            orgId,
            jobId,
            invoiceId: invoiceId ?? null,
            provider: 'stripe',
            method: 'stripe_card',
            amountCents: amountTotal ?? 0,
            currency: currency ?? 'AUD',
            status: 'succeeded',
            paymentLinkUrl: null,
            stripePaymentLinkId: paymentLinkId ?? null,
            stripeCheckoutSessionId: checkoutSessionId ?? null,
            providerPaymentId: paymentIntentId ?? checkoutSessionId ?? null,
            paidAt: new Date(),
          });
        }
      });
    }
  }

  return NextResponse.json({ ok: true });
}
