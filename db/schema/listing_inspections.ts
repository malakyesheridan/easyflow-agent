import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { listings } from './listings';

export const listingInspectionTypeEnum = pgEnum('listing_inspection_type', [
  'open_home',
  'private',
]);

export const listingInspections = pgTable(
  'listing_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    type: listingInspectionTypeEnum('type').notNull().default('open_home'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listingIdx: index('listing_inspections_listing_idx').on(table.listingId),
    orgListingIdx: index('listing_inspections_org_listing_idx').on(table.orgId, table.listingId),
    orgStartsIdx: index('listing_inspections_org_starts_idx').on(table.orgId, table.startsAt),
  })
);

export type ListingInspection = typeof listingInspections.$inferSelect;
export type NewListingInspection = typeof listingInspections.$inferInsert;
