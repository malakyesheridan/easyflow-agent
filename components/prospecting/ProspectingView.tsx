'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Chip, GlassCard, MetricCard, PageHeader, SectionHeader, Select, Input } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import ScoreBreakdownTooltip from '@/components/ui/ScoreBreakdownTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

type Owner = { id: string; name: string | null; email: string | null };

type ProspectingRow = {
  id: string;
  fullName: string;
  suburb: string | null;
  role: string;
  sellerStage: string | null;
  lastTouchAt: string | null;
  nextTouchAt: string | null;
  owner: Owner | null;
  tags: string[];
  score: number;
  band: 'hot' | 'warm' | 'cold';
  reasons: string[];
  suggestedAction: string;
};

type QueueResponse = {
  data: ProspectingRow[];
  page: number;
  pageSize: number;
  total: number;
};

type Tag = { id: string; name: string; color: string | null };

const BAND_OPTIONS = [
  { value: '', label: 'All bands' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All seller roles' },
  { value: 'seller', label: 'Seller only' },
  { value: 'both', label: 'Seller + Buyer' },
];

const BAND_STYLES: Record<string, { label: string; variant: 'gold' | 'default' | 'muted' }> = {
  hot: { label: 'Hot', variant: 'gold' },
  warm: { label: 'Warm', variant: 'default' },
  cold: { label: 'Cold', variant: 'muted' },
};

const SAVED_VIEWS = [
  { key: 'overdue', label: 'Overdue follow-ups', tooltip: 'Shows contacts with next touch dates before today.' },
  { key: 'hot', label: 'Hot potential sellers', tooltip: 'Filters to high intent sellers based on intent score.' },
  { key: 'past', label: 'Past clients reactivation' },
  { key: 'warm', label: 'Warm nurture (next 7 days)' },
];

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() < new Date().setHours(0, 0, 0, 0);
}

