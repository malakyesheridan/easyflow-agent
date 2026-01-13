'use client';

import Button from '@/components/ui/Button';

export default function ScheduleMobileAction() {
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        if (typeof window === 'undefined') return;
        window.dispatchEvent(new CustomEvent('schedule:today'));
      }}
    >
      Today
    </Button>
  );
}
