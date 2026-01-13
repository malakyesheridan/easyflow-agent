import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { jobInvoices } from './job_invoices';

export const jobPayments = pgTable(
  'job_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => jobInvoices.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    method: text('method').notNull().default('stripe_card'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('AUD'),
    status: text('status').notNull().default('pending'),
    paymentLinkUrl: text('payment_link_url'),
    providerPaymentId: text('provider_payment_id'),
    providerInvoiceId: text('provider_invoice_id'),
    stripePaymentLinkId: text('stripe_payment_link_id'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    reference: text('reference'),
    notes: text('notes'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key'),
    integrationEventId: uuid('integration_event_id'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdIdx: index('job_payments_org_id_job_id_idx').on(table.orgId, table.jobId),
    orgIdInvoiceIdIdx: index('job_payments_org_id_invoice_id_idx').on(table.orgId, table.invoiceId),
    orgIdStatusIdx: index('job_payments_org_id_status_idx').on(table.orgId, table.status),
    providerIdx: index('job_payments_provider_idx').on(table.provider),
    idempotencyKeyIdx: index('job_payments_idempotency_key_idx').on(table.idempotencyKey),
    orgIdProviderPaymentIdUnique: uniqueIndex('job_payments_org_id_provider_payment_id_uidx').on(
      table.orgId,
      table.providerPaymentId
    ),
  })
);

export type JobPayment = typeof jobPayments.$inferSelect;
export type NewJobPayment = typeof jobPayments.$inferInsert;
