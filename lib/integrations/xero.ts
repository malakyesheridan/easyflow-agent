import { and, eq } from 'drizzle-orm';
import { integrations } from '@/db/schema/integrations';
import { withIntegrationOrgScope } from '@/lib/integrations/scope';
import { decryptCredentials, encryptCredentials } from '@/lib/integrations/crypto';
import type { IntegrationStatus } from '@/lib/integrations/types';
import { ok, err, type Result } from '@/lib/result';
import { createSecureToken } from '@/lib/security/tokens';
import { updateIntegrationCredentials } from '@/lib/mutations/integrations';

const XERO_AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

const XERO_SCOPES = [
  'offline_access',
  'accounting.transactions',
  'accounting.contacts',
] as const;

type XeroCredentialRecord = {
  client_id: string;
  client_secret: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  tenant_id?: string;
  tenant_name?: string;
  last_connected_at?: string;
  last_sync_at?: string;
};

export type XeroConnectionInfo = {
  connected: boolean;
  tenantId: string | null;
  tenantName: string | null;
  lastConnectedAt: string | null;
  lastSyncAt: string | null;
  status: IntegrationStatus | null;
  enabled: boolean;
  hasClientCredentials: boolean;
};

export type XeroInvoiceSyncResult = {
  xeroInvoiceId: string;
  xeroStatus: string | null;
  xeroUrl: string | null;
};

export type XeroInvoiceStatus = {
  status: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  updatedDateUtc: string | null;
};

type XeroIntegrationRow = {
  id: string;
  enabled: boolean;
  status: IntegrationStatus | null;
  credentials: XeroCredentialRecord | null;
};

type XeroLineItem = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  taxRate?: number | null;
};

export type XeroInvoiceSource = {
  invoiceId: string;
  xeroInvoiceId?: string | null;
  invoiceNumber?: string | null;
  reference?: string | null;
  summary?: string | null;
  currency: string;
  issuedAt?: Date | null;
  dueAt?: Date | null;
  totalCents: number;
  lineItems: XeroLineItem[];
  contact: {
    name: string;
    email?: string | null;
  };
  accountCode?: string | null;
  taxType?: string | null;
};

type XeroOAuthState = {
  orgId: string;
  nonce: string;
  createdAt: string;
};

function resolveBaseUrl(req?: Request): string {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/$/, '');
  if (!req) return 'http://localhost:3000';
  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/$/, '');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function buildRedirectUri(req?: Request): string {
  return `${resolveBaseUrl(req)}/api/integrations/xero/callback`;
}

export function buildXeroOAuthState(orgId: string): string {
  const nonce = createSecureToken(16).token;
  const payload: XeroOAuthState = {
    orgId,
    nonce,
    createdAt: new Date().toISOString(),
  };
  const encrypted = encryptCredentials({
    orgId: payload.orgId,
    nonce: payload.nonce,
    createdAt: payload.createdAt,
  });
  return Buffer.from(JSON.stringify(encrypted)).toString('base64url');
}

export function parseXeroOAuthState(state: string): Result<XeroOAuthState> {
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
    const decrypted = decryptCredentials(decoded);
    const orgId = decrypted.orgId;
    const nonce = decrypted.nonce;
    const createdAt = decrypted.createdAt;
    if (!orgId || !nonce || !createdAt) {
      return err('VALIDATION_ERROR', 'Invalid OAuth state payload');
    }
    return ok({ orgId, nonce, createdAt });
  } catch (error) {
    return err('VALIDATION_ERROR', 'Invalid OAuth state payload', error);
  }
}

