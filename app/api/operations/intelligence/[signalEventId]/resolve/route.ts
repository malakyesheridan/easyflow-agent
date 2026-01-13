import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOperations } from '@/lib/authz';
import { resolveSignalEvent } from '@/lib/mutations/signal_events';

interface RouteParams {
  params: Promise<{ signalEventId: string }>;
}

/**
 * POST /api/operations/intelligence/:signalEventId/resolve
 * Body: { orgId?, resolutionReason, notes? }
 */
export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const handler = withRoute(async (request: Request) => {
    const { signalEventId } = await params;
    if (!signalEventId) return err('VALIDATION_ERROR', 'signalEventId is required');
    const body = await request.json().catch(() => ({}));
    if (!body?.resolutionReason) return err('VALIDATION_ERROR', 'resolutionReason is required');
    const orgId = body?.orgId ? String(body.orgId) : null;
    const context = await requireOrgContext(request, orgId);
    if (!context.ok) return context;
    if (!canManageOperations(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

    return await resolveSignalEvent({
      orgId: context.data.orgId,
      signalEventId,
      resolvedByUserId: context.data.actor.userId ?? null,
      resolutionReason: String(body.resolutionReason),
      notes: body?.notes ? String(body.notes) : null,
    });
  });

  return handler(req);
}
