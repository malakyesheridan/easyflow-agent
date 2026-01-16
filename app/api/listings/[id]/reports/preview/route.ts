import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { reportTemplates } from '@/db/schema/report_templates';
import { reportDrafts } from '@/db/schema/report_drafts';
import { createSecureToken } from '@/lib/security/tokens';
import { getBaseUrl } from '@/lib/url';
import { buildVendorReportPayload } from '@/lib/reports/payload';
import { loadListingReportContext } from '@/lib/reports/context';

const previewSchema = z.object({
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

function buildPreviewUrl(baseUrl: string, token: string) {
  const path = `/reports/vendor/preview/${token}`;
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}${path}` : path;
}

export const POST = withRoute(async (req: Request, context?: { params?: { id?: string } }) => {
  const listingId = context?.params?.id;
  if (!listingId) return err('VALIDATION_ERROR', 'Listing id is required');

  const body = await req.json();
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) {
    return err('VALIDATION_ERROR', parsed.error.errors[0]?.message || 'Invalid payload');
  }

  const orgContext = await requireOrgContext(req, parsed.data.orgId);
  if (!orgContext.ok) return orgContext;

  const listingContext = await loadListingReportContext({
    orgId: orgContext.data.orgId,
    listingId,
  });
  if (!listingContext) return err('NOT_FOUND', 'Listing not found');

  const { listing, milestones, checklist, enquiries, inspections, buyers } = listingContext;

  const db = getDb();
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

  const secureToken = createSecureToken();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db.insert(reportDrafts).values({
    orgId: orgContext.data.orgId,
    listingId,
    createdByUserId: orgContext.data.actor.userId ?? null,
    tokenHash: secureToken.tokenHash,
    payloadJson: payload as any,
    templateId: template ? template.id : null,
    sectionsOverrideJson: parsed.data.sectionsOverride ?? null,
    brandingOverrideJson: parsed.data.brandingOverride ?? null,
    expiresAt,
    createdAt: now,
  });

  const baseUrl = getBaseUrl(req);
  const previewUrl = buildPreviewUrl(baseUrl, secureToken.token);
  const pdfUrl = `${previewUrl}/pdf`;

  return ok({
    token: secureToken.token,
    previewUrl,
    pdfUrl,
    expiresAt: expiresAt.toISOString(),
  });
});
