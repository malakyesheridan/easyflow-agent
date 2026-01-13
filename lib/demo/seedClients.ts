import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { ok, err, type Result } from '@/lib/result';
import { orgClients } from '@/db/schema/org_clients';
import { jobs } from '@/db/schema/jobs';
import { jobTypes } from '@/db/schema/job_types';
import { jobInvoices } from '@/db/schema/job_invoices';
import { jobPayments } from '@/db/schema/job_payments';

type DemoClientSeedResult = {
  demoSetId: string;
  clients: number;
  jobs: number;
  invoices: number;
  payments: number;
};

type ClientSeed = {
  displayName: string;
  legalName?: string | null;
  emailPrefix: string;
  phonePrefix: string;
};

type JobSeed = {
  clientIndex: number;
  title: string;
  status: 'unassigned' | 'scheduled' | 'in_progress' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  offsetDays: number;
  startMinutes: number;
  endMinutes: number;
  onTime?: boolean;
  invoiceTotalCents?: number;
  paidCents?: number;
  addressLine1: string;
  suburb: string;
  postcode: string;
  state?: string | null;
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

function buildEmail(prefix: string, demoSetId: string) {
  return `${prefix}-${demoSetId}@demo.easyflow.local`;
}

function buildPhone(prefix: string, index: number) {
  const suffix = String(1000 + index).padStart(4, '0');
  return `${prefix}${suffix}`;
}

export async function seedDemoClients(params: { orgId: string }): Promise<Result<DemoClientSeedResult>> {
  try {
    const db = getDb();
    const demoSetId = `demo-${Date.now()}-${randomBytes(2).toString('hex')}`;
    const createdBy = 'system-demo';

    const now = new Date();
    const today = startOfDay(now);

    const clientSeeds: ClientSeed[] = [
      { displayName: 'Summit Retail Group', legalName: 'Summit Retail Group Pty Ltd', emailPrefix: 'summit', phonePrefix: '0400' },
      { displayName: 'Harbor Logistics', legalName: 'Harbor Logistics AU', emailPrefix: 'harbor', phonePrefix: '0411' },
      { displayName: 'Northside Apartments', legalName: 'Northside Apartments Holdings', emailPrefix: 'northside', phonePrefix: '0422' },
    ];

    const addressSeeds = [
      { addressLine1: '12 River Rd', suburb: 'Central', postcode: '3000', state: 'VIC' },
      { addressLine1: '88 Park Ave', suburb: 'Northside', postcode: '3051', state: 'VIC' },
      { addressLine1: '5 Market Lane', suburb: 'Riverside', postcode: '3120', state: 'VIC' },
      { addressLine1: '24 Beacon St', suburb: 'Hillview', postcode: '3142', state: 'VIC' },
      { addressLine1: '63 Summit Dr', suburb: 'Lakeside', postcode: '3181', state: 'VIC' },
      { addressLine1: '19 Orchard Way', suburb: 'Westfield', postcode: '3205', state: 'VIC' },
      { addressLine1: '210 Coast Rd', suburb: 'Harbor', postcode: '3220', state: 'VIC' },
    ];

    const jobSeeds: JobSeed[] = [
      {
        clientIndex: 0,
        title: 'Storefront refresh',
        status: 'completed',
        priority: 'normal',
        offsetDays: -45,
        startMinutes: 120,
        endMinutes: 360,
        onTime: true,
        invoiceTotalCents: 185000,
        paidCents: 185000,
        ...addressSeeds[0],
      },
      {
        clientIndex: 0,
        title: 'Lighting upgrade',
        status: 'completed',
        priority: 'high',
        offsetDays: -18,
        startMinutes: 90,
        endMinutes: 300,
        onTime: false,
        invoiceTotalCents: 98000,
        paidCents: 48000,
        ...addressSeeds[1],
      },
      {
        clientIndex: 0,
        title: 'Seasonal fitout',
        status: 'in_progress',
        priority: 'high',
        offsetDays: 0,
        startMinutes: 180,
        endMinutes: 360,
        invoiceTotalCents: 142000,
        paidCents: 0,
        ...addressSeeds[2],
      },
      {
        clientIndex: 1,
        title: 'Warehouse safety audit',
        status: 'completed',
        priority: 'normal',
        offsetDays: -12,
        startMinutes: 150,
        endMinutes: 330,
        onTime: true,
        invoiceTotalCents: 76000,
        paidCents: 76000,
        ...addressSeeds[3],
      },
      {
        clientIndex: 1,
        title: 'Dock bay repairs',
        status: 'scheduled',
        priority: 'normal',
        offsetDays: 7,
        startMinutes: 240,
        endMinutes: 420,
        invoiceTotalCents: 54000,
        paidCents: 0,
        ...addressSeeds[4],
      },
      {
        clientIndex: 2,
        title: 'Lobby renovations',
        status: 'scheduled',
        priority: 'normal',
        offsetDays: 14,
        startMinutes: 180,
        endMinutes: 420,
        invoiceTotalCents: 210000,
        paidCents: 0,
        ...addressSeeds[5],
      },
      {
        clientIndex: 2,
        title: 'Elevator signage',
        status: 'unassigned',
        priority: 'low',
        offsetDays: 4,
        startMinutes: 120,
        endMinutes: 240,
        invoiceTotalCents: 42000,
        paidCents: 0,
        ...addressSeeds[6],
      },
    ];

    const jobTypeRows = await db.select().from(jobTypes).where(eq(jobTypes.orgId, params.orgId));
    const jobTypeIds = jobTypeRows.map((row) => row.id);

    const result = await db.transaction(async (tx) => {
      const clientRows = await tx
        .insert(orgClients)
        .values(
          clientSeeds.map((seed, index) => ({
            orgId: params.orgId,
            displayName: `${seed.displayName} (${demoSetId})`,
            legalName: seed.legalName ?? null,
            email: buildEmail(seed.emailPrefix, demoSetId),
            phone: buildPhone(seed.phonePrefix, index),
            notes: 'Demo client record for UI testing.',
            tags: ['demo'],
            normalizedEmail: buildEmail(seed.emailPrefix, demoSetId).toLowerCase(),
            normalizedPhone: buildPhone(seed.phonePrefix, index).replace(/\D/g, ''),
            createdAt: now,
            updatedAt: now,
          }))
        )
        .returning();

      const jobRows = await tx
        .insert(jobs)
        .values(
          jobSeeds.map((seed, index) => {
            const baseDay = addDays(today, seed.offsetDays);
            const scheduledStart = minutesToDate(baseDay, seed.startMinutes);
            const scheduledEnd = minutesToDate(baseDay, seed.endMinutes);
            const createdAt = new Date(scheduledStart.getTime() - 2 * 60 * 60 * 1000);
            const updatedAt =
              seed.status === 'completed'
                ? new Date(scheduledEnd.getTime() + (seed.onTime ? -10 : 30) * 60 * 1000)
                : now;
            const progressStatus: 'not_started' | 'in_progress' | 'completed' =
              seed.status === 'completed'
                ? 'completed'
                : seed.status === 'in_progress'
                  ? 'in_progress'
                  : 'not_started';
            const jobTypeId = jobTypeIds.length > 0 ? jobTypeIds[index % jobTypeIds.length] : null;

            return {
              orgId: params.orgId,
              clientId: clientRows[seed.clientIndex]?.id ?? null,
              title: `${seed.title} (${demoSetId})`,
              jobTypeId,
              status: seed.status,
              progressStatus,
              priority: seed.priority,
              addressLine1: seed.addressLine1,
              suburb: seed.suburb,
              postcode: seed.postcode,
              state: seed.state ?? null,
              scheduledStart: seed.status === 'unassigned' ? null : scheduledStart,
              scheduledEnd: seed.status === 'unassigned' ? null : scheduledEnd,
              notes: 'Demo client job for metrics testing.',
              isDemo: true,
              createdBy,
              createdAt,
              updatedAt,
            };
          })
        )
        .returning();

      const invoiceRows = await tx
        .insert(jobInvoices)
        .values(
          jobSeeds
            .map((seed, index) => {
              if (!seed.invoiceTotalCents || seed.status === 'unassigned') return null;
              const job = jobRows[index];
              if (!job) return null;
              const totalCents = seed.invoiceTotalCents;
              const subtotalCents = Math.round(totalCents / 1.1);
              const taxCents = totalCents - subtotalCents;
              const isPaid = (seed.paidCents ?? 0) >= totalCents;
              const issuedAt = job.scheduledEnd ?? job.createdAt ?? now;

              return {
                orgId: params.orgId,
                jobId: job.id,
                provider: 'manual',
                amountCents: totalCents,
                subtotalCents,
                taxCents,
                totalCents,
                currency: 'AUD',
                status: isPaid ? 'paid' : 'sent',
                invoiceNumber: `DEMO-${demoSetId}-${index + 1}`,
                summary: 'Demo invoice for client metrics.',
                issuedAt,
                dueAt: new Date(issuedAt.getTime() + 14 * 24 * 60 * 60 * 1000),
                paidAt: isPaid ? issuedAt : null,
                createdBy,
                createdAt: issuedAt,
                updatedAt: issuedAt,
              };
            })
            .filter(Boolean) as Array<typeof jobInvoices.$inferInsert>
        )
        .returning();

      const invoiceByJobId = new Map(invoiceRows.map((invoice) => [invoice.jobId, invoice]));
      const paymentRows = await tx
        .insert(jobPayments)
        .values(
          jobSeeds
            .map((seed, index) => {
              const paidCents = seed.paidCents ?? 0;
              if (paidCents <= 0) return null;
              const job = jobRows[index];
              if (!job) return null;
              const invoice = invoiceByJobId.get(job.id);
              const paidAt = invoice?.issuedAt ?? job.updatedAt ?? now;
              return {
                orgId: params.orgId,
                jobId: job.id,
                invoiceId: invoice?.id ?? null,
                provider: 'manual',
                method: 'manual',
                amountCents: paidCents,
                currency: 'AUD',
                status: 'paid',
                reference: `DEMO-PAY-${demoSetId}-${index + 1}`,
                paidAt,
                createdBy,
                createdAt: paidAt,
                updatedAt: paidAt,
              };
            })
            .filter(Boolean) as Array<typeof jobPayments.$inferInsert>
        )
        .returning();

      return {
        demoSetId,
        clients: clientRows.length,
        jobs: jobRows.length,
        invoices: invoiceRows.length,
        payments: paymentRows.length,
      } satisfies DemoClientSeedResult;
    });

    return ok(result);
  } catch (error) {
    console.error('Error seeding demo clients:', error);
    return err('INTERNAL_ERROR', 'Failed to seed demo clients', error);
  }
}
