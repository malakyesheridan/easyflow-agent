/**
 * Development port configuration
 * 
 * Centralized port definitions for all development services.
 * All services must import ports from this file - no hardcoded ports.
 */

export const DEV_PORTS = {
  /** Web App (Next.js) */
  WEB: 3000,
  
  /** API Routes / Server */
  API: 4000,
  
  /** Background Worker */
  WORKER: 4001,
  
  /** Future Admin App */
  ADMIN: 3001,
} as const;

/**
 * Get the web port from environment or default
 */
export function getWebPort(): number {
  return parseInt(process.env.WEB_PORT || process.env.PORT || String(DEV_PORTS.WEB), 10);
}

/**
 * Get the API port from environment or default
 */
export function getApiPort(): number {
  return parseInt(process.env.API_PORT || String(DEV_PORTS.API), 10);
}

/**
 * Get the worker port from environment or default
 */
export function getWorkerPort(): number {
  return parseInt(process.env.WORKER_PORT || String(DEV_PORTS.WORKER), 10);
}

