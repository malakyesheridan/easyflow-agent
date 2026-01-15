import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { contacts } from '@/db/schema/contacts';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const statusValues = [
  'new',
  'contacted',
  'inspection_booked',
  'attended',
  'offer_potential',
  'offer_made',
  'not_interested',
] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  buyerContactId: z.string().trim().min(1),
  status: z.enum(statusValues).optional(),
  nextFollowUpAt: z.string().datetime().optional(),
  notes: z.string().trim().optional(),
});

const updateSchema = z.object({
  orgId: z.string().trim().min(1),
  buyerId: z.string().trim().min(1),
  status: z.enum(statusValues).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
});

const deleteSchema = z.object({
  orgId: z.string().trim().min(1),
  buyerId: z.string().trim().min(1),
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
      id: listingBuyers.id,
      buyerContactId: listingBuyers.buyerContactId,
      status: listingBuyers.status,
      nextFollowUpAt: listingBuyers.nextFollowUpAt,
      notes: listingBuyers.notes,
      createdAt: listingBuyers.createdAt,
      updatedAt: listingBuyers.updatedAt,
      buyerName: contacts.fullName,
      buyerEmail: contacts.email,
      buyerPhone: contacts.phone,
      buyerSuburb: contacts.suburb,
    })
    .from(listingBuyers)
    .innerJoin(contacts, eq(listingBuyers.buyerContactId, contacts.id))
    .where(and(eq(listingBuyers.orgId, orgContext.data.orgId), eq(listingBuyers.listingId, listingId)))
    .orderBy(desc(listingBuyers.createdAt));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      buyerContactId: String(row.buyerContactId),
      status: row.status,
      nextFollowUpAt: toIso(row.nextFollowUpAt ?? null),
      notes: row.notes ?? null,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
      buyer: {
        id: String(row.buyerContactId),
        name: row.buyerName ?? null,
        email: row.buyerEmail ?? null,
        phone: row.buyerPhone ?? null,
        suburb: row.buyerSuburb ?? null,
      },
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

  const nextFollowUpAt = parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null;
  if (nextFollowUpAt && Number.isNaN(nextFollowUpAt.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid follow-up date');
  }

  const db = getDb();
  const [inserted] = await db
    .insert(listingBuyers)
    .values({
      orgId: orgContext.data.orgId,
      listingId,
      buyerContactId: parsed.data.buyerContactId,
      status: parsed.data.status ?? 'new',
      nextFollowUpAt,
      notes: parsed.data.notes ?? null,
      updatedAt: new Date(),
    })
    .returning({ id: listingBuyers.id });

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

  const payload: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.status !== undefined) payload.status = parsed.data.status;
  if (parsed.data.nextFollowUpAt !== undefined) {
    const date = parsed.data.nextFollowUpAt ? new Date(parsed.data.nextFollowUpAt) : null;
    if (date && Number.isNaN(date.getTime())) return err('VALIDATION_ERROR', 'Invalid follow-up date');
    payload.nextFollowUpAt = date;
  }
  if (parsed.data.notes !== undefined) payload.notes = parsed.data.notes ?? null;

  const db = getDb();
  await db
    .update(listingBuyers)
    .set(payload)
    .where(and(eq(listingBuyers.orgId, orgContext.data.orgId), eq(listingBuyers.id, parsed.data.buyerId)));

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
    .delete(listingBuyers)
    .where(and(eq(listingBuyers.orgId, orgContext.data.orgId), eq(listingBuyers.id, parsed.data.buyerId)));

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ deleted: true });
});
