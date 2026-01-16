'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import SidebarNav from '@/components/common/SidebarNav';
import MobileNav from '@/components/common/MobileNav';
import AnnouncementsGate from '@/components/announcements/AnnouncementsGate';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import useIsMobile from '@/hooks/useIsMobile';
import { useSession } from '@/hooks/useSession';
import { getSurface } from '@/lib/surface';

const AUTH_ROUTES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/onboarding',
  '/invite',
  '/invoices/share',
];
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { config, loading } = useOrgConfig();
  const { session, loading: sessionLoading } = useSession();
  const isMobile = useIsMobile();
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const needsOnboarding = Boolean(config && config.onboardingCompleted === false);
  const surface = getSurface(session?.actor ?? null, { isMobile });
  const isCrewSurface = surface === 'crew';

  useEffect(() => {
    if (isAuthRoute) return;
    if (loading) return;
    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [isAuthRoute, loading, needsOnboarding, router]);

  useEffect(() => {
    if (isAuthRoute || loading || sessionLoading) return;
    if (!isMobile) return;
    if (!isCrewSurface) return;
    if (pathname === '/follow-ups') return;
    if (pathname === '/' || pathname === '/dashboard') {
      router.replace('/follow-ups');
    }
  }, [isAuthRoute, isCrewSurface, isMobile, loading, pathname, router, sessionLoading]);

  if (isAuthRoute) {
    return <main className="min-h-screen bg-bg-base">{children}</main>;
  }

  if (loading || needsOnboarding) {
    return (
      <main className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-sm text-text-secondary">Loading organisation...</div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg-base">
      <aside className="hidden md:block w-64 border-r border-border-subtle/70 bg-gradient-to-b from-bg-section via-bg-section/95 to-bg-base/90 p-6 shadow-lift md:sticky md:top-0 md:h-screen">
        <SidebarNav />
      </aside>

      <main className="flex-1 pb-24 md:pb-0">
        <AnnouncementsGate />
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
