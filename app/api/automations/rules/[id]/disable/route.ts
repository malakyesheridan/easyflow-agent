import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { isOrgAdmin } from '@/lib/authz';
import { automationRules } from '@/db/schema/automation_rules';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { buildAuditMetadata } from '@/lib/audit/metadata';
import { and, eq } from 'drizzle-orm';

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

        const now = new Date();
        const [updated] = await db
          .update(automationRules)
          .set({
            enabled: false,
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
            before: ruleRow,
            after: updated,
            metadata: {
              ...buildAuditMetadata(request),
              action: 'disable',
            },
          });
        }

        return { ok: true, data: updated };
      }
    );
  });

  return handler(req);
}
