import { pgTable, uuid, text, integer, boolean, timestamp, index, jsonb } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const buyers = pgTable(
  'buyers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone'),
    budgetMin: integer('budget_min'),
    budgetMax: integer('budget_max'),
    preferredSuburbs: jsonb('preferred_suburbs').notNull().default([]),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('buyers_org_id_idx').on(table.orgId),
  })
);

export type Buyer = typeof buyers.$inferSelect;
export type NewBuyer = typeof buyers.$inferInsert;
