import { and, eq } from 'drizzle-orm';
import { jobPayments } from '@/db/schema/job_payments';
import { getDb } from '@/lib/db';
import { getJobInvoiceById } from '@/lib/queries/job_invoices';
import { getJobById } from '@/lib/queries/jobs';
import { listJobContacts } from '@/lib/queries/job_contacts';
import { getOrgSettings } from '@/lib/queries/org_settings';
import {
  createOrUpdateInvoice,
  fetchInvoice,
  updateLastSyncAt,
  type XeroInvoiceSource,
  type XeroInvoiceStatus,
} from '@/lib/integrations/xero';
import { updateJobInvoiceFromXeroSync, updateJobInvoiceXeroFields } from '@/lib/mutations/job_invoices';

type XeroActionContext = {
  orgId: string;
  eventType: string;
  actionType: string;
  payload: Record<string, unknown>;
  integrationId: string;
  provider: string;
  credentials: Record<string, string>;
  idempotencyKey: string;
};

type XeroResponse = { ok: boolean; error?: string; response?: unknown };

type PaymentSnapshot = {
  provider?: string | null;
  stripePaymentLinkId?: string | null;
  stripeCheckoutSessionId?: string | null;
};

export function isStripeSourceOfTruth(payments: PaymentSnapshot[]): boolean {
  return payments.some((payment) => {
    const provider = String(payment.provider ?? '').toLowerCase();
    if (provider === 'stripe') return true;
    return Boolean(payment.stripePaymentLinkId || payment.stripeCheckoutSessionId);
  });
}

