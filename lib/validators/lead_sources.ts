import { z } from 'zod';

export const leadSourcesUpdateSchema = z.object({
  orgId: z.string().uuid(),
  sources: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120),
      })
    )
    .min(1),
});

export type LeadSourcesUpdateInput = z.infer<typeof leadSourcesUpdateSchema>;
