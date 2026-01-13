import { and, asc, eq } from 'drizzle-orm';
import { appEvents } from '@/db/schema/app_events';
import { integrationEvents } from '@/db/schema/integration_events';
import { integrations } from '@/db/schema/integrations';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { defaultRulesByProvider, evaluateRuleConditions, type IntegrationRule } from '@/lib/integrations/rules';
import { runIntegrationAction } from '@/lib/integrations/actions/runner';
import { emitCommEvent } from '@/lib/communications/emit';

const MAX_ATTEMPTS = 3;

function normalizeRules(provider: string, rules: unknown): IntegrationRule[] {
  if (Array.isArray(rules)) {
    return rules
      .filter((rule): rule is IntegrationRule => !!rule && typeof rule === 'object')
      .map((rule, index) => ({
        id: typeof rule.id === 'string' ? rule.id : `${provider}-rule-${index}`,
        name: typeof rule.name === 'string' ? rule.name : `Rule ${index + 1}`,
        enabled: typeof rule.enabled === 'boolean' ? rule.enabled : false,
        when: rule.when,
        conditions: rule.conditions,
        action: rule.action,
      }));
  }
  return defaultRulesByProvider[provider] ?? [];
}

export async function processAppEventNow(orgId: string, appEventId: string): Promise<void> {
  await withIntegrationOrgScope(orgId, async (db) => {
    const [eventRow] = await db
      .select()
      .from(appEvents)
      .where(eq(appEvents.id, appEventId))
      .limit(1);
    if (!eventRow) return;

    const enabled = await db
      .select({
        id: integrations.id,
        orgId: integrations.orgId,
        provider: integrations.provider,
        displayName: integrations.displayName,
        enabled: integrations.enabled,
        status: integrations.status,
        rules: integrations.rules,
        lastTestedAt: integrations.lastTestedAt,
        lastError: integrations.lastError,
        createdAt: integrations.createdAt,
        updatedAt: integrations.updatedAt,
      })
      .from(integrations)
      .where(and(eq(integrations.orgId, eventRow.orgId), eq(integrations.enabled, true)))
      .orderBy(asc(integrations.displayName));

    if (enabled.length === 0) {
      await db
        .update(appEvents)
        .set({ status: 'processed', processedAt: new Date() } as any)
        .where(eq(appEvents.id, eventRow.id));
      return;
    }

    const payload = (eventRow.payload ?? {}) as Record<string, unknown>;

    for (const integration of enabled) {
      if (integration.status !== 'connected') continue;
      const rules = normalizeRules(integration.provider, integration.rules);
      for (const rule of rules) {
        if (!rule.enabled || rule.when !== eventRow.eventType) continue;
        if (!evaluateRuleConditions(rule, payload)) continue;

        const idempotencyKey = `${eventRow.id}:${integration.id}:${rule.id}`;

        const [existing] = await db
          .select({ id: integrationEvents.id, status: integrationEvents.status })
          .from(integrationEvents)
          .where(eq(integrationEvents.idempotencyKey, idempotencyKey))
          .limit(1);

        let integrationEventId = existing?.id ?? null;
        if (existing?.status === 'success') continue;

        if (integrationEventId) {
          await db
            .update(integrationEvents)
            .set({ status: 'queued', updatedAt: new Date() } as any)
            .where(eq(integrationEvents.id, integrationEventId));
        } else {
          const [inserted] = await db
            .insert(integrationEvents)
            .values({
              integrationId: integration.id,
              eventId: eventRow.id,
              eventType: eventRow.eventType,
              actionType: rule.action.type,
              ruleId: rule.id,
              idempotencyKey,
              payload: {
                event: payload,
                action: rule.action.params ?? null,
              },
              status: 'queued',
              attemptCount: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any)
            .returning({ id: integrationEvents.id });
          integrationEventId = inserted?.id ?? null;
        }

        if (integrationEventId) {
          void processIntegrationEventNow(eventRow.orgId, integrationEventId);
        }
      }
    }

    await db
      .update(appEvents)
      .set({ status: 'processed', processedAt: new Date() } as any)
      .where(eq(appEvents.id, eventRow.id));
  });
}

export async function processIntegrationEventNow(orgId: string, integrationEventId: string): Promise<void> {
  await withIntegrationOrgScope(orgId, async (db) => {
    const [row] = await db
      .select({
        id: integrationEvents.id,
        status: integrationEvents.status,
        attemptCount: integrationEvents.attemptCount,
        actionType: integrationEvents.actionType,
        eventType: integrationEvents.eventType,
        payload: integrationEvents.payload,
        error: integrationEvents.error,
        integrationId: integrationEvents.integrationId,
        idempotencyKey: integrationEvents.idempotencyKey,
        ruleId: integrationEvents.ruleId,
        createdAt: integrationEvents.createdAt,
        integrationProvider: integrations.provider,
        integrationCredentials: integrations.credentials,
        integrationStatus: integrations.status,
        integrationEnabled: integrations.enabled,
        integrationOrgId: integrations.orgId,
      })
      .from(integrationEvents)
      .innerJoin(integrations, eq(integrationEvents.integrationId, integrations.id))
      .where(eq(integrationEvents.id, integrationEventId))
      .limit(1);

    if (!row) return;
    if (row.status === 'success') return;
    if (!row.integrationEnabled || row.integrationStatus !== 'connected') return;
    if (row.attemptCount >= MAX_ATTEMPTS) return;

    const attempt = (row.attemptCount ?? 0) + 1;
    await db
      .update(integrationEvents)
      .set({
        status: 'processing',
        attemptCount: attempt,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .where(eq(integrationEvents.id, row.id));

    const startedAt = Date.now();
    const result = await runIntegrationAction({
      orgId,
      eventType: row.eventType,
      actionType: row.actionType,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      integration: {
        id: row.integrationId,
        provider: row.integrationProvider,
        credentials: row.integrationCredentials,
      },
      idempotencyKey: row.idempotencyKey ?? `${row.id}`,
    });
    const latencyMs = Date.now() - startedAt;

    if (result.ok) {
      await db
        .update(integrationEvents)
        .set({
          status: 'success',
          latencyMs,
          response: result.response ?? null,
          error: null,
          updatedAt: new Date(),
        } as any)
        .where(eq(integrationEvents.id, row.id));
      void emitCommEvent({
        orgId,
        eventKey: 'integration_sync_succeeded',
        entityType: 'system',
        entityId: row.id,
        triggeredByUserId: null,
        payload: {
          integrationId: row.integrationId,
          provider: row.integrationProvider,
          eventType: row.eventType,
          actionType: row.actionType,
        },
      });
      return;
    }

    await db
      .update(integrationEvents)
      .set({
        status: 'failed',
        latencyMs,
        error: result.error ?? 'Integration action failed',
        response: result.response ?? null,
        updatedAt: new Date(),
      } as any)
      .where(eq(integrationEvents.id, row.id));

    const payload = (row.payload ?? {}) as Record<string, any>;
    const eventPayload = (payload.event ?? payload) as Record<string, any>;
    const jobId = typeof eventPayload.jobId === 'string' ? eventPayload.jobId : null;
    const providerLabel = row.integrationProvider;
    const message =
      row.actionType === 'webhook.deliver'
        ? `Webhook delivery failed for ${row.eventType}.`
        : row.actionType.startsWith('xero.')
          ? `Xero action failed for job ${jobId ? jobId.slice(0, 8) : 'unknown'}.`
          : row.actionType.startsWith('stripe.')
            ? `Stripe action failed for job ${jobId ? jobId.slice(0, 8) : 'unknown'}.`
            : `Integration action failed (${providerLabel}).`;

    void emitCommEvent({
      orgId,
      eventKey: 'integration_sync_failed',
      entityType: 'system',
      entityId: row.id,
      triggeredByUserId: null,
      payload: {
        integrationId: row.integrationId,
        provider: row.integrationProvider,
        eventType: row.eventType,
        actionType: row.actionType,
        jobId,
        error: row.error ?? message,
      },
    });
  });
}

export async function processQueuedIntegrationEvents(params: {
  orgId: string;
  limit?: number;
}): Promise<void> {
  const limit = params.limit ?? 50;
  await withIntegrationOrgScope(params.orgId, async (db) => {
    const rows = await db
      .select({ id: integrationEvents.id })
      .from(integrationEvents)
      .where(eq(integrationEvents.status, 'queued'))
      .orderBy(asc(integrationEvents.createdAt))
      .limit(limit);

    for (const row of rows) {
      await processIntegrationEventNow(params.orgId, row.id);
    }
  });
}
