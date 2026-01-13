'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import type { Job } from '@/db/schema/jobs';
import type { Task } from '@/db/schema/tasks';
import type { JobPhoto } from '@/db/schema/job_photos';
import { Card, Badge, Input, Select, Textarea } from '@/components/ui';
import Button from '@/components/ui/Button';
import BottomSheet from '@/components/ui/BottomSheet';
import JobPhotoNotesModal from '@/components/jobs/JobPhotoNotesModal';
import { cn } from '@/lib/utils';
import useIsMobile from '@/hooks/useIsMobile';
import { buildFullAddress, getShortAddress } from '@/lib/utils/jobAddress';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { useSession } from '@/hooks/useSession';

type ActionType = 'start' | 'navigate' | 'photo' | 'step' | 'complete' | 'time';

type NormalizedAssignment = ScheduleAssignmentWithJob & {
  date: Date;
  scheduledStart: Date;
  scheduledEnd: Date;
};

type CrewOption = {
  id: string;
  displayName: string;
  active: boolean;
};

const normalizeAssignment = (assignment: ScheduleAssignmentWithJob): NormalizedAssignment => ({
  ...assignment,
  date: new Date(assignment.date),
  scheduledStart: new Date(assignment.scheduledStart),
  scheduledEnd: new Date(assignment.scheduledEnd),
});

function formatTime(value: Date): string {
  return value.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    unassigned: { label: 'Assigned', variant: 'muted' },
    scheduled: { label: 'Assigned', variant: 'default' },
    in_progress: { label: 'In progress', variant: 'gold' },
    completed: { label: 'Completed', variant: 'muted' },
    cancelled: { label: 'Blocked', variant: 'muted' },
    blocked: { label: 'Blocked', variant: 'muted' },
  };
  const config = statusConfig[status] || { label: status.replace('_', ' '), variant: 'default' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function canAssignCrewMembers(capabilities: string[]): boolean {
  return (
    capabilities.includes('admin') ||
    capabilities.includes('manage_org') ||
    capabilities.includes('manage_staff') ||
    capabilities.includes('manage_jobs')
  );
}

function TodayJobsSkeleton() {
  return (
    <div className="md:hidden space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="p-4 animate-pulse">
          <div className="h-4 w-2/3 rounded bg-bg-section/80" />
          <div className="mt-3 h-3 w-1/2 rounded bg-bg-section/80" />
          <div className="mt-4 h-10 w-full rounded bg-bg-section/80" />
        </Card>
      ))}
    </div>
  );
}

function vibrateOnce(duration = 10) {
  if (typeof navigator === 'undefined') return;
  if (!('vibrate' in navigator)) return;
  navigator.vibrate(duration);
}

const TIME_BUCKETS = ['INSTALL', 'SETUP', 'PACKDOWN', 'WAITING', 'ADMIN', 'TRAVEL', 'REWORK'];
const DELAY_REASONS = [
  'ACCESS_KEYS_NOT_READY',
  'DELIVERY_LATE_OR_WRONG',
  'WEATHER',
  'EQUIPMENT_LIFT_CRANE_WAIT',
  'SAFETY_PERMIT_INDUCTION',
  'CLIENT_CHANGE_SCOPE',
  'REWORK_DEFECT_FIX',
  'OTHER_WITH_NOTE',
];

