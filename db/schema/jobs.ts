import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  numeric,
  pgEnum,
  index,
  boolean,
  jsonb,
} from 'drizzle-orm/pg-core';
import { jobTypes } from './job_types';
import { orgClients } from './org_clients';
import { users } from './users';

/**
 * Job status enum values.
 */
export const jobStatusEnum = pgEnum('job_status', [
  'unassigned',
  'scheduled',
  'in_progress',
  'completed',
]);

/**
 * Job priority enum values.
 */
export const jobPriorityEnum = pgEnum('job_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

/**
 * Job progress status enum values.
 * Separate from job.status (lifecycle).
 */
export const jobProgressStatusEnum = pgEnum('job_progress_status', [
  'not_started',
  'in_progress',
  'half_complete',
  'completed',
]);

export const jobProfitabilityStatusEnum = pgEnum('job_profitability_status', [
  'healthy',
  'warning',
  'critical',
]);

/**
 * Jobs table schema.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    title: text('title').notNull(),
    jobTypeId: uuid('job_type_id').references(() => jobTypes.id, { onDelete: 'set null' }),
    clientId: uuid('client_id').references(() => orgClients.id, { onDelete: 'set null' }),
    status: jobStatusEnum('status').notNull().default('unassigned'),
    priority: jobPriorityEnum('priority').notNull().default('normal'),
    progressStatus: jobProgressStatusEnum('progress_status').notNull().default('not_started'),
    // Profitability fields (Phase 4.1)
    estimatedRevenueCents: integer('estimated_revenue_cents'),
    estimatedCostCents: integer('estimated_cost_cents'),
    targetMarginPercent: numeric('target_margin_percent', { precision: 5, scale: 2 }),
    revenueOverrideCents: integer('revenue_override_cents'),
    profitabilityStatus: jobProfitabilityStatusEnum('profitability_status').notNull().default('healthy'),
    crewId: uuid('crew_id'),
    
    // ═══════════════════════════════════════════════════════════════════════
    // CANONICAL SITE ADDRESS FIELDS (Phase G1)
    // These are the ONLY source of truth for job location.
    // Used by: schedule display, travel time (future), maps (future).
    // ═══════════════════════════════════════════════════════════════════════
    // REQUIRED for scheduling: addressLine1, suburb, postcode
    // OPTIONAL: addressLine2, state, country (defaults to AU)
    // FUTURE: latitude, longitude (for travel time calculation in Phase G3)
    // ═══════════════════════════════════════════════════════════════════════
    addressLine1: text('address_line1').notNull(), // Street address (required)
    addressLine2: text('address_line2'),            // Unit/building (optional)
    suburb: text('suburb'),                         // Required for scheduling
    state: text('state'),                           // State/territory
    postcode: text('postcode'),                     // Required for scheduling
    country: text('country').default('AU'),         // Defaults to Australia
    // TODO Phase G3: These will be populated via Google Geocoding
    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    kgEstimate: integer('kg_estimate'),
    kgInstalled: integer('kg_installed'),
    plannedM2: numeric('planned_m2', { precision: 14, scale: 4 }),
    variationM2: numeric('variation_m2', { precision: 14, scale: 4 }),
    claimedM2: numeric('claimed_m2', { precision: 14, scale: 4 }),
    acceptedM2: numeric('accepted_m2', { precision: 14, scale: 4 }),
    reworkM2: numeric('rework_m2', { precision: 14, scale: 4 }),
    acceptedM2ApprovedBy: uuid('accepted_m2_approved_by').references(() => users.id, { onDelete: 'set null' }),
    acceptedM2ApprovedAt: timestamp('accepted_m2_approved_at', { withTimezone: true }),
    complexityAccessDifficulty: integer('complexity_access_difficulty'),
    complexityHeightLiftRequirement: integer('complexity_height_lift_requirement'),
    complexityPanelHandlingSize: integer('complexity_panel_handling_size'),
    complexitySiteConstraints: integer('complexity_site_constraints'),
    complexityDetailingComplexity: integer('complexity_detailing_complexity'),
    qualityDefectCount: integer('quality_defect_count').notNull().default(0),
    qualityCallbackFlag: boolean('quality_callback_flag').notNull().default(false),
    qualityMissingDocsFlag: boolean('quality_missing_docs_flag').notNull().default(false),
    qualitySafetyFlag: boolean('quality_safety_flag').notNull().default(false),
    // LEGACY FIELDS: scheduledStart / scheduledEnd
    // These fields are ignored when schedule_assignments exist.
    // ScheduleAssignments are the ONLY authoritative source of scheduled time.
    // These remain for backward compatibility with legacy data only.
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }),
    scheduledEnd: timestamp('scheduled_end', { withTimezone: true }),
    notes: text('notes'),
    tags: jsonb('tags').notNull().default([]),
    flags: jsonb('flags').notNull().default([]),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdStatusIdx: index('jobs_org_id_status_idx').on(
      table.orgId,
      table.status
    ),
    orgIdCreatedAtIdx: index('jobs_org_id_created_at_idx').on(
      table.orgId,
      table.createdAt
    ),
    orgIdCrewIdIdx: index('jobs_org_id_crew_id_idx').on(
      table.orgId,
      table.crewId
    ),
    orgIdClientIdIdx: index('jobs_org_id_client_id_idx').on(
      table.orgId,
      table.clientId
    ),
    orgIdScheduledStartIdx: index('jobs_org_id_scheduled_start_idx').on(
      table.orgId,
      table.scheduledStart
    ),
    orgIdUpdatedAtIdx: index('jobs_org_id_updated_at_idx').on(
      table.orgId,
      table.updatedAt
    ),
  })
);

/**
 * Type helper for selecting a job.
 */
export type Job = typeof jobs.$inferSelect;

/**
 * Type helper for inserting a new job.
 */
export type NewJob = typeof jobs.$inferInsert;
