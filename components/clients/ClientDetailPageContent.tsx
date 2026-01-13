import ClientProfileView from '@/components/clients/ClientProfileView';
import { PageContainer, PageHeader, Card } from '@/components/ui';
import { getClientById } from '@/lib/queries/clients';
import { getClientPerformance } from '@/lib/clients/clientPerformance';
import { getSessionContext } from '@/lib/auth/session';
import { applyJobVisibility, canManageClients } from '@/lib/authz';
import { getOrgIdFromSearchParams } from '@/lib/org/orgId';
import { getDb } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
import { and, desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';

export default async function ClientDetailPageContent({
  clientId,
  searchParams,
}: {
  clientId: string;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const fromQuery = getOrgIdFromSearchParams(searchParams);
  const cookie = headers().get('cookie') ?? '';
  const session = await getSessionContext(new Request('http://localhost', { headers: { cookie } }));
  const orgId = session?.org?.id ?? '';
  const resolvedOrgId = fromQuery && fromQuery === orgId ? fromQuery : orgId;

  if (!session || !orgId) {
    return (
      <PageContainer>
        <PageHeader title="Client" />
        <Card>
          <p className="text-text-secondary">Sign in required.</p>
        </Card>
      </PageContainer>
    );
  }

  if (!canManageClients(session.actor)) {
    return (
      <PageContainer>
        <PageHeader title="Client" />
        <Card>
          <p className="text-text-secondary">You do not have access to view this client.</p>
        </Card>
      </PageContainer>
    );
  }

  const clientResult = await getClientById({ orgId: resolvedOrgId, clientId });
  if (!clientResult.ok) {
    return (
      <PageContainer>
        <PageHeader title="Client" />
        <Card>
          <p className="text-text-secondary">{clientResult.error.message}</p>
        </Card>
      </PageContainer>
    );
  }

  const performanceResult = await getClientPerformance({
    orgId: resolvedOrgId,
    clientId,
    actor: session.actor,
  });

  const db = getDb();
  const jobWhere = applyJobVisibility(
    and(eq(jobs.orgId, resolvedOrgId), eq(jobs.clientId, clientId)),
    session.actor,
    jobs
  );
  const recentJobs = await db
    .select({
      id: jobs.id,
      title: jobs.title,
      status: jobs.status,
      scheduledStart: jobs.scheduledStart,
      profitabilityStatus: jobs.profitabilityStatus,
    })
    .from(jobs)
    .where(jobWhere)
    .orderBy(desc(jobs.updatedAt));

  return (
    <PageContainer>
      <PageHeader title={clientResult.data.displayName} subtitle="Client performance summary." />
      <ClientProfileView
        client={clientResult.data}
        performance={performanceResult.ok ? performanceResult.data : null}
        recentJobs={recentJobs}
      />
    </PageContainer>
  );
}
