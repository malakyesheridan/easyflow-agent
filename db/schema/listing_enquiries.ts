import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';
import { contacts } from './contacts';
import { listings } from './listings';

export const listingEnquiries = pgTable(
  'listing_enquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: text('source').notNull(),
    buyerContactId: uuid('buyer_contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listingIdx: index('listing_enquiries_listing_idx').on(table.listingId),
    orgListingIdx: index('listing_enquiries_org_listing_idx').on(table.orgId, table.listingId),
    orgOccurredIdx: index('listing_enquiries_org_occurred_idx').on(table.orgId, table.occurredAt),
  })
);

export type ListingEnquiry = typeof listingEnquiries.$inferSelect;
export type NewListingEnquiry = typeof listingEnquiries.$inferInsert;
