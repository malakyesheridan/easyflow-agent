import { z } from 'zod';

const jobTypeBaseSchema = z.object({
  orgId: z.string().uuid(),
  key: z.string().trim().min(1).max(80).optional(),
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  defaultDurationMinutes: z.number().int().min(0).max(24 * 60).nullable().optional(),
  requirePhotos: z.boolean().optional(),
  requireMaterials: z.boolean().optional(),
  requireReports: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const createJobTypeSchema = jobTypeBaseSchema;

export const updateJobTypeSchema = jobTypeBaseSchema
  .partial({ key: true, label: true })
  .extend({
    id: z.string().uuid(),
    archivedAt: z.string().datetime().nullable().optional(),
  });

export type CreateJobTypeInput = z.infer<typeof createJobTypeSchema>;
export type UpdateJobTypeInput = z.infer<typeof updateJobTypeSchema>;
