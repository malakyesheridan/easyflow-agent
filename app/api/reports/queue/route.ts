import { and, eq, ne } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { listings } from '@/db/schema/listings';
import { contacts } from '@/db/schema/contacts';
import { computeNextDueAt, getCadenceLabel } from '@/lib/reports/cadence';

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function healthBand(score: number) {
  if (score >= 70) return 'healthy';
  if (score >= 40) return 'watch';
  return 'stalling';
}

export const GET = withRoute(async (req: Request) => {
  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('orgId');
  const orgContext = await requireOrgContext(req, orgId);
  if (!orgContext.ok) return orgContext;

  const db = getDb();
  const rows = await db
    .select({
      id: listings.id,
      addressLine1: listings.addressLine1,
      suburb: listings.suburb,
      status: listings.status,
      listedAt: listings.listedAt,
      createdAt: listings.createdAt,
      vendorContactId: listings.vendorContactId,
      vendorName: contacts.fullName,
      reportCadenceEnabled: listings.reportCadenceEnabled,
      reportCadenceType: listings.reportCadenceType,
      reportCadenceIntervalDays: listings.reportCadenceIntervalDays,
      reportCadenceDayOfWeek: listings.reportCadenceDayOfWeek,
      reportNextDueAt: listings.reportNextDueAt,
      reportLastSentAt: listings.reportLastSentAt,
      campaignHealthScore: listings.campaignHealthScore,
      campaignHealthReasons: listings.campaignHealthReasons,
    })
    .from(listings)
    .leftJoin(contacts, eq(listings.vendorContactId, contacts.id))
    .where(
      and(
        eq(listings.orgId, orgContext.data.orgId),
        eq(listings.status, 'active'),
        eq(listings.reportCadenceEnabled, true),
        ne(listings.reportCadenceType, 'none')
      )
    );

  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const upcomingCutoff = new Date(startOfToday);
  upcomingCutoff.setDate(upcomingCutoff.getDate() + 7);

  const dueToday: any[] = [];
  const overdue: any[] = [];
  const upcoming: any[] = [];

  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let last7Count = 0;
  const reportIntervals: number[] = [];

  rows.forEach((row) => {
    const baseDate = row.reportLastSentAt ?? row.listedAt ?? row.createdAt ?? now;
    const nextDue = row.reportNextDueAt ?? computeNextDueAt({
      baseDate,
      cadence: {
        cadenceType: row.reportCadenceType ?? 'weekly',
        intervalDays: row.reportCadenceIntervalDays ?? null,
        dayOfWeek: row.reportCadenceDayOfWeek ?? null,
      },
    });

    const dom = row.listedAt
      ? Math.max(0, Math.floor((now.getTime() - row.listedAt.getTime()) / (24 * 60 * 60 * 1000)))
      : 0;

    if (row.reportLastSentAt && row.reportLastSentAt >= last7Days) {
      last7Count += 1;
    }
    if (row.reportLastSentAt) {
      reportIntervals.push(Math.max(0, (now.getTime() - row.reportLastSentAt.getTime()) / (24 * 60 * 60 * 1000)));
    }

    const entry = {
      id: String(row.id),
      address: row.addressLine1 ?? '',
      suburb: row.suburb ?? '',
      vendorName: row.vendorName ?? null,
      status: row.status,
      daysOnMarket: dom,
      campaignHealthScore: row.campaignHealthScore ?? 50,
      campaignHealthReasons: (row.campaignHealthReasons as string[] | null) ?? [],
      healthBand: healthBand(row.campaignHealthScore ?? 50),
      lastReportSentAt: toIso(row.reportLastSentAt ?? null),
      nextReportDueAt: toIso(nextDue ?? null),
      cadenceLabel: getCadenceLabel({
        cadenceType: row.reportCadenceType ?? 'weekly',
        intervalDays: row.reportCadenceIntervalDays ?? null,
        dayOfWeek: row.reportCadenceDayOfWeek ?? null,
      }),
    };

    if (nextDue && nextDue < startOfToday) {
      overdue.push(entry);
    } else if (nextDue && nextDue >= startOfToday && nextDue < endOfToday) {
      dueToday.push(entry);
    } else if (nextDue && nextDue >= endOfToday && nextDue <= upcomingCutoff) {
      upcoming.push(entry);
    }
  });

  const coveragePercent = rows.length > 0 ? Math.round((last7Count / rows.length) * 100) : 0;
  const avgDaysBetween = reportIntervals.length > 0
    ? Math.round((reportIntervals.reduce((sum, value) => sum + value, 0) / reportIntervals.length) * 10) / 10
    : 0;

  return ok({
    metrics: {
      coveragePercent,
      overdueCount: overdue.length,
      avgDaysBetweenReports: avgDaysBetween,
      activeListings: rows.length,
    },
    dueToday,
    overdue,
    upcoming,
  });
});