function parseExpiry(value?: string | null): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function loadXeroIntegration(orgId: string): Promise<Result<XeroIntegrationRow>> {
  try {
    const row = await withIntegrationOrgScope(orgId, async (db) => {
      const [integration] = await db
        .select({
          id: integrations.id,
          enabled: integrations.enabled,
          status: integrations.status,
          credentials: integrations.credentials,
        })
        .from(integrations)
        .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, 'xero')))
        .limit(1);
      return integration ?? null;
    });

    if (!row) return err('NOT_FOUND', 'Xero integration not found');

    const credentials = row.credentials ? (decryptCredentials(row.credentials) as XeroCredentialRecord) : null;
    return ok({
      id: row.id,
      enabled: row.enabled,
      status: row.status ?? null,
      credentials,
    });
  } catch (error) {
    console.error('Error loading Xero integration:', error);
    return err('INTERNAL_ERROR', 'Failed to load Xero integration', error);
  }
}

async function saveXeroCredentials(params: {
  orgId: string;
  integrationId: string;
  credentials: XeroCredentialRecord;
  status?: IntegrationStatus;
  enabled?: boolean;
  lastError?: string | null;
}): Promise<Result<true>> {
  const normalized = Object.entries(params.credentials).reduce<Record<string, string>>((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    acc[key] = String(value);
    return acc;
  }, {});

  const result = await updateIntegrationCredentials({
    orgId: params.orgId,
    provider: 'xero',
    credentials: normalized,
    status: params.status ?? undefined,
    enabled: params.enabled,
    lastError: params.lastError ?? undefined,
    lastTestedAt: new Date(),
  });
  if (!result.ok) return err(result.error.code, result.error.message, result.error.details);
  return ok(true);
}

function buildAuthHeader(clientId: string, clientSecret: string): string {
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${token}`;
}

async function exchangeToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<Result<any>> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(params.clientId, params.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error_description || json?.error || 'Failed to exchange Xero token';
    return err('INTEGRATION_ERROR', message, json);
  }
  return ok(json);
}

async function refreshToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<Result<any>> {
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(params.clientId, params.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error_description || json?.error || 'Failed to refresh Xero token';
    return err('INTEGRATION_ERROR', message, json);
  }
  return ok(json);
}

async function getTenants(accessToken: string): Promise<Result<any[]>> {
  const res = await fetch(XERO_CONNECTIONS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(json)) {
    return err('INTEGRATION_ERROR', 'Failed to fetch Xero tenants', json);
  }
  return ok(json);
}

function buildInvoiceUrl(invoiceId: string): string {
  return `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${invoiceId}`;
}

function toDateString(value?: Date | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function xeroRequest(params: {
  accessToken: string;
  tenantId: string;
  method: 'GET' | 'POST';
  path: string;
  body?: any;
}): Promise<Result<any>> {
  const res = await fetch(`${XERO_API_BASE}${params.path}`, {
    method: params.method,
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Xero-tenant-id': params.tenantId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.Message || json?.ErrorNumber || 'Xero API request failed';
    return err('INTEGRATION_ERROR', message, json);
  }
  return ok(json);
}

async function resolveContact(params: {
  accessToken: string;
  tenantId: string;
  name: string;
  email?: string | null;
}): Promise<Result<{ ContactID: string }>> {
  if (params.email) {
    const where = `EmailAddress=="${params.email.replace(/"/g, '\\"')}"`;
    const found = await xeroRequest({
      accessToken: params.accessToken,
      tenantId: params.tenantId,
      method: 'GET',
      path: `/Contacts?where=${encodeURIComponent(where)}`,
    });
    if (found.ok) {
      const contacts = Array.isArray(found.data?.Contacts) ? found.data.Contacts : [];
      const match = contacts.find((contact: any) => contact?.ContactID);
      if (match?.ContactID) {
        return ok({ ContactID: match.ContactID });
      }
    }
  }

  const created = await xeroRequest({
    accessToken: params.accessToken,
    tenantId: params.tenantId,
    method: 'POST',
    path: '/Contacts',
    body: {
      Contacts: [
        {
          Name: params.name,
          EmailAddress: params.email ?? undefined,
        },
      ],
    },
  });

  if (!created.ok) return created;
  const contact = created.data?.Contacts?.[0];
  if (!contact?.ContactID) {
    return err('INTEGRATION_ERROR', 'Failed to create Xero contact');
  }
  return ok({ ContactID: contact.ContactID });
}

