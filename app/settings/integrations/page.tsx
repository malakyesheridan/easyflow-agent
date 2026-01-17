import { redirect } from 'next/navigation';
import IntegrationsView from '@/components/settings/IntegrationsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { isRealEstateEdition } from '@/lib/appEdition';

export const dynamic = 'force-dynamic';

export default function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  if (isRealEstateEdition()) {
    redirect(`/settings?orgId=${orgId}&notice=settings-unavailable`);
  }
  return (
    <PageContainer>
      <PageHeader title="Integrations" subtitle="Connect external platforms without blocking core workflows." />
      <IntegrationsView orgId={orgId} />
    </PageContainer>
  );
}
