import { pgTable, uuid, text, integer, timestamp, numeric, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { jobInvoices } from './job_invoices';

export const jobInvoiceItems = pgTable(
  'job_invoice_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => jobInvoices.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull().default('1'),
    unitPriceCents: integer('unit_price_cents').notNull().default(0),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxRate: numeric('tax_rate', { precision: 6, scale: 3 }),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    jobLinkType: text('job_link_type'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdInvoiceIdIdx: index('job_invoice_items_org_id_invoice_id_idx').on(table.orgId, table.invoiceId),
    orgIdJobIdIdx: index('job_invoice_items_org_id_job_id_idx').on(table.orgId, table.jobId),
    invoiceSortIdx: index('job_invoice_items_invoice_id_sort_order_idx').on(table.invoiceId, table.sortOrder),
  })
);

export type JobInvoiceItem = typeof jobInvoiceItems.$inferSelect;
export type NewJobInvoiceItem = typeof jobInvoiceItems.$inferInsert;
