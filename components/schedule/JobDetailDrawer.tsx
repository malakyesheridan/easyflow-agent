'use client';

/**
 * DO NOT READ job.scheduledStart / scheduledEnd directly.
 * Schedule display must come from assignments for this job.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job } from '@/db/schema/jobs';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { Card, Badge, Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import TaskList from '@/components/tasks/TaskList';
import { getOrgDayKey } from '@/lib/utils/scheduleDayOwnership';
import { WORKDAY_START_HOUR, TOTAL_MINUTES } from './scheduleConstants';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import QuickActionsMenu from '@/components/quick-actions/QuickActionsMenu';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import Link from 'next/link';
import { buildHqAddress, hasHqAddress } from '@/lib/utils/orgAddress';

interface JobDetailDrawerProps {
  job: Job | null;
  orgId: string;
  onClose: () => void;
  onJobUpdate?: () => void;
  assignments?: ScheduleAssignmentWithJob[]; // All assignments for schedule display
  crewOptions?: Array<{ id: string; name: string }>;
  onRescheduleAssignment?: (assignment: ScheduleAssignmentWithJob) => void;
  scheduleContextDate?: Date;
  onUpdateSchedule?: (params: {
    jobId: string;
    date: string;
    updates: Array<{
      assignmentId: string;
      crewId: string;
      startMinutes: number;
      endMinutes: number;
      startAtHq: boolean;
      endAtHq: boolean;
    }>;
    creates: Array<{
      crewId: string;
      startMinutes: number;
      endMinutes: number;
      startAtHq: boolean;
      endAtHq: boolean;
    }>;
    removals: string[];
  }) => Promise<void>;
  showQuickActions?: boolean;
}

/**
 * Status badge component with color coding
 */
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'gold' | 'muted' }> = {
    draft: { label: 'Draft', variant: 'muted' },
    scheduled: { label: 'Scheduled', variant: 'default' },
    scheduled_assigned: { label: 'Scheduled (Assigned)', variant: 'default' },
    scheduled_unassigned: { label: 'Scheduled (Unassigned)', variant: 'muted' },
    in_progress: { label: 'In Progress', variant: 'gold' },
    completed: { label: 'Completed', variant: 'muted' },
    unassigned: { label: 'Unassigned', variant: 'default' },
  };

  const config = statusConfig[status] || {
    label: status,
    variant: 'default' as const,
  };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/**
 * Format address for display
 */
function formatAddress(job: Job): string {
  const parts = [
    job.addressLine1,
    job.addressLine2,
    job.suburb,
    job.state,
    job.postcode,
  ].filter(Boolean);
  return parts.join(', ') || 'Site address not provided';
}

