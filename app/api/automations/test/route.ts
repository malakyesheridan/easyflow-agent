import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { automationRules } from '@/db/schema/automation_rules';
import type { AppEvent } from '@/db/schema/app_events';
import { resolveAutomationContext } from '@/lib/automations/context';
import { evaluateConditions } from '@/lib/automations/conditions';
import { normalizeRuleRow, matchTriggerFilters } from '@/lib/automations/engine';
import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'crypto';

/**
 * POST /api/automations/test
 * Body: { orgId, eventType, payload, occurredAt? }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const eventType = typeof body?.eventType === 'string' ? body.eventType : '';
  if (!eventType) return err('VALIDATION_ERROR', 'eventType is required');

  const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
    ? (body.payload as Record<string, unknown>)
    : {};
  const occurredAt = typeof body?.occurredAt === 'string' ? body.occurredAt : new Date().toISOString();

  const fakeEvent: AppEvent = {
    id: randomUUID(),
    orgId: context.data.orgId,
    eventType,
    payload,
    status: 'queued',
    actorUserId: context.data.actor.userId,
    createdAt: new Date(occurredAt),
    processedAt: null,
  };

  return await withAutomationOrgScope({ orgId: context.data.orgId, roleKey: 'system' }, async (db) => {
    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.orgId, context.data.orgId),
          eq(automationRules.triggerType, eventType),
          eq(automationRules.isEnabled, true),
          isNull(automationRules.deletedAt)
        )
      );

    if (rules.length === 0) return ok([]);

    const resolvedContext = await resolveAutomationContext({ db, orgId: context.data.orgId, event: fakeEvent });
    const conditionContext = resolvedContext as unknown as Record<string, unknown>;

    const results = rules.map((rule) => {
      const normalized = normalizeRuleRow(rule);
      if (!normalized) {
        return {
          ruleId: rule.id,
          name: rule.name,
          status: 'invalid',
          reason: 'Rule failed validation',
        };
      }
      const filterMatched = matchTriggerFilters(normalized.triggerFilters, payload);
      if (!filterMatched) {
        return {
          ruleId: normalized.id,
          name: normalized.name,
          status: 'skipped',
          reason: 'Trigger filters did not match',
        };
      }

      const evaluation = evaluateConditions(normalized.conditions, conditionContext);
      return {
        ruleId: normalized.id,
        name: normalized.name,
        status: evaluation.pass ? 'matched' : 'skipped',
        reason: evaluation.pass ? null : 'Conditions failed',
        trace: evaluation.trace,
        actions: normalized.actions,
      };
    });

    return ok(results);
  });
});
