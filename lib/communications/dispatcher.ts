import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { commOutbox } from '@/db/schema/comm_outbox';
import { notifications } from '@/db/schema/notifications';
import { orgs } from '@/db/schema/orgs';
import { logAuditEvent } from '@/lib/audit/logAuditEvent';
import { renderEmailHtml } from '@/lib/communications/renderer';
import { sendResendEmail } from '@/lib/communications/providers/resend';
import { sendSmsStub } from '@/lib/communications/providers/sms_stub';
import { withCommOrgScope } from '@/lib/communications/scope';
import { getDb } from '@/lib/db';

const MAX_ATTEMPTS = 3;

type OutboxRow = typeof commOutbox.$inferSelect;

function buildNotificationType(eventKey: string): 'job_progress' | 'warehouse_alert' | 'announcement' | 'integration' {
  if (eventKey.startsWith('announcement')) return 'announcement';
  if (eventKey.startsWith('integration')) return 'integration';
  if (eventKey.startsWith('material')) return 'warehouse_alert';
  return 'job_progress';
}

function buildAttemptMetadata(row: OutboxRow, now: Date, error?: string | null, status?: string) {
  const metadata = (row.metadata ?? {}) as Record<string, any>;
  const attemptCount = Number(metadata.attemptCount ?? 0) + 1;
  const nextAttemptAt =
    status === 'failed' && attemptCount < MAX_ATTEMPTS
      ? new Date(now.getTime() + Math.pow(2, attemptCount) * 60 * 1000).toISOString()
      : null;

  return {
    ...metadata,
    attemptCount,
    lastAttemptAt: now.toISOString(),
    nextAttemptAt,
    lastError: error ?? null,
  };
}

async function dispatchRow(db: any, row: OutboxRow): Promise<void> {
  const now = new Date();
  const metadata = (row.metadata ?? {}) as Record<string, any>;
  const replyTo =
    row.replyToEmail || (typeof metadata.commReplyToEmail === 'string' ? metadata.commReplyToEmail : null);
  const fromEmail = row.fromEmail || (typeof metadata.commFromEmail === 'string' ? metadata.commFromEmail : '');
  const fromName = row.fromName || null;
  const from = fromName && fromEmail ? `${fromName} <${fromEmail}>` : fromEmail;

  if (row.channel === 'email') {
    if (!fromEmail) {
      await db
        .update(commOutbox)
        .set({
          status: 'failed',
          error: 'Missing sender identity',
          updatedAt: now,
          metadata: buildAttemptMetadata(row, now, 'Missing sender identity', 'failed'),
        })
        .where(eq(commOutbox.id, row.id));
      return;
    }
    const subject = row.subjectRendered ?? 'Notification';
    const html = row.bodyHtmlRendered ?? renderEmailHtml(row.bodyRendered);
    const text = row.bodyRendered;

    const result = await sendResendEmail({
      apiKey: process.env.RESEND_API_KEY || '',
      from,
      to: row.recipientEmail || '',
      subject,
      html,
      text,
      replyTo,
    });

    if (result.ok) {
      await db
        .update(commOutbox)
        .set({
          status: 'sent',
          providerMessageId: result.messageId,
          error: null,
          sentAt: now,
          updatedAt: now,
          metadata: buildAttemptMetadata(row, now, null, 'sent'),
        })
        .where(eq(commOutbox.id, row.id));

      void logAuditEvent({
        orgId: row.orgId,
        actorUserId: row.recipientUserId ?? null,
        actorType: 'system',
        action: 'NOTIFICATION_SENT',
        entityType: 'comm_outbox',
        entityId: row.id,
        before: null,
        after: { status: 'sent', provider: row.provider },
        metadata: { channel: row.channel, eventKey: row.eventKey },
      });
      return;
    }

    await db
      .update(commOutbox)
      .set({
        status: 'failed',
        error: result.error,
        updatedAt: now,
        metadata: buildAttemptMetadata(row, now, result.error, 'failed'),
      })
      .where(eq(commOutbox.id, row.id));

    void logAuditEvent({
      orgId: row.orgId,
      actorUserId: row.recipientUserId ?? null,
      actorType: 'system',
      action: 'NOTIFICATION_SENT',
      entityType: 'comm_outbox',
      entityId: row.id,
      before: null,
      after: { status: 'failed', provider: row.provider, error: result.error },
      metadata: { channel: row.channel, eventKey: row.eventKey },
    });
    return;
  }

  if (row.channel === 'sms') {
    const result = await sendSmsStub();
    await db
      .update(commOutbox)
      .set({
        status: 'suppressed',
        error: result.reason,
        updatedAt: now,
        metadata: buildAttemptMetadata(row, now, result.reason, 'suppressed'),
      })
      .where(eq(commOutbox.id, row.id));

    void logAuditEvent({
      orgId: row.orgId,
      actorUserId: row.recipientUserId ?? null,
      actorType: 'system',
      action: 'NOTIFICATION_SENT',
      entityType: 'comm_outbox',
      entityId: row.id,
      before: null,
      after: { status: 'suppressed', provider: row.provider, error: result.reason },
      metadata: { channel: row.channel, eventKey: row.eventKey },
    });
    return;
  }

  if (row.channel === 'in_app') {
    const notificationType = buildNotificationType(row.eventKey);
    await db
      .insert(notifications)
      .values({
        orgId: row.orgId,
        type: notificationType,
        jobId: row.entityType === 'job' ? row.entityId : null,
        eventKey: `comm:${row.id}`,
        message: row.bodyRendered,
        recipientUserId: row.recipientUserId ?? null,
      })
      .onConflictDoNothing({ target: notifications.eventKey });

    await db
      .update(commOutbox)
      .set({
        status: 'sent',
        error: null,
        sentAt: now,
        updatedAt: now,
        metadata: buildAttemptMetadata(row, now, null, 'sent'),
      })
      .where(eq(commOutbox.id, row.id));

    void logAuditEvent({
      orgId: row.orgId,
      actorUserId: row.recipientUserId ?? null,
      actorType: 'system',
      action: 'NOTIFICATION_SENT',
      entityType: 'comm_outbox',
      entityId: row.id,
      before: null,
      after: { status: 'sent', provider: row.provider },
      metadata: { channel: row.channel, eventKey: row.eventKey },
    });
  }
}

