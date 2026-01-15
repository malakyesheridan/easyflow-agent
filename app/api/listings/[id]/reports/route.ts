import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listings } from '@/db/schema/listings';
import { listingReports } from '@/db/schema/listing_reports';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { listingEnquiries } from '@/db/schema/listing_enquiries';
import { listingInspections } from '@/db/schema/listing_inspections';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { createSecureToken } from '@/lib/security/tokens';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  commentary: z.string().trim().optional(),
  recommendedNextActions: z.string().trim().optional(),
});

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildShareUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}/reports/vendor/${token}`;
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
      id: listingReports.id,
      shareToken: listingReports.shareToken,
      payloadJson: listingReports.payloadJson,
      createdAt: listingReports.createdAt,
      createdByUserId: listingReports.createdByUserId,
    })
    .from(listingReports)
    .where(and(eq(listingReports.orgId, orgContext.data.orgId), eq(listingReports.listingId, listingId)))
    .orderBy(desc(listingReports.createdAt));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      shareUrl: buildShareUrl(row.shareToken),
      createdAt: toIso(row.createdAt),
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      payload: row.payloadJson ?? {},
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
  const [listing] = await db
    .select({
      id: listings.id,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      status: listings.status,
      listedAt: listings.listedAt,
      createdAt: listings.createdAt,
      priceGuideMin: listings.priceGuideMin,
      priceGuideMax: listings.priceGuideMax,
      propertyType: listings.propertyType,
      beds: listings.beds,
      baths: listings.baths,
      cars: listings.cars,
      campaignHealthScore: listings.campaignHealthScore,
      campaignHealthReasons: listings.campaignHealthReasons,
    })
    .from(listings)
    .where(and(eq(listings.orgId, orgContext.data.orgId), eq(listings.id, listingId)))
    .limit(1);

  if (!listing) return err('NOT_FOUND', 'Listing not found');

  const [milestones, checklist, enquiries, inspections, buyers, vendorComms] = await Promise.all([
    db
      .select({
        name: listingMilestones.name,
        targetDueAt: listingMilestones.targetDueAt,
        completedAt: listingMilestones.completedAt,
      })
      .from(listingMilestones)
      .where(and(eq(listingMilestones.orgId, orgContext.data.orgId), eq(listingMilestones.listingId, listingId))),
    db
      .select({
        title: listingChecklistItems.title,
        isDone: listingChecklistItems.isDone,
      })
      .from(listingChecklistItems)
      .where(and(eq(listingChecklistItems.orgId, orgContext.data.orgId), eq(listingChecklistItems.listingId, listingId))),
    db
      .select({ occurredAt: listingEnquiries.occurredAt })
      .from(listingEnquiries)
      .where(and(eq(listingEnquiries.orgId, orgContext.data.orgId), eq(listingEnquiries.listingId, listingId))),
    db
      .select({ startsAt: listingInspections.startsAt })
      .from(listingInspections)
      .where(and(eq(listingInspections.orgId, orgContext.data.orgId), eq(listingInspections.listingId, listingId))),
    db
      .select({ status: listingBuyers.status })
      .from(listingBuyers)
      .where(and(eq(listingBuyers.orgId, orgContext.data.orgId), eq(listingBuyers.listingId, listingId))),
    db
      .select({ occurredAt: listingVendorComms.occurredAt })
      .from(listingVendorComms)
      .where(and(eq(listingVendorComms.orgId, orgContext.data.orgId), eq(listingVendorComms.listingId, listingId))),
  ]);

  const now = new Date();
  const baseDate = listing.listedAt ?? listing.createdAt ?? now;
  const daysOnMarket = Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000)));

  const milestoneCompleted = milestones.filter((item) => item.completedAt).length;
  const checklistCompleted = checklist.filter((item) => item.isDone).length;
  const buyerStatusCounts = buyers.reduce<Record<string, number>>((acc, row) => {
    const key = row.status ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const lastVendorUpdate = vendorComms
    .map((row) => row.occurredAt)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const payload = {
    generatedAt: now.toISOString(),
    listing: {
      address: listing.addressLine1 ?? '',
      suburb: listing.suburb ?? '',
      status: listing.status,
      listedAt: toIso(listing.listedAt ?? null),
      daysOnMarket,
      priceGuideMin: listing.priceGuideMin ?? null,
      priceGuideMax: listing.priceGuideMax ?? null,
      propertyType: listing.propertyType ?? null,
      beds: listing.beds ?? null,
      baths: listing.baths ?? null,
      cars: listing.cars ?? null,
    },
    campaignHealth: {
      score: listing.campaignHealthScore ?? null,
      reasons: (listing.campaignHealthReasons as string[] | null) ?? [],
    },
    counts: {
      enquiries: enquiries.length,
      inspections: inspections.length,
      buyers: buyers.length,
      offers: buyers.filter((row) => row.status === 'offer_made').length,
    },
    milestones: {
      total: milestones.length,
      completed: milestoneCompleted,
      items: milestones.map((row) => ({
        name: row.name,
        targetDueAt: toIso(row.targetDueAt ?? null),
        completedAt: toIso(row.completedAt ?? null),
      })),
    },
    checklist: {
      total: checklist.length,
      completed: checklistCompleted,
    },
    buyerPipeline: buyerStatusCounts,
    vendorComms: {
      lastSentAt: toIso(lastVendorUpdate),
    },
    commentary: parsed.data.commentary ?? '',
    recommendedNextActions: parsed.data.recommendedNextActions ?? '',
  };

  const token = createSecureToken().token;
  const shareUrl = buildShareUrl(token);

  const [inserted] = await db
    .insert(listingReports)
    .values({
      orgId: orgContext.data.orgId,
      listingId,
      type: 'vendor',
      shareToken: token,
      payloadJson: payload as any,
      createdByUserId: orgContext.data.actor.userId ?? null,
    })
    .returning({ id: listingReports.id });

  await db.insert(listingVendorComms).values({
    orgId: orgContext.data.orgId,
    listingId,
    type: 'report_sent',
    content: 'Vendor report generated.',
    occurredAt: now,
    createdByUserId: orgContext.data.actor.userId ?? null,
  });

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({ id: inserted?.id ? String(inserted.id) : null, shareUrl, payload });
});
