// The one number the crab is measured by (drive.js), as arithmetic.
//
// Nothing here touches a file, a transcript or the host: the module is a function of its arguments,
// which is what lets the figures below be checked against the kernel by hand rather than against
// whatever the machine running the tests happens to have in ~/.claude.
//
// WHAT IS PINNED, and why each one cost something to get wrong:
//   1. the kernel is the kernel: an empty hour is zero, one cell is cost/tau, and an age of a whole
//      tau is one e down. A boxcar average would pass none of these.
//   2. the hour is the hour. A cell that has fallen out of it is gone, and a full re-parse of a
//      300MB transcript pouring the whole file in is exactly the fault that window is there to stop.
//   3. ONE REPLY MAY NOT CHANGE THE CRAB. The biggest single reply ever measured on this account
//      ($4.22) makes a drive that does not reach the second rung. This is the whole reason tau is
//      ten minutes and not five, so it is a test and not a comment.
//   4. the tier scales the SCALE and nothing else, and an unreadable tier reads as the calmest one.
//   5. two windows reading the same ring at the same instant get the same number. The ring is
//      merged out of per-transcript cells, so the order they are merged in may not show.
//   6. the budget is weekly.js's own figure and not a second copy of it.
'use strict';
const assert = require('assert/strict');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const drive = require(path.join(ROOT, 'drive.js'));
const weekly = require(path.join(ROOT, 'weekly.js'));

let fails = 0;
function test(name, fn) {
  try { fn(); console.log('PASS ' + name); }
  catch (e) { fails++; console.log('FAIL ' + name + '  | ' + (e && e.message)); }
}
// the figures are floating point, so they are compared to a tolerance rather than for equality
function near(a, b, eps, why) {
  assert.ok(Math.abs(a - b) <= (eps || 1e-9), (why || '') + ' got ' + a + ', wanted ' + b);
}

// A fixed instant, on a cell boundary, so "one cell ago" is exactly one cell and not a rounding
const NOW = drive.bucketOf(Date.UTC(2026, 10, 24, 12, 0, 0)) * drive.BUCKET_MS;
const cellsAgo = (n) => NOW - n * drive.BUCKET_MS;
const TAU = drive.TAU_MIN;                        // 10 minutes

// ---------------------------------------------------------------------------------------------
// 1. the kernel
// ---------------------------------------------------------------------------------------------
test('an empty hour is no work at all', () => {
  assert.equal(drive.ratePerMin(drive.emptyRing(), NOW), 0);
  assert.equal(drive.of(drive.emptyRing(), NOW, 'max_20x'), 0);
});

test('one cell at this instant is its cost over tau', () => {
  const ring = drive.add(drive.emptyRing(), NOW, 3, NOW);
  near(drive.ratePerMin(ring, NOW), 3 / TAU, 1e-12, 'cost/tau');
});

test('and a whole tau back is one e down', () => {
  const ring = drive.add(drive.emptyRing(), cellsAgo(60), 3, NOW);   // 60 cells = 10 minutes = tau
  near(drive.ratePerMin(ring, NOW), (3 / TAU) * Math.E ** -1, 1e-12, 'cost/tau/e');
});

test('two cells add, each at its own age', () => {
  const ring = drive.emptyRing();
  drive.add(ring, NOW, 1, NOW);
  drive.add(ring, cellsAgo(30), 2, NOW);                             // 5 minutes = half a tau
  near(drive.ratePerMin(ring, NOW), (1 + 2 * Math.exp(-0.5)) / TAU, 1e-12);
});

test('work from several transcripts in one cell is more work, not the same work', () => {
  const a = drive.add(drive.emptyRing(), NOW, 1, NOW);
  const b = drive.add(drive.emptyRing(), NOW, 1, NOW);
  const ring = drive.merge(drive.merge(drive.emptyRing(), a), b);
  near(drive.ratePerMin(ring, NOW), 2 / TAU, 1e-12, 'two sessions answering at once');
});

test('a cost of nothing is not an event, and neither is a negative one', () => {
  const ring = drive.emptyRing();
  drive.add(ring, NOW, 0, NOW);
  drive.add(ring, NOW, -5, NOW);
  assert.deepEqual(ring, {}, 'no cell was opened');
  assert.equal(drive.ratePerMin(ring, NOW), 0);
});

