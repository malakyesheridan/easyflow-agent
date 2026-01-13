import NotificationsView from '@/components/notifications/NotificationsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function NotificationsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Notifications" />
      <NotificationsView orgId={orgId} />
    </PageContainer>
  );
}
