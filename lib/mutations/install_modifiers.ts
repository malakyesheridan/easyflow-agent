import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { installModifiers, type InstallModifier, type NewInstallModifier } from '@/db/schema/install_modifiers';
import { ok, err, type Result } from '@/lib/result';
import { createInstallModifierSchema, updateInstallModifierSchema, type CreateInstallModifierInput, type UpdateInstallModifierInput } from '@/lib/validators/install_modifiers';

export async function createInstallModifier(
  input: CreateInstallModifierInput
): Promise<Result<InstallModifier>> {
  try {
    const validated = createInstallModifierSchema.parse(input);
    const db = getDb();

    const values: NewInstallModifier = {
      orgId: validated.orgId,
      name: validated.name.trim(),
      description: validated.description ?? null,
      multiplier: String(validated.multiplier) as any,
      enabled: validated.enabled ?? true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const [row] = await db.insert(installModifiers).values(values).returning();
    if (!row) return err('INTERNAL_ERROR', 'Failed to create modifier');
    return ok(row);
  } catch (error) {
    console.error('Error creating install modifier:', error);
    return err('INTERNAL_ERROR', 'Failed to create modifier', error);
  }
}

export async function updateInstallModifier(
  input: UpdateInstallModifierInput
): Promise<Result<InstallModifier>> {
  try {
    const validated = updateInstallModifierSchema.parse(input);
    const db = getDb();

    const updateData: Partial<NewInstallModifier> = {
      updatedAt: new Date(),
    };
    if (validated.name !== undefined) updateData.name = validated.name.trim();
    if (validated.description !== undefined) updateData.description = validated.description ?? null;
    if (validated.multiplier !== undefined) updateData.multiplier = String(validated.multiplier) as any;
    if (validated.enabled !== undefined) updateData.enabled = validated.enabled;

    const [row] = await db
      .update(installModifiers)
      .set(updateData as any)
      .where(and(eq(installModifiers.id, validated.id), eq(installModifiers.orgId, validated.orgId)))
      .returning();

    if (!row) return err('NOT_FOUND', 'Modifier not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating install modifier:', error);
    return err('INTERNAL_ERROR', 'Failed to update modifier', error);
  }
}

export async function seedDefaultInstallModifiers(orgId: string): Promise<Result<InstallModifier[]>> {
  try {
    const db = getDb();
    const defaults: Array<NewInstallModifier> = [
      {
        orgId,
        name: 'Upstairs access',
        description: 'Access requires stairs or lifts',
        multiplier: '1.2' as any,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        orgId,
        name: 'No lift',
        description: 'Manual carry without lift access',
        multiplier: '1.15' as any,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        orgId,
        name: 'Tight access',
        description: 'Limited clearance or narrow pathways',
        multiplier: '1.1' as any,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        orgId,
        name: 'Complex layout',
        description: 'Multi-angle or irregular layout',
        multiplier: '1.15' as any,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        orgId,
        name: 'Simple layout',
        description: 'Straightforward layout with easy access',
        multiplier: '0.9' as any,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const [existing] = await db
      .select({ id: installModifiers.id })
      .from(installModifiers)
      .where(eq(installModifiers.orgId, orgId))
      .limit(1);

    if (existing) return ok([]);

    const rows = await db.insert(installModifiers).values(defaults as any).returning();
    return ok(rows);
  } catch (error) {
    console.error('Error seeding default install modifiers:', error);
    return err('INTERNAL_ERROR', 'Failed to seed install modifiers', error);
  }
}
