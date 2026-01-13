import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequestActor } from '@/lib/authz';
import { canAccessClientsRoutes } from '@/lib/auth/routeAccess';
import { isClientInOrg } from '@/lib/clients/validation';
import { resolveInvoiceClient } from '@/lib/invoices/document';

test('crew cannot access clients routes', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };
  assert.equal(canAccessClientsRoutes(actor), false);
});

test('admin can access clients routes', () => {
  const actor: RequestActor = {
    userId: 'user-admin',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'admin',
    capabilities: ['admin'],
    isImpersonating: false,
  };
  assert.equal(canAccessClientsRoutes(actor), true);
});

test('manager can access clients routes', () => {
  const actor: RequestActor = {
    userId: 'user-manager',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'manager',
    capabilities: ['manage_jobs'],
    isImpersonating: false,
  };
  assert.equal(canAccessClientsRoutes(actor), true);
});

test('org managers can access clients routes', () => {
  const actor: RequestActor = {
    userId: 'user-org',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'manager',
    capabilities: ['manage_org'],
    isImpersonating: false,
  };
  assert.equal(canAccessClientsRoutes(actor), true);
});

test('client org validation rejects mismatches', () => {
  assert.equal(isClientInOrg('org-1', 'org-1'), true);
  assert.equal(isClientInOrg('org-2', 'org-1'), false);
  assert.equal(isClientInOrg(null, 'org-1'), false);
});

test('invoice client resolver prefers client record over job contact', () => {
  const resolved = resolveInvoiceClient({
    clientRecord: { displayName: 'Acme Co', email: 'billing@acme.co', phone: '0400' },
    clientContact: { name: 'Fallback Contact', email: 'fallback@acme.co', phone: '0500' },
  });
  assert.equal(resolved?.name, 'Acme Co');
  assert.equal(resolved?.email, 'billing@acme.co');
});

test('invoice client resolver falls back to job contact when no client record', () => {
  const resolved = resolveInvoiceClient({
    clientRecord: null,
    clientContact: { name: 'Fallback Contact', email: 'fallback@acme.co', phone: '0500' },
  });
  assert.equal(resolved?.name, 'Fallback Contact');
  assert.equal(resolved?.email, 'fallback@acme.co');
});
