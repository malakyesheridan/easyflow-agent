import { pgTable, uuid, text, jsonb, timestamp, integer, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { automationRuns } from './automation_runs';
import { automationRules } from './automation_rules';
import { appEvents } from './app_events';

export const automationActionTypeEnum = pgEnum('automation_action_type', [
  'comms.send',
  'notification.create',
  'job.update',
  'schedule.update',
  'schedule.create',
  'materials.adjust',
  'task.create',
  'webhook.call',
  'invoice.draft',
  'integration.emit',
]);

export const automationOutboxStatusEnum = pgEnum('automation_outbox_status', [
  'queued',
  'sent',
  'failed',
  'retrying',
  'dead',
]);

export const automationActionsOutbox = pgTable(
  'automation_actions_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    runId: uuid('run_id')
      .notNull()
      .references(() => automationRuns.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => automationRules.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => appEvents.id, { onDelete: 'cascade' }),
    actionType: automationActionTypeEnum('action_type').notNull(),
    actionKey: text('action_key').notNull(),
    actionPayload: jsonb('action_payload').notNull().default({}),
    status: automationOutboxStatusEnum('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgStatusAttemptIdx: index('automation_outbox_org_status_attempt_idx').on(
      table.orgId,
      table.status,
      table.nextAttemptAt
    ),
    orgRunIdx: index('automation_outbox_org_run_idx').on(table.orgId, table.runId),
    orgRuleEventActionUnique: uniqueIndex('automation_outbox_org_rule_event_action_unique').on(
      table.orgId,
      table.ruleId,
      table.eventId,
      table.actionKey
    ),
  })
);

export type AutomationActionOutbox = typeof automationActionsOutbox.$inferSelect;
export type NewAutomationActionOutbox = typeof automationActionsOutbox.$inferInsert;
