'use client';

import { useMemo } from 'react';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { Card } from '@/components/ui';
import ScheduleTimeHeader from './ScheduleTimeHeader';
import CrewLane, { type Crew } from './CrewLane';
import JobBlock from './JobBlock';
import TravelBlock from './TravelBlock';
import { detectAllOverlaps, getAllCrewCapacities, type CrewCapacity } from '@/lib/utils/scheduleConflicts';
import { buildCrewDayTimeline, buildScheduleTimelineWithDurations, isTravelBlock, isAssignment, TRAVEL_SLOT_MINUTES, type TimelineItem } from '@/lib/utils/scheduleTimeline';
import { buildFullAddress } from '@/lib/utils/jobAddress';
import { UNASSIGNED_LANE_ID } from './scheduleConstants';

export type { Crew } from './CrewLane';

/** Debug flag for travel block logging */
const DEBUG_TRAVEL = process.env.NEXT_PUBLIC_DEBUG_TRAVEL === 'true';

/**
 * PHASE C2: ScheduleDayGrid now works with assignments.
 * Each assignment represents one scheduled instance of a job.
 */
interface ScheduleDayGridProps {
  assignments: ScheduleAssignmentWithJob[];
  crews: Crew[];
  orgId: string;
  activeDate: Date;
  highlightCrewId?: string | null;
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
  onJobScheduled?: () => void;
  onAssignJob?: (params: { jobId: string; crewId: string; startTime: Date }) => void;
  onJobClick?: (job: Job) => void;
  onStartDrag?: (id: string, isAssignment?: boolean) => void;
  // ❌ DELETED: onDragHover - replaced by global pointer loop
  onSlotClick?: (crewId: string, minutes: number) => void;
  onDeleteAssignment?: (assignmentId: string, assignment?: ScheduleAssignmentWithJob) => void; // PHASE D4: Pass assignment for contextual confirmation
  dragState?: {
    assignmentId: string | null;
    jobId: string | null;
    targetCrewId: string | null;
    previewStartMinutes: number | null;
    draggingJobDuration: number | null;
    snapDelta: number;
    snapReason: 'travel' | 'job' | 'out_of_bounds' | null;
    validPlacementWindows?: Array<{
      crewId: string;
      date: string;
      startMinutes: number;
      endMinutes: number;
    }>;
    travelStatus?: 'idle' | 'pending' | 'ready';
  };
  draggingAssignment?: ScheduleAssignmentWithJob | null;
  // PHASE F2: Resize props
  onStartResize?: (assignmentId: string, edge: 'start' | 'end') => void;
  resizeState?: {
    assignmentId: string;
    previewStartMinutes: number;
    previewEndMinutes: number;
  } | null;
  /**
   * PHASE G3: Pre-resolved travel durations from Google Distance Matrix.
   * Key format: "origin|destination" (lowercase, trimmed)
   * Value: duration in minutes
   * 
   * WHY: Rendering must be pure (no async). Travel times are resolved
   * once in ScheduleView and passed down. If a key is missing, falls
   * back to DEFAULT_TRAVEL_DURATION_MINUTES (30 min).
   */
  resolvedTravelDurations?: Map<string, number>;
  resolvedHqTravelDurations?: Map<string, number>;
}

/**
 * Calculate minutes difference between two dates
 */
function diffInMinutes(date1: Date, date2: Date): number {
  return (date1.getTime() - date2.getTime()) / (1000 * 60);
}

/**
 * Stack overlapping jobs vertically within a crew lane
 * Returns jobs with their vertical position (top offset)
 */
function stackJobsInLane(jobs: Array<{ job: Job; left: number; width: number }>) {
  if (jobs.length === 0) return [];
  
  // Sort jobs by start time
  const sorted = [...jobs].sort((a, b) => a.left - b.left);
  
  // Track vertical positions for each job
  const jobsWithPosition: Array<{ job: Job; left: number; width: number; top: number }> = [];
  const lanes: Array<Array<typeof jobs[0]>> = [];
  
  sorted.forEach((item) => {
    let placed = false;
    let topPosition = 0;
    
    // Try to place in existing lane (horizontal row)
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
      const lane = lanes[laneIndex];
      // Check if this job overlaps with any job in this lane
      const overlaps = lane.some((existing) => {
        const itemStart = item.left;
        const itemEnd = item.left + item.width;
        const existingStart = existing.left;
        const existingEnd = existing.left + existing.width;
        // Overlap: item starts before existing ends AND item ends after existing starts
        return itemStart < existingEnd && itemEnd > existingStart;
      });
      
      if (!overlaps) {
        lane.push(item);
        topPosition = laneIndex * 96; // 96px per lane
        placed = true;
        break;
      }
    }
    
    // Create new lane if couldn't place
    if (!placed) {
      lanes.push([item]);
      topPosition = (lanes.length - 1) * 96;
    }
    
    jobsWithPosition.push({ ...item, top: topPosition });
  });
  
  return jobsWithPosition;
}