export async function getAuthorizeUrl(orgId: string, req?: Request): Promise<Result<string>> {
  const integrationResult = await loadXeroIntegration(orgId);
  if (!integrationResult.ok) return err(integrationResult.error.code, integrationResult.error.message);

  const credentials = integrationResult.data.credentials;
  if (!credentials?.client_id || !credentials?.client_secret) {
    return err('VALIDATION_ERROR', 'Xero client credentials are missing');
  }

  const redirectUri = buildRedirectUri(req);
  const state = buildXeroOAuthState(orgId);
  const url = new URL(XERO_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', credentials.client_id);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', XERO_SCOPES.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'consent');

  return ok(url.toString());
}

export async function handleOAuthCallback(params: {
  code: string;
  state: string;
  req?: Request;
}): Promise<Result<XeroConnectionInfo>> {
  const stateResult = parseXeroOAuthState(params.state);
  if (!stateResult.ok) return err(stateResult.error.code, stateResult.error.message);
  const orgId = stateResult.data.orgId;

  const integrationResult = await loadXeroIntegration(orgId);
  if (!integrationResult.ok) return err(integrationResult.error.code, integrationResult.error.message);
  const credentials = integrationResult.data.credentials;
  if (!credentials?.client_id || !credentials?.client_secret) {
    return err('VALIDATION_ERROR', 'Xero client credentials are missing');
  }

  const redirectUri = buildRedirectUri(params.req);
  const tokenResult = await exchangeToken({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    code: params.code,
    redirectUri,
  });
  if (!tokenResult.ok) return err(tokenResult.error.code, tokenResult.error.message, tokenResult.error.details);

  const accessToken = tokenResult.data.access_token;
  const refreshToken = tokenResult.data.refresh_token;
  const expiresIn = Number(tokenResult.data.expires_in ?? 0);
  const expiresAt = Date.now() + Math.max(0, expiresIn - 60) * 1000;

  const tenantResult = await getTenants(accessToken);
  if (!tenantResult.ok) return err(tenantResult.error.code, tenantResult.error.message, tenantResult.error.details);
  const tenant = tenantResult.data[0];
  if (!tenant?.tenantId) {
    return err('INTEGRATION_ERROR', 'No Xero tenant available');
  }

  const nextCredentials: XeroCredentialRecord = {
    ...credentials,
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: String(expiresAt),
    tenant_id: tenant.tenantId,
    tenant_name: tenant.tenantName ?? null,
    last_connected_at: new Date().toISOString(),
  };

  const saveResult = await saveXeroCredentials({
    orgId,
    integrationId: integrationResult.data.id,
    credentials: nextCredentials,
    status: 'connected',
    enabled: true,
    lastError: null,
  });
  if (!saveResult.ok) return err(saveResult.error.code, saveResult.error.message, saveResult.error.details);

  return ok({
    connected: true,
    tenantId: tenant.tenantId ?? null,
    tenantName: tenant.tenantName ?? null,
    lastConnectedAt: nextCredentials.last_connected_at ?? null,
    lastSyncAt: nextCredentials.last_sync_at ?? null,
    status: 'connected',
    enabled: true,
    hasClientCredentials: true,
  });
}

export async function disconnect(orgId: string): Promise<Result<true>> {
  const integrationResult = await loadXeroIntegration(orgId);
  if (!integrationResult.ok) return err(integrationResult.error.code, integrationResult.error.message);
  const credentials = integrationResult.data.credentials;
  if (!credentials?.client_id || !credentials?.client_secret) {
    return err('VALIDATION_ERROR', 'Xero client credentials are missing');
  }

  if (credentials.refresh_token) {
    await fetch('https://identity.xero.com/connect/revocation', {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader(credentials.client_id, credentials.client_secret),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: credentials.refresh_token }),
    }).catch(() => null);
  }

  const nextCredentials: XeroCredentialRecord = {
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
  };

  const saveResult = await saveXeroCredentials({
    orgId,
    integrationId: integrationResult.data.id,
    credentials: nextCredentials,
    status: 'disconnected',
    enabled: false,
    lastError: null,
  });
  if (!saveResult.ok) return err(saveResult.error.code, saveResult.error.message, saveResult.error.details);

  return ok(true);
}

