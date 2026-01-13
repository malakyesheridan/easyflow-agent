'use client';

/**
 * CrewLane - Individual crew row in the schedule grid
 * 
 * NOTE: Uses assignments[] for slot occupancy (authoritative).
 * jobs[] is LEGACY fallback only for occupancy check.
 * ScheduleAssignments are the ONLY authoritative source of scheduled time.
 */

import { useEffect, useRef, useState, ReactNode, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { Job } from '@/db/schema/jobs';
import { SLOT_COUNT, SLOT_MINUTES, MAX_SLOT_START_MINUTES, MAX_SLOT_INDEX } from './scheduleConstants';
import { buildOccupiedTimeline, DEFAULT_TRAVEL_DURATION_MINUTES, TRAVEL_SLOT_MINUTES, GRID_MINUTES, minutesToGridSlots, gridSlotsToMinutes, type OccupiedBlock } from '@/lib/utils/scheduleTimeline';
import type { DragTimelineBlock } from '@/lib/utils/scheduleTimeline';
import { isTimeInPlacementWindow } from '@/lib/utils/schedulePlacement';

export interface CrewMember {
  name: string;
}

export interface Crew {
  id: string;
  name: string;
  members: CrewMember[];
}

interface AssignmentSlot {
  id?: string;
  startMinutes: number;
  endMinutes: number;
  startAtHq?: boolean;
  endAtHq?: boolean;
}

interface CrewLaneProps {
  crew: Crew;
  children: ReactNode;
  height?: number;
  isHighlighted?: boolean;
  disableTravel?: boolean;
  // ❌ DELETED: onDragHover - replaced by global pointer loop
  onSlotClick?: (crewId: string, minutes: number) => void;
  isResizing?: boolean; // Disable click-to-schedule while resizing
  jobs?: Job[]; // Legacy - kept for backward compatibility
  assignments?: AssignmentSlot[]; // H3.2: Still passed for compatibility, but occupancy uses unified timeline
  // H3.2: Required for building unified occupancy timeline
  resolvedTravelDurations?: Map<string, number>;
  resolvedHqTravelDurations?: Map<string, number>;
  activeDate?: Date;
  dragState?: {
    assignmentId: string | null;
    jobId: string | null;
    targetCrewId: string | null;
    targetMinutes?: number | null; // Raw cursor position (for hover calculation only)
    // Authoritative resolved preview position
    previewStartMinutes: number | null; // This is what gets rendered and committed
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
    dragTimeline?: DragTimelineBlock[];
    dragTimelineCrewId?: string | null;
  };
  draggingJob?: Job | null;
  // F3.3: Capacity signals with status
  capacityInfo?: {
    totalMinutes: number;
    assignmentCount: number;
    status: 'normal' | 'warning' | 'over';
  };
}


const DEFAULT_JOB_DURATION_MINUTES = 120; // 2 hours

export default function CrewLane({ 
  crew, 
  children, 
  height = 96,
  isHighlighted = false,
  disableTravel = false,
  onSlotClick,
  isResizing = false,
  jobs = [],
  assignments = [], // H3.2: Still used for building unified timeline
  resolvedTravelDurations = new Map(),
  resolvedHqTravelDurations = new Map(),
  activeDate = new Date(),
  capacityInfo, // E0.3: Crew capacity info
  dragState,
  draggingJob,
}: CrewLaneProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  
  // H3.2: Build unified occupancy timeline (jobs + travel blocks)
  const occupiedTimeline = useMemo(() => {
    if (disableTravel) {
      return assignments.map((a) => ({
        type: 'job' as const,
        id: a.id || '',
        startMinutes: a.startMinutes,
        endMinutes: a.endMinutes,
      }));
    }

    const dateStr = activeDate.toISOString().split('T')[0];
    const excludeAssignmentId = dragState?.assignmentId || null;
    
    return buildOccupiedTimeline(
      assignments.map(a => ({
        id: a.id || '',
        startMinutes: a.startMinutes,
        endMinutes: a.endMinutes,
        startAtHq: a.startAtHq,
        endAtHq: a.endAtHq,
      })),
      resolvedTravelDurations,
      crew.id,
      dateStr,
      excludeAssignmentId,
      resolvedHqTravelDurations
    );
  }, [assignments, disableTravel, resolvedHqTravelDurations, resolvedTravelDurations, crew.id, activeDate, dragState?.assignmentId]);

  // ❌ DELETED: pointerenter/pointerleave drag hover logic - replaced by global pointer loop

  // H3.2/H3.3: Check if a slot is occupied using unified occupancy timeline
  // This includes BOTH jobs and travel blocks as occupied intervals
  const isSlotOccupied = (slotMinutes: number): boolean => {
    // Use unified occupancy timeline (jobs + travel blocks)
    if (occupiedTimeline.length > 0) {
      return occupiedTimeline.some(block => 
        slotMinutes >= block.startMinutes && slotMinutes < block.endMinutes
      );
    }
    
    // Fallback to jobs (legacy support) - only if no assignments exist
    return jobs.some(job => {
      if (!job.scheduledStart || !job.scheduledEnd) return false;
      const start = new Date(job.scheduledStart);
      const end = new Date(job.scheduledEnd);
      const dayStart = new Date();
      dayStart.setHours(6, 0, 0, 0);
      
      const jobStartMinutes = (start.getTime() - dayStart.getTime()) / (1000 * 60);
      const jobEndMinutes = (end.getTime() - dayStart.getTime()) / (1000 * 60);
      
      return slotMinutes >= jobStartMinutes && slotMinutes < jobEndMinutes;
    });
  };

  // H3.5: Check if a slot is in a valid placement window
  const isSlotValidForPlacement = (slotMinutes: number): boolean => {
    const isDragging = dragState?.assignmentId || dragState?.jobId;
    if (!isDragging || !dragState?.validPlacementWindows || dragState.targetCrewId !== crew.id) {
      // If not dragging or no placement windows, allow all slots (backward compatibility)
      return true;
    }
    
    // Check if this slot falls within any valid placement window
    return isTimeInPlacementWindow(slotMinutes, dragState.validPlacementWindows);
  };

  // PART 1: Handle grid click - only on empty slots
  // Must ignore clicks on JobBlocks (they have pointer-events: auto)
  const handleGridClick = (e: React.MouseEvent) => {
    // PHASE C2: Don't handle clicks while dragging (either assignment or job)
    const isDragging = dragState?.assignmentId || dragState?.jobId;
    if (!gridRef.current || !onSlotClick || isDragging || isResizing) return;
    
    // PART 1: Ignore clicks that originated from JobBlocks
    const target = e.target as HTMLElement;
    if (target.closest('.job-block') || target.closest('.travel-block')) {
      return; // Click was on a job block, not the grid
    }
    
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const colWidth = rect.width / SLOT_COUNT;
    
    let colIndex = Math.floor(x / colWidth);
    colIndex = Math.max(0, Math.min(colIndex, MAX_SLOT_INDEX));
    
    const minutes = colIndex * SLOT_MINUTES;
    
    // Only trigger if slot is empty
    if (!isSlotOccupied(minutes)) {
      onSlotClick(crew.id, minutes);
    }
  };

  // PART 1: Handle grid hover for empty slots
  // Must ignore hovers over JobBlocks
  const handleGridMouseMove = (e: React.MouseEvent) => {
    // PHASE C2: Don't show hover while dragging
    const isDragging = dragState?.assignmentId || dragState?.jobId;
    if (!gridRef.current || isDragging || isResizing) {
      setHoveredSlot(null);
      return;
    }
    
    // PART 1: Ignore hovers over JobBlocks
    const target = e.target as HTMLElement;
    if (target.closest('.job-block') || target.closest('.travel-block')) {
      setHoveredSlot(null);
      return;
    }
    
    const rect = gridRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const colWidth = rect.width / SLOT_COUNT;
    
    let colIndex = Math.floor(x / colWidth);
    colIndex = Math.max(0, Math.min(colIndex, MAX_SLOT_INDEX));
    
    const minutes = colIndex * SLOT_MINUTES;
    
    // Only show hover if slot is empty
    if (!isSlotOccupied(minutes)) {
      setHoveredSlot(minutes);
    } else {
      setHoveredSlot(null);
    }
  };

  // Authoritative preview rendering - uses ONLY previewStartMinutes
  const isActive = dragState?.targetCrewId === crew.id && dragState?.previewStartMinutes !== null;
  
  // Use duration from dragState (authoritative)
  const durationMinutes = dragState?.draggingJobDuration ?? DEFAULT_JOB_DURATION_MINUTES;
  
  // Render preview using ONLY previewStartMinutes (already resolved)
  const previewStartMinutes = dragState?.previewStartMinutes ?? 0;
  const clampedStartMinutes = Math.min(previewStartMinutes, MAX_SLOT_START_MINUTES);
  const startColIndex = Math.floor(clampedStartMinutes / SLOT_MINUTES);
  const durationSlots = Math.ceil(durationMinutes / SLOT_MINUTES);
  const endColIndex = Math.min(startColIndex + durationSlots, SLOT_COUNT);
  const colSpan = endColIndex - startColIndex;
  
  // Calculate percentage positions for preview
  const previewLeftPercent = (startColIndex / SLOT_COUNT) * 100;
  const previewWidthPercent = (colSpan / SLOT_COUNT) * 100;
  
  // Check if snapping occurred (for visual feedback)
  const wasSnapped = dragState?.snapReason !== null;
  const previewTitle = wasSnapped
    ? dragState?.snapReason === 'travel'
      ? 'Adjusted to allow travel time between jobs.'
      : dragState?.snapReason === 'job'
        ? 'Adjusted to avoid overlapping another job.'
        : 'Adjusted to fit within workday hours.'
    : undefined;

  // Calculate hover slot position
  const hoverSlotColIndex = hoveredSlot !== null ? Math.floor(hoveredSlot / SLOT_MINUTES) : null;
  const hoverLeftPercent = hoverSlotColIndex !== null ? (hoverSlotColIndex / SLOT_COUNT) * 100 : null;

  const showInvalidPlacement =
    Boolean(dragState?.assignmentId || dragState?.jobId) &&
    dragState?.targetCrewId === crew.id &&
    dragState?.previewStartMinutes === null;
  const invalidPlacementMessage = dragState?.travelStatus === 'pending'
    ? 'Calculating travel time...'
    : dragState?.snapReason === 'out_of_bounds'
      ? 'No space after travel or overlaps before end of day.'
      : 'No valid slot here (travel time required).';

  return (
    <div 
      ref={laneRef}
      className={cn(
        'crew-lane relative pointer-events-auto',
        isHighlighted && 'ring-2 ring-accent-gold/50 ring-inset bg-accent-gold/5'
      )}
      style={{ 
        height: `${height}px`,
        minHeight: '96px',
        // PHASE D5: Crew row separator - horizontal divider between crews (consistent and subtle)
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      }}
      data-crewid={crew.id}
    >
      {/* Crew Label - Sticky, non-interactive */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 w-48 flex flex-col justify-center px-4 border-r border-border-subtle z-10 pointer-events-none',
          isHighlighted ? 'bg-accent-gold/10' : 'bg-bg-section'
        )}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <span className="font-bold text-text-primary text-sm">{crew.name}</span>
          {/* F3.3: Capacity status indicator */}
          {capacityInfo && capacityInfo.status === 'warning' && (
            <span 
              className="w-2 h-2 rounded-full bg-amber-500/80"
              title={`${(capacityInfo.totalMinutes / 60).toFixed(1)}h scheduled today`}
            />
          )}
          {capacityInfo && capacityInfo.status === 'over' && (
            <span 
              className="w-2 h-2 rounded-full bg-red-500/80"
              title={`${(capacityInfo.totalMinutes / 60).toFixed(1)}h scheduled today (over capacity)`}
            />
          )}
          {/* F3.3: Fragmentation indicator (>4 assignments) */}
          {capacityInfo && capacityInfo.assignmentCount > 4 && (
            <span 
              className="text-[9px] text-amber-400/70"
              title={`Highly fragmented day (${capacityInfo.assignmentCount} separate jobs)`}
            >
              ⚡
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-1.5">
          {crew.members.map((member, index) => (
            <span key={index} className="text-xs text-text-tertiary">
              {member.name}
            </span>
          ))}
        </div>
      </div>
      
      {/* Lane Content Area - 48-column CSS grid (15-minute increments) that fills available width */}
      <div 
        ref={gridRef}
        className="crew-grid relative h-full pointer-events-auto"
        data-lane="true"
        data-crew-id={crew.id}
        data-date-str={activeDate ? activeDate.toISOString().split('T')[0] : undefined}
        onClick={handleGridClick}
        onMouseMove={handleGridMouseMove}
        onMouseLeave={() => setHoveredSlot(null)}
        style={{ 
          marginLeft: '192px',
          display: 'grid',
          gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))`,
          width: 'calc(100% - 192px)',
          minWidth: 0,
          cursor: (dragState?.assignmentId || dragState?.jobId) ? 'grabbing' : hoveredSlot !== null ? 'pointer' : 'default',
          // Grid lines using CSS gradients - subtle 30-min, stronger hourly
          // 15-minute lines: every column boundary (1/48 of width)
          // Hour lines: every 4 columns (4/48 = 1/12 of width)
          backgroundImage: `
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent calc((100% / ${SLOT_COUNT}) - 1px),
              rgba(255, 255, 255, 0.04) calc((100% / ${SLOT_COUNT}) - 1px),
              rgba(255, 255, 255, 0.04) calc(100% / ${SLOT_COUNT})
            ),
            repeating-linear-gradient(
              to right,
              transparent 0,
              transparent calc((400% / ${SLOT_COUNT}) - 1px),
              rgba(255, 255, 255, 0.08) calc((400% / ${SLOT_COUNT}) - 1px),
              rgba(255, 255, 255, 0.08) calc(400% / ${SLOT_COUNT})
            )
          `,
        }}
      >
        {/* H3.5: Valid placement windows overlay - highlights valid slots, dims invalid slots */}
        {(dragState?.assignmentId || dragState?.jobId) && dragState?.validPlacementWindows && (
          <>
            {/* Dim all slots first */}
            <div className="absolute inset-0 bg-black/5 pointer-events-none z-1" />
            {/* Highlight valid placement windows */}
            {dragState.validPlacementWindows
              .filter(window => window.crewId === crew.id)
              .map((window, idx) => {
                const dateStr = activeDate.toISOString().split('T')[0];
                if (window.date !== dateStr) return null;
                
                const TRAVEL_SLOT_COUNT = (SLOT_COUNT * SLOT_MINUTES) / GRID_MINUTES;
                const startCol = Math.floor(window.startMinutes / GRID_MINUTES);
                const endCol = Math.ceil(window.endMinutes / GRID_MINUTES);
                const leftPercent = (startCol / TRAVEL_SLOT_COUNT) * 100;
                const widthPercent = ((endCol - startCol) / TRAVEL_SLOT_COUNT) * 100;
                
                return (
                  <div
                    key={`valid-window-${idx}`}
                    className="absolute top-0 bottom-0 bg-accent-gold/8 border-l border-r border-accent-gold/20 pointer-events-none z-2"
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                    }}
                  />
                );
              })}
          </>
        )}
        
        {/* Hover highlight for empty slots */}
        {hoveredSlot !== null && hoverLeftPercent !== null && !(dragState?.assignmentId || dragState?.jobId) && (
          <div
            className="absolute top-2 bottom-2 rounded-md border-2 border-dashed border-accent-gold/40 bg-accent-gold/10 pointer-events-none z-20"
            style={{
              left: `calc(${hoverLeftPercent}% + 2px)`,
              width: `calc(${100 / SLOT_COUNT}% - 2px)`,
            }}
          />
        )}
        
        {/* H3.1: Materialised Travel Blocks from Frozen Timeline */}
        {dragState?.dragTimeline && dragState.dragTimelineCrewId === crew.id && (
          <>
            {dragState.dragTimeline
              .filter((block): block is Extract<DragTimelineBlock, { type: 'travel' }> => block.type === 'travel')
              .map((travelBlock) => {
                // Use 15-minute travel slot resolution for positioning
                const TRAVEL_SLOT_COUNT = (SLOT_COUNT * SLOT_MINUTES) / GRID_MINUTES;
                const startCol = Math.floor(travelBlock.startMinutes / GRID_MINUTES);
                const endCol = Math.ceil(travelBlock.endMinutes / GRID_MINUTES);
                const leftPercent = (startCol / TRAVEL_SLOT_COUNT) * 100;
                const widthPercent = ((endCol - startCol) / TRAVEL_SLOT_COUNT) * 100;
                
                return (
                  <div
                    key={`travel-${travelBlock.fromAssignmentId}-${travelBlock.toAssignmentId}`}
                    className="travel-block absolute top-3 bottom-3 rounded-sm border-2 border-dashed border-amber-500/65 bg-amber-500/18 ring-1 ring-amber-500/20 shadow-sm pointer-events-none z-5"
                    data-travel-block="true"
                    style={{
                      left: `calc(${leftPercent}% + 2px)`,
                      width: `calc(${widthPercent}% - 4px)`,
                    }}
                    title={`Travel time: ${travelBlock.durationMinutes} min`}
                  >
                    <div className="flex items-center justify-center h-full">
                      <span className="text-[10px] text-amber-600/80 font-semibold">
                        🚗 {travelBlock.durationMinutes}m
                      </span>
                    </div>
                  </div>
                );
              })}
          </>
        )}
        
        {/* Job Preview - column-based positioning using percentages */}
        {/* H3.3: Shows at raw cursor position - NO auto-shifting */}
        {isActive && dragState.previewStartMinutes !== null && (
          <div
            className={cn(
              "absolute top-2 bottom-2 rounded-md border-2 border-dashed pointer-events-none z-30",
              wasSnapped 
                ? "border-amber-500/80 bg-amber-500/15" 
                : "border-accent-gold/60 bg-accent-gold/20"
            )}
            style={{
              left: `calc(${previewLeftPercent}% + 4px)`,
              width: `calc(${previewWidthPercent}% - 4px)`,
            }}
            title={previewTitle}
          >
            <div className="flex items-center justify-center h-full gap-1">
              {wasSnapped && (
                <span className="text-xs font-medium text-amber-500">↪</span>
              )}
              <span className={cn(
                "text-xs font-medium opacity-80",
                wasSnapped ? "text-amber-500" : "text-accent-gold"
              )}>
                {draggingJob?.title}
              </span>
            </div>
          </div>
        )}
        {showInvalidPlacement && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div
              className="rounded-md border border-amber-500/40 bg-bg-card/90 px-3 py-2 text-xs font-medium text-amber-600 shadow-sm"
              title={invalidPlacementMessage}
            >
              {invalidPlacementMessage}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Export crew types for use in other components
