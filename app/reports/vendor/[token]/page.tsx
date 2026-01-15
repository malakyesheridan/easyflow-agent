import { Card, PageContainer, PageHeader } from '@/components/ui';
import { getDb } from '@/lib/db';
import { listingReports } from '@/db/schema/listing_reports';
import { listings } from '@/db/schema/listings';
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

export default async function VendorReportPage({ params }: VendorReportPageProps) {
  const { token } = await params;
  if (!token) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">Invalid vendor report link.</p>
        </Card>
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
    })
    .from(listingReports)
    .innerJoin(listings, eq(listingReports.listingId, listings.id))
    .where(and(eq(listingReports.shareToken, token)))
    .limit(1);

  if (!row) {
    return (
      <PageContainer>
        <Card>
          <p className="text-text-secondary">This vendor report link is invalid or has expired.</p>
        </Card>
      </PageContainer>
    );
  }

  const payload = (row.payload as Record<string, any>) ?? {};
  const listing = payload.listing ?? {};
  const counts = payload.counts ?? {};
  const milestones = payload.milestones ?? {};
  const checklist = payload.checklist ?? {};

  return (
    <PageContainer>
      <PageHeader
        title="Vendor campaign report"
        subtitle={`${row.address ?? listing.address ?? ''} ${row.suburb ?? listing.suburb ?? ''}`.trim()}
      />

      <div className="space-y-4">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Campaign snapshot</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs text-text-tertiary">Status</p>
              <p className="text-sm font-semibold text-text-primary">{listing.status ?? row.status ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Days on market</p>
              <p className="text-sm font-semibold text-text-primary">{listing.daysOnMarket ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Generated</p>
              <p className="text-sm font-semibold text-text-primary">{formatDate(payload.generatedAt ?? row.createdAt?.toISOString?.())}</p>
            </div>
          </div>
        </Card>

        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Activity highlights</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <p className="text-xs text-text-tertiary">Enquiries</p>
              <p className="text-sm font-semibold text-text-primary">{counts.enquiries ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Inspections</p>
              <p className="text-sm font-semibold text-text-primary">{counts.inspections ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Offers</p>
              <p className="text-sm font-semibold text-text-primary">{counts.offers ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-text-tertiary">Buyer pipeline</p>
              <p className="text-sm font-semibold text-text-primary">{counts.buyers ?? 0}</p>
            </div>
          </div>
        </Card>

        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Milestones & checklist</p>
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
        </Card>

        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Agent commentary</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{payload.commentary || 'No commentary provided.'}</p>
        </Card>

        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Recommended next actions</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap">{payload.recommendedNextActions || 'No next actions provided.'}</p>
        </Card>
      </div>
    </PageContainer>
  );
}
