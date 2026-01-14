import { z } from 'zod';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { appraisals } from '@/db/schema/appraisals';
import { appraisalChecklistItems } from '@/db/schema/appraisal_checklist_items';
import { appraisalFollowups } from '@/db/schema/appraisal_followups';
import { contacts } from '@/db/schema/contacts';
import { users } from '@/db/schema/users';
import { recomputeWinProbability } from '@/lib/appraisals/recompute';

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

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  contactId: z.string().trim().min(1),
  appointmentAt: z.string().datetime(),
  meetingType: z.enum(meetingTypes).optional(),
  address: z.string().trim().optional(),
  suburb: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  ownerUserId: z.string().trim().optional(),
});

const DEFAULT_CHECKLIST = [
  'Confirm property details',
  'Prepare CMA and comparable sales',
  'Review recent market activity',
  'Outline pricing strategy',
  'Prepare appraisal presentation',
  'Schedule follow-up call',
];

const STAGE_ORDER = new Map(stageValues.map((stage, index) => [stage, index]));

type SortKey = 'appointment_at_asc' | 'appointment_at_desc' | 'win_probability_desc' | 'stage' | 'next_action_asc';

function parseStages(values: string[]): Array<typeof stageValues[number]> {
  const stages = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => stageValues.includes(value as typeof stageValues[number]));
  return Array.from(new Set(stages)) as Array<typeof stageValues[number]>;
}

function buildSearchFilter(search: string) {
  const like = `%${search}%`;
  return or(
    ilike(contacts.fullName, like),
    ilike(contacts.email, like),
    ilike(contacts.phone, like),
    ilike(contacts.suburb, like),
    ilike(contacts.address, like)
  );
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const search = searchParams.get('q')?.trim() ?? '';
  const ownerId = searchParams.get('ownerId')?.trim() ?? '';
  const stageFilters = parseStages(searchParams.getAll('stage'));
  const sort = (searchParams.get('sort') ?? 'appointment_at_asc') as SortKey;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? 50)));

  const conditions = [eq(appraisals.orgId, context.data.orgId)];

  if (search) {
    const filter = buildSearchFilter(search);
    if (filter) conditions.push(filter);
  }

  if (ownerId) {
    conditions.push(eq(appraisals.ownerUserId, ownerId));
  }

  if (stageFilters.length > 0) {
    conditions.push(inArray(appraisals.stage, stageFilters));
  }

  const db = getDb();
  const rows = await db
    .select({
      id: appraisals.id,
      contactId: appraisals.contactId,
      stage: appraisals.stage,
      appointmentAt: appraisals.appointmentAt,
      meetingType: appraisals.meetingType,
      address: appraisals.address,
      suburb: appraisals.suburb,
      winProbabilityScore: appraisals.winProbabilityScore,
      winProbabilityReasons: appraisals.winProbabilityReasons,
      ownerUserId: appraisals.ownerUserId,
      contactName: contacts.fullName,
      contactSuburb: contacts.suburb,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(appraisals)
    .innerJoin(contacts, eq(appraisals.contactId, contacts.id))
    .leftJoin(users, eq(appraisals.ownerUserId, users.id))
    .where(and(...conditions));

  const appraisalIds = rows.map((row) => String(row.id));

  const checklistRows = appraisalIds.length
    ? await db
        .select({
          appraisalId: appraisalChecklistItems.appraisalId,
          isDone: appraisalChecklistItems.isDone,
          dueAt: appraisalChecklistItems.dueAt,
        })
        .from(appraisalChecklistItems)
        .where(and(eq(appraisalChecklistItems.orgId, context.data.orgId), inArray(appraisalChecklistItems.appraisalId, appraisalIds)))
    : [];

  const followupRows = appraisalIds.length
    ? await db
        .select({
          appraisalId: appraisalFollowups.appraisalId,
          dueAt: appraisalFollowups.dueAt,
          isDone: appraisalFollowups.isDone,
        })
        .from(appraisalFollowups)
        .where(and(eq(appraisalFollowups.orgId, context.data.orgId), inArray(appraisalFollowups.appraisalId, appraisalIds)))
    : [];

  const checklistByAppraisal = new Map<string, Array<{ isDone: boolean; dueAt: Date | null }>>();
  checklistRows.forEach((row) => {
    const appraisalId = String(row.appraisalId);
    const existing = checklistByAppraisal.get(appraisalId) ?? [];
    existing.push({ isDone: row.isDone, dueAt: row.dueAt ?? null });
    checklistByAppraisal.set(appraisalId, existing);
  });

  const followupsByAppraisal = new Map<string, Array<{ dueAt: Date | null; isDone: boolean }>>();
  followupRows.forEach((row) => {
    const appraisalId = String(row.appraisalId);
    const existing = followupsByAppraisal.get(appraisalId) ?? [];
    existing.push({ dueAt: row.dueAt ?? null, isDone: row.isDone });
    followupsByAppraisal.set(appraisalId, existing);
  });

  const now = new Date();

  const data = rows.map((row) => {
    const appraisalId = String(row.id);
    const checklistItems = checklistByAppraisal.get(appraisalId) ?? [];
    const followups = followupsByAppraisal.get(appraisalId) ?? [];

    const incompleteChecklist = checklistItems.filter((item) => !item.isDone && item.dueAt);
    const incompleteFollowups = followups.filter((item) => !item.isDone && item.dueAt);

    const nextChecklistDue = incompleteChecklist.length
      ? incompleteChecklist.map((item) => item.dueAt as Date).sort((a, b) => a.getTime() - b.getTime())[0]
      : null;
    const nextFollowupDue = incompleteFollowups.length
      ? incompleteFollowups.map((item) => item.dueAt as Date).sort((a, b) => a.getTime() - b.getTime())[0]
      : null;

    const nextActionDue = nextChecklistDue || nextFollowupDue || row.appointmentAt;

    const totalChecklist = checklistItems.length;
    const completedChecklist = checklistItems.filter((item) => item.isDone).length;

    return {
      id: appraisalId,
      contactId: String(row.contactId),
      contactName: row.contactName,
      contactSuburb: row.contactSuburb ?? null,
      stage: row.stage,
      appointmentAt: toIso(row.appointmentAt),
      meetingType: row.meetingType,
      address: row.address ?? null,
      suburb: row.suburb ?? null,
      winProbabilityScore: row.winProbabilityScore ?? 0,
      winProbabilityReasons: (row.winProbabilityReasons as string[] | null) ?? [],
      owner: row.ownerUserId
        ? { id: String(row.ownerUserId), name: row.ownerName ?? null, email: row.ownerEmail ?? null }
        : null,
      nextActionDue: toIso(nextActionDue),
      prepComplete: totalChecklist > 0 && completedChecklist === totalChecklist,
      followupScheduled: followups.length > 0,
      overdue: nextActionDue ? nextActionDue.getTime() < now.getTime() : false,
    };
  });

  data.sort((a, b) => {
    if (sort === 'appointment_at_desc') {
      return (b.appointmentAt ? new Date(b.appointmentAt).getTime() : 0) - (a.appointmentAt ? new Date(a.appointmentAt).getTime() : 0);
    }
    if (sort === 'win_probability_desc') {
      return (b.winProbabilityScore ?? 0) - (a.winProbabilityScore ?? 0);
    }
    if (sort === 'stage') {
      const aIndex = STAGE_ORDER.get(a.stage) ?? 0;
      const bIndex = STAGE_ORDER.get(b.stage) ?? 0;
      return aIndex - bIndex;
    }
    if (sort === 'next_action_asc') {
      const aNext = a.nextActionDue ? new Date(a.nextActionDue).getTime() : Number.POSITIVE_INFINITY;
      const bNext = b.nextActionDue ? new Date(b.nextActionDue).getTime() : Number.POSITIVE_INFINITY;
      return aNext - bNext;
    }
    return (a.appointmentAt ? new Date(a.appointmentAt).getTime() : 0) - (b.appointmentAt ? new Date(b.appointmentAt).getTime() : 0);
  });

  const total = data.length;
  const start = (page - 1) * pageSize;
  const paged = data.slice(start, start + pageSize);

  return ok({ data: paged, page, pageSize, total });
});

