import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  integer,
  numeric,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';
import { contacts } from './contacts';

export const listingStatusEnum = pgEnum('listing_status', [
  'draft',
  'active',
  'under_offer',
  'sold',
  'withdrawn',
]);

export const listings = pgTable(
  'listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    vendorContactId: uuid('vendor_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    addressLine1: text('address_line1'),
    suburb: text('suburb'),
    state: text('state'),
    postcode: text('postcode'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    status: listingStatusEnum('status').notNull().default('draft'),
    listedAt: timestamp('listed_at', { withTimezone: true }),
    soldAt: timestamp('sold_at', { withTimezone: true }),
    priceGuide: text('price_guide'),
    priceGuideMin: integer('price_guide_min'),
    priceGuideMax: integer('price_guide_max'),
    propertyType: text('property_type'),
    beds: integer('beds'),
    baths: integer('baths'),
    cars: integer('cars'),
    campaignHealthScore: integer('campaign_health_score'),
    campaignHealthReasons: jsonb('campaign_health_reasons'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('listings_org_id_idx').on(table.orgId),
    orgStatusIdx: index('listings_org_status_idx').on(table.orgId, table.status),
    orgOwnerIdx: index('listings_org_owner_idx').on(table.orgId, table.ownerUserId),
    orgVendorIdx: index('listings_org_vendor_idx').on(table.orgId, table.vendorContactId),
  })
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
