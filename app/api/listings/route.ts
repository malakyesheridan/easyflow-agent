import { z } from 'zod';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listings } from '@/db/schema/listings';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingEnquiries } from '@/db/schema/listing_enquiries';
import { listingInspections } from '@/db/schema/listing_inspections';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { contacts } from '@/db/schema/contacts';
import { users } from '@/db/schema/users';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const statusValues = ['draft', 'active', 'under_offer', 'sold', 'withdrawn'] as const;

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  vendorContactId: z.string().trim().min(1),
  address: z.string().trim().min(1),
  suburb: z.string().trim().min(1),
  status: z.enum(statusValues).optional(),
  listedAt: z.string().datetime().optional(),
  priceGuideMin: z.number().int().optional(),
  priceGuideMax: z.number().int().optional(),
  propertyType: z.string().trim().optional(),
  beds: z.number().int().optional(),
  baths: z.number().int().optional(),
  cars: z.number().int().optional(),
  ownerUserId: z.string().trim().optional(),
});

const DEFAULT_MILESTONES = [
  'Photography complete',
  'Listing live',
  'First open home',
  'Campaign mid-point review',
  'Offer negotiation',
  'Contract exchanged',
];

const DEFAULT_CHECKLIST = [
  'Confirm vendor expectations',
  'Prepare marketing copy',
  'Book photography',
  'Publish listing portals',
  'Schedule open homes',
];

