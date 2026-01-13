import { Badge } from '@/components/ui';

export type JobAddress = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
};

export function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    unassigned: { label: 'Unassigned', variant: 'muted' },
    scheduled: { label: 'Scheduled', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'gold' },
    completed: { label: 'Completed', variant: 'default' },
  };

  const config = statusConfig[status] || {
    label: status,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function formatAddress(job: JobAddress): string {
  const parts = [job.addressLine1, job.addressLine2, job.suburb, job.state, job.postcode].filter(Boolean);
  return parts.join(', ') || 'Site address not provided';
}

export function buildMapsUrl(job: JobAddress): string | null {
  const address = [
    job.addressLine1,
    job.addressLine2,
    job.suburb,
    job.state,
    job.postcode,
    job.country,
  ]
    .filter(Boolean)
    .join(', ')
    .trim();

  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
