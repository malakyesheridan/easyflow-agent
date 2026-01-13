import CommunicationsSettingsView from '@/components/settings/CommunicationsSettingsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function CommunicationsSettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Communications" subtitle="Providers, templates, and delivery rules." />
      <CommunicationsSettingsView orgId={orgId} />
    </PageContainer>
  );
}
