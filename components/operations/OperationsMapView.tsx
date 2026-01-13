'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import useIsMobile from '@/hooks/useIsMobile';
import useSwipeToClose from '@/hooks/useSwipeToClose';
import type { OperationsMapCrew, OperationsMapJob, OperationsMapPayload } from '@/lib/types/operations_map';
import type { Surface } from '@/lib/surface';
import {
  createGoogleMapsProvider,
  loadGoogleMaps,
  type GoogleGeocoder,
  type GoogleMapsApi,
  type MapPin,
  type MapProvider,
} from '@/components/operations/operationsMapProvider';

const DEFAULT_CENTER = { lat: -33.8688, lng: 151.2093 };

const JOB_STATUS_META: Record<string, { label: string; color: string }> = {
  unassigned: { label: 'Unassigned', color: '#64748b' },
  scheduled_unassigned: { label: 'Scheduled (Unassigned)', color: '#94a3b8' },
  scheduled_assigned: { label: 'Scheduled (Assigned)', color: '#38bdf8' },
  scheduled: { label: 'Scheduled', color: '#38bdf8' },
  in_progress: { label: 'In Progress', color: '#f59e0b' },
  completed: { label: 'Completed', color: '#22c55e' },
};

const CREW_STATE_META: Record<string, { label: string; color: string }> = {
  on_job: { label: 'On job', color: '#10b981' },
  en_route: { label: 'En route', color: '#38bdf8' },
  idle: { label: 'Idle', color: '#f59e0b' },
  off_shift: { label: 'Off shift', color: '#64748b' },
};

