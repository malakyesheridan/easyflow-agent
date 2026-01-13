import { and, eq } from 'drizzle-orm';
import { appEvents } from '@/db/schema/app_events';
import { automationRules } from '@/db/schema/automation_rules';
import { automationRuleRuns } from '@/db/schema/automation_rule_runs';
import { orgSettings } from '@/db/schema/org_settings';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { getDb } from '@/lib/db';
import { evaluateRuleConditions } from './evaluator';
import { buildActionPreviews, executeRuleActions } from './executor';
import { buildEventEntityId, buildIdempotencyKey, resolveTriggerKey } from './idempotency';
import { checkRuleRateLimit } from './rateLimit';
import type { AutomationRuleDraft, RuleAction, RuleCondition, TriggerKey } from './types';
import { ruleInputSchema } from './validation';

const JOB_CONTEXT_TRIGGERS = new Set<TriggerKey>([
  'job.created',
  'job.assigned',
  'job.rescheduled',
  'job.status_updated',
  'job.progress_updated',
  'job.completed',
  'job.photo_added',
  'job.notes_updated',
]);

const MATERIAL_CONTEXT_TRIGGERS = new Set<TriggerKey>(['material.stock_low', 'material.stock_updated']);

type DbClient = ReturnType<typeof getDb>;

type NormalizedRule = {
  id: string;
  name: string;
  triggerKey: TriggerKey;
  triggerVersion: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
};

function normalizeRule(row: typeof automationRules.$inferSelect): NormalizedRule | null {
  const input: AutomationRuleDraft = {
    name: row.name,
    description: row.description ?? null,
    triggerKey: row.triggerKey as TriggerKey,
    triggerVersion: row.triggerVersion ?? 1,
    conditions: Array.isArray(row.conditionsJson) ? (row.conditionsJson as RuleCondition[]) : [],
    actions: Array.isArray(row.actionsJson) ? (row.actionsJson as RuleAction[]) : [],
  };

  const parsed = ruleInputSchema.safeParse(input);
  if (!parsed.success) {
    console.error('Invalid automation rule payload:', { ruleId: row.id, error: parsed.error });
    return null;
  }

  return {
    id: row.id,
    name: parsed.data.name,
    triggerKey: parsed.data.triggerKey,
    triggerVersion: parsed.data.triggerVersion ?? 1,
    conditions: parsed.data.conditions ?? [],
    actions: parsed.data.actions,
  };
}

async function loadOrgAutomationDisabled(db: DbClient, orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ disabled: orgSettings.automationsDisabled })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .limit(1);
  return Boolean(row?.disabled ?? false);
}

function ensureEventContext(triggerKey: TriggerKey, payload: Record<string, unknown>): string | null {
  if (JOB_CONTEXT_TRIGGERS.has(triggerKey)) {
    if (typeof payload.jobId !== 'string') return 'Job context is required but jobId is missing.';
  }
  if (MATERIAL_CONTEXT_TRIGGERS.has(triggerKey)) {
    if (typeof payload.materialId !== 'string') return 'Material context is required but materialId is missing.';
  }
  return null;
}

