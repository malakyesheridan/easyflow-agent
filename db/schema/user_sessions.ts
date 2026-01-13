import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';
import { orgs } from './orgs';
import { crewMembers } from './crew_members';

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    impersonatedCrewMemberId: uuid('impersonated_crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index('user_sessions_user_id_idx').on(table.userId),
    orgIdIdx: index('user_sessions_org_id_idx').on(table.orgId),
    expiresAtIdx: index('user_sessions_expires_at_idx').on(table.expiresAt),
    tokenHashUnique: uniqueIndex('user_sessions_token_hash_unique').on(table.tokenHash),
  })
);

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;