async function dispatchForOrg(orgId: string, limit: number): Promise<void> {
  await withCommOrgScope({ orgId, roleKey: 'system' }, async (db) => {
    const now = new Date();
    const rows: OutboxRow[] = await db
      .select()
      .from(commOutbox)
      .where(
        and(
          eq(commOutbox.orgId, orgId),
          or(
            and(eq(commOutbox.status, 'queued'), or(isNull(commOutbox.scheduledFor), lte(commOutbox.scheduledFor, now))),
            and(
              eq(commOutbox.status, 'failed'),
              sql`COALESCE((${commOutbox.metadata} ->> 'attemptCount')::int, 0) < ${MAX_ATTEMPTS}`,
              sql`COALESCE((${commOutbox.metadata} ->> 'nextAttemptAt')::timestamptz, ${now}) <= ${now}`
            )
          )
        )
      )
      .orderBy(asc(commOutbox.createdAt))
      .limit(limit);

    for (const row of rows) {
      const [locked] = await db
        .update(commOutbox)
        .set({ status: 'sending', updatedAt: new Date() })
        .where(and(eq(commOutbox.id, row.id), or(eq(commOutbox.status, 'queued'), eq(commOutbox.status, 'failed'))))
        .returning();
      if (!locked) continue;
      await dispatchRow(db, row);
    }
  });
}

export async function dispatchDueCommMessages(params: { orgId?: string; limit?: number }): Promise<void> {
  const limit = params.limit ?? 50;
  if (params.orgId) {
    await dispatchForOrg(params.orgId, limit);
    return;
  }

  const db = getDb();
  const orgRows = await db.select({ id: orgs.id }).from(orgs);
  for (const row of orgRows) {
    await dispatchForOrg(row.id, limit);
  }
}