/**
 * PHASE A: Resolve crew from assignment context.
 * 
 * This function resolves which crew a job is assigned to for schedule rendering.
 * 
 * Key principle: Crew assignment is contextual to the schedule, not the job.
 * Jobs are immutable reference data. The schedule owns crew assignment.
 * 
 * For Phase A, we still derive from job.crewId, but we treat it as schedule state.
 * Future: Will resolve from ScheduleAssignment.crewId for multi-crew support.
 * 
 * @param job - The job to resolve crew for
 * @param crews - Available crews
 * @returns Crew ID if assigned, null otherwise
 */
function resolveCrewFromAssignment(job: Job, crews: Crew[]): string | null {
  // PHASE A: For now, crewId is still on the job, but we treat it as schedule state
  // Future: This will resolve from ScheduleAssignment.crewId
  // 
  // Key principle: Always resolve crew from assignment context, never assume job.crewId is identity
  // This prepares for multi-crew jobs where a job can have multiple assignments
  if (job.crewId) {
    return job.crewId;
  }
  return null;
}

import { 
  WORKDAY_START_HOUR, 
  WORKDAY_END_HOUR, 
  TOTAL_MINUTES, 
  SLOT_MINUTES,
  SLOT_COUNT,
  MAX_SLOT_START_MINUTES,
  MAX_SLOT_INDEX
} from './scheduleConstants';

