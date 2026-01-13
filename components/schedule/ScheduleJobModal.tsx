'use client';

import { useState, useMemo, useEffect } from 'react';
import type { Job } from '@/db/schema/jobs';
import { Card, Button, Input, Select } from '@/components/ui';
import { WORKDAY_START_HOUR, TOTAL_MINUTES } from './scheduleConstants';
import { hasExistingSchedule } from '@/lib/utils/jobScheduling';
import { resolveDurationMinutes } from '@/lib/utils/scheduleTime';
import { hasSchedulableAddress, getShortAddress, getAddressSchedulingError } from '@/lib/utils/jobAddress';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { getJobTypeForJob } from '@/lib/org/jobTypes';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import { cn } from '@/lib/utils';
import { buildHqAddress, hasHqAddress } from '@/lib/utils/orgAddress';

interface Crew {
  id: string;
  name: string;
}

type InstallEstimate = {
  jobTotalM2: number;
  jobM2Source: 'planned' | 'used' | 'none';
  crewSpeed: {
    windowDays: number;
    m2PerMinute: number;
    totalM2: number;
    totalMinutes: number;
  } | null;
  baseMinutes: number | null;
  multiplierTotal: number;
  adjustedMinutes: number | null;
  modifiers: Array<{
    id: string;
    name: string;
    description: string | null;
    multiplier: number;
    enabled: boolean;
    jobEnabled: boolean;
    applied: boolean;
  }>;
  notes: string[];
};

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

interface ScheduleJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (params: {
    jobId: string;
    crewIds: string[];
    startTime: Date;
    endTime: Date;
    crewHqFlags?: Record<string, { startAtHq: boolean; endAtHq: boolean }>;
  }) => Promise<void>;
  onCreateJob?: (params: {
    title: string;
    addressLine1: string;
    crewIds: string[];
    startTime: Date;
    endTime: Date;
    crewHqFlags?: Record<string, { startAtHq: boolean; endAtHq: boolean }>;
    orgId: string;
  }) => Promise<string | null>; // Returns new job ID or null
  schedulableJobs: Job[]; // Required - passed directly from ScheduleView
  crews?: Crew[];
  prefillCrewId?: string | null;
  prefillDate?: Date;
  prefillMinutes?: number;
  orgId: string;
}

/**
 * Format time for display
 */
function formatTime(minutes: number): string {
  const totalMinutes = WORKDAY_START_HOUR * 60 + minutes;
  return minutesToTimeString(totalMinutes);
}

function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
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

function addMinutesToTimeString(value: string, minutesToAdd: number): string | null {
  const totalMinutes = parseTimeString(value);
  if (totalMinutes === null) return null;
  return minutesToTimeString(totalMinutes + minutesToAdd);
}

const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 480;

function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_DURATION_MINUTES;
  const rounded = Math.ceil(minutes / 30) * 30;
  return Math.max(MIN_DURATION_MINUTES, Math.min(MAX_DURATION_MINUTES, rounded));
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '--';
  return `${Math.round(minutes)}m`;
}

function formatRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return '--';
  return rate.toFixed(3).replace(/\.?0+$/, '');
}

function formatM2(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return '--';
  return value.toFixed(1).replace(/\.0$/, '');
}

