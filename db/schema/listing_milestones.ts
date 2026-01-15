import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';
import { listings } from './listings';

export const listingMilestones = pgTable(
  'listing_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetDueAt: timestamp('target_due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    listingIdx: index('listing_milestones_listing_idx').on(table.listingId),
    orgListingIdx: index('listing_milestones_org_listing_idx').on(table.orgId, table.listingId),
    orgAssignedIdx: index('listing_milestones_org_assigned_idx').on(table.orgId, table.assignedToUserId),
    orgDueIdx: index('listing_milestones_org_due_idx').on(table.orgId, table.targetDueAt),
  })
);

export type ListingMilestone = typeof listingMilestones.$inferSelect;
export type NewListingMilestone = typeof listingMilestones.$inferInsert;
