'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '@/db/schema/jobs';
import type { Task } from '@/db/schema/tasks';
import { Card, Badge, Chip, Button } from '@/components/ui';
import UnassignedJobCard from './UnassignedJobCard';
import { useOrgConfig } from '@/hooks/useOrgConfig';

interface UnassignedJobsListProps {
  jobs: Job[];
  orgId: string;
}

type PriorityFilter = 'all' | 'high' | 'normal' | 'low';
type StatusFilter = 'all' | string;
type DateFilter = 'today' | 'next7days' | 'all';

export default function UnassignedJobsList({ jobs: initialJobs, orgId }: UnassignedJobsListProps) {
  const { config } = useOrgConfig();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [jobTasks, setJobTasks] = useState<Record<string, Task[]>>({});
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Sync with prop changes
  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  // Fetch tasks for all jobs to show work step summaries
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

  // Filter jobs
  const filteredJobs = useMemo(() => {
    let filtered = jobs;

    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter((job) => job.priority === priorityFilter);
    }

    // Job type filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((job) => job.jobTypeId === statusFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      let startDate: Date;
      let endDate: Date;
      
      switch (dateFilter) {
        case 'today':
          startDate = today;
          endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 1);
          break;
        case 'next7days':
          startDate = today;
          endDate = new Date(today);
          endDate.setDate(endDate.getDate() + 7);
          break;
        default:
          startDate = new Date(0);
          endDate = new Date('2100-01-01');
      }

      filtered = filtered.filter((job) => {
        if (!job.scheduledStart) return false;
        const jobDate = new Date(job.scheduledStart);
        return jobDate >= startDate && jobDate < endDate;
      });
    }

    return filtered;
  }, [jobs, priorityFilter, statusFilter, dateFilter]);

  if (jobs.length === 0) {
    return (
      <Card>
        <p className="text-center text-text-secondary">No unassigned jobs found</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters Row */}
      <Card className="bg-bg-section/50 border border-border-subtle">
        <div className="space-y-4">
          {/* Priority Filter */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Priority
            </label>
            <div className="flex gap-2">
              <Chip
                active={priorityFilter === 'all'}
                onClick={() => setPriorityFilter('all')}
              >
                All
              </Chip>
              <Chip
                active={priorityFilter === 'high'}
                onClick={() => setPriorityFilter('high')}
              >
                High
              </Chip>
              <Chip
                active={priorityFilter === 'normal'}
                onClick={() => setPriorityFilter('normal')}
              >
                Normal
              </Chip>
              <Chip
                active={priorityFilter === 'low'}
                onClick={() => setPriorityFilter('low')}
              >
                Low
              </Chip>
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              {config?.vocabulary?.jobSingular ?? 'Job'} type
            </label>
            <div className="flex gap-2">
              <Chip
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              >
                All
              </Chip>
              {(config?.jobTypes ?? []).map((type) => (
                <Chip
                  key={type.id}
                  active={statusFilter === type.id}
                  onClick={() => setStatusFilter(type.id)}
                >
                  {type.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Date
            </label>
            <div className="flex gap-2">
              <Chip
                active={dateFilter === 'today'}
                onClick={() => setDateFilter('today')}
              >
                Today
              </Chip>
              <Chip
                active={dateFilter === 'next7days'}
                onClick={() => setDateFilter('next7days')}
              >
                Next 7 days
              </Chip>
              <Chip
                active={dateFilter === 'all'}
                onClick={() => setDateFilter('all')}
              >
                All
              </Chip>
            </div>
          </div>
        </div>
      </Card>

      {/* Job Cards */}
      {filteredJobs.length === 0 ? (
        <Card>
          <p className="text-center text-text-secondary">No jobs match the selected filters</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map((job) => (
            <UnassignedJobCard
              key={job.id}
              job={job}
              tasks={jobTasks[job.id] || []}
              isLoadingTasks={isLoadingTasks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
