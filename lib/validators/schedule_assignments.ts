import { z } from 'zod';

/**
 * Assignment type schema.
 */
export const assignmentTypeSchema = z.string().trim().min(1).max(50);

/**
 * Assignment status schema.
 */
export const assignmentStatusSchema = z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']);

/**
 * Schema for creating a new schedule assignment.
 */
export const createScheduleAssignmentSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  crewId: z.string().uuid().nullable().default(null),
  date: z.string().datetime(), // ISO datetime string, will be normalized to start of day
  startMinutes: z.number().int().min(0).max(720), // 0-720 (06:00 to 18:00)
  endMinutes: z.number().int().min(0).max(720),
  assignmentType: assignmentTypeSchema,
  status: assignmentStatusSchema.optional().default('scheduled'),
  startAtHq: z.boolean().optional().default(false),
  endAtHq: z.boolean().optional().default(false),
});

/**
 * Schema for updating a schedule assignment.
 */
export const updateScheduleAssignmentSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  crewId: z.string().uuid().nullable().optional(),
  date: z.string().datetime().optional(),
  startMinutes: z.number().int().min(0).max(720).optional(),
  endMinutes: z.number().int().min(0).max(720).optional(),
  assignmentType: assignmentTypeSchema.optional(),
  status: assignmentStatusSchema.optional(),
  startAtHq: z.boolean().optional(),
  endAtHq: z.boolean().optional(),
});

/**
 * Schema for deleting a schedule assignment.
 */
export const deleteScheduleAssignmentSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

export type CreateScheduleAssignmentInput = z.infer<typeof createScheduleAssignmentSchema>;
export type UpdateScheduleAssignmentInput = z.infer<typeof updateScheduleAssignmentSchema>;
export type DeleteScheduleAssignmentInput = z.infer<typeof deleteScheduleAssignmentSchema>;

