import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { appraisals } from '@/db/schema/appraisals';
import { contacts } from '@/db/schema/contacts';
import { users } from '@/db/schema/users';
import { recomputeWinProbability } from '@/lib/appraisals/recompute';
import { createNotificationBestEffort } from '@/lib/mutations/notifications';
import { buildNotificationKey } from '@/lib/notifications/keys';
import { formatShortDateTime } from '@/lib/notifications/format';

const stageValues = [
  'booked',
  'confirmed',
  'prepped',
  'attended',
  'followup_sent',
  'won',
  'lost',
] as const;

const meetingTypes = ['in_person', 'phone', 'video'] as const;

const timelineValues = ['asap', 'days_30', 'days_60_90', 'unsure'] as const;

const outcomeValues = ['pending', 'won', 'lost'] as const;

const lostReasonValues = ['commission', 'marketing', 'connection', 'price_promise', 'other'] as const;

const updateSchema = z.object({
  orgId: z.string().trim().min(1),
  stage: z.enum(stageValues).optional(),
  appointmentAt: z.string().datetime().optional(),
  meetingType: z.enum(meetingTypes).optional(),
  address: z.string().trim().nullable().optional(),
  suburb: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  motivation: z.string().trim().nullable().optional(),
  timeline: z.enum(timelineValues).nullable().optional(),
  priceExpectationMin: z.number().int().nullable().optional(),
  priceExpectationMax: z.number().int().nullable().optional(),
  decisionMakersPresent: z.boolean().optional(),
  objections: z.union([z.array(z.string()), z.string()]).nullable().optional(),
  outcomeStatus: z.enum(outcomeValues).optional(),
  lostReason: z.enum(lostReasonValues).nullable().optional(),
  lostNotes: z.string().trim().nullable().optional(),
  expectedListDate: z.string().nullable().optional(),
  expectedPriceGuideMin: z.number().int().nullable().optional(),
  expectedPriceGuideMax: z.number().int().nullable().optional(),
  attendedAt: z.string().nullable().optional(),
  ownerUserId: z.string().trim().nullable().optional(),
});

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function isWithinNextHours(date: Date, hours: number, now: Date) {
  const max = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return date >= now && date <= max;
}

