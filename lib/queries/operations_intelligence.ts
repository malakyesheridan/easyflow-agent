import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobs } from '@/db/schema/jobs';
import { jobHoursLogs } from '@/db/schema/job_hours_logs';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { jobActivityEvents } from '@/db/schema/job_activity_events';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobPayments } from '@/db/schema/job_payments';
import { signalEvents } from '@/db/schema/signal_events';
import { auditLogs } from '@/db/schema/audit_logs';
import { users } from '@/db/schema/users';
import { getOperationsMapData } from '@/lib/queries/operations_map';
import { getOrgSettings } from '@/lib/queries/org_settings';
import { defaultMarginSettings } from '@/lib/org/orgConfig';
import { assignmentToDateRange } from '@/lib/utils/scheduleTime';
import { ok, err, type Result } from '@/lib/result';
import type { RequestActor } from '@/lib/authz';
import type {
  OperationsIntelligencePayload,
  OperationsJobHealthStatus,
  OperationsSignal,
  OperationsSignalSeverity,
} from '@/lib/types/operations_intelligence';
import { buildOperationsSignals, type CrewSwapEvent, type SignalAssignment } from '@/lib/operations/signal_engine';
import { deriveInvoiceStatus } from '@/lib/financials/invoiceState';

const DEFAULT_LATE_RISK_MINUTES = 60;
const DEFAULT_IDLE_THRESHOLD_MINUTES = 90;
const DEFAULT_STALE_LOCATION_MINUTES = 30;
const DEFAULT_RISK_RADIUS_KM = 5;
const DEFAULT_NO_PROGRESS_MINUTES = 60;
const DEFAULT_NO_MATERIALS_MINUTES = 60;
const DEFAULT_EN_ROUTE_DELAY_MINUTES = 30;
const DEFAULT_HOURS_OVERAGE_MULTIPLIER = 1.2;
const DEFAULT_TIME_RISK_CRITICAL_MULTIPLIER = 1.5;
const DEFAULT_JOB_DURATION_MINUTES = 120;
const DEFAULT_UNASSIGNED_WARNING_DAYS = 3;
const DEFAULT_CREW_SWAP_WINDOW_MINUTES = 24 * 60;

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseFilterList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function resolveThreshold(params: {
  settingsValue: unknown;
  envKey: string;
  fallback: number;
}): number {
  const settingsParsed = parseNumber(params.settingsValue);
  if (settingsParsed !== null && settingsParsed >= 0) return settingsParsed;
  const envRaw = process.env[params.envKey];
  const envParsed = parseNumber(envRaw);
  if (envParsed !== null && envParsed >= 0) return envParsed;
  return params.fallback;
}

type OrgSettingsData = Awaited<ReturnType<typeof getOrgSettings>> extends Result<infer T> ? T : never;

