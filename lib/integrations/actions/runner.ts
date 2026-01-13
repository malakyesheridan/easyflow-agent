import { decryptCredentials } from '@/lib/integrations/crypto';
import type { IntegrationActionType } from '@/lib/integrations/rules';
import { runStripeAction } from '@/lib/integrations/actions/stripe';
import { runInventoryAction } from '@/lib/integrations/actions/inventory';
import { runXeroAction } from '@/lib/integrations/actions/xero';
import { runWebhookAction } from '@/lib/integrations/actions/webhook';

type ActionResult =
  | { ok: true; response?: unknown }
  | { ok: false; error?: string; response?: unknown };

type IntegrationActionContext = {
  orgId: string;
  eventType: string;
  actionType: string;
  payload: Record<string, unknown>;
  integration: {
    id: string;
    provider: string;
    credentials: unknown;
  };
  idempotencyKey: string;
};

export async function runIntegrationAction(params: IntegrationActionContext): Promise<ActionResult> {
  let credentials: Record<string, string>;
  try {
    credentials = decryptCredentials(params.integration.credentials);
  } catch (error) {
    return { ok: false, error: 'Integration credentials are invalid.' };
  }

  const actionType = params.actionType as IntegrationActionType;
  const ctx = {
    orgId: params.orgId,
    eventType: params.eventType,
    actionType,
    payload: params.payload,
    integrationId: params.integration.id,
    provider: params.integration.provider,
    credentials,
    idempotencyKey: params.idempotencyKey,
  };

  switch (actionType) {
    case 'stripe.create_payment_link':
    case 'stripe.create_deposit_invoice':
      return await runStripeAction(ctx);
    case 'xero.create_invoice_draft':
    case 'xero.sync_invoice':
    case 'xero.sync_invoice_status':
      return await runXeroAction(ctx);
    case 'inventory.reserve_stock':
    case 'inventory.deduct_stock':
    case 'inventory.sync_levels':
      return await runInventoryAction(ctx);
    case 'webhook.deliver':
      return await runWebhookAction(ctx);
    default:
      return { ok: false, error: 'Unknown integration action.' };
  }
}
