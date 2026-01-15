import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { contacts } from './contacts';
import { listings } from './listings';

export const listingBuyerStatusEnum = pgEnum('listing_buyer_status', [
  'new',
  'contacted',
  'inspection_booked',
  'attended',
  'offer_potential',
  'offer_made',
  'not_interested',
]);

export const listingBuyers = pgTable(
  'listing_buyers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    buyerContactId: uuid('buyer_contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
    status: listingBuyerStatusEnum('status').notNull().default('new'),
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listingIdx: index('listing_buyers_listing_idx').on(table.listingId),
    orgListingIdx: index('listing_buyers_org_listing_idx').on(table.orgId, table.listingId),
    orgBuyerIdx: index('listing_buyers_org_buyer_idx').on(table.orgId, table.buyerContactId),
    orgStatusIdx: index('listing_buyers_org_status_idx').on(table.orgId, table.status),
    orgFollowUpIdx: index('listing_buyers_org_follow_up_idx').on(table.orgId, table.nextFollowUpAt),
  })
);

export type ListingBuyer = typeof listingBuyers.$inferSelect;
export type NewListingBuyer = typeof listingBuyers.$inferInsert;
