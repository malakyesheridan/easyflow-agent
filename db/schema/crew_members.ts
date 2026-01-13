import { pgTable, uuid, text, integer, boolean, timestamp, index, pgEnum } from 'drizzle-orm/pg-core';

export const crewCostRateTypeEnum = pgEnum('crew_cost_rate_type', ['hourly', 'daily']);

/**
 * Crew members (employees).
 * These are the primary units the UI will schedule against.
 */
export const crewMembers = pgTable(
  'crew_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull().default('staff'),
    email: text('email'),
    phone: text('phone'),
    skills: text('skills'),
    active: boolean('active').notNull().default(true),
    defaultStartMinutes: integer('default_start_minutes').notNull().default(6 * 60),
    defaultEndMinutes: integer('default_end_minutes').notNull().default(18 * 60),
    dailyCapacityMinutes: integer('daily_capacity_minutes').notNull().default(8 * 60),
    costRateCents: integer('cost_rate_cents'),
    costRateType: crewCostRateTypeEnum('cost_rate_type').notNull().default('hourly'),
    availability: text('availability'), // Stub for future availability model
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdActiveIdx: index('crew_members_org_id_active_idx').on(table.orgId, table.active),
    orgIdRoleIdx: index('crew_members_org_id_role_idx').on(table.orgId, table.role),
  })
);

export type CrewMember = typeof crewMembers.$inferSelect;
export type NewCrewMember = typeof crewMembers.$inferInsert;
