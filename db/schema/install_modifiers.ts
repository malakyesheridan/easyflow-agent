import { pgTable, uuid, text, numeric, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const installModifiers = pgTable(
  'install_modifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    multiplier: numeric('multiplier', { precision: 6, scale: 3 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('install_modifiers_org_id_idx').on(table.orgId),
    orgIdNameUnique: uniqueIndex('install_modifiers_org_id_name_unique').on(table.orgId, table.name),
  })
);

export type InstallModifier = typeof installModifiers.$inferSelect;
export type NewInstallModifier = typeof installModifiers.$inferInsert;
