'use client';

import { useMemo } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import MetricCard from '@/components/ui/MetricCard';
import SectionHeader from '@/components/ui/SectionHeader';
import { useOrgConfig } from '@/hooks/useOrgConfig';

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type CalendarGroup = {
  id: string;
  label: string;
  rangeLabel: string;
  items: string[];
};

export default function ScheduleView({ orgId }: { orgId: string }) {
  const { config } = useOrgConfig();
  const resolvedOrgId = orgId || config?.orgId || '';
  const timezoneLabel = config?.timezone ?? 'Local time';

  const groups = useMemo<CalendarGroup[]>(() => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const weekStart = addDays(today, 2);
    const weekEnd = addDays(today, 6);

    return [
      {
        id: 'today',
        label: 'Today',
        rangeLabel: formatDateLabel(today),
        items: [],
      },
      {
        id: 'tomorrow',
        label: 'Tomorrow',
        rangeLabel: formatDateLabel(tomorrow),
        items: [],
      },
      {
        id: 'week',
        label: 'Later this week',
        rangeLabel: `${formatDateLabel(weekStart)} - ${formatDateLabel(weekEnd)}`,
        items: [],
      },
    ];
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Calendar and daily plan"
        subtitle={`Schedule follow-ups, inspections, and vendor updates. Timezone: ${timezoneLabel}.`}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {groups.map((group) => (
          <MetricCard
            key={`${group.id}-summary`}
            label={group.label}
            value={group.items.length}
            helper={group.rangeLabel}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <SectionHeader title="Daily plan" subtitle="Tasks grouped by day." />
            {!resolvedOrgId && (
              <span className="text-xs text-amber-500">Org not selected</span>
            )}
          </div>

          <div className="mt-4 space-y-4">
            {groups.map((group) => (
              <div key={group.id} className="rounded-md border border-border-subtle bg-bg-section/30 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text-primary">{group.label}</p>
                  <p className="text-xs text-text-tertiary">{group.rangeLabel}</p>
                </div>
                <div className="mt-3">
                  {group.items.length === 0 ? (
                    <p className="text-sm text-text-secondary">No tasks scheduled yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {group.items.map((item, index) => (
                        <li key={`${group.id}-${index}`} className="text-sm text-text-primary">
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <SectionHeader title="Opens and inspections" subtitle="Upcoming event placeholders." />
          <div className="mt-4 space-y-3">
            <div className="rounded-md border border-dashed border-border-subtle p-3">
              <p className="text-sm text-text-secondary">No opens scheduled yet.</p>
            </div>
            <div className="rounded-md border border-dashed border-border-subtle p-3">
              <p className="text-sm text-text-secondary">No inspections scheduled yet.</p>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard>
        <SectionHeader title="Pipeline reminders" subtitle="Key milestones and vendor reporting dates." />
        <div className="mt-4 rounded-md border border-dashed border-border-subtle p-3">
          <p className="text-sm text-text-secondary">
            Reminders will appear once listing milestones and report cadences are configured.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
