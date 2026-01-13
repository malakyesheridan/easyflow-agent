import { pgEnum, pgTable, uuid, text, numeric, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const jobCostTypeEnum = pgEnum('job_cost_type', [
  'labour',
  'material',
  'subcontract',
  'other',
  'travel',
]);

export const jobCostSourceEnum = pgEnum('job_cost_source', ['auto', 'manual']);

export const jobCosts = pgTable(
  'job_costs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    costType: jobCostTypeEnum('cost_type').notNull(),
    referenceId: text('reference_id'),
    description: text('description'),
    quantity: numeric('quantity', { precision: 14, scale: 4 }),
    unitCostCents: integer('unit_cost_cents'),
    totalCostCents: integer('total_cost_cents').notNull(),
    source: jobCostSourceEnum('source').notNull().default('manual'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdIdx: index('job_costs_org_id_job_id_idx').on(table.orgId, table.jobId),
    orgIdCostTypeIdx: index('job_costs_org_id_cost_type_idx').on(table.orgId, table.costType),
  })
);

export type JobCost = typeof jobCosts.$inferSelect;
export type NewJobCost = typeof jobCosts.$inferInsert;
