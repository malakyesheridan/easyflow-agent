import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const orgClients = pgTable(
  'org_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    displayName: text('display_name').notNull(),
    legalName: text('legal_name'),
    email: text('email'),
    phone: text('phone'),
    billingAddress: jsonb('billing_address'),
    notes: text('notes'),
    tags: jsonb('tags').notNull().default([]),
    normalizedEmail: text('normalized_email'),
    normalizedPhone: text('normalized_phone'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgDisplayNameIdx: index('org_clients_org_id_display_name_idx').on(
      table.orgId,
      table.displayName
    ),
    orgNormalizedEmailUnique: uniqueIndex('org_clients_org_id_normalized_email_unique').on(
      table.orgId,
      table.normalizedEmail
    ),
    orgNormalizedPhoneUnique: uniqueIndex('org_clients_org_id_normalized_phone_unique').on(
      table.orgId,
      table.normalizedPhone
    ),
  })
);

export type OrgClient = typeof orgClients.$inferSelect;
export type NewOrgClient = typeof orgClients.$inferInsert;
