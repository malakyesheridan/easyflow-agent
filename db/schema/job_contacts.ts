import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const jobContacts = pgTable(
  'job_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdJobIdIdx: index('job_contacts_org_id_job_id_idx').on(
      table.orgId,
      table.jobId
    ),
  })
);

export type JobContact = typeof jobContacts.$inferSelect;
export type NewJobContact = typeof jobContacts.$inferInsert;

