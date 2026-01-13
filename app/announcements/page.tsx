import AnnouncementsView from '@/components/announcements/AnnouncementsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function AnnouncementsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Announcements" subtitle="Read-only updates and admin announcements." />
      <AnnouncementsView orgId={orgId} />
    </PageContainer>
  );
}
