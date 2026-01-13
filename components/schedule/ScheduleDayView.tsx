'use client';

import { useMemo } from 'react';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import ScheduleDayGrid, { type Crew } from './ScheduleDayGrid';

/**
 * PHASE C2: ScheduleDayView now works with assignments.
 */
interface ScheduleDayViewProps {
  assignments: ScheduleAssignmentWithJob[];
  crews?: Crew[];
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
  onDeleteAssignment?: (assignmentId: string, assignment?: ScheduleAssignmentWithJob) => void; // PHASE D4: Delete assignment handler with contextual confirmation
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
  // PHASE G3: Pre-resolved travel durations from Google Distance Matrix
  resolvedTravelDurations?: Map<string, number>;
  resolvedHqTravelDurations?: Map<string, number>;
}

/**
 * Mock crew data - will be replaced with database queries later
 * Using valid UUIDs to match database schema requirements
 */
function getMockCrews(): Crew[] {
  return [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Install Team 1',
      members: [
        { name: 'Nick' },
        { name: 'Tom' },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Install Team 2',
      members: [
        { name: 'Jake' },
        { name: 'Aaron' },
      ],
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Measure Team',
      members: [
        { name: 'Sam' },
      ],
    },
  ];
}

export default function ScheduleDayView({ 
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
}: ScheduleDayViewProps) {
  const fallbackCrews = useMemo(() => getMockCrews(), []);
  const resolvedCrews = crews ?? fallbackCrews;

  return (
    <ScheduleDayGrid 
      assignments={assignments}
      crews={resolvedCrews} 
      orgId={orgId}
      activeDate={activeDate}
      highlightCrewId={highlightCrewId}
      taskSummaryByJobId={taskSummaryByJobId}
      onJobScheduled={onJobScheduled} 
      onAssignJob={onAssignJob} 
      onJobClick={onJobClick}
      onStartDrag={onStartDrag}
      onSlotClick={onSlotClick}
      onDeleteAssignment={onDeleteAssignment}
      dragState={dragState}
      draggingAssignment={draggingAssignment}
      onStartResize={onStartResize}
      resizeState={resizeState}
      resolvedTravelDurations={resolvedTravelDurations}
      resolvedHqTravelDurations={resolvedHqTravelDurations}
    />
  );
}
