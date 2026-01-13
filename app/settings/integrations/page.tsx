import IntegrationsView from '@/components/settings/IntegrationsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Integrations" subtitle="Connect external platforms without blocking core workflows." />
      <IntegrationsView orgId={orgId} />
    </PageContainer>
  );
}