// A CELL WITH NO CLOCK BEHIND IT IS REFUSED, not trusted. Without one the cell came out as the
// string "NaN", which is a key no window contains and no trim removes, so one bad call left a ring
// that was wrong for as long as it lived. Losing the reply reads as a quieter machine instead
test('a reply with no clock, or no timestamp, opens no cell at all', () => {
  const ring = drive.emptyRing();
  drive.add(ring, NOW, 3);                        // the clock left out
  drive.add(ring, NOW, 3, undefined);
  drive.add(ring, NaN, 3, NOW);                   // an unparseable timestamp
  assert.deepEqual(ring, {}, JSON.stringify(ring));
  assert.equal(drive.ratePerMin(ring, NOW), 0, 'and nothing it holds can be a figure');
});

// A timestamp ahead of this clock is real work (two machines writing one directory, or a clock that
// was just corrected), so it counts, and it counts as happening NOW: the most it can ever be worth
test('a reply stamped in the future counts, and never for more than one at this instant', () => {
  const future = drive.add(drive.emptyRing(), NOW + 5 * drive.BUCKET_MS, 3, NOW);
  const nowRing = drive.add(drive.emptyRing(), NOW, 3, NOW);
  near(drive.ratePerMin(future, NOW), drive.ratePerMin(nowRing, NOW), 1e-12);
  assert.deepEqual(Object.keys(future), Object.keys(nowRing), 'it was filed in the present cell');
});

// AND IT DECAYS LIKE EVERYTHING ELSE, which is the whole reason it is filed in the present rather
// than where it was stamped. Filed in the future it is outside every window `trim` cuts, so it sits
// at age zero for as long as the skew lasts: measured on the first version of this module, one
// $4.22 reply stamped a day ahead read as a drive of 1.55 for a whole day of an idle machine, and a
// handful of them would have pinned the crab to the top rung with nothing running at all
test('a reply from a badly skewed clock ages out instead of staying at the top for ever', () => {
  const skew = 24 * 60 * drive.BUCKET_MS * 6;             // a day ahead
  const ring = drive.add(drive.emptyRing(), NOW + skew, 4.22, NOW);
  near(drive.of(ring, NOW, 'max_20x'), 1.5486, 5e-4, 'at the instant it was read');
  // an hour later it has left the ring, exactly as a reply stamped honestly would have
  const later = NOW + drive.KEEP_MS;
  drive.trim(ring, later);
  assert.deepEqual(ring, {}, 'an hour on, the ring still holds it');
  assert.equal(drive.of(ring, later, 'max_20x'), 0);
});

// ...and the other way the clock can move, which accrual cannot pin: a cell filed honestly and then
// left behind by a clock that went BACKWARDS. It would read at age zero until the clock caught up,
// which is the same fault arriving from the other side, so the window cuts both ends
test('a cell the clock has moved behind is cut, not held at the top', () => {
  const ring = drive.add(drive.emptyRing(), NOW, 4.22, NOW);
  const back = NOW - 3 * 60 * 60 * 1000;                  // the clock jumped three hours back
  drive.trim(ring, back);
  assert.deepEqual(ring, {}, 'the cell is still in the ring after the clock moved behind it');
});

// ---------------------------------------------------------------------------------------------
// 2. the hour
// ---------------------------------------------------------------------------------------------
test('the hour is 360 ten-second cells', () => {
  assert.equal(drive.BUCKET_MS, 10000);
  assert.equal(drive.CELLS, 360);
  assert.equal(drive.KEEP_MS, 3600000);
});

test('work from outside the hour is not counted', () => {
  const inside = drive.add(drive.emptyRing(), cellsAgo(drive.CELLS - 1), 100, NOW);
  const outside = drive.add(drive.emptyRing(), cellsAgo(drive.CELLS), 100, NOW);
  assert.ok(drive.ratePerMin(inside, NOW) > 0, 'the oldest cell the hour holds is still work');
  assert.equal(drive.ratePerMin(outside, NOW), 0, 'one cell further back is not');
});

