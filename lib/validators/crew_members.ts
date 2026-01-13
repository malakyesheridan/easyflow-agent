import { z } from 'zod';

export const crewRoleSchema = z.string().trim().min(1).max(50);
export const crewCostRateTypeSchema = z.enum(['hourly', 'daily']);

export const createCrewMemberSchema = z.object({
  orgId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().min(1).optional(),
  role: crewRoleSchema.default('staff'),
  email: z.string().trim().min(1).max(200).nullable().optional(),
  phone: z.string().trim().min(1).max(50).nullable().optional(),
  skills: z.string().trim().min(1).max(500).nullable().optional(),
  active: z.boolean().optional().default(true),
  defaultStartMinutes: z.number().int().min(0).max(24 * 60).optional(),
  defaultEndMinutes: z.number().int().min(0).max(24 * 60).optional(),
  dailyCapacityMinutes: z.number().int().min(0).max(24 * 60).optional(),
  costRateCents: z.number().int().min(0).nullable().optional(),
  costRateType: crewCostRateTypeSchema.optional(),
});

export const updateCrewMemberSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  role: crewRoleSchema.optional(),
  email: z.string().trim().min(1).max(200).nullable().optional(),
  phone: z.string().trim().min(1).max(50).nullable().optional(),
  skills: z.string().trim().min(1).max(500).nullable().optional(),
  active: z.boolean().optional(),
  defaultStartMinutes: z.number().int().min(0).max(24 * 60).optional(),
  defaultEndMinutes: z.number().int().min(0).max(24 * 60).optional(),
  dailyCapacityMinutes: z.number().int().min(0).max(24 * 60).optional(),
  costRateCents: z.number().int().min(0).nullable().optional(),
  costRateType: crewCostRateTypeSchema.optional(),
});

export type CreateCrewMemberInput = z.infer<typeof createCrewMemberSchema>;
export type UpdateCrewMemberInput = z.infer<typeof updateCrewMemberSchema>;
export type CrewRole = z.infer<typeof crewRoleSchema>;
export type CrewCostRateType = z.infer<typeof crewCostRateTypeSchema>;
