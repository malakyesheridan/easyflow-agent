'use client';

import Link from 'next/link';
import Card from '@/components/ui/Card';
import type { CrewMember } from '@/db/schema/crew_members';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { buildCrewDayTimeline, isAssignment, isTravelBlock } from '@/lib/utils/scheduleTimeline';
import { TOTAL_MINUTES } from '@/components/schedule/scheduleConstants';
import { cn } from '@/lib/utils';

function minutesToPercent(minutes: number): number {
  if (!Number.isFinite(minutes) || TOTAL_MINUTES <= 0) return 0;
  return (minutes / TOTAL_MINUTES) * 100;
}

function sumMinutes(items: Array<{ startMinutes: number; endMinutes: number }>): number {
  return items.reduce((sum, item) => sum + Math.max(0, item.endMinutes - item.startMinutes), 0);
}

function SnapshotSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="h-4 w-40 rounded bg-bg-section/80" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-3 w-28 rounded bg-bg-section/80" />
            <div className="h-3 flex-1 rounded bg-bg-section/80" />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function DashboardTodaySnapshot(props: {
  crews: CrewMember[] | null;
  assignments: ScheduleAssignmentWithJob[] | null;
  activeDate: Date;
}) {
  const { crews, assignments, activeDate } = props;

  if (!crews || !assignments) return <SnapshotSkeleton />;
  if (crews.length === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-text-primary">Today snapshot</h2>
        <p className="mt-1 text-sm text-text-secondary">No crew members yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Today snapshot</h2>
          <p className="text-xs text-text-tertiary mt-1">Jobs, gaps, and travel buffers per crew.</p>
        </div>
        <Link href="/schedule" className="text-sm text-amber-300 hover:text-amber-200 transition-colors">
          Open schedule
        </Link>
      </div>

      <div className="space-y-3">
        {crews.map((crew) => {
          const timeline = buildCrewDayTimeline(assignments, crew.id, activeDate);
          const travelBlocks = timeline.filter(isTravelBlock);
          const assignmentBlocks = timeline.filter(isAssignment);
          const travelMinutes = sumMinutes(travelBlocks);
          const jobMinutes = sumMinutes(assignmentBlocks);
          const jobsCount = assignmentBlocks.length;

          return (
            <div key={crew.id} className="flex items-center gap-3">
              <div className="w-44 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{crew.displayName}</p>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  {jobsCount} job{jobsCount === 1 ? '' : 's'} • {travelMinutes}m travel
                </p>
              </div>

              <div className="relative flex-1 h-10 rounded-md border border-border-subtle bg-bg-section/30 overflow-hidden">
                {travelBlocks.map((tb) => {
                  const left = minutesToPercent(tb.startMinutes);
                  const width = minutesToPercent(tb.endMinutes - tb.startMinutes);
                  return (
                    <div
                      key={tb.id}
                      className={cn(
                        'absolute top-1 bottom-1 rounded-sm',
                        'bg-amber-500/12 border border-dashed border-amber-500/40'
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`Travel buffer: ${tb.endMinutes - tb.startMinutes} min`}
                    />
                  );
                })}

                {assignmentBlocks.map((a) => {
                  const left = minutesToPercent(a.startMinutes);
                  const width = minutesToPercent(a.endMinutes - a.startMinutes);
                  return (
                    <Link
                      key={a.id}
                      href={`/jobs/${a.jobId}`}
                      className={cn(
                        'absolute top-1 bottom-1 rounded-sm',
                        'bg-blue-500/25 border border-blue-500/30 hover:bg-blue-500/35 transition-colors'
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={a.job?.title || 'Open job'}
                    />
                  );
                })}

                {(jobMinutes + travelMinutes) === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[11px] text-text-tertiary">No work scheduled</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

