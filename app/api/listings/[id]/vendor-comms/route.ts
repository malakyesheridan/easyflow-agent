import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const commTypes = ['call', 'email', 'sms', 'update', 'report_sent'] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  type: z.enum(commTypes).optional(),
  content: z.string().trim().min(1),
  occurredAt: z.string().datetime().optional(),
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
      id: listingVendorComms.id,
      type: listingVendorComms.type,
      content: listingVendorComms.content,
      occurredAt: listingVendorComms.occurredAt,
      createdAt: listingVendorComms.createdAt,
      createdByUserId: listingVendorComms.createdByUserId,
    })
    .from(listingVendorComms)
    .where(and(eq(listingVendorComms.orgId, orgContext.data.orgId), eq(listingVendorComms.listingId, listingId)))
    .orderBy(desc(listingVendorComms.occurredAt));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      content: row.content,
      occurredAt: toIso(row.occurredAt),
      createdAt: toIso(row.createdAt),
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
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
  if (Number.isNaN(occurredAt.getTime())) return err('VALIDATION_ERROR', 'Invalid occurred date');

  const db = getDb();
  const [inserted] = await db
    .insert(listingVendorComms)
    .values({
      orgId: orgContext.data.orgId,
      listingId,
      type: parsed.data.type ?? 'update',
      content: parsed.data.content,
      occurredAt,
      createdByUserId: orgContext.data.actor.userId ?? null,
    })
    .returning({ id: listingVendorComms.id });

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ id: inserted?.id ? String(inserted.id) : null });
});
