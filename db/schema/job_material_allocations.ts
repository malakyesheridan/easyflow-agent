import { pgTable, uuid, text, timestamp, numeric, index, uniqueIndex, boolean, integer } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { materials } from './materials';

export const jobMaterialAllocations = pgTable(
  'job_material_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    plannedQuantity: numeric('planned_quantity', { precision: 14, scale: 4 }).notNull(),
    unitCostCents: integer('unit_cost_cents'),
    notes: text('notes'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdIdx: index('job_material_allocations_org_id_job_id_idx').on(table.orgId, table.jobId),
    orgIdMaterialIdIdx: index('job_material_allocations_org_id_material_id_idx').on(table.orgId, table.materialId),
    orgIdJobMaterialUnique: uniqueIndex('job_material_allocations_org_id_job_id_material_id_unique').on(
      table.orgId,
      table.jobId,
      table.materialId
    ),
  })
);

export type JobMaterialAllocation = typeof jobMaterialAllocations.$inferSelect;
export type NewJobMaterialAllocation = typeof jobMaterialAllocations.$inferInsert;
