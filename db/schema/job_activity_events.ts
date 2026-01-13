import { pgEnum, pgTable, uuid, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const jobActivityTypeEnum = pgEnum('job_activity_type', [
  'schedule_assignment_created',
  'schedule_assignment_updated',
  'schedule_assignment_deleted',
  'task_completed',
  'task_reopened',
  'photo_uploaded',
  'photo_deleted',
  'contact_created',
  'contact_updated',
  'contact_deleted',
  'note_added',
  'document_uploaded',
  'document_linked',
  'document_deleted',
  'order_created',
  'order_updated',
  'order_deleted',
  'hours_logged',
  'report_added',
  'margin_warning',
  'margin_critical',
  'cost_variance_exceeded',
]);

export const jobActivityEvents = pgTable(
  'job_activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    type: jobActivityTypeEnum('type').notNull(),
    actorCrewMemberId: uuid('actor_crew_member_id'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdJobIdCreatedAtIdx: index('job_activity_events_org_id_job_id_created_at_idx').on(
      table.orgId,
      table.jobId,
      table.createdAt
    ),
    orgIdTypeIdx: index('job_activity_events_org_id_type_idx').on(
      table.orgId,
      table.type
    ),
  })
);

export type JobActivityEvent = typeof jobActivityEvents.$inferSelect;
export type NewJobActivityEvent = typeof jobActivityEvents.$inferInsert;
