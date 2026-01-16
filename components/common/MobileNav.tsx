'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  Target,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export default function MobileNav() {
  const pathname = usePathname();

  const navItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/prospecting', label: 'Prospecting', icon: Target },
    { href: '/contacts', label: 'Contacts', icon: Users },
    { href: '/follow-ups', label: 'Follow-ups', icon: ListChecks },
    { href: '/schedule', label: 'Calendar', icon: CalendarDays },
  ];

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
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
