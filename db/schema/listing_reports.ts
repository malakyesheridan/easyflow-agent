import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { listings } from './listings';
import { users } from './users';
import { reportTemplates } from './report_templates';

export const listingReportTypeEnum = pgEnum('listing_report_type', ['vendor']);
export const listingReportDeliveryEnum = pgEnum('listing_report_delivery_method', [
  'share_link',
  'email',
  'sms',
  'logged',
]);

export const listingReports = pgTable(
  'listing_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    type: listingReportTypeEnum('type').notNull().default('vendor'),
    shareToken: text('share_token').notNull(),
    payloadJson: jsonb('payload_json').notNull().default({}),
    templateId: uuid('template_id').references(() => reportTemplates.id, { onDelete: 'set null' }),
    deliveryMethod: listingReportDeliveryEnum('delivery_method'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgListingIdx: index('listing_reports_org_listing_idx').on(table.orgId, table.listingId),
    shareTokenUnique: uniqueIndex('listing_reports_share_token_unique').on(table.shareToken),
  })
);

export type ListingReport = typeof listingReports.$inferSelect;
export type NewListingReport = typeof listingReports.$inferInsert;
