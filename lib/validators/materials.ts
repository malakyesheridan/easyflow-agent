import { z } from 'zod';

export const materialCreateSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1),
  category: z.string().nullable().optional(),
  unit: z.string().min(1),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  reorderThreshold: z.number().finite().nullable().optional(),
  reorderQuantity: z.number().finite().nullable().optional(),
});

export const materialUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().min(1).optional(),
  category: z.string().nullable().optional(),
  unit: z.string().min(1).optional(),
  unitCostCents: z.number().int().min(0).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  reorderThreshold: z.number().finite().nullable().optional(),
  reorderQuantity: z.number().finite().nullable().optional(),
});

export const materialDeleteSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

export type CreateMaterialInput = z.infer<typeof materialCreateSchema>;
export type UpdateMaterialInput = z.infer<typeof materialUpdateSchema>;
