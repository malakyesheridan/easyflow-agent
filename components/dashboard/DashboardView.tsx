'use client';

import { useEffect, useMemo, useState } from 'react';
import Card from '@/components/ui/Card';
import DashboardMetricCard from '@/components/dashboard/DashboardMetricCard';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';
import { useOrgConfig } from '@/hooks/useOrgConfig';

const EMPTY_DATA = {
  buyers: { total: 0, demo: 0 },
  listings: { total: 0, demo: 0 },
  leadSources: 0,
  buyerPipelineStages: 0,
  listingPipelineStages: 0,
  matchingConfig: { exists: false, mode: null as string | null },
  reportTemplates: { vendorCount: 0 },
  matches: { hot: 0, good: 0 },
  nextActions: { dueToday: 0, overdue: 0 },
};

type AgentDashboardData = typeof EMPTY_DATA;

type SetupItem = {
  label: string;
  ready: boolean;
  note: string;
};

function formatCount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString();
}

export default function DashboardView({ orgId }: { orgId: string }) {
  const { config } = useOrgConfig();
  const resolvedOrgId = orgId || config?.orgId || '';
  const [data, setData] = useState<AgentDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resolvedOrgId) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/dashboard/agent?orgId=${resolvedOrgId}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || json?.error || 'Failed to load agent dashboard');
        }
        if (!cancelled) {
          setData(json.data as AgentDashboardData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load agent dashboard');
          setData(EMPTY_DATA);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [resolvedOrgId]);

  const dashboard = data ?? EMPTY_DATA;

  const setupItems = useMemo<SetupItem[]>(
    () => [
      {
        label: 'Lead sources',
        ready: dashboard.leadSources > 0,
        note: 'Attribution for inbound buyer leads.',
      },
      {
        label: 'Buyer pipeline',
        ready: dashboard.buyerPipelineStages > 0,
        note: 'Stages for enquiry to settlement.',
      },
      {
        label: 'Listing pipeline',
        ready: dashboard.listingPipelineStages > 0,
        note: 'Stages for appraisal to sold.',
      },
      {
        label: 'Matching config',
        ready: dashboard.matchingConfig.exists,
        note: 'Weights and thresholds for matches.',
      },
      {
        label: 'Vendor report template',
        ready: dashboard.reportTemplates.vendorCount > 0,
        note: 'Default cadence and report layout.',
      },
    ],
    [
      dashboard.buyerPipelineStages,
      dashboard.leadSources,
      dashboard.listingPipelineStages,
      dashboard.matchingConfig.exists,
      dashboard.reportTemplates.vendorCount,
    ]
  );

  const matchingLabel = dashboard.matchingConfig.exists ? 'Ready' : 'Not set';
  const matchingSubtitle = dashboard.matchingConfig.exists
    ? `Mode: ${dashboard.matchingConfig.mode ?? 'zone'}`
    : 'Finish setup to enable matching.';

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Agent overview</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Snapshot of buyer demand, listings, and vendor reporting health.
        </p>
      </div>

      {loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error && (
            <Card className="border border-red-500/20 bg-red-500/10">
              <p className="text-sm font-semibold text-red-500">Dashboard data unavailable</p>
              <p className="mt-1 text-xs text-red-400">{error}</p>
            </Card>
          )}

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard
              title="Active buyers"
              value={formatCount(dashboard.buyers.total)}
              subtitle="Leads in the buyer pipeline"
            />
            <DashboardMetricCard
              title="Active listings"
              value={formatCount(dashboard.listings.total)}
              subtitle="Vendor inventory in progress"
            />
            <DashboardMetricCard
              title="Vendor reports"
              value={formatCount(dashboard.reportTemplates.vendorCount)}
              subtitle="Templates ready to send"
              emphasis={dashboard.reportTemplates.vendorCount > 0 ? 'normal' : 'warning'}
            />
            <DashboardMetricCard
              title="Matching"
              value={matchingLabel}
              subtitle={matchingSubtitle}
              emphasis={dashboard.matchingConfig.exists ? 'normal' : 'warning'}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card>
              <p className="text-sm font-semibold text-text-primary">Today focus</p>
              <p className="mt-1 text-xs text-text-tertiary">Daily plan and follow-ups for the team.</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Due today</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {formatCount(dashboard.nextActions.dueToday)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Overdue</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {formatCount(dashboard.nextActions.overdue)}
                  </span>
                </div>
                <p className="text-xs text-text-tertiary">
                  Connect Daily Plan tasks to surface follow-ups here.
                </p>
              </div>
            </Card>

            <Card>
              <p className="text-sm font-semibold text-text-primary">Pipeline setup status</p>
              <p className="mt-1 text-xs text-text-tertiary">Foundations needed for buyer matching.</p>
              <div className="mt-4 space-y-3">
                {setupItems.map((item) => (
                  <div key={item.label} className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-text-primary">{item.label}</p>
                      <p className="text-xs text-text-tertiary">{item.note}</p>
                    </div>
                    <span
                      className={
                        item.ready
                          ? 'text-xs font-semibold text-emerald-500'
                          : 'text-xs font-semibold text-amber-500'
                      }
                    >
                      {item.ready ? 'Ready' : 'Needs setup'}
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <p className="text-sm font-semibold text-text-primary">Listing intelligence</p>
              <p className="mt-1 text-xs text-text-tertiary">Buyer to listing matches and report activity.</p>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Hot matches</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {formatCount(dashboard.matches.hot)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Good matches</span>
                  <span className="text-sm font-semibold text-text-primary">
                    {formatCount(dashboard.matches.good)}
                  </span>
                </div>
                <p className="text-xs text-text-tertiary">
                  Matching insights will populate once buyers and listings are active.
                </p>
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
