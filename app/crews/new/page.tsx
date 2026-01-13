import CrewMemberCreateForm from '@/components/crews/CrewMemberCreateForm';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function NewCrewMemberPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Add Crew Member" />
      <CrewMemberCreateForm orgId={orgId} />
    </PageContainer>
  );
}
