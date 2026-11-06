// The plinko board: the cups, the three risk tables, the walk, the integer payout, and what the
// house keeps. No dependencies: node's assert only. Run: node test/plinko.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const pl = require(path.join(__dirname, '..', 'plinko.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const ROWS = pl.ROWS;
const BINS = pl.BINS;
const DEN = pl.DEN;
const V = (st) => pl.view(st);
const snapshot = (st) => JSON.stringify(st);
const drop = (opts) => pl.newRound(Object.assign({ seed: 'x', bet: 10, risk: 'mild' }, opts));
// A drop pinned to a cup: `bin` rights, then lefts, which is a real walk of twelve bounces
const toBin = (bin, risk, bet) => pl.newRound({
  seed: 'pinned', bet: bet == null ? 10 : bet, risk: risk || 'mild',
  path: Array.from({ length: ROWS }, (_, i) => (i < bin ? 1 : 0))
});

const pct = (x) => (x * 100).toFixed(4) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');

// --- the board ----------------------------------------------------------------------------

test('twelve rows of pins make thirteen cups, and the cups are Pascal\'s row', () => {
  assert.equal(ROWS, 12);
  assert.equal(BINS, 13);
  assert.deepEqual(pl.WAYS.slice(), [1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1]);
  assert.equal(pl.PATHS, 4096);
  assert.equal(pl.PATHS, 2 ** ROWS);
  assert.equal(pl.WAYS.reduce((a, b) => a + b, 0), pl.PATHS);
  // the row is symmetric and peaks in the middle, which is what makes the middle the return
  for (let k = 0; k < BINS; k++) assert.equal(pl.WAYS[k], pl.WAYS[BINS - 1 - k], 'cup ' + k);
  assert.equal(Math.max(...pl.WAYS), pl.WAYS[6]);
  // and the middle five cups really do hold most of the drops, which is the whole reason a cup is
  // priced in tenths rather than whole multiples
  const middle = pl.WAYS.slice(4, 9).reduce((a, b) => a + b, 0);
  assert.equal(middle, 3498);
  assert.ok(middle / pl.PATHS > 0.85, 'the middle five cups hold ' + pct(middle / pl.PATHS));
  assert.throws(() => { pl.WAYS[0] = 2; }, TypeError);
});

// Every walk the bead can take, enumerated. This is what says the cup odds are what the tables were
// solved against: the counts below are not measurements, they are every path through twelve pins,
// and they have to come out as Pascal's row or the walk is not the walk the board was priced for
test('all 4,096 walks land in the cups exactly as often as the row says', () => {
  const seen = new Array(BINS).fill(0);
  const steps = new Array(ROWS).fill(0);
  for (let mask = 0; mask < pl.PATHS; mask++) {
    for (let i = 0; i < ROWS; i++) steps[i] = (mask >> i) & 1;
    seen[pl.binOf(steps)] += 1;
  }
  assert.deepEqual(seen, pl.WAYS.slice());
  // a walk is twelve bounces, each of them one of two directions
  assert.throws(() => pl.binOf(new Array(11).fill(0)), RangeError);
  assert.throws(() => pl.binOf(new Array(13).fill(0)), RangeError);
  assert.throws(() => pl.binOf(new Array(ROWS).fill(2)), RangeError);
  assert.throws(() => pl.binOf(new Array(ROWS).fill('1')), RangeError);
  assert.throws(() => pl.binOf('left'), RangeError);
  assert.equal(pl.binOf(new Array(ROWS).fill(1)), ROWS, 'twelve rights is the last cup');
  assert.equal(pl.binOf(new Array(ROWS).fill(0)), 0, 'twelve lefts is the first');
});

