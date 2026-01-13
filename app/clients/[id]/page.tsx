import ClientDetailPageContent from '@/components/clients/ClientDetailPageContent';

interface ClientPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Record<string, string | string[] | undefined>;
}

export const dynamic = 'force-dynamic';

export default async function ClientPage({ params, searchParams }: ClientPageProps) {
  const { id } = await params;
  return <ClientDetailPageContent clientId={id} searchParams={searchParams} />;
}
