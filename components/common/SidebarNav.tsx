'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Badge from '@/components/ui/Badge';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { useSession } from '@/hooks/useSession';
import useIsMobile from '@/hooks/useIsMobile';
import { getSurface } from '@/lib/surface';

interface NavItem {
  href: string;
  label: string;
  subItems?: NavItem[];
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { config } = useOrgConfig();
  const { session } = useSession();
  const isMobile = useIsMobile();
  const surface = getSurface(session?.actor ?? null, { isMobile });
  const isCrewSurface = surface === 'crew';
  const [orgBrand, setOrgBrand] = useState<{ companyName: string | null; companyLogoPath: string | null } | null>(null);

  const adminNavItems: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/prospecting', label: 'Prospecting' },
    { href: '/contacts', label: 'Contacts' },
    { href: '/appraisals', label: 'Appraisals' },
    { href: '/listings', label: 'Listings' },
    { href: '/reports', label: 'Reports' },
    { href: '/daily-plan', label: 'Follow-ups' },
    { href: '/schedule', label: 'Calendar' },
    { href: '/notifications', label: config?.vocabulary?.notificationPlural ?? 'Notifications' },
    { href: '/announcements', label: config?.vocabulary?.announcementPlural ?? 'Announcements' },
    {
      href: '/settings',
      label: 'Settings',
      subItems: [
        { href: '/settings', label: 'General' },
        { href: '/settings/integrations', label: 'Integrations' },
        { href: '/settings/communications', label: 'Communications' },
        { href: '/settings/automations', label: 'Automations' },
      ],
    },
  ];

  const crewNavItems: NavItem[] = [
    { href: '/daily-plan', label: 'Follow-ups' },
    { href: '/schedule', label: 'Calendar' },
    { href: '/prospecting', label: 'Prospecting' },
    { href: '/contacts', label: 'Contacts' },
    { href: '/listings', label: 'Listings' },
    { href: '/profile', label: 'Profile' },
  ];

  const navItems = isCrewSurface ? crewNavItems : adminNavItems;

  useEffect(() => {
    if (!config) return;
    setOrgBrand({
      companyName: config.companyName ?? null,
      companyLogoPath: config.companyLogoPath ?? null,
    });
  }, [config]);

  const brandName = orgBrand?.companyName?.trim() || 'Organisation';
  const brandInitials = brandName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(`${href}/`);
  };
  const isParentActive = (href: string) => pathname?.startsWith(href) ?? false;

  return (
    <nav className="space-y-6">
      <Link
        href={isCrewSurface ? '/profile' : '/settings'}
        className={cn(
          'group flex items-center gap-3 rounded-xl border border-border-subtle/70 bg-gradient-to-br from-bg-card/90 via-bg-section/70 to-bg-base/60 p-3 shadow-lift transition-all',
          'hover:border-accent-gold/45 hover:bg-bg-card/70 hover:shadow-lift'
        )}
      >
        <div className="h-11 w-11 rounded-lg border border-border-subtle/70 bg-bg-card/70 shadow-soft overflow-hidden flex items-center justify-center">
          {orgBrand?.companyLogoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgBrand.companyLogoPath} alt={`${brandName} logo`} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-text-secondary">{brandInitials || 'ORG'}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{brandName}</p>
          <p className="text-xs text-text-tertiary">{isCrewSurface ? 'Profile' : 'Settings'}</p>
        </div>
      </Link>

      <div className="px-2">
        <Badge variant="gold" className="uppercase tracking-[0.18em] text-[10px]">
          Real Estate
        </Badge>
      </div>

      <div className="rounded-xl border border-border-subtle/70 bg-gradient-to-b from-bg-card/45 via-bg-section/30 to-bg-base/30 p-2.5 shadow-lift">
        <ul className="space-y-2">
        {navItems.map((item) => {
          const hasSubItems = item.subItems && item.subItems.length > 0;
          const isExpanded = hasSubItems && isParentActive(item.href);
          const isItemActive = isActive(item.href) || (hasSubItems && isParentActive(item.href));

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'group relative flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-semibold transition-all',
                  'text-text-secondary hover:text-text-primary hover:bg-bg-card/80',
                  isItemActive &&
                    'text-text-primary bg-bg-card/90 shadow-lift ring-1 ring-accent-gold/40 before:content-[\"\"] before:absolute before:left-1 before:top-1/2 before:-translate-y-1/2 before:h-7 before:w-1 before:rounded-full before:bg-accent-gold'
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="flex items-center gap-2">
                    {item.label}
                  </span>
                  {hasSubItems && (
                    <ChevronRight className={cn('h-4.5 w-4.5 text-text-tertiary transition-transform', isExpanded && 'rotate-90')} />
                  )}
                </div>
              </Link>

              {hasSubItems && isExpanded && item.subItems && (
                <ul className="mt-1.5 space-y-1.5">
                  {item.subItems.map((subItem) => {
                    const isSubItemActive = isActive(subItem.href);
                    return (
                      <li key={subItem.href}>
                        <Link
                          href={subItem.href}
                          className={cn(
                            'block rounded-md pl-9 pr-4 py-2.5 text-[13px] transition-all',
                            'text-text-secondary hover:text-text-primary hover:bg-bg-card/55',
                            isSubItemActive &&
                              'text-text-primary bg-bg-card/75 shadow-soft ring-1 ring-accent-gold/25 relative'
                          )}
                        >
                          {isSubItemActive && (
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-accent-gold" />
                          )}
                          {subItem.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
        </ul>
      </div>
    </nav>
  );
}
