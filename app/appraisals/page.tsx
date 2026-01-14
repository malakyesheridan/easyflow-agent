import { PageContainer } from '@/components/ui';
import AppraisalsView from '@/components/appraisals/AppraisalsView';

export const dynamic = 'force-dynamic';

export default function AppraisalsPage() {
  return (
    <PageContainer>
      <AppraisalsView />
    </PageContainer>
  );
}
