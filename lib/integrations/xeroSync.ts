import { and, eq } from 'drizzle-orm';
import { integrationEvents } from '@/db/schema/integration_events';
import { integrations } from '@/db/schema/integrations';
import { jobInvoices } from '@/db/schema/job_invoices';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { processIntegrationEventNow } from '@/lib/integrations/events/processor';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { ok, err, type Result } from '@/lib/result';

type IntegrationState = {
  id: string;
  enabled: boolean;
  status: string | null;
};

export type XeroSyncSource = 'issue' | 'manual' | 'test';

function toTimestampId(updatedAt?: Date | null): string {
  if (!updatedAt) return '0';
  const time = updatedAt.getTime();
  return Number.isFinite(time) ? String(time) : '0';
}

export function shouldSyncInvoicesToXero(integration: IntegrationState | null): boolean {
  if (!integration) return false;
  return integration.enabled && integration.status === 'connected';
}

export function shouldSyncPaymentsFromXero(settings: {
  xeroSyncPaymentsEnabled?: boolean | null;
} | null): boolean {
  return Boolean(settings?.xeroSyncPaymentsEnabled);
}

export function buildXeroSyncIdempotencyKey(params: {
  invoiceId: string;
  updatedAt?: Date | null;
  source?: XeroSyncSource;
}): string {
  const base = `xero:invoice:${params.invoiceId}:${toTimestampId(params.updatedAt)}`;
  if (params.source === 'manual' || params.source === 'test') {
    return `${base}:${Date.now()}`;
  }
  return base;
}

async function getXeroIntegrationState(orgId: string): Promise<IntegrationState | null> {
  return await withIntegrationOrgScope(orgId, async (db) => {
    const [row] = await db
      .select({
        id: integrations.id,
        enabled: integrations.enabled,
        status: integrations.status,
      })
      .from(integrations)
      .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, 'xero')))
      .limit(1);
    return row ?? null;
  });
}

async function upsertIntegrationEvent(params: {
  orgId: string;
  integrationId: string;
  eventType: string;
  actionType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<Result<{ integrationEventId: string }>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [existing] = await db
        .select({ id: integrationEvents.id, status: integrationEvents.status })
        .from(integrationEvents)
        .where(eq(integrationEvents.idempotencyKey, params.idempotencyKey))
        .limit(1);

      if (existing?.id) {
        if (existing.status === 'success') {
          return { integrationEventId: existing.id, shouldProcess: false };
        }
        await db
          .update(integrationEvents)
          .set({ status: 'queued', updatedAt: new Date() } as any)
          .where(eq(integrationEvents.id, existing.id));
        return { integrationEventId: existing.id, shouldProcess: true };
      }

      const [inserted] = await db
        .insert(integrationEvents)
        .values({
          integrationId: params.integrationId,
          eventType: params.eventType,
          actionType: params.actionType,
          payload: params.payload,
          status: 'queued',
          attemptCount: 0,
          idempotencyKey: params.idempotencyKey,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning({ id: integrationEvents.id });

      if (!inserted?.id) return null;
      return { integrationEventId: inserted.id, shouldProcess: true };
    });

    if (!result) return err('INTERNAL_ERROR', 'Failed to queue integration event');
    if (result.shouldProcess) {
      void processIntegrationEventNow(params.orgId, result.integrationEventId);
    }
    return ok({ integrationEventId: result.integrationEventId });
  } catch (error) {
    console.error('Error queueing integration event:', error);
    return err('INTERNAL_ERROR', 'Failed to queue integration event', error);
  }
}

export async function queueXeroInvoiceSync(params: {
  orgId: string;
  invoiceId: string;
  jobId?: string | null;
  source?: XeroSyncSource;
  actorUserId?: string | null;
}): Promise<Result<{ integrationEventId: string }>> {
  const integration = await getXeroIntegrationState(params.orgId);
  if (!shouldSyncInvoicesToXero(integration)) {
    return err('VALIDATION_ERROR', 'Xero integration is not enabled');
  }

  const invoiceRow = await withIntegrationOrgScope(params.orgId, async (db) => {
    const [row] = await db
      .select({ id: jobInvoices.id, jobId: jobInvoices.jobId, updatedAt: jobInvoices.updatedAt })
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.invoiceId)))
      .limit(1);
    return row ?? null;
  });

  if (!invoiceRow) return err('NOT_FOUND', 'Invoice not found');

  const idempotencyKey = buildXeroSyncIdempotencyKey({
    invoiceId: invoiceRow.id,
    updatedAt: invoiceRow.updatedAt ?? null,
    source: params.source,
  });

  return await upsertIntegrationEvent({
    orgId: params.orgId,
    integrationId: integration!.id,
    eventType: params.source === 'issue' ? 'invoice.issued' : 'invoice.sync',
    actionType: 'xero.sync_invoice',
    idempotencyKey,
    payload: {
      event: {
        invoiceId: invoiceRow.id,
        jobId: params.jobId ?? invoiceRow.jobId,
        source: params.source ?? null,
        actorUserId: params.actorUserId ?? null,
      },
    },
  });
}

export async function queueXeroInvoiceStatusSync(params: {
  orgId: string;
  invoiceId: string;
  jobId?: string | null;
  source?: XeroSyncSource;
}): Promise<Result<{ integrationEventId: string }>> {
  const integration = await getXeroIntegrationState(params.orgId);
  if (!shouldSyncInvoicesToXero(integration)) {
    return err('VALIDATION_ERROR', 'Xero integration is not enabled');
  }

  const settingsResult = await getOrgSettings({ orgId: params.orgId });
  if (!settingsResult.ok || !shouldSyncPaymentsFromXero(settingsResult.data)) {
    return err('VALIDATION_ERROR', 'Xero payment sync is disabled');
  }

  const invoiceRow = await withIntegrationOrgScope(params.orgId, async (db) => {
    const [row] = await db
      .select({ id: jobInvoices.id, jobId: jobInvoices.jobId, updatedAt: jobInvoices.updatedAt })
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.invoiceId)))
      .limit(1);
    return row ?? null;
  });

  if (!invoiceRow) return err('NOT_FOUND', 'Invoice not found');

  const idempotencyKey = `xero:invoice-status:${invoiceRow.id}:${toTimestampId(invoiceRow.updatedAt ?? null)}`;

  return await upsertIntegrationEvent({
    orgId: params.orgId,
    integrationId: integration!.id,
    eventType: 'invoice.status_sync',
    actionType: 'xero.sync_invoice_status',
    idempotencyKey,
    payload: {
      event: {
        invoiceId: invoiceRow.id,
        jobId: params.jobId ?? invoiceRow.jobId,
        source: params.source ?? null,
      },
    },
  });
}

export async function queueXeroInvoiceSyncBestEffort(params: {
  orgId: string;
  invoiceId: string;
  jobId?: string | null;
  source?: XeroSyncSource;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    await queueXeroInvoiceSync(params);
  } catch {
    // Never block invoice flows on Xero sync queueing.
  }
}
