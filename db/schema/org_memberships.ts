import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';
import { orgRoles } from './org_roles';
import { crewMembers } from './crew_members';

export const orgMemberships = pgTable(
  'org_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id').references(() => orgRoles.id, { onDelete: 'set null' }),
    crewMemberId: uuid('crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgUserUnique: uniqueIndex('org_memberships_org_user_unique').on(table.orgId, table.userId),
    orgIdIdx: index('org_memberships_org_id_idx').on(table.orgId),
    userIdIdx: index('org_memberships_user_id_idx').on(table.userId),
  })
);

export type OrgMembership = typeof orgMemberships.$inferSelect;
export type NewOrgMembership = typeof orgMemberships.$inferInsert;
