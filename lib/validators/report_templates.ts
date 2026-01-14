import { z } from 'zod';

export const reportTemplateUpdateSchema = z.object({
  orgId: z.string().uuid(),
  templateType: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  includeDemandSummary: z.boolean().optional(),
  includeActivitySummary: z.boolean().optional(),
  includeMarketOverview: z.boolean().optional(),
  commentaryTemplate: z.string().trim().max(2000).nullable().optional(),
});

export type ReportTemplateUpdateInput = z.infer<typeof reportTemplateUpdateSchema>;
