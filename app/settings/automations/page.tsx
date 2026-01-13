import AutomationsView from '@/components/settings/AutomationsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function AutomationsSettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Automations" subtitle="Templates, rules, and run history." />
      <AutomationsView orgId={orgId} />
    </PageContainer>
  );
}
