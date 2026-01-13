import { pgTable, uuid, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { installModifiers } from './install_modifiers';

export const jobInstallModifiers = pgTable(
  'job_install_modifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    modifierId: uuid('modifier_id')
      .notNull()
      .references(() => installModifiers.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdJobIdIdx: index('job_install_modifiers_org_id_job_id_idx').on(table.orgId, table.jobId),
    orgIdModifierIdx: index('job_install_modifiers_org_id_modifier_id_idx').on(table.orgId, table.modifierId),
    orgIdJobModifierUnique: uniqueIndex('job_install_modifiers_org_id_job_id_modifier_id_unique').on(
      table.orgId,
      table.jobId,
      table.modifierId
    ),
  })
);

export type JobInstallModifier = typeof jobInstallModifiers.$inferSelect;
export type NewJobInstallModifier = typeof jobInstallModifiers.$inferInsert;
