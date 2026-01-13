import { pgTable, uuid, integer, numeric, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { crewMembers } from './crew_members';

export const crewInstallStats = pgTable(
  'crew_install_stats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    crewMemberId: uuid('crew_member_id')
      .notNull()
      .references(() => crewMembers.id, { onDelete: 'cascade' }),
    m2Total7d: numeric('m2_total_7d', { precision: 14, scale: 4 }).notNull().default('0'),
    minutesTotal7d: integer('minutes_total_7d').notNull().default(0),
    m2PerMinute7d: numeric('m2_per_minute_7d', { precision: 12, scale: 6 }).notNull().default('0'),
    m2Total30d: numeric('m2_total_30d', { precision: 14, scale: 4 }).notNull().default('0'),
    minutesTotal30d: integer('minutes_total_30d').notNull().default(0),
    m2PerMinute30d: numeric('m2_per_minute_30d', { precision: 12, scale: 6 }).notNull().default('0'),
    m2Total90d: numeric('m2_total_90d', { precision: 14, scale: 4 }).notNull().default('0'),
    minutesTotal90d: integer('minutes_total_90d').notNull().default(0),
    m2PerMinute90d: numeric('m2_per_minute_90d', { precision: 12, scale: 6 }).notNull().default('0'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('crew_install_stats_org_id_idx').on(table.orgId),
    orgIdCrewMemberUnique: uniqueIndex('crew_install_stats_org_id_crew_member_id_unique').on(table.orgId, table.crewMemberId),
  })
);

export type CrewInstallStats = typeof crewInstallStats.$inferSelect;
export type NewCrewInstallStats = typeof crewInstallStats.$inferInsert;
