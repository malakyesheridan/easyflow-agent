import { Card, PageContainer, PageHeader } from '@/components/ui';

export default function PipelinePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Pipeline"
        subtitle="Visualize every deal stage from first touch to close."
      />
      <Card className="border border-dashed border-border-subtle bg-bg-section/40">
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-text-primary">Pipeline is empty</p>
          <p className="text-sm text-text-secondary max-w-xl mx-auto">
            This board will show your opportunities, stage movement, and next-best actions
            so you always know what to push forward.
          </p>
          <p className="text-xs text-text-tertiary">
            Coming next: stage templates, probability scoring, and deal timelines.
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
