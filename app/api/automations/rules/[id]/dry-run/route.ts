import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { isOrgAdmin } from '@/lib/authz';
import { automationRules } from '@/db/schema/automation_rules';
import { appEvents } from '@/db/schema/app_events';
import { commProviderStatus } from '@/db/schema/comm_provider_status';
import { orgSettings } from '@/db/schema/org_settings';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { resolveEventTypeForTrigger } from '@/lib/automationRules/idempotency';
import { normalizeRuleForDryRun, runAutomationRuleDryRun } from '@/lib/automationRules/engine';
import { deriveRuleFlags, validateRuleForSave } from '@/lib/automationRules/validation';
import { resolveSenderIdentity } from '@/lib/communications/sender';
import type { AutomationRuleDraft, TriggerKey } from '@/lib/automationRules/types';
import { and, desc, eq } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { id } = await params;
    const body = await request.json();
    const orgId = body?.orgId ? String(body.orgId) : null;

    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!isOrgAdmin(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    return await withAutomationOrgScope(
      { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
      async (db) => {
        const [ruleRow] = await db
          .select()
          .from(automationRules)
          .where(and(eq(automationRules.orgId, context.data.orgId), eq(automationRules.id, id)))
          .limit(1);

        if (!ruleRow || !ruleRow.triggerKey) return err('NOT_FOUND', 'Automation rule not found');

        const triggerKey = (body?.sampleEventKey ?? ruleRow.triggerKey) as TriggerKey;
        if (triggerKey !== ruleRow.triggerKey) {
          return err('VALIDATION_ERROR', 'sampleEventKey must match the rule trigger');
        }

        const input: AutomationRuleDraft = {
          name: ruleRow.name,
          description: ruleRow.description ?? null,
          triggerKey: ruleRow.triggerKey as TriggerKey,
          triggerVersion: ruleRow.triggerVersion ?? 1,
          conditions: Array.isArray(ruleRow.conditionsJson) ? ruleRow.conditionsJson : [],
          actions: Array.isArray(ruleRow.actionsJson) ? ruleRow.actionsJson : [],
        };

        const validation = await validateRuleForSave({ db, orgId: context.data.orgId, input });
        if (!validation.ok) return validation;

        let eventId = typeof body?.sampleEventId === 'string' ? body.sampleEventId : null;
        let eventType = resolveEventTypeForTrigger(triggerKey);
        let payload = body?.samplePayload && typeof body.samplePayload === 'object' ? body.samplePayload : null;
        let createdAt = new Date();

        if (eventId) {
          const [eventRow] = await db
            .select()
            .from(appEvents)
            .where(and(eq(appEvents.orgId, context.data.orgId), eq(appEvents.id, eventId)))
            .limit(1);
          if (!eventRow) return err('NOT_FOUND', 'Sample event not found');
          eventType = eventRow.eventType;
          payload = { ...(eventRow.payload ?? {}) };
          createdAt = eventRow.createdAt ?? createdAt;
        } else if (!payload) {
          if (!eventType || eventType === 'time.daily') {
            return err('NOT_FOUND', 'No recent events available. Provide a sample payload to test this trigger.');
          }

          const [eventRow] = await db
            .select()
            .from(appEvents)
            .where(and(eq(appEvents.orgId, context.data.orgId), eq(appEvents.eventType, eventType)))
            .orderBy(desc(appEvents.createdAt))
            .limit(1);

          if (!eventRow) {
            return err('NOT_FOUND', 'No recent events found. Provide a sample payload to test this trigger.');
          }

          eventId = eventRow.id;
          payload = { ...(eventRow.payload ?? {}) };
          createdAt = eventRow.createdAt ?? createdAt;
        }

        const normalized = normalizeRuleForDryRun({ ...input, id: ruleRow.id });
        if (!normalized) return err('VALIDATION_ERROR', 'Rule is invalid');

        const [settingsRow] = await db
          .select({
            commFromName: orgSettings.commFromName,
            commFromEmail: orgSettings.commFromEmail,
            commReplyToEmail: orgSettings.commReplyToEmail,
            automationsDisabled: orgSettings.automationsDisabled,
          })
          .from(orgSettings)
          .where(eq(orgSettings.orgId, context.data.orgId))
          .limit(1);

        const runResult = await runAutomationRuleDryRun({
          db,
          orgId: context.data.orgId,
          rule: normalized,
          event: {
            id: eventId ?? `dry-run:${ruleRow.id}`,
            eventType,
            payload: (payload ?? {}) as Record<string, unknown>,
            createdAt,
            actorUserId: context.data.actor.userId ?? null,
          },
        });

        if (runResult.error) {
          return err('VALIDATION_ERROR', runResult.error);
        }

        const warnings = [...validation.data.warnings];
        const flags = deriveRuleFlags(input.actions);

        if (settingsRow?.automationsDisabled) warnings.push('org_disabled');

        if (flags.requiresEmail) {
          const sender = resolveSenderIdentity({
            commFromName: settingsRow?.commFromName ?? null,
            commFromEmail: settingsRow?.commFromEmail ?? null,
            commReplyToEmail: settingsRow?.commReplyToEmail ?? null,
          });
          if (!process.env.RESEND_API_KEY || !sender.fromEmail) warnings.push('email_provider_not_ready');
        }

        if (flags.requiresSms) {
          const [statusRow] = await db
            .select({ smsEnabled: commProviderStatus.smsEnabled })
            .from(commProviderStatus)
            .where(eq(commProviderStatus.orgId, context.data.orgId))
            .limit(1);
          if (!statusRow?.smsEnabled) warnings.push('sms_provider_not_ready');
        }

        const now = new Date();
        await db
          .update(automationRules)
          .set({ lastTestedAt: now, updatedAt: now, updatedBy: context.data.actor.userId, updatedByUserId: context.data.actor.userId })
          .where(and(eq(automationRules.orgId, context.data.orgId), eq(automationRules.id, id)));

        return {
          ok: true,
          data: {
            matched: runResult.matched,
            matchDetails: runResult.matchDetails,
            actionPreviews: runResult.actionPreviews,
            warnings,
          },
        };
      }
    );
  });

  return handler(req);
}
