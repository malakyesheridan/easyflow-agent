import { pgTable, uuid, text, boolean, timestamp, index, integer, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const reportCadenceTypeEnum = pgEnum('report_cadence_type', [
  'weekly',
  'fortnightly',
  'monthly',
  'custom',
  'none',
]);

export const reportTemplates = pgTable(
  'report_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    templateType: text('template_type').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    cadenceDefaultType: reportCadenceTypeEnum('cadence_default_type').notNull().default('weekly'),
    cadenceDefaultIntervalDays: integer('cadence_default_interval_days'),
    cadenceDefaultDayOfWeek: integer('cadence_default_day_of_week'),
    includeDemandSummary: boolean('include_demand_summary').notNull().default(true),
    includeActivitySummary: boolean('include_activity_summary').notNull().default(true),
    includeMarketOverview: boolean('include_market_overview').notNull().default(true),
    sectionsJson: jsonb('sections_json').notNull().default({}),
    promptsJson: jsonb('prompts_json').notNull().default({}),
    commentaryTemplate: text('commentary_template'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('report_templates_org_id_idx').on(table.orgId),
  })
);

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type NewReportTemplate = typeof reportTemplates.$inferInsert;
