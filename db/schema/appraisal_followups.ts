import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { contacts } from './contacts';
import { appraisals } from './appraisals';

export const appraisalFollowupTypeEnum = pgEnum('appraisal_followup_type', [
  'followup_same_day',
  'followup_2_days',
  'followup_7_days',
  'custom',
]);

export const appraisalFollowups = pgTable(
  'appraisal_followups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    appraisalId: uuid('appraisal_id')
      .notNull()
      .references(() => appraisals.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    type: appraisalFollowupTypeEnum('type').notNull(),
    title: text('title').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    isDone: boolean('is_done').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    appraisalIdx: index('appraisal_followups_appraisal_idx').on(table.appraisalId),
    orgAppraisalIdx: index('appraisal_followups_org_appraisal_idx').on(table.orgId, table.appraisalId),
    orgDueIdx: index('appraisal_followups_org_due_idx').on(table.orgId, table.dueAt),
  })
);

export type AppraisalFollowup = typeof appraisalFollowups.$inferSelect;
export type NewAppraisalFollowup = typeof appraisalFollowups.$inferInsert;
