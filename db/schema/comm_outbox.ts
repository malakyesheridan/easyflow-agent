import { pgTable, uuid, text, jsonb, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const commOutbox = pgTable(
  'comm_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    eventId: uuid('event_id'),
    eventKey: text('event_key').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    channel: text('channel').notNull(),
    recipientType: text('recipient_type').notNull(),
    recipientUserId: uuid('recipient_user_id'),
    recipientEmail: text('recipient_email'),
    recipientPhone: text('recipient_phone'),
    templateId: uuid('template_id'),
    templateVersion: integer('template_version').notNull().default(1),
    subjectRendered: text('subject_rendered'),
    bodyRendered: text('body_rendered').notNull(),
    bodyHtmlRendered: text('body_html_rendered'),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    replyToEmail: text('reply_to_email'),
    status: text('status').notNull().default('queued'),
    provider: text('provider').notNull().default('resend'),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    metadata: jsonb('metadata').notNull().default({}),
    idempotencyKey: text('idempotency_key').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    orgIdempotencyUnique: uniqueIndex('comm_outbox_org_idempotency_unique').on(table.orgId, table.idempotencyKey),
    statusScheduledIdx: index('comm_outbox_status_scheduled_idx').on(table.status, table.scheduledFor),
    orgCreatedIdx: index('comm_outbox_org_created_idx').on(table.orgId, table.createdAt),
    eventIdIdx: index('comm_outbox_event_id_idx').on(table.eventId),
  })
);

export type CommOutbox = typeof commOutbox.$inferSelect;
export type NewCommOutbox = typeof commOutbox.$inferInsert;
