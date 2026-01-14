import { z } from 'zod';

export const buyerPipelineStagesUpdateSchema = z.object({
  orgId: z.string().uuid(),
  stages: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120),
      })
    )
    .min(1),
});

export type BuyerPipelineStagesUpdateInput = z.infer<typeof buyerPipelineStagesUpdateSchema>;
