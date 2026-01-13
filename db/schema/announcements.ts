import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { crewMembers } from './crew_members';

export const announcementPriorityEnum = pgEnum('announcement_priority', ['normal', 'urgent']);
export const announcementRecipientsTypeEnum = pgEnum('announcement_recipients_type', ['all', 'selected']);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    priority: announcementPriorityEnum('priority').notNull().default('normal'),
    recipientsType: announcementRecipientsTypeEnum('recipients_type').notNull().default('all'),
    createdByCrewMemberId: uuid('created_by_crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdCreatedAtIdx: index('announcements_org_id_created_at_idx').on(table.orgId, table.createdAt),
  })
);

export const announcementRecipients = pgTable(
  'announcement_recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    crewMemberId: uuid('crew_member_id')
      .notNull()
      .references(() => crewMembers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    announcementCrewUnique: uniqueIndex('announcement_recipients_unique').on(table.announcementId, table.crewMemberId),
    orgIdAnnouncementIdx: index('announcement_recipients_org_id_announcement_id_idx').on(table.orgId, table.announcementId),
  })
);

/**
 * Acknowledgements are org-wide for v1.
 * This avoids requiring per-user auth wiring while still supporting urgent gating.
 */
export const announcementAcknowledgements = pgTable(
  'announcement_acknowledgements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedByCrewMemberId: uuid('acknowledged_by_crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
  },
  (table) => ({
    announcementUnique: uniqueIndex('announcement_acknowledgements_announcement_unique').on(table.announcementId),
    orgIdAnnouncementIdx: index('announcement_acknowledgements_org_id_announcement_id_idx').on(table.orgId, table.announcementId),
  })
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type AnnouncementRecipient = typeof announcementRecipients.$inferSelect;
export type NewAnnouncementRecipient = typeof announcementRecipients.$inferInsert;
export type AnnouncementAcknowledgement = typeof announcementAcknowledgements.$inferSelect;
export type NewAnnouncementAcknowledgement = typeof announcementAcknowledgements.$inferInsert;

