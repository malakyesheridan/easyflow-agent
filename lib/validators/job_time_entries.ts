import { z } from 'zod';

export const jobTimeBucketSchema = z.enum([
  'INSTALL',
  'SETUP',
  'PACKDOWN',
  'WAITING',
  'ADMIN',
  'TRAVEL',
  'REWORK',
]);

export const jobDelayReasonSchema = z.enum([
  'ACCESS_KEYS_NOT_READY',
  'DELIVERY_LATE_OR_WRONG',
  'WEATHER',
  'EQUIPMENT_LIFT_CRANE_WAIT',
  'SAFETY_PERMIT_INDUCTION',
  'CLIENT_CHANGE_SCOPE',
  'REWORK_DEFECT_FIX',
  'OTHER_WITH_NOTE',
]);

export const jobTimeEntriesListSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const jobTimeEntryCreateSchema = z
  .object({
    orgId: z.string().uuid(),
    jobId: z.string().uuid(),
    crewMemberId: z.string().uuid().nullable().optional(),
    bucket: jobTimeBucketSchema,
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    delayReason: jobDelayReasonSchema.nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startTime);
    const end = new Date(value.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'endTime must be after startTime' });
    }
    if (value.bucket === 'WAITING' && !value.delayReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'delayReason is required when bucket=WAITING' });
    }
    if (value.delayReason === 'OTHER_WITH_NOTE' && !value.note?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'note is required when delayReason=OTHER_WITH_NOTE' });
    }
  });

export const jobTimeEntryUpdateSchema = z
  .object({
    id: z.string().uuid(),
    orgId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    crewMemberId: z.string().uuid().nullable().optional(),
    bucket: jobTimeBucketSchema.optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    delayReason: jobDelayReasonSchema.nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const startProvided = value.startTime !== undefined;
    const endProvided = value.endTime !== undefined;
    if (startProvided !== endProvided) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'startTime and endTime must be provided together' });
    }
  });

export type JobTimeEntryCreateInput = z.infer<typeof jobTimeEntryCreateSchema>;
export type JobTimeEntryUpdateInput = z.infer<typeof jobTimeEntryUpdateSchema>;