export default function ProspectingView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [queue, setQueue] = useState<ProspectingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [role, setRole] = useState('');
  const [sellerStage, setSellerStage] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [band, setBand] = useState('');
  const [dueToday, setDueToday] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [dueWithinDays, setDueWithinDays] = useState<number | null>(null);

  const [summary, setSummary] = useState({ hot: 0, warm: 0, cold: 0, overdue: 0 });
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [owners, setOwners] = useState<Owner[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const loadTags = async () => {
      try {
        const res = await fetch(`/api/tags?orgId=${orgId}`);
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error('Failed to load tags');
        if (!cancelled) setTags(json.data ?? []);
      } catch {
        if (!cancelled) setTags([]);
      }
    };

    void loadTags();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

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

  const baseParams = useMemo(() => {
    const params = new URLSearchParams();
    if (!orgId) return params.toString();
    params.set('orgId', orgId);
    if (search) params.set('q', search);
    if (ownerId) params.set('ownerId', ownerId);
    if (role) params.set('role', role);
    if (sellerStage) params.set('sellerStage', sellerStage);
    if (tagFilter) params.append('tag', tagFilter);
    return params.toString();
  }, [orgId, search, ownerId, role, sellerStage, tagFilter]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams(baseParams);
    if (band) params.set('band', band);
    if (dueToday) params.set('dueToday', 'true');
    if (overdueOnly) params.set('overdue', 'true');
    if (dueWithinDays) params.set('dueWithinDays', String(dueWithinDays));
    params.set('page', String(page));
    params.set('pageSize', '50');
    return params.toString();
  }, [baseParams, band, dueToday, overdueOnly, dueWithinDays, page]);

  const summaryParams = useMemo(() => {
    const params = new URLSearchParams(baseParams);
    if (dueToday) params.set('dueToday', 'true');
    if (overdueOnly) params.set('overdue', 'true');
    if (dueWithinDays) params.set('dueWithinDays', String(dueWithinDays));
    return params.toString();
  }, [baseParams, dueToday, overdueOnly, dueWithinDays]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const loadQueue = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/prospecting/queue?${queryString}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load queue');
        const payload = json.data as QueueResponse;
        if (!cancelled) {
          setQueue(payload.data ?? []);
          setTotal(payload.total ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setQueue([]);
          setTotal(0);
          setError(err instanceof Error ? err.message : 'Failed to load queue');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadQueue();
    return () => {
      cancelled = true;
    };
  }, [orgId, queryString]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const fetchCount = async (extras: Record<string, string>) => {
      const params = new URLSearchParams(summaryParams);
      Object.entries(extras).forEach(([key, value]) => params.set(key, value));
      params.set('page', '1');
      params.set('pageSize', '1');
      const res = await fetch(`/api/prospecting/queue?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error('Failed to load summary');
      return (json.data?.total as number) ?? 0;
    };

    const loadSummary = async () => {
      try {
        setSummaryLoading(true);
        const [hot, warm, cold, overdue] = await Promise.all([
          fetchCount({ band: 'hot' }),
          fetchCount({ band: 'warm' }),
          fetchCount({ band: 'cold' }),
          fetchCount({ overdue: 'true' }),
        ]);
        if (!cancelled) setSummary({ hot, warm, cold, overdue });
      } catch {
        if (!cancelled) setSummary({ hot: 0, warm: 0, cold: 0, overdue: 0 });
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [orgId, summaryParams]);

  const applySavedView = (key: string) => {
    setPage(1);
    setDueToday(false);
    setOverdueOnly(false);
    setDueWithinDays(null);
    setRole('');
    setSellerStage('');
    setTagFilter('');
    setBand('');

    if (key === 'overdue') {
      setOverdueOnly(true);
    }
    if (key === 'hot') {
      setBand('hot');
      setRole('seller');
    }
    if (key === 'past') {
      setTagFilter('Past Client');
    }
    if (key === 'warm') {
      setBand('warm');
      setDueWithinDays(7);
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setOwnerId('');
    setRole('');
    setSellerStage('');
    setTagFilter('');
    setBand('');
    setDueToday(false);
    setOverdueOnly(false);
    setDueWithinDays(null);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prospecting"
        subtitle="Prioritized seller intent queue with transparent scoring."
        actions={
          <Link href="/contacts">
            <Button variant="ghost">View contacts</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Hot"
          value={summaryLoading ? '-' : summary.hot}
          helper="Intent score 80+"
        />
        <MetricCard
          label="Warm"
          value={summaryLoading ? '-' : summary.warm}
          helper="Intent score 50-79"
        />
        <MetricCard
          label="Cold"
          value={summaryLoading ? '-' : summary.cold}
          helper="Intent score below 50"
        />
        <MetricCard
          label="Overdue"
          value={summaryLoading ? '-' : summary.overdue}
          helper="Next touch before today"
        />
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {SAVED_VIEWS.map((view) => (
              <div key={view.key} className="flex items-center gap-1">
                <Chip onClick={() => applySavedView(view.key)}>
                  {view.label}
                </Chip>
                {view.tooltip && (
                  <InfoTooltip
                    label={`${view.label} info`}
                    content={<p className="text-xs text-text-secondary">{view.tooltip}</p>}
                  />
                )}
              </div>
            ))}
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
            placeholder="Name, email, phone, suburb"
          />
          <Select label="Owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name || owner.email || owner.id}
              </option>
            ))}
          </Select>
          <Select label="Role" value={role} onChange={(event) => setRole(event.target.value)}>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select label="Intent band" value={band} onChange={(event) => setBand(event.target.value)}>
            {BAND_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Input
            label="Seller stage"
            value={sellerStage}
            onChange={(event) => setSellerStage(event.target.value)}
            placeholder="Appraisal Booked"
          />
          <Select label="Tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="">All tags</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.name}>
                {tag.name}
              </option>
            ))}
          </Select>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={dueToday}
                onChange={(event) => setDueToday(event.target.checked)}
              />
              Due today
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(event) => setOverdueOnly(event.target.checked)}
              />
              <span className="inline-flex items-center gap-1">
                Overdue
                <InfoTooltip
                  label="Overdue follow-ups info"
                  content={<p className="text-xs text-text-secondary">Shows contacts with next touch dates before today.</p>}
                />
              </span>
            </label>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden" padding="none">
        <div className="border-b border-border-subtle px-4 py-3">
          <SectionHeader
            title="Prospecting queue"
            subtitle={`${total} contacts`}
            actions={error ? <p className="text-xs text-destructive">{error}</p> : undefined}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-text-tertiary bg-bg-section/30">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Suburb</th>
                <th className="px-4 py-3 text-left">Intent</th>
                <th className="px-4 py-3 text-left">Reasons</th>
                <th className="px-4 py-3 text-left">Next touch</th>
                <th className="px-4 py-3 text-left">Suggested action</th>
                <th className="px-4 py-3 text-left">Owner</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={7}>
                    Loading queue...
                  </td>
                </tr>
              ) : queue.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={7}>
                    No contacts match these filters.
                  </td>
                </tr>
              ) : (
                queue.map((contact) => {
                  const overdue = isOverdue(contact.nextTouchAt);
                  const bandStyle = BAND_STYLES[contact.band] ?? BAND_STYLES.cold;
                  return (
                    <tr key={contact.id} className="border-b border-border-subtle/60">
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${contact.id}`} className="font-medium text-text-primary hover:underline">
                          {contact.fullName}
                        </Link>
                        <div className="text-xs text-text-tertiary">
                          {contact.sellerStage || 'No stage'}
                        </div>
                      </td>
                      <td className="px-4 py-3">{contact.suburb || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">{contact.score}</span>
                          <Badge variant={bandStyle.variant}>{bandStyle.label}</Badge>
                          <ScoreBreakdownTooltip
                            label={`Seller intent score details for ${contact.fullName}`}
                            meaning="Ranks the likelihood a seller will list soon based on engagement and intent signals."
                            bullets={[
                              'Overdue follow-ups and recent engagement lift the score.',
                              'Seller role, stage, and temperature add momentum.',
                              'High-intent tags and consistent touches add boosts.',
                            ]}
                            reasons={contact.reasons}
                            bands="Hot is 80+, Warm is 50-79, Cold is below 50."
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {contact.reasons.length === 0
                            ? '-'
                            : contact.reasons.map((reason, index) => (
                                <Badge key={`${contact.id}-reason-${index}`} variant="muted">
                                  {reason}
                                </Badge>
                              ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(overdue && 'text-red-500 font-semibold')}>
                          {formatDate(contact.nextTouchAt)}
                        </span>
                        {overdue && <span className="ml-2 text-xs text-red-500">Overdue</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${contact.id}`}>
                          <Button variant="secondary" size="sm">
                            {contact.suggestedAction}
                          </Button>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {contact.owner?.name || contact.owner?.email || '-'}
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
    </div>
  );
}
