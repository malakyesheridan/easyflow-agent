import ListingCreateView from '@/components/listings/ListingCreateView';
import { PageContainer, PageHeader } from '@/components/ui';

export default function ListingCreatePage() {
  return (
    <PageContainer>
      <PageHeader
        title="New listing"
        subtitle="Create a listing and seed the campaign checklist."
      />
      <ListingCreateView />
    </PageContainer>
  );
}
