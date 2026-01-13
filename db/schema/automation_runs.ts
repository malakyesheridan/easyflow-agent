import { pgTable, uuid, text, jsonb, timestamp, integer, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { automationRules } from './automation_rules';
import { appEvents } from './app_events';

export const automationRunStatusEnum = pgEnum('automation_run_status', [
  'queued',
  'running',
  'success',
  'partial',
  'failed',
  'skipped',
]);

export const automationRuns = pgTable(
  'automation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => appEvents.id, { onDelete: 'cascade' }),
    parentEventId: uuid('parent_event_id'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    status: automationRunStatusEnum('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    logs: jsonb('logs').notNull().default([]),
    error: text('error'),
    snapshot: jsonb('snapshot').notNull().default({}),
    lineageDepth: integer('lineage_depth').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgEventIdx: index('automation_runs_org_event_idx').on(table.orgId, table.eventId),
    orgRuleCreatedIdx: index('automation_runs_org_rule_created_idx').on(
      table.orgId,
      table.ruleId,
      table.createdAt
    ),
    orgRuleEventUnique: uniqueIndex('automation_runs_org_rule_event_unique').on(
      table.orgId,
      table.ruleId,
      table.eventId
    ),
  })
);

export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;
