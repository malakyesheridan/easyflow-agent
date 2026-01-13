'use client';

import { useRouter } from 'next/navigation';
import type { Job } from '@/db/schema/jobs';
import type { Task } from '@/db/schema/tasks';
import { Card, Badge, Button } from '@/components/ui';
import JobProgressBadge from '@/components/jobs/JobProgressBadge';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { defaultVocabulary } from '@/lib/org/orgConfig';
import { getJobTypeLabel } from '@/lib/org/jobTypes';
import { getRequiredTaskProgress } from '@/lib/utils/taskProgress';

interface UnassignedJobCardProps {
  job: Job;
  tasks: Task[];
  isLoadingTasks: boolean;
}

/**
 * Priority badge component
 */
function PriorityBadge({ priority }: { priority: string }) {
  const priorityConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    low: { label: 'Low', variant: 'muted' },
    normal: { label: 'Normal', variant: 'default' },
    high: { label: 'High', variant: 'gold' },
    urgent: { label: 'Urgent', variant: 'gold' },
  };

  const config = priorityConfig[priority] || {
    label: priority,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    unassigned: { label: 'Unassigned', variant: 'muted' },
    scheduled: { label: 'Scheduled', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'default' },
  };

  const config = statusConfig[status] || {
    label: status,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * Format date for display
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return 'Not set';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format relative time
 */
function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return 'Never';

  const now = new Date();
  const updated = new Date(date);
  const diffMs = now.getTime() - updated.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(date);
}

function toSentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export default function UnassignedJobCard({ job, tasks, isLoadingTasks }: UnassignedJobCardProps) {
  const router = useRouter();
  const { config } = useOrgConfig();
  const vocabulary = config?.vocabulary ?? defaultVocabulary;
  const workStepSingular = toSentenceCase(vocabulary.workStepSingular);
  const workStepPlural = toSentenceCase(vocabulary.workStepPlural);
  const jobTypeLabel = getJobTypeLabel(job, config, vocabulary.jobSingular);

  // Calculate work step summary
  const { requiredTotal: criticalCount, requiredCompleted: completedCount, percent } = getRequiredTaskProgress(tasks);

  // Determine primary action button label
  const getPrimaryActionLabel = (): string => {
    if (!job.scheduledStart) {
      return `Assign & ${vocabulary.scheduleLabel}`;
    }
    // If scheduled but no crew (we'll check this later when crewId exists)
    return `Assign ${vocabulary.crewPlural}`;
  };

  const handlePrimaryAction = () => {
    // Navigate to job detail with a query param to show unassigned banner
    router.push(`/jobs/${job.id}?from=unassigned`);
  };

  return (
    <Card className="hover:shadow-lift transition-shadow">
      {/* Top Row */}
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-bold text-text-primary text-lg flex-1 pr-2">
          {job.title}
        </h3>
        {job.priority === 'high' || job.priority === 'urgent' ? (
          <PriorityBadge priority={job.priority} />
        ) : null}
      </div>

      {/* Middle Section */}
      <div className="space-y-3 mb-4">
        {/* Site Suburb */}
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <span>-</span>
          <span>{job.suburb || 'Site location not specified'}</span>
        </div>

        {/* Job Type */}
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <span>-</span>
          <span>{jobTypeLabel}</span>
        </div>

        {/* Work Step Summary */}
        <div className="flex items-center gap-2 text-text-secondary text-sm">
          <span>-</span>
          {isLoadingTasks ? (
            <span>Loading {workStepPlural}...</span>
          ) : criticalCount > 0 ? (
            <span>
              {criticalCount} critical {criticalCount !== 1 ? workStepPlural : workStepSingular}
              {completedCount > 0 && ` - ${completedCount} completed`}
            </span>
          ) : (
            <span>No {workStepPlural} defined</span>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
        <div className="flex items-center gap-2">
          <StatusBadge status={job.status} />
          <JobProgressBadge status={job.progressStatus} percent={isLoadingTasks ? undefined : percent} />
          <span className="text-xs text-text-tertiary">
            Updated {formatRelativeTime(job.updatedAt)}
          </span>
        </div>
      </div>

      {/* Primary Action Button */}
      <div className="mt-4">
        <Button
          onClick={handlePrimaryAction}
          variant="primary"
          className="w-full"
        >
          {getPrimaryActionLabel()}
        </Button>
      </div>
    </Card>
  );
}
