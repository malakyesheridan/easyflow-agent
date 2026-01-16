import { PageContainer } from '@/components/ui';
import FollowUpsView from '@/components/followups/FollowUpsView';

export const dynamic = 'force-dynamic';

export default function FollowUpsPage() {
  return (
    <PageContainer>
      <FollowUpsView />
    </PageContainer>
  );
}
