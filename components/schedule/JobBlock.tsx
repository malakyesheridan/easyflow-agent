'use client';

/**
 * JobBlock - Schedule assignment visual block
 * 
 * NOTE: Prefer scheduledStart/scheduledEnd props (from assignment) over job.scheduledStart.
 * job.scheduledStart/End are LEGACY fallbacks only.
 * ScheduleAssignments are the ONLY authoritative source of scheduled time.
 */

import type { Job } from '@/db/schema/jobs';
import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { SLOT_COUNT, WORKDAY_START_HOUR } from './scheduleConstants';
import { getShortAddress, buildFullAddress, hasSchedulableAddress } from '@/lib/utils/jobAddress';

interface JobBlockProps {
  job: Job;
  startCol: number;
  endCol: number;
  startMinutes?: number;
  endMinutes?: number;
  top?: number;
  onClick: () => void;
  onStartDrag?: () => void; // Parent passes a bound function with the correct ID already set
  onDeleteAssignment?: () => void; // PHASE D4: Delete assignment handler (confirmation handled by parent)
  isDragging?: boolean;
  uiCompleted?: boolean; // UI-only: all work steps completed (does not change schedule behavior)
  hasMultipleAssignments?: boolean; // PHASE C3: Visual indicator for multi-assignment jobs
  assignmentCount?: number; // PHASE C3: Number of assignments for this job
  scheduledStart?: Date; // PHASE C3: Time from assignment (not job)
  scheduledEnd?: Date; // PHASE C3: Time from assignment (not job)
  assignmentId?: string; // Fix: Assignment ID for deletion
  // PHASE D1: Assignment clarity
  assignmentStatus?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled'; // Assignment lifecycle state
  isPrimaryAssignment?: boolean; // True if this is the primary assignment for a multi-assignment job
  creationSource?: 'manual' | 'dragged' | 'copied'; // How assignment was created (inferred, not stored)
  // PHASE E0.3: Conflict signals
  hasTimeConflict?: boolean; // True if this assignment overlaps with another on the same crew
  conflictTooltip?: string; // Tooltip message for conflict
  // PHASE F2: Resize
  onStartResize?: (edge: 'start' | 'end') => void; // Called when user starts resizing
  isResizing?: boolean; // True if this assignment is currently being resized
  resizePreviewStartCol?: number; // Preview start column during resize
  resizePreviewEndCol?: number; // Preview end column during resize
}

/**
 * Format time range for display
 * Handles both Date objects and date strings (from JSON serialization)
 */
function formatTimeRange(start: Date | string, end: Date | string): string {
  const formatTime = (date: Date | string) => {
    // Ensure date is a Date object
    const dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) {
      return '00:00'; // Fallback for invalid dates
    }
    const hours = dateObj.getHours();
    const minutes = dateObj.getMinutes();
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };
  return `${formatTime(start)} - ${formatTime(end)}`;
}

function formatMinutesRange(startMinutes: number, endMinutes: number): string | null {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null;
  const format = (minutesFromStart: number) => {
    const totalMinutes = WORKDAY_START_HOUR * 60 + minutesFromStart;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };
  return `${format(startMinutes)} - ${format(endMinutes)}`;
}


/**
 * PHASE A: Job Block - Pure Presentational Component
 * 
 * This component renders a job on the schedule grid.
 * 
 * Key principle: Jobs are immutable reference data.
 * This component displays job data (title, suburb) but does NOT mutate it.
 * Schedule state (crewId, scheduledStart, scheduledEnd) comes from the assignment context.
 * 
 * NO state, NO drag logic, NO job mutation.
 */
