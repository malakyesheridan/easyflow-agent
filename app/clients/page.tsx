import ClientsPageContent from '@/components/clients/ClientsPageContent';

export const dynamic = 'force-dynamic';

export default function ClientsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return <ClientsPageContent searchParams={searchParams} basePath="/clients" />;
}
