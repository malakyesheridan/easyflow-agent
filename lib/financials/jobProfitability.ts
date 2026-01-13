import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobs, type Job } from '@/db/schema/jobs';
import { jobHoursLogs } from '@/db/schema/job_hours_logs';
import { crewMembers } from '@/db/schema/crew_members';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { jobCosts } from '@/db/schema/job_costs';
import { jobPayments } from '@/db/schema/job_payments';
import { jobInvoices } from '@/db/schema/job_invoices';
import { orgSettings } from '@/db/schema/org_settings';
import { jobActivityEvents } from '@/db/schema/job_activity_events';
import { createJobActivityEventBestEffort } from '@/lib/mutations/job_activity';
import { emitAppEvent } from '@/lib/integrations/events/emit';
import { ok, err, type Result } from '@/lib/result';
import { toNumber } from '@/lib/utils/quantity';
import { defaultMarginSettings } from '@/lib/org/orgConfig';
import { isSuccessfulPaymentStatus } from '@/lib/financials/invoiceState';

// Profitability derives from existing systems (hours logs, usage logs, invoices/payments).
// New data here is limited to manual job_costs entries and job-level estimate fields.

export type ProfitabilityStatus = 'healthy' | 'warning' | 'critical';
export type RevenueSource = 'override' | 'payments' | 'invoices' | 'estimate' | 'none';

export type JobProfitability = {
  jobId: string;
  revenue: {
    actualCents: number | null;
    estimatedCents: number | null;
    overrideCents: number | null;
    effectiveCents: number;
    source: RevenueSource;
  };
  costs: {
    labourCents: number;
    materialCents: number;
    subcontractCents: number;
    otherCents: number;
    travelCents: number;
    totalCents: number;
  };
  profitCents: number;
  marginPercent: number | null;
  estimated: {
    revenueCents: number | null;
    costCents: number | null;
    profitCents: number | null;
    marginPercent: number | null;
    targetMarginPercent: number | null;
  };
  variance: {
    percent: number | null;
    costPercent: number | null;
  };
  status: ProfitabilityStatus;
  lastComputedAt: string;
  inputs: {
    labourMinutes: number;
    missingLabourRateCount: number;
    materialUsageCount: number;
    missingMaterialCostCount: number;
    manualCostCount: number;
    paymentsCount: number;
    invoicesCount: number;
    revenueSource: RevenueSource;
  };
  settings: {
    marginWarningPercent: number;
    marginCriticalPercent: number;
    varianceThresholdPercent: number;
  };
};

type ProfitabilityInputs = {
  job: Job;
  paymentsTotalCents: number;
  invoicesTotalCents: number;
  paymentsCount: number;
  invoicesCount: number;
  labourCents: number;
  materialCents: number;
  subcontractCents: number;
  otherCents: number;
  travelCents: number;
  labourMinutes: number;
  missingLabourRateCount: number;
  materialUsageCount: number;
  missingMaterialCostCount: number;
  manualCostCount: number;
  settings: {
    marginWarningPercent: number | null;
    marginCriticalPercent: number | null;
    varianceThresholdPercent: number | null;
  } | null;
  now?: Date;
};

function parseOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizePercent(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(0, Number(value));
}

function computeLabourCostCents(params: {
  minutes: number;
  costRateCents: number | null;
  costRateType: string | null;
  dailyCapacityMinutes: number | null;
}): number {
  if (!Number.isFinite(params.costRateCents ?? NaN)) return 0;
  const rateCents = Number(params.costRateCents);
  if (rateCents <= 0) return 0;
  const minutes = Math.max(0, Number(params.minutes || 0));
  if (minutes <= 0) return 0;
  if (params.costRateType === 'daily') {
    const baseMinutes = Number.isFinite(params.dailyCapacityMinutes ?? NaN)
      ? Math.max(1, Number(params.dailyCapacityMinutes))
      : 8 * 60;
    return Math.round((minutes / baseMinutes) * rateCents);
  }
  return Math.round((minutes / 60) * rateCents);
}

