/**
 * PHASE G2 + G3: Travel Block Timeline Builder
 * 
 * This module builds a canonical timeline with travel blocks inserted between assignments.
 * Travel blocks are DERIVED, not persisted. They exist only for rendering.
 * 
 * ═══════════════════════════════════════════════════════════════════════
 * PHASE G3: Google Maps Integration
 * 
 * Travel times can now be resolved via Google Distance Matrix API.
 * - API calls go through /api/travel-time (server-only, key never exposed)
 * - Results are cached server-side (24h TTL)
 * - If Google fails, falls back to DEFAULT_TRAVEL_DURATION_MINUTES (30 min)
 * 
 * COST CONTROL:
 * - Server-side cache prevents duplicate API calls
 * - Client-side cache (travelDurationCache) prevents duplicate fetches
 * - Pre-resolve travel times in batch before rendering
 * 
 * TODO: Swap server cache to Redis for multi-instance deployments
 * ═══════════════════════════════════════════════════════════════════════
 */

import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR } from '@/components/schedule/scheduleConstants';

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

/** Default travel duration in minutes (placeholder until Phase G3 Google Maps) */
export const DEFAULT_TRAVEL_DURATION_MINUTES = 30;

/** Travel block slot resolution (15 minutes) - finer than job blocks (30 min) */
export const TRAVEL_SLOT_MINUTES = 15;

/** Minimum gap required to render a travel block (must be at least one travel slot) */
export const MIN_TRAVEL_RENDER_MINUTES = 15;

/**
 * Snap travel duration UP to nearest TRAVEL_SLOT_MINUTES.
 * E.g., 10 min → 15 min, 22 min → 30 min
 * 
 * H2.5: This is now a thin wrapper around minutesToGridSlots for consistency.
 * TRAVEL_SLOT_MINUTES === GRID_MINUTES (both 15 min).
 */
export function snapTravelDuration(googleMinutes: number): number {
  return Math.ceil(googleMinutes / TRAVEL_SLOT_MINUTES) * TRAVEL_SLOT_MINUTES;
}

/** Debug flag for travel block logging - set NEXT_PUBLIC_DEBUG_TRAVEL=true in .env.local */
const DEBUG_TRAVEL = typeof window !== 'undefined' 
  ? process.env.NEXT_PUBLIC_DEBUG_TRAVEL === 'true'
  : false;

