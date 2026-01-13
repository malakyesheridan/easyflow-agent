import { PageContainer, PageHeader } from '@/components/ui';
import CrewsSkeleton from '@/components/crews/CrewsSkeleton';

export default function Loading() {
  return (
    <PageContainer>
      <PageHeader title="Crews" />
      <CrewsSkeleton />
    </PageContainer>
  );
}

