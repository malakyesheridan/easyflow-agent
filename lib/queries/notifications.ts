import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { notifications } from '@/db/schema/notifications';
import { jobs } from '@/db/schema/jobs';
import { ok, err, type Result } from '@/lib/result';
import type { Notification } from '@/db/schema/notifications';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';

export async function listNotifications(params: {
  orgId: string;
  userId?: string | null;
  unreadOnly?: boolean;
  limit?: number;
  actor?: RequestActor;
}): Promise<Result<Notification[]>> {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));

    const recipientFilter = params.userId
      ? or(isNull(notifications.recipientUserId), eq(notifications.recipientUserId, params.userId))
      : sql`true`;

    const baseWhere = params.unreadOnly
      ? and(eq(notifications.orgId, params.orgId), isNull(notifications.readAt), recipientFilter)
      : and(eq(notifications.orgId, params.orgId), recipientFilter);

    const jobVisibility = params.actor
      ? applyJobVisibility(eq(jobs.orgId, params.orgId), params.actor, jobs)
      : null;
    const where = jobVisibility
      ? and(baseWhere, or(isNull(notifications.jobId), jobVisibility))
      : baseWhere;

    const data = await db
      .select({
        id: notifications.id,
        orgId: notifications.orgId,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        severity: notifications.severity,
        entityType: notifications.entityType,
        entityId: notifications.entityId,
        deepLink: notifications.deepLink,
        jobId: notifications.jobId,
        eventKey: notifications.eventKey,
        recipientUserId: notifications.recipientUserId,
        message: notifications.message,
        readAt: notifications.readAt,
        dismissedAt: notifications.dismissedAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(jobs, eq(jobs.id, notifications.jobId))
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    return ok(data);
  } catch (error) {
    console.error('Error listing notifications:', error);
    return err('INTERNAL_ERROR', 'Failed to list notifications', error);
  }
}

export async function countUnreadNotifications(
  orgId: string,
  userId?: string | null,
  actor?: RequestActor
): Promise<Result<number>> {
  try {
    const db = getDb();
    const recipientFilter = userId
      ? or(isNull(notifications.recipientUserId), eq(notifications.recipientUserId, userId))
      : sql`true`;

    const baseWhere = and(eq(notifications.orgId, orgId), isNull(notifications.readAt), recipientFilter);
    const jobVisibility = actor ? applyJobVisibility(eq(jobs.orgId, orgId), actor, jobs) : null;
    const where = jobVisibility
      ? and(baseWhere, or(isNull(notifications.jobId), jobVisibility))
      : baseWhere;

    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .leftJoin(jobs, eq(jobs.id, notifications.jobId))
      .where(where);
    return ok(Number(row?.count ?? 0));
  } catch (error) {
    console.error('Error counting unread notifications:', error);
    return err('INTERNAL_ERROR', 'Failed to count unread notifications', error);
  }
}
