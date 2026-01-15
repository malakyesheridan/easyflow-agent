import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listingInspections } from '@/db/schema/listing_inspections';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const inspectionTypes = ['open_home', 'private'] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  type: z.enum(inspectionTypes).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

const updateSchema = z.object({
  orgId: z.string().trim().min(1),
  inspectionId: z.string().trim().min(1),
  type: z.enum(inspectionTypes).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const deleteSchema = z.object({
  orgId: z.string().trim().min(1),
  inspectionId: z.string().trim().min(1),
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
      id: listingInspections.id,
      type: listingInspections.type,
      startsAt: listingInspections.startsAt,
      endsAt: listingInspections.endsAt,
      notes: listingInspections.notes,
      createdAt: listingInspections.createdAt,
    })
    .from(listingInspections)
    .where(and(eq(listingInspections.orgId, orgContext.data.orgId), eq(listingInspections.listingId, listingId)))
    .orderBy(desc(listingInspections.startsAt));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      startsAt: toIso(row.startsAt),
      endsAt: toIso(row.endsAt ?? null),
      notes: row.notes ?? null,
      createdAt: toIso(row.createdAt),
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

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return err('VALIDATION_ERROR', 'Invalid start time');
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) return err('VALIDATION_ERROR', 'Invalid end time');

  const db = getDb();
  const [inserted] = await db
    .insert(listingInspections)
    .values({
      orgId: orgContext.data.orgId,
      listingId,
      type: parsed.data.type ?? 'open_home',
      startsAt,
      endsAt,
      notes: parsed.data.notes ?? null,
    })
    .returning({ id: listingInspections.id });

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

  const payload: Record<string, unknown> = {};
  if (parsed.data.type !== undefined) payload.type = parsed.data.type;
  if (parsed.data.startsAt !== undefined) {
    const date = new Date(parsed.data.startsAt);
    if (Number.isNaN(date.getTime())) return err('VALIDATION_ERROR', 'Invalid start time');
    payload.startsAt = date;
  }
  if (parsed.data.endsAt !== undefined) {
    const date = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
    if (date && Number.isNaN(date.getTime())) return err('VALIDATION_ERROR', 'Invalid end time');
    payload.endsAt = date;
  }
  if (parsed.data.notes !== undefined) payload.notes = parsed.data.notes ?? null;

  const db = getDb();
  await db
    .update(listingInspections)
    .set(payload)
    .where(and(eq(listingInspections.orgId, orgContext.data.orgId), eq(listingInspections.id, parsed.data.inspectionId)));

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ updated: true });
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
    .delete(listingInspections)
    .where(and(eq(listingInspections.orgId, orgContext.data.orgId), eq(listingInspections.id, parsed.data.inspectionId)));

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ deleted: true });
});
