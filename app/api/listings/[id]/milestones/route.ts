import { z } from 'zod';
import { and, asc, eq, sql } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  targetDueAt: z.string().datetime().optional(),
  assignedToUserId: z.string().trim().optional(),
});

const updateSchema = z.object({
  orgId: z.string().trim().min(1),
  milestoneId: z.string().trim().optional(),
  name: z.string().trim().optional(),
  targetDueAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
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
  milestoneId: z.string().trim().min(1),
});

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) return err('VALIDATION_ERROR', 'Listing id is required');

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const rows = await db
    .select({
      id: listingMilestones.id,
      name: listingMilestones.name,
      targetDueAt: listingMilestones.targetDueAt,
      completedAt: listingMilestones.completedAt,
      assignedToUserId: listingMilestones.assignedToUserId,
      sortOrder: listingMilestones.sortOrder,
      createdAt: listingMilestones.createdAt,
      updatedAt: listingMilestones.updatedAt,
    })
    .from(listingMilestones)
    .where(and(eq(listingMilestones.orgId, orgContext.data.orgId), eq(listingMilestones.listingId, listingId)))
    .orderBy(asc(listingMilestones.sortOrder));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      targetDueAt: toIso(row.targetDueAt ?? null),
      completedAt: toIso(row.completedAt ?? null),
      assignedToUserId: row.assignedToUserId ? String(row.assignedToUserId) : null,
      sortOrder: row.sortOrder,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }))
  );
});

export const POST = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) return err('VALIDATION_ERROR', 'Listing id is required');

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const [maxRow] = await db
    .select({ max: sql<number>`max(${listingMilestones.sortOrder})`.mapWith(Number) })
    .from(listingMilestones)
    .where(and(eq(listingMilestones.orgId, orgContext.data.orgId), eq(listingMilestones.listingId, listingId)));

  const sortOrder = Number.isFinite(maxRow?.max) ? Number(maxRow?.max) + 1 : 0;
  const targetDueAt = parsed.data.targetDueAt ? new Date(parsed.data.targetDueAt) : null;
  if (targetDueAt && Number.isNaN(targetDueAt.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid target due date');
  }

  const [inserted] = await db
    .insert(listingMilestones)
    .values({
      orgId: orgContext.data.orgId,
      listingId,
      name: parsed.data.name,
      targetDueAt,
      assignedToUserId: parsed.data.assignedToUserId ?? null,
      sortOrder,
      updatedAt: new Date(),
    })
    .returning({ id: listingMilestones.id });

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ id: inserted?.id ? String(inserted.id) : null });
});

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) return err('VALIDATION_ERROR', 'Listing id is required');

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
        .update(listingMilestones)
        .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(and(eq(listingMilestones.orgId, orgContext.data.orgId), eq(listingMilestones.id, item.id)));
    }
    await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });
    return ok({ reordered: true, updated: false });
  }

  if (!parsed.data.milestoneId) {
    return err('VALIDATION_ERROR', 'Milestone id is required');
  }

  const payload: Record<string, unknown> = { updatedAt: new Date() };

  if (parsed.data.name !== undefined) payload.name = parsed.data.name;
  if (parsed.data.targetDueAt !== undefined) {
    const date = parsed.data.targetDueAt ? new Date(parsed.data.targetDueAt) : null;
    if (date && Number.isNaN(date.getTime())) return err('VALIDATION_ERROR', 'Invalid target due date');
    payload.targetDueAt = date;
  }
  if (parsed.data.completedAt !== undefined) {
    const date = parsed.data.completedAt ? new Date(parsed.data.completedAt) : null;
    if (date && Number.isNaN(date.getTime())) return err('VALIDATION_ERROR', 'Invalid completed date');
    payload.completedAt = date;
  }
  if (parsed.data.assignedToUserId !== undefined) payload.assignedToUserId = parsed.data.assignedToUserId ?? null;
  if (parsed.data.sortOrder !== undefined) payload.sortOrder = parsed.data.sortOrder;

  await db
    .update(listingMilestones)
    .set(payload)
    .where(and(eq(listingMilestones.orgId, orgContext.data.orgId), eq(listingMilestones.id, parsed.data.milestoneId)));

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ updated: true, reordered: false });
});

export const DELETE = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) return err('VALIDATION_ERROR', 'Listing id is required');

  const body = await req.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  await db
    .delete(listingMilestones)
    .where(and(eq(listingMilestones.orgId, orgContext.data.orgId), eq(listingMilestones.id, parsed.data.milestoneId)));

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ deleted: true });
});
