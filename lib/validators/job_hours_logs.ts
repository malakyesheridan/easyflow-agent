import { z } from 'zod';

export const jobHoursLogsListSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const jobHoursLogCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  minutes: z.number().int().min(1).max(24 * 60),
  crewMemberId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export type CreateJobHoursLogInput = z.infer<typeof jobHoursLogCreateSchema>;

