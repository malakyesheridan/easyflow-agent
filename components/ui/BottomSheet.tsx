'use client';

import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import Button from '@/components/ui/Button';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  hideCloseButton?: boolean;
}

export default function BottomSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  hideCloseButton = false,
}: BottomSheetProps) {
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(onClose, isMobile);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-6">
        <div
          className={cn(
            'w-full bg-bg-base border border-border-subtle',
            isMobile ? 'rounded-t-2xl max-h-[92vh] overflow-y-auto' : 'max-w-2xl rounded-lg',
            className
          )}
          {...swipe}
        >
          <div className="p-4 md:p-6 space-y-4">
            {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
            {(title || description || !hideCloseButton) && (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {title && (
                    <h3 className="text-lg font-semibold text-text-primary truncate">{title}</h3>
                  )}
                  {description && (
                    <p className="text-xs text-text-tertiary mt-1">{description}</p>
                  )}
                </div>
                {!hideCloseButton && (
                  <Button variant="secondary" size="sm" onClick={onClose}>
                    Close
                  </Button>
                )}
              </div>
            )}
            {children}
            {footer && <div className="pt-3 border-t border-border-subtle">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
