/**
 * PHASE G3: Google Distance Matrix API Route
 * 
 * ═══════════════════════════════════════════════════════════════════════
 * SECURITY: This route is SERVER-ONLY.
 * The Google API key (GOOGLE_MAPS_SERVER_KEY) is NEVER exposed to the browser.
 * All travel time requests must go through this endpoint.
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * COST CONTROL:
 * - In-memory cache with 24-hour TTL
 * - Each unique origin→destination pair is cached
 * - Google API is only called on cache miss
 * - TODO: Swap to Redis for multi-instance deployments
 * ═══════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth/session';
import { rateLimit } from '@/lib/security/rateLimit';

// ═══════════════════════════════════════════════════════════════════════
// CACHE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════

/** Cache TTL in milliseconds (24 hours) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Request timeout in milliseconds */
const REQUEST_TIMEOUT_MS = 5000;

/** In-memory cache for travel times */
interface CacheEntry {
  durationMinutes: number;
  timestamp: number;
}

// Simple Map-based cache (TODO: Replace with Redis for production scale)
const travelTimeCache = new Map<string, CacheEntry>();

/**
 * Generate cache key from origin and destination
 */
function getCacheKey(origin: string, destination: string): string {
  return `${origin.toLowerCase().trim()}|${destination.toLowerCase().trim()}`;
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_TTL_MS;
}

/**
 * Clean expired cache entries (called periodically)
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of travelTimeCache.entries()) {
    if (now - entry.timestamp >= CACHE_TTL_MS) {
      travelTimeCache.delete(key);
    }
  }
}

// Note: no background timers; serverless instances may not keep them reliably.

// ═══════════════════════════════════════════════════════════════════════
// API HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = rateLimit({
      req: request,
      key: 'travel-time',
      limit: 120,
      windowMs: 60_000,
    });
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: rateLimitResult.error.message, durationMinutes: null },
        { status: 429 }
      );
    }

    const sessionResult = await requireSession(request);
    if (!sessionResult.ok) {
      const status = sessionResult.error.code === 'UNAUTHORIZED' ? 401 : 403;
      return NextResponse.json(
        { error: sessionResult.error.message, durationMinutes: null },
        { status }
      );
    }

    // Serverless-safe cache cleanup (avoid background timers)
    cleanExpiredCache();

    // Parse and validate input
    const body = await request.json();
    const { origin, destination } = body;

    if (!origin || typeof origin !== 'string') {
      return NextResponse.json(
        { error: 'Invalid origin', durationMinutes: null },
        { status: 400 }
      );
    }

    if (!destination || typeof destination !== 'string') {
      return NextResponse.json(
        { error: 'Invalid destination', durationMinutes: null },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = getCacheKey(origin, destination);
    const cached = travelTimeCache.get(cacheKey);
    
    if (cached && isCacheValid(cached)) {
      return NextResponse.json({
        durationMinutes: cached.durationMinutes,
        cached: true,
      });
    }

    // Get API key (server-only) - trim to handle whitespace issues
    const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY?.trim();

    if (!apiKey) {
      console.warn('[TRAVEL-API] GOOGLE_MAPS_SERVER_KEY not configured (undefined or empty).');
      return NextResponse.json({
        durationMinutes: null,
        error: 'API key not configured',
      });
    }

    // Call Google Distance Matrix API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
      url.searchParams.set('origins', origin);
      url.searchParams.set('destinations', destination);
      url.searchParams.set('mode', 'driving');
      url.searchParams.set('key', apiKey);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error('Google API error:', response.status, response.statusText);
        return NextResponse.json({
          durationMinutes: null,
          error: 'Google API request failed',
        });
      }

      const data = await response.json();

      // Validate response structure
      if (data.status !== 'OK') {
        console.error('Google API status error:', data.status, data.error_message);
        return NextResponse.json({
          durationMinutes: null,
          error: `Google API status: ${data.status}`,
        });
      }

      const element = data.rows?.[0]?.elements?.[0];
      
      if (!element || element.status !== 'OK') {
        console.error('Google API element error:', element?.status);
        return NextResponse.json({
          durationMinutes: null,
          error: `Route not found: ${element?.status || 'unknown'}`,
        });
      }

      // Extract duration in seconds and convert to minutes (round up)
      const durationSeconds = element.duration?.value;
      
      if (typeof durationSeconds !== 'number') {
        return NextResponse.json({
          durationMinutes: null,
          error: 'Invalid duration in response',
        });
      }

      const durationMinutes = Math.ceil(durationSeconds / 60);

      // Cache the result
      travelTimeCache.set(cacheKey, {
        durationMinutes,
        timestamp: Date.now(),
      });

      return NextResponse.json({
        durationMinutes,
        cached: false,
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.error('Google API timeout');
        return NextResponse.json({
          durationMinutes: null,
          error: 'Request timeout',
        });
      }

      throw fetchError;
    }

  } catch (error) {
    // Never throw to client - always return graceful fallback
    console.error('Travel time API error:', error);
    return NextResponse.json({
      durationMinutes: null,
      error: 'Internal server error',
    });
  }
}
