import { redirect } from 'next/navigation';
import { canAccessSettingsRoutes } from '@/lib/auth/routeAccess';
import { resolveServerSession } from '@/lib/auth/resolveServerSession';

export const dynamic = 'force-dynamic';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveServerSession();
  if (!session || !canAccessSettingsRoutes(session.actor)) {
    redirect('/jobs/today');
  }

  return <>{children}</>;
}
