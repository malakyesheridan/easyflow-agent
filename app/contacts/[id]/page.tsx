import Link from 'next/link';
import { Button, PageContainer, PageHeader } from '@/components/ui';
import ContactDetailView from '@/components/contacts/ContactDetailView';

export const dynamic = 'force-dynamic';

export default function ContactProfilePage({ params }: { params: { id: string } }) {
  return (
    <PageContainer>
      <PageHeader
        title="Contact profile"
        subtitle="Manage details, follow-ups, and activity history."
        actions={
          <Link href="/contacts">
            <Button variant="ghost">Back to contacts</Button>
          </Link>
        }
      />
      <ContactDetailView contactId={params.id} />
    </PageContainer>
  );
}
