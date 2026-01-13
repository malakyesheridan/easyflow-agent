import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ok, err, type Result } from '@/lib/result';
import { crewMembers } from '@/db/schema/crew_members';
import { materials } from '@/db/schema/materials';
import { materialInventoryEvents, type NewMaterialInventoryEvent } from '@/db/schema/material_inventory_events';
import { materialUsageLogs } from '@/db/schema/material_usage_logs';
import { jobs } from '@/db/schema/jobs';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { tasks } from '@/db/schema/tasks';
import { jobPhotos } from '@/db/schema/job_photos';
import { jobReports } from '@/db/schema/job_reports';
import { jobHoursLogs } from '@/db/schema/job_hours_logs';
import { jobMaterialAllocations } from '@/db/schema/job_material_allocations';
import { jobTypes } from '@/db/schema/job_types';
import { toNumericString } from '@/lib/utils/quantity';
import { recomputeCrewInstallStatsForOrg } from '@/lib/mutations/crew_install_stats';

type DemoSeedResult = {
  demoSetId: string;
  crews: number;
  materials: number;
  jobs: number;
  assignments: number;
  tasks: number;
  materialAllocations: number;
  usageLogs: number;
  photos: number;
  reports: number;
  hoursLogs: number;
};

type DemoJobSeed = {
  title: string;
  status: 'unassigned' | 'scheduled' | 'in_progress' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  addressLine1: string;
  suburb: string;
  postcode: string;
  state?: string | null;
  notes?: string | null;
  assignment?: {
    crewIndex: number;
    offsetDays: number;
    startMinutes: number;
    endMinutes: number;
    status: 'scheduled' | 'in_progress' | 'completed';
  };
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(base: Date, offset: number) {
  const x = new Date(base);
  x.setDate(x.getDate() + offset);
  x.setHours(0, 0, 0, 0);
  return x;
}

function minutesToDate(baseDay: Date, minutesFromStart: number) {
  const x = new Date(baseDay);
  x.setHours(6, 0, 0, 0);
  x.setMinutes(x.getMinutes() + minutesFromStart);
  return x;
}

export async function seedDemoDataset(params: { orgId: string }): Promise<Result<DemoSeedResult>> {
  try {
    const db = getDb();
    const demoSetId = `demo-${Date.now()}-${randomBytes(2).toString('hex')}`;
    const createdBy = 'system-demo';

    const jobTypeRows = await db.select().from(jobTypes).where(eq(jobTypes.orgId, params.orgId));
    const jobTypeIds = jobTypeRows.map((row) => row.id);

    const now = new Date();
    const today = startOfDay(now);

    const crewSeeds = [
      { firstName: 'Jordan', lastName: 'Lee', role: 'Lead', dailyCapacityMinutes: 480 },
      { firstName: 'Avery', lastName: 'Patel', role: 'Technician', dailyCapacityMinutes: 420 },
      { firstName: 'Morgan', lastName: 'Chen', role: 'Coordinator', dailyCapacityMinutes: 360 },
    ];

    const materialSeeds = [
      { name: 'Fastener kit', unit: 'units', reorderThreshold: 40, startingStock: 180 },
      { name: 'Sealant tube', unit: 'units', reorderThreshold: 30, startingStock: 120 },
      { name: 'Surface panel', unit: 'm2', reorderThreshold: 25, startingStock: 260 },
      { name: 'Protective wrap', unit: 'm', reorderThreshold: 80, startingStock: 500 },
      { name: 'Mounting bracket', unit: 'units', reorderThreshold: 25, startingStock: 90 },
      { name: 'Adhesive mix', unit: 'kg', reorderThreshold: 15, startingStock: 60 },
    ];

    const addressSeeds = [
      { addressLine1: '12 River Rd', suburb: 'Central', postcode: '3000', state: 'VIC' },
      { addressLine1: '88 Park Ave', suburb: 'Northside', postcode: '3051', state: 'VIC' },
      { addressLine1: '5 Market Lane', suburb: 'Riverside', postcode: '3120', state: 'VIC' },
      { addressLine1: '24 Beacon St', suburb: 'Hillview', postcode: '3142', state: 'VIC' },
      { addressLine1: '63 Summit Dr', suburb: 'Lakeside', postcode: '3181', state: 'VIC' },
      { addressLine1: '19 Orchard Way', suburb: 'Westfield', postcode: '3205', state: 'VIC' },
      { addressLine1: '210 Coast Rd', suburb: 'Harbor', postcode: '3220', state: 'VIC' },
      { addressLine1: '7 Station St', suburb: 'Midtown', postcode: '3008', state: 'VIC' },
      { addressLine1: '51 Clover St', suburb: 'Eastgate', postcode: '3121', state: 'VIC' },
      { addressLine1: '90 Lantern Ct', suburb: 'Brighton', postcode: '3186', state: 'VIC' },
      { addressLine1: '3 Quarry Rd', suburb: 'Kingston', postcode: '3194', state: 'VIC' },
      { addressLine1: '16 Spruce Ave', suburb: 'Moorland', postcode: '3058', state: 'VIC' },
    ];

    const jobSeeds: DemoJobSeed[] = [
      {
        title: 'Site readiness check',
        status: 'unassigned',
        priority: 'normal',
        notes: 'Awaiting confirmation of access window.',
        ...addressSeeds[0],
      },
      {
        title: 'Scope walkthrough',
        status: 'unassigned',
        priority: 'low',
        notes: 'Prep questions for stakeholder handoff.',
        ...addressSeeds[1],
      },
      {
        title: 'Prep and staging',
        status: 'scheduled',
        priority: 'normal',
        assignment: { crewIndex: 0, offsetDays: 1, startMinutes: 60, endMinutes: 180, status: 'scheduled' },
        ...addressSeeds[2],
      },
      {
        title: 'Equipment setup',
        status: 'scheduled',
        priority: 'normal',
        assignment: { crewIndex: 1, offsetDays: 2, startMinutes: 120, endMinutes: 240, status: 'scheduled' },
        ...addressSeeds[3],
      },
      {
        title: 'Follow-up service',
        status: 'scheduled',
        priority: 'normal',
        assignment: { crewIndex: 2, offsetDays: 5, startMinutes: 180, endMinutes: 300, status: 'scheduled' },
        ...addressSeeds[4],
      },
      {
        title: 'On-site setup',
        status: 'scheduled',
        priority: 'high',
        assignment: { crewIndex: 0, offsetDays: 0, startMinutes: 225, endMinutes: 345, status: 'scheduled' },
        ...addressSeeds[5],
      },
      {
        title: 'Active rollout',
        status: 'in_progress',
        priority: 'high',
        assignment: { crewIndex: 0, offsetDays: 0, startMinutes: 60, endMinutes: 180, status: 'in_progress' },
        ...addressSeeds[6],
      },
      {
        title: 'Field maintenance',
        status: 'in_progress',
        priority: 'normal',
        assignment: { crewIndex: 1, offsetDays: 0, startMinutes: 150, endMinutes: 270, status: 'in_progress' },
        ...addressSeeds[7],
      },
      {
        title: 'Completed wrap-up',
        status: 'completed',
        priority: 'normal',
        assignment: { crewIndex: 0, offsetDays: -3, startMinutes: 90, endMinutes: 210, status: 'completed' },
        ...addressSeeds[8],
      },
      {
        title: 'Completed inspection',
        status: 'completed',
        priority: 'normal',
        assignment: { crewIndex: 1, offsetDays: -6, startMinutes: 120, endMinutes: 240, status: 'completed' },
        ...addressSeeds[9],
      },
      {
        title: 'Scheduled follow-up',
        status: 'scheduled',
        priority: 'normal',
        assignment: { crewIndex: 0, offsetDays: 7, startMinutes: 300, endMinutes: 420, status: 'scheduled' },
        ...addressSeeds[10],
      },
      {
        title: 'Future check',
        status: 'scheduled',
        priority: 'low',
        assignment: { crewIndex: 2, offsetDays: 12, startMinutes: 60, endMinutes: 180, status: 'scheduled' },
        ...addressSeeds[11],
      },
    ];

    const taskTemplates = [
      { title: 'Site review', description: 'Confirm scope, access, and safety requirements.', isRequired: true },
      { title: 'Execution', description: 'Complete the planned work steps on site.', isRequired: true },
      { title: 'Close out', description: 'Cleanup, handover, and documentation.', isRequired: false },
    ];

    const result = await db.transaction(async (tx) => {
      const crewRows = await tx
        .insert(crewMembers)
        .values(
          crewSeeds.map((seed) => ({
            orgId: params.orgId,
            firstName: seed.firstName,
            lastName: seed.lastName,
            displayName: `${seed.firstName} ${seed.lastName}`.trim(),
            role: seed.role,
            dailyCapacityMinutes: seed.dailyCapacityMinutes,
            defaultStartMinutes: 6 * 60,
            defaultEndMinutes: 18 * 60,
            active: true,
            isDemo: true,
            createdBy,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .returning();

      const materialRows = await tx
        .insert(materials)
        .values(
          materialSeeds.map((seed) => ({
            orgId: params.orgId,
            name: `${seed.name} (${demoSetId})`,
            unit: seed.unit,
            reorderThreshold: toNumericString(seed.reorderThreshold) as any,
            description: 'Demo inventory item.',
            isDemo: true,
            createdBy,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .returning();

      const stockEvents: NewMaterialInventoryEvent[] = materialRows.map((material, index) => ({
        orgId: params.orgId,
        materialId: material.id,
        eventType: 'stock_added',
        quantity: toNumericString(materialSeeds[index]?.startingStock ?? 100) as any,
        reason: 'Initial demo stock',
        jobId: null,
        usageLogId: null,
        actorCrewMemberId: null,
        isDemo: true,
        createdBy,
        createdAt: addDays(today, -10),
      }));

      await tx.insert(materialInventoryEvents).values(stockEvents);

      const jobRows = await tx
        .insert(jobs)
        .values(
          jobSeeds.map((seed, index) => {
            const jobTypeId = jobTypeIds.length > 0 ? jobTypeIds[index % jobTypeIds.length] : null;
            const assignmentDate = seed.assignment ? addDays(today, seed.assignment.offsetDays) : today;
            const scheduledStart = seed.assignment
              ? minutesToDate(assignmentDate, seed.assignment.startMinutes)
              : null;
            const scheduledEnd = seed.assignment
              ? minutesToDate(assignmentDate, seed.assignment.endMinutes)
              : null;
            const updatedAt =
              seed.status === 'completed'
                ? minutesToDate(assignmentDate, seed.assignment?.endMinutes ?? 240)
                : now;
            const createdAt =
              seed.status === 'completed'
                ? minutesToDate(assignmentDate, seed.assignment?.startMinutes ?? 60)
                : now;
            const progressStatus: 'not_started' | 'in_progress' | 'completed' =
              seed.status === 'completed' ? 'completed' : seed.status === 'in_progress' ? 'in_progress' : 'not_started';

            return {
              orgId: params.orgId,
              title: `${seed.title} (${demoSetId})`,
              jobTypeId,
              status: seed.status,
              progressStatus,
              priority: seed.priority,
              crewId: seed.assignment ? crewRows[seed.assignment.crewIndex]?.id ?? null : null,
              addressLine1: seed.addressLine1,
              suburb: seed.suburb,
              postcode: seed.postcode,
              state: seed.state ?? null,
              notes: seed.notes ?? null,
              scheduledStart,
              scheduledEnd,
              isDemo: true,
              createdBy,
              createdAt,
              updatedAt,
            };
          })
        )
        .returning();

      const assignmentRows = jobSeeds
        .map((seed, index) => {
          if (!seed.assignment) return null;
          const date = addDays(today, seed.assignment.offsetDays);
          return {
            orgId: params.orgId,
            jobId: jobRows[index]?.id,
            crewId: crewRows[seed.assignment.crewIndex]?.id,
            date,
            startMinutes: seed.assignment.startMinutes,
            endMinutes: seed.assignment.endMinutes,
            assignmentType: jobRows[index]?.jobTypeId ?? 'default',
            status: seed.assignment.status,
            isDemo: true,
            createdBy,
            createdAt: minutesToDate(date, seed.assignment.startMinutes),
            updatedAt: minutesToDate(date, seed.assignment.endMinutes),
          };
        })
        .filter(Boolean) as Array<typeof scheduleAssignments.$inferInsert>;

      if (assignmentRows.length > 0) {
        await tx.insert(scheduleAssignments).values(assignmentRows);
      }

      const taskRows = jobRows.flatMap((job, index) => {
        const seed = jobSeeds[index];
        const assignmentDate = seed?.assignment ? addDays(today, seed.assignment.offsetDays) : today;
        return taskTemplates.map((template, order) => {
          let status: 'pending' | 'in_progress' | 'completed' | 'skipped' = 'pending';
          let completedAt: Date | null = null;
          let completedBy: string | null = null;
          if (seed?.status === 'completed') {
            status = 'completed';
            completedAt = minutesToDate(assignmentDate, (seed.assignment?.endMinutes ?? 240) + 15);
            completedBy = seed.assignment ? crewRows[seed.assignment.crewIndex]?.id ?? null : null;
          } else if (seed?.status === 'in_progress') {
            if (order === 0) {
              status = 'completed';
              completedAt = minutesToDate(assignmentDate, (seed.assignment?.startMinutes ?? 60) + 45);
              completedBy = seed.assignment ? crewRows[seed.assignment.crewIndex]?.id ?? null : null;
            } else if (order === 1) {
              status = 'in_progress';
            }
          }

          return {
            orgId: params.orgId,
            jobId: job.id,
            title: template.title,
            description: template.description,
            status,
            order,
            isRequired: template.isRequired,
            completedAt,
            completedBy,
            isDemo: true,
            createdBy,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
          };
        });
      });

      if (taskRows.length > 0) {
        await tx.insert(tasks).values(taskRows);
      }

      const allocationRows = jobRows.flatMap((job, index) => {
        const seed = jobSeeds[index];
        if (!seed?.assignment) return [];
        const material = materialRows[index % materialRows.length];
        return [
          {
            orgId: params.orgId,
            jobId: job.id,
            materialId: material.id,
            plannedQuantity: toNumericString(5 + index * 2) as any,
            notes: 'Planned for demo run.',
            isDemo: true,
            createdBy,
            createdAt: addDays(today, -1),
            updatedAt: addDays(today, -1),
          },
        ];
      });

      if (allocationRows.length > 0) {
        await tx.insert(jobMaterialAllocations).values(allocationRows);
      }

      const completedJobs = jobRows.filter((job) => job.status === 'completed');
      const hoursRows = completedJobs.map((job, index) => ({
        orgId: params.orgId,
        jobId: job.id,
        crewMemberId: job.crewId,
        minutes: 180 + index * 30,
        note: 'Demo hours logged.',
        isDemo: true,
        createdBy,
        createdAt: job.updatedAt,
      }));

      if (hoursRows.length > 0) {
        await tx.insert(jobHoursLogs).values(hoursRows);
      }

      const m2Material = materialRows.find((m) => m.unit.toLowerCase() === 'm2') ?? materialRows[0];
      const usageRows = completedJobs.flatMap((job, index) => {
        const primary = {
          orgId: params.orgId,
          jobId: job.id,
          materialId: m2Material.id,
          taskId: null,
          quantityUsed: toNumericString(12 + index * 4) as any,
          notes: 'Demo usage (area).',
          loggedByCrewMemberId: job.crewId ?? null,
          isDemo: true,
          createdBy,
          createdAt: job.updatedAt,
        };
        const secondaryMaterial = materialRows[(index + 1) % materialRows.length];
        const secondary = {
          orgId: params.orgId,
          jobId: job.id,
          materialId: secondaryMaterial.id,
          taskId: null,
          quantityUsed: toNumericString(6 + index * 2) as any,
          notes: 'Demo usage (components).',
          loggedByCrewMemberId: job.crewId ?? null,
          isDemo: true,
          createdBy,
          createdAt: job.updatedAt,
        };
        return [primary, secondary];
      });

      let usageInserted: typeof materialUsageLogs.$inferSelect[] = [];
      if (usageRows.length > 0) {
        usageInserted = await tx.insert(materialUsageLogs).values(usageRows).returning();
      }

      if (usageInserted.length > 0) {
        const usageEvents: NewMaterialInventoryEvent[] = usageInserted.map((row) => ({
          orgId: params.orgId,
          materialId: row.materialId,
          eventType: 'job_consumed',
          quantity: toNumericString(-Number(row.quantityUsed ?? 0)) as any,
          reason: 'Consumed by demo job',
          jobId: row.jobId,
          usageLogId: row.id,
          actorCrewMemberId: row.loggedByCrewMemberId ?? null,
          isDemo: true,
          createdBy,
          createdAt: row.createdAt,
        }));
        await tx.insert(materialInventoryEvents).values(usageEvents);
      }

      const reportRows = completedJobs.slice(0, 2).map((job, index) => ({
        orgId: params.orgId,
        jobId: job.id,
        note: index === 0 ? 'All tasks completed and handed over.' : 'Quality check complete, client notified.',
        createdByCrewMemberId: job.crewId ?? null,
        isDemo: true,
        createdBy,
        createdAt: job.updatedAt,
      }));

      if (reportRows.length > 0) {
        await tx.insert(jobReports).values(reportRows);
      }

      const photoTargets = jobRows.slice(0, 3);
      const photoRows = photoTargets.map((job, index) => ({
        orgId: params.orgId,
        jobId: job.id,
        storagePath: '/demo/demo-photo.svg',
        originalFileName: `demo-photo-${index + 1}.svg`,
        mimeType: 'image/svg+xml',
        bytes: null,
        annotationJson: {
          notes: [
            { id: `note-${demoSetId}-${index}`, x: 0.32, y: 0.4, text: 'Demo note: verify access.' },
            { id: `note-${demoSetId}-${index}-b`, x: 0.62, y: 0.55, text: 'Demo note: confirm materials.' },
          ],
        },
        createdByCrewMemberId: job.crewId ?? null,
        isDemo: true,
        createdBy,
        createdAt: job.createdAt,
      }));

      if (photoRows.length > 0) {
        await tx.insert(jobPhotos).values(photoRows);
      }

      return {
        demoSetId,
        crews: crewRows.length,
        materials: materialRows.length,
        jobs: jobRows.length,
        assignments: assignmentRows.length,
        tasks: taskRows.length,
        materialAllocations: allocationRows.length,
        usageLogs: usageInserted.length,
        photos: photoRows.length,
        reports: reportRows.length,
        hoursLogs: hoursRows.length,
      } as DemoSeedResult;
    });

    await recomputeCrewInstallStatsForOrg({ orgId: params.orgId });
    return ok(result);
  } catch (error) {
    console.error('Error seeding demo dataset:', error);
    return err('INTERNAL_ERROR', 'Failed to seed demo dataset', error);
  }
}
