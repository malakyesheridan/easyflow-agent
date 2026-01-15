import { GlassCard, PageContainer, PageHeader } from '@/components/ui';

export default function ReportsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        subtitle="Prepare vendor updates and campaign summaries."
      />
      <GlassCard className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">No reports yet</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This workspace will manage vendor reporting cadence, templates, and distribution
            history.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: report scheduling, delivery tracking, and analytics.
          </p>
        </div>
      </GlassCard>
    </PageContainer>
  );
}
