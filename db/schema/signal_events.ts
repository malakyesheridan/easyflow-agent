import { pgEnum, pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

export const signalEventStatusEnum = pgEnum('signal_event_status', [
  'open',
  'acknowledged',
  'resolved',
]);

export const signalEvents = pgTable(
  'signal_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    signalId: text('signal_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    status: signalEventStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, { onDelete: 'set null' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    assignedTo: uuid('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionReason: text('resolution_reason'),
    notes: text('notes'),
  },
  (table) => ({
    orgIdSignalIdUnique: uniqueIndex('signal_events_org_id_signal_id_unique').on(table.orgId, table.signalId),
    orgIdStatusIdx: index('signal_events_org_id_status_idx').on(table.orgId, table.status),
    orgIdEntityIdx: index('signal_events_org_id_entity_idx').on(table.orgId, table.entityType, table.entityId),
  })
);

export type SignalEvent = typeof signalEvents.$inferSelect;
export type NewSignalEvent = typeof signalEvents.$inferInsert;
