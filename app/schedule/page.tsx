import ScheduleView from '@/components/schedule/ScheduleView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function SchedulePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);

  return (
    <PageContainer>
      <PageHeader title="Calendar" />
      <ScheduleView orgId={orgId} />
    </PageContainer>
  );
}
