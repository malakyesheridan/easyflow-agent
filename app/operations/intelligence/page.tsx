import OperationsIntelligenceView from '@/components/operations/OperationsIntelligenceView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { resolveServerSession } from '@/lib/auth/resolveServerSession';
import { canAccessOperationsIntelligence } from '@/lib/auth/routeAccess';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function OperationsIntelligencePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  const session = await resolveServerSession(searchParams);
  if (!session || !canAccessOperationsIntelligence(session.actor)) {
    redirect('/operations/map');
  }

  return (
    <PageContainer>
      <PageHeader title="Operations Intelligence" subtitle="Explainable alerts, evidence, and next actions." />
      <OperationsIntelligenceView orgId={orgId} />
    </PageContainer>
  );
}
