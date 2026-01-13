'use client';

import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { type Crew } from './ScheduleDayGrid';
import { UNASSIGNED_LANE_ID } from './scheduleConstants';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { buildCrewDayTimeline, isTravelBlock, type TravelBlock } from '@/lib/utils/scheduleTimeline';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { defaultVocabulary } from '@/lib/org/orgConfig';
import { getJobTypeLabel } from '@/lib/org/jobTypes';

/** Debug flag for travel block logging */
const DEBUG_TRAVEL = process.env.NEXT_PUBLIC_DEBUG_TRAVEL === 'true';

/**
 * PHASE C2: ScheduleWeekView now works with assignments.
 */
interface ScheduleWeekViewProps {
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
  onAssignJob?: (params: { jobId: string; crewId: string; startTime: Date; durationMinutes?: number }) => void;
  onJobClick?: (job: Job) => void;
  onStartDrag?: (id: string, isAssignment?: boolean) => void;
  // ❌ DELETED: onDragHover - replaced by global pointer loop
  onDayClick?: (date: Date) => void; // Week → Day drill-down
  dragState?: {
    assignmentId: string | null;
    jobId: string | null;
    targetCrewId: string | null;
    targetDayIndex: number | null; // 0-6 for Mon-Sun
    previewStartMinutes: number | null;
    draggingJobDuration: number | null;
    snapDelta: number;
    snapReason: 'travel' | 'job' | 'out_of_bounds' | null;
  };
  draggingAssignment?: ScheduleAssignmentWithJob | null;
}

/**
 * PHASE C1: Week View Component
 * 
 * Architecture Rules:
 * - Uses schedule assignments (not jobs directly)
 * - Jobs are read-only reference data
 * - Do NOT assume 1 job = 1 crew (prepares for multi-crew support)
 * 
 * Grid structure:
 * - Columns = days (Mon-Sun)
 * - Rows = crews
 * - Jobs grouped per day per crew
 */

/**
 * Get the week start date (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(d.setDate(diff));
}

/**
 * Get all days in the week (Mon-Sun)
 */
function getWeekDays(weekStart: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + i);
    days.push(day);
  }
  return days;
}

/**
 * Check if a date is the same day as another date
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear()
  );
}

/**
 * Format day label (e.g., "Mon 16")
 */
function formatDayLabel(date: Date): string {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `${dayNames[date.getDay() === 0 ? 6 : date.getDay() - 1]} ${date.getDate()}`;
}

/**
 * Compact job block for week view
 */
function WeekJobBlock({ 
  assignment, 
  onClick,
  assignmentCount = 1,
  uiCompleted = false,
}: { 
  assignment: ScheduleAssignmentWithJob; 
  onClick: () => void;
  assignmentCount?: number; // PHASE C3: Number of assignments for this job
  uiCompleted?: boolean;
}) {
  const { config } = useOrgConfig();
  const vocabulary = config?.vocabulary ?? defaultVocabulary;
  const job = assignment.job;
  if (!job) {
    return null; // Safety check
  }
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
        isCompleted
          ? 'bg-accent-gold/10 border border-accent-gold/25'
          : 'bg-bg-card/90 hover:bg-bg-card hover:shadow-sm',
        accentColor
      )}
    >
      {/* E0.1: Compact visual hierarchy for week view */}
      <div className="font-medium text-text-primary text-[11px] truncate leading-snug">
        {job.title}
      </div>
      <div className="text-[10px] text-text-tertiary/70 leading-snug">
        {jobTypeLabel}
      </div>
      {isUnassigned && (
        <div className="mt-1 text-[9px] uppercase tracking-[0.08em] text-text-tertiary">
          Unassigned
        </div>
      )}
      
      {/* Multi-assignment badge */}
      {hasMultiple && (
        <span 
          className="absolute top-0.5 right-0.5 text-[8px] font-semibold text-accent-gold bg-accent-gold/15 px-0.5 rounded"
          title={`${assignmentCount} assignments`}
        >
          {assignmentCount}×
        </span>
      )}

      {isCompleted && (
        <span
          className={cn(
            'absolute top-0.5 text-[8px] font-semibold text-accent-gold bg-accent-gold/15 px-0.5 rounded',
            hasMultiple ? 'right-6' : 'right-0.5'
          )}
          title="Completed"
        >
          ✓
        </span>
      )}
    </div>
  );
}

