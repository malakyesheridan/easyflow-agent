'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import type { CrewMember } from '@/db/schema/crew_members';
import { computeCrewCardMetrics, getCrewDisplayName, getInitials } from '@/lib/utils/crewMetrics';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import QuickActionsMenu from '@/components/quick-actions/QuickActionsMenu';

function formatRole(role: CrewMember['role']): string {
  const map: Record<string, string> = {
    installer: 'Installer',
    supervisor: 'Supervisor',
    apprentice: 'Apprentice',
    warehouse: 'Warehouse',
    admin: 'Admin',
  };
  return map[role] || role;
}

function StatusPill({ status, overdueCount }: { status: 'inactive' | 'on_job_now' | 'active'; overdueCount: number }) {
  const label =
    status === 'inactive' ? 'Inactive' : status === 'on_job_now' ? 'On job now' : 'Active';
  const base =
    status === 'inactive'
      ? 'bg-bg-section text-text-tertiary'
      : status === 'on_job_now'
        ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25'
        : overdueCount > 0
          ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25'
          : 'bg-bg-section text-text-secondary';

  return <span className={cn('px-2 py-1 rounded-full text-xs font-semibold', base)}>{label}</span>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'normal' | 'good' | 'warn' | 'bad' }) {
  const valueClass =
    tone === 'good'
      ? 'text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-400'
        : tone === 'bad'
          ? 'text-red-400'
          : 'text-text-primary';

  return (
    <div className="rounded-md bg-bg-section/40 p-3">
      <p className="text-[11px] font-medium text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className={cn('mt-1 text-2xl md:text-lg font-semibold tabular-nums', valueClass)}>{value}</p>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const tone = clamped >= 90 ? 'bg-emerald-500' : clamped >= 70 ? 'bg-amber-500' : 'bg-accent-gold';
  return (
    <div className="h-2 w-full rounded-full bg-bg-section/60 overflow-hidden">
      <div className={cn('h-full rounded-full transition-[width]', tone)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export default function CrewMemberCard(props: {
  now: Date;
  member: CrewMember;
  assignments: ScheduleAssignmentWithJob[];
  badge?: { label: string; tone: 'gold' | 'emerald' | 'amber' };
}) {
  const { now, member, assignments, badge } = props;
  const name = getCrewDisplayName(member);
  const metrics = computeCrewCardMetrics({ now, crew: member, assignments });

  const overdueTone = metrics.today.overdueJobs > 0 ? 'bad' : 'normal';
  const completedTone = metrics.today.completedJobs > 0 ? 'good' : 'normal';

  const badgeClass =
    badge?.tone === 'emerald'
      ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25'
      : badge?.tone === 'amber'
        ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25'
        : 'bg-accent-gold/15 text-accent-gold ring-1 ring-accent-gold/25';

  return (
    <Link href={`/crews/${member.id}`} className="block">
      <Card className="hover:shadow-lift transition-shadow">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-bg-section/60 ring-1 ring-border-subtle flex items-center justify-center font-semibold text-text-primary">
              {getInitials(name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{name}</p>
              <p className="text-xs text-text-tertiary">{formatRole(member.role)}</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <QuickActionsMenu entity={member} entityType="crew" orgId={member.orgId} />
            </div>
            <StatusPill status={metrics.status} overdueCount={metrics.today.overdueJobs} />
            {badge && <span className={cn('px-2 py-1 rounded-full text-[11px] font-semibold', badgeClass)}>{badge.label}</span>}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Stat label="Today scheduled" value={String(metrics.today.scheduledJobs)} />
          <Stat label="Today completed" value={String(metrics.today.completedJobs)} tone={completedTone} />
          <Stat label="Overdue risk" value={String(metrics.today.overdueJobs)} tone={overdueTone} />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-text-secondary">
            <span>Utilisation (today)</span>
            <span className="tabular-nums">{metrics.today.utilisationPct}%</span>
          </div>
          <div className="mt-2">
            <ProgressBar percent={metrics.today.utilisationPct} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-text-tertiary">
          <span>This week: {metrics.week.completedJobs} completed</span>
          <span className={cn(
            'font-semibold tabular-nums',
            metrics.week.trendCompletedVsPrev.direction === 'up'
              ? 'text-emerald-400'
              : metrics.week.trendCompletedVsPrev.direction === 'down'
                ? 'text-red-400'
                : 'text-text-tertiary'
          )}>
            {metrics.week.trendCompletedVsPrev.direction === 'flat' || metrics.week.trendCompletedVsPrev.percent === null
              ? '—'
              : `${metrics.week.trendCompletedVsPrev.direction === 'up' ? '↑' : '↓'} ${metrics.week.trendCompletedVsPrev.percent.toFixed(1)}%`}
          </span>
        </div>
      </Card>
    </Link>
  );
}
