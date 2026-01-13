import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequestActor } from '@/lib/authz';
import { getSurface } from '@/lib/surface';
import { canAccessFinancials, canAccessOperationsIntelligence, canAccessSettingsRoutes } from '@/lib/auth/routeAccess';
import { CREW_JOB_DETAIL_FIELDS } from '@/lib/queries/job_detail';

test('admin actor sees admin surface on desktop', () => {
  const actor: RequestActor = {
    userId: 'user-admin',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'admin',
    capabilities: ['admin'],
    isImpersonating: false,
  };
  assert.equal(getSurface(actor, { isMobile: false }), 'admin');
});

test('staff actor sees crew surface on mobile', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };
  assert.equal(getSurface(actor, { isMobile: true }), 'crew');
});

test('crew payload does not include financial fields', () => {
  const forbidden = new Set([
    'estimatedRevenueCents',
    'estimatedCostCents',
    'targetMarginPercent',
    'revenueOverrideCents',
    'profitabilityStatus',
  ]);

  for (const field of forbidden) {
    assert.equal(CREW_JOB_DETAIL_FIELDS.includes(field as any), false);
  }
});

test('crew actor cannot access settings/comms routes', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };
  assert.equal(canAccessSettingsRoutes(actor), false);
});

test('admin actor can access settings/comms routes', () => {
  const actor: RequestActor = {
    userId: 'user-admin',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'admin',
    capabilities: ['admin'],
    isImpersonating: false,
  };
  assert.equal(canAccessSettingsRoutes(actor), true);
});

test('crew actor cannot access financial endpoints via direct URL', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };
  assert.equal(canAccessFinancials(actor), false);
});

test('crew actor cannot access operations intelligence', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_schedule'],
    isImpersonating: false,
  };
  assert.equal(canAccessOperationsIntelligence(actor), false);
});
