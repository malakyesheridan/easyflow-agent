import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { calendarEvents } from '@/db/schema/calendar_events';
import { orgSettings } from '@/db/schema/org_settings';

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

const patchSchema = z.object({
  orgId: z.string().trim().min(1),
  title: z.string().trim().optional(),
  type: z.enum(eventTypes).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
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

const deleteSchema = z.object({
  orgId: z.string().trim().min(1),
});

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

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const eventId = context?.params?.id;
  if (!eventId) {
    return err('VALIDATION_ERROR', 'Event id is required');
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const start = parsed.data.starts_at ? new Date(parsed.data.starts_at) : null;
  const end = parsed.data.ends_at ? new Date(parsed.data.ends_at) : null;
  if (start && Number.isNaN(start.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid start time');
  }
  if (end && Number.isNaN(end.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid end time');
  }

  const isAllDay = parsed.data.all_day;
  let nextStart = start;
  let nextEnd = end;
  if (isAllDay && start) {
    nextStart = startOfDay(start);
    nextEnd = endOfDay(start);
  }
  if (nextStart && nextEnd && nextEnd <= nextStart) {
    return err('VALIDATION_ERROR', 'End time must be after start time');
  }

  let timezone = parsed.data.timezone;
  if (!timezone) {
    const settings = await db
      .select({ timezone: orgSettings.timezone })
      .from(orgSettings)
      .where(eq(orgSettings.orgId, orgContext.data.orgId));
    timezone = settings[0]?.timezone ?? 'UTC';
  }

  const updates = {
    title: parsed.data.title ?? undefined,
    type: parsed.data.type ?? undefined,
    startsAt: nextStart ?? undefined,
    endsAt: nextEnd ?? undefined,
    allDay: parsed.data.all_day ?? undefined,
    timezone: timezone ?? undefined,
    location: parsed.data.location ?? undefined,
    notes: parsed.data.notes ?? undefined,
    relatedEntityType: parsed.data.related_entity_type ?? undefined,
    relatedEntityId: parsed.data.related_entity_id ?? undefined,
    sourceType: parsed.data.source_type ?? undefined,
    sourceId: parsed.data.source_id ?? undefined,
    assignedToUserId: parsed.data.assigned_to_user_id ?? undefined,
    status: parsed.data.status ?? undefined,
    reminderMinutes: parsed.data.reminder_minutes ?? undefined,
    updatedAt: new Date(),
  };

  const [row] = await db
    .update(calendarEvents)
    .set(updates)
    .where(and(eq(calendarEvents.orgId, orgContext.data.orgId), eq(calendarEvents.id, eventId)))
    .returning({ id: calendarEvents.id });

  if (!row?.id) {
    return err('NOT_FOUND', 'Event not found');
  }

  return ok({ id: String(row.id) });
});

export const DELETE = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const eventId = context?.params?.id;
  if (!eventId) {
    return err('VALIDATION_ERROR', 'Event id is required');
  }

  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const [row] = await db
    .delete(calendarEvents)
    .where(and(eq(calendarEvents.orgId, orgContext.data.orgId), eq(calendarEvents.id, eventId)))
    .returning({ id: calendarEvents.id });

  if (!row?.id) {
    return err('NOT_FOUND', 'Event not found');
  }

  return ok({ id: String(row.id) });
});
