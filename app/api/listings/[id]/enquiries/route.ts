import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listingEnquiries } from '@/db/schema/listing_enquiries';
import { contacts } from '@/db/schema/contacts';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  occurredAt: z.string().datetime().optional(),
  source: z.string().trim().min(1),
  buyerContactId: z.string().trim().optional(),
  notes: z.string().trim().optional(),
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
      id: listingEnquiries.id,
      occurredAt: listingEnquiries.occurredAt,
      source: listingEnquiries.source,
      buyerContactId: listingEnquiries.buyerContactId,
      notes: listingEnquiries.notes,
      buyerName: contacts.fullName,
      buyerEmail: contacts.email,
      createdAt: listingEnquiries.createdAt,
    })
    .from(listingEnquiries)
    .leftJoin(contacts, eq(listingEnquiries.buyerContactId, contacts.id))
    .where(and(eq(listingEnquiries.orgId, orgContext.data.orgId), eq(listingEnquiries.listingId, listingId)))
    .orderBy(desc(listingEnquiries.occurredAt));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      occurredAt: toIso(row.occurredAt),
      source: row.source,
      buyerContactId: row.buyerContactId ? String(row.buyerContactId) : null,
      buyerName: row.buyerName ?? null,
      buyerEmail: row.buyerEmail ?? null,
      notes: row.notes ?? null,
      createdAt: toIso(row.createdAt ?? null),
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

  const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid occurred date');
  }

  const db = getDb();
  const [inserted] = await db
    .insert(listingEnquiries)
    .values({
      orgId: orgContext.data.orgId,
      listingId,
      occurredAt,
      source: parsed.data.source,
      buyerContactId: parsed.data.buyerContactId ?? null,
      notes: parsed.data.notes ?? null,
      createdByUserId: orgContext.data.actor.userId ?? null,
    })
    .returning({ id: listingEnquiries.id });

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ id: inserted?.id ? String(inserted.id) : null });
});
