'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { SLOT_COUNT, SLOT_MINUTES } from '@/components/schedule/scheduleConstants';
import {
  buildScheduleTimelineWithDurations,
  isTravelBlock,
  isAssignment,
  type TimelineItem,
} from '@/lib/utils/scheduleTimeline';

function minutesToPercent(minutes: number): number {
  const total = SLOT_COUNT * SLOT_MINUTES;
  return (minutes / total) * 100;
}

function formatTimeFromMinutes(minutesFromWorkdayStart: number): string {
  const minutes = 6 * 60 + minutesFromWorkdayStart;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  const h12 = ((hh + 11) % 12) + 1;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
}

export default function CrewMiniTimeline(props: {
  assignments: ScheduleAssignmentWithJob[];
  resolvedTravelDurations: Map<string, number>;
}) {
  const { assignments, resolvedTravelDurations } = props;

  const timeline = useMemo((): TimelineItem[] => {
    return buildScheduleTimelineWithDurations(assignments, resolvedTravelDurations);
  }, [assignments, resolvedTravelDurations]);

  return (
    <div className="relative h-24 rounded-lg border border-border-subtle bg-bg-section/20 overflow-hidden">
      {/* subtle grid */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px)',
          backgroundSize: `${100 / SLOT_COUNT}% 100%`,
        }}
      />

      {/* items */}
      {timeline.map((item) => {
        const left = minutesToPercent(item.startMinutes);
        const width = minutesToPercent(item.endMinutes - item.startMinutes);

        if (isTravelBlock(item)) {
          const mins = item.googleDurationMinutes ?? (item.endMinutes - item.startMinutes);
          return (
            <div
              key={item.id}
              className={cn(
                'absolute top-3 bottom-3 rounded-md',
                'border-2 border-dashed border-amber-500/55 bg-amber-500/16 ring-1 ring-amber-500/15'
              )}
              style={{
                left: `calc(${left}% + 2px)`,
                width: `calc(${width}% - 4px)`,
              }}
              title={`Travel: ${mins} min`}
            >
              <div className="flex h-full items-center justify-center px-2">
                <span className="text-[10px] font-semibold text-amber-400 whitespace-nowrap">
                  🚗 {mins}m
                </span>
              </div>
            </div>
          );
        }

        if (isAssignment(item)) {
          return (
            <div
              key={item.id}
              className={cn(
                'absolute top-3 bottom-3 rounded-md',
                'bg-accent-gold/15 border border-accent-gold/30',
                'ring-1 ring-accent-gold/10'
              )}
              style={{
                left: `calc(${left}% + 2px)`,
                width: `calc(${width}% - 4px)`,
              }}
              title={`${item.job?.title ?? 'Job'} (${formatTimeFromMinutes(item.startMinutes)} – ${formatTimeFromMinutes(item.endMinutes)})`}
            >
              <div className="flex h-full flex-col justify-center px-2">
                <p className="text-[10px] font-semibold text-text-primary truncate">
                  {item.job?.title ?? 'Job'}
                </p>
                <p className="text-[9px] text-text-tertiary">
                  {formatTimeFromMinutes(item.startMinutes)} – {formatTimeFromMinutes(item.endMinutes)}
                </p>
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