function formatScheduleTime(minutesFromStart: number): string {
  const totalMinutes = WORKDAY_START_HOUR * 60 + minutesFromStart;
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatScheduleDate(date: Date): string {
  const dayKey = getOrgDayKey(date);
  if (!dayKey) return '';
  const [year, month, day] = dayKey.split('-').map((part) => Number(part));
  const displayDate = new Date(year, Math.max(0, month - 1), day);
  return displayDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type HqMode = 'none' | 'start' | 'finish' | 'both';

const HQ_MODE_OPTIONS: Array<{ value: HqMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'start', label: 'Start at HQ' },
  { value: 'finish', label: 'Finish at HQ' },
  { value: 'both', label: 'Start + finish at HQ' },
];

function hqModeToFlags(mode: HqMode): { startAtHq: boolean; endAtHq: boolean } {
  return {
    startAtHq: mode === 'start' || mode === 'both',
    endAtHq: mode === 'finish' || mode === 'both',
  };
}

function flagsToHqMode(startAtHq: boolean, endAtHq: boolean): HqMode {
  if (startAtHq && endAtHq) return 'both';
  if (startAtHq) return 'start';
  if (endAtHq) return 'finish';
  return 'none';
}

function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function formatWorkdayTime(minutesFromStart: number): string {
  const totalMinutes = WORKDAY_START_HOUR * 60 + minutesFromStart;
  return minutesToTimeString(totalMinutes);
}

function parseTimeString(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toWorkdayMinutes(value: string): number | null {
  const totalMinutes = parseTimeString(value);
  if (totalMinutes === null) return null;
  return totalMinutes - WORKDAY_START_HOUR * 60;
}

export default function JobDetailDrawer({
  job,
  orgId,
  onClose,
  assignments = [],
  crewOptions,
  onRescheduleAssignment,
  scheduleContextDate,
  onUpdateSchedule,
  showQuickActions = true,
}: JobDetailDrawerProps) {
  const { config } = useOrgConfig();
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(onClose, isMobile);
  const [lastScheduleAudit, setLastScheduleAudit] = useState<{
    action: string;
    actorName: string | null;
    actorEmail: string | null;
    actorType: string;
    createdAt: string;
  } | null>(null);
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>([]);
  const [crewTimeInputs, setCrewTimeInputs] = useState<Record<string, { start: string; end: string }>>({});
  const [crewHqModes, setCrewHqModes] = useState<Record<string, HqMode>>({});
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && job) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [job, onClose]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (job) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [job]);

  useEffect(() => {
    let active = true;
    if (!job) return;
    const loadLastAudit = async () => {
      try {
        const res = await fetch(
          `/api/audit-logs?orgId=${orgId}&entityType=schedule&entityId=${job.id}&limit=1`
        );
        const json = await res.json();
        if (!active) return;
        if (res.ok && json.ok && Array.isArray(json.data?.rows) && json.data.rows[0]) {
          setLastScheduleAudit(json.data.rows[0]);
        } else {
          setLastScheduleAudit(null);
        }
      } catch {
        if (active) setLastScheduleAudit(null);
      }
    };
    void loadLastAudit();
    return () => {
      active = false;
    };
  }, [job, orgId]);

  const jobId = job?.id ?? null;
  const jobAssignments = useMemo(() => {
    if (!jobId) return [];
    return assignments.filter((assignment) => assignment.jobId === jobId);
  }, [assignments, jobId]);
  const hasAssignments = jobAssignments.length > 0;
  const jobStatus = job?.status ?? 'unassigned';
  const hasAssignedCrew = jobAssignments.some((assignment) => Boolean(assignment.crewId));
  const scheduleState = hasAssignments
    ? hasAssignedCrew
      ? 'scheduled_assigned'
      : 'scheduled_unassigned'
    : null;
  const displayStatus =
    jobStatus === 'unassigned' || jobStatus === 'scheduled'
      ? scheduleState ?? jobStatus
      : jobStatus;

  const scheduleItems = [...jobAssignments].sort((a, b) => {
    const aKey = getOrgDayKey(a.date);
    const bKey = getOrgDayKey(b.date);
    if (aKey !== bKey) return aKey < bKey ? -1 : 1;
    return a.startMinutes - b.startMinutes;
  });

  const primaryAssignment = scheduleItems[0] ?? null;
  const primaryCrewName = primaryAssignment?.crewId
    ? crewOptions?.find((c) => c.id === primaryAssignment.crewId)?.name ?? `Crew ${primaryAssignment.crewId.slice(0, 8)}`
    : 'Unassigned';

  const scheduleDate = useMemo(() => {
    if (scheduleContextDate) return scheduleContextDate;
    if (!primaryAssignment) return null;
    return primaryAssignment.date instanceof Date ? primaryAssignment.date : new Date(primaryAssignment.date);
  }, [primaryAssignment, scheduleContextDate]);
  const scheduleDateKey = scheduleDate ? getOrgDayKey(scheduleDate) : null;
  const contextAssignments = useMemo(() => {
    if (!scheduleDateKey) return [];
    return jobAssignments.filter((assignment) => getOrgDayKey(assignment.date) === scheduleDateKey);
  }, [jobAssignments, scheduleDateKey]);
  const contextAssignmentsByCrew = useMemo(() => {
    const map = new Map<string, ScheduleAssignmentWithJob>();
    contextAssignments.forEach((assignment) => {
      if (!assignment.crewId) return;
      map.set(assignment.crewId, assignment);
    });
    return map;
  }, [contextAssignments]);
  const defaultTimeInputs = useMemo(() => {
    const baseAssignment = contextAssignments[0] ?? primaryAssignment ?? null;
    const startMinutes = baseAssignment?.startMinutes ?? 0;
    const rawEndMinutes =
      baseAssignment?.endMinutes ??
      Math.min(startMinutes + 120, TOTAL_MINUTES);
    const endMinutes = Math.min(Math.max(rawEndMinutes, startMinutes + 30), TOTAL_MINUTES);
    return {
      start: formatWorkdayTime(startMinutes),
      end: formatWorkdayTime(endMinutes),
    };
  }, [contextAssignments, primaryAssignment]);
  const hqFields = useMemo(
    () => ({
      hqAddressLine1: config?.hqLocation?.addressLine1 ?? null,
      hqAddressLine2: config?.hqLocation?.addressLine2 ?? null,
      hqSuburb: config?.hqLocation?.suburb ?? null,
      hqState: config?.hqLocation?.state ?? null,
      hqPostcode: config?.hqLocation?.postcode ?? null,
    }),
    [config?.hqLocation]
  );
  const hqReady = useMemo(() => hasHqAddress(hqFields), [hqFields]);
  const hqLabel = useMemo(() => (hqReady ? buildHqAddress(hqFields) : ''), [hqFields, hqReady]);

  const canEditSchedule = Boolean(scheduleDateKey && crewOptions && crewOptions.length > 0 && onUpdateSchedule);
  const resetScheduleForm = useCallback(() => {
    if (!job || !scheduleDateKey) {
      setSelectedCrewIds([]);
      setCrewTimeInputs({});
      setCrewHqModes({});
      return;
    }
    const crewIds = Array.from(
      new Set(contextAssignments.map((assignment) => assignment.crewId).filter((crewId): crewId is string => Boolean(crewId)))
    );
    const nextTimes: Record<string, { start: string; end: string }> = {};
    const nextModes: Record<string, HqMode> = {};
    crewIds.forEach((crewId) => {
      const assignment = contextAssignmentsByCrew.get(crewId);
      if (assignment) {
        nextTimes[crewId] = {
          start: formatWorkdayTime(assignment.startMinutes),
          end: formatWorkdayTime(assignment.endMinutes),
        };
        nextModes[crewId] = flagsToHqMode(Boolean(assignment.startAtHq), Boolean(assignment.endAtHq));
      }
    });
    setSelectedCrewIds(crewIds);
    setCrewTimeInputs(nextTimes);
    setCrewHqModes(nextModes);
    setScheduleError(null);
  }, [contextAssignments, contextAssignmentsByCrew, job, scheduleDateKey]);

  useEffect(() => {
    resetScheduleForm();
  }, [resetScheduleForm]);

  const handleToggleCrew = (crewId: string) => {
    setSelectedCrewIds((prev) => {
      const next = prev.includes(crewId)
        ? prev.filter((id) => id !== crewId)
        : [...prev, crewId];
      setCrewTimeInputs((prevTimes) => {
        const updated = { ...prevTimes };
        if (next.includes(crewId)) {
          const assignment = contextAssignmentsByCrew.get(crewId);
          updated[crewId] = assignment
            ? {
                start: formatWorkdayTime(assignment.startMinutes),
                end: formatWorkdayTime(assignment.endMinutes),
              }
            : defaultTimeInputs;
        } else {
          delete updated[crewId];
        }
        return updated;
      });
      setCrewHqModes((prevModes) => {
        const updated = { ...prevModes };
        if (next.includes(crewId)) {
          const assignment = contextAssignmentsByCrew.get(crewId);
          updated[crewId] = assignment
            ? flagsToHqMode(Boolean(assignment.startAtHq), Boolean(assignment.endAtHq))
            : 'none';
        } else {
          delete updated[crewId];
        }
        return updated;
      });
      return next;
    });
  };

  const handleApplySchedule = async () => {
    if (!onUpdateSchedule || !scheduleDateKey || !jobId) {
      setScheduleError('Job scheduling context is unavailable.');
      return;
    }
    setScheduleError(null);

    if (selectedCrewIds.length === 0 && contextAssignments.length === 0) {
      setScheduleError('Select at least one employee to schedule.');
      return;
    }

    const updates: Array<{
      assignmentId: string;
      crewId: string;
      startMinutes: number;
      endMinutes: number;
      startAtHq: boolean;
      endAtHq: boolean;
    }> = [];
    const creates: Array<{
      crewId: string;
      startMinutes: number;
      endMinutes: number;
      startAtHq: boolean;
      endAtHq: boolean;
    }> = [];
    const removals: string[] = [];

    const selectedSet = new Set(selectedCrewIds);
    const getCrewName = (crewId: string) =>
      crewOptions?.find((crew) => crew.id === crewId)?.name ?? `Crew ${crewId.slice(0, 8)}`;

    for (const crewId of selectedCrewIds) {
      const input = crewTimeInputs[crewId] ?? defaultTimeInputs;
      const startMinutes = toWorkdayMinutes(input.start);
      const endMinutes = toWorkdayMinutes(input.end);
      if (startMinutes === null) {
        setScheduleError(`Start time is required for ${getCrewName(crewId)}.`);
        return;
      }
      if (endMinutes === null) {
        setScheduleError(`End time is required for ${getCrewName(crewId)}.`);
        return;
      }
      if (startMinutes < 0 || startMinutes > TOTAL_MINUTES) {
        setScheduleError('Start time must be within workday hours (06:00 to 18:00).');
        return;
      }
      if (endMinutes <= startMinutes) {
        setScheduleError(`End time must be after start time for ${getCrewName(crewId)}.`);
        return;
      }
      if (endMinutes > TOTAL_MINUTES) {
        setScheduleError('End time must be within workday hours (06:00 to 18:00).');
        return;
      }

      const assignment = contextAssignmentsByCrew.get(crewId);
      const modeValue = crewHqModes[crewId] ?? (assignment ? flagsToHqMode(assignment.startAtHq, assignment.endAtHq) : 'none');
      const hqFlags = hqReady ? hqModeToFlags(modeValue) : { startAtHq: false, endAtHq: false };

      if (assignment) {
        const changed =
          assignment.startMinutes !== startMinutes ||
          assignment.endMinutes !== endMinutes ||
          assignment.startAtHq !== hqFlags.startAtHq ||
          assignment.endAtHq !== hqFlags.endAtHq;
        if (changed) {
          updates.push({
            assignmentId: assignment.id,
            crewId,
            startMinutes,
            endMinutes,
            startAtHq: hqFlags.startAtHq,
            endAtHq: hqFlags.endAtHq,
          });
        }
      } else {
        creates.push({
          crewId,
          startMinutes,
          endMinutes,
          startAtHq: hqFlags.startAtHq,
          endAtHq: hqFlags.endAtHq,
        });
      }
    }

    contextAssignments.forEach((assignment) => {
      if (!assignment.crewId) return;
      if (!selectedSet.has(assignment.crewId)) {
        removals.push(assignment.id);
      }
    });

    if (removals.length > 0 && scheduleDate) {
      const confirmMessage = `Remove ${removals.length} assignment${removals.length === 1 ? '' : 's'} from ${formatScheduleDate(scheduleDate)}?`;
      if (!confirm(confirmMessage)) {
        return;
      }
    }

    setScheduleSaving(true);
    try {
      await onUpdateSchedule({
        jobId,
        date: scheduleDateKey,
        updates,
        creates,
        removals,
      });
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : 'Failed to update schedule.');
    } finally {
      setScheduleSaving(false);
    }
  };

  if (!job) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed z-50 overflow-y-auto shadow-2xl bg-bg-base border-border-subtle',
          'transform transition-transform duration-300 ease-out',
          'inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl border-t',
          'md:inset-y-0 md:left-auto md:right-0 md:top-0 md:bottom-0 md:max-h-none md:w-full md:max-w-2xl md:rounded-none md:border-l',
          job ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-full'
        )}
        {...swipe}
      >
        <div className="p-6 space-y-6">
          {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}
          {/* Header */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-text-primary mb-2">
                {job.title}
              </h2>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={displayStatus} />
              </div>
              <p className="text-sm text-text-secondary">
                {formatAddress(job)}
              </p>
              {lastScheduleAudit && (
                <p className="text-xs text-text-tertiary mt-2">
                  Schedule updated {new Date(lastScheduleAudit.createdAt).toLocaleString()} by{' '}
                  {lastScheduleAudit.actorType !== 'user'
                    ? lastScheduleAudit.actorType
                    : lastScheduleAudit.actorName || lastScheduleAudit.actorEmail || 'Unknown'}
                </p>
              )}
            </div>
          <div className="flex items-center gap-2">
              {!isMobile && primaryAssignment && showQuickActions && (
                <QuickActionsMenu
                  entity={primaryAssignment}
                  entityType="schedule"
                  orgId={orgId}
                  extra={{ crewOptions }}
                />
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
          </div>

          {isMobile && (
            <Card className="bg-bg-section/60 border border-border-subtle">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-text-primary">Schedule summary</p>
                  <Link href={`/jobs/${job.id}`}>
                    <Button variant="secondary" size="sm">
                      View Job
                    </Button>
                  </Link>
                </div>
                <div className="text-sm text-text-secondary space-y-1">
                  <p>
                    Status: <span className="text-text-primary">{displayStatus.replace('_', ' ')}</span>
                  </p>
                  <p>
                    Crew: <span className="text-text-primary">{primaryCrewName}</span>
                  </p>
                  {primaryAssignment && (
                    <p>
                      {formatScheduleTime(primaryAssignment.startMinutes)} - {formatScheduleTime(primaryAssignment.endMinutes)}
                    </p>
                  )}
                </div>
                {primaryAssignment && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled
                  >
                    Schedule locked
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Details */}
          <Card>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Schedule - derived from assignments (authoritative) */}
              {scheduleItems.length === 0 ? (
                <div className="md:col-span-2">
                  <h4 className="text-sm font-medium text-text-secondary mb-1">
                    {config?.vocabulary?.scheduleLabel ?? 'Schedule'}
                  </h4>
                  <p className="text-sm text-text-tertiary">Not scheduled</p>
                </div>
              ) : (
                <div className="md:col-span-2">
                  <h4 className="text-sm font-medium text-text-secondary mb-2">
                    {scheduleItems.length > 1
                      ? `Scheduled (${scheduleItems.length} ${config?.vocabulary?.crewPlural?.toLowerCase() ?? 'crews'})`
                      : 'Scheduled'}
                  </h4>
                  <div className="space-y-2">
                    {scheduleItems.map((assignment, i) => {
                      const dateLabel = formatScheduleDate(
                        assignment.date instanceof Date ? assignment.date : new Date(assignment.date)
                      );
                      return (
                        <div key={assignment.id || i} className="text-sm text-text-primary">
                          {formatScheduleTime(assignment.startMinutes)} - {formatScheduleTime(assignment.endMinutes)}
                          {dateLabel && (
                            <span className="text-text-secondary ml-2">
                              ({dateLabel})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-medium text-text-secondary mb-1">
                  Priority
                </h4>
                <p className="text-sm text-text-primary capitalize">
                  {job.priority || 'Normal'}
                </p>
              </div>

              {job.notes && (
                <div className="md:col-span-2">
                  <h4 className="text-sm font-medium text-text-secondary mb-1">
                    Notes
                  </h4>
                  <p className="text-sm text-text-primary whitespace-pre-wrap">
                    {job.notes}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {canEditSchedule && (
            <Card>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Schedule adjustments</h3>
              {scheduleDate && (
                <p className="text-xs text-text-tertiary mb-4">
                  Editing assignments for {formatScheduleDate(scheduleDate)}. Uncheck an employee to remove them from the schedule.
                </p>
              )}
              {scheduleError && (
                <div className="mb-4 p-2 rounded border border-destructive/20 bg-destructive/10 text-sm text-destructive">
                  {scheduleError}
                </div>
              )}

              <div className="space-y-3">
                <label className="text-sm font-medium text-text-primary">Employees</label>
                <div className="max-h-40 overflow-y-auto border border-border-subtle rounded-md divide-y divide-border-subtle">
                  {(crewOptions ?? []).map((crew) => {
                    const isChecked = selectedCrewIds.includes(crew.id);
                    return (
                      <label key={crew.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleCrew(crew.id)}
                        />
                        <span className="text-text-primary">{crew.name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-text-tertiary">Select one or more employees to schedule.</p>
              </div>

              {selectedCrewIds.length > 0 && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs text-text-tertiary">
                    <span>Employee</span>
                    <span>Start</span>
                    <span>End</span>
                    <span>HQ travel</span>
                  </div>
                  {selectedCrewIds.map((crewId) => {
                    const crewName = crewOptions?.find((crew) => crew.id === crewId)?.name ?? `Crew ${crewId.slice(0, 8)}`;
                    const timeInput = crewTimeInputs[crewId] ?? defaultTimeInputs;
                    const modeValue = crewHqModes[crewId] ?? 'none';
                    return (
                      <div key={crewId} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                        <span className="text-sm text-text-primary">{crewName}</span>
                        <Input
                          type="time"
                          value={timeInput.start}
                          onChange={(e) =>
                            setCrewTimeInputs((prev) => ({
                              ...prev,
                              [crewId]: { start: e.target.value, end: timeInput.end },
                            }))
                          }
                        />
                        <Input
                          type="time"
                          value={timeInput.end}
                          onChange={(e) =>
                            setCrewTimeInputs((prev) => ({
                              ...prev,
                              [crewId]: { start: timeInput.start, end: e.target.value },
                            }))
                          }
                        />
                        {hqReady ? (
                          <Select
                            value={modeValue}
                            onChange={(e) =>
                              setCrewHqModes((prev) => ({ ...prev, [crewId]: e.target.value as HqMode }))
                            }
                          >
                            {HQ_MODE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-xs text-text-tertiary">Set HQ in Settings</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {hqReady && hqLabel && (
                <p className="mt-3 text-xs text-text-tertiary">HQ: {hqLabel}</p>
              )}

              <div className="mt-5 flex gap-3">
                <Button
                  variant="secondary"
                  onClick={resetScheduleForm}
                  disabled={scheduleSaving}
                >
                  Reset
                </Button>
                <Button
                  variant="primary"
                  onClick={handleApplySchedule}
                  disabled={scheduleSaving}
                >
                  {scheduleSaving ? 'Saving...' : 'Save schedule'}
                </Button>
              </div>
            </Card>
          )}

          {/* Work Steps */}
          <Card>
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              {config?.vocabulary?.workStepPlural ?? 'Work Steps'}
            </h3>
            <TaskList jobId={job.id} orgId={orgId} jobTypeId={job.jobTypeId ?? null} />
          </Card>
        </div>
      </div>
    </>
  );
}

