import { PageContainer, PageHeader } from '@/components/ui';
import AppraisalDetailView from '@/components/appraisals/AppraisalDetailView';

export const dynamic = 'force-dynamic';

export default function AppraisalDetailPage({ params }: { params: { id: string } }) {
  return (
    <PageContainer>
      <PageHeader
        title="Appraisal"
        subtitle="Track prep, vendor details, and follow-ups."
      />
      <AppraisalDetailView appraisalId={params.id} />
    </PageContainer>
  );
}
