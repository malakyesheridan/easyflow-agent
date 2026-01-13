import { pgTable, uuid, text, timestamp, integer, pgEnum, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { crewMembers } from './crew_members';

export const jobDocumentKindEnum = pgEnum('job_document_kind', ['file', 'link']);

export const jobDocuments = pgTable(
  'job_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    kind: jobDocumentKindEnum('kind').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    storagePath: text('storage_path'),
    originalFileName: text('original_file_name'),
    mimeType: text('mime_type'),
    bytes: integer('bytes'),
    createdByCrewMemberId: uuid('created_by_crew_member_id').references(() => crewMembers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdCreatedAtIdx: index('job_documents_org_id_job_id_created_at_idx').on(table.orgId, table.jobId, table.createdAt),
  })
);

export type JobDocument = typeof jobDocuments.$inferSelect;
export type NewJobDocument = typeof jobDocuments.$inferInsert;

