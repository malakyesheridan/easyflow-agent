import { and, eq, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { leadSources, type LeadSource } from '@/db/schema/lead_sources';
import { ok, err, type Result } from '@/lib/result';
import { leadSourcesUpdateSchema, type LeadSourcesUpdateInput } from '@/lib/validators/lead_sources';

function normalizeLabel(value: string): string {
  return value.trim();
}

export async function replaceLeadSources(input: LeadSourcesUpdateInput): Promise<Result<LeadSource[]>> {
  try {
    const validated = leadSourcesUpdateSchema.parse(input);
    const sources = validated.sources.map((source) => ({
      id: source.id,
      name: normalizeLabel(source.name),
    }));

    const seen = new Set<string>();
    for (const source of sources) {
      const key = source.name.toLowerCase();
      if (seen.has(key)) {
        return err('VALIDATION_ERROR', 'Lead sources must be unique.');
      }
      seen.add(key);
    }

    const db = getDb();
    const now = new Date();

    return await db.transaction(async (tx) => {
      const idsToKeep = sources.map((source) => source.id).filter(Boolean) as string[];
      if (idsToKeep.length > 0) {
        await tx
          .delete(leadSources)
          .where(and(eq(leadSources.orgId, validated.orgId), notInArray(leadSources.id, idsToKeep)));
      } else {
        await tx.delete(leadSources).where(eq(leadSources.orgId, validated.orgId));
      }

      for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index];
        const sortOrder = index + 1;
        if (source.id) {
          const [updated] = await tx
            .update(leadSources)
            .set({ name: source.name, sortOrder, updatedAt: now })
            .where(and(eq(leadSources.id, source.id), eq(leadSources.orgId, validated.orgId)))
            .returning();
          if (updated) continue;
        }

        await tx
          .insert(leadSources)
          .values({ orgId: validated.orgId, name: source.name, sortOrder, updatedAt: now })
          .returning();
      }

      const rows = await tx
        .select()
        .from(leadSources)
        .where(eq(leadSources.orgId, validated.orgId))
        .orderBy(leadSources.sortOrder, leadSources.name);

      return ok(rows);
    });
  } catch (error) {
    console.error('Error replacing lead sources:', error);
    return err('INTERNAL_ERROR', 'Failed to update lead sources', error);
  }
}
