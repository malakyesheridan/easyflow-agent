/**
 * PHASE F3: Conflict & Capacity Intelligence
 * 
 * This module provides non-blocking conflict and capacity detection.
 * It NEVER prevents actions, only surfaces information visually.
 */

import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';

// Capacity thresholds (minutes)
export const NORMAL_CAPACITY_MINUTES = 480; // 8 hours
export const WARNING_CAPACITY_MINUTES = 540; // 9 hours

/**
 * F3.1: Detect overlapping assignments within the same crew on the same day.
 * 
 * Two assignments overlap iff:
 *   a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes
 * 
 * @param assignments - All assignments for a single crew on a single day
 * @returns Map where key = assignmentId, value = array of conflicting assignmentIds
 */
export function detectOverlaps(
  assignments: Array<{ id: string; startMinutes: number; endMinutes: number }>
): Map<string, string[]> {
  const overlapMap = new Map<string, string[]>();
  
  // Initialize empty arrays for all assignments
  for (const assignment of assignments) {
    overlapMap.set(assignment.id, []);
  }
  
  // O(n²) but n is small (assignments per crew per day)
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const a = assignments[i];
      const b = assignments[j];
      
      // Check overlap: a starts before b ends AND b starts before a ends
      if (a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes) {
        overlapMap.get(a.id)?.push(b.id);
        overlapMap.get(b.id)?.push(a.id);
      }
    }
  }
  
  return overlapMap;
}

/**
 * F3.1: Detect all overlaps for assignments grouped by crew.
 * 
 * @param assignments - All assignments for a day (across all crews)
 * @returns Map where key = assignmentId, value = array of conflicting assignmentIds
 */
export function detectAllOverlaps(
  assignments: ScheduleAssignmentWithJob[]
): Map<string, string[]> {
  const overlapMap = new Map<string, string[]>();
  
  // Group assignments by crewId
  const byCrewId = new Map<string, ScheduleAssignmentWithJob[]>();
  for (const assignment of assignments) {
    if (!assignment.crewId) continue;
    const list = byCrewId.get(assignment.crewId) || [];
    list.push(assignment);
    byCrewId.set(assignment.crewId, list);
  }
  
  // Detect overlaps within each crew
  for (const [, crewAssignments] of byCrewId) {
    const crewOverlaps = detectOverlaps(crewAssignments);
    for (const [id, conflicts] of crewOverlaps) {
      overlapMap.set(id, conflicts);
    }
  }
  
  return overlapMap;
}

/**
 * F3.3: Crew capacity status
 */
export type CapacityStatus = 'normal' | 'warning' | 'over';

export interface CrewCapacity {
  totalMinutes: number;
  status: CapacityStatus;
}

/**
 * F3.3: Calculate crew capacity for a set of assignments.
 * 
 * @param assignments - All assignments for a single crew on a single day
 * @returns Capacity info with total minutes and status
 */
export function getCrewCapacity(
  assignments: Array<{ startMinutes: number; endMinutes: number }>
): CrewCapacity {
  const totalMinutes = assignments.reduce(
    (sum, a) => sum + (a.endMinutes - a.startMinutes),
    0
  );
  
  let status: CapacityStatus = 'normal';
  if (totalMinutes >= WARNING_CAPACITY_MINUTES) {
    status = 'over';
  } else if (totalMinutes >= NORMAL_CAPACITY_MINUTES) {
    status = 'warning';
  }
  
  return { totalMinutes, status };
}

/**
 * F3.3: Calculate capacity for all crews on a day.
 * 
 * @param assignments - All assignments for a day (across all crews)
 * @returns Map where key = crewId, value = CrewCapacity
 */
export function getAllCrewCapacities(
  assignments: ScheduleAssignmentWithJob[]
): Map<string, CrewCapacity> {
  const capacityMap = new Map<string, CrewCapacity>();
  
  // Group assignments by crewId
  const byCrewId = new Map<string, ScheduleAssignmentWithJob[]>();
  for (const assignment of assignments) {
    if (!assignment.crewId) continue;
    const list = byCrewId.get(assignment.crewId) || [];
    list.push(assignment);
    byCrewId.set(assignment.crewId, list);
  }
  
  // Calculate capacity for each crew
  for (const [crewId, crewAssignments] of byCrewId) {
    capacityMap.set(crewId, getCrewCapacity(crewAssignments));
  }
  
  return capacityMap;
}

/**
 * F3.5: Check if a preview placement would cause an overlap.
 * 
 * @param existingAssignments - Current assignments for the crew (excluding the one being moved)
 * @param previewStart - Preview start minutes
 * @param previewEnd - Preview end minutes
 * @returns true if preview would overlap with any existing assignment
 */
export function wouldOverlap(
  existingAssignments: Array<{ startMinutes: number; endMinutes: number }>,
  previewStart: number,
  previewEnd: number
): boolean {
  return existingAssignments.some(
    a => previewStart < a.endMinutes && a.startMinutes < previewEnd
  );
}

/**
 * F3.5: Calculate capacity if preview assignment is added/updated.
 * 
 * @param existingAssignments - Current assignments for the crew
 * @param previewDurationMinutes - Duration of the preview assignment
 * @param excludeAssignmentId - Assignment to exclude (if updating existing)
 * @returns Updated capacity status
 */
export function previewCapacity(
  existingAssignments: Array<{ id?: string; startMinutes: number; endMinutes: number }>,
  previewDurationMinutes: number,
  excludeAssignmentId?: string
): CrewCapacity {
  // Calculate existing total, excluding the one being moved
  const existingMinutes = existingAssignments
    .filter(a => a.id !== excludeAssignmentId)
    .reduce((sum, a) => sum + (a.endMinutes - a.startMinutes), 0);
  
  const totalMinutes = existingMinutes + previewDurationMinutes;
  
  let status: CapacityStatus = 'normal';
  if (totalMinutes >= WARNING_CAPACITY_MINUTES) {
    status = 'over';
  } else if (totalMinutes >= NORMAL_CAPACITY_MINUTES) {
    status = 'warning';
  }
  
  return { totalMinutes, status };
}

/**
 * Format minutes as hours and minutes string
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

