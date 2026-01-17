import { redirect } from 'next/navigation';
import CommunicationsSettingsView from '@/components/settings/CommunicationsSettingsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { isRealEstateEdition } from '@/lib/appEdition';

export const dynamic = 'force-dynamic';

export default function CommunicationsSettingsPage({
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
      <PageHeader title="Communications" subtitle="Providers, templates, and delivery rules." />
      <CommunicationsSettingsView orgId={orgId} />
    </PageContainer>
  );
}
