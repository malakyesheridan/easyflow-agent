import { z } from 'zod';

export const signalEventAcknowledgeSchema = z.object({
  orgId: z.string().uuid(),
  signalEventId: z.string().uuid(),
  acknowledgedByUserId: z.string().uuid().nullable().optional(),
});

export const signalEventAssignSchema = z.object({
  orgId: z.string().uuid(),
  signalEventId: z.string().uuid(),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export const signalEventResolveSchema = z.object({
  orgId: z.string().uuid(),
  signalEventId: z.string().uuid(),
  resolvedByUserId: z.string().uuid().nullable().optional(),
  resolutionReason: z.string().trim().min(1).max(500),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export type AcknowledgeSignalEventInput = z.infer<typeof signalEventAcknowledgeSchema>;
export type AssignSignalEventInput = z.infer<typeof signalEventAssignSchema>;
export type ResolveSignalEventInput = z.infer<typeof signalEventResolveSchema>;
