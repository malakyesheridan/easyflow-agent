import { PageContainer, PageHeader } from '@/components/ui';
import AppraisalCreateView from '@/components/appraisals/AppraisalCreateView';

export const dynamic = 'force-dynamic';

export default function AppraisalCreatePage() {
  return (
    <PageContainer>
      <PageHeader
        title="New appraisal"
        subtitle="Book an appraisal appointment and start prep."
      />
      <AppraisalCreateView />
    </PageContainer>
  );
}
