import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { appraisals } from '@/db/schema/appraisals';
import { appraisalFollowups } from '@/db/schema/appraisal_followups';
import { recomputeWinProbability } from '@/lib/appraisals/recompute';

const followupTypes = [
  'followup_same_day',
  'followup_2_days',
  'followup_7_days',
  'custom',
] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  action: z.enum(['plan', 'custom']).optional(),
  title: z.string().trim().optional(),
  dueAt: z.string().datetime().optional(),
  type: z.enum(followupTypes).optional(),
});

const updateSchema = z.object({
  orgId: z.string().trim().min(1),
  followupId: z.string().trim().min(1),
  title: z.string().trim().optional(),
  dueAt: z.string().datetime().optional(),
  type: z.enum(followupTypes).optional(),
  isDone: z.boolean().optional(),
});

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
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

  const db = getDb();
  const rows = await db
    .select({
      id: appraisalFollowups.id,
      type: appraisalFollowups.type,
      title: appraisalFollowups.title,
      dueAt: appraisalFollowups.dueAt,
      isDone: appraisalFollowups.isDone,
      createdAt: appraisalFollowups.createdAt,
      updatedAt: appraisalFollowups.updatedAt,
    })
    .from(appraisalFollowups)
    .where(and(eq(appraisalFollowups.orgId, orgContext.data.orgId), eq(appraisalFollowups.appraisalId, appraisalId)))
    .orderBy(asc(appraisalFollowups.dueAt));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      title: row.title,
      dueAt: toIso(row.dueAt),
      isDone: row.isDone,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }))
  );
});

export const POST = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const appraisalId = context?.params?.id;
  if (!appraisalId) {
    return err('VALIDATION_ERROR', 'Appraisal id is required');
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const [appraisal] = await db
    .select({
      appointmentAt: appraisals.appointmentAt,
      attendedAt: appraisals.attendedAt,
      contactId: appraisals.contactId,
    })
    .from(appraisals)
    .where(and(eq(appraisals.orgId, orgContext.data.orgId), eq(appraisals.id, appraisalId)))
    .limit(1);

  if (!appraisal) {
    return err('NOT_FOUND', 'Appraisal not found');
  }

  const existingTypes = new Set<string>();
  const existingRows = await db
    .select({ type: appraisalFollowups.type })
    .from(appraisalFollowups)
    .where(and(eq(appraisalFollowups.orgId, orgContext.data.orgId), eq(appraisalFollowups.appraisalId, appraisalId)));
  existingRows.forEach((row) => existingTypes.add(row.type));

  const createPlan = parsed.data.action === 'plan' || (!parsed.data.title && !parsed.data.dueAt);

  if (createPlan) {
    const base = appraisal.attendedAt ?? appraisal.appointmentAt ?? new Date();
    const defaults = [
      { type: 'followup_same_day', title: 'Same-day follow-up', offsetDays: 0 },
      { type: 'followup_2_days', title: '2-day follow-up', offsetDays: 2 },
      { type: 'followup_7_days', title: '7-day follow-up', offsetDays: 7 },
    ];

    const rowsToInsert = defaults
      .filter((item) => !existingTypes.has(item.type))
      .map((item) => {
        const dueAt = new Date(base);
        dueAt.setDate(dueAt.getDate() + item.offsetDays);
        return {
          orgId: orgContext.data.orgId,
          appraisalId,
          contactId: appraisal.contactId,
          type: item.type as typeof followupTypes[number],
          title: item.title,
          dueAt,
          updatedAt: new Date(),
        };
      });

    if (rowsToInsert.length > 0) {
      await db.insert(appraisalFollowups).values(rowsToInsert);
    }

    await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });
    return ok({ created: rowsToInsert.length });
  }

  if (!parsed.data.title || !parsed.data.dueAt) {
    return err('VALIDATION_ERROR', 'Title and due date are required for custom followups');
  }

  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid due date');
  }

  await db.insert(appraisalFollowups).values({
    orgId: orgContext.data.orgId,
    appraisalId,
    contactId: appraisal.contactId,
    type: parsed.data.type ?? 'custom',
    title: parsed.data.title,
    dueAt,
    updatedAt: new Date(),
  });

  await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });
  return ok({ created: 1 });
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

  const payload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.title !== undefined) payload.title = parsed.data.title;
  if (parsed.data.type !== undefined) payload.type = parsed.data.type;
  if (parsed.data.isDone !== undefined) payload.isDone = parsed.data.isDone;
  if (parsed.data.dueAt !== undefined) {
    const dueAt = new Date(parsed.data.dueAt);
    if (Number.isNaN(dueAt.getTime())) {
      return err('VALIDATION_ERROR', 'Invalid due date');
    }
    payload.dueAt = dueAt;
  }

  const db = getDb();
  await db
    .update(appraisalFollowups)
    .set(payload)
    .where(and(eq(appraisalFollowups.orgId, orgContext.data.orgId), eq(appraisalFollowups.id, parsed.data.followupId)));

  await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });

  return ok({ updated: true });
});
