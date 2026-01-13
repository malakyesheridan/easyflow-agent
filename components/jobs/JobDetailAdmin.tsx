'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Job } from '@/db/schema/jobs';
import type { Task } from '@/db/schema/tasks';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import type { JobClientSummary } from '@/lib/queries/job_detail';
import { PageContainer, Card, Button, CollapsibleSection } from '@/components/ui';
import TaskList from '@/components/tasks/TaskList';
import { getDisplaySchedule } from '@/lib/utils/scheduleTime';
import JobProgressControl from '@/components/jobs/JobProgressControl';
import type { JobProgressStatus } from '@/lib/validators/jobs';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { getJobTypeForJob } from '@/lib/org/jobTypes';
import useIsMobile from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { buildMapsUrl, formatAddress, StatusBadge } from '@/components/jobs/jobDetailShared';
import JobContactsCard from '@/components/jobs/JobContactsCard';
import JobPhotosCard from '@/components/jobs/JobPhotosCard';
import JobActivityLogCard from '@/components/jobs/JobActivityLogCard';
import JobMaterialsCard from '@/components/jobs/JobMaterialsCard';
import JobDocumentsCard from '@/components/jobs/JobDocumentsCard';
import JobOrdersCard from '@/components/jobs/JobOrdersCard';
import JobHoursCard from '@/components/jobs/JobHoursCard';
import JobReportsCard from '@/components/jobs/JobReportsCard';
import JobFinancialsCard from '@/components/jobs/JobFinancialsCard';
import JobIntegrationActivityCard from '@/components/jobs/JobIntegrationActivityCard';
import JobAuditLogCard from '@/components/jobs/JobAuditLogCard';
import JobProfitabilityCard from '@/components/jobs/JobProfitabilityCard';
import JobTimeEntriesCard from '@/components/jobs/JobTimeEntriesCard';
import JobProductivityCard from '@/components/jobs/JobProductivityCard';

interface JobDetailProps {
  job: Job;
  orgId: string;
  client?: JobClientSummary | null;
  showUnassignedBanner?: boolean;
  assignments?: ScheduleAssignmentWithJob[]; // PHASE C3: Active schedule assignments
}

