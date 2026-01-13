import { pgTable, uuid, text, jsonb, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { automationRules } from './automation_rules';

export const automationRuleRuns = pgTable(
  'automation_rule_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    eventKey: text('event_key').notNull(),
    eventPayload: jsonb('event_payload').notNull(),
    matched: boolean('matched').notNull(),
    matchDetails: jsonb('match_details').notNull().default({}),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key').notNull(),
    rateLimited: boolean('rate_limited').notNull().default(false),
    error: text('error'),
    errorDetails: jsonb('error_details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgRuleCreatedIdx: index('automation_rule_runs_org_rule_created_idx').on(
      table.orgId,
      table.ruleId,
      table.createdAt
    ),
    idempotencyKeyUnique: uniqueIndex('automation_rule_runs_idempotency_key_unique').on(table.idempotencyKey),
  })
);

export type AutomationRuleRun = typeof automationRuleRuns.$inferSelect;
export type NewAutomationRuleRun = typeof automationRuleRuns.$inferInsert;