export function deriveJobProfitability(input: ProfitabilityInputs): JobProfitability {
  const now = input.now ?? new Date();
  const estimatedRevenueCents = parseOptionalNumber(input.job.estimatedRevenueCents);
  const estimatedCostFromJob = parseOptionalNumber(input.job.estimatedCostCents);
  const targetMarginPercent = parseOptionalNumber(input.job.targetMarginPercent);

  let derivedEstimatedCostCents = estimatedCostFromJob;
  if (
    derivedEstimatedCostCents === null &&
    Number.isFinite(estimatedRevenueCents ?? NaN) &&
    Number.isFinite(targetMarginPercent ?? NaN)
  ) {
    derivedEstimatedCostCents = Math.round(
      Number(estimatedRevenueCents) * (1 - Number(targetMarginPercent) / 100)
    );
  }

  const overrideCents = parseOptionalNumber(input.job.revenueOverrideCents);
  let revenueActualCents: number | null = null;
  let revenueSource: RevenueSource = 'none';

  if (Number.isFinite(overrideCents ?? NaN)) {
    revenueActualCents = Number(overrideCents);
    revenueSource = 'override';
  } else if (input.paymentsTotalCents > 0) {
    revenueActualCents = input.paymentsTotalCents;
    revenueSource = 'payments';
  } else if (input.invoicesTotalCents > 0) {
    revenueActualCents = input.invoicesTotalCents;
    revenueSource = 'invoices';
  } else if (Number.isFinite(estimatedRevenueCents ?? NaN)) {
    revenueActualCents = null;
    revenueSource = 'estimate';
  }

  const revenueEffectiveCents =
    revenueActualCents !== null && Number.isFinite(revenueActualCents)
      ? revenueActualCents
      : Number.isFinite(estimatedRevenueCents ?? NaN)
        ? Number(estimatedRevenueCents)
        : 0;

  const totalCostCents =
    input.labourCents + input.materialCents + input.subcontractCents + input.otherCents + input.travelCents;
  const profitCents = revenueEffectiveCents - totalCostCents;
  const marginPercent =
    revenueEffectiveCents > 0 ? (profitCents / revenueEffectiveCents) * 100 : null;

  const estimatedProfitCents =
    Number.isFinite(estimatedRevenueCents ?? NaN) && Number.isFinite(derivedEstimatedCostCents ?? NaN)
      ? Number(estimatedRevenueCents) - Number(derivedEstimatedCostCents)
      : null;
  const estimatedMarginPercent =
    Number.isFinite(estimatedRevenueCents ?? NaN) && estimatedRevenueCents
      ? estimatedProfitCents !== null
        ? (estimatedProfitCents / Number(estimatedRevenueCents)) * 100
        : null
      : null;

  const variancePercent =
    estimatedProfitCents !== null && estimatedProfitCents !== 0
      ? ((profitCents - estimatedProfitCents) / estimatedProfitCents) * 100
      : null;
  const costVariancePercent =
    derivedEstimatedCostCents !== null && derivedEstimatedCostCents !== 0
      ? ((totalCostCents - derivedEstimatedCostCents) / derivedEstimatedCostCents) * 100
      : null;

  const marginWarningPercent = normalizePercent(
    input.settings?.marginWarningPercent ?? null,
    defaultMarginSettings.marginWarningPercent
  );
  const marginCriticalPercent = normalizePercent(
    input.settings?.marginCriticalPercent ?? null,
    defaultMarginSettings.marginCriticalPercent
  );
  const varianceThresholdPercent = normalizePercent(
    input.settings?.varianceThresholdPercent ?? null,
    defaultMarginSettings.varianceThresholdPercent
  );

  let status: ProfitabilityStatus = 'healthy';
  if (marginPercent !== null) {
    if (marginPercent <= marginCriticalPercent) status = 'critical';
    else if (marginPercent <= marginWarningPercent) status = 'warning';
  }

  return {
    jobId: input.job.id,
    revenue: {
      actualCents: revenueActualCents,
      estimatedCents: estimatedRevenueCents,
      overrideCents,
      effectiveCents: revenueEffectiveCents,
      source: revenueSource,
    },
    costs: {
      labourCents: input.labourCents,
      materialCents: input.materialCents,
      subcontractCents: input.subcontractCents,
      otherCents: input.otherCents,
      travelCents: input.travelCents,
      totalCents: totalCostCents,
    },
    profitCents,
    marginPercent,
    estimated: {
      revenueCents: estimatedRevenueCents,
      costCents: derivedEstimatedCostCents,
      profitCents: estimatedProfitCents,
      marginPercent: estimatedMarginPercent,
      targetMarginPercent,
    },
    variance: {
      percent: variancePercent,
      costPercent: costVariancePercent,
    },
    status,
    lastComputedAt: now.toISOString(),
    inputs: {
      labourMinutes: input.labourMinutes,
      missingLabourRateCount: input.missingLabourRateCount,
      materialUsageCount: input.materialUsageCount,
      missingMaterialCostCount: input.missingMaterialCostCount,
      manualCostCount: input.manualCostCount,
      paymentsCount: input.paymentsCount,
      invoicesCount: input.invoicesCount,
      revenueSource,
    },
    settings: {
      marginWarningPercent,
      marginCriticalPercent,
      varianceThresholdPercent,
    },
  };
}

