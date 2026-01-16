import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { reportTemplates, type ReportTemplate } from '@/db/schema/report_templates';
import { ok, err, type Result } from '@/lib/result';

export async function listReportTemplates(params: {
  orgId: string;
  templateType?: string | null;
}): Promise<Result<ReportTemplate[]>> {
  try {
    const db = getDb();
    const where = params.templateType
      ? and(eq(reportTemplates.orgId, params.orgId), eq(reportTemplates.templateType, params.templateType))
      : eq(reportTemplates.orgId, params.orgId);

    const data = await db
      .select()
      .from(reportTemplates)
      .where(where)
      .orderBy(desc(reportTemplates.isDefault), asc(reportTemplates.createdAt));

    return ok(data);
  } catch (error) {
    console.error('Error listing report templates:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch report templates', error);
  }
}
