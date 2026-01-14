import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const matchingConfig = pgTable(
  'matching_config',
  {
    orgId: uuid('org_id').primaryKey().references(() => orgs.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull().default('zone'),
    budgetWeight: integer('budget_weight').notNull().default(25),
    locationWeight: integer('location_weight').notNull().default(25),
    propertyTypeWeight: integer('property_type_weight').notNull().default(20),
    bedsBathsWeight: integer('beds_baths_weight').notNull().default(15),
    timeframeWeight: integer('timeframe_weight').notNull().default(15),
    hotMatchThreshold: integer('hot_match_threshold').notNull().default(85),
    goodMatchThreshold: integer('good_match_threshold').notNull().default(70),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('matching_config_org_id_idx').on(table.orgId),
  })
);

export type MatchingConfig = typeof matchingConfig.$inferSelect;
export type NewMatchingConfig = typeof matchingConfig.$inferInsert;
