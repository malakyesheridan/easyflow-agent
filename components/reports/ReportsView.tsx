'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, GlassCard, Input, MetricCard, PageHeader, SectionHeader, Select } from '@/components/ui';
import InfoTooltip from '@/components/ui/InfoTooltip';
import ScoreBreakdownTooltip from '@/components/ui/ScoreBreakdownTooltip';
import { useOrgConfig } from '@/hooks/useOrgConfig';
import { cn } from '@/lib/utils';

type QueueItem = {
  id: string;
  address: string;
  suburb: string;
  vendorName: string | null;
  status: string;
  daysOnMarket: number;
  campaignHealthScore: number;
  campaignHealthReasons: string[];
  healthBand: 'healthy' | 'watch' | 'stalling';
  lastReportSentAt: string | null;
  nextReportDueAt: string | null;
  cadenceLabel: string;
};

type QueueResponse = {
  metrics: {
    coveragePercent: number;
    overdueCount: number;
    avgDaysBetweenReports: number;
    activeListings: number;
  };
  dueToday: QueueItem[];
  overdue: QueueItem[];
  upcoming: QueueItem[];
};

type HistoryItem = {
  id: string;
  createdAt: string | null;
  shareUrl: string;
  deliveryMethod: string | null;
  template: { id: string; name: string } | null;
  listing: { id: string; address: string; suburb: string } | null;
  vendorName: string | null;
  createdBy: { id: string; name: string | null; email: string | null } | null;
};

type Option = { id: string; name: string };

type ListingOption = { id: string; address: string; suburb: string };

