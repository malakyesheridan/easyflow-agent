import { z } from 'zod';

export const announcementCreateSchema = z.object({
  orgId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
  priority: z.enum(['normal', 'urgent']).optional().default('normal'),
  recipientsType: z.enum(['all', 'selected']).optional().default('all'),
  recipientCrewMemberIds: z.array(z.string().uuid()).optional(),
});

export type CreateAnnouncementInput = z.infer<typeof announcementCreateSchema>;

export const announcementListQuerySchema = z.object({
  orgId: z.string().uuid(),
  priority: z.enum(['normal', 'urgent']).optional(),
  unacknowledgedOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export type ListAnnouncementQuery = z.infer<typeof announcementListQuerySchema>;

export const announcementAcknowledgeSchema = z.object({
  orgId: z.string().uuid(),
  announcementId: z.string().uuid(),
  acknowledgedByCrewMemberId: z.string().uuid().nullable().optional(),
});

export type AcknowledgeAnnouncementInput = z.infer<typeof announcementAcknowledgeSchema>;

