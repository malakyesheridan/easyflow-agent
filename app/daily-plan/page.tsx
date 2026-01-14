import { Card, PageContainer, PageHeader } from '@/components/ui';

export default function DailyPlanPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Follow-ups"
        subtitle="Prioritize seller calls, appraisal prep, and listing tasks."
      />
      <Card className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">Nothing scheduled yet</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This workspace will combine prospecting tasks, appraisal follow-ups, and listing
            reminders into a single plan you can execute throughout the day.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: priority scoring, reminder cadences, and end-of-day recap.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
