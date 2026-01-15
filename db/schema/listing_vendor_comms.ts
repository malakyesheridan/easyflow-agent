import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { listings } from './listings';
import { users } from './users';

export const listingVendorCommTypeEnum = pgEnum('listing_vendor_comm_type', [
  'call',
  'email',
  'sms',
  'update',
  'report_sent',
]);

export const listingVendorComms = pgTable(
  'listing_vendor_comms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    type: listingVendorCommTypeEnum('type').notNull().default('update'),
    content: text('content').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listingIdx: index('listing_vendor_comms_listing_idx').on(table.listingId),
    orgListingIdx: index('listing_vendor_comms_org_listing_idx').on(table.orgId, table.listingId),
    orgOccurredIdx: index('listing_vendor_comms_org_occurred_idx').on(table.orgId, table.occurredAt),
  })
);

export type ListingVendorComm = typeof listingVendorComms.$inferSelect;
export type NewListingVendorComm = typeof listingVendorComms.$inferInsert;
