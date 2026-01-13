import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings, isOrgAdmin } from '@/lib/authz';
import { listAutomationRules, listLatestRunsForRules } from '@/lib/queries/automations';
import { createAutomationRule } from '@/lib/mutations/automations';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import type { AutomationRun } from '@/db/schema/automation_runs';
import { automationRules } from '@/db/schema/automation_rules';
import { automationRuleRuns } from '@/db/schema/automation_rule_runs';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { validateRuleForSave } from '@/lib/automationRules/validation';
import type { AutomationRuleDraft } from '@/lib/automationRules/types';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';

/**
 * GET /api/automations/rules?orgId=...
 */
export const GET = withRoute<unknown>(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const mode = searchParams.get('mode');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (mode === 'custom') {
    if (!isOrgAdmin(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    return await withAutomationOrgScope(
      { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
      async (db) => {
        const rules = await db
          .select({
            id: automationRules.id,
            orgId: automationRules.orgId,
            name: automationRules.name,
            description: automationRules.description,
            enabled: automationRules.enabled,
            triggerKey: automationRules.triggerKey,
            triggerVersion: automationRules.triggerVersion,
            conditions: automationRules.conditionsJson,
            actions: automationRules.actionsJson,
            isCustomerFacing: automationRules.isCustomerFacing,
            requiresSms: automationRules.requiresSms,
            requiresEmail: automationRules.requiresEmail,
            lastTestedAt: automationRules.lastTestedAt,
            lastEnabledAt: automationRules.lastEnabledAt,
            createdAt: automationRules.createdAt,
            updatedAt: automationRules.updatedAt,
          })
          .from(automationRules)
          .where(and(eq(automationRules.orgId, context.data.orgId), ne(automationRules.triggerKey, '')))
          .orderBy(desc(automationRules.createdAt));

        const ruleIds = rules.map((rule) => rule.id);
        const latestByRule = new Map<string, { status: string; createdAt: Date | null }>();

        if (ruleIds.length > 0) {
          const runs = await db
            .select({
              ruleId: automationRuleRuns.ruleId,
              status: automationRuleRuns.status,
              createdAt: automationRuleRuns.createdAt,
            })
            .from(automationRuleRuns)
            .where(and(eq(automationRuleRuns.orgId, context.data.orgId), inArray(automationRuleRuns.ruleId, ruleIds)))
            .orderBy(desc(automationRuleRuns.createdAt));

          for (const run of runs) {
            if (!latestByRule.has(run.ruleId)) {
              latestByRule.set(run.ruleId, { status: run.status, createdAt: run.createdAt });
            }
          }
        }

        const payload = rules.map((rule) => {
          const latest = latestByRule.get(rule.id);
          return {
            ...rule,
            lastRunAt: latest?.createdAt ?? null,
            lastStatus: latest?.status ?? null,
          };
        });

        return { ok: true, data: payload };
      }
    );
  }

  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const rulesResult = await listAutomationRules({ orgId: context.data.orgId });
  if (!rulesResult.ok) return rulesResult;

  const ruleIds = rulesResult.data.map((rule) => rule.id);
  const runsResult = await listLatestRunsForRules({ orgId: context.data.orgId, ruleIds });
  const latestByRule = new Map<string, AutomationRun>();
  if (runsResult.ok) {
    for (const run of runsResult.data) {
      if (!latestByRule.has(run.ruleId)) {
        latestByRule.set(run.ruleId, run);
      }
    }
  }

  const payload = rulesResult.data.map((rule) => ({
    ...rule,
    lastRun: latestByRule.get(rule.id) ?? null,
  }));

  return { ok: true, data: payload };
});

/**
 * POST /api/automations/rules
 */
export const POST = withRoute<unknown>(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const mode = body?.mode === 'custom' ? 'custom' : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (mode === 'custom') {
    if (!isOrgAdmin(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    return await withAutomationOrgScope(
      { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
      async (db) => {
        const input: AutomationRuleDraft = {
          name: String(body?.name ?? '').trim(),
          description: body?.description ? String(body.description) : null,
          triggerKey: body?.triggerKey,
          triggerVersion: body?.triggerVersion,
          conditions: Array.isArray(body?.conditions) ? body.conditions : [],
          actions: Array.isArray(body?.actions) ? body.actions : [],
        };

        const validation = await validateRuleForSave({ db, orgId: context.data.orgId, input });
        if (!validation.ok) return validation;

        const { rule, flags } = validation.data;
        const now = new Date();

        const [created] = await db
          .insert(automationRules)
          .values({
            orgId: context.data.orgId,
            name: rule.name,
            description: rule.description ?? null,
            templateKey: null,
            isEnabled: false,
            enabled: false,
            triggerType: 'custom_builder',
            triggerKey: rule.triggerKey,
            triggerVersion: rule.triggerVersion ?? 1,
            triggerFilters: {},
            conditions: [],
            actions: [],
            conditionsJson: rule.conditions ?? [],
            actionsJson: rule.actions ?? [],
            throttle: null,
            isCustomerFacing: flags.isCustomerFacing,
            requiresSms: flags.requiresSms,
            requiresEmail: flags.requiresEmail,
            createdBy: context.data.actor.userId,
            updatedBy: context.data.actor.userId,
            createdByUserId: context.data.actor.userId,
            updatedByUserId: context.data.actor.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (created) {
          void logAuditEvent({
            orgId: context.data.orgId,
            actorUserId: context.data.actor.userId,
            actorType: 'user',
            action: 'CREATE',
            entityType: 'automation_rule',
            entityId: created.id,
            before: null,
            after: created,
            metadata: {
              ...buildAuditMetadata(req),
              ruleName: rule.name,
              triggerKey: rule.triggerKey,
              conditions: rule.conditions,
              actions: rule.actions,
            },
          });
        }

        return { ok: true, data: created };
      }
    );
  }

  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const result = await createAutomationRule({
    ...body,
    orgId: context.data.orgId,
    createdByUserId: context.data.actor.userId,
    updatedByUserId: context.data.actor.userId,
  });

  if (result.ok) {
    void logAuditEvent({
      orgId: context.data.orgId,
      actorUserId: context.data.actor.userId,
      actorType: 'user',
      action: 'CREATE',
      entityType: 'automation_rule',
      entityId: result.data.id,
      before: null,
      after: result.data,
      metadata: buildAuditMetadata(req),
    });
  }

  return result;
});
