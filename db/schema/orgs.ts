import { pgTable, uuid, text, timestamp, uniqueIndex, boolean, integer } from 'drizzle-orm/pg-core';

export const orgs = pgTable(
  'orgs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug'),
    logoPath: text('logo_path'),
    brandPrimaryColor: text('brand_primary_color'),
    brandSecondaryColor: text('brand_secondary_color'),
    onboardingCompleted: boolean('onboarding_completed').notNull().default(false),
    onboardingStep: integer('onboarding_step').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('orgs_slug_unique').on(table.slug),
  })
);

export type Org = typeof orgs.$inferSelect;
export type NewOrg = typeof orgs.$inferInsert;
