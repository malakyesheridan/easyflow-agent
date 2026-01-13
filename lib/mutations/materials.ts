import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { materials } from '@/db/schema/materials';
import { ok, err, type Result } from '@/lib/result';
import type { Material, NewMaterial } from '@/db/schema/materials';
import { materialCreateSchema, materialDeleteSchema, materialUpdateSchema, type CreateMaterialInput, type UpdateMaterialInput } from '@/lib/validators/materials';
import { toNumericString } from '@/lib/utils/quantity';

export async function createMaterial(input: CreateMaterialInput): Promise<Result<Material>> {
  try {
    const validated = materialCreateSchema.parse(input);
    const db = getDb();

    const values: NewMaterial = {
      orgId: validated.orgId,
      name: validated.name.trim(),
      category: validated.category?.trim() || null,
      unit: validated.unit.trim(),
      unitCostCents: validated.unitCostCents ?? null,
      imageUrl: validated.imageUrl || null,
      description: validated.description?.trim() || null,
      reorderThreshold:
        validated.reorderThreshold === null || validated.reorderThreshold === undefined
          ? null
          : toNumericString(validated.reorderThreshold),
      reorderQuantity:
        validated.reorderQuantity === null || validated.reorderQuantity === undefined
          ? null
          : toNumericString(validated.reorderQuantity),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;

    const [row] = await db.insert(materials).values(values).returning();
    return ok(row);
  } catch (error) {
    console.error('Error creating material:', error);
    return err('INTERNAL_ERROR', 'Failed to create material', error);
  }
}

export async function updateMaterial(input: UpdateMaterialInput): Promise<Result<Material>> {
  try {
    const validated = materialUpdateSchema.parse(input);
    const db = getDb();

    const updateData: Partial<NewMaterial> = { updatedAt: new Date() };
    if (validated.name !== undefined) updateData.name = validated.name.trim();
    if (validated.category !== undefined) updateData.category = validated.category?.trim() || null;
    if (validated.unit !== undefined) updateData.unit = validated.unit.trim();
    if (validated.unitCostCents !== undefined) updateData.unitCostCents = validated.unitCostCents;
    if (validated.imageUrl !== undefined) updateData.imageUrl = validated.imageUrl || null;
    if (validated.description !== undefined) updateData.description = validated.description?.trim() || null;
    if (validated.reorderThreshold !== undefined) {
      updateData.reorderThreshold =
        validated.reorderThreshold === null ? null : toNumericString(validated.reorderThreshold);
    }
    if (validated.reorderQuantity !== undefined) {
      updateData.reorderQuantity =
        validated.reorderQuantity === null ? null : toNumericString(validated.reorderQuantity);
    }

    const [row] = await db
      .update(materials)
      .set(updateData as any)
      .where(and(eq(materials.id, validated.id), eq(materials.orgId, validated.orgId)))
      .returning();

    if (!row) return err('NOT_FOUND', 'Material not found');
    return ok(row);
  } catch (error) {
    console.error('Error updating material:', error);
    return err('INTERNAL_ERROR', 'Failed to update material', error);
  }
}

export async function deleteMaterial(params: { id: string; orgId: string }): Promise<Result<void>> {
  try {
    const validated = materialDeleteSchema.parse(params);
    const db = getDb();
    await db.delete(materials).where(and(eq(materials.id, validated.id), eq(materials.orgId, validated.orgId)));
    return ok(undefined);
  } catch (error) {
    console.error('Error deleting material:', error);
    return err('INTERNAL_ERROR', 'Failed to delete material', error);
  }
}
