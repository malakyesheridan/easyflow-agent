import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { announcements, announcementAcknowledgements } from '@/db/schema/announcements';
import { ok, err, type Result } from '@/lib/result';
import { announcementListQuerySchema, type ListAnnouncementQuery } from '@/lib/validators/announcements';

export type AnnouncementListItem = {
  id: string;
  orgId: string;
  title: string;
  message: string;
  priority: 'normal' | 'urgent';
  recipientsType: 'all' | 'selected';
  createdByCrewMemberId: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
};

export async function listAnnouncements(query: ListAnnouncementQuery): Promise<Result<AnnouncementListItem[]>> {
  try {
    const validated = announcementListQuerySchema.parse(query);
    const db = getDb();
    const limit = validated.limit ?? 50;

    const rows = await db
      .select({
        id: announcements.id,
        orgId: announcements.orgId,
        title: announcements.title,
        message: announcements.message,
        priority: announcements.priority,
        recipientsType: announcements.recipientsType,
        createdByCrewMemberId: announcements.createdByCrewMemberId,
        createdAt: announcements.createdAt,
        acknowledgedAt: announcementAcknowledgements.acknowledgedAt,
      })
      .from(announcements)
      .leftJoin(
        announcementAcknowledgements,
        and(
          eq(announcementAcknowledgements.orgId, announcements.orgId),
          eq(announcementAcknowledgements.announcementId, announcements.id)
        )
      )
      .where(
        and(
          eq(announcements.orgId, validated.orgId),
          validated.priority ? eq(announcements.priority, validated.priority) : sql`true`,
          validated.unacknowledgedOnly ? isNull(announcementAcknowledgements.id) : sql`true`
        )
      )
      .orderBy(desc(announcements.createdAt))
      .limit(limit);

    return ok(
      rows.map((r) => ({
        id: String(r.id),
        orgId: String(r.orgId),
        title: String(r.title),
        message: String(r.message),
        priority: String(r.priority) as any,
        recipientsType: String(r.recipientsType) as any,
        createdByCrewMemberId: r.createdByCrewMemberId ? String(r.createdByCrewMemberId) : null,
        createdAt: (r.createdAt as Date).toISOString(),
        acknowledgedAt: r.acknowledgedAt ? (r.acknowledgedAt as Date).toISOString() : null,
      }))
    );
  } catch (error) {
    console.error('Error listing announcements:', error);
    return err('INTERNAL_ERROR', 'Failed to list announcements', error);
  }
}