export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const context = await requireOrgContext(req, parsed.data.orgId);
  if (!context.ok) return context;

  const appointmentAt = new Date(parsed.data.appointmentAt);
  if (Number.isNaN(appointmentAt.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid appointment date');
  }

  const db = getDb();
  const [inserted] = await db
    .insert(appraisals)
    .values({
      orgId: context.data.orgId,
      contactId: parsed.data.contactId,
      ownerUserId: parsed.data.ownerUserId ?? context.data.actor.userId ?? null,
      appointmentAt,
      meetingType: parsed.data.meetingType ?? 'in_person',
      address: parsed.data.address ?? null,
      suburb: parsed.data.suburb ?? null,
      notes: parsed.data.notes ?? null,
      updatedAt: new Date(),
    })
    .returning({ id: appraisals.id });

  const appraisalId = inserted?.id ? String(inserted.id) : null;
  if (!appraisalId) {
    return err('INTERNAL_ERROR', 'Failed to create appraisal');
  }

  if (DEFAULT_CHECKLIST.length > 0) {
    await db.insert(appraisalChecklistItems).values(
      DEFAULT_CHECKLIST.map((title, index) => ({
        orgId: context.data.orgId,
        appraisalId,
        title,
        sortOrder: index,
        updatedAt: new Date(),
      }))
    );
  }

  await recomputeWinProbability({ orgId: context.data.orgId, appraisalId });

  return ok({ id: appraisalId });
});
