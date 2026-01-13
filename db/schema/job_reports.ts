import { pgTable, uuid, text, timestamp, index, boolean } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { crewMembers } from './crew_members';

export const jobReports = pgTable(
  'job_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    note: text('note').notNull(),
    createdByCrewMemberId: uuid('created_by_crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdCreatedAtIdx: index('job_reports_org_id_job_id_created_at_idx').on(table.orgId, table.jobId, table.createdAt),
  })
);

export type JobReport = typeof jobReports.$inferSelect;
export type NewJobReport = typeof jobReports.$inferInsert;
