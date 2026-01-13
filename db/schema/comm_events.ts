import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const commEvents = pgTable(
  'comm_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    eventKey: text('event_key').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    triggeredByUserId: uuid('triggered_by_user_id'),
    source: text('source').notNull().default('app'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgEventEntityIdx: index('comm_events_org_event_entity_idx').on(
      table.orgId,
      table.eventKey,
      table.entityType,
      table.entityId,
      table.createdAt
    ),
  })
);

export type CommEvent = typeof commEvents.$inferSelect;
export type NewCommEvent = typeof commEvents.$inferInsert;
