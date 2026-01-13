'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '@/db/schema/jobs';
import type { Task } from '@/db/schema/tasks';
import { Card, Badge, Chip, Input } from '@/components/ui';
import QuickActionsMenu from '@/components/quick-actions/QuickActionsMenu';
import JobProgressBadge from '@/components/jobs/JobProgressBadge';
import { getRequiredTaskProgress } from '@/lib/utils/taskProgress';

interface CompletedJobsListProps {
  jobs: Job[];
  orgId: string;
}

type DateFilter = 'today' | 'last7days' | 'last30days' | 'all';

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    unassigned: { label: 'Unassigned', variant: 'muted' },
    scheduled: { label: 'Scheduled', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'gold' },
  };

  const config = statusConfig[status] || {
    label: status,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
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

export default function CompletedJobsList({ jobs: initialJobs, orgId }: CompletedJobsListProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [jobTasks, setJobTasks] = useState<Record<string, Task[]>>({});
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Sync with prop changes
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Fetch tasks for all jobs (for keyword filtering)
  useEffect(() => {
    if (jobs.length > 0) {
      setIsLoadingTasks(true);

      const fetchTasksPromises = jobs.map(async (job) => {
        try {
          const response = await fetch(`/api/tasks?orgId=${orgId}&jobId=${job.id}`);
          const data = await response.json();
          return data.ok ? { jobId: job.id, tasks: data.data as Task[] } : { jobId: job.id, tasks: [] };
        } catch {
          return { jobId: job.id, tasks: [] };
        }
      });

      Promise.all(fetchTasksPromises).then((results) => {
        const tasksMap: Record<string, Task[]> = {};
        results.forEach(({ jobId, tasks }) => {
          tasksMap[jobId] = tasks;
        });
        setJobTasks(tasksMap);
        setIsLoadingTasks(false);
      });
    } else {
      setJobTasks({});
    }
  }, [jobs, orgId]);

  const handleRowClick = (jobId: string) => {
    router.push(`/jobs/${jobId}`);
  };

  // Filter jobs
  const filteredJobs = useMemo(() => {
    let filtered = jobs;

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      let startDate: Date;
      switch (dateFilter) {
        case 'today':
          startDate = today;
          break;
        case 'last7days':
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'last30days':
          startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 30);
          break;
        default:
          startDate = new Date(0);
      }

      filtered = filtered.filter((job) => {
        const jobDate = job.updatedAt 
          ? new Date(job.updatedAt) 
          : job.createdAt 
          ? new Date(job.createdAt) 
          : null;
        if (!jobDate) return false;
        const jobDateOnly = new Date(jobDate.getFullYear(), jobDate.getMonth(), jobDate.getDate());
        return jobDateOnly >= startDate;
      });
    }

    // Apply keyword filter
    if (keywordFilter.trim()) {
      const keyword = keywordFilter.toLowerCase().trim();
      filtered = filtered.filter((job) => {
        // Check job title
        if (job.title.toLowerCase().includes(keyword)) return true;
        
        // Check work step titles
        const tasks = jobTasks[job.id] || [];
        return tasks.some((task) => task.title.toLowerCase().includes(keyword));
      });
    }

    return filtered;
  }, [jobs, dateFilter, keywordFilter, jobTasks]);

  if (jobs.length === 0) {
    return (
      <Card>
        <p className="text-center text-text-secondary">No completed jobs found</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-bg-section/50 border border-border-subtle">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Date Filter
            </label>
            <div className="flex gap-2">
              <Chip
                active={dateFilter === 'today'}
                onClick={() => setDateFilter('today')}
              >
                Today
              </Chip>
              <Chip
                active={dateFilter === 'last7days'}
                onClick={() => setDateFilter('last7days')}
              >
                Last 7 days
              </Chip>
              <Chip
                active={dateFilter === 'last30days'}
                onClick={() => setDateFilter('last30days')}
              >
                Last 30 days
              </Chip>
              <Chip
                active={dateFilter === 'all'}
                onClick={() => setDateFilter('all')}
              >
                All
              </Chip>
            </div>
          </div>

          {/* Keyword Filter */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Search Work Steps
            </label>
            <Input
              placeholder="Filter by job title or work step..."
              value={keywordFilter}
              onChange={(e) => setKeywordFilter(e.target.value)}
              className="w-full"
            />
          </div>
        </div>
      </Card>

      {/* Jobs Table */}
      {filteredJobs.length === 0 ? (
        <Card>
          <p className="text-center text-text-secondary">No completed jobs match the selected filters</p>
        </Card>
      ) : (
        <Card className="border-2 border-accent-gold-muted/30 bg-bg-section/20">
          <div className="px-6 py-3 bg-accent-gold-muted/10 border-b border-border-subtle">
            <p className="text-sm text-text-secondary">
              Archive Mode: Viewing completed jobs only
            </p>
          </div>
          <div className="overflow-x-auto">
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
                    Scheduled Start
                  </th>
                  <th className="h-12 px-6 text-left align-middle font-medium text-text-secondary">
                    Scheduled End
                  </th>
                  <th className="h-12 px-6 text-right align-middle font-medium text-text-secondary w-12">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const summary = getRequiredTaskProgress(jobTasks[job.id] || []);
                  return (
                    <tr
                      key={job.id}
                      className="border-b border-border-subtle transition-colors bg-accent-gold/5 hover:bg-accent-gold/10 cursor-pointer"
                      onClick={() => handleRowClick(job.id)}
                    >
                      <td className="p-4 align-middle font-medium text-text-primary">
                        {job.title}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={job.status} />
                          <JobProgressBadge
                            status={job.progressStatus}
                            percent={isLoadingTasks ? undefined : summary.percent}
                          />
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        <PriorityBadge priority={job.priority} />
                      </td>
                      <td className="p-4 align-middle text-text-secondary">
                        {job.suburb || '-'}
                      </td>
                      <td className="p-4 align-middle text-text-secondary">
                        {formatDate(job.scheduledStart)}
                      </td>
                      <td className="p-4 align-middle text-text-secondary">
                        {formatDate(job.scheduledEnd)}
                      </td>
                      <td
                        className="p-4 align-middle text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <QuickActionsMenu entity={job} entityType="job" orgId={job.orgId} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