function resolveIntelligenceThresholds(settings: OrgSettingsData) {
  return {
    lateRiskMinutes: resolveThreshold({
      settingsValue: settings?.lateRiskMinutes,
      envKey: 'LATE_RISK_MINUTES',
      fallback: DEFAULT_LATE_RISK_MINUTES,
    }),
    idleThresholdMinutes: resolveThreshold({
      settingsValue: settings?.idleThresholdMinutes,
      envKey: 'IDLE_THRESHOLD_MINUTES',
      fallback: DEFAULT_IDLE_THRESHOLD_MINUTES,
    }),
    staleLocationMinutes: resolveThreshold({
      settingsValue: settings?.staleLocationMinutes,
      envKey: 'STALE_LOCATION_MINUTES',
      fallback: DEFAULT_STALE_LOCATION_MINUTES,
    }),
    riskRadiusKm: resolveThreshold({
      settingsValue: settings?.riskRadiusKm,
      envKey: 'RISK_RADIUS_KM',
      fallback: DEFAULT_RISK_RADIUS_KM,
    }),
    noProgressMinutes: resolveThreshold({
      settingsValue: null,
      envKey: 'NO_PROGRESS_MINUTES',
      fallback: DEFAULT_NO_PROGRESS_MINUTES,
    }),
    noMaterialsMinutes: resolveThreshold({
      settingsValue: null,
      envKey: 'NO_MATERIALS_MINUTES',
      fallback: DEFAULT_NO_MATERIALS_MINUTES,
    }),
    enRouteDelayMinutes: resolveThreshold({
      settingsValue: settings?.defaultTravelBufferMinutes,
      envKey: 'EN_ROUTE_DELAY_MINUTES',
      fallback: DEFAULT_EN_ROUTE_DELAY_MINUTES,
    }),
    hoursOverageMultiplier: resolveThreshold({
      settingsValue: null,
      envKey: 'HOURS_OVERAGE_MULTIPLIER',
      fallback: DEFAULT_HOURS_OVERAGE_MULTIPLIER,
    }),
    timeRiskCriticalMultiplier: resolveThreshold({
      settingsValue: null,
      envKey: 'TIME_RISK_CRITICAL_MULTIPLIER',
      fallback: DEFAULT_TIME_RISK_CRITICAL_MULTIPLIER,
    }),
    defaultJobDurationMinutes: resolveThreshold({
      settingsValue: settings?.defaultJobDurationMinutes,
      envKey: 'DEFAULT_JOB_DURATION_MINUTES',
      fallback: DEFAULT_JOB_DURATION_MINUTES,
    }),
    unassignedWarningDays: resolveThreshold({
      settingsValue: null,
      envKey: 'UNASSIGNED_WARNING_DAYS',
      fallback: DEFAULT_UNASSIGNED_WARNING_DAYS,
    }),
    crewSwapWindowMinutes: resolveThreshold({
      settingsValue: null,
      envKey: 'CREW_SWAP_WINDOW_MINUTES',
      fallback: DEFAULT_CREW_SWAP_WINDOW_MINUTES,
    }),
    marginWarningPercent: resolveThreshold({
      settingsValue: settings?.marginWarningPercent,
      envKey: 'MARGIN_WARNING_PERCENT',
      fallback: defaultMarginSettings.marginWarningPercent,
    }),
    marginCriticalPercent: resolveThreshold({
      settingsValue: settings?.marginCriticalPercent,
      envKey: 'MARGIN_CRITICAL_PERCENT',
      fallback: defaultMarginSettings.marginCriticalPercent,
    }),
  };
}

function formatUserName(row: { name: string | null; email: string | null }, fallbackId: string): string {
  return row.name || row.email || `User ${fallbackId.slice(0, 8)}`;
}

function resolveInvoiceAnchor(row: {
  issuedAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}): Date {
  return row.issuedAt ?? row.sentAt ?? row.createdAt;
}

function extractEntityIdFromHref(href: string, prefix: string): string | null {
  if (!href.startsWith(prefix)) return null;
  const trimmed = href.slice(prefix.length);
  const id = trimmed.split('/')[0] ?? null;
  return id && id.length > 0 ? id : null;
}

