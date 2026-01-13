import { z } from 'zod';

export const jobPhotoCreateSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  storagePath: z.string().min(1),
  originalFileName: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  bytes: z.number().int().positive().optional().nullable(),
  annotationJson: z.any().optional().nullable(),
  createdByCrewMemberId: z.string().uuid().optional().nullable(),
});

export const jobPhotoDeleteSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

export const jobPhotoUpdateAnnotationSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  annotationJson: z.any().nullable().optional(),
});

export type CreateJobPhotoInput = z.infer<typeof jobPhotoCreateSchema>;
export type UpdateJobPhotoAnnotationInput = z.infer<typeof jobPhotoUpdateAnnotationSchema>;
