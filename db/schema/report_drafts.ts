import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { listings } from './listings';
import { users } from './users';
import { reportTemplates } from './report_templates';

export const reportDrafts = pgTable(
  'report_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    listingId: uuid('listing_id').notNull().references(() => listings.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull(),
    payloadJson: jsonb('payload_json').notNull().default({}),
    templateId: uuid('template_id').references(() => reportTemplates.id, { onDelete: 'set null' }),
    sectionsOverrideJson: jsonb('sections_override_json'),
    brandingOverrideJson: jsonb('branding_override_json'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgListingIdx: index('report_drafts_org_listing_idx').on(table.orgId, table.listingId),
    tokenHashUnique: uniqueIndex('report_drafts_token_hash_unique').on(table.tokenHash),
    expiresAtIdx: index('report_drafts_expires_at_idx').on(table.expiresAt),
  })
);

export type ReportDraft = typeof reportDrafts.$inferSelect;
export type NewReportDraft = typeof reportDrafts.$inferInsert;
