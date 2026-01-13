import ClientsPageContent from '@/components/clients/ClientsPageContent';

export const dynamic = 'force-dynamic';

export default function JobsClientsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return <ClientsPageContent searchParams={searchParams} basePath="/jobs/clients" title="Clients" subtitle="Client list and history for job planning." />;
}
