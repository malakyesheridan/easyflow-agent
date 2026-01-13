import { and, desc, eq } from 'drizzle-orm';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobPayments } from '@/db/schema/job_payments';
import { getDb } from '@/lib/db';

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  taxRate: number | null;
  taxCents: number;
  totalCents: number;
  jobLinkType?: string | null;
};

export type InvoiceTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lineItems: InvoiceLineItem[] | null;
};

type DbClient = ReturnType<typeof getDb>;

const SUCCESS_PAYMENT_STATUSES = new Set(['paid', 'succeeded']);

export type InvoicePaymentSnapshot = {
  status: string | null;
  amountCents: number | null;
  paidAt?: Date | null;
  createdAt?: Date | null;
};

export type InvoiceStatusSnapshot = {
  status: string | null;
  totalCents: number;
  dueAt: Date | null;
  paidAt: Date | null;
};

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizePercent(value: unknown): number | null {
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  return Math.max(0, parsed);
}

function normalizeCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }
  return null;
}

export function normalizeLineItems(input: unknown): InvoiceLineItem[] {
  if (!Array.isArray(input)) return [];
  const items: InvoiceLineItem[] = [];

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (!description) continue;

    const quantity = normalizeNumber(item.quantity) ?? 1;
    const resolvedQuantity = Math.max(0.0001, quantity);
    const unitPriceCents = normalizeCents(item.unitPriceCents);
    const amountCents = normalizeCents(item.amountCents);
    const taxRate = normalizePercent(item.taxRate);
    const taxCents = normalizeCents(item.taxCents);
    const jobLinkType = typeof item.jobLinkType === 'string' ? item.jobLinkType.trim() : null;

    let resolvedAmountCents = amountCents;
    let resolvedUnitPriceCents = unitPriceCents;
    if (resolvedAmountCents === null && resolvedUnitPriceCents !== null) {
      resolvedAmountCents = Math.round(resolvedUnitPriceCents * resolvedQuantity);
    }
    if (resolvedAmountCents === null) continue;
    if (resolvedUnitPriceCents === null) {
      resolvedUnitPriceCents = Math.round(resolvedAmountCents / resolvedQuantity);
    }

    let resolvedTaxRate = taxRate;
    let resolvedTaxCents = taxCents;
    if (resolvedTaxCents === null && resolvedTaxRate !== null) {
      resolvedTaxCents = Math.round(resolvedAmountCents * (resolvedTaxRate / 100));
    }
    if (resolvedTaxCents === null) {
      resolvedTaxCents = 0;
    }
    if (resolvedTaxRate === null && resolvedAmountCents > 0 && resolvedTaxCents > 0) {
      resolvedTaxRate = Number(((resolvedTaxCents / resolvedAmountCents) * 100).toFixed(3));
    }
    if (resolvedTaxRate === null) {
      resolvedTaxRate = 0;
    }

    const totalCents = resolvedAmountCents + resolvedTaxCents;

    items.push({
      description,
      quantity: resolvedQuantity,
      unitPriceCents: resolvedUnitPriceCents,
      amountCents: resolvedAmountCents,
      taxRate: resolvedTaxRate,
      taxCents: resolvedTaxCents,
      totalCents,
      jobLinkType: jobLinkType || null,
    });
  }

  return items;
}

export function validateInvoiceLineItems(input: unknown): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: true };

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    const hasValues =
      Boolean(description) ||
      item.quantity !== undefined ||
      item.unitPriceCents !== undefined ||
      item.amountCents !== undefined;
    if (!hasValues) continue;
    if (!description) return { ok: false, error: 'Line item description is required.' };

    const quantity = normalizeNumber(item.quantity) ?? 1;
    if (quantity <= 0) return { ok: false, error: 'Line item quantity must be greater than zero.' };

    const unitPriceRaw = normalizeNumber(item.unitPriceCents);
    if (unitPriceRaw !== null && unitPriceRaw < 0) {
      return { ok: false, error: 'Line item unit price cannot be negative.' };
    }

    const amountRaw = normalizeNumber(item.amountCents);
    if (amountRaw !== null && amountRaw < 0) {
      return { ok: false, error: 'Line item amount cannot be negative.' };
    }
  }

  return { ok: true };
}

