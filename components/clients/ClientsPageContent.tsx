import ClientsView from '@/components/clients/ClientsView';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { getSessionContext } from '@/lib/auth/session';
import { canManageClients } from '@/lib/authz';
import { headers } from 'next/headers';

export default async function ClientsPageContent({
  searchParams,
  basePath = '/clients',
  title = 'Clients',
  subtitle = 'Manage client records and performance.',
}: {
  searchParams?: Record<string, string | string[] | undefined>;
  basePath?: string;
  title?: string;
  subtitle?: string;
}) {
  const fromQuery = getOrgIdFromSearchParams(searchParams);
  const cookie = headers().get('cookie') ?? '';
  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  const orgId = session?.org?.id ?? '';
  const resolvedOrgId = fromQuery && fromQuery === orgId ? fromQuery : orgId;

  if (!session || !orgId) {
    return (
      <PageContainer>
        <PageHeader title={title} />
        <Card>
          <p className="text-text-secondary">Sign in required.</p>
        </Card>
      </PageContainer>
    );
  }

  if (!canManageClients(session.actor)) {
    return (
      <PageContainer>
        <PageHeader title={title} />
        <Card>
          <p className="text-text-secondary">You do not have access to view clients.</p>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title={title} subtitle={subtitle} />
      <ClientsView orgId={resolvedOrgId} basePath={basePath} />
    </PageContainer>
  );
}
