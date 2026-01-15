'use client';

import { useEffect, useMemo, useState } from 'react';
import GlassCard from '@/components/ui/GlassCard';
import SectionHeader from '@/components/ui/SectionHeader';
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
  const sellerProspects = { hot: 0, warm: 0, cold: 0 };
  const appraisalsBooked = 0;
  const appraisalFollowUps = 0;
  const listingsActive = dashboard.listings.total;
  const listingsStalling = 0;
  const reportsDue = 0;

  const setupItems = useMemo<SetupItem[]>(
    () => [
      {
        label: 'Prospecting sources',
        ready: dashboard.leadSources > 0,
        note: 'Define seller lead sources for attribution.',
      },
      {
        label: 'Listing pipeline stages',
        ready: dashboard.listingPipelineStages > 0,
        note: 'Appraisal to sold stage definitions.',
      },
      {
        label: 'Vendor report template',
        ready: dashboard.reportTemplates.vendorCount > 0,
        note: 'Default reporting cadence and template.',
      },
      {
        label: 'Matching configuration',
        ready: dashboard.matchingConfig.exists,
        note: 'Weights and thresholds for buyer matching.',
      },
      {
        label: 'Buyer pipeline stages',
        ready: dashboard.buyerPipelineStages > 0,
        note: 'Secondary pipeline for buyer demand.',
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

  const reportsSubtitle = dashboard.reportTemplates.vendorCount > 0
    ? 'Cadence template ready'
    : 'Template not configured yet';

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Seller pipeline overview"
        subtitle="Prioritize prospecting, listing health, and vendor reporting."
      />

      {loading && !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {error && (
            <GlassCard className="border border-red-500/20 bg-red-500/10" padding="sm">
              <p className="text-sm font-semibold text-red-500">Dashboard data unavailable</p>
              <p className="mt-1 text-xs text-red-400">{error}</p>
            </GlassCard>
          )}

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardMetricCard
              title="Potential sellers"
              value={formatCount(sellerProspects.hot + sellerProspects.warm + sellerProspects.cold)}
              subtitle={`Hot ${sellerProspects.hot} | Warm ${sellerProspects.warm} | Cold ${sellerProspects.cold}`}
            />
            <DashboardMetricCard
              title="Appraisals"
              value={formatCount(appraisalsBooked)}
              subtitle={`Follow-ups due: ${appraisalFollowUps}`}
            />
            <DashboardMetricCard
              title="Active listings"
              value={formatCount(listingsActive)}
              subtitle={`Stalling: ${listingsStalling}`}
            />
            <DashboardMetricCard
              title="Vendor reports due"
              value={formatCount(reportsDue)}
              subtitle={reportsSubtitle}
              emphasis={dashboard.reportTemplates.vendorCount > 0 ? 'normal' : 'warning'}
            />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <GlassCard>
              <SectionHeader
                title="Follow-up focus"
                subtitle="Daily touchpoints and nurture actions."
              />
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
                  Connect follow-up tasks to surface seller outreach here.
                </p>
              </div>
            </GlassCard>

            <GlassCard>
              <SectionHeader
                title="Setup readiness"
                subtitle="Seller-first configuration checkpoints."
              />
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
            </GlassCard>
          </section>

          <section className="space-y-4">
            <SectionHeader
              title="Buyer demand (secondary)"
              subtitle="Keep buyer pipeline warm to support listings."
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <DashboardMetricCard
                title="Active buyers"
                value={formatCount(dashboard.buyers.total)}
                subtitle="Buyers in pipeline"
              />
              <DashboardMetricCard
                title="Buyer stages"
                value={formatCount(dashboard.buyerPipelineStages)}
                subtitle="Pipeline stages configured"
              />
              <DashboardMetricCard
                title="Buyer lead sources"
                value={formatCount(dashboard.leadSources)}
                subtitle="Inbound source list"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
