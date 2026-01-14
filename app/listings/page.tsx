import { Card, PageContainer, PageHeader } from '@/components/ui';

export default function ListingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Listings"
        subtitle="Monitor active campaigns, vendor comms, and milestones."
      />
      <Card className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">No listings yet</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This workspace will track campaign health, inspections, and vendor reporting for
            every active listing.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: listing milestones, inspection tracking, and campaign insights.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
