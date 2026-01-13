import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { orgRoles } from './org_roles';
import { crewMembers } from './crew_members';
import { users } from './users';

export const orgInvites = pgTable(
  'org_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    roleId: uuid('role_id').references(() => orgRoles.id, { onDelete: 'set null' }),
    crewMemberId: uuid('crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('pending'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('org_invites_org_id_idx').on(table.orgId),
    emailIdx: index('org_invites_email_idx').on(table.email),
    tokenHashUnique: uniqueIndex('org_invites_token_hash_unique').on(table.tokenHash),
  })
);

export type OrgInvite = typeof orgInvites.$inferSelect;
export type NewOrgInvite = typeof orgInvites.$inferInsert;
