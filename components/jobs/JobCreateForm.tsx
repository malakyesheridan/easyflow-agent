'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, Input, Textarea, Select, Button } from '@/components/ui';
import type { CreateJobInput } from '@/lib/validators/jobs';
import { WORKDAY_END_HOUR, WORKDAY_START_HOUR } from '@/components/schedule/scheduleConstants';
import { toOrgStartOfDay } from '@/lib/utils/scheduleDayOwnership';
import { useSession } from '@/hooks/useSession';
import ClientSelectField from '@/components/clients/ClientSelectField';

interface JobCreateFormProps {
  orgId: string;
}

export default function JobCreateForm({ orgId }: JobCreateFormProps) {
  const router = useRouter();
  const { session } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crewOptions, setCrewOptions] = useState<Array<{ id: string; name: string; role?: string }>>([]);
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [isLoadingCrews, setIsLoadingCrews] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateJobInput>>({
    orgId,
    title: '',
    clientId: null,
    addressLine1: '',
    addressLine2: '',
    suburb: '',
    state: '',
    postcode: '',
    status: 'unassigned',
    priority: 'normal',
    scheduledStart: '',
    scheduledEnd: '',
    notes: '',
  });

  useEffect(() => {
    if (!orgId) return;
    let isActive = true;
    setIsLoadingCrews(true);
    fetch(`/api/crews?orgId=${orgId}&activeOnly=true`)
      .then((res) => res.json())
      .then((data) => {
        if (!isActive) return;
        if (!data?.ok || !Array.isArray(data.data)) {
          throw new Error(data?.error?.message || 'Failed to load employees');
        }
        const options = data.data.map((crew: any) => {
          const displayName = String(crew.displayName || '').trim();
          const fullName = `${crew.firstName || ''} ${crew.lastName || ''}`.trim();
          return {
            id: String(crew.id),
            name: (displayName || fullName || `Crew ${String(crew.id).slice(0, 8)}`).trim(),
            role: crew.role ? String(crew.role) : undefined,
          };
        });
        setCrewOptions(options);
      })
      .catch(() => {
        if (!isActive) return;
        setCrewOptions([]);
      })
      .finally(() => {
        if (isActive) setIsLoadingCrews(false);
      });
    return () => {
      isActive = false;
    };
  }, [orgId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title?.trim()) {
      setError('Title is required');
      return;
    }

    if (!formData.addressLine1?.trim()) {
      setError('Address is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Convert datetime-local format to ISO string
      // Only convert if the value is not empty and is a valid date
      let scheduledStart: string | null = null;
      let scheduledStartDate: Date | null = null;
      if (formData.scheduledStart && formData.scheduledStart.trim()) {
        const startDate = new Date(formData.scheduledStart);
        if (!isNaN(startDate.getTime())) {
          scheduledStart = startDate.toISOString();
          scheduledStartDate = startDate;
        }
      }
      
      let scheduledEnd: string | null = null;
      let scheduledEndDate: Date | null = null;
      if (formData.scheduledEnd && formData.scheduledEnd.trim()) {
        const endDate = new Date(formData.scheduledEnd);
        if (!isNaN(endDate.getTime())) {
          scheduledEnd = endDate.toISOString();
          scheduledEndDate = endDate;
        }
      }

      if (selectedCrewIds.length > 0) {
        if (!scheduledStartDate || !scheduledEndDate) {
          setError('Scheduled start and end are required to assign employees.');
          setIsSubmitting(false);
          return;
        }
        const sameDay = scheduledStartDate.toDateString() === scheduledEndDate.toDateString();
        if (!sameDay) {
          setError('Scheduled start and end must be on the same day.');
          setIsSubmitting(false);
          return;
        }
        const workdayStartMinutes = WORKDAY_START_HOUR * 60;
        const workdayEndMinutes = WORKDAY_END_HOUR * 60;
        const startMinutes =
          scheduledStartDate.getHours() * 60 + scheduledStartDate.getMinutes() - workdayStartMinutes;
        const endMinutes =
          scheduledEndDate.getHours() * 60 + scheduledEndDate.getMinutes() - workdayStartMinutes;

        if (startMinutes < 0 || endMinutes > workdayEndMinutes - workdayStartMinutes) {
          setError('Scheduled time must be within workday hours (06:00 to 18:00).');
          setIsSubmitting(false);
          return;
        }
        if (startMinutes >= endMinutes) {
          setError('Scheduled start must be before scheduled end.');
          setIsSubmitting(false);
          return;
        }
      }

      const payload: CreateJobInput = {
        orgId,
        title: formData.title,
        clientId: formData.clientId ?? null,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2 || null,
        suburb: formData.suburb || null,
        state: formData.state || null,
        postcode: formData.postcode || null,
        status:
          selectedCrewIds.length > 0 && formData.status === 'unassigned'
            ? 'scheduled'
            : (formData.status as any) || 'unassigned',
        priority: (formData.priority as any) || 'normal',
        scheduledStart,
        scheduledEnd,
        notes: formData.notes || null,
      };

      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.ok) {
        if (selectedCrewIds.length > 0 && scheduledStartDate && scheduledEndDate) {
          const workdayStartMinutes = WORKDAY_START_HOUR * 60;
          const startMinutes =
            scheduledStartDate.getHours() * 60 + scheduledStartDate.getMinutes() - workdayStartMinutes;
          const endMinutes =
            scheduledEndDate.getHours() * 60 + scheduledEndDate.getMinutes() - workdayStartMinutes;
          const dateISO = toOrgStartOfDay(scheduledStartDate).toISOString();
          const assignmentErrors: string[] = [];

          for (const crewId of selectedCrewIds) {
            try {
              const res = await fetch('/api/schedule-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orgId,
                  jobId: data.data.id,
                  crewId,
                  date: dateISO,
                  startMinutes,
                  endMinutes,
                  assignmentType: 'default',
                }),
              });
              const json = await res.json().catch(() => ({}));
              if (!res.ok || !json?.ok) {
                assignmentErrors.push(json?.error?.message || json?.error || 'Failed to assign employee');
              }
            } catch {
              assignmentErrors.push('Failed to assign employee');
            }
          }

          if (assignmentErrors.length > 0) {
            alert(`Job created, but failed to assign ${assignmentErrors.length} employee(s).`);
          }
        }

        router.push(`/jobs/${data.data.id}`);
      } else {
        setError(data.error.message || 'Failed to create job');
      }
    } catch (err) {
      setError('Failed to create job');
      console.error('Error creating job:', err);
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

  const toggleCrewSelection = (crewId: string) => {
    setSelectedCrewIds((prev) =>
      prev.includes(crewId) ? prev.filter((id) => id !== crewId) : [...prev, crewId]
    );
  };

  const canManageClients =
    session?.actor?.capabilities?.includes('admin') ||
    session?.actor?.capabilities?.includes('manage_org') ||
    session?.actor?.capabilities?.includes('manage_jobs');

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Input
          label="Title *"
          id="title"
          name="title"
          required
          value={formData.title}
          onChange={handleChange}
        />

        <ClientSelectField
          orgId={orgId}
          value={(formData.clientId as string | null) ?? null}
          onChange={(clientId) => setFormData((prev) => ({ ...prev, clientId }))}
          canManage={Boolean(canManageClients)}
        />

        <Input
          label="Address Line 1 *"
          id="addressLine1"
          name="addressLine1"
          required
          value={formData.addressLine1}
          onChange={handleChange}
        />

        <Input
          label="Address Line 2"
          id="addressLine2"
          name="addressLine2"
          value={formData.addressLine2 || ''}
          onChange={handleChange}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Suburb"
            id="suburb"
            name="suburb"
            value={formData.suburb || ''}
            onChange={handleChange}
          />
          <Input
            label="State"
            id="state"
            name="state"
            value={formData.state || ''}
            onChange={handleChange}
          />
          <Input
            label="Postcode"
            id="postcode"
            name="postcode"
            value={formData.postcode || ''}
            onChange={handleChange}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Scheduled Start"
            type="datetime-local"
            id="scheduledStart"
            name="scheduledStart"
            value={formData.scheduledStart || ''}
            onChange={handleChange}
          />
          <Input
            label="Scheduled End"
            type="datetime-local"
            id="scheduledEnd"
            name="scheduledEnd"
            value={formData.scheduledEnd || ''}
            onChange={handleChange}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Assign Employees</label>
          {isLoadingCrews ? (
            <p className="text-sm text-text-tertiary">Loading employees...</p>
          ) : crewOptions.length === 0 ? (
            <p className="text-sm text-text-tertiary">No active employees found.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-border-subtle rounded-md divide-y divide-border-subtle">
              {crewOptions.map((crew) => (
                <label key={crew.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCrewIds.includes(crew.id)}
                    onChange={() => toggleCrewSelection(crew.id)}
                  />
                  <span className="text-text-primary">{crew.name}</span>
                  {crew.role && (
                    <span className="text-xs text-text-tertiary">({crew.role})</span>
                  )}
                </label>
              ))}
            </div>
          )}
          <p className="text-xs text-text-tertiary mt-1">
            Selecting employees requires scheduled start and end times.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Priority"
            id="priority"
            name="priority"
            value={formData.priority}
            onChange={handleChange}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>

          <Select
            label="Status"
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
          >
            <option value="unassigned">Unassigned</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </Select>
        </div>

        <Textarea
          label="Notes"
          id="notes"
          name="notes"
          rows={4}
          value={formData.notes || ''}
          onChange={handleChange}
        />

        <div className="flex gap-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Job'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

