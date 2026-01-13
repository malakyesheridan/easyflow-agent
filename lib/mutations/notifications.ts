import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { notifications } from '@/db/schema/notifications';
import { ok, err, type Result } from '@/lib/result';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';

export async function markNotificationsRead(params: {
  orgId: string;
  ids?: string[];
  userId?: string | null;
}): Promise<Result<{ updatedCount: number }>> {
  try {
    const db = getDb();
    const readAt = new Date();
    const recipientFilter = params.userId
      ? or(isNull(notifications.recipientUserId), eq(notifications.recipientUserId, params.userId))
      : sql`true`;

    if (params.ids && params.ids.length > 0) {
      const result = await db
        .update(notifications)
        .set({ readAt })
        .where(and(eq(notifications.orgId, params.orgId), inArray(notifications.id, params.ids), recipientFilter));
      // Drizzle doesn't guarantee affected rows; return best-effort
      return ok({ updatedCount: (result as any)?.rowCount ?? params.ids.length });
    }

    await db
      .update(notifications)
      .set({ readAt })
      .where(and(eq(notifications.orgId, params.orgId), isNull(notifications.readAt), recipientFilter));

    return ok({ updatedCount: 0 });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    return err('INTERNAL_ERROR', 'Failed to mark notifications read', error);
  }
}

export async function createNotificationBestEffort(params: {
  orgId: string;
  type: 'job_progress' | 'warehouse_alert' | 'announcement' | 'integration' | 'automation';
  message: string;
  jobId?: string | null;
  eventKey?: string | null;
  recipientUserId?: string | null;
}): Promise<void> {
  try {
    const db = getDb();
    await db
      .insert(notifications)
      .values({
        orgId: params.orgId,
        type: params.type,
        message: params.message,
        jobId: params.jobId ?? null,
        eventKey: params.eventKey ?? null,
        recipientUserId: params.recipientUserId ?? null,
      } as any)
      .onConflictDoNothing({ target: notifications.eventKey });
    void logAuditEvent({
      orgId: params.orgId,
      actorUserId: null,
      actorType: 'system',
      action: 'NOTIFICATION_SENT',
      entityType: 'notification',
      entityId: params.eventKey ?? params.jobId ?? null,
      before: null,
      after: {
        type: params.type,
        message: params.message,
        jobId: params.jobId ?? null,
        eventKey: params.eventKey ?? null,
      },
      metadata: { source: 'system' },
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}
