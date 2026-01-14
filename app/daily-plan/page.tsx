import { Card, PageContainer, PageHeader } from '@/components/ui';

export default function DailyPlanPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Daily Plan"
        subtitle="Your prioritized list of follow-ups, showings, and tasks."
      />
      <Card className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">Nothing scheduled yet</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This workspace will combine tasks, calendar items, and priority calls into a
            single plan you can execute throughout the day.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: priority scoring, reminders, and end-of-day recap.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
