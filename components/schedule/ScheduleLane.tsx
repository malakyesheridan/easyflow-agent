'use client';

import { ReactNode } from 'react';

interface ScheduleLaneProps {
  label: string;
  children: ReactNode;
  height?: number;
}

export default function ScheduleLane({ label, children, height = 80 }: ScheduleLaneProps) {
  return (
    <div className="relative border-b border-border-subtle" style={{ height: `${height}px` }}>
      {/* Lane Label - Sticky */}
      <div className="absolute left-0 top-0 bottom-0 w-20 flex items-center px-4 bg-bg-section border-r border-border-subtle z-10">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
      </div>
      
      {/* Lane Content Area */}
      <div className="relative h-full" style={{ marginLeft: '80px' }}>
        {children}
      </div>
    </div>
  );
}