/** Workday boundaries in minutes from midnight */
const WORKDAY_START_MINUTES = WORKDAY_START_HOUR * 60; // 360 (6:00 AM)
const WORKDAY_END_MINUTES = WORKDAY_END_HOUR * 60;     // 1080 (6:00 PM)
const WORKDAY_TOTAL_MINUTES = (WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60; // 720 (6:00 AM - 6:00 PM)

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export type TravelKind = 'between' | 'hq_start' | 'hq_end';

/**
 * Travel block - derived, not persisted.
 * Represents estimated travel time between assignments (or HQ).
 */
export interface TravelBlock {
  id: string;
  crewId: string;
  date: Date;
  startMinutes: number;
  endMinutes: number;
  sourceAssignmentId?: string | null;
  targetAssignmentId?: string | null;
  type: 'travel';
  kind: TravelKind;
  /** Raw Google duration before snapping (for tooltip display) */
  googleDurationMinutes?: number;
}

/**
 * Union type for timeline items (assignments or travel blocks)
 */
export type TimelineItem = 
  | (ScheduleAssignmentWithJob & { type: 'assignment' })
  | TravelBlock;

/**
 * Check if a timeline item is a travel block
 */
export function isTravelBlock(item: TimelineItem): item is TravelBlock {
  return item.type === 'travel';
}

/**
 * Check if a timeline item is an assignment
 */
export function isAssignment(item: TimelineItem): item is ScheduleAssignmentWithJob & { type: 'assignment' } {
  return item.type === 'assignment';
}

// ═══════════════════════════════════════════════════════════════════════
// TIMELINE BUILDER
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a canonical timeline with travel blocks inserted between assignments.
 * 
 * Rules:
 * - Group by crew + date
 * - Sort assignments by startMinutes
 * - Insert a TravelBlock between each consecutive assignment
 * - Default duration = 30 minutes
 * - TravelBlock start = previous assignment end
 * - TravelBlock end = start + duration (clamped to next assignment start)
 * - Do not overlap assignments
 * 
 * @param assignments - All assignments to process
 * @returns Timeline items sorted by crew, date, and time
 */
export function buildScheduleTimeline(
  assignments: ScheduleAssignmentWithJob[],
  hqTravelDurations?: Map<string, number>
): TimelineItem[] {
  const timeline: TimelineItem[] = [];

  const resolveHqDuration = (assignmentId: string, direction: HqTravelDirection): number => {
    const key = getHqTravelCacheKey(assignmentId, direction);
    const rawDuration = hqTravelDurations?.get(key) ?? DEFAULT_TRAVEL_DURATION_MINUTES;
    return snapTravelDuration(rawDuration);
  };
  
  // Group assignments by crew + date
  const grouped = new Map<string, ScheduleAssignmentWithJob[]>();
  
  for (const assignment of assignments) {
    if (!assignment.crewId) continue;
    const dateKey = assignment.date instanceof Date 
      ? assignment.date.toISOString().split('T')[0]
      : new Date(assignment.date).toISOString().split('T')[0];
    const key = `${assignment.crewId}:${dateKey}`;
    
    const list = grouped.get(key) || [];
    list.push(assignment);
    grouped.set(key, list);
  }
  
  // Process each crew+date group
  for (const [groupKey, crewAssignments] of grouped) {
    const crewId = crewAssignments[0]?.crewId;
    if (!crewId) {
      continue;
    }

    // Sort by start time
    const sorted = [...crewAssignments].sort((a, b) => a.startMinutes - b.startMinutes);
    
    let travelBlocksCreated = 0;
    const gaps: number[] = [];
    
    const skipHqStart = new Set<string>();
    // Add assignments and travel blocks
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = i < sorted.length - 1 ? sorted[i + 1] : null;

      if (current.startAtHq && !skipHqStart.has(current.id)) {
        const travelDuration = resolveHqDuration(current.id, 'start');
        const blockEnd = current.startMinutes;
        const blockStart = Math.max(0, blockEnd - travelDuration);
        if (blockEnd - blockStart >= MIN_TRAVEL_RENDER_MINUTES) {
          timeline.push({
            id: `travel-hq-start-${current.id}`,
            crewId,
            date: current.date instanceof Date ? current.date : new Date(current.date),
            startMinutes: blockStart,
            endMinutes: blockEnd,
            sourceAssignmentId: null,
            targetAssignmentId: current.id,
            type: 'travel',
            kind: 'hq_start',
            googleDurationMinutes: hqTravelDurations?.get(getHqTravelCacheKey(current.id, 'start')),
          });
        }
      }

      // Add the assignment
      timeline.push({
        ...current,
        type: 'assignment',
      });

      if (current.endAtHq) {
        const travelDuration = resolveHqDuration(current.id, 'end');
        const blockStart = current.endMinutes;
        let blockEnd = Math.min(WORKDAY_TOTAL_MINUTES, blockStart + travelDuration);
        let startBlockDuration = 0;

        if (next) {
          const availableGap = Math.max(0, next.startMinutes - current.endMinutes);
          const endBlockDuration = Math.min(travelDuration, availableGap);
          blockEnd = blockStart + endBlockDuration;
          const nextStartDuration = resolveHqDuration(next.id, 'start');
          const remaining = Math.max(0, availableGap - endBlockDuration);
          startBlockDuration = Math.min(nextStartDuration, remaining);
          skipHqStart.add(next.id);
        }

        if (blockEnd - blockStart >= MIN_TRAVEL_RENDER_MINUTES) {
          timeline.push({
            id: `travel-hq-end-${current.id}`,
            crewId,
            date: current.date instanceof Date ? current.date : new Date(current.date),
            startMinutes: blockStart,
            endMinutes: blockEnd,
            sourceAssignmentId: current.id,
            targetAssignmentId: null,
            type: 'travel',
            kind: 'hq_end',
            googleDurationMinutes: hqTravelDurations?.get(getHqTravelCacheKey(current.id, 'end')),
          });
        }

        if (next && startBlockDuration >= MIN_TRAVEL_RENDER_MINUTES) {
          const startBlockEnd = next.startMinutes;
          const startBlockStart = Math.max(0, startBlockEnd - startBlockDuration);
          timeline.push({
            id: `travel-hq-start-${next.id}`,
            crewId,
            date: next.date instanceof Date ? next.date : new Date(next.date),
            startMinutes: startBlockStart,
            endMinutes: startBlockEnd,
            sourceAssignmentId: null,
            targetAssignmentId: next.id,
            type: 'travel',
            kind: 'hq_start',
            googleDurationMinutes: hqTravelDurations?.get(getHqTravelCacheKey(next.id, 'start')),
          });
        }
      }
      
      // Check if there's a next assignment to insert travel before
      if (i < sorted.length - 1) {
        const nextAssignment = sorted[i + 1];
        const gapStart = current.endMinutes;
        const gapEnd = nextAssignment.startMinutes;
        const gapDuration = gapEnd - gapStart;
        
        gaps.push(gapDuration);

        if (current.endAtHq || nextAssignment.startAtHq) {
          continue;
        }
        
        // G2.1: Only insert travel block if gap >= MIN_TRAVEL_RENDER_MINUTES (15 min)
        // This prevents noisy tiny blocks in near-adjacent assignments
        if (gapDuration >= MIN_TRAVEL_RENDER_MINUTES) {
          // Raw duration (would come from Google, using default for now)
          const rawDuration = DEFAULT_TRAVEL_DURATION_MINUTES;
          // Snap UP to nearest 15 minutes
          const snappedDuration = snapTravelDuration(rawDuration);
          // Clamp to available gap (never overlap next assignment)
          const travelDuration = Math.min(snappedDuration, gapDuration);
          
          const travelBlock: TravelBlock = {
            id: `travel-${current.id}-${nextAssignment.id}`,
            crewId,
            date: current.date instanceof Date ? current.date : new Date(current.date),
            startMinutes: gapStart,
            endMinutes: gapStart + travelDuration,
            sourceAssignmentId: current.id,
            targetAssignmentId: nextAssignment.id,
            type: 'travel',
            kind: 'between',
            googleDurationMinutes: rawDuration, // Store raw for tooltip
          };
          
          timeline.push(travelBlock);
          travelBlocksCreated++;
        }
      }
    }
    
    // Debug logging
    if (DEBUG_TRAVEL && sorted.length > 0) {
      console.log(`[TRAVEL] ${groupKey}: ${sorted.length} assignments, gaps=[${gaps.join(',')}], travelBlocks=${travelBlocksCreated}`);
    }
  }
  
  return timeline;
}

