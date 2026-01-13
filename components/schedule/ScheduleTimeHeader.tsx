'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_COUNT } from './scheduleConstants';

interface ScheduleTimeHeaderProps {}

export default function ScheduleTimeHeader({}: ScheduleTimeHeaderProps = {}) {
  // Get current hour for emphasis
  const now = new Date();
  const currentHour = now.getHours();

  // Generate hour labels - one per hour, spanning 2 columns
  // 18:00 is a boundary label at the end, not an extra column
  const hourLabels = useMemo(() => {
    const labels: Array<{ hour: number; startCol: number; endCol: number }> = [];
    for (let hour = WORKDAY_START_HOUR; hour < WORKDAY_END_HOUR; hour++) {
      const startCol = (hour - WORKDAY_START_HOUR) * 4; // Every 4 slots (15-minute grid)
      labels.push({ hour, startCol, endCol: startCol + 4 });
    }
    return labels;
  }, []);

  return (
    <div className="time-header bg-bg-section border-b border-border-subtle pointer-events-none">
      <div className="flex">
        {/* Crew label spacer */}
        <div className="w-48 flex-shrink-0 border-r border-border-subtle" />
        {/* Time header - 48-column CSS grid matching lane grid (15-minute increments) */}
        <div 
          className="relative pointer-events-none" 
          style={{ 
            height: '44px',
            display: 'grid',
            gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))`,
            width: '100%',
            minWidth: 0,
          }}
        >
          {/* Hour labels - spanning 2 columns each */}
          {hourLabels.map(({ hour, startCol, endCol }) => {
            const isPast = hour < currentHour;
            const isCurrent = hour === currentHour;
            
            return (
              <div
                key={hour}
                className={cn(
                  "flex items-center justify-start text-xs px-2 pointer-events-none",
                  isCurrent
                    ? "text-text-secondary font-semibold"
                    : isPast
                    ? "text-text-secondary/60 font-medium"
                    : "text-text-secondary font-medium"
                )}
                style={{
                  gridColumn: `${startCol + 1} / ${endCol + 1}`, // Span 2 columns (1-indexed)
                  borderRight: '1px solid rgba(255, 255, 255, 0.08)', // Hour separator
                }}
              >
                {`${hour.toString().padStart(2, '0')}:00`}
              </div>
            );
          })}
          {/* 18:00 boundary label - positioned at the end */}
          <div
            className={cn(
              "flex items-center justify-end text-xs px-2 pointer-events-none",
              currentHour >= WORKDAY_END_HOUR
                ? "text-text-secondary font-semibold"
                : "text-text-secondary font-medium"
            )}
            style={{
              gridColumn: `${SLOT_COUNT} / ${SLOT_COUNT + 1}`, // Right edge
            }}
          >
            18:00
          </div>
        </div>
      </div>
    </div>
  );
}