export function computeInvoiceTotals(params: {
  lineItems?: unknown;
  amountCents?: number | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
}): InvoiceTotals {
  const normalizedItems = normalizeLineItems(params.lineItems);
  if (normalizedItems.length > 0) {
    const subtotalCents = normalizedItems.reduce((sum, item) => sum + item.amountCents, 0);
    const taxCents = normalizedItems.reduce((sum, item) => sum + item.taxCents, 0);
    return {
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      lineItems: normalizedItems,
    };
  }

  const totalCents = normalizeCents(params.totalCents ?? params.amountCents) ?? 0;
  const taxCents = normalizeCents(params.taxCents) ?? 0;
  const subtotalCents =
    normalizeCents(params.subtotalCents) ??
    Math.max(0, totalCents - taxCents);

  return {
    subtotalCents,
    taxCents,
    totalCents,
    lineItems: null,
  };
}

export function deriveInvoiceSummary(params: {
  summary?: string | null;
  lineItems?: InvoiceLineItem[] | null;
  jobTitle?: string | null;
}): string | null {
  const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
  if (summary) return summary;

  const items = params.lineItems ?? [];
  if (items.length === 1) return items[0]?.description ?? null;
  if (items.length > 1) {
    const first = items[0]?.description ?? 'Invoice items';
    const remaining = items.length - 1;
    return `${first} + ${remaining} more`;
  }

  const jobTitle = typeof params.jobTitle === 'string' ? params.jobTitle.trim() : '';
  return jobTitle || null;
}

export function isSuccessfulPaymentStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return SUCCESS_PAYMENT_STATUSES.has(String(status).toLowerCase());
}

export function isInvoiceOverdue(params: {
  status: string | null;
  dueAt: Date | null;
  now: Date;
  outstandingCents: number;
}): boolean {
  if (!params.dueAt) return false;
  if (params.outstandingCents <= 0) return false;
  const status = (params.status ?? '').toLowerCase();
  if (status === 'void' || status === 'paid') return false;
  return params.dueAt.getTime() < params.now.getTime();
}

export function deriveInvoiceStatus(params: {
  invoice: InvoiceStatusSnapshot;
  payments: InvoicePaymentSnapshot[];
  now: Date;
}): {
  status: string;
  paidAt: Date | null;
  paidCents: number;
  outstandingCents: number;
  isOverdue: boolean;
} {
  const previousStatus = String(params.invoice.status ?? '');
  const normalizedStatus = previousStatus.toLowerCase();

  let paidCents = 0;
  let lastPaidAt: Date | null = null;
  for (const row of params.payments) {
    if (!isSuccessfulPaymentStatus(row.status)) continue;
    paidCents += Number(row.amountCents ?? 0);
    const candidate = row.paidAt ?? row.createdAt ?? null;
    if (candidate && (!lastPaidAt || candidate.getTime() > lastPaidAt.getTime())) {
      lastPaidAt = candidate;
    }
  }

  const outstandingCents = Math.max(0, params.invoice.totalCents - paidCents);
  let nextStatus = previousStatus;
  let nextPaidAt = params.invoice.paidAt ?? null;

  if (normalizedStatus !== 'void') {
    if (params.invoice.totalCents > 0 && paidCents >= params.invoice.totalCents) {
      nextStatus = 'paid';
      nextPaidAt = lastPaidAt ?? params.now;
    } else if (paidCents > 0) {
      nextStatus = 'partially_paid';
      nextPaidAt = null;
    } else if (normalizedStatus === 'draft') {
      nextStatus = 'draft';
      nextPaidAt = null;
    } else if (normalizedStatus === 'sent') {
      nextStatus = 'sent';
      nextPaidAt = null;
    } else {
      nextStatus = 'issued';
      nextPaidAt = null;
    }

    if (nextStatus === 'issued') {
      const overdue = isInvoiceOverdue({
        status: nextStatus,
        dueAt: params.invoice.dueAt,
        now: params.now,
        outstandingCents,
      });
      if (overdue) {
        nextStatus = 'overdue';
      }
    }
  }

  const isOverdue = isInvoiceOverdue({
    status: nextStatus,
    dueAt: params.invoice.dueAt,
    now: params.now,
    outstandingCents,
  });

  return {
    status: nextStatus,
    paidAt: nextPaidAt ?? null,
    paidCents,
    outstandingCents,
    isOverdue,
  };
}

