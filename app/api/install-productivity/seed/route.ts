import { desc, eq } from 'drizzle-orm';
import { withRoute } from '@/lib/api/withRoute';
import { err, ok } from '@/lib/result';
import { requireOrgContext } from '@/lib/auth/require';
import { canManageOrgSettings } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { crewMembers } from '@/db/schema/crew_members';
import { jobs } from '@/db/schema/jobs';
import { jobHoursLogs, type NewJobHoursLog } from '@/db/schema/job_hours_logs';
import { getJobM2Totals } from '@/lib/queries/install_time';
import { updateJobProductivity } from '@/lib/mutations/job_productivity';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';
import { toNumber } from '@/lib/utils/quantity';

const WAITING_REASONS = [
  'ACCESS_KEYS_NOT_READY',
  'DELIVERY_LATE_OR_WRONG',
  'WEATHER',
  'EQUIPMENT_LIFT_CRANE_WAIT',
  'SAFETY_PERMIT_INDUCTION',
  'CLIENT_CHANGE_SCOPE',
  'REWORK_DEFECT_FIX',
] as const;

function randInt(min: number, max: number): number {
  const range = max - min + 1;
  return min + Math.floor(Math.random() * range);
}

function addMinutes(date: Date, minutes: number): Date {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}

function buildTimeEntries(params: {
  orgId: string;
  jobId: string;
  crewMemberId: string;
  baseStart: Date;
}): NewJobHoursLog[] {
  const now = new Date();
  const seedNote = 'Seeded install productivity v2';
  const entries: NewJobHoursLog[] = [];
  let cursor = new Date(params.baseStart);

  const addEntry = (bucket: NewJobHoursLog['bucket'], minutes: number, delayReason?: NewJobHoursLog['delayReason']) => {
    const start = new Date(cursor);
    const end = addMinutes(start, minutes);
    entries.push({
      orgId: params.orgId,
      jobId: params.jobId,
      crewMemberId: params.crewMemberId,
      minutes,
      startTime: start,
      endTime: end,
      bucket,
      delayReason: delayReason ?? null,
      note: seedNote,
      isDemo: true,
      createdBy: 'seed:install-productivity-v2',
      createdAt: end,
    } as any);
    cursor = end;
  };

  addEntry('SETUP', randInt(15, 30));
  addEntry('INSTALL', randInt(75, 180));
  addEntry('WAITING', randInt(5, 20), WAITING_REASONS[randInt(0, WAITING_REASONS.length - 1)]);
  if (Math.random() < 0.35) {
    addEntry('REWORK', randInt(5, 25));
  }
  addEntry('PACKDOWN', randInt(10, 20));
  addEntry('ADMIN', randInt(5, 15));

  for (const entry of entries) {
    entry.createdAt = entry.createdAt ?? now;
  }

  return entries;
}

/**
 * POST /api/install-productivity/seed
 * Body: { orgId }
 */
