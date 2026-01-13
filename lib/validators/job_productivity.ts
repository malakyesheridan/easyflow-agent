import { z } from 'zod';

const optionalNonNegative = z.number().min(0).nullable().optional();

export const jobProductivityQuerySchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const jobProductivityUpdateSchema = z
  .object({
    orgId: z.string().uuid(),
    jobId: z.string().uuid(),
    plannedM2: optionalNonNegative,
    variationM2: z.number().nullable().optional(),
    claimedM2: optionalNonNegative,
    acceptedM2: optionalNonNegative,
    reworkM2: optionalNonNegative,
    complexityAccessDifficulty: z.number().int().min(1).max(5).nullable().optional(),
    complexityHeightLiftRequirement: z.number().int().min(1).max(5).nullable().optional(),
    complexityPanelHandlingSize: z.number().int().min(1).max(5).nullable().optional(),
    complexitySiteConstraints: z.number().int().min(1).max(5).nullable().optional(),
    complexityDetailingComplexity: z.number().int().min(1).max(5).nullable().optional(),
    qualityDefectCount: z.number().int().min(0).nullable().optional(),
    qualityCallbackFlag: z.boolean().optional(),
    qualityMissingDocsFlag: z.boolean().optional(),
    qualitySafetyFlag: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const keys = Object.keys(value).filter((key) => key !== 'orgId' && key !== 'jobId');
    if (keys.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one field must be updated' });
    }
  });

export type JobProductivityUpdateInput = z.infer<typeof jobProductivityUpdateSchema>;
