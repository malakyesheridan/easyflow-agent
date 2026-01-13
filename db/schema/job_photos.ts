import { pgTable, uuid, text, timestamp, integer, jsonb, index, boolean } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const jobPhotos = pgTable(
  'job_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    storagePath: text('storage_path').notNull(), // Served from /public or other storage
    originalFileName: text('original_file_name'),
    mimeType: text('mime_type'),
    bytes: integer('bytes'),
    annotationJson: jsonb('annotation_json'),
    createdByCrewMemberId: uuid('created_by_crew_member_id'),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdJobIdCreatedAtIdx: index('job_photos_org_id_job_id_created_at_idx').on(
      table.orgId,
      table.jobId,
      table.createdAt
    ),
  })
);

export type JobPhoto = typeof jobPhotos.$inferSelect;
export type NewJobPhoto = typeof jobPhotos.$inferInsert;