export const POST = withRoute(async (req: Request) => {
  const body = await req.json();
  const orgId = body?.orgId ? String(body.orgId) : null;
  const context = await requireOrgContext(req, orgId);
  if (!context.ok) return context;
  if (!canManageOrgSettings(context.data.actor)) return err('FORBIDDEN', 'Insufficient permissions');

  const db = getDb();
  const crewRows = await db
    .select({ id: crewMembers.id })
    .from(crewMembers)
    .where(eq(crewMembers.orgId, context.data.orgId));

  if (crewRows.length === 0) {
    return ok({ crewCount: 0, jobCount: 0, timeEntriesCreated: 0, jobsUpdated: 0 });
  }

  const jobRows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.orgId, context.data.orgId))
    .orderBy(desc(jobs.updatedAt))
    .limit(20);

  if (jobRows.length === 0) {
    return ok({ crewCount: crewRows.length, jobCount: 0, timeEntriesCreated: 0, jobsUpdated: 0 });
  }

  const demoJobs = jobRows.filter((job) => job.isDemo);
  const completedJobs = jobRows.filter((job) => job.status === 'completed');
  const candidateJobs = demoJobs.length > 0 ? demoJobs : completedJobs.length > 0 ? completedJobs : jobRows;

  const now = new Date();
  const entries: NewJobHoursLog[] = [];
  const jobsUsed = new Map<string, typeof jobRows[number]>();

  crewRows.forEach((crew, index) => {
    const jobsPerCrew = Math.min(2, candidateJobs.length);
    for (let offset = 0; offset < jobsPerCrew; offset += 1) {
      const job = candidateJobs[(index + offset) % candidateJobs.length];
      const baseStart = new Date(now);
      baseStart.setDate(baseStart.getDate() - randInt(1, 30));
      baseStart.setHours(8, 0, 0, 0);
      entries.push(
        ...buildTimeEntries({
          orgId: context.data.orgId,
          jobId: job.id,
          crewMemberId: crew.id,
          baseStart,
        })
      );
      jobsUsed.set(job.id, job);
    }
  });

  if (entries.length > 0) {
    await db.insert(jobHoursLogs).values(entries as any);
  }

  let jobsUpdated = 0;
  for (const job of jobsUsed.values()) {
    const plannedM2 = job.plannedM2;
    const claimedM2 = job.claimedM2;
    const acceptedM2 = job.acceptedM2;
    const needsOutputSeed = acceptedM2 === null || acceptedM2 === undefined || claimedM2 === null || claimedM2 === undefined;

    const updates: Record<string, unknown> = {};
    if (needsOutputSeed) {
      const totalsResult = await getJobM2Totals({ orgId: context.data.orgId, jobId: job.id });
      const totals = totalsResult.ok ? totalsResult.data : { plannedM2: 0, usedM2: 0 };
      const baseM2 = totals.plannedM2 > 0 ? totals.plannedM2 : totals.usedM2 > 0 ? totals.usedM2 : randInt(8, 18);
      const variationM2 = randInt(-1, 3);
      const claimed = baseM2 + variationM2 + Math.random();
      const accepted = Math.max(0, claimed - Math.random());
      const rework = Math.random() < 0.4 ? Math.max(0, Math.min(1.5, accepted * 0.1)) : 0;

      if (job.plannedM2 === null || job.plannedM2 === undefined) updates.plannedM2 = baseM2;
      if (job.variationM2 === null || job.variationM2 === undefined) updates.variationM2 = variationM2;
      if (job.claimedM2 === null || job.claimedM2 === undefined) updates.claimedM2 = claimed;
      if (job.acceptedM2 === null || job.acceptedM2 === undefined) updates.acceptedM2 = accepted;
      if (job.reworkM2 === null || job.reworkM2 === undefined) updates.reworkM2 = rework;
    }

    const complexityValues = [
      job.complexityAccessDifficulty,
      job.complexityHeightLiftRequirement,
      job.complexityPanelHandlingSize,
      job.complexitySiteConstraints,
      job.complexityDetailingComplexity,
    ];
    const hasComplexity = complexityValues.some((value) => value !== null && value !== undefined);
    if (!hasComplexity) {
      updates.complexityAccessDifficulty = randInt(2, 4);
      updates.complexityHeightLiftRequirement = randInt(2, 4);
      updates.complexityPanelHandlingSize = randInt(2, 4);
      updates.complexitySiteConstraints = randInt(2, 4);
      updates.complexityDetailingComplexity = randInt(2, 4);
    }

    const defectCount = toNumber(job.qualityDefectCount);
    const hasQuality =
      defectCount > 0 ||
      job.qualityCallbackFlag ||
      job.qualityMissingDocsFlag ||
      job.qualitySafetyFlag;
    if (!hasQuality) {
      updates.qualityDefectCount = randInt(0, 2);
      updates.qualityCallbackFlag = Math.random() < 0.1;
      updates.qualityMissingDocsFlag = Math.random() < 0.05;
      updates.qualitySafetyFlag = Math.random() < 0.03;
    }

    const updateKeys = Object.keys(updates);
    if (updateKeys.length > 0) {
      await updateJobProductivity({
        orgId: context.data.orgId,
        jobId: job.id,
        ...updates,
        approvedByUserId: context.data.actor.userId,
      } as any);
      jobsUpdated += 1;
    }
  }

  void recomputeCrewInstallStatsForOrg({ orgId: context.data.orgId });

  return ok({
    crewCount: crewRows.length,
    jobCount: jobsUsed.size,
    timeEntriesCreated: entries.length,
    jobsUpdated,
  });
});
