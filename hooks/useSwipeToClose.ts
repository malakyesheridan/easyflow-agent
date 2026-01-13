import { useMemo, useRef } from 'react';

export default function useSwipeToClose(onClose: () => void, enabled = true, threshold = 80) {
  const startYRef = useRef<number | null>(null);

  return useMemo(
    () => ({
      onTouchStart: (e: React.TouchEvent) => {
        if (!enabled) return;
        startYRef.current = e.touches[0]?.clientY ?? null;
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!enabled) return;
        const start = startYRef.current;
        if (start === null) return;
        const current = e.touches[0]?.clientY ?? start;
        if (current - start > threshold) {
          startYRef.current = null;
          onClose();
        }
      },
      onTouchEnd: () => {
        startYRef.current = null;
      },
    }),
    [enabled, onClose, threshold]
  );
}