export default function ScheduleWeekView({
  assignments,
  crews,
  orgId,
  highlightCrewId,
  resolvedHqTravelDurations,
  taskSummaryByJobId,
  onAssignJob,
  onJobClick,
  onStartDrag,
  onDayClick,
  dragState,
  draggingAssignment,
}: ScheduleWeekViewProps) {
  // PHASE C2: Assignments are now the primary state - no conversion needed
  const suppressClickRef = useRef<string | null>(null);
  const DRAG_THRESHOLD_PX = 6;
  
  // PHASE C3: Calculate assignment counts per job for visual indicators
  const jobAssignmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignments.forEach(assignment => {
      counts[assignment.jobId] = (counts[assignment.jobId] || 0) + 1;
    });
    return counts;
  }, [assignments]);

  // Get current week start (Monday)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

  // Group assignments by crew and day
  const assignmentsByCrewAndDay = useMemo(() => {
    const grouped: Record<string, Record<number, ScheduleAssignmentWithJob[]>> = {};
    
    crews.forEach(crew => {
      grouped[crew.id] = {};
      weekDays.forEach((_, dayIndex) => {
        grouped[crew.id][dayIndex] = [];
      });
    });

    assignments.forEach(assignment => {
      if (!assignment.crewId) return;
      const assignmentDate = new Date(assignment.date);
      const dayIndex = weekDays.findIndex(day => isSameDay(day, assignmentDate));
      
      if (dayIndex !== -1 && grouped[assignment.crewId]) {
        if (!grouped[assignment.crewId][dayIndex]) {
          grouped[assignment.crewId][dayIndex] = [];
        }
        grouped[assignment.crewId][dayIndex].push(assignment);
      }
    });

    return grouped;
  }, [assignments, crews, weekDays]);

  const unassignedByDay = useMemo(() => {
    const grouped: Record<number, ScheduleAssignmentWithJob[]> = {};
    weekDays.forEach((_, dayIndex) => {
      grouped[dayIndex] = [];
    });

    assignments.forEach((assignment) => {
      if (assignment.crewId) return;
      const assignmentDate = new Date(assignment.date);
      const dayIndex = weekDays.findIndex((day) => isSameDay(day, assignmentDate));
      if (dayIndex === -1) return;
      grouped[dayIndex].push(assignment);
    });

    return grouped;
  }, [assignments, weekDays]);

  // Handle job click - opens in new tab
  const handleJobClick = useCallback((assignment: ScheduleAssignmentWithJob) => {
    if (suppressClickRef.current === assignment.id) {
      suppressClickRef.current = null;
      return;
    }
    const job = assignment.job;
    if (onJobClick) {
      onJobClick(job);
    } else {
      window.open(`/jobs/${job.id}`, '_blank');
    }
  }, [onJobClick]);

  // PHASE C2: Handle drag start - uses assignmentId
  const handleDragStart = useCallback((assignmentId: string) => {
    if (onStartDrag) {
      onStartDrag(assignmentId, true);
    }
  }, [onStartDrag]);

  const startDragWithThreshold = useCallback((assignmentId: string, e: React.PointerEvent) => {
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
  }, [handleDragStart, onStartDrag]);

  // ❌ DELETED: pointer move handler - replaced by global pointer loop

  return (
    <div className="flex flex-col h-full">
      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const prevWeek = new Date(weekStart);
              prevWeek.setDate(prevWeek.getDate() - 7);
              setWeekStart(prevWeek);
            }}
            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            &lt; Previous
          </button>
          <button
            onClick={() => setWeekStart(getWeekStart(new Date()))}
            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => {
              const nextWeek = new Date(weekStart);
              nextWeek.setDate(nextWeek.getDate() + 7);
              setWeekStart(nextWeek);
            }}
            className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Next &gt;
          </button>
        </div>
        <div className="text-sm font-medium text-text-primary">
          {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {/* Week Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-full">
          {/* Header Row - Day Labels */}
          <div className="grid grid-cols-8 border-b border-border-subtle sticky top-0 bg-bg-base z-10">
            <div className="p-3 font-medium text-text-secondary text-sm border-r border-border-subtle">
              Crew
            </div>
            {weekDays.map((day, index) => (
              <div
                key={index}
                className={cn(
                  'p-3 text-center font-medium text-text-primary text-sm',
                  index < 6 && 'border-r border-border-subtle',
                  isSameDay(day, new Date()) && 'bg-accent-gold/10',
                  onDayClick && 'cursor-pointer hover:bg-bg-section transition-colors'
                )}
                onClick={() => onDayClick?.(day)}
              >
                <div>{formatDayLabel(day)}</div>
              </div>
            ))}
          </div>

          {/* Unassigned Row */}
          <div className="grid grid-cols-8 border-b border-border-subtle min-h-[120px] bg-bg-section/20">
            <div className="p-3 border-r border-border-subtle bg-bg-section/40">
              <div className="font-medium text-text-primary text-sm">Unassigned</div>
              <div className="text-xs text-text-tertiary mt-1">Schedule-only</div>
            </div>
            {weekDays.map((day, dayIndex) => {
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
                    'p-2 border-r border-border-subtle min-h-[120px]',
                    dayIndex < 6 && 'border-r border-border-subtle',
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
                          onPointerDown={(e) => {
                            startDragWithThreshold(assignment.id, e);
                          }}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <WeekJobBlock
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
                'grid grid-cols-8 border-b border-border-subtle min-h-[120px]',
                highlightCrewId && crew.id === highlightCrewId && 'ring-2 ring-accent-gold/40 ring-inset bg-accent-gold/5'
              )}
            >
              {/* Crew Name Column */}
              <div className="p-3 border-r border-border-subtle bg-bg-section/30">
                <div className="font-medium text-text-primary text-sm">{crew.name}</div>
                <div className="text-xs text-text-tertiary mt-1">
                  {crew.members.map(m => m.name).join(', ')}
                </div>
              </div>

              {/* Day Columns */}
              {weekDays.map((day, dayIndex) => {
                const dayAssignments = assignmentsByCrewAndDay[crew.id]?.[dayIndex] || [];
                const isToday = isSameDay(day, new Date());
                const isDragTarget = dragState?.targetCrewId === crew.id && dragState?.targetDayIndex === dayIndex;
                
                // G2.1: Build timeline to get travel blocks for this crew+day
                const timeline = buildCrewDayTimeline(dayAssignments, crew.id, day, resolvedHqTravelDurations);
                const travelBlocks = timeline.filter(isTravelBlock);
                
                // Debug logging
                if (DEBUG_TRAVEL && dayAssignments.length > 1) {
                  console.log(`[TRAVEL-WEEK] crew=${crew.id}, day=${dayIndex}, assignments=${dayAssignments.length}, travelBlocks=${travelBlocks.length}`);
                }

                return (
                  <div
                    key={dayIndex}
                    data-lane="true"
                    data-crew-id={crew.id}
                    data-day-index={dayIndex}
                    data-date-str={day.toISOString().split('T')[0]}
                    className={cn(
                      'p-2 border-r border-border-subtle min-h-[120px]',
                      dayIndex < 6 && 'border-r border-border-subtle',
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
                            onPointerDown={(e) => {
                              // ❌ REMOVED: No pointer capture - rely on global listeners
                              startDragWithThreshold(assignment.id, e);
                            }}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <WeekJobBlock
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
                      
                      {/* G2.1: Render travel blocks (compact, non-interactive) */}
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
    </div>
  );
}
