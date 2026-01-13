import { z } from 'zod';

export const jobInstallModifierStateSchema = z.object({
  modifierId: z.string().uuid(),
  enabled: z.boolean(),
});

export const jobInstallModifiersUpdateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  modifiers: z.array(jobInstallModifierStateSchema),
});

export type JobInstallModifierState = z.infer<typeof jobInstallModifierStateSchema>;
export type JobInstallModifiersUpdateInput = z.infer<typeof jobInstallModifiersUpdateSchema>;