export default function ScheduleJobModal({
  isOpen,
  onClose,
  onSchedule,
  onCreateJob,
  schedulableJobs,
  crews = [],
  prefillCrewId,
  prefillDate,
  prefillMinutes,
  orgId,
}: ScheduleJobModalProps) {
  const { config } = useOrgConfig();
  const isMobile = useIsMobile();
  const swipe = useSwipeToClose(onClose, isMobile);
  const [mode, setMode] = useState<'select' | 'create'>('select'); // 'select' existing job or 'create' new job
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [selectedCrewIds, setSelectedCrewIds] = useState<string[]>(prefillCrewId ? [prefillCrewId] : []);
  const [searchQuery, setSearchQuery] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number>(120);
  const [startTimeInput, setStartTimeInput] = useState('');
  const [endTimeInput, setEndTimeInput] = useState('');
  const [hasManualEndTime, setHasManualEndTime] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // PHASE D2: Inline error state
  const [installEstimate, setInstallEstimate] = useState<InstallEstimate | null>(null);
  const [installEstimateLoading, setInstallEstimateLoading] = useState(false);
  const [installEstimateError, setInstallEstimateError] = useState<string | null>(null);
  const [crewHqModes, setCrewHqModes] = useState<Record<string, HqMode>>({});
  
  // New job form fields
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newJobAddress, setNewJobAddress] = useState('');

  // 6ï¸âƒ£ Add console.table logging inside the modal to verify jobs are received
  useEffect(() => {
    if (isOpen && schedulableJobs.length > 0) {
      console.table(
        schedulableJobs.map(j => ({
          id: j.id,
          title: j.title,
          status: j.status,
          crewId: j.crewId,
          scheduledStart: j.scheduledStart,
        }))
      );
    }
  }, [isOpen, schedulableJobs]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMode('select');
      setSelectedJobId('');
      setSearchQuery('');
      setSelectedCrewIds(prefillCrewId ? [prefillCrewId] : []);
      setDurationMinutes(120);
      setStartTimeInput('');
      setEndTimeInput('');
      setHasManualEndTime(false);
      setNewJobTitle('');
      setNewJobAddress('');
      setInstallEstimate(null);
      setInstallEstimateError(null);
      setCrewHqModes({});
    }
  }, [isOpen, prefillCrewId]);

  // Update selected crew when prefill changes
  useEffect(() => {
    if (prefillCrewId) {
      setSelectedCrewIds([prefillCrewId]);
      setCrewHqModes((prev) => (prev[prefillCrewId] ? prev : { ...prev, [prefillCrewId]: 'none' }));
    }
  }, [prefillCrewId]);

  useEffect(() => {
    if (!isOpen) return;
    const startMinutes = prefillMinutes ?? 0;
    setStartTimeInput(formatTime(startMinutes));
    setHasManualEndTime(false);
  }, [isOpen, prefillMinutes]);

  const selectedJob = useMemo(() => {
    return schedulableJobs.find(j => j.id === selectedJobId) || null;
  }, [schedulableJobs, selectedJobId]);
  const selectedJobType = useMemo(() => (selectedJob ? getJobTypeForJob(selectedJob, config) : null), [selectedJob, config]);
  const defaultDurationMinutes = useMemo(() => {
    const fallback = config?.jobTypes.find((type) => type.isDefault) ?? config?.jobTypes[0];
    return fallback?.defaultDurationMinutes ?? 120;
  }, [config?.jobTypes]);

  const effectiveCrewIds = selectedCrewIds;
  const effectiveCrewId = effectiveCrewIds[0] ?? '';

  // F1: Update duration when job or estimate changes
  useEffect(() => {
    if (installEstimate?.adjustedMinutes && installEstimate.adjustedMinutes > 0) {
      setDurationMinutes(clampDuration(installEstimate.adjustedMinutes));
      return;
    }

    if (selectedJob) {
      const duration = resolveDurationMinutes(
        selectedJob,
        null,
        selectedJobType?.defaultDurationMinutes ?? defaultDurationMinutes
      );
      setDurationMinutes(clampDuration(duration));
    } else {
      setDurationMinutes(clampDuration(defaultDurationMinutes));
    }
  }, [defaultDurationMinutes, installEstimate, selectedJob, selectedJobType]);

  useEffect(() => {
    setHasManualEndTime(false);
  }, [selectedJobId, effectiveCrewId]);

  useEffect(() => {
    if (!selectedJob || !effectiveCrewId) {
      setInstallEstimate(null);
      setInstallEstimateError(null);
      return;
    }

    const controller = new AbortController();
    setInstallEstimateLoading(true);
    setInstallEstimateError(null);
    fetch(`/api/install-time-estimate?orgId=${orgId}&jobId=${selectedJob.id}&crewMemberId=${effectiveCrewId}`, {
      signal: controller.signal,
    })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!ok || !json?.ok) {
          throw new Error(json?.error?.message || 'Failed to load estimate');
        }
        setInstallEstimate(json.data as InstallEstimate);
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setInstallEstimate(null);
        setInstallEstimateError(e instanceof Error ? e.message : 'Failed to load estimate');
      })
      .finally(() => setInstallEstimateLoading(false));

    return () => controller.abort();
  }, [effectiveCrewId, orgId, selectedJob]);

  useEffect(() => {
    if (hasManualEndTime) return;
    if (!startTimeInput || !Number.isFinite(durationMinutes)) return;
    const nextEnd = addMinutesToTimeString(startTimeInput, durationMinutes);
    if (nextEnd) {
      setEndTimeInput(nextEnd);
    }
  }, [durationMinutes, hasManualEndTime, startTimeInput]);

  // Filter jobs by search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return schedulableJobs;
    
    const query = searchQuery.toLowerCase();
    return schedulableJobs.filter(job => 
      job.title.toLowerCase().includes(query) ||
      (job.suburb && job.suburb.toLowerCase().includes(query))
    );
  }, [schedulableJobs, searchQuery]);

  const appliedModifiers = useMemo(() => {
    return installEstimate?.modifiers.filter((m) => m.applied) ?? [];
  }, [installEstimate]);

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

  useEffect(() => {
    if (!hqReady) {
      setCrewHqModes({});
    }
  }, [hqReady]);

  /**
   * ðŸ›‘ INVARIANT: This function MUST create a ScheduleAssignment.
   * It must NEVER return without creating an assignment.
   * If assignment creation fails, the modal must remain open.
   */
  const handleSchedule = async () => {
    const crewIds = effectiveCrewIds;

    const resolveCrewHqFlags = (ids: string[]) => {
      const crewHqFlags: Record<string, { startAtHq: boolean; endAtHq: boolean }> = {};
      ids.forEach((id) => {
        const modeValue = crewHqModes[id] ?? 'none';
        const flags = hqModeToFlags(modeValue);
        crewHqFlags[id] = hqReady ? flags : { startAtHq: false, endAtHq: false };
      });
      return crewHqFlags;
    };

    const startMinutes = toWorkdayMinutes(startTimeInput);
    const endMinutes = toWorkdayMinutes(endTimeInput);
    if (startMinutes === null) {
      setErrorMessage('Start time is required.');
      return;
    }
    if (endMinutes === null) {
      setErrorMessage('End time is required.');
      return;
    }
    if (startMinutes < 0 || startMinutes > TOTAL_MINUTES) {
      setErrorMessage('Start time must be within workday hours (06:00 to 18:00).');
      return;
    }
    if (endMinutes <= startMinutes) {
      setErrorMessage('End time must be after start time.');
      return;
    }
    if (endMinutes > TOTAL_MINUTES) {
      setErrorMessage('End time must be within workday hours (06:00 to 18:00).');
      return;
    }

    const startTime = new Date(prefillDate || new Date());
    startTime.setHours(WORKDAY_START_HOUR, 0, 0, 0);
    startTime.setMinutes(startTime.getMinutes() + startMinutes);

    const endTime = new Date(prefillDate || new Date());
    endTime.setHours(WORKDAY_START_HOUR, 0, 0, 0);
    endTime.setMinutes(endTime.getMinutes() + endMinutes);

    // ðŸ›‘ INVARIANT GUARD: startTime must be valid
    if (!startTime || isNaN(startTime.getTime())) {
      console.error('Invariant violation: Invalid startTime calculated', { prefillDate, startMinutes });
      alert('Invalid time. Please try again.');
      return;
    }

    // PHASE D2: Clear any previous errors
    setErrorMessage(null);
    
    setIsScheduling(true);
    try {
      let finalJobId: string | null = null;

      if (mode === 'create') {
        // Create new job first
        if (!newJobTitle.trim()) {
          setErrorMessage('Job title is required.');
          setIsScheduling(false);
          return;
        }
        if (!newJobAddress.trim()) {
          setErrorMessage('Address is required.');
          setIsScheduling(false);
          return;
        }

        if (!onCreateJob) {
          setErrorMessage('Job creation is not available.');
          setIsScheduling(false);
          return;
        }

        const crewHqFlags = resolveCrewHqFlags(crewIds);

        finalJobId = await onCreateJob({
          title: newJobTitle.trim(),
          addressLine1: newJobAddress.trim(),
          crewIds,
          startTime,
          endTime,
          crewHqFlags,
          orgId,
        });

        // ðŸ›‘ INVARIANT: If job creation failed, abort - no assignment can be created
        if (!finalJobId) {
          console.error('Invariant violation: Job creation failed, cannot create assignment');
          setErrorMessage('Failed to create job. Please try again.');
          setIsScheduling(false);
          return;
        }
      } else {
        // Use existing job
        if (!selectedJobId) {
          setErrorMessage('Please select a job to schedule.');
          setIsScheduling(false);
          return;
        }

        // ðŸ›‘ INVARIANT GUARD: selectedJobId must be valid
        const job = schedulableJobs.find(j => j.id === selectedJobId);
        if (!job) {
          console.error('Invariant violation: Selected job not found', selectedJobId);
          setErrorMessage('Selected job not found. Please try again.');
          setIsScheduling(false);
          return;
        }

        // PHASE C3: Defensive UX - Prevent scheduling completed jobs
        if (job.status === 'completed') {
          console.error('Attempted to schedule completed job', job.id);
          setErrorMessage('Cannot schedule a completed job. Completed jobs cannot be assigned to crews.');
          setIsScheduling(false);
          return;
        }

        finalJobId = selectedJobId;
      }

      // ðŸ›‘ INVARIANT: finalJobId must be set at this point
      if (!finalJobId) {
        console.error('Invariant violation: No jobId available for assignment creation');
        setErrorMessage('No job selected. Please try again.');
        setIsScheduling(false);
        return;
      }

      // ðŸ›‘ CRITICAL: Create ScheduleAssignment - this MUST succeed
      // onSchedule calls handleAssignJob which creates the assignment
      if (mode === 'select') {
        const crewHqFlags = resolveCrewHqFlags(crewIds);
        await onSchedule({
          jobId: finalJobId,
          crewIds,
          startTime,
          endTime,
          crewHqFlags,
        });
      }

      // ðŸ›‘ INVARIANT: Only close modal after successful assignment creation
      // Reset form
      setMode('select');
      setSelectedJobId('');
      setSelectedCrewIds(prefillCrewId ? [prefillCrewId] : []);
      setSearchQuery('');
      setDurationMinutes(120);
      setNewJobTitle('');
      setNewJobAddress('');
      setErrorMessage(null); // PHASE D2: Clear error on success
      onClose();
    } catch (error) {
      console.error('Error scheduling job:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to schedule job. Please try again.');
      // ðŸ›‘ INVARIANT: Do NOT close modal on error - assignment was not created
    } finally {
      setIsScheduling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-end md:items-center md:justify-center p-0 md:p-6">
        <Card
          padding="none"
          className={cn(
            'w-full bg-bg-base border border-border-subtle',
            isMobile ? 'rounded-t-2xl' : 'rounded-lg max-w-md',
            'max-h-[90vh] overflow-y-auto'
          )}
          onClick={(e) => e.stopPropagation()}
          {...swipe}
        >
          {isMobile && <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-border-subtle" />}
          <div className="space-y-6 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-text-primary mb-1">Schedule Job</h2>
                <p className="text-sm text-text-secondary">
                  {startTimeInput ? `Start: ${startTimeInput}` : ''}
                  {startTimeInput && endTimeInput ? ` - End: ${endTimeInput}` : ''}
                  {!startTimeInput && 'Select a time slot on the schedule to prefill time'}
                </p>
                {/* PHASE D2: Inline error message */}
                {errorMessage && (
                  <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                    {errorMessage}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-text-tertiary hover:text-text-primary"
              >
                Close
              </button>
            </div>

          {/* Mode Toggle */}
          <div className="flex gap-2 border-b border-border-subtle pb-3">
            <button
              type="button"
              onClick={() => setMode('select')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                mode === 'select'
                  ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold'
                  : 'bg-bg-section text-text-secondary hover:bg-bg-card'
              }`}
            >
              Select Existing Job
            </button>
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                mode === 'create'
                  ? 'bg-accent-gold/20 text-accent-gold border border-accent-gold'
                  : 'bg-bg-section text-text-secondary hover:bg-bg-card'
              }`}
            >
              Create New Job
            </button>
          </div>

          {mode === 'select' ? (
            <>
              {/* Job Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">Select Job</label>
            <Input
              type="text"
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full"
            />
            <div className="max-h-48 overflow-y-auto border border-border-subtle rounded-md">
              {filteredJobs.length === 0 ? (
                <div className="p-4 text-center text-sm text-text-tertiary">
                  {searchQuery 
                    ? 'No jobs found matching your search' 
                    : schedulableJobs.length === 0 
                    ? 'No unassigned jobs available. Click "Create New Job" to schedule a new job.'
                    : 'No jobs found'}
                </div>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {filteredJobs.map((job) => {
                    const isSelected = job.id === selectedJobId;
                    const jobTypeLabel = getJobTypeForJob(job, config)?.label ?? (config?.vocabulary.jobSingular ?? 'Job');
                    const hasSchedule = hasExistingSchedule(job);
                    // G1: Check if job has valid address for scheduling
                    const canSchedule = hasSchedulableAddress(job);
                    const addressError = getAddressSchedulingError(job);
                    
                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => canSchedule && setSelectedJobId(job.id)}
                        disabled={!canSchedule}
                        className={`
                          w-full text-left p-3 transition-colors
                          ${canSchedule ? 'hover:bg-bg-section cursor-pointer' : 'opacity-60 cursor-not-allowed'}
                          ${isSelected ? 'bg-bg-section border-l-4 border-l-accent-gold' : ''}
                        `}
                        title={!canSchedule ? addressError || 'Address required' : undefined}
                      >
                        <div className="font-medium text-text-primary text-sm">{job.title}</div>
                        <div className="text-xs text-text-secondary mt-1">
                          {getShortAddress(job)} - {jobTypeLabel}
                        </div>
                        {/* G1: Address warning */}
                        {!canSchedule && (
                          <div className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Add site address to schedule
                          </div>
                        )}
                        {hasSchedule && canSchedule && (
                          <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 flex items-center gap-1">
                            Already scheduled elsewhere
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
            </>
          ) : (
            <>
              {/* Create New Job Form */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">Job Title *</label>
                <Input
                  type="text"
                  placeholder="Enter job title..."
                  value={newJobTitle}
                  onChange={(e) => setNewJobTitle(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text-primary">Address *</label>
                <Input
                  type="text"
                  placeholder="Enter address..."
                  value={newJobAddress}
                  onChange={(e) => setNewJobAddress(e.target.value)}
                  className="w-full"
                />
              </div>
            </>
          )}

          {/* Crew Selector */}
          {crews.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">Employees</label>
              <div className="max-h-40 overflow-y-auto border border-border-subtle rounded-md divide-y divide-border-subtle">
                {crews.map((crew) => {
                  const isChecked = effectiveCrewIds.includes(crew.id);
                  return (
                    <label key={crew.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedCrewIds((prev) => {
                            const next = prev.includes(crew.id)
                              ? prev.filter((id) => id !== crew.id)
                              : [...prev, crew.id];
                            setCrewHqModes((prevModes) => {
                              const updated = { ...prevModes };
                              if (next.includes(crew.id)) {
                                if (!updated[crew.id]) updated[crew.id] = 'none';
                              } else {
                                delete updated[crew.id];
                              }
                              return updated;
                            });
                            return next;
                          });
                        }}
                      />
                      <span className="text-text-primary">{crew.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-text-tertiary">Optional: leave empty to schedule without a crew.</p>
            </div>
          )}

          {/* HQ Travel Selector */}
          {crews.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">HQ travel per employee</label>
              {!hqReady && (
                <p className="text-xs text-text-tertiary">Set HQ location in Settings to enable HQ travel.</p>
              )}
              {hqReady && (
                <>
                  {effectiveCrewIds.length === 0 && (
                    <p className="text-xs text-text-tertiary">Select employees to set HQ travel preferences.</p>
                  )}
                  {effectiveCrewIds.length > 0 && (
                    <div className="space-y-2">
                      {effectiveCrewIds.map((crewId) => {
                        const crew = crews.find((c) => c.id === crewId);
                        const modeValue = crewHqModes[crewId] ?? 'none';
                        return (
                          <div key={crewId} className="flex items-center gap-3">
                            <span className="text-sm text-text-primary flex-1">{crew?.name ?? 'Crew member'}</span>
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
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Time Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Start time"
              type="time"
              value={startTimeInput}
              onChange={(e) => setStartTimeInput(e.target.value)}
            />
            <Input
              label="End time *"
              type="time"
              value={endTimeInput}
              onChange={(e) => {
                setEndTimeInput(e.target.value);
                setHasManualEndTime(true);
              }}
            />
          </div>
          <p className="text-xs text-text-tertiary">
            End time is required. It is auto-filled from the install estimate unless edited.
          </p>

          {(selectedJob && effectiveCrewId) && (
            <div className="rounded-md border border-border-subtle bg-bg-section/30 p-3 text-sm text-text-secondary">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-text-primary">Estimate breakdown</p>
                {installEstimateLoading && <span className="text-xs text-text-tertiary">Loading...</span>}
              </div>
              {installEstimateError && (
                <p className="mt-2 text-xs text-red-400">{installEstimateError}</p>
              )}
              {installEstimate && (
                <div className="mt-2 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Job total m2</span>
                    <span className="text-text-primary">
                      {formatM2(installEstimate.jobTotalM2)} m2 ({installEstimate.jobM2Source})
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Crew speed</span>
                    <span className="text-text-primary">
                      {installEstimate.crewSpeed
                        ? `${formatRate(installEstimate.crewSpeed.m2PerMinute)} m2/min (last ${installEstimate.crewSpeed.windowDays}d)`
                        : '--'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Base minutes</span>
                    <span className="text-text-primary">{formatMinutes(installEstimate.baseMinutes)}</span>
                  </div>
                  <div className="text-text-tertiary">Base = job m2 / crew m2 per minute</div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Modifiers</span>
                    <span className="text-text-primary">x{installEstimate.multiplierTotal.toFixed(2)}</span>
                  </div>
                  {appliedModifiers.length > 0 ? (
                    <div className="text-text-tertiary">
                      Applied: {appliedModifiers.map((m) => `${m.name} (x${m.multiplier})`).join(', ')}
                    </div>
                  ) : (
                    <div className="text-text-tertiary">Applied: none</div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-subtle">
                    <span>Adjusted minutes</span>
                    <span className="text-text-primary">{formatMinutes(installEstimate.adjustedMinutes)}</span>
                  </div>
                  {installEstimate.notes.length > 0 && (
                    <div className="text-text-tertiary">{installEstimate.notes.join(' ')}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={onClose}
              className="flex-1"
              disabled={isScheduling}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSchedule}
              className="flex-1"
              disabled={
                (mode === 'select' && !selectedJobId) ||
                (mode === 'create' && (!newJobTitle.trim() || !newJobAddress.trim())) ||
                !startTimeInput.trim() ||
                !endTimeInput.trim() ||
                isScheduling
              }
            >
              {isScheduling ? 'Scheduling...' : 'Schedule'}
            </Button>
          </div>
          </div>
        </Card>
      </div>
    </div>
  );
}


