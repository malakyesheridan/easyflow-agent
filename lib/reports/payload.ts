import type { ReportTemplate } from '@/db/schema/report_templates';
import { DEFAULT_VENDOR_REPORT_SECTIONS } from '@/lib/reports/sections';
import type { VendorReportBranding, VendorReportPayload, VendorReportSections } from '@/lib/reports/types';

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function resolveSections(
  templateSections?: VendorReportSections | null,
  overrides?: VendorReportSections | null
): VendorReportSections {
  return {
    ...DEFAULT_VENDOR_REPORT_SECTIONS,
    ...(templateSections ?? {}),
    ...(overrides ?? {}),
  };
}

function resolveBranding(
  templateBranding?: VendorReportBranding | null,
  overrides?: VendorReportBranding | null
): VendorReportBranding {
  return {
    ...(templateBranding ?? {}),
    ...(overrides ?? {}),
  };
}

export function buildVendorReportPayload(params: {
  listing: {
    addressLine1: string | null;
    suburb: string | null;
    status: string;
    listedAt: Date | null;
    createdAt: Date | null;
    priceGuideMin: number | null;
    priceGuideMax: number | null;
    propertyType: string | null;
    beds: number | null;
    baths: number | null;
    cars: number | null;
    campaignHealthScore: number | null;
    campaignHealthReasons: string[] | null;
    reportLastSentAt: Date | null;
    reportNextDueAt: Date | null;
    reportCadenceType: string | null;
  };
  milestones: Array<{ name: string; targetDueAt: Date | null; completedAt: Date | null }>;
  checklist: Array<{ title: string; isDone: boolean }>;
  enquiries: Array<{ occurredAt: Date | null }>;
  inspections: Array<{ startsAt: Date | null }>;
  buyers: Array<{ status: string | null }>;
  template?: ReportTemplate | null;
  inputs: {
    commentary?: string | null;
    recommendations?: string | null;
    feedbackThemes?: string | null;
    marketingChannels?: string | null;
    comparableSales?: string | null;
    deliveryMethod?: string | null;
  };
  sectionsOverride?: VendorReportSections | null;
  brandingOverride?: VendorReportBranding | null;
  now?: Date;
}): VendorReportPayload {
  const now = params.now ?? new Date();
  const baseDate = params.listing.listedAt ?? params.listing.createdAt ?? now;
  const daysOnMarket = Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / (24 * 60 * 60 * 1000)));

  const activityWindow = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const enquiriesLast7 = params.enquiries.filter((item) => item.occurredAt && item.occurredAt >= activityWindow(7)).length;
  const enquiriesLast14 = params.enquiries.filter((item) => item.occurredAt && item.occurredAt >= activityWindow(14)).length;
  const inspectionsLast7 = params.inspections.filter((item) => item.startsAt && item.startsAt >= activityWindow(7)).length;
  const inspectionsLast14 = params.inspections.filter((item) => item.startsAt && item.startsAt >= activityWindow(14)).length;

  const milestoneCompleted = params.milestones.filter((item) => item.completedAt).length;
  const overdueMilestones = params.milestones.filter((item) => item.targetDueAt && !item.completedAt && item.targetDueAt < now);
  const checklistCompleted = params.checklist.filter((item) => item.isDone).length;

  const buyerStatusCounts = params.buyers.reduce<Record<string, number>>((acc, row) => {
    const key = row.status ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const templateSections = (params.template?.sectionsJson as VendorReportSections | null) ?? null;
  const templatePrompts = (params.template?.promptsJson as Record<string, string> | null) ?? {};
  const templateBranding = (params.template?.brandingJson as VendorReportBranding | null) ?? null;

  const resolvedSections = resolveSections(templateSections, params.sectionsOverride ?? null);
  const resolvedBranding = resolveBranding(templateBranding, params.brandingOverride ?? null);

  return {
    generatedAt: now.toISOString(),
    template: params.template
      ? {
          id: String(params.template.id),
          name: params.template.name,
          sections: resolvedSections,
          prompts: templatePrompts ?? {},
          branding: resolvedBranding,
        }
      : null,
    sections: resolvedSections,
    branding: resolvedBranding,
    listing: {
      address: params.listing.addressLine1 ?? '',
      suburb: params.listing.suburb ?? '',
      status: params.listing.status,
      listedAt: toIso(params.listing.listedAt ?? null),
      daysOnMarket,
      priceGuideMin: params.listing.priceGuideMin ?? null,
      priceGuideMax: params.listing.priceGuideMax ?? null,
      propertyType: params.listing.propertyType ?? null,
      beds: params.listing.beds ?? null,
      baths: params.listing.baths ?? null,
      cars: params.listing.cars ?? null,
    },
    campaignHealth: {
      score: params.listing.campaignHealthScore ?? null,
      reasons: params.listing.campaignHealthReasons ?? [],
    },
    milestones: {
      total: params.milestones.length,
      completed: milestoneCompleted,
      overdue: overdueMilestones.length,
      items: params.milestones.map((row) => ({
        name: row.name,
        targetDueAt: toIso(row.targetDueAt ?? null),
        completedAt: toIso(row.completedAt ?? null),
      })),
    },
    checklist: {
      total: params.checklist.length,
      completed: checklistCompleted,
    },
    activity: {
      enquiriesLast7,
      enquiriesLast14,
      inspectionsLast7,
      inspectionsLast14,
      offers: params.buyers.filter((row) => row.status === 'offer_made').length,
    },
    buyerPipeline: buyerStatusCounts,
    commentary: params.inputs.commentary ?? '',
    recommendations: params.inputs.recommendations ?? '',
    feedbackThemes: params.inputs.feedbackThemes ?? '',
    marketingChannels: params.inputs.marketingChannels ?? '',
    comparableSales: params.inputs.comparableSales ?? '',
    deliveryMethod: params.inputs.deliveryMethod ?? 'share_link',
    cadence: {
      lastSentAt: toIso(params.listing.reportLastSentAt ?? null),
      nextDueAt: toIso(params.listing.reportNextDueAt ?? null),
      cadenceType: params.listing.reportCadenceType ?? null,
    },
  };
}
