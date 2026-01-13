import { z } from 'zod';

export const inventoryEventTypeSchema = z.enum([
  'stock_added',
  'manual_adjustment',
  'job_consumed',
  'stocktake',
]);

export const materialInventoryEventCreateSchema = z.object({
  orgId: z.string().uuid(),
  materialId: z.string().uuid(),
  eventType: inventoryEventTypeSchema,
  quantity: z.number().finite(),
  reason: z.string().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
});

export const materialInventoryEventListSchema = z.object({
  orgId: z.string().uuid(),
  materialId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type CreateMaterialInventoryEventInput = z.infer<typeof materialInventoryEventCreateSchema>;

