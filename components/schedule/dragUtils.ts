/**
 * Utility functions for drag & drop scheduling
 */

/**
 * Check if two time ranges overlap
 */
export function timeRangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  // Overlap: start1 < end2 && end1 > start2
  return start1 < end2 && end1 > start2;
}

/**
 * Convert slot start minute to Date (today at 6 AM + minutes)
 */
export function slotMinuteToDate(startMinute: number): Date {
  const date = new Date();
  date.setHours(6, 0, 0, 0);
  date.setMinutes(date.getMinutes() + startMinute);
  return date;
}

/**
 * Calculate job duration in minutes (default 2 hours = 120 minutes)
 */
export const DEFAULT_JOB_DURATION_MINUTES = 120;

