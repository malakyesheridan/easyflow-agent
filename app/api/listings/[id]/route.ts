import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listings } from '@/db/schema/listings';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { listingEnquiries } from '@/db/schema/listing_enquiries';
import { listingInspections } from '@/db/schema/listing_inspections';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { contacts } from '@/db/schema/contacts';
import { users } from '@/db/schema/users';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const statusValues = ['draft', 'active', 'under_offer', 'sold', 'withdrawn'] as const;

const updateSchema = z.object({
  orgId: z.string().trim().min(1),
  vendorContactId: z.string().trim().optional(),
  ownerUserId: z.string().trim().nullable().optional(),
  address: z.string().trim().optional(),
  suburb: z.string().trim().optional(),
  status: z.enum(statusValues).optional(),
  listedAt: z.string().datetime().nullable().optional(),
  soldAt: z.string().datetime().nullable().optional(),
  priceGuideMin: z.number().int().nullable().optional(),
  priceGuideMax: z.number().int().nullable().optional(),
  propertyType: z.string().trim().nullable().optional(),
  beds: z.number().int().nullable().optional(),
  baths: z.number().int().nullable().optional(),
  cars: z.number().int().nullable().optional(),
});

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function healthBand(score: number) {
  if (score >= 70) return 'healthy';
  if (score >= 40) return 'watch';
  return 'stalling';
}

async function loadListing(params: { orgId: string; listingId: string }) {
  const db = getDb();
  const [row] = await db
    .select({
      id: listings.id,
      orgId: listings.orgId,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      status: listings.status,
      listedAt: listings.listedAt,
      soldAt: listings.soldAt,
      priceGuideMin: listings.priceGuideMin,
      priceGuideMax: listings.priceGuideMax,
      propertyType: listings.propertyType,
      beds: listings.beds,
      baths: listings.baths,
      cars: listings.cars,
      campaignHealthScore: listings.campaignHealthScore,
      campaignHealthReasons: listings.campaignHealthReasons,
      ownerUserId: listings.ownerUserId,
      vendorContactId: listings.vendorContactId,
      vendorName: contacts.fullName,
      vendorEmail: contacts.email,
      vendorPhone: contacts.phone,
      ownerName: users.name,
      ownerEmail: users.email,
      createdAt: listings.createdAt,
      updatedAt: listings.updatedAt,
    })
    .from(listings)
    .leftJoin(contacts, eq(listings.vendorContactId, contacts.id))
    .leftJoin(users, eq(listings.ownerUserId, users.id))
    .where(and(eq(listings.orgId, params.orgId), eq(listings.id, params.listingId)))
    .limit(1);

  if (!row) return null;

  const listingId = String(row.id);
  const [milestones, comms, enquiries, inspections, offers] = await Promise.all([
    db
      .select({
        targetDueAt: listingMilestones.targetDueAt,
        completedAt: listingMilestones.completedAt,
      })
      .from(listingMilestones)
      .where(and(eq(listingMilestones.orgId, params.orgId), eq(listingMilestones.listingId, params.listingId))),
    db
      .select({
        occurredAt: listingVendorComms.occurredAt,
      })
      .from(listingVendorComms)
      .where(and(eq(listingVendorComms.orgId, params.orgId), eq(listingVendorComms.listingId, params.listingId))),
    db
      .select({ id: listingEnquiries.id })
      .from(listingEnquiries)
      .where(and(eq(listingEnquiries.orgId, params.orgId), eq(listingEnquiries.listingId, params.listingId))),
    db
      .select({ id: listingInspections.id })
      .from(listingInspections)
      .where(and(eq(listingInspections.orgId, params.orgId), eq(listingInspections.listingId, params.listingId))),
    db
      .select({ id: listingBuyers.id })
      .from(listingBuyers)
      .where(and(
        eq(listingBuyers.orgId, params.orgId),
        eq(listingBuyers.listingId, params.listingId),
        eq(listingBuyers.status, 'offer_made')
      )),
  ]);

  const nextMilestone = milestones
    .filter((item) => item.targetDueAt && !item.completedAt)
    .map((item) => item.targetDueAt as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  const lastVendorUpdate = comms
    .map((item) => item.occurredAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const now = new Date();
  const baseDate = row.listedAt ?? row.createdAt ?? now;
  const domDays = Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000)));
  const score = row.campaignHealthScore ?? 50;

  return {
    id: listingId,
    address: row.addressLine1 ?? '',
    suburb: row.suburb ?? '',
    status: row.status,
    listedAt: toIso(row.listedAt),
    soldAt: toIso(row.soldAt),
    priceGuideMin: row.priceGuideMin ?? null,
    priceGuideMax: row.priceGuideMax ?? null,
    propertyType: row.propertyType ?? null,
    beds: row.beds ?? null,
    baths: row.baths ?? null,
    cars: row.cars ?? null,
    campaignHealthScore: score,
    campaignHealthReasons: (row.campaignHealthReasons as string[] | null) ?? [],
    healthBand: healthBand(score),
    daysOnMarket: domDays,
    nextMilestoneDue: toIso(nextMilestone),
    vendorUpdateLastSent: toIso(lastVendorUpdate),
    vendorUpdateOverdue: lastVendorUpdate ? (now.getTime() - lastVendorUpdate.getTime()) / (24 * 60 * 60 * 1000) > 7 : false,
    enquiriesCount: enquiries.length,
    inspectionsCount: inspections.length,
    offersCount: offers.length,
    vendor: row.vendorContactId
      ? { id: String(row.vendorContactId), name: row.vendorName ?? null, email: row.vendorEmail ?? null, phone: row.vendorPhone ?? null }
      : null,
    owner: row.ownerUserId
      ? { id: String(row.ownerUserId), name: row.ownerName ?? null, email: row.ownerEmail ?? null }
      : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export const GET = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) {
    return err('VALIDATION_ERROR', 'Listing id is required');
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const listing = await loadListing({ orgId: orgContext.data.orgId, listingId });
  if (!listing) return err('NOT_FOUND', 'Listing not found');
  return ok(listing);
});