test('the three tables are symmetric, fall towards the middle, and are frozen', () => {
  assert.deepEqual(pl.RISK_KEYS.slice(), ['mild', 'medium', 'spicy']);
  for (const key of pl.RISK_KEYS) {
    const r = pl.RISKS[key];
    assert.equal(r.key, key);
    assert.ok(typeof r.label === 'string' && r.label.length > 0, key);
    assert.equal(r.nums.length, BINS, key);
    for (const n of r.nums) assert.ok(Number.isSafeInteger(n) && n >= 0, key + ' cup ' + n);
    for (let k = 0; k < BINS; k++) assert.equal(r.nums[k], r.nums[BINS - 1 - k], key + ' at cup ' + k);
    for (let k = 1; k <= ROWS / 2; k++) assert.ok(r.nums[k] <= r.nums[k - 1], key + ' climbs inward at cup ' + k);
    // the printing multiples are the money multiples over ten, and nothing else
    assert.equal(r.mults.length, BINS, key);
    for (let k = 0; k < BINS; k++) assert.equal(r.mults[k], r.nums[k] / DEN, key + ' cup ' + k);
    assert.throws(() => { pl.RISKS[key].nums[0] = 1; }, TypeError);
    assert.throws(() => { pl.RISKS[key].mults[0] = 1; }, TypeError);
  }
  assert.throws(() => { pl.RISKS.mild = null; }, TypeError);
  // the risks really are three different boards, and they get harder in the order they are offered
  assert.ok(pl.RISKS.mild.nums[6] > pl.RISKS.medium.nums[6]);
  assert.ok(pl.RISKS.medium.nums[6] > pl.RISKS.spicy.nums[6]);
  assert.ok(pl.RISKS.mild.nums[0] < pl.RISKS.medium.nums[0]);
  assert.ok(pl.RISKS.medium.nums[0] < pl.RISKS.spicy.nums[0]);
  assert.equal(pl.RISKS.spicy.nums[6], 0, 'the spicy middle pays nothing');
  assert.equal(pl.TOP_NUM, 6800);
});

// The return of each board, exactly. A cup is a whole number of tenths and a cup's chance is a whole
// number over 4096, so the return is a fraction of whole numbers and the figures below are exact,
// not sampled. The same sum runs when the module loads (plinko.js checkTables), so a retuned cup
// that leaves the band cannot even be required in
test('every risk returns 96-97%, and the table shows where each one gets it from', () => {
  const summary = [];
  for (const key of pl.RISK_KEYS) {
    const r = pl.RISKS[key];
    let gross = 0;
    for (let k = 0; k < BINS; k++) gross += pl.WAYS[k] * r.nums[k];
    const rtp = gross / (pl.PATHS * DEN);
    console.log('\n  ' + r.label + ': return ' + pct(rtp) + '  (' + gross + ' tenths over '
      + (pl.PATHS * DEN) + ' staked)');
    console.log('  cup'.padEnd(7) + 'pays'.padStart(8) + 'walks'.padStart(8) + 'chance'.padStart(11)
      + 'once in'.padStart(10) + 'of the return'.padStart(15));
    for (let k = 0; k < BINS; k++) {
      const share = pl.WAYS[k] * r.nums[k] / gross;
      console.log('  ' + String(k).padEnd(5) + ('x' + (r.nums[k] / DEN)).padStart(8)
        + String(pl.WAYS[k]).padStart(8) + pct(pl.WAYS[k] / pl.PATHS).padStart(11)
        + num(pl.PATHS / pl.WAYS[k]).padStart(10)
        + (r.nums[k] ? pct(share) : '-').padStart(15));
    }
    // the band, as integers: 100 * gross against the percent times the paths times the tenths
    assert.ok(100 * gross >= pl.BAND_LO * pl.PATHS * DEN, key + ' returns ' + pct(rtp));
    assert.ok(100 * gross <= pl.BAND_HI * pl.PATHS * DEN, key + ' returns ' + pct(rtp));
    // what a drop is worth, and how much of the board is the edge cup. Spicy is meant to live off
    // its edges; mild is meant not to, and the assertions below are that difference written down
    const edge = 2 * pl.WAYS[0] * r.nums[0] / gross;
    const losing = (function () {
      let n = 0;
      for (let k = 0; k < BINS; k++) if (r.nums[k] < DEN) n += pl.WAYS[k];
      return n / pl.PATHS;
    })();
    summary.push({ key, rtp, edge, losing, worst: Math.min(...r.nums) / DEN, best: r.nums[0] / DEN });
  }
  console.log('\n  risk'.padEnd(10) + 'return'.padStart(10) + 'worst cup'.padStart(11)
    + 'best cup'.padStart(10) + 'drops under 1x'.padStart(16) + 'edges of the return'.padStart(21));
  for (const s of summary) {
    console.log('  ' + s.key.padEnd(8) + pct(s.rtp).padStart(10) + ('x' + s.worst).padStart(11)
      + ('x' + s.best).padStart(10) + pct(s.losing).padStart(16) + pct(s.edge).padStart(21));
  }
  const by = summary.reduce((m, s) => { m[s.key] = s; return m; }, {});
  // mild is a board a player can sit on: nothing on it costs more than a tenth of the bet, and the
  // two edge cups are a small part of what it pays back
  assert.ok(by.mild.worst >= 0.9, 'the worst mild cup is x' + by.mild.worst);
  assert.ok(by.mild.edge < 0.1, 'mild gets ' + pct(by.mild.edge) + ' of its return from the edges');
  // spicy is the opposite, and this is where the band is actually paid for: the middle gives
  // nothing back, so the edges have to be enormous
  assert.equal(by.spicy.worst, 0);
  assert.ok(by.spicy.losing > 0.8, 'only ' + pct(by.spicy.losing) + ' of spicy drops come back short');
  assert.ok(by.spicy.edge > 0.25, 'the spicy edges are only ' + pct(by.spicy.edge) + ' of its return');
  // and no board, however it is shaped, pays more than another: they are the same deal. The bound
  // is a fifth of the band's own width, so this really does tie the three together rather than
  // restating that each is somewhere inside it
  for (const s of summary) assert.ok(Math.abs(s.rtp - by.mild.rtp) < 0.002, s.key + ' is a better deal');
});

