import ClientDetailPageContent from '@/components/clients/ClientDetailPageContent';

export const dynamic = 'force-dynamic';

export default async function JobsClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const { id } = await params;
  return <ClientDetailPageContent clientId={id} searchParams={searchParams} />;
}
