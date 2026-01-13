import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { acknowledgeAnnouncement } from '@/lib/mutations/announcements';
import { requireOrgContext } from '@/lib/auth/require';

/**
 * POST /api/announcements/ack
 * Body: { orgId, announcementId, acknowledgedByCrewMemberId? }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  if (!body?.announcementId) return err('VALIDATION_ERROR', 'announcementId is required');
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  return await acknowledgeAnnouncement({
    ...body,
    orgId: context.data.orgId,
    acknowledgedByCrewMemberId: body?.acknowledgedByCrewMemberId ?? context.data.actor.crewMemberId ?? undefined,
  });
});