// The balance between the edge cup and the middle one, solved rather than described. The band is
// one equation, so fixing every cup but two leaves one unknown: raise the edge and the middle has
// to come down to pay for it, and at some point the middle is already zero and the edge cannot go
// any higher at all.
//
// The two boards sit differently against that wall, and the difference is worth being exact about:
//  - mild's middle cup is FORCED. A whole 1 there is 98.60% and a 0.8 is under the band, so 0.9 is
//    the only tenth that fits, and nothing about it is a taste
//  - spicy's edge is NOT forced. With the middle already empty the band allows up to x692.6, and the
//    board uses x680: a choice 0.6% inside the wall, not the wall. What is forced is the shape,
//    that an edge anywhere near this size can only be paid for by a middle of nothing
test('the edge cup and the middle cup are one equation, and each board sits differently in it', () => {
  const LO = pl.BAND_LO * pl.PATHS * DEN / 100;   // the fewest tenths the band allows
  const HI = pl.BAND_HI * pl.PATHS * DEN / 100;
  // what every cup but the two named ones contributes, for one board
  const restOf = (nums, free) => {
    let rest = 0;
    for (let k = 0; k < BINS; k++) if (!free.includes(k)) rest += pl.WAYS[k] * nums[k];
    return rest;
  };

  // Spicy: hold cups 1 to 5 (and their mirrors), then ask what middle cup each edge would need
  const spicy = pl.RISKS.spicy.nums;
  const restS = restOf(spicy, [0, 6, 12]);
  console.log('  spicy: the middle cup each edge would need, to stay inside the band');
  console.log('  edge'.padEnd(10) + 'middle needed'.padStart(15) + 'middle allowed'.padStart(16) + 'board'.padStart(12));
  for (const edge of [40, 200, 400, 680, 692, 700, 1000]) {
    const e = edge * DEN;   // the table is in tenths, so a multiple of x680 is 6800 of them
    const need = (((LO + HI) / 2) - 2 * e - restS) / pl.WAYS[6];
    const most = (HI - 2 * e - restS) / pl.WAYS[6];
    console.log('  ' + ('x' + edge).padEnd(10) + ('x' + (need / DEN).toFixed(4)).padStart(15)
      + ('x' + (most / DEN).toFixed(4)).padStart(16)
      + (most < 0 ? 'impossible' : 'fits').padStart(12));
    assert.equal(most >= 0, edge <= 692, 'an edge of x' + edge);
  }
  // The edge the board uses needs a middle of nothing, and the wall is a little further out: this
  // is where the test says what it can actually show, which is that the board is INSIDE the wall
  // and not ON it. An edge of x692.6 would also fit; x680 is the figure chosen inside that room
  assert.equal(spicy[0], 6800);
  assert.equal(spicy[6], 0);
  const mostEdge = Math.floor((HI - restS) / 2);
  const room = (mostEdge - spicy[0]) / (pl.PATHS * DEN) * 2;
  console.log('  with the middle empty the band allows up to x' + (mostEdge / DEN).toFixed(1)
    + '; the board uses x' + (spicy[0] / DEN) + ', which is ' + pct(room) + ' of the board inside that');
  assert.ok(spicy[0] <= mostEdge, 'the spicy edge is past what an empty middle can pay for');
  assert.ok(room < 0.01, 'the spicy edge is ' + pct(room) + ' off the wall, which is a whole band away');
  // and past the wall it really is impossible: the middle cannot go below nothing
  assert.ok(2 * (mostEdge + DEN) + restS > HI, 'a tenth more than the wall should leave the band');

  // Mild: the same equation read the other way. The middle cannot be a whole 1, which is the one
  // thing a player would ask for, and this is the arithmetic that says so
  const mild = pl.RISKS.mild.nums;
  const restM = restOf(mild, [6]);
  const atOne = restM + pl.WAYS[6] * DEN;
  console.log('  mild: a middle cup of x1 would make the board '
    + pct(atOne / (pl.PATHS * DEN)) + ', outside the band. x0.9 makes it '
    + pct((restM + pl.WAYS[6] * mild[6]) / (pl.PATHS * DEN)));
  assert.equal(mild[6], 9);
  assert.ok(atOne > HI, 'a mild middle of x1 should be outside the band');
  assert.ok(restM + pl.WAYS[6] * 8 < LO, 'a mild middle of x0.8 should be under the band');
});

