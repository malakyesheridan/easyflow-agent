import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings, isOrgAdmin } from '@/lib/authz';
import { listAutomationRuns } from '@/lib/queries/automations';
import type { AutomationRun } from '@/db/schema/automation_runs';
import { automationRuleRuns } from '@/db/schema/automation_rule_runs';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';

/**
 * GET /api/automations/runs?orgId=...&ruleId=...&status=...&limit=...&cursor=...
 */
export const GET = withRoute<unknown>(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const mode = searchParams.get('mode');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (mode === 'custom') {
    if (!isOrgAdmin(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    const ruleId = searchParams.get('ruleId') ?? undefined;
    const eventId = searchParams.get('eventId') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(Number(limitParam), 200) : 50;
    const cursor = searchParams.get('cursor') ?? undefined;
    const start = searchParams.get('start') ?? undefined;
    const end = searchParams.get('end') ?? undefined;

    return await withAutomationOrgScope(
      { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
      async (db) => {
        const filters = [eq(automationRuleRuns.orgId, context.data.orgId)];
        if (ruleId) filters.push(eq(automationRuleRuns.ruleId, ruleId));
        if (eventId) filters.push(eq(automationRuleRuns.eventId, eventId));
        if (status) filters.push(eq(automationRuleRuns.status, status));
        if (cursor) {
          const cursorDate = new Date(cursor);
          if (!Number.isNaN(cursorDate.getTime())) filters.push(lt(automationRuleRuns.createdAt, cursorDate));
        }
        if (start) {
          const startDate = new Date(start);
          if (!Number.isNaN(startDate.getTime())) filters.push(gte(automationRuleRuns.createdAt, startDate));
        }
        if (end) {
          const endDate = new Date(end);
          if (!Number.isNaN(endDate.getTime())) filters.push(lte(automationRuleRuns.createdAt, endDate));
        }

        const rows = await db
          .select()
          .from(automationRuleRuns)
          .where(and(...filters))
          .orderBy(desc(automationRuleRuns.createdAt))
          .limit(limit);

        return { ok: true, data: rows };
      }
    );
  }

  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const ruleId = searchParams.get('ruleId') ?? undefined;
  const eventId = searchParams.get('eventId') ?? undefined;
  const statusParam = searchParams.get('status');
  const status = statusParam ? (statusParam as AutomationRun['status']) : undefined;
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  const cursor = searchParams.get('cursor') ?? undefined;

  return await listAutomationRuns({
    orgId: context.data.orgId,
    ruleId: ruleId || undefined,
    eventId: eventId || undefined,
    status,
    limit,
    cursor,
  });
});
