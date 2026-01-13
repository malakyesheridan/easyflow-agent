import { randomUUID } from 'crypto';
import { like } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { hashPassword } from '@/lib/auth/passwords';
import { orgs } from '@/db/schema/orgs';
import { orgRoles } from '@/db/schema/org_roles';
import { orgMemberships } from '@/db/schema/org_memberships';
import { orgSettings } from '@/db/schema/org_settings';
import { users } from '@/db/schema/users';
import { crewMembers } from '@/db/schema/crew_members';
import { jobs } from '@/db/schema/jobs';
import { jobTypes } from '@/db/schema/job_types';
import { scheduleAssignments } from '@/db/schema/schedule_assignments';
import { jobActivityEvents } from '@/db/schema/job_activity_events';

const ORG_COUNT = 5;
const CREW_TOTAL = 200;
const JOB_TOTAL = 10_000;
const JOB_EVENT_TOTAL = 50_000;
const SCHEDULE_DAYS = 30;

const DEFAULT_PASSWORD = 'ChangeMe123!';
const SEED_SLUG_PREFIX = 'seed-org';

const JOB_ACTIVITY_TYPES = [
  'schedule_assignment_created',
  'task_completed',
  'task_reopened',
  'photo_uploaded',
  'photo_deleted',
  'contact_created',
  'contact_updated',
  'note_added',
  'document_uploaded',
  'order_created',
  'order_updated',
  'hours_logged',
  'report_added',
] as const;

const DEFAULT_ROLES = [
  {
    key: 'admin',
    name: 'Admin',
    capabilities: [
      'admin',
      'manage_org',
      'manage_roles',
      'manage_templates',
      'manage_announcements',
      'manage_staff',
      'manage_schedule',
      'manage_jobs',
    ],
    isDefault: false,
  },
  {
    key: 'manager',
    name: 'Manager',
    capabilities: ['manage_templates', 'manage_announcements', 'manage_staff', 'manage_schedule', 'manage_jobs'],
    isDefault: false,
  },
  {
    key: 'staff',
    name: 'Staff',
    capabilities: ['view_schedule', 'view_jobs', 'update_jobs'],
    isDefault: true,
  },
];

const JOB_TYPE_DEFS = [
  { key: 'install', label: 'Install', color: '#f59e0b', duration: 120 },
  { key: 'measure', label: 'Measure', color: '#60a5fa', duration: 60 },
  { key: 'defect', label: 'Defect', color: '#f87171', duration: 90 },
];

