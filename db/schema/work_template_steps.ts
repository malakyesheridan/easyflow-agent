import { pgTable, uuid, text, boolean, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { workTemplates } from './work_templates';

export const workTemplateSteps = pgTable(
  'work_template_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').notNull().references(() => workTemplates.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    isRequired: boolean('is_required').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('work_template_steps_org_id_idx').on(table.orgId),
    templateIdIdx: index('work_template_steps_template_id_idx').on(table.templateId),
  })
);

export type WorkTemplateStep = typeof workTemplateSteps.$inferSelect;
export type NewWorkTemplateStep = typeof workTemplateSteps.$inferInsert;
