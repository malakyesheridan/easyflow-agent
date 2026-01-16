import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { contacts } from '@/db/schema/contacts';
import { appraisalChecklistItems } from '@/db/schema/appraisal_checklist_items';
import { appraisalFollowups } from '@/db/schema/appraisal_followups';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { followupSnoozes } from '@/db/schema/followup_snoozes';

const completeSchema = z.object({
  orgId: z.string().trim().min(1),
  source_type: z.string().trim().min(1),
  source_id: z.string().trim().min(1),
  next_touch_at: z.string().datetime().optional(),
  next_follow_up_at: z.string().datetime().optional(),
  status: z.string().trim().optional(),
});

type CompleteResponse =
  | { completed: true; next_touch_at?: string; next_follow_up_at?: string }
  | { completed: false; action: 'open'; url: string };

type BuyerStatus =
  | 'new'
  | 'contacted'
  | 'inspection_booked'
  | 'attended'
  | 'offer_potential'
  | 'offer_made'
  | 'not_interested';

const buyerStatuses = new Set<BuyerStatus>([
  'new',
  'contacted',
  'inspection_booked',
  'attended',
  'offer_potential',
  'offer_made',
  'not_interested',
]);

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function addDays(base: Date, days: number) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export const POST = withRoute<CompleteResponse>(async (req: Request) => {
  const body = await req.json();
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;

  const db = getDb();
  const now = new Date();
  const sourceType = parsed.data.source_type;
  const sourceId = parsed.data.source_id;

  const clearSnooze = async () => {
    await db
      .delete(followupSnoozes)
      .where(
        and(
          eq(followupSnoozes.orgId, context.data.orgId),
          eq(followupSnoozes.sourceType, sourceType),
          eq(followupSnoozes.sourceId, sourceId)
        )
      );
  };

  if (sourceType === 'contact_followup') {
    const nextTouchAt = parseDate(parsed.data.next_touch_at) ?? addDays(now, 7);
    const updated = await db
      .update(contacts)
      .set({ lastTouchAt: now, nextTouchAt, updatedAt: now })
      .where(and(eq(contacts.orgId, context.data.orgId), eq(contacts.id, sourceId)))
      .returning({ id: contacts.id });

    if (!updated.length) {
      return err('NOT_FOUND', 'Contact not found');
    }

    await clearSnooze();
    return ok({ completed: true, next_touch_at: nextTouchAt.toISOString() });
  }

  if (sourceType === 'appraisal_checklist_item') {
    const updated = await db
      .update(appraisalChecklistItems)
      .set({ isDone: true, updatedAt: now })
      .where(and(eq(appraisalChecklistItems.orgId, context.data.orgId), eq(appraisalChecklistItems.id, sourceId)))
      .returning({ id: appraisalChecklistItems.id });

    if (!updated.length) {
      return err('NOT_FOUND', 'Checklist item not found');
    }

    await clearSnooze();
    return ok({ completed: true });
  }

  if (sourceType === 'appraisal_followup') {
    const updated = await db
      .update(appraisalFollowups)
      .set({ isDone: true, updatedAt: now })
      .where(and(eq(appraisalFollowups.orgId, context.data.orgId), eq(appraisalFollowups.id, sourceId)))
      .returning({ id: appraisalFollowups.id });

    if (!updated.length) {
      return err('NOT_FOUND', 'Follow-up not found');
    }

    await clearSnooze();
    return ok({ completed: true });
  }

  if (sourceType === 'listing_checklist_item') {
    const updated = await db
      .update(listingChecklistItems)
      .set({ isDone: true, updatedAt: now })
      .where(and(eq(listingChecklistItems.orgId, context.data.orgId), eq(listingChecklistItems.id, sourceId)))
      .returning({ id: listingChecklistItems.id });

    if (!updated.length) {
      return err('NOT_FOUND', 'Checklist item not found');
    }

    await clearSnooze();
    return ok({ completed: true });
  }

  if (sourceType === 'listing_milestone') {
    const updated = await db
      .update(listingMilestones)
      .set({ completedAt: now, updatedAt: now })
      .where(and(eq(listingMilestones.orgId, context.data.orgId), eq(listingMilestones.id, sourceId)))
      .returning({ id: listingMilestones.id });

    if (!updated.length) {
      return err('NOT_FOUND', 'Milestone not found');
    }

    await clearSnooze();
    return ok({ completed: true });
  }

  if (sourceType === 'buyer_followup') {
    const nextFollowUpAt = parseDate(parsed.data.next_follow_up_at) ?? addDays(now, 7);
    const status: BuyerStatus | undefined =
      parsed.data.status && buyerStatuses.has(parsed.data.status as BuyerStatus)
        ? (parsed.data.status as BuyerStatus)
        : undefined;
    const updated = await db
      .update(listingBuyers)
      .set({
        nextFollowUpAt,
        status,
        updatedAt: now,
      })
      .where(and(eq(listingBuyers.orgId, context.data.orgId), eq(listingBuyers.id, sourceId)))
      .returning({ id: listingBuyers.id });

    if (!updated.length) {
      return err('NOT_FOUND', 'Buyer follow-up not found');
    }

    await clearSnooze();
    return ok({ completed: true, next_follow_up_at: nextFollowUpAt.toISOString() });
  }

  if (sourceType === 'vendor_report_due') {
    return ok({ completed: false, action: 'open', url: `/listings/${sourceId}?tab=reports` });
  }

  if (sourceType === 'vendor_comm_overdue') {
    return ok({ completed: false, action: 'open', url: `/listings/${sourceId}?tab=vendor-comms` });
  }

  return err('VALIDATION_ERROR', 'Unsupported follow-up type');
});
