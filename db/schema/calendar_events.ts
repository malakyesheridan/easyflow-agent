import { pgTable, uuid, text, timestamp, boolean, jsonb, pgEnum, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

export const calendarEventTypeEnum = pgEnum('calendar_event_type', [
  'call_block',
  'vendor_update',
  'appraisal',
  'open_home',
  'private_inspection',
  'meeting',
  'admin',
  'followup_block',
  'reminder',
]);

export const calendarEventStatusEnum = pgEnum('calendar_event_status', [
  'scheduled',
  'completed',
  'cancelled',
]);

export const calendarRelatedEntityEnum = pgEnum('calendar_related_entity_type', [
  'contact',
  'appraisal',
  'listing',
  'report',
  'none',
]);

export const calendarSourceTypeEnum = pgEnum('calendar_source_type', [
  'contact_followup',
  'appraisal_checklist_item',
  'appraisal_followup',
  'listing_checklist_item',
  'listing_milestone',
  'buyer_followup',
  'vendor_report_due',
  'vendor_comm_overdue',
]);

export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: calendarEventTypeEnum('type').notNull().default('meeting'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    timezone: text('timezone').notNull().default('UTC'),
    location: text('location'),
    notes: text('notes'),
    relatedEntityType: calendarRelatedEntityEnum('related_entity_type').notNull().default('none'),
    relatedEntityId: text('related_entity_id'),
    sourceType: calendarSourceTypeEnum('source_type'),
    sourceId: text('source_id'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    status: calendarEventStatusEnum('status').notNull().default('scheduled'),
    reminderMinutes: jsonb('reminder_minutes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgStartIdx: index('calendar_events_org_start_idx').on(table.orgId, table.startsAt),
    orgEndIdx: index('calendar_events_org_end_idx').on(table.orgId, table.endsAt),
    orgAssignedIdx: index('calendar_events_org_assigned_idx').on(table.orgId, table.assignedToUserId),
    orgSourceIdx: index('calendar_events_org_source_idx').on(table.orgId, table.sourceType, table.sourceId),
  })
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
