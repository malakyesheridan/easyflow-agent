import { z } from 'zod';

export const jobActivityTypeSchema = z.enum([
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

export const jobActivityCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  type: jobActivityTypeSchema,
  actorCrewMemberId: z.string().uuid().optional().nullable(),
  payload: z.any().optional().nullable(),
});

export const jobActivityNoteSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  message: z.string().min(1),
});

export type CreateJobActivityInput = z.infer<typeof jobActivityCreateSchema>;
export type JobActivityType = z.infer<typeof jobActivityTypeSchema>;
