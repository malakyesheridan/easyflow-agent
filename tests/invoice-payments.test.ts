import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInvoiceTotals, deriveInvoiceStatus } from '@/lib/financials/invoiceState';
import { canManageJobs, type RequestActor } from '@/lib/authz';
import { shouldSkipStripePaymentUpdate } from '@/lib/integrations/stripeWebhook';

test('deriveInvoiceStatus handles partial payments', () => {
  const now = new Date('2025-01-10T00:00:00Z');
  const derived = deriveInvoiceStatus({
    invoice: {
      status: 'issued',
      totalCents: 10000,
      dueAt: new Date('2025-01-20T00:00:00Z'),
      paidAt: null,
    },
    payments: [
      {
        status: 'succeeded',
        amountCents: 3000,
        paidAt: new Date('2025-01-05T00:00:00Z'),
        createdAt: new Date('2025-01-05T00:00:00Z'),
      },
      {
        status: 'succeeded',
        amountCents: 2000,
        createdAt: new Date('2025-01-06T00:00:00Z'),
      },
      {
        status: 'failed',
        amountCents: 5000,
        createdAt: new Date('2025-01-07T00:00:00Z'),
      },
    ],
    now,
  });

  assert.equal(derived.status, 'partially_paid');
  assert.equal(derived.paidCents, 5000);
  assert.equal(derived.outstandingCents, 5000);
  assert.equal(derived.isOverdue, false);
  assert.equal(derived.paidAt, null);
});

test('deriveInvoiceStatus keeps draft invoices as draft', () => {
  const now = new Date('2025-01-10T00:00:00Z');
  const derived = deriveInvoiceStatus({
    invoice: {
      status: 'draft',
      totalCents: 15000,
      dueAt: null,
      paidAt: null,
    },
    payments: [],
    now,
  });

  assert.equal(derived.status, 'draft');
  assert.equal(derived.paidCents, 0);
});

test('deriveInvoiceStatus marks invoice paid after multiple payments', () => {
  const now = new Date('2025-01-10T00:00:00Z');
  const lastPaidAt = new Date('2025-01-06T00:00:00Z');
  const derived = deriveInvoiceStatus({
    invoice: {
      status: 'issued',
      totalCents: 10000,
      dueAt: new Date('2025-01-20T00:00:00Z'),
      paidAt: null,
    },
    payments: [
      {
        status: 'succeeded',
        amountCents: 7000,
        createdAt: new Date('2025-01-05T00:00:00Z'),
      },
      {
        status: 'paid',
        amountCents: 3000,
        paidAt: lastPaidAt,
        createdAt: new Date('2025-01-06T00:00:00Z'),
      },
    ],
    now,
  });

  assert.equal(derived.status, 'paid');
  assert.equal(derived.paidCents, 10000);
  assert.equal(derived.outstandingCents, 0);
  assert.equal(derived.isOverdue, false);
  assert.equal(derived.paidAt?.toISOString(), lastPaidAt.toISOString());
});

test('computeInvoiceTotals calculates tax from rates', () => {
  const totals = computeInvoiceTotals({
    lineItems: [
      { description: 'Labour', quantity: 2, unitPriceCents: 5000, taxRate: 10 },
      { description: 'Materials', quantity: 1, unitPriceCents: 2500, taxRate: 0 },
    ],
  });

  assert.equal(totals.subtotalCents, 12500);
  assert.equal(totals.taxCents, 1000);
  assert.equal(totals.totalCents, 13500);
  assert.equal(totals.lineItems?.length, 2);
});

test('deriveInvoiceStatus flags overdue balance', () => {
  const now = new Date('2025-02-01T00:00:00Z');
  const derived = deriveInvoiceStatus({
    invoice: {
      status: 'issued',
      totalCents: 8000,
      dueAt: new Date('2025-01-15T00:00:00Z'),
      paidAt: null,
    },
    payments: [],
    now,
  });

  assert.equal(derived.status, 'overdue');
  assert.equal(derived.outstandingCents, 8000);
  assert.equal(derived.isOverdue, true);
});

test('crew users cannot manage payments', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'crew',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };

  assert.equal(canManageJobs(actor), false);
});

test('managers can manage invoices', () => {
  const actor: RequestActor = {
    userId: 'user-manager',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'manager',
    capabilities: ['manage_jobs'],
    isImpersonating: false,
  };

  assert.equal(canManageJobs(actor), true);
});

test('stripe webhook skips duplicate succeeded payments', () => {
  assert.equal(shouldSkipStripePaymentUpdate('succeeded'), true);
  assert.equal(shouldSkipStripePaymentUpdate('pending'), false);
  assert.equal(shouldSkipStripePaymentUpdate(null), false);
});
