import { z } from 'zod';

export const workTemplateStepSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const createWorkTemplateSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).nullable().optional(),
  jobTypeId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
  steps: z.array(workTemplateStepSchema).optional(),
});

export const updateWorkTemplateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  jobTypeId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
  steps: z.array(workTemplateStepSchema).optional(),
});

export type WorkTemplateStepInput = z.infer<typeof workTemplateStepSchema>;
export type CreateWorkTemplateInput = z.infer<typeof createWorkTemplateSchema>;
export type UpdateWorkTemplateInput = z.infer<typeof updateWorkTemplateSchema>;
