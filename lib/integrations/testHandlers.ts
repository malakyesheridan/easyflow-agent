import type { IntegrationCredentials } from '@/lib/integrations/types';

export type IntegrationTestResult = {
  ok: boolean;
  error?: string;
};

type IntegrationTestHandler = (credentials: IntegrationCredentials) => Promise<IntegrationTestResult>;

const defaultHandler: IntegrationTestHandler = async () => {
  return { ok: true };
};

const xeroHandler: IntegrationTestHandler = async (credentials) => {
  if (!credentials.client_id || !credentials.client_secret) {
    return { ok: false, error: 'Xero client credentials are required.' };
  }
  return { ok: true };
};

export const IntegrationTestHandlers: Record<string, IntegrationTestHandler> = {
  stripe: defaultHandler,
  inventory_generic: defaultHandler,
  xero: xeroHandler,
  custom_api: defaultHandler,
};

export async function testIntegrationConnection(
  provider: string,
  credentials: IntegrationCredentials
): Promise<IntegrationTestResult> {
  const handler = IntegrationTestHandlers[provider] ?? defaultHandler;
  return await handler(credentials);
}
