'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Textarea, Select, Button } from '@/components/ui';
import JobInstallModifiersCard from '@/components/jobs/JobInstallModifiersCard';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import type { UpdateJobInput } from '@/lib/validators/jobs';
import { useSession } from '@/hooks/useSession';
import ClientSelectField from '@/components/clients/ClientSelectField';

interface JobEditFormProps {
  job: Job;
  orgId: string;
  assignments?: ScheduleAssignmentWithJob[]; // PHASE C3: Active assignments for warning
}

export default function JobEditForm({ job, orgId, assignments = [] }: JobEditFormProps) {
  const router = useRouter();
  const { session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Format dates for datetime-local input
  const formatDateForInput = (date: Date | null | undefined): string => {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const [formData, setFormData] = useState<Partial<UpdateJobInput>>({
    id: job.id,
    orgId,
    title: job.title,
    clientId: job.clientId ?? null,
    addressLine1: job.addressLine1,
    addressLine2: job.addressLine2 || '',
    suburb: job.suburb || '',
    state: job.state || '',
    postcode: job.postcode || '',
    status: job.status,
    priority: job.priority,
    scheduledStart: formatDateForInput(job.scheduledStart),
    scheduledEnd: formatDateForInput(job.scheduledEnd),
    notes: job.notes || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title?.trim()) {
      setError('Title is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const scheduledStart = formData.scheduledStart
        ? new Date(formData.scheduledStart).toISOString()
        : null;
      const scheduledEnd = formData.scheduledEnd
        ? new Date(formData.scheduledEnd).toISOString()
        : null;

      // 3️⃣ Job Page Becomes Authoritative Again
      // PHASE A: Job edits update job core fields. Schedule fields are included
      // but schedule operations will never overwrite job core fields.
      // 
      // Data Flow Rule: Jobs page writes → Job table (all fields)
      // Schedule writes → scheduling fields ONLY (guarded in mutation)
      const payload: UpdateJobInput = {
        id: job.id,
        orgId,
        // Job core fields - these are authoritative from the Job page
        title: formData.title,
        clientId: formData.clientId ?? null,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2 || null,
        suburb: formData.suburb || null,
        state: formData.state || null,
        postcode: formData.postcode || null,
        status: formData.status as any,
        priority: formData.priority as any,
        notes: formData.notes || null,
        // Schedule fields - can be edited from Job page, but schedule operations won't overwrite job fields
        scheduledStart,
        scheduledEnd,
      };

      const response = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.ok) {
        // Refresh all pages to ensure schedule reflects changes
        router.refresh();
        router.push(`/jobs/${job.id}`);
      } else {
        setError(data.error.message || 'Failed to update job');
      }
    } catch (err) {
      setError('Failed to update job');
      console.error('Error updating job:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const canManageClients =
    session?.actor?.capabilities?.includes('admin') ||
    session?.actor?.capabilities?.includes('manage_org') ||
    session?.actor?.capabilities?.includes('manage_jobs');

  // PHASE C3: Check if job has active schedule assignments
  const hasActiveAssignments = assignments.length > 0;
  const activeAssignmentsCount = assignments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length;

  return (
    <div className="bg-card border rounded-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* PHASE C3: Warning banner if job has active assignments - informational only, does NOT block saving */}
        {hasActiveAssignments && (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-1">
              ⚠️ This job has {activeAssignmentsCount} active schedule assignment{activeAssignmentsCount !== 1 ? 's' : ''}.
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-500">
              Changes to job details (title, address, notes) will reflect on all schedule blocks immediately.
              Schedule assignments are managed separately on the Schedule page.
            </p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-2">
            Title <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="title"
            name="title"
            required
            value={formData.title}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>

        <ClientSelectField
          orgId={orgId}
          value={(formData.clientId as string | null) ?? null}
          onChange={(clientId) => setFormData((prev) => ({ ...prev, clientId }))}
          canManage={Boolean(canManageClients)}
        />

        <div>
          <label htmlFor="addressLine1" className="block text-sm font-medium mb-2">
            Address Line 1 <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            id="addressLine1"
            name="addressLine1"
            required
            value={formData.addressLine1}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>

        <div>
          <label htmlFor="addressLine2" className="block text-sm font-medium mb-2">
            Address Line 2
          </label>
          <input
            type="text"
            id="addressLine2"
            name="addressLine2"
            value={formData.addressLine2 || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="suburb" className="block text-sm font-medium mb-2">
              Suburb
            </label>
            <input
              type="text"
              id="suburb"
              name="suburb"
              value={formData.suburb || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          <div>
            <label htmlFor="state" className="block text-sm font-medium mb-2">
              State
            </label>
            <input
              type="text"
              id="state"
              name="state"
              value={formData.state || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          <div>
            <label htmlFor="postcode" className="block text-sm font-medium mb-2">
              Postcode
            </label>
            <input
              type="text"
              id="postcode"
              name="postcode"
              value={formData.postcode || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="scheduledStart" className="block text-sm font-medium mb-2">
              Scheduled Start
            </label>
            <input
              type="datetime-local"
              id="scheduledStart"
              name="scheduledStart"
              value={formData.scheduledStart || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          <div>
            <label htmlFor="scheduledEnd" className="block text-sm font-medium mb-2">
              Scheduled End
            </label>
            <input
              type="datetime-local"
              id="scheduledEnd"
              name="scheduledEnd"
              value={formData.scheduledEnd || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="priority" className="block text-sm font-medium mb-2">
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium mb-2">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              <option value="unassigned">Unassigned</option>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium mb-2">
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            value={formData.notes || ''}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>

        <JobInstallModifiersCard orgId={orgId} jobId={job.id} />

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 border rounded-md hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

