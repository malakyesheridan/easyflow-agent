import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { listCommOutbox } from '@/lib/communications/queries';

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const status = searchParams.get('status') || undefined;
  const channel = searchParams.get('channel') || undefined;
  const eventKey = searchParams.get('eventKey') || undefined;
  const recipient = searchParams.get('recipient') || undefined;
  const startDateRaw = searchParams.get('start');
  const endDateRaw = searchParams.get('end');
  const limitRaw = searchParams.get('limit');

  const startDate = startDateRaw ? new Date(startDateRaw) : undefined;
  const endDate = endDateRaw ? new Date(endDateRaw) : undefined;
  const limit = limitRaw ? Number(limitRaw) : undefined;

  return await listCommOutbox({
    orgId: context.data.orgId,
    status,
    channel,
    eventKey,
    recipient,
    startDate,
    endDate,
    limit,
  });
});
