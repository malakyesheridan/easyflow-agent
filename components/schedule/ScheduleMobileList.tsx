'use client';

import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import type { Job } from '@/db/schema/jobs';
import { Card, Badge } from '@/components/ui';
import Button from '@/components/ui/Button';
import { WORKDAY_START_HOUR } from '@/components/schedule/scheduleConstants';
import { buildFullAddress, getShortAddress } from '@/lib/utils/jobAddress';

function formatScheduleTime(minutesFromStart: number): string {
  const totalMinutes = WORKDAY_START_HOUR * 60 + minutesFromStart;
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    unassigned: { label: 'Unassigned', variant: 'muted' },
    scheduled_unassigned: { label: 'Unassigned', variant: 'muted' },
    scheduled_assigned: { label: 'Assigned', variant: 'default' },
    scheduled: { label: 'Assigned', variant: 'default' },
    in_progress: { label: 'In progress', variant: 'gold' },
    completed: { label: 'Completed', variant: 'muted' },
    cancelled: { label: 'Blocked', variant: 'muted' },
    blocked: { label: 'Blocked', variant: 'muted' },
  };
  const config = statusConfig[status] || { label: status.replace('_', ' '), variant: 'default' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function ScheduleMobileList({
  assignments,
  onJobClick,
}: {
  assignments: ScheduleAssignmentWithJob[];
  onJobClick: (job: Job) => void;
}) {
  const sortedAssignments = [...assignments].sort((a, b) => a.startMinutes - b.startMinutes);

  if (sortedAssignments.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">No jobs scheduled for this day.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {sortedAssignments.map((assignment) => {
        const timeLabel = `${formatScheduleTime(assignment.startMinutes)} - ${formatScheduleTime(
          assignment.endMinutes
        )}`;
        const mapsAddress = buildFullAddress(assignment.job);
        const addressLabel = mapsAddress || getShortAddress(assignment.job);
        const mapsUrl = mapsAddress
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsAddress)}`
          : null;
        const scheduleStatus = assignment.crewId
          ? assignment.job.status === 'unassigned' || assignment.job.status === 'scheduled'
            ? 'scheduled_assigned'
            : assignment.job.status
          : 'scheduled_unassigned';

        return (
          <Card
            key={assignment.id}
            className="p-4 space-y-3 transition-shadow"
            role="button"
            tabIndex={0}
            onClick={() => onJobClick(assignment.job)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onJobClick(assignment.job);
              }
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-text-primary truncate">{assignment.job.title}</p>
                <p className="text-xs text-text-tertiary mt-1 truncate">{addressLabel}</p>
              </div>
              <StatusBadge status={scheduleStatus} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-bg-section px-2 py-0.5 text-xs text-text-tertiary">{timeLabel}</span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!mapsUrl}
                onClick={(e) => {
                  e.stopPropagation();
                  if (mapsUrl) window.open(mapsUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                Navigate
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
