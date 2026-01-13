'use client';

/**
 * DO NOT READ job.scheduledStart / scheduledEnd directly.
 * Use getDisplaySchedule(job, assignments) for schedule display.
 * 
 * Note: This table currently shows a simplified "Scheduled" column.
 * For full schedule details, view the job detail page.
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { Card, Badge } from '@/components/ui';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import QuickActionsMenu from '@/components/quick-actions/QuickActionsMenu';
import JobStatusSelect from './JobStatusSelect';
import { getDisplaySchedule } from '@/lib/utils/scheduleTime';
import JobProgressBadge from '@/components/jobs/JobProgressBadge';
import useIsMobile from '@/hooks/useIsMobile';

interface JobsTableProps {
  jobs: Job[];
  assignments?: ScheduleAssignmentWithJob[]; // Assignments for display schedule
}

/**
 * Priority badge component
 */
function PriorityBadge({ priority }: { priority: string }) {
  const priorityConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    low: { label: 'Low', variant: 'muted' },
    normal: { label: 'Normal', variant: 'default' },
    high: { label: 'High', variant: 'default' },
    urgent: { label: 'Urgent', variant: 'gold' },
  };

  const config = priorityConfig[priority] || {
    label: priority,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    unassigned: { label: 'Unassigned', variant: 'muted' },
    scheduled: { label: 'Scheduled', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'gold' },
    completed: { label: 'Completed', variant: 'default' },
  };
  const config = statusConfig[status] || { label: status, variant: 'default' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * Format date for display
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function JobsTable({ jobs: initialJobs, assignments = [] }: JobsTableProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [taskSummaryByJobId, setTaskSummaryByJobId] = useState<
    Record<
      string,
      {
        total: number;
        completedTotal: number;
        percent: number | null;
        requiredTotal: number;
        requiredCompleted: number;
        requiredPercent: number | null;
      }
    >
  >({});
  const [isLoadingTaskSummary, setIsLoadingTaskSummary] = useState(false);
  const [completingJobId, setCompletingJobId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [showSkeleton, setShowSkeleton] = useState(isMobile);

  // Sync with prop changes (e.g., from server refresh)
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    if (!isMobile) return;
    setShowSkeleton(true);
    const id = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(id);
  }, [isMobile]);

  const handleRowClick = (jobId: string) => {
    router.push(`/jobs/${jobId}`);
  };

  const handleJobStatusChange = (updatedJob: Job) => {
    setJobs((prevJobs) =>
      prevJobs.map((job) => (job.id === updatedJob.id ? updatedJob : job))
    );
  };

  // Filter to only show active jobs (non-completed)
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => job.status !== 'completed');
  }, [jobs]);

  // Fetch work-step progress summaries for all visible jobs (single request)
  useEffect(() => {
    const orgId = filteredJobs[0]?.orgId;
    if (!orgId || filteredJobs.length === 0) {
      setTaskSummaryByJobId({});
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ orgId });
    filteredJobs.forEach((j) => params.append('jobId', j.id));

    setIsLoadingTaskSummary(true);
    fetch(`/api/tasks/summary?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok || !Array.isArray(json.data)) return;
        const next: Record<
          string,
          {
            total: number;
            completedTotal: number;
            percent: number | null;
            requiredTotal: number;
            requiredCompleted: number;
            requiredPercent: number | null;
          }
        > = {};
        json.data.forEach((row: any) => {
          if (!row?.jobId) return;
          const total = Number(row.total ?? 0);
          const completedTotal = Number(row.completedTotal ?? 0);
          next[String(row.jobId)] = {
            total,
            completedTotal,
            percent: typeof row.percent === 'number' ? row.percent : total > 0 ? (completedTotal / total) * 100 : null,
            requiredTotal: Number(row.requiredTotal ?? 0),
            requiredCompleted: Number(row.requiredCompleted ?? 0),
            requiredPercent:
              typeof row.requiredPercent === 'number'
                ? row.requiredPercent
                : Number(row.requiredTotal ?? 0) > 0
                  ? (Number(row.requiredCompleted ?? 0) / Number(row.requiredTotal ?? 0)) * 100
                  : null,
          };
        });
        setTaskSummaryByJobId(next);
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
      })
      .finally(() => setIsLoadingTaskSummary(false));

    return () => controller.abort();
  }, [filteredJobs]);

  const markJobComplete = async (job: Job) => {
    if (completingJobId) return;
    setCompletingJobId(job.id);
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, orgId: job.orgId, status: 'completed' }),
      });
      const json = await res.json();
      if (!json?.ok) {
        const message = json?.error?.message || 'Failed to mark job as complete';
        alert(message);
        return;
      }

      setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, status: 'completed' } : j)));
      router.refresh();
    } catch {
      alert('Network error: Failed to mark job as complete');
    } finally {
      setCompletingJobId(null);
    }
  };

  if (showSkeleton && isMobile) {
    return (
      <div className="md:hidden space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 w-2/3 rounded bg-bg-section/80" />
            <div className="mt-3 h-3 w-1/2 rounded bg-bg-section/80" />
            <div className="mt-4 h-8 w-full rounded bg-bg-section/80" />
          </Card>
        ))}
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <p className="text-center text-text-secondary">No jobs found</p>
      </Card>
    );
  }

  return (
    <>
      {filteredJobs.length === 0 ? (
        <Card>
          <p className="text-center text-text-secondary">No active jobs found</p>
        </Card>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {filteredJobs.map((job) => {
              const schedule = getDisplaySchedule(job, assignments);
              const scheduleLabel = (() => {
                if (!schedule || schedule.length === 0) return 'Not scheduled';
                const first = schedule[0];
                const timeStr = `${first.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${first.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                return schedule.length > 1 ? `${timeStr} (+${schedule.length - 1})` : timeStr;
              })();
              const address = [job.addressLine1, job.suburb].filter(Boolean).join(', ') || job.suburb || '-';

              return (
                <Card
                  key={job.id}
                  className={cn(
                    'p-4 transition-shadow hover:shadow-lift',
                    taskSummaryByJobId[job.id]?.total > 0 &&
                      taskSummaryByJobId[job.id]?.completedTotal === taskSummaryByJobId[job.id]?.total &&
                      'bg-accent-gold/5'
                  )}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleRowClick(job.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleRowClick(job.id);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-text-primary truncate">{job.title}</p>
                        <p className="text-xs text-text-tertiary mt-1 truncate">{address}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={job.status} />
                        <JobProgressBadge
                          status={job.progressStatus}
                          percent={isLoadingTaskSummary ? undefined : taskSummaryByJobId[job.id]?.percent}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <PriorityBadge priority={job.priority} />
                      <span className="rounded-full bg-bg-section px-2 py-0.5 text-text-tertiary">{scheduleLabel}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card padding="none" className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-section">
                  <th className="h-12 px-6 text-left align-middle font-medium text-text-secondary">
                    Title
                  </th>
                  <th className="h-12 px-6 text-left align-middle font-medium text-text-secondary">
                    Status
                  </th>
                  <th className="h-12 px-6 text-left align-middle font-medium text-text-secondary">
                    Priority
                  </th>
                  <th className="h-12 px-6 text-left align-middle font-medium text-text-secondary">
                    Suburb
                  </th>
                  <th className="h-12 px-6 text-left align-middle font-medium text-text-secondary">
                    Schedule
                  </th>
                  <th className="h-12 px-6 text-right align-middle font-medium text-text-secondary w-12">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr
                    key={job.id}
                    className={cn(
                      'border-b border-border-subtle transition-colors hover:bg-bg-section/50',
                      taskSummaryByJobId[job.id]?.total > 0 &&
                        taskSummaryByJobId[job.id]?.completedTotal === taskSummaryByJobId[job.id]?.total &&
                        'bg-accent-gold/5 hover:bg-accent-gold/10'
                    )}
                  >
                    <td
                      onClick={() => handleRowClick(job.id)}
                      className="p-4 align-middle font-medium text-text-primary cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{job.title}</span>
                        <JobProgressBadge
                          status={job.progressStatus}
                          percent={isLoadingTaskSummary ? undefined : taskSummaryByJobId[job.id]?.percent}
                        />
                      </div>
                    </td>
                    <td
                      className="p-4 align-middle"
                      onClick={(e) => {
                        // Don't navigate if clicking on the select
                        if ((e.target as HTMLElement).closest('select')) {
                          return;
                        }
                        handleRowClick(job.id);
                      }}
                    >
                      <JobStatusSelect job={job} onStatusChange={handleJobStatusChange} />
                    </td>
                    <td
                      onClick={() => handleRowClick(job.id)}
                      className="p-4 align-middle cursor-pointer"
                    >
                      <PriorityBadge priority={job.priority} />
                    </td>
                    <td
                      onClick={() => handleRowClick(job.id)}
                      className="p-4 align-middle text-text-secondary cursor-pointer"
                    >
                      {job.suburb || '-'}
                    </td>
                    {/* IMPORTANT:
                        Do not read job.scheduledStart / scheduledEnd here.
                        Schedule display must come from assignments via getDisplaySchedule(). */}
                    <td
                      onClick={() => handleRowClick(job.id)}
                      className="p-4 align-middle text-text-secondary cursor-pointer"
                    >
                      {(() => {
                        const schedule = getDisplaySchedule(job, assignments);
                        if (!schedule || schedule.length === 0) return <span className="text-text-tertiary">Not scheduled</span>;
                        const first = schedule[0];
                        const timeStr = `${first.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} – ${first.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                        if (schedule.length > 1) {
                          return `${timeStr} (+${schedule.length - 1} more)`;
                        }
                        return timeStr;
                      })()}
                    </td>
                    <td
                      className="p-4 align-middle text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-2">
                        {taskSummaryByJobId[job.id]?.total > 0 &&
                          taskSummaryByJobId[job.id]?.completedTotal === taskSummaryByJobId[job.id]?.total && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={completingJobId === job.id}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                markJobComplete(job);
                              }}
                            >
                              {completingJobId === job.id ? 'Completing...' : 'Mark as complete'}
                            </Button>
                          )}
                        <QuickActionsMenu entity={job} entityType="job" orgId={job.orgId} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
