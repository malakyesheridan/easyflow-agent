/* eslint-disable @next/next/no-img-element */
import { Badge, GlassCard, PageContainer, PageHeader, SectionHeader } from '@/components/ui';
import { getDb } from '@/lib/db';
import { listingReports } from '@/db/schema/listing_reports';
import { listings } from '@/db/schema/listings';
import { orgs } from '@/db/schema/orgs';
import { orgSettings } from '@/db/schema/org_settings';
import { and, eq } from 'drizzle-orm';

interface VendorReportPageProps {
  params: Promise<{ token: string }>;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

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

export default async function VendorReportPage({ params }: VendorReportPageProps) {
  const { token } = await params;
  if (!token) {
    return (
      <PageContainer>
        <GlassCard>
          <p className="text-text-secondary">Invalid vendor report link.</p>
        </GlassCard>
      </PageContainer>
    );
  }

  const db = getDb();
  const [row] = await db
    .select({
      reportId: listingReports.id,
      payload: listingReports.payloadJson,
      createdAt: listingReports.createdAt,
      listingId: listingReports.listingId,
      address: listings.addressLine1,
      suburb: listings.suburb,
      status: listings.status,
      orgName: orgs.name,
      orgLogo: orgs.logoPath,
      companyName: orgSettings.companyName,
      companyLogoPath: orgSettings.companyLogoPath,
    })
    .from(listingReports)
    .innerJoin(listings, eq(listingReports.listingId, listings.id))
    .innerJoin(orgs, eq(listings.orgId, orgs.id))
    .leftJoin(orgSettings, eq(orgSettings.orgId, orgs.id))
    .where(and(eq(listingReports.shareToken, token)))
    .limit(1);

  if (!row) {
    return (
      <PageContainer>
        <GlassCard>
          <p className="text-text-secondary">This vendor report link is invalid or has expired.</p>
        </GlassCard>
      </PageContainer>
    );
  }

  const payload = (row.payload as Record<string, any>) ?? {};
  const listing = payload.listing ?? {};
  const activity = payload.activity ?? {};
  const milestones = payload.milestones ?? {};
  const checklist = payload.checklist ?? {};
  const buyerPipeline = payload.buyerPipeline ?? {};
  const campaignHealth = payload.campaignHealth ?? {};
  const sections = payload.template?.sections ?? payload.sections ?? {};
  const enabledSections = { ...DEFAULT_SECTIONS, ...sections };
  const brandName = row.companyName ?? row.orgName ?? 'Vendor report';
  const brandLogo = row.companyLogoPath ?? row.orgLogo ?? null;
  const listingTitle = `${row.address ?? listing.address ?? ''} ${row.suburb ?? listing.suburb ?? ''}`.trim();

  return (
    <PageContainer>
      <PageHeader title={brandName} subtitle={listingTitle || 'Vendor campaign report'} />

      <div className="space-y-4">
        {brandLogo && (
          <GlassCard className="flex flex-wrap items-center gap-4">
            <img src={brandLogo} alt={brandName} className="h-10 w-auto" />
            <div>
              <p className="text-xs text-text-tertiary">Prepared for</p>
              <p className="text-sm font-semibold text-text-primary">{brandName}</p>
            </div>
          </GlassCard>
        )}

        {enabledSections.campaignSnapshot && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Campaign snapshot" subtitle="High-level listing position and cadence." />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-text-tertiary">Status</p>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">{listing.status ?? row.status ?? '-'}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Days on market</p>
                <p className="text-sm font-semibold text-text-primary">{listing.daysOnMarket ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Generated</p>
                <p className="text-sm font-semibold text-text-primary">
                  {formatDate(payload.generatedAt ?? row.createdAt?.toISOString?.())}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs text-text-tertiary">Campaign health</p>
                <p className="text-sm font-semibold text-text-primary">{campaignHealth.score ?? '-'}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Price guide</p>
                <p className="text-sm font-semibold text-text-primary">
                  {listing.priceGuideMin || listing.priceGuideMax
                    ? `${listing.priceGuideMin ?? ''}${listing.priceGuideMin && listing.priceGuideMax ? ' - ' : ''}${listing.priceGuideMax ?? ''}`
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Property</p>
                <p className="text-sm font-semibold text-text-primary">
                  {listing.propertyType ?? '-'} {listing.beds ? `· ${listing.beds} beds` : ''}
                </p>
              </div>
            </div>
          </GlassCard>
        )}

        {enabledSections.buyerActivitySummary && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Buyer activity" subtitle="Recent enquiry and inspection signals." />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <p className="text-xs text-text-tertiary">Enquiries (7d)</p>
                <p className="text-sm font-semibold text-text-primary">{activity.enquiriesLast7 ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Enquiries (14d)</p>
                <p className="text-sm font-semibold text-text-primary">{activity.enquiriesLast14 ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Inspections (7d)</p>
                <p className="text-sm font-semibold text-text-primary">{activity.inspectionsLast7 ?? 0}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Offers</p>
                <p className="text-sm font-semibold text-text-primary">{activity.offers ?? 0}</p>
              </div>
            </div>
          </GlassCard>
        )}

        {enabledSections.milestonesProgress && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Milestones & checklist" subtitle="Progress against campaign prep." />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs text-text-tertiary">Milestones completed</p>
                <p className="text-sm font-semibold text-text-primary">
                  {milestones.completed ?? 0} / {milestones.total ?? 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Checklist progress</p>
                <p className="text-sm font-semibold text-text-primary">
                  {checklist.completed ?? 0} / {checklist.total ?? 0}
                </p>
              </div>
            </div>
            {Array.isArray(milestones.items) && milestones.items.length > 0 && (
              <div className="space-y-2">
                {milestones.items.slice(0, 6).map((item: any) => (
                  <div key={item.name} className="flex items-center justify-between text-xs text-text-secondary">
                    <span>{item.name}</span>
                    <span>{item.completedAt ? 'Completed' : item.targetDueAt ? `Due ${formatDate(item.targetDueAt)}` : 'Pending'}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        {enabledSections.buyerPipelineBreakdown && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Buyer pipeline" subtitle="Active buyers by status." />
            {Object.keys(buyerPipeline).length === 0 ? (
              <p className="text-sm text-text-secondary">No buyers recorded yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {Object.entries(buyerPipeline).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-sm text-text-secondary">
                    <span>{status.replace('_', ' ')}</span>
                    <span className="font-semibold text-text-primary">{count as number}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        )}

        <GlassCard className="space-y-2">
          <SectionHeader title="Agent commentary" subtitle="Highlights from the last reporting period." />
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{payload.commentary || 'No commentary provided.'}</p>
        </GlassCard>

        {enabledSections.recommendations && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Recommended next actions" subtitle="Key decisions or updates to consider." />
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{payload.recommendations || 'No recommendations provided.'}</p>
          </GlassCard>
        )}

        {enabledSections.feedbackThemes && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Feedback themes" subtitle="Notable buyer feedback." />
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{payload.feedbackThemes || 'No feedback themes provided.'}</p>
          </GlassCard>
        )}

        {enabledSections.marketingChannels && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Marketing channels" subtitle="Current channels running." />
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{payload.marketingChannels || 'No channels provided.'}</p>
          </GlassCard>
        )}

        {enabledSections.comparableSales && (
          <GlassCard className="space-y-2">
            <SectionHeader title="Comparable sales" subtitle="Recent comps referenced in discussions." />
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{payload.comparableSales || 'No comparables provided.'}</p>
          </GlassCard>
        )}
      </div>
    </PageContainer>
  );
}
