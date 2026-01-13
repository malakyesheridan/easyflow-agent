import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobInvoiceItems } from '@/db/schema/job_invoice_items';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import { getDb } from '@/lib/db';
import type { JobInvoice } from '@/db/schema/job_invoices';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';

export async function listJobInvoices(params: {
  orgId: string;
  jobId?: string;
  limit?: number;
  actor?: RequestActor;
}): Promise<Result<JobInvoice[]>> {
  try {
    const rows = await withIntegrationOrgScope(params.orgId, async (db) => {
      const baseWhere = params.jobId
        ? and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.jobId, params.jobId))
        : eq(jobInvoices.orgId, params.orgId);
      const jobVisibility = params.actor ? applyJobVisibility(eq(jobs.orgId, params.orgId), params.actor, jobs) : null;
      const whereClause = jobVisibility ? and(baseWhere, jobVisibility) : baseWhere;

      const invoiceRows = await db
        .select({
          id: jobInvoices.id,
          orgId: jobInvoices.orgId,
          jobId: jobInvoices.jobId,
          status: jobInvoices.status,
          provider: jobInvoices.provider,
          invoiceNumber: jobInvoices.invoiceNumber,
          summary: jobInvoices.summary,
          amountCents: jobInvoices.amountCents,
          subtotalCents: jobInvoices.subtotalCents,
          taxCents: jobInvoices.taxCents,
          totalCents: jobInvoices.totalCents,
          currency: jobInvoices.currency,
          paidAt: jobInvoices.paidAt,
          xeroInvoiceId: jobInvoices.xeroInvoiceId,
          xeroStatus: jobInvoices.xeroStatus,
          xeroInvoiceUrl: jobInvoices.xeroInvoiceUrl,
          xeroLastSyncedAt: jobInvoices.xeroLastSyncedAt,
          xeroSyncError: jobInvoices.xeroSyncError,
          externalRef: jobInvoices.externalRef,
          pdfUrl: jobInvoices.pdfUrl,
          publicShareTokenHash: jobInvoices.publicShareTokenHash,
          publicShareTokenCreatedAt: jobInvoices.publicShareTokenCreatedAt,
          sentAt: jobInvoices.sentAt,
          issuedAt: jobInvoices.issuedAt,
          dueAt: jobInvoices.dueAt,
          lineItems: jobInvoices.lineItems,
          idempotencyKey: jobInvoices.idempotencyKey,
          integrationEventId: jobInvoices.integrationEventId,
          createdBy: jobInvoices.createdBy,
          updatedBy: jobInvoices.updatedBy,
          createdAt: jobInvoices.createdAt,
          updatedAt: jobInvoices.updatedAt,
        })
        .from(jobInvoices)
        .innerJoin(jobs, eq(jobs.id, jobInvoices.jobId))
        .where(whereClause)
        .orderBy(desc(jobInvoices.createdAt))
        .limit(params.limit ?? 50);

      if (invoiceRows.length === 0) return invoiceRows;

      const invoiceIds = invoiceRows.map((row) => row.id);
      const itemRows = await db
        .select({
          id: jobInvoiceItems.id,
          invoiceId: jobInvoiceItems.invoiceId,
          description: jobInvoiceItems.description,
          quantity: jobInvoiceItems.quantity,
          unitPriceCents: jobInvoiceItems.unitPriceCents,
          subtotalCents: jobInvoiceItems.subtotalCents,
          taxRate: jobInvoiceItems.taxRate,
          taxCents: jobInvoiceItems.taxCents,
          totalCents: jobInvoiceItems.totalCents,
          jobLinkType: jobInvoiceItems.jobLinkType,
          sortOrder: jobInvoiceItems.sortOrder,
        })
        .from(jobInvoiceItems)
        .where(and(eq(jobInvoiceItems.orgId, params.orgId), inArray(jobInvoiceItems.invoiceId, invoiceIds)))
        .orderBy(asc(jobInvoiceItems.sortOrder), asc(jobInvoiceItems.createdAt));

      const itemsByInvoiceId = new Map<string, Array<Record<string, unknown>>>();
      for (const row of itemRows) {
        const entry = itemsByInvoiceId.get(row.invoiceId) ?? [];
        entry.push({
          id: row.id,
          description: row.description,
          quantity: Number(row.quantity ?? 0),
          unitPriceCents: Number(row.unitPriceCents ?? 0),
          amountCents: Number(row.subtotalCents ?? 0),
          taxRate: row.taxRate !== null && row.taxRate !== undefined ? Number(row.taxRate) : null,
          taxCents: Number(row.taxCents ?? 0),
          totalCents: Number(row.totalCents ?? 0),
          jobLinkType: row.jobLinkType ?? null,
          sortOrder: Number(row.sortOrder ?? 0),
        });
        itemsByInvoiceId.set(row.invoiceId, entry);
      }

      return invoiceRows.map((row) => {
        const items = itemsByInvoiceId.get(row.id);
        return {
          ...row,
          lineItems: items && items.length > 0 ? items : row.lineItems ?? null,
        };
      });
    });

    return ok(rows);
  } catch (error) {
    console.error('Error listing job invoices:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch invoices', error);
  }
}

