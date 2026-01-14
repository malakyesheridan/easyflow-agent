import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { orgs } from './orgs';
import { users } from './users';

export const contactActivityTypeEnum = pgEnum('contact_activity_type', [
  'note',
  'call',
  'email',
  'sms',
  'report_sent',
]);

export const contactActivities = pgTable(
  'contact_activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    type: contactActivityTypeEnum('type').notNull(),
    content: text('content'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgContactIdx: index('contact_activities_org_contact_idx').on(table.orgId, table.contactId),
    contactOccurredIdx: index('contact_activities_contact_occurred_idx').on(
      table.contactId,
      table.occurredAt
    ),
  })
);

export type ContactActivity = typeof contactActivities.$inferSelect;
export type NewContactActivity = typeof contactActivities.$inferInsert;
