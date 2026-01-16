import { PageContainer } from '@/components/ui';
import ReportTemplatesView from '@/components/reports/ReportTemplatesView';

export const dynamic = 'force-dynamic';

export default function ReportTemplatesPage() {
  return (
    <PageContainer>
      <ReportTemplatesView />
    </PageContainer>
  );
}
