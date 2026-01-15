"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const describedBy = open ? id : undefined;

  const portalTarget = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return document.body;
  }, []);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    const rect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 12;

    const fitsBelow = rect.bottom + 8 + tooltipRect.height < viewportHeight - padding;
    const nextPlacement: 'top' | 'bottom' = fitsBelow ? 'bottom' : 'top';
    const top = fitsBelow
      ? rect.bottom + 8
      : Math.max(padding, rect.top - 8 - tooltipRect.height);
    const center = rect.left + rect.width / 2;
    const minLeft = tooltipRect.width / 2 + padding;
    const maxLeft = viewportWidth - tooltipRect.width / 2 - padding;
    const left = Math.min(maxLeft, Math.max(minLeft, center));

    setPlacement(nextPlacement);
    setPosition({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handle = () => updatePosition();
    handle();
    const raf = requestAnimationFrame(handle);
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handle, true);
      window.removeEventListener('resize', handle);
    };
  }, [open, updatePosition]);

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
        ref={anchorRef}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {portalTarget && createPortal(
        <div
          id={id}
          role="tooltip"
          aria-hidden={!open}
          ref={tooltipRef}
          className={cn(
            'pointer-events-none fixed z-[9999] w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-white/10 bg-bg-section/95 p-3 text-xs text-text-secondary shadow-lift backdrop-blur-sm',
            'transition-opacity duration-150',
            open ? 'opacity-100' : 'opacity-0',
            placement === 'top' ? 'origin-bottom' : 'origin-top',
            '-translate-x-1/2'
          )}
          style={{ top: position.top, left: position.left }}
        >
          {content}
        </div>,
        portalTarget
      )}
    </span>
  );
}
