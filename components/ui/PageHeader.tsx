import { cn } from '@/lib/utils';
import NotificationsBell from '@/components/notifications/NotificationsBell';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  mobileAction?: React.ReactNode;
  className?: string;
}

export default function PageHeader({ title, subtitle, actions, mobileAction, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-5 md:mb-10', className)}>
      <div className="md:hidden sticky top-0 z-30 bg-bg-base/95 backdrop-blur border-b border-border-subtle py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-text-primary truncate">{title}</h1>
            {subtitle && (
              <p className="text-xs text-text-secondary truncate">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {mobileAction && <div className="shrink-0">{mobileAction}</div>}
            <NotificationsBell />
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold text-text-primary tracking-tight text-balance">{title}</h1>
          {subtitle && (
            <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {actions}
          <NotificationsBell />
        </div>
      </div>
    </div>
  );
}

