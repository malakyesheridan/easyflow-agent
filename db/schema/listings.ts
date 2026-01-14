import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    addressLine1: text('address_line1'),
    suburb: text('suburb'),
    state: text('state'),
    postcode: text('postcode'),
    status: text('status'),
    priceGuide: text('price_guide'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('listings_org_id_idx').on(table.orgId),
    orgStatusIdx: index('listings_org_status_idx').on(table.orgId, table.status),
  })
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
