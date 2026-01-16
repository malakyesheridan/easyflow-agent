import { z } from 'zod';
import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { calendarEvents } from '@/db/schema/calendar_events';
import { listingInspections } from '@/db/schema/listing_inspections';
import { listings } from '@/db/schema/listings';
import { appraisals } from '@/db/schema/appraisals';
import { contacts } from '@/db/schema/contacts';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { orgSettings } from '@/db/schema/org_settings';
import { contactTags } from '@/db/schema/contact_tags';
import { tags } from '@/db/schema/tags';
import { contactActivities } from '@/db/schema/contact_activities';
import { scoreSellerIntent } from '@/lib/prospecting/score';

const eventTypes = [
  'call_block',
  'vendor_update',
  'appraisal',
  'open_home',
  'private_inspection',
  'meeting',
  'admin',
  'followup_block',
  'reminder',
] as const;

const statusTypes = ['scheduled', 'completed', 'cancelled'] as const;

const relatedEntityTypes = ['contact', 'appraisal', 'listing', 'report', 'none'] as const;

const sourceTypes = [
  'contact_followup',
  'appraisal_checklist_item',
  'appraisal_followup',
  'listing_checklist_item',
  'listing_milestone',
  'buyer_followup',
  'vendor_report_due',
  'vendor_comm_overdue',
] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  type: z.enum(eventTypes),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  all_day: z.boolean().optional(),
  timezone: z.string().trim().optional(),
  location: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  related_entity_type: z.enum(relatedEntityTypes).optional(),
  related_entity_id: z.string().trim().optional(),
  source_type: z.enum(sourceTypes).optional(),
  source_id: z.string().trim().optional(),
  assigned_to_user_id: z.string().trim().optional(),
  status: z.enum(statusTypes).optional(),
  reminder_minutes: z.array(z.number().int()).optional(),
});

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toISOString(value: Date | string | null | undefined) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addMinutes(date: Date, minutes: number) {
  const value = new Date(date);
  value.setMinutes(value.getMinutes() + minutes);
  return value;
}

function buildListingLabel(address: string | null, suburb: string | null) {
  if (address && suburb) return `${address}, ${suburb}`;
  return address || suburb || 'Listing';
}

