import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('tags_org_id_idx').on(table.orgId),
    orgNameUnique: uniqueIndex('tags_org_name_unique').on(table.orgId, table.name),
  })
);

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