function formatDateTime(value: string | null): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeWindow(start: string | null, end: string | null): string {
  if (!start || !end) return 'Not scheduled';
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'Not scheduled';
  const day = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const startTime = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const endTime = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${startTime} - ${endTime}`;
}

function formatMinutes(value: number | null): string {
  if (value === null) return '-';
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function buildMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function buildRouteUrl(origin: { lat: number; lng: number }, destination: string): string {
  const originValue = `${origin.lat},${origin.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originValue)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

function resolveJobMarkerColor(job: OperationsMapJob): { color: string; halo: string | null } {
  if (job.risk.late) return { color: '#f97316', halo: '#ef4444' };
  if (job.risk.atRisk) return { color: '#f97316', halo: '#f97316' };
  const statusKey = job.scheduleState ?? job.status;
  const meta = JOB_STATUS_META[statusKey] ?? JOB_STATUS_META.scheduled;
  return { color: meta.color, halo: null };
}

function resolveCrewMarkerColor(crew: OperationsMapCrew): { color: string; halo: string | null } {
  const meta = CREW_STATE_META[crew.state] ?? CREW_STATE_META.idle;
  return { color: meta.color, halo: crew.idleRisk ? '#f59e0b' : null };
}

export default function OperationsMapView({ payload, surface }: { payload: OperationsMapPayload; surface?: Surface }) {
  const isMobile = useIsMobile();
  const isCrewSurface = surface === 'crew';
  const mapRef = useRef<HTMLDivElement | null>(null);
  const providerRef = useRef<MapProvider | null>(null);
  const geocodeQueueRef = useRef<Set<string>>(new Set());
  const [mapsApi, setMapsApi] = useState<GoogleMapsApi | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedCrewId, setSelectedCrewId] = useState<string | null>(null);
  const [lastSelectedJobId, setLastSelectedJobId] = useState<string | null>(null);
  const [geocodeOverrides, setGeocodeOverrides] = useState<Record<string, { lat: number; lng: number }>>({});

  const { permissions } = payload;
  const jobsById = useMemo(() => new Map(payload.jobs.map((job) => [job.id, job])), [payload.jobs]);
  const crewsById = useMemo(() => new Map(payload.crews.map((crew) => [crew.id, crew])), [payload.crews]);

  const selectedJob = selectedJobId ? jobsById.get(selectedJobId) ?? null : null;
  const selectedCrew = selectedCrewId ? crewsById.get(selectedCrewId) ?? null : null;
  const activePanel = selectedJob || selectedCrew;

  const mapCenter = useMemo(() => {
    const firstJob = payload.jobs.find((job) => job.latitude !== null && job.longitude !== null);
    if (firstJob && firstJob.latitude !== null && firstJob.longitude !== null) {
      return { lat: firstJob.latitude, lng: firstJob.longitude };
    }
    const firstCrew = payload.crews.find((crew) => crew.location.lat !== null && crew.location.lng !== null);
    if (firstCrew && firstCrew.location.lat !== null && firstCrew.location.lng !== null) {
      return { lat: firstCrew.location.lat, lng: firstCrew.location.lng };
    }
    return DEFAULT_CENTER;
  }, [payload.crews, payload.jobs]);

  useEffect(() => {
    let active = true;
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
    if (!apiKey) {
      setMapError('Missing Google Maps key');
      return;
    }

    loadGoogleMaps(apiKey)
      .then((api) => {
        if (!active) return;
        if (!api) {
          setMapError('Failed to load Google Maps');
          return;
        }
        setMapsApi(api);
        if (mapRef.current) {
          providerRef.current = createGoogleMapsProvider({
            api,
            container: mapRef.current,
            center: mapCenter,
            zoom: 11,
          });
          setMapReady(true);
        }
      })
      .catch(() => setMapError('Failed to load Google Maps'));

    return () => {
      active = false;
      providerRef.current?.destroy();
      providerRef.current = null;
    };
  }, [mapCenter]);

  const jobCoordinates = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    payload.jobs.forEach((job) => {
      if (job.latitude !== null && job.longitude !== null) {
        map.set(job.id, { lat: job.latitude, lng: job.longitude });
      }
    });
    Object.entries(geocodeOverrides).forEach(([jobId, coords]) => {
      map.set(jobId, coords);
    });
    return map;
  }, [geocodeOverrides, payload.jobs]);

  useEffect(() => {
    if (!mapsApi) return;
    const geocoder: GoogleGeocoder = new mapsApi.maps.Geocoder();
    const missingJobs = payload.jobs.filter(
      (job) => !jobCoordinates.has(job.id) && job.address
    );

    missingJobs.slice(0, 6).forEach((job) => {
      if (geocodeQueueRef.current.has(job.id)) return;
      geocodeQueueRef.current.add(job.id);
      geocoder.geocode({ address: job.address }, (results, status) => {
        geocodeQueueRef.current.delete(job.id);
        if (status !== 'OK' || !results || results.length === 0) return;
        const location = results[0].geometry.location;
        setGeocodeOverrides((prev) => ({
          ...prev,
          [job.id]: { lat: location.lat(), lng: location.lng() },
        }));
      });
    });
  }, [jobCoordinates, mapsApi, payload.jobs]);

  const pins: MapPin[] = useMemo(() => {
    const jobPins = payload.jobs.reduce<MapPin[]>((acc, job) => {
      const coords = jobCoordinates.get(job.id);
      if (!coords) return acc;
      const marker = resolveJobMarkerColor(job);
      acc.push({
        id: `job:${job.id}`,
        type: 'job',
        lat: coords.lat,
        lng: coords.lng,
        color: marker.color,
        haloColor: marker.halo,
        label: job.title,
        onClick: () => {
          setSelectedCrewId(null);
          setSelectedJobId(job.id);
          setLastSelectedJobId(job.id);
        },
      });
      return acc;
    }, []);

    const crewPins = payload.crews.reduce<MapPin[]>((acc, crew) => {
      let coords =
        crew.location.lat !== null && crew.location.lng !== null
          ? { lat: crew.location.lat, lng: crew.location.lng }
          : null;
      if (!coords && crew.location.jobId) {
        const jobCoords = jobCoordinates.get(crew.location.jobId);
        if (jobCoords) coords = jobCoords;
      }
      if (!coords) return acc;
      const marker = resolveCrewMarkerColor(crew);
      acc.push({
        id: `crew:${crew.id}`,
        type: 'crew',
        lat: coords.lat,
        lng: coords.lng,
        color: marker.color,
        haloColor: marker.halo,
        label: crew.name,
        onClick: () => {
          setSelectedJobId(null);
          setSelectedCrewId(crew.id);
        },
      });
      return acc;
    }, []);

    return [...jobPins, ...crewPins];
  }, [jobCoordinates, payload.crews, payload.jobs]);

  useEffect(() => {
    if (!providerRef.current || !mapReady) return;
    const focusId = selectedJobId ? `job:${selectedJobId}` : selectedCrewId ? `crew:${selectedCrewId}` : null;
    providerRef.current.setPins(pins, { focusId });
  }, [mapReady, pins, selectedCrewId, selectedJobId]);

  useEffect(() => {
    if (!activePanel) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedCrewId(null);
        setSelectedJobId(null);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [activePanel]);

  useEffect(() => {
    if (activePanel) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activePanel]);

  const swipe = useSwipeToClose(() => {
    setSelectedCrewId(null);
    setSelectedJobId(null);
  }, isMobile);

  const jobCounts = useMemo(() => {
    const counts = {
      total: payload.jobs.length,
      unassigned: 0,
      scheduledAssigned: 0,
      scheduledUnassigned: 0,
      inProgress: 0,
      completed: 0,
      atRisk: 0,
      late: 0,
    };
    payload.jobs.forEach((job) => {
      const statusKey = job.scheduleState ?? job.status;
      if (statusKey === 'unassigned') counts.unassigned += 1;
      if (statusKey === 'scheduled_unassigned') counts.scheduledUnassigned += 1;
      if (statusKey === 'scheduled_assigned' || statusKey === 'scheduled') counts.scheduledAssigned += 1;
      if (statusKey === 'in_progress') counts.inProgress += 1;
      if (statusKey === 'completed') counts.completed += 1;
      if (job.risk.atRisk) counts.atRisk += 1;
      if (job.risk.late) counts.late += 1;
    });
    return counts;
  }, [payload.jobs]);

  const crewCounts = useMemo(() => {
    const counts = {
      total: payload.crews.length,
      onJob: 0,
      enRoute: 0,
      idle: 0,
      offShift: 0,
      idleRisk: 0,
    };
    payload.crews.forEach((crew) => {
      if (crew.state === 'on_job') counts.onJob += 1;
      if (crew.state === 'en_route') counts.enRoute += 1;
      if (crew.state === 'idle') counts.idle += 1;
      if (crew.state === 'off_shift') counts.offShift += 1;
      if (crew.idleRisk) counts.idleRisk += 1;
    });
    return counts;
  }, [payload.crews]);

  const atRiskJobs = useMemo(() => payload.jobs.filter((job) => job.risk.atRisk).slice(0, 6), [payload.jobs]);
  const idleCrews = useMemo(() => payload.crews.filter((crew) => crew.idleRisk).slice(0, 6), [payload.crews]);

  const selectedJobCrew = selectedJob?.crew?.[0] ? crewsById.get(selectedJob.crew[0].id) ?? null : null;
  const selectedJobRouteOrigin = useMemo(() => {
    if (!selectedJobCrew) return null;
    if (selectedJobCrew.location.lat !== null && selectedJobCrew.location.lng !== null) {
      return { lat: selectedJobCrew.location.lat, lng: selectedJobCrew.location.lng };
    }
    if (selectedJobCrew.location.jobId) {
      const coords = jobCoordinates.get(selectedJobCrew.location.jobId);
      if (coords) return coords;
    }
    return null;
  }, [jobCoordinates, selectedJobCrew]);

  const selectedCrewRouteOrigin = useMemo(() => {
    if (!selectedCrew) return null;
    if (selectedCrew.location.lat !== null && selectedCrew.location.lng !== null) {
      return { lat: selectedCrew.location.lat, lng: selectedCrew.location.lng };
    }
    if (selectedCrew.location.jobId) {
      const coords = jobCoordinates.get(selectedCrew.location.jobId);
      if (coords) return coords;
    }
    return null;
  }, [jobCoordinates, selectedCrew]);

  const lastJobForCrewRoute = lastSelectedJobId ? jobsById.get(lastSelectedJobId) ?? null : null;
  const crewRouteDestination = lastJobForCrewRoute?.address?.trim() ? lastJobForCrewRoute.address : null;

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col gap-4 lg:flex-row">
      <aside className="w-full lg:w-80 xl:w-96 rounded-xl border border-border-subtle bg-bg-section/60 p-4 overflow-y-auto">
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Live Operations</p>
            <p className="text-lg font-semibold text-text-primary mt-2">
              {jobCounts.total} jobs / {crewCounts.total} crews
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              Updated {new Date(payload.generatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <Card className="p-4">
            <p className="text-sm font-semibold text-text-primary">Job status</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
              <span>Unassigned</span>
              <span className="text-right text-text-primary">{jobCounts.unassigned}</span>
              <span>Scheduled (Unassigned)</span>
              <span className="text-right text-text-primary">{jobCounts.scheduledUnassigned}</span>
              <span>Scheduled (Assigned)</span>
              <span className="text-right text-text-primary">{jobCounts.scheduledAssigned}</span>
              <span>In progress</span>
              <span className="text-right text-text-primary">{jobCounts.inProgress}</span>
              <span>Completed</span>
              <span className="text-right text-text-primary">{jobCounts.completed}</span>
              <span>At risk</span>
              <span className="text-right text-text-primary">{jobCounts.atRisk}</span>
            </div>
          </Card>

          <Card className="p-4">
            <p className="text-sm font-semibold text-text-primary">Crew state</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-secondary">
              <span>On job</span>
              <span className="text-right text-text-primary">{crewCounts.onJob}</span>
              <span>En route</span>
              <span className="text-right text-text-primary">{crewCounts.enRoute}</span>
              <span>Idle</span>
              <span className="text-right text-text-primary">{crewCounts.idle}</span>
              <span>Off shift</span>
              <span className="text-right text-text-primary">{crewCounts.offShift}</span>
              <span>Idle risk</span>
              <span className="text-right text-text-primary">{crewCounts.idleRisk}</span>
            </div>
          </Card>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">At-risk jobs</p>
            {atRiskJobs.length === 0 ? (
              <p className="text-xs text-text-tertiary mt-2">No critical signals right now.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {atRiskJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => {
                      setSelectedCrewId(null);
                      setSelectedJobId(job.id);
                      setLastSelectedJobId(job.id);
                    }}
                    className="w-full rounded-lg border border-border-subtle bg-bg-card/40 p-3 text-left transition hover:bg-bg-card/70"
                  >
                    <p className="text-sm font-semibold text-text-primary truncate">{job.title}</p>
                    <p className="text-xs text-text-tertiary mt-1">{formatDateTime(job.scheduledStart)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {job.risk.reasons.slice(0, 2).map((reason) => (
                        <Badge key={reason} variant="muted">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Idle crews</p>
            {idleCrews.length === 0 ? (
              <p className="text-xs text-text-tertiary mt-2">No crews exceeding idle threshold.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {idleCrews.map((crew) => (
                  <button
                    key={crew.id}
                    type="button"
                    onClick={() => {
                      setSelectedJobId(null);
                      setSelectedCrewId(crew.id);
                    }}
                    className="w-full rounded-lg border border-border-subtle bg-bg-card/40 p-3 text-left transition hover:bg-bg-card/70"
                  >
                    <p className="text-sm font-semibold text-text-primary truncate">{crew.name}</p>
                    <p className="text-xs text-text-tertiary mt-1">Idle {formatMinutes(crew.idleMinutes)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="relative flex-1 overflow-hidden rounded-xl border border-border-subtle bg-bg-section/30">
        <div ref={mapRef} className="absolute inset-0" />
        {!mapReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg-section/80 text-center">
            <p className="text-sm text-text-secondary">{mapError ?? 'Loading map surface...'}</p>
            <p className="text-xs text-text-tertiary">Pins still load in the control panel.</p>
          </div>
        )}
        <div className="absolute left-4 top-4 flex flex-wrap gap-2 rounded-full border border-border-subtle bg-bg-base/80 px-3 py-2 text-xs text-text-secondary backdrop-blur">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#f97316]" />
            At risk
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
            Scheduled
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#10b981]" />
            On job
          </span>
        </div>
      </section>

      {activePanel && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => {
              setSelectedCrewId(null);
              setSelectedJobId(null);
            }}
          />
          <div
            className={cn(
              'fixed z-50 overflow-y-auto shadow-2xl bg-bg-base border-border-subtle',
              'transform transition-transform duration-300 ease-out',
              'inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t',
              'md:inset-y-0 md:right-0 md:left-auto md:top-0 md:bottom-0 md:max-h-none md:w-full md:max-w-lg md:rounded-none md:border-l',
              activePanel ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-full'
            )}
            {...swipe}
          >
            <div className="p-6 space-y-6">
              {isMobile && <div className="mx-auto h-1.5 w-12 rounded-full bg-border-subtle" />}

              {selectedJob && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Job</p>
                      <h2 className="text-2xl font-semibold text-text-primary mt-2">{selectedJob.title}</h2>
                      <p className="text-sm text-text-secondary mt-2">{selectedJob.address || 'Site address not provided'}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedJobId(null)}>
                      Close
                    </Button>
                  </div>

                  <Card className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">
                        {JOB_STATUS_META[selectedJob.scheduleState ?? selectedJob.status]?.label ??
                          (selectedJob.scheduleState ?? selectedJob.status)}
                      </Badge>
                      <Badge variant="muted">{selectedJob.progressPercent ?? 0}% complete</Badge>
                      {selectedJob.risk.late && <Badge variant="gold">Late</Badge>}
                      {selectedJob.risk.blocked && <Badge variant="muted">Blocked</Badge>}
                      {selectedJob.risk.idleRisk && <Badge variant="gold">Crew risk</Badge>}
                    </div>
                    <div className="text-sm text-text-secondary">
                      <p>Assigned crew: {selectedJob.crew.length > 0 ? selectedJob.crew.map((c) => c.name).join(', ') : 'Unassigned'}</p>
                      <p className="mt-1">Scheduled: {formatTimeWindow(selectedJob.scheduledStart, selectedJob.scheduledEnd)}</p>
                    </div>
                  </Card>

                  <Card className="p-4 space-y-3">
                    <p className="text-sm font-semibold text-text-primary">Health indicators</p>
                    {selectedJob.risk.reasons.length === 0 ? (
                      <p className="text-sm text-text-tertiary">No alerts detected.</p>
                    ) : (
                      <ul className="space-y-2 text-sm text-text-secondary">
                        {selectedJob.risk.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  <div className="grid gap-2 md:grid-cols-2">
                    {!isCrewSurface && (
                      <Link href={`/jobs/${selectedJob.id}`}>
                        <Button className="w-full">View Job</Button>
                      </Link>
                    )}
                    {permissions.canManageSchedule && !isCrewSurface && (
                      <Link href={`/schedule?jobId=${selectedJob.id}`}>
                        <Button className="w-full" variant="secondary">
                          Reassign Crew
                        </Button>
                      </Link>
                    )}
                    <Button
                      className="w-full"
                      variant="secondary"
                      disabled={!selectedJob.address || !selectedJobRouteOrigin}
                      onClick={() => {
                        if (!selectedJob.address || !selectedJobRouteOrigin) return;
                        window.open(buildRouteUrl(selectedJobRouteOrigin, selectedJob.address), '_blank');
                      }}
                    >
                      Calculate Route
                    </Button>
                    <Button
                      className="w-full"
                      variant="ghost"
                      disabled={!selectedJob.address}
                      onClick={() => {
                        if (!selectedJob.address) return;
                        window.open(buildMapsSearchUrl(selectedJob.address), '_blank');
                      }}
                    >
                      Open in Google Maps
                    </Button>
                  </div>
                </>
              )}

              {selectedCrew && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Crew</p>
                      <h2 className="text-2xl font-semibold text-text-primary mt-2">{selectedCrew.name}</h2>
                      <p className="text-sm text-text-secondary mt-2">{selectedCrew.role ?? 'Field staff'}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCrewId(null)}>
                      Close
                    </Button>
                  </div>

                  <Card className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">{CREW_STATE_META[selectedCrew.state]?.label ?? selectedCrew.state}</Badge>
                      {selectedCrew.idleRisk && <Badge variant="gold">Idle risk</Badge>}
                    </div>
                    <div className="text-sm text-text-secondary">
                      <p>Current job: {selectedCrew.currentJobId ? jobsById.get(selectedCrew.currentJobId)?.title ?? 'Assigned job' : 'None'}</p>
                      <p className="mt-1">ETA to next job: {formatMinutes(selectedCrew.nextJobStart ? Math.max(0, Math.round((new Date(selectedCrew.nextJobStart).getTime() - Date.now()) / 60000)) : null)}</p>
                    </div>
                  </Card>

                  <div className="grid gap-2 md:grid-cols-2">
                    {!isCrewSurface && (
                      <Link href={`/schedule?highlightCrewId=${selectedCrew.id}`}>
                        <Button className="w-full">View Schedule</Button>
                      </Link>
                    )}
                    {permissions.canManageSchedule && !isCrewSurface && (
                      <Link href="/schedule">
                        <Button className="w-full" variant="secondary">
                          Assign Job
                        </Button>
                      </Link>
                    )}
                    <Button
                      className="w-full"
                      variant="secondary"
                      disabled={!crewRouteDestination || !selectedCrewRouteOrigin}
                      onClick={() => {
                        if (!crewRouteDestination || !selectedCrewRouteOrigin) return;
                        window.open(buildRouteUrl(selectedCrewRouteOrigin, crewRouteDestination), '_blank');
                      }}
                    >
                      Calculate Route to selected job
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
