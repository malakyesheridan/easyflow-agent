import AuditLogsView from '@/components/audit/AuditLogsView';
import { PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';

export const dynamic = 'force-dynamic';

export default function AuditLogsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const orgId = getOrgIdFromSearchParams(searchParams);
  return (
    <PageContainer>
      <PageHeader title="Audit Logs" subtitle="Every operational change, captured for accountability." />
      <AuditLogsView orgId={orgId} />
    </PageContainer>
  );
}
