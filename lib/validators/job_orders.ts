import { z } from 'zod';

export const jobOrdersListSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const jobOrderCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  supplier: z.string().trim().max(200).nullable().optional(),
  item: z.string().trim().min(1).max(200),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  status: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const jobOrderUpdateSchema = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid(),
  supplier: z.string().trim().max(200).nullable().optional(),
  item: z.string().trim().min(1).max(200).optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  status: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const jobOrderDeleteSchema = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid(),
});

export type CreateJobOrderInput = z.infer<typeof jobOrderCreateSchema>;
export type UpdateJobOrderInput = z.infer<typeof jobOrderUpdateSchema>;

