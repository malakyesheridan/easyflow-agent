import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const notificationTypeEnum = pgEnum('notification_type', [
  'job_progress',
  'warehouse_alert',
  'announcement',
  'integration',
  'automation',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    type: notificationTypeEnum('type').notNull(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    eventKey: text('event_key'),
    recipientUserId: uuid('recipient_user_id'),
    message: text('message').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
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
