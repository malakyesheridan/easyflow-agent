import CrewsView from '@/components/crews/CrewsView';
import { PageContainer, PageHeader, Button } from '@/components/ui';
import Link from 'next/link';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function CrewsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader
        title="Crews"
        mobileAction={
          <Link href="/crews/new">
            <Button size="sm">Add Crew</Button>
          </Link>
        }
      />
      <CrewsView orgId={orgId} />
    </PageContainer>
  );
}
