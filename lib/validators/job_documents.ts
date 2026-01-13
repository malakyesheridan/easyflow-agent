import { z } from 'zod';

export const jobDocumentsListSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
});

export const jobDocumentCreateLinkSchema = z.object({
  orgId: z.string().uuid(),
  jobId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  url: z.string().url().max(2000),
});

export const jobDocumentDeleteSchema = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid(),
});

export type CreateJobDocumentLinkInput = z.infer<typeof jobDocumentCreateLinkSchema>;

