import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { jobTypes } from './job_types';

export const workTemplates = pgTable(
  'work_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    jobTypeId: uuid('job_type_id').references(() => jobTypes.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('work_templates_org_id_idx').on(table.orgId),
    jobTypeIdIdx: index('work_templates_job_type_id_idx').on(table.jobTypeId),
  })
);

export type WorkTemplate = typeof workTemplates.$inferSelect;
export type NewWorkTemplate = typeof workTemplates.$inferInsert;