const queueTabs = [
  { key: 'dueToday', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
] as const;

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDelivery(method: string | null) {
  if (!method || method === 'share_link') return 'Share link';
  if (method === 'email') return 'Emailed';
  if (method === 'sms') return 'Texted';
  if (method === 'logged') return 'Logged';
  return 'Share link';
}

function healthBadge(score: number, band: QueueItem['healthBand']) {
  if (band === 'healthy') return { label: 'Healthy', variant: 'gold' as const };
  if (band === 'watch') return { label: 'Watch', variant: 'default' as const };
  return { label: 'Stalling', variant: 'muted' as const };
}

export default function ReportsView() {
  const { config } = useOrgConfig();
  const orgId = config?.orgId ?? '';

  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueTab, setQueueTab] = useState<(typeof queueTabs)[number]['key']>('dueToday');

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [listingOptions, setListingOptions] = useState<ListingOption[]>([]);
  const [agentOptions, setAgentOptions] = useState<Option[]>([]);
  const [templateOptions, setTemplateOptions] = useState<Option[]>([]);

  const [filters, setFilters] = useState({
    listingId: '',
    agentId: '',
    templateId: '',
    startDate: '',
    endDate: '',
  });

  const historyQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (!orgId) return params.toString();
    params.set('orgId', orgId);
    if (filters.listingId) params.set('listingId', filters.listingId);
    if (filters.agentId) params.set('agentId', filters.agentId);
    if (filters.templateId) params.set('templateId', filters.templateId);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    params.set('limit', '25');
    return params.toString();
  }, [orgId, filters]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const loadQueue = async () => {
      try {
        setQueueLoading(true);
        setQueueError(null);
        const res = await fetch(`/api/reports/queue?orgId=${orgId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load report queue');
        if (!cancelled) setQueue(json.data as QueueResponse);
      } catch (err) {
        if (!cancelled) setQueueError(err instanceof Error ? err.message : 'Failed to load report queue');
      } finally {
        if (!cancelled) setQueueLoading(false);
      }
    };

    void loadQueue();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const loadHistory = async () => {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        const res = await fetch(`/api/reports/history?${historyQuery}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json?.error?.message || 'Failed to load report history');
        if (!cancelled) setHistory(json.data ?? []);
      } catch (err) {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : 'Failed to load report history');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [orgId, historyQuery]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    const loadOptions = async () => {
      try {
        const [listingsRes, agentsRes, templatesRes] = await Promise.all([
          fetch(`/api/listings?orgId=${orgId}&pageSize=200`, { cache: 'no-store' }),
          fetch(`/api/contacts/owners?orgId=${orgId}`, { cache: 'no-store' }),
          fetch(`/api/report-templates?orgId=${orgId}&type=vendor`, { cache: 'no-store' }),
        ]);
        const listingsJson = await listingsRes.json();
        const agentsJson = await agentsRes.json();
        const templatesJson = await templatesRes.json();

        if (!cancelled) {
          const listingData = listingsJson?.data?.data ?? [];
          setListingOptions(
            listingData.map((row: any) => ({
              id: String(row.id),
              address: String(row.address ?? ''),
              suburb: String(row.suburb ?? ''),
            }))
          );
          setAgentOptions(
            (agentsJson?.data ?? []).map((row: any) => ({
              id: String(row.id),
              name: String(row.name ?? row.email ?? row.id),
            }))
          );
          setTemplateOptions(
            (templatesJson?.data ?? []).map((row: any) => ({
              id: String(row.id),
              name: String(row.name ?? ''),
            }))
          );
        }
      } catch {
        if (!cancelled) {
          setListingOptions([]);
          setAgentOptions([]);
          setTemplateOptions([]);
        }
      }
    };

    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const metrics = queue?.metrics ?? { coveragePercent: 0, overdueCount: 0, avgDaysBetweenReports: 0, activeListings: 0 };
  const queueRows = queue ? queue[queueTab] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Manage vendor reporting cadence, templates, and delivery history."
        actions={(
          <Link href="/reports/templates">
            <Button variant="secondary">Templates</Button>
          </Link>
        )}
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard
          label="Coverage (7d)"
          value={`${metrics.coveragePercent}%`}
          helper="Active listings with reports in last 7 days"
          badge={(
            <InfoTooltip
              label="Coverage info"
              content={<p className="text-xs text-text-secondary">Shows how consistently vendor reports are sent.</p>}
            />
          )}
        />
        <MetricCard
          label="Overdue"
          value={metrics.overdueCount}
          helper="Listings behind cadence"
        />
        <MetricCard
          label="Avg days between"
          value={metrics.avgDaysBetweenReports}
          helper="Based on last sent reports"
        />
        <MetricCard
          label="Active listings"
          value={metrics.activeListings}
          helper="Cadence enabled"
        />
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            title="Due & overdue"
            subtitle="Focus on vendor updates that are due now."
            actions={(
              <InfoTooltip
                label="Due & overdue info"
                content={(
                  <div className="space-y-2">
                    <p className="text-xs text-text-secondary">Due means the next report date is today.</p>
                    <p className="text-xs text-text-secondary">Overdue means the report date has passed.</p>
                  </div>
                )}
              />
            )}
          />
          <div className="flex flex-wrap gap-2">
            {queueTabs.map((tab) => {
              const count = queue ? queue[tab.key].length : 0;
              return (
                <Button
                  key={tab.key}
                  variant={queueTab === tab.key ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setQueueTab(tab.key)}
                >
                  {tab.label} ({count})
                </Button>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-text-tertiary bg-bg-section/30">
              <tr>
                <th className="px-4 py-3 text-left">Listing</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Health</th>
                <th className="px-4 py-3 text-left">Last report</th>
                <th className="px-4 py-3 text-left">Next due</th>
                <th className="px-4 py-3 text-left">Cadence</th>
                <th className="px-4 py-3 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {queueLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={8}>
                    Loading queue...
                  </td>
                </tr>
              ) : queueRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={8}>
                    No listings in this queue.
                  </td>
                </tr>
              ) : (
                queueRows.map((row) => {
                  const band = healthBadge(row.campaignHealthScore ?? 0, row.healthBand);
                  const nextDueDate = row.nextReportDueAt ? new Date(row.nextReportDueAt) : null;
                  const isOverdue = nextDueDate ? nextDueDate < new Date() : false;
                  return (
                    <tr key={row.id} className="border-b border-border-subtle/60">
                      <td className="px-4 py-3">
                        <Link href={`/listings/${row.id}?tab=reports`} className="font-medium text-text-primary hover:underline">
                          {row.address || 'Untitled listing'}
                        </Link>
                        <div className="text-xs text-text-tertiary">{row.suburb || '-'}</div>
                      </td>
                      <td className="px-4 py-3">{row.vendorName || '-'}</td>
                      <td className="px-4 py-3">{row.status}</td>
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
                      <td className="px-4 py-3">{formatDate(row.lastReportSentAt)}</td>
                      <td className="px-4 py-3">
                        <span className={cn(isOverdue && 'text-red-400 font-semibold')}>
                          {formatDate(row.nextReportDueAt)}
                        </span>
                        {isOverdue && <span className="ml-2 text-xs text-red-400">Overdue</span>}
                      </td>
                      <td className="px-4 py-3">{row.cadenceLabel}</td>
                      <td className="px-4 py-3">
                        <Link href={`/listings/${row.id}?tab=reports`}>
                          <Button variant="ghost" size="sm">Generate report</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {queueError && <p className="text-xs text-destructive">{queueError}</p>}
      </GlassCard>

      <GlassCard className="space-y-4">
        <SectionHeader
          title="Recent reports"
          subtitle="Latest vendor reports across the org."
          actions={historyError ? <span className="text-xs text-destructive">{historyError}</span> : undefined}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Select
            label="Listing"
            value={filters.listingId}
            onChange={(event) => setFilters((prev) => ({ ...prev, listingId: event.target.value }))}
          >
            <option value="">All listings</option>
            {listingOptions.map((listing) => (
              <option key={listing.id} value={listing.id}>
                {listing.address} {listing.suburb ? `(${listing.suburb})` : ''}
              </option>
            ))}
          </Select>
          <Select
            label="Agent"
            value={filters.agentId}
            onChange={(event) => setFilters((prev) => ({ ...prev, agentId: event.target.value }))}
          >
            <option value="">All agents</option>
            {agentOptions.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
          <Select
            label="Template"
            value={filters.templateId}
            onChange={(event) => setFilters((prev) => ({ ...prev, templateId: event.target.value }))}
          >
            <option value="">All templates</option>
            {templateOptions.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
          <Input
            label="From"
            type="date"
            value={filters.startDate}
            onChange={(event) => setFilters((prev) => ({ ...prev, startDate: event.target.value }))}
          />
          <Input
            label="To"
            type="date"
            value={filters.endDate}
            onChange={(event) => setFilters((prev) => ({ ...prev, endDate: event.target.value }))}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-text-tertiary bg-bg-section/30">
              <tr>
                <th className="px-4 py-3 text-left">Listing</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Template</th>
                <th className="px-4 py-3 text-left">Generated by</th>
                <th className="px-4 py-3 text-left">Created</th>
                <th className="px-4 py-3 text-left">Delivery</th>
                <th className="px-4 py-3 text-left">Link</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={7}>
                    Loading history...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-center text-text-tertiary" colSpan={7}>
                    No reports yet.
                  </td>
                </tr>
              ) : (
                history.map((report) => (
                  <tr key={report.id} className="border-b border-border-subtle/60">
                    <td className="px-4 py-3">
                      {report.listing ? (
                        <Link href={`/listings/${report.listing.id}?tab=reports`} className="font-medium text-text-primary hover:underline">
                          {report.listing.address || 'Listing'}
                        </Link>
                      ) : (
                        'Listing'
                      )}
                      <div className="text-xs text-text-tertiary">{report.listing?.suburb || '-'}</div>
                    </td>
                    <td className="px-4 py-3">{report.vendorName || '-'}</td>
                    <td className="px-4 py-3">{report.template?.name || '-'}</td>
                    <td className="px-4 py-3">
                      {report.createdBy?.name || report.createdBy?.email || '-'}
                    </td>
                    <td className="px-4 py-3">{formatDateTime(report.createdAt)}</td>
                    <td className="px-4 py-3">{formatDelivery(report.deliveryMethod)}</td>
                    <td className="px-4 py-3">
                      <Link href={report.shareUrl} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm">Open</Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