export async function getOperationsIntelligence(params: {
  orgId: string;
  actor: RequestActor;
  filters?: {
    severity?: string | null;
    crewId?: string | null;
    jobId?: string | null;
    timeWindowMinutes?: number | null;
  };
}): Promise<Result<OperationsIntelligencePayload>> {
  try {
    const mapResult = await getOperationsMapData({ orgId: params.orgId, actor: params.actor });
    if (!mapResult.ok) return mapResult;

    const db = getDb();
    const settingsResult = await getOrgSettings({ orgId: params.orgId });
    const thresholds = resolveIntelligenceThresholds(settingsResult.ok ? settingsResult.data : null);
    const now = new Date();

    const jobsPayload = mapResult.data.jobs;
    const crewsPayload = mapResult.data.crews;
    const jobIds = jobsPayload.map((job) => job.id);

    const assignmentRows = jobIds.length
      ? await db
          .select({
            id: scheduleAssignments.id,
            jobId: scheduleAssignments.jobId,
            crewId: scheduleAssignments.crewId,
            date: scheduleAssignments.date,
            startMinutes: scheduleAssignments.startMinutes,
            endMinutes: scheduleAssignments.endMinutes,
            status: scheduleAssignments.status,
          })
          .from(scheduleAssignments)
          .where(and(eq(scheduleAssignments.orgId, params.orgId), inArray(scheduleAssignments.jobId, jobIds)))
      : [];

    const assignments: SignalAssignment[] = assignmentRows.map((row) => {
      const date = row.date instanceof Date ? row.date : new Date(row.date);
      const { scheduledStart, scheduledEnd } = assignmentToDateRange(date, row.startMinutes, row.endMinutes);
      return {
        ...row,
        date,
        scheduledStart,
        scheduledEnd,
      };
    });

    const crewSwapEvents: CrewSwapEvent[] = [];
    if (jobIds.length > 0 && thresholds.crewSwapWindowMinutes > 0) {
      const swapWindowStart = new Date(now.getTime() - thresholds.crewSwapWindowMinutes * 60000);
      const swapRows = await db
        .select({
          id: auditLogs.id,
          entityId: auditLogs.entityId,
          createdAt: auditLogs.createdAt,
          before: auditLogs.before,
          after: auditLogs.after,
        })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.orgId, params.orgId),
            eq(auditLogs.entityType, 'schedule'),
            eq(auditLogs.action, 'ASSIGN'),
            inArray(auditLogs.entityId, jobIds),
            gte(auditLogs.createdAt, swapWindowStart)
          )
        );

      swapRows.forEach((row) => {
        const before = (row.before ?? null) as Record<string, unknown> | null;
        const after = (row.after ?? null) as Record<string, unknown> | null;
        const previousCrewId = typeof before?.crewId === 'string' ? before.crewId : null;
        const nextCrewId = typeof after?.crewId === 'string' ? after.crewId : null;
        if (!previousCrewId || !nextCrewId || previousCrewId === nextCrewId) return;

        const assignmentId =
          typeof after?.id === 'string'
            ? after.id
            : typeof before?.id === 'string'
              ? before.id
              : null;
        const jobId =
          typeof after?.jobId === 'string'
            ? after.jobId
            : typeof before?.jobId === 'string'
              ? before.jobId
              : row.entityId;

        if (!assignmentId || !jobId) return;

        crewSwapEvents.push({
          eventId: row.id,
          assignmentId,
          jobId,
          previousCrewId,
          nextCrewId,
          changedAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
        });
      });
    }

    const lastActivityRows = jobIds.length
      ? await db
          .select({
            jobId: jobActivityEvents.jobId,
            lastActivityAt: sql<Date>`max(${jobActivityEvents.createdAt})`,
          })
          .from(jobActivityEvents)
          .where(and(eq(jobActivityEvents.orgId, params.orgId), inArray(jobActivityEvents.jobId, jobIds)))
          .groupBy(jobActivityEvents.jobId)
      : [];

    const lastActivityByJobId = new Map<string, Date | null>();
    lastActivityRows.forEach((row) => {
      const value = row.lastActivityAt;
      lastActivityByJobId.set(
        String(row.jobId),
        value instanceof Date ? value : value ? new Date(value) : null
      );
    });

    const jobMetaRows = jobIds.length
      ? await db
          .select({
            id: jobs.id,
            updatedAt: jobs.updatedAt,
            profitabilityStatus: jobs.profitabilityStatus,
            targetMarginPercent: jobs.targetMarginPercent,
            estimatedRevenueCents: jobs.estimatedRevenueCents,
            estimatedCostCents: jobs.estimatedCostCents,
          })
          .from(jobs)
          .where(and(eq(jobs.orgId, params.orgId), inArray(jobs.id, jobIds)))
      : [];

    const jobUpdatedAtById = new Map<string, Date | null>();
    const jobFinancialsById = new Map<
      string,
      {
        profitabilityStatus: 'healthy' | 'warning' | 'critical';
        targetMarginPercent: number | null;
        estimatedRevenueCents: number | null;
        estimatedCostCents: number | null;
      }
    >();
    jobMetaRows.forEach((row) => {
      const jobId = String(row.id);
      jobUpdatedAtById.set(jobId, row.updatedAt ?? null);
      jobFinancialsById.set(jobId, {
        profitabilityStatus: (row.profitabilityStatus ?? 'healthy') as 'healthy' | 'warning' | 'critical',
        targetMarginPercent: parseNumber(row.targetMarginPercent),
        estimatedRevenueCents: parseNumber(row.estimatedRevenueCents),
        estimatedCostCents: parseNumber(row.estimatedCostCents),
      });
    });

    const invoiceRows = jobIds.length
      ? await db
          .select({
            id: jobInvoices.id,
            jobId: jobInvoices.jobId,
            status: jobInvoices.status,
            amountCents: jobInvoices.amountCents,
            totalCents: jobInvoices.totalCents,
            currency: jobInvoices.currency,
            issuedAt: jobInvoices.issuedAt,
            sentAt: jobInvoices.sentAt,
            dueAt: jobInvoices.dueAt,
            paidAt: jobInvoices.paidAt,
            createdAt: jobInvoices.createdAt,
          })
          .from(jobInvoices)
          .where(and(eq(jobInvoices.orgId, params.orgId), inArray(jobInvoices.jobId, jobIds)))
      : [];

    const latestInvoiceByJobId = new Map<string, typeof invoiceRows[number]>();
    const invoiceAnchorByJobId = new Map<string, number>();
    invoiceRows.forEach((row) => {
      const jobId = String(row.jobId);
      const anchor = resolveInvoiceAnchor({
        issuedAt: row.issuedAt ?? null,
        sentAt: row.sentAt ?? null,
        createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      });
      const anchorMs = anchor.getTime();
      const currentMs = invoiceAnchorByJobId.get(jobId);
      if (currentMs === undefined || anchorMs >= currentMs) {
        latestInvoiceByJobId.set(jobId, row);
        invoiceAnchorByJobId.set(jobId, anchorMs);
      }
    });

    const latestInvoiceRows = Array.from(latestInvoiceByJobId.values());
    const invoiceIds = latestInvoiceRows.map((row) => row.id);
    const paymentRows = invoiceIds.length
      ? await db
          .select({
            invoiceId: jobPayments.invoiceId,
            status: jobPayments.status,
            amountCents: jobPayments.amountCents,
            paidAt: jobPayments.paidAt,
            createdAt: jobPayments.createdAt,
          })
          .from(jobPayments)
          .where(and(eq(jobPayments.orgId, params.orgId), inArray(jobPayments.invoiceId, invoiceIds)))
      : [];

    const paymentsByInvoiceId = new Map<string, Array<{ status: string | null; amountCents: number | null; paidAt: Date | null; createdAt: Date | null }>>();
    paymentRows.forEach((row) => {
      if (!row.invoiceId) return;
      const invoiceId = String(row.invoiceId);
      const list = paymentsByInvoiceId.get(invoiceId) ?? [];
      list.push({
        status: row.status ?? null,
        amountCents: row.amountCents ?? null,
        paidAt: row.paidAt ?? null,
        createdAt: row.createdAt ?? null,
      });
      paymentsByInvoiceId.set(invoiceId, list);
    });

    const jobInvoiceById = new Map<
      string,
      {
        invoiceId: string;
        status: string;
        totalCents: number;
        paidCents: number;
        outstandingCents: number;
        currency: string;
        issuedAt: Date | null;
        dueAt: Date | null;
        paidAt: Date | null;
        isOverdue: boolean;
      }
    >();

    latestInvoiceRows.forEach((row) => {
      const payments = paymentsByInvoiceId.get(row.id) ?? [];
      const totalCents = Number(row.totalCents ?? row.amountCents ?? 0);
      const derived = deriveInvoiceStatus({
        invoice: {
          status: row.status ?? null,
          totalCents,
          dueAt: row.dueAt ?? null,
          paidAt: row.paidAt ?? null,
        },
        payments,
        now,
      });
      jobInvoiceById.set(String(row.jobId), {
        invoiceId: row.id,
        status: derived.status,
        totalCents,
        paidCents: derived.paidCents,
        outstandingCents: derived.outstandingCents,
        currency: row.currency ?? 'AUD',
        issuedAt: row.issuedAt ?? row.sentAt ?? null,
        dueAt: row.dueAt ?? null,
        paidAt: derived.paidAt ?? null,
        isOverdue: derived.isOverdue,
      });
    });

    const usageRows = jobIds.length
      ? await db
          .select({
            jobId: materialUsageLogs.jobId,
            usageCount: sql<number>`count(*)`.mapWith(Number),
            lastUsageAt: sql<Date>`max(${materialUsageLogs.createdAt})`,
          })
          .from(materialUsageLogs)
          .where(and(eq(materialUsageLogs.orgId, params.orgId), inArray(materialUsageLogs.jobId, jobIds)))
          .groupBy(materialUsageLogs.jobId)
      : [];

    const usageByJobId = new Map<string, number>();
    const lastMaterialsLogByJobId = new Map<string, Date | null>();
    usageRows.forEach((row) => {
      const jobId = String(row.jobId);
      usageByJobId.set(jobId, Number(row.usageCount ?? 0));
      const lastUsage = row.lastUsageAt;
      lastMaterialsLogByJobId.set(jobId, lastUsage instanceof Date ? lastUsage : lastUsage ? new Date(lastUsage) : null);
    });

    const hoursRows = jobIds.length
      ? await db
          .select({
            jobId: jobHoursLogs.jobId,
            totalMinutes: sql<number>`sum(${jobHoursLogs.minutes})`.mapWith(Number),
            lastLoggedAt: sql<Date>`max(${jobHoursLogs.createdAt})`,
          })
          .from(jobHoursLogs)
          .where(and(eq(jobHoursLogs.orgId, params.orgId), inArray(jobHoursLogs.jobId, jobIds)))
          .groupBy(jobHoursLogs.jobId)
      : [];

    const hoursByJobId = new Map<string, number>();
    const lastHoursLogByJobId = new Map<string, Date | null>();
    hoursRows.forEach((row) => {
      const jobId = String(row.jobId);
      hoursByJobId.set(jobId, Number(row.totalMinutes ?? 0));
      const lastLogged = row.lastLoggedAt;
      lastHoursLogByJobId.set(jobId, lastLogged instanceof Date ? lastLogged : lastLogged ? new Date(lastLogged) : null);
    });

    const plannedMaterialRows = jobIds.length
      ? await db
          .select({
            jobId: jobMaterialAllocations.jobId,
            plannedCount: sql<number>`count(*)`.mapWith(Number),
          })
          .from(jobMaterialAllocations)
          .where(and(eq(jobMaterialAllocations.orgId, params.orgId), inArray(jobMaterialAllocations.jobId, jobIds)))
          .groupBy(jobMaterialAllocations.jobId)
      : [];

    const plannedMaterialsByJobId = new Map<string, number>();
    plannedMaterialRows.forEach((row) => {
      plannedMaterialsByJobId.set(String(row.jobId), Number(row.plannedCount ?? 0));
    });

    const signalCandidates = buildOperationsSignals({
      now,
      jobs: jobsPayload,
      crews: crewsPayload,
      assignments,
      crewSwapEvents,
      lastActivityByJobId,
      jobUpdatedAtById,
      usageByJobId,
      lastHoursLogByJobId,
      lastMaterialsLogByJobId,
      hoursByJobId,
      plannedMaterialsByJobId,
      jobFinancialsById,
      jobInvoiceById,
      thresholds,
    });

    const signalIds = signalCandidates.map((signal) => signal.id);
    const existingEvents = signalIds.length
      ? await db
          .select()
          .from(signalEvents)
          .where(and(eq(signalEvents.orgId, params.orgId), inArray(signalEvents.signalId, signalIds)))
      : [];

    const eventBySignalId = new Map(existingEvents.map((row) => [row.signalId, row]));
    const missingSignals = signalCandidates.filter((signal) => !eventBySignalId.has(signal.id));

    if (missingSignals.length > 0) {
      const inserted = await db
        .insert(signalEvents)
        .values(
          missingSignals.map((signal) => ({
            orgId: params.orgId,
            signalId: signal.id,
            entityType: signal.entityType,
            entityId: signal.entityId,
            status: 'open' as const,
            createdAt: signal.createdAt,
          }))
        )
        .onConflictDoNothing({ target: [signalEvents.orgId, signalEvents.signalId] })
        .returning();
      inserted.forEach((row) => eventBySignalId.set(row.signalId, row));

      const stillMissing = missingSignals.filter((signal) => !eventBySignalId.has(signal.id));
      if (stillMissing.length > 0) {
        const rows = await db
          .select()
          .from(signalEvents)
          .where(and(eq(signalEvents.orgId, params.orgId), inArray(signalEvents.signalId, stillMissing.map((s) => s.id))));
        rows.forEach((row) => eventBySignalId.set(row.signalId, row));
      }
    }

    const userIds = new Set<string>();
    eventBySignalId.forEach((row) => {
      if (row.assignedTo) userIds.add(row.assignedTo);
      if (row.acknowledgedBy) userIds.add(row.acknowledgedBy);
      if (row.resolvedBy) userIds.add(row.resolvedBy);
    });

    const userRows = userIds.size
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, Array.from(userIds)))
      : [];
    const userById = new Map(userRows.map((row) => [row.id, row]));

    const signalsWithStatus: OperationsSignal[] = signalCandidates.map((signal) => {
      const event = eventBySignalId.get(signal.id);
      const assignedTo = event?.assignedTo ?? null;
      const acknowledgedBy = event?.acknowledgedBy ?? null;
      const resolvedBy = event?.resolvedBy ?? null;
      const assignedRow = assignedTo ? userById.get(assignedTo) : null;
      const acknowledgedRow = acknowledgedBy ? userById.get(acknowledgedBy) : null;
      const resolvedRow = resolvedBy ? userById.get(resolvedBy) : null;

      return {
        id: signal.id,
        type: signal.type ?? signal.entityType,
        severity: signal.severity,
        title: signal.title ?? signal.headline,
        description: signal.description ?? signal.reason,
        entityType: signal.entityType,
        entityId: signal.entityId,
        detectedAt: (signal.detectedAt ?? signal.createdAt).toISOString(),
        metadata: signal.metadata ?? signal.evidence,
        headline: signal.headline,
        reason: signal.reason,
        evidence: signal.evidence,
        recommendedActions: signal.recommendedActions,
        deepLinks: signal.deepLinks,
        createdAt: signal.createdAt.toISOString(),
        status: event?.status ?? 'open',
        signalEventId: event?.id ?? '',
        assignedToUserId: assignedTo,
        assignedToName: assignedRow ? formatUserName(assignedRow, assignedTo ?? '') : null,
        acknowledgedByUserId: acknowledgedBy,
        acknowledgedByName: acknowledgedRow ? formatUserName(acknowledgedRow, acknowledgedBy ?? '') : null,
        acknowledgedAt: event?.acknowledgedAt ? event.acknowledgedAt.toISOString() : null,
        resolvedByUserId: resolvedBy,
        resolvedByName: resolvedRow ? formatUserName(resolvedRow, resolvedBy ?? '') : null,
        resolvedAt: event?.resolvedAt ? event.resolvedAt.toISOString() : null,
        resolutionReason: event?.resolutionReason ?? null,
        notes: event?.notes ?? null,
      };
    });

    const visibleSignals = signalsWithStatus.filter((signal) => signal.status !== 'resolved');
    const severityFilter = parseFilterList(params.filters?.severity ?? null).filter(
      (value): value is OperationsSignalSeverity => value === 'info' || value === 'warning' || value === 'critical'
    );
    const crewIdFilter = params.filters?.crewId?.trim() || null;
    const jobIdFilter = params.filters?.jobId?.trim() || null;
    const timeWindowMinutes = params.filters?.timeWindowMinutes ?? null;

    const filteredSignals = visibleSignals.filter((signal) => {
      if (severityFilter.length > 0 && !severityFilter.includes(signal.severity)) return false;
      if (crewIdFilter && !(signal.entityType === 'crew' && signal.entityId === crewIdFilter)) return false;
      if (jobIdFilter && !(signal.entityType === 'job' && signal.entityId === jobIdFilter)) return false;
      if (timeWindowMinutes && timeWindowMinutes > 0) {
        const createdAt = new Date(signal.createdAt);
        if (Number.isNaN(createdAt.getTime())) return false;
        if (createdAt.getTime() < now.getTime() - timeWindowMinutes * 60000) return false;
      }
      return true;
    });

    const jobHealthMap = new Map<string, { hasWarning: boolean; hasCritical: boolean; reasons: Set<string> }>();
    const crewRiskMap = new Map<string, { hasWarning: boolean; hasCritical: boolean; reasons: Set<string> }>();
    for (const signal of visibleSignals) {
      if (signal.entityType === 'job') {
        const entry = jobHealthMap.get(signal.entityId) ?? { hasWarning: false, hasCritical: false, reasons: new Set<string>() };
        if (signal.severity === 'critical') entry.hasCritical = true;
        if (signal.severity === 'warning') entry.hasWarning = true;
        entry.reasons.add(signal.headline);
        jobHealthMap.set(signal.entityId, entry);
      } else if (signal.entityType === 'crew') {
        const entry = crewRiskMap.get(signal.entityId) ?? { hasWarning: false, hasCritical: false, reasons: new Set<string>() };
        if (signal.severity === 'critical') entry.hasCritical = true;
        if (signal.severity === 'warning') entry.hasWarning = true;
        entry.reasons.add(signal.headline);
        crewRiskMap.set(signal.entityId, entry);
      }
    }

    const jobHealth = jobsPayload.map((job) => {
      const entry = jobHealthMap.get(job.id);
      const status: OperationsJobHealthStatus =
        entry?.hasCritical ? 'at_risk' : entry?.hasWarning ? 'watch' : 'healthy';
      return { jobId: job.id, status, reasons: entry ? Array.from(entry.reasons) : [] };
    });

    const crewRisks = crewsPayload.map((crew) => {
      const entry = crewRiskMap.get(crew.id);
      const status: OperationsJobHealthStatus =
        entry?.hasCritical ? 'at_risk' : entry?.hasWarning ? 'watch' : 'healthy';
      return { crewId: crew.id, status, reasons: entry ? Array.from(entry.reasons) : [] };
    });

    const supportJobIds = new Set<string>();
    const supportCrewIds = new Set<string>();

    for (const signal of filteredSignals) {
      if (signal.entityType === 'job') supportJobIds.add(signal.entityId);
      if (signal.entityType === 'crew') supportCrewIds.add(signal.entityId);
      signal.deepLinks.forEach((link) => {
        const jobId = extractEntityIdFromHref(link.href, '/jobs/');
        if (jobId) supportJobIds.add(jobId);
        const crewId = extractEntityIdFromHref(link.href, '/crews/');
        if (crewId) supportCrewIds.add(crewId);
      });
    }

    const avgAckRow = await db
      .select({
        avgMinutes: sql<number>`avg(extract(epoch from ${signalEvents.acknowledgedAt} - ${signalEvents.createdAt}) / 60)`,
      })
      .from(signalEvents)
      .where(and(eq(signalEvents.orgId, params.orgId), sql`${signalEvents.acknowledgedAt} is not null`));

    const avgTimeToAckMinutes = avgAckRow?.[0]?.avgMinutes ?? null;

    return ok({
      orgId: mapResult.data.orgId,
      generatedAt: now.toISOString(),
      evaluatedAt: now.toISOString(),
      signals: filteredSignals,
      jobHealth,
      crewRisks,
      entities: {
        jobs: jobsPayload.filter((job) => supportJobIds.has(job.id)),
        crews: crewsPayload.filter((crew) => supportCrewIds.has(crew.id)),
      },
      scoreboard: {
        atRiskJobs: jobsPayload.filter((job) => job.risk.atRisk).length,
        idleCrews: crewsPayload.filter(
          (crew) => crew.idleMinutes !== null && crew.idleMinutes >= thresholds.idleThresholdMinutes
        ).length,
        openCriticalSignals: signalsWithStatus.filter((signal) => signal.status === 'open' && signal.severity === 'critical').length,
        avgTimeToAckMinutes: avgTimeToAckMinutes !== null ? Number(avgTimeToAckMinutes) : null,
      },
      thresholds,
      permissions: mapResult.data.permissions,
    });
  } catch (error) {
    console.error('Error loading operations intelligence:', error);
    return err('INTERNAL_ERROR', 'Failed to load operations intelligence', error);
  }
}
