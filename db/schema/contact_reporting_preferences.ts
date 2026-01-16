import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { orgs } from './orgs';
import { reportCadenceTypeEnum } from './report_templates';

export const contactReportingPreferences = pgTable(
  'contact_reporting_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    cadencePreference: reportCadenceTypeEnum('cadence_preference').notNull().default('none'),
    channelPreference: text('channel_preference'),
    additionalRecipientsJson: jsonb('additional_recipients_json').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgContactIdx: index('contact_reporting_preferences_org_contact_idx').on(table.orgId, table.contactId),
  })
);

export type ContactReportingPreference = typeof contactReportingPreferences.$inferSelect;
export type NewContactReportingPreference = typeof contactReportingPreferences.$inferInsert;
