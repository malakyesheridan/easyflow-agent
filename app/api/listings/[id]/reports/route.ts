import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listings } from '@/db/schema/listings';
import { listingReports } from '@/db/schema/listing_reports';
import { reportTemplates } from '@/db/schema/report_templates';
import { listingMilestones } from '@/db/schema/listing_milestones';
import { listingChecklistItems } from '@/db/schema/listing_checklist_items';
import { listingEnquiries } from '@/db/schema/listing_enquiries';
import { listingInspections } from '@/db/schema/listing_inspections';
import { listingBuyers } from '@/db/schema/listing_buyers';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { contactActivities } from '@/db/schema/contact_activities';
import { contacts } from '@/db/schema/contacts';
import { users } from '@/db/schema/users';
import { createSecureToken } from '@/lib/security/tokens';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';
import { computeNextDueAt } from '@/lib/reports/cadence';

const DEFAULT_SECTIONS = {
  campaignSnapshot: true,
  milestonesProgress: true,
  buyerActivitySummary: true,
  buyerPipelineBreakdown: true,
  feedbackThemes: true,
  recommendations: true,
  marketingChannels: true,
  comparableSales: true,
};

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  templateId: z.string().uuid().optional(),
  deliveryMethod: z.enum(['share_link', 'email', 'sms', 'logged']).optional(),
  commentary: z.string().trim().min(1).optional(),
  recommendations: z.string().trim().min(1).optional(),
  feedbackThemes: z.string().trim().optional(),
  marketingChannels: z.string().trim().optional(),
  comparableSales: z.string().trim().optional(),
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
      templateId: listingReports.templateId,
      deliveryMethod: listingReports.deliveryMethod,
      templateName: reportTemplates.name,
      createdByName: users.name,
      createdByEmail: users.email,
    })
    .from(listingReports)
    .leftJoin(reportTemplates, eq(listingReports.templateId, reportTemplates.id))
    .leftJoin(users, eq(listingReports.createdByUserId, users.id))
    .where(and(eq(listingReports.orgId, orgContext.data.orgId), eq(listingReports.listingId, listingId)))
    .orderBy(desc(listingReports.createdAt));

  return ok(
    rows.map((row) => ({
      id: String(row.id),
      shareUrl: buildShareUrl(row.shareToken),
      createdAt: toIso(row.createdAt),
      createdByUserId: row.createdByUserId ? String(row.createdByUserId) : null,
      createdBy: row.createdByUserId
        ? { id: String(row.createdByUserId), name: row.createdByName ?? null, email: row.createdByEmail ?? null }
        : null,
      payload: row.payloadJson ?? {},
      templateId: row.templateId ? String(row.templateId) : null,
      templateName: row.templateName ?? null,
      deliveryMethod: row.deliveryMethod ?? null,
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
      reportCadenceEnabled: listings.reportCadenceEnabled,
      reportCadenceType: listings.reportCadenceType,
      reportCadenceIntervalDays: listings.reportCadenceIntervalDays,
      reportCadenceDayOfWeek: listings.reportCadenceDayOfWeek,
      reportTemplateId: listings.reportTemplateId,
      vendorContactId: listings.vendorContactId,
    })
    .from(listings)
    .where(and(eq(listings.orgId, orgContext.data.orgId), eq(listings.id, listingId)))
    .limit(1);

  if (!listing) return err('NOT_FOUND', 'Listing not found');

  const templateId = parsed.data.templateId ?? (listing.reportTemplateId ? String(listing.reportTemplateId) : null);
  const [template] = templateId
    ? await db
        .select()
        .from(reportTemplates)
        .where(and(eq(reportTemplates.orgId, orgContext.data.orgId), eq(reportTemplates.id, templateId)))
        .limit(1)
    : await db
        .select()
        .from(reportTemplates)
        .where(and(eq(reportTemplates.orgId, orgContext.data.orgId), eq(reportTemplates.templateType, 'vendor')))
        .orderBy(desc(reportTemplates.isDefault), desc(reportTemplates.createdAt))
        .limit(1);

  const [milestones, checklist, enquiries, inspections, buyers] = await Promise.all([
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
  ]);

  const now = new Date();
  const baseDate = listing.listedAt ?? listing.createdAt ?? now;
  const daysOnMarket = Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000)));

  const milestoneCompleted = milestones.filter((item) => item.completedAt).length;
  const overdueMilestones = milestones.filter((item) => item.targetDueAt && !item.completedAt && item.targetDueAt < now);
  const checklistCompleted = checklist.filter((item) => item.isDone).length;

  const activityWindow = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const enquiriesLast7 = enquiries.filter((item) => item.occurredAt >= activityWindow(7)).length;
  const enquiriesLast14 = enquiries.filter((item) => item.occurredAt >= activityWindow(14)).length;
  const inspectionsLast7 = inspections.filter((item) => item.startsAt >= activityWindow(7)).length;
  const inspectionsLast14 = inspections.filter((item) => item.startsAt >= activityWindow(14)).length;

  const buyerStatusCounts = buyers.reduce<Record<string, number>>((acc, row) => {
    const key = row.status ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const resolvedSections = template?.sectionsJson && Object.keys(template.sectionsJson).length > 0
    ? template.sectionsJson
    : DEFAULT_SECTIONS;
  const resolvedPrompts = template?.promptsJson ?? {};

  const payload = {
    generatedAt: now.toISOString(),
    template: template
      ? {
          id: String(template.id),
          name: template.name,
          sections: resolvedSections,
          prompts: resolvedPrompts,
        }
      : null,
    sections: resolvedSections,
    prompts: resolvedPrompts,
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
    milestones: {
      total: milestones.length,
      completed: milestoneCompleted,
      overdue: overdueMilestones.length,
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
    activity: {
      enquiriesLast7,
      enquiriesLast14,
      inspectionsLast7,
      inspectionsLast14,
      offers: buyers.filter((row) => row.status === 'offer_made').length,
    },
    buyerPipeline: buyerStatusCounts,
    commentary: parsed.data.commentary ?? '',
    recommendations: parsed.data.recommendations ?? '',
    feedbackThemes: parsed.data.feedbackThemes ?? '',
    marketingChannels: parsed.data.marketingChannels ?? '',
    comparableSales: parsed.data.comparableSales ?? '',
    deliveryMethod: parsed.data.deliveryMethod ?? 'share_link',
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
      templateId: template ? template.id : null,
      deliveryMethod: parsed.data.deliveryMethod ?? 'share_link',
      createdByUserId: orgContext.data.actor.userId ?? null,
    })
    .returning({ id: listingReports.id });

  await db.insert(listingVendorComms).values({
    orgId: orgContext.data.orgId,
    listingId,
    type: 'report_sent',
    content: `Report generated${template ? ` via ${template.name}` : ''}. ${shareUrl}`,
    occurredAt: now,
    createdByUserId: orgContext.data.actor.userId ?? null,
  });

  if (listing.vendorContactId) {
    const [vendor] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, listing.vendorContactId), eq(contacts.orgId, orgContext.data.orgId)))
      .limit(1);
    if (vendor) {
      await db.insert(contactActivities).values({
        orgId: orgContext.data.orgId,
        contactId: String(vendor.id),
        type: 'report_sent',
        content: `Vendor report generated. ${shareUrl}`,
        occurredAt: now,
        createdByUserId: orgContext.data.actor.userId ?? null,
      });
    }
  }

  const nextDueAt = listing.reportCadenceEnabled && listing.reportCadenceType !== 'none'
    ? computeNextDueAt({
        baseDate: now,
        cadence: {
          cadenceType: listing.reportCadenceType ?? 'weekly',
          intervalDays: listing.reportCadenceIntervalDays ?? null,
          dayOfWeek: listing.reportCadenceDayOfWeek ?? null,
        },
      })
    : null;

  await db
    .update(listings)
    .set({
      reportLastSentAt: now,
      reportNextDueAt: nextDueAt ?? null,
      reportTemplateId: template ? template.id : listing.reportTemplateId,
      updatedAt: new Date(),
    })
    .where(and(eq(listings.orgId, orgContext.data.orgId), eq(listings.id, listingId)));

  await recomputeCampaignHealth({ orgId: orgContext.data.orgId, listingId });

  return ok({
    id: inserted?.id ? String(inserted.id) : null,
    shareUrl,
    payload,
    nextDueAt: toIso(nextDueAt ?? null),
  });
});
