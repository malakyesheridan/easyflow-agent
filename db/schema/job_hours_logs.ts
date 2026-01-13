import { pgTable, uuid, integer, text, timestamp, index, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { crewMembers } from './crew_members';

export const jobTimeBucketEnum = pgEnum('job_time_bucket', [
  'INSTALL',
  'SETUP',
  'PACKDOWN',
  'WAITING',
  'ADMIN',
  'TRAVEL',
  'REWORK',
]);

export const jobDelayReasonEnum = pgEnum('job_delay_reason', [
  'ACCESS_KEYS_NOT_READY',
  'DELIVERY_LATE_OR_WRONG',
  'WEATHER',
  'EQUIPMENT_LIFT_CRANE_WAIT',
  'SAFETY_PERMIT_INDUCTION',
  'CLIENT_CHANGE_SCOPE',
  'REWORK_DEFECT_FIX',
  'OTHER_WITH_NOTE',
]);

export const jobHoursLogs = pgTable(
  'job_hours_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    crewMemberId: uuid('crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    minutes: integer('minutes').notNull(),
    startTime: timestamp('start_time', { withTimezone: true }),
    endTime: timestamp('end_time', { withTimezone: true }),
    bucket: jobTimeBucketEnum('bucket'),
    delayReason: jobDelayReasonEnum('delay_reason'),
    note: text('note'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdCreatedAtIdx: index('job_hours_logs_org_id_job_id_created_at_idx').on(table.orgId, table.jobId, table.createdAt),
    orgIdJobIdBucketIdx: index('job_hours_logs_org_id_job_id_bucket_idx').on(table.orgId, table.jobId, table.bucket),
    orgIdJobIdStartTimeIdx: index('job_hours_logs_org_id_job_id_start_time_idx').on(table.orgId, table.jobId, table.startTime),
    orgIdCrewMemberStartTimeIdx: index('job_hours_logs_org_id_crew_member_id_start_time_idx').on(
      table.orgId,
      table.crewMemberId,
      table.startTime
    ),
  })
);

export type JobHoursLog = typeof jobHoursLogs.$inferSelect;
export type NewJobHoursLog = typeof jobHoursLogs.$inferInsert;
