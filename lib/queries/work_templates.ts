import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { workTemplates } from '@/db/schema/work_templates';
import { workTemplateSteps } from '@/db/schema/work_template_steps';
import { ok, err, type Result } from '@/lib/result';
import type { WorkTemplate } from '@/db/schema/work_templates';
import type { WorkTemplateStep } from '@/db/schema/work_template_steps';

export type WorkTemplateWithSteps = WorkTemplate & { steps: WorkTemplateStep[] };

export async function listWorkTemplates(params: {
  orgId: string;
  includeSteps?: boolean;
  includeArchived?: boolean;
}): Promise<Result<WorkTemplateWithSteps[] | WorkTemplate[]>> {
  try {
    const db = getDb();
    const where = params.includeArchived
      ? eq(workTemplates.orgId, params.orgId)
      : and(eq(workTemplates.orgId, params.orgId), isNull(workTemplates.archivedAt));

    const templates = await db
      .select()
      .from(workTemplates)
      .where(where)
      .orderBy(asc(workTemplates.name));

    if (!params.includeSteps) return ok(templates);

    const ids = templates.map((t) => t.id);
    if (ids.length === 0) return ok([]);

    const steps = await db
      .select()
      .from(workTemplateSteps)
      .where(and(eq(workTemplateSteps.orgId, params.orgId), inArray(workTemplateSteps.templateId, ids)))
      .orderBy(asc(workTemplateSteps.sortOrder));

    const stepsByTemplate = new Map<string, WorkTemplateStep[]>();
    steps.forEach((step) => {
      const arr = stepsByTemplate.get(step.templateId) ?? [];
      arr.push(step);
      stepsByTemplate.set(step.templateId, arr);
    });

    return ok(
      templates.map((template) => ({
        ...template,
        steps: stepsByTemplate.get(template.id) ?? [],
      }))
    );
  } catch (error) {
    console.error('Error listing work templates:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch templates', error);
  }
}
