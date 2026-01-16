import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const notificationTypeEnum = pgEnum('notification_type', [
  'job_progress',
  'warehouse_alert',
  'announcement',
  'integration',
  'automation',
  'contact_followup_overdue',
  'new_hot_prospect',
  'appraisal_upcoming',
  'appraisal_followup_due',
  'appraisal_stage_changed',
  'listing_milestone_overdue',
  'vendor_report_due',
  'vendor_update_overdue',
  'new_buyer_match',
  'listing_health_stalling',
  'inspection_scheduled',
  'report_generated',
]);

export const notificationSeverityEnum = pgEnum('notification_severity', [
  'info',
  'warn',
  'critical',
]);

export const notificationEntityTypeEnum = pgEnum('notification_entity_type', [
  'contact',
  'appraisal',
  'listing',
  'report',
  'inspection',
  'none',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    type: notificationTypeEnum('type').notNull(),
    title: text('title'),
    body: text('body'),
    severity: notificationSeverityEnum('severity').notNull().default('info'),
    entityType: notificationEntityTypeEnum('entity_type').notNull().default('none'),
    entityId: text('entity_id'),
    deepLink: text('deep_link'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    eventKey: text('event_key'),
    recipientUserId: uuid('recipient_user_id'),
    message: text('message').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdCreatedAtIdx: index('notifications_org_id_created_at_idx').on(table.orgId, table.createdAt),
    orgIdReadAtIdx: index('notifications_org_id_read_at_idx').on(table.orgId, table.readAt),
    orgIdRecipientCreatedIdx: index('notifications_org_recipient_created_idx').on(table.orgId, table.recipientUserId, table.createdAt),
    eventKeyUnique: uniqueIndex('notifications_event_key_unique').on(table.eventKey),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
