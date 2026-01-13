import ProfileView from '@/components/profile/ProfileView';
import { PageContainer, PageHeader } from '@/components/ui';

export default function ProfilePage() {
  return (
    <PageContainer>
      <PageHeader title="Profile" />
      <ProfileView />
    </PageContainer>
  );
}
