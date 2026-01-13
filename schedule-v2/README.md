# Schedule V2 - Core Scheduling Logic

This is a clean, isolated scheduling core that provides the foundation for drag-and-drop scheduling.

## Core Principles

### 1. Single Grid
- **All times are in 15-minute units**
- Travel durations are quantized UP to the nearest 15 minutes
- Job placements snap to 15-minute boundaries
- This ensures consistent alignment and prevents fractional time slots

### 2. Preview = Commit
- The preview position shown during drag is **exactly** what gets committed
- No validation, no recomputation, no fallback
- If preview shows a position, that position is valid and will be saved

### 3. Travel is Occupied Time
- Travel blocks are treated **exactly like jobs** in the occupied timeline
- You cannot place a job overlapping a travel block
- Travel blocks are derived (not persisted) and computed from assignment pairs

### 4. No Backward Snapping
- Placement only snaps **forward** (later in time)
- If you drag to 9:00 AM but there's a job at 8:30 AM, you snap to after that job
- Never snaps backward to an earlier time

## API

### `buildOccupiedTimeline(assignments, travelDurations)`

Builds a timeline of occupied blocks (jobs + travel) from assignments.

**Parameters:**
- `assignments: Assignment[]` - Array of assignments with `{ id, startMinutes, endMinutes }`
- `travelDurations: Map<string, number>` - Map of travel durations
  - Key: `"fromAssignmentId:toAssignmentId"`
  - Value: duration in minutes (will be quantized to 15-minute grid)

**Returns:**
- `OccupiedBlock[]` - Array of `{ startMinutes, endMinutes, kind: 'job' | 'travel' }`
- Sorted by `startMinutes`

**Rules:**
- Travel blocks are only inserted between consecutive assignments
- Travel duration is quantized UP to nearest 15 minutes
- Travel blocks never overlap the next assignment
- Travel blocks are only created if they don't fully consume the gap

### `resolvePlacement({ desiredStartMinutes, durationMinutes, occupiedTimeline })`

Resolves the final placement position with snap-forward logic.

**Parameters:**
- `desiredStartMinutes: number` - Where user wants to place the job
- `durationMinutes: number` - Duration of the job
- `occupiedTimeline: OccupiedBlock[]` - Timeline from `buildOccupiedTimeline`
- `workdayEndMinutes?: number` - End of workday (default: 720 = 6 PM)

**Returns:**
- `{ startMinutes: number | null, snapDelta: number, snapReason: 'travel' | 'job' | 'out_of_bounds' | null }`
  - `startMinutes`: Resolved position (null if out of bounds)
  - `snapDelta`: How many minutes forward the job was snapped
  - `snapReason`: Why snapping occurred (null if no snap)

**Rules:**
- Snaps forward only (never backward)
- Overlap check: `start < block.endMinutes && end > block.startMinutes`
- Returns `null` if placement would exceed `workdayEndMinutes`

## Usage Example

```typescript
import { buildOccupiedTimeline } from './schedule-v2/timeline';
import { resolvePlacement } from './schedule-v2/placement';

// Build timeline
const assignments = [
  { id: 'a1', startMinutes: 0, endMinutes: 120 },    // 6:00-8:00
  { id: 'a2', startMinutes: 180, endMinutes: 240 }, // 9:00-10:00
];

const travelDurations = new Map([
  ['a1:a2', 45], // 45 minutes travel from a1 to a2
]);

const timeline = buildOccupiedTimeline(assignments, travelDurations);
// Result: [
//   { startMinutes: 0, endMinutes: 120, kind: 'job' },
//   { startMinutes: 120, endMinutes: 165, kind: 'travel' }, // 45 min quantized
//   { startMinutes: 180, endMinutes: 240, kind: 'job' },
// ]

// Resolve placement
const result = resolvePlacement({
  desiredStartMinutes: 100, // User wants 7:40 AM
  durationMinutes: 60,      // 1 hour job
  occupiedTimeline: timeline,
});

// Result: {
//   startMinutes: 165,  // Snapped to after travel block
//   snapDelta: 65,      // Moved forward 65 minutes
//   snapReason: 'travel'
// }
```

## Testing

This module is designed to be testable in the browser console:

```javascript
// Import in browser console (after building)
import { buildOccupiedTimeline, resolvePlacement } from './schedule-v2/timeline';

// Test timeline building
const assignments = [
  { id: '1', startMinutes: 0, endMinutes: 120 },
  { id: '2', startMinutes: 180, endMinutes: 240 },
];
const travel = new Map([['1:2', 45]]);
const timeline = buildOccupiedTimeline(assignments, travel);
console.log(timeline);

// Test placement resolution
const result = resolvePlacement({
  desiredStartMinutes: 100,
  durationMinutes: 60,
  occupiedTimeline: timeline,
});
console.log(result);
```

## Design Decisions

1. **15-minute grid**: Ensures all times align to a consistent grid, preventing fractional slots
2. **Travel quantization UP**: Ensures travel time is never underestimated
3. **Travel only between consecutive jobs**: Prevents travel blocks in empty gaps
4. **Inclusive overlap boundaries**: Adjacent blocks (touching) don't overlap
5. **Forward-only snapping**: User intent is preserved (never moves backward)
6. **No validation**: Preview position is authoritative - if it exists, it's valid

## Future Extensions

This core can be extended with:
- Workday start bounds (currently assumes 0 = midnight)
- Multiple crew support (currently single crew)
- Assignment exclusion (for drag operations)
- Placement window computation (pre-computed valid slots)

But the core principles remain: single grid, preview = commit, travel is occupied, no backward snapping.