export async function recalculateInvoiceStatus(params: {
  db: DbClient;
  orgId: string;
  invoiceId: string;
  now?: Date;
}): Promise<{
  invoiceId: string;
  previousStatus: string;
  status: string;
  statusChanged: boolean;
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  paidAt: Date | null;
  isOverdue: boolean;
} | null> {
  const now = params.now ?? new Date();
  const [invoice] = await params.db
    .select({
      id: jobInvoices.id,
      status: jobInvoices.status,
      amountCents: jobInvoices.amountCents,
      totalCents: jobInvoices.totalCents,
      dueAt: jobInvoices.dueAt,
      paidAt: jobInvoices.paidAt,
      issuedAt: jobInvoices.issuedAt,
      sentAt: jobInvoices.sentAt,
    })
    .from(jobInvoices)
    .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.invoiceId)))
    .limit(1);

  if (!invoice) return null;

  const previousStatus = String(invoice.status ?? '');
  const totalCents = Number(invoice.totalCents ?? invoice.amountCents ?? 0);

  const paymentRows = await params.db
    .select({
      status: jobPayments.status,
      amountCents: jobPayments.amountCents,
      paidAt: jobPayments.paidAt,
      createdAt: jobPayments.createdAt,
    })
    .from(jobPayments)
    .where(and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.invoiceId, params.invoiceId)));

  const derived = deriveInvoiceStatus({
    invoice: {
      status: invoice.status ?? null,
      totalCents,
      dueAt: invoice.dueAt ?? null,
      paidAt: invoice.paidAt ?? null,
    },
    payments: paymentRows,
    now,
  });

  const shouldUpdate =
    String(previousStatus ?? '') !== String(derived.status ?? '') ||
    (invoice.paidAt?.getTime?.() ?? null) !== (derived.paidAt?.getTime?.() ?? null);

  if (shouldUpdate) {
    await params.db
      .update(jobInvoices)
      .set({
        status: derived.status,
        paidAt: derived.paidAt ?? undefined,
        updatedAt: now,
      } as any)
      .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.invoiceId)));
  }

  return {
    invoiceId: invoice.id,
    previousStatus,
    status: derived.status,
    statusChanged: shouldUpdate,
    totalCents,
    paidCents: derived.paidCents,
    outstandingCents: derived.outstandingCents,
    paidAt: derived.paidAt ?? null,
    isOverdue: derived.isOverdue,
  };
}

export async function getLatestInvoicePayment(params: {
  db: DbClient;
  orgId: string;
  invoiceId: string;
}) {
  const [row] = await params.db
    .select({
      id: jobPayments.id,
      provider: jobPayments.provider,
      method: jobPayments.method,
      status: jobPayments.status,
      amountCents: jobPayments.amountCents,
      currency: jobPayments.currency,
      paidAt: jobPayments.paidAt,
      createdAt: jobPayments.createdAt,
      paymentLinkUrl: jobPayments.paymentLinkUrl,
    })
    .from(jobPayments)
    .where(and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.invoiceId, params.invoiceId)))
    .orderBy(desc(jobPayments.createdAt))
    .limit(1);
  return row ?? null;
}
