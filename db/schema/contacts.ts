import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { orgs } from './orgs';
import { users } from './users';

export const contactRoleEnum = pgEnum('contact_role', [
  'seller',
  'buyer',
  'both',
  'unknown',
]);

export const contactTemperatureEnum = pgEnum('contact_temperature', [
  'hot',
  'warm',
  'cold',
  'unknown',
]);

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    firstName: text('first_name'),
    lastName: text('last_name'),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    suburb: text('suburb'),
    role: contactRoleEnum('role').notNull().default('unknown'),
    leadSource: text('lead_source'),
    sellerStage: text('seller_stage'),
    temperature: contactTemperatureEnum('temperature').notNull().default('unknown'),
    lastTouchAt: timestamp('last_touch_at', { withTimezone: true }),
    nextTouchAt: timestamp('next_touch_at', { withTimezone: true }),
    doNotContact: boolean('do_not_contact').notNull().default(false),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdIdx: index('contacts_org_id_idx').on(table.orgId),
    orgOwnerIdx: index('contacts_org_owner_idx').on(table.orgId, table.ownerUserId),
    orgNextTouchIdx: index('contacts_org_next_touch_idx').on(table.orgId, table.nextTouchAt),
    orgRoleIdx: index('contacts_org_role_idx').on(table.orgId, table.role),
  })
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
