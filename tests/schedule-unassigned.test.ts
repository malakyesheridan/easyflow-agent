import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAllOverlaps } from '@/lib/utils/scheduleConflicts';

test('detectAllOverlaps ignores unassigned assignments', () => {
  const assignments = [
    { id: 'a1', crewId: null, startMinutes: 0, endMinutes: 60 },
    { id: 'a2', crewId: null, startMinutes: 30, endMinutes: 90 },
    { id: 'a3', crewId: 'crew-1', startMinutes: 0, endMinutes: 60 },
    { id: 'a4', crewId: 'crew-1', startMinutes: 30, endMinutes: 90 },
  ] as any;

  const overlaps = detectAllOverlaps(assignments);

  assert.equal(overlaps.has('a1'), false);
  assert.equal(overlaps.has('a2'), false);
  assert.deepEqual(overlaps.get('a3'), ['a4']);
  assert.deepEqual(overlaps.get('a4'), ['a3']);
});
