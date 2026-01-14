import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const reportTemplates = pgTable(
  'report_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    templateType: text('template_type').notNull(),
    name: text('name').notNull(),
    includeDemandSummary: boolean('include_demand_summary').notNull().default(true),
    includeActivitySummary: boolean('include_activity_summary').notNull().default(true),
    includeMarketOverview: boolean('include_market_overview').notNull().default(true),
    commentaryTemplate: text('commentary_template'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('report_templates_org_id_idx').on(table.orgId),
    orgTypeUnique: uniqueIndex('report_templates_org_type_unique').on(table.orgId, table.templateType),
  })
);

export type ReportTemplate = typeof reportTemplates.$inferSelect;
export type NewReportTemplate = typeof reportTemplates.$inferInsert;
