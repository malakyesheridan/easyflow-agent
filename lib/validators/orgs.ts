import { z } from 'zod';

export const orgUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  logoPath: z.string().trim().min(1).max(500).nullable().optional(),
  brandPrimaryColor: z.string().trim().min(1).max(20).nullable().optional(),
  brandSecondaryColor: z.string().trim().min(1).max(20).nullable().optional(),
  onboardingCompleted: z.boolean().optional(),
  onboardingStep: z.number().int().min(1).max(6).optional(),
});

export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;
