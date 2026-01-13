type StripeActionContext = {
  orgId: string;
  eventType: string;
  actionType: string;
  payload: Record<string, unknown>;
  integrationId: string;
  provider: string;
  credentials: Record<string, string>;
  idempotencyKey: string;
};

type StripeResponse = { ok: boolean; error?: string; response?: unknown };

function normalizeAmountCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function normalizeCurrency(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().toUpperCase();
  }
  return 'AUD';
}

export async function runStripeAction(ctx: StripeActionContext): Promise<StripeResponse> {
  const apiKey = ctx.credentials.api_key || ctx.credentials.secret_key || '';
  if (!apiKey) {
    return { ok: false, error: 'Stripe API key is missing.' };
  }

  const eventPayload = (ctx.payload.event ?? ctx.payload) as Record<string, unknown>;
  const actionParams = (ctx.payload.action ?? {}) as Record<string, unknown>;
  const jobId = String(eventPayload.jobId || actionParams.jobId || '');
  if (!jobId) {
    return { ok: false, error: 'Stripe action requires a jobId.' };
  }
  const invoiceId =
    typeof eventPayload.invoiceId === 'string'
      ? eventPayload.invoiceId
      : typeof actionParams.invoiceId === 'string'
        ? actionParams.invoiceId
        : null;

  const amountCents =
    normalizeAmountCents(actionParams.amountCents) ?? normalizeAmountCents(eventPayload.amountCents) ?? null;
  if (!amountCents || amountCents <= 0) {
    return { ok: false, error: 'Stripe action requires a valid amount in cents.' };
  }

  const currency = normalizeCurrency(actionParams.currency ?? eventPayload.currency);
  const description =
    (typeof actionParams.description === 'string' && actionParams.description.trim()) ||
    (ctx.actionType === 'stripe.create_deposit_invoice' ? 'Deposit invoice' : 'Job payment');

  const jobTitle = typeof eventPayload.jobTitle === 'string' ? eventPayload.jobTitle : '';
  const label = jobTitle ? `${description} - ${jobTitle}` : description;

  const params = new URLSearchParams();
  params.set('line_items[0][price_data][currency]', currency.toLowerCase());
  params.set('line_items[0][price_data][unit_amount]', String(amountCents));
  params.set('line_items[0][price_data][product_data][name]', label);
  params.set('line_items[0][quantity]', '1');
  params.set('metadata[orgId]', ctx.orgId);
  params.set('metadata[jobId]', jobId);
  if (invoiceId) {
    params.set('metadata[invoiceId]', invoiceId);
  }
  params.set('metadata[eventType]', ctx.eventType);
  params.set('metadata[actionType]', ctx.actionType);
  params.set('metadata[idempotencyKey]', ctx.idempotencyKey);
  params.set('after_completion[type]', 'hosted_confirmation');

  const res = await fetch('https://api.stripe.com/v1/payment_links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': ctx.idempotencyKey,
    },
    body: params.toString(),
  });

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `Stripe request failed (${res.status})`,
      response: json ?? null,
    };
  }

  const paymentLinkId = json?.id ? String(json.id) : null;
  const paymentLinkUrl = json?.url ? String(json.url) : null;
  if (!paymentLinkId || !paymentLinkUrl) {
    return { ok: false, error: 'Stripe did not return a payment link.' };
  }

  const { createJobPayment } = await import('@/lib/mutations/job_payments');
  const paymentResult = await createJobPayment({
    orgId: ctx.orgId,
    jobId,
    invoiceId: invoiceId ?? null,
    provider: 'stripe',
    method: 'stripe_card',
    amountCents,
    currency,
    status: 'pending',
    paymentLinkUrl,
    stripePaymentLinkId: paymentLinkId,
    idempotencyKey: ctx.idempotencyKey,
  });

  if (!paymentResult.ok) {
    return { ok: false, error: paymentResult.error.message ?? 'Failed to save payment.' };
  }

  const { emitAppEvent } = await import('@/lib/integrations/events/emit');
  void emitAppEvent({
    orgId: ctx.orgId,
    eventType: 'payment.link.created',
    payload: {
      jobId,
      amountCents,
      currency,
      paymentLinkId,
      paymentLinkUrl,
    },
  });

  return {
    ok: true,
    response: {
      paymentId: paymentResult.data.id,
      paymentLinkId,
      paymentLinkUrl,
    },
  };
}
