import { pgTable, uuid, text, integer, timestamp, index, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const jobInvoices = pgTable(
  'job_invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    amountCents: integer('amount_cents').notNull(),
    subtotalCents: integer('subtotal_cents'),
    taxCents: integer('tax_cents'),
    totalCents: integer('total_cents'),
    currency: text('currency').notNull().default('AUD'),
    status: text('status').notNull().default('draft'),
    invoiceNumber: text('invoice_number'),
    summary: text('summary'),
    xeroInvoiceId: text('xero_invoice_id'),
    xeroStatus: text('xero_status'),
    xeroInvoiceUrl: text('xero_invoice_url'),
    xeroLastSyncedAt: timestamp('xero_last_synced_at', { withTimezone: true }),
    xeroSyncError: text('xero_sync_error'),
    externalRef: text('external_ref'),
    pdfUrl: text('pdf_url'),
    publicShareTokenHash: text('public_share_token_hash'),
    publicShareTokenCreatedAt: timestamp('public_share_token_created_at', { withTimezone: true }),
    lineItems: jsonb('line_items'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key'),
    integrationEventId: uuid('integration_event_id'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdIdx: index('job_invoices_org_id_job_id_idx').on(table.orgId, table.jobId),
    orgIdStatusIdx: index('job_invoices_org_id_status_idx').on(table.orgId, table.status),
    orgIdDueAtIdx: index('job_invoices_org_id_due_at_idx').on(table.orgId, table.dueAt),
    providerIdx: index('job_invoices_provider_idx').on(table.provider),
    idempotencyKeyIdx: index('job_invoices_idempotency_key_idx').on(table.idempotencyKey),
    publicShareTokenHashIdx: uniqueIndex('job_invoices_public_share_token_hash_idx')
      .on(table.publicShareTokenHash),
  })
);

export type JobInvoice = typeof jobInvoices.$inferSelect;
export type NewJobInvoice = typeof jobInvoices.$inferInsert;