// --- the walk -----------------------------------------------------------------------------

test('a drop walks twelve bounces off the shared roll stream', () => {
  for (let i = 0; i < 2000; i++) {
    const p = pl.pathOf('walk-' + i);
    assert.equal(p.length, ROWS);
    for (const step of p) assert.ok(step === 0 || step === 1, 'bounce ' + step);
  }
  // the bounces come off cards.js's seeded stream: one PRNG in the repo, not a second copy
  for (let i = 0; i < 200; i++) {
    const seed = 'stream-' + i;
    const roll = C.rollsFrom(seed);
    assert.deepEqual(pl.pathOf(seed), Array.from({ length: ROWS }, () => (roll() < 0.5 ? 0 : 1)));
  }
});

test('the bead lands in the cups in the proportions the row says', () => {
  // The returns above are exact given a fair bounce. This is the check that the engine's own rolls
  // really bounce fairly, which is what makes those sums a measurement of the board rather than of
  // a spreadsheet. Fixed seeds, so the counts are the same on every run
  const N = 200000;
  const tol = 5; // in standard errors
  const seen = new Array(BINS).fill(0);
  let rights = 0;
  for (let i = 0; i < N; i++) {
    const p = pl.pathOf('fair-' + i);
    seen[pl.binOf(p)] += 1;
    for (const s of p) rights += s;
  }
  // a bounce is a coin, first of all
  const pr = rights / (N * ROWS);
  assert.ok(Math.abs(pr - 0.5) / Math.sqrt(0.25 / (N * ROWS)) < tol, 'the bead went right ' + pct(pr) + ' of the time');
  console.log('  cup'.padEnd(7) + 'landed'.padStart(11) + 'the row says'.padStart(14) + 'off by'.padStart(9));
  let worst = 0, worstAt = '';
  for (let k = 0; k < BINS; k++) {
    const p = pl.WAYS[k] / pl.PATHS;
    const off = Math.abs(seen[k] / N - p) / Math.sqrt(p * (1 - p) / N);
    if (off > worst) { worst = off; worstAt = 'cup ' + k; }
    console.log('  ' + String(k).padEnd(5) + pct(seen[k] / N).padStart(11) + pct(p).padStart(14)
      + (off.toFixed(1) + ' SE').padStart(9));
    assert.ok(off < tol, 'cup ' + k + ' took ' + pct(seen[k] / N) + ' of ' + N.toLocaleString('en-US') + ' drops');
  }
  console.log('  ' + N.toLocaleString('en-US') + ' drops, furthest off: ' + worst.toFixed(1) + ' SE (' + worstAt + ')');
});

