'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Job } from '@/db/schema/jobs';

interface JobActionsMenuProps {
  job: Job;
  orgId?: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export default function JobActionsMenu({
  job,
  orgId = job.orgId,
  onEdit,
  onDuplicate,
  onDelete,
}: JobActionsMenuProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleEdit = () => {
    setIsOpen(false);
    if (onEdit) {
      onEdit();
    } else {
      router.push(`/jobs/${job.id}/edit`);
    }
  };

  const handleDuplicate = async () => {
    setIsOpen(false);
    if (onDuplicate) {
      onDuplicate();
    } else {
      try {
        const response = await fetch(`/api/jobs/${job.id}/duplicate?orgId=${job.orgId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();
        if (data.ok && data.data?.job?.id) {
          // Redirect to the new job's detail page
          router.push(`/jobs/${data.data.job.id}`);
          // Refresh the jobs list page in the background
          router.refresh();
        } else {
          // Show error alert with details
          const errorMsg = data.error?.message || 'Failed to duplicate job';
          console.error('Duplication failed:', data.error);
          alert(errorMsg);
        }
      } catch (error) {
        console.error('Error duplicating job:', error);
        alert('Network error: Failed to duplicate job');
      }
    }
  };

  const handleDelete = async () => {
    setIsOpen(false);
    
    // PHASE C3: Check for active assignments before deletion
    try {
      const assignmentsResponse = await fetch(
        `/api/schedule-assignments?orgId=${job.orgId}&jobId=${job.id}`
      );
      const assignmentsData = await assignmentsResponse.json();
      
      const assignments = assignmentsData.ok ? assignmentsData.data : [];
      const activeAssignments = assignments.filter(
        (a: any) => a.status !== 'completed' && a.status !== 'cancelled'
      );
      
      let confirmMessage = `Are you sure you want to delete "${job.title}"?\n\n`;
      confirmMessage += `This action cannot be undone and will delete all associated work steps.`;
      
      if (activeAssignments.length > 0) {
        confirmMessage += `\n\n⚠️ WARNING: This job has ${activeAssignments.length} active schedule assignment${activeAssignments.length !== 1 ? 's' : ''}. `;
        confirmMessage += `Deleting this job will also delete all schedule assignments.`;
      } else if (assignments.length > 0) {
        confirmMessage += `\n\nNote: This job has ${assignments.length} schedule assignment${assignments.length !== 1 ? 's' : ''} (completed/cancelled).`;
      }
      
      if (!confirm(confirmMessage)) {
        return;
      }
    } catch (error) {
      // If assignment check fails, proceed with basic confirmation
      if (!confirm(`Are you sure you want to delete "${job.title}"? This action cannot be undone and will delete all associated work steps.`)) {
        return;
      }
    }

    if (onDelete) {
      onDelete();
    } else {
      try {
        const response = await fetch(`/api/jobs/${job.id}?orgId=${job.orgId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        });

        const data = await response.json();
        if (data.ok) {
          // Redirect to jobs list after successful deletion
          router.push('/jobs');
          router.refresh();
        } else {
          const errorMsg = data.error?.message || 'Failed to delete job';
          console.error('Deletion failed:', data.error);
          alert(errorMsg);
        }
      } catch (error) {
        console.error('Error deleting job:', error);
        alert('Network error: Failed to delete job');
      }
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1 rounded-md hover:bg-bg-section text-text-secondary hover:text-text-primary transition-colors"
        aria-label="Job actions"
      >
        <span className="text-lg">⋯</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-bg-card border border-border-subtle rounded-lg shadow-lift z-50">
          <div className="py-1">
            <button
              onClick={handleEdit}
              className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-section transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleDuplicate}
              className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-section transition-colors"
            >
              Duplicate
            </button>
            <button
              onClick={handleDelete}
              className="w-full text-left px-4 py-2 text-sm text-destructive hover:bg-bg-section transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

