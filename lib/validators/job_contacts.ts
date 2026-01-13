import { z } from 'zod';

export const jobContactCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const jobContactUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().min(1).optional(),
  role: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const jobContactDeleteSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

export type CreateJobContactInput = z.infer<typeof jobContactCreateSchema>;
export type UpdateJobContactInput = z.infer<typeof jobContactUpdateSchema>;

