import { pgTable, uuid, text, timestamp, numeric, index, boolean, integer } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { materials } from './materials';
import { tasks } from './tasks';

export const materialUsageLogs = pgTable(
  'material_usage_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    quantityUsed: numeric('quantity_used', { precision: 14, scale: 4 }).notNull(),
    unitCostCents: integer('unit_cost_cents'),
    notes: text('notes'),
    loggedByCrewMemberId: uuid('logged_by_crew_member_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdMaterialCreatedAtIdx: index('material_usage_logs_org_id_material_id_created_at_idx').on(
      table.orgId,
      table.materialId,
      table.createdAt
    ),
    orgIdJobCreatedAtIdx: index('material_usage_logs_org_id_job_id_created_at_idx').on(table.orgId, table.jobId, table.createdAt),
  })
);

export type MaterialUsageLog = typeof materialUsageLogs.$inferSelect;
export type NewMaterialUsageLog = typeof materialUsageLogs.$inferInsert;
