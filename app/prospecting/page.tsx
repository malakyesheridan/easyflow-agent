import { Card, PageContainer, PageHeader } from '@/components/ui';

export default function ProspectingPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Prospecting"
        subtitle="Source potential sellers and track outreach momentum."
      />
      <Card className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">No prospects yet</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This workspace will capture cold, warm, and hot seller prospects so you can
            prioritize the next outreach.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: prospect segments, call scripts, and follow-up reminders.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