export async function getConnection(orgId: string): Promise<Result<XeroConnectionInfo>> {
  const integrationResult = await loadXeroIntegration(orgId);
  if (!integrationResult.ok) {
    if (integrationResult.error.code === 'NOT_FOUND') {
      return ok({
        connected: false,
        tenantId: null,
        tenantName: null,
        lastConnectedAt: null,
        lastSyncAt: null,
        status: 'disconnected',
        enabled: false,
        hasClientCredentials: false,
      });
    }
    return err(integrationResult.error.code, integrationResult.error.message);
  }

  const credentials = integrationResult.data.credentials;
  const hasClientCredentials = Boolean(credentials?.client_id && credentials?.client_secret);
  const connected =
    integrationResult.data.status === 'connected' &&
    Boolean(credentials?.access_token && credentials?.refresh_token && credentials?.tenant_id);

  return ok({
    connected,
    tenantId: credentials?.tenant_id ?? null,
    tenantName: credentials?.tenant_name ?? null,
    lastConnectedAt: credentials?.last_connected_at ?? null,
    lastSyncAt: credentials?.last_sync_at ?? null,
    status: integrationResult.data.status,
    enabled: integrationResult.data.enabled,
    hasClientCredentials,
  });
}

export async function refreshTokenIfNeeded(orgId: string): Promise<Result<XeroCredentialRecord>> {
  const integrationResult = await loadXeroIntegration(orgId);
  if (!integrationResult.ok) return err(integrationResult.error.code, integrationResult.error.message);
  const credentials = integrationResult.data.credentials;
  if (!credentials?.client_id || !credentials?.client_secret || !credentials.refresh_token) {
    return err('VALIDATION_ERROR', 'Xero credentials are missing');
  }

  const expiresAt = parseExpiry(credentials.expires_at);
  if (expiresAt && Date.now() < expiresAt - 60_000) {
    return ok(credentials);
  }

  const refreshed = await refreshToken({
    clientId: credentials.client_id,
    clientSecret: credentials.client_secret,
    refreshToken: credentials.refresh_token,
  });
  if (!refreshed.ok) return err(refreshed.error.code, refreshed.error.message, refreshed.error.details);

  const accessToken = refreshed.data.access_token;
  const refreshTokenValue = refreshed.data.refresh_token ?? credentials.refresh_token;
  const expiresIn = Number(refreshed.data.expires_in ?? 0);
  const expiresAtNext = Date.now() + Math.max(0, expiresIn - 60) * 1000;

  const nextCredentials: XeroCredentialRecord = {
    ...credentials,
    access_token: accessToken,
    refresh_token: refreshTokenValue,
    expires_at: String(expiresAtNext),
  };

  const saveResult = await saveXeroCredentials({
    orgId,
    integrationId: integrationResult.data.id,
    credentials: nextCredentials,
    status: integrationResult.data.status ?? 'connected',
    enabled: integrationResult.data.enabled,
    lastError: null,
  });
  if (!saveResult.ok) return err(saveResult.error.code, saveResult.error.message, saveResult.error.details);

  return ok(nextCredentials);
}

