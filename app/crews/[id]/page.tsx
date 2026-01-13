import CrewDetailView from '@/components/crews/CrewDetailView';
import { PageContainer } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function CrewMemberPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <CrewDetailView orgId={orgId} crewId={params.id} />
    </PageContainer>
  );
}