export async function getLatestJobInvoice(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<JobInvoice | null>> {
  try {
    const row = await withIntegrationOrgScope(params.orgId, async (db) => {
      const [found] = await db
        .select()
        .from(jobInvoices)
        .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.jobId, params.jobId)))
        .orderBy(desc(jobInvoices.createdAt))
        .limit(1);
      return found ?? null;
    });
    return ok(row ?? null);
  } catch (error) {
    console.error('Error getting latest invoice:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch invoice', error);
  }
}

export async function getJobInvoiceById(params: {
  orgId: string;
  invoiceId: string;
  actor?: RequestActor;
}): Promise<Result<JobInvoice | null>> {
  try {
    const row = await withIntegrationOrgScope(params.orgId, async (db) => {
      const baseWhere = and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.id, params.invoiceId));
      const jobVisibility = params.actor ? applyJobVisibility(eq(jobs.orgId, params.orgId), params.actor, jobs) : null;
      const whereClause = jobVisibility ? and(baseWhere, jobVisibility) : baseWhere;

      const [found] = await db
        .select({
          id: jobInvoices.id,
          orgId: jobInvoices.orgId,
          jobId: jobInvoices.jobId,
          status: jobInvoices.status,
          provider: jobInvoices.provider,
          invoiceNumber: jobInvoices.invoiceNumber,
          summary: jobInvoices.summary,
          amountCents: jobInvoices.amountCents,
          subtotalCents: jobInvoices.subtotalCents,
          taxCents: jobInvoices.taxCents,
          totalCents: jobInvoices.totalCents,
          currency: jobInvoices.currency,
          paidAt: jobInvoices.paidAt,
          xeroInvoiceId: jobInvoices.xeroInvoiceId,
          xeroStatus: jobInvoices.xeroStatus,
          xeroInvoiceUrl: jobInvoices.xeroInvoiceUrl,
          xeroLastSyncedAt: jobInvoices.xeroLastSyncedAt,
          xeroSyncError: jobInvoices.xeroSyncError,
          externalRef: jobInvoices.externalRef,
          pdfUrl: jobInvoices.pdfUrl,
          publicShareTokenHash: jobInvoices.publicShareTokenHash,
          publicShareTokenCreatedAt: jobInvoices.publicShareTokenCreatedAt,
          sentAt: jobInvoices.sentAt,
          issuedAt: jobInvoices.issuedAt,
          dueAt: jobInvoices.dueAt,
          lineItems: jobInvoices.lineItems,
          idempotencyKey: jobInvoices.idempotencyKey,
          integrationEventId: jobInvoices.integrationEventId,
          createdBy: jobInvoices.createdBy,
          updatedBy: jobInvoices.updatedBy,
          createdAt: jobInvoices.createdAt,
          updatedAt: jobInvoices.updatedAt,
        })
        .from(jobInvoices)
        .innerJoin(jobs, eq(jobs.id, jobInvoices.jobId))
        .where(whereClause)
        .limit(1);
      if (!found) return null;

      const itemRows = await db
        .select({
          id: jobInvoiceItems.id,
          invoiceId: jobInvoiceItems.invoiceId,
          description: jobInvoiceItems.description,
          quantity: jobInvoiceItems.quantity,
          unitPriceCents: jobInvoiceItems.unitPriceCents,
          subtotalCents: jobInvoiceItems.subtotalCents,
          taxRate: jobInvoiceItems.taxRate,
          taxCents: jobInvoiceItems.taxCents,
          totalCents: jobInvoiceItems.totalCents,
          jobLinkType: jobInvoiceItems.jobLinkType,
          sortOrder: jobInvoiceItems.sortOrder,
        })
        .from(jobInvoiceItems)
        .where(and(eq(jobInvoiceItems.orgId, params.orgId), eq(jobInvoiceItems.invoiceId, found.id)))
        .orderBy(asc(jobInvoiceItems.sortOrder), asc(jobInvoiceItems.createdAt));

      if (itemRows.length === 0) return found;

      const items = itemRows.map((row) => ({
        id: row.id,
        description: row.description,
        quantity: Number(row.quantity ?? 0),
        unitPriceCents: Number(row.unitPriceCents ?? 0),
        amountCents: Number(row.subtotalCents ?? 0),
        taxRate: row.taxRate !== null && row.taxRate !== undefined ? Number(row.taxRate) : null,
        taxCents: Number(row.taxCents ?? 0),
        totalCents: Number(row.totalCents ?? 0),
        jobLinkType: row.jobLinkType ?? null,
        sortOrder: Number(row.sortOrder ?? 0),
      }));

      return {
        ...found,
        lineItems: items,
      };
    });
    return ok(row ?? null);
  } catch (error) {
    console.error('Error getting invoice:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch invoice', error);
  }
}

export async function getInvoiceShareByTokenHash(params: {
  tokenHash: string;
}): Promise<Result<{ invoiceId: string; orgId: string; status: string | null }>> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        invoiceId: jobInvoices.id,
        orgId: jobInvoices.orgId,
        status: jobInvoices.status,
      })
      .from(jobInvoices)
      .where(eq(jobInvoices.publicShareTokenHash, params.tokenHash))
      .limit(1);
    if (!row) return err('NOT_FOUND', 'Invoice link not found');
    return ok(row);
  } catch (error) {
    console.error('Error getting invoice share link:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch invoice link', error);
  }
}
