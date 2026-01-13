import { z } from 'zod';

export const jobMaterialAllocationCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  materialId: z.string().uuid(),
  plannedQuantity: z.number().finite().positive(),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const jobMaterialAllocationUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  plannedQuantity: z.number().finite().positive().optional(),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const jobMaterialAllocationDeleteSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

export type CreateJobMaterialAllocationInput = z.infer<typeof jobMaterialAllocationCreateSchema>;
export type UpdateJobMaterialAllocationInput = z.infer<typeof jobMaterialAllocationUpdateSchema>;
