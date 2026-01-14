import { z } from 'zod';

export const matchingConfigUpdateSchema = z.object({
  orgId: z.string().uuid(),
  mode: z.enum(['suburb', 'zone']),
  budgetWeight: z.number().int().min(0).max(100),
  locationWeight: z.number().int().min(0).max(100),
  propertyTypeWeight: z.number().int().min(0).max(100),
  bedsBathsWeight: z.number().int().min(0).max(100),
  timeframeWeight: z.number().int().min(0).max(100),
  hotMatchThreshold: z.number().int().min(0).max(100),
  goodMatchThreshold: z.number().int().min(0).max(100),
});

export type MatchingConfigUpdateInput = z.infer<typeof matchingConfigUpdateSchema>;
