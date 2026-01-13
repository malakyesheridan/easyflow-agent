'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CollapsibleSection, Button, Input, Select, Textarea } from '@/components/ui';
import { useSession } from '@/hooks/useSession';

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: any };

type JobTimeEntry = {
  id: string;
  jobId: string;
  crewMemberId: string | null;
  crewMemberName?: string | null;
  minutes: number;
  startTime: string | null;
  endTime: string | null;
  createdAt: string;
  bucket: string | null;
  delayReason: string | null;
  note: string | null;
};

type FixState = {
  bucket: string;
  delayReason: string;
  note: string;
};

type CrewOption = {
  id: string;
  displayName: string;
  active: boolean;
};

const bucketOptions = ['INSTALL', 'SETUP', 'PACKDOWN', 'WAITING', 'ADMIN', 'TRAVEL', 'REWORK'];
const delayReasons = [
  'ACCESS_KEYS_NOT_READY',
  'DELIVERY_LATE_OR_WRONG',
  'WEATHER',
  'EQUIPMENT_LIFT_CRANE_WAIT',
  'SAFETY_PERMIT_INDUCTION',
  'CLIENT_CHANGE_SCOPE',
  'REWORK_DEFECT_FIX',
  'OTHER_WITH_NOTE',
];

function getApiErrorMessage(payload: ApiResponse<any>): string | undefined {
  if (payload.ok) return undefined;
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message;
}

function canAssignCrewMembers(capabilities: string[]): boolean {
  return (
    capabilities.includes('admin') ||
    capabilities.includes('manage_org') ||
    capabilities.includes('manage_staff') ||
    capabilities.includes('manage_jobs')
  );
}

function toIso(localValue: string): string {
  const parsed = new Date(localValue);
  return parsed.toISOString();
}

