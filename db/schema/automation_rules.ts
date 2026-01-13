import { pgTable, uuid, text, boolean, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';

export const automationRules = pgTable(
  'automation_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    templateKey: text('template_key'),
    isEnabled: boolean('is_enabled').notNull().default(false),
    enabled: boolean('enabled').notNull().default(false),
    triggerType: text('trigger_type').notNull(),
    triggerKey: text('trigger_key').notNull().default(''),
    triggerVersion: integer('trigger_version').notNull().default(1),
    triggerFilters: jsonb('trigger_filters').notNull().default({}),
    conditions: jsonb('conditions').notNull().default([]),
    actions: jsonb('actions').notNull().default([]),
    conditionsJson: jsonb('conditions_json').notNull().default([]),
    actionsJson: jsonb('actions_json').notNull().default([]),
    throttle: jsonb('throttle'),
    isCustomerFacing: boolean('is_customer_facing').notNull().default(false),
    requiresSms: boolean('requires_sms').notNull().default(false),
    requiresEmail: boolean('requires_email').notNull().default(false),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
    lastEnabledAt: timestamp('last_enabled_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id'),
    updatedByUserId: uuid('updated_by_user_id'),
    createdBy: uuid('created_by'),
    updatedBy: uuid('updated_by'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    orgTriggerEnabledIdx: index('automation_rules_org_trigger_enabled_idx').on(
      table.orgId,
      table.triggerType,
      table.isEnabled
    ),
    orgEnabledIdx: index('automation_rules_org_enabled_idx').on(table.orgId, table.isEnabled),
    orgEnabledBuilderIdx: index('automation_rules_org_enabled_builder_idx').on(table.orgId, table.enabled),
    orgTriggerKeyIdx: index('automation_rules_org_trigger_key_idx').on(table.orgId, table.triggerKey),
  })
);

export type AutomationRule = typeof automationRules.$inferSelect;
export type NewAutomationRule = typeof automationRules.$inferInsert;