export default function TodayJobsView({
  assignments,
  orgId,
}: {
  assignments: ScheduleAssignmentWithJob[];
  orgId: string;
}) {
  const { config } = useOrgConfig();
  const isMobile = useIsMobile();
  const resolvedOrgId = orgId || config?.orgId || '';
  const [items, setItems] = useState<NormalizedAssignment[]>(() =>
    assignments.map(normalizeAssignment)
  );
  const [showSkeleton, setShowSkeleton] = useState(isMobile);
  const [activeAction, setActiveAction] = useState<{
    type: ActionType;
    assignment: NormalizedAssignment;
  } | null>(null);

  useEffect(() => {
    setItems(assignments.map(normalizeAssignment));
  }, [assignments]);

  useEffect(() => {
    if (!isMobile) return;
    setShowSkeleton(true);
    const id = setTimeout(() => setShowSkeleton(false), 300);
    return () => clearTimeout(id);
  }, [isMobile]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime()),
    [items]
  );

  const now = new Date();
  const currentAssignment = sortedItems.find(
    (assignment) =>
      assignment.status === 'in_progress' ||
      (now >= assignment.scheduledStart && now <= assignment.scheduledEnd)
  );
  const nextAssignment = sortedItems.find((assignment) => assignment.scheduledStart > now);

  const updateJobStatus = (jobId: string, status: Job['status']) => {
    setItems((prev) =>
      prev.map((assignment) =>
        assignment.jobId === jobId ? { ...assignment, job: { ...assignment.job, status } } : assignment
      )
    );
  };

  if (showSkeleton && isMobile) {
    return <TodayJobsSkeleton />;
  }

  if (sortedItems.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">No jobs scheduled for today.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="md:hidden rounded-lg border border-border-subtle bg-bg-section/40 px-4 py-3">
        <p className="text-sm font-semibold text-text-primary">
          {currentAssignment ? 'Current job' : 'Next up'}
        </p>
        <p className="text-xs text-text-tertiary mt-1">
          {currentAssignment
            ? `${currentAssignment.job.title} starts at ${formatTime(currentAssignment.scheduledStart)}`
            : nextAssignment
              ? `${nextAssignment.job.title} starts at ${formatTime(nextAssignment.scheduledStart)}`
              : 'No upcoming jobs'}
        </p>
      </div>

      <div className="space-y-3">
        {sortedItems.map((assignment) => {
          const isCurrent = currentAssignment?.id === assignment.id;
          const isNext = nextAssignment?.id === assignment.id && !isCurrent;
          const addressLabel = buildFullAddress(assignment.job) || getShortAddress(assignment.job);
          const timeLabel = `${formatTime(assignment.scheduledStart)} - ${formatTime(assignment.scheduledEnd)}`;
          const titleLabel = assignment.job.title || config?.vocabulary?.jobSingular || 'Job';
          const clientLabel = assignment.job.clientDisplayName;

          const statusValue = assignment.status === 'cancelled' ? 'blocked' : assignment.job.status;

          return (
            <Card
              key={assignment.id}
              className={cn(
                'p-4 space-y-3',
                isCurrent && 'border-2 border-accent-gold/60 bg-accent-gold/5'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-text-primary truncate">{titleLabel}</p>
                    {isCurrent && (
                      <span className="text-[11px] font-semibold text-accent-gold uppercase">Current</span>
                    )}
                    {isNext && (
                      <span className="text-[11px] font-semibold text-text-tertiary uppercase">Next</span>
                    )}
                  </div>
                  {clientLabel && (
                    <p className="text-xs text-text-secondary mt-1 truncate">{clientLabel}</p>
                  )}
                  <p className="text-xs text-text-tertiary mt-1 truncate">{addressLabel}</p>
                </div>
                <StatusBadge status={statusValue} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span className="rounded-full bg-bg-section px-2 py-0.5 text-text-tertiary">{timeLabel}</span>
                <span className="rounded-full bg-bg-section px-2 py-0.5 text-text-tertiary">
                  {assignment.job.suburb || 'No suburb'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={assignment.job.status !== 'scheduled'}
                  onClick={() => setActiveAction({ type: 'start', assignment })}
                >
                  Start Job
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveAction({ type: 'navigate', assignment })}
                >
                  Navigate
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveAction({ type: 'photo', assignment })}
                >
                  Add Photo
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveAction({ type: 'step', assignment })}
                >
                  Mark Step Complete
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveAction({ type: 'time', assignment })}
                >
                  Log Time
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={assignment.job.status !== 'in_progress'}
                  onClick={() => setActiveAction({ type: 'complete', assignment })}
                  className="col-span-2"
                >
                  Complete Job
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {activeAction?.type === 'start' && (
        <StartJobSheet
          assignment={activeAction.assignment}
          onClose={() => setActiveAction(null)}
          onJobUpdate={(status) => updateJobStatus(activeAction.assignment.jobId, status)}
        />
      )}
      {activeAction?.type === 'complete' && (
        <CompleteJobSheet
          assignment={activeAction.assignment}
          onClose={() => setActiveAction(null)}
          onJobUpdate={(status) => updateJobStatus(activeAction.assignment.jobId, status)}
        />
      )}
      {activeAction?.type === 'navigate' && (
        <NavigateSheet assignment={activeAction.assignment} onClose={() => setActiveAction(null)} />
      )}
      {activeAction?.type === 'photo' && (
        <PhotoCaptureSheet
          assignment={activeAction.assignment}
          orgId={resolvedOrgId}
          onClose={() => setActiveAction(null)}
        />
      )}
      {activeAction?.type === 'step' && (
        <StepCompleteSheet
          assignment={activeAction.assignment}
          orgId={resolvedOrgId}
          onClose={() => setActiveAction(null)}
        />
      )}
      {activeAction?.type === 'time' && (
        <LogTimeSheet
          assignment={activeAction.assignment}
          orgId={resolvedOrgId}
          onClose={() => setActiveAction(null)}
        />
      )}
    </div>
  );
}

function StartJobSheet({
  assignment,
  onClose,
  onJobUpdate,
}: {
  assignment: NormalizedAssignment;
  onClose: () => void;
  onJobUpdate: (status: Job['status']) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startJob = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assignment.job.id, orgId: assignment.job.orgId, status: 'in_progress' }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to start job');
      onJobUpdate('in_progress');
      vibrateOnce();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title="Start job"
      description="Confirm and begin work."
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
          <p className="text-sm font-semibold text-text-primary">{assignment.job.title}</p>
          <p className="text-xs text-text-tertiary mt-1">
            Scheduled {formatTime(assignment.scheduledStart)}
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button onClick={startJob} disabled={saving} className="w-full" size="lg">
          {saving ? 'Starting...' : 'Start Job'}
        </Button>
      </div>
    </BottomSheet>
  );
}

function CompleteJobSheet({
  assignment,
  onClose,
  onJobUpdate,
}: {
  assignment: NormalizedAssignment;
  onClose: () => void;
  onJobUpdate: (status: Job['status']) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeJob = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assignment.job.id, orgId: assignment.job.orgId, status: 'completed' }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to complete job');
      onJobUpdate('completed');
      vibrateOnce();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title="Complete job"
      description="Finalize work and close this job."
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
          <p className="text-sm font-semibold text-text-primary">{assignment.job.title}</p>
          <p className="text-xs text-text-tertiary mt-1">Make sure required steps are done.</p>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button onClick={completeJob} disabled={saving} className="w-full" size="lg">
          {saving ? 'Completing...' : 'Complete Job'}
        </Button>
      </div>
    </BottomSheet>
  );
}