function parseStatuses(values: string[]) {
  return values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => statusValues.includes(value as typeof statusValues[number])) as Array<typeof statusValues[number]>;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function healthBand(score: number) {
  if (score >= 70) return 'healthy';
  if (score >= 40) return 'watch';
  return 'stalling';
}

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;

  const search = searchParams.get('q')?.trim() ?? '';
  const ownerId = searchParams.get('ownerId')?.trim() ?? '';
  const suburb = searchParams.get('suburb')?.trim() ?? '';
  const statusFilters = parseStatuses(searchParams.getAll('status'));
  const health = searchParams.get('health')?.trim() ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? 50)));

  const conditions = [eq(listings.orgId, context.data.orgId)];

  if (search) {
    const like = `%${search}%`;
    const filter = or(
      ilike(listings.addressLine1, like),
      ilike(listings.suburb, like),
      ilike(contacts.fullName, like),
      ilike(contacts.email, like)
    );
    if (filter) conditions.push(filter);
  }

  if (ownerId) {
    conditions.push(eq(listings.ownerUserId, ownerId));
  }

  if (suburb) {
    conditions.push(ilike(listings.suburb, `%${suburb}%`));
  }

  if (statusFilters.length > 0) {
    conditions.push(inArray(listings.status, statusFilters));
  }

  const db = getDb();
  const rows = await db
    .select({
      id: listings.id,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      status: listings.status,
      listedAt: listings.listedAt,
      createdAt: listings.createdAt,
      ownerUserId: listings.ownerUserId,
      vendorContactId: listings.vendorContactId,
      campaignHealthScore: listings.campaignHealthScore,
      campaignHealthReasons: listings.campaignHealthReasons,
      vendorName: contacts.fullName,
      vendorEmail: contacts.email,
      ownerName: users.name,
      ownerEmail: users.email,
    })
    .from(listings)
    .leftJoin(contacts, eq(listings.vendorContactId, contacts.id))
    .leftJoin(users, eq(listings.ownerUserId, users.id))
    .where(and(...conditions));

  const listingIds = rows.map((row) => String(row.id));
  const now = new Date();

  const [milestoneRows, commRows, enquiryRows, inspectionRows, offerRows] = await Promise.all([
    listingIds.length
      ? db
          .select({
            listingId: listingMilestones.listingId,
            targetDueAt: listingMilestones.targetDueAt,
            completedAt: listingMilestones.completedAt,
          })
          .from(listingMilestones)
          .where(and(eq(listingMilestones.orgId, context.data.orgId), inArray(listingMilestones.listingId, listingIds)))
      : [],
    listingIds.length
      ? db
          .select({
            listingId: listingVendorComms.listingId,
            occurredAt: listingVendorComms.occurredAt,
          })
          .from(listingVendorComms)
          .where(and(eq(listingVendorComms.orgId, context.data.orgId), inArray(listingVendorComms.listingId, listingIds)))
      : [],
    listingIds.length
      ? db
          .select({
            listingId: listingEnquiries.listingId,
            occurredAt: listingEnquiries.occurredAt,
          })
          .from(listingEnquiries)
          .where(and(eq(listingEnquiries.orgId, context.data.orgId), inArray(listingEnquiries.listingId, listingIds)))
      : [],
    listingIds.length
      ? db
          .select({
            listingId: listingInspections.listingId,
            startsAt: listingInspections.startsAt,
          })
          .from(listingInspections)
          .where(and(eq(listingInspections.orgId, context.data.orgId), inArray(listingInspections.listingId, listingIds)))
      : [],
    listingIds.length
      ? db
          .select({
            listingId: listingBuyers.listingId,
          })
          .from(listingBuyers)
          .where(and(
            eq(listingBuyers.orgId, context.data.orgId),
            inArray(listingBuyers.listingId, listingIds),
            eq(listingBuyers.status, 'offer_made')
          ))
      : [],
  ]);

  const milestonesByListing = new Map<string, Array<{ targetDueAt: Date | null; completedAt: Date | null }>>();
  milestoneRows.forEach((row) => {
    const listingId = String(row.listingId);
    const existing = milestonesByListing.get(listingId) ?? [];
    existing.push({ targetDueAt: row.targetDueAt ?? null, completedAt: row.completedAt ?? null });
    milestonesByListing.set(listingId, existing);
  });

  const commsByListing = new Map<string, Date[]>();
  commRows.forEach((row) => {
    const listingId = String(row.listingId);
    const existing = commsByListing.get(listingId) ?? [];
    existing.push(row.occurredAt);
    commsByListing.set(listingId, existing);
  });

  const enquiriesByListing = new Map<string, number>();
  enquiryRows.forEach((row) => {
    const listingId = String(row.listingId);
    enquiriesByListing.set(listingId, (enquiriesByListing.get(listingId) ?? 0) + 1);
  });

  const inspectionsByListing = new Map<string, number>();
  inspectionRows.forEach((row) => {
    const listingId = String(row.listingId);
    inspectionsByListing.set(listingId, (inspectionsByListing.get(listingId) ?? 0) + 1);
  });

  const offersByListing = new Map<string, number>();
  offerRows.forEach((row) => {
    const listingId = String(row.listingId);
    offersByListing.set(listingId, (offersByListing.get(listingId) ?? 0) + 1);
  });

  const data = rows.map((row) => {
    const listingId = String(row.id);
    const milestoneItems = milestonesByListing.get(listingId) ?? [];
    const upcoming = milestoneItems
      .filter((item) => item.targetDueAt && !item.completedAt)
      .map((item) => item.targetDueAt as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const comms = commsByListing.get(listingId) ?? [];
    const lastVendorUpdate = comms.length > 0
      ? comms.sort((a, b) => b.getTime() - a.getTime())[0]
      : null;

    const score = row.campaignHealthScore ?? 50;
    const band = healthBand(score);

    const baseDate = row.listedAt ?? row.createdAt ?? now;
    const domDays = Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000)));
    const daysSinceVendorUpdate = lastVendorUpdate ? Math.floor((now.getTime() - lastVendorUpdate.getTime()) / (24 * 60 * 60 * 1000)) : null;

    return {
      id: listingId,
      address: row.addressLine1 ?? '',
      suburb: row.suburb ?? '',
      status: row.status,
      listedAt: toIso(row.listedAt),
      daysOnMarket: domDays,
      campaignHealthScore: score,
      campaignHealthReasons: (row.campaignHealthReasons as string[] | null) ?? [],
      healthBand: band,
      nextMilestoneDue: toIso(upcoming),
      vendorUpdateLastSent: toIso(lastVendorUpdate),
      vendorUpdateOverdue: daysSinceVendorUpdate !== null ? daysSinceVendorUpdate > 7 : false,
      enquiriesCount: enquiriesByListing.get(listingId) ?? 0,
      inspectionsCount: inspectionsByListing.get(listingId) ?? 0,
      offersCount: offersByListing.get(listingId) ?? 0,
      vendor: row.vendorContactId
        ? { id: String(row.vendorContactId), name: row.vendorName ?? null, email: row.vendorEmail ?? null }
        : null,
      owner: row.ownerUserId
        ? { id: String(row.ownerUserId), name: row.ownerName ?? null, email: row.ownerEmail ?? null }
        : null,
    };
  });

  const filtered = health ? data.filter((row) => row.healthBand === health) : data;
  filtered.sort((a, b) => (b.campaignHealthScore ?? 0) - (a.campaignHealthScore ?? 0));

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

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

  const listedAt = parsed.data.listedAt ? new Date(parsed.data.listedAt) : null;
  if (listedAt && Number.isNaN(listedAt.getTime())) {
    return err('VALIDATION_ERROR', 'Invalid listed date');
  }

  const db = getDb();
  const [inserted] = await db
    .insert(listings)
    .values({
      orgId: context.data.orgId,
      vendorContactId: parsed.data.vendorContactId,
      ownerUserId: parsed.data.ownerUserId ?? context.data.actor.userId ?? null,
      addressLine1: parsed.data.address,
      suburb: parsed.data.suburb,
      status: parsed.data.status ?? 'draft',
      listedAt: listedAt ?? null,
      priceGuideMin: parsed.data.priceGuideMin ?? null,
      priceGuideMax: parsed.data.priceGuideMax ?? null,
      propertyType: parsed.data.propertyType ?? null,
      beds: parsed.data.beds ?? null,
      baths: parsed.data.baths ?? null,
      cars: parsed.data.cars ?? null,
      updatedAt: new Date(),
    })
    .returning({ id: listings.id });

  const listingId = inserted?.id ? String(inserted.id) : null;
  if (!listingId) {
    return err('INTERNAL_ERROR', 'Failed to create listing');
  }

  if (DEFAULT_MILESTONES.length > 0) {
    await db.insert(listingMilestones).values(
      DEFAULT_MILESTONES.map((name, index) => ({
        orgId: context.data.orgId,
        listingId,
        name,
        sortOrder: index,
        updatedAt: new Date(),
      }))
    );
  }

  if (DEFAULT_CHECKLIST.length > 0) {
    await db.insert(listingChecklistItems).values(
      DEFAULT_CHECKLIST.map((title, index) => ({
        orgId: context.data.orgId,
        listingId,
        title,
        sortOrder: index,
        updatedAt: new Date(),
      }))
    );
  }

  await recomputeCampaignHealth({ orgId: context.data.orgId, listingId });

  return ok({ id: listingId });
});
