'use client';

import { useMemo, useState } from 'react';
import type { Job } from '@/db/schema/jobs';
import { Card, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { hasSchedulableAddress, getShortAddress, getAddressSchedulingError } from '@/lib/utils/jobAddress';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { defaultVocabulary } from '@/lib/org/orgConfig';
import { getJobTypeLabel } from '@/lib/org/jobTypes';

interface SchedulingInboxPanelProps {
  jobs: Job[];
  orgId: string;
  activeDate: Date;
  onJobScheduled?: (jobId: string) => void;
  onJobClick?: (job: Job) => void;
  onStartDrag?: (jobId: string) => void;
  draggingJob?: Job | null;
  onScheduleClick?: (job: Job) => void;
}

/**
 * E0.2: Job type badge - compact
 */
function JobTypeBadge({ job }: { job: Job }) {
  const { config } = useOrgConfig();
  const vocabulary = config?.vocabulary ?? defaultVocabulary;
  const label = getJobTypeLabel(job, config, vocabulary.jobSingular);
  const className = 'bg-accent-gold/20 text-accent-gold';

  return (
    <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', className)}>
      {label}
    </span>
  );
}

/**
 * E0.2: Determine scheduling history for sorting
 */
function getSchedulingHistory(job: Job): 'never' | 'previously' | 'current' {
  // If job has scheduledStart but it's in the past, it was previously scheduled
  if (job.scheduledStart) {
    const scheduledDate = new Date(job.scheduledStart);
    const now = new Date();
    if (scheduledDate < now) {
      return 'previously';
    }
    return 'current';
  }
  return 'never';
}

/**
 * E0.2: Scheduling Inbox Panel
 * 
 * A day-scoped inbox showing jobs ready to be placed on the schedule.
 * "Click to choose a time, or drag directly onto a crew."
 */
export default function SchedulingInboxPanel({ 
  jobs, 
  orgId, 
  activeDate,
  onJobScheduled, 
  onJobClick, 
  onStartDrag, 
  draggingJob, 
  onScheduleClick 
}: SchedulingInboxPanelProps) {

  /**
   * E0.2: Sort jobs by priority:
   * 1. Jobs never scheduled before
   * 2. Jobs previously scheduled but now removed
   * 3. Jobs with upcoming deadlines (stub - no deadline field yet)
   * 4. Oldest created jobs last
   */
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const historyA = getSchedulingHistory(a);
      const historyB = getSchedulingHistory(b);
      
      // Priority 1: Never scheduled first
      if (historyA === 'never' && historyB !== 'never') return -1;
      if (historyB === 'never' && historyA !== 'never') return 1;
      
      // Priority 2: Previously scheduled (removed) second
      if (historyA === 'previously' && historyB !== 'previously') return -1;
      if (historyB === 'previously' && historyA !== 'previously') return 1;
      
      // Priority 3: Deadline sorting (stub - no deadline field yet)
      // When deadline field is added: compare a.deadline vs b.deadline
      
      // Priority 4: Oldest created last (ascending by creation date)
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
  }, [jobs]);

  /**
   * E0.2: Get job accent color
   */
  const getAccentColor = () => 'border-l-accent-gold/60';

  /**
   * E0.2: Format date for display
   */
  const formatActiveDate = () => {
    const today = new Date();
    const isToday = 
      activeDate.getDate() === today.getDate() &&
      activeDate.getMonth() === today.getMonth() &&
      activeDate.getFullYear() === today.getFullYear();
    
    if (isToday) return 'today';
    return activeDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  /**
   * E0.2: Get scheduling history label
   */
  const getHistoryLabel = (job: Job): string => {
    const history = getSchedulingHistory(job);
    if (history === 'never') return 'Never scheduled';
    if (history === 'previously') return 'Previously scheduled';
    return '';
  };

  /**
   * E0.2: Empty state messaging based on context
   */
  const getEmptyMessage = () => {
    const dateStr = formatActiveDate();
    if (dateStr === 'today') {
      return 'All jobs scheduled for today';
    }
    return `All jobs scheduled for ${dateStr}`;
  };

  return (
    <Card className="sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <div className="space-y-3">
        {/* E0.2: Header - Renamed to Scheduling Inbox */}
        <div className="pb-2 border-b border-border-subtle">
          <h3 className="font-bold text-text-primary text-sm">Scheduling Inbox</h3>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Jobs ready to be placed on the schedule
          </p>
        </div>

        {/* E0.2: Helper hint - only when inbox is non-empty */}
        {sortedJobs.length > 0 && (
          <p className="text-[10px] text-text-tertiary/70 italic">
            Click to choose a time, or drag directly onto a crew.
          </p>
        )}

        {/* E0.2: Empty state */}
        {sortedJobs.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-text-tertiary">
              {getEmptyMessage()}
            </p>
            <p className="text-[10px] text-text-tertiary/60 mt-1">
              Nothing left to plan
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedJobs.map((job) => {
              const isDragging = draggingJob?.id === job.id;
              const historyLabel = getHistoryLabel(job);

              return (
                <div
                  key={job.id}
                  onClick={() => onScheduleClick?.(job)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    // ❌ REMOVED: No pointer capture - rely on global listeners
                    onStartDrag?.(job.id);
                  }}
                  className={cn(
                    'group px-3 py-2 rounded-sm border-l-3 cursor-grab active:cursor-grabbing transition-all',
                    'bg-bg-card/80 hover:bg-bg-card hover:shadow-sm',
                    getAccentColor(),
                    isDragging && 'opacity-50 shadow-md'
                  )}
                >
                  {/* PRIMARY: Job name + type badge */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-text-primary text-[12px] truncate leading-snug flex-1">
                      {job.title}
                    </h4>
                    <JobTypeBadge job={job} />
                  </div>

                  {/* SECONDARY: Suburb + address warning (G1) */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {hasSchedulableAddress(job) ? (
                      <span className="text-[10px] text-text-secondary/80 truncate">
                        {getShortAddress(job)}
                      </span>
                    ) : (
                      <span 
                        className="text-[10px] text-amber-400/80 flex items-center gap-1"
                        title={getAddressSchedulingError(job) || 'Address required'}
                      >
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        No site address
                      </span>
                    )}
                  </div>

                  {/* TERTIARY: Scheduling history - small, muted */}
                  {historyLabel && (
                    <p className="text-[9px] text-text-tertiary/50 mt-1 leading-tight">
                      {historyLabel}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