function formatRange(start: string | null, end: string | null): string {
  if (!start || !end) return 'Time not set';
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'Time not set';
  return `${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function JobTimeEntriesCard(props: { orgId: string; jobId: string }) {
  const { session } = useSession();
  const capabilities = session?.actor?.capabilities ?? [];
  const actorCrewMemberId = session?.actor?.crewMemberId ?? null;
  const canAssignCrew = canAssignCrewMembers(capabilities);

  const [entries, setEntries] = useState<JobTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [crewMembers, setCrewMembers] = useState<CrewOption[]>([]);
  const [crewLoading, setCrewLoading] = useState(true);
  const [crewError, setCrewError] = useState<string | null>(null);
  const [crewMemberId, setCrewMemberId] = useState('');

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [bucket, setBucket] = useState('INSTALL');
  const [delayReason, setDelayReason] = useState('');
  const [note, setNote] = useState('');

  const [fixes, setFixes] = useState<Record<string, FixState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/job-time-entries?orgId=${props.orgId}&jobId=${props.jobId}`);
      const json = (await res.json()) as ApiResponse<JobTimeEntry[]>;
      if (!res.ok || !json.ok) throw new Error(getApiErrorMessage(json) || 'Failed to load time entries');
      setEntries(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load time entries');
    } finally {
      setLoading(false);
    }
  }, [props.jobId, props.orgId]);

  const loadCrew = useCallback(async () => {
    setCrewLoading(true);
    setCrewError(null);
    try {
      const res = await fetch(`/api/crews?orgId=${props.orgId}`);
      const json = (await res.json()) as ApiResponse<any[]>;
      if (!res.ok || !json.ok) throw new Error(getApiErrorMessage(json) || 'Failed to load crew');
      const rows = (json.data ?? []).map((row) => ({
        id: String(row.id),
        displayName: String(row.displayName ?? row.name ?? 'Crew member'),
        active: Boolean(row.active),
      }));
      setCrewMembers(rows);
    } catch (e) {
      setCrewError(e instanceof Error ? e.message : 'Failed to load crew');
      setCrewMembers([]);
    } finally {
      setCrewLoading(false);
    }
  }, [props.orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCrew();
  }, [loadCrew]);

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

  const unbucketedEntries = useMemo(() => entries.filter((entry) => !entry.bucket), [entries]);

  useEffect(() => {
    if (unbucketedEntries.length === 0) return;
    setFixes((prev) => {
      const next = { ...prev };
      for (const entry of unbucketedEntries) {
        if (!next[entry.id]) {
          next[entry.id] = { bucket: 'INSTALL', delayReason: '', note: '' };
        }
      }
      return next;
    });
  }, [unbucketedEntries]);

  const crewById = useMemo(() => {
    const map = new Map<string, string>();
    for (const crew of crewMembers) {
      map.set(crew.id, crew.displayName);
    }
    return map;
  }, [crewMembers]);

  const actorCrewLabel = useMemo(() => {
    if (!actorCrewMemberId) return 'Unassigned';
    return crewById.get(actorCrewMemberId) ?? 'Assigned crew member';
  }, [actorCrewMemberId, crewById]);

  const handleCreate = async () => {
    if (!startTime || !endTime) {
      setError('Start and end time are required.');
      return;
    }
    const resolvedCrewMemberId = crewMemberId || actorCrewMemberId || null;
    if (!resolvedCrewMemberId) {
      setError('Crew member is required to log time. Ask an admin to link your account or select a crew member.');
      return;
    }
    if (bucket === 'WAITING' && !delayReason) {
      setError('Delay reason is required for WAITING.');
      return;
    }
    if (delayReason === 'OTHER_WITH_NOTE' && !note.trim()) {
      setError('Note is required for OTHER waiting reason.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: props.orgId,
          jobId: props.jobId,
          crewMemberId: resolvedCrewMemberId,
          bucket,
          startTime: toIso(startTime),
          endTime: toIso(endTime),
          delayReason: bucket === 'WAITING' ? delayReason : null,
          note: note.trim() || null,
        }),
      });
      const json = (await res.json()) as ApiResponse<JobTimeEntry>;
      if (!res.ok || !json.ok) throw new Error(getApiErrorMessage(json) || 'Failed to add time entry');
      setStartTime('');
      setEndTime('');
      setDelayReason('');
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add time entry');
    } finally {
      setSaving(false);
    }
  };

  const handleFixSave = async (entryId: string) => {
    const fix = fixes[entryId];
    if (!fix) return;
    if (fix.bucket === 'WAITING' && !fix.delayReason) {
      setError('Delay reason is required for WAITING.');
      return;
    }
    if (fix.delayReason === 'OTHER_WITH_NOTE' && !fix.note.trim()) {
      setError('Note is required for OTHER waiting reason.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/job-time-entries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entryId,
          orgId: props.orgId,
          bucket: fix.bucket,
          delayReason: fix.bucket === 'WAITING' ? fix.delayReason : null,
          note: fix.note.trim() || null,
        }),
      });
      const json = (await res.json()) as ApiResponse<JobTimeEntry>;
      if (!res.ok || !json.ok) throw new Error(getApiErrorMessage(json) || 'Failed to update time entry');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update time entry');
    } finally {
      setSaving(false);
    }
  };

  const totalMinutes = entries.reduce((sum, row) => sum + (Number(row.minutes) || 0), 0);
  const summary = loading
    ? 'Loading time entries...'
    : entries.length === 0
      ? 'No time entries logged yet'
      : `Total bucketed time logged: ${totalMinutes}m`;

  return (
    <CollapsibleSection
      title="Time buckets"
      description="Classify onsite time by activity for productivity metrics."
      summary={summary}
      defaultOpen={entries.length === 0}
      storageKey={`job-detail-${props.jobId}-time-entries`}
    >
      {error && (
        <div className="p-3 mb-4 bg-destructive/10 border border-destructive rounded-md text-sm text-destructive">
          {error}
        </div>
      )}
      {crewError && !error && (
        <div className="p-3 mb-4 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs text-amber-400">
          {crewError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
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
          {bucketOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </Select>
        <div className="flex items-end">
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Saving...' : 'Add entry'}
          </Button>
        </div>
      </div>

      {bucket === 'WAITING' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Select
            label="Delay reason"
            value={delayReason}
            onChange={(e) => setDelayReason(e.target.value)}
            disabled={saving}
          >
            <option value="">Select reason</option>
            {delayReasons.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Select>
          <Textarea
            label="Note (required for OTHER)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
          />
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-secondary">Loading entries...</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-text-secondary">No time entries logged yet.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const fix = fixes[entry.id];
            const crewName =
              entry.crewMemberName ??
              (entry.crewMemberId ? crewById.get(entry.crewMemberId) ?? null : null);
            const crewLabel = crewName ?? 'Unassigned';
            return (
              <div key={entry.id} className="p-3 rounded-md border border-border-subtle bg-bg-section/30 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      {entry.bucket ?? 'UNBUCKETED'} - {entry.minutes}m
                    </p>
                    <p className="text-xs text-text-tertiary">{formatRange(entry.startTime, entry.endTime)}</p>
                    <p className="text-xs text-text-secondary">Crew: {crewLabel}</p>
                    {entry.delayReason && (
                      <p className="text-xs text-text-secondary">Delay: {entry.delayReason}</p>
                    )}
                    {entry.note && <p className="text-xs text-text-secondary mt-1">{entry.note}</p>}
                  </div>
                  <p className="text-[11px] text-text-tertiary">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>

                {!entry.bucket && fix && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Select
                      label="Fix bucket"
                      value={fix.bucket}
                      onChange={(e) =>
                        setFixes((prev) => ({ ...prev, [entry.id]: { ...fix, bucket: e.target.value } }))
                      }
                      disabled={saving}
                    >
                      {bucketOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </Select>
                    {fix.bucket === 'WAITING' && (
                      <Select
                        label="Delay reason"
                        value={fix.delayReason}
                        onChange={(e) =>
                          setFixes((prev) => ({ ...prev, [entry.id]: { ...fix, delayReason: e.target.value } }))
                        }
                        disabled={saving}
                      >
                        <option value="">Select reason</option>
                        {delayReasons.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </Select>
                    )}
                    {fix.bucket === 'WAITING' && (
                      <Input
                        label="Note (OTHER)"
                        value={fix.note}
                        onChange={(e) =>
                          setFixes((prev) => ({ ...prev, [entry.id]: { ...fix, note: e.target.value } }))
                        }
                        disabled={saving}
                      />
                    )}
                    <div className="flex items-end">
                      <Button onClick={() => handleFixSave(entry.id)} disabled={saving}>
                        {saving ? 'Saving...' : 'Save bucket'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
