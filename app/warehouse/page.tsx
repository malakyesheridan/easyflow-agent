import MaterialsView from '@/components/warehouse/MaterialsView';
import { Button, Card, PageContainer, PageHeader } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { getSessionContext } from '@/lib/auth/session';
import { canManageWarehouse } from '@/lib/authz';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

async function resolveSession(searchParams?: Record<string, string | string[] | undefined>) {
  const fromQuery = getOrgIdFromSearchParams(searchParams);
  const cookie = headers().get('cookie') ?? '';
  if (!cookie) return null;
  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  if (!session) return null;
  const orgId = fromQuery && fromQuery === session.org.id ? fromQuery : session.org.id;
  return { orgId, actor: session.actor };
}

export default async function WarehousePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await resolveSession(searchParams);
  if (!session || !canManageWarehouse(session.actor)) {
    return (
      <PageContainer>
        <PageHeader title="Warehouse" subtitle="Materials, stock movements, allocations, and usage signals." />
        <Card>
          <p className="text-text-secondary">Warehouse access is limited to admins and managers.</p>
        </Card>
      </PageContainer>
    );
  }
  const orgId = session.orgId;
  return (
    <PageContainer>
      <PageHeader
        title="Warehouse"
        subtitle="Materials, stock movements, allocations, and usage signals."
        mobileAction={
          <a href="#warehouse-material-form">
            <Button size="sm">Add Material</Button>
          </a>
        }
      />
      <MaterialsView orgId={orgId} />
    </PageContainer>
  );
}
