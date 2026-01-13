/**
 * H3.5: Placement Windows - Precomputed valid placement slots
 * 
 * Instead of validating placement after the fact, we precompute where placement
 * is allowed and lock everything else. This makes the UX deterministic and clear.
 */

import { buildOccupiedTimeline, GRID_MINUTES, minutesToGridSlots, gridSlotsToMinutes } from './scheduleTimeline';

export type PlacementWindow = {
  crewId: string;
  date: string;
  startMinutes: number;
  endMinutes: number;
};

export interface Assignment {
  id: string;
  crewId: string;
  date: string | Date;
  startMinutes: number;
  endMinutes: number;
  startAtHq?: boolean;
  endAtHq?: boolean;
}

/**
 * H3.5: Compute all valid placement windows for a job.
 * 
 * This function:
 * 1. Sorts assignments by startMinutes
 * 2. Inserts travel blocks between assignments
 * 3. Builds an occupied timeline (jobs + travel)
 * 4. Finds all gaps where jobDuration fits
 * 5. Returns windows snapped to 15-minute grid
 * 
 * @param assignments - All assignments for the crew/date
 * @param travelDurations - Resolved travel durations map
 * @param jobDurationMinutes - Duration of the job being placed
 * @param crewId - Crew ID
 * @param dateStr - Date string (ISO format)
 * @param excludeAssignmentId - Assignment to exclude (the one being dragged)
 * @param workdayStartMinutes - Start of workday (default 0 = 6 AM)
 * @param workdayEndMinutes - End of workday (default 720 = 6 PM)
 * @returns Array of valid placement windows
 */
export function computePlacementWindows({
  assignments,
  travelDurations,
  hqTravelDurations,
  jobDurationMinutes,
  crewId,
  dateStr,
  excludeAssignmentId = null,
  workdayStartMinutes = 0,
  workdayEndMinutes = 720,
}: {
  assignments: Assignment[];
  travelDurations: Map<string, number>;
  hqTravelDurations?: Map<string, number>;
  jobDurationMinutes: number;
  crewId: string;
  dateStr: string;
  excludeAssignmentId?: string | null;
  workdayStartMinutes?: number;
  workdayEndMinutes?: number;
}): PlacementWindow[] {
  const windows: PlacementWindow[] = [];
  
  // Build occupied timeline (jobs + travel blocks)
  const occupiedTimeline = buildOccupiedTimeline(
    assignments.map(a => ({
      id: a.id,
      startMinutes: a.startMinutes,
      endMinutes: a.endMinutes,
      startAtHq: a.startAtHq,
      endAtHq: a.endAtHq,
    })),
    travelDurations,
    crewId,
    dateStr,
    excludeAssignmentId,
    hqTravelDurations
  );
  
  // Sort occupied blocks by start time
  const sorted = [...occupiedTimeline].sort((a, b) => a.startMinutes - b.startMinutes);
  
  // Find gaps between occupied blocks where job can fit
  let currentStart = workdayStartMinutes;
  
  for (const block of sorted) {
    // Check if there's a gap before this block
    const gapStart = currentStart;
    const gapEnd = block.startMinutes;
    const gapDuration = gapEnd - gapStart;
    
    if (gapDuration >= jobDurationMinutes) {
      // This gap is large enough for the job
      // Snap to 15-minute grid
      const startSlots = Math.floor(gapStart / GRID_MINUTES);
      const endSlots = Math.ceil((gapStart + jobDurationMinutes) / GRID_MINUTES);
      
      const snappedStart = startSlots * GRID_MINUTES;
      const snappedEnd = endSlots * GRID_MINUTES;
      
      // Ensure window fits in the gap
      if (snappedEnd <= gapEnd) {
        windows.push({
          crewId,
          date: dateStr,
          startMinutes: snappedStart,
          endMinutes: snappedEnd,
        });
      }
    }
    
    // Move current start to after this block
    currentStart = block.endMinutes;
  }
  
  // Check gap after last block to end of workday
  const finalGapStart = currentStart;
  const finalGapEnd = workdayEndMinutes;
  const finalGapDuration = finalGapEnd - finalGapStart;
  
  if (finalGapDuration >= jobDurationMinutes) {
    // Snap to 15-minute grid
    const startSlots = Math.floor(finalGapStart / GRID_MINUTES);
    const endSlots = Math.ceil((finalGapStart + jobDurationMinutes) / GRID_MINUTES);
    
    const snappedStart = startSlots * GRID_MINUTES;
    const snappedEnd = Math.min(endSlots * GRID_MINUTES, workdayEndMinutes);
    
    if (snappedEnd - snappedStart >= jobDurationMinutes) {
      windows.push({
        crewId,
        date: dateStr,
        startMinutes: snappedStart,
        endMinutes: snappedEnd,
      });
    }
  }
  
  return windows;
}

/**
 * H3.5: Check if a time point falls within any placement window.
 */
export function isTimeInPlacementWindow(
  minutes: number,
  windows: PlacementWindow[]
): boolean {
  return windows.some(window =>
    minutes >= window.startMinutes && minutes < window.endMinutes
  );
}

/**
 * H3.5: Find the placement window that contains a time point.
 */
export function findPlacementWindow(
  minutes: number,
  windows: PlacementWindow[]
): PlacementWindow | null {
  return windows.find(window =>
    minutes >= window.startMinutes && minutes < window.endMinutes
  ) || null;
}








