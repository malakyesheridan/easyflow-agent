import { PageContainer } from '@/components/ui';
import ContactsView from '@/components/contacts/ContactsView';

export const dynamic = 'force-dynamic';

export default function ContactsPage() {
  return (
    <PageContainer>
      <ContactsView />
    </PageContainer>
  );
}
