import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

export const appEvents = pgTable(
  'app_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload'),
    status: text('status').notNull().default('queued'),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    orgIdCreatedAtIdx: index('app_events_org_id_created_at_idx').on(table.orgId, table.createdAt),
    eventTypeIdx: index('app_events_event_type_idx').on(table.eventType),
  })
);

export type AppEvent = typeof appEvents.$inferSelect;
export type NewAppEvent = typeof appEvents.$inferInsert;
