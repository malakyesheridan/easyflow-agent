import { pgTable, uuid, text, boolean, timestamp, index, uniqueIndex, integer } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const jobTypes = pgTable(
  'job_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    color: text('color'),
    defaultDurationMinutes: integer('default_duration_minutes'),
    requirePhotos: boolean('require_photos').notNull().default(false),
    requireMaterials: boolean('require_materials').notNull().default(false),
    requireReports: boolean('require_reports').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    isDemo: boolean('is_demo').notNull().default(false),
    createdBy: text('created_by'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgKeyUnique: uniqueIndex('job_types_org_key_unique').on(table.orgId, table.key),
    orgIdIdx: index('job_types_org_id_idx').on(table.orgId),
  })
);

export type JobType = typeof jobTypes.$inferSelect;
export type NewJobType = typeof jobTypes.$inferInsert;
