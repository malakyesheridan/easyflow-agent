import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobActivityEvents } from '@/db/schema/job_activity_events';
import { jobs } from '@/db/schema/jobs';
import { crewMembers } from '@/db/schema/crew_members';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { materials } from '@/db/schema/materials';
import { materialAlerts } from '@/db/schema/material_alerts';
import { ok, err, type Result } from '@/lib/result';
import { applyJobVisibility, type RequestActor } from '@/lib/authz';

export type DashboardActivityItem =
  | {
      id: string;
      type: 'job_scheduled';
      createdAt: Date;
      jobId: string;
      jobTitle: string;
      crewId: string | null;
      crewName: string | null;
      dateKey: string | null;
      subtitle: string;
      href: string;
    }
  | {
      id: string;
      type: 'job_completed';
      createdAt: Date;
      jobId: string;
      jobTitle: string;
      subtitle: string;
      href: string;
    }
  | {
      id: string;
      type: 'material_allocated';
      createdAt: Date;
      jobId: string;
      jobTitle: string;
      materialId: string;
      materialName: string;
      plannedQuantity: any;
      unit: string;
      subtitle: string;
      href: string;
    }
  | {
      id: string;
      type: 'stock_alert';
      createdAt: Date;
      materialId: string;
      materialName: string;
      message: string;
      subtitle: string;
      href: string;
    };

function isoDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function listDashboardActivity(params: {
  orgId: string;
  startDate: Date;
  endDate: Date;
  limit?: number;
  actor?: RequestActor;
}): Promise<Result<DashboardActivityItem[]>> {
  try {
    const db = getDb();
    const limit = Math.max(1, Math.min(200, params.limit ?? 50));
    const jobVisibility = params.actor ? applyJobVisibility(eq(jobs.orgId, params.orgId), params.actor, jobs) : null;

    const scheduledRows = await db
      .select({
        id: jobActivityEvents.id,
        createdAt: jobActivityEvents.createdAt,
        jobId: jobActivityEvents.jobId,
        jobTitle: jobs.title,
        crewId: sql<string | null>`(${jobActivityEvents.payload}->>'crewId')`,
        crewName: crewMembers.displayName,
        dateKey: sql<string | null>`(${jobActivityEvents.payload}->>'date')`,
      })
      .from(jobActivityEvents)
      .innerJoin(jobs, and(eq(jobs.id, jobActivityEvents.jobId), eq(jobs.orgId, jobActivityEvents.orgId)))
      .leftJoin(
        crewMembers,
        and(
          eq(crewMembers.orgId, jobActivityEvents.orgId),
          // payload->>'crewId' is TEXT; crewMembers.id is UUID. Compare as TEXT to avoid uuid=text operator error.
          eq(sql`${crewMembers.id}::text`, sql`${jobActivityEvents.payload}->>'crewId'`)
        )
      )
      .where(
        and(
          eq(jobActivityEvents.orgId, params.orgId),
          eq(jobActivityEvents.type, 'schedule_assignment_created'),
          sql`${jobActivityEvents.createdAt} >= ${params.startDate}`,
          sql`${jobActivityEvents.createdAt} < ${params.endDate}`,
          jobVisibility ?? sql`true`
        )
      )
      .orderBy(desc(jobActivityEvents.createdAt))
      .limit(limit);

    const completedRows = await db
      .select({
        id: jobs.id,
        createdAt: jobs.updatedAt,
        jobId: jobs.id,
        jobTitle: jobs.title,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.orgId, params.orgId),
          eq(jobs.status, 'completed'),
          sql`${jobs.updatedAt} >= ${params.startDate}`,
          sql`${jobs.updatedAt} < ${params.endDate}`,
          jobVisibility ?? sql`true`
        )
      )
      .orderBy(desc(jobs.updatedAt))
      .limit(limit);

    const allocationRows = await db
      .select({
        id: jobMaterialAllocations.id,
        createdAt: jobMaterialAllocations.createdAt,
        jobId: jobMaterialAllocations.jobId,
        jobTitle: jobs.title,
        materialId: jobMaterialAllocations.materialId,
        materialName: materials.name,
        plannedQuantity: jobMaterialAllocations.plannedQuantity,
        unit: materials.unit,
      })
      .from(jobMaterialAllocations)
      .innerJoin(jobs, and(eq(jobs.id, jobMaterialAllocations.jobId), eq(jobs.orgId, jobMaterialAllocations.orgId)))
      .innerJoin(
        materials,
        and(eq(materials.id, jobMaterialAllocations.materialId), eq(materials.orgId, jobMaterialAllocations.orgId))
      )
      .where(
        and(
          eq(jobMaterialAllocations.orgId, params.orgId),
          sql`${jobMaterialAllocations.createdAt} >= ${params.startDate}`,
          sql`${jobMaterialAllocations.createdAt} < ${params.endDate}`,
          jobVisibility ?? sql`true`
        )
      )
      .orderBy(desc(jobMaterialAllocations.createdAt))
      .limit(limit);

    const alertRows = await db
      .select({
        id: materialAlerts.id,
        createdAt: materialAlerts.createdAt,
        materialId: materialAlerts.materialId,
        materialName: materials.name,
        message: materialAlerts.message,
      })
      .from(materialAlerts)
      .innerJoin(materials, and(eq(materials.id, materialAlerts.materialId), eq(materials.orgId, materialAlerts.orgId)))
      .where(
        and(
          eq(materialAlerts.orgId, params.orgId),
          sql`${materialAlerts.createdAt} >= ${params.startDate}`,
          sql`${materialAlerts.createdAt} < ${params.endDate}`
        )
      )
      .orderBy(desc(materialAlerts.createdAt))
      .limit(limit);

    const scheduledItems: DashboardActivityItem[] = scheduledRows.map((r): DashboardActivityItem => {
      const d = r.dateKey ? new Date(String(r.dateKey)) : null;
      const dateStr = d ? isoDateKey(d) : null;
      const crewLabel = r.crewName
        ? String(r.crewName)
        : r.crewId
          ? `Crew ${String(r.crewId).slice(0, 8)}...`
          : 'Crew';
      return {
        id: String(r.id),
        type: 'job_scheduled',
        createdAt: r.createdAt as Date,
        jobId: String(r.jobId),
        jobTitle: String(r.jobTitle),
        crewId: r.crewId ? String(r.crewId) : null,
        crewName: r.crewName ? String(r.crewName) : null,
        dateKey: dateStr,
        subtitle: `${crewLabel}${dateStr ? ` • ${dateStr}` : ''}`,
        href: `/jobs/${String(r.jobId)}`,
      };
    });

    const completedItems: DashboardActivityItem[] = completedRows.map((r): DashboardActivityItem => ({
      id: `completed:${String(r.id)}`,
      type: 'job_completed',
      createdAt: r.createdAt as Date,
      jobId: String(r.jobId),
      jobTitle: String(r.jobTitle),
      subtitle: 'Job marked completed',
      href: `/jobs/${String(r.jobId)}`,
    }));

    const allocationItems: DashboardActivityItem[] = allocationRows.map((r): DashboardActivityItem => ({
      id: String(r.id),
      type: 'material_allocated',
      createdAt: r.createdAt as Date,
      jobId: String(r.jobId),
      jobTitle: String(r.jobTitle),
      materialId: String(r.materialId),
      materialName: String(r.materialName),
      plannedQuantity: r.plannedQuantity,
      unit: String(r.unit),
      subtitle: `Allocated ${String(r.materialName)}`,
      href: `/jobs/${String(r.jobId)}`,
    }));

    const alertItems: DashboardActivityItem[] = alertRows.map((r): DashboardActivityItem => ({
      id: String(r.id),
      type: 'stock_alert',
      createdAt: r.createdAt as Date,
      materialId: String(r.materialId),
      materialName: String(r.materialName),
      message: String(r.message),
      subtitle: 'Warehouse alert',
      href: `/warehouse/materials/${String(r.materialId)}`,
    }));

    const items: DashboardActivityItem[] = [...scheduledItems, ...completedItems, ...allocationItems, ...alertItems];
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return ok(items.slice(0, limit));
  } catch (error) {
    console.error('Error listing dashboard activity:', error);
    return err('INTERNAL_ERROR', 'Failed to list dashboard activity', error);
  }
}
