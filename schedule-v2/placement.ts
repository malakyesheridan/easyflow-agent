/**
 * schedule-v2/placement.ts
 * 
 * Resolves placement position with snap-forward logic.
 * 
 * Rules:
 * - Snap forward only (never backward)
 * - Travel blocks are treated as occupied time (same as jobs)
 * - Returns null if placement would exceed workday bounds
 */

export type OccupiedBlock = {
  startMinutes: number;
  endMinutes: number;
  kind: 'job' | 'travel';
};

export type PlacementResult = {
  startMinutes: number | null;
  snapDelta: number;
  snapReason: 'travel' | 'job' | 'out_of_bounds' | null;
};

/**
 * Resolve placement position with snap-forward logic.
 * 
 * @param desiredStartMinutes - Where user wants to place the job (in minutes from midnight)
 * @param durationMinutes - Duration of the job (in minutes)
 * @param occupiedTimeline - Array of occupied blocks (jobs + travel), sorted by startMinutes
 * @param workdayEndMinutes - End of workday in minutes (default: 720 = 6 PM)
 * @returns Placement result with resolved start position and snap information
 * 
 * Assumptions:
 * - All times are in minutes from midnight
 * - occupiedTimeline is sorted by startMinutes
 * - Overlap check: start < block.endMinutes && end > block.startMinutes (inclusive boundaries)
 * - Snaps forward to block.endMinutes on overlap
 * - Returns null if resolved position would exceed workdayEndMinutes
 */
export function resolvePlacement({
  desiredStartMinutes,
  durationMinutes,
  occupiedTimeline,
  workdayEndMinutes = 720,
}: {
  desiredStartMinutes: number;
  durationMinutes: number;
  occupiedTimeline: OccupiedBlock[];
  workdayEndMinutes?: number;
}): PlacementResult {
  let start = desiredStartMinutes;
  let snapDelta = 0;
  let snapReason: 'travel' | 'job' | 'out_of_bounds' | null = null;
  
  // Sort timeline to ensure correct processing order
  const sorted = [...occupiedTimeline].sort((a, b) => a.startMinutes - b.startMinutes);
  
  // Check for overlaps and snap forward
  for (const block of sorted) {
    const end = start + durationMinutes;
    
    // Overlap check: inclusive boundaries
    // Adjacent blocks (touching) do NOT overlap
    const overlaps = start < block.endMinutes && end > block.startMinutes;
    
    if (overlaps) {
      // Snap forward to after this block
      start = block.endMinutes;
      // Track the reason for this snap (will be overwritten by subsequent snaps)
      snapReason = block.kind === 'travel' ? 'travel' : 'job';
    }
  }
  
  // Check if resolved position exceeds workday bounds
  if (start + durationMinutes > workdayEndMinutes) {
    return {
      startMinutes: null,
      snapDelta: 0,
      snapReason: 'out_of_bounds',
    };
  }
  
  // Calculate final snap delta (total distance moved forward)
  snapDelta = start - desiredStartMinutes;
  
  return {
    startMinutes: start,
    snapDelta,
    snapReason: snapDelta > 0 ? snapReason : null,
  };
}

