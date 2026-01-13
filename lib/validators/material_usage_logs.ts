import { z } from 'zod';

export const materialUsageLogCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  materialId: z.string().uuid(),
  taskId: z.string().uuid().nullable().optional(),
  quantityUsed: z.number().finite().positive(),
  notes: z.string().nullable().optional(),
});

export const materialUsageLogListSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type CreateMaterialUsageLogInput = z.infer<typeof materialUsageLogCreateSchema>;

