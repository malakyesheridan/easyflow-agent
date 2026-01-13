import { z } from 'zod';

export const installModifierBaseSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().trim().max(200).nullable().optional(),
  multiplier: z.number().positive().max(5),
  enabled: z.boolean().optional(),
});

export const createInstallModifierSchema = installModifierBaseSchema;

export const updateInstallModifierSchema = installModifierBaseSchema
  .extend({
    id: z.string().uuid(),
  })
  .partial({
    name: true,
    description: true,
    multiplier: true,
    enabled: true,
  });

export type CreateInstallModifierInput = z.infer<typeof createInstallModifierSchema>;
export type UpdateInstallModifierInput = z.infer<typeof updateInstallModifierSchema>;