export default function JobDetailAdmin({ job, orgId, client = null, showUnassignedBanner = false, assignments = [] }: JobDetailProps) {
  const { config } = useOrgConfig();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [progressStatus, setProgressStatus] = useState<JobProgressStatus>(
    (job.progressStatus as JobProgressStatus) || 'not_started'
  );
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [showMobileSkeleton, setShowMobileSkeleton] = useState(isMobile);

  // Fetch tasks to calculate progress
  useEffect(() => {
    async function fetchTasks() {
      try {
        const response = await fetch(`/api/tasks?orgId=${orgId}&jobId=${job.id}`);
        const data = await response.json();

        if (data.ok) {
          setTasks(data.data);
        }
      } catch (err) {
        console.error('Error fetching tasks:', err);
      } finally {
        setIsLoadingTasks(false);
      }
    }

    fetchTasks();
  }, [job.id, orgId]);

  useEffect(() => {
    if (!isMobile) return;
    setShowMobileSkeleton(true);
    const id = setTimeout(() => setShowMobileSkeleton(false), 250);
    return () => clearTimeout(id);
  }, [isMobile]);

  // Calculate progress
  const requiredTasks = tasks.filter((t) => t.isRequired);
  const completedRequiredTasks = requiredTasks.filter((t) => t.status === 'completed');
  const progressCount = completedRequiredTasks.length;
  const progressTotal = requiredTasks.length;
  const progressPercentage = progressTotal > 0 ? (progressCount / progressTotal) * 100 : 0;
  const canComplete = progressCount === progressTotal && progressTotal > 0;
  const jobType = getJobTypeForJob(job, config);
  const jobTypeLabel = jobType?.label ?? (config?.vocabulary?.jobSingular ?? 'Job');
  const mapsUrl = buildMapsUrl(job);

  const handleStartJob = async () => {
    setIsUpdatingStatus(true);
    setCompletionError(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: job.id,
          orgId: job.orgId,
          status: 'in_progress',
        }),
      });

      const data = await response.json();

      if (data.ok) {
        router.refresh();
        if (isMobile && 'vibrate' in navigator) {
          navigator.vibrate(10);
        }
      } else {
        setCompletionError(data.error.message || 'Failed to start job');
      }
    } catch (error) {
      console.error('Error starting job:', error);
      setCompletionError('Network error: Failed to start job');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleProgressChange = async (next: JobProgressStatus) => {
    if (next === progressStatus) return;
    const previous = progressStatus;
    setProgressStatus(next);
    setProgressError(null);
    setIsUpdatingProgress(true);

    try {
      const response = await fetch('/api/jobs/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          jobId: job.id,
          progressStatus: next,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        setProgressStatus((data.data as Job).progressStatus as JobProgressStatus);
        router.refresh();
        return;
      }

      setProgressStatus(previous);
      setProgressError(data?.error?.message || 'Failed to update work progress');
    } catch (error) {
      console.error('Error updating job progress:', error);
      setProgressStatus(previous);
      setProgressError('Network error: Failed to update work progress');
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  const handleCompleteJob = async () => {
    setIsUpdatingStatus(true);
    setCompletionError(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: job.id,
          orgId: job.orgId,
          status: 'completed',
        }),
      });

      const data = await response.json();

      if (data.ok) {
        router.refresh();
        if (isMobile && 'vibrate' in navigator) {
          navigator.vibrate(10);
        }
      } else {
        // Check if it's a validation error about required tasks
        if (data.error.code === 'VALIDATION_ERROR') {
          setCompletionError('Cannot complete job: All critical work steps must be completed first');
        } else {
          setCompletionError(data.error.message || 'Failed to complete job');
        }
      }
    } catch (error) {
      console.error('Error completing job:', error);
      setCompletionError('Network error: Failed to complete job');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      const response = await fetch(`/api/jobs/${job.id}/duplicate?orgId=${job.orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      if (data.ok && data.data?.job?.id) {
        router.push(`/jobs/${data.data.job.id}`);
        router.refresh();
      } else {
        const errorMsg = data.error?.message || 'Failed to duplicate job';
        console.error('Duplication failed:', data.error);
        alert(errorMsg);
      }
    } catch (error) {
      console.error('Error duplicating job:', error);
      alert('Network error: Failed to duplicate job');
    }
  };

  const handleTaskUpdate = () => {
    // Refetch tasks when they're updated
    fetch(`/api/tasks?orgId=${orgId}&jobId=${job.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setTasks(data.data);
        }
      })
      .catch((err) => console.error('Error refetching tasks:', err));
  };

  const headerContent = (
    <div className="space-y-6">
      {/* Title and Status */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-4 flex-1">
          <h1 className="text-2xl md:text-4xl font-bold text-text-primary">{job.title}</h1>
          <div className="space-y-2">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <p className="text-base md:text-lg text-text-secondary">{formatAddress(job)}</p>
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-accent-gold hover:text-accent-gold/80 transition-colors shrink-0"
                >
                  Open in maps
                </a>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-text-secondary">Status:</span>
              <StatusBadge status={job.status} />
            </div>
            {client && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-text-secondary">Client:</span>
                <Link
                  href={`/jobs/clients/${client.id}`}
                  className="text-sm text-accent-gold hover:text-accent-gold/80 transition-colors"
                >
                  {client.displayName}
                </Link>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-text-secondary">
                {config?.vocabulary?.jobSingular ?? 'Job'} type:
              </span>
              <span className="text-sm text-text-primary">{jobTypeLabel}</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-text-secondary">Work progress:</span>
                <JobProgressControl
                  value={progressStatus}
                  disabled={isUpdatingProgress}
                  onChange={handleProgressChange}
                />
              </div>
              {progressError && (
                <span className="text-xs font-medium text-red-500">{progressError}</span>
              )}
            </div>
          </div>
        </div>
        <div className="hidden md:flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => router.push(`/jobs/${job.id}/edit`)}>
            Edit Job
          </Button>
          <Button variant="secondary" onClick={handleDuplicate}>
            Duplicate Job
          </Button>
        </div>
      </div>

      {/* Primary Action Button */}
      {job.status === 'scheduled' && (
        <div className="pt-4 border-t border-border-subtle">
          <Button
            onClick={handleStartJob}
            disabled={isUpdatingStatus}
            size="lg"
            className="w-full sm:w-auto"
          >
            {isUpdatingStatus ? 'Starting...' : 'Start Job'}
          </Button>
        </div>
      )}

      {job.status === 'in_progress' && (
        <div className="pt-4 border-t border-border-subtle space-y-2">
          <Button
            onClick={handleCompleteJob}
            disabled={isUpdatingStatus || !canComplete}
            size="lg"
            className="w-full sm:w-auto"
          >
            {isUpdatingStatus ? 'Completing...' : 'Mark Job Complete'}
          </Button>
          {!canComplete && (
            <p className="text-sm text-text-secondary">
              Complete all critical {config?.vocabulary?.workStepPlural?.toLowerCase() ?? 'work steps'} before marking job as complete
            </p>
          )}
          {completionError && (
            <p className="text-sm text-destructive">{completionError}</p>
          )}
        </div>
      )}
    </div>
  );

  if (showMobileSkeleton && isMobile) {
    return (
      <PageContainer>
        <div className="md:hidden space-y-4">
          <Card className="animate-pulse">
            <div className="h-5 w-2/3 rounded bg-bg-section/80" />
            <div className="mt-3 h-4 w-1/2 rounded bg-bg-section/80" />
            <div className="mt-4 h-10 w-full rounded bg-bg-section/80" />
          </Card>
          <Card className="animate-pulse">
            <div className="h-4 w-1/3 rounded bg-bg-section/80" />
            <div className="mt-3 h-20 w-full rounded bg-bg-section/80" />
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      className={isMobile ? 'h-screen overflow-hidden' : undefined}
      innerClassName={isMobile ? 'px-4 pt-4 pb-28' : undefined}
    >
      <div
        className={cn(
          isMobile ? 'space-y-6 max-h-[calc(100vh-140px)] overflow-y-auto overscroll-contain pr-1' : 'space-y-8'
        )}
      >
        {/* Back Navigation */}
        <div>
          <button
            onClick={() => {
              router.push('/jobs');
              router.refresh();
            }}
            className="text-sm text-text-secondary hover:text-accent-gold transition-colors inline-flex items-center gap-1"
          >
            &lt; Back to Jobs
          </button>
        </div>

        {/* Unassigned Banner */}
        {showUnassignedBanner && (
          <Card className="bg-accent-gold-muted/10 border border-accent-gold-muted/30">
            <p className="text-sm text-text-secondary">
              This job is currently unassigned
            </p>
          </Card>
        )}

        {/* Job Header - Command Centre */}
        {isMobile ? (
          <CollapsibleSection
            title="Job Overview"
            defaultOpen
            storageKey={`job-detail-${job.id}-overview`}
            className="bg-bg-section border-2 border-border-subtle"
          >
            {headerContent}
          </CollapsibleSection>
        ) : (
          <Card className="bg-bg-section border-2 border-border-subtle">{headerContent}</Card>
        )}

        {/* Progress Summary */}
        {!isLoadingTasks && progressTotal > 0 && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">Progress</h2>
                <span className="text-sm font-medium text-text-secondary">
                  {progressCount} of {progressTotal} required work steps completed
                </span>
              </div>
              {/* Progress Bar */}
              <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-gold transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </Card>
        )}

        {/* Work Steps Section */}
        <TaskList jobId={job.id} orgId={orgId} jobTypeId={job.jobTypeId ?? null} onTaskUpdate={handleTaskUpdate} />

        <JobFinancialsCard orgId={orgId} jobId={job.id} />
        {!isMobile && <JobProfitabilityCard orgId={orgId} job={job} />}

        <JobMaterialsCard orgId={orgId} jobId={job.id} />
        <JobTimeEntriesCard orgId={orgId} jobId={job.id} />
        <JobProductivityCard orgId={orgId} jobId={job.id} />

        <JobContactsCard orgId={orgId} jobId={job.id} />

        <JobPhotosCard orgId={orgId} jobId={job.id} />

        {!isMobile && (
          <>
            <JobDocumentsCard orgId={orgId} jobId={job.id} />
            <JobOrdersCard orgId={orgId} jobId={job.id} />
            <JobHoursCard orgId={orgId} jobId={job.id} />
            <JobReportsCard orgId={orgId} jobId={job.id} />
            <JobActivityLogCard orgId={orgId} jobId={job.id} />
            <JobAuditLogCard orgId={orgId} jobId={job.id} />
            <JobIntegrationActivityCard orgId={orgId} jobId={job.id} />
          </>
        )}

        {isMobile && (
          <CollapsibleSection
            title="Notes"
            defaultOpen={false}
            storageKey={`job-detail-${job.id}-notes`}
          >
            {job.notes ? (
              <p className="text-sm text-text-primary whitespace-pre-wrap">{job.notes}</p>
            ) : (
              <p className="text-sm text-text-secondary">No notes for this job.</p>
            )}
          </CollapsibleSection>
        )}

        {/* Details Section - Collapsed/Secondary */}
        {!isMobile && (
          <CollapsibleSection
            title="Details"
            defaultOpen
            storageKey={`job-detail-${job.id}-details`}
            actions={
              <Button variant="ghost" size="sm" onClick={() => router.push(`/jobs/${job.id}/edit`)}>
                Edit
              </Button>
            }
          >

          {/* Schedule Information - Assignment-first display */}
          {(() => {
            const displaySchedule = getDisplaySchedule(job, assignments);
            
            if (!displaySchedule) {
              return (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-text-secondary mb-2">Schedule</h3>
                  <p className="text-sm text-text-tertiary">Not scheduled</p>
                </div>
              );
            }
            
            const isFromAssignments = assignments.length > 0;
            const headerText = displaySchedule.length > 1 
              ? `Scheduled via Schedule (${displaySchedule.length} crews)` 
              : 'Scheduled via Schedule';
            
            return (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-text-secondary mb-3">
                  {isFromAssignments ? headerText : 'Scheduled (legacy)'}
                </h3>
                <div className="space-y-2">
                  {displaySchedule.map((schedule, index) => {
                    const crewLabel = schedule.crewId 
                      ? `Crew ${schedule.crewId.slice(0, 8)}...` 
                      : 'Unassigned crew';
                    
                    return (
                      <div
                        key={schedule.assignmentId || index}
                        className="p-3 border border-border-subtle rounded-md bg-bg-section/50"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {schedule.date && (
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-text-primary">
                                  {schedule.date.toLocaleDateString('en-US', {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            )}
                            <p className="text-sm text-text-primary">
                              {schedule.start.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })} - {schedule.end.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                            <p className="text-xs text-text-tertiary mt-1">
                              {crewLabel}
                            </p>
                          </div>
                          {schedule.date && (
                            <Link
                              href={`/schedule?date=${schedule.date.toISOString().split('T')[0]}`}
                              className="text-xs text-accent-gold hover:text-accent-gold/80 transition-colors"
                            >
                              View on Schedule
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isFromAssignments && (
                  <p className="text-xs text-text-tertiary mt-3">
                    Note: This job has active scheduled work. Changes here will affect live schedules.
                  </p>
                )}
              </div>
            );
          })()}

          {job.notes && (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-text-secondary mb-2">Notes</h3>
              <p className="text-sm text-text-primary whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}
          </CollapsibleSection>
        )}

        {!isMobile && (
          <Card>
            <h2 className="text-xl font-semibold text-text-primary mb-6">Metrics</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">
                  Estimated {config?.units?.weightUnit ?? 'kg'}
                </h3>
                <p className="text-2xl font-semibold text-text-primary">
                  {job.kgEstimate ? `${job.kgEstimate} ${config?.units?.weightUnit ?? 'kg'}` : 'Not set'}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">
                  Installed {config?.units?.weightUnit ?? 'kg'}
                </h3>
                <p className="text-2xl font-semibold text-text-primary">
                  {job.kgInstalled ? `${job.kgInstalled} ${config?.units?.weightUnit ?? 'kg'}` : 'Not recorded'}
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
