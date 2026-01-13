'use client';

import { useMemo } from 'react';
import type { Job } from '@/db/schema/jobs';
import { Card, Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { isUnscheduledJob } from '@/lib/utils/jobScheduling';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { defaultVocabulary } from '@/lib/org/orgConfig';
import { getJobTypeLabel } from '@/lib/org/jobTypes';

interface UnassignedJobsPanelProps {
  jobs: Job[];
  orgId: string;
  onJobScheduled?: (jobId: string) => void;
  onJobClick?: (job: Job) => void;
  onUnscheduleJob?: (jobId: string) => void;
  onStartDrag?: (jobId: string) => void;
  draggingJob?: Job | null;
  onScheduleClick?: () => void;
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

export default function UnassignedJobsPanel({ jobs, orgId, onJobScheduled, onJobClick, onUnscheduleJob, onStartDrag, draggingJob, onScheduleClick }: UnassignedJobsPanelProps) {
  const { config } = useOrgConfig();
  const vocabulary = config?.vocabulary ?? defaultVocabulary;
  // PHASE B: Use shared utility to determine unscheduled work
  // Jobs appear if: status is unassigned AND no active scheduled assignment for current day
  const unscheduledJobs = useMemo(() => {
    const today = new Date();
    return jobs.filter((job) => isUnscheduledJob(job, today));
  }, [jobs]);

  const handleViewJob = (job: Job) => {
    if (onJobClick) {
      onJobClick(job);
    }
  };

  /**
   * Get job accent color class with priority enhancement
   */
  const getJobAccentColor = (priority: string) => {
    const isHighPriority = priority === 'high' || priority === 'urgent';
    return isHighPriority ? 'border-l-accent-gold/80' : 'border-l-accent-gold/60';
  };

  // Sort jobs by creation date (oldest first) for priority cues
  const sortedJobs = useMemo(() => {
    return [...unscheduledJobs].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
  }, [unscheduledJobs]);

  return (
    <Card 
      className="sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto"
    >
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-text-primary mb-1">Unscheduled Work</h3>
          <p className="text-sm text-text-secondary">
            Jobs ready to be scheduled for today. Drag onto a crew or click to schedule.
          </p>
        </div>

        {unscheduledJobs.length === 0 ? (
          <p className="text-sm text-text-tertiary text-center py-8">
            No unscheduled work — all jobs are scheduled for today
          </p>
        ) : (
          <div className="space-y-3">
            {unscheduledJobs.map((job, index) => {
              const isOldest = index === 0;
              const isHighPriority = job.priority === 'high' || job.priority === 'urgent';

              const isDragging = draggingJob?.id === job.id;
              const jobTypeLabel = getJobTypeLabel(job, config, vocabulary.jobSingular);

              return (
                <Card
                  key={job.id}
                  onMouseDown={(e) => {
                    // 3️⃣ Explicitly block completed jobs - no drag
                    if (job.status === 'completed') {
                      e.preventDefault();
                      return;
                    }
                    e.preventDefault();
                    if (onStartDrag) {
                      onStartDrag(job.id);
                    }
                  }}
                  className={cn(
                    "p-4 border-l-4 transition-all",
                    job.status === 'completed' ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing',
                    getJobAccentColor(job.priority),
                    isOldest && "border-border-subtle/60", // Stronger border for oldest
                    isDragging && "opacity-60"
                  )}
                >
                <div className="space-y-2">
                  <div>
                    <h4 className="font-bold text-text-primary text-sm mb-1">
                      {job.title}
                    </h4>
                    <p className="text-xs text-text-secondary">
                      {job.suburb || 'No suburb'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-text-tertiary">
                      {jobTypeLabel}
                    </span>
                    <PriorityBadge priority={job.priority} />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleViewJob(job)}
                      className="flex-1 text-xs py-1.5"
                    >
                      View
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (onScheduleClick) {
                          onScheduleClick();
                        } else {
                          handleViewJob(job);
                        }
                      }}
                      className="flex-1 text-xs py-1.5"
                    >
                      Schedule
                    </Button>
                  </div>
                </div>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

