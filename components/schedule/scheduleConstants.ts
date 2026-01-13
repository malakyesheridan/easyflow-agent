/**
 * Shared schedule constants - used across all schedule components
 * Ensures consistent time bounds and slot calculations
 */
export const WORKDAY_START_HOUR = 6;
export const WORKDAY_END_HOUR = 18;
export const SLOT_MINUTES = 15; // Grid column width in minutes (aligns with placement grid)

export const TOTAL_MINUTES = (WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60; // 720 minutes
export const SLOT_COUNT = TOTAL_MINUTES / SLOT_MINUTES; // 48 slots (15-minute increments, 06:00-18:00)

// Sentinel lane ID for scheduled jobs without crews.
export const UNASSIGNED_LANE_ID = 'unassigned';

// Last valid slot index (47 = 17:45 start)
export const MAX_SLOT_INDEX = SLOT_COUNT - 1;

// Last valid slot start time in minutes (17:45 = 705 minutes)
export const MAX_SLOT_START_MINUTES = MAX_SLOT_INDEX * SLOT_MINUTES;
