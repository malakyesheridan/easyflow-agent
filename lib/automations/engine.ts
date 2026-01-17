import { and, asc, eq, gte, isNull, sql } from 'drizzle-orm';
import { appEvents } from '@/db/schema/app_events';
import { automationRules } from '@/db/schema/automation_rules';
import { automationRuns } from '@/db/schema/automation_runs';
import { automationActionsOutbox } from '@/db/schema/automation_actions_outbox';
import type { NewAutomationActionOutbox } from '@/db/schema/automation_actions_outbox';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { resolveAutomationContext, type AutomationContext } from '@/lib/automations/context';
import { evaluateConditions } from '@/lib/automations/conditions';
import { AUTOMATIONS_ENABLED, AUTOMATIONS_MAX_ACTIONS_PER_MINUTE, AUTOMATIONS_MAX_LINEAGE_DEPTH } from '@/lib/automations/constants';
import { automationActionSchema, automationThrottleSchema, conditionNodeSchema } from '@/lib/validators/automations';
import type { ConditionNode, AutomationActionNode, AutomationRuleInput, AutomationThrottle, AutomationLogEntry } from '@/lib/automations/types';
import { getValueByPath } from '@/lib/automations/utils';
import { getDb } from '@/lib/db';

type AutomationRuleRow = typeof automationRules.$inferSelect;
type DbClient = ReturnType<typeof getDb>;

type NormalizedAutomationRule = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  triggerType: string;
  triggerFilters: Record<string, unknown>;
  conditions: ConditionNode[];
  actions: AutomationActionNode[];
  throttle: AutomationThrottle | null;
  version: number;
};

type LineageInfo = {
  parentEventId: string | null;
  depth: number;
};

function buildLogEntry(message: string, level: AutomationLogEntry['level'], data?: Record<string, unknown>): AutomationLogEntry {
  return {
    at: new Date().toISOString(),
    level,
    message,
    data,
  };
}

function extractLineage(payload: Record<string, unknown>): LineageInfo {
  const automation = payload.automation as Record<string, unknown> | undefined;
  const parentEventId = typeof automation?.parentEventId === 'string' ? automation.parentEventId : null;
  const depth = typeof automation?.depth === 'number' && Number.isFinite(automation.depth) ? automation.depth : 0;
  return { parentEventId, depth };
}

export function normalizeRuleRow(row: AutomationRuleRow): NormalizedAutomationRule | null {
  const triggerFilters =
    row.triggerFilters && typeof row.triggerFilters === 'object' && !Array.isArray(row.triggerFilters)
      ? (row.triggerFilters as Record<string, unknown>)
      : {};

  const rawConditions = Array.isArray(row.conditions) ? row.conditions : [];
  const conditionsResult = conditionNodeSchema.array().safeParse(rawConditions);
  if (!conditionsResult.success) {
    console.error('Invalid automation conditions:', { ruleId: row.id, error: conditionsResult.error });
    return null;
  }

  const rawActions = Array.isArray(row.actions) ? row.actions : [];
  const actions: AutomationActionNode[] = [];

  rawActions.forEach((action, index) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) return;
    const actionRecord = action as Record<string, unknown>;
    const idValue = typeof actionRecord.id === 'string' ? actionRecord.id : `action-${index + 1}`;
    const normalized = { ...actionRecord, id: idValue };
    const parsed = automationActionSchema.safeParse(normalized);
    if (parsed.success) {
      actions.push(parsed.data as AutomationActionNode);
    } else {
      console.error('Invalid automation action:', { ruleId: row.id, error: parsed.error });
    }
  });

  const throttleResult = row.throttle ? automationThrottleSchema.safeParse(row.throttle) : null;
  const throttle = throttleResult?.success ? throttleResult.data : null;

  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    description: row.description ?? null,
    isEnabled: row.isEnabled,
    triggerType: row.triggerType,
    triggerFilters,
    conditions: conditionsResult.data as ConditionNode[],
    actions,
    throttle,
    version: row.version ?? 1,
  };
}