/**
 * Build timeline for a specific crew on a specific date.
 * 
 * @param assignments - All assignments
 * @param crewId - Crew to filter for
 * @param date - Date to filter for
 * @returns Timeline items for that crew+date, sorted by time
 */
export function buildCrewDayTimeline(
  assignments: ScheduleAssignmentWithJob[],
  crewId: string,
  date: Date,
  hqTravelDurations?: Map<string, number>
): TimelineItem[] {
  const dateStr = date.toISOString().split('T')[0];
  
  // Filter assignments for this crew and date
  const crewAssignments = assignments.filter(a => {
    const aDateStr = a.date instanceof Date 
      ? a.date.toISOString().split('T')[0]
      : new Date(a.date).toISOString().split('T')[0];
    return a.crewId === crewId && aDateStr === dateStr;
  });
  
  // Build timeline for just these assignments
  return buildScheduleTimeline(crewAssignments, hqTravelDurations);
}

/**
 * Get all travel blocks from a timeline.
 */
export function getTravelBlocks(timeline: TimelineItem[]): TravelBlock[] {
  return timeline.filter(isTravelBlock);
}

/**
 * Get all assignments from a timeline.
 */
export function getAssignments(timeline: TimelineItem[]): (ScheduleAssignmentWithJob & { type: 'assignment' })[] {
  return timeline.filter(isAssignment);
}

/**
 * Calculate total travel time for a crew on a day (in minutes).
 */
export function getTotalTravelMinutes(
  assignments: ScheduleAssignmentWithJob[],
  crewId: string,
  date: Date
): number {
  const timeline = buildCrewDayTimeline(assignments, crewId, date);
  const travelBlocks = getTravelBlocks(timeline);
  return travelBlocks.reduce((sum, tb) => sum + (tb.endMinutes - tb.startMinutes), 0);
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE G3: Google Maps Travel Time Resolution
// ═══════════════════════════════════════════════════════════════════════

/**
 * Client-side cache for resolved travel durations.
 * Prevents redundant fetch calls to /api/travel-time.
 * 
 * PHASE G3.1: Cache key is now ASSIGNMENT-SCOPED to prevent collisions.
 * Key format: "crewId:date:fromAssignmentId:toAssignmentId"
 * 
 * This guarantees:
 * - No collisions between different assignment pairs
 * - No stale reuse across different schedules
 * - No cross-job contamination
 */
const travelDurationCache = new Map<string, number | null>();

/**
 * PHASE G3.1: Generate ASSIGNMENT-SCOPED cache key.
 * 
 * ❌ DO NOT use: jobId, origin|destination, suburb, address, index
 * ✅ USE: crewId + date + fromAssignmentId + toAssignmentId
 */
export function getAssignmentPairCacheKey(
  crewId: string,
  date: string,
  fromAssignmentId: string,
  toAssignmentId: string
): string {
  return `${crewId}:${date}:${fromAssignmentId}:${toAssignmentId}`;
}

export type HqTravelDirection = 'start' | 'end';

export function getHqTravelCacheKey(assignmentId: string, direction: HqTravelDirection): string {
  return `${assignmentId}:${direction}`;
}

// PHASE G3.1: Old address-based resolution removed.
// Use preResolveTravelDurations() with TravelPair[] for assignment-scoped caching.

/**
 * PHASE G3.1: Travel pair with assignment-scoped identity.
 */
export interface TravelPair {
  cacheKey: string;
  crewId: string;
  date: string;
  fromAssignmentId: string;
  toAssignmentId: string;
  originAddress: string;
  destinationAddress: string;
}

/**
 * Pre-resolve travel durations for a list of assignment pairs.
 * Call this before rendering to ensure travel times are cached.
 * 
 * PHASE G3.1: Now uses assignment-scoped cache keys.
 * 
 * @param pairs - Array of TravelPair objects with assignment IDs
 * @returns Map of assignment-scoped cache key -> duration in minutes
 */
export async function preResolveTravelDurations(
  pairs: TravelPair[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  
  // Filter out pairs that are already cached
  const uncached = pairs.filter(p => !travelDurationCache.has(p.cacheKey));

  // Resolve uncached pairs in parallel (with concurrency limit)
  const BATCH_SIZE = 5;
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (p) => {
        const duration = await resolveTravelDurationByAddress(p.originAddress, p.destinationAddress);
        // Store with assignment-scoped key
        travelDurationCache.set(p.cacheKey, duration);
        
        if (DEBUG_TRAVEL) {
          console.log(`[TRAVEL-RESOLVE] ${p.cacheKey} => ${duration} min`);
        }
      })
    );
  }

  // Build results from cache
  for (const p of pairs) {
    const duration = travelDurationCache.get(p.cacheKey);
    results.set(p.cacheKey, duration ?? DEFAULT_TRAVEL_DURATION_MINUTES);
  }

  return results;
}

