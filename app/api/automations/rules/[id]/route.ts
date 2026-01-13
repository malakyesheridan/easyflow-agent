import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings, isOrgAdmin } from '@/lib/authz';
import { updateAutomationRule, deleteAutomationRule } from '@/lib/mutations/automations';
import { getAutomationRuleById } from '@/lib/queries/automations';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { automationRules } from '@/db/schema/automation_rules';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { validateRuleForSave } from '@/lib/automationRules/validation';
import type { AutomationRuleDraft } from '@/lib/automationRules/types';
import { and, eq } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/automations/rules/:id?mode=custom
 */
export async function GET(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute<unknown>(async (request: Request) => {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    const mode = searchParams.get('mode');
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;

    if (mode === 'custom') {
      if (!isOrgAdmin(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
      return await withAutomationOrgScope(
        { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
        async (db) => {
          const [row] = await db
            .select()
            .from(automationRules)
            .where(and(eq(automationRules.orgId, context.data.orgId), eq(automationRules.id, id)))
            .limit(1);
          if (!row || !row.triggerKey) return err('NOT_FOUND', 'Automation rule not found');
          return { ok: true, data: row };
        }
      );
    }

    if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
    return await getAutomationRuleById({ orgId: context.data.orgId, id });
  });

  return handler(req);
}

/**
 * PATCH /api/automations/rules/:id
 */
export async function PATCH(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute<unknown>(async (request: Request) => {
    const { id } = await params;
    const body = await request.json();
    const orgId = body?.orgId ? String(body.orgId) : null;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') ?? body?.mode;
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (mode === 'custom') {
      if (!isOrgAdmin(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

      return await withAutomationOrgScope(
        { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
        async (db) => {
          const [before] = await db
            .select()
            .from(automationRules)
            .where(and(eq(automationRules.orgId, context.data.orgId), eq(automationRules.id, id)))
            .limit(1);
          if (!before || !before.triggerKey) return err('NOT_FOUND', 'Automation rule not found');

          const input: AutomationRuleDraft = {
            name: body?.name ? String(body.name).trim() : before.name,
            description: body?.description !== undefined ? (body.description ? String(body.description) : null) : before.description ?? null,
            triggerKey: body?.triggerKey ?? before.triggerKey,
            triggerVersion: body?.triggerVersion ?? before.triggerVersion ?? 1,
            conditions: Array.isArray(body?.conditions) ? body.conditions : (Array.isArray(before.conditionsJson) ? (before.conditionsJson as any) : []),
            actions: Array.isArray(body?.actions) ? body.actions : (Array.isArray(before.actionsJson) ? (before.actionsJson as any) : []),
          };

          const validation = await validateRuleForSave({ db, orgId: context.data.orgId, input });
          if (!validation.ok) return validation;

          const { rule, flags } = validation.data;
          const structuralChange =
            JSON.stringify(rule.conditions ?? []) !== JSON.stringify(before.conditionsJson ?? []) ||
            JSON.stringify(rule.actions ?? []) !== JSON.stringify(before.actionsJson ?? []) ||
            rule.triggerKey !== before.triggerKey;

          const now = new Date();

          const [updated] = await db
            .update(automationRules)
            .set({
              name: rule.name,
              description: rule.description ?? null,
              triggerKey: rule.triggerKey,
              triggerVersion: rule.triggerVersion ?? 1,
              conditionsJson: rule.conditions ?? [],
              actionsJson: rule.actions ?? [],
              isCustomerFacing: flags.isCustomerFacing,
              requiresSms: flags.requiresSms,
              requiresEmail: flags.requiresEmail,
              enabled: structuralChange ? false : before.enabled,
              isEnabled: structuralChange ? false : before.isEnabled,
              lastTestedAt: structuralChange ? null : before.lastTestedAt,
              updatedBy: context.data.actor.userId,
              updatedByUserId: context.data.actor.userId,
              updatedAt: now,
            })
            .where(and(eq(automationRules.orgId, context.data.orgId), eq(automationRules.id, id)))
            .returning();

          if (updated) {
            void logAuditEvent({
              orgId: context.data.orgId,
              actorUserId: context.data.actor.userId,
              actorType: 'user',
              action: 'UPDATE',
              entityType: 'automation_rule',
              entityId: updated.id,
              before,
              after: updated,
              metadata: {
                ...buildAuditMetadata(request),
                ruleName: rule.name,
                triggerKey: rule.triggerKey,
                conditions: rule.conditions,
                actions: rule.actions,
              },
            });
          }

          return { ok: true, data: updated };
        }
      );
    }

    if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    const before = await getAutomationRuleById({ orgId: context.data.orgId, id });
    const result = await updateAutomationRule({
      ...body,
      id,
      orgId: context.data.orgId,
      updatedByUserId: context.data.actor.userId,
    });

    if (result.ok) {
      void logAuditEvent({
        orgId: context.data.orgId,
        actorUserId: context.data.actor.userId,
        actorType: 'user',
        action: 'UPDATE',
        entityType: 'automation_rule',
        entityId: result.data.id,
        before: before.ok ? before.data : null,
        after: result.data,
        metadata: buildAuditMetadata(request),
      });
    }

    return result;
  });

  return handler(req);
}

/**
 * DELETE /api/automations/rules/:id
 */
export async function DELETE(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute<unknown>(async (request: Request) => {
    const { id } = await params;
    const body = await request.json();
    const orgId = body?.orgId ? String(body.orgId) : null;
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') ?? body?.mode;
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (mode === 'custom') {
      if (!isOrgAdmin(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

      return await withAutomationOrgScope(
        { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
        async (db) => {
          const [before] = await db
            .select()
            .from(automationRules)
            .where(and(eq(automationRules.orgId, context.data.orgId), eq(automationRules.id, id)))
            .limit(1);
          if (!before || !before.triggerKey) return err('NOT_FOUND', 'Automation rule not found');

          const [deleted] = await db
            .delete(automationRules)
            .where(and(eq(automationRules.orgId, context.data.orgId), eq(automationRules.id, id)))
            .returning();

          if (deleted) {
            void logAuditEvent({
              orgId: context.data.orgId,
              actorUserId: context.data.actor.userId,
              actorType: 'user',
              action: 'DELETE',
              entityType: 'automation_rule',
              entityId: deleted.id,
              before,
              after: null,
              metadata: buildAuditMetadata(request),
            });
          }

          return { ok: true, data: { id } };
        }
      );
    }

    if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    const before = await getAutomationRuleById({ orgId: context.data.orgId, id });
    const result = await deleteAutomationRule({
      orgId: context.data.orgId,
      id,
      userId: context.data.actor.userId,
    });

    if (result.ok) {
      void logAuditEvent({
        orgId: context.data.orgId,
        actorUserId: context.data.actor.userId,
        actorType: 'user',
        action: 'DELETE',
        entityType: 'automation_rule',
        entityId: result.data.id,
        before: before.ok ? before.data : null,
        after: null,
        metadata: buildAuditMetadata(request),
      });
    }

    return result;
  });

  return handler(req);
}
