import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { workTemplates, type WorkTemplate, type NewWorkTemplate } from '@/db/schema/work_templates';
import { workTemplateSteps, type WorkTemplateStep, type NewWorkTemplateStep } from '@/db/schema/work_template_steps';
import { ok, err, type Result } from '@/lib/result';
import {
  createWorkTemplateSchema,
  updateWorkTemplateSchema,
  type CreateWorkTemplateInput,
  type UpdateWorkTemplateInput,
} from '@/lib/validators/work_templates';

export async function createWorkTemplate(
  input: CreateWorkTemplateInput
): Promise<Result<WorkTemplate & { steps: WorkTemplateStep[] }>> {
  try {
    const validated = createWorkTemplateSchema.parse(input);
    const db = getDb();

    if (validated.isDefault) {
      await db
        .update(workTemplates)
        .set({ isDefault: false })
        .where(
          and(
            eq(workTemplates.orgId, validated.orgId),
            validated.jobTypeId ? eq(workTemplates.jobTypeId, validated.jobTypeId) : isNull(workTemplates.jobTypeId)
          )
        );
    }

    const newTemplate: NewWorkTemplate = {
      orgId: validated.orgId,
      name: validated.name.trim(),
      description: validated.description?.trim() || null,
      jobTypeId: validated.jobTypeId ?? null,
      isDefault: validated.isDefault ?? false,
    };

    const [template] = await db.insert(workTemplates).values(newTemplate).returning();
    if (!template) return err('INTERNAL_ERROR', 'Failed to create template');

    const stepsInput = validated.steps ?? [];
    const steps: WorkTemplateStep[] = [];
    if (stepsInput.length > 0) {
      const stepRows: NewWorkTemplateStep[] = stepsInput.map((step, index) => ({
        orgId: validated.orgId,
        templateId: template.id,
        title: step.title.trim(),
        description: step.description?.trim() || null,
        isRequired: step.isRequired ?? true,
        sortOrder: step.sortOrder ?? index,
      }));
      const createdSteps = await db.insert(workTemplateSteps).values(stepRows).returning();
      steps.push(...createdSteps);
    }

    return ok({ ...template, steps });
  } catch (error) {
    console.error('Error creating work template:', error);
    return err('INTERNAL_ERROR', 'Failed to create template', error);
  }
}

export async function updateWorkTemplate(
  input: UpdateWorkTemplateInput
): Promise<Result<WorkTemplate & { steps: WorkTemplateStep[] }>> {
  try {
    const validated = updateWorkTemplateSchema.parse(input);
    const db = getDb();

    const update: Partial<NewWorkTemplate> = {
      updatedAt: new Date(),
    };
    if (validated.name !== undefined) update.name = validated.name.trim();
    if (validated.description !== undefined) update.description = validated.description?.trim() || null;
    if (validated.jobTypeId !== undefined) update.jobTypeId = validated.jobTypeId ?? null;
    if (validated.isDefault !== undefined) update.isDefault = validated.isDefault;
    if (validated.archivedAt !== undefined) update.archivedAt = validated.archivedAt ? new Date(validated.archivedAt) : null;

    if (validated.isDefault) {
      await db
        .update(workTemplates)
        .set({ isDefault: false })
        .where(
          and(
            eq(workTemplates.orgId, validated.orgId),
            validated.jobTypeId ? eq(workTemplates.jobTypeId, validated.jobTypeId) : isNull(workTemplates.jobTypeId)
          )
        );
    }

    const [template] = await db
      .update(workTemplates)
      .set(update)
      .where(and(eq(workTemplates.id, validated.id), eq(workTemplates.orgId, validated.orgId)))
      .returning();

    if (!template) return err('NOT_FOUND', 'Template not found');

    let steps: WorkTemplateStep[] = [];
    if (validated.steps) {
      await db
        .delete(workTemplateSteps)
        .where(and(eq(workTemplateSteps.orgId, validated.orgId), eq(workTemplateSteps.templateId, validated.id)));

      if (validated.steps.length > 0) {
        const stepRows: NewWorkTemplateStep[] = validated.steps.map((step, index) => ({
          orgId: validated.orgId,
          templateId: validated.id,
          title: step.title.trim(),
          description: step.description?.trim() || null,
          isRequired: step.isRequired ?? true,
          sortOrder: step.sortOrder ?? index,
        }));
        steps = await db.insert(workTemplateSteps).values(stepRows).returning();
      }
    } else {
      steps = await db
        .select()
        .from(workTemplateSteps)
        .where(and(eq(workTemplateSteps.orgId, validated.orgId), eq(workTemplateSteps.templateId, validated.id)));
    }

    return ok({ ...template, steps });
  } catch (error) {
    console.error('Error updating work template:', error);
    return err('INTERNAL_ERROR', 'Failed to update template', error);
  }
}
