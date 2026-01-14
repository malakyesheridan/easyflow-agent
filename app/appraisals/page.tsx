import { Card, PageContainer, PageHeader } from '@/components/ui';

export default function AppraisalsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Appraisals"
        subtitle="Track appraisal requests, bookings, and next steps."
      />
      <Card className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">No appraisals yet</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This workspace will surface appraisal bookings, outcomes, and follow-up commitments
            for potential sellers.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: appraisal prep checklists and outcome tracking.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
