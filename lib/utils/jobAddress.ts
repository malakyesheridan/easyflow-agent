/**
 * PHASE G1: Address Normalisation Helpers
 * 
 * SINGLE SOURCE OF TRUTH for job address logic.
 * Used by: Jobs page, Schedule display, Travel time (future), Maps (future)
 * 
 * DO NOT duplicate address logic elsewhere.
 * DO NOT read address fields directly in UI components - use these helpers.
 */

import type { Job } from '@/db/schema/jobs';

/**
 * Minimum fields required for a job to be schedulable.
 * A job without these cannot be placed on the schedule.
 */
export interface SchedulableAddressFields {
  addressLine1: string;
  suburb: string;
  postcode: string;
}

/**
 * Check if a job has a valid address for scheduling.
 * 
 * Required fields:
 * - addressLine1 (street address)
 * - suburb
 * - postcode
 * 
 * @param job - The job to check
 * @returns true if the job can be scheduled based on address
 */
export function hasSchedulableAddress(job: Pick<Job, 'addressLine1' | 'suburb' | 'postcode'>): boolean {
  return Boolean(
    job.addressLine1?.trim() &&
    job.suburb?.trim() &&
    job.postcode?.trim()
  );
}

/**
 * Build a full address string from job fields.
 * Handles missing optional fields gracefully.
 * 
 * Example output: "24 Smith St, Fremantle WA 6160, Australia"
 * 
 * @param job - The job with address fields
 * @returns Formatted full address string, or empty string if no address
 */
export function buildFullAddress(
  job: Pick<Job, 'addressLine1' | 'addressLine2' | 'suburb' | 'state' | 'postcode' | 'country'>
): string {
  const parts: string[] = [];
  
  // Line 1: Street address
  if (job.addressLine1?.trim()) {
    parts.push(job.addressLine1.trim());
  }
  
  // Line 2: Unit/building (optional)
  if (job.addressLine2?.trim()) {
    parts.push(job.addressLine2.trim());
  }
  
  // Build suburb/state/postcode line
  const locationParts: string[] = [];
  if (job.suburb?.trim()) {
    locationParts.push(job.suburb.trim());
  }
  if (job.state?.trim()) {
    locationParts.push(job.state.trim());
  }
  if (job.postcode?.trim()) {
    locationParts.push(job.postcode.trim());
  }
  
  if (locationParts.length > 0) {
    parts.push(locationParts.join(' '));
  }
  
  // Country (optional, defaults to AU)
  const country = job.country?.trim() || 'AU';
  if (country === 'AU') {
    parts.push('Australia');
  } else if (country) {
    parts.push(country);
  }
  
  return parts.join(', ');
}

/**
 * Get a short display address for compact views.
 * Prefers suburb, falls back to address line 1 when suburb is missing.
 * 
 * @param job - The job with address fields
 * @returns Suburb name, address line 1, or "No site address"
 */
export function getShortAddress(job: Pick<Job, 'suburb' | 'addressLine1'>): string {
  if (job.suburb?.trim()) {
    return job.suburb.trim();
  }
  if (job.addressLine1?.trim()) {
    return job.addressLine1.trim();
  }
  return 'No site address';
}

/**
 * Get the reason why a job cannot be scheduled (address-related).
 * Returns null if the job has a valid address.
 * 
 * @param job - The job to check
 * @returns Error message or null
 */
export function getAddressSchedulingError(
  job: Pick<Job, 'addressLine1' | 'suburb' | 'postcode'>
): string | null {
  const missing: string[] = [];
  
  if (!job.addressLine1?.trim()) {
    missing.push('street address');
  }
  if (!job.suburb?.trim()) {
    missing.push('suburb');
  }
  if (!job.postcode?.trim()) {
    missing.push('postcode');
  }
  
  if (missing.length === 0) {
    return null;
  }
  
  return `Missing ${missing.join(', ')} - add a site address before scheduling`;
}

// ═══════════════════════════════════════════════════════════════════════
// TODO Phase G2: Travel placeholder helpers
// - getEstimatedTravelTime(fromJob, toJob) - placeholder returning null
// - hasGeocoordinates(job) - check if lat/lng exist
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// TODO Phase G3: Google Maps integration
// - geocodeAddress(job) - call Google Geocoding API
// - calculateTravelTime(origin, destination) - call Distance Matrix API
// ═══════════════════════════════════════════════════════════════════════

