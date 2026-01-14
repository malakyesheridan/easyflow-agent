import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { suburbZones, suburbZoneMembers, type SuburbZone, type SuburbZoneMember } from '@/db/schema/suburb_zones';
import { ok, err, type Result } from '@/lib/result';

export type SuburbZoneWithMembers = SuburbZone & { suburbs: string[] };

export async function listSuburbZones(params: { orgId: string }): Promise<Result<SuburbZoneWithMembers[]>> {
  try {
    const db = getDb();
    const zones = await db
      .select()
      .from(suburbZones)
      .where(eq(suburbZones.orgId, params.orgId))
      .orderBy(asc(suburbZones.name));

    if (zones.length === 0) return ok([]);

    const zoneIds = zones.map((zone) => zone.id);
    const members = await db
      .select()
      .from(suburbZoneMembers)
      .where(inArray(suburbZoneMembers.zoneId, zoneIds))
      .orderBy(asc(suburbZoneMembers.suburb));

    const membersByZone = new Map<string, SuburbZoneMember[]>();
    members.forEach((member) => {
      const list = membersByZone.get(member.zoneId) ?? [];
      list.push(member);
      membersByZone.set(member.zoneId, list);
    });

    const data = zones.map((zone) => ({
      ...zone,
      suburbs: (membersByZone.get(zone.id) ?? []).map((member) => member.suburb),
    }));

    return ok(data);
  } catch (error) {
    console.error('Error listing suburb zones:', error);
    return err('INTERNAL_ERROR', 'Failed to fetch suburb zones', error);
  }
}
