import { z } from 'zod';
import { appEventSchemas, type AppEventType } from '@/lib/integrations/events/types';
import { integrationActionTypes } from '@/lib/integrations/rules';

const appEventTypeValues = Object.keys(appEventSchemas) as [AppEventType, ...AppEventType[]];

const integrationRuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  when: z.enum(appEventTypeValues),
  conditions: z
    .object({
      jobStatusIn: z.array(z.string()).optional(),
      assignmentTypeIn: z.array(z.string()).optional(),
      materialIdIn: z.array(z.string()).optional(),
    })
    .optional(),
  action: z.object({
    type: z.enum(integrationActionTypes),
    params: z.record(z.unknown()).optional(),
  }),
});

export const integrationCredentialsSchema = z.record(z.string(), z.string().min(1));

export const integrationUpsertSchema = z.object({
  orgId: z.string().uuid(),
  provider: z.string().min(1),
  displayName: z.string().trim().min(1),
  credentials: integrationCredentialsSchema,
  mode: z.enum(['test', 'live']).optional(),
});

export const integrationUpdateSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  displayName: z.string().trim().min(1).optional(),
  enabled: z.boolean().optional(),
  rules: z.array(integrationRuleSchema).optional(),
});

export const integrationDeleteSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
});

export type IntegrationUpsertInput = z.infer<typeof integrationUpsertSchema>;
export type IntegrationUpdateInput = z.infer<typeof integrationUpdateSchema>;
export type IntegrationDeleteInput = z.infer<typeof integrationDeleteSchema>;
