"use client";

import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InfoTooltipProps {
  label?: string;
  content: React.ReactNode;
  className?: string;
}

export default function InfoTooltip({ label = 'More information', content, className }: InfoTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const describedBy = open ? id : undefined;

  return (
    <span
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-describedby={describedBy}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary transition hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <div
        id={id}
        role="tooltip"
        aria-hidden={!open}
        className={cn(
          'pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-white/10 bg-bg-section/95 p-3 text-xs text-text-secondary shadow-lift backdrop-blur-sm',
          'transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0'
        )}
      >
        {content}
      </div>
    </span>
  );
}
