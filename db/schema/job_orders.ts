import { pgTable, uuid, text, timestamp, numeric, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { crewMembers } from './crew_members';

export const jobOrders = pgTable(
  'job_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    supplier: text('supplier'),
    item: text('item').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 4 }),
    unit: text('unit'),
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    createdByCrewMemberId: uuid('created_by_crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdCreatedAtIdx: index('job_orders_org_id_job_id_created_at_idx').on(table.orgId, table.jobId, table.createdAt),
  })
);

export type JobOrder = typeof jobOrders.$inferSelect;
export type NewJobOrder = typeof jobOrders.$inferInsert;

