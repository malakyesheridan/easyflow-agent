import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';
import { appraisals } from './appraisals';

export const appraisalChecklistItems = pgTable(
  'appraisal_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    appraisalId: uuid('appraisal_id')
      .notNull()
      .references(() => appraisals.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isDone: boolean('is_done').notNull().default(false),
    dueAt: timestamp('due_at', { withTimezone: true }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appraisalIdx: index('appraisal_checklist_appraisal_idx').on(table.appraisalId),
    orgAppraisalIdx: index('appraisal_checklist_org_appraisal_idx').on(table.orgId, table.appraisalId),
    assignedIdx: index('appraisal_checklist_assigned_idx').on(table.orgId, table.assignedToUserId),
  })
);

export type AppraisalChecklistItem = typeof appraisalChecklistItems.$inferSelect;
export type NewAppraisalChecklistItem = typeof appraisalChecklistItems.$inferInsert;