export default function JobBlock({ 
  job, 
  startCol, 
  endCol,
  startMinutes,
  endMinutes,
  top = 0, 
  onClick, 
  onStartDrag,
  onDeleteAssignment,
  isDragging = false,
  uiCompleted = false,
  hasMultipleAssignments = false,
  assignmentCount = 1,
  scheduledStart,
  scheduledEnd,
  assignmentId,
  assignmentStatus = 'scheduled', // PHASE D1: Default to scheduled
  isPrimaryAssignment = true, // PHASE D1: Default to primary
  creationSource = 'manual', // PHASE D1: Default to manual (inferred from context)
  hasTimeConflict = false, // E0.3: Default no conflict
  conflictTooltip, // E0.3: Conflict tooltip
  onStartResize, // F2: Resize handler
  isResizing = false, // F2: Resize state
  resizePreviewStartCol, // F2: Preview during resize
  resizePreviewEndCol, // F2: Preview during resize
}: JobBlockProps) {
  // PHASE D1: Visual mutability indicators
  const isAssignmentCompleted = assignmentStatus === 'completed';
  const isCompletedForUi = isAssignmentCompleted || uiCompleted;
  const isInProgress = assignmentStatus === 'in_progress';
  const isPlanned = assignmentStatus === 'scheduled';
  
  // PHASE D1: Mutability visual treatment
  const mutabilityStyle = isAssignmentCompleted
    ? 'opacity-90 cursor-not-allowed' // Locked - completed
    : isInProgress
    ? 'opacity-90 cursor-move' // Limited drag - in progress
    : 'cursor-grab active:cursor-grabbing'; // Fully draggable - planned
  
  // PHASE D1: Primary vs secondary assignment visual treatment
  const assignmentStyle = hasMultipleAssignments && !isPrimaryAssignment
    ? 'bg-bg-card/80 border-l-2' // Secondary: muted background, thinner border
    : 'bg-bg-card/95 border-l-4'; // Primary: normal background, thicker border
  
  // Color accent based on job type
  const accentColor = 'border-l-accent-gold/60';
  
  // PHASE D1: Lifecycle state visual treatment
  const lifecycleStyle = isCompletedForUi
    ? 'bg-accent-gold/12 border border-accent-gold/25 border-l-accent-gold/60' // Completed: gold-tinted card
    : isInProgress
    ? 'ring-1 ring-blue-400/30' // In progress: subtle blue ring
    : ''; // Planned: default

  const statusIconRightClass = hasTimeConflict && hasMultipleAssignments
    ? 'right-9'
    : hasTimeConflict || hasMultipleAssignments
    ? 'right-5'
    : 'right-1';
  
  // PHASE D1: Creation source label text
  const creationSourceLabel = creationSource === 'dragged'
    ? 'Dragged from unassigned'
    : creationSource === 'copied'
    ? 'Copied from another day'
    : 'Scheduled manually';
  
  // PHASE C3: Get time range from assignment (if provided) or job (legacy)
  // Ensure dates are Date objects (they might be strings from JSON)
  const minutesRange =
    startMinutes !== undefined && endMinutes !== undefined
      ? formatMinutesRange(startMinutes, endMinutes)
      : null;
  const timeRange = minutesRange
    ? minutesRange
    : scheduledStart && scheduledEnd
      ? formatTimeRange(
          scheduledStart instanceof Date ? scheduledStart : new Date(scheduledStart),
          scheduledEnd instanceof Date ? scheduledEnd : new Date(scheduledEnd)
        )
      : (job.scheduledStart && job.scheduledEnd
        ? formatTimeRange(new Date(job.scheduledStart), new Date(job.scheduledEnd))
        : null);

  // PHASE D1: Handle mouse down for drag - but NOT if clicking on Remove button or if completed
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const DRAG_THRESHOLD_PX = 6;

  const handlePointerDown = (e: React.PointerEvent) => {
    // CRITICAL: Don't start drag if clicking on Remove button
    const target = e.target as HTMLElement;
    if (target.closest('.remove-assignment-button')) {
      return; // Let the button handle the click
    }
    // CRITICAL: Don't start drag if using resize handles
    if (target.closest('.resize-handle')) {
      return;
    }
    
    // PHASE D1: Prevent drag for completed assignments
    if (isAssignmentCompleted) {
      return; // Completed assignments are locked
    }
    
    // Only start drag if handler exists and not already dragging
    if (onStartDrag && !isDragging) {
      dragStartRef.current = { x: e.clientX, y: e.clientY };

      const handleMove = (moveEvent: PointerEvent) => {
        if (!dragStartRef.current) return;
        const dx = moveEvent.clientX - dragStartRef.current.x;
        const dy = moveEvent.clientY - dragStartRef.current.y;
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
          suppressClickRef.current = true;
          dragStartRef.current = null;
          moveEvent.preventDefault();
          // ❌ REMOVED: No pointer capture - rely on global listeners
          onStartDrag();
          cleanup();
        }
      };

      const handleUp = () => {
        cleanup();
      };

      const cleanup = () => {
        dragStartRef.current = null;
        window.removeEventListener('pointermove', handleMove, true);
        window.removeEventListener('pointerup', handleUp, true);
        window.removeEventListener('pointercancel', handleUp, true);
      };

      window.addEventListener('pointermove', handleMove, true);
      window.addEventListener('pointerup', handleUp, true);
      window.addEventListener('pointercancel', handleUp, true);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    // Don't trigger block click if clicking on Remove button
    const target = e.target as HTMLElement;
    if (target.closest('.remove-assignment-button')) {
      return; // Let the button handle the click
    }
    if (target.closest('.resize-handle')) {
      return;
    }

    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    
    // Only trigger click if not dragging
    if (!isDragging) {
      e.stopPropagation();
      onClick();
    }
  };

  // PHASE D4: Handle assignment deletion - confirmation is now handled by parent with contextual message
  const handleDeleteAssignment = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default behavior
    e.stopPropagation(); // Stop event bubbling
    if (onDeleteAssignment && assignmentId) {
      // PHASE D4: Parent now handles contextual confirmation
      onDeleteAssignment();
    }
  };

  // PHASE F2: Use resize preview columns if resizing, otherwise use actual columns
  const displayStartCol = isResizing && resizePreviewStartCol !== undefined ? resizePreviewStartCol : startCol;
  const displayEndCol = isResizing && resizePreviewEndCol !== undefined ? resizePreviewEndCol : endCol;
  
  // Calculate column span and position using CSS grid
  const colSpan = displayEndCol - displayStartCol;
  const leftPercent = (displayStartCol / SLOT_COUNT) * 100;
  const widthPercent = (colSpan / SLOT_COUNT) * 100;
  
  // F2: Can resize if not completed
  const canResize = onStartResize && assignmentStatus !== 'completed';
  
  // F2: Handle resize start
  const handleResizeStart = (e: React.PointerEvent, edge: 'start' | 'end') => {
    e.preventDefault();
    e.stopPropagation();
    if (canResize) {
      onStartResize(edge);
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      className={cn(
        'job-block absolute rounded-sm transition-all group',
        'outline outline-1 outline-amber-400/60', // H1.1: Gold outline for visual clarity
        'hover:outline-amber-300 hover:shadow-md hover:brightness-105', // H1.1: Brighter on hover
        isDragging && 'outline-amber-300', // H1.1: Brighter when dragging
        assignmentStyle,
        accentColor,
        lifecycleStyle,
        mutabilityStyle,
        isDragging && 'opacity-50 shadow-lg',
        isAssignmentCompleted && 'cursor-not-allowed',
        hasTimeConflict && 'ring-2 ring-amber-500/60' // E0.3: Amber outline for conflicts
      )}
      style={{
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        top: `${top + 4}px`,
        bottom: `4px`,
        minWidth: '100px',
        minHeight: '64px', // E0.1: Consistent height
        padding: '6px 8px',
        zIndex: 10,
      }}
      onClick={handleClick}
      title={hasTimeConflict ? (conflictTooltip || 'Overlaps with another job for this crew') : undefined}
    >
      {/* Resize preview outline */}
      {isResizing && (
        <div className="absolute inset-0 rounded-sm border-2 border-dashed border-accent-gold/70 pointer-events-none" />
      )}
      {/* E0.1: Clear visual hierarchy - Primary info always visible */}
      <div className="flex flex-col h-full justify-start">
        {/* PRIMARY: Title (bold, single line) */}
        <h4 className="font-semibold text-text-primary text-[13px] truncate leading-snug">
          {job.title}
        </h4>
        
        {/* PRIMARY: Time range (strong contrast, directly under title) */}
        {timeRange && (
          <p className="text-[12px] text-text-primary/90 font-medium leading-snug">
            {timeRange}
          </p>
        )}
        
        {/* SECONDARY: Suburb (smaller, muted) */}
        {/* G1: Suburb from canonical address helper, full address in tooltip */}
        <p 
          className={cn(
            "text-[11px] truncate leading-snug mt-0.5",
            hasSchedulableAddress(job) ? "text-text-secondary/70" : "text-text-tertiary/50 italic"
          )}
          title={hasSchedulableAddress(job) ? buildFullAddress(job) : 'Address required to schedule'}
        >
          {getShortAddress(job)}
        </p>
        
        {/* TERTIARY: Creation source - hover only */}
        <p className="text-[9px] text-text-tertiary/40 leading-tight mt-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {creationSourceLabel}
        </p>
      </div>

      {/* E0.3: Conflict warning icon - top right */}
      {hasTimeConflict && (
        <div 
          className="absolute top-1 right-1 text-amber-500" 
          title={conflictTooltip || 'Overlaps with another job for this crew'}
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* E0.1: Multi-assignment badge - top right (shift left if conflict icon present) */}
      {hasMultipleAssignments && assignmentCount > 1 && (
        <span 
          className={cn(
            "absolute top-1 text-[9px] font-semibold text-accent-gold bg-accent-gold/15 px-1 py-0.5 rounded",
            hasTimeConflict ? "right-5" : "right-1"
          )}
          title={`${assignmentCount} assignments`}
        >
          {assignmentCount}×
        </span>
      )}

      {/* E0.1: Remove button - hover only, visually secondary */}
      {onDeleteAssignment && assignmentId && (
        <button
          onClick={handleDeleteAssignment}
          onMouseDown={(e) => e.stopPropagation()}
          className="remove-assignment-button absolute bottom-1 right-1 px-1.5 py-0.5 text-[9px] text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
          title="Remove from schedule"
        >
          Remove
        </button>
      )}

      {/* Mutability icons - only for completed/in-progress */}
      {isCompletedForUi && (
        <div className={cn("absolute top-1 text-accent-gold/80", statusIconRightClass)} title="Completed">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3.25-3.25a1 1 0 011.414-1.414l2.543 2.543 6.543-6.543a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
      {isInProgress && !isCompletedForUi && !hasMultipleAssignments && (
        <div className={cn("absolute top-1 text-blue-400/50", statusIconRightClass)} title="In progress">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
          </svg>
        </div>
      )}

      {/* PHASE F2: Resize handles - invisible until hover */}
      {canResize && (
        <>
          {/* Left resize handle */}
          <div
            className={cn(
              "resize-handle",
              "absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-20",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-accent-gold/40",
              isResizing && "opacity-100 bg-accent-gold/60"
            )}
            onPointerDown={(e) => handleResizeStart(e, 'start')}
          />
          {/* Right resize handle */}
          <div
            className={cn(
              "resize-handle",
              "absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize z-20",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-accent-gold/40",
              isResizing && "opacity-100 bg-accent-gold/60"
            )}
            onPointerDown={(e) => handleResizeStart(e, 'end')}
          />
        </>
      )}
    </div>
  );
}
