import { z } from 'zod';

export const jobCostTypeSchema = z.enum(['labour', 'material', 'subcontract', 'other', 'travel']);
export const jobCostSourceSchema = z.enum(['auto', 'manual']);

export const jobCostCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  costType: jobCostTypeSchema,
  referenceId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  quantity: z.number().finite().positive().nullable().optional(),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  totalCostCents: z.number().int().min(0).nullable().optional(),
  source: jobCostSourceSchema.optional(),
});

export const jobCostUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  costType: jobCostTypeSchema.optional(),
  referenceId: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  quantity: z.number().finite().positive().nullable().optional(),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  totalCostCents: z.number().int().min(0).nullable().optional(),
});

export const jobCostDeleteSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

export type CreateJobCostInput = z.infer<typeof jobCostCreateSchema>;
export type UpdateJobCostInput = z.infer<typeof jobCostUpdateSchema>;
