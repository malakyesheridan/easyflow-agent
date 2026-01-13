import MaterialDetailView from '@/components/warehouse/MaterialDetailView';
import { Card, PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { getSessionContext } from '@/lib/auth/session';
import { canManageWarehouse } from '@/lib/authz';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function MaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const fromQuery = getOrgIdFromSearchParams(searchParams);
  const cookie = headers().get('cookie') ?? '';
  const session = cookie
    ? await getSessionContext(new Request('http://localhost', { headers: { cookie } }))
    : null;
  if (!session || !canManageWarehouse(session.actor)) {
    return (
      <PageContainer>
        <PageHeader title="Material detail" subtitle="Stock, allocations, usage, and recent events." />
        <Card>
          <p className="text-text-secondary">Warehouse access is limited to admins and managers.</p>
        </Card>
      </PageContainer>
    );
  }
  const orgId = fromQuery && fromQuery === session.org.id ? fromQuery : session.org.id;
  const { id } = await params;
  return (
    <PageContainer>
      <PageHeader title="Material detail" subtitle="Stock, allocations, usage, and recent events." />
      <MaterialDetailView orgId={orgId} materialId={id} />
    </PageContainer>
  );
}
