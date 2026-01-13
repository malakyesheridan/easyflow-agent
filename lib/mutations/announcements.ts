import { getDb } from '@/lib/db';
import {
  announcements,
  announcementRecipients,
  announcementAcknowledgements,
  type Announcement,
  type NewAnnouncement,
} from '@/db/schema/announcements';
import { ok, err, type Result } from '@/lib/result';
import { announcementAcknowledgeSchema, announcementCreateSchema, type AcknowledgeAnnouncementInput, type CreateAnnouncementInput } from '@/lib/validators/announcements';
import { emitCommEvent } from '@/lib/communications/emit';
import { orgMemberships } from '@/db/schema/org_memberships';
import { users } from '@/db/schema/users';
import { and, eq, inArray } from 'drizzle-orm';

export async function createAnnouncement(input: CreateAnnouncementInput & { createdByCrewMemberId?: string | null }): Promise<Result<Announcement>> {
  try {
    const validated = announcementCreateSchema.parse(input);
    const db = getDb();

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(announcements)
        .values({
          orgId: validated.orgId,
          title: validated.title.trim(),
          message: validated.message.trim(),
          priority: validated.priority,
          recipientsType: validated.recipientsType,
          createdByCrewMemberId: input.createdByCrewMemberId ?? null,
          createdAt: new Date(),
        } as NewAnnouncement)
        .returning();

      if (!created) return err('INTERNAL_ERROR', 'Failed to create announcement');

      if (validated.recipientsType === 'selected' && validated.recipientCrewMemberIds && validated.recipientCrewMemberIds.length > 0) {
        await tx
          .insert(announcementRecipients)
          .values(
            validated.recipientCrewMemberIds.map((crewMemberId) => ({
              orgId: validated.orgId,
              announcementId: created.id,
              crewMemberId,
            }))
          )
          .onConflictDoNothing({ target: [announcementRecipients.announcementId, announcementRecipients.crewMemberId] });
      }

      return ok(created);
    });

    if (result.ok) {
      const announcement = result.data;
      let recipientOverrides: Array<{ type: 'user'; userId: string; email: string | null; name: string | null; crewMemberId: string | null }> = [];
      if (validated.recipientsType === 'selected' && validated.recipientCrewMemberIds && validated.recipientCrewMemberIds.length > 0) {
        const db = getDb();
        const rows = await db
          .select({
            userId: orgMemberships.userId,
            crewMemberId: orgMemberships.crewMemberId,
            email: users.email,
            name: users.name,
          })
          .from(orgMemberships)
          .innerJoin(users, eq(orgMemberships.userId, users.id))
          .where(and(eq(orgMemberships.orgId, validated.orgId), inArray(orgMemberships.crewMemberId, validated.recipientCrewMemberIds)));
        recipientOverrides = rows.map((row) => ({
          type: 'user',
          userId: row.userId,
          email: row.email ?? null,
          name: row.name ?? row.email ?? null,
          crewMemberId: row.crewMemberId ?? null,
        }));
      }

      void emitCommEvent({
        orgId: announcement.orgId,
        eventKey: 'announcement_created',
        entityType: 'announcement',
        entityId: announcement.id,
        triggeredByUserId: null,
        payload: {
          announcementId: announcement.id,
          title: announcement.title,
          body: announcement.message,
          urgent: announcement.priority === 'urgent',
          recipientsType: announcement.recipientsType,
          recipients: recipientOverrides.length > 0 ? recipientOverrides : undefined,
        },
      });
      void emitCommEvent({
        orgId: announcement.orgId,
        eventKey: 'announcement_published',
        entityType: 'announcement',
        entityId: announcement.id,
        triggeredByUserId: null,
        payload: {
          announcementId: announcement.id,
          title: announcement.title,
          body: announcement.message,
          urgent: announcement.priority === 'urgent',
          recipientsType: announcement.recipientsType,
          recipients: recipientOverrides.length > 0 ? recipientOverrides : undefined,
        },
      });
    }

    return result;
  } catch (error) {
    console.error('Error creating announcement:', error);
    return err('INTERNAL_ERROR', 'Failed to create announcement', error);
  }
}

export async function acknowledgeAnnouncement(input: AcknowledgeAnnouncementInput): Promise<Result<{ acknowledgedAt: string }>> {
  try {
    const validated = announcementAcknowledgeSchema.parse(input);
    const db = getDb();

    await db
      .insert(announcementAcknowledgements)
      .values({
        orgId: validated.orgId,
        announcementId: validated.announcementId,
        acknowledgedByCrewMemberId: validated.acknowledgedByCrewMemberId ?? null,
        acknowledgedAt: new Date(),
      })
      .onConflictDoNothing({ target: announcementAcknowledgements.announcementId });

    const [row] = await db
      .select({ acknowledgedAt: announcementAcknowledgements.acknowledgedAt })
      .from(announcementAcknowledgements)
      .where(and(eq(announcementAcknowledgements.orgId, validated.orgId), eq(announcementAcknowledgements.announcementId, validated.announcementId)))
      .limit(1);

    return ok({ acknowledgedAt: (row?.acknowledgedAt ?? new Date()).toISOString() });
  } catch (error) {
    console.error('Error acknowledging announcement:', error);
    return err('INTERNAL_ERROR', 'Failed to acknowledge announcement', error);
  }
}
