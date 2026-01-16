import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { calendarEvents } from '@/db/schema/calendar_events';
import { followupSnoozes } from '@/db/schema/followup_snoozes';
import { contacts } from '@/db/schema/contacts';
import { appraisals } from '@/db/schema/appraisals';
import { appraisalFollowups } from '@/db/schema/appraisal_followups';
import { appraisalChecklistItems } from '@/db/schema/appraisal_checklist_items';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { listings } from '@/db/schema/listings';
import { orgSettings } from '@/db/schema/org_settings';

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

type SourceType = typeof sourceTypes[number];

type EventType =
  | 'call_block'
  | 'vendor_update'
  | 'appraisal'
  | 'open_home'
  | 'private_inspection'
  | 'meeting'
  | 'admin'
  | 'followup_block'
  | 'reminder';

type RelatedEntityType = 'contact' | 'appraisal' | 'listing' | 'report' | 'none';

const scheduleSchema = z.object({
  orgId: z.string().trim().min(1),
  source_type: z.enum(sourceTypes),
  source_id: z.string().trim().min(1),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  timezone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  location: z.string().trim().optional(),
});

function buildListingLabel(address: string | null, suburb: string | null) {
  if (address && suburb) return `${address}, ${suburb}`;
  return address || suburb || 'Listing';
}

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;

  const startsAt = new Date(parsed.data.starts_at);
  const endsAt = new Date(parsed.data.ends_at);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return err('VALIDATION_ERROR', 'Invalid start/end times');
  }

  const db = getDb();
  const sourceType: SourceType = parsed.data.source_type;
  const sourceId = parsed.data.source_id;

  let relatedEntityType: RelatedEntityType = 'none';
  let relatedEntityId: string | null = null;
  let eventType: EventType = 'followup_block';
  let title = parsed.data.title ?? 'Follow-up';

  if (sourceType === 'contact_followup') {
    const [row] = await db
      .select({ id: contacts.id, fullName: contacts.fullName })
      .from(contacts)
      .where(and(eq(contacts.orgId, context.data.orgId), eq(contacts.id, sourceId)));

    if (!row?.id) return err('NOT_FOUND', 'Contact not found');
    relatedEntityType = 'contact';
    relatedEntityId = String(row.id);
    eventType = 'call_block';
    title = parsed.data.title ?? `Follow up: ${row.fullName}`;
  }

  if (sourceType === 'appraisal_followup') {
    const [row] = await db
      .select({
        id: appraisalFollowups.id,
        title: appraisalFollowups.title,
        appraisalId: appraisalFollowups.appraisalId,
        contactName: contacts.fullName,
      })
      .from(appraisalFollowups)
      .innerJoin(appraisals, eq(appraisalFollowups.appraisalId, appraisals.id))
      .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
      .where(and(eq(appraisalFollowups.orgId, context.data.orgId), eq(appraisalFollowups.id, sourceId)));

    if (!row?.id) return err('NOT_FOUND', 'Appraisal follow-up not found');
    relatedEntityType = 'appraisal';
    relatedEntityId = String(row.appraisalId);
    eventType = 'appraisal';
    title = parsed.data.title ?? `Appraisal follow-up: ${row.title}`;
  }

  if (sourceType === 'appraisal_checklist_item') {
    const [row] = await db
      .select({
        id: appraisalChecklistItems.id,
        title: appraisalChecklistItems.title,
        appraisalId: appraisalChecklistItems.appraisalId,
        contactName: contacts.fullName,
      })
      .from(appraisalChecklistItems)
      .innerJoin(appraisals, eq(appraisalChecklistItems.appraisalId, appraisals.id))
      .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
      .where(and(eq(appraisalChecklistItems.orgId, context.data.orgId), eq(appraisalChecklistItems.id, sourceId)));

    if (!row?.id) return err('NOT_FOUND', 'Appraisal checklist item not found');
    relatedEntityType = 'appraisal';
    relatedEntityId = String(row.appraisalId);
    eventType = 'appraisal';
    title = parsed.data.title ?? `Appraisal prep: ${row.title}`;
  }

  if (sourceType === 'listing_checklist_item') {
    const [row] = await db
      .select({
        id: listingChecklistItems.id,
        title: listingChecklistItems.title,
        listingId: listingChecklistItems.listingId,
        addressLine1: listings.addressLine1,
        suburb: listings.suburb,
      })
      .from(listingChecklistItems)
      .innerJoin(listings, eq(listingChecklistItems.listingId, listings.id))
      .where(and(eq(listingChecklistItems.orgId, context.data.orgId), eq(listingChecklistItems.id, sourceId)));

    if (!row?.id) return err('NOT_FOUND', 'Listing checklist item not found');
    relatedEntityType = 'listing';
    relatedEntityId = String(row.listingId);
    eventType = 'admin';
    title = parsed.data.title ?? `Listing task: ${row.title}`;
  }

  if (sourceType === 'listing_milestone') {
    const [row] = await db
      .select({
        id: listingMilestones.id,
        name: listingMilestones.name,
        listingId: listingMilestones.listingId,
        addressLine1: listings.addressLine1,
        suburb: listings.suburb,
      })
      .from(listingMilestones)
      .innerJoin(listings, eq(listingMilestones.listingId, listings.id))
      .where(and(eq(listingMilestones.orgId, context.data.orgId), eq(listingMilestones.id, sourceId)));

    if (!row?.id) return err('NOT_FOUND', 'Listing milestone not found');
    relatedEntityType = 'listing';
    relatedEntityId = String(row.listingId);
    eventType = 'reminder';
    title = parsed.data.title ?? `Milestone: ${row.name}`;
  }

  if (sourceType === 'buyer_followup') {
    const [row] = await db
      .select({
        id: listingBuyers.id,
        listingId: listingBuyers.listingId,
        buyerName: contacts.fullName,
        addressLine1: listings.addressLine1,
        suburb: listings.suburb,
      })
      .from(listingBuyers)
      .innerJoin(listings, eq(listingBuyers.listingId, listings.id))
      .innerJoin(contacts, eq(listingBuyers.buyerContactId, contacts.id))
      .where(and(eq(listingBuyers.orgId, context.data.orgId), eq(listingBuyers.id, sourceId)));

    if (!row?.id) return err('NOT_FOUND', 'Buyer follow-up not found');
    relatedEntityType = 'listing';
    relatedEntityId = String(row.listingId);
    eventType = 'followup_block';
    const label = buildListingLabel(row.addressLine1 ?? null, row.suburb ?? null);
    title = parsed.data.title ?? `Buyer follow-up: ${row.buyerName ?? 'Buyer'} re ${label}`;
  }

  if (sourceType === 'vendor_report_due' || sourceType === 'vendor_comm_overdue') {
    const [row] = await db
      .select({
        id: listings.id,
        addressLine1: listings.addressLine1,
        suburb: listings.suburb,
      })
      .from(listings)
      .where(and(eq(listings.orgId, context.data.orgId), eq(listings.id, sourceId)));

    if (!row?.id) return err('NOT_FOUND', 'Listing not found');
    relatedEntityType = 'listing';
    relatedEntityId = String(row.id);
    eventType = 'vendor_update';
    const label = buildListingLabel(row.addressLine1 ?? null, row.suburb ?? null);
    title = parsed.data.title ?? (sourceType === 'vendor_report_due' ? `Vendor report: ${label}` : `Vendor update: ${label}`);
  }

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
      title,
      type: eventType,
      startsAt,
      endsAt,
      allDay: false,
      timezone,
      location: parsed.data.location ?? null,
      notes: parsed.data.notes ?? null,
      relatedEntityType,
      relatedEntityId,
      sourceType,
      sourceId,
      assignedToUserId: context.data.actor.userId ?? null,
      status: 'scheduled',
      reminderMinutes: null,
      createdByUserId: context.data.actor.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: calendarEvents.id });

  if (!row?.id) {
    return err('INTERNAL_ERROR', 'Failed to create calendar event');
  }

  await db
    .insert(followupSnoozes)
    .values({
      orgId: context.data.orgId,
      sourceType,
      sourceId,
      snoozedUntil: startsAt,
      createdByUserId: context.data.actor.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [followupSnoozes.orgId, followupSnoozes.sourceType, followupSnoozes.sourceId],
      set: {
        snoozedUntil: startsAt,
        updatedAt: now,
        createdByUserId: context.data.actor.userId ?? null,
      },
    });

  return ok({ id: String(row.id) });
});
