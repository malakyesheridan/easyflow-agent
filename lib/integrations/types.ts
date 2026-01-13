export type IntegrationStatus = 'disconnected' | 'connected' | 'error' | 'disabled';

import type { IntegrationRule } from '@/lib/integrations/rules';

export type IntegrationSummary = {
  id: string;
  orgId: string;
  provider: string;
  displayName: string;
  enabled: boolean;
  status: IntegrationStatus;
  lastTestedAt: Date | null;
  lastError: string | null;
  rules?: IntegrationRule[] | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IntegrationCredentials = Record<string, string>;
