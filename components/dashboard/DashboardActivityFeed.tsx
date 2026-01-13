'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { formatQuantity } from '@/lib/utils/quantity';

export type DashboardActivityItem =
  | {
      id: string;
      type: 'job_scheduled';
      createdAt: string | Date;
      jobId: string;
      jobTitle: string;
      crewId: string | null;
      crewName: string | null;
      dateKey: string | null;
      subtitle: string;
      href: string;
    }
  | {
      id: string;
      type: 'job_completed';
      createdAt: string | Date;
      jobId: string;
      jobTitle: string;
      subtitle: string;
      href: string;
    }
  | {
      id: string;
      type: 'material_allocated';
      createdAt: string | Date;
      jobId: string;
      jobTitle: string;
      materialId: string;
      materialName: string;
      plannedQuantity: unknown;
      unit: string;
      subtitle: string;
      href: string;
    }
  | {
      id: string;
      type: 'stock_alert';
      createdAt: string | Date;
      materialId: string;
      materialName: string;
      message: string;
      subtitle: string;
      href: string;
    };

function formatTs(ts: string | Date) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function toneForType(type: DashboardActivityItem['type']): { dot: string; badge: string } {
  switch (type) {
    case 'job_completed':
      return { dot: 'bg-emerald-500', badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    case 'stock_alert':
      return { dot: 'bg-red-500', badge: 'text-red-400 bg-red-500/10 border-red-500/20' };
    case 'material_allocated':
      return { dot: 'bg-amber-500', badge: 'text-amber-300 bg-amber-500/10 border-amber-500/20' };
    case 'job_scheduled':
    default:
      return { dot: 'bg-blue-500', badge: 'text-blue-300 bg-blue-500/10 border-blue-500/20' };
  }
}

function labelForType(type: DashboardActivityItem['type']): string {
  if (type === 'job_scheduled') return 'Scheduled';
  if (type === 'job_completed') return 'Completed';
  if (type === 'material_allocated') return 'Allocated';
  return 'Alert';
}

function titleForItem(item: DashboardActivityItem): { title: string; detail?: string } {
  switch (item.type) {
    case 'job_scheduled':
      return { title: item.jobTitle, detail: item.subtitle };
    case 'job_completed':
      return { title: item.jobTitle, detail: item.subtitle };
    case 'material_allocated':
      return {
        title: item.materialName,
        detail: `${formatQuantity(item.plannedQuantity, item.unit)} • ${item.jobTitle}`,
      };
    case 'stock_alert':
      return { title: item.materialName, detail: item.message };
  }
}

function FeedSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-md border border-border-subtle bg-bg-section/30 p-3 animate-pulse">
          <div className="h-3 w-48 rounded bg-bg-section/80" />
          <div className="mt-2 h-3 w-64 rounded bg-bg-section/80" />
        </div>
      ))}
    </div>
  );
}

export default function DashboardActivityFeed(props: {
  items: DashboardActivityItem[] | null;
  loading: boolean;
  error?: string | null;
}) {
  const { items, loading, error } = props;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Activity</h2>
          <p className="text-xs text-text-tertiary mt-1">Recent changes across jobs and warehouse.</p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400 mb-4">{error}</div>
      )}

      {loading ? (
        <FeedSkeleton />
      ) : !items || items.length === 0 ? (
        <p className="text-sm text-text-secondary">No activity yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const tone = toneForType(item.type);
            const desc = titleForItem(item);
            return (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-md border border-border-subtle bg-bg-section/30 p-3 hover:bg-bg-section/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', tone.dot)} />
                    <span className={cn('text-[11px] px-2 py-0.5 rounded-full border shrink-0', tone.badge)}>
                      {labelForType(item.type)}
                    </span>
                    <p className="text-sm font-medium text-text-primary truncate">{desc.title}</p>
                  </div>
                  <p className="text-[11px] text-text-tertiary shrink-0">{formatTs(item.createdAt)}</p>
                </div>
                {desc.detail && <p className="text-[11px] text-text-secondary mt-1">{desc.detail}</p>}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

