import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { retryIntegrationEvents } from '@/lib/mutations/integration_events';
import { processQueuedIntegrationEvents } from '@/lib/integrations/events/processor';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';

/**
 * POST /api/integration-events/retry
 * Body:
 * - orgId (required)
 * - ids?: string[]
 * - provider?: string
 * - integrationId?: string
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) {
    return err('FORBIDDEN', 'Insufficient permissions');
  }

  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : undefined;
  const provider = typeof body?.provider === 'string' ? body.provider : undefined;
  const integrationId = typeof body?.integrationId === 'string' ? body.integrationId : undefined;

  const result = await retryIntegrationEvents({
    orgId: context.data.orgId,
    ids,
    provider,
    integrationId,
  });
  if (!result.ok) return result;

  void processQueuedIntegrationEvents({ orgId: context.data.orgId, limit: 50 });

  return ok(result.data);
});
