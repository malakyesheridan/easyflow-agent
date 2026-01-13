'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Job } from '@/db/schema/jobs';
import { Chip, Card, Button } from '@/components/ui';
import ScheduleDayView from './ScheduleDayView';
import ScheduleWeekView from './ScheduleWeekView';
import ScheduleMonthView from './ScheduleMonthView';
import SchedulingInboxPanel from './SchedulingInboxPanel';
import JobDetailDrawer from './JobDetailDrawer';
import ScheduleJobModal from './ScheduleJobModal';
import ScheduleMobileList from './ScheduleMobileList';
import { isSchedulableJob } from '@/lib/utils/jobScheduling';
import { resolveDurationMinutes } from '@/lib/utils/scheduleTime';
import { getOrgDayKey, normalizeAssignmentForOrgDay, toOrgStartOfDay } from '@/lib/utils/scheduleDayOwnership';
import { hasSchedulableAddress, getAddressSchedulingError, buildFullAddress } from '@/lib/utils/jobAddress';
import { buildHqAddress, hasHqAddress } from '@/lib/utils/orgAddress';
import { preResolveTravelDurations, getAssignmentPairCacheKey, getHqTravelCacheKey, type TravelPair } from '@/lib/utils/scheduleTimeline';
import { buildOccupiedTimeline, resolvePlacement } from '@/schedule-v2';
import type { ScheduleAssignmentWithJob } from '@/lib/types/schedule';
import { type Crew } from './ScheduleDayGrid';
import { SLOT_COUNT, SLOT_MINUTES, MAX_SLOT_START_MINUTES, MAX_SLOT_INDEX, WORKDAY_START_HOUR, UNASSIGNED_LANE_ID } from './scheduleConstants';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { ZERO_UUID } from '@/lib/org/orgId';
import useIsMobile from '@/hooks/useIsMobile';
import RescheduleSheet from './RescheduleSheet';

const DRAG_DEBUG = process.env.NEXT_PUBLIC_DEBUG_SCHEDULE === 'true';

/**
 * PHASE C2: ScheduleView now works with ScheduleAssignments as primary state.
 * 
 * - assignments: The schedule state (what's actually scheduled)
 * - jobs: Reference data for display and selection (immutable)
 * - One job can have many assignments (multi-crew, multi-day)
 */
interface ScheduleViewProps {
  assignments: ScheduleAssignmentWithJob[];
  jobs: Job[];
  orgId: string;
  crewMembers?: Array<{
    id: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    role?: string;
    active?: boolean;
  }>;
  initialHighlightCrewId?: string | null;
}

type ViewMode = 'day' | 'week' | 'month';

type TaskSummary = {
  total: number;
  completedTotal: number;
  percent: number | null;
  requiredTotal: number;
  requiredCompleted: number;
  requiredPercent: number | null;
};

/**
 * Authoritative Drag State - Single source of truth for drag placement.
 * 
 * Placement logic runs ONLY during drag hover.
 * Commit uses ONLY the previewed startMinutes.
 */
interface DragState {
  assignmentId: string | null; // The assignment being dragged (if scheduled)
  jobId: string | null; // The job being dragged (if unscheduled)
  targetCrewId: string | null;
  targetDayIndex: number | null; // For week view (0-6 for Mon-Sun)
  // Lane bounds for mouse X to minutes conversion
  laneBounds: { left: number; width: number } | null; // Pixel bounds of the hovered lane grid
  mouseX: number | null; // Latest mouse X position (document-relative)
  // Authoritative occupied timeline - built ONCE at drag start (schedule-v2 format)
  occupiedTimeline: import('@/schedule-v2').OccupiedBlock[] | null;
  occupiedTimelineCrewId: string | null; // Crew ID for the timeline
  occupiedTimelineDate: string | null; // Date string (ISO) for the timeline
  // Resolved preview position - this is what gets committed
  previewStartMinutes: number | null; // Resolved start position (snapped if needed)
  draggingJobDuration: number | null; // Duration of the job being dragged
  snapDelta: number; // How many minutes forward the job was snapped
  snapReason: 'travel' | 'job' | 'out_of_bounds' | null; // Why snapping occurred (if any)
  // Drag-time guidance overlays
  validPlacementWindows?: Array<{
    crewId: string;
    date: string; // YYYY-MM-DD
    startMinutes: number; // inclusive
    endMinutes: number; // exclusive
  }>;
  travelStatus?: 'idle' | 'pending' | 'ready';
}

/**
 * PHASE F2: Resize state for edge dragging assignments.
 * Separate from drag state to avoid conflicts.
 */
interface ResizeState {
  assignmentId: string;
  edge: 'start' | 'end';
  originalStartMinutes: number;
  originalEndMinutes: number;
  previewStartMinutes: number;
  previewEndMinutes: number;
}

const MIN_ASSIGNMENT_DURATION_MINUTES = 30;
const isUnassignedLane = (crewId: string | null) => crewId === UNASSIGNED_LANE_ID;