type CalendarEventDto = {
  id: string;
  kind: 'stored' | 'inspection' | 'appraisal' | 'reminder';
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  type: string;
  status: string | null;
  timezone: string | null;
  location: string | null;
  notes: string | null;
  related: {
    type: string;
    id: string | null;
    label: string | null;
    link: string | null;
  };
  source: {
    type: string | null;
    id: string | null;
  };
  context: {
    seller_intent_score: number | null;
    win_probability: number | null;
    campaign_health: number | null;
  };
  can_edit: boolean;
};

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  if (!startParam || !endParam) {
    return err('VALIDATION_ERROR', 'Start and end dates are required');
  }

  const start = new Date(startParam);
  const end = new Date(endParam);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid date range');
  }

  const db = getDb();

  const storedRows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      type: calendarEvents.type,
      startsAt: calendarEvents.startsAt,
      endsAt: calendarEvents.endsAt,
      allDay: calendarEvents.allDay,
      timezone: calendarEvents.timezone,
      location: calendarEvents.location,
      notes: calendarEvents.notes,
      relatedEntityType: calendarEvents.relatedEntityType,
      relatedEntityId: calendarEvents.relatedEntityId,
      sourceType: calendarEvents.sourceType,
      sourceId: calendarEvents.sourceId,
      status: calendarEvents.status,
    })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.orgId, context.data.orgId),
        lte(calendarEvents.startsAt, end),
        gte(calendarEvents.endsAt, start)
      )
    );

  const listingIds = storedRows
    .filter((row) => row.relatedEntityType === 'listing' && row.relatedEntityId)
    .map((row) => String(row.relatedEntityId));

  const contactIds = storedRows
    .filter((row) => row.relatedEntityType === 'contact' && row.relatedEntityId)
    .map((row) => String(row.relatedEntityId));

  const appraisalIds = storedRows
    .filter((row) => row.relatedEntityType === 'appraisal' && row.relatedEntityId)
    .map((row) => String(row.relatedEntityId));

  const [listingRows, contactRows, appraisalRows] = await Promise.all([
    listingIds.length
      ? db
          .select({
            id: listings.id,
            addressLine1: listings.addressLine1,
            suburb: listings.suburb,
            campaignHealthScore: listings.campaignHealthScore,
          })
          .from(listings)
          .where(and(eq(listings.orgId, context.data.orgId), inArray(listings.id, listingIds)))
      : [],
    contactIds.length
      ? db
          .select({
            id: contacts.id,
            fullName: contacts.fullName,
            role: contacts.role,
            temperature: contacts.temperature,
            sellerStage: contacts.sellerStage,
            lastTouchAt: contacts.lastTouchAt,
            nextTouchAt: contacts.nextTouchAt,
          })
          .from(contacts)
          .where(and(eq(contacts.orgId, context.data.orgId), inArray(contacts.id, contactIds)))
      : [],
    appraisalIds.length
      ? db
          .select({
            id: appraisals.id,
            contactName: contacts.fullName,
            winProbabilityScore: appraisals.winProbabilityScore,
          })
          .from(appraisals)
          .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
          .where(and(eq(appraisals.orgId, context.data.orgId), inArray(appraisals.id, appraisalIds)))
      : [],
  ]);

  const listingMap = new Map(
    listingRows.map((row) => [
      String(row.id),
      {
        label: buildListingLabel(row.addressLine1 ?? null, row.suburb ?? null),
        campaignHealth: row.campaignHealthScore ?? null,
      },
    ])
  );

  const contactMap = new Map(
    contactRows.map((row) => [
      String(row.id),
      {
        fullName: row.fullName,
        role: row.role,
        temperature: row.temperature,
        sellerStage: row.sellerStage ?? null,
        lastTouchAt: row.lastTouchAt ?? null,
        nextTouchAt: row.nextTouchAt ?? null,
      },
    ])
  );

  const appraisalMap = new Map(
    appraisalRows.map((row) => [
      String(row.id),
      {
        label: row.contactName ?? 'Appraisal',
        winProbability: row.winProbabilityScore ?? null,
      },
    ])
  );

  const tagRows = contactIds.length
    ? await db
        .select({
          contactId: contactTags.contactId,
          name: tags.name,
        })
        .from(contactTags)
        .innerJoin(tags, eq(contactTags.tagId, tags.id))
        .where(inArray(contactTags.contactId, contactIds))
    : [];

  const tagsByContact = new Map<string, string[]>();
  tagRows.forEach((row) => {
    const contactId = String(row.contactId);
    const current = tagsByContact.get(contactId) ?? [];
    current.push(row.name);
    tagsByContact.set(contactId, current);
  });

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const activityRows = contactIds.length
    ? await db
        .select({
          contactId: contactActivities.contactId,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(contactActivities)
        .where(
          and(
            eq(contactActivities.orgId, context.data.orgId),
            inArray(contactActivities.contactId, contactIds),
            gte(contactActivities.occurredAt, ninetyDaysAgo)
          )
        )
        .groupBy(contactActivities.contactId)
    : [];

  const activityCounts = new Map(activityRows.map((row) => [String(row.contactId), Number(row.count ?? 0)]));

  const contactIntentMap = new Map<string, number>();
  contactMap.forEach((contact, id) => {
    const { score } = scoreSellerIntent(
      {
        role: contact.role,
        temperature: contact.temperature,
        sellerStage: contact.sellerStage,
        lastTouchAt: toDate(contact.lastTouchAt),
        nextTouchAt: toDate(contact.nextTouchAt),
        tags: tagsByContact.get(id) ?? [],
      },
      activityCounts.get(id) ?? 0,
      new Date()
    );
    contactIntentMap.set(id, score);
  });

  const storedEvents: CalendarEventDto[] = storedRows.map((row) => {
    const relatedId = row.relatedEntityId ? String(row.relatedEntityId) : null;
    const relatedType = row.relatedEntityType ?? 'none';
    const sourceType = row.sourceType ? String(row.sourceType) : null;
    const sourceId = row.sourceId ? String(row.sourceId) : null;
    const listing = relatedType === 'listing' && relatedId ? listingMap.get(relatedId) : null;
    const contact = relatedType === 'contact' && relatedId ? contactMap.get(relatedId) : null;
    const appraisal = relatedType === 'appraisal' && relatedId ? appraisalMap.get(relatedId) : null;

    const relatedLabel = listing?.label ?? appraisal?.label ?? contact?.fullName ?? null;
    const relatedLink =
      relatedType === 'listing' && relatedId
        ? `/listings/${relatedId}`
        : relatedType === 'contact' && relatedId
          ? `/contacts/${relatedId}`
          : relatedType === 'appraisal' && relatedId
            ? `/appraisals/${relatedId}`
            : null;

    return {
      id: String(row.id),
      kind: 'stored',
      title: row.title,
      starts_at: toISOString(row.startsAt) ?? new Date().toISOString(),
      ends_at: toISOString(row.endsAt) ?? new Date().toISOString(),
      all_day: Boolean(row.allDay),
      type: row.type,
      status: row.status ?? null,
      timezone: row.timezone ?? null,
      location: row.location ?? null,
      notes: row.notes ?? null,
      related: {
        type: relatedType,
        id: relatedId,
        label: relatedLabel,
        link: relatedLink,
      },
      source: {
        type: sourceType,
        id: sourceId,
      },
      context: {
        seller_intent_score: relatedType === 'contact' && relatedId ? contactIntentMap.get(relatedId) ?? null : null,
        win_probability: relatedType === 'appraisal' && relatedId ? appraisal?.winProbability ?? null : null,
        campaign_health: relatedType === 'listing' && relatedId ? listing?.campaignHealth ?? null : null,
      },
      can_edit: true,
    };
  });

  const inspectionRows = await db
    .select({
      id: listingInspections.id,
      type: listingInspections.type,
      startsAt: listingInspections.startsAt,
      endsAt: listingInspections.endsAt,
      listingId: listings.id,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      campaignHealthScore: listings.campaignHealthScore,
    })
    .from(listingInspections)
    .innerJoin(listings, eq(listingInspections.listingId, listings.id))
    .where(
      and(
        eq(listingInspections.orgId, context.data.orgId),
        gte(listingInspections.startsAt, start),
        lte(listingInspections.startsAt, end)
      )
    );

  const inspectionEvents: CalendarEventDto[] = inspectionRows.map((row) => {
    const listingId = String(row.listingId);
    const label = buildListingLabel(row.addressLine1 ?? null, row.suburb ?? null);
    const startsAt = toDate(row.startsAt) ?? new Date();
    const endsAt = toDate(row.endsAt) ?? addMinutes(startsAt, 60);
    return {
      id: `inspection-${row.id}`,
      kind: 'inspection',
      title: row.type === 'private' ? `Private inspection - ${label}` : `Open home - ${label}`,
      starts_at: toISOString(startsAt) ?? new Date().toISOString(),
      ends_at: toISOString(endsAt) ?? new Date().toISOString(),
      all_day: false,
      type: row.type === 'private' ? 'private_inspection' : 'open_home',
      status: 'scheduled',
      timezone: null,
      location: null,
      notes: null,
      related: {
        type: 'listing',
        id: listingId,
        label,
        link: `/listings/${listingId}?tab=inspections`,
      },
      source: {
        type: 'inspection',
        id: String(row.id),
      },
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealthScore ?? null,
      },
      can_edit: false,
    };
  });

  const calendarAppraisalRows = await db
    .select({
      id: appraisals.id,
      appointmentAt: appraisals.appointmentAt,
      meetingType: appraisals.meetingType,
      suburb: appraisals.suburb,
      winProbabilityScore: appraisals.winProbabilityScore,
      contactName: contacts.fullName,
    })
    .from(appraisals)
    .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
    .where(
      and(
        eq(appraisals.orgId, context.data.orgId),
        gte(appraisals.appointmentAt, start),
        lte(appraisals.appointmentAt, end)
      )
    );

  const appraisalEvents: CalendarEventDto[] = calendarAppraisalRows.map((row) => {
    const startsAt = toDate(row.appointmentAt) ?? new Date();
    const endsAt = addMinutes(startsAt, 60);
    const label = row.contactName ?? 'Appraisal';
    return {
      id: `appraisal-${row.id}`,
      kind: 'appraisal',
      title: `Appraisal - ${label}`,
      starts_at: toISOString(startsAt) ?? new Date().toISOString(),
      ends_at: toISOString(endsAt) ?? new Date().toISOString(),
      all_day: false,
      type: 'appraisal',
      status: 'scheduled',
      timezone: null,
      location: row.suburb ?? null,
      notes: null,
      related: {
        type: 'appraisal',
        id: String(row.id),
        label,
        link: `/appraisals/${row.id}`,
      },
      source: {
        type: 'appraisal',
        id: String(row.id),
      },
      context: {
        seller_intent_score: null,
        win_probability: row.winProbabilityScore ?? null,
        campaign_health: null,
      },
      can_edit: false,
    };
  });

  const milestoneRows = await db
    .select({
      id: listingMilestones.id,
      name: listingMilestones.name,
      targetDueAt: listingMilestones.targetDueAt,
      listingId: listings.id,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      campaignHealthScore: listings.campaignHealthScore,
    })
    .from(listingMilestones)
    .innerJoin(listings, eq(listingMilestones.listingId, listings.id))
    .where(
      and(
        eq(listingMilestones.orgId, context.data.orgId),
        isNull(listingMilestones.completedAt),
        isNotNull(listingMilestones.targetDueAt),
        gte(listingMilestones.targetDueAt, start),
        lte(listingMilestones.targetDueAt, end)
      )
    );

  const milestoneReminders: CalendarEventDto[] = milestoneRows.map((row) => {
    const dueDate = toDate(row.targetDueAt) ?? new Date();
    const listingId = String(row.listingId);
    const label = buildListingLabel(row.addressLine1 ?? null, row.suburb ?? null);
    return {
      id: `milestone-${row.id}`,
      kind: 'reminder',
      title: `Milestone due - ${row.name}`,
      starts_at: toISOString(startOfDay(dueDate)) ?? new Date().toISOString(),
      ends_at: toISOString(endOfDay(dueDate)) ?? new Date().toISOString(),
      all_day: true,
      type: 'reminder',
      status: 'scheduled',
      timezone: null,
      location: null,
      notes: null,
      related: {
        type: 'listing',
        id: listingId,
        label,
        link: `/listings/${listingId}?tab=milestones`,
      },
      source: {
        type: 'listing_milestone',
        id: String(row.id),
      },
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealthScore ?? null,
      },
      can_edit: false,
    };
  });

  const reportRows = await db
    .select({
      id: listings.id,
      reportNextDueAt: listings.reportNextDueAt,
      reportCadenceType: listings.reportCadenceType,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      campaignHealthScore: listings.campaignHealthScore,
    })
    .from(listings)
    .where(
      and(
        eq(listings.orgId, context.data.orgId),
        eq(listings.status, 'active'),
        eq(listings.reportCadenceEnabled, true),
        isNotNull(listings.reportNextDueAt),
        gte(listings.reportNextDueAt, start),
        lte(listings.reportNextDueAt, end)
      )
    );

  const reportReminders: CalendarEventDto[] = reportRows.map((row) => {
    const dueDate = toDate(row.reportNextDueAt) ?? new Date();
    const listingId = String(row.id);
    const label = buildListingLabel(row.addressLine1 ?? null, row.suburb ?? null);
    return {
      id: `report-${row.id}`,
      kind: 'reminder',
      title: `Vendor report due - ${label}`,
      starts_at: toISOString(startOfDay(dueDate)) ?? new Date().toISOString(),
      ends_at: toISOString(endOfDay(dueDate)) ?? new Date().toISOString(),
      all_day: true,
      type: 'reminder',
      status: 'scheduled',
      timezone: null,
      location: null,
      notes: null,
      related: {
        type: 'listing',
        id: listingId,
        label,
        link: `/listings/${listingId}?tab=reports`,
      },
      source: {
        type: 'vendor_report_due',
        id: listingId,
      },
      context: {
        seller_intent_score: null,
        win_probability: null,
        campaign_health: row.campaignHealthScore ?? null,
      },
      can_edit: false,
    };
  });

  const events = [...storedEvents, ...inspectionEvents, ...appraisalEvents, ...milestoneReminders, ...reportReminders]
    .filter((event) => event.starts_at && event.ends_at)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  return ok({ data: events });
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;

  const db = getDb();
  const start = new Date(parsed.data.starts_at);
  const end = new Date(parsed.data.ends_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return err('VALIDATION_ERROR', 'Invalid start/end times');
  }

  const isAllDay = parsed.data.all_day ?? false;
  const startTime = isAllDay ? startOfDay(start) : start;
  const endTime = isAllDay ? endOfDay(start) : end;

  const settings = await db
    .select({ timezone: orgSettings.timezone })
    .from(orgSettings)
    .where(eq(orgSettings.orgId, context.data.orgId));

  const timezone = parsed.data.timezone ?? settings[0]?.timezone ?? 'UTC';

  const now = new Date();
  const [row] = await db
    .insert(calendarEvents)
    .values({
      orgId: context.data.orgId,
      title: parsed.data.title,
      type: parsed.data.type,
      startsAt: startTime,
      endsAt: endTime,
      allDay: isAllDay,
      timezone,
      location: parsed.data.location ?? null,
      notes: parsed.data.notes ?? null,
      relatedEntityType: parsed.data.related_entity_type ?? 'none',
      relatedEntityId: parsed.data.related_entity_id ?? null,
      sourceType: parsed.data.source_type ?? null,
      sourceId: parsed.data.source_id ?? null,
      assignedToUserId: parsed.data.assigned_to_user_id ?? null,
      status: parsed.data.status ?? 'scheduled',
      reminderMinutes: parsed.data.reminder_minutes ?? null,
      createdByUserId: context.data.actor.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: calendarEvents.id });

  if (!row?.id) {
    return err('INTERNAL_ERROR', 'Failed to create event');
  }

  return ok({ id: String(row.id) });
});
