import { withRoute } from '@/lib/api/withRoute';
import { err, ok, type Result } from '@/lib/result';
import { listNotifications, countUnreadNotifications } from '@/lib/queries/notifications';
import { markNotificationsRead } from '@/lib/mutations/notifications';
import type { Notification } from '@/db/schema/notifications';
import { requireOrgContext } from '@/lib/auth/require';

/**
 * GET /api/notifications
 *
 * Query:
 * - orgId (required)
 * - unreadOnly (optional): 'true' | 'false'
 * - limit (optional): number
 * - unreadCountOnly (optional): 'true' to return just unread count
 */
export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const resolvedOrgId = context.data.orgId;

  const unreadCountOnly = searchParams.get('unreadCountOnly') === 'true';
  const unreadOnly = searchParams.get('unreadOnly') === 'true';
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  const userId = context.data.actor.userId ?? null;
  const [countResult, listResult] = await Promise.all([
    countUnreadNotifications(resolvedOrgId, userId, context.data.actor),
    unreadCountOnly
      ? (ok([] as Notification[]) as Result<Notification[]>)
      : listNotifications({ orgId: resolvedOrgId, userId, unreadOnly, limit, actor: context.data.actor }),
  ]);

  if (!countResult.ok) return countResult;
  if (!listResult.ok) return listResult;

  return ok({
    unreadCount: countResult.data,
    notifications: unreadCountOnly ? undefined : listResult.data,
  });
});

/**
 * PATCH /api/notifications
 *
 * Body:
 * - orgId (required)
 * - ids?: string[] (optional) - if omitted, marks all unread as read
 */
export const PATCH = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  const ids = Array.isArray(body?.ids) ? body.ids : undefined;

  const userId = context.data.actor.userId ?? null;
  const result = await markNotificationsRead({ orgId: context.data.orgId, ids, userId });
  if (!result.ok) return result;
  return ok(result.data);
});
