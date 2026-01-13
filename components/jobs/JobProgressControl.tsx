'use client';

import { cn } from '@/lib/utils';
import type { JobProgressStatus } from '@/lib/validators/jobs';

const OPTIONS: Array<{ value: JobProgressStatus; label: string; short: string }> = [
  { value: 'not_started', label: 'Not started', short: '0%' },
  { value: 'in_progress', label: 'In progress', short: 'In progress' },
  { value: 'half_complete', label: 'Half complete', short: '50%' },
  { value: 'completed', label: 'Completed', short: '100%' },
];

export default function JobProgressControl(props: {
  value: JobProgressStatus;
  disabled?: boolean;
  onChange: (value: JobProgressStatus) => void;
}) {
  const { value, disabled = false, onChange } = props;

  return (
    <div
      className={cn(
        'inline-flex rounded-lg border border-border-subtle bg-bg-card p-1',
        disabled && 'opacity-60 pointer-events-none'
      )}
      role="group"
      aria-label="Work progress"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
              active
                ? 'bg-accent-gold text-[hsl(var(--primary-foreground))]'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-section'
            )}
            title={opt.label}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
}