test('a drop is one press: it is born settled and nothing can be played on it', () => {
  const st = toBin(0, 'spicy', 10);
  assert.equal(st.phase, 'done');
  assert.equal(st.bin, 0);
  assert.equal(st.pay, 6800);
  assert.equal(st.net, 6790);
  assert.deepEqual(pl.OPS, []);
  for (const op of [undefined, null, 'drop', { op: 'drop' }, { op: 'risk', risk: 'mild' }]) {
    assert.equal(pl.whyNot(st, op), 'a drop settles on the press, so there is nothing to play');
    assert.equal(pl.act(st, op), st, 'a refused action gives back the very same object');
  }
  assert.equal(pl.whyNot(null, 'drop'), 'a drop settles on the press, so there is nothing to play');
  // and nothing is ever riding between two messages, which is what the other games' budgets read
  assert.equal(pl.stake(st), 0);
  assert.equal(pl.stake(null), 0);
});

test('act never mutates its input', () => {
  for (let i = 0; i < 300; i++) {
    const st = pl.newRound({ seed: 'mut-' + i, bet: 100, risk: pl.RISK_KEYS[i % 3] });
    const before = snapshot(st);
    pl.act(st, { op: 'drop' });
    pl.act(st, 'drop');
    pl.act(st, null);
    assert.equal(snapshot(st), before);
  }
});

test('a risk is one of the three, and an unknown one is refused rather than defaulted', () => {
  for (const key of pl.RISK_KEYS) assert.equal(pl.badRisk(key), null);
  const bad = [undefined, null, '', 'MILD', 'hot', 0, 1, {}, [], 'toString', 'constructor', '__proto__'];
  for (const risk of bad) {
    assert.equal(pl.badRisk(risk), 'pick a risk: mild, medium, spicy', JSON.stringify(risk));
    assert.throws(() => pl.newRound({ seed: 'x', bet: 10, risk }), RangeError, JSON.stringify(risk));
  }
  // a default would be a typo quietly changing which table the player was paid off
  assert.throws(() => pl.newRound({ seed: 'x', bet: 10 }), RangeError);
});

test('the bet is a whole number the top cup can be paid on', () => {
  assert.throws(() => pl.newRound({ seed: 'x', bet: 1.5, risk: 'mild' }), RangeError);
  assert.throws(() => pl.newRound({ seed: 'x', bet: 0, risk: 'mild' }), RangeError);
  assert.throws(() => pl.newRound({ seed: 'x', bet: 2 ** 53, risk: 'mild' }), RangeError);
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / pl.TOP_NUM);
  assert.equal(pl.newRound({ seed: 'x', bet: cap, risk: 'spicy' }).bet, cap);
  assert.ok(Number.isSafeInteger(cap * pl.TOP_NUM), 'the cap itself still pays exactly');
  assert.throws(() => pl.newRound({ seed: 'x', bet: cap + 1, risk: 'mild' }), RangeError);
  assert.equal(pl.MIN_BET, 10);
  // a pinned walk has to be a real walk
  assert.throws(() => pl.newRound({ seed: 'x', bet: 10, risk: 'mild', path: [1, 0] }), RangeError);
  assert.throws(() => pl.newRound({ seed: 'x', bet: 10, risk: 'mild', path: new Array(ROWS).fill(3) }), RangeError);
});

// --- money --------------------------------------------------------------------------------

