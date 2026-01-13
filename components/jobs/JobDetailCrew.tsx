'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Task } from '@/db/schema/tasks';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { PageContainer, Card, Button, CollapsibleSection } from '@/components/ui';
import TaskList from '@/components/tasks/TaskList';
import { getDisplaySchedule } from '@/lib/utils/scheduleTime';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import useIsMobile from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import JobPhotosCard from '@/components/jobs/JobPhotosCard';
import JobDocumentsCard from '@/components/jobs/JobDocumentsCard';
import JobMaterialsCard from '@/components/jobs/JobMaterialsCard';
import { buildMapsUrl, formatAddress, StatusBadge } from '@/components/jobs/jobDetailShared';
import type { CrewJobDetail, CrewJobDetailLinks, JobClientSummary } from '@/lib/queries/job_detail';

interface JobDetailCrewProps {
  job: CrewJobDetail;
  orgId: string;
  links: CrewJobDetailLinks;
  client?: JobClientSummary | null;
  showUnassignedBanner?: boolean;
  assignments?: ScheduleAssignmentWithJob[];
  canLogMaterials?: boolean;
}

export default function JobDetailCrew({
  job,
  orgId,
  links,
  client = null,
  showUnassignedBanner = false,
  assignments = [],
  canLogMaterials = false,
}: JobDetailCrewProps) {
  const { config } = useOrgConfig();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [showMobileSkeleton, setShowMobileSkeleton] = useState(isMobile);

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

  const requiredTasks = tasks.filter((t) => t.isRequired);
  const completedRequiredTasks = requiredTasks.filter((t) => t.status === 'completed');
  const progressCount = completedRequiredTasks.length;
  const progressTotal = requiredTasks.length;
  const progressPercentage = progressTotal > 0 ? (progressCount / progressTotal) * 100 : 0;
  const canComplete = progressCount === progressTotal && progressTotal > 0;
  const jobTypeLabel =
    config?.jobTypes.find((type) => type.id === job.jobTypeId)?.label ??
    (config?.vocabulary?.jobSingular ?? 'Job');
  const mapsUrl = links.mapsUrl ?? buildMapsUrl(job);
  const displaySchedule = useMemo(() => getDisplaySchedule(job as any, assignments), [assignments, job]);

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

        {showUnassignedBanner && (
          <Card className="bg-accent-gold-muted/10 border border-accent-gold-muted/30">
            <p className="text-sm text-text-secondary">This job is currently unassigned</p>
          </Card>
        )}

        <Card className="bg-bg-section border-2 border-border-subtle">
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-text-primary">{job.title}</h1>
              {client && (
                <p className="mt-2 text-sm font-medium text-text-primary">{client.displayName}</p>
              )}
              <p className="mt-2 text-base text-text-secondary">{formatAddress(job)}</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm font-medium text-text-secondary">Status:</span>
                <StatusBadge status={job.status} />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm font-medium text-text-secondary">
                  {config?.vocabulary?.jobSingular ?? 'Job'} type:
                </span>
                <span className="text-sm text-text-primary">{jobTypeLabel}</span>
              </div>
            </div>

            {displaySchedule && displaySchedule.length > 0 ? (
              <div className="rounded-md border border-border-subtle bg-bg-card/40 p-3">
                <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Schedule window</p>
                <div className="mt-2 space-y-1">
                  {displaySchedule.map((slot, index) => (
                    <p key={slot.assignmentId ?? index} className="text-sm text-text-primary">
                      {slot.start.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      {slot.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {slot.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border-subtle bg-bg-card/40 p-3">
                <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide">Schedule window</p>
                <p className="mt-2 text-sm text-text-secondary">Not scheduled yet.</p>
              </div>
            )}

            {mapsUrl && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(mapsUrl, '_blank', 'noopener,noreferrer')}
                className="w-full sm:w-auto"
              >
                Open in maps
              </Button>
            )}
          </div>
        </Card>

        {job.status === 'scheduled' && (
          <Card>
            <Button
              onClick={handleStartJob}
              disabled={isUpdatingStatus}
              size="lg"
              className="w-full sm:w-auto"
            >
              {isUpdatingStatus ? 'Starting...' : 'Start Job'}
            </Button>
          </Card>
        )}

        {job.status === 'in_progress' && (
          <Card className="space-y-2">
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
                Complete all critical {config?.vocabulary?.workStepPlural?.toLowerCase() ?? 'work steps'} before marking
                job as complete
              </p>
            )}
            {completionError && <p className="text-sm text-destructive">{completionError}</p>}
          </Card>
        )}

        {!isLoadingTasks && progressTotal > 0 && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">Progress</h2>
                <span className="text-sm font-medium text-text-secondary">
                  {progressCount} of {progressTotal} required work steps completed
                </span>
              </div>
              <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-gold transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>
          </Card>
        )}

        <TaskList jobId={job.id} orgId={orgId} jobTypeId={job.jobTypeId ?? null} />

        {canLogMaterials && <JobMaterialsCard orgId={orgId} jobId={job.id} />}

        <JobPhotosCard orgId={orgId} jobId={job.id} />
        <JobDocumentsCard orgId={orgId} jobId={job.id} />

        <CollapsibleSection title="Notes" defaultOpen={false} storageKey={`job-detail-${job.id}-notes`}>
          {job.notes ? (
            <p className="text-sm text-text-primary whitespace-pre-wrap">{job.notes}</p>
          ) : (
            <p className="text-sm text-text-secondary">No notes for this job.</p>
          )}
        </CollapsibleSection>
      </div>
    </PageContainer>
  );
}
