import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const leadSources = pgTable(
  'lead_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('lead_sources_org_id_idx').on(table.orgId),
    orgNameUnique: uniqueIndex('lead_sources_org_name_unique').on(table.orgId, table.name),
  })
);

export type LeadSource = typeof leadSources.$inferSelect;
export type NewLeadSource = typeof leadSources.$inferInsert;
