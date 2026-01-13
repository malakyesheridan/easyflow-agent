import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Task status enum values.
 */
export const taskStatusEnum = pgEnum('task_status', [
  'pending',
  'in_progress',
  'completed',
  'skipped',
]);

/**
 * Tasks table schema.
 * Tasks represent ordered, job-specific execution units.
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull(),
    orgId: uuid('org_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    status: taskStatusEnum('status').notNull().default('pending'),
    order: integer('order').notNull(),
    isRequired: boolean('is_required').notNull().default(true),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by'),
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
    jobIdOrderIdx: index('tasks_job_id_order_idx').on(
      table.jobId,
      table.order
    ),
    orgIdJobIdIdx: index('tasks_org_id_job_id_idx').on(
      table.orgId,
      table.jobId
    ),
    orgIdStatusIdx: index('tasks_org_id_status_idx').on(
      table.orgId,
      table.status
    ),
  })
);

/**
 * Type helper for selecting a task.
 */
export type Task = typeof tasks.$inferSelect;

/**
 * Type helper for inserting a new task.
 */
export type NewTask = typeof tasks.$inferInsert;
