import { DEFAULT_VENDOR_REPORT_SECTIONS } from '@/lib/reports/sections';
import type { VendorReportBranding, VendorReportPayload } from '@/lib/reports/types';

export function normalizeVendorReportPayload(input: Partial<VendorReportPayload> | null | undefined): VendorReportPayload {
  const payload = (input ?? {}) as Partial<VendorReportPayload>;
  const templateSections = payload.template?.sections ?? {};
  const sections = { ...DEFAULT_VENDOR_REPORT_SECTIONS, ...templateSections, ...(payload.sections ?? {}) };
  const templateBranding = payload.template?.branding ?? {};
  const branding = { ...templateBranding, ...(payload.branding ?? {}) } as VendorReportBranding;

  return {
    generatedAt: payload.generatedAt ?? new Date().toISOString(),
    template: payload.template ?? null,
    sections,
    branding,
    listing: {
      address: payload.listing?.address ?? '',
      suburb: payload.listing?.suburb ?? '',
      status: payload.listing?.status ?? '',
      listedAt: payload.listing?.listedAt ?? null,
      daysOnMarket: payload.listing?.daysOnMarket ?? 0,
      priceGuideMin: payload.listing?.priceGuideMin ?? null,
      priceGuideMax: payload.listing?.priceGuideMax ?? null,
      propertyType: payload.listing?.propertyType ?? null,
      beds: payload.listing?.beds ?? null,
      baths: payload.listing?.baths ?? null,
      cars: payload.listing?.cars ?? null,
    },
    campaignHealth: {
      score: payload.campaignHealth?.score ?? null,
      reasons: payload.campaignHealth?.reasons ?? [],
    },
    milestones: {
      total: payload.milestones?.total ?? 0,
      completed: payload.milestones?.completed ?? 0,
      overdue: payload.milestones?.overdue ?? 0,
      items: payload.milestones?.items ?? [],
    },
    checklist: {
      total: payload.checklist?.total ?? 0,
      completed: payload.checklist?.completed ?? 0,
    },
    activity: {
      enquiriesLast7: payload.activity?.enquiriesLast7 ?? 0,
      enquiriesLast14: payload.activity?.enquiriesLast14 ?? 0,
      inspectionsLast7: payload.activity?.inspectionsLast7 ?? 0,
      inspectionsLast14: payload.activity?.inspectionsLast14 ?? 0,
      offers: payload.activity?.offers ?? 0,
    },
    buyerPipeline: payload.buyerPipeline ?? {},
    commentary: payload.commentary ?? '',
    recommendations: payload.recommendations ?? '',
    feedbackThemes: payload.feedbackThemes ?? '',
    marketingChannels: payload.marketingChannels ?? '',
    comparableSales: payload.comparableSales ?? '',
    deliveryMethod: payload.deliveryMethod ?? 'share_link',
    cadence: {
      lastSentAt: payload.cadence?.lastSentAt ?? null,
      nextDueAt: payload.cadence?.nextDueAt ?? null,
      cadenceType: payload.cadence?.cadenceType ?? null,
    },
  };
}
