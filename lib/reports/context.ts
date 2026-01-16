import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { listings } from '@/db/schema/listings';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { listingEnquiries } from '@/db/schema/listing_enquiries';
import { listingInspections } from '@/db/schema/listing_inspections';
import { listingBuyers } from '@/db/schema/listing_buyers';

export async function loadListingReportContext(params: { orgId: string; listingId: string }) {
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
      reportCadenceEnabled: listings.reportCadenceEnabled,
      reportCadenceType: listings.reportCadenceType,
      reportCadenceIntervalDays: listings.reportCadenceIntervalDays,
      reportCadenceDayOfWeek: listings.reportCadenceDayOfWeek,
      reportTemplateId: listings.reportTemplateId,
      reportLastSentAt: listings.reportLastSentAt,
      reportNextDueAt: listings.reportNextDueAt,
      vendorContactId: listings.vendorContactId,
    })
    .from(listings)
    .where(and(eq(listings.orgId, params.orgId), eq(listings.id, params.listingId)))
    .limit(1);

  if (!listing) return null;

  const [milestones, checklist, enquiries, inspections, buyers] = await Promise.all([
    db
      .select({
        name: listingMilestones.name,
        targetDueAt: listingMilestones.targetDueAt,
        completedAt: listingMilestones.completedAt,
      })
      .from(listingMilestones)
      .where(and(eq(listingMilestones.orgId, params.orgId), eq(listingMilestones.listingId, params.listingId))),
    db
      .select({
        title: listingChecklistItems.title,
        isDone: listingChecklistItems.isDone,
      })
      .from(listingChecklistItems)
      .where(and(eq(listingChecklistItems.orgId, params.orgId), eq(listingChecklistItems.listingId, params.listingId))),
    db
      .select({ occurredAt: listingEnquiries.occurredAt })
      .from(listingEnquiries)
      .where(and(eq(listingEnquiries.orgId, params.orgId), eq(listingEnquiries.listingId, params.listingId))),
    db
      .select({ startsAt: listingInspections.startsAt })
      .from(listingInspections)
      .where(and(eq(listingInspections.orgId, params.orgId), eq(listingInspections.listingId, params.listingId))),
    db
      .select({ status: listingBuyers.status })
      .from(listingBuyers)
      .where(and(eq(listingBuyers.orgId, params.orgId), eq(listingBuyers.listingId, params.listingId))),
  ]);

  return {
    listing,
    milestones,
    checklist,
    enquiries,
    inspections,
    buyers,
  };
}
