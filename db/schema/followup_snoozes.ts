import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

export const followupSnoozes = pgTable(
  'followup_snoozes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgSourceUnique: uniqueIndex('followup_snoozes_org_source_unique').on(table.orgId, table.sourceType, table.sourceId),
    orgUntilIdx: index('followup_snoozes_org_until_idx').on(table.orgId, table.snoozedUntil),
    orgTypeIdx: index('followup_snoozes_org_type_idx').on(table.orgId, table.sourceType),
  })
);

export type FollowupSnooze = typeof followupSnoozes.$inferSelect;
export type NewFollowupSnooze = typeof followupSnoozes.$inferInsert;
