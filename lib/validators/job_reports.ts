import { z } from 'zod';

export const jobReportsListSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const jobReportCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  note: z.string().trim().min(1).max(10000),
});

export type CreateJobReportInput = z.infer<typeof jobReportCreateSchema>;

