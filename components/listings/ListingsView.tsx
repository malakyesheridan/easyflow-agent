'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, GlassCard, Input, MetricCard, PageHeader, SectionHeader, Select } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import ScoreBreakdownTooltip from '@/components/ui/ScoreBreakdownTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

type Owner = { id: string; name: string | null; email: string | null };

type ListingRow = {
  id: string;
  address: string;
  suburb: string;
  status: string;
  daysOnMarket: number;
  campaignHealthScore: number;
  campaignHealthReasons: string[];
  healthBand: 'healthy' | 'watch' | 'stalling';
  nextMilestoneDue: string | null;
  vendorUpdateLastSent: string | null;
  vendorUpdateOverdue: boolean;
  enquiriesCount: number;
  inspectionsCount: number;
  offersCount: number;
  owner: Owner | null;
};

type ListingsResponse = {
  data: ListingRow[];
  page: number;
  pageSize: number;
  total: number;
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'under_offer', label: 'Under offer' },
  { value: 'sold', label: 'Sold' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const HEALTH_OPTIONS = [
  { value: '', label: 'All health' },
  { value: 'healthy', label: 'Healthy' },
  { value: 'watch', label: 'Watch' },
  { value: 'stalling', label: 'Stalling' },
];

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function healthBadge(score: number, band: ListingRow['healthBand']) {
  if (band === 'healthy') return { label: 'Healthy', variant: 'gold' as const };
  if (band === 'watch') return { label: 'Watch', variant: 'default' as const };
  return { label: 'Stalling', variant: 'muted' as const };
}

export default function ListingsView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [rows, setRows] = useState<ListingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState('');
  const [suburb, setSuburb] = useState('');

  const [owners, setOwners] = useState<Owner[]>([]);

  const summary = useMemo(() => {
    const activeCount = rows.filter((row) => row.status === 'active').length;
    const underOfferCount = rows.filter((row) => row.status === 'under_offer').length;
    const overdueUpdates = rows.filter((row) => row.vendorUpdateOverdue).length;
    return { activeCount, underOfferCount, overdueUpdates };
  }, [rows]);

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
    if (status) params.append('status', status);
    if (health) params.set('health', health);
    if (suburb) params.set('suburb', suburb.trim());
    params.set('page', String(page));
    params.set('pageSize', '50');
    return params.toString();
  }, [orgId, search, ownerId, status, health, suburb, page]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/listings?${queryString}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load listings');
        const payload = json.data as ListingsResponse;
        if (!cancelled) {
          setRows(payload.data ?? []);
          setTotal(payload.total ?? 0);
        }
      } catch (err) {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setError(err instanceof Error ? err.message : 'Failed to load listings');
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

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setOwnerId('');
    setStatus('');
    setHealth('');
    setSuburb('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listings"
        subtitle="Track listing campaigns, health, and vendor updates."
        actions={(
          <Link href="/listings/new">
            <Button variant="secondary">New listing</Button>
          </Link>
        )}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard
          label="Total listings"
          value={total}
          helper="Across the pipeline"
        />
        <MetricCard
          label="Active"
          value={summary.activeCount}
          helper="Visible in this view"
        />
        <MetricCard
          label="Under offer"
          value={summary.underOfferCount}
          helper="Visible in this view"
        />
        <MetricCard
          label="Updates overdue"
          value={summary.overdueUpdates}
          helper="Visible in this view"
        />
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div />
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Reset filters
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Address, vendor"
          />
          <Input
            label="Suburb"
            value={suburb}
            onChange={(event) => setSuburb(event.target.value)}
            placeholder="Bondi"
          />
          <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select label="Health" value={health} onChange={(event) => setHealth(event.target.value)}>
            {HEALTH_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select label="Owner" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name || owner.email || owner.id}
              </option>
            ))}
          </Select>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden" padding="none">
        <div className="border-b border-border-subtle px-4 py-3">
          <SectionHeader
            title="Listings"
            subtitle={`${total} listings`}
            actions={error ? <p className="text-xs text-destructive">{error}</p> : undefined}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-text-tertiary bg-bg-section/30">
              <tr>
                <th className="px-4 py-3 text-left">Address</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Days on market</th>
                <th className="px-4 py-3 text-left">Health</th>
                <th className="px-4 py-3 text-left">Next milestone</th>
                <th className="px-4 py-3 text-left">
                  <span className="inline-flex items-center gap-1">
                    Vendor update
                    <InfoTooltip
                      label="Vendor update cadence"
                      content={<p className="text-xs text-text-secondary">Listings should receive a vendor update at least every 7 days. Overdue listings lose momentum.</p>}
                    />
                  </span>
                </th>
                <th className="px-4 py-3 text-left">Enq / Opens / Offers</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={7}>
                    Loading listings...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={7}>
                    No listings match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const band = healthBadge(row.campaignHealthScore ?? 0, row.healthBand);
                  return (
                    <tr key={row.id} className="border-b border-border-subtle/60">
                      <td className="px-4 py-3">
                        <Link href={`/listings/${row.id}`} className="font-medium text-text-primary hover:underline">
                          {row.address || 'Untitled listing'}
                        </Link>
                        <div className="text-xs text-text-tertiary">{row.suburb || '-'}</div>
                      </td>
                      <td className="px-4 py-3">{row.status}</td>
                      <td className="px-4 py-3">{row.daysOnMarket}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-text-primary">{row.campaignHealthScore ?? 0}</span>
                          <Badge variant={band.variant}>{band.label}</Badge>
                          <ScoreBreakdownTooltip
                            label={`Campaign health details for ${row.address || 'listing'}`}
                            meaning="Tracks campaign momentum based on milestones, activity, and vendor updates."
                            bullets={[
                              'Checklist and milestones progress lift health.',
                              'Recent enquiries and inspections add momentum.',
                              'Overdue vendor updates or milestones reduce health.',
                            ]}
                            reasons={row.campaignHealthReasons}
                            bands="Healthy is 70+, Watch is 40-69, Stalling is below 40."
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatDate(row.nextMilestoneDue)}</td>
                      <td className="px-4 py-3">
                        <span className={cn(row.vendorUpdateOverdue && 'text-red-500 font-semibold')}>
                          {formatDate(row.vendorUpdateLastSent)}
                        </span>
                        {row.vendorUpdateOverdue && <span className="ml-2 text-xs text-red-500">Overdue</span>}
                      </td>
                      <td className="px-4 py-3">
                        {row.enquiriesCount} / {row.inspectionsCount} / {row.offersCount}
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
            <Button variant="ghost" size="sm" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={page === 1}>
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