export default function ScheduleDayGrid({ 
  assignments,
  crews, 
  orgId,
  activeDate,
  highlightCrewId,
  taskSummaryByJobId,
  onJobScheduled,
  onAssignJob,
  onJobClick,
  onStartDrag,
  onSlotClick,
  onDeleteAssignment,
  dragState,
  draggingAssignment,
  onStartResize,
  resizeState,
  resolvedTravelDurations,
  resolvedHqTravelDurations,
}: ScheduleDayGridProps) {
  // Constants - use shared time bounds
  const totalMinutes = TOTAL_MINUTES;
  const slotCount = SLOT_COUNT;

  /**
   * PHASE C2: Group assignments by crew and convert to column-based positioning.
   * Assignments already have date, crewId, and time information.
   */
  const assignmentsByCrew = useMemo(() => {
    const grouped: Record<string, Array<{ assignment: ScheduleAssignmentWithJob; startCol: number; endCol: number }>> = {};
    
    assignments.forEach((assignment) => {
      const crewId = assignment.crewId;
      if (!crewId) return; // Skip assignments without crew
      
      // Use assignment's startMinutes and endMinutes (already calculated from workday start)
      const startMinutes = assignment.startMinutes;
      const endMinutes = assignment.endMinutes;
      const durationMinutes = endMinutes - startMinutes;
      
      // Only include assignments within the hard time bounds (6 AM - 6 PM)
      if (startMinutes < 0 || startMinutes + durationMinutes > TOTAL_MINUTES) {
        return;
      }
      
      // Clamp assignment start to valid slot range
      if (startMinutes > MAX_SLOT_START_MINUTES) {
        return; // Assignment starts beyond last valid slot (17:45)
      }
      
      // Convert minutes to column indices
      const startCol = Math.floor(startMinutes / SLOT_MINUTES);
      const endCol = Math.ceil(endMinutes / SLOT_MINUTES);
      
      // Clamp to valid column range
      const clampedStartCol = Math.max(0, Math.min(startCol, MAX_SLOT_INDEX));
      const clampedEndCol = Math.max(clampedStartCol + 1, Math.min(endCol, SLOT_COUNT));
      
      if (!grouped[crewId]) {
        grouped[crewId] = [];
      }
      
      // PHASE C2: Store assignment with job reference for rendering
      // Jobs are immutable reference data - we display job.title, job.suburb, etc.
      // crewId, date, startMinutes, endMinutes come from assignment (schedule state)
      grouped[crewId].push({ assignment, startCol: clampedStartCol, endCol: clampedEndCol });
    });
    
    return grouped;
  }, [assignments]);

  const unassignedAssignmentsWithPosition = useMemo(() => {
    const positioned: Array<{ assignment: ScheduleAssignmentWithJob; startCol: number; endCol: number }> = [];

    assignments.forEach((assignment) => {
      if (assignment.crewId) return;
      const startMinutes = assignment.startMinutes;
      const endMinutes = assignment.endMinutes;
      const durationMinutes = endMinutes - startMinutes;

      if (startMinutes < 0 || startMinutes + durationMinutes > TOTAL_MINUTES) return;
      if (startMinutes > MAX_SLOT_START_MINUTES) return;

      const startCol = Math.floor(startMinutes / SLOT_MINUTES);
      const endCol = Math.ceil(endMinutes / SLOT_MINUTES);
      const clampedStartCol = Math.max(0, Math.min(startCol, MAX_SLOT_INDEX));
      const clampedEndCol = Math.max(clampedStartCol + 1, Math.min(endCol, SLOT_COUNT));

      positioned.push({ assignment, startCol: clampedStartCol, endCol: clampedEndCol });
    });

    if (positioned.length === 0) return [];

    const sorted = [...positioned].sort((a, b) => a.startCol - b.startCol);
    const lanes: Array<Array<typeof positioned[0]>> = [];
    const result: Array<{ assignment: ScheduleAssignmentWithJob; startCol: number; endCol: number; top: number }> = [];

    sorted.forEach((item) => {
      let placed = false;
      let topPosition = 0;

      for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
        const lane = lanes[laneIndex];
        const overlaps = lane.some((existing) => item.startCol < existing.endCol && item.endCol > existing.startCol);
        if (!overlaps) {
          lane.push(item);
          topPosition = laneIndex * 96;
          placed = true;
          break;
        }
      }

      if (!placed) {
        lanes.push([item]);
        topPosition = (lanes.length - 1) * 96;
      }

      result.push({ ...item, top: topPosition });
    });

    return result;
  }, [assignments]);

  // Stack assignments within each crew lane - convert column positions to stacking
  const stackedAssignmentsByCrew = useMemo(() => {
    const result: Record<string, Array<{ assignment: ScheduleAssignmentWithJob; startCol: number; endCol: number; top: number }>> = {};
    
    Object.entries(assignmentsByCrew).forEach(([crewId, assignments]) => {
      // Stack assignments that overlap horizontally
      const sorted = [...assignments].sort((a, b) => a.startCol - b.startCol);
      const lanes: Array<Array<typeof assignments[0]>> = [];
      
      sorted.forEach((item) => {
        let placed = false;
        let topPosition = 0;
        
        // Try to place in existing lane
        for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
          const lane = lanes[laneIndex];
          const overlaps = lane.some((existing) => {
            return item.startCol < existing.endCol && item.endCol > existing.startCol;
          });
          
          if (!overlaps) {
            lane.push(item);
            topPosition = laneIndex * 96; // 96px per lane
            placed = true;
            break;
          }
        }
        
        if (!placed) {
          lanes.push([item]);
          topPosition = (lanes.length - 1) * 96;
        }
        
        result[crewId] = result[crewId] || [];
        result[crewId].push({ ...item, top: topPosition });
      });
    });
    
    return result;
  }, [assignmentsByCrew]);

  /**
   * PHASE G2 + G3: Build travel blocks for each crew.
   * 
   * If resolvedTravelDurations is provided (from Google Distance Matrix),
   * use buildScheduleTimelineWithDurations for accurate travel times.
   * Otherwise, fall back to buildCrewDayTimeline with default 30 min.
   * 
   * RENDERING IS PURE: No async calls here. Travel times are pre-resolved
   * in ScheduleView and passed down as a Map.
   */
  const travelBlocksByCrew = useMemo(() => {
    const result: Record<string, Array<{ travelBlock: import('@/lib/utils/scheduleTimeline').TravelBlock; startCol: number; endCol: number }>> = {};
    
    crews.forEach(crew => {
      let timeline: TimelineItem[];
      
      // G3: Use resolved durations if available
      if (resolvedTravelDurations && resolvedTravelDurations.size > 0) {
        // Filter assignments for this crew and date
        const dateStr = activeDate.toISOString().split('T')[0];
        const crewAssignments = assignments.filter(a => {
          const aDateStr = a.date instanceof Date
            ? a.date.toISOString().split('T')[0]
            : new Date(a.date).toISOString().split('T')[0];
          return a.crewId === crew.id && aDateStr === dateStr;
        });
        
        timeline = buildScheduleTimelineWithDurations(
          crewAssignments,
          resolvedTravelDurations,
          resolvedHqTravelDurations
        );
      } else {
        // Fallback to default durations
        timeline = buildCrewDayTimeline(assignments, crew.id, activeDate, resolvedHqTravelDurations);
      }
      
      const travelBlocks = timeline.filter(isTravelBlock);
      
      // Use 15-minute resolution for travel blocks (finer than 30-min job blocks)
      result[crew.id] = travelBlocks.map(tb => ({
        travelBlock: tb,
        startCol: Math.floor(tb.startMinutes / TRAVEL_SLOT_MINUTES),
        endCol: Math.ceil(tb.endMinutes / TRAVEL_SLOT_MINUTES),
      }));
    });
    
    // Debug logging
    if (DEBUG_TRAVEL) {
      const totalTravelBlocks = Object.values(result).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`[TRAVEL-GRID] crews=${Object.keys(result).length}, totalTravelBlocks=${totalTravelBlocks}`);
      Object.entries(result).forEach(([crewId, blocks]) => {
        if (blocks.length > 0) {
          console.log(`[TRAVEL-GRID] crew=${crewId}: ${blocks.length} travel blocks`, 
            blocks.map(b => `${b.travelBlock.startMinutes}-${b.travelBlock.endMinutes}min`));
        }
      });
    }
    
    return result;
  }, [assignments, crews, activeDate, resolvedTravelDurations, resolvedHqTravelDurations]);

  // PHASE C3: Calculate assignment counts per job for visual indicators
  const jobAssignmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    assignments.forEach(assignment => {
      counts[assignment.jobId] = (counts[assignment.jobId] || 0) + 1;
    });
    return counts;
  }, [assignments]);

  // PHASE D1: Determine primary assignments (first assignment per job on this day)
  const primaryAssignmentIds = useMemo(() => {
    const seen = new Set<string>();
    const primary: Set<string> = new Set();
    assignments.forEach(assignment => {
      if (!seen.has(assignment.jobId)) {
        seen.add(assignment.jobId);
        primary.add(assignment.id);
      }
    });
    return primary;
  }, [assignments]);

  /**
   * F3.1: Detect overlapping assignments using centralized helper
   * Returns a Map where key = assignmentId, value = array of conflicting assignmentIds
   */
  const overlapMap = useMemo(() => {
    return detectAllOverlaps(assignments);
  }, [assignments]);

  /**
   * F3.3: Calculate crew capacities for the day
   */
  const crewCapacities = useMemo(() => {
    return getAllCrewCapacities(assignments);
  }, [assignments]);

  /**
   * F3.3: Calculate crew capacity with status using centralized helper
   */
  const crewCapacity = useMemo(() => {
    const capacity: Record<string, { totalMinutes: number; assignmentCount: number; status: 'normal' | 'warning' | 'over' }> = {};
    
    Object.entries(assignmentsByCrew).forEach(([crewId, crewAssignments]) => {
      const crewCapacityInfo = crewCapacities.get(crewId);
      capacity[crewId] = {
        totalMinutes: crewCapacityInfo?.totalMinutes || 0,
        assignmentCount: crewAssignments.length,
        status: crewCapacityInfo?.status || 'normal',
      };
    });
    
    return capacity;
  }, [assignmentsByCrew, crewCapacities]);

  const handleJobClick = (jobId: string) => {
    // Find the job from any assignment (all assignments with same jobId reference the same job)
    const assignment = assignments.find(a => a.jobId === jobId);
    if (assignment && onJobClick) {
      onJobClick(assignment.job);
    }
  };

  // Current time calculations removed - can be re-added later if needed
  // Using column-based positioning now

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col h-full">
        <div className="overflow-x-auto md:overflow-x-visible">
          <div className="min-w-[960px] md:min-w-0">
            {/* Sticky Time Header - 48-column grid matching lane grid (15-minute increments) */}
            <div className="sticky top-0 z-20 bg-bg-base border-b border-border-subtle">
              <ScheduleTimeHeader />
            </div>

            {/* Crew Lanes Container - scrollable */}
            <div className="relative overflow-y-auto flex-1 max-h-[calc(100vh-320px)] md:max-h-[calc(100vh-300px)]">
              <CrewLane
                crew={{ id: UNASSIGNED_LANE_ID, name: 'Unassigned', members: [{ name: 'Assign later' }] }}
                height={Math.max(
                  unassignedAssignmentsWithPosition.length > 0
                    ? Math.max(...unassignedAssignmentsWithPosition.map(a => a.top)) + 96
                    : 96,
                  96
                )}
                onSlotClick={onSlotClick}
                isResizing={Boolean(resizeState)}
                jobs={unassignedAssignmentsWithPosition.map(a => a.assignment.job)}
                assignments={unassignedAssignmentsWithPosition.map((a) => ({
                  id: a.assignment.id,
                  startMinutes: a.assignment.startMinutes,
                  endMinutes: a.assignment.endMinutes,
                  startAtHq: a.assignment.startAtHq,
                  endAtHq: a.assignment.endAtHq,
                }))}
                activeDate={activeDate}
                dragState={dragState}
                draggingJob={draggingAssignment?.job || null}
                disableTravel
              >
                {unassignedAssignmentsWithPosition.map(({ assignment, startCol, endCol, top }) => {
                    if (!assignment.id || !assignment.jobId || !assignment.job) {
                      console.error('Invariant violation: schedule render without assignment identity', assignment);
                      return null;
                    }

                    const assignmentCount = jobAssignmentCounts[assignment.jobId] || 1;
                    const hasMultiple = assignmentCount > 1;
                    const isPrimary = primaryAssignmentIds.has(assignment.id);
                    const creationSource: 'manual' | 'dragged' | 'copied' = 'manual';
                    const summary = taskSummaryByJobId ? taskSummaryByJobId[assignment.jobId] : undefined;
                    const uiCompleted =
                      summary ? summary.total > 0 && summary.completedTotal === summary.total : false;

                    return (
                      <JobBlock
                        key={assignment.id}
                        job={assignment.job}
                        startCol={startCol}
                        endCol={endCol}
                        top={top}
                        onClick={() => handleJobClick(assignment.job.id)}
                        onStartDrag={() => onStartDrag?.(assignment.id, true)}
                        onDeleteAssignment={() => onDeleteAssignment?.(assignment.id, assignment)}
                        isDragging={draggingAssignment?.id === assignment.id}
                        uiCompleted={uiCompleted}
                        hasMultipleAssignments={hasMultiple}
                        assignmentCount={assignmentCount}
                        startMinutes={assignment.startMinutes}
                        endMinutes={assignment.endMinutes}
                        scheduledStart={assignment.scheduledStart}
                        scheduledEnd={assignment.scheduledEnd}
                        assignmentId={assignment.id}
                        assignmentStatus={assignment.status}
                        isPrimaryAssignment={isPrimary}
                        creationSource={creationSource}
                        hasTimeConflict={false}
                        conflictTooltip={undefined}
                        onStartResize={onStartResize ? (edge) => onStartResize(assignment.id, edge) : undefined}
                        isResizing={resizeState?.assignmentId === assignment.id}
                        resizePreviewStartCol={resizeState?.assignmentId === assignment.id
                          ? Math.floor(resizeState.previewStartMinutes / SLOT_MINUTES)
                          : undefined}
                        resizePreviewEndCol={resizeState?.assignmentId === assignment.id
                          ? Math.ceil(resizeState.previewEndMinutes / SLOT_MINUTES)
                          : undefined}
                      />
                    );
                  })}
              </CrewLane>
              {crews.map((crew) => {
            const assignmentsWithPosition = stackedAssignmentsByCrew[crew.id] || [];
            const maxTop = assignmentsWithPosition.length > 0 
              ? Math.max(...assignmentsWithPosition.map(a => a.top)) + 96 
              : 0;
            const laneHeight = Math.max(maxTop, 96);
            
              // PART 1: Extract assignment time slots for slot occupancy checking
              // H2.5: Include IDs so we can exclude the dragging assignment from placement calculations
              const assignmentSlots = assignmentsWithPosition.map(a => ({
                id: a.assignment.id,
                startMinutes: a.assignment.startMinutes,
                endMinutes: a.assignment.endMinutes,
                startAtHq: a.assignment.startAtHq,
                endAtHq: a.assignment.endAtHq,
              }));

                return (
                  <CrewLane 
                    key={crew.id} 
                    crew={crew} 
                    isHighlighted={Boolean(highlightCrewId) && crew.id === highlightCrewId}
                    height={laneHeight}
                    onSlotClick={onSlotClick}
                    isResizing={Boolean(resizeState)}
                    jobs={assignmentsWithPosition.map(a => a.assignment.job)}
                    assignments={assignmentSlots}
                    resolvedTravelDurations={resolvedTravelDurations} // H3.2: For unified occupancy timeline
                    resolvedHqTravelDurations={resolvedHqTravelDurations}
                    activeDate={activeDate} // H3.2: For unified occupancy timeline
                    dragState={dragState}
                    draggingJob={draggingAssignment?.job || null}
                    capacityInfo={crewCapacity[crew.id]} // E0.3: Pass capacity info
                  >
                {/* PHASE G2: Render travel blocks (non-interactive) */}
                {(travelBlocksByCrew[crew.id] || []).map(({ travelBlock, startCol, endCol }) => (
                  <TravelBlock
                    key={travelBlock.id}
                    travelBlock={travelBlock}
                    startCol={startCol}
                    endCol={endCol}
                    top={0}
                  />
                ))}
                
                {/* Render assignment blocks */}
                {assignmentsWithPosition.map(({ assignment, startCol, endCol, top }) => {
                  // 🛑 DEFENSIVE LOGGING: Verify assignment has all required fields
                  if (!assignment.id) {
                    console.error('Invariant violation: schedule render without assignment.id', assignment);
                    return null; // Do NOT render invalid assignment
                  }
                  if (!assignment.jobId) {
                    console.error('Invariant violation: schedule render without assignment.jobId', assignment);
                    return null;
                  }
                  if (!assignment.crewId) {
                    console.error('Invariant violation: schedule render without assignment.crewId', assignment);
                    return null;
                  }
                  if (!assignment.job) {
                    console.error('Invariant violation: schedule render without assignment.job', assignment);
                    return null;
                  }

                  const assignmentCount = jobAssignmentCounts[assignment.jobId] || 1;
                  const hasMultiple = assignmentCount > 1;
                  
                  // PHASE D1: Determine if this is the primary assignment
                  const isPrimary = primaryAssignmentIds.has(assignment.id);
                  
                  // PHASE D1: Infer creation source (for now, default to 'manual' - could be enhanced with metadata)
                  // In a real system, this could be stored in assignment metadata or inferred from creation timestamp
                  const creationSource: 'manual' | 'dragged' | 'copied' = 'manual';
                  
                  // F3.1: Check for time conflict using overlap map
                  const conflicts = overlapMap.get(assignment.id) || [];
                  const hasConflict = conflicts.length > 0;

                  const summary = taskSummaryByJobId ? taskSummaryByJobId[assignment.jobId] : undefined;
                  const uiCompleted =
                    summary ? summary.total > 0 && summary.completedTotal === summary.total : false;
                  
                  return (
                    <JobBlock
                      key={assignment.id}
                      job={assignment.job}
                      startCol={startCol}
                      endCol={endCol}
                      top={top}
                      onClick={() => handleJobClick(assignment.job.id)}
                      onStartDrag={() => onStartDrag?.(assignment.id, true)}
                      onDeleteAssignment={() => onDeleteAssignment?.(assignment.id, assignment)}
                      isDragging={draggingAssignment?.id === assignment.id}
                      uiCompleted={uiCompleted}
                      hasMultipleAssignments={hasMultiple}
                      assignmentCount={assignmentCount}
                      startMinutes={assignment.startMinutes}
                      endMinutes={assignment.endMinutes}
                      scheduledStart={assignment.scheduledStart}
                      scheduledEnd={assignment.scheduledEnd}
                      assignmentId={assignment.id}
                      assignmentStatus={assignment.status} // PHASE D1: Pass assignment status
                      isPrimaryAssignment={isPrimary} // PHASE D1: Pass primary flag
                      creationSource={creationSource} // PHASE D1: Pass creation source
                      hasTimeConflict={hasConflict} // E0.3: Pass conflict flag
                      conflictTooltip={hasConflict ? 'Overlaps with another job for this crew' : undefined}
                      // PHASE F2: Resize props
                      onStartResize={onStartResize ? (edge) => onStartResize(assignment.id, edge) : undefined}
                      isResizing={resizeState?.assignmentId === assignment.id}
                      resizePreviewStartCol={resizeState?.assignmentId === assignment.id 
                        ? Math.floor(resizeState.previewStartMinutes / SLOT_MINUTES) 
                        : undefined}
                      resizePreviewEndCol={resizeState?.assignmentId === assignment.id 
                        ? Math.ceil(resizeState.previewEndMinutes / SLOT_MINUTES) 
                        : undefined}
                    />
                  );
                })}
                  </CrewLane>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
