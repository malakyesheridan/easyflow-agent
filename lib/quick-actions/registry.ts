import type { Job } from '@/db/schema/jobs';
import type { CrewMember } from '@/db/schema/crew_members';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';

export type QuickActionEntityType = 'job' | 'schedule' | 'crew' | 'material';

export type QuickActionContext<T = any> = {
  entityType: QuickActionEntityType;
  entity: T;
  orgId: string;
  capabilities: string[];
  showToast: (message: string, variant?: 'success' | 'error') => void;
  confirm: (message: string) => boolean;
  prompt: (message: string, defaultValue?: string) => string | null;
  pickFile: (accept?: string) => Promise<File | null>;
  navigate: (href: string) => void;
  refresh: () => void;
  extra?: Record<string, unknown>;
};

export type QuickActionDefinition<T = any> = {
  id: string;
  label: string;
  icon?: string;
  entityTypes: QuickActionEntityType[];
  requiredCapabilities?: string[];
  isApplicable?: (ctx: QuickActionContext<T>) => boolean;
  requiresConfirm?: boolean;
  confirmMessage?: (ctx: QuickActionContext<T>) => string;
  handler: (ctx: QuickActionContext<T>) => Promise<void>;
};

const jobActions: QuickActionDefinition<Job>[] = [
  {
    id: 'job_mark_in_progress',
    label: 'Mark in progress',
    entityTypes: ['job'],
    requiredCapabilities: ['manage_jobs', 'update_jobs'],
    isApplicable: ({ entity }) => entity.status !== 'in_progress' && entity.status !== 'completed',
    handler: async ({ entity, orgId, showToast, refresh }) => {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entity.id, orgId, status: 'in_progress' }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to update job');
      showToast('Job marked in progress.', 'success');
      refresh();
    },
  },
  {
    id: 'job_mark_completed',
    label: 'Mark completed',
    entityTypes: ['job'],
    requiredCapabilities: ['manage_jobs', 'update_jobs'],
    isApplicable: ({ entity }) => entity.status !== 'completed',
    requiresConfirm: true,
    confirmMessage: ({ entity }) => `Mark "${entity.title}" as completed?`,
    handler: async ({ entity, orgId, showToast, refresh }) => {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entity.id, orgId, status: 'completed' }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to update job');
      showToast('Job marked completed.', 'success');
      refresh();
    },
  },
  {
    id: 'job_add_note',
    label: 'Add note',
    entityTypes: ['job'],
    handler: async ({ entity, orgId, prompt, showToast, refresh }) => {
      const message = prompt('Add a note for this job:', '');
      if (!message || !message.trim()) return;
      const res = await fetch('/api/job-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, jobId: entity.id, message: message.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to add note');
      showToast('Note added.', 'success');
      refresh();
    },
  },
  {
    id: 'job_upload_photo',
    label: 'Upload photo',
    entityTypes: ['job'],
    handler: async ({ entity, orgId, pickFile, showToast, refresh }) => {
      const file = await pickFile('image/*');
      if (!file) return;
      const form = new FormData();
      form.append('orgId', orgId);
      form.append('jobId', entity.id);
      form.append('file', file);
      const res = await fetch('/api/job-photos/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to upload photo');
      showToast('Photo uploaded.', 'success');
      refresh();
    },
  },
  {
    id: 'job_assign_crew',
    label: 'Assign crew',
    entityTypes: ['job'],
    requiredCapabilities: ['manage_schedule'],
    handler: async ({ entity, orgId, navigate }) => {
      navigate(`/schedule?orgId=${orgId}&jobId=${entity.id}`);
    },
  },
  {
    id: 'job_reschedule',
    label: 'Reschedule',
    entityTypes: ['job'],
    requiredCapabilities: ['manage_schedule'],
    handler: async ({ entity, orgId, navigate }) => {
      navigate(`/schedule?orgId=${orgId}&jobId=${entity.id}`);
    },
  },
  {
    id: 'job_send_update',
    label: 'Send update',
    entityTypes: ['job'],
    handler: async ({ entity, orgId, prompt, showToast, refresh }) => {
      const message = prompt('Client update message:', '');
      if (!message || !message.trim()) return;
      const res = await fetch('/api/job-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, jobId: entity.id, message: `Client update: ${message.trim()}` }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to log client update');
      showToast('Client update logged.', 'success');
      refresh();
    },
  },
  {
    id: 'job_generate_report',
    label: 'Generate report',
    entityTypes: ['job'],
    handler: async ({ entity, navigate }) => {
      navigate(`/jobs/${entity.id}`);
    },
  },
  {
    id: 'job_edit',
    label: 'Edit job',
    entityTypes: ['job'],
    requiredCapabilities: ['manage_jobs'],
    handler: async ({ entity, navigate }) => {
      navigate(`/jobs/${entity.id}/edit`);
    },
  },
  {
    id: 'job_duplicate',
    label: 'Duplicate job',
    entityTypes: ['job'],
    requiredCapabilities: ['manage_jobs'],
    handler: async ({ entity, showToast, refresh, navigate }) => {
      const res = await fetch(`/api/jobs/${entity.id}/duplicate?orgId=${entity.orgId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to duplicate job');
      if (json.data?.job?.id) {
        navigate(`/jobs/${json.data.job.id}`);
      }
      showToast('Job duplicated.', 'success');
      refresh();
    },
  },
  {
    id: 'job_delete',
    label: 'Delete job',
    entityTypes: ['job'],
    requiredCapabilities: ['manage_jobs'],
    handler: async ({ entity, orgId, showToast, refresh }) => {
      try {
        const assignmentsResponse = await fetch(
          `/api/schedule-assignments?orgId=${entity.orgId}&jobId=${entity.id}`
        );
        const assignmentsData = await assignmentsResponse.json();
        const assignments = assignmentsData.ok ? assignmentsData.data : [];
        const activeAssignments = assignments.filter(
          (a: any) => a.status !== 'completed' && a.status !== 'cancelled'
        );

        let confirmMessage = `Are you sure you want to delete "${entity.title}"?\n\n`;
        confirmMessage += `This action cannot be undone and will delete all associated work steps.`;

        if (activeAssignments.length > 0) {
          confirmMessage += `\n\nWARNING: This job has ${activeAssignments.length} active schedule assignment${activeAssignments.length !== 1 ? 's' : ''}. `;
          confirmMessage += `Deleting this job will also delete all schedule assignments.`;
        } else if (assignments.length > 0) {
          confirmMessage += `\n\nNote: This job has ${assignments.length} schedule assignment${assignments.length !== 1 ? 's' : ''} (completed/cancelled).`;
        }

        if (!window.confirm(confirmMessage)) {
          return;
        }
      } catch {
        if (!window.confirm(`Are you sure you want to delete "${entity.title}"? This action cannot be undone.`)) {
          return;
        }
      }

      const res = await fetch(`/api/jobs/${entity.id}?orgId=${orgId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to delete job');
      showToast('Job deleted.', 'success');
      refresh();
    },
  },
];

const scheduleActions: QuickActionDefinition<ScheduleAssignmentWithJob>[] = [
  {
    id: 'schedule_reschedule',
    label: 'Reschedule job',
    entityTypes: ['schedule'],
    requiredCapabilities: ['manage_schedule'],
    handler: async ({ entity, orgId, prompt, showToast, refresh }) => {
      const currentDate = entity.date instanceof Date ? entity.date.toISOString().slice(0, 10) : '';
      const input = prompt('Enter new date/time (YYYY-MM-DD HH:MM):', `${currentDate} 08:00`);
      if (!input) return;
      const [datePart, timePart] = input.trim().split(' ');
      if (!datePart || !timePart) throw new Error('Invalid date/time format');
      const [hours, minutes] = timePart.split(':').map((v) => Number(v));
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) throw new Error('Invalid time');
      const startMinutes = hours * 60 + minutes - 360;
      const duration = entity.endMinutes - entity.startMinutes;
      if (startMinutes < 0 || startMinutes > 720) throw new Error('Time must be within workday hours');
      if (startMinutes + duration > 720) throw new Error('Ends after workday');
      const res = await fetch('/api/schedule-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entity.id,
          orgId,
          crewId: entity.crewId,
          date: new Date(`${datePart}T00:00:00.000Z`).toISOString(),
          startMinutes,
          endMinutes: startMinutes + duration,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to reschedule');
      showToast('Job rescheduled.', 'success');
      refresh();
    },
  },
  {
    id: 'schedule_reassign',
    label: 'Reassign crew',
    entityTypes: ['schedule'],
    requiredCapabilities: ['manage_schedule'],
    handler: async ({ entity, orgId, prompt, showToast, refresh, extra }) => {
      const crewOptions = (extra?.crewOptions as Array<{ id: string; name: string }> | undefined) ?? [];
      const hint = crewOptions.length
        ? `\\n${crewOptions.map((c) => `${c.name} (${c.id.slice(0, 8)})`).join('\\n')}`
        : '';
      const input = prompt(`Enter crew ID to assign:${hint}`, entity.crewId ?? undefined);
      if (!input) return;
      const crewId = input.trim();
      const res = await fetch('/api/schedule-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entity.id,
          orgId,
          crewId,
          date: entity.date instanceof Date ? entity.date.toISOString() : new Date(entity.date).toISOString(),
          startMinutes: entity.startMinutes,
          endMinutes: entity.endMinutes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to reassign');
      showToast('Crew reassigned.', 'success');
      refresh();
    },
  },
  {
    id: 'schedule_cancel',
    label: 'Mark cancelled',
    entityTypes: ['schedule'],
    requiredCapabilities: ['manage_schedule'],
    requiresConfirm: true,
    confirmMessage: ({ entity }) => `Cancel the schedule for "${entity.job.title}"?`,
    handler: async ({ entity, orgId, showToast, refresh }) => {
      const res = await fetch('/api/schedule-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entity.id,
          orgId,
          status: 'cancelled',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to cancel assignment');
      showToast('Schedule cancelled.', 'success');
      refresh();
    },
  },
  {
    id: 'schedule_view_job',
    label: 'Jump to job detail',
    entityTypes: ['schedule'],
    handler: async ({ entity, navigate }) => {
      navigate(`/jobs/${entity.jobId}`);
    },
  },
];

const crewActions: QuickActionDefinition<CrewMember>[] = [
  {
    id: 'crew_view_jobs',
    label: "View today's jobs",
    entityTypes: ['crew'],
    handler: async ({ entity, orgId, navigate }) => {
      navigate(`/schedule?orgId=${orgId}&highlightCrewId=${entity.id}`);
    },
  },
  {
    id: 'crew_message',
    label: 'Message crew',
    entityTypes: ['crew'],
    handler: async ({ entity, showToast }) => {
      const email = (entity as any).email as string | null | undefined;
      const phone = (entity as any).phone as string | null | undefined;
      if (email) {
        window.location.href = `mailto:${email}`;
        return;
      }
      if (phone) {
        window.location.href = `tel:${phone}`;
        return;
      }
      showToast('No contact details available.', 'error');
    },
  },
  {
    id: 'crew_block',
    label: 'Block availability',
    entityTypes: ['crew'],
    requiredCapabilities: ['manage_staff'],
    requiresConfirm: true,
    confirmMessage: ({ entity }) => `Set ${entity.displayName || 'crew member'} as unavailable?`,
    handler: async ({ entity, orgId, showToast, refresh }) => {
      if (entity.active === false) {
        showToast('Crew member already unavailable.', 'error');
        return;
      }
      const res = await fetch('/api/crews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entity.id, orgId, active: false }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to update crew');
      showToast('Crew availability blocked.', 'success');
      refresh();
    },
  },
  {
    id: 'crew_stats',
    label: 'View performance stats',
    entityTypes: ['crew'],
    handler: async ({ entity, navigate }) => {
      navigate(`/crews/${entity.id}`);
    },
  },
];

type MaterialQuickEntity = {
  id: string;
  name: string;
};

const materialActions: QuickActionDefinition<MaterialQuickEntity>[] = [
  {
    id: 'material_add_stock',
    label: 'Add stock',
    entityTypes: ['material'],
    requiredCapabilities: ['manage_jobs'],
    handler: async ({ entity, orgId, prompt, showToast, refresh }) => {
      const qtyRaw = prompt(`Add stock for ${entity.name}:`, '0');
      if (!qtyRaw) return;
      const qty = Number(qtyRaw);
      if (!Number.isFinite(qty)) throw new Error('Invalid quantity');
      const reason = prompt('Reason (optional):', '') || null;
      const res = await fetch('/api/material-inventory-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          materialId: entity.id,
          eventType: 'stock_added',
          quantity: qty,
          reason: reason?.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to add stock');
      showToast('Stock updated.', 'success');
      refresh();
    },
  },
  {
    id: 'material_flag_issue',
    label: 'Flag issue',
    entityTypes: ['material'],
    requiredCapabilities: ['manage_jobs'],
    handler: async ({ entity, orgId, prompt, showToast, refresh }) => {
      const issue = prompt(`Flag an issue for ${entity.name}:`, '');
      if (!issue || !issue.trim()) return;
      const res = await fetch('/api/material-inventory-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          materialId: entity.id,
          eventType: 'manual_adjustment',
          quantity: 0,
          reason: `Issue flagged: ${issue.trim()}`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || 'Failed to flag issue');
      showToast('Issue flagged.', 'success');
      refresh();
    },
  },
  {
    id: 'material_usage',
    label: 'View usage insights',
    entityTypes: ['material'],
    handler: async ({ entity, navigate }) => {
      navigate(`/warehouse/materials/${entity.id}`);
    },
  },
];

export const quickActionRegistry: QuickActionDefinition[] = [
  ...jobActions,
  ...scheduleActions,
  ...crewActions,
  ...materialActions,
];

export function getQuickActions<T>(
  entityType: QuickActionEntityType,
  ctx: QuickActionContext<T>
): QuickActionDefinition<T>[] {
  return quickActionRegistry
    .filter((action) => action.entityTypes.includes(entityType))
    .filter((action) => {
      if (!action.requiredCapabilities || action.requiredCapabilities.length === 0) return true;
      if (ctx.capabilities.includes('admin')) return true;
      return action.requiredCapabilities.some((cap) => ctx.capabilities.includes(cap));
    })
    .filter((action) => (action.isApplicable ? action.isApplicable(ctx) : true)) as QuickActionDefinition<T>[];
}