export async function processAutomationRuleEventNow(orgId: string, appEventId: string): Promise<void> {
  await withAutomationOrgScope({ orgId, roleKey: 'system' }, async (db) => {
    const [eventRow] = await db
      .select()
      .from(appEvents)
      .where(eq(appEvents.id, appEventId))
      .limit(1);
    if (!eventRow) return;

    const triggerKey = resolveTriggerKey(eventRow.eventType);
    if (!triggerKey) return;

    const disabled = await loadOrgAutomationDisabled(db, orgId);
    if (disabled) return;

    const rules = await db
      .select()
      .from(automationRules)
      .where(and(eq(automationRules.orgId, orgId), eq(automationRules.enabled, true), eq(automationRules.triggerKey, triggerKey)))
      .orderBy(automationRules.createdAt);

    if (rules.length === 0) return;

    const payload = (eventRow.payload ?? {}) as Record<string, unknown>;
    const now = new Date();

    for (const row of rules) {
      const normalized = normalizeRule(row);
      if (!normalized) continue;

      let runId: string | null = null;

      try {
        const contextError = ensureEventContext(normalized.triggerKey, payload);
        const eventEntityId = buildEventEntityId({
          triggerKey: normalized.triggerKey,
          payload,
          eventCreatedAt: eventRow.createdAt ?? now,
        });
        const idempotencyKey = buildIdempotencyKey({ orgId, ruleId: normalized.id, eventEntityId });

        const [runRow] = await db
          .insert(automationRuleRuns)
          .values({
            orgId,
            ruleId: normalized.id,
            eventId: eventRow.id,
            eventKey: normalized.triggerKey,
            eventPayload: payload,
            matched: false,
            matchDetails: {},
            status: 'queued',
            startedAt: now,
            idempotencyKey,
            rateLimited: false,
            createdAt: now,
          })
          .onConflictDoNothing({ target: [automationRuleRuns.idempotencyKey] })
          .returning({ id: automationRuleRuns.id });

        runId = runRow?.id ?? null;
        if (!runId) continue;

        if (contextError) {
          await db
            .update(automationRuleRuns)
            .set({
              status: 'failed',
              error: contextError,
              finishedAt: new Date(),
              matched: false,
            })
            .where(eq(automationRuleRuns.id, runId));
          continue;
        }

        const evaluation = await evaluateRuleConditions({
          db,
          orgId,
          triggerKey: normalized.triggerKey,
          conditions: normalized.conditions,
          event: {
            id: eventRow.id,
            orgId,
            eventType: eventRow.eventType,
            payload,
            createdAt: eventRow.createdAt,
            actorUserId: eventRow.actorUserId,
          },
        });

        await db
          .update(automationRuleRuns)
          .set({
            matched: evaluation.matched,
            matchDetails: evaluation.matchDetails,
          })
          .where(eq(automationRuleRuns.id, runId));

        if (evaluation.error) {
          await db
            .update(automationRuleRuns)
            .set({
              status: 'failed',
              error: evaluation.error,
              finishedAt: new Date(),
              matched: false,
            })
            .where(eq(automationRuleRuns.id, runId));
          continue;
        }

        if (!evaluation.matched) {
          await db
            .update(automationRuleRuns)
            .set({ status: 'skipped', finishedAt: new Date() })
            .where(eq(automationRuleRuns.id, runId));
          continue;
        }

        const rateLimit = await checkRuleRateLimit({ db, orgId, ruleId: normalized.id, now });
        if (rateLimit.limited) {
          await db
            .update(automationRuleRuns)
            .set({
              status: 'rate_limited',
              rateLimited: true,
              finishedAt: new Date(),
            })
            .where(eq(automationRuleRuns.id, runId));
          continue;
        }

        await db
          .update(automationRuleRuns)
          .set({ status: 'running', startedAt: new Date() })
          .where(eq(automationRuleRuns.id, runId));

        const actionResult = await executeRuleActions({
          db,
          exec: {
            orgId,
            runId,
            ruleId: normalized.id,
            ruleName: normalized.name,
            triggerKey: normalized.triggerKey,
            event: {
              id: eventRow.id,
              payload,
              createdAt: eventRow.createdAt,
              actorUserId: eventRow.actorUserId,
            },
            context: evaluation.context,
          },
          actions: normalized.actions,
          auditContext: { actorUserId: eventRow.actorUserId ?? null },
        });

        if (!actionResult.ok) {
          await db
            .update(automationRuleRuns)
            .set({
              status: 'failed',
              error: actionResult.error ?? 'Action failed',
              errorDetails: actionResult.errorDetails ?? null,
              finishedAt: new Date(),
            })
            .where(eq(automationRuleRuns.id, runId));
          continue;
        }

        await db
          .update(automationRuleRuns)
          .set({ status: 'succeeded', finishedAt: new Date() })
          .where(eq(automationRuleRuns.id, runId));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Automation rule failed';
        const errorDetails =
          error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) };

        if (runId) {
          await db
            .update(automationRuleRuns)
            .set({
              status: 'failed',
              error: message,
              errorDetails,
              finishedAt: new Date(),
            })
            .where(eq(automationRuleRuns.id, runId));
        }

        console.error('Automation rule execution failed', {
          ruleId: normalized.id,
          eventId: eventRow.id,
          error,
        });
      }
    }
  });
}

export async function runAutomationRuleDryRun(params: {
  db: DbClient;
  orgId: string;
  rule: NormalizedRule;
  event: { id: string; eventType: string; payload: Record<string, unknown>; createdAt?: Date | null; actorUserId?: string | null };
}): Promise<{
  matched: boolean;
  matchDetails: { conditions: Array<{ condition: RuleCondition; passed: boolean; evaluatedValue: unknown }> };
  actionPreviews: Array<Record<string, unknown>>;
  warnings: string[];
  error?: string;
}> {
  const payload = params.event.payload ?? {};
  const contextError = ensureEventContext(params.rule.triggerKey, payload);
  if (contextError) {
    return {
      matched: false,
      matchDetails: { conditions: [] },
      actionPreviews: [],
      warnings: [contextError],
      error: contextError,
    };
  }

  const evaluation = await evaluateRuleConditions({
    db: params.db,
    orgId: params.orgId,
    triggerKey: params.rule.triggerKey,
    conditions: params.rule.conditions,
    event: {
      id: params.event.id,
      orgId: params.orgId,
      eventType: params.event.eventType,
      payload,
      createdAt: params.event.createdAt ?? new Date(),
      actorUserId: params.event.actorUserId ?? null,
    },
  });

  if (evaluation.error) {
    return {
      matched: false,
      matchDetails: evaluation.matchDetails,
      actionPreviews: [],
      warnings: [evaluation.error],
      error: evaluation.error,
    };
  }

  const actionPreviews = await buildActionPreviews({
    db: params.db,
    orgId: params.orgId,
    ruleName: params.rule.name,
    triggerKey: params.rule.triggerKey,
    runId: params.event.id,
    actions: params.rule.actions,
    context: evaluation.context as any,
    eventPayload: payload,
  });

  return {
    matched: evaluation.matched,
    matchDetails: evaluation.matchDetails,
    actionPreviews,
    warnings: [],
  };
}

export function normalizeRuleForDryRun(input: AutomationRuleDraft & { id: string }): NormalizedRule | null {
  const parsed = ruleInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    id: input.id,
    name: parsed.data.name,
    triggerKey: parsed.data.triggerKey,
    triggerVersion: parsed.data.triggerVersion ?? 1,
    conditions: parsed.data.conditions ?? [],
    actions: parsed.data.actions,
  };
}
