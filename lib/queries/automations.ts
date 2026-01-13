import { and, desc, eq, inArray, isNull, lt, gte, lte, or } from 'drizzle-orm';
import { automationRules } from '@/db/schema/automation_rules';
import { automationRuns } from '@/db/schema/automation_runs';
import { automationActionsOutbox } from '@/db/schema/automation_actions_outbox';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { ok, err, type Result } from '@/lib/result';
import type { AutomationRule, AutomationRun, AutomationActionOutbox } from '@/db/schema';

type RunStatus = AutomationRun['status'];

/**
 * Lists automation rules for an organization.
 */
export async function listAutomationRules(params: { orgId: string }): Promise<Result<AutomationRule[]>> {
  try {
    return await withAutomationOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const rows = await db
        .select()
        .from(automationRules)
        .where(
          and(
            eq(automationRules.orgId, params.orgId),
            isNull(automationRules.deletedAt),
            or(eq(automationRules.triggerKey, ''), isNull(automationRules.triggerKey))
          )
        )
        .orderBy(desc(automationRules.createdAt));
      return ok(rows);
    });
  } catch (error) {
    console.error('Error listing automation rules:', error);
    return err('INTERNAL_ERROR', 'Failed to list automation rules', error);
  }
}

/**
 * Retrieves a single automation rule by ID.
 */
export async function getAutomationRuleById(params: { orgId: string; id: string }): Promise<Result<AutomationRule>> {
  try {
    return await withAutomationOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const [row] = await db
        .select()
        .from(automationRules)
        .where(
          and(
            eq(automationRules.orgId, params.orgId),
            eq(automationRules.id, params.id),
            or(eq(automationRules.triggerKey, ''), isNull(automationRules.triggerKey))
          )
        )
        .limit(1);
      if (!row || row.deletedAt) return err('NOT_FOUND', 'Automation rule not found');
      return ok(row);
    });
  } catch (error) {
    console.error('Error getting automation rule:', error);
    return err('INTERNAL_ERROR', 'Failed to get automation rule', error);
  }
}

/**
 * Lists automation runs with optional filters.
 */
export async function listAutomationRuns(params: {
  orgId: string;
  ruleId?: string;
  eventId?: string;
  status?: RunStatus;
  limit?: number;
  cursor?: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<Result<AutomationRun[]>> {
  try {
    const limit = Math.min(params.limit ?? 50, 200);
    return await withAutomationOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const filters = [eq(automationRuns.orgId, params.orgId)];
      if (params.ruleId) filters.push(eq(automationRuns.ruleId, params.ruleId));
      if (params.eventId) filters.push(eq(automationRuns.eventId, params.eventId));
      if (params.status) filters.push(eq(automationRuns.status, params.status));
      if (params.cursor) {
        const cursorDate = new Date(params.cursor);
        if (!Number.isNaN(cursorDate.getTime())) {
          filters.push(lt(automationRuns.createdAt, cursorDate));
        }
      }
      if (params.startDate) filters.push(gte(automationRuns.createdAt, params.startDate));
      if (params.endDate) filters.push(lte(automationRuns.createdAt, params.endDate));

      const rows = await db
        .select()
        .from(automationRuns)
        .where(and(...filters))
        .orderBy(desc(automationRuns.createdAt))
        .limit(limit);
      return ok(rows);
    });
  } catch (error) {
    console.error('Error listing automation runs:', error);
    return err('INTERNAL_ERROR', 'Failed to list automation runs', error);
  }
}

/**
 * Gets a run with its outbox actions.
 */
export async function getAutomationRunWithActions(params: {
  orgId: string;
  runId: string;
}): Promise<Result<{ run: AutomationRun; actions: AutomationActionOutbox[] }>> {
  try {
    return await withAutomationOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const [run] = await db
        .select()
        .from(automationRuns)
        .where(and(eq(automationRuns.orgId, params.orgId), eq(automationRuns.id, params.runId)))
        .limit(1);
      if (!run) return err('NOT_FOUND', 'Automation run not found');

      const actions = await db
        .select()
        .from(automationActionsOutbox)
        .where(and(eq(automationActionsOutbox.orgId, params.orgId), eq(automationActionsOutbox.runId, params.runId)))
        .orderBy(desc(automationActionsOutbox.createdAt));

      return ok({ run, actions });
    });
  } catch (error) {
    console.error('Error getting automation run:', error);
    return err('INTERNAL_ERROR', 'Failed to get automation run', error);
  }
}

/**
 * Lists automation runs for a set of rule IDs.
 */
export async function listLatestRunsForRules(params: {
  orgId: string;
  ruleIds: string[];
}): Promise<Result<AutomationRun[]>> {
  try {
    if (params.ruleIds.length === 0) return ok([]);
    return await withAutomationOrgScope({ orgId: params.orgId, roleKey: 'system' }, async (db) => {
      const rows = await db
        .select()
        .from(automationRuns)
        .where(and(eq(automationRuns.orgId, params.orgId), inArray(automationRuns.ruleId, params.ruleIds)))
        .orderBy(desc(automationRuns.createdAt));
      return ok(rows);
    });
  } catch (error) {
    console.error('Error listing latest runs:', error);
    return err('INTERNAL_ERROR', 'Failed to list automation runs', error);
  }
}
