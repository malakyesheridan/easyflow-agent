import { PageContainer } from '@/components/ui';
import ProspectingView from '@/components/prospecting/ProspectingView';

export const dynamic = 'force-dynamic';

export default function ProspectingPage() {
  return (
    <PageContainer>
      <ProspectingView />
    </PageContainer>
  );
}
