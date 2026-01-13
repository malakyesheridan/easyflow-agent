import { pgEnum, pgTable, uuid, text, timestamp, numeric, index, boolean } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { materials } from './materials';
import { materialUsageLogs } from './material_usage_logs';

export const inventoryEventTypeEnum = pgEnum('inventory_event_type', [
  'stock_added',
  'manual_adjustment',
  'job_consumed',
  'stocktake',
]);

export const materialInventoryEvents = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    eventType: inventoryEventTypeEnum('event_type').notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull(), // positive/negative delta
    reason: text('reason'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    usageLogId: uuid('usage_log_id').references(() => materialUsageLogs.id, { onDelete: 'set null' }),
    actorCrewMemberId: uuid('actor_crew_member_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdMaterialCreatedAtIdx: index('material_inventory_events_org_id_material_id_created_at_idx').on(
      table.orgId,
      table.materialId,
      table.createdAt
    ),
    orgIdJobIdIdx: index('material_inventory_events_org_id_job_id_idx').on(table.orgId, table.jobId),
  })
);

export type MaterialInventoryEvent = typeof materialInventoryEvents.$inferSelect;
export type NewMaterialInventoryEvent = typeof materialInventoryEvents.$inferInsert;

// Backwards-compatible export name (legacy placeholder table).
export const stockMovements = materialInventoryEvents;
