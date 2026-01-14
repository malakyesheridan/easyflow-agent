import { z } from 'zod';

const zoneSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  suburbs: z.array(z.string().trim().min(1).max(120)).max(200),
});

export const suburbZonesUpdateSchema = z.object({
  orgId: z.string().uuid(),
  zones: z.array(zoneSchema),
});

export type SuburbZonesUpdateInput = z.infer<typeof suburbZonesUpdateSchema>;
