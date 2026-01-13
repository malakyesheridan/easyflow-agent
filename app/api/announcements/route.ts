import { withRoute } from '@/lib/api/withRoute';
import { err } from '@/lib/result';
import { listAnnouncements } from '@/lib/queries/announcements';
import { createAnnouncement } from '@/lib/mutations/announcements';
import { canManageAnnouncements } from '@/lib/authz';
import { requireOrgContext } from '@/lib/auth/require';

/**
 * GET /api/announcements?orgId=...&priority=urgent|normal&unacknowledgedOnly=true|false&limit=...
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const priority = searchParams.get('priority') as 'urgent' | 'normal' | null;
  const unacknowledgedOnly = searchParams.get('unacknowledgedOnly') === 'true';
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;
  if (limitParam && !Number.isFinite(limit)) return err('VALIDATION_ERROR', 'Invalid limit');

  return await listAnnouncements({
    orgId: context.data.orgId,
    priority: priority === 'urgent' || priority === 'normal' ? priority : undefined,
    unacknowledgedOnly,
    limit: limit ? Math.max(1, Math.min(200, limit)) : undefined,
  });
});

/**
 * POST /api/announcements
 * Body: { orgId, title, message, priority, recipientsType, recipientCrewMemberIds? }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const actor = context.data.actor;
  if (!canManageAnnouncements(actor)) return err('FORBIDDEN', 'Insufficient permissions');

  return await createAnnouncement({ ...body, orgId: context.data.orgId, createdByCrewMemberId: actor.crewMemberId });
});
