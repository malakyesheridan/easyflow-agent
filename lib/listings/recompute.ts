import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { listings } from '@/db/schema/listings';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { listingEnquiries } from '@/db/schema/listing_enquiries';
import { listingInspections } from '@/db/schema/listing_inspections';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { scoreCampaignHealth } from '@/lib/listings/score';

export async function recomputeCampaignHealth(params: { orgId: string; listingId: string }) {
  const db = getDb();
  const [listing] = await db
    .select({
      id: listings.id,
      listedAt: listings.listedAt,
      createdAt: listings.createdAt,
      status: listings.status,
    })
    .from(listings)
    .where(and(eq(listings.orgId, params.orgId), eq(listings.id, params.listingId)))
    .limit(1);

  if (!listing) return;

  const [milestones, checklist, enquiries, inspections, buyers, vendorComms] = await Promise.all([
    db
      .select({
        targetDueAt: listingMilestones.targetDueAt,
        completedAt: listingMilestones.completedAt,
      })
      .from(listingMilestones)
      .where(and(eq(listingMilestones.orgId, params.orgId), eq(listingMilestones.listingId, params.listingId))),
    db
      .select({
        isDone: listingChecklistItems.isDone,
        dueAt: listingChecklistItems.dueAt,
      })
      .from(listingChecklistItems)
      .where(and(eq(listingChecklistItems.orgId, params.orgId), eq(listingChecklistItems.listingId, params.listingId))),
    db
      .select({
        occurredAt: listingEnquiries.occurredAt,
      })
      .from(listingEnquiries)
      .where(and(eq(listingEnquiries.orgId, params.orgId), eq(listingEnquiries.listingId, params.listingId))),
    db
      .select({
        startsAt: listingInspections.startsAt,
      })
      .from(listingInspections)
      .where(and(eq(listingInspections.orgId, params.orgId), eq(listingInspections.listingId, params.listingId))),
    db
      .select({
        status: listingBuyers.status,
        nextFollowUpAt: listingBuyers.nextFollowUpAt,
      })
      .from(listingBuyers)
      .where(and(eq(listingBuyers.orgId, params.orgId), eq(listingBuyers.listingId, params.listingId))),
    db
      .select({
        occurredAt: listingVendorComms.occurredAt,
      })
      .from(listingVendorComms)
      .where(and(eq(listingVendorComms.orgId, params.orgId), eq(listingVendorComms.listingId, params.listingId))),
  ]);

  const score = scoreCampaignHealth({
    listing: {
      listedAt: listing.listedAt ?? null,
      createdAt: listing.createdAt ?? null,
      status: listing.status ?? null,
    },
    milestones: milestones.map((row) => ({
      targetDueAt: row.targetDueAt ?? null,
      completedAt: row.completedAt ?? null,
    })),
    checklist: checklist.map((row) => ({
      isDone: row.isDone,
      dueAt: row.dueAt ?? null,
    })),
    enquiries: enquiries.map((row) => ({ occurredAt: row.occurredAt })),
    inspections: inspections.map((row) => ({ startsAt: row.startsAt })),
    buyers: buyers.map((row) => ({
      status: row.status ?? null,
      nextFollowUpAt: row.nextFollowUpAt ?? null,
    })),
    vendorComms: vendorComms.map((row) => ({ occurredAt: row.occurredAt })),
  });

  await db
    .update(listings)
    .set({
      campaignHealthScore: score.score,
      campaignHealthReasons: score.reasons,
      updatedAt: new Date(),
    })
    .where(and(eq(listings.orgId, params.orgId), eq(listings.id, params.listingId)));
}
