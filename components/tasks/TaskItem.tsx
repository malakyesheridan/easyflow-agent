'use client';

import { useEffect, useRef, useState } from 'react';
import type { Task } from '@/db/schema/tasks';
import { cn } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';
import useIsMobile from '@/hooks/useIsMobile';

interface TaskItemProps {
  task: Task;
  jobId: string;
  orgId: string;
  isFirst?: boolean;
  isLast?: boolean;
  onComplete: () => void;
  onDelete: () => void;
  onReorder?: () => void;
  onDuplicate?: () => void;
  onEdit?: () => void;
}

/**
 * Task status badge component
 */
function TaskStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    pending: { label: 'Pending', variant: 'muted' },
    in_progress: { label: 'In Progress', variant: 'default' },
    completed: { label: 'Completed', variant: 'muted' },
    skipped: { label: 'Skipped', variant: 'muted' },
  };

  const config = statusConfig[status] || {
    label: status,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function TaskItem({
  task,
  jobId,
  orgId,
  isFirst = false,
  isLast = false,
  onComplete,
  onDelete,
  onReorder,
  onDuplicate,
  onEdit,
}: TaskItemProps) {
  const isMobile = useIsMobile();
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState(task.status);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCompleted = optimisticStatus === 'completed';

  useEffect(() => {
    setOptimisticStatus(task.status);
  }, [task.status]);

  const handleCheckboxChange = async (checked: boolean) => {
    if (isCompleting) return;

    const newStatus = checked ? 'completed' : 'pending';
    const previousStatus = optimisticStatus;

    setOptimisticStatus(newStatus);
    setIsCompleting(true);

    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: task.id,
          orgId: orgId,
          status: newStatus,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        onComplete();
        if (isMobile && 'vibrate' in navigator) {
          navigator.vibrate(8);
        }
      } else {
        console.error('Failed to update work step status:', data.error);
        setOptimisticStatus(previousStatus);
        alert(data.error.message || 'Failed to update work step status');
      }
    } catch (error) {
      console.error('Error updating work step status:', error);
      setOptimisticStatus(previousStatus);
      alert('Network error: Failed to update work step status');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleEditNote = async () => {
    if (isUpdatingNote) return;
    const next = window.prompt('Add a note for this step:', task.description ?? '');
    if (next === null) return;
    setIsUpdatingNote(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task.id,
          orgId,
          description: next.trim() || null,
        }),
      });
      const data = await response.json();
      if (!data.ok) {
        throw new Error(data.error?.message || 'Failed to update note');
      }
      onComplete();
    } catch (error) {
      console.error('Error updating work step note:', error);
      alert(error instanceof Error ? error.message : 'Failed to update note');
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const startLongPress = (target: HTMLElement | null) => {
    if (!isMobile) return;
    if (target?.closest('input,button')) return;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      void handleEditNote();
    }, 600);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleMoveUp = async () => {
    if (isFirst || isReordering) return;

    setIsReordering(true);

    try {
      // Find the task above this one
      const response = await fetch(`/api/tasks?orgId=${orgId}&jobId=${jobId}`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const allTasks = data.data.sort((a: Task, b: Task) => a.order - b.order);
      const currentIndex = allTasks.findIndex((t: Task) => t.id === task.id);
      const previousTask = allTasks[currentIndex - 1];

      if (!previousTask) {
        setIsReordering(false);
        return;
      }

      // Swap orders
      const currentOrder = task.order;
      const previousOrder = previousTask.order;

      // Update both tasks
      const [currentResponse, previousResponse] = await Promise.all([
        fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            orgId,
            order: previousOrder,
          }),
        }),
        fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: previousTask.id,
            orgId,
            order: currentOrder,
          }),
        }),
      ]);

      const [currentData, previousData] = await Promise.all([
        currentResponse.json(),
        previousResponse.json(),
      ]);

      if (currentData.ok && previousData.ok) {
        onReorder?.();
      } else {
        throw new Error('Failed to reorder work steps');
      }
    } catch (error) {
      console.error('Error reordering work step:', error);
      alert('Failed to reorder work step');
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveDown = async () => {
    if (isLast || isReordering) return;

    setIsReordering(true);

    try {
      // Find the task below this one
      const response = await fetch(`/api/tasks?orgId=${orgId}&jobId=${jobId}`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const allTasks = data.data.sort((a: Task, b: Task) => a.order - b.order);
      const currentIndex = allTasks.findIndex((t: Task) => t.id === task.id);
      const nextTask = allTasks[currentIndex + 1];

      if (!nextTask) {
        setIsReordering(false);
        return;
      }

      // Swap orders
      const currentOrder = task.order;
      const nextOrder = nextTask.order;

      // Update both tasks
      const [currentResponse, nextResponse] = await Promise.all([
        fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            orgId,
            order: nextOrder,
          }),
        }),
        fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: nextTask.id,
            orgId,
            order: currentOrder,
          }),
        }),
      ]);

      const [currentData, nextData] = await Promise.all([
        currentResponse.json(),
        nextResponse.json(),
      ]);

      if (currentData.ok && nextData.ok) {
        onReorder?.();
      } else {
        throw new Error('Failed to reorder work steps');
      }
    } catch (error) {
      console.error('Error reordering work step:', error);
      alert('Failed to reorder work step');
    } finally {
      setIsReordering(false);
    }
  };

  const handleDuplicate = async () => {
    if (isDuplicating) return;

    setIsDuplicating(true);

    try {
      // Fetch all tasks to calculate order
      const response = await fetch(`/api/tasks?orgId=${orgId}&jobId=${jobId}`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const allTasks = data.data.sort((a: Task, b: Task) => a.order - b.order);
      const currentIndex = allTasks.findIndex((t: Task) => t.id === task.id);
      const insertOrder = task.order + 1;

      // Shift all tasks after this one
      const tasksToShift = allTasks.filter((t: Task) => t.order >= insertOrder);
      for (const t of tasksToShift) {
        await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: t.id,
            orgId,
            order: t.order + 1,
          }),
        });
      }

      // Create duplicate
      const duplicateResponse = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: jobId,
          orgId,
          title: `${task.title} (Copy)`,
          description: task.description || null,
          order: insertOrder,
          isRequired: task.isRequired,
          status: 'pending',
        }),
      });

      const duplicateData = await duplicateResponse.json();

      if (duplicateData.ok) {
        onDuplicate?.();
      } else {
        throw new Error(duplicateData.error.message || 'Failed to duplicate work step');
      }
    } catch (error) {
      console.error('Error duplicating work step:', error);
      alert('Failed to duplicate work step');
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleDelete = async () => {
    if (task.isRequired) {
      const confirmed = window.confirm(
        'This is a critical work step. Are you sure you want to delete it?'
      );
      if (!confirmed) return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/tasks?id=${task.id}&orgId=${orgId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.ok) {
        onDelete();
      } else {
        console.error('Failed to delete work step:', data.error);
        alert(`Error: ${data.error.message}`);
      }
    } catch (error) {
      console.error('Error deleting work step:', error);
      alert('Failed to delete work step');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    } else {
      const newTitle = window.prompt('Edit work step title:', task.title);
      if (newTitle && newTitle.trim() && newTitle !== task.title) {
        fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: task.id,
            orgId,
            title: newTitle.trim(),
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.ok) {
              onComplete();
            }
          });
      }
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-4 border border-border-subtle rounded-lg transition-colors',
        isMobile && 'min-h-[64px] items-start',
        isCompleted && 'opacity-60 bg-bg-section/30'
      )}
      onTouchStart={(e) => startLongPress(e.target as HTMLElement)}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onTouchCancel={cancelLongPress}
    >
      <input
        type="checkbox"
        checked={isCompleted}
        onChange={(e) => handleCheckboxChange(e.target.checked)}
        disabled={isCompleting}
        className={cn('rounded border-border-subtle bg-bg-input cursor-pointer', isMobile ? 'w-5 h-5' : 'w-4 h-4')}
        title={isCompleted ? 'Mark as pending' : 'Mark as completed'}
      />

      {/* Reorder Controls */}
      {!isMobile && (
        <div className="flex flex-col gap-1">
          <button
            onClick={handleMoveUp}
            disabled={isFirst || isReordering}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded border border-border-subtle bg-bg-input',
              'text-text-secondary hover:text-text-primary hover:border-accent-gold-muted',
              'disabled:opacity-30 disabled:cursor-not-allowed transition-colors',
              'text-xs'
            )}
            title="Move up"
          >
            ^
          </button>
          <button
            onClick={handleMoveDown}
            disabled={isLast || isReordering}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded border border-border-subtle bg-bg-input',
              'text-text-secondary hover:text-text-primary hover:border-accent-gold-muted',
              'disabled:opacity-30 disabled:cursor-not-allowed transition-colors',
              'text-xs'
            )}
            title="Move down"
          >
            v
          </button>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3
            className={cn(
              'font-medium text-text-primary',
              isCompleted && 'line-through text-text-tertiary'
            )}
          >
            {task.title}
          </h3>
          {task.isRequired && (
            <Badge variant="muted" className="text-xs">Critical</Badge>
          )}
        </div>
        {task.description && (
          <p
            className={cn(
              'text-sm text-text-secondary mt-1',
              isCompleted && 'line-through'
            )}
          >
            {task.description}
          </p>
        )}
        <div className="mt-2">
          <TaskStatusBadge status={optimisticStatus} />
        </div>
        {isMobile && (
          <p className="mt-2 text-xs text-text-tertiary">Long press to add a note</p>
        )}
      </div>

      {!isMobile && (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDuplicate}
            disabled={isDuplicating || isDeleting}
            title="Duplicate work step"
          >
            {isDuplicating ? '...' : 'Duplicate'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleEdit} disabled={isDeleting}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      )}
    </div>
  );
}
