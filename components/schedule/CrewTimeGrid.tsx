'use client';

import { useMemo } from 'react';
import type { Job } from '@/db/schema/jobs';
import { cn } from '@/lib/utils';
import { SLOT_COUNT, SLOT_MINUTES, WORKDAY_START_HOUR } from './scheduleConstants';

interface CrewTimeGridProps {
  totalWidth: number;
  pxPerMinute: number;
  totalMinutes: number;
  jobs?: Array<{ job: Job; left: number; width: number; top: number }>;
}

/**
 * CrewTimeGrid - Visual time grid scoped to a single crew lane
 * This is rendered inside each CrewLane, not shared across lanes
 */
export default function CrewTimeGrid({ 
  totalWidth, 
  pxPerMinute, 
  totalMinutes, 
  jobs = [],
}: CrewTimeGridProps) {
  // Calculate current hour for past/future distinction
  const now = new Date();
  const currentHour = now.getHours();
  
  // Create grid lines - hour and half-hour separators
  // Exactly SLOT_COUNT slots, with lines at slot boundaries
  const gridLines = useMemo(() => {
    const lines: Array<{ left: number; isHour: boolean; slotIndex: number }> = [];
    const slotWidth = totalWidth / SLOT_COUNT;
    
    // Generate lines for each slot boundary (0 to SLOT_COUNT)
    for (let slotIndex = 0; slotIndex <= SLOT_COUNT; slotIndex++) {
      const left = slotIndex * slotWidth;
      const isHour = slotIndex % 4 === 0; // Full hour marker (every 4 slots on 15-min grid)
      lines.push({
        left,
        isHour,
        slotIndex,
      });
    }
    
    return lines;
  }, [totalWidth]);

  return (
    <div className="absolute inset-0 pointer-events-none z-0">
      {/* Grid lines - hour and half-hour separators */}
      {gridLines.map((line, index) => {
        const slotMinutes = line.slotIndex * SLOT_MINUTES;
        const lineHour = WORKDAY_START_HOUR + Math.floor(slotMinutes / 60);
        const isPast = lineHour < currentHour;
        
        return (
          <div
            key={index}
            className={cn(
              "absolute top-0 bottom-0 pointer-events-none",
              isPast && "opacity-70" // Slightly reduce contrast of past hours
            )}
            style={{
              left: `${line.left}px`,
              width: '1px',
              // Hour separators: stronger (0.08 opacity)
              // Half-hour separators: lighter (0.04 opacity)
              borderLeft: line.isHour 
                ? '1px solid rgba(255, 255, 255, 0.08)'
                : '1px solid rgba(255, 255, 255, 0.04)',
            }}
          />
        );
      })}
    </div>
  );
}
