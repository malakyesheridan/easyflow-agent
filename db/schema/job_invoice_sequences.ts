import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const jobInvoiceSequences = pgTable('job_invoice_sequences', {
  orgId: uuid('org_id')
    .primaryKey()
    .references(() => orgs.id, { onDelete: 'cascade' }),
  nextNumber: integer('next_number').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type JobInvoiceSequence = typeof jobInvoiceSequences.$inferSelect;
export type NewJobInvoiceSequence = typeof jobInvoiceSequences.$inferInsert;