// THE REGRESSION THIS WINDOW EXISTS FOR. A transcript is re-read from byte zero when the day rolls
// or the file shrinks, and the real ones run to hundreds of MB: a day of cells poured into the ring
// would make a crab that reads yesterday's night shift
test('a full re-read of a long transcript leaves only the last hour in the ring', () => {
  const ring = drive.emptyRing();
  for (let i = 0; i < 8640; i++) drive.add(ring, cellsAgo(i), 1, NOW);   // 24 hours of cells
  assert.equal(Object.keys(ring).length, 8640);
  drive.trim(ring, NOW);
  assert.equal(Object.keys(ring).length, drive.CELLS, 'the hour and nothing else');
  // ...and trimming changes no figure, because what it removed was already weighing nothing
  const kept = drive.ratePerMin(ring, NOW);
  const whole = drive.emptyRing();
  for (let i = 0; i < 8640; i++) drive.add(whole, cellsAgo(i), 1, NOW);
  near(kept, drive.ratePerMin(whole, NOW), 1e-12, 'the trim is memory, not arithmetic');
});

test('and trimming a ring that is all inside the hour removes nothing', () => {
  const ring = drive.add(drive.emptyRing(), cellsAgo(10), 1, NOW);
  drive.trim(ring, NOW);
  assert.deepEqual(Object.keys(ring), [String(drive.bucketOf(cellsAgo(10)))]);
});

// ---------------------------------------------------------------------------------------------
// 3. ONE REPLY MAY NOT CHANGE THE CRAB
// ---------------------------------------------------------------------------------------------
// The rungs are 2.0 / 3.3 / 5.0 (webview.js, DRIVE_STEPS) and the drawings either side of 2.0 are
// the two a reader sees most, so a single reply landing in the bottom rung and taking the crab up a
// rung with it would be the crab changing on one answer. Measured on this account: median $0.101,
// p99 $0.45, maximum $4.22
test('the biggest single reply ever measured does not reach the second rung', () => {
  const ring = drive.add(drive.emptyRing(), NOW, 4.22, NOW);
  const v = drive.of(ring, NOW, 'max_20x');
  near(v, 1.5486, 5e-4, 'the $4.22 reply');
  assert.ok(v < 2.0, 'it is inside the bottom rung: ' + v);
});

test('and at a tau of five minutes it would have, which is why tau is ten', () => {
  // the same arithmetic with the decay halved, written out rather than by moving the module's own
  // constant: what is being shown is that the figure chosen was chosen against this
  const even = drive.budgetFor('max_20x') / drive.WEEK_MINUTES;
  near((4.22 / 5) / even, 3.0972, 5e-4);
  assert.ok((4.22 / 5) / even > 3.3 * 0.8, 'it would stand above the third rung’s own lower edge');
});

test('a typical reply is nowhere near a rung', () => {
  const ring = drive.add(drive.emptyRing(), NOW, 0.101, NOW);
  assert.ok(drive.of(ring, NOW, 'max_20x') < 0.1, 'the median reply: ' + drive.of(ring, NOW, 'max_20x'));
});

// ...and the scale's one meaningful point: spending the week exactly evenly is 1.0. An hour of that
// pace is the weekly budget over 168 hours, laid down evenly over the hour's cells
test('spending the week evenly reads as 1.0', () => {
  const perCell = drive.budgetFor('max_20x') / drive.WEEK_MINUTES * (drive.BUCKET_MS / 60000);
  const ring = drive.emptyRing();
  for (let i = 0; i < drive.CELLS; i++) drive.add(ring, cellsAgo(i), perCell, NOW);
  // NOT EXACTLY 1.0, AND THE GAP IS BOTH KNOWN AND SMALL. The kernel divides by tau, which is the
  // integral of a continuous decay; the ring is 360 discrete cells, and summing them reads 0.59%
  // high, against which the hour's cut at e^-6 takes 0.25% back. 1.006 is the answer and the
  // tolerance here is what says the remainder is arithmetic and not a wrong scale
  near(drive.of(ring, NOW, 'max_20x'), 1.0059, 1e-3, 'an evenly spent hour');
});

