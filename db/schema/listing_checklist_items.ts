import { pgTable, uuid, text, timestamp, integer, boolean, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';
import { listings } from './listings';

export const listingChecklistItems = pgTable(
  'listing_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    isDone: boolean('is_done').notNull().default(false),
    dueAt: timestamp('due_at', { withTimezone: true }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listingIdx: index('listing_checklist_listing_idx').on(table.listingId),
    orgListingIdx: index('listing_checklist_org_listing_idx').on(table.orgId, table.listingId),
    orgAssignedIdx: index('listing_checklist_org_assigned_idx').on(table.orgId, table.assignedToUserId),
  })
);

export type ListingChecklistItem = typeof listingChecklistItems.$inferSelect;
export type NewListingChecklistItem = typeof listingChecklistItems.$inferInsert;