/**
 * Internal: Resolve travel duration by address (calls Google API).
 * This is separate from cache management.
 */
async function resolveTravelDurationByAddress(
  origin: string,
  destination: string
): Promise<number | null> {
  if (!origin?.trim() || !destination?.trim()) {
    return null;
  }

  try {
    const response = await fetch('/api/travel-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination }),
    });

    if (!response.ok) {
      console.warn('[TRAVEL-API] Non-OK status:', response.status);
      return null;
    }

    const data = await response.json();
    return data.durationMinutes ?? null;
  } catch (error) {
    console.warn('[TRAVEL-API] Fetch error:', error);
    return null;
  }
}

/**
 * Clear the client-side travel duration cache.
 * Useful for testing or forcing fresh data.
 */
export function clearTravelDurationCache(): void {
  travelDurationCache.clear();
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE H3.2: Unified Occupancy Timeline
// ═══════════════════════════════════════════════════════════════════════

/**
 * H3.2: Occupied block - represents a job or travel block as an occupied interval.
 * This is the SINGLE SOURCE OF TRUTH for lane occupancy.
 * Jobs and travel blocks are treated as equal, occupied intervals.
 */
export type OccupiedBlock = {
  type: 'job' | 'travel';
  id: string;
  startMinutes: number;
  endMinutes: number;
};

/**
 * H3.2: Build unified occupancy timeline combining jobs and travel blocks.
 * 
 * This is the SINGLE SOURCE OF TRUTH for:
 * - Occupied time
 * - Hover blocking
 * - Placement validation
 * 
 * Rules:
 * - Sort assignments by start time
 * - Exclude excludeAssignmentId (the job currently being dragged)
 * - Insert travel blocks BETWEEN assignments
 * - Quantize travel to grid (15 min)
 * - Return a SINGLE ordered array of OccupiedBlock
 * 
 * This function is PURE (no side effects, no async).
 * 
 * @param assignments - All assignments for the crew/day
 * @param resolvedTravelDurations - Pre-resolved travel durations map
 * @param crewId - Crew ID for cache key lookup
 * @param dateStr - Date string (ISO format) for cache key lookup
 * @param excludeAssignmentId - ID of assignment to exclude (the one being dragged)
 * @returns Ordered array of occupied blocks (jobs + travel)
 */
export function buildOccupiedTimeline(
  assignments: Array<{ id: string; startMinutes: number; endMinutes: number; startAtHq?: boolean; endAtHq?: boolean }>,
  resolvedTravelDurations: Map<string, number>,
  crewId: string,
  dateStr: string,
  excludeAssignmentId?: string | null,
  hqTravelDurations?: Map<string, number>
): OccupiedBlock[] {
  const timeline: OccupiedBlock[] = [];
  const resolveHqDuration = (assignmentId: string, direction: HqTravelDirection): number => {
    const key = getHqTravelCacheKey(assignmentId, direction);
    const rawDuration = hqTravelDurations?.get(key) ?? DEFAULT_TRAVEL_DURATION_MINUTES;
    return snapTravelDuration(rawDuration);
  };
  
  // Filter out the assignment being dragged
  const filteredAssignments = assignments.filter(a => a.id !== excludeAssignmentId);
  
  // Sort by start time
  const sorted = [...filteredAssignments].sort((a, b) => a.startMinutes - b.startMinutes);
  const skipHqStart = new Set<string>();
  
  // Build timeline with travel blocks
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;
    
    if (current.startAtHq && !skipHqStart.has(current.id)) {
      const travelDuration = resolveHqDuration(current.id, 'start');
      const blockEnd = current.startMinutes;
      const blockStart = Math.max(0, blockEnd - travelDuration);
      if (blockEnd - blockStart >= MIN_TRAVEL_RENDER_MINUTES) {
        timeline.push({
          type: 'travel',
          id: `travel-hq-start-${current.id}`,
          startMinutes: blockStart,
          endMinutes: blockEnd,
        });
      }
    }

    // Add the job block
    timeline.push({
      type: 'job',
      id: current.id,
      startMinutes: current.startMinutes,
      endMinutes: current.endMinutes,
    });

    if (current.endAtHq) {
      const travelDuration = resolveHqDuration(current.id, 'end');
      const blockStart = current.endMinutes;
      let blockEnd = Math.min(WORKDAY_TOTAL_MINUTES, blockStart + travelDuration);
      let startBlockDuration = 0;

      if (next) {
        const availableGap = Math.max(0, next.startMinutes - current.endMinutes);
        const endBlockDuration = Math.min(travelDuration, availableGap);
        blockEnd = blockStart + endBlockDuration;
        const nextStartDuration = resolveHqDuration(next.id, 'start');
        const remaining = Math.max(0, availableGap - endBlockDuration);
        startBlockDuration = Math.min(nextStartDuration, remaining);
        skipHqStart.add(next.id);
      }

      if (blockEnd - blockStart >= MIN_TRAVEL_RENDER_MINUTES) {
        timeline.push({
          type: 'travel',
          id: `travel-hq-end-${current.id}`,
          startMinutes: blockStart,
          endMinutes: blockEnd,
        });
      }

      if (next && startBlockDuration >= MIN_TRAVEL_RENDER_MINUTES) {
        const startBlockEnd = next.startMinutes;
        const startBlockStart = Math.max(0, startBlockEnd - startBlockDuration);
        timeline.push({
          type: 'travel',
          id: `travel-hq-start-${next.id}`,
          startMinutes: startBlockStart,
          endMinutes: startBlockEnd,
        });
      }
    }
    
    // Check if there's a next assignment to insert travel before
    if (i < sorted.length - 1) {
      if (!next) continue;
      const gapStart = current.endMinutes;
      const gapEnd = next.startMinutes;
      const gapDuration = gapEnd - gapStart;

      if (current.endAtHq || next.startAtHq) {
        continue;
      }

      // Only insert travel if gap >= MIN_TRAVEL_RENDER_MINUTES (15 min)
      if (gapDuration >= MIN_TRAVEL_RENDER_MINUTES) {
        // Get travel duration from resolved map using assignment-scoped cache key
        const cacheKey = getAssignmentPairCacheKey(crewId, dateStr, current.id, next.id);
        const rawDuration = resolvedTravelDurations.get(cacheKey) ?? DEFAULT_TRAVEL_DURATION_MINUTES;
        
        // H2.5: Quantize to grid (15 min slots)
        const travelSlots = minutesToGridSlots(rawDuration);
        const travelBlockMinutes = gridSlotsToMinutes(travelSlots);
        
        // Clamp to available gap (never overlap next assignment)
        const travelDuration = Math.min(travelBlockMinutes, gapDuration);
        
        if (travelDuration > 0) {
          // Add travel block as an occupied interval
          timeline.push({
            type: 'travel',
            id: `travel-${current.id}-${next.id}`,
            startMinutes: gapStart,
            endMinutes: gapStart + travelDuration,
          });
        }
      }
    }
  }
  
  return timeline;
}

