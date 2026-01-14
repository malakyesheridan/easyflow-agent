'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrgConfig } from '@/hooks/useOrgConfig';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export default function MobileNav() {
  const pathname = usePathname();
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  const navItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/leads', label: 'Leads (Buyers)', icon: Inbox },
    { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
    { href: '/daily-plan', label: 'Daily Plan', icon: ListChecks },
    { href: '/schedule', label: 'Calendar', icon: CalendarDays },
    { href: '/notifications', label: config?.vocabulary?.notificationPlural ?? 'Notifications', icon: Bell },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!orgId) return;
        const res = await fetch(`/api/notifications?orgId=${orgId}&unreadCountOnly=true`);
        const json = await res.json();
        if (cancelled) return;
        setUnreadCount(res.ok && json.ok ? Number(json.data?.unreadCount ?? 0) : 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    };
    void load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [orgId]);

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-bg-section/95 backdrop-blur">
      <div className="flex items-stretch gap-2 px-3 pb-[env(safe-area-inset-bottom)] pt-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors',
                isActive ? 'bg-bg-card/70 text-accent-gold' : 'text-text-tertiary'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {item.href === '/notifications' && unreadCount !== null && unreadCount > 0 && (
                  <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-accent-gold px-1 text-[10px] font-semibold text-bg-base">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
