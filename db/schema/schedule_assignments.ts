import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  boolean,
} from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

/**
 * Assignment status enum
 */
export const assignmentStatusEnum = pgEnum('assignment_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
]);

/**
 * Schedule Assignments table schema.
 * 
 * PHASE C2: ScheduleAssignments are first-class entities.
 * - One Job can have many ScheduleAssignments
 * - Jobs are immutable reference data
 * - ScheduleAssignments are mutable schedule state
 * - Assignments can span multiple crews, days, etc.
 */
export const scheduleAssignments = pgTable(
  'schedule_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }), // Cascade delete assignments when job is deleted
    crewId: uuid('crew_id'),
    date: timestamp('date', { withTimezone: true }).notNull(), // Date portion only (normalized to start of day)
    startMinutes: integer('start_minutes').notNull(), // Minutes from workday start (06:00 = 0, 18:00 = 720)
    endMinutes: integer('end_minutes').notNull(), // Minutes from workday start
    assignmentType: text('assignment_type').notNull(),
    status: assignmentStatusEnum('status').notNull().default('scheduled'),
    startAtHq: boolean('start_at_hq').notNull().default(false),
    endAtHq: boolean('end_at_hq').notNull().default(false),
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
    orgIdDateIdx: index('schedule_assignments_org_id_date_idx').on(
      table.orgId,
      table.date
    ),
    jobIdIdx: index('schedule_assignments_job_id_idx').on(table.jobId),
    crewIdDateIdx: index('schedule_assignments_crew_id_date_idx').on(
      table.crewId,
      table.date
    ),
    orgIdStatusIdx: index('schedule_assignments_org_id_status_idx').on(
      table.orgId,
      table.status
    ),
  })
);

/**
 * Type helper for selecting a schedule assignment.
 */
export type ScheduleAssignment = typeof scheduleAssignments.$inferSelect;

/**
 * Type helper for inserting a new schedule assignment.
 */
export type NewScheduleAssignment = typeof scheduleAssignments.$inferInsert;

