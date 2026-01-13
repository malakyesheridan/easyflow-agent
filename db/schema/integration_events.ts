import { pgTable, uuid, text, jsonb, timestamp, index, integer } from 'drizzle-orm/pg-core';
import { integrations } from './integrations';
import { appEvents } from './app_events';

export const integrationEvents = pgTable(
  'integration_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .references(() => appEvents.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    actionType: text('action_type').notNull(),
    ruleId: text('rule_id'),
    idempotencyKey: text('idempotency_key'),
    payload: jsonb('payload'),
    status: text('status').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    latencyMs: integer('latency_ms'),
    error: text('error'),
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    integrationIdCreatedAtIdx: index('integration_events_integration_id_created_at_idx').on(
      table.integrationId,
      table.createdAt
    ),
    eventTypeIdx: index('integration_events_event_type_idx').on(table.eventType),
    eventIdIdx: index('integration_events_event_id_idx').on(table.eventId),
    statusIdx: index('integration_events_status_idx').on(table.status),
    idempotencyKeyIdx: index('integration_events_idempotency_key_idx').on(table.idempotencyKey),
  })
);

export type IntegrationEvent = typeof integrationEvents.$inferSelect;
export type NewIntegrationEvent = typeof integrationEvents.$inferInsert;