function LogTimeSheet({
  assignment,
  orgId,
  onClose,
}: {
  assignment: NormalizedAssignment;
  orgId: string;
  onClose: () => void;
}) {
  const { session } = useSession();
  const capabilities = session?.actor?.capabilities ?? [];
  const actorCrewMemberId = session?.actor?.crewMemberId ?? null;
  const canAssignCrew = canAssignCrewMembers(capabilities);

  const [crewMembers, setCrewMembers] = useState<CrewOption[]>([]);
  const [crewLoading, setCrewLoading] = useState(true);
  const [crewError, setCrewError] = useState<string | null>(null);
  const [crewMemberId, setCrewMemberId] = useState('');
  const actorCrewLabel = useMemo(() => {
    if (!actorCrewMemberId) return 'Unassigned';
    return crewMembers.find((crew) => crew.id === actorCrewMemberId)?.displayName ?? 'Assigned crew member';
  }, [actorCrewMemberId, crewMembers]);

  const [bucket, setBucket] = useState('INSTALL');
  const [delayReason, setDelayReason] = useState('');
  const [note, setNote] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(start.getMinutes() - 30);
    setStartTime(start.toISOString().slice(0, 16));
    setEndTime(now.toISOString().slice(0, 16));
    setBucket('INSTALL');
    setDelayReason('');
    setNote('');
  }, [assignment.id]);

  useEffect(() => {
    let active = true;
    const loadCrew = async () => {
      setCrewLoading(true);
      setCrewError(null);
      try {
        const res = await fetch(`/api/crews?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to load crew');
        if (!active) return;
        const rows = (json.data ?? []).map((row: any) => ({
          id: String(row.id),
          displayName: String(row.displayName ?? row.name ?? 'Crew member'),
          active: Boolean(row.active),
        }));
        setCrewMembers(rows);
      } catch (err) {
        if (!active) return;
        setCrewError(err instanceof Error ? err.message : 'Failed to load crew');
        setCrewMembers([]);
      } finally {
        if (active) setCrewLoading(false);
      }
    };
    void loadCrew();
    return () => {
      active = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (crewMemberId) return;
    if (actorCrewMemberId) {
      setCrewMemberId(actorCrewMemberId);
      return;
    }
    if (canAssignCrew && crewMembers.length > 0) {
      setCrewMemberId(crewMembers[0].id);
    }
  }, [actorCrewMemberId, canAssignCrew, crewMemberId, crewMembers]);

  const saveEntry = async () => {
    setSaving(true);
    setError(null);
    try {
      const resolvedCrewMemberId = crewMemberId || actorCrewMemberId || null;
      if (!resolvedCrewMemberId) {
        throw new Error('Crew member is required to log time. Ask an admin to link your account.');
      }
      if (!startTime || !endTime) {
        throw new Error('Start and end time are required.');
      }
      if (bucket === 'WAITING' && !delayReason) {
        throw new Error('Delay reason is required for WAITING.');
      }
      if (delayReason === 'OTHER_WITH_NOTE' && !note.trim()) {
        throw new Error('Note is required for OTHER waiting reason.');
      }

      const res = await fetch('/api/job-time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          jobId: assignment.job.id,
          crewMemberId: resolvedCrewMemberId,
          bucket,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          delayReason: bucket === 'WAITING' ? delayReason : null,
          note: note.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to log time');
      vibrateOnce();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log time');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title="Log time"
      description="Capture your time by work type."
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
          <p className="text-sm font-semibold text-text-primary">{assignment.job.title}</p>
          <p className="text-xs text-text-tertiary mt-1">
            {formatTime(assignment.scheduledStart)} - {formatTime(assignment.scheduledEnd)}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <Input
            type="datetime-local"
            label="Start time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={saving}
          />
          <Input
            type="datetime-local"
            label="End time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={saving}
          />
          {canAssignCrew ? (
            <Select
              label="Crew member"
              value={crewMemberId}
              onChange={(e) => setCrewMemberId(e.target.value)}
              disabled={saving || crewLoading}
            >
              <option value="">
                {crewLoading ? 'Loading crew...' : 'Select crew member'}
              </option>
              {crewMembers.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.displayName}{crew.active ? '' : ' (inactive)'}
                </option>
              ))}
            </Select>
          ) : (
            <Input label="Crew member" value={actorCrewLabel} disabled />
          )}
          <Select label="Bucket" value={bucket} onChange={(e) => setBucket(e.target.value)} disabled={saving}>
            {TIME_BUCKETS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          {bucket === 'WAITING' && (
            <>
              <Select
                label="Delay reason"
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                disabled={saving}
              >
                <option value="">Select reason</option>
                {DELAY_REASONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Textarea
                label="Note (required for OTHER)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={saving}
              />
            </>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button onClick={saveEntry} disabled={saving} className="w-full" size="lg">
          {saving ? 'Saving...' : 'Log Time'}
        </Button>
      </div>
    </BottomSheet>
  );
}

function NavigateSheet({ assignment, onClose }: { assignment: NormalizedAssignment; onClose: () => void }) {
  const address = buildFullAddress(assignment.job);
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  return (
    <BottomSheet isOpen onClose={onClose} title="Navigate" description="Open directions to the job site.">
      <div className="space-y-3">
        <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
          <p className="text-sm font-semibold text-text-primary">{assignment.job.title}</p>
          <p className="text-xs text-text-tertiary mt-1">{address || 'No address on file.'}</p>
        </div>
        {mapsUrl ? (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => {
              window.open(mapsUrl, '_blank', 'noopener,noreferrer');
            }}
          >
            Open in Maps
          </Button>
        ) : (
          <Button variant="secondary" size="lg" className="w-full" disabled>
            Address missing
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}

function PhotoCaptureSheet({
  assignment,
  orgId,
  onClose,
}: {
  assignment: NormalizedAssignment;
  orgId: string;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedPhoto, setUploadedPhoto] = useState<JobPhoto | null>(null);
  const [showAnnotate, setShowAnnotate] = useState(false);
  const photoAddress = buildFullAddress(assignment.job) || 'No address provided.';

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('orgId', orgId);
      form.set('jobId', assignment.job.id);
      form.set('file', file);

      const res = await fetch('/api/job-photos/upload', { method: 'POST', body: form });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to upload photo');
      setUploadedPhoto(json.data as JobPhoto);
      setFile(null);
      vibrateOnce();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <BottomSheet isOpen onClose={onClose} title="Add photo" description="Capture and attach a site photo.">
      <div className="space-y-4">
        <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
          <p className="text-sm font-semibold text-text-primary">{assignment.job.title}</p>
          <p className="text-xs text-text-tertiary mt-1">{photoAddress}</p>
        </div>

        {previewUrl ? (
          <div className="rounded-xl overflow-hidden border border-border-subtle bg-bg-base">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Preview" className="w-full h-auto" />
          </div>
        ) : uploadedPhoto ? (
          <div className="rounded-xl overflow-hidden border border-border-subtle bg-bg-base">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={uploadedPhoto.storagePath} alt="Uploaded photo" className="w-full h-auto" />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border-subtle p-6 text-center text-sm text-text-tertiary">
            Capture a photo to preview it here.
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <input
            id="photo-capture"
            type="file"
            accept="image/*"
            capture={isMobile ? 'environment' : undefined}
            className="hidden"
            onChange={(e) => {
              setUploadedPhoto(null);
              setShowAnnotate(false);
              setFile(e.target.files?.[0] ?? null);
              e.currentTarget.value = '';
            }}
            disabled={uploading}
          />
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => document.getElementById('photo-capture')?.click()}
            disabled={uploading}
          >
            {file ? 'Retake photo' : 'Use camera'}
          </Button>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={upload}
            disabled={!file || uploading}
          >
            {uploading ? 'Uploading...' : 'Save photo'}
          </Button>
          {uploadedPhoto && (
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => setShowAnnotate(true)}
            >
              Annotate photo
            </Button>
          )}
        </div>
      </div>

      {uploadedPhoto && showAnnotate && (
        <JobPhotoNotesModal
          orgId={orgId}
          jobId={assignment.job.id}
          photo={uploadedPhoto}
          onClose={() => setShowAnnotate(false)}
          onSaved={(updated) => {
            setUploadedPhoto(updated);
            setShowAnnotate(false);
          }}
        />
      )}
    </BottomSheet>
  );
}

function StepCompleteSheet({
  assignment,
  orgId,
  onClose,
}: {
  assignment: NormalizedAssignment;
  orgId: string;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tasks?orgId=${orgId}&jobId=${assignment.job.id}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'Failed to load steps');
        if (active) setTasks(json.data as Task[]);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load steps');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [assignment.job.id, orgId]);

  const toggleTask = async (task: Task) => {
    if (updatingId) return;
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    setUpdatingId(task.id);
    setError(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, orgId, status: nextStatus }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error?.message || 'Failed to update step');
      setTasks((prev) =>
        prev ? prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)) : prev
      );
      vibrateOnce();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update step');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <BottomSheet
      isOpen
      onClose={onClose}
      title="Work steps"
      description="Tap a step to mark it complete."
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
          <p className="text-sm font-semibold text-text-primary">{assignment.job.title}</p>
          <p className="text-xs text-text-tertiary mt-1">Steps sync instantly.</p>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-bg-section/70 animate-pulse" />
            ))}
          </div>
        ) : tasks && tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((task) => {
                const isCompleted = task.status === 'completed';
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => void toggleTask(task)}
                    disabled={updatingId === task.id}
                    className={cn(
                      'w-full text-left rounded-lg border px-3 py-3 transition-colors',
                      'min-h-[56px] flex items-start gap-3',
                      isCompleted
                        ? 'border-border-subtle bg-bg-section/40 text-text-tertiary'
                        : 'border-border-subtle bg-bg-base hover:border-accent-gold/60'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      readOnly
                      className="mt-1 h-5 w-5 rounded border-border-subtle bg-bg-input"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-sm font-medium', isCompleted && 'line-through')}>
                          {task.title}
                        </p>
                        {task.isRequired && (
                          <Badge variant="muted" className="text-[10px]">
                            Critical
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-text-tertiary mt-1 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No steps found for this job.</p>
        )}
      </div>
    </BottomSheet>
  );
}
