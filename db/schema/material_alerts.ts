import { pgEnum, pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { materials } from './materials';

export const materialAlertTypeEnum = pgEnum('material_alert_type', [
  'low_stock',
  'insufficient_for_job',
  'usage_spike',
]);

export const materialAlerts = pgTable(
  'material_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    type: materialAlertTypeEnum('type').notNull(),
    materialId: uuid('material_id')
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    message: text('message').notNull(),
    eventKey: text('event_key').notNull(), // idempotency key
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => ({
    orgIdResolvedAtIdx: index('material_alerts_org_id_resolved_at_idx').on(table.orgId, table.resolvedAt),
    orgIdMaterialIdIdx: index('material_alerts_org_id_material_id_idx').on(table.orgId, table.materialId),
    eventKeyUnique: uniqueIndex('material_alerts_event_key_unique').on(table.eventKey),
  })
);

export type MaterialAlert = typeof materialAlerts.$inferSelect;
export type NewMaterialAlert = typeof materialAlerts.$inferInsert;