async function loadJobProfitabilityInputs(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<ProfitabilityInputs>> {
  try {
    const db = getDb();
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.orgId, params.orgId), eq(jobs.id, params.jobId)))
      .limit(1);
    if (!job) return err('NOT_FOUND', 'Job not found');

    const [settings] = await db
      .select()
      .from(orgSettings)
      .where(eq(orgSettings.orgId, params.orgId))
      .limit(1);

    const paymentRows = await db
      .select({ amountCents: jobPayments.amountCents, status: jobPayments.status })
      .from(jobPayments)
      .where(and(eq(jobPayments.orgId, params.orgId), eq(jobPayments.jobId, params.jobId)));
    let paymentsTotalCents = 0;
    let paymentsCount = 0;
    for (const row of paymentRows) {
      if (isSuccessfulPaymentStatus(String(row.status ?? ''))) {
        paymentsTotalCents += Number(row.amountCents ?? 0);
        paymentsCount += 1;
      }
    }

    const invoiceRows = await db
      .select({ amountCents: jobInvoices.amountCents, totalCents: jobInvoices.totalCents, status: jobInvoices.status })
      .from(jobInvoices)
      .where(and(eq(jobInvoices.orgId, params.orgId), eq(jobInvoices.jobId, params.jobId)));
    let invoicesTotalCents = 0;
    let invoicesCount = 0;
    for (const row of invoiceRows) {
      const status = String(row.status ?? '').toLowerCase();
      if (status && status !== 'draft' && status !== 'void') {
        invoicesTotalCents += Number(row.totalCents ?? row.amountCents ?? 0);
        invoicesCount += 1;
      }
    }

    const hoursRows = await db
      .select({
        minutes: jobHoursLogs.minutes,
        crewMemberId: jobHoursLogs.crewMemberId,
        costRateCents: crewMembers.costRateCents,
        costRateType: crewMembers.costRateType,
        dailyCapacityMinutes: crewMembers.dailyCapacityMinutes,
      })
      .from(jobHoursLogs)
      .leftJoin(
        crewMembers,
        and(eq(crewMembers.id, jobHoursLogs.crewMemberId), eq(crewMembers.orgId, jobHoursLogs.orgId))
      )
      .where(and(eq(jobHoursLogs.orgId, params.orgId), eq(jobHoursLogs.jobId, params.jobId)));

    let labourCents = 0;
    let labourMinutes = 0;
    let missingLabourRateCount = 0;
    for (const row of hoursRows) {
      const minutes = Number(row.minutes ?? 0);
      labourMinutes += minutes;
      if (!Number.isFinite(row.costRateCents ?? NaN)) {
        if (minutes > 0) missingLabourRateCount += 1;
        continue;
      }
      labourCents += computeLabourCostCents({
        minutes,
        costRateCents: row.costRateCents ?? null,
        costRateType: row.costRateType ?? null,
        dailyCapacityMinutes: row.dailyCapacityMinutes ?? null,
      });
    }

    const usageRows = await db
      .select({
        quantityUsed: materialUsageLogs.quantityUsed,
        unitCostCents: materialUsageLogs.unitCostCents,
      })
      .from(materialUsageLogs)
      .where(and(eq(materialUsageLogs.orgId, params.orgId), eq(materialUsageLogs.jobId, params.jobId)));

    let materialCents = 0;
    let materialUsageCount = 0;
    let missingMaterialCostCount = 0;
    for (const row of usageRows) {
      const quantity = toNumber(row.quantityUsed ?? 0);
      const unitCostCents = Number(row.unitCostCents ?? NaN);
      materialUsageCount += 1;
      if (!Number.isFinite(unitCostCents)) {
        if (quantity > 0) missingMaterialCostCount += 1;
        continue;
      }
      materialCents += Math.round(quantity * unitCostCents);
    }

    const costRows = await db
      .select({
        costType: jobCosts.costType,
        totalCostCents: jobCosts.totalCostCents,
      })
      .from(jobCosts)
      .where(and(eq(jobCosts.orgId, params.orgId), eq(jobCosts.jobId, params.jobId)));

    let subcontractCents = 0;
    let otherCents = 0;
    let travelCents = 0;
    let manualCostCount = 0;
    for (const row of costRows) {
      const value = Number(row.totalCostCents ?? 0);
      manualCostCount += 1;
      if (row.costType === 'subcontract') subcontractCents += value;
      else if (row.costType === 'travel') travelCents += value;
      else if (row.costType === 'material') materialCents += value;
      else if (row.costType === 'labour') labourCents += value;
      else otherCents += value;
    }

    return ok({
      job,
      paymentsTotalCents,
      invoicesTotalCents,
      paymentsCount,
      invoicesCount,
      labourCents,
      materialCents,
      subcontractCents,
      otherCents,
      travelCents,
      labourMinutes,
      missingLabourRateCount,
      materialUsageCount,
      missingMaterialCostCount,
      manualCostCount,
      settings: settings
        ? {
            marginWarningPercent: Number(settings.marginWarningPercent ?? NaN),
            marginCriticalPercent: Number(settings.marginCriticalPercent ?? NaN),
            varianceThresholdPercent: Number(settings.varianceThresholdPercent ?? NaN),
          }
        : null,
    });
  } catch (error) {
    console.error('Error loading job profitability inputs:', error);
    return err('INTERNAL_ERROR', 'Failed to load job profitability', error);
  }
}

