'use client';

import Badge from '@/components/ui/Badge';
import type { JobProgressStatus } from '@/lib/validators/jobs';

function toLabel(status: JobProgressStatus): string {
  if (status === 'not_started') return '0%';
  if (status === 'half_complete') return '50%';
  if (status === 'completed') return '100%';
  return 'In progress';
}

export default function JobProgressBadge({
  status,
  percent,
}: {
  status?: JobProgressStatus | null;
  percent?: number | null;
}) {
  if (percent === null) {
    return <Badge variant="muted">—</Badge>;
  }
  if (typeof percent === 'number' && Number.isFinite(percent)) {
    const clamped = Math.max(0, Math.min(100, percent));
    const label = `${Math.round(clamped)}%`;
    const variant = clamped >= 100 ? 'default' : clamped > 0 ? 'gold' : 'muted';
    return <Badge variant={variant}>{label}</Badge>;
  }

  const safe = (status ?? 'not_started') as JobProgressStatus;
  const label = toLabel(safe);
  const variant =
    safe === 'completed' ? 'default' : safe === 'half_complete' ? 'gold' : safe === 'in_progress' ? 'default' : 'muted';

  return <Badge variant={variant}>{label}</Badge>;
}
