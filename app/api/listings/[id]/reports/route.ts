import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { getDb } from '@/lib/db';
import { requireOrgContext } from '@/lib/auth/require';
import { listings } from '@/db/schema/listings';
import { listingReports } from '@/db/schema/listing_reports';
import { reportTemplates } from '@/db/schema/report_templates';
import { listingVendorComms } from '@/db/schema/listing_vendor_comms';
import { contactActivities } from '@/db/schema/contact_activities';
import { contacts } from '@/db/schema/contacts';
import { users } from '@/db/schema/users';
import { createSecureToken } from '@/lib/security/tokens';
import { recomputeCampaignHealth } from '@/lib/listings/recompute';
import { computeNextDueAt } from '@/lib/reports/cadence';
import { getBaseUrl } from '@/lib/url';
import { buildVendorReportPayload } from '@/lib/reports/payload';
import { loadListingReportContext } from '@/lib/reports/context';

const createSchema = z.object({
  orgId: z.string().trim().min(1),
  templateId: z.string().uuid().optional(),
  deliveryMethod: z.enum(['share_link', 'email', 'sms', 'logged']).optional(),
  commentary: z.string().trim().min(1).optional(),
  recommendations: z.string().trim().min(1).optional(),
  feedbackThemes: z.string().trim().optional(),
  marketingChannels: z.string().trim().optional(),
  comparableSales: z.string().trim().optional(),
  sectionsOverride: z.record(z.boolean()).optional(),
  brandingOverride: z
    .object({
      showLogo: z.boolean().optional(),
      headerStyle: z.enum(['compact', 'full']).optional(),
      accentColor: z.string().trim().max(20).optional(),
      logoPosition: z.enum(['left', 'center', 'right']).optional(),
    })
    .optional(),
});

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildShareUrl(token: string, req?: Request) {
  const baseUrl = getBaseUrl(req);
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
      shareUrl: buildShareUrl(row.shareToken, req),
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
  const listingContext = await loadListingReportContext({
    orgId: orgContext.data.orgId,
    listingId,
  });
  if (!listingContext) return err('NOT_FOUND', 'Listing not found');

  const { listing, milestones, checklist, enquiries, inspections, buyers } = listingContext;

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

  const now = new Date();
  const payload = buildVendorReportPayload({
    listing: {
      addressLine1: listing.addressLine1,
      suburb: listing.suburb,
      status: listing.status,
      listedAt: listing.listedAt,
      createdAt: listing.createdAt,
      priceGuideMin: listing.priceGuideMin,
      priceGuideMax: listing.priceGuideMax,
      propertyType: listing.propertyType,
      beds: listing.beds,
      baths: listing.baths,
      cars: listing.cars,
      campaignHealthScore: listing.campaignHealthScore,
      campaignHealthReasons: (listing.campaignHealthReasons as string[] | null) ?? [],
      reportLastSentAt: listing.reportLastSentAt ?? null,
      reportNextDueAt: listing.reportNextDueAt ?? null,
      reportCadenceType: listing.reportCadenceType ?? null,
    },
    milestones,
    checklist,
    enquiries,
    inspections,
    buyers,
    template: template ?? null,
    inputs: {
      commentary: parsed.data.commentary ?? '',
      recommendations: parsed.data.recommendations ?? '',
      feedbackThemes: parsed.data.feedbackThemes ?? '',
      marketingChannels: parsed.data.marketingChannels ?? '',
      comparableSales: parsed.data.comparableSales ?? '',
      deliveryMethod: parsed.data.deliveryMethod ?? 'share_link',
    },
    sectionsOverride: parsed.data.sectionsOverride ?? null,
    brandingOverride: parsed.data.brandingOverride ?? null,
    now,
  });

  const token = createSecureToken().token;
  const shareUrl = buildShareUrl(token, req);

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
