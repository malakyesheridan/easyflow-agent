import test from 'node:test';
import assert from 'node:assert/strict';
import { requireSession, buildSessionCookie } from '@/lib/auth/session';
import { applyJobVisibility, assertJobWriteAccess, getVisibilityMode, type RequestActor } from '@/lib/authz';
import { POST as travelTimePost } from '@/app/api/travel-time/route';
import { GET as rootApiGet } from '@/app/api/route';

test('requireSession returns unauthorized without a session cookie', async () => {
  const req = new Request('http://localhost');
  const result = await requireSession(req);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'UNAUTHORIZED');
});

test('buildSessionCookie includes Secure flag in production', () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const cookie = buildSessionCookie('token');
  process.env.NODE_ENV = original;
  assert.ok(cookie.includes('Secure'));
});

test('travel-time endpoint rejects unauthenticated requests', async () => {
  const req = new Request('http://localhost/api/travel-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin: 'Sydney', destination: 'Melbourne' }),
  });
  const res = await travelTimePost(req as any);
  const payload = await res.json();
  assert.equal(res.status, 401);
  assert.ok(typeof payload.error === 'string');
});

test('root API route rejects unauthenticated requests', async () => {
  const res = await rootApiGet(new Request('http://localhost/api'));
  const payload = await res.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'UNAUTHORIZED');
});

test('getVisibilityMode returns orgWide for admin capability', () => {
  const actor: RequestActor = {
    userId: 'user-1',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'admin',
    capabilities: ['admin'],
    isImpersonating: false,
  };

  assert.equal(getVisibilityMode(actor), 'orgWide');
});

test('getVisibilityMode returns crewScoped for non-orgWide capabilities', () => {
  const actor: RequestActor = {
    userId: 'user-2',
    orgId: 'org-1',
    crewMemberId: 'crew-2',
    roleKey: 'staff',
    capabilities: ['view_jobs', 'update_jobs'],
    isImpersonating: false,
  };

  assert.equal(getVisibilityMode(actor), 'crewScoped');
});

test('crew user cannot list jobs outside their crew', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };
  const jobs = [
    { id: 'job-1', crewId: 'crew-1' },
    { id: 'job-2', crewId: 'crew-2' },
    { id: 'job-3', crewId: null },
  ];

  const visible = applyJobVisibility(jobs, actor);
  assert.deepEqual(visible.map((job) => job.id), ['job-1']);
});

test('crew user cannot fetch another crew job detail', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_jobs'],
    isImpersonating: false,
  };
  const otherCrewJob = [{ id: 'job-2', crewId: 'crew-2' }];
  const visible = applyJobVisibility(otherCrewJob, actor);
  assert.equal(visible.length, 0);
});

test('crew user cannot update job from another crew', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['update_jobs'],
    isImpersonating: false,
  };
  const result = assertJobWriteAccess({ crewId: 'crew-2' }, actor);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'FORBIDDEN');
  }
});

test('admin can see all jobs', () => {
  const actor: RequestActor = {
    userId: 'user-admin',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'admin',
    capabilities: ['admin'],
    isImpersonating: false,
  };
  const jobs = [
    { id: 'job-1', crewId: 'crew-1' },
    { id: 'job-2', crewId: 'crew-2' },
    { id: 'job-3', crewId: null },
  ];

  const visible = applyJobVisibility(jobs, actor);
  assert.equal(visible.length, jobs.length);
});

test('admin can update any job', () => {
  const actor: RequestActor = {
    userId: 'user-admin',
    orgId: 'org-1',
    crewMemberId: null,
    roleKey: 'admin',
    capabilities: ['admin'],
    isImpersonating: false,
  };
  const result = assertJobWriteAccess({ crewId: 'crew-2' }, actor);
  assert.equal(result.ok, true);
});

test('warehouse actor does not gain orgWide access', () => {
  const actor: RequestActor = {
    userId: 'user-warehouse',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'warehouse',
    capabilities: ['manage_materials', 'view_jobs'],
    isImpersonating: false,
  };
  const jobs = [
    { id: 'job-1', crewId: 'crew-1' },
    { id: 'job-2', crewId: 'crew-2' },
  ];
  const visible = applyJobVisibility(jobs, actor);
  assert.deepEqual(visible.map((job) => job.id), ['job-1']);
});

test('operations map visibility matches crew scope', () => {
  const actor: RequestActor = {
    userId: 'user-crew',
    orgId: 'org-1',
    crewMemberId: 'crew-1',
    roleKey: 'staff',
    capabilities: ['view_schedule'],
    isImpersonating: false,
  };
  const jobs = [
    { id: 'job-1', crewId: 'crew-1' },
    { id: 'job-2', crewId: 'crew-2' },
  ];
  const visible = applyJobVisibility(jobs, actor);
  assert.deepEqual(visible.map((job) => job.id), ['job-1']);
});