export default function ScheduleView({
  assignments,
  jobs,
  orgId: orgIdProp,
  crewMembers,
  initialHighlightCrewId,
}: ScheduleViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { config } = useOrgConfig();
  const isMobile = useIsMobile();
  const orgId = useMemo(() => {
    const configOrgId = config?.orgId;
    if (configOrgId && configOrgId !== ZERO_UUID) return configOrgId;
    if (orgIdProp && orgIdProp !== ZERO_UUID) return orgIdProp;
    return '';
  }, [config?.orgId, orgIdProp]);
  const today = toOrgStartOfDay(new Date());

  const [rescheduleAssignment, setRescheduleAssignment] = useState<ScheduleAssignmentWithJob | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const travelCacheRef = useRef<Map<string, number>>(new Map());
  const travelInflightRef = useRef<Map<string, Promise<number | null>>>(new Map());
  const draggedJobAddressRef = useRef<string | null>(null);
  const dragWindowsByLaneRef = useRef<Map<string, Array<{ crewId: string; date: string; startMinutes: number; endMinutes: number }>>>(new Map());
  const dragTravelStatusRef = useRef<'idle' | 'pending' | 'ready'>('idle');
  const assignmentAddressByIdRef = useRef<Map<string, string>>(new Map());
  const ctrlDownRef = useRef(false);
  
  // Single source of truth for the active date in Day View
  const [activeDate, setActiveDate] = useState<Date>(today);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [highlightCrewId, setHighlightCrewId] = useState<string | null>(() => initialHighlightCrewId ?? null);
  const lastHighlightPropRef = useRef<string | null | undefined>(initialHighlightCrewId);

  useEffect(() => {
    if (lastHighlightPropRef.current !== initialHighlightCrewId) {
      lastHighlightPropRef.current = initialHighlightCrewId;
      setHighlightCrewId(initialHighlightCrewId ?? null);
    }
  }, [initialHighlightCrewId]);

  useEffect(() => {
    if (!isMobile) return;
    setViewMode('day');
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    setShowMobileSkeleton(true);
    const id = setTimeout(() => setShowMobileSkeleton(false), 350);
    return () => clearTimeout(id);
  }, [isMobile]);

  useEffect(() => {
    const handleToday = () => {
      if (window.innerWidth >= 768) return;
      setActiveDate(toOrgStartOfDay(new Date()));
      setViewMode('day');
    };
    window.addEventListener('schedule:today', handleToday);
    return () => window.removeEventListener('schedule:today', handleToday);
  }, []);
  
  // Local state mirror for optimistic updates
  const [localAssignments, setLocalAssignments] = useState<ScheduleAssignmentWithJob[]>(() =>
    assignments.map(normalizeAssignmentForOrgDay)
  );
  
  // Sync localAssignments when props change (e.g., after server refresh)
  useEffect(() => {
    const normalizedAssignments = assignments.map(normalizeAssignmentForOrgDay);
    setLocalAssignments(normalizedAssignments);
  }, [assignments]);
  
  // Update refs when state changes (for pointer handlers)
  useEffect(() => {
    viewModeRef.current = viewMode;
    activeDateRef.current = activeDate;
    assignmentsRef.current = localAssignments; // Use localAssignments instead of props
    jobsRef.current = jobs;
  }, [viewMode, activeDate, localAssignments, jobs]);
  
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalPrefill, setScheduleModalPrefill] = useState<{
    crewId?: string | null;
    date?: Date;
    minutes?: number;
  }>({});
  
  /**
   * PHASE G3: Resolved travel durations from Google Distance Matrix API.
   * 
   * WHY HERE: Travel times are resolved ONCE when assignments change,
   * not during render or drag. This keeps rendering pure and avoids
   * blocking the UI with async calls.
   * 
   * COST CONTROL: preResolveTravelDurations() uses both server-side
   * (24h TTL) and client-side caching. Google API is only called on
   * cache miss.
   */
  const [resolvedTravelDurations, setResolvedTravelDurations] = useState<Map<string, number>>(new Map());
  const [resolvedHqTravelDurations, setResolvedHqTravelDurations] = useState<Map<string, number>>(new Map());
  
  // Central drag state - single source of truth
  const [dragState, setDragState] = useState<DragState>({
    assignmentId: null,
    jobId: null,
    targetCrewId: null,
    targetDayIndex: null,
    laneBounds: null, // Lane grid bounds for X to minutes conversion
    mouseX: null, // Latest mouse X position
    occupiedTimeline: null, // Authoritative timeline built ONCE at drag start
    occupiedTimelineCrewId: null,
    occupiedTimelineDate: null,
    previewStartMinutes: null, // Resolved preview position (this is what gets committed)
    draggingJobDuration: null,
    snapDelta: 0, // How many minutes forward the job was snapped
    snapReason: null, // Why snapping occurred (if any)
  });

  // PHASE F2: Resize state for edge dragging
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  // ❌ DELETED: dragStateRef - no longer needed with new global drag loop

  // Minimal drag refs for global drag loop
  const draggingRef = useRef(false);
  const dragKindRef = useRef<'assignment' | 'job' | null>(null);
  const draggedAssignmentIdRef = useRef<string | null>(null);
  const draggedJobIdRef = useRef<string | null>(null);
  const durationMinutesRef = useRef<number>(0);
  const occupiedTimelineRef = useRef<import('@/schedule-v2').OccupiedBlock[]>([]);
  const lastLaneElRef = useRef<HTMLElement | null>(null);
  const previewStartMinutesRef = useRef<number | null>(null);
  const snapDeltaRef = useRef<number>(0);
  const snapReasonRef = useRef<'travel' | 'job' | 'out_of_bounds' | null>(null);
  const currentCrewIdRef = useRef<string | null>(null);
  const currentDateStrRef = useRef<string | null>(null);
  const resizeGridElRef = useRef<HTMLElement | null>(null);
  
  // Refs for other state (for commit)
  const viewModeRef = useRef<ViewMode>('day');
  const activeDateRef = useRef<Date>(today);
  const assignmentsRef = useRef<ScheduleAssignmentWithJob[]>(assignments.map(normalizeAssignmentForOrgDay));
  const jobsRef = useRef<Job[]>(jobs);
  
  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [showMobileSkeleton, setShowMobileSkeleton] = useState(isMobile);

  // UI-only: task completion summaries for schedule rendering
  const [taskSummaryByJobId, setTaskSummaryByJobId] = useState<Record<string, TaskSummary>>({});
  const [isLoadingTaskSummary, setIsLoadingTaskSummary] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') ctrlDownRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') ctrlDownRef.current = false;
    };
    const onBlur = () => {
      ctrlDownRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur, true);
    };
  }, []);

  const scheduleJobIdsKey = useMemo(() => {
    const ids = Array.from(new Set(localAssignments.map((a) => a.jobId).filter(Boolean))).sort();
    return ids.join(',');
  }, [localAssignments]);

  useEffect(() => {
    const jobIds = scheduleJobIdsKey ? scheduleJobIdsKey.split(',').filter(Boolean) : [];
    if (jobIds.length === 0) {
      setTaskSummaryByJobId({});
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ orgId });
    jobIds.forEach((id) => params.append('jobId', id));

    setIsLoadingTaskSummary(true);
    fetch(`/api/tasks/summary?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok || !Array.isArray(json.data)) return;
        const next: Record<string, TaskSummary> = {};
        json.data.forEach((row: any) => {
          if (!row?.jobId) return;
          next[String(row.jobId)] = {
            total: Number(row.total ?? 0),
            completedTotal: Number(row.completedTotal ?? 0),
            percent: typeof row.percent === 'number' ? row.percent : row.percent === null ? null : null,
            requiredTotal: Number(row.requiredTotal ?? 0),
            requiredCompleted: Number(row.requiredCompleted ?? 0),
            requiredPercent:
              typeof row.requiredPercent === 'number'
                ? row.requiredPercent
                : row.requiredPercent === null
                  ? null
                  : null,
          };
        });
        setTaskSummaryByJobId(next);
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
      })
      .finally(() => setIsLoadingTaskSummary(false));

    return () => controller.abort();
  }, [orgId, scheduleJobIdsKey]);

  const crews = useMemo<Crew[]>(() => {
    const formatRole = (role?: string): string => {
      const map: Record<string, string> = {
        installer: 'Installer',
        supervisor: 'Supervisor',
        apprentice: 'Apprentice',
        warehouse: 'Warehouse',
        admin: 'Admin',
      };
      if (!role) return 'Crew member';
      return map[role] || role;
    };

    const base: Crew[] = (crewMembers || []).map((member) => {
      const displayName = (member.displayName || '').trim();
      const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim();
      const name = (displayName || fullName || `Crew ${String(member.id).slice(0, 8)}`).trim();

      return {
        id: String(member.id),
        name,
        members: [{ name: formatRole(member.role) }],
      };
    });

    const known = new Set(base.map((c) => c.id));
    for (const a of localAssignments) {
      const crewId = a.crewId;
      if (crewId && !known.has(crewId)) {
        known.add(crewId);
        base.push({
          id: crewId,
          name: `Crew ${crewId.slice(0, 8)}`,
          members: [{ name: 'Unmapped' }],
        });
      }
    }

    return base;
  }, [crewMembers, localAssignments]);

  const highlightedCrew = useMemo(() => {
    if (!highlightCrewId) return null;
    return crews.find((c) => c.id === highlightCrewId) || null;
  }, [crews, highlightCrewId]);

  const clearHighlight = useCallback(() => {
    setHighlightCrewId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('highlightCrewId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, router, searchParams]);

  const runWithConcurrency = useCallback(async (tasks: Array<() => Promise<void>>, limit: number) => {
    let index = 0;
    const workers = Array.from({ length: Math.max(1, limit) }, () => (async () => {
      while (index < tasks.length) {
        const task = tasks[index];
        index += 1;
        await task();
      }
    })());
    await Promise.all(workers);
  }, []);

  const getTravelKey = useCallback((origin: string, destination: string) => {
    return `${origin.trim().toLowerCase()}|${destination.trim().toLowerCase()}`;
  }, []);

  const fetchTravelMinutes = useCallback(async (origin: string, destination: string): Promise<number | null> => {
    if (!origin.trim() || !destination.trim()) return null;
    try {
      const response = await fetch('/api/travel-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination }),
      });
      if (!response.ok) return null;
      const data = await response.json();
      const duration = typeof data.durationMinutes === 'number' ? data.durationMinutes : null;
      return duration && duration > 0 ? duration : null;
    } catch {
      return null;
    }
  }, []);

  const ensureTravelMinutes = useCallback(async (origin: string, destination: string): Promise<number | null> => {
    const key = getTravelKey(origin, destination);
    const cached = travelCacheRef.current.get(key);
    if (cached !== undefined) return cached;

    const inflight = travelInflightRef.current.get(key);
    if (inflight) return inflight;

    const promise = (async () => {
      const duration = await fetchTravelMinutes(origin, destination);
      if (duration !== null) {
        travelCacheRef.current.set(key, duration);
      }
      travelInflightRef.current.delete(key);
      return duration;
    })();

    travelInflightRef.current.set(key, promise);
    return promise;
  }, [fetchTravelMinutes, getTravelKey]);

  const quantizeCeil = useCallback((minutes: number) => {
    const grid = SLOT_MINUTES;
    return Math.ceil(minutes / grid) * grid;
  }, []);

  const quantizeFloor = useCallback((minutes: number) => {
    const grid = SLOT_MINUTES;
    return Math.floor(minutes / grid) * grid;
  }, []);

  const computeWindowsForLane = useCallback((params: {
    crewId: string;
    dateStr: string;
    durationMinutes: number;
    excludeAssignmentId?: string | null;
    getAddressForAssignmentId: (assignmentId: string) => string | null;
  }): { windows: Array<{ crewId: string; date: string; startMinutes: number; endMinutes: number }>; pending: boolean } => {
    const { crewId, dateStr, durationMinutes, excludeAssignmentId, getAddressForAssignmentId } = params;
    const draggedAddress = draggedJobAddressRef.current;
    if (!draggedAddress) {
      return { windows: [], pending: false };
    }

    const totalMinutes = SLOT_COUNT * SLOT_MINUTES;

    const crewAssignments = assignmentsRef.current
      .filter(a => {
        const aDateStr = a.date instanceof Date
          ? a.date.toISOString().split('T')[0]
          : new Date(a.date).toISOString().split('T')[0];
        if (aDateStr !== dateStr) return false;
        if (a.crewId !== crewId) return false;
        if (excludeAssignmentId && a.id === excludeAssignmentId) return false;
        return true;
      })
      .map(a => ({ id: a.id, startMinutes: a.startMinutes, endMinutes: a.endMinutes }))
      .sort((a, b) => a.startMinutes - b.startMinutes);

    const windows: Array<{ crewId: string; date: string; startMinutes: number; endMinutes: number }> = [];
    let pending = false;

    const addWindow = (minStart: number, maxStart: number) => {
      const start = quantizeCeil(Math.max(0, minStart));
      const endInclusive = quantizeFloor(Math.min(maxStart, totalMinutes - durationMinutes));
      const endExclusive = endInclusive + SLOT_MINUTES;
      if (endExclusive > start) {
        windows.push({ crewId, date: dateStr, startMinutes: start, endMinutes: endExclusive });
      }
    };

    if (crewAssignments.length === 0) {
      addWindow(0, totalMinutes - durationMinutes);
      return { windows, pending };
    }

    // Before first job: only need travel from dragged -> first after the dragged job ends.
    {
      const first = crewAssignments[0];
      const firstAddr = getAddressForAssignmentId(first.id);
      if (!firstAddr) {
        pending = true;
      } else {
        const t = travelCacheRef.current.get(getTravelKey(draggedAddress, firstAddr));
        if (t === undefined) {
          pending = true;
        } else {
          const maxStart = first.startMinutes - t - durationMinutes;
          addWindow(0, maxStart);
        }
      }
    }

    // Between jobs
    for (let i = 0; i < crewAssignments.length - 1; i++) {
      const prev = crewAssignments[i];
      const next = crewAssignments[i + 1];
      const prevAddr = getAddressForAssignmentId(prev.id);
      const nextAddr = getAddressForAssignmentId(next.id);
      if (!prevAddr || !nextAddr) {
        pending = true;
        continue;
      }

      const tPrev = travelCacheRef.current.get(getTravelKey(prevAddr, draggedAddress));
      const tNext = travelCacheRef.current.get(getTravelKey(draggedAddress, nextAddr));
      if (tPrev === undefined || tNext === undefined) {
        pending = true;
        continue;
      }

      const minStart = prev.endMinutes + tPrev;
      const maxStart = next.startMinutes - tNext - durationMinutes;
      addWindow(minStart, maxStart);
    }

    // After last job: only need travel from last -> dragged before the dragged job starts.
    {
      const last = crewAssignments[crewAssignments.length - 1];
      const lastAddr = getAddressForAssignmentId(last.id);
      if (!lastAddr) {
        pending = true;
      } else {
        const t = travelCacheRef.current.get(getTravelKey(lastAddr, draggedAddress));
        if (t === undefined) {
          pending = true;
        } else {
          const minStart = last.endMinutes + t;
          addWindow(minStart, totalMinutes - durationMinutes);
        }
      }
    }

    return { windows, pending };
  }, [getTravelKey, quantizeCeil, quantizeFloor]);

  /**
   * Show toast message (auto-hide after 2.5s)
   */
  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
      setTimeout(() => setToastMessage(null), 300); // Wait for fade out
    }, 2500);
  }, []);

  /**
   * Clear all drag state and refs
   */
  const clearDrag = useCallback(() => {
    draggingRef.current = false;
    dragKindRef.current = null;
    draggedAssignmentIdRef.current = null;
    draggedJobIdRef.current = null;
    durationMinutesRef.current = 0;
    occupiedTimelineRef.current = [];
    lastLaneElRef.current = null;
    previewStartMinutesRef.current = null;
    snapDeltaRef.current = 0;
    snapReasonRef.current = null;
    currentCrewIdRef.current = null;
    currentDateStrRef.current = null;
    draggedJobAddressRef.current = null;
    dragTravelStatusRef.current = 'idle';
    dragWindowsByLaneRef.current.clear();
    
    setDragState({
      assignmentId: null,
      jobId: null,
      targetCrewId: null,
      targetDayIndex: null,
      laneBounds: null,
      mouseX: null,
      occupiedTimeline: null,
      occupiedTimelineCrewId: null,
      occupiedTimelineDate: null,
      previewStartMinutes: null,
      draggingJobDuration: null,
      snapDelta: 0,
      snapReason: null,
      validPlacementWindows: undefined,
      travelStatus: 'idle',
    });
  }, []);

  /**
   * PHASE G3.1: Pre-resolve travel durations when assignments change.
   * 
   * This runs ONCE per assignment change, NOT during render.
   * Travel pairs are extracted from CHRONOLOGICALLY ADJACENT assignments per crew/day.
   * Results are cached with ASSIGNMENT-SCOPED keys to prevent collisions.
   */
  useEffect(() => {
    // Build travel pairs from consecutive assignments
    const pairs: TravelPair[] = [];
    
    // Group assignments by crew + date
    const grouped = new Map<string, ScheduleAssignmentWithJob[]>();
    for (const assignment of localAssignments) {
      if (!assignment.crewId) continue;
      const dateStr = assignment.date instanceof Date
        ? assignment.date.toISOString().split('T')[0]
        : new Date(assignment.date).toISOString().split('T')[0];
      const key = `${assignment.crewId}:${dateStr}`;
      const list = grouped.get(key) || [];
      list.push(assignment);
      grouped.set(key, list);
    }
    
    // PHASE G3.1: Extract STRICTLY ADJACENT pairs only
    for (const [groupKey, crewAssignments] of grouped) {
      // MANDATORY: Sort by startMinutes ASC - never trust incoming order
      const sorted = [...crewAssignments].sort((a, b) => a.startMinutes - b.startMinutes);
      const [crewId, dateStr] = groupKey.split(':');
      
      // Strict adjacency pairing: assignment[i] → assignment[i + 1]
      for (let i = 0; i < sorted.length - 1; i++) {
        const from = sorted[i];
        const to = sorted[i + 1];
        
        // Skip if jobs are missing
        if (!from.job || !to.job) continue;
        
        // Only include pairs where both jobs have valid addresses
        if (hasSchedulableAddress(from.job) && hasSchedulableAddress(to.job)) {
          const originAddr = buildFullAddress(from.job);
          const destAddr = buildFullAddress(to.job);
          
          if (originAddr && destAddr) {
            // PHASE G3.1: Assignment-scoped cache key
            const cacheKey = getAssignmentPairCacheKey(crewId, dateStr, from.id, to.id);
            
            pairs.push({
              cacheKey,
              crewId,
              date: dateStr,
              fromAssignmentId: from.id,
              toAssignmentId: to.id,
              originAddress: originAddr,
              destinationAddress: destAddr,
            });
            
            // Verification logging
            if (process.env.NEXT_PUBLIC_DEBUG_TRAVEL === 'true') {
              console.log('[TRAVEL-PAIR]', {
                crewId,
                date: dateStr,
                from: originAddr,
                to: destAddr,
                cacheKey,
              });
            }
          }
        }
      }
    }
    
    // Resolve travel durations (async, non-blocking)
    if (pairs.length > 0) {
      preResolveTravelDurations(pairs)
        .then(resolved => {
          setResolvedTravelDurations(resolved);
        })
        .catch(err => {
          console.warn('Failed to pre-resolve travel durations:', err);
          // Keep existing map on error
        });
    }
  }, [localAssignments]);

  useEffect(() => {
    let active = true;
    const resolveHqTravel = async () => {
      const hqFields = {
        hqAddressLine1: config?.hqLocation?.addressLine1 ?? null,
        hqAddressLine2: config?.hqLocation?.addressLine2 ?? null,
        hqSuburb: config?.hqLocation?.suburb ?? null,
        hqState: config?.hqLocation?.state ?? null,
        hqPostcode: config?.hqLocation?.postcode ?? null,
      };
      if (!hasHqAddress(hqFields)) {
        if (active) setResolvedHqTravelDurations(new Map());
        return;
      }

      const hqAddress = buildHqAddress(hqFields);
      const next = new Map<string, number>();
      const pending: Array<Promise<void>> = [];

      const enqueue = (key: string, origin: string, destination: string) => {
        const cached = travelCacheRef.current.get(getTravelKey(origin, destination));
        if (cached !== undefined) {
          next.set(key, cached);
          return;
        }
        pending.push(
          ensureTravelMinutes(origin, destination).then((duration) => {
            if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
              next.set(key, duration);
            }
          })
        );
      };

      const byCrewDay = new Map<string, ScheduleAssignmentWithJob[]>();
      localAssignments.forEach((assignment) => {
        if (!assignment.crewId) return;
        const dateKey = assignment.date instanceof Date
          ? assignment.date.toISOString().split('T')[0]
          : new Date(assignment.date).toISOString().split('T')[0];
        const key = `${assignment.crewId}:${dateKey}`;
        const list = byCrewDay.get(key) ?? [];
        list.push(assignment);
        byCrewDay.set(key, list);
      });

      for (const assignments of byCrewDay.values()) {
        const sorted = [...assignments].sort((a, b) => a.startMinutes - b.startMinutes);
        for (let i = 0; i < sorted.length; i++) {
          const assignment = sorted[i];
          const previous = i > 0 ? sorted[i - 1] : null;
          if (!assignment.job) continue;
          const jobAddress = buildFullAddress(assignment.job);
          if (!jobAddress) continue;

          if (assignment.startAtHq || previous?.endAtHq) {
            const key = getHqTravelCacheKey(assignment.id, 'start');
            enqueue(key, hqAddress, jobAddress);
          }
          if (assignment.endAtHq) {
            const key = getHqTravelCacheKey(assignment.id, 'end');
            enqueue(key, jobAddress, hqAddress);
          }
        }
      }

      if (pending.length > 0) {
        await Promise.all(pending);
      }

      if (active) {
        setResolvedHqTravelDurations(next);
      }
    };

    void resolveHqTravel();
    return () => {
      active = false;
    };
  }, [config?.hqLocation, ensureTravelMinutes, getTravelKey, localAssignments]);

  // Constants - must match ScheduleDayGrid time bounds
  // Removed PX_PER_MINUTE - using CSS grid with 24 columns now
  const DEFAULT_JOB_DURATION_MINUTES = 120; // 2 hours

  // PHASE C2: Get the dragging assignment or job
  const draggingAssignment = useMemo(() => {
    if (dragState.assignmentId) {
      return localAssignments.find(a => a.id === dragState.assignmentId) || null;
    }
    return null;
  }, [dragState.assignmentId, localAssignments]);

  const draggingJob = useMemo(() => {
    if (dragState.jobId) {
      return jobs.find(j => j.id === dragState.jobId) || null;
    }
    if (dragState.assignmentId) {
      const assignment = localAssignments.find(a => a.id === dragState.assignmentId);
      return assignment?.job || null;
    }
    return null;
  }, [dragState.jobId, dragState.assignmentId, jobs, localAssignments]);

  // H3.6: handleAssignJob deleted - all placement must go through drag
  // Stub function for backward compatibility with components that still expect this prop
  const handleAssignJob = useCallback(async () => {
    // Disabled - use drag to schedule
  }, []);

  // ❌ DELETED: dragStateRef - no longer needed with new global drag loop

  /**
   * Single authoritative placement function - NO refs, NO memoization, NO conditionals.
   * This is the ONLY function that commits placement to the backend.
   */
  /**
   * Unified placement commit function - single authority for all commits.
   * Uses schedule-v2 for snap-forward placement resolution.
   * Handles errors properly and updates UI.
   */
  const mergeResolvedTravelDurations = useCallback((updates: Map<string, number>) => {
    if (updates.size === 0) return;
    setResolvedTravelDurations(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const [key, minutes] of updates.entries()) {
        if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) continue;
        if (next.get(key) !== minutes) {
          next.set(key, minutes);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const seedResolvedTravelDurationsForCrewDay = useCallback((params: {
    allAssignments: ScheduleAssignmentWithJob[];
    crewId: string;
    dateStr: string; // YYYY-MM-DD
  }) => {
    const { allAssignments, crewId, dateStr } = params;

    const crewDay = allAssignments
      .filter(a => {
        const aDateStr = a.date instanceof Date
          ? a.date.toISOString().split('T')[0]
          : new Date(a.date).toISOString().split('T')[0];
        return a.crewId === crewId && aDateStr === dateStr;
      })
      .sort((a, b) => a.startMinutes - b.startMinutes);

    if (crewDay.length < 2) return;

    const immediateUpdates = new Map<string, number>();

    for (let i = 0; i < crewDay.length - 1; i++) {
      const from = crewDay[i];
      const to = crewDay[i + 1];
      if (!from.job || !to.job) continue;
      if (!hasSchedulableAddress(from.job) || !hasSchedulableAddress(to.job)) continue;

      const originAddr = buildFullAddress(from.job);
      const destAddr = buildFullAddress(to.job);
      if (!originAddr || !destAddr) continue;

      const cacheKey = getAssignmentPairCacheKey(crewId, dateStr, from.id, to.id);
      const existing = resolvedTravelDurations.get(cacheKey);
      const cached = travelCacheRef.current.get(getTravelKey(originAddr, destAddr));
      if (cached !== undefined) {
        if (existing !== cached) immediateUpdates.set(cacheKey, cached);
        continue;
      }

      if (typeof existing === 'number' && Number.isFinite(existing) && existing > 0) continue;

      ensureTravelMinutes(originAddr, destAddr).then(duration => {
        if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return;
        mergeResolvedTravelDurations(new Map([[cacheKey, duration]]));
      });
    }

    mergeResolvedTravelDurations(immediateUpdates);
  }, [ensureTravelMinutes, getTravelKey, mergeResolvedTravelDurations, resolvedTravelDurations]);

  const commitPlacementUnified = useCallback(async (params: {
    operation: 'create' | 'update';
    assignmentId?: string;
    jobId?: string;
    crewId: string | null;
    date: string; // ISO date string (YYYY-MM-DD)
    desiredStartMinutes: number; // Desired position (may be snapped)
    durationMinutes: number;
    assignmentType?: string; // Required for create
    skipSnap?: boolean; // For resize - if true, use desiredStartMinutes directly
    startAtHq?: boolean;
    endAtHq?: boolean;
  }): Promise<boolean> => {
    let optimisticAssignmentId: string | null = null;
    let didOptimisticUpdate = false;
    let previousAssignmentSnapshot: ScheduleAssignmentWithJob | null = null;

    const rollbackOptimisticUpdate = () => {
      if (!didOptimisticUpdate) return;
      if (params.operation === 'create' && optimisticAssignmentId) {
        setLocalAssignments(prev => prev.filter(a => a.id !== optimisticAssignmentId));
        return;
      }
      if (params.operation === 'update' && previousAssignmentSnapshot) {
        const snapshot = previousAssignmentSnapshot;
        setLocalAssignments(prev => {
          const updated = prev.map(a => (a.id === snapshot.id ? snapshot : a));
          return updated;
        });
      }
    };

    try {
      const crewId = params.crewId ?? null;
      const unassigned = crewId === null;

      // Validate inputs
      if (!params.date) {
        showToast('Missing date');
        return false;
      }
      if (params.operation === 'create' && !params.jobId) {
        showToast('Missing job ID for create operation');
        return false;
      }
      if (params.operation === 'update' && !params.assignmentId) {
        showToast('Missing assignment ID for update operation');
        return false;
      }
      
      // Validate bounds
      if (params.desiredStartMinutes < 0 || params.desiredStartMinutes > 720) {
        showToast('Start time must be within workday (6:00 AM - 6:00 PM)');
        return false;
      }
      
      const desiredEndMinutes = params.desiredStartMinutes + params.durationMinutes;
      if (desiredEndMinutes > 720) {
        showToast('Outside workday. Cannot place job after 6:00 PM.');
        return false;
      }
      
      if (params.desiredStartMinutes >= desiredEndMinutes) {
        showToast('Start time must be before end time');
        return false;
      }
      
      // Resolve placement using schedule-v2 (unless skipSnap is true)
      let resolvedStartMinutes = params.desiredStartMinutes;
      let snapDelta = 0;
      let snapReason: 'travel' | 'job' | 'out_of_bounds' | null = null;

      const previousAssignment =
        params.operation === 'update' && params.assignmentId
          ? assignmentsRef.current.find(a => a.id === params.assignmentId) || null
          : null;
      previousAssignmentSnapshot = previousAssignment;
      const previousCrewId = previousAssignment?.crewId ?? null;
      const previousDateStr = previousAssignment
        ? (previousAssignment.date instanceof Date
            ? previousAssignment.date.toISOString().split('T')[0]
            : new Date(previousAssignment.date).toISOString().split('T')[0])
        : null;
      const effectiveStartAtHq = params.startAtHq ?? previousAssignment?.startAtHq ?? false;
      const effectiveEndAtHq = params.endAtHq ?? previousAssignment?.endAtHq ?? false;
      
      if (!params.skipSnap && !unassigned) {
        // Get assignments for this crew/date
        const crewAssignments = assignmentsRef.current
          .filter(a => {
            const aDateStr = a.date instanceof Date
              ? a.date.toISOString().split('T')[0]
              : new Date(a.date).toISOString().split('T')[0];
            return a.crewId === crewId && aDateStr === params.date;
          })
          .map(a => ({ id: a.id, startMinutes: a.startMinutes, endMinutes: a.endMinutes }));
        
        // Exclude the assignment being updated
        const filteredAssignments = params.operation === 'update' && params.assignmentId
          ? crewAssignments.filter(a => a.id !== params.assignmentId)
          : crewAssignments;
        
        // Convert travel durations
        const travelDurationsMap = new Map<string, number>();
        for (const [key, duration] of resolvedTravelDurations.entries()) {
          const parts = key.split(':');
          if (parts.length === 4 && parts[0] === crewId && parts[1] === params.date) {
            travelDurationsMap.set(`${parts[2]}:${parts[3]}`, duration);
          }
        }
        
        // Build occupied timeline using schedule-v2
        const occupiedTimeline = buildOccupiedTimeline(filteredAssignments, travelDurationsMap);
        
        // Resolve placement
        const result = resolvePlacement({
          desiredStartMinutes: params.desiredStartMinutes,
          durationMinutes: params.durationMinutes,
          occupiedTimeline,
          workdayEndMinutes: 720,
        });
        
        resolvedStartMinutes = result.startMinutes ?? params.desiredStartMinutes;
        snapDelta = result.snapDelta;
        snapReason = result.snapReason;
        
        if (resolvedStartMinutes === null) {
          showToast('Cannot place here: travel time or overlaps push this job past available slots.');
          return false;
        }
      }
      
      // Get assignmentType for create operations
      let assignmentType = params.assignmentType || 'default';
      if (params.operation === 'create' && params.jobId) {
        const job = jobsRef.current.find((j: Job) => j.id === params.jobId);
        if (job) {
          assignmentType = job.jobTypeId || assignmentType;
        }
      }
      
      // Calculate endMinutes
      const endMinutes = resolvedStartMinutes + params.durationMinutes;

      const crewAssignments = assignmentsRef.current
        .filter(a => {
          const aDateStr = a.date instanceof Date
            ? a.date.toISOString().split('T')[0]
            : new Date(a.date).toISOString().split('T')[0];
          if (a.crewId !== crewId) return false;
          if (aDateStr !== params.date) return false;
          if (params.assignmentId && a.id === params.assignmentId) return false;
          return true;
        });
      const priorAssignment = crewAssignments
        .filter(a => a.endMinutes <= resolvedStartMinutes)
        .reduce<ScheduleAssignmentWithJob | null>(
          (latest, a) => (!latest || a.endMinutes > latest.endMinutes ? a : latest),
          null
        );
      const nextAssignment = crewAssignments
        .filter(a => a.startMinutes >= endMinutes)
        .reduce<ScheduleAssignmentWithJob | null>(
          (earliest, a) => (!earliest || a.startMinutes < earliest.startMinutes ? a : earliest),
          null
        );
      const requiresStartViaHq = effectiveStartAtHq || (priorAssignment?.endAtHq ?? false);
      const requiresEndViaHq = effectiveEndAtHq;

      if (!unassigned && (requiresStartViaHq || requiresEndViaHq)) {
        const hqFields = {
          hqAddressLine1: config?.hqLocation?.addressLine1 ?? null,
          hqAddressLine2: config?.hqLocation?.addressLine2 ?? null,
          hqSuburb: config?.hqLocation?.suburb ?? null,
          hqState: config?.hqLocation?.state ?? null,
          hqPostcode: config?.hqLocation?.postcode ?? null,
        };
        const hqAddress = hasHqAddress(hqFields) ? buildHqAddress(hqFields) : '';
        if (!hqAddress) {
          showToast('Set an HQ location before scheduling HQ travel.');
          return false;
        }

        let jobAddress = '';
        let jobRef: Job | null = null;
        if (params.operation === 'create' && params.jobId) {
          jobRef = jobsRef.current.find((j: Job) => j.id === params.jobId) || null;
        } else if (previousAssignment?.job) {
          jobRef = previousAssignment.job;
        }
        if (jobRef) {
          jobAddress = buildFullAddress(jobRef);
        }
        if (!jobAddress) {
          showToast('Job address is required for HQ travel.');
          return false;
        }

        if (requiresStartViaHq) {
          const travelMinutes = await ensureTravelMinutes(hqAddress, jobAddress);
          if (travelMinutes === null) {
            showToast('Unable to estimate HQ travel time.');
            return false;
          }
          const travelBuffer = quantizeCeil(travelMinutes);
          let requiredGap = travelBuffer;
          let previousEnd = 0;
          if (priorAssignment) {
            previousEnd = priorAssignment.endMinutes;
            const previousJobAddress = priorAssignment.job ? buildFullAddress(priorAssignment.job) : '';
            if (!previousJobAddress) {
              showToast('Previous job address is required for HQ travel.');
              return false;
            }
            const previousTravel = await ensureTravelMinutes(previousJobAddress, hqAddress);
            if (previousTravel === null) {
              showToast('Unable to estimate HQ travel time from previous job.');
              return false;
            }
            requiredGap += quantizeCeil(previousTravel);
          }
          const availableGap = resolvedStartMinutes - previousEnd;
          if (availableGap < requiredGap) {
            showToast(`Start time must allow ${Math.round(requiredGap)}m travel via HQ.`);
            return false;
          }
        }

        if (requiresEndViaHq) {
          const travelMinutes = await ensureTravelMinutes(jobAddress, hqAddress);
          if (travelMinutes === null) {
            showToast('Unable to estimate HQ travel time.');
            return false;
          }
          const travelBuffer = quantizeCeil(travelMinutes);
          if (nextAssignment) {
            const nextJobAddress = nextAssignment.job ? buildFullAddress(nextAssignment.job) : '';
            if (!nextJobAddress) {
              showToast('Next job address is required for HQ travel.');
              return false;
            }
            const nextTravel = await ensureTravelMinutes(hqAddress, nextJobAddress);
            if (nextTravel === null) {
              showToast('Unable to estimate HQ travel time to next job.');
              return false;
            }
            const requiredGap = travelBuffer + quantizeCeil(nextTravel);
            const availableGap = nextAssignment.startMinutes - endMinutes;
            if (availableGap < requiredGap) {
              showToast(`End time must allow ${Math.round(requiredGap)}m travel via HQ before the next job.`);
              return false;
            }
          } else if (endMinutes + travelBuffer > 720) {
            showToast('End time must allow travel back to HQ before 6:00 PM.');
            return false;
          }
        }
      }
      
      // Convert date to ISO datetime (required by API)
      const dateISO = new Date(params.date + 'T00:00:00.000Z').toISOString();
      
      // Build API payload
      let apiPayload: any;
      if (params.operation === 'update') {
        apiPayload = {
          id: params.assignmentId,
          orgId,
          crewId,
          date: dateISO,
          startMinutes: resolvedStartMinutes,
          endMinutes,
        };
        if (params.startAtHq !== undefined) {
          apiPayload.startAtHq = params.startAtHq;
        }
        if (params.endAtHq !== undefined) {
          apiPayload.endAtHq = params.endAtHq;
        }
      } else {
        apiPayload = {
          orgId,
          jobId: params.jobId,
          crewId,
          date: dateISO,
          startMinutes: resolvedStartMinutes,
          endMinutes,
          assignmentType,
          startAtHq: params.startAtHq ?? false,
          endAtHq: params.endAtHq ?? false,
        };
      }
      
      if (DRAG_DEBUG) {
        console.log('[COMMIT_UNIFIED]', { operation: params.operation, payload: apiPayload, snapDelta, snapReason });
      }

      // Optimistically update localAssignments immediately for near-instant UI feedback
      if (params.operation === 'create') {
        const job = jobsRef.current.find((j: Job) => j.id === params.jobId);
        if (job) {
          const assignmentDate = toOrgStartOfDay(params.date);
          
          // Calculate scheduledStart and scheduledEnd
          const scheduledStart = new Date(assignmentDate);
          scheduledStart.setHours(6, 0, 0, 0); // Workday starts at 06:00
          scheduledStart.setMinutes(scheduledStart.getMinutes() + resolvedStartMinutes);
          
          const scheduledEnd = new Date(assignmentDate);
          scheduledEnd.setHours(6, 0, 0, 0);
          scheduledEnd.setMinutes(scheduledEnd.getMinutes() + endMinutes);
          
          // Generate temp ID for optimistic create
          const assignmentId = `temp-${Date.now()}`;
          optimisticAssignmentId = assignmentId;
          
          // Construct assignment IDENTICAL to dbAssignmentToFrontend output
          const newAssignment: ScheduleAssignmentWithJob = normalizeAssignmentForOrgDay({
            id: assignmentId,
            jobId: params.jobId!,
            job, // Full job object (required)
            crewId,
            date: assignmentDate, // Date object normalized to start of day
            startMinutes: resolvedStartMinutes,
            endMinutes,
            assignmentType,
            startAtHq: params.startAtHq ?? false,
            endAtHq: params.endAtHq ?? false,
            status: 'scheduled', // Explicitly set to 'scheduled'
            scheduledStart, // Date object
            scheduledEnd, // Date object
          });
          
          // Log the optimistic assignment for debugging
          if (DRAG_DEBUG) {
            console.log('[SCHEDULE] optimistic assignment', {
              id: newAssignment.id,
              jobId: newAssignment.jobId,
              crewId: newAssignment.crewId,
              date: newAssignment.date.toISOString(),
              startMinutes: newAssignment.startMinutes,
              endMinutes: newAssignment.endMinutes,
              status: newAssignment.status,
              scheduledStart: newAssignment.scheduledStart.toISOString(),
              scheduledEnd: newAssignment.scheduledEnd.toISOString(),
              assignmentType: newAssignment.assignmentType,
            });
          }
          
          setLocalAssignments(prev => {
            const updated = [...prev, newAssignment];
            // Log activeDateAssignments count for debugging
            const activeDateStr = getOrgDayKey(activeDateRef.current);
            const newAssignmentDateStr = getOrgDayKey(newAssignment.date);
            const matchesActiveDate = newAssignmentDateStr === activeDateStr;
            
            if (DRAG_DEBUG) {
              console.log('[SCHEDULE] localAssignments updated (CREATE)', {
                before: prev.length,
                after: updated.length,
                newAssignmentMatchesActiveDate: matchesActiveDate,
                activeDate: activeDateStr,
                newAssignmentDate: newAssignmentDateStr,
                activeDateAssignmentsCount: updated.filter(a => {
                  return getOrgDayKey(a.date) === activeDateStr;
                }).length,
              });
            }
            if (crewId) {
              queueMicrotask(() => {
                seedResolvedTravelDurationsForCrewDay({
                  allAssignments: updated,
                  crewId,
                  dateStr: params.date,
                });
              });
            }
            return updated;
          });
          didOptimisticUpdate = true;
        }
      } else {
        // For UPDATE: find and update existing assignment
        if (params.assignmentId && previousAssignmentSnapshot) {
          setLocalAssignments(prev => {
            const updated = prev.map(a => {
              if (a.id === params.assignmentId) {
                const assignmentDate = toOrgStartOfDay(params.date);
                
                // Recalculate scheduledStart and scheduledEnd
                const scheduledStart = new Date(assignmentDate);
                scheduledStart.setHours(6, 0, 0, 0);
                scheduledStart.setMinutes(scheduledStart.getMinutes() + resolvedStartMinutes);
                
                const scheduledEnd = new Date(assignmentDate);
                scheduledEnd.setHours(6, 0, 0, 0);
                scheduledEnd.setMinutes(scheduledEnd.getMinutes() + endMinutes);
                
                return normalizeAssignmentForOrgDay({
                  ...a,
                  crewId,
                  date: assignmentDate,
                  startMinutes: resolvedStartMinutes,
                  endMinutes,
                  startAtHq: params.startAtHq ?? a.startAtHq,
                  endAtHq: params.endAtHq ?? a.endAtHq,
                  scheduledStart,
                  scheduledEnd,
                });
              }
              return a;
            });
            if (DRAG_DEBUG) console.log('[SCHEDULE] localAssignments updated (UPDATE)');
            queueMicrotask(() => {
              if (crewId) {
                seedResolvedTravelDurationsForCrewDay({
                  allAssignments: updated,
                  crewId,
                  dateStr: params.date,
                });
              }
              if (previousCrewId && previousDateStr && (previousCrewId !== crewId || previousDateStr !== params.date)) {
                seedResolvedTravelDurationsForCrewDay({
                  allAssignments: updated,
                  crewId: previousCrewId,
                  dateStr: previousDateStr,
                });
              }
            });
            return updated;
          });
          didOptimisticUpdate = true;
        }
      }

      // Call API
      const response = await fetch('/api/schedule-assignments', {
        method: params.operation === 'update' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload),
      });
      
      // Handle response
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to save placement';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        showToast(`Error: ${errorMessage}`);
        if (DRAG_DEBUG) {
          console.error('[COMMIT_FAILED]', { status: response.status, statusText: response.statusText, error: errorMessage });
        }
        rollbackOptimisticUpdate();
        return false;
      }
      
      const result = await response.json();
      if (!result.ok) {
        showToast(`Error: ${result.error || 'Failed to save placement'}`);
        if (DRAG_DEBUG) {
          console.error('[COMMIT_FAILED]', result);
        }
        rollbackOptimisticUpdate();
        return false;
      }

      const assignmentFromServer = result.data
        ? normalizeAssignmentForOrgDay(result.data)
        : null;
      if (assignmentFromServer) {
        setLocalAssignments(prev => {
          if (params.operation === 'create') {
            if (optimisticAssignmentId) {
              return prev.map(a => (a.id === optimisticAssignmentId ? assignmentFromServer : a));
            }
            const exists = prev.some(a => a.id === assignmentFromServer.id);
            return exists ? prev : [...prev, assignmentFromServer];
          }
          
          let updated = false;
          const mapped = prev.map(a => {
            if (a.id === assignmentFromServer.id) {
              updated = true;
              return assignmentFromServer;
            }
            return a;
          });
          return updated ? mapped : [...mapped, assignmentFromServer];
        });
      }
      
      // Show snap notification if snapping occurred
      if (snapDelta > 0 && snapReason) {
        const minutes = Math.round(snapDelta);
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        
        const reasonText =
          snapReason === 'travel'
            ? `Moved forward by ${timeStr} due to travel time.`
            : snapReason === 'job'
            ? `Moved forward by ${timeStr} due to overlap.`
            : `Moved forward by ${timeStr} to fit within working hours.`;
        
        showToast(reasonText);
      } else if (params.operation === 'create') {
        showToast('Job scheduled successfully');
      } else {
        showToast('Assignment updated successfully');
      }
      
      // Deprioritize router refresh (only for eventual consistency, not for UI updates)
      // router.refresh() is now optional - UI updates via optimistic updates above
      // Keep it for eventual consistency with server state, but don't rely on it
      setTimeout(() => {
        router.refresh();
      }, 1000); // Delay refresh to avoid blocking optimistic update
      
      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      rollbackOptimisticUpdate();
      showToast(`Error: ${errorMessage}`);
      console.error('Placement commit failed:', error);
      return false;
    }
  }, [config, ensureTravelMinutes, quantizeCeil, resolvedTravelDurations, router, seedResolvedTravelDurationsForCrewDay, showToast, orgId]);

  // ❌ DELETED: resolvePreviewPosition, schedulePreviewUpdate - replaced by global pointer loop

  /**
   * Drag start handler - initializes global drag state.
   * Uses new minimal refs system.
   */
  const handleStartDrag = useCallback((id: string, isAssignment: boolean = true) => {
    if (isMobile) {
      showToast('Drag scheduling is disabled on mobile.');
      return;
    }
    dragWindowsByLaneRef.current.clear();
    dragTravelStatusRef.current = 'idle';
    draggedJobAddressRef.current = null;
    assignmentAddressByIdRef.current = new Map();

    for (const a of assignmentsRef.current) {
      if (!a.job) continue;
      if (!hasSchedulableAddress(a.job)) continue;
      const addr = buildFullAddress(a.job);
      if (addr) assignmentAddressByIdRef.current.set(a.id, addr);
    }

    if (isAssignment) {
      const assignment = assignmentsRef.current.find(a => a.id === id);
      if (!assignment) {
        console.error('Assignment not found for drag', id);
        return;
      }
      
      if (assignment.status === 'completed') {
        console.error('Attempted to drag completed assignment', id);
        return;
      }

      // Day-view only: Ctrl+drag copies the assignment (keeps original in place) and creates a new assignment on drop.
      if (viewModeRef.current === 'day' && ctrlDownRef.current) {
        const jobDurationMinutes = assignment.endMinutes - assignment.startMinutes;
        draggedJobAddressRef.current =
          assignment.job && hasSchedulableAddress(assignment.job) ? buildFullAddress(assignment.job) : null;
        dragTravelStatusRef.current = draggedJobAddressRef.current ? 'pending' : 'idle';

        draggingRef.current = true;
        dragKindRef.current = 'job';
        draggedAssignmentIdRef.current = null;
        draggedJobIdRef.current = assignment.jobId;
        durationMinutesRef.current = jobDurationMinutes;
        lastLaneElRef.current = null;
        previewStartMinutesRef.current = null;
        snapDeltaRef.current = 0;
        snapReasonRef.current = null;
        currentCrewIdRef.current = null;
        currentDateStrRef.current = null;
        occupiedTimelineRef.current = [];

        setDragState({
          assignmentId: null,
          jobId: assignment.jobId,
          targetCrewId: null,
          targetDayIndex: null,
          laneBounds: null,
          mouseX: null,
          occupiedTimeline: null,
          occupiedTimelineCrewId: null,
          occupiedTimelineDate: null,
          previewStartMinutes: null,
          draggingJobDuration: jobDurationMinutes,
          snapDelta: 0,
          snapReason: null,
          validPlacementWindows: undefined,
          travelStatus: dragTravelStatusRef.current,
        });

        showToast('Copy mode: drop to assign this job to another crew.');
        return;
      }
      
      const jobDurationMinutes = assignment.endMinutes - assignment.startMinutes;

      if (assignment.job && hasSchedulableAddress(assignment.job)) {
        draggedJobAddressRef.current = buildFullAddress(assignment.job);
      }
      dragTravelStatusRef.current = draggedJobAddressRef.current ? 'pending' : 'idle';
      
      // Initialize drag refs
      draggingRef.current = true;
      dragKindRef.current = 'assignment';
      draggedAssignmentIdRef.current = id;
      draggedJobIdRef.current = null;
      durationMinutesRef.current = jobDurationMinutes;
      lastLaneElRef.current = null;
      previewStartMinutesRef.current = null;
      snapDeltaRef.current = 0;
      snapReasonRef.current = null;
      currentCrewIdRef.current = null;
      currentDateStrRef.current = null;
      occupiedTimelineRef.current = [];
      
      // Update React state for rendering
      setDragState({
        assignmentId: id,
        jobId: null,
        targetCrewId: null,
        targetDayIndex: null,
        laneBounds: null,
        mouseX: null,
        occupiedTimeline: null,
        occupiedTimelineCrewId: null,
        occupiedTimelineDate: null,
        previewStartMinutes: null,
        draggingJobDuration: jobDurationMinutes,
        snapDelta: 0,
        snapReason: null,
        validPlacementWindows: undefined,
        travelStatus: dragTravelStatusRef.current,
      });
    } else {
      const job = jobsRef.current.find(j => j.id === id);
      if (!job) {
        console.error('Job not found for drag', id);
        return;
      }
      
      if (job.status === 'completed') {
        showToast('Cannot schedule a completed job.');
        return;
      }
      
      const jobDurationMinutes = resolveDurationMinutes(job, null);

      if (hasSchedulableAddress(job)) {
        draggedJobAddressRef.current = buildFullAddress(job);
      }
      dragTravelStatusRef.current = draggedJobAddressRef.current ? 'pending' : 'idle';
      
      // Initialize drag refs
      draggingRef.current = true;
      dragKindRef.current = 'job';
      draggedAssignmentIdRef.current = null;
      draggedJobIdRef.current = id;
      durationMinutesRef.current = jobDurationMinutes;
      lastLaneElRef.current = null;
      previewStartMinutesRef.current = null;
      snapDeltaRef.current = 0;
      snapReasonRef.current = null;
      currentCrewIdRef.current = null;
      currentDateStrRef.current = null;
      occupiedTimelineRef.current = [];
      
      // Update React state for rendering
      setDragState({
        assignmentId: null,
        jobId: id,
        targetCrewId: null,
        targetDayIndex: null,
        laneBounds: null,
        mouseX: null,
        occupiedTimeline: null,
        occupiedTimelineCrewId: null,
        occupiedTimelineDate: null,
        previewStartMinutes: null,
        draggingJobDuration: jobDurationMinutes,
        snapDelta: 0,
        snapReason: null,
        validPlacementWindows: undefined,
        travelStatus: dragTravelStatusRef.current,
      });
    }

    const draggedAddress = draggedJobAddressRef.current;
    if (!draggedAddress) {
      return;
    }

    // Drag-time travel: precompute travel times between dragged job and all assignments on visible lanes.
    void (async () => {
      const laneEls = Array.from(document.querySelectorAll('.crew-grid[data-crew-id][data-date-str]')) as HTMLElement[];
      const laneKeys = new Set<string>();
      const lanes: Array<{ crewId: string; dateStr: string }> = [];

      for (const el of laneEls) {
        const crewId = el.dataset.crewId;
        const dateStr = el.dataset.dateStr;
        if (!crewId || !dateStr) continue;
        if (isUnassignedLane(crewId)) continue;
        const key = `${crewId}:${dateStr}`;
        if (laneKeys.has(key)) continue;
        laneKeys.add(key);
        lanes.push({ crewId, dateStr });
      }

      const assignmentIds = new Set<string>();
      for (const lane of lanes) {
        for (const a of assignmentsRef.current) {
          const aDateStr = a.date instanceof Date
            ? a.date.toISOString().split('T')[0]
            : new Date(a.date).toISOString().split('T')[0];
          if (a.crewId !== lane.crewId) continue;
          if (aDateStr !== lane.dateStr) continue;
          if (dragKindRef.current === 'assignment' && draggedAssignmentIdRef.current === a.id) continue;
          assignmentIds.add(a.id);
        }
      }

      const tasks: Array<() => Promise<void>> = [];
      for (const assignmentId of assignmentIds) {
        const addr = assignmentAddressByIdRef.current.get(assignmentId);
        if (!addr) continue;
        tasks.push(async () => { await ensureTravelMinutes(addr, draggedAddress); });
        tasks.push(async () => { await ensureTravelMinutes(draggedAddress, addr); });
      }

      await runWithConcurrency(tasks, 6);
      if (!draggingRef.current) return;

      const getAddr = (assignmentId: string) => assignmentAddressByIdRef.current.get(assignmentId) ?? null;

      let anyPending = false;
      const allWindows: Array<{ crewId: string; date: string; startMinutes: number; endMinutes: number }> = [];
      dragWindowsByLaneRef.current.clear();

      for (const lane of lanes) {
        const laneKey = `${lane.crewId}:${lane.dateStr}`;
        const { windows, pending } = computeWindowsForLane({
          crewId: lane.crewId,
          dateStr: lane.dateStr,
          durationMinutes: durationMinutesRef.current,
          excludeAssignmentId: dragKindRef.current === 'assignment' ? draggedAssignmentIdRef.current : null,
          getAddressForAssignmentId: getAddr,
        });

        if (pending) anyPending = true;
        dragWindowsByLaneRef.current.set(laneKey, windows);
        allWindows.push(...windows);
      }

      dragTravelStatusRef.current = anyPending ? 'pending' : 'ready';

      setDragState(prev => ({
        ...prev,
        validPlacementWindows: allWindows,
        travelStatus: dragTravelStatusRef.current,
      }));
    })();
  }, [computeWindowsForLane, ensureTravelMinutes, isMobile, runWithConcurrency, showToast]);

  // ❌ DELETED: handleDragHover - replaced by global pointer loop

  /**
   * PHASE D4: Delete a schedule assignment with contextual confirmation.
   * This removes ONLY the assignment - job remains intact.
   * Other assignments for the same job remain intact.
   * If no assignments remain, job appears in Unassigned Jobs panel.
   */
  const deleteAssignment = useCallback(async (
    assignmentId: string,
    assignment?: ScheduleAssignmentWithJob,
    options?: { skipConfirm?: boolean }
  ) => {
    const skipConfirm = options?.skipConfirm === true;
    if (!skipConfirm) {
      // PHASE D4: Build contextual confirmation message
      if (assignment) {
        const otherAssignments = localAssignments.filter(a => a.jobId === assignment.jobId && a.id !== assignmentId);
        const otherAssignmentsCount = otherAssignments.length;
        
        // Format date for display
        const assignmentDate = new Date(assignment.date);
        const dayName = assignmentDate.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = assignmentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        
        let confirmMessage = `Remove this crew from "${assignment.job.title}" on ${dayName}, ${dateStr}?`;
        
        if (otherAssignmentsCount > 0) {
          const otherCrews = otherAssignments.map(a => {
            const date = new Date(a.date);
            return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          }).join(', ');
          confirmMessage += `\n\nThis job is still assigned to ${otherAssignmentsCount} other crew${otherAssignmentsCount > 1 ? 's' : ''} (${otherCrews}).`;
        } else {
          confirmMessage += `\n\nThis will return the job to Unassigned Jobs.`;
        }
        
        if (!confirm(confirmMessage)) {
          return false; // User cancelled
        }
      } else {
        // Fallback if assignment not provided
        if (!confirm('Remove this assignment from the schedule? The job will remain intact.')) {
          return false;
        }
      }
    }

    try {
      // API expects id and orgId as query parameters
      const response = await fetch(`/api/schedule-assignments?id=${assignmentId}&orgId=${orgId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.ok) {
        // Optimistically remove assignment from local state
        setLocalAssignments(prev => {
          const updated = prev.filter(a => a.id !== assignmentId);
          if (DRAG_DEBUG) console.log('[SCHEDULE] localAssignments updated (DELETE)', updated.length);
          return updated;
        });
        
        // Deprioritize router refresh (only for eventual consistency)
        setTimeout(() => {
          router.refresh();
        }, 1000);
        return true;
      }
      console.error('Failed to delete assignment:', result.error);
      alert(`Failed to remove assignment: ${result.error}`);
      return false;
    } catch (error) {
      console.error('Error deleting assignment:', error);
      alert('Failed to remove assignment. Please try again.');
      return false;
    }
  }, [orgId, router, localAssignments]);

  const handleDeleteAssignment = useCallback(async (assignmentId: string, assignment?: ScheduleAssignmentWithJob) => {
    await deleteAssignment(assignmentId, assignment, { skipConfirm: false });
  }, [deleteAssignment]);

  // ❌ DELETED: commitPlacement - replaced by commitPlacementAuthoritative

  /**
   * Single global drag loop - attached ONCE, no dependency churn.
   * All drag logic lives here.
   */
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      
      // Hit-test lane under pointer using elementFromPoint (fallback for stale targets)
      const elementUnderPointer = document.elementFromPoint(e.clientX, e.clientY);
      const laneEl = elementUnderPointer?.closest('[data-lane="true"]') as HTMLElement | null;
      
      if (!laneEl) {
        // No lane under pointer - keep last preview but don't break dragging
        return;
      }
      
      // Extract crew/date from lane element
      const crewId = laneEl.dataset.crewId || null;
      const dateStr = laneEl.dataset.dateStr || null;
      
      if (!crewId || !dateStr) {
        if (DRAG_DEBUG) console.log('[POINTER_MOVE] Missing crew/date in lane element');
        return;
      }

      // Compute desiredStartMinutes from pointer X relative to lane bounds
      const laneRect = laneEl.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - laneRect.left, laneRect.width));
      
      // Convert to 15-minute units (48 slots: 0-705 minutes)
      const GRID_MINUTES = 15;
      const GRID_SLOTS = 720 / GRID_MINUTES; // 48
      const slotWidth = laneRect.width / GRID_SLOTS;
      let slotIndex = Math.floor(x / slotWidth);
      slotIndex = Math.max(0, Math.min(slotIndex, GRID_SLOTS - 1));
      const desiredStartMinutes = slotIndex * GRID_MINUTES;

      if (isUnassignedLane(crewId)) {
        previewStartMinutesRef.current = desiredStartMinutes;
        snapDeltaRef.current = 0;
        snapReasonRef.current = null;
        currentCrewIdRef.current = crewId;
        currentDateStrRef.current = dateStr;
        lastLaneElRef.current = laneEl;

        setDragState(prev => ({
          ...prev,
          previewStartMinutes: desiredStartMinutes,
          snapDelta: 0,
          snapReason: null,
          targetCrewId: crewId,
          travelStatus: 'idle',
        }));
        return;
      }

      const draggedAddress = draggedJobAddressRef.current;
      if (draggedAddress) {
        const laneKey = `${crewId}:${dateStr}`;
        const windows = dragWindowsByLaneRef.current.get(laneKey);

        if (!windows) {
          // Lane windows not ready yet (e.g., different day hovered) - start async compute.
          if (dragTravelStatusRef.current !== 'pending') {
            dragTravelStatusRef.current = 'pending';
            setDragState(prev => ({ ...prev, travelStatus: 'pending' }));
          }

          void (async () => {
            const assignmentIds: string[] = [];
            for (const a of assignmentsRef.current) {
              const aDateStr = a.date instanceof Date
                ? a.date.toISOString().split('T')[0]
                : new Date(a.date).toISOString().split('T')[0];
              if (a.crewId !== crewId) continue;
              if (aDateStr !== dateStr) continue;
              if (dragKindRef.current === 'assignment' && draggedAssignmentIdRef.current === a.id) continue;
              assignmentIds.push(a.id);
            }

            const tasks: Array<() => Promise<void>> = [];
            for (const assignmentId of assignmentIds) {
              const addr = assignmentAddressByIdRef.current.get(assignmentId);
              if (!addr) continue;
              tasks.push(async () => { await ensureTravelMinutes(addr, draggedAddress); });
              tasks.push(async () => { await ensureTravelMinutes(draggedAddress, addr); });
            }
            await runWithConcurrency(tasks, 6);
            if (!draggingRef.current) return;

            const getAddr = (assignmentId: string) => assignmentAddressByIdRef.current.get(assignmentId) ?? null;
            const { windows: newWindows, pending } = computeWindowsForLane({
              crewId,
              dateStr,
              durationMinutes: durationMinutesRef.current,
              excludeAssignmentId: dragKindRef.current === 'assignment' ? draggedAssignmentIdRef.current : null,
              getAddressForAssignmentId: getAddr,
            });

            dragWindowsByLaneRef.current.set(laneKey, newWindows);

            // Merge into state overlay list (avoid duplicates by laneKey rebuild).
            setDragState(prev => {
              const existing = prev.validPlacementWindows ?? [];
              const filtered = existing.filter(w => !(w.crewId === crewId && w.date === dateStr));
              return {
                ...prev,
                validPlacementWindows: [...filtered, ...newWindows],
                travelStatus: pending ? 'pending' : 'ready',
              };
            });

            dragTravelStatusRef.current = pending ? 'pending' : 'ready';
          })();

          previewStartMinutesRef.current = null;
          snapDeltaRef.current = 0;
          snapReasonRef.current = null;
          setDragState(prev => ({
            ...prev,
            previewStartMinutes: null,
            snapDelta: 0,
            snapReason: null,
            targetCrewId: crewId,
            travelStatus: 'pending',
          }));
          return;
        }

        // Travel windows are ready for this lane: resolve to the next valid start >= desiredStartMinutes.
        const duration = durationMinutesRef.current;
        let previewStart: number | null = null;

        for (const w of windows) {
          if (w.crewId !== crewId || w.date !== dateStr) continue;
          if (desiredStartMinutes < w.startMinutes) {
            previewStart = w.startMinutes;
            break;
          }
          if (desiredStartMinutes >= w.startMinutes && desiredStartMinutes < w.endMinutes) {
            previewStart = desiredStartMinutes;
            break;
          }
        }

        if (previewStart !== null && previewStart + duration > 720) {
          previewStart = null;
        }

        const snapDelta = previewStart === null ? 0 : previewStart - desiredStartMinutes;
        const snapReason: 'travel' | null = snapDelta > 0 ? 'travel' : null;

        previewStartMinutesRef.current = previewStart;
        snapDeltaRef.current = snapDelta;
        snapReasonRef.current = snapReason;
        currentCrewIdRef.current = crewId;
        currentDateStrRef.current = dateStr;
        lastLaneElRef.current = laneEl;

        setDragState(prev => {
          if (prev.previewStartMinutes === previewStart &&
              prev.snapDelta === snapDelta &&
              prev.snapReason === snapReason &&
              prev.targetCrewId === crewId &&
              prev.travelStatus === dragTravelStatusRef.current) {
            return prev;
          }
          return {
            ...prev,
            previewStartMinutes: previewStart,
            snapDelta,
            snapReason,
            targetCrewId: crewId,
            travelStatus: dragTravelStatusRef.current,
          };
        });
        return;
      }
      
      // Check if crew/date changed - rebuild timeline if needed
      const crewChanged = currentCrewIdRef.current !== crewId;
      const dateChanged = currentDateStrRef.current !== dateStr;
      
      if (crewChanged || dateChanged) {
        if (DRAG_DEBUG) console.log('[LANE_CHANGE]', { crewId, dateStr, prevCrew: currentCrewIdRef.current, prevDate: currentDateStrRef.current });
        
        // Get assignments for this crew/date
        const crewAssignments = assignmentsRef.current
          .filter(a => {
            const aDateStr = a.date instanceof Date
              ? a.date.toISOString().split('T')[0]
              : new Date(a.date).toISOString().split('T')[0];
            return a.crewId === crewId && aDateStr === dateStr;
          })
          .map(a => ({ id: a.id, startMinutes: a.startMinutes, endMinutes: a.endMinutes }));
        
        // Exclude dragged assignment if dragging assignment
        const filteredAssignments = dragKindRef.current === 'assignment' && draggedAssignmentIdRef.current
          ? crewAssignments.filter(a => a.id !== draggedAssignmentIdRef.current)
          : crewAssignments;
        
        // Convert travel durations
        const travelDurationsMap = new Map<string, number>();
        for (const [key, duration] of resolvedTravelDurations.entries()) {
          const parts = key.split(':');
          if (parts.length === 4 && parts[0] === crewId && parts[1] === dateStr) {
            travelDurationsMap.set(`${parts[2]}:${parts[3]}`, duration);
          }
        }
        
        // Build occupied timeline using schedule-v2
        occupiedTimelineRef.current = buildOccupiedTimeline(filteredAssignments, travelDurationsMap);
        currentCrewIdRef.current = crewId;
        currentDateStrRef.current = dateStr;
        lastLaneElRef.current = laneEl;
      } else {
        lastLaneElRef.current = laneEl;
      }
      
      if (DRAG_DEBUG) console.log('[POINTER_MOVE]', { desiredStartMinutes, crewId, dateStr });
      
      // Resolve placement using schedule-v2
      const result = resolvePlacement({
        desiredStartMinutes,
        durationMinutes: durationMinutesRef.current,
        occupiedTimeline: occupiedTimelineRef.current,
        workdayEndMinutes: 720,
      });
      
      // Store preview values
      previewStartMinutesRef.current = result.startMinutes;
      snapDeltaRef.current = result.snapDelta;
      snapReasonRef.current = result.snapReason;
      
      if (DRAG_DEBUG) console.log('[PREVIEW]', { 
        previewStartMinutes: result.startMinutes, 
        snapDelta: result.snapDelta, 
        snapReason: result.snapReason 
      });
      
      // Update React state for rendering (only when values change)
      setDragState(prev => {
        if (prev.previewStartMinutes === result.startMinutes && 
            prev.snapDelta === result.snapDelta && 
            prev.snapReason === result.snapReason) {
          return prev; // No change, skip render
        }
        return {
          ...prev,
          previewStartMinutes: result.startMinutes,
          snapDelta: result.snapDelta,
          snapReason: result.snapReason,
          targetCrewId: crewId,
        };
      });
    };

    const onPointerUp = async (e: PointerEvent) => {
      if (!draggingRef.current) return;
      
      const snapshot = {
        dragging: draggingRef.current,
        dragKind: dragKindRef.current,
        draggedJobId: draggedJobIdRef.current,
        draggedAssignmentId: draggedAssignmentIdRef.current,
        currentCrewId: currentCrewIdRef.current,
        currentDateStr: currentDateStrRef.current,
        previewStartMinutes: previewStartMinutesRef.current,
        durationMinutes: durationMinutesRef.current,
        draggedJobAddress: draggedJobAddressRef.current,
        dragTravelStatus: dragTravelStatusRef.current,
        snapDelta: snapDeltaRef.current,
        snapReason: snapReasonRef.current,
      };
      
      // End drag immediately so pointer moves can't affect placement.
      clearDrag();
      
      // Instrumentation: log all drag state
      if (DRAG_DEBUG) {
        console.log('[POINTER_UP] Drag state:', snapshot);
      }
      
      const previewStart = snapshot.previewStartMinutes;
      const crewId = snapshot.currentCrewId;
      const normalizedCrewId = crewId && isUnassignedLane(crewId) ? null : crewId;
      const dateStr = snapshot.currentDateStr;
      
      // Validate required values
      if (previewStart == null) {
        if (snapshot.draggedJobAddress && snapshot.dragTravelStatus === 'pending') {
          showToast('Calculating travel time... try again in a moment.');
        } else if (snapshot.draggedJobAddress && snapshot.dragTravelStatus === 'ready') {
          showToast('No valid placement: travel time required between nearby jobs. Try a later slot or another crew.');
        } else {
          showToast('Drop on a schedule lane to place.');
        }
        if (DRAG_DEBUG) console.log('[POINTER_UP] Missing previewStartMinutes');
        return;
      }
      
      if (!crewId) {
        showToast('Drop on a schedule lane to place.');
        if (DRAG_DEBUG) console.log('[POINTER_UP] Missing crewId');
        return;
      }
      
      if (!dateStr) {
        showToast('Drop on a schedule lane to place.');
        if (DRAG_DEBUG) console.log('[POINTER_UP] Missing dateStr');
        return;
      }
      
      if (!snapshot.durationMinutes || snapshot.durationMinutes <= 0) {
        showToast('Invalid job duration');
        if (DRAG_DEBUG) console.log('[POINTER_UP] Missing or invalid durationMinutes');
        return;
      }
      
      // Check if outside workday bounds
      if (previewStart + snapshot.durationMinutes > 720) {
        showToast('Outside workday. Cannot place job after 6:00 PM.');
        return;
      }

      const snappedDueToTravel =
        snapshot.snapDelta > 0 && snapshot.snapReason === 'travel';

      const operation = snapshot.dragKind === 'assignment' ? 'update' : 'create';
      const assignmentId = snapshot.draggedAssignmentId ?? undefined;
      const jobId = snapshot.draggedJobId ?? undefined;
      const durationMinutes = snapshot.durationMinutes;

      // Commit using unified function
      const success = await commitPlacementUnified({
        operation,
        assignmentId,
        jobId,
        crewId: normalizedCrewId,
        date: dateStr,
        desiredStartMinutes: previewStart, // Already resolved by schedule-v2 in pointermove
        durationMinutes,
        skipSnap: true, // Preview already snapped, use as-is
      });

      // Ensure the user sees the travel-block explanation (commit shows a generic success toast for drag drops).
      if (success && snappedDueToTravel) {
        showToast('Moved to the next available slot to allow travel time.');
      }
      
      // Drag already cleared above to keep drops instantaneous.
    };

    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', onPointerUp, true);
    window.addEventListener('pointercancel', onPointerUp, true);

    return () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
    };
  }, [commitPlacementUnified, computeWindowsForLane, ensureTravelMinutes, resolvedTravelDurations, router, runWithConcurrency, showToast, clearDrag]); // Only stable dependencies

  /**
   * PHASE F2: Start resize - called when user mousedowns on a resize handle
   */
  const handleStartResize = useCallback((
    assignmentId: string,
    edge: 'start' | 'end'
  ) => {
    const assignment = assignmentsRef.current.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    // Don't allow resize on completed assignments
    if (assignment.status === 'completed') return;

    // Cache the grid element for this crew to map pointer X -> minutes correctly
    const laneCrewId = assignment.crewId ?? UNASSIGNED_LANE_ID;
    resizeGridElRef.current = document.querySelector(
      `.crew-grid[data-crew-id="${laneCrewId}"]`
    ) as HTMLElement | null;
    
    setResizeState({
      assignmentId,
      edge,
      originalStartMinutes: assignment.startMinutes,
      originalEndMinutes: assignment.endMinutes,
      previewStartMinutes: assignment.startMinutes,
      previewEndMinutes: assignment.endMinutes,
    });
  }, []);

  /**
   * PHASE F2: Handle resize mouse move - update preview
   */
  const handleResizeMouseMove = useCallback((minutesFromWorkdayStart: number) => {
    if (!resizeState) return;
    
    // Snap to grid resolution (SLOT_MINUTES)
    const snappedMinutes = Math.round(minutesFromWorkdayStart / SLOT_MINUTES) * SLOT_MINUTES;
    
    // Clamp to workday bounds (0 = 06:00, 720 = 18:00)
    const clampedMinutes = Math.max(0, Math.min(snappedMinutes, SLOT_COUNT * SLOT_MINUTES));
    
    setResizeState(prev => {
      if (!prev) return null;
      
      if (prev.edge === 'start') {
        // Resizing start edge - must be before end with min duration
        const maxStart = prev.previewEndMinutes - MIN_ASSIGNMENT_DURATION_MINUTES;
        const newStart = Math.min(clampedMinutes, maxStart);
        return { ...prev, previewStartMinutes: newStart };
      } else {
        // Resizing end edge - must be after start with min duration
        const minEnd = prev.previewStartMinutes + MIN_ASSIGNMENT_DURATION_MINUTES;
        const newEnd = Math.max(clampedMinutes, minEnd);
        return { ...prev, previewEndMinutes: newEnd };
      }
    });
  }, [resizeState]);

  /**
   * PHASE F2: Global mouse move handler for resize preview
   * Converts mouse X position to minutes and updates preview
   */
  useEffect(() => {
    if (!resizeState) return;

    const handlePointerMove = (e: PointerEvent) => {
      const gridElement = resizeGridElRef.current;
      if (!gridElement) return;

      const rect = gridElement.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));

      const totalMinutes = SLOT_COUNT * SLOT_MINUTES;
      const minutesFromStart = (x / rect.width) * totalMinutes;
      handleResizeMouseMove(minutesFromStart);
    };

    const finalizeResize = async () => {
      if (!resizeState) return;
      
      const assignment = assignmentsRef.current.find(a => a.id === resizeState.assignmentId);
      if (!assignment) {
        setResizeState(null);
        resizeGridElRef.current = null;
        return;
      }
      
      // Get desired start/end from preview
      const desiredStartMinutes = resizeState.previewStartMinutes;
      const desiredEndMinutes = resizeState.previewEndMinutes;
      const durationMinutes = desiredEndMinutes - desiredStartMinutes;
      
      // Validate bounds
      if (desiredStartMinutes < 0 || desiredStartMinutes > 720) {
        showToast('Start time must be within workday (6:00 AM - 6:00 PM)');
        setResizeState(null);
        return;
      }
      
      if (desiredEndMinutes > 720) {
        showToast('Outside workday. Cannot extend job after 6:00 PM.');
        setResizeState(null);
        return;
      }
      
      if (desiredStartMinutes >= desiredEndMinutes) {
        showToast('Start time must be before end time');
        setResizeState(null);
        return;
      }
      
      // Get date string (org day key)
      const dateStr = getOrgDayKey(assignment.date);

      const isUnassigned = !assignment.crewId;
      if (!isUnassigned) {
        // Resize must NOT move the job: validate overlaps, but do not snap.
        // Mirror the same occupied timeline rules used by commitPlacementUnified.
        const crewAssignments = assignmentsRef.current
          .filter(a => {
            const aDateStr = getOrgDayKey(a.date);
            return a.crewId === assignment.crewId && aDateStr === dateStr;
          })
          .map(a => ({ id: a.id, startMinutes: a.startMinutes, endMinutes: a.endMinutes }))
          .filter(a => a.id !== resizeState.assignmentId);

        const travelDurationsMap = new Map<string, number>();
        for (const [key, duration] of resolvedTravelDurations.entries()) {
          const parts = key.split(':');
          if (parts.length === 4 && parts[0] === assignment.crewId && parts[1] === dateStr) {
            travelDurationsMap.set(`${parts[2]}:${parts[3]}`, duration);
          }
        }

        const occupiedTimeline = buildOccupiedTimeline(crewAssignments, travelDurationsMap);
        const overlapsOccupied = occupiedTimeline.some(block =>
          desiredStartMinutes < block.endMinutes && desiredEndMinutes > block.startMinutes
        );

        if (overlapsOccupied) {
          showToast('Resize blocked: overlaps existing job or travel');
          setResizeState(null);
          resizeGridElRef.current = null;
          return;
        }
      }
      
      // Commit resize using unified function
      const success = await commitPlacementUnified({
        operation: 'update',
        assignmentId: resizeState.assignmentId,
        crewId: assignment.crewId ?? null,
        date: dateStr,
        desiredStartMinutes,
        durationMinutes,
        skipSnap: true, // Validated above; do not snap/move on resize
      });
      
      setResizeState(null);
      resizeGridElRef.current = null;
    };

    const handlePointerUp = () => {
      void finalizeResize();
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
    };
  }, [resizeState, handleResizeMouseMove, commitPlacementUnified, showToast, resolvedTravelDurations]);

  // 5️⃣ Add verification logging in ScheduleView
  useEffect(() => {
    if (DRAG_DEBUG) {
      console.table(
        jobs.map(j => ({
          id: j.id,
          status: j.status,
          crewId: j.crewId,
          schedulable: isSchedulableJob(j),
          scheduled: Boolean(j.scheduledStart),
        }))
      );
    }
  }, [jobs]);

  // Filter jobs: exclude completed
  const activeJobs = useMemo(() => {
    return jobs.filter((job) => job.status !== 'completed');
  }, [jobs]);

  const activeDayKey = useMemo(() => getOrgDayKey(activeDate), [activeDate]);

  /**
   * PHASE C2: Assignments are now the primary schedule state.
   * They come from the server and already have job data joined.
   * 
   * Filter assignments for the active date (day view) or week (week view).
   */
  const activeDateAssignments = useMemo(() => {
    if (viewMode === 'day') {
      return localAssignments.filter((assignment) => {
        const assignmentDayKey = getOrgDayKey(assignment.date);
        const sameDay = assignmentDayKey === activeDayKey;

        if (DRAG_DEBUG) {
          console.log('[SCHEDULE][DAY-OWNERSHIP]', {
            activeDateISO: toOrgStartOfDay(activeDate).toISOString(),
            assignmentId: assignment.id,
            assignmentDateISO: toOrgStartOfDay(assignment.date).toISOString(),
            isSameDay: sameDay,
          });
        }

        return sameDay;
      });
    }
    // Week view: return all assignments (week view handles filtering)
    return localAssignments;
  }, [localAssignments, viewMode, activeDayKey, activeDate]);

  /**
   * E0.2: Scheduling Inbox - Jobs ready to be placed on the schedule for the active day.
   * 
   * A job appears in the inbox if:
   * 1. Status is schedulable (not completed, not cancelled)
   * 2. No active schedule assignment for the currently viewed day
   * 
   * Note: A job can appear in the inbox even if it has assignments on other days.
   * This is a day-scoped inbox.
   */
  const schedulingInboxJobs = useMemo(() => {
    // Get job IDs that already have assignments for the active date
    const assignedJobIdsForActiveDate = new Set(
      activeDateAssignments.map(a => a.jobId)
    );

    return jobs.filter((job) => {
      // Must be schedulable (not completed)
      if (job.status === 'completed') return false;
      
      // Must not already have an assignment for the active date
      if (assignedJobIdsForActiveDate.has(job.id)) return false;
      
      return true;
    });
  }, [jobs, activeDateAssignments]);

  // Legacy alias for backward compatibility (used by UnassignedJobsPanel prop)
  const unassignedJobs = schedulingInboxJobs;

  // 2️⃣ Derive schedulableJobs from canonical jobs array
  const schedulableJobs = useMemo(() => {
    return jobs.filter(isSchedulableJob);
  }, [jobs]);

  // Handle job scheduled callback
  const handleJobScheduled = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    router.refresh();
  }, [router]);

  /**
   * Handle scheduling from modal - routes through commitPlacementUnified
   */
  const handleScheduleFromModal = useCallback(async (params: {
    jobId: string;
    crewIds: string[];
    startTime: Date;
    endTime: Date;
    crewHqFlags?: Record<string, { startAtHq: boolean; endAtHq: boolean }>;
  }) => {
    const crewIds = params.crewIds ?? [];
    const dateStr = getOrgDayKey(params.startTime);
    // Convert Date to workday minutes (0-720, where 0 = 6:00 AM)
    const hours = params.startTime.getHours();
    const minutes = params.startTime.getMinutes();
    const totalMinutes = hours * 60 + minutes;
    const startMinutes = totalMinutes - (6 * 60); // Subtract 6 hours (360 minutes) to get workday offset
    const endTotalMinutes = params.endTime.getHours() * 60 + params.endTime.getMinutes();
    const endMinutes = endTotalMinutes - (6 * 60);
    const durationMinutes = endMinutes - startMinutes;
    
    const targets = crewIds.length > 0 ? crewIds : [null];
    const results = await Promise.all(
      targets.map((crewId) =>
        commitPlacementUnified({
          operation: 'create',
          jobId: params.jobId,
          crewId,
          date: dateStr,
          desiredStartMinutes: Math.max(0, Math.min(startMinutes, 720)), // Clamp to workday bounds
          durationMinutes,
          startAtHq: crewId ? params.crewHqFlags?.[crewId]?.startAtHq ?? false : false,
          endAtHq: crewId ? params.crewHqFlags?.[crewId]?.endAtHq ?? false : false,
        })
      )
    );
    const failedCount = results.filter((ok) => !ok).length;
    if (failedCount > 0) {
      if (crewIds.length === 0) {
        showToast('Failed to schedule job without a crew.');
      } else {
        showToast(`Failed to assign ${failedCount} employee${failedCount !== 1 ? 's' : ''}.`);
      }
    }
  }, [commitPlacementUnified, showToast]);

  const handleUpdateScheduleFromDrawer = useCallback(async (params: {
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
  }) => {
    const updates = params.updates ?? [];
    const creates = params.creates ?? [];
    const removals = params.removals ?? [];

    const updateResults = await Promise.all(
      updates.map((update) =>
        commitPlacementUnified({
          operation: 'update',
          assignmentId: update.assignmentId,
          crewId: update.crewId,
          date: params.date,
          desiredStartMinutes: update.startMinutes,
          durationMinutes: update.endMinutes - update.startMinutes,
          startAtHq: update.startAtHq,
          endAtHq: update.endAtHq,
        })
      )
    );

    const createResults = await Promise.all(
      creates.map((create) =>
        commitPlacementUnified({
          operation: 'create',
          jobId: params.jobId,
          crewId: create.crewId,
          date: params.date,
          desiredStartMinutes: create.startMinutes,
          durationMinutes: create.endMinutes - create.startMinutes,
          startAtHq: create.startAtHq,
          endAtHq: create.endAtHq,
        })
      )
    );

    const removalResults = await Promise.all(
      removals.map((assignmentId) => {
        const assignment = localAssignments.find((a) => a.id === assignmentId);
        return deleteAssignment(assignmentId, assignment, { skipConfirm: true });
      })
    );

    const failedUpdates = updateResults.filter((ok) => !ok).length;
    const failedCreates = createResults.filter((ok) => !ok).length;
    const failedRemovals = removalResults.filter((ok) => !ok).length;
    const totalFailures = failedUpdates + failedCreates + failedRemovals;
    if (totalFailures > 0) {
      showToast(`Schedule update completed with ${totalFailures} issue${totalFailures !== 1 ? 's' : ''}.`);
    } else {
      showToast('Schedule updated.');
    }
  }, [commitPlacementUnified, deleteAssignment, localAssignments, showToast]);

  const handleReschedule = useCallback(async (params: {
    assignmentId: string;
    crewId: string | null;
    date: string;
    startMinutes: number;
    durationMinutes: number;
  }) => {
    await commitPlacementUnified({
      operation: 'update',
      assignmentId: params.assignmentId,
      crewId: params.crewId,
      date: params.date,
      desiredStartMinutes: params.startMinutes,
      durationMinutes: params.durationMinutes,
      skipSnap: true,
    });
    setRefreshKey((prev) => prev + 1);
    router.refresh();
  }, [commitPlacementUnified, router]);

  /**
   * Handle create job from modal - routes through commitPlacementUnified
   */
  const handleCreateJob = useCallback(async (params: {
    title: string;
    addressLine1: string;
    crewIds: string[];
    startTime: Date;
    endTime: Date;
    crewHqFlags?: Record<string, { startAtHq: boolean; endAtHq: boolean }>;
    orgId: string;
  }): Promise<string | null> => {
    if (!params.title.trim()) {
      throw new Error('Title is required.');
    }
    if (!params.addressLine1.trim()) {
      throw new Error('Address is required.');
    }
    if (!params.startTime || !params.endTime) {
      throw new Error('Scheduled time is required.');
    }

    const scheduledStart = new Date(params.startTime);
    const scheduledEnd = new Date(params.endTime);
    if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime())) {
      throw new Error('Scheduled time is invalid.');
    }

    const workdayStartMinutes = WORKDAY_START_HOUR * 60;
    const workdayMinutes = SLOT_COUNT * SLOT_MINUTES;
    const startMinutes = scheduledStart.getHours() * 60 + scheduledStart.getMinutes() - workdayStartMinutes;
    const endMinutes = scheduledEnd.getHours() * 60 + scheduledEnd.getMinutes() - workdayStartMinutes;

    if (startMinutes < 0 || endMinutes > workdayMinutes) {
      throw new Error('Scheduled time must be within workday hours (06:00 to 18:00).');
    }
    if (startMinutes >= endMinutes) {
      throw new Error('Scheduled start must be before end time.');
    }
    const dateStr = getOrgDayKey(scheduledStart);
    if (!dateStr) {
      throw new Error('Scheduled date is invalid.');
    }

    const payload = {
      orgId: params.orgId,
      title: params.title.trim(),
      addressLine1: params.addressLine1.trim(),
      addressLine2: null,
      suburb: null,
      state: null,
      postcode: null,
      status: 'scheduled',
      priority: 'normal',
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
      notes: null,
    };

    const response = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!data?.ok) {
      const message = data?.error?.message || 'Failed to create job';
      throw new Error(message);
    }

    const createdJob = data.data as Job;
    if (!createdJob?.id) {
      throw new Error('Job created without an ID.');
    }

    const existing = jobsRef.current.some((job) => job.id === createdJob.id);
    if (!existing) {
      jobsRef.current = [...jobsRef.current, createdJob];
    }

    const targets = params.crewIds.length > 0 ? params.crewIds : [null];
    const results = await Promise.all(
      targets.map((crewId) =>
        commitPlacementUnified({
          operation: 'create',
          jobId: createdJob.id,
          crewId,
          date: dateStr,
          desiredStartMinutes: startMinutes,
          durationMinutes: endMinutes - startMinutes,
          skipSnap: true,
          startAtHq: crewId ? params.crewHqFlags?.[crewId]?.startAtHq ?? false : false,
          endAtHq: crewId ? params.crewHqFlags?.[crewId]?.endAtHq ?? false : false,
        })
      )
    );
    const failedCount = results.filter((ok) => !ok).length;
    if (failedCount > 0) {
      if (params.crewIds.length === 0) {
        showToast('Job created, but failed to schedule without a crew.');
      } else {
        showToast(`Job created, but failed to assign ${failedCount} employee${failedCount !== 1 ? 's' : ''}.`);
      }
    }

    return createdJob.id;
  }, [commitPlacementUnified, showToast]);

  /**
   * Open schedule modal for click-to-schedule
   */
  const openScheduleModal = useCallback((crewId: string, minutes: number, date?: Date) => {
    const resolvedCrewId = isUnassignedLane(crewId) ? null : crewId;
    setScheduleModalPrefill({
      crewId: resolvedCrewId,
      minutes,
      date: date || activeDate,
    });
    setScheduleModalOpen(true);
  }, [activeDate]);

  const openRescheduleSheet = useCallback((assignment: ScheduleAssignmentWithJob) => {
    if (!isMobile) return;
    setRescheduleAssignment(assignment);
    setRescheduleOpen(true);
  }, [isMobile]);

  // PHASE B: Track last scheduling action for undo
  const [lastScheduledAction, setLastScheduledAction] = useState<{
    jobId: string;
    previousCrewId: string | null;
    previousStart: Date | null;
    previousEnd: Date | null;
  } | null>(null);

  // PHASE C2: Calculate crew utilization for warnings using assignments
  const crewUtilization = useMemo(() => {
    const crewCounts: Record<string, { count: number; totalMinutes: number }> = {};
    
    // Use activeDateAssignments which are already filtered for the active date
    activeDateAssignments.forEach((assignment) => {
      if (!assignment.crewId) return;
      
      if (!crewCounts[assignment.crewId]) {
        crewCounts[assignment.crewId] = { count: 0, totalMinutes: 0 };
      }
      
      // Calculate duration from assignment's startMinutes and endMinutes
      const duration = assignment.endMinutes - assignment.startMinutes;
      crewCounts[assignment.crewId].count += 1;
      crewCounts[assignment.crewId].totalMinutes += duration;
    });
    
    return crewCounts;
  }, [activeDateAssignments]);

  // PHASE B: Get crew names for warnings
  const crewNames = useMemo(() => {
    const map: Record<string, string> = {};
    crews.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [crews]);

  // PHASE B: Handle undo
  const handleUndo = useCallback(async () => {
    if (!lastScheduledAction) return;
    
    try {
      const payload = {
        id: lastScheduledAction.jobId,
        orgId,
        crewId: lastScheduledAction.previousCrewId,
        scheduledStart: lastScheduledAction.previousStart?.toISOString() || null,
        scheduledEnd: lastScheduledAction.previousEnd?.toISOString() || null,
        status: lastScheduledAction.previousCrewId ? 'scheduled' : 'unassigned',
      };

      const response = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.ok) {
        setLastScheduledAction(null);
        setRefreshKey(prev => prev + 1);
        router.refresh();
      }
    } catch (error) {
      console.error('Error undoing schedule:', error);
    }
  }, [lastScheduledAction, orgId, router]);

  // Active date context for header display
  const activeDateContext = useMemo(() => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    const isToday = 
      activeDate.getDate() === today.getDate() &&
      activeDate.getMonth() === today.getMonth() &&
      activeDate.getFullYear() === today.getFullYear();
    
    return {
      dayName: dayNames[activeDate.getDay()],
      date: `${activeDate.getDate()} ${monthNames[activeDate.getMonth()]}`,
      isToday,
      unassignedCount: unassignedJobs.length,
    };
  }, [activeDate, today, unassignedJobs]);

  if (showMobileSkeleton && isMobile) {
    return (
      <div className="md:hidden space-y-4">
        <div className="flex items-center gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-20 rounded-full bg-bg-section/80 animate-pulse" />
          ))}
        </div>
        <Card className="animate-pulse">
          <div className="h-4 w-1/2 rounded bg-bg-section/80" />
          <div className="mt-3 h-24 w-full rounded bg-bg-section/80" />
        </Card>
        <Card className="animate-pulse">
          <div className="h-4 w-2/3 rounded bg-bg-section/80" />
          <div className="mt-3 h-32 w-full rounded bg-bg-section/80" />
        </Card>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border-subtle bg-bg-section/40 p-3">
          <p className="text-sm font-semibold text-text-primary">
            {activeDateContext.isToday ? 'Today' : activeDateContext.dayName}
          </p>
          <p className="text-xs text-text-tertiary mt-1">{activeDateContext.date}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const prevDay = new Date(activeDate);
                prevDay.setDate(prevDay.getDate() - 1);
                setActiveDate(prevDay);
              }}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setActiveDate(today)}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const nextDay = new Date(activeDate);
                nextDay.setDate(nextDay.getDate() + 1);
                setActiveDate(nextDay);
              }}
            >
              Next
            </Button>
          </div>
        </div>

        <ScheduleMobileList
          assignments={activeDateAssignments}
          onJobClick={setSelectedJob}
        />

        <JobDetailDrawer
          job={selectedJob}
          orgId={orgId}
          onClose={() => setSelectedJob(null)}
          onJobUpdate={() => {
            setRefreshKey((prev) => prev + 1);
            router.refresh();
          }}
          assignments={localAssignments}
          crewOptions={crews.map((c) => ({ id: c.id, name: c.name }))}
          scheduleContextDate={activeDate}
          onUpdateSchedule={handleUpdateScheduleFromDrawer}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* View Mode Toggle */}
      <div className="flex items-center gap-2 mb-6">
        <Chip active={viewMode === 'day'} onClick={() => setViewMode('day')}>
          Day
        </Chip>
        <Chip active={viewMode === 'week'} onClick={() => setViewMode('week')}>
          Week
        </Chip>
        <Chip active={viewMode === 'month'} onClick={() => setViewMode('month')}>
          Month
        </Chip>
      </div>

      {highlightCrewId && (
        <div className="mb-4 px-3 py-2 bg-accent-gold/10 border border-accent-gold/25 rounded-md flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-text-secondary">
              Highlighting crew:{' '}
              <span className="font-medium text-text-primary">
                {highlightedCrew?.name || highlightCrewId}
              </span>
            </p>
          </div>
          <button
            onClick={clearHighlight}
            className="text-xs font-medium text-text-secondary hover:text-text-primary border border-border-subtle rounded px-2 py-1 hover:bg-bg-section transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* PHASE B: Info Banner - Schedule Context */}
      <div className="mb-4 p-3 bg-bg-section/50 border border-border-subtle rounded-md">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">
                {activeDateContext.isToday ? 'Today' : ''} {activeDateContext.isToday ? '-' : ''} {activeDateContext.dayName}, {activeDateContext.date}
              </span>
              <span className="mx-2">•</span>
              <span>{unassignedJobs.length} unscheduled jobs</span>
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Click empty slots to schedule jobs. Drag jobs to reschedule. Job details are read-only here; schedule adjustments are available in the drawer.
            </p>
          </div>
          {lastScheduledAction && (
            <button
              onClick={handleUndo}
              className="text-xs font-medium text-accent-gold hover:text-accent-gold/80 transition-colors"
            >
              Undo
            </button>
          )}
        </div>
      </div>

      {/* F3.6 + G2.1: Visual Legend - minimal, always visible */}
      <div className="mb-3 flex items-center gap-4 text-[10px] text-text-tertiary">
        <span className="font-medium text-text-secondary">Legend:</span>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-sm ring-2 ring-amber-500/60 bg-transparent"></span>
          <span>Overlap</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500/80"></span>
          <span>Near capacity</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500/80"></span>
          <span>Over capacity</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-semibold text-accent-gold bg-accent-gold/15 px-1 rounded">2×</span>
          <span>Multi-assigned</span>
        </div>
        {/* G2.1: Travel block legend - updated to match actual styling */}
        <div className="flex items-center gap-1">
          <span className="w-4 h-3 rounded-sm bg-amber-500/20 border-2 border-dashed border-amber-500/40"></span>
          <span>Travel (est.)</span>
        </div>
        
        {/* DEBUG: Test button to create travel-worthy assignments */}
        {process.env.NEXT_PUBLIC_DEBUG_TRAVEL === 'true' && (
          <button
            onClick={async () => {
              const crewId = '00000000-0000-0000-0000-000000000001';
              const testJob = jobs.find(j => j.status !== 'completed');
              if (!testJob) {
                alert('No schedulable job found for test');
                return;
              }
              
              // Create two assignments with a 60-minute gap
              // Job A: 9:00-10:00 (180-240 minutes from 6am)
              // Job B: 11:00-12:00 (300-360 minutes from 6am)
              // date must be full ISO datetime string
              const dateISO = activeDate.toISOString();
              
              try {
                // Create first assignment (9:00-10:00)
                const res1 = await fetch('/api/schedule-assignments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jobId: testJob.id,
                    crewId,
                    date: dateISO,
                    startMinutes: 180, // 9:00
                    endMinutes: 240,   // 10:00
                    assignmentType: 'default', // Required field
                    orgId,
                  }),
                });
                
                if (!res1.ok) {
                  const err1 = await res1.json();
                  console.error('[DEBUG] First assignment failed:', err1);
                  alert('First assignment failed: ' + JSON.stringify(err1));
                  return;
                }
                
                // Create second assignment (11:00-12:00)
                const res2 = await fetch('/api/schedule-assignments', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    jobId: testJob.id,
                    crewId,
                    date: dateISO,
                    startMinutes: 300, // 11:00
                    endMinutes: 360,   // 12:00
                    assignmentType: 'default', // Required field
                    orgId,
                  }),
                });
                
                if (!res2.ok) {
                  const err2 = await res2.json();
                  console.error('[DEBUG] Second assignment failed:', err2);
                  alert('Second assignment failed: ' + JSON.stringify(err2));
                  return;
                }
                
                console.log('[DEBUG] Created 2 test assignments with 60-min gap (9:00-10:00 and 11:00-12:00). Refreshing...');
                router.refresh();
              } catch (err) {
                console.error('[DEBUG] Failed to create test assignments:', err);
                alert('Error: ' + (err instanceof Error ? err.message : String(err)));
              }
            }}
            className="ml-4 px-2 py-1 text-[10px] bg-purple-500/20 text-purple-400 border border-purple-500/40 rounded hover:bg-purple-500/30"
          >
            🧪 Test Travel
          </button>
        )}
      </div>

      {/* PHASE B: Crew Utilization Warnings (soft warnings, never block) */}
      {Object.entries(crewUtilization).some(([_, stats]) => stats.count >= 6 || stats.totalMinutes >= 600) && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">
            ⚠️ Heavy crew booking detected
          </p>
          <div className="space-y-1 text-xs text-yellow-600 dark:text-yellow-500">
            {Object.entries(crewUtilization).map(([crewId, stats]) => {
              if (stats.count < 6 && stats.totalMinutes < 600) return null;
              const crewName = crewNames[crewId] || 'Unknown Crew';
              return (
                <div key={crewId}>
                  {crewName}: {stats.count} jobs, {Math.round(stats.totalMinutes / 60)}h {stats.totalMinutes % 60}m scheduled
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Schedule Content */}
      {viewMode === 'day' && (
        <>
          {/* Day Navigation Controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const prevDay = new Date(activeDate);
                  prevDay.setDate(prevDay.getDate() - 1);
                  setActiveDate(prevDay);
                }}
                className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors border border-border-subtle rounded hover:bg-bg-section"
              >
                ← Previous Day
              </button>
              <button
                onClick={() => setActiveDate(today)}
                className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors border border-border-subtle rounded hover:bg-bg-section"
              >
                Today
              </button>
              <button
                onClick={() => {
                  const nextDay = new Date(activeDate);
                  nextDay.setDate(nextDay.getDate() + 1);
                  setActiveDate(nextDay);
                }}
                className="px-3 py-1 text-sm text-text-secondary hover:text-text-primary transition-colors border border-border-subtle rounded hover:bg-bg-section"
              >
                Next Day →
              </button>
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-4 md:flex-row">
            {/* Schedule grid - flex-1 with min-w-0 to allow expansion */}
            <div className="flex-1 min-w-0">
              <ScheduleDayView 
                assignments={activeDateAssignments}
                crews={crews}
                orgId={orgId}
                activeDate={activeDate}
                highlightCrewId={highlightCrewId}
                taskSummaryByJobId={isLoadingTaskSummary ? undefined : taskSummaryByJobId}
                onJobScheduled={handleJobScheduled}
                onAssignJob={handleAssignJob}
                onJobClick={setSelectedJob}
                onStartDrag={isMobile ? undefined : handleStartDrag}
                onSlotClick={(crewId, minutes) => openScheduleModal(crewId, minutes)}
                onDeleteAssignment={handleDeleteAssignment}
                dragState={dragState}
                draggingAssignment={draggingAssignment}
                onStartResize={isMobile ? undefined : handleStartResize}
                resizeState={resizeState}
                resolvedTravelDurations={resolvedTravelDurations}
                resolvedHqTravelDurations={resolvedHqTravelDurations}
              />
            </div>
            {/* E0.2: Scheduling Inbox - fixed width */}
            <div className="w-full md:w-80 flex-shrink-0">
              <SchedulingInboxPanel 
                jobs={schedulingInboxJobs} 
                orgId={orgId}
                activeDate={activeDate}
                onJobScheduled={handleJobScheduled}
                onJobClick={setSelectedJob}
                onStartDrag={isMobile ? undefined : (jobId) => handleStartDrag(jobId, false)}
                draggingJob={draggingJob}
                onScheduleClick={(job) => openScheduleModal('', 0)}
              />
            </div>
          </div>
          <JobDetailDrawer 
            job={selectedJob} 
            orgId={orgId} 
            onClose={() => setSelectedJob(null)}
            onJobUpdate={() => {
              // Refresh schedule when job is updated from drawer
              setRefreshKey(prev => prev + 1);
              router.refresh();
            }}
            assignments={localAssignments}
            crewOptions={crews.map((c) => ({ id: c.id, name: c.name }))}
            onRescheduleAssignment={isMobile ? openRescheduleSheet : undefined}
            scheduleContextDate={activeDate}
            onUpdateSchedule={handleUpdateScheduleFromDrawer}
          />
          <ScheduleJobModal
            isOpen={scheduleModalOpen}
            onClose={() => {
              setScheduleModalOpen(false);
              setScheduleModalPrefill({});
            }}
            onSchedule={handleScheduleFromModal}
            onCreateJob={handleCreateJob}
            schedulableJobs={schedulableJobs}
            orgId={orgId}
            crews={crews.map((c) => ({ id: c.id, name: c.name }))}
            prefillCrewId={scheduleModalPrefill.crewId}
            prefillDate={scheduleModalPrefill.date}
            prefillMinutes={scheduleModalPrefill.minutes}
          />
        </>
      )}

      {/* PHASE C1: Schedule Content - Week View */}
      {viewMode === 'week' && (
        <>
          <div className="flex-1 min-w-0">
            <ScheduleWeekView
              assignments={localAssignments}
              crews={crews}
              orgId={orgId}
              highlightCrewId={highlightCrewId}
              taskSummaryByJobId={isLoadingTaskSummary ? undefined : taskSummaryByJobId}
              onDayClick={(date) => {
                setActiveDate(date);
                setViewMode('day');
              }}
              onAssignJob={handleAssignJob}
              onJobClick={(job) => window.open(`/jobs/${job.id}`, '_blank')}
              onStartDrag={isMobile ? undefined : handleStartDrag}
              dragState={dragState}
              draggingAssignment={draggingAssignment}
              resolvedHqTravelDurations={resolvedHqTravelDurations}
            />
          </div>
          <JobDetailDrawer 
            job={selectedJob} 
            orgId={orgId} 
            onClose={() => setSelectedJob(null)}
            onJobUpdate={() => {
              setRefreshKey(prev => prev + 1);
              router.refresh();
            }}
            assignments={localAssignments}
            crewOptions={crews.map((c) => ({ id: c.id, name: c.name }))}
            onRescheduleAssignment={isMobile ? openRescheduleSheet : undefined}
            scheduleContextDate={activeDate}
            onUpdateSchedule={handleUpdateScheduleFromDrawer}
          />
        </>
      )}

      {/* Month View (same interaction model as week view; drill down to day for slot-level scheduling) */}
      {viewMode === 'month' && (
        <>
          <div className="flex-1 min-w-0">
            <ScheduleMonthView
              assignments={localAssignments}
              crews={crews}
              orgId={orgId}
              highlightCrewId={highlightCrewId}
              taskSummaryByJobId={isLoadingTaskSummary ? undefined : taskSummaryByJobId}
              onDayClick={(date) => {
                setActiveDate(date);
                setViewMode('day');
              }}
              onJobClick={(job) => window.open(`/jobs/${job.id}`, '_blank')}
              onStartDrag={isMobile ? undefined : handleStartDrag}
              dragState={dragState}
              draggingAssignment={draggingAssignment}
              resolvedHqTravelDurations={resolvedHqTravelDurations}
            />
          </div>
          <JobDetailDrawer
            job={selectedJob}
            orgId={orgId}
            onClose={() => setSelectedJob(null)}
            onJobUpdate={() => {
              setRefreshKey((prev) => prev + 1);
              router.refresh();
            }}
            assignments={localAssignments}
            crewOptions={crews.map((c) => ({ id: c.id, name: c.name }))}
            onRescheduleAssignment={isMobile ? openRescheduleSheet : undefined}
            scheduleContextDate={activeDate}
            onUpdateSchedule={handleUpdateScheduleFromDrawer}
          />
        </>
      )}

      <RescheduleSheet
        isOpen={rescheduleOpen}
        assignment={rescheduleAssignment}
        crews={crews.map((c) => ({ id: c.id, name: c.name }))}
        onClose={() => {
          setRescheduleOpen(false);
          setRescheduleAssignment(null);
        }}
        onReschedule={handleReschedule}
      />
      
      {/* Toast notification */}
      {toastVisible && toastMessage && (
        <div className="fixed bottom-4 right-4 bg-bg-primary border border-border-subtle rounded-lg shadow-lg px-4 py-3 z-50 animate-in fade-in slide-in-from-bottom-2">
          <p className="text-sm text-text-primary">{toastMessage}</p>
        </div>
      )}
    </div>
  );
}
