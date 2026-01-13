import { pgTable, uuid, text, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const commProviderStatus = pgTable('comm_provider_status', {
  orgId: uuid('org_id').primaryKey(),
  emailProvider: text('email_provider').default('resend'),
  emailEnabled: boolean('email_enabled').default(false),
  smsProvider: text('sms_provider').default('stub'),
  smsEnabled: boolean('sms_enabled').default(false),
  lastTestedAt: timestamp('last_tested_at', { withTimezone: true }),
  lastTestResult: jsonb('last_test_result'),
});

export type CommProviderStatus = typeof commProviderStatus.$inferSelect;
export type NewCommProviderStatus = typeof commProviderStatus.$inferInsert;
