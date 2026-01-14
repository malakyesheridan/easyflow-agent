import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { suburbZones, suburbZoneMembers } from '@/db/schema/suburb_zones';
import { ok, err, type Result } from '@/lib/result';
import { suburbZonesUpdateSchema, type SuburbZonesUpdateInput } from '@/lib/validators/suburb_zones';
import type { SuburbZoneWithMembers } from '@/lib/queries/suburb_zones';

function normalizeLabel(value: string): string {
  return value.trim();
}

function normalizeSuburb(value: string): string {
  return value.trim();
}

export async function replaceSuburbZones(input: SuburbZonesUpdateInput): Promise<Result<SuburbZoneWithMembers[]>> {
  try {
    const validated = suburbZonesUpdateSchema.parse(input);
    const zones = validated.zones.map((zone) => ({
      id: zone.id,
      name: normalizeLabel(zone.name),
      suburbs: zone.suburbs.map((suburb) => normalizeSuburb(suburb)).filter(Boolean),
    }));

    const seen = new Set<string>();
    for (const zone of zones) {
      const key = zone.name.toLowerCase();
      if (seen.has(key)) {
        return err('VALIDATION_ERROR', 'Zone names must be unique.');
      }
      seen.add(key);
    }

    const db = getDb();
    const now = new Date();

    return await db.transaction(async (tx) => {
      const idsToKeep = zones.map((zone) => zone.id).filter(Boolean) as string[];
      if (idsToKeep.length > 0) {
        await tx
          .delete(suburbZones)
          .where(and(eq(suburbZones.orgId, validated.orgId), notInArray(suburbZones.id, idsToKeep)));
      } else {
        await tx.delete(suburbZones).where(eq(suburbZones.orgId, validated.orgId));
      }

      for (const zone of zones) {
        let zoneId = zone.id ?? null;
        if (zoneId) {
          const [updated] = await tx
            .update(suburbZones)
            .set({ name: zone.name, updatedAt: now })
            .where(and(eq(suburbZones.id, zoneId), eq(suburbZones.orgId, validated.orgId)))
            .returning();
          if (!updated) {
            zoneId = null;
          }
        }

        if (!zoneId) {
          const [inserted] = await tx
            .insert(suburbZones)
            .values({ orgId: validated.orgId, name: zone.name, updatedAt: now })
            .returning();
          if (!inserted) throw new Error('Failed to create suburb zone');
          zoneId = inserted.id;
        }

        await tx.delete(suburbZoneMembers).where(eq(suburbZoneMembers.zoneId, zoneId));

        if (zone.suburbs.length > 0) {
          const seenSuburbs = new Set<string>();
          const members = zone.suburbs
            .map((suburb) => suburb.trim())
            .filter((suburb) => {
              const key = suburb.toLowerCase();
              if (!key || seenSuburbs.has(key)) return false;
              seenSuburbs.add(key);
              return true;
            })
            .map((suburb) => ({ zoneId, suburb }));

          if (members.length > 0) {
            await tx.insert(suburbZoneMembers).values(members);
          }
        }
      }

      const zonesRows = await tx
        .select()
        .from(suburbZones)
        .where(eq(suburbZones.orgId, validated.orgId))
        .orderBy(asc(suburbZones.name));

      if (zonesRows.length === 0) return ok([]);

      const zoneIds = zonesRows.map((zone) => zone.id);
      const membersRows = await tx
        .select()
        .from(suburbZoneMembers)
        .where(inArray(suburbZoneMembers.zoneId, zoneIds))
        .orderBy(asc(suburbZoneMembers.suburb));

      const membersByZone = new Map<string, string[]>();
      membersRows.forEach((member) => {
        const list = membersByZone.get(member.zoneId) ?? [];
        list.push(member.suburb);
        membersByZone.set(member.zoneId, list);
      });

      const data = zonesRows.map((zone) => ({
        ...zone,
        suburbs: membersByZone.get(zone.id) ?? [],
      }));

      return ok(data);
    });
  } catch (error) {
    console.error('Error replacing suburb zones:', error);
    return err('INTERNAL_ERROR', 'Failed to update suburb zones', error);
  }
}
