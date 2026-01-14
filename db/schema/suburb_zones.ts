import { pgTable, uuid, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const suburbZones = pgTable(
  'suburb_zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('suburb_zones_org_id_idx').on(table.orgId),
    orgNameUnique: uniqueIndex('suburb_zones_org_name_unique').on(table.orgId, table.name),
  })
);

export const suburbZoneMembers = pgTable(
  'suburb_zone_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    zoneId: uuid('zone_id').notNull().references(() => suburbZones.id, { onDelete: 'cascade' }),
    suburb: text('suburb').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    zoneIdIdx: index('suburb_zone_members_zone_id_idx').on(table.zoneId),
    zoneSuburbUnique: uniqueIndex('suburb_zone_members_zone_suburb_unique').on(table.zoneId, table.suburb),
  })
);

export type SuburbZone = typeof suburbZones.$inferSelect;
export type NewSuburbZone = typeof suburbZones.$inferInsert;
export type SuburbZoneMember = typeof suburbZoneMembers.$inferSelect;
export type NewSuburbZoneMember = typeof suburbZoneMembers.$inferInsert;
