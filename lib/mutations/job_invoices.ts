import { and, eq, ne, sql } from 'drizzle-orm';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { jobInvoices, type JobInvoice, type NewJobInvoice } from '@/db/schema/job_invoices';
import { jobInvoiceItems, type NewJobInvoiceItem } from '@/db/schema/job_invoice_items';
import { jobInvoiceSequences } from '@/db/schema/job_invoice_sequences';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import { emitCommEvent } from '@/lib/communications/emit';
import { evaluateJobGuardrailsBestEffort } from '@/lib/financials/jobProfitability';
import { computeInvoiceTotals, deriveInvoiceSummary, type InvoiceLineItem } from '@/lib/financials/invoiceState';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { queueXeroInvoiceSyncBestEffort } from '@/lib/integrations/xeroSync';
import { toNumericString } from '@/lib/utils/quantity';
import { createSecureToken } from '@/lib/security/tokens';
import { allowDemoBilling } from '@/lib/financials/demoBilling';

type DbClient = Parameters<typeof withIntegrationOrgScope>[1] extends (db: infer T) => Promise<any> ? T : never;

function normalizeInvoiceNumber(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSummary(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildInvoiceShareUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}/invoices/share/${token}`;
}

async function ensureInvoiceNumberAvailable(params: {
  db: DbClient;
  orgId: string;
  invoiceNumber: string;
  invoiceId?: string | null;
}): Promise<Result<true>> {
  const conditions = [
    eq(jobInvoices.orgId, params.orgId),
    eq(jobInvoices.invoiceNumber, params.invoiceNumber),
  ];
  if (params.invoiceId) {
    conditions.push(ne(jobInvoices.id, params.invoiceId));
  }

  const [existing] = await params.db
    .select({ id: jobInvoices.id })
    .from(jobInvoices)
    .where(and(...conditions))
    .limit(1);

  if (existing) {
    return err('VALIDATION_ERROR', 'Invoice number already in use');
  }
  return ok(true);
}

async function reserveInvoiceNumber(params: {
  db: DbClient;
  orgId: string;
}): Promise<string> {
  const now = new Date();
  const [row] = await params.db
    .insert(jobInvoiceSequences)
    .values({ orgId: params.orgId, nextNumber: 2, updatedAt: now })
    .onConflictDoUpdate({
      target: jobInvoiceSequences.orgId,
      set: {
        nextNumber: sql`${jobInvoiceSequences.nextNumber} + 1`,
        updatedAt: now,
      },
    })
    .returning({ nextNumber: jobInvoiceSequences.nextNumber });

  const nextNumber = Number(row?.nextNumber ?? 2);
  const allocated = Math.max(1, nextNumber - 1);
  return String(allocated);
}

async function bumpInvoiceSequence(params: {
  db: DbClient;
  orgId: string;
  invoiceNumber: string | null;
}): Promise<void> {
  if (!params.invoiceNumber) return;
  const parsed = Number(params.invoiceNumber);
  if (!Number.isFinite(parsed)) return;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return;
  const nextNumber = normalized + 1;
  const now = new Date();

  await params.db
    .insert(jobInvoiceSequences)
    .values({ orgId: params.orgId, nextNumber, updatedAt: now })
    .onConflictDoUpdate({
      target: jobInvoiceSequences.orgId,
      set: {
        nextNumber: sql`GREATEST(${jobInvoiceSequences.nextNumber}, ${nextNumber})`,
        updatedAt: now,
      },
    });
}

async function replaceInvoiceItems(params: {
  db: DbClient;
  orgId: string;
  jobId: string;
  invoiceId: string;
  lineItems: InvoiceLineItem[] | null;
}): Promise<void> {
  await params.db
    .delete(jobInvoiceItems)
    .where(and(eq(jobInvoiceItems.orgId, params.orgId), eq(jobInvoiceItems.invoiceId, params.invoiceId)));

  if (!params.lineItems || params.lineItems.length === 0) return;

  const now = new Date();
  const rows: NewJobInvoiceItem[] = params.lineItems.map((item, index) => ({
    orgId: params.orgId,
    jobId: params.jobId,
    invoiceId: params.invoiceId,
    description: item.description,
    quantity: toNumericString(item.quantity),
    unitPriceCents: item.unitPriceCents,
    subtotalCents: item.amountCents,
    taxRate: item.taxRate !== null ? toNumericString(item.taxRate) : null,
    taxCents: item.taxCents,
    totalCents: item.totalCents,
    jobLinkType: item.jobLinkType ?? null,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  })) as NewJobInvoiceItem[];

  await params.db.insert(jobInvoiceItems).values(rows);
}

export async function createJobInvoice(params: {
  orgId: string;
  jobId: string;
  provider: string;
  amountCents: number;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  currency: string;
  status: string;
  invoiceNumber?: string | null;
  summary?: string | null;
  xeroInvoiceId?: string | null;
  externalRef?: string | null;
  pdfUrl?: string | null;
  lineItems?: unknown;
  issuedAt?: Date | null;
  dueAt?: Date | null;
  idempotencyKey?: string | null;
  integrationEventId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}): Promise<Result<JobInvoice>> {
  try {
    const row = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [job] = await db
        .select({ isDemo: jobs.isDemo, title: jobs.title })
        .from(jobs)
        .where(and(eq(jobs.orgId, params.orgId), eq(jobs.id, params.jobId)))
        .limit(1);

      if (!job) return { demoBlocked: false, record: null };
      if (job.isDemo && !allowDemoBilling()) return { demoBlocked: true, record: null };

      if (params.idempotencyKey) {
        const [existing] = await db
          .select()
          .from(jobInvoices)
          .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.idempotencyKey, params.idempotencyKey)))
          .limit(1);
        if (existing) return { demoBlocked: false, record: existing };
      }

      const requestedInvoiceNumber =
        normalizeInvoiceNumber(params.invoiceNumber) ??
        normalizeInvoiceNumber(params.externalRef ?? params.xeroInvoiceId);
      let invoiceNumber = requestedInvoiceNumber;
      if (invoiceNumber) {
        const availability = await ensureInvoiceNumberAvailable({
          db,
          orgId: params.orgId,
          invoiceNumber,
        });
        if (!availability.ok) return { demoBlocked: false, record: null, error: availability };
        await bumpInvoiceSequence({ db, orgId: params.orgId, invoiceNumber });
      } else {
        invoiceNumber = await reserveInvoiceNumber({ db, orgId: params.orgId });
      }

      const totals = computeInvoiceTotals({
        lineItems: params.lineItems,
        amountCents: params.amountCents,
        subtotalCents: params.subtotalCents ?? null,
        taxCents: params.taxCents ?? null,
        totalCents: params.totalCents ?? null,
      });
      const summary = deriveInvoiceSummary({
        summary: normalizeSummary(params.summary),
        lineItems: totals.lineItems ?? null,
        jobTitle: job?.title ?? null,
      });

      const values: NewJobInvoice = {
        orgId: params.orgId,
        jobId: params.jobId,
        provider: params.provider,
        amountCents: totals.totalCents,
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        currency: params.currency,
        status: params.status,
        invoiceNumber,
        summary,
        xeroInvoiceId: params.xeroInvoiceId ?? null,
        externalRef: params.externalRef ?? null,
        pdfUrl: params.pdfUrl ?? null,
        lineItems: totals.lineItems ?? null,
        issuedAt: params.issuedAt ?? null,
        dueAt: params.dueAt ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        integrationEventId: params.integrationEventId ?? null,
        createdBy: params.createdBy ?? null,
        updatedBy: params.updatedBy ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;

      const [inserted] = await db.insert(jobInvoices).values(values).returning();
      if (inserted?.id) {
        await replaceInvoiceItems({
          db,
          orgId: params.orgId,
          jobId: params.jobId,
          invoiceId: inserted.id,
          lineItems: totals.lineItems ?? null,
        });
      }
      return { demoBlocked: false, record: inserted ?? null };
    });

    if (row.demoBlocked) return err('VALIDATION_ERROR', 'Demo jobs are excluded from billing');
    if (row.error) return row.error;
    if (!row.record) return err('NOT_FOUND', 'Job not found');
    const record = row.record;
    void emitCommEvent({
      orgId: record.orgId,
      eventKey: 'invoice_created',
      entityType: 'invoice',
      entityId: record.id,
      triggeredByUserId: null,
      source: 'integration',
      payload: {
        invoiceId: record.id,
        jobId: record.jobId,
        status: record.status,
        amountCents: record.amountCents,
        currency: record.currency,
        pdfUrl: record.pdfUrl ?? null,
      },
    });
    void evaluateJobGuardrailsBestEffort({ orgId: record.orgId, jobId: record.jobId });
    return ok(record);
  } catch (error) {
    console.error('Error creating invoice:', error);
    return err('INTERNAL_ERROR', 'Failed to create invoice', error);
  }
}

export async function updateJobInvoiceStatus(params: {
  orgId: string;
  id: string;
  status: string;
  xeroInvoiceId?: string | null;
  externalRef?: string | null;
  sentAt?: Date | null;
  issuedAt?: Date | null;
  dueAt?: Date | null;
  paidAt?: Date | null;
  updatedBy?: string | null;
}): Promise<Result<JobInvoice>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [before] = await db
        .select()
        .from(jobInvoices)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .limit(1);

      if (!before) return { before: null, updated: null };

      const [updated] = await db
        .update(jobInvoices)
        .set({
          status: params.status,
          xeroInvoiceId: params.xeroInvoiceId ?? undefined,
          externalRef: params.externalRef ?? undefined,
          sentAt: params.sentAt ?? undefined,
          issuedAt: params.issuedAt ?? undefined,
          dueAt: params.dueAt ?? undefined,
          paidAt: params.paidAt ?? undefined,
          updatedBy: params.updatedBy ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .returning();
      return { before, updated: updated ?? null };
    });

    if (!result?.updated) return err('NOT_FOUND', 'Invoice not found');

    if (result.before && result.before.status !== result.updated.status && result.updated.status === 'sent') {
      void emitCommEvent({
        orgId: result.updated.orgId,
        eventKey: 'invoice_sent',
        entityType: 'invoice',
        entityId: result.updated.id,
        triggeredByUserId: null,
        source: 'integration',
        payload: {
          invoiceId: result.updated.id,
          jobId: result.updated.jobId,
          status: result.updated.status,
          amountCents: result.updated.amountCents,
          currency: result.updated.currency,
          pdfUrl: result.updated.pdfUrl ?? null,
        },
      });
      void emitAppEvent({
        orgId: result.updated.orgId,
        eventType: 'invoice.sent',
        payload: {
          jobId: result.updated.jobId,
          invoiceId: result.updated.id,
          amountCents: result.updated.totalCents ?? result.updated.amountCents,
          currency: result.updated.currency,
        },
      });
      void evaluateJobGuardrailsBestEffort({ orgId: result.updated.orgId, jobId: result.updated.jobId });
    }

    return ok(result.updated);
  } catch (error) {
    console.error('Error updating invoice:', error);
    return err('INTERNAL_ERROR', 'Failed to update invoice', error);
  }
}

export async function createJobInvoiceDraft(params: {
  orgId: string;
  jobId: string;
  amountCents?: number | null;
  currency?: string | null;
  invoiceNumber?: string | null;
  summary?: string | null;
  externalRef?: string | null;
  lineItems?: unknown;
  issuedAt?: Date | null;
  dueAt?: Date | null;
  createdBy?: string | null;
}): Promise<Result<JobInvoice>> {
  const totals = computeInvoiceTotals({
    lineItems: params.lineItems,
    amountCents: params.amountCents ?? 0,
  });

  const result = await createJobInvoice({
    orgId: params.orgId,
    jobId: params.jobId,
    provider: 'internal',
    amountCents: totals.totalCents,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    currency: params.currency ?? 'AUD',
    status: 'draft',
    invoiceNumber: params.invoiceNumber ?? null,
    summary: params.summary ?? null,
    externalRef: params.externalRef ?? null,
    lineItems: totals.lineItems,
    issuedAt: params.issuedAt ?? null,
    dueAt: params.dueAt ?? null,
    createdBy: params.createdBy ?? null,
    updatedBy: params.createdBy ?? null,
  });

  if (result.ok) {
    void emitAppEvent({
      orgId: result.data.orgId,
      eventType: 'invoice.created',
      payload: {
        jobId: result.data.jobId,
        invoiceId: result.data.id,
        amountCents: result.data.totalCents ?? result.data.amountCents,
        currency: result.data.currency,
      },
      actorUserId: params.createdBy ?? null,
    });
  }

  return result;
}

export async function updateJobInvoiceDraft(params: {
  orgId: string;
  id: string;
  amountCents?: number | null;
  subtotalCents?: number | null;
  taxCents?: number | null;
  totalCents?: number | null;
  currency?: string | null;
  invoiceNumber?: string | null;
  summary?: string | null;
  externalRef?: string | null;
  lineItems?: unknown;
  issuedAt?: Date | null;
  dueAt?: Date | null;
  updatedBy?: string | null;
}): Promise<Result<JobInvoice>> {
  try {
    const totals = computeInvoiceTotals({
      lineItems: params.lineItems,
      amountCents: params.amountCents ?? null,
      subtotalCents: params.subtotalCents ?? null,
      taxCents: params.taxCents ?? null,
      totalCents: params.totalCents ?? null,
    });

    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [before] = await db
        .select()
        .from(jobInvoices)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .limit(1);

      if (!before) return { updated: null, before: null };
      if (String(before.status ?? '').toLowerCase() !== 'draft') return { updated: null, before };

      const invoiceNumberInput =
        params.invoiceNumber !== undefined ? normalizeInvoiceNumber(params.invoiceNumber) : undefined;
      let nextInvoiceNumber = before.invoiceNumber ?? null;

      if (params.invoiceNumber !== undefined) {
        if (invoiceNumberInput) {
          nextInvoiceNumber = invoiceNumberInput;
        } else if (!nextInvoiceNumber) {
          nextInvoiceNumber = await reserveInvoiceNumber({ db, orgId: params.orgId });
        }
      }

      if (nextInvoiceNumber && nextInvoiceNumber !== before.invoiceNumber) {
        const availability = await ensureInvoiceNumberAvailable({
          db,
          orgId: params.orgId,
          invoiceNumber: nextInvoiceNumber,
          invoiceId: params.id,
        });
        if (!availability.ok) return { updated: null, before, error: availability };
        await bumpInvoiceSequence({ db, orgId: params.orgId, invoiceNumber: nextInvoiceNumber });
      }

      const summaryInput = params.summary !== undefined ? normalizeSummary(params.summary) : undefined;
      const summary = deriveInvoiceSummary({
        summary: summaryInput !== undefined ? summaryInput : before.summary ?? null,
        lineItems: totals.lineItems ?? null,
        jobTitle: null,
      });

      const [updated] = await db
        .update(jobInvoices)
        .set({
          amountCents: totals.totalCents,
          subtotalCents: totals.subtotalCents,
          taxCents: totals.taxCents,
          totalCents: totals.totalCents,
          currency: params.currency ?? undefined,
          invoiceNumber: nextInvoiceNumber ?? undefined,
          summary: summary ?? undefined,
          externalRef: params.externalRef ?? undefined,
          lineItems: totals.lineItems ?? undefined,
          issuedAt: params.issuedAt ?? undefined,
          dueAt: params.dueAt ?? undefined,
          updatedBy: params.updatedBy ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .returning();

      if (updated?.id && params.lineItems !== undefined) {
        await replaceInvoiceItems({
          db,
          orgId: params.orgId,
          jobId: updated.jobId,
          invoiceId: updated.id,
          lineItems: totals.lineItems ?? null,
        });
      }

      return { updated: updated ?? null, before };
    });

    if (!result?.before) return err('NOT_FOUND', 'Invoice not found');
    if (result.error) return result.error;
    if (!result.updated) return err('VALIDATION_ERROR', 'Only draft invoices can be updated');
    return ok(result.updated);
  } catch (error) {
    console.error('Error updating invoice draft:', error);
    return err('INTERNAL_ERROR', 'Failed to update invoice', error);
  }
}

export async function issueJobInvoice(params: {
  orgId: string;
  id: string;
  issuedAt?: Date | null;
  dueAt?: Date | null;
  updatedBy?: string | null;
}): Promise<Result<JobInvoice>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [before] = await db
        .select()
        .from(jobInvoices)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .limit(1);

      if (!before) return { before: null, updated: null };
      const status = String(before.status ?? '').toLowerCase();
      if (status !== 'draft' && status !== 'sent') return { before, updated: null };

      let invoiceNumber = before.invoiceNumber ?? null;
      if (!invoiceNumber) {
        invoiceNumber = await reserveInvoiceNumber({ db, orgId: params.orgId });
      }

      const shareToken = before.publicShareTokenHash || before.pdfUrl ? null : createSecureToken();
      const shareUrl = shareToken ? buildInvoiceShareUrl(shareToken.token) : null;
      const shareCreatedAt = shareToken ? new Date() : null;

      const [updated] = await db
        .update(jobInvoices)
        .set({
          status: 'issued',
          issuedAt: params.issuedAt ?? new Date(),
          dueAt: params.dueAt ?? undefined,
          invoiceNumber: invoiceNumber ?? undefined,
          publicShareTokenHash: shareToken?.tokenHash ?? undefined,
          publicShareTokenCreatedAt: shareCreatedAt ?? undefined,
          pdfUrl: shareToken ? shareUrl ?? undefined : undefined,
          updatedBy: params.updatedBy ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .returning();
      return { before, updated: updated ?? null };
    });

    if (!result?.before) return err('NOT_FOUND', 'Invoice not found');
    if (!result.updated) return err('VALIDATION_ERROR', 'Invoice cannot be issued');

    void emitCommEvent({
      orgId: result.updated.orgId,
      eventKey: 'invoice_issued',
      entityType: 'invoice',
      entityId: result.updated.id,
      triggeredByUserId: params.updatedBy ?? null,
      source: 'app',
      payload: {
        invoiceId: result.updated.id,
        jobId: result.updated.jobId,
        status: result.updated.status,
        amountCents: result.updated.totalCents ?? result.updated.amountCents,
        currency: result.updated.currency,
        dueAt: result.updated.dueAt?.toISOString?.() ?? null,
      },
    });
    void emitAppEvent({
      orgId: result.updated.orgId,
      eventType: 'invoice.sent',
      payload: {
        jobId: result.updated.jobId,
        invoiceId: result.updated.id,
        amountCents: result.updated.totalCents ?? result.updated.amountCents,
        currency: result.updated.currency,
      },
      actorUserId: params.updatedBy ?? null,
    });
    void emitAppEvent({
      orgId: result.updated.orgId,
      eventType: 'invoice.issued',
      payload: {
        jobId: result.updated.jobId,
        invoiceId: result.updated.id,
        amountCents: result.updated.totalCents ?? result.updated.amountCents,
        currency: result.updated.currency,
      },
      actorUserId: params.updatedBy ?? null,
    });
    void queueXeroInvoiceSyncBestEffort({
      orgId: result.updated.orgId,
      invoiceId: result.updated.id,
      jobId: result.updated.jobId,
      source: 'issue',
      actorUserId: params.updatedBy ?? null,
    });

    return ok(result.updated);
  } catch (error) {
    console.error('Error issuing invoice:', error);
    return err('INTERNAL_ERROR', 'Failed to issue invoice', error);
  }
}

export async function createInvoiceShareLink(params: {
  orgId: string;
  id: string;
  updatedBy?: string | null;
}): Promise<Result<{ shareUrl: string }>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [before] = await db
        .select({
          id: jobInvoices.id,
          status: jobInvoices.status,
        })
        .from(jobInvoices)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .limit(1);

      if (!before) return { before: null, updated: null, shareUrl: null, error: null };
      const status = String(before.status ?? '').toLowerCase();
      if (status === 'draft' || status === 'void') {
        return { before, updated: null, shareUrl: null, error: 'Invoice must be issued before sharing.' };
      }

      const shareToken = createSecureToken();
      const shareUrl = buildInvoiceShareUrl(shareToken.token);
      const now = new Date();

      const [updated] = await db
        .update(jobInvoices)
        .set({
          publicShareTokenHash: shareToken.tokenHash,
          publicShareTokenCreatedAt: now,
          pdfUrl: shareUrl,
          updatedBy: params.updatedBy ?? undefined,
          updatedAt: now,
        } as any)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .returning({ id: jobInvoices.id });

      return { before, updated: updated ?? null, shareUrl, error: null };
    });

    if (!result.before) return err('NOT_FOUND', 'Invoice not found');
    if (result.error) return err('VALIDATION_ERROR', result.error);
    if (!result.updated || !result.shareUrl) return err('INTERNAL_ERROR', 'Failed to generate share link');
    return ok({ shareUrl: result.shareUrl });
  } catch (error) {
    console.error('Error creating invoice share link:', error);
    return err('INTERNAL_ERROR', 'Failed to create invoice share link', error);
  }
}

export async function voidJobInvoice(params: {
  orgId: string;
  id: string;
  updatedBy?: string | null;
}): Promise<Result<JobInvoice>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [before] = await db
        .select()
        .from(jobInvoices)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .limit(1);

      if (!before) return { before: null, updated: null };
      if (String(before.status ?? '').toLowerCase() === 'void') return { before, updated: before };

      const [updated] = await db
        .update(jobInvoices)
        .set({
          status: 'void',
          paidAt: null,
          updatedBy: params.updatedBy ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .returning();
      return { before, updated: updated ?? null };
    });

    if (!result?.before) return err('NOT_FOUND', 'Invoice not found');
    if (!result.updated) return err('INTERNAL_ERROR', 'Failed to void invoice');
    return ok(result.updated);
  } catch (error) {
    console.error('Error voiding invoice:', error);
    return err('INTERNAL_ERROR', 'Failed to void invoice', error);
  }
}

export async function updateJobInvoiceXeroFields(params: {
  orgId: string;
  id: string;
  xeroInvoiceId?: string | null;
  xeroStatus?: string | null;
  xeroInvoiceUrl?: string | null;
  xeroLastSyncedAt?: Date | null;
  xeroSyncError?: string | null;
}): Promise<Result<JobInvoice>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [updated] = await db
        .update(jobInvoices)
        .set({
          xeroInvoiceId: params.xeroInvoiceId ?? undefined,
          xeroStatus: params.xeroStatus ?? undefined,
          xeroInvoiceUrl: params.xeroInvoiceUrl ?? undefined,
          xeroLastSyncedAt: params.xeroLastSyncedAt ?? undefined,
          xeroSyncError: params.xeroSyncError ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .returning();
      return updated ?? null;
    });

    if (!result) return err('NOT_FOUND', 'Invoice not found');
    return ok(result);
  } catch (error) {
    console.error('Error updating Xero invoice fields:', error);
    return err('INTERNAL_ERROR', 'Failed to update Xero fields', error);
  }
}

export async function updateJobInvoiceFromXeroSync(params: {
  orgId: string;
  id: string;
  status?: string | null;
  paidAt?: Date | null;
  xeroStatus?: string | null;
  xeroLastSyncedAt?: Date | null;
  xeroSyncError?: string | null;
}): Promise<Result<JobInvoice>> {
  try {
    const result = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [updated] = await db
        .update(jobInvoices)
        .set({
          status: params.status ?? undefined,
          paidAt: params.paidAt ?? undefined,
          xeroStatus: params.xeroStatus ?? undefined,
          xeroLastSyncedAt: params.xeroLastSyncedAt ?? undefined,
          xeroSyncError: params.xeroSyncError ?? undefined,
          updatedAt: new Date(),
        } as any)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.id)))
        .returning();
      return updated ?? null;
    });

    if (!result) return err('NOT_FOUND', 'Invoice not found');
    return ok(result);
  } catch (error) {
    console.error('Error updating Xero invoice status:', error);
    return err('INTERNAL_ERROR', 'Failed to update Xero invoice status', error);
  }
}
