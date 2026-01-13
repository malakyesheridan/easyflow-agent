import { pgTable, uuid, text, jsonb, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const commPreferences = pgTable(
  'comm_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    eventKey: text('event_key').notNull(),
    enabled: boolean('enabled').default(true),
    enabledEmail: boolean('enabled_email').default(true),
    enabledSms: boolean('enabled_sms').default(false),
    enabledInApp: boolean('enabled_in_app').default(true),
    sendToAdmins: boolean('send_to_admins'),
    sendToAssignedCrew: boolean('send_to_assigned_crew'),
    sendToClientContacts: boolean('send_to_client_contacts'),
    sendToSiteContacts: boolean('send_to_site_contacts'),
    additionalEmails: text('additional_emails'),
    deliveryMode: text('delivery_mode'),
    recipientRules: jsonb('recipient_rules').notNull().default({}),
    timing: jsonb('timing').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgEventKeyUnique: uniqueIndex('comm_preferences_org_event_key_unique').on(table.orgId, table.eventKey),
  })
);

export type CommPreference = typeof commPreferences.$inferSelect;
export type NewCommPreference = typeof commPreferences.$inferInsert;
