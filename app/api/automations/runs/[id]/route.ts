import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings, isOrgAdmin } from '@/lib/authz';
import { getAutomationRunWithActions } from '@/lib/queries/automations';
import { automationRuleRuns } from '@/db/schema/automation_rule_runs';
import { automationRuleRunSteps } from '@/db/schema/automation_rule_run_steps';
import { withAutomationOrgScope } from '@/lib/automations/scope';
import { and, asc, eq } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/automations/runs/:id?orgId=...
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
      if (!id) return err('VALIDATION_ERROR', 'id is required');
      return await withAutomationOrgScope(
        { orgId: context.data.orgId, userId: context.data.actor.userId, roleKey: 'admin' },
        async (db) => {
          const [run] = await db
            .select()
            .from(automationRuleRuns)
            .where(and(eq(automationRuleRuns.orgId, context.data.orgId), eq(automationRuleRuns.id, id)))
            .limit(1);
          if (!run) return err('NOT_FOUND', 'Run not found');

          const steps = await db
            .select()
            .from(automationRuleRunSteps)
            .where(eq(automationRuleRunSteps.runId, id))
            .orderBy(asc(automationRuleRunSteps.stepIndex));

          return { ok: true, data: { run, steps } };
        }
      );
    }

    if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');
    if (!id) return err('VALIDATION_ERROR', 'id is required');
    return await getAutomationRunWithActions({ orgId: context.data.orgId, runId: id });
  });

  return handler(req);
}
