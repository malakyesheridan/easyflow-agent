import { PageContainer, PageHeader } from '@/components/ui';
import ContactsImportWizard from '@/components/contacts/ContactsImportWizard';

export const dynamic = 'force-dynamic';

export default function ContactsImportPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Import contacts"
        subtitle="Bring in past vendors and nurture lists."
      />
      <ContactsImportWizard />
    </PageContainer>
  );
}
