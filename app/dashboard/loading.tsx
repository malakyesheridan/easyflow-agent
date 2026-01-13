import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { PageContainer, PageHeader } from '@/components/ui';

export default function Loading() {
  return (
    <PageContainer>
      <PageHeader title="Dashboard" />
      <DashboardSkeleton />
    </PageContainer>
  );
}

