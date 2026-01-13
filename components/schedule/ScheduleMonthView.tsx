'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { type Crew } from './ScheduleDayGrid';
import { UNASSIGNED_LANE_ID } from './scheduleConstants';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { buildCrewDayTimeline, isTravelBlock } from '@/lib/utils/scheduleTimeline';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { defaultVocabulary } from '@/lib/org/orgConfig';
import { getJobTypeLabel } from '@/lib/org/jobTypes';

/** Debug flag for travel block logging */
const DEBUG_TRAVEL = process.env.NEXT_PUBLIC_DEBUG_TRAVEL === 'true';

interface ScheduleMonthViewProps {
  assignments: ScheduleAssignmentWithJob[];
  crews: Crew[];
  orgId: string;
  highlightCrewId?: string | null;
  resolvedHqTravelDurations?: Map<string, number>;
  taskSummaryByJobId?: Record<
    string,
    {
      total: number;
      completedTotal: number;
      percent: number | null;
      requiredTotal: number;
      requiredCompleted: number;
      requiredPercent: number | null;
    }
  >;
  onJobClick?: (job: Job) => void;
  onStartDrag?: (id: string, isAssignment?: boolean) => void;
  onDayClick?: (date: Date) => void; // Month → Day drill-down
  dragState?: {
    assignmentId: string | null;
    jobId: string | null;
    targetCrewId: string | null;
    targetDayIndex: number | null; // 0..daysInMonth-1
    previewStartMinutes: number | null;
    draggingJobDuration: number | null;
    snapDelta: number;
    snapReason: 'travel' | 'job' | 'out_of_bounds' | null;
  };
  draggingAssignment?: ScheduleAssignmentWithJob | null;
}

function getMonthStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthDays(monthStart: Date): Date[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];
  for (let i = 1; i <= lastDay; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
}

function MonthJobBlock({
  assignment,
  onClick,
  assignmentCount = 1,
  uiCompleted = false,
}: {
  assignment: ScheduleAssignmentWithJob;
  onClick: () => void;
  assignmentCount?: number;
  uiCompleted?: boolean;
}) {
  const { config } = useOrgConfig();
  const vocabulary = config?.vocabulary ?? defaultVocabulary;
  const job = assignment.job;
  if (!job) return null;
  const jobTypeLabel = getJobTypeLabel(job, config, vocabulary.jobSingular);
  const isCompleted = assignment.status === 'completed' || uiCompleted;
  const accentColor = 'border-l-accent-gold/60';

  const hasMultiple = assignmentCount > 1;
  const isUnassigned = !assignment.crewId;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'relative px-2 py-1.5 rounded-sm border-l-3 cursor-pointer transition-all group',
        isCompleted ? 'bg-accent-gold/10 border border-accent-gold/25' : 'bg-bg-card/90 hover:bg-bg-card hover:shadow-sm',
        accentColor
      )}
    >
      <div className="font-medium text-text-primary text-[11px] truncate leading-snug">{job.title}</div>
      <div className="text-[10px] text-text-tertiary mt-0.5 flex items-center gap-1">
        <span className="truncate">{jobTypeLabel}</span>
        <span className="text-text-tertiary/50">|</span>
        <span className="tabular-nums">
          {Math.round((assignment.endMinutes - assignment.startMinutes) / 15) * 15}m
        </span>
      </div>

      {isUnassigned && (
        <div className="mt-1 text-[9px] uppercase tracking-[0.08em] text-text-tertiary">
          Unassigned
        </div>
      )}
      {hasMultiple && (
        <span
          className="absolute top-0.5 right-0.5 text-[9px] font-semibold text-accent-gold bg-accent-gold/15 px-1 rounded"
          title="Multi-assigned"
        >
          {assignmentCount}A-
        </span>
      )}
    </div>
  );
}

