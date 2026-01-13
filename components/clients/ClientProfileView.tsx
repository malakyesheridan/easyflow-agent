import Link from 'next/link';
import { Card } from '@/components/ui';
import { formatCurrency, formatInvoiceDate } from '@/lib/invoices/format';

type ClientProfileViewProps = {
  client: {
    id: string;
    displayName: string;
    legalName: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  };
  performance: {
    totals: {
      totalJobs: number;
      completedJobs: number;
      activeJobs: number;
      totalInvoicedCents: number;
      totalPaidCents: number;
      outstandingCents: number;
      totalProfitCents: number;
      avgMarginPercent: number | null;
    };
    time: {
      avgDaysToComplete: number | null;
      onTimeRate: number | null;
    };
    risk: {
      atRiskCount: number;
    };
    trends: Array<{
      windowDays: number;
      jobsCount: number;
      invoicedCents: number;
      paidCents: number;
      profitCents: number;
      onTimeRate: number | null;
    }>;
  } | null;
  recentJobs: Array<{
    id: string;
    title: string;
    status: string;
    scheduledStart: Date | null;
    profitabilityStatus: string | null;
  }>;
};

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'N/A';
  return `${Math.round(value * 100)}%`;
}

export default function ClientProfileView({ client, performance, recentJobs }: ClientProfileViewProps) {
  const totals = performance?.totals;
  const time = performance?.time;

  return (
    <div className="space-y-6">
      <Card>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-primary">{client.displayName}</h2>
          <div className="text-sm text-text-tertiary space-y-1">
            {client.legalName && <p>{client.legalName}</p>}
            {(client.email || client.phone) && (
              <p>{[client.email, client.phone].filter(Boolean).join(' • ')}</p>
            )}
          </div>
          {client.notes && <p className="text-sm text-text-secondary">{client.notes}</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <p className="text-xs uppercase text-text-tertiary">Jobs</p>
          <p className="text-2xl font-semibold text-text-primary">{totals?.totalJobs ?? 0}</p>
          <p className="text-xs text-text-tertiary mt-1">
            {totals?.completedJobs ?? 0} completed • {totals?.activeJobs ?? 0} active
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-text-tertiary">Invoiced</p>
          <p className="text-2xl font-semibold text-text-primary">
            {formatCurrency(totals?.totalInvoicedCents ?? 0, 'AUD')}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Paid {formatCurrency(totals?.totalPaidCents ?? 0, 'AUD')}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-text-tertiary">Outstanding</p>
          <p className="text-2xl font-semibold text-text-primary">
            {formatCurrency(totals?.outstandingCents ?? 0, 'AUD')}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Profit {formatCurrency(totals?.totalProfitCents ?? 0, 'AUD')}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-text-tertiary">Avg margin</p>
          <p className="text-2xl font-semibold text-text-primary">
            {totals?.avgMarginPercent ?? null}
            {totals?.avgMarginPercent !== null ? '%' : 'N/A'}
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            Avg days to complete {time?.avgDaysToComplete ?? 'N/A'}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-text-tertiary">On-time rate</p>
          <p className="text-2xl font-semibold text-text-primary">{formatRate(time?.onTimeRate ?? null)}</p>
          <p className="text-xs text-text-tertiary mt-1">
            At-risk jobs {performance?.risk.atRiskCount ?? 0}
          </p>
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Trends</h3>
        {performance?.trends?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-text-tertiary">
                <tr>
                  <th className="py-2">Window</th>
                  <th className="py-2">Jobs</th>
                  <th className="py-2">Invoiced</th>
                  <th className="py-2">Paid</th>
                  <th className="py-2">Profit</th>
                  <th className="py-2">On-time</th>
                </tr>
              </thead>
              <tbody>
                {performance.trends.map((trend) => (
                  <tr key={trend.windowDays} className="border-t border-border-subtle">
                    <td className="py-2">{trend.windowDays} days</td>
                    <td className="py-2">{trend.jobsCount}</td>
                    <td className="py-2">{formatCurrency(trend.invoicedCents, 'AUD')}</td>
                    <td className="py-2">{formatCurrency(trend.paidCents, 'AUD')}</td>
                    <td className="py-2">{formatCurrency(trend.profitCents, 'AUD')}</td>
                    <td className="py-2">{formatRate(trend.onTimeRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">No trends available.</p>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Job history</h3>
        {recentJobs.length === 0 ? (
          <p className="text-sm text-text-tertiary">No jobs linked to this client yet.</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link href={`/jobs/${job.id}`} className="text-sm font-semibold text-text-primary hover:text-accent-gold">
                    {job.title}
                  </Link>
                  <p className="text-xs text-text-tertiary mt-1">
                    {job.status.replace('_', ' ')} •{' '}
                    {job.scheduledStart ? formatInvoiceDate(job.scheduledStart) : 'Unscheduled'}
                  </p>
                </div>
                <span className="text-xs text-text-tertiary">
                  Profitability {job.profitabilityStatus ?? 'N/A'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
