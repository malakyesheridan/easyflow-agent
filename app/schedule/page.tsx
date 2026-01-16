import CalendarView from '@/components/calendar/CalendarView';
import { PageContainer } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function SchedulePage() {
  return (
    <PageContainer>
      <CalendarView />
    </PageContainer>
  );
}
