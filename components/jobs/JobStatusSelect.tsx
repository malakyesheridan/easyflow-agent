'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui';
import type { Job } from '@/db/schema/jobs';
import type { JobStatus } from '@/lib/validators/jobs';

interface JobStatusSelectProps {
  job: Job;
  onStatusChange?: (job: Job) => void;
}

const JOB_STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export default function JobStatusSelect({ job, onStatusChange }: JobStatusSelectProps) {
  const [currentStatus, setCurrentStatus] = useState<JobStatus>(job.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync with prop changes
  useEffect(() => {
    setCurrentStatus(job.status);
  }, [job.status]);

  const handleStatusChange = async (newStatus: JobStatus) => {
    if (newStatus === currentStatus || isUpdating) return;

    // Optimistic update
    const previousStatus = currentStatus;
    setCurrentStatus(newStatus);
    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: job.id,
          orgId: job.orgId,
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        // Success - update the job object
        const updatedJob = { ...job, status: newStatus };
        onStatusChange?.(updatedJob);
      } else {
        // Rollback on error
        setCurrentStatus(previousStatus);
        const errorMessage = data.error.message || 'Failed to update status';
        setError(errorMessage);
        
        // Show error alert for validation errors (e.g., required tasks incomplete)
        if (data.error.code === 'VALIDATION_ERROR') {
          alert(errorMessage);
        }
        
        // Clear error after 3 seconds
        setTimeout(() => setError(null), 3000);
      }
    } catch (err) {
      // Rollback on error
      setCurrentStatus(previousStatus);
      setError('Network error: Failed to update status');
      console.error('Error updating job status:', err);
      alert('Network error: Failed to update status');
      
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsUpdating(false);
    }
  };

  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    unassigned: { label: 'Unassigned', variant: 'muted' },
    scheduled: { label: 'Scheduled', variant: 'default' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'default' },
  };

  const config = statusConfig[currentStatus] || {
    label: currentStatus,
    variant: 'default' as const,
  };

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <select
        value={currentStatus}
        onChange={(e) => handleStatusChange(e.target.value as JobStatus)}
        disabled={isUpdating}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex-1 px-2 py-1 text-xs bg-bg-input border border-border-subtle rounded-md text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-gold focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {JOB_STATUSES.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="text-xs text-destructive whitespace-nowrap">{error}</span>
      )}
    </div>
  );
}

