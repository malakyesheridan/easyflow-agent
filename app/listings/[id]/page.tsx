import ListingDetailView from '@/components/listings/ListingDetailView';
import { PageContainer, PageHeader } from '@/components/ui';

interface ListingDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ListingDetailPage({ params }: ListingDetailPageProps) {
  const { id } = await params;
  return (
    <PageContainer>
      <PageHeader
        title="Listing"
        subtitle="Manage campaign health, vendor updates, and buyer activity."
      />
      <ListingDetailView listingId={id} />
    </PageContainer>
  );
}
