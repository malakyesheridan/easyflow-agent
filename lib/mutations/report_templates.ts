import { getDb } from '@/lib/db';
import { reportTemplates, type ReportTemplate, type NewReportTemplate } from '@/db/schema/report_templates';
import { ok, err, type Result } from '@/lib/result';
import { reportTemplateUpdateSchema, type ReportTemplateUpdateInput } from '@/lib/validators/report_templates';

export async function upsertReportTemplate(input: ReportTemplateUpdateInput): Promise<Result<ReportTemplate>> {
  try {
    const validated = reportTemplateUpdateSchema.parse(input);
    const db = getDb();

    const values: NewReportTemplate = {
      orgId: validated.orgId,
      templateType: validated.templateType,
      name: validated.name,
      includeDemandSummary: validated.includeDemandSummary ?? true,
      includeActivitySummary: validated.includeActivitySummary ?? true,
      includeMarketOverview: validated.includeMarketOverview ?? true,
      commentaryTemplate: validated.commentaryTemplate === undefined ? null : validated.commentaryTemplate,
      updatedAt: new Date(),
    } as NewReportTemplate;

    const [row] = await db
      .insert(reportTemplates)
      .values({ ...values, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [reportTemplates.orgId, reportTemplates.templateType],
        set: { ...values, updatedAt: new Date() },
      })
      .returning();

    if (!row) return err('INTERNAL_ERROR', 'Failed to update report template');
    return ok(row);
  } catch (error) {
    console.error('Error updating report template:', error);
    return err('INTERNAL_ERROR', 'Failed to update report template', error);
  }
}