test('a payout is one integer product and one integer division, and the remainder stays here', () => {
  // the whole money path, checked against arithmetic done another way entirely: BigInt, where there
  // is no rounding to be wrong about
  for (const bet of [1, 7, 10, 11, 13, 20, 99, 100, 110, 999, 1000, 1010, 9990, 123450, 7777777]) {
    for (const key of pl.RISK_KEYS) {
      for (const n of pl.RISKS[key].nums) {
        const pay = pl.payOf(bet, n);
        const exact = (BigInt(bet) * BigInt(n)) / BigInt(DEN);   // BigInt division truncates
        assert.equal(BigInt(pay), exact, bet + ' at x' + (n / DEN));
        assert.ok(Number.isSafeInteger(pay), 'pay ' + pay);
        // the house keeps what the tenths do not divide into, and never the other way round
        assert.ok(pay * DEN <= bet * n, bet + ' at x' + (n / DEN) + ' paid more than the cup');
        assert.ok(bet * n - pay * DEN < DEN, 'more than a tenth went missing');
      }
    }
  }
  // at the minimum bet and every multiple of it, nothing is lost to the division at all
  console.log('  bet'.padEnd(10) + 'cup'.padStart(8) + 'paid'.padStart(10) + 'read back'.padStart(12)
    + 'posted'.padStart(9) + 'kept'.padStart(7));
  for (const bet of [10, 20, 100, 1000]) {
    for (const n of [9, 25, 5, 12]) {
      assert.equal(pl.payOf(bet, n) * DEN, bet * n, bet + ' at x' + (n / DEN));
    }
  }
  // and where it is not: a bet that is not a round number of chips loses the remainder, which is
  // the one place the posted multiple and the real one come apart. Printed, not hidden
  for (const [bet, n] of [[15, 9], [11, 9], [13, 25], [99, 5], [10, 9], [10, 25]]) {
    const pay = pl.payOf(bet, n);
    console.log('  ' + String(bet).padEnd(8) + ('x' + (n / DEN)).padStart(8) + String(pay).padStart(10)
      + ('x' + (pay / bet).toFixed(4)).padStart(12) + ('x' + (n / DEN)).padStart(9)
      + String(bet * n - pay * DEN).padStart(7));
  }
  assert.equal(pl.payOf(15, 9), 13, 'fifteen at nine tenths is thirteen and a half, paid as thirteen');
  assert.equal(pl.payOf(10, 9), 9);
  assert.equal(pl.payOf(10, 0), 0, 'a cup worth nothing pays nothing');
  assert.equal(pl.payOf(1, 9), 0, 'a bet of one cannot be paid nine tenths at all');
});

test('every cup pays what its table says, and net is the payout less the bet', () => {
  for (const key of pl.RISK_KEYS) {
    const nums = pl.RISKS[key].nums;
    for (let bin = 0; bin < BINS; bin++) {
      for (const bet of [10, 100, 1000]) {
        const st = toBin(bin, key, bet);
        assert.equal(st.bin, bin, key + ' cup ' + bin);
        assert.equal(st.num, nums[bin], key + ' cup ' + bin);
        assert.equal(st.pay, pl.payOf(bet, nums[bin]), key + ' cup ' + bin + ' at ' + bet);
        assert.equal(st.net, st.pay - bet);
        assert.ok(Number.isSafeInteger(st.net));
        // at a round bet the cup is paid to the tenth, so these are the figures on the table
        assert.equal(st.pay * DEN, bet * nums[bin], key + ' cup ' + bin + ' at ' + bet);
      }
    }
  }
  // the three cups that say what each board is: the mild middle barely costs anything, the spicy
  // middle costs the lot, and the spicy edge is the biggest thing in the casino after the forge
  assert.equal(toBin(6, 'mild', 100).net, -10);
  assert.equal(toBin(6, 'spicy', 100).net, -100);
  assert.equal(toBin(0, 'spicy', 100).net, 67900);
  assert.equal(toBin(6, 'medium', 100).net, -50);
});

test('the multiple on the chip is read back off the credits paid, not off the table', () => {
  // The posted table and the payout come apart whenever a bet is not a round number of chips, and
  // what the screen prints has to be the one the balance moved by. A chip showing the posted figure
  // would be showing a payout nobody received
  for (const bet of [10, 11, 15, 13, 99, 100, 7]) {
    for (const key of pl.RISK_KEYS) {
      for (let bin = 0; bin < BINS; bin++) {
        const v = V(toBin(bin, key, bet));
        assert.equal(v.mult, v.pay / bet, key + ' cup ' + bin + ' at ' + bet);
        assert.equal(v.pay - bet, v.net);
      }
    }
  }
  // the one that would have been wrong: fifteen credits on a nine tenths cup is x0.8667, not x0.9
  const odd = V(toBin(6, 'mild', 15));
  assert.equal(odd.pay, 13);
  assert.equal(odd.mult, 13 / 15);
  assert.notEqual(odd.mult, pl.RISKS.mild.mults[6]);
  // and at a round bet the two agree, which is the common case
  const round = V(toBin(6, 'mild', 100));
  assert.equal(round.pay, 90);
  assert.equal(round.mult, pl.RISKS.mild.mults[6]);
});

