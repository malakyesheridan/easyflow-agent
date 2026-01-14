import { Card, PageContainer, PageHeader } from '@/components/ui';

export default function LeadsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Lead Inbox"
        subtitle="Centralize new inquiries and keep response times tight."
      />
      <Card className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">No leads yet</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This inbox will capture website forms, referrals, and portal inquiries so you can
            qualify and route them into the pipeline quickly.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: lead sources, assignment rules, and response tracking.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
