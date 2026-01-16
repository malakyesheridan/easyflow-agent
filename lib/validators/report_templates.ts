import { z } from 'zod';

export const reportTemplateSectionsSchema = z.record(z.boolean()).optional();
export const reportTemplatePromptsSchema = z.record(z.string().trim().max(500)).optional();

export const reportTemplateUpdateSchema = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid().optional(),
  templateType: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).nullable().optional(),
  isDefault: z.boolean().optional(),
  cadenceDefaultType: z.enum(['weekly', 'fortnightly', 'monthly', 'custom', 'none']).optional(),
  cadenceDefaultIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
  cadenceDefaultDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  includeDemandSummary: z.boolean().optional(),
  includeActivitySummary: z.boolean().optional(),
  includeMarketOverview: z.boolean().optional(),
  sectionsJson: reportTemplateSectionsSchema,
  promptsJson: reportTemplatePromptsSchema,
  commentaryTemplate: z.string().trim().max(2000).nullable().optional(),
});

export const reportTemplateCreateSchema = reportTemplateUpdateSchema.omit({ id: true });

export const reportTemplatePatchSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  isDefault: z.boolean().optional(),
  cadenceDefaultType: z.enum(['weekly', 'fortnightly', 'monthly', 'custom', 'none']).optional(),
  cadenceDefaultIntervalDays: z.number().int().min(1).max(365).nullable().optional(),
  cadenceDefaultDayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  includeDemandSummary: z.boolean().optional(),
  includeActivitySummary: z.boolean().optional(),
  includeMarketOverview: z.boolean().optional(),
  sectionsJson: reportTemplateSectionsSchema,
  promptsJson: reportTemplatePromptsSchema,
  commentaryTemplate: z.string().trim().max(2000).nullable().optional(),
});

export type ReportTemplateUpdateInput = z.infer<typeof reportTemplateUpdateSchema>;
export type ReportTemplateCreateInput = z.infer<typeof reportTemplateCreateSchema>;
export type ReportTemplatePatchInput = z.infer<typeof reportTemplatePatchSchema>;
