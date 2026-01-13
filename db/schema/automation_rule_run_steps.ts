import { pgTable, uuid, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { automationRuleRuns } from './automation_rule_runs';

export const automationRuleRunSteps = pgTable(
  'automation_rule_run_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => automationRuleRuns.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    actionType: text('action_type').notNull(),
    actionInput: jsonb('action_input').notNull(),
    status: text('status').notNull(),
    result: jsonb('result'),
    commPreview: jsonb('comm_preview'),
    error: text('error'),
    errorDetails: jsonb('error_details'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    runStepIdx: index('automation_rule_run_steps_run_idx').on(table.runId, table.stepIndex),
  })
);

export type AutomationRuleRunStep = typeof automationRuleRunSteps.$inferSelect;
export type NewAutomationRuleRunStep = typeof automationRuleRunSteps.$inferInsert;
