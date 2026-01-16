import { and, eq, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { reportTemplates, type ReportTemplate, type NewReportTemplate } from '@/db/schema/report_templates';
import { ok, err, type Result } from '@/lib/result';
import {
  reportTemplateUpdateSchema,
  reportTemplateCreateSchema,
  reportTemplatePatchSchema,
  type ReportTemplateUpdateInput,
  type ReportTemplateCreateInput,
  type ReportTemplatePatchInput,
} from '@/lib/validators/report_templates';

function buildTemplateValues(validated: ReportTemplateUpdateInput | ReportTemplateCreateInput): NewReportTemplate {
  return {
    orgId: validated.orgId,
    templateType: validated.templateType,
    name: validated.name,
    description: validated.description ?? null,
    isDefault: validated.isDefault ?? false,
    cadenceDefaultType: validated.cadenceDefaultType ?? 'weekly',
    cadenceDefaultIntervalDays: validated.cadenceDefaultIntervalDays ?? null,
    cadenceDefaultDayOfWeek: validated.cadenceDefaultDayOfWeek ?? null,
    includeDemandSummary: validated.includeDemandSummary ?? true,
    includeActivitySummary: validated.includeActivitySummary ?? true,
    includeMarketOverview: validated.includeMarketOverview ?? true,
    sectionsJson: validated.sectionsJson ?? {},
    promptsJson: validated.promptsJson ?? {},
    commentaryTemplate: validated.commentaryTemplate === undefined ? null : validated.commentaryTemplate,
    updatedAt: new Date(),
  } as NewReportTemplate;
}

async function clearDefaultTemplate(orgId: string, templateType: string, excludeId?: string | null) {
  const db = getDb();
  const conditions = [
    eq(reportTemplates.orgId, orgId),
    eq(reportTemplates.templateType, templateType),
    excludeId ? ne(reportTemplates.id, excludeId) : undefined,
  ].filter(Boolean);

  await db.update(reportTemplates).set({ isDefault: false, updatedAt: new Date() }).where(and(...conditions));
}

export async function upsertReportTemplate(input: ReportTemplateUpdateInput): Promise<Result<ReportTemplate>> {
  try {
    const validated = reportTemplateUpdateSchema.parse(input);
    const db = getDb();

    const values = buildTemplateValues(validated);
    let row: ReportTemplate | undefined;

    if (validated.id) {
      const [updated] = await db
        .update(reportTemplates)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(reportTemplates.orgId, validated.orgId), eq(reportTemplates.id, validated.id)))
        .returning();
      row = updated;
    } else {
      const [existing] = await db
        .select()
        .from(reportTemplates)
        .where(and(eq(reportTemplates.orgId, validated.orgId), eq(reportTemplates.templateType, validated.templateType)))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(reportTemplates)
          .set({ ...values, updatedAt: new Date() })
          .where(and(eq(reportTemplates.orgId, validated.orgId), eq(reportTemplates.id, existing.id)))
          .returning();
        row = updated;
      } else {
        const [created] = await db
          .insert(reportTemplates)
          .values({ ...values, createdAt: new Date(), updatedAt: new Date(), isDefault: values.isDefault ?? true })
          .returning();
        row = created;
      }
    }

    if (!row) return err('INTERNAL_ERROR', 'Failed to update report template');
    if (row.isDefault) {
      await clearDefaultTemplate(row.orgId, row.templateType, String(row.id));
    }
    return ok(row);
  } catch (error) {
    console.error('Error updating report template:', error);
    return err('INTERNAL_ERROR', 'Failed to update report template', error);
  }
}

export async function createReportTemplate(input: ReportTemplateCreateInput): Promise<Result<ReportTemplate>> {
  try {
    const validated = reportTemplateCreateSchema.parse(input);
    const db = getDb();
    const values = buildTemplateValues(validated);
    const [row] = await db
      .insert(reportTemplates)
      .values({ ...values, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    if (!row) return err('INTERNAL_ERROR', 'Failed to create report template');
    if (row.isDefault) {
      await clearDefaultTemplate(row.orgId, row.templateType, String(row.id));
    }
    return ok(row);
  } catch (error) {
    console.error('Error creating report template:', error);
    return err('INTERNAL_ERROR', 'Failed to create report template', error);
  }
}

export async function updateReportTemplate(templateId: string, input: ReportTemplatePatchInput): Promise<Result<ReportTemplate>> {
  try {
    const validated = reportTemplatePatchSchema.parse(input);
    const db = getDb();
    const [existing] = await db
      .select()
      .from(reportTemplates)
      .where(and(eq(reportTemplates.orgId, validated.orgId), eq(reportTemplates.id, templateId)))
      .limit(1);
    if (!existing) return err('NOT_FOUND', 'Report template not found');

    const [row] = await db
      .update(reportTemplates)
      .set({
        name: validated.name ?? existing.name,
        description: validated.description ?? existing.description,
        isDefault: validated.isDefault ?? existing.isDefault,
        cadenceDefaultType: validated.cadenceDefaultType ?? existing.cadenceDefaultType,
        cadenceDefaultIntervalDays: validated.cadenceDefaultIntervalDays ?? existing.cadenceDefaultIntervalDays,
        cadenceDefaultDayOfWeek: validated.cadenceDefaultDayOfWeek ?? existing.cadenceDefaultDayOfWeek,
        includeDemandSummary: validated.includeDemandSummary ?? existing.includeDemandSummary,
        includeActivitySummary: validated.includeActivitySummary ?? existing.includeActivitySummary,
        includeMarketOverview: validated.includeMarketOverview ?? existing.includeMarketOverview,
        sectionsJson: validated.sectionsJson ?? (existing.sectionsJson as Record<string, boolean> | null) ?? {},
        promptsJson: validated.promptsJson ?? (existing.promptsJson as Record<string, string> | null) ?? {},
        commentaryTemplate: validated.commentaryTemplate ?? existing.commentaryTemplate,
        updatedAt: new Date(),
      })
      .where(and(eq(reportTemplates.orgId, validated.orgId), eq(reportTemplates.id, templateId)))
      .returning();

    if (!row) return err('INTERNAL_ERROR', 'Failed to update report template');
    if (row.isDefault) {
      await clearDefaultTemplate(row.orgId, row.templateType, String(row.id));
    }
    return ok(row);
  } catch (error) {
    console.error('Error updating report template:', error);
    return err('INTERNAL_ERROR', 'Failed to update report template', error);
  }
}

export async function deleteReportTemplate(templateId: string, orgId: string): Promise<Result<{ id: string }>> {
  try {
    const db = getDb();
    const [row] = await db
      .delete(reportTemplates)
      .where(and(eq(reportTemplates.orgId, orgId), eq(reportTemplates.id, templateId)))
      .returning({ id: reportTemplates.id });
    if (!row) return err('NOT_FOUND', 'Report template not found');
    return ok({ id: String(row.id) });
  } catch (error) {
    console.error('Error deleting report template:', error);
    return err('INTERNAL_ERROR', 'Failed to delete report template', error);
  }
}
