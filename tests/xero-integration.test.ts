import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequestActor } from '@/lib/authz';
import { canAccessIntegrationsRoutes } from '@/lib/auth/routeAccess';
import { buildXeroOAuthState, parseXeroOAuthState } from '@/lib/integrations/xero';
import { shouldSyncInvoicesToXero } from '@/lib/integrations/xeroSync';
import { deriveLocalInvoiceStatusFromXero, isStripeSourceOfTruth } from '@/lib/integrations/actions/xero';

test('crew cannot access integrations routes', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };
  assert.equal(canAccessIntegrationsRoutes(actor), false);
});

test('admin can access integrations routes', () => {
  const actor: RequestActor = {
    userId: 'user-admin',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'admin',
    capabilities: ['admin'],
    isImpersonating: false,
  };
  assert.equal(canAccessIntegrationsRoutes(actor), true);
});

test('xero oauth state encodes org scope', () => {
  const original = process.env.INTEGRATION_CREDENTIALS_KEY;
  process.env.INTEGRATION_CREDENTIALS_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const state = buildXeroOAuthState('org-123');
  const parsed = parseXeroOAuthState(state);
  if (!parsed.ok) {
    throw new Error('Expected state to parse');
  }
  assert.equal(parsed.data.orgId, 'org-123');
  if (original === undefined) {
    delete process.env.INTEGRATION_CREDENTIALS_KEY;
  } else {
    process.env.INTEGRATION_CREDENTIALS_KEY = original;
  }
});

test('syncInvoicesToXero requires enabled connected integration', () => {
  assert.equal(shouldSyncInvoicesToXero(null), false);
  assert.equal(
    shouldSyncInvoicesToXero({ id: '1', enabled: true, status: 'connected' }),
    true
  );
  assert.equal(
    shouldSyncInvoicesToXero({ id: '1', enabled: false, status: 'connected' }),
    false
  );
});

test('stripe source of truth blocks xero status sync', () => {
  assert.equal(isStripeSourceOfTruth([{ provider: 'stripe' }]), true);
  assert.equal(
    isStripeSourceOfTruth([{ provider: 'external', stripePaymentLinkId: 'pl_123' }]),
    true
  );
  assert.equal(isStripeSourceOfTruth([{ provider: 'external' }]), false);
});

test('xero payment status maps to local status', () => {
  const paid = deriveLocalInvoiceStatusFromXero({
    status: 'PAID',
    amountDue: 0,
    amountPaid: 100,
    updatedDateUtc: '2025-01-01T00:00:00Z',
  });
  assert.equal(paid?.status, 'paid');

  const partial = deriveLocalInvoiceStatusFromXero({
    status: 'AUTHORISED',
    amountDue: 50,
    amountPaid: 50,
    updatedDateUtc: null,
  });
  assert.equal(partial?.status, 'partially_paid');
});
