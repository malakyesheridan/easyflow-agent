import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { jobContacts } from '@/db/schema/job_contacts';
import { ok, err, type Result } from '@/lib/result';
import type { JobContact } from '@/db/schema/job_contacts';

export async function listJobContacts(params: {
  orgId: string;
  jobId: string;
}): Promise<Result<JobContact[]>> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(jobContacts)
      .where(and(eq(jobContacts.orgId, params.orgId), eq(jobContacts.jobId, params.jobId)))
      .orderBy(asc(jobContacts.createdAt));
    return ok(rows);
  } catch (error) {
    console.error('Error listing job contacts:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job contacts', error);
  }
}

export async function getJobContactById(params: {
  orgId: string;
  id: string;
}): Promise<Result<JobContact>> {
  try {
    const db = getDb();
    const [row] = await db
      .select()
      .from(jobContacts)
      .where(and(eq(jobContacts.orgId, params.orgId), eq(jobContacts.id, params.id)))
      .limit(1);
    if (!row) return err('NOT_FOUND', 'Job contact not found');
    return ok(row);
  } catch (error) {
    console.error('Error fetching job contact:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch job contact', error);
  }
}