export const PATCH = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) {
    return err('VALIDATION_ERROR', 'Listing id is required');
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

  if (parsed.data.vendorContactId !== undefined) payload.vendorContactId = parsed.data.vendorContactId ?? null;
  if (parsed.data.ownerUserId !== undefined) payload.ownerUserId = parsed.data.ownerUserId ?? null;
  if (parsed.data.address !== undefined) payload.addressLine1 = parsed.data.address ?? null;
  if (parsed.data.suburb !== undefined) payload.suburb = parsed.data.suburb ?? null;
  if (parsed.data.status !== undefined) payload.status = parsed.data.status;
  if (parsed.data.listedAt !== undefined) {
    const listedAt = parsed.data.listedAt ? new Date(parsed.data.listedAt) : null;
    if (listedAt && Number.isNaN(listedAt.getTime())) return err('VALIDATION_ERROR', 'Invalid listed date');
    payload.listedAt = listedAt;
  }
  if (parsed.data.soldAt !== undefined) {
    const soldAt = parsed.data.soldAt ? new Date(parsed.data.soldAt) : null;
    if (soldAt && Number.isNaN(soldAt.getTime())) return err('VALIDATION_ERROR', 'Invalid sold date');
    payload.soldAt = soldAt;
  }
  if (parsed.data.priceGuideMin !== undefined) payload.priceGuideMin = parsed.data.priceGuideMin;
  if (parsed.data.priceGuideMax !== undefined) payload.priceGuideMax = parsed.data.priceGuideMax;
  if (parsed.data.propertyType !== undefined) payload.propertyType = parsed.data.propertyType ?? null;
  if (parsed.data.beds !== undefined) payload.beds = parsed.data.beds;
  if (parsed.data.baths !== undefined) payload.baths = parsed.data.baths;
  if (parsed.data.cars !== undefined) payload.cars = parsed.data.cars;

  const db = getDb();
  await db
    .update(listings)
    .set(payload)
    .where(and(eq(listings.orgId, orgContext.data.orgId), eq(listings.id, listingId)));

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  const listing = await loadListing({ orgId: orgContext.data.orgId, listingId });
  if (!listing) return err('NOT_FOUND', 'Listing not found');
  return ok(listing);
});
