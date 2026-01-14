import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { appraisalChecklistItems } from '@/db/schema/appraisal_checklist_items';
import { recomputeWinProbability } from '@/lib/appraisals/recompute';

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  dueAt: z.string().datetime().optional(),
  assignedToUserId: z.string().trim().optional(),
});

const updateSchema = z.object({
  orgId: z.string().trim().min(1),
  itemId: z.string().trim().optional(),
  title: z.string().trim().optional(),
  isDone: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  assignedToUserId: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
  order: z.array(
    z.object({
      id: z.string().trim().min(1),
      sortOrder: z.number().int(),
    })
  ).optional(),
});

const deleteSchema = z.object({
  orgId: z.string().trim().min(1),
  itemId: z.string().trim().min(1),
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
      id: appraisalChecklistItems.id,
      title: appraisalChecklistItems.title,
      isDone: appraisalChecklistItems.isDone,
      dueAt: appraisalChecklistItems.dueAt,
      assignedToUserId: appraisalChecklistItems.assignedToUserId,
      sortOrder: appraisalChecklistItems.sortOrder,
      createdAt: appraisalChecklistItems.createdAt,
      updatedAt: appraisalChecklistItems.updatedAt,
    })
    .from(appraisalChecklistItems)
    .where(and(eq(appraisalChecklistItems.orgId, orgContext.data.orgId), eq(appraisalChecklistItems.appraisalId, appraisalId)))
    .orderBy(asc(appraisalChecklistItems.sortOrder));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      title: row.title,
      isDone: row.isDone,
      dueAt: toIso(row.dueAt ?? null),
      assignedToUserId: row.assignedToUserId ? String(row.assignedToUserId) : null,
      sortOrder: row.sortOrder,
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
  const [maxRow] = await db
    .select({
      max: sql<number>`max(${appraisalChecklistItems.sortOrder})`.mapWith(Number),
    })
    .from(appraisalChecklistItems)
    .where(and(eq(appraisalChecklistItems.orgId, orgContext.data.orgId), eq(appraisalChecklistItems.appraisalId, appraisalId)));

  const sortOrder = Number.isFinite(maxRow?.max) ? (Number(maxRow?.max) + 1) : 0;
  const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid due date');
  }

  const [inserted] = await db
    .insert(appraisalChecklistItems)
    .values({
      orgId: orgContext.data.orgId,
      appraisalId,
      title: parsed.data.title,
      dueAt: dueAt ?? null,
      assignedToUserId: parsed.data.assignedToUserId ?? null,
      sortOrder,
      updatedAt: new Date(),
    })
    .returning({ id: appraisalChecklistItems.id });

  await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });

  return ok({ id: inserted?.id ? String(inserted.id) : null });
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

  const db = getDb();

  if (parsed.data.order && parsed.data.order.length > 0) {
    for (const item of parsed.data.order) {
      await db
        .update(appraisalChecklistItems)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(and(eq(appraisalChecklistItems.orgId, orgContext.data.orgId), eq(appraisalChecklistItems.id, item.id)));
    }

    await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });
    return ok({ reordered: true, updated: false });
  }

  if (!parsed.data.itemId) {
    return err('VALIDATION_ERROR', 'Checklist item id is required');
  }

  const payload: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.data.title !== undefined) payload.title = parsed.data.title;
  if (parsed.data.isDone !== undefined) payload.isDone = parsed.data.isDone;
  if (parsed.data.sortOrder !== undefined) payload.sortOrder = parsed.data.sortOrder;
  if (parsed.data.dueAt !== undefined) {
    const dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) {
      return err('VALIDATION_ERROR', 'Invalid due date');
    }
    payload.dueAt = dueAt;
  }
  if (parsed.data.assignedToUserId !== undefined) payload.assignedToUserId = parsed.data.assignedToUserId ?? null;

  await db
    .update(appraisalChecklistItems)
    .set(payload)
    .where(and(eq(appraisalChecklistItems.orgId, orgContext.data.orgId), eq(appraisalChecklistItems.id, parsed.data.itemId)));

  await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });

  return ok({ updated: true, reordered: false });
});

export const DELETE = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const appraisalId = context?.params?.id;
  if (!appraisalId) {
    return err('VALIDATION_ERROR', 'Appraisal id is required');
  }

  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  await db
    .delete(appraisalChecklistItems)
    .where(and(eq(appraisalChecklistItems.orgId, orgContext.data.orgId), eq(appraisalChecklistItems.id, parsed.data.itemId)));

  await recomputeWinProbability({ orgId: orgContext.data.orgId, appraisalId });

  return ok({ deleted: true });
});
