import { z } from 'zod';
import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { contacts } from '@/db/schema/contacts';
import { contactTags } from '@/db/schema/contact_tags';
import { contactActivities } from '@/db/schema/contact_activities';
import { tags } from '@/db/schema/tags';
import { appraisals } from '@/db/schema/appraisals';
import { appraisalFollowups } from '@/db/schema/appraisal_followups';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { listings } from '@/db/schema/listings';
import { createNotificationBestEffort } from '@/lib/mutations/notifications';
import { buildNotificationKey } from '@/lib/notifications/keys';
import { buildListingLabel, formatShortDate, formatShortDateTime } from '@/lib/notifications/format';
import { scoreSellerIntent } from '@/lib/prospecting/score';

const sweepSchema = z.object({
  orgId: z.string().trim().min(1),
  dryRun: z.boolean().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function daysBetween(now: Date, then: Date) {
  return Math.floor((now.getTime() - then.getTime()) / DAY_MS);
}

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = sweepSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) {
    return err('FORBIDDEN', 'Insufficient permissions');
  }

  const db = getDb();
  const now = new Date();
  const soon = addHours(now, 24);
  const dryRun = parsed.data.dryRun === true;

  const attempts: Record<string, number> = {};
  const recordAttempt = (type: string) => {
    attempts[type] = (attempts[type] ?? 0) + 1;
  };

  const notify = async (payload: Parameters<typeof createNotificationBestEffort>[0]) => {
    recordAttempt(payload.type);
    if (!dryRun) {
      await createNotificationBestEffort(payload);
    }
  };

  const contactOverdueRows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      nextTouchAt: contacts.nextTouchAt,
      ownerUserId: contacts.ownerUserId,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, context.data.orgId),
        isNotNull(contacts.nextTouchAt),
        lt(contacts.nextTouchAt, now),
        eq(contacts.doNotContact, false)
      )
    );

  for (const row of contactOverdueRows) {
    const recipientUserId = row.ownerUserId ? String(row.ownerUserId) : context.data.actor.userId ?? null;
    if (!recipientUserId || !row.nextTouchAt) continue;
    await notify({
      orgId: context.data.orgId,
      type: 'contact_followup_overdue',
      title: 'Contact follow-up overdue',
      body: `${row.fullName} was due ${formatShortDate(row.nextTouchAt)}.`,
      severity: 'critical',
      entityType: 'contact',
      entityId: String(row.id),
      deepLink: `/contacts/${row.id}`,
      recipientUserId,
      eventKey: buildNotificationKey({
        type: 'contact_followup_overdue',
        entityId: String(row.id),
        date: now,
      }),
    });
  }

  const hotProspectRows = await db
    .select({
      id: contacts.id,
      fullName: contacts.fullName,
      role: contacts.role,
      temperature: contacts.temperature,
      sellerStage: contacts.sellerStage,
      lastTouchAt: contacts.lastTouchAt,
      nextTouchAt: contacts.nextTouchAt,
      ownerUserId: contacts.ownerUserId,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, context.data.orgId),
        inArray(contacts.role, ['seller', 'both']),
        eq(contacts.doNotContact, false)
      )
    );

  const hotContactIds = hotProspectRows.map((row) => String(row.id));

  const hotTags = hotContactIds.length
    ? await db
        .select({
          contactId: contactTags.contactId,
          name: tags.name,
        })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, hotContactIds))
    : [];

  const tagsByContact = new Map<string, string[]>();
  hotTags.forEach((row) => {
    const contactId = String(row.contactId);
    const existing = tagsByContact.get(contactId) ?? [];
    existing.push(row.name);
    tagsByContact.set(contactId, existing);
  });

  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);
  const activityRows = hotContactIds.length
    ? await db
        .select({
          contactId: contactActivities.contactId,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(contactActivities)
        .where(
          and(
            eq(contactActivities.orgId, context.data.orgId),
            inArray(contactActivities.contactId, hotContactIds),
            gte(contactActivities.occurredAt, ninetyDaysAgo)
          )
        )
        .groupBy(contactActivities.contactId)
    : [];

  const activityCounts = new Map(activityRows.map((row) => [String(row.contactId), Number(row.count ?? 0)]));

  for (const row of hotProspectRows) {
    const contactId = String(row.id);
    const { score } = scoreSellerIntent(
      {
        role: row.role,
        temperature: row.temperature,
        sellerStage: row.sellerStage ?? null,
        lastTouchAt: row.lastTouchAt ?? null,
        nextTouchAt: row.nextTouchAt ?? null,
        tags: tagsByContact.get(contactId) ?? [],
      },
      activityCounts.get(contactId) ?? 0,
      now
    );

    if (score < 80) continue;
    const recipientUserId = row.ownerUserId ? String(row.ownerUserId) : context.data.actor.userId ?? null;
    if (!recipientUserId) continue;
    await notify({
      orgId: context.data.orgId,
      type: 'new_hot_prospect',
      title: 'Hot prospect surfaced',
      body: `${row.fullName} is trending hot for seller intent.`,
      severity: 'info',
      entityType: 'contact',
      entityId: contactId,
      deepLink: `/contacts/${contactId}`,
      recipientUserId,
      eventKey: buildNotificationKey({
        type: 'new_hot_prospect',
        entityId: contactId,
        date: now,
      }),
    });
  }

  const appraisalUpcomingRows = await db
    .select({
      id: appraisals.id,
      appointmentAt: appraisals.appointmentAt,
      ownerUserId: appraisals.ownerUserId,
      contactName: contacts.fullName,
    })
    .from(appraisals)
    .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
    .where(
      and(
        eq(appraisals.orgId, context.data.orgId),
        gte(appraisals.appointmentAt, now),
        lt(appraisals.appointmentAt, soon)
      )
    );

  for (const row of appraisalUpcomingRows) {
    const recipientUserId = row.ownerUserId ? String(row.ownerUserId) : context.data.actor.userId ?? null;
    if (!recipientUserId) continue;
    await notify({
      orgId: context.data.orgId,
      type: 'appraisal_upcoming',
      title: 'Appraisal upcoming',
      body: `${row.contactName ?? 'Client'} - ${formatShortDateTime(row.appointmentAt)}`,
      severity: 'warn',
      entityType: 'appraisal',
      entityId: String(row.id),
      deepLink: `/appraisals/${row.id}`,
      recipientUserId,
      eventKey: buildNotificationKey({
        type: 'appraisal_upcoming',
        entityId: String(row.id),
        date: row.appointmentAt,
      }),
    });
  }

  const followupRows = await db
    .select({
      id: appraisalFollowups.id,
      dueAt: appraisalFollowups.dueAt,
      title: appraisalFollowups.title,
      appraisalId: appraisalFollowups.appraisalId,
      ownerUserId: appraisals.ownerUserId,
      contactName: contacts.fullName,
    })
    .from(appraisalFollowups)
    .innerJoin(appraisals, eq(appraisalFollowups.appraisalId, appraisals.id))
    .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
    .where(
      and(
        eq(appraisalFollowups.orgId, context.data.orgId),
        eq(appraisalFollowups.isDone, false),
        lt(appraisalFollowups.dueAt, soon)
      )
    );

  for (const row of followupRows) {
    const recipientUserId = row.ownerUserId ? String(row.ownerUserId) : context.data.actor.userId ?? null;
    if (!recipientUserId) continue;
    const overdue = row.dueAt.getTime() < now.getTime();
    await notify({
      orgId: context.data.orgId,
      type: 'appraisal_followup_due',
      title: 'Appraisal follow-up due',
      body: `${row.contactName ?? 'Client'} - ${row.title} due ${formatShortDate(row.dueAt)}`,
      severity: overdue ? 'critical' : 'warn',
      entityType: 'appraisal',
      entityId: String(row.appraisalId),
      deepLink: `/appraisals/${row.appraisalId}`,
      recipientUserId,
      eventKey: buildNotificationKey({
        type: 'appraisal_followup_due',
        entityId: String(row.id),
        date: row.dueAt,
      }),
    });
  }

  const listingRows = await db
    .select({
      id: listings.id,
      ownerUserId: listings.ownerUserId,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      status: listings.status,
      listedAt: listings.listedAt,
      createdAt: listings.createdAt,
      campaignHealthScore: listings.campaignHealthScore,
      reportCadenceEnabled: listings.reportCadenceEnabled,
      reportNextDueAt: listings.reportNextDueAt,
      reportLastSentAt: listings.reportLastSentAt,
    })
    .from(listings)
    .where(eq(listings.orgId, context.data.orgId));

  const vendorCommRows = await db
    .select({
      listingId: listingVendorComms.listingId,
      lastCommAt: sql<Date | null>`max(${listingVendorComms.occurredAt})`.mapWith((value) => value as Date | null),
    })
    .from(listingVendorComms)
    .where(eq(listingVendorComms.orgId, context.data.orgId))
    .groupBy(listingVendorComms.listingId);

  const vendorCommMap = new Map(vendorCommRows.map((row) => [String(row.listingId), row.lastCommAt]));

  for (const listing of listingRows) {
    const listingId = String(listing.id);
    const recipientUserId = listing.ownerUserId ? String(listing.ownerUserId) : context.data.actor.userId ?? null;
    if (!recipientUserId) continue;

    const label = buildListingLabel(listing.addressLine1 ?? null, listing.suburb ?? null);

    if (listing.status === 'active' && listing.reportCadenceEnabled && listing.reportNextDueAt && listing.reportNextDueAt <= soon) {
      const overdue = listing.reportNextDueAt.getTime() < now.getTime();
      await notify({
        orgId: context.data.orgId,
        type: 'vendor_report_due',
        title: overdue ? 'Vendor report overdue' : 'Vendor report due soon',
        body: `Report for ${label} due ${formatShortDate(listing.reportNextDueAt)}.`,
        severity: overdue ? 'critical' : 'warn',
        entityType: 'listing',
        entityId: listingId,
        deepLink: `/listings/${listingId}?tab=reports`,
        recipientUserId,
        eventKey: buildNotificationKey({
          type: 'vendor_report_due',
          entityId: listingId,
          date: listing.reportNextDueAt,
        }),
      });
    }

    const lastComm = vendorCommMap.get(listingId) ?? listing.reportLastSentAt ?? null;
    const baseline = lastComm ?? listing.listedAt ?? listing.createdAt ?? null;
    if (baseline && listing.status === 'active') {
      const days = daysBetween(now, baseline);
      if (days > 7) {
        await notify({
          orgId: context.data.orgId,
          type: 'vendor_update_overdue',
          title: 'Vendor update overdue',
          body: `${label} has not been updated in ${days} days.`,
          severity: days > 14 ? 'critical' : 'warn',
          entityType: 'listing',
          entityId: listingId,
          deepLink: `/listings/${listingId}?tab=vendor-comms`,
          recipientUserId,
          eventKey: buildNotificationKey({
            type: 'vendor_update_overdue',
            entityId: listingId,
            date: now,
          }),
        });
      }
    }

    if (listing.status === 'active' && listing.campaignHealthScore !== null && listing.campaignHealthScore < 40) {
      await notify({
        orgId: context.data.orgId,
        type: 'listing_health_stalling',
        title: 'Listing health stalling',
        body: `${label} health is ${listing.campaignHealthScore}. Review milestones and activity.`,
        severity: listing.campaignHealthScore < 25 ? 'critical' : 'warn',
        entityType: 'listing',
        entityId: listingId,
        deepLink: `/listings/${listingId}`,
        recipientUserId,
        eventKey: buildNotificationKey({
          type: 'listing_health_stalling',
          entityId: listingId,
          date: now,
        }),
      });
    }
  }

  const milestoneRows = await db
    .select({
      id: listingMilestones.id,
      name: listingMilestones.name,
      targetDueAt: listingMilestones.targetDueAt,
      listingId: listingMilestones.listingId,
      ownerUserId: listings.ownerUserId,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
    })
    .from(listingMilestones)
    .innerJoin(listings, eq(listingMilestones.listingId, listings.id))
    .where(
      and(
        eq(listingMilestones.orgId, context.data.orgId),
        isNull(listingMilestones.completedAt),
        isNotNull(listingMilestones.targetDueAt),
        lt(listingMilestones.targetDueAt, now)
      )
    );

  for (const row of milestoneRows) {
    const recipientUserId = row.ownerUserId ? String(row.ownerUserId) : context.data.actor.userId ?? null;
    if (!recipientUserId || !row.targetDueAt) continue;
    const label = buildListingLabel(row.addressLine1 ?? null, row.suburb ?? null);
    const overdueDays = daysBetween(now, row.targetDueAt);
    await notify({
      orgId: context.data.orgId,
      type: 'listing_milestone_overdue',
      title: 'Listing milestone overdue',
      body: `${label} - ${row.name} was due ${formatShortDate(row.targetDueAt)}.`,
      severity: overdueDays > 7 ? 'critical' : 'warn',
      entityType: 'listing',
      entityId: String(row.listingId),
      deepLink: `/listings/${row.listingId}?tab=milestones`,
      recipientUserId,
      eventKey: buildNotificationKey({
        type: 'listing_milestone_overdue',
        entityId: String(row.id),
        date: row.targetDueAt,
      }),
    });
  }

  return ok({ attempted: attempts, dryRun });
});