export function deriveLocalInvoiceStatusFromXero(params: XeroInvoiceStatus): {
  status: string;
  paidAt: Date | null;
} | null {
  const status = String(params.status ?? '').toUpperCase();
  const amountDue = Number(params.amountDue ?? NaN);
  const amountPaid = Number(params.amountPaid ?? NaN);

  if (status === 'VOIDED') {
    return { status: 'void', paidAt: null };
  }

  if (Number.isFinite(amountDue) && amountDue <= 0) {
    return { status: 'paid', paidAt: params.updatedDateUtc ? new Date(params.updatedDateUtc) : new Date() };
  }

  if (Number.isFinite(amountPaid) && amountPaid > 0 && Number.isFinite(amountDue) && amountDue > 0) {
    return { status: 'partially_paid', paidAt: null };
  }

  if (status === 'PAID') {
    return { status: 'paid', paidAt: params.updatedDateUtc ? new Date(params.updatedDateUtc) : new Date() };
  }

  return null;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildInvoiceSource(params: {
  invoice: any;
  job: any;
  contacts: any[];
  settings: any | null;
}): XeroInvoiceSource {
  const contacts = params.contacts ?? [];
  const client =
    contacts.find((contact) => String(contact.role ?? '').toLowerCase() === 'client') ?? contacts[0] ?? null;
  const contactName = client?.name ?? params.job?.title ?? `Job ${params.job?.id?.slice?.(0, 8) ?? ''}`.trim();
  const contactEmail = client?.email ?? null;

  const lineItems = Array.isArray(params.invoice.lineItems)
    ? params.invoice.lineItems.map((item: any) => ({
        description: String(item.description ?? '').trim() || params.invoice.summary || 'Invoice item',
        quantity: Math.max(1, toSafeNumber(item.quantity, 1)),
        unitPriceCents: (() => {
          const quantity = Math.max(1, toSafeNumber(item.quantity, 1));
          const unitPrice = toSafeNumber(item.unitPriceCents, NaN);
          if (Number.isFinite(unitPrice) && unitPrice >= 0) {
            return Math.round(unitPrice);
          }
          const amountCents = Math.max(0, Math.round(toSafeNumber(item.amountCents, 0)));
          return Math.round(amountCents / quantity);
        })(),
        taxRate: item.taxRate ?? null,
      }))
    : [];

  const summaryInput = typeof params.invoice.summary === 'string' ? params.invoice.summary.trim() : '';
  const summary =
    summaryInput ||
    (lineItems.length === 1 ? lineItems[0]?.description : lineItems.length > 1 ? `${lineItems[0]?.description} + ${lineItems.length - 1} more` : '') ||
    params.job?.title ||
    null;

  const taxType = params.settings?.xeroTaxType ?? 'NONE';

  return {
    invoiceId: params.invoice.id,
    xeroInvoiceId: params.invoice.xeroInvoiceId ?? null,
    invoiceNumber: params.invoice.invoiceNumber ?? null,
    reference: params.job?.title ?? null,
    summary,
    currency: params.invoice.currency ?? 'AUD',
    issuedAt: params.invoice.issuedAt ?? null,
    dueAt: params.invoice.dueAt ?? null,
    totalCents: Number(params.invoice.totalCents ?? params.invoice.amountCents ?? 0),
    lineItems,
    contact: {
      name: contactName || 'Customer',
      email: contactEmail,
    },
    accountCode: params.settings?.xeroSalesAccountCode ?? null,
    taxType: taxType ? String(taxType) : 'NONE',
  };
}

export async function runXeroAction(ctx: XeroActionContext): Promise<XeroResponse> {
  const eventPayload = (ctx.payload.event ?? ctx.payload) as Record<string, unknown>;
  const actionParams = (ctx.payload.action ?? {}) as Record<string, unknown>;
  const invoiceId = String(eventPayload.invoiceId || actionParams.invoiceId || '');
  if (!invoiceId) {
    return { ok: false, error: 'Xero action requires an invoiceId.' };
  }

  try {
    if (ctx.actionType === 'xero.sync_invoice_status') {
      const invoiceResult = await getJobInvoiceById({ orgId: ctx.orgId, invoiceId });
      if (!invoiceResult.ok || !invoiceResult.data) {
        return { ok: false, error: 'Invoice not found.' };
      }
      if (!invoiceResult.data.xeroInvoiceId) {
        return { ok: false, error: 'Xero invoice ID is missing.' };
      }

      const db = getDb();
      const paymentRows = await db
        .select({
          provider: jobPayments.provider,
          stripePaymentLinkId: jobPayments.stripePaymentLinkId,
          stripeCheckoutSessionId: jobPayments.stripeCheckoutSessionId,
        })
        .from(jobPayments)
        .where(and(eq(jobPayments.orgId, ctx.orgId), eq(jobPayments.invoiceId, invoiceId)));

      if (isStripeSourceOfTruth(paymentRows)) {
        return { ok: true, response: { skipped: 'stripe_source_of_truth' } };
      }

      const xeroResult = await fetchInvoice(ctx.orgId, invoiceResult.data.xeroInvoiceId);
      if (!xeroResult.ok) {
        await updateJobInvoiceFromXeroSync({
          orgId: ctx.orgId,
          id: invoiceId,
          xeroSyncError: xeroResult.error.message ?? 'Failed to sync Xero status',
        });
        return { ok: false, error: xeroResult.error.message };
      }

      const nextStatus = deriveLocalInvoiceStatusFromXero(xeroResult.data);
      await updateJobInvoiceFromXeroSync({
        orgId: ctx.orgId,
        id: invoiceId,
        xeroStatus: xeroResult.data.status ?? null,
        xeroLastSyncedAt: new Date(),
        xeroSyncError: null,
        status: nextStatus?.status ?? undefined,
        paidAt: nextStatus?.paidAt ?? undefined,
      });
      await updateLastSyncAt(ctx.orgId);

      return { ok: true, response: { status: xeroResult.data.status } };
    }

    const invoiceResult = await getJobInvoiceById({ orgId: ctx.orgId, invoiceId });
    if (!invoiceResult.ok || !invoiceResult.data) {
      return { ok: false, error: 'Invoice not found.' };
    }

    const jobResult = await getJobById(invoiceResult.data.jobId, ctx.orgId);
    if (!jobResult.ok) return { ok: false, error: jobResult.error.message };

    const [contactsResult, settingsResult] = await Promise.all([
      listJobContacts({ orgId: ctx.orgId, jobId: invoiceResult.data.jobId }),
      getOrgSettings({ orgId: ctx.orgId }),
    ]);

    const source = buildInvoiceSource({
      invoice: invoiceResult.data,
      job: jobResult.data,
      contacts: contactsResult.ok ? contactsResult.data : [],
      settings: settingsResult.ok ? settingsResult.data : null,
    });

    const syncResult = await createOrUpdateInvoice(ctx.orgId, source);
    if (!syncResult.ok) {
      await updateJobInvoiceXeroFields({
        orgId: ctx.orgId,
        id: invoiceId,
        xeroSyncError: syncResult.error.message ?? 'Xero sync failed',
      });
      return { ok: false, error: syncResult.error.message };
    }

    await updateJobInvoiceXeroFields({
      orgId: ctx.orgId,
      id: invoiceId,
      xeroInvoiceId: syncResult.data.xeroInvoiceId,
      xeroStatus: syncResult.data.xeroStatus ?? null,
      xeroInvoiceUrl: syncResult.data.xeroUrl ?? null,
      xeroLastSyncedAt: new Date(),
      xeroSyncError: null,
    });
    await updateLastSyncAt(ctx.orgId);

    return {
      ok: true,
      response: {
        invoiceId,
        xeroInvoiceId: syncResult.data.xeroInvoiceId,
        status: syncResult.data.xeroStatus ?? null,
      },
    };
  } catch (error) {
    await updateJobInvoiceXeroFields({
      orgId: ctx.orgId,
      id: invoiceId,
      xeroSyncError: error instanceof Error ? error.message : 'Xero sync failed',
    });
    return { ok: false, error: error instanceof Error ? error.message : 'Xero sync failed' };
  }
}
