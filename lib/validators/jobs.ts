import { z } from 'zod';

/**
 * Job status enum schema.
 */
export const jobStatusSchema = z.enum([
  'unassigned',
  'scheduled',
  'in_progress',
  'completed',
]);

/**
 * Job priority enum schema.
 */
export const jobPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

/**
 * Job progress status enum schema.
 * Separate from job.status (lifecycle).
 */
export const jobProgressStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'half_complete',
  'completed',
]);

/**
 * Base schema with all job fields.
 * All fields are optional/nullable as defined in the database schema.
 */
export const jobBaseSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  title: z.string(),
  jobTypeId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  status: jobStatusSchema,
  priority: jobPrioritySchema,
  progressStatus: jobProgressStatusSchema.optional(),
  estimatedRevenueCents: z.number().int().min(0).nullable().optional(),
  estimatedCostCents: z.number().int().min(0).nullable().optional(),
  targetMarginPercent: z.number().min(0).max(100).nullable().optional(),
  revenueOverrideCents: z.number().int().min(0).nullable().optional(),
  profitabilityStatus: z.enum(['healthy', 'warning', 'critical']).optional(),
  addressLine1: z.string(),
  addressLine2: z.string().nullable().optional(),
  suburb: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  latitude: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .nullable()
    .optional(),
  longitude: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .nullable()
    .optional(),
  kgEstimate: z.number().int().nullable().optional(),
  kgInstalled: z.number().int().nullable().optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

/**
 * Schema for creating a new job.
 * Requires: org_id, title, address_line1
 * Optional: everything else
 * Defaults: status = 'unassigned', priority = 'normal'
 */
export const jobCreateSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().min(1, 'Title is required'),
  jobTypeId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  status: jobStatusSchema.default('unassigned'),
  priority: jobPrioritySchema.default('normal'),
  estimatedRevenueCents: z.number().int().min(0).nullable().optional(),
  estimatedCostCents: z.number().int().min(0).nullable().optional(),
  targetMarginPercent: z.number().min(0).max(100).nullable().optional(),
  revenueOverrideCents: z.number().int().min(0).nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  suburb: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  latitude: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .nullable()
    .optional(),
  longitude: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .nullable()
    .optional(),
  kgEstimate: z.number().int().nullable().optional(),
  kgInstalled: z.number().int().nullable().optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Schema for updating a job.
 * Requires: id
 * Optional: any updatable field
 * Disallows: created_at updates (not included in schema)
 */
export const jobUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid().optional(),
  title: z.string().optional(),
  jobTypeId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  status: jobStatusSchema.optional(),
  priority: jobPrioritySchema.optional(),
  progressStatus: jobProgressStatusSchema.optional(),
  crewId: z.string().uuid().nullable().optional(), // Must be a valid UUID to match database schema
  estimatedRevenueCents: z.number().int().min(0).nullable().optional(),
  estimatedCostCents: z.number().int().min(0).nullable().optional(),
  targetMarginPercent: z.number().min(0).max(100).nullable().optional(),
  revenueOverrideCents: z.number().int().min(0).nullable().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().nullable().optional(),
  suburb: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postcode: z.string().nullable().optional(),
  latitude: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .nullable()
    .optional(),
  longitude: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseFloat(val) : val))
    .nullable()
    .optional(),
  kgEstimate: z.number().int().nullable().optional(),
  kgInstalled: z.number().int().nullable().optional(),
  scheduledStart: z.string().datetime().nullable().optional(),
  scheduledEnd: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
  updatedAt: z.string().datetime().optional(),
  // Note: createdAt is intentionally omitted - cannot be updated
});

/**
 * Schema for job ID parameter.
 */
export const jobIdSchema = z.object({
  id: z.string().uuid(),
});

// Export inferred types
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobPriority = z.infer<typeof jobPrioritySchema>;
export type JobProgressStatus = z.infer<typeof jobProgressStatusSchema>;
export type JobBase = z.infer<typeof jobBaseSchema>;
export type CreateJobInput = z.infer<typeof jobCreateSchema>;
export type UpdateJobInput = z.infer<typeof jobUpdateSchema>;
export type JobIdParams = z.infer<typeof jobIdSchema>;
