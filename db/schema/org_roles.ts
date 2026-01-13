import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const orgRoles = pgTable(
  'org_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    capabilities: text('capabilities').notNull().default('[]'),
    isDefault: boolean('is_default').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgKeyUnique: uniqueIndex('org_roles_org_key_unique').on(table.orgId, table.key),
    orgIdIdx: index('org_roles_org_id_idx').on(table.orgId),
  })
);

export type OrgRole = typeof orgRoles.$inferSelect;
export type NewOrgRole = typeof orgRoles.$inferInsert;
