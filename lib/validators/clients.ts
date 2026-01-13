import { z } from 'zod';

export const clientBaseSchema = z.object({
  id: z.string().uuid().optional(),
  orgId: z.string().uuid(),
  displayName: z.string().min(1, 'Display name is required'),
  legalName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  billingAddress: z.record(z.any()).nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const clientCreateSchema = z.object({
  orgId: z.string().uuid(),
  displayName: z.string().min(1, 'Display name is required'),
  legalName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  billingAddress: z.record(z.any()).nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export const clientUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  displayName: z.string().min(1).optional(),
  legalName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  billingAddress: z.record(z.any()).nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
});

export type ClientBase = z.infer<typeof clientBaseSchema>;
export type CreateClientInput = z.infer<typeof clientCreateSchema>;
export type UpdateClientInput = z.infer<typeof clientUpdateSchema>;