type OrgSeed = {
  id: string;
  slug: string;
  name: string;
  adminRoleId: string;
  jobTypeIds: string[];
  crewIds: string[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

async function seedScale() {
  const db = getDb();
  const args = new Set(process.argv.slice(2));
  const force = args.has('--force');

  const existing = await db.select({ id: orgs.id }).from(orgs).where(like(orgs.slug, `${SEED_SLUG_PREFIX}%`)).limit(1);
  if (existing.length > 0 && !force) {
    console.log('Seed data already exists. Use --force to run anyway.');
    return;
  }

  console.log('Starting scale seed...');
  const orgSeeds: OrgSeed[] = [];
  const passwordHash = hashPassword(DEFAULT_PASSWORD);

  for (let i = 1; i <= ORG_COUNT; i += 1) {
    const orgId = randomUUID();
    const slug = `${SEED_SLUG_PREFIX}-${i}`;
    const name = `Seed Org ${i}`;
    const adminRoleId = randomUUID();

    orgSeeds.push({ id: orgId, slug, name, adminRoleId, jobTypeIds: [], crewIds: [] });
  }

  await db.insert(orgs).values(
    orgSeeds.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      onboardingCompleted: true,
      onboardingStep: 6,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );

  await db.insert(orgSettings).values(
    orgSeeds.map((org) => ({
      orgId: org.id,
      companyName: org.name,
      timezone: 'UTC',
      defaultWorkdayStartMinutes: 6 * 60,
      defaultWorkdayEndMinutes: 18 * 60,
      defaultDailyCapacityMinutes: 8 * 60,
      defaultJobDurationMinutes: 120,
      defaultTravelBufferMinutes: 30,
      travelBufferEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );

  const roleRows = orgSeeds.flatMap((org) =>
    DEFAULT_ROLES.map((role) => ({
      id: role.key === 'admin' ? org.adminRoleId : randomUUID(),
      orgId: org.id,
      key: role.key,
      name: role.name,
      capabilities: JSON.stringify(role.capabilities),
      isDefault: role.isDefault,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
  await db.insert(orgRoles).values(roleRows);

  const userRows = orgSeeds.map((org, idx) => ({
    id: randomUUID(),
    email: `seed-admin-${idx + 1}@example.com`,
    name: `Seed Admin ${idx + 1}`,
    passwordHash,
    status: 'active' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await db.insert(users).values(userRows);

  await db.insert(orgMemberships).values(
    orgSeeds.map((org, idx) => ({
      id: randomUUID(),
      orgId: org.id,
      userId: userRows[idx].id,
      roleId: org.adminRoleId,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );

  const jobTypeRows = orgSeeds.flatMap((org) =>
    JOB_TYPE_DEFS.map((def) => {
      const id = randomUUID();
      org.jobTypeIds.push(id);
      return {
        id,
        orgId: org.id,
        key: def.key,
        label: def.label,
        color: def.color,
        defaultDurationMinutes: def.duration,
        isDefault: def.key === 'install',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    })
  );
  await db.insert(jobTypes).values(jobTypeRows);

  const crewPerOrg = Math.floor(CREW_TOTAL / ORG_COUNT);
  const crewRows = orgSeeds.flatMap((org) => {
    const rows = [];
    for (let i = 0; i < crewPerOrg; i += 1) {
      const id = randomUUID();
      org.crewIds.push(id);
      const firstName = `Crew${i + 1}`;
      const lastName = `Org${org.slug.split('-').pop()}`;
      rows.push({
        id,
        orgId: org.id,
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`,
        role: 'staff',
        email: `crew-${org.slug}-${i + 1}@example.com`,
        phone: `0400${String(i).padStart(6, '0')}`,
        skills: 'install,measure',
        active: true,
        defaultStartMinutes: 6 * 60,
        defaultEndMinutes: 18 * 60,
        dailyCapacityMinutes: 8 * 60,
        isDemo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return rows;
  });
  for (const batch of chunk(crewRows, 500)) {
    await db.insert(crewMembers).values(batch);
  }

  const jobsPerOrg = Math.floor(JOB_TOTAL / ORG_COUNT);
  const jobRows = orgSeeds.flatMap((org) => {
    const rows = [];
    for (let i = 0; i < jobsPerOrg; i += 1) {
      const id = randomUUID();
      const crewId = pick(org.crewIds);
      const jobTypeId = pick(org.jobTypeIds);
      const scheduledOffset = Math.floor(Math.random() * SCHEDULE_DAYS);
      const scheduledDate = new Date();
      scheduledDate.setUTCDate(scheduledDate.getUTCDate() + scheduledOffset);
      scheduledDate.setUTCHours(0, 0, 0, 0);

      rows.push({
        id,
        orgId: org.id,
        title: `Job ${i + 1} (${org.name})`,
        jobTypeId,
        status: 'scheduled' as const,
        priority: 'normal' as const,
        progressStatus: 'not_started' as const,
        crewId,
        addressLine1: `${100 + i} Market Street`,
        suburb: 'Sydney',
        state: 'NSW',
        postcode: '2000',
        country: 'AU',
        scheduledStart: new Date(scheduledDate.getTime() + 8 * 60 * 60 * 1000),
        scheduledEnd: new Date(scheduledDate.getTime() + 10 * 60 * 60 * 1000),
        isDemo: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return rows;
  });
  for (const batch of chunk(jobRows, 500)) {
    await db.insert(jobs).values(batch);
  }

  const assignmentRows = jobRows.map((job) => {
    const jobOrg = orgSeeds.find((org) => org.id === job.orgId)!;
    const dayOffset = Math.floor(Math.random() * SCHEDULE_DAYS);
    const baseDate = new Date();
    baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);
    baseDate.setUTCHours(0, 0, 0, 0);
    const startMinutes = 60 * (7 + Math.floor(Math.random() * 6));
    const duration = 60 + Math.floor(Math.random() * 180);
    return {
      id: randomUUID(),
      orgId: jobOrg.id,
      jobId: job.id,
      crewId: job.crewId || pick(jobOrg.crewIds),
      date: baseDate,
      startMinutes,
      endMinutes: startMinutes + duration,
      assignmentType: 'install',
      status: 'scheduled' as const,
      isDemo: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });
  for (const batch of chunk(assignmentRows, 500)) {
    await db.insert(scheduleAssignments).values(batch);
  }

  const jobEventRows = [];
  for (let i = 0; i < JOB_EVENT_TOTAL; i += 1) {
    const job = pick(jobRows);
    const orgId = job.orgId;
    const type = pick(JOB_ACTIVITY_TYPES);
    const createdAt = new Date(Date.now() - Math.floor(Math.random() * SCHEDULE_DAYS) * 24 * 60 * 60 * 1000);
    jobEventRows.push({
      id: randomUUID(),
      orgId,
      jobId: job.id,
      type,
      actorCrewMemberId: job.crewId,
      payload: { seed: true, type },
      createdAt,
    });
  }
  for (const batch of chunk(jobEventRows, 1000)) {
    await db.insert(jobActivityEvents).values(batch);
  }

  console.log('Scale seed completed.');
  console.log(`Org count: ${ORG_COUNT}`);
  console.log(`Crew members: ${crewRows.length}`);
  console.log(`Jobs: ${jobRows.length}`);
  console.log(`Job events: ${jobEventRows.length}`);
  console.log(`Schedule assignments: ${assignmentRows.length}`);
  console.log(`Admin password: ${DEFAULT_PASSWORD}`);
}

seedScale()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Scale seed failed:', error);
    process.exit(1);
  });