export async function createOrUpdateInvoice(
  orgId: string,
  source: XeroInvoiceSource
): Promise<Result<XeroInvoiceSyncResult>> {
  const credentialsResult = await refreshTokenIfNeeded(orgId);
  if (!credentialsResult.ok) return err(credentialsResult.error.code, credentialsResult.error.message);

  const credentials = credentialsResult.data;
  if (!credentials.access_token || !credentials.tenant_id) {
    return err('VALIDATION_ERROR', 'Xero access token is missing');
  }

  const contactResult = await resolveContact({
    accessToken: credentials.access_token,
    tenantId: credentials.tenant_id,
    name: source.contact.name,
    email: source.contact.email ?? null,
  });
  if (!contactResult.ok) return err(contactResult.error.code, contactResult.error.message, contactResult.error.details);

  const lineItems = source.lineItems.length > 0
    ? source.lineItems.map((item) => ({
        Description: item.description,
        Quantity: item.quantity,
        UnitAmount: Number((item.unitPriceCents / 100).toFixed(2)),
        AccountCode: source.accountCode ?? undefined,
        TaxType: source.taxType ?? undefined,
      }))
    : [
        {
          Description: source.summary ?? 'Invoice',
          Quantity: 1,
          UnitAmount: Number((source.totalCents / 100).toFixed(2)),
          AccountCode: source.accountCode ?? undefined,
          TaxType: source.taxType ?? undefined,
        },
      ];

  const invoicePayload: Record<string, any> = {
    Type: 'ACCREC',
    Contact: {
      ContactID: contactResult.data.ContactID,
    },
    LineItems: lineItems,
    Status: 'DRAFT',
    LineAmountTypes: 'Exclusive',
    CurrencyCode: source.currency,
    Reference: source.reference ?? undefined,
  };

  if (source.xeroInvoiceId) invoicePayload.InvoiceID = source.xeroInvoiceId;
  if (source.invoiceNumber) invoicePayload.InvoiceNumber = source.invoiceNumber;
  const issueDate = toDateString(source.issuedAt);
  const dueDate = toDateString(source.dueAt);
  if (issueDate) invoicePayload.Date = issueDate;
  if (dueDate) invoicePayload.DueDate = dueDate;

  const result = await xeroRequest({
    accessToken: credentials.access_token,
    tenantId: credentials.tenant_id,
    method: 'POST',
    path: '/Invoices',
    body: { Invoices: [invoicePayload] },
  });
  if (!result.ok) return err(result.error.code, result.error.message, result.error.details);

  const invoice = result.data?.Invoices?.[0];
  if (!invoice?.InvoiceID) {
    return err('INTEGRATION_ERROR', 'Xero did not return an invoice ID');
  }

  return ok({
    xeroInvoiceId: invoice.InvoiceID,
    xeroStatus: invoice.Status ?? null,
    xeroUrl: buildInvoiceUrl(invoice.InvoiceID),
  });
}

export async function fetchInvoice(orgId: string, xeroInvoiceId: string): Promise<Result<XeroInvoiceStatus>> {
  const credentialsResult = await refreshTokenIfNeeded(orgId);
  if (!credentialsResult.ok) return err(credentialsResult.error.code, credentialsResult.error.message);
  const credentials = credentialsResult.data;
  if (!credentials.access_token || !credentials.tenant_id) {
    return err('VALIDATION_ERROR', 'Xero access token is missing');
  }

  const result = await xeroRequest({
    accessToken: credentials.access_token,
    tenantId: credentials.tenant_id,
    method: 'GET',
    path: `/Invoices/${xeroInvoiceId}`,
  });
  if (!result.ok) return err(result.error.code, result.error.message, result.error.details);

  const invoice = result.data?.Invoices?.[0];
  if (!invoice) return err('NOT_FOUND', 'Xero invoice not found');

  return ok({
    status: invoice.Status ?? null,
    amountDue: Number.isFinite(invoice.AmountDue) ? Number(invoice.AmountDue) : null,
    amountPaid: Number.isFinite(invoice.AmountPaid) ? Number(invoice.AmountPaid) : null,
    updatedDateUtc: invoice.UpdatedDateUTC ?? null,
  });
}

export async function updateLastSyncAt(orgId: string): Promise<void> {
  const integrationResult = await loadXeroIntegration(orgId);
  if (!integrationResult.ok || !integrationResult.data.credentials) return;
  const credentials = integrationResult.data.credentials;
  const nextCredentials = {
    ...credentials,
    last_sync_at: new Date().toISOString(),
  };
  await saveXeroCredentials({
    orgId,
    integrationId: integrationResult.data.id,
    credentials: nextCredentials,
    status: integrationResult.data.status ?? 'connected',
    enabled: integrationResult.data.enabled,
    lastError: null,
  });
}
