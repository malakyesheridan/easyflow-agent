'use client';

/**
 * TravelBlock - Visual representation of travel time between assignments
 * 
 * PHASE G2: Travel blocks are DERIVED, not persisted.
 * They are non-draggable, non-clickable, and purely informational.
 * 
 * TODO Phase G3: Replace placeholder duration with Google Maps travel time.
 */

import { cn } from '@/lib/utils';
import { SLOT_COUNT, SLOT_MINUTES } from './scheduleConstants';
import { TRAVEL_SLOT_MINUTES } from '@/lib/utils/scheduleTimeline';
import type { TravelBlock as TravelBlockType } from '@/lib/utils/scheduleTimeline';

/** Number of 15-minute travel slots in the workday (12 hours * 4 = 48) */
const TRAVEL_SLOT_COUNT = (SLOT_COUNT * SLOT_MINUTES) / TRAVEL_SLOT_MINUTES;

interface TravelBlockProps {
  travelBlock: TravelBlockType;
  /** Start column in 15-minute resolution */
  startCol: number;
  /** End column in 15-minute resolution */
  endCol: number;
  top?: number;
}

/**
 * Format travel duration for display
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function TravelBlock({
  travelBlock,
  startCol,
  endCol,
  top = 0,
}: TravelBlockProps) {
  // Use 15-minute travel slot grid for positioning
  const leftPercent = (startCol / TRAVEL_SLOT_COUNT) * 100;
  const widthPercent = ((endCol - startCol) / TRAVEL_SLOT_COUNT) * 100;
  const scheduledMinutes = travelBlock.endMinutes - travelBlock.startMinutes;
  const googleMinutes = travelBlock.googleDurationMinutes;

  const kindLabel =
    travelBlock.kind === 'hq_start'
      ? 'HQ start travel'
      : travelBlock.kind === 'hq_end'
        ? 'HQ finish travel'
        : 'Travel time';

  // Build tooltip showing both Google and scheduled duration
  const tooltipText =
    googleMinutes && googleMinutes !== scheduledMinutes
      ? `${kindLabel}: ${formatDuration(googleMinutes)} (Google)\nScheduled: ${formatDuration(scheduledMinutes)}`
      : `${kindLabel} (estimated): ${formatDuration(scheduledMinutes)}`;

  // Debug logging
  if (process.env.NEXT_PUBLIC_DEBUG_TRAVEL === 'true') {
    console.log(`[TRAVEL-BLOCK] Rendering: ${travelBlock.id}, cols=${startCol}-${endCol} (15min), mins=${travelBlock.startMinutes}-${travelBlock.endMinutes}, google=${googleMinutes}`);
  }

  // H1.2: Display Google duration if available, otherwise scheduled duration
  const displayMinutes = googleMinutes || scheduledMinutes;
  const badgeLabel =
    travelBlock.kind === 'hq_start'
      ? 'HQ start'
      : travelBlock.kind === 'hq_end'
        ? 'HQ finish'
        : 'Travel';

  return (
    <div
      className={cn(
        'travel-block',
        'absolute rounded-sm overflow-hidden group/travel',
        'pointer-events-auto cursor-default', // H1.2: Allow hover but not interactive
        'bg-amber-500/18', // Slightly stronger for legibility
        'border-2 border-dashed border-amber-500/55 ring-1 ring-amber-500/20', // Clear outline
        'hover:bg-amber-500/28 hover:border-amber-500/70 hover:ring-amber-500/30' // Brighten on hover
      )}
      data-travel-block="true"
      style={{
        left: `calc(${leftPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
        top: `${top + 4}px`,
        bottom: `4px`,
        minWidth: '30px',
        minHeight: '32px',
        zIndex: 5, // Below assignments (z-index 10)
      }}
      title={tooltipText}
    >
      {/* H1.2: Subtle diagonal stripe pattern */}
      <div 
        className="absolute inset-0 opacity-15 group-hover/travel:opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 6px,
            currentColor 6px,
            currentColor 7px
          )`,
        }}
      />
      
      {/* H1.2: Centered travel time display - always visible */}
      <div className="relative flex items-center justify-center h-full px-1">
        <span className={cn(
          "flex items-center gap-1",
          "text-amber-600/80 group-hover/travel:text-amber-500", // H1.2: Muted gold, brighter on hover
          "font-semibold" // H1.2: Bold for readability
        )}>
          <span className="text-[10px] uppercase tracking-wide">{badgeLabel}</span>
          <span className="text-[11px] whitespace-nowrap">{displayMinutes} min</span>
        </span>
      </div>
    </div>
  );
}
