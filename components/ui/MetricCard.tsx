import { cn } from '@/lib/utils';
import GlassCard from './GlassCard';

interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  helper?: string;
  badge?: React.ReactNode;
  className?: string;
}

export default function MetricCard({ label, value, helper, badge, className }: MetricCardProps) {
  return (
    <GlassCard className={cn('flex h-full flex-col gap-2', className)} padding="sm">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-text-tertiary">
        <span>{label}</span>
        {badge}
      </div>
      <div className="text-2xl font-semibold text-text-primary">{value}</div>
      {helper && <p className="text-xs text-text-secondary">{helper}</p>}
    </GlassCard>
  );
}