export function matchTriggerFilters(filters: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  const entries = Object.entries(filters);
  if (entries.length === 0) return true;

  for (const [key, expected] of entries) {
    const actual = getValueByPath(payload, key);
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
      continue;
    }
    if (actual !== expected) return false;
  }

  return true;
}

function resolveEntityInfo(context: AutomationContext, payload: Record<string, unknown>): {
  entityType: string | null;
  entityId: string | null;
} {
  const assignmentId = typeof payload.assignmentId === 'string' ? payload.assignmentId : null;
  const jobId = typeof payload.jobId === 'string' ? payload.jobId : null;
  const materialId = typeof payload.materialId === 'string' ? payload.materialId : null;
  const contactId = typeof payload.contactId === 'string' ? payload.contactId : null;
  const appraisalId = typeof payload.appraisalId === 'string' ? payload.appraisalId : null;
  const listingId = typeof payload.listingId === 'string' ? payload.listingId : null;
  const reportId = typeof payload.reportId === 'string' ? payload.reportId : null;

  if (reportId) return { entityType: 'report', entityId: reportId };
  if (listingId) return { entityType: 'listing', entityId: listingId };
  if (appraisalId) return { entityType: 'appraisal', entityId: appraisalId };
  if (contactId) return { entityType: 'contact', entityId: contactId };
  if (assignmentId) return { entityType: 'schedule_assignment', entityId: assignmentId };
  if (jobId) return { entityType: 'job', entityId: jobId };
  if (materialId) return { entityType: 'material', entityId: materialId };
  if (context.report && typeof (context.report as any).id === 'string') {
    return { entityType: 'report', entityId: (context.report as any).id };
  }
  if (context.listing && typeof (context.listing as any).id === 'string') {
    return { entityType: 'listing', entityId: (context.listing as any).id };
  }
  if (context.appraisal && typeof (context.appraisal as any).id === 'string') {
    return { entityType: 'appraisal', entityId: (context.appraisal as any).id };
  }
  if (context.contact && typeof (context.contact as any).id === 'string') {
    return { entityType: 'contact', entityId: (context.contact as any).id };
  }
  if (context.assignment && typeof context.assignment.id === 'string') {
    return { entityType: 'schedule_assignment', entityId: context.assignment.id };
  }
  if (context.job && typeof context.job.id === 'string') {
    return { entityType: 'job', entityId: context.job.id };
  }
  if (context.material && typeof context.material.id === 'string') {
    return { entityType: 'material', entityId: context.material.id };
  }

  return { entityType: null, entityId: null };
}

function sanitizeSnapshot(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSnapshot(item));
  }
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, sanitizeSnapshot(val)] as const);
  return Object.fromEntries(entries);
}

async function checkOrgRateLimit(params: { db: DbClient; orgId: string; now: Date }): Promise<boolean> {
  const windowStart = new Date(params.now.getTime() - 60 * 1000);
  const [row] = await params.db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(automationActionsOutbox)
    .where(and(eq(automationActionsOutbox.orgId, params.orgId), gte(automationActionsOutbox.createdAt, windowStart)));
  const count = Number(row?.count ?? 0);
  return count >= AUTOMATIONS_MAX_ACTIONS_PER_MINUTE;
}

async function isThrottled(params: {
  db: DbClient;
  orgId: string;
  ruleId: string;
  throttle: AutomationThrottle;
  entityId: string | null;
  jobId: string | null;
  now: Date;
}): Promise<boolean> {
  const windowStart = new Date(params.now.getTime() - params.throttle.windowHours * 60 * 60 * 1000);
  let conditions = and(
    eq(automationRuns.orgId, params.orgId),
    eq(automationRuns.ruleId, params.ruleId),
    gte(automationRuns.createdAt, windowStart)
  );

  if (params.throttle.scope === 'entity' && params.entityId) {
    conditions = and(conditions, eq(automationRuns.entityId, params.entityId));
  }
  if (params.throttle.scope === 'job' && params.jobId) {
    conditions = and(conditions, eq(automationRuns.entityId, params.jobId));
  }

  const [row] = await params.db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(automationRuns)
    .where(conditions);
  const count = Number(row?.count ?? 0);
  return count >= params.throttle.maxPerWindow;
}

