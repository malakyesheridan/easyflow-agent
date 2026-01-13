import { and, eq } from 'drizzle-orm';
import { automationRules } from '@/db/schema/automation_rules';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { automationRuleCreateSchema, automationRuleUpdateSchema } from '@/lib/validators/automations';
import { ok, err, type Result } from '@/lib/result';
import type { AutomationRule } from '@/db/schema/automation_rules';

/**
 * Creates a new automation rule.
 */
export async function createAutomationRule(input: unknown): Promise<Result<AutomationRule>> {
  try {
    const validated = automationRuleCreateSchema.parse(input);
    const now = new Date();

    return await withAutomationOrgScope(
      { orgId: validated.orgId, userId: validated.createdByUserId ?? null, roleKey: 'system' },
      async (db) => {
        const [row] = await db
          .insert(automationRules)
          .values({
            orgId: validated.orgId,
            name: validated.name,
            description: validated.description ?? null,
            templateKey: validated.templateKey ?? null,
            isEnabled: validated.isEnabled ?? false,
            triggerType: validated.triggerType,
            triggerFilters: validated.triggerFilters ?? {},
            conditions: validated.conditions ?? [],
            actions: validated.actions,
            throttle: validated.throttle ?? null,
            createdByUserId: validated.createdByUserId ?? null,
            updatedByUserId: validated.updatedByUserId ?? validated.createdByUserId ?? null,
            version: validated.version ?? 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (!row) return err('INTERNAL_ERROR', 'Failed to create automation rule');
        return ok(row);
      }
    );
  } catch (error) {
    console.error('Error creating automation rule:', error);
    return err('INTERNAL_ERROR', 'Failed to create automation rule', error);
  }
}

/**
 * Updates an automation rule.
 */
export async function updateAutomationRule(input: unknown): Promise<Result<AutomationRule>> {
  try {
    const validated = automationRuleUpdateSchema.parse(input);
    const now = new Date();

    return await withAutomationOrgScope(
      { orgId: validated.orgId, userId: validated.updatedByUserId ?? null, roleKey: 'system' },
      async (db) => {
        const [existing] = await db
          .select()
          .from(automationRules)
          .where(and(eq(automationRules.orgId, validated.orgId), eq(automationRules.id, validated.id)))
          .limit(1);

        if (!existing) return err('NOT_FOUND', 'Automation rule not found');

        const updates: Partial<AutomationRule> = {
          updatedAt: now,
          updatedByUserId: validated.updatedByUserId ?? existing.updatedByUserId ?? null,
          version: (existing.version ?? 1) + 1,
        };

        if (validated.name !== undefined) updates.name = validated.name;
        if (validated.description !== undefined) updates.description = validated.description ?? null;
        if (validated.templateKey !== undefined) updates.templateKey = validated.templateKey ?? null;
        if (validated.isEnabled !== undefined) updates.isEnabled = validated.isEnabled;
        if (validated.triggerType !== undefined) updates.triggerType = validated.triggerType;
        if (validated.triggerFilters !== undefined) updates.triggerFilters = validated.triggerFilters ?? {};
        if (validated.conditions !== undefined) updates.conditions = validated.conditions ?? [];
        if (validated.actions !== undefined) updates.actions = validated.actions;
        if (validated.throttle !== undefined) updates.throttle = validated.throttle ?? null;
        if (validated.deletedAt !== undefined) {
          updates.deletedAt = validated.deletedAt ? new Date(validated.deletedAt) : null;
          updates.isEnabled = false;
        }

        const [row] = await db
          .update(automationRules)
          .set(updates)
          .where(and(eq(automationRules.orgId, validated.orgId), eq(automationRules.id, validated.id)))
          .returning();

        if (!row) return err('INTERNAL_ERROR', 'Failed to update automation rule');
        return ok(row);
      }
    );
  } catch (error) {
    console.error('Error updating automation rule:', error);
    return err('INTERNAL_ERROR', 'Failed to update automation rule', error);
  }
}

/**
 * Soft deletes an automation rule.
 */
export async function deleteAutomationRule(params: {
  orgId: string;
  id: string;
  userId?: string | null;
}): Promise<Result<AutomationRule>> {
  try {
    const now = new Date();
    return await withAutomationOrgScope(
      { orgId: params.orgId, userId: params.userId ?? null, roleKey: 'system' },
      async (db) => {
        const [row] = await db
          .update(automationRules)
          .set({
            deletedAt: now,
            isEnabled: false,
            updatedAt: now,
            updatedByUserId: params.userId ?? null,
          })
          .where(and(eq(automationRules.orgId, params.orgId), eq(automationRules.id, params.id)))
          .returning();
        if (!row) return err('NOT_FOUND', 'Automation rule not found');
        return ok(row);
      }
    );
  } catch (error) {
    console.error('Error deleting automation rule:', error);
    return err('INTERNAL_ERROR', 'Failed to delete automation rule', error);
  }
}
