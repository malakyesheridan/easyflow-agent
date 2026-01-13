import { z } from 'zod';

/**
 * Task status enum schema.
 */
export const taskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'skipped',
]);

/**
 * Base schema with all task fields.
 * All fields are optional/nullable as defined in the database schema.
 */
export const taskBaseSchema = z.object({
  id: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: taskStatusSchema,
  order: z.number().int(),
  isRequired: z.boolean(),
  completedAt: z.string().datetime().nullable().optional(),
  completedBy: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/**
 * Schema for creating a new task.
 * Required: job_id, org_id, title, order
 * Optional: description, status, is_required, completed_at, completed_by
 * Defaults: status = 'pending', is_required = true
 */
export const taskCreateSchema = z.object({
  jobId: z.string().uuid(),
  orgId: z.string().uuid(),
  title: z.string().min(1, 'Title is required'),
  order: z.number().int().positive(),
  description: z.string().nullable().optional(),
  status: taskStatusSchema.default('pending'),
  isRequired: z.boolean().default(true),
  completedAt: z.string().datetime().nullable().optional(),
  completedBy: z.string().uuid().nullable().optional(),
});

/**
 * Schema for updating a task.
 * Required: id, org_id
 * Optional: any updatable field
 * Disallows: created_at updates
 */
export const taskUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  status: taskStatusSchema.optional(),
  order: z.number().int().positive().optional(),
  isRequired: z.boolean().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  completedBy: z.string().uuid().nullable().optional(),
  updatedAt: z.string().datetime().optional(),
  // Note: createdAt is intentionally omitted - cannot be updated
});

/**
 * Schema for task ID parameter.
 */
export const taskIdSchema = z.object({
  id: z.string().uuid(),
});

// Export inferred types
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskBase = z.infer<typeof taskBaseSchema>;
export type CreateTaskInput = z.infer<typeof taskCreateSchema>;
export type UpdateTaskInput = z.infer<typeof taskUpdateSchema>;
export type TaskIdParams = z.infer<typeof taskIdSchema>;

