'use client';

import { useMemo } from 'react';
import type { Job } from '@/db/schema/jobs';
import { cn } from '@/lib/utils';

interface TimeSlotGridProps {
  totalWidth: number;
  pxPerMinute: number;
  totalMinutes: number;
  jobs?: Array<{ job: Job; left: number; width: number; top: number }>;
  crewId: string;
  orgId: string;
}

/**
 * TimeSlotGrid - Visual grid only, no drop handling
 * Drop handling is now in CrewLane component
 */
export default function TimeSlotGrid({ 
  totalWidth, 
  pxPerMinute, 
  totalMinutes, 
  jobs = [],
  crewId,
  orgId,
}: TimeSlotGridProps) {
  // Calculate current hour for past/future distinction
  const now = new Date();
  const currentHour = now.getHours();
  
  // Create time slots (30-minute intervals) - visual only, no drop handling
  const timeSlots = useMemo(() => {
    const slots: Array<{ left: number; width: number; startMinute: number }> = [];
    const slotWidth = totalMinutes > 0 ? (totalWidth / totalMinutes) * 30 : 30 * pxPerMinute; // 30 minutes per slot
    
    for (let minute = 0; minute < totalMinutes; minute += 30) {
      const left = minute * pxPerMinute;
      slots.push({
        left,
        width: slotWidth,
        startMinute: minute,
      });
    }
    
    return slots;
  }, [totalWidth, pxPerMinute, totalMinutes]);

  // Check if a time slot is occupied by any job (for visual indication only)
  const isSlotOccupied = (slotLeft: number, slotWidth: number) => {
    return jobs.some(({ left, width }) => {
      // Check if job overlaps with this slot
      const jobEnd = left + width;
      const slotEnd = slotLeft + slotWidth;
      return left < slotEnd && jobEnd > slotLeft;
    });
  };

  return (
    <div className="absolute inset-0 pointer-events-none">
      {timeSlots.map((slot, index) => {
        const occupied = isSlotOccupied(slot.left, slot.width);
        const slotHour = 6 + Math.floor(slot.startMinute / 60);
        const isPast = slotHour < currentHour;
        
        return (
          <div
            key={index}
            className={cn(
              "absolute top-0 bottom-0",
              isPast && !occupied && "opacity-60" // Reduce contrast of past hours
            )}
            style={{
              left: `${slot.left}px`,
              width: `${slot.width}px`,
            }}
          />
        );
      })}
    </div>
  );
}
