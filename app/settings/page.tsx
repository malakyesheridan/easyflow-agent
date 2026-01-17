import SettingsView from '@/components/settings/SettingsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import packageJson from '@/package.json';

export const dynamic = 'force-dynamic';

export default function SettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  const appVersion = packageJson.version;
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : undefined;
  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Organisation defaults and operational preferences." />
      <SettingsView orgId={orgId} appVersion={appVersion} notice={notice} />
    </PageContainer>
  );
}
