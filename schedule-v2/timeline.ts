/**
 * schedule-v2/timeline.ts
 * 
 * Builds an occupied timeline from assignments and travel durations.
 * All times are in 15-minute units (grid-aligned).
 * 
 * Rules:
 * - Travel blocks are inserted only between consecutive jobs
 * - Travel blocks are treated as occupied time (same as jobs)
 * - Timeline is sorted by startMinutes
 */

export type OccupiedBlock = {
  startMinutes: number;
  endMinutes: number;
  kind: 'job' | 'travel';
};

export type Assignment = {
  id: string;
  startMinutes: number;
  endMinutes: number;
};

/**
 * Build occupied timeline from assignments and travel durations.
 * 
 * @param assignments - Array of assignments, sorted by startMinutes (not required, but recommended)
 * @param travelDurations - Map of travel durations in minutes
 *   Key format: "fromAssignmentId:toAssignmentId"
 *   Value: duration in minutes (will be quantized to 15-minute grid)
 * @returns Array of occupied blocks (jobs + travel), sorted by startMinutes
 * 
 * Assumptions:
 * - All times are in minutes from midnight
 * - Travel durations are quantized UP to nearest 15 minutes
 * - Travel blocks are only created between consecutive assignments
 * - Travel blocks never overlap the next assignment
 */
export function buildOccupiedTimeline(
  assignments: Assignment[],
  travelDurations: Map<string, number>
): OccupiedBlock[] {
  const timeline: OccupiedBlock[] = [];
  
  // Sort assignments by start time to ensure consecutive processing
  const sorted = [...assignments].sort((a, b) => a.startMinutes - b.startMinutes);
  
  // Process each assignment and insert travel blocks between consecutive ones
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    
    // Add the job block
    timeline.push({
      startMinutes: current.startMinutes,
      endMinutes: current.endMinutes,
      kind: 'job',
    });
    
    // Check if there's a next assignment to insert travel before
    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const gapStart = current.endMinutes;
      const gapEnd = next.startMinutes;
      const gapDuration = gapEnd - gapStart;
      
      // Only insert travel if there's a gap (gapDuration > 0)
      if (gapDuration > 0) {
        // Get travel duration from map (key: "fromId:toId")
        const travelKey = `${current.id}:${next.id}`;
        const rawDuration = travelDurations.get(travelKey) ?? 0;
        
        if (rawDuration > 0) {
          // Quantize UP to nearest 15 minutes
          // E.g., 10 min → 15 min, 22 min → 30 min, 45 min → 45 min
          const quantizedDuration = Math.ceil(rawDuration / 15) * 15;
          
          // Clamp to available gap (never overlap next assignment)
          const travelDuration = Math.min(quantizedDuration, gapDuration);
          
          timeline.push({
            startMinutes: gapStart,
            endMinutes: gapStart + travelDuration,
            kind: 'travel',
          });
        }
      }
    }
  }
  
  // Final timeline is already sorted by startMinutes (we processed in order)
  return timeline;
}