// ---------------------------------------------------------------------------------------------
// 4. the tier
// ---------------------------------------------------------------------------------------------
test('the weekly budget is one hundred points of the limit at weekly.js’s own rate', () => {
  const ref = weekly._internal.REFERENCE_RATE;
  for (const tier of Object.keys(drive.WEEK_BUDGET)) {
    assert.ok(ref[tier], 'weekly.js knows the tier ' + tier);
    near(drive.WEEK_BUDGET[tier], 100 / ref[tier], 1e-9, tier);
  }
  assert.deepEqual(Object.keys(drive.WEEK_BUDGET).sort(), Object.keys(ref).sort(),
    'the same three tiers, so a fourth cannot appear in one file only');
});

test('the same work on a smaller plan is a bigger drive, by the ratio of the two limits', () => {
  const ring = drive.add(drive.emptyRing(), NOW, 1, NOW);
  const big = drive.of(ring, NOW, 'max_20x');
  near(drive.of(ring, NOW, 'max_5x') / big, 4, 1e-6, 'Max 5x is a quarter of the allowance');
  near(drive.of(ring, NOW, 'pro') / big, 20, 1e-6, 'Pro is a twentieth of it');
});

test('a tier that could not be read reads as the largest allowance, which is the calm answer', () => {
  const ring = drive.add(drive.emptyRing(), NOW, 1, NOW);
  const top = drive.of(ring, NOW, 'max_20x');
  for (const unknown of ['', null, undefined, 'Ultra', 'nonsense']) {
    near(drive.of(ring, NOW, unknown), top, 1e-12, JSON.stringify(unknown));
  }
  // and it is the calm one: every tier this extension knows reads the same work as harder
  for (const tier of Object.keys(drive.WEEK_BUDGET)) {
    assert.ok(drive.of(ring, NOW, tier) >= top - 1e-12, tier + ' is not calmer than the fallback');
  }
});

// ---------------------------------------------------------------------------------------------
// 5. two windows, one ring
// ---------------------------------------------------------------------------------------------
// Every window gets the SAME field off the same push, so this is really a check that the number is
// a function of its arguments: no clock of its own, no memory between calls, and no dependence on
// the order the per-transcript cells were merged in
test('the same ring and the same instant are the same number, however it was built', () => {
  const parts = [
    { t: cellsAgo(0), c: 0.4 }, { t: cellsAgo(17), c: 1.1 },
    { t: cellsAgo(200), c: 0.2 }, { t: cellsAgo(17), c: 0.9 }
  ];
  const forward = drive.emptyRing();
  for (const p of parts) drive.add(forward, p.t, p.c, NOW);
  const backward = drive.emptyRing();
  for (const p of parts.slice().reverse()) drive.add(backward, p.t, p.c, NOW);
  // ...and the same thing merged one transcript at a time
  const merged = drive.emptyRing();
  for (const p of parts) drive.merge(merged, drive.add(drive.emptyRing(), p.t, p.c, NOW));
  const a = drive.of(forward, NOW, 'max_20x');
  near(drive.of(backward, NOW, 'max_20x'), a, 1e-12, 'built in the other order');
  near(drive.of(merged, NOW, 'max_20x'), a, 1e-12, 'merged rather than added');
  near(drive.of(forward, NOW, 'max_20x'), a, 1e-12, 'asked twice');
});

// Integer cell indexes and plain numbers, which is what keeps the ring a thing that can be written
// down: an accumulator held across a reload, a figure in a log, a line in a bug report. Nothing
// sends one anywhere today (collect() pushes the one number, not the ring), and this is the cost of
// keeping that option open rather than a property anything currently relies on
test('and a ring survives JSON, so it can be stored or written down without changing', () => {
  const ring = drive.emptyRing();
  drive.add(ring, cellsAgo(3), 0.7, NOW);
  drive.add(ring, cellsAgo(90), 0.3, NOW);
  const copy = JSON.parse(JSON.stringify(ring));
  near(drive.of(copy, NOW, 'max_20x'), drive.of(ring, NOW, 'max_20x'), 1e-12);
});

if (fails) { console.log('\n' + fails + ' FAILED'); process.exit(1); }
console.log('\nALL PASS');