export default function ScheduleMonthView({
  assignments,
  crews,
  highlightCrewId,
  resolvedHqTravelDurations,
  taskSummaryByJobId,
  onJobClick,
  onStartDrag,
  onDayClick,
  dragState,
}: ScheduleMonthViewProps) {
  const suppressClickRef = useRef<string | null>(null);
  const DRAG_THRESHOLD_PX = 6;
  const [monthStart, setMonthStart] = useState(() => getMonthStart(new Date()));
  const monthDays = useMemo(() => getMonthDays(monthStart), [monthStart]);

  const jobAssignmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignments.forEach((assignment) => {
      counts[assignment.jobId] = (counts[assignment.jobId] || 0) + 1;
    });
    return counts;
  }, [assignments]);

  const assignmentsByCrewAndDay = useMemo(() => {
    const grouped: Record<string, Record<number, ScheduleAssignmentWithJob[]>> = {};
    crews.forEach((crew) => {
      grouped[crew.id] = {};
      monthDays.forEach((_, dayIndex) => {
        grouped[crew.id][dayIndex] = [];
      });
    });

    assignments.forEach((assignment) => {
      if (!assignment.crewId) return;
      const assignmentDate = new Date(assignment.date);
      const dayIndex = monthDays.findIndex((day) => isSameDay(day, assignmentDate));
      if (dayIndex !== -1 && grouped[assignment.crewId]) {
        grouped[assignment.crewId][dayIndex].push(assignment);
      }
    });

    return grouped;
  }, [assignments, crews, monthDays]);

  const unassignedByDay = useMemo(() => {
    const grouped: Record<number, ScheduleAssignmentWithJob[]> = {};
    monthDays.forEach((_, dayIndex) => {
      grouped[dayIndex] = [];
    });

    assignments.forEach((assignment) => {
      if (assignment.crewId) return;
      const assignmentDate = new Date(assignment.date);
      const dayIndex = monthDays.findIndex((day) => isSameDay(day, assignmentDate));
      if (dayIndex === -1) return;
      grouped[dayIndex].push(assignment);
    });

    return grouped;
  }, [assignments, monthDays]);

  const handleJobClick = useCallback(
    (assignment: ScheduleAssignmentWithJob) => {
      if (suppressClickRef.current === assignment.id) {
        suppressClickRef.current = null;
        return;
      }
      const job = assignment.job;
      if (onJobClick) onJobClick(job);
      else window.open(`/jobs/${job.id}`, '_blank');
    },
    [onJobClick]
  );

  const handleDragStart = useCallback(
    (assignmentId: string) => {
      if (onStartDrag) onStartDrag(assignmentId, true);
    },
    [onStartDrag]
  );

  const startDragWithThreshold = useCallback(
    (assignmentId: string, e: React.PointerEvent) => {
      if (!onStartDrag) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragging = false;

      const handleMove = (event: PointerEvent) => {
        if (dragging) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          dragging = true;
          suppressClickRef.current = assignmentId;
          event.preventDefault();
          handleDragStart(assignmentId);
          cleanup();
        }
      };

      const handleUp = () => {
        cleanup();
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', handleMove, true);
        window.removeEventListener('pointerup', handleUp, true);
        window.removeEventListener('pointercancel', handleUp, true);
      };

      window.addEventListener('pointermove', handleMove, true);
      window.addEventListener('pointerup', handleUp, true);
      window.addEventListener('pointercancel', handleUp, true);
    },
    [handleDragStart, onStartDrag]
  );

  const gridTemplateColumns = useMemo(() => {
    // Sticky crew column + 1 column per day (scroll horizontally)
    return `240px repeat(${monthDays.length}, minmax(150px, 1fr))`;
  }, [monthDays.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const prev = new Date(monthStart);
              prev.setMonth(prev.getMonth() - 1);
              setMonthStart(getMonthStart(prev));
            }}
            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setMonthStart(getMonthStart(new Date()))}
            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => {
              const next = new Date(monthStart);
              next.setMonth(next.getMonth() + 1);
              setMonthStart(getMonthStart(next));
            }}
            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Next
          </button>
        </div>
        <div className="text-sm font-medium text-text-primary">
          {monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
          {/* Header Row */}
          <div
            className="grid border-b border-border-subtle sticky top-0 bg-bg-base z-10"
            style={{ gridTemplateColumns }}
          >
            <div className="p-3 font-medium text-text-secondary text-sm border-r border-border-subtle sticky left-0 bg-bg-base z-20">
              Crew
            </div>
            {monthDays.map((day, idx) => {
              const isToday = isSameDay(day, new Date());
              return (
                <div
                  key={idx}
                  onClick={() => onDayClick?.(day)}
                  className={cn(
                    'p-3 font-medium text-text-secondary text-sm border-r border-border-subtle text-center cursor-pointer hover:bg-bg-section/30 transition-colors',
                    isToday && 'bg-accent-gold/10 text-text-primary'
                  )}
                >
                  <div className="text-xs">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-sm font-semibold">{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Unassigned Row */}
          <div
            className="grid border-b border-border-subtle min-h-[120px] bg-bg-section/20"
            style={{ gridTemplateColumns }}
          >
            <div className="p-3 border-r border-border-subtle bg-bg-section/40 sticky left-0 z-10">
              <div className="font-medium text-text-primary text-sm">Unassigned</div>
              <div className="text-xs text-text-tertiary mt-1">Schedule-only</div>
            </div>

            {monthDays.map((day, dayIndex) => {
              const dayAssignments = unassignedByDay[dayIndex] || [];
              const isToday = isSameDay(day, new Date());
              const isDragTarget = dragState?.targetCrewId === UNASSIGNED_LANE_ID && dragState?.targetDayIndex === dayIndex;

              return (
                <div
                  key={`unassigned-${dayIndex}`}
                  data-lane="true"
                  data-crew-id={UNASSIGNED_LANE_ID}
                  data-day-index={dayIndex}
                  data-date-str={day.toISOString().split('T')[0]}
                  className={cn(
                    'crew-grid p-2 border-r border-border-subtle min-h-[120px]',
                    isToday && 'bg-accent-gold/5',
                    isDragTarget && 'bg-accent-gold/15 border-2 border-accent-gold',
                    dragState?.jobId && 'cursor-move',
                    'transition-colors'
                  )}
                >
                  <div className="space-y-1">
                    {dayAssignments.map((assignment) => {
                      const assignmentCount = jobAssignmentCounts[assignment.jobId] || 1;
                      return (
                        <div
                          key={assignment.id}
                          onPointerDown={(e) => startDragWithThreshold(assignment.id, e)}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <MonthJobBlock
                            assignment={assignment}
                            onClick={() => handleJobClick(assignment)}
                            assignmentCount={assignmentCount}
                            uiCompleted={
                              taskSummaryByJobId?.[assignment.jobId]?.total
                                ? taskSummaryByJobId[assignment.jobId].completedTotal ===
                                  taskSummaryByJobId[assignment.jobId].total
                                : false
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Crew Rows */}
          {crews.map((crew) => (
            <div
              key={crew.id}
              className={cn(
                'grid border-b border-border-subtle min-h-[120px]',
                highlightCrewId && crew.id === highlightCrewId && 'ring-2 ring-accent-gold/40 ring-inset bg-accent-gold/5'
              )}
              style={{ gridTemplateColumns }}
            >
              <div className="p-3 border-r border-border-subtle bg-bg-section/30 sticky left-0 z-10">
                <div className="font-medium text-text-primary text-sm">{crew.name}</div>
                <div className="text-xs text-text-tertiary mt-1">{crew.members.map((m) => m.name).join(', ')}</div>
              </div>

              {monthDays.map((day, dayIndex) => {
                const dayAssignments = assignmentsByCrewAndDay[crew.id]?.[dayIndex] || [];
                const isToday = isSameDay(day, new Date());
                const isDragTarget = dragState?.targetCrewId === crew.id && dragState?.targetDayIndex === dayIndex;

                const timeline = buildCrewDayTimeline(dayAssignments, crew.id, day, resolvedHqTravelDurations);
                const travelBlocks = timeline.filter(isTravelBlock);

                if (DEBUG_TRAVEL && dayAssignments.length > 1) {
                  console.log(
                    `[TRAVEL-MONTH] crew=${crew.id}, day=${dayIndex}, assignments=${dayAssignments.length}, travelBlocks=${travelBlocks.length}`
                  );
                }

                return (
                  <div
                    key={dayIndex}
                    data-lane="true"
                    data-crew-id={crew.id}
                    data-day-index={dayIndex}
                    data-date-str={day.toISOString().split('T')[0]}
                    className={cn(
                      'crew-grid p-2 border-r border-border-subtle min-h-[120px]',
                      isToday && 'bg-accent-gold/5',
                      isDragTarget && 'bg-accent-gold/20 border-2 border-accent-gold',
                      dragState?.jobId && 'cursor-move',
                      'transition-colors'
                    )}
                  >
                    <div className="space-y-1">
                      {dayAssignments.map((assignment) => {
                        const assignmentCount = jobAssignmentCounts[assignment.jobId] || 1;
                        return (
                          <div
                            key={assignment.id}
                            onPointerDown={(e) => startDragWithThreshold(assignment.id, e)}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <MonthJobBlock
                              assignment={assignment}
                              onClick={() => handleJobClick(assignment)}
                              assignmentCount={assignmentCount}
                              uiCompleted={
                                taskSummaryByJobId?.[assignment.jobId]?.total
                                  ? taskSummaryByJobId[assignment.jobId].completedTotal ===
                                    taskSummaryByJobId[assignment.jobId].total
                                  : false
                              }
                            />
                          </div>
                        );
                      })}

                      {travelBlocks.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {travelBlocks.map((tb) => {
                            const travelLabel =
                              tb.kind === 'hq_start'
                                ? 'HQ start'
                                : tb.kind === 'hq_end'
                                  ? 'HQ finish'
                                  : 'Travel';
                            return (
                              <div
                                key={tb.id}
                                className="pointer-events-none px-1.5 py-0.5 rounded-sm bg-text-tertiary/10 border border-dashed border-text-tertiary/20"
                                title={`${travelLabel} (estimated): ${tb.endMinutes - tb.startMinutes} min`}
                              >
                                <span className="text-[9px] text-text-tertiary/60 flex items-center gap-1">
                                  {travelLabel} {tb.endMinutes - tb.startMinutes}m
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Month footer: keep consistent card styling */}
      <Card className="mt-4 bg-bg-section/30 border border-border-subtle">
        <p className="text-xs text-text-tertiary">
          Tip: Click a day header to drill into Day view for full time-slot scheduling.
        </p>
      </Card>
    </div>
  );
}