export async function getJobProfitability(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<JobProfitability>> {
  const inputs = await loadJobProfitabilityInputs(params);
  if (!inputs.ok) return inputs;
  return ok(deriveJobProfitability(inputs.data));
}

export async function evaluateJobGuardrails(params: {
  orgId: string;
  jobId: string;
  actorUserId?: string | null;
}): Promise<Result<JobProfitability>> {
  const inputsResult = await loadJobProfitabilityInputs(params);
  if (!inputsResult.ok) return inputsResult;

  const db = getDb();
  const profitability = deriveJobProfitability(inputsResult.data);
  const { marginPercent } = profitability;
  const previousStatus = inputsResult.data.job.profitabilityStatus as ProfitabilityStatus;

  if (marginPercent !== null && profitability.status !== previousStatus) {
    await db
      .update(jobs)
      .set({ profitabilityStatus: profitability.status } as any)
      .where(and(eq(jobs.orgId, params.orgId), eq(jobs.id, params.jobId)));

    const shouldEmitWarning = profitability.status === 'warning' && previousStatus === 'healthy';
    const shouldEmitCritical = profitability.status === 'critical' && previousStatus !== 'critical';

    if (shouldEmitWarning || shouldEmitCritical) {
      const eventType = profitability.status === 'critical' ? 'job_margin_critical' : 'job_margin_warning';

      void createJobActivityEventBestEffort({
        orgId: params.orgId,
        jobId: params.jobId,
        type: profitability.status === 'critical' ? 'margin_critical' : 'margin_warning',
        actorCrewMemberId: null,
        payload: {
          marginPercent,
          profitCents: profitability.profitCents,
          revenueCents: profitability.revenue.effectiveCents,
          costCents: profitability.costs.totalCents,
          thresholdPercent:
            profitability.status === 'critical'
              ? profitability.settings.marginCriticalPercent
              : profitability.settings.marginWarningPercent,
        },
      });

      void emitAppEvent({
        orgId: params.orgId,
        eventType,
        payload: {
          jobId: params.jobId,
          marginPercent,
          profitCents: profitability.profitCents,
          revenueCents: profitability.revenue.effectiveCents,
          costCents: profitability.costs.totalCents,
          thresholdPercent:
            profitability.status === 'critical'
              ? profitability.settings.marginCriticalPercent
              : profitability.settings.marginWarningPercent,
          status: profitability.status,
        },
        actorUserId: params.actorUserId ?? null,
      });
    }
  }

  const varianceThreshold = profitability.settings.varianceThresholdPercent;
  const costVariance = profitability.variance.costPercent;
  if (costVariance !== null && costVariance >= varianceThreshold) {
    const [lastVariance] = await db
      .select({ createdAt: jobActivityEvents.createdAt })
      .from(jobActivityEvents)
      .where(
        and(
          eq(jobActivityEvents.orgId, params.orgId),
          eq(jobActivityEvents.jobId, params.jobId),
          eq(jobActivityEvents.type, 'cost_variance_exceeded')
        )
      )
      .orderBy(desc(jobActivityEvents.createdAt))
      .limit(1);

    const shouldEmit =
      !lastVariance || nowDiffHours(lastVariance.createdAt, new Date()) >= 24;

    if (shouldEmit) {
      void createJobActivityEventBestEffort({
        orgId: params.orgId,
        jobId: params.jobId,
        type: 'cost_variance_exceeded',
        actorCrewMemberId: null,
        payload: {
          costVariancePercent: costVariance,
          costCents: profitability.costs.totalCents,
          estimatedCostCents: profitability.estimated.costCents,
          thresholdPercent: varianceThreshold,
        },
      });

      void emitAppEvent({
        orgId: params.orgId,
        eventType: 'job_cost_variance_exceeded',
        payload: {
          jobId: params.jobId,
          costVariancePercent: costVariance,
          costCents: profitability.costs.totalCents,
          estimatedCostCents: profitability.estimated.costCents,
          thresholdPercent: varianceThreshold,
        },
        actorUserId: params.actorUserId ?? null,
      });
    }
  }

  return ok(profitability);
}

export async function evaluateJobGuardrailsBestEffort(params: {
  orgId: string;
  jobId: string;
  actorUserId?: string | null;
}): Promise<void> {
  try {
    await evaluateJobGuardrails(params);
  } catch {
    // Guardrails are non-blocking; never fail primary flows.
  }
}

function nowDiffHours(a: Date, b: Date): number {
  const diff = Math.abs(b.getTime() - a.getTime());
  return diff / (60 * 60 * 1000);
}
