'use client';

import GlassCard from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils';

type Delta = {
  direction: 'up' | 'down' | 'flat';
  percent: number | null;
};

function formatDelta(delta: Delta): { text: string; colorClass: string } {
  if (delta.direction === 'flat' || delta.percent === null) {
    return { text: '-', colorClass: 'text-text-tertiary' };
  }

  const arrow = delta.direction === 'up' ? '^' : 'v';
  const abs = Math.abs(delta.percent);
  const pctText = abs >= 100 ? `${Math.round(abs)}%` : `${abs.toFixed(1)}%`;
  const colorClass = delta.direction === 'up' ? 'text-emerald-500' : 'text-red-500';

  return { text: `${arrow} ${pctText}`, colorClass };
}

export default function DashboardMetricCard(props: {
  title: string;
  value: string;
  subtitle?: string;
  delta?: Delta;
  emphasis?: 'normal' | 'warning' | 'danger';
}) {
  const { title, value, subtitle, delta, emphasis = 'normal' } = props;

  const emphasisClass =
    emphasis === 'danger'
      ? 'ring-1 ring-red-500/25'
      : emphasis === 'warning'
        ? 'ring-1 ring-amber-500/25'
        : '';

  const valueClass =
    emphasis === 'danger'
      ? 'text-red-500'
      : emphasis === 'warning'
        ? 'text-amber-500'
        : 'text-text-primary';

  const deltaDisplay = delta ? formatDelta(delta) : null;

  return (
    <GlassCard className={cn('flex flex-col gap-2', emphasisClass)} padding="sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-[0.2em]">{title}</p>
        {deltaDisplay && (
          <span className={cn('text-xs font-semibold tabular-nums', deltaDisplay.colorClass)}>{deltaDisplay.text}</span>
        )}
      </div>
      <div className={cn('text-2xl font-semibold tabular-nums', valueClass)}>{value}</div>
      {subtitle && <p className="text-xs text-text-secondary">{subtitle}</p>}
    </GlassCard>
  );
}
