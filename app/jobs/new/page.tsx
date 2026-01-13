import JobCreateForm from '@/components/jobs/JobCreateForm';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export default function NewJobPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Create New Job" />
      <JobCreateForm orgId={orgId} />
    </PageContainer>
  );
}
