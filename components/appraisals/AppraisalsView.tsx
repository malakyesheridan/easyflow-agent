'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Chip, GlassCard, PageHeader, SectionHeader, Select, Input } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import ScoreBreakdownTooltip from '@/components/ui/ScoreBreakdownTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

type Owner = { id: string; name: string | null; email: string | null };

type AppraisalRow = {
  id: string;
  contactId: string;
  contactName: string;
  contactSuburb: string | null;
  stage: string;
  appointmentAt: string | null;
  meetingType: string;
  address: string | null;
  suburb: string | null;
  winProbabilityScore: number;
  winProbabilityReasons: string[];
  owner: Owner | null;
  nextActionDue: string | null;
  prepComplete: boolean;
  followupScheduled: boolean;
  overdue: boolean;
};

type AppraisalsResponse = {
  data: AppraisalRow[];
  page: number;
  pageSize: number;
  total: number;
};

type Stage = { key: string; label: string };


const STAGES: Stage[] = [
  { key: 'booked', label: 'Booked' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'prepped', label: 'Prepped' },
  { key: 'attended', label: 'Attended' },
  { key: 'followup_sent', label: 'Follow-up Sent' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

const STAGE_DESCRIPTIONS: Record<string, string> = {
  booked: 'Appointment booked with the vendor.',
  confirmed: 'Appointment confirmed with decision makers.',
  prepped: 'Prep tasks in progress or completed.',
  attended: 'Appraisal meeting completed.',
  followup_sent: 'Follow-up plan or update sent.',
  won: 'Listing secured.',
  lost: 'Listing lost to another agent or delayed.',
};

const SORT_OPTIONS = [
  { value: 'appointment_at_asc', label: 'Appointment time (soonest)' },
  { value: 'appointment_at_desc', label: 'Appointment time (latest)' },
  { value: 'win_probability_desc', label: 'Win probability (highest)' },
  { value: 'next_action_asc', label: 'Next action due' },
  { value: 'stage', label: 'Stage' },
];

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getBand(score: number) {
  if (score >= 75) return { label: 'Hot', variant: 'gold' as const };
  if (score >= 45) return { label: 'Warm', variant: 'default' as const };
  return { label: 'Cold', variant: 'muted' as const };
}

export default function AppraisalsView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [rows, setRows] = useState<AppraisalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<'board' | 'list'>('board');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [sort, setSort] = useState('appointment_at_asc');

  const [owners, setOwners] = useState<Owner[]>([]);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const loadOwners = async () => {
      try {
        const res = await fetch(`/api/contacts/owners?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load owners');
        if (!cancelled) setOwners(json.data ?? []);
      } catch {
        if (!cancelled) setOwners([]);
      }
    };

    void loadOwners();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (!orgId) return params.toString();
    params.set('orgId', orgId);
    if (search) params.set('q', search);
    if (ownerId) params.set('ownerId', ownerId);
    if (stageFilter) params.append('stage', stageFilter);
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('pageSize', '50');
    return params.toString();
  }, [orgId, search, ownerId, stageFilter, sort, page]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/appraisals?${queryString}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load appraisals');
        const payload = json.data as AppraisalsResponse;
        if (!cancelled) {
          setRows(payload.data ?? []);
          setTotal(payload.total ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError(err instanceof Error ? err.message : 'Failed to load appraisals');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, queryString]);

  const grouped = useMemo(() => {
    const map = new Map<string, AppraisalRow[]>();
    STAGES.forEach((stage) => map.set(stage.key, []));
    rows.forEach((row) => {
      const list = map.get(row.stage) ?? [];
      list.push(row);
      map.set(row.stage, list);
    });
    return map;
  }, [rows]);

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setOwnerId('');
    setStageFilter('');
    setSort('appointment_at_asc');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appraisals"
        subtitle="Track appraisal bookings, prep, and outcomes."
        actions={
          <Link href="/appraisals/new">
            <Button variant="secondary">New appraisal</Button>
          </Link>
        }
      />

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Chip active={view === 'board'} onClick={() => setView('board')}>
              Board view
            </Chip>
            <Chip active={view === 'list'} onClick={() => setView('list')}>
              List view
            </Chip>
          </div>
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Reset filters
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Contact, suburb"
          />
          <Select label="Owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name || owner.email || owner.id}
              </option>
            ))}
          </Select>
          <Select
            label={(
              <span className="inline-flex items-center gap-1">
                Stage
                <InfoTooltip
                  label="Appraisal stage definitions"
                  content={(
                    <ul className="list-disc space-y-1 pl-4 text-xs text-text-secondary">
                      {STAGES.map((stage) => (
                        <li key={stage.key}>{stage.label}: {STAGE_DESCRIPTIONS[stage.key]}</li>
                      ))}
                    </ul>
                  )}
                />
              </span>
            )}
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value)}
          >
            <option value="">All stages</option>
            {STAGES.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </Select>
          {view === 'list' && (
            <Select label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      </GlassCard>

      {view === 'board' ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {STAGES.map((stage) => (
            <GlassCard key={stage.key} className="space-y-3">
              <SectionHeader
                title={stage.label}
                subtitle={`${grouped.get(stage.key)?.length ?? 0} appraisals`}
              />
              <div className="space-y-3">
                {loading ? (
                  <p className="text-xs text-text-tertiary">Loading...</p>
                ) : (grouped.get(stage.key) ?? []).length === 0 ? (
                  <p className="text-xs text-text-tertiary">No appraisals in this stage.</p>
                ) : (
                  (grouped.get(stage.key) ?? []).map((row) => {
                    const band = getBand(row.winProbabilityScore ?? 0);
                    const suburb = row.suburb || row.contactSuburb || '-';
                    return (
                      <GlassCard key={row.id} className="border border-border-subtle bg-bg-section/40 space-y-2" padding="sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link href={`/appraisals/${row.id}`} className="text-sm font-semibold text-text-primary hover:underline">
                              {row.contactName}
                            </Link>
                            <p className="text-xs text-text-tertiary">{suburb}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text-primary">{row.winProbabilityScore ?? 0}%</span>
                            <Badge variant={band.variant}>{band.label}</Badge>
                            <ScoreBreakdownTooltip
                              label={`Win probability details for ${row.contactName}`}
                              meaning="Estimates the likelihood this appraisal converts to a signed listing."
                              bullets={[
                                'Stage, prep progress, and vendor profile lift the score.',
                                'Decision makers, timeline, and expectations add confidence.',
                                'Overdue prep or lost outcomes reduce the score.',
                              ]}
                              reasons={row.winProbabilityReasons}
                              bands="Hot is 75+, Warm is 45-74, Cold is below 45."
                            />
                          </div>
                        </div>
                        <div className="text-xs text-text-secondary">
                          Appointment: {formatDateTime(row.appointmentAt)}
                        </div>
                        <div className="text-xs text-text-secondary">
                          Next action: <span className={cn(row.overdue && 'text-red-500 font-semibold')}>{formatDate(row.nextActionDue)}</span>
                          {row.overdue && <span className="ml-2 text-[10px] text-red-500">Overdue</span>}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {row.prepComplete && <Badge variant="muted">Prep complete</Badge>}
                          {row.followupScheduled && <Badge variant="muted">Follow-up scheduled</Badge>}
                        </div>
                        <div className="text-xs text-text-tertiary">
                          Owner: {row.owner?.name || row.owner?.email || 'Unassigned'}
                        </div>
                      </GlassCard>
                    );
                  })
                )}
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard className="overflow-hidden" padding="none">
          <div className="border-b border-border-subtle px-4 py-3">
            <SectionHeader
              title="Appraisals list"
              subtitle={`${total} appraisals`}
              actions={error ? <p className="text-xs text-destructive">{error}</p> : undefined}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-text-tertiary bg-bg-section/30">
                <tr>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Appointment</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-left">Win</th>
                  <th className="px-4 py-3 text-left">Next action</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-text-tertiary" colSpan={6}>
                      Loading appraisals...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-text-tertiary" colSpan={6}>
                      No appraisals match these filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const band = getBand(row.winProbabilityScore ?? 0);
                    const suburb = row.suburb || row.contactSuburb || '-';
                    return (
                      <tr key={row.id} className="border-b border-border-subtle/60">
                        <td className="px-4 py-3">
                          <Link href={`/appraisals/${row.id}`} className="font-medium text-text-primary hover:underline">
                            {row.contactName}
                          </Link>
                          <div className="text-xs text-text-tertiary">{suburb}</div>
                        </td>
                        <td className="px-4 py-3">{formatDateTime(row.appointmentAt)}</td>
                        <td className="px-4 py-3">{row.stage}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-text-primary">{row.winProbabilityScore ?? 0}%</span>
                            <Badge variant={band.variant}>{band.label}</Badge>
                            <ScoreBreakdownTooltip
                              label={`Win probability details for ${row.contactName}`}
                              meaning="Estimates the likelihood this appraisal converts to a signed listing."
                              bullets={[
                                'Stage, prep progress, and vendor profile lift the score.',
                                'Decision makers, timeline, and expectations add confidence.',
                                'Overdue prep or lost outcomes reduce the score.',
                              ]}
                              reasons={row.winProbabilityReasons}
                              bands="Hot is 75+, Warm is 45-74, Cold is below 45."
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(row.overdue && 'text-red-500 font-semibold')}>
                            {formatDate(row.nextActionDue)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {row.owner?.name || row.owner?.email || 'Unassigned'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs text-text-tertiary">
              Page {page} of {Math.max(1, Math.ceil(total / 50))}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={page >= Math.ceil(total / 50)}
              >
                Next
              </Button>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