test('the bet changes the size of the board and, under a round number of chips, nothing else', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'scale-' + i;
    const risk = pl.RISK_KEYS[i % 3];
    const ten = pl.newRound({ seed, bet: 10, risk });
    for (const mult of [2, 10, 100]) {
      const big = pl.newRound({ seed, bet: 10 * mult, risk });
      assert.deepEqual(big.path, ten.path, seed);
      assert.equal(big.bin, ten.bin, seed);
      assert.equal(big.pay, ten.pay * mult, seed + ' at ' + (10 * mult));
      assert.equal(big.net, ten.net * mult, seed + ' at ' + (10 * mult));
    }
  }
});

// --- determinism and what the webview sees -------------------------------------------------

test('the same seed walks the same bounces, and the id is not the seed', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'det-' + i;
    assert.deepEqual(V(pl.newRound({ seed, bet: 100, risk: 'medium' })),
      V(pl.newRound({ seed, bet: 100, risk: 'medium' })));
  }
  const walks = new Set(Array.from({ length: 300 }, (_, i) => pl.pathOf('d' + i).join('')));
  assert.ok(walks.size > 250, 'only ' + walks.size + ' different walks in 300 seeds');
  // the id names the drop and does not walk it: handed the id, the bead goes somewhere else
  const id = 'c0ffee';
  const st = pl.newRound({ seed: 'the-seed', id, bet: 10, risk: 'mild' });
  assert.equal(st.id, id);
  assert.notEqual(V(st).id, V(st).seed);
  assert.notDeepEqual(pl.pathOf(id), pl.pathOf('the-seed'));
  // and the risk does not touch the walk: the same seed falls into the same cup on all three boards
  for (const key of pl.RISK_KEYS) {
    assert.equal(pl.newRound({ seed: 'the-seed', bet: 10, risk: key }).bin, st.bin, key);
  }
});

test('a view carries the walk the bead took and all three boards', () => {
  for (let i = 0; i < 300; i++) {
    const risk = pl.RISK_KEYS[i % 3];
    const st = pl.newRound({ seed: 'view-' + i, id: 'id-' + i, bet: 50, risk });
    const v = V(st);
    assert.equal(v.phase, 'done');
    assert.equal(v.risk, risk);
    // the walk is the real one, and it is the walk that put the bead in that cup
    assert.equal(v.path.length, ROWS);
    assert.deepEqual(v.path, st.path);
    assert.equal(pl.binOf(v.path), v.bin, 'the path does not end in the cup the view names');
    assert.equal(v.pay, pl.payOf(50, pl.RISKS[risk].nums[v.bin]));
    assert.equal(v.net, v.pay - 50);
    // the path is a copy: a screen that sorted it in place would not reshape the round
    v.path[0] = 9;
    assert.notEqual(st.path[0], 9);
    // the screen holds no multiple and no probability of its own
    assert.equal(v.risks, pl.RISKS);
    assert.equal(v.riskKeys, pl.RISK_KEYS);
    assert.equal(v.ways, pl.WAYS);
    assert.equal(v.paths, pl.PATHS);
    assert.equal(v.rows, ROWS);
    assert.equal(v.bins, BINS);
    assert.equal(v.den, DEN);
    assert.equal(v.minBet, pl.MIN_BET);
    // the seed is handed over because the drop it names is already over
    assert.equal(v.seed, st.seed);
    assert.deepEqual(v.can, {});
  }
});

test('the idle view is a bet screen with all three boards on it', () => {
  const v = pl.view(null);
  assert.equal(v.phase, 'bet');
  assert.equal(v.id, null);
  assert.equal(v.bet, null);
  assert.equal(v.risk, null);
  assert.deepEqual(v.path, []);
  assert.equal(v.bin, null);
  assert.equal(v.pay, null);
  assert.equal(v.mult, null);
  assert.equal(v.net, null);
  assert.equal('seed' in v, false, 'there is no drop, so there is no seed');
  assert.equal(v.risks, pl.RISKS);
  assert.equal(v.ways, pl.WAYS);
  assert.deepEqual(v.can, {});
  // the two views agree on everything the board is, and differ only in what one drop did
  const live = V(drop({ bet: 10 }));
  for (const k of ['risks', 'riskKeys', 'ways', 'paths', 'rows', 'bins', 'den', 'minBet']) {
    assert.equal(live[k], v[k], k);
  }
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
