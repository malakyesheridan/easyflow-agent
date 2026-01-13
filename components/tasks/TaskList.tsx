'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task } from '@/db/schema/tasks';
import { CollapsibleSection, Button, Input, Select } from '@/components/ui';
import TaskItem from './TaskItem';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import useIsMobile from '@/hooks/useIsMobile';

interface TaskListProps {
  jobId: string;
  orgId: string;
  jobTypeId?: string | null;
  onTaskUpdate?: () => void;
}

type TemplateStep = {
  id: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  sortOrder: number;
};

type WorkTemplate = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  jobTypeId: string | null;
  isDefault: boolean;
  archivedAt: string | null;
  steps: TemplateStep[];
};

export default function TaskList({ jobId, orgId, jobTypeId = null, onTaskUpdate }: TaskListProps) {
  const { config } = useOrgConfig();
  const isMobile = useIsMobile();
  const resolvedOrgId = orgId || config?.orgId || '';
  const sectionTitle = config?.vocabulary?.workStepPlural ?? 'Work Steps';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [templates, setTemplates] = useState<WorkTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const activeTemplates = useMemo(() => {
    const filtered = templates.filter((t) => !t.archivedAt);
    if (!jobTypeId) return filtered;
    const matches = filtered.filter((t) => t.jobTypeId === jobTypeId);
    return matches.length > 0 ? matches : filtered;
  }, [jobTypeId, templates]);
  const defaultTemplate = useMemo(() => {
    return activeTemplates.find((t) => t.isDefault) ?? activeTemplates[0] ?? null;
  }, [activeTemplates]);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks?orgId=${resolvedOrgId}&jobId=${jobId}`);
      const data = await response.json();

      if (data.ok) {
        setTasks(data.data);
      } else {
        setError(data.error.message || 'Failed to load work steps');
      }
    } catch (err) {
      setError('Failed to load work steps');
      console.error('Error fetching tasks:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobId, resolvedOrgId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await fetch(`/api/work-templates?orgId=${resolvedOrgId}&includeSteps=true`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setTemplates([]);
        return;
      }
      setTemplates(json.data as WorkTemplate[]);
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, [resolvedOrgId]);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (defaultTemplate && defaultTemplate.id !== selectedTemplateId) {
      setSelectedTemplateId(defaultTemplate.id);
    }
  }, [defaultTemplate, selectedTemplateId]);

  const handleTaskComplete = () => {
    fetchTasks();
    onTaskUpdate?.();
  };

  const handleTaskDelete = () => {
    fetchTasks();
    onTaskUpdate?.();
  };

  const handleTaskReorder = () => {
    fetchTasks();
    onTaskUpdate?.();
  };

  const handleTaskDuplicate = () => {
    fetchTasks();
    onTaskUpdate?.();
  };

  const handleAddTask = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!newTaskTitle.trim()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Calculate next order value
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map((t) => t.order)) : 0;
      const nextOrder = maxOrder + 1;

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          orgId: resolvedOrgId,
          title: newTaskTitle.trim(),
          order: nextOrder,
          isRequired: true, // Default to critical
          status: 'pending',
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setNewTaskTitle('');
        fetchTasks();
        onTaskUpdate?.();
      } else {
        setError(data.error.message || 'Failed to create work step');
      }
    } catch (err) {
      setError('Failed to create work step');
      console.error('Error creating task:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    const preset = templates.find((t) => t.id === templateId);
    if (!preset) return;

    setIsAddingPreset(true);
    setError(null);

    try {
      // Fetch current tasks to check what already exists
      const response = await fetch(`/api/tasks?orgId=${resolvedOrgId}&jobId=${jobId}`);
      const tasksData = await response.json();

      if (!tasksData.ok) {
        throw new Error('Failed to fetch existing work steps');
      }

      const existingTasks = tasksData.data as Task[];
      const existingTitles = new Set(existingTasks.map((t) => t.title.toLowerCase().trim()));

      // Filter out steps that already exist (by title match)
      const stepsToAdd = preset.steps.filter(
        (step) => !existingTitles.has(step.title.toLowerCase().trim())
      );

      if (stepsToAdd.length === 0) {
        // All steps already exist, just mark preset as selected
        setSelectedTemplateId(templateId);
        setIsAddingPreset(false);
        return;
      }

      const sortedTasks = [...existingTasks].sort((a, b) => a.order - b.order);
      const maxOrder = sortedTasks.length > 0 ? Math.max(...sortedTasks.map((t) => t.order)) : 0;

      // Create only the missing steps
      const createPromises = stepsToAdd.map((step, index) => {
        return fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            orgId: resolvedOrgId,
            title: step.title,
            description: step.description || null,
            order: maxOrder + index + 1,
            isRequired: step.isRequired,
            status: 'pending',
          }),
        });
      });

      const responses = await Promise.all(createPromises);
      const results = await Promise.all(responses.map((r) => r.json()));

      // Check if all succeeded
      const failed = results.find((r) => !r.ok);
      if (failed) {
        setError(failed.error.message || 'Failed to add some work steps');
      } else {
        // Mark preset as selected
        setSelectedTemplateId(templateId);
      }

      fetchTasks();
      onTaskUpdate?.();
    } catch (err) {
      setError('Failed to add suggested work steps');
      console.error('Error adding preset:', err);
    } finally {
      setIsAddingPreset(false);
    }
  };

  if (isLoading) {
    return (
      <CollapsibleSection
        title={sectionTitle}
        defaultOpen
        storageKey={`job-detail-${jobId}-work-steps`}
      >
        {isMobile ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-bg-section/70 animate-pulse" />
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            Loading {config?.vocabulary?.workStepPlural?.toLowerCase() ?? 'work steps'}...
          </p>
        )}
      </CollapsibleSection>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <CollapsibleSection
        title={sectionTitle}
        defaultOpen
        storageKey={`job-detail-${jobId}-work-steps`}
      >
        <p className="text-sm text-destructive">{error}</p>
      </CollapsibleSection>
    );
  }

  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  return (
    <CollapsibleSection
      title={sectionTitle}
      defaultOpen
      storageKey={`job-detail-${jobId}-work-steps`}
    >

      {error && tasks.length > 0 && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg mb-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!isMobile && (
        <>
          {/* Work steps template */}
          <div className="mb-4 flex items-end gap-3">
            <div className="flex-1">
              <Select
                id="preset-select"
                label={`${config?.vocabulary?.workStepPlural ?? 'Work Steps'} template`}
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                disabled={isAddingPreset || templatesLoading || templates.length === 0}
              >
                {activeTemplates.length === 0 ? (
                  <option value="">No templates available</option>
                ) : (
                  activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={isAddingPreset || !selectedTemplateId}
              onClick={() => applyTemplate(selectedTemplateId)}
            >
              {isAddingPreset ? 'Adding...' : 'Add missing steps'}
            </Button>
          </div>

          {/* Inline Add Work Step */}
          <div className="mb-4">
            <Input
              placeholder={`Add ${config?.vocabulary?.workStepSingular?.toLowerCase() ?? 'work step'} (press Enter to save)`}
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddTask();
                }
              }}
              disabled={isSubmitting}
            />
          </div>
        </>
      )}

      {sortedTasks.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No {config?.vocabulary?.workStepPlural?.toLowerCase() ?? 'work steps'} found for this job.
        </p>
      ) : (
        <div className="space-y-3">
          {sortedTasks.map((task, index) => (
            <TaskItem
              key={task.id}
              task={task}
              jobId={jobId}
              orgId={orgId}
              isFirst={index === 0}
              isLast={index === sortedTasks.length - 1}
              onComplete={handleTaskComplete}
              onDelete={handleTaskDelete}
              onReorder={handleTaskReorder}
              onDuplicate={handleTaskDuplicate}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}
