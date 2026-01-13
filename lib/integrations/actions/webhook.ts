import { createHmac } from 'crypto';

type WebhookActionContext = {
  orgId: string;
  eventType: string;
  actionType: string;
  payload: Record<string, unknown>;
  integrationId: string;
  provider: string;
  credentials: Record<string, string>;
  idempotencyKey: string;
};

export async function runWebhookAction(
  ctx: WebhookActionContext
): Promise<{ ok: boolean; error?: string; response?: unknown }> {
  const endpointUrl =
    ctx.credentials.endpoint_url ||
    ctx.credentials.endpointUrl ||
    ctx.credentials.base_url ||
    ctx.credentials.baseUrl;
  if (!endpointUrl) {
    return { ok: false, error: 'Webhook endpoint URL is missing.' };
  }

  const secret = ctx.credentials.secret || '';
  const apiKey = ctx.credentials.api_key || ctx.credentials.apiKey || '';
  const body = JSON.stringify({
    eventId: ctx.idempotencyKey,
    eventType: ctx.eventType,
    orgId: ctx.orgId,
    occurredAt: new Date().toISOString(),
    payload: ctx.payload?.event ?? ctx.payload,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-TGW-Event': ctx.eventType,
    'X-TGW-Idempotency': ctx.idempotencyKey,
    'X-TGW-Timestamp': new Date().toISOString(),
  };

  if (secret) {
    const signature = createHmac('sha256', secret).update(body).digest('hex');
    headers['X-TGW-Signature'] = signature;
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers,
    body,
  });
  const text = await res.text();

  if (!res.ok) {
    return {
      ok: false,
      error: `Webhook failed with status ${res.status}`,
      response: { status: res.status, body: text.slice(0, 500) },
    };
  }

  return {
    ok: true,
    response: { status: res.status, body: text.slice(0, 500) },
  };
}