/**
 * H3.3: Hard placement validation - THE SINGLE SOURCE OF TRUTH for placement authority.
 * 
 * Travel blocks must behave exactly like jobs: occupied time that CANNOT be overlapped.
 * This function does NOT mutate, snap, shift, or correct placement.
 * It ONLY returns true or false.
 * 
 * @param startMinutes - Start time to validate
 * @param durationMinutes - Duration of the job
 * @param occupiedTimeline - Unified timeline of occupied blocks (jobs + travel)
 * @returns true if placement is valid, false if it overlaps any occupied block
 */
export function isPlacementValid({
  startMinutes,
  durationMinutes,
  occupiedTimeline,
}: {
  startMinutes: number;
  durationMinutes: number;
  occupiedTimeline: { startMinutes: number; endMinutes: number }[];
}): boolean {
  const endMinutes = startMinutes + durationMinutes;

  return !occupiedTimeline.some(block =>
    startMinutes < block.endMinutes &&
    endMinutes > block.startMinutes
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE H3.1: Drag-Time Timeline Lock with Materialised Travel Blocks
// ═══════════════════════════════════════════════════════════════════════

/**
 * H3.1: Drag timeline block - represents a job or travel block in a frozen timeline.
 * This is used during drag operations to show travel blocks before placement decisions.
 */
export type DragTimelineBlock =
  | {
      type: 'job';
      id: string;
      startMinutes: number;
      endMinutes: number;
    }
  | {
      type: 'travel';
      fromAssignmentId: string;
      toAssignmentId: string;
      startMinutes: number;
      endMinutes: number;
      durationMinutes: number;
    };

/**
 * H3.1: Build a frozen, travel-aware timeline for drag operations.
 * 
 * This function:
 * - Sorts assignments by start time
 * - Excludes the assignment being dragged (if any)
 * - Inserts travel blocks between consecutive assignments
 * - Quantizes travel duration to grid (15 min)
 * - Returns a flat, ordered list of job + travel blocks
 * 
 * This timeline is built ONCE when drag starts and reused during the drag.
 * Travel blocks are materialised immediately and do NOT change during drag.
 * 
 * @param assignments - All assignments for the crew/day
 * @param resolvedTravelDurations - Pre-resolved travel durations map (from preResolveTravelDurations)
 * @param crewId - Crew ID for cache key lookup
 * @param dateStr - Date string (ISO format) for cache key lookup
 * @param excludeAssignmentId - ID of assignment to exclude (the one being dragged)
 * @returns Ordered array of job and travel blocks
 */
export function buildDragTimeline(
  assignments: Array<{ id: string; startMinutes: number; endMinutes: number }>,
  resolvedTravelDurations: Map<string, number>,
  crewId: string,
  dateStr: string,
  excludeAssignmentId?: string | null
): DragTimelineBlock[] {
  const timeline: DragTimelineBlock[] = [];
  
  // Filter out the assignment being dragged
  const filteredAssignments = assignments.filter(a => a.id !== excludeAssignmentId);
  
  // Sort by start time
  const sorted = [...filteredAssignments].sort((a, b) => a.startMinutes - b.startMinutes);
  
  // Build timeline with travel blocks
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    
    // Add the job block
    timeline.push({
      type: 'job',
      id: current.id,
      startMinutes: current.startMinutes,
      endMinutes: current.endMinutes,
    });
    
    // Check if there's a next assignment to insert travel before
    if (i < sorted.length - 1) {
      const next = sorted[i + 1];
      const gapStart = current.endMinutes;
      const gapEnd = next.startMinutes;
      const gapDuration = gapEnd - gapStart;
      
      // Only insert travel if gap >= MIN_TRAVEL_RENDER_MINUTES (15 min)
      if (gapDuration >= MIN_TRAVEL_RENDER_MINUTES) {
        // Get travel duration from resolved map using assignment-scoped cache key
        const cacheKey = getAssignmentPairCacheKey(crewId, dateStr, current.id, next.id);
        const rawDuration = resolvedTravelDurations.get(cacheKey) ?? DEFAULT_TRAVEL_DURATION_MINUTES;
        
        // H2.5: Quantize to grid (15 min slots)
        const travelSlots = minutesToGridSlots(rawDuration);
        const travelBlockMinutes = gridSlotsToMinutes(travelSlots);
        
        // Clamp to available gap (never overlap next assignment)
        const travelDuration = Math.min(travelBlockMinutes, gapDuration);
        
        if (travelDuration > 0) {
          // Add travel block
          timeline.push({
            type: 'travel',
            fromAssignmentId: current.id,
            toAssignmentId: next.id,
            startMinutes: gapStart,
            endMinutes: gapStart + travelDuration,
            durationMinutes: travelDuration,
          });
        }
      }
    }
  }
  
  return timeline;
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE H2.5: Grid Integrity — Single Source of Truth for Grid Conversion
// ═══════════════════════════════════════════════════════════════════════

/**
 * H2.5: Grid resolution in minutes. All placement/collision logic must use this.
 */
export const GRID_MINUTES = 15;

/**
 * H2.5: Convert minutes to grid slots (rounds UP to ensure travel is never truncated).
 * This is the SINGLE SOURCE OF TRUTH for grid quantization.
 */
export function minutesToGridSlots(minutes: number): number {
  return Math.ceil(minutes / GRID_MINUTES);
}

/**
 * H2.5: Convert grid slots back to minutes.
 */
export function gridSlotsToMinutes(slots: number): number {
  return slots * GRID_MINUTES;
}

// ═══════════════════════════════════════════════════════════════════════
// Authoritative Drag Placement - Single Source of Truth
// ═══════════════════════════════════════════════════════════════════════

/**
 * Authoritative placement resolver - HARD SNAP FORWARD only.
 * 
 * This is the ONLY function that determines where a job can be placed.
 * It snaps forward past any overlapping blocks (jobs or travel).
 * 
 * Rules:
 * - Travel is treated as occupied time, same as jobs
 * - Only snaps forward, never backward
 * - Returns null if placement would exceed workday bounds
 * 
 * @param desiredStartMinutes - Where user wants to place the job
 * @param durationMinutes - Duration of the job
 * @param occupiedTimeline - Timeline of occupied blocks (jobs + travel)
 * @param workdayEndMinutes - End of workday (default 720 = 6 PM)
 * @returns Resolved start position with snap information
 */
export function resolveSnapForwardPlacement({
  desiredStartMinutes,
  durationMinutes,
  occupiedTimeline,
  workdayEndMinutes = 720,
}: {
  desiredStartMinutes: number;
  durationMinutes: number;
  occupiedTimeline: { startMinutes: number; endMinutes: number; type: 'job' | 'travel' }[];
  workdayEndMinutes?: number;
}): {
  resolvedStartMinutes: number | null;
  snapped: boolean;
  snapReason: 'TRAVEL' | 'JOB' | 'OUT_OF_BOUNDS' | null;
} {
  let start = desiredStartMinutes;
  let snapped = false;
  let snapReason: 'TRAVEL' | 'JOB' | 'OUT_OF_BOUNDS' | null = null;

  const sorted = [...occupiedTimeline].sort(
    (a, b) => a.startMinutes - b.startMinutes
  );

  for (const block of sorted) {
    const end = start + durationMinutes;

    const overlaps =
      start < block.endMinutes && end > block.startMinutes;

    if (overlaps) {
      start = block.endMinutes;
      snapped = true;
      snapReason = block.type === 'travel' ? 'TRAVEL' : 'JOB';
    }
  }

  if (start + durationMinutes > workdayEndMinutes) {
    return {
      resolvedStartMinutes: null,
      snapped: true,
      snapReason: 'OUT_OF_BOUNDS',
    };
  }

  return {
    resolvedStartMinutes: start,
    snapped,
    snapReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE H2: Travel-Aware Placement Intelligence
// ═══════════════════════════════════════════════════════════════════════

/**
 * H2.1/H2.2/H2.5: Calculate the earliest valid start time for a job drop.
 * 
 * Given a desired start time and crew assignments, this function:
 * 1. Finds the previous job (if any) that ends before the desired start
 * 2. Calculates required travel time from previous job to new job
 * 3. Returns the earliest valid start = max(desiredStart, prevJobEnd + travelDuration)
 * 
 * H2.5 FIX: Travel is now properly quantized to grid slots and blocks placement
 * into travel time. A 45-min travel = 3 grid slots = 45 minutes of blocked time.
 * 
 * @param desiredStartMinutes - Where the user wants to drop the job
 * @param crewAssignments - All assignments for this crew on this day (sorted by startMinutes)
 * @param travelDurationMinutes - Travel time needed (from Google or default)
 * @param jobDurationMinutes - Duration of the job being placed
 * @returns { validStartMinutes, travelRequired, blocked, blockReason }
 */

/**
 * Build timeline with resolved travel durations.
 * This is an async version that uses Google Maps travel times when available.
 * 
 * @param assignments - All assignments to process
 * @param resolvedDurations - Pre-resolved travel durations map (from preResolveTravelDurations)
 * @returns Timeline items with accurate travel durations
 */
export function buildScheduleTimelineWithDurations(
  assignments: ScheduleAssignmentWithJob[],
  resolvedDurations: Map<string, number>,
  hqTravelDurations?: Map<string, number>
): TimelineItem[] {
  const timeline: TimelineItem[] = [];

  const resolveHqDuration = (assignmentId: string, direction: HqTravelDirection): number => {
    const key = getHqTravelCacheKey(assignmentId, direction);
    const rawDuration = hqTravelDurations?.get(key) ?? DEFAULT_TRAVEL_DURATION_MINUTES;
    return snapTravelDuration(rawDuration);
  };
  
  // Group assignments by crew + date
  const grouped = new Map<string, ScheduleAssignmentWithJob[]>();
  
  for (const assignment of assignments) {
    if (!assignment.crewId) continue;
    const dateKey = assignment.date instanceof Date 
      ? assignment.date.toISOString().split('T')[0]
      : new Date(assignment.date).toISOString().split('T')[0];
    const key = `${assignment.crewId}:${dateKey}`;
    
    const list = grouped.get(key) || [];
    list.push(assignment);
    grouped.set(key, list);
  }
  
  // Process each crew+date group
  for (const [, crewAssignments] of grouped) {
    const crewId = crewAssignments[0]?.crewId;
    if (!crewId) {
      continue;
    }

    const sorted = [...crewAssignments].sort((a, b) => a.startMinutes - b.startMinutes);
    const skipHqStart = new Set<string>();
    
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const next = i < sorted.length - 1 ? sorted[i + 1] : null;

      if (current.startAtHq && !skipHqStart.has(current.id)) {
        const travelDuration = resolveHqDuration(current.id, 'start');
        const blockEnd = current.startMinutes;
        const blockStart = Math.max(0, blockEnd - travelDuration);
        if (blockEnd - blockStart >= MIN_TRAVEL_RENDER_MINUTES) {
          timeline.push({
            id: `travel-hq-start-${current.id}`,
            crewId,
            date: current.date instanceof Date ? current.date : new Date(current.date),
            startMinutes: blockStart,
            endMinutes: blockEnd,
            sourceAssignmentId: null,
            targetAssignmentId: current.id,
            googleDurationMinutes: hqTravelDurations?.get(getHqTravelCacheKey(current.id, 'start')),
            type: 'travel',
            kind: 'hq_start',
          });
        }
      }

      timeline.push({
        ...current,
        type: 'assignment',
      });

      if (current.endAtHq) {
        const travelDuration = resolveHqDuration(current.id, 'end');
        const blockStart = current.endMinutes;
        let blockEnd = Math.min(WORKDAY_TOTAL_MINUTES, blockStart + travelDuration);
        let startBlockDuration = 0;

        if (next) {
          const availableGap = Math.max(0, next.startMinutes - current.endMinutes);
          const endBlockDuration = Math.min(travelDuration, availableGap);
          blockEnd = blockStart + endBlockDuration;
          const nextStartDuration = resolveHqDuration(next.id, 'start');
          const remaining = Math.max(0, availableGap - endBlockDuration);
          startBlockDuration = Math.min(nextStartDuration, remaining);
          skipHqStart.add(next.id);
        }

        if (blockEnd - blockStart >= MIN_TRAVEL_RENDER_MINUTES) {
          timeline.push({
            id: `travel-hq-end-${current.id}`,
            crewId,
            date: current.date instanceof Date ? current.date : new Date(current.date),
            startMinutes: blockStart,
            endMinutes: blockEnd,
            sourceAssignmentId: current.id,
            targetAssignmentId: null,
            googleDurationMinutes: hqTravelDurations?.get(getHqTravelCacheKey(current.id, 'end')),
            type: 'travel',
            kind: 'hq_end',
          });
        }

        if (next && startBlockDuration >= MIN_TRAVEL_RENDER_MINUTES) {
          const startBlockEnd = next.startMinutes;
          const startBlockStart = Math.max(0, startBlockEnd - startBlockDuration);
          timeline.push({
            id: `travel-hq-start-${next.id}`,
            crewId,
            date: next.date instanceof Date ? next.date : new Date(next.date),
            startMinutes: startBlockStart,
            endMinutes: startBlockEnd,
            sourceAssignmentId: null,
            targetAssignmentId: next.id,
            googleDurationMinutes: hqTravelDurations?.get(getHqTravelCacheKey(next.id, 'start')),
            type: 'travel',
            kind: 'hq_start',
          });
        }
      }
      
      if (i < sorted.length - 1) {
        const nextAssignment = sorted[i + 1];
        const gapStart = current.endMinutes;
        const gapEnd = nextAssignment.startMinutes;
        const gapDuration = gapEnd - gapStart;
        
        if (gapDuration >= MIN_TRAVEL_RENDER_MINUTES) {
          if (current.endAtHq || nextAssignment.startAtHq) {
            continue;
          }
          // PHASE G3.1: Use assignment-scoped cache key
          const dateStr = current.date instanceof Date
            ? current.date.toISOString().split('T')[0]
            : new Date(current.date).toISOString().split('T')[0];
          const cacheKey = getAssignmentPairCacheKey(crewId, dateStr, current.id, nextAssignment.id);
          const rawDuration = resolvedDurations.get(cacheKey) ?? DEFAULT_TRAVEL_DURATION_MINUTES;
          
          // Snap UP to nearest 15 minutes
          const snappedDuration = snapTravelDuration(rawDuration);
          // PHASE G3.1: Clamp to available gap (never overlap next assignment)
          const travelDuration = Math.min(snappedDuration, gapDuration);
          
          const travelBlock: TravelBlock = {
            id: `travel-${current.id}-${nextAssignment.id}`,
            crewId,
            date: current.date instanceof Date ? current.date : new Date(current.date),
            startMinutes: gapStart,
            endMinutes: gapStart + travelDuration,
            sourceAssignmentId: current.id,
            targetAssignmentId: nextAssignment.id,
            googleDurationMinutes: rawDuration, // Store raw for tooltip
            type: 'travel',
            kind: 'between',
          };
          
          timeline.push(travelBlock);
        }
      }
    }
  }
  
  return timeline;
}