async function loadAppraisal(orgId: string, appraisalId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: appraisals.id,
      orgId: appraisals.orgId,
      contactId: appraisals.contactId,
      stage: appraisals.stage,
      appointmentAt: appraisals.appointmentAt,
      meetingType: appraisals.meetingType,
      address: appraisals.address,
      suburb: appraisals.suburb,
      notes: appraisals.notes,
      motivation: appraisals.motivation,
      timeline: appraisals.timeline,
      priceExpectationMin: appraisals.priceExpectationMin,
      priceExpectationMax: appraisals.priceExpectationMax,
      decisionMakersPresent: appraisals.decisionMakersPresent,
      objections: appraisals.objections,
      outcomeStatus: appraisals.outcomeStatus,
      lostReason: appraisals.lostReason,
      lostNotes: appraisals.lostNotes,
      expectedListDate: appraisals.expectedListDate,
      expectedPriceGuideMin: appraisals.expectedPriceGuideMin,
      expectedPriceGuideMax: appraisals.expectedPriceGuideMax,
      winProbabilityScore: appraisals.winProbabilityScore,
      winProbabilityReasons: appraisals.winProbabilityReasons,
      attendedAt: appraisals.attendedAt,
      ownerUserId: appraisals.ownerUserId,
      createdAt: appraisals.createdAt,
      updatedAt: appraisals.updatedAt,
      contactName: contacts.fullName,
      contactSuburb: contacts.suburb,
      contactEmail: contacts.email,
      contactPhone: contacts.phone,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(appraisals)
    .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
    .leftJoin(users, eq(appraisals.ownerUserId, users.id))
    .where(and(eq(appraisals.orgId, orgId), eq(appraisals.id, appraisalId)))
    .limit(1);

  if (!row) return null;

  return {
    id: String(row.id),
    orgId: String(row.orgId),
    contact: {
      id: String(row.contactId),
      name: row.contactName,
      suburb: row.contactSuburb ?? null,
      email: row.contactEmail ?? null,
      phone: row.contactPhone ?? null,
    },
    stage: row.stage,
    appointmentAt: toIso(row.appointmentAt),
    meetingType: row.meetingType,
    address: row.address ?? null,
    suburb: row.suburb ?? null,
    notes: row.notes ?? null,
    motivation: row.motivation ?? null,
    timeline: row.timeline ?? null,
    priceExpectationMin: row.priceExpectationMin ?? null,
    priceExpectationMax: row.priceExpectationMax ?? null,
    decisionMakersPresent: Boolean(row.decisionMakersPresent),
    objections: row.objections ?? null,
    outcomeStatus: row.outcomeStatus,
    lostReason: row.lostReason ?? null,
    lostNotes: row.lostNotes ?? null,
    expectedListDate: toIso(row.expectedListDate),
    expectedPriceGuideMin: row.expectedPriceGuideMin ?? null,
    expectedPriceGuideMax: row.expectedPriceGuideMax ?? null,
    winProbabilityScore: row.winProbabilityScore ?? 0,
    winProbabilityReasons: (row.winProbabilityReasons as string[] | null) ?? [],
    attendedAt: toIso(row.attendedAt),
    owner: row.ownerUserId
      ? { id: String(row.ownerUserId), name: row.ownerName ?? null, email: row.ownerEmail ?? null }
      : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const appraisalId = context?.params?.id;
  if (!appraisalId) {
    return err('VALIDATION_ERROR', 'Appraisal id is required');
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const appraisal = await loadAppraisal(orgContext.data.orgId, appraisalId);
  if (!appraisal) return err('NOT_FOUND', 'Appraisal not found');

  return ok(appraisal);
});

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const appraisalId = context?.params?.id;
  if (!appraisalId) {
    return err('VALIDATION_ERROR', 'Appraisal id is required');
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const before = await loadAppraisal(orgContext.data.orgId, appraisalId);
  if (!before) return err('NOT_FOUND', 'Appraisal not found');

  const payload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.stage) payload.stage = parsed.data.stage;
  if (parsed.data.appointmentAt !== undefined) {
    const appointmentAt = parsed.data.appointmentAt ? new Date(parsed.data.appointmentAt) : null;
    if (appointmentAt && Number.isNaN(appointmentAt.getTime())) {
      return err('VALIDATION_ERROR', 'Invalid appointment date');
    }
    payload.appointmentAt = appointmentAt;
  }
  if (parsed.data.meetingType !== undefined) payload.meetingType = parsed.data.meetingType;
  if (parsed.data.address !== undefined) payload.address = parsed.data.address ?? null;
  if (parsed.data.suburb !== undefined) payload.suburb = parsed.data.suburb ?? null;
  if (parsed.data.notes !== undefined) payload.notes = parsed.data.notes ?? null;
  if (parsed.data.motivation !== undefined) payload.motivation = parsed.data.motivation ?? null;
  if (parsed.data.timeline !== undefined) payload.timeline = parsed.data.timeline ?? null;
  if (parsed.data.priceExpectationMin !== undefined) payload.priceExpectationMin = parsed.data.priceExpectationMin ?? null;
  if (parsed.data.priceExpectationMax !== undefined) payload.priceExpectationMax = parsed.data.priceExpectationMax ?? null;
  if (parsed.data.decisionMakersPresent !== undefined) payload.decisionMakersPresent = parsed.data.decisionMakersPresent;
  if (parsed.data.objections !== undefined) payload.objections = parsed.data.objections ?? null;
  // TODO: When appraisal outcome is won, auto-create a listing and apply report cadence defaults.
  if (parsed.data.outcomeStatus !== undefined) payload.outcomeStatus = parsed.data.outcomeStatus;
  if (parsed.data.lostReason !== undefined) payload.lostReason = parsed.data.lostReason ?? null;
  if (parsed.data.lostNotes !== undefined) payload.lostNotes = parsed.data.lostNotes ?? null;
  if (parsed.data.expectedListDate !== undefined) {
    const expectedListDate = parsed.data.expectedListDate ? new Date(parsed.data.expectedListDate) : null;
    if (expectedListDate && Number.isNaN(expectedListDate.getTime())) {
      return err('VALIDATION_ERROR', 'Invalid expected list date');
    }
    payload.expectedListDate = expectedListDate;
  }
  if (parsed.data.expectedPriceGuideMin !== undefined) payload.expectedPriceGuideMin = parsed.data.expectedPriceGuideMin ?? null;
  if (parsed.data.expectedPriceGuideMax !== undefined) payload.expectedPriceGuideMax = parsed.data.expectedPriceGuideMax ?? null;
  if (parsed.data.attendedAt !== undefined) {
    const attendedAt = parsed.data.attendedAt ? new Date(parsed.data.attendedAt) : null;
    if (attendedAt && Number.isNaN(attendedAt.getTime())) {
      return err('VALIDATION_ERROR', 'Invalid attended date');
    }
    payload.attendedAt = attendedAt;
  }
  if (parsed.data.ownerUserId !== undefined) payload.ownerUserId = parsed.data.ownerUserId ?? null;

  if (parsed.data.stage === 'attended' && parsed.data.attendedAt === undefined) {
    payload.attendedAt = new Date();
  }

  const db = getDb();
  await db
    .update(appraisals)
    .set(payload)
    .where(and(eq(appraisals.orgId, orgContext.data.orgId), eq(appraisals.id, appraisalId)));

  await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });

  const updated = await loadAppraisal(orgContext.data.orgId, appraisalId);
  if (!updated) return err('NOT_FOUND', 'Appraisal not found');

  const recipientUserId = updated.owner?.id ?? orgContext.data.actor.userId ?? null;
  const now = new Date();

  if (parsed.data.stage && parsed.data.stage !== before.stage && recipientUserId) {
    await createNotificationBestEffort({
      orgId: orgContext.data.orgId,
      type: 'appraisal_stage_changed',
      title: 'Appraisal stage updated',
      body: `${updated.contact.name ?? 'Client'} moved to ${parsed.data.stage.replace('_', ' ')}`,
      severity: 'info',
      entityType: 'appraisal',
      entityId: appraisalId,
      deepLink: `/appraisals/${appraisalId}`,
      recipientUserId,
      eventKey: buildNotificationKey({
        type: 'appraisal_stage_changed',
        entityId: appraisalId,
        date: now,
        suffix: parsed.data.stage,
      }),
    });
  }

  if (parsed.data.appointmentAt) {
    const appointmentAt = new Date(parsed.data.appointmentAt);
    if (!Number.isNaN(appointmentAt.getTime()) && isWithinNextHours(appointmentAt, 24, now) && recipientUserId) {
      await createNotificationBestEffort({
        orgId: orgContext.data.orgId,
        type: 'appraisal_upcoming',
        title: 'Appraisal upcoming',
        body: `${updated.contact.name ?? 'Client'} - ${formatShortDateTime(appointmentAt)}`,
        severity: 'warn',
        entityType: 'appraisal',
        entityId: appraisalId,
        deepLink: `/appraisals/${appraisalId}`,
        recipientUserId,
        eventKey: buildNotificationKey({ type: 'appraisal_upcoming', entityId: appraisalId, date: appointmentAt }),
      });
    }
  }

  return ok(updated);
});