/**
 * Processes an app event against automation rules and enqueues actions.
 */
export async function processAutomationEventNow(orgId: string, appEventId: string): Promise<void> {
  if (!AUTOMATIONS_ENABLED) return;

  await withAutomationOrgScope({ orgId, roleKey: 'system' }, async (db) => {
    const [eventRow] = await db
      .select()
      .from(appEvents)
      .where(eq(appEvents.id, appEventId))
      .limit(1);
    if (!eventRow) return;

    const payload = (eventRow.payload ?? {}) as Record<string, unknown>;
    const lineage = extractLineage(payload);
    if (lineage.depth >= AUTOMATIONS_MAX_LINEAGE_DEPTH) {
      return;
    }

    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.orgId, orgId),
          eq(automationRules.isEnabled, true),
          eq(automationRules.triggerType, eventRow.eventType),
          isNull(automationRules.deletedAt)
        )
      )
      .orderBy(asc(automationRules.createdAt));

    if (rules.length === 0) return;

    let context: AutomationContext | null = null;
    const ensureContext = async () => {
      if (!context) {
        context = await resolveAutomationContext({ db, orgId, event: eventRow });
      }
      return context;
    };

    const now = new Date();

    for (const ruleRow of rules) {
      const normalized = normalizeRuleRow(ruleRow);
      if (!normalized) continue;
      if (!matchTriggerFilters(normalized.triggerFilters, payload)) continue;

      const resolvedContext = await ensureContext();
      const conditionContext = resolvedContext as unknown as Record<string, unknown>;
      const { pass, trace } = evaluateConditions(normalized.conditions, conditionContext);

      const logs: AutomationLogEntry[] = [];
      logs.push(buildLogEntry('Condition evaluation completed', pass ? 'info' : 'warn', { trace }));

      if (!pass) {
        await db
          .insert(automationRuns)
          .values({
            orgId,
            ruleId: normalized.id,
            eventId: eventRow.id,
            parentEventId: lineage.parentEventId,
            entityType: null,
            entityId: null,
            status: 'skipped',
            startedAt: now,
            finishedAt: now,
            logs: logs.map((entry) => sanitizeSnapshot(entry)),
            snapshot: sanitizeSnapshot({
              event: { id: eventRow.id, type: eventRow.eventType, payload },
              context: { jobId: payload.jobId ?? null, assignmentId: payload.assignmentId ?? null, materialId: payload.materialId ?? null },
            }),
            lineageDepth: lineage.depth,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({ target: [automationRuns.orgId, automationRuns.ruleId, automationRuns.eventId] });
        continue;
      }

      const { entityType, entityId } = resolveEntityInfo(resolvedContext, payload);

      if (normalized.throttle) {
        const throttled = await isThrottled({
          db,
          orgId,
          ruleId: normalized.id,
          throttle: normalized.throttle,
          entityId,
          jobId: typeof payload.jobId === 'string' ? payload.jobId : null,
          now,
        });
        if (throttled) {
          logs.push(buildLogEntry('Rule throttled', 'warn', { throttle: normalized.throttle }));
          await db
            .insert(automationRuns)
            .values({
              orgId,
              ruleId: normalized.id,
              eventId: eventRow.id,
              parentEventId: lineage.parentEventId,
              entityType,
              entityId,
              status: 'skipped',
              startedAt: now,
              finishedAt: now,
              logs: logs.map((entry) => sanitizeSnapshot(entry)),
              snapshot: sanitizeSnapshot({
                event: { id: eventRow.id, type: eventRow.eventType, payload },
                context: { jobId: payload.jobId ?? null, assignmentId: payload.assignmentId ?? null, materialId: payload.materialId ?? null },
              }),
              lineageDepth: lineage.depth,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing({ target: [automationRuns.orgId, automationRuns.ruleId, automationRuns.eventId] });
          continue;
        }
      }

      if (normalized.actions.length === 0) {
        logs.push(buildLogEntry('No actions configured', 'warn'));
        await db
          .insert(automationRuns)
          .values({
            orgId,
            ruleId: normalized.id,
            eventId: eventRow.id,
            parentEventId: lineage.parentEventId,
            entityType,
            entityId,
            status: 'skipped',
            startedAt: now,
            finishedAt: now,
            logs: logs.map((entry) => sanitizeSnapshot(entry)),
            snapshot: sanitizeSnapshot({
              event: { id: eventRow.id, type: eventRow.eventType, payload },
              context: { jobId: payload.jobId ?? null, assignmentId: payload.assignmentId ?? null, materialId: payload.materialId ?? null },
            }),
            lineageDepth: lineage.depth,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({ target: [automationRuns.orgId, automationRuns.ruleId, automationRuns.eventId] });
        continue;
      }

      const rateLimited = await checkOrgRateLimit({ db, orgId, now });
      if (rateLimited) {
        logs.push(buildLogEntry('Org rate limit reached', 'warn', { limit: AUTOMATIONS_MAX_ACTIONS_PER_MINUTE }));
        await db
          .insert(automationRuns)
          .values({
            orgId,
            ruleId: normalized.id,
            eventId: eventRow.id,
            parentEventId: lineage.parentEventId,
            entityType,
            entityId,
            status: 'skipped',
            startedAt: now,
            finishedAt: now,
            logs: logs.map((entry) => sanitizeSnapshot(entry)),
            snapshot: sanitizeSnapshot({
              event: { id: eventRow.id, type: eventRow.eventType, payload },
              context: { jobId: payload.jobId ?? null, assignmentId: payload.assignmentId ?? null, materialId: payload.materialId ?? null },
            }),
            lineageDepth: lineage.depth,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({ target: [automationRuns.orgId, automationRuns.ruleId, automationRuns.eventId] });
        continue;
      }

      const [runRow] = await db
        .insert(automationRuns)
        .values({
          orgId,
          ruleId: normalized.id,
          eventId: eventRow.id,
          parentEventId: lineage.parentEventId,
          entityType,
          entityId,
          status: 'queued',
          startedAt: now,
          logs: logs.map((entry) => sanitizeSnapshot(entry)),
          snapshot: sanitizeSnapshot({
            event: { id: eventRow.id, type: eventRow.eventType, payload },
            context: { jobId: payload.jobId ?? null, assignmentId: payload.assignmentId ?? null, materialId: payload.materialId ?? null },
          }),
          lineageDepth: lineage.depth,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [automationRuns.orgId, automationRuns.ruleId, automationRuns.eventId] })
        .returning({ id: automationRuns.id });

      const runId = runRow?.id ?? null;
      if (!runId) continue;

      const outboxRows: NewAutomationActionOutbox[] = normalized.actions.map((action) => {
        const delayMinutes = action.type === 'comms.send' ? action.params.options?.delayMinutes : undefined;
        const nextAttemptAt =
          typeof delayMinutes === 'number' && Number.isFinite(delayMinutes)
            ? new Date(now.getTime() + delayMinutes * 60 * 1000)
            : null;

        return {
          orgId,
          runId,
          ruleId: normalized.id,
          eventId: eventRow.id,
          actionType: action.type,
          actionKey: action.id,
          actionPayload: sanitizeSnapshot(action),
          status: 'queued',
          attempts: 0,
          lastError: null,
          nextAttemptAt,
          providerMessageId: null,
          createdAt: now,
          updatedAt: now,
        };
      });

      if (outboxRows.length > 0) {
        await db
          .insert(automationActionsOutbox)
          .values(outboxRows)
          .onConflictDoNothing({
            target: [
              automationActionsOutbox.orgId,
              automationActionsOutbox.ruleId,
              automationActionsOutbox.eventId,
              automationActionsOutbox.actionKey,
            ],
          });
      }
    }
  });
}

/**
 * Validates and normalizes automation rule input.
 */
export function normalizeAutomationRuleInput(input: AutomationRuleInput): AutomationRuleInput | null {
  const parsed = automationActionSchema.array().safeParse(input.actions);
  if (!parsed.success) return null;
  return input;
}
