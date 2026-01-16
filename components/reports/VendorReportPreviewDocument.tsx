/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import { cn } from '@/lib/utils';
import { resolveBrandColor } from '@/lib/invoices/format';
import { normalizeVendorReportPayload } from '@/lib/reports/document';
import type { VendorReportDocumentData } from '@/lib/reports/types';

const manrope = Manrope({ subsets: ['latin'] });
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--report-serif',
});

type VendorReportPreviewDocumentProps = {
  data: VendorReportDocumentData;
  showActions?: boolean;
  showBackLink?: boolean;
  backHref?: string;
  pdfUrl?: string;
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatPrice(value?: number | null) {
  if (value === null || value === undefined) return '-';
  if (!Number.isFinite(value)) return '-';
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
    value
  );
}

function formatPriceRange(min?: number | null, max?: number | null) {
  if (min == null && max == null) return '-';
  if (min != null && max != null) return `${formatPrice(min)} - ${formatPrice(max)}`;
  return formatPrice(min ?? max ?? null);
}

function formatStatus(status: string) {
  if (!status) return '-';
  return status.replace(/_/g, ' ');
}

export default function VendorReportPreviewDocument({
  data,
  showActions = true,
  showBackLink = true,
  backHref,
  pdfUrl,
}: VendorReportPreviewDocumentProps) {
  const payload = normalizeVendorReportPayload(data.payload);
  const accent = resolveBrandColor(payload.branding.accentColor ?? data.org.brandPrimaryColor, '#0f172a');
  const accentSoft = resolveBrandColor(data.org.brandSecondaryColor, '#f8fafc');
  const brandStyles = {
    '--report-accent': accent,
    '--report-soft': accentSoft,
  } as CSSProperties;

  const showLogo = payload.branding.showLogo !== false;
  const logoPosition = payload.branding.logoPosition ?? 'left';
  const headerStyle = payload.branding.headerStyle ?? 'full';
  const listingTitle = `${payload.listing.address ?? ''} ${payload.listing.suburb ?? ''}`.trim();
  const resolvedPdfUrl = pdfUrl ?? '#';

  const logoAlignment =
    logoPosition === 'center' ? 'justify-center text-center' : logoPosition === 'right' ? 'justify-end text-right' : 'justify-start';

  return (
    <div className={cn('min-h-screen bg-slate-100 text-slate-900', manrope.className, cormorant.variable)} style={brandStyles}>
      {showActions && (
        <div className="border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {showBackLink && backHref ? (
                <Link href={backHref} className="text-slate-900 hover:text-slate-700">
                  Back to listing
                </Link>
              ) : null}
              <span>{data.isDraft ? 'Vendor report preview' : 'Vendor report'}</span>
            </div>
            <div className="flex items-center gap-2">
              {data.isDraft && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  Draft
                </span>
              )}
              <a
                href={resolvedPdfUrl}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:text-slate-900"
              >
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-[var(--report-accent)]" />
          {data.isDraft && (
            <div className="pointer-events-none absolute right-8 top-14 rotate-12 text-5xl font-semibold uppercase tracking-[0.4em] text-slate-200">
              Draft
            </div>
          )}

          <div className="space-y-8 px-10 py-12">
            <header className={cn('flex flex-wrap items-start justify-between gap-6', headerStyle === 'compact' && 'items-center')}>
              <div className={cn('flex items-center gap-4', logoAlignment)}>
                {showLogo && data.org.logoPath ? (
                  <img
                    src={data.org.logoPath}
                    alt={`${data.org.name} logo`}
                    className="h-14 w-14 rounded-xl border border-slate-200 object-cover"
                  />
                ) : showLogo ? (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
                    Logo
                  </div>
                ) : null}
                <div className={cn(logoPosition === 'center' && 'text-center', logoPosition === 'right' && 'text-right')}>
                  <p className="text-2xl font-semibold text-slate-900 font-[var(--report-serif)]">{data.org.name}</p>
                  <p className="text-xs text-slate-500">{listingTitle || 'Vendor campaign report'}</p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-3xl font-semibold text-slate-900 font-[var(--report-serif)]">Vendor report</p>
                <div className="mt-3 grid gap-1 text-xs text-slate-500">
                  <div className="flex items-center justify-end gap-2">
                    <span>Generated</span>
                    <span className="font-medium text-slate-700">{formatDate(payload.generatedAt)}</span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <span>Status</span>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {formatStatus(payload.listing.status)}
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {payload.sections.campaignSnapshot && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Campaign snapshot</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">Days on market</p>
                    <p className="text-lg font-semibold text-slate-900">{payload.listing.daysOnMarket ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">Campaign health</p>
                    <p className="text-lg font-semibold text-slate-900">{payload.campaignHealth.score ?? 0}</p>
                    {payload.campaignHealth.reasons.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {payload.campaignHealth.reasons.slice(0, 4).map((reason) => (
                          <span key={reason} className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500">
                            {reason}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs text-slate-500">Price guide</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {formatPriceRange(payload.listing.priceGuideMin, payload.listing.priceGuideMax)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {payload.listing.propertyType ?? 'Property'}{payload.listing.beds ? ` - ${payload.listing.beds} bed` : ''}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">Last report</p>
                    <p className="text-sm font-semibold text-slate-900">{formatDate(payload.cadence.lastSentAt)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">Next due</p>
                    <p className="text-sm font-semibold text-slate-900">{formatDate(payload.cadence.nextDueAt)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs text-slate-500">Cadence</p>
                    <p className="text-sm font-semibold text-slate-900">{payload.cadence.cadenceType ?? '-'}</p>
                  </div>
                </div>
              </section>
            )}

            {payload.sections.buyerActivitySummary && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Buyer activity</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Enquiries (7d)</p>
                    <p className="text-lg font-semibold text-slate-900">{payload.activity.enquiriesLast7}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Enquiries (14d)</p>
                    <p className="text-lg font-semibold text-slate-900">{payload.activity.enquiriesLast14}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Inspections (7d)</p>
                    <p className="text-lg font-semibold text-slate-900">{payload.activity.inspectionsLast7}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Offers</p>
                    <p className="text-lg font-semibold text-slate-900">{payload.activity.offers}</p>
                  </div>
                </div>
              </section>
            )}

            {payload.sections.milestonesProgress && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Milestones and checklist</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Milestones completed</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {payload.milestones.completed} / {payload.milestones.total}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-4 py-3">
                    <p className="text-xs text-slate-500">Checklist progress</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {payload.checklist.completed} / {payload.checklist.total}
                    </p>
                  </div>
                </div>
                {payload.milestones.items.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                    {payload.milestones.items.slice(0, 6).map((item) => (
                      <div key={item.name} className="flex items-center justify-between py-1">
                        <span>{item.name}</span>
                        <span>{item.completedAt ? 'Completed' : item.targetDueAt ? `Due ${formatDate(item.targetDueAt)}` : 'Pending'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {payload.sections.buyerPipelineBreakdown && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Buyer pipeline</p>
                {Object.keys(payload.buyerPipeline).length === 0 ? (
                  <p className="text-sm text-slate-500">No buyer pipeline activity recorded yet.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {Object.entries(payload.buyerPipeline).map(([status, count]) => (
                      <div key={status} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                        <p className="text-xs text-slate-500">{status.replace(/_/g, ' ')}</p>
                        <p className="text-lg font-semibold text-slate-900">{count}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="space-y-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Agent commentary</p>
              <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">
                {payload.commentary || 'No commentary provided.'}
              </div>
            </section>

            {payload.sections.recommendations && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Recommendations</p>
                <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">
                  {payload.recommendations || 'No recommendations provided.'}
                </div>
              </section>
            )}

            {payload.sections.feedbackThemes && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Feedback themes</p>
                <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">
                  {payload.feedbackThemes || 'No feedback themes provided.'}
                </div>
              </section>
            )}

            {payload.sections.marketingChannels && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Marketing channels</p>
                <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">
                  {payload.marketingChannels || 'No marketing channels listed.'}
                </div>
              </section>
            )}

            {payload.sections.comparableSales && (
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Comparable sales</p>
                <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 whitespace-pre-wrap">
                  {payload.comparableSales || 'No comparable sales noted.'}
                </div>
              </section>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Generated {formatDate(payload.generatedAt)} - Delivered via {payload.deliveryMethod.replace(/_/g, ' ')}
              {data.createdBy?.name || data.createdBy?.email ? (
                <span> - Prepared by {data.createdBy.name || data.createdBy.email}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
