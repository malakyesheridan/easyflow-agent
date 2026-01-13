'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import Card from '@/components/ui/Card';

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
  hideActionsWhenCollapsed?: boolean;
  forceOpen?: boolean;
  children: ReactNode;
}

export default function CollapsibleSection({
  title,
  description,
  summary,
  defaultOpen = true,
  storageKey,
  actions,
  className,
  contentClassName,
  hideActionsWhenCollapsed = false,
  forceOpen = false,
  children,
}: CollapsibleSectionProps) {
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (hasInitialized) return;
    if (!storageKey) {
      setHasInitialized(true);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        setIsOpen(stored === 'true');
      }
    } catch {
      // ignore storage errors
    } finally {
      setHasInitialized(true);
    }
  }, [hasInitialized, storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, String(isOpen));
    } catch {
      // ignore storage errors
    }
  }, [isOpen, storageKey]);

  useEffect(() => {
    const node = contentRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (!node) return;
    node.inert = !isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (forceOpen) {
      setIsOpen(true);
    }
  }, [forceOpen]);

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <ChevronDown
              className={cn('h-4 w-4 text-text-tertiary transition-transform', isOpen ? 'rotate-0' : '-rotate-90')}
            />
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          </div>
          {isOpen && description ? (
            <p className="text-xs text-text-tertiary mt-1">{description}</p>
          ) : null}
          {!isOpen && summary ? (
            <p className="text-xs text-text-secondary mt-1 truncate">{summary}</p>
          ) : null}
        </button>
        {actions ? (
          <div
            className={cn(
              'flex items-center gap-2',
              !isOpen && hideActionsWhenCollapsed ? 'opacity-0 pointer-events-none' : ''
            )}
          >
            {actions}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-in-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div
          id={contentId}
          ref={contentRef}
          aria-hidden={!isOpen}
          className={cn(
            'overflow-hidden transition-opacity duration-200',
            isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
            contentClassName ?? 'mt-4'
          )}
        >
          {children}
        </div>
      </div>
    </Card>
  );
}
