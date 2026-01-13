import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { retryAutomationAction } from '@/lib/mutations/automation_outbox';

/**
 * POST /api/automations/actions/retry
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const outboxId = typeof body?.outboxId === 'string' ? body.outboxId : '';
  if (!outboxId) return err('VALIDATION_ERROR', 'outboxId is required');

  return await retryAutomationAction({ orgId: context.data.orgId, outboxId });
});
