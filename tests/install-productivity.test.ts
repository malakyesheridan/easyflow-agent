import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComplexityMultiplier,
  computeQualityMultiplier,
  computeJobMetrics,
  computeEmployeePeriodMetrics,
  type TimeEntry,
} from '@/lib/metrics/installProductivity';
import { resolveMetricKey, computeMetricValue, getMetricDefinition } from '@/lib/metrics/installProductivityInsights';
import { GET as installProductivityGet } from '@/app/api/install-productivity/route';

function almostEqual(actual: number, expected: number, tolerance = 0.0001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);
}

test('complexity multiplier interpolates linearly', () => {
  almostEqual(computeComplexityMultiplier(2.5), 1.175);
  almostEqual(computeComplexityMultiplier(1), 1);
  almostEqual(computeComplexityMultiplier(5), 1.75);
});

test('quality multiplier mapping matches thresholds', () => {
  assert.equal(computeQualityMultiplier(96), 1);
  assert.equal(computeQualityMultiplier(92), 0.97);
  assert.equal(computeQualityMultiplier(85), 0.9);
  assert.equal(computeQualityMultiplier(70), 0.75);
});

test('job metrics use bucketed person-minutes and net accepted m2', () => {
  const start = new Date('2026-01-01T08:00:00Z');
  const mid = new Date('2026-01-01T08:30:00Z');
  const end = new Date('2026-01-01T09:00:00Z');
  const entries: TimeEntry[] = [
    { jobId: 'job-1', crewMemberId: 'crew-1', bucket: 'INSTALL', startTime: start, endTime: mid },
    { jobId: 'job-1', crewMemberId: 'crew-2', bucket: 'INSTALL', startTime: mid, endTime: end },
    { jobId: 'job-1', crewMemberId: 'crew-1', bucket: 'SETUP', minutes: 15 },
    { jobId: 'job-1', crewMemberId: 'crew-2', bucket: 'WAITING', minutes: 15, delayReason: 'DELIVERY_LATE_OR_WRONG' },
  ];

  const metrics = computeJobMetrics({ acceptedM2: 10, reworkM2: 2 }, entries);
  assert.equal(metrics.installPersonMinutes, 60);
  assert.equal(metrics.onsitePersonMinutes, 90);
  assert.equal(metrics.crewInstallWindowMinutes, 60);
  almostEqual(metrics.nir, 8 / 60);
  almostEqual(metrics.str, 8 / 90);
  almostEqual(metrics.cir, 8 / 60);
  assert.equal(metrics.waitingMinutesByReason.DELIVERY_LATE_OR_WRONG, 15);
});

test('employee attribution uses install-minute share across jobs', () => {
  const entries: TimeEntry[] = [
    { jobId: 'job-1', crewMemberId: 'crew-1', bucket: 'INSTALL', minutes: 60, createdAt: '2026-01-02T09:00:00Z' },
    { jobId: 'job-1', crewMemberId: 'crew-2', bucket: 'INSTALL', minutes: 30, createdAt: '2026-01-02T09:30:00Z' },
  ];

  const results = computeEmployeePeriodMetrics({
    jobs: [{ id: 'job-1', acceptedM2: 12, reworkM2: 0 }],
    entries,
    dateRange: { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-03T00:00:00Z') },
  });

  const crew1 = results.find((row) => row.crewMemberId === 'crew-1');
  const crew2 = results.find((row) => row.crewMemberId === 'crew-2');
  assert.ok(crew1);
  assert.ok(crew2);
  almostEqual(crew1?.attributedM2 ?? 0, 8);
  almostEqual(crew2?.attributedM2 ?? 0, 4);
  almostEqual(crew1?.nir ?? 0, 8 / 60);
  almostEqual(crew2?.nir ?? 0, 4 / 30);
});

test('edge cases: zero minutes yields zero rates and flags unbucketed time', () => {
  const entries: TimeEntry[] = [
    { jobId: 'job-2', crewMemberId: 'crew-1', minutes: 30, createdAt: '2026-01-04T09:00:00Z' },
  ];

  const metrics = computeJobMetrics({ acceptedM2: 5 }, entries);
  assert.equal(metrics.installPersonMinutes, 0);
  assert.equal(metrics.nir, 0);
  assert.ok(metrics.flags.some((flag) => flag.code === 'UNBUCKETED_TIME'));
});

test('metric key resolver accepts known keys and metric values map correctly', () => {
  assert.equal(resolveMetricKey('NIR'), 'nir');
  assert.equal(resolveMetricKey('waiting_pct'), 'waiting_pct');
  const metrics = computeJobMetrics({ acceptedM2: 5 }, [
    { jobId: 'job-1', crewMemberId: 'crew-1', bucket: 'INSTALL', minutes: 50 },
    { jobId: 'job-1', crewMemberId: 'crew-1', bucket: 'WAITING', minutes: 10, delayReason: 'WEATHER' },
  ]);
  const waitingValue = computeMetricValue(metrics, 'waiting_pct');
  assert.equal(waitingValue, metrics.waitingMinutesPct);
  const def = getMetricDefinition('nir');
  assert.equal(def.label, 'Net Install Rate');
});

test('install-productivity endpoint rejects unauthenticated requests', async () => {
  const req = new Request('http://localhost/api/install-productivity?orgId=org-1&jobId=job-1');
  const res = await installProductivityGet(req as any);
  const payload = await res.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, 'UNAUTHORIZED');
});
