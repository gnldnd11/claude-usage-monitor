// The wheel: the three dials, their angles, the figures written on them, the spin, the money path,
// and what the house keeps.
// No dependencies: node's assert only. Run: node test/wheel.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const wh = require(path.join(__dirname, '..', 'wheel.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const UNITS = wh.UNITS;
const HALVES = wh.HALVES;
const STEP = wh.BET_STEP;
const snapshot = (st) => JSON.stringify(st);
const pct = (n) => (n * 100).toFixed(4) + '%';
const spin = (st, risk) => wh.act(st, { op: 'spin', risk });
const deal = (bet, seed) => wh.newRound({ seed: seed == null ? 'seed' : seed, id: 'round-1', bet: bet == null ? 10 : bet });

// Every bet this engine will take, walked where a test needs more than one. All even, because the
// wheel takes its bets in steps of BET_STEP
const BETS = [wh.MIN_BET, 12, 14, 26, 100, 998, 1000, 123456];

// The first seed (from a fixed list) that stops `risk` in slice `slot`. The host makes a fresh seed
// per round and keeps it, so this is how a test picks an outcome: the same way the forge's tests
// search a seed for a roll
function seedForSlot(slot, risk, tag) {
  for (let i = 0; i < 40000; i++) {
    const seed = (tag || 'pin') + '-' + risk + '-' + slot + '-' + i;
    if (wh.stopOf(seed, risk) === slot) return seed;
  }
  throw new Error('no seed stops ' + risk + ' in slice ' + slot);
}

// --- the dials ------------------------------------------------------------------------------------

test('every wheel is the same dial cut differently, and returns the same exact fraction', () => {
  assert.equal(UNITS, 30);
  assert.equal(wh.UNIT_DEG, 12);
  assert.equal(UNITS * wh.UNIT_DEG, 360);
  assert.equal(HALVES, 2);
  assert.equal(wh.RETURN_HALVES, 58);
  assert.deepEqual(wh.RISKS, ['mild', 'medium', 'wild']);
  console.log('  wheel    slices  dead       live   widest  narrowest    top   halves   return');
  for (const risk of wh.RISKS) {
    const segs = wh.WHEELS[risk];
    let units = 0, dead = 0, sum = 0, wide = 0, thin = Infinity, top = 0;
    for (const [u, h] of segs) {
      assert.ok(Number.isSafeInteger(u) && u >= wh.MIN_UNITS, risk + ' has a slice of ' + u + ' units');
      assert.ok(Number.isSafeInteger(h) && h >= 0, risk + ' holds ' + h + ' halves');
      units += u;
      sum += u * h;
      if (h === 0) dead += u;
      if (u > wide) wide = u;
      if (u < thin) thin = u;
      if (h > top) top = h;
    }
    // the two numbers that matter: every wheel is the whole dial, and every wheel sums to the same
    // thing, so the three differ in shape and not at all in what the house keeps
    assert.equal(units, UNITS, risk + ' is ' + units + ' units wide');
    assert.equal(sum, wh.RETURN_HALVES, risk + ' sums to ' + sum + ' halves');
    console.log('  ' + risk.padEnd(9) + String(segs.length).padStart(5)
      + String(dead).padStart(6) + ' (' + pct(dead / UNITS).padStart(8) + ')'
      + String(UNITS - dead).padStart(7)
      + String(wide * wh.UNIT_DEG + 'deg').padStart(9) + String(thin * wh.UNIT_DEG + 'deg').padStart(11)
      + wh.labelOf(top).padStart(7) + String(sum).padStart(9) + pct(sum / (HALVES * UNITS)).padStart(10));
  }
});

test('the return is inside the band, and said so in whole numbers', () => {
  // 0.96 <= RETURN_HALVES / (HALVES * UNITS) <= 0.97, written the way wheel.js checks it: no float
  // decides this
  assert.ok(100 * wh.RETURN_HALVES >= 96 * HALVES * UNITS, 'under 96%');
  assert.ok(100 * wh.RETURN_HALVES <= 97 * HALVES * UNITS, 'over 97%');
  // and with room on BOTH sides, which is the thing a wheel sitting on 96.00% would not have
  assert.ok(100 * wh.RETURN_HALVES > 96 * HALVES * UNITS, 'sitting exactly on the floor of the band');
  assert.ok(100 * wh.RETURN_HALVES < 97 * HALVES * UNITS, 'sitting exactly on the ceiling of the band');
  console.log('  ' + wh.RETURN_HALVES + '/' + (HALVES * UNITS) + ' = ' + pct(wh.RETURN_HALVES / (HALVES * UNITS))
    + ', so the house keeps ' + pct(1 - wh.RETURN_HALVES / (HALVES * UNITS)));
});

test('58 is the ONLY sum this dial can have, so a mistuned wheel cannot hide inside the band', () => {
  // The whole argument for 30 units of halves. Which whole numerators sit inside the band?
  // Checked in whole numbers: 100 * n between 96 * HALVES * UNITS and 97 * HALVES * UNITS
  const inside = [];
  for (let n = 0; n <= HALVES * UNITS; n++) {
    if (100 * n >= 96 * HALVES * UNITS && 100 * n <= 97 * HALVES * UNITS) inside.push(n);
  }
  assert.deepEqual(inside, [wh.RETURN_HALVES], 'the band holds ' + inside.join(', '));
  // which means a retune that moves ANY slice by one unit falls out of the band and the load-time
  // check throws, rather than landing somewhere else inside it
  assert.ok(100 * (wh.RETURN_HALVES - 1) < 96 * HALVES * UNITS, 'one half less is still in the band');
  assert.ok(100 * (wh.RETURN_HALVES + 1) > 97 * HALVES * UNITS, 'one half more is still in the band');
  console.log('  30 units of halves: 57.6 < ' + wh.RETURN_HALVES + ' < 58.2, and nothing else fits');
});

test('equal slices were the cage: the old wheel had exactly one shape it could take', () => {
  // Why this is weighted now. With N EQUAL segments and whole multipliers the return moves in steps
  // of 1/N, so the question was whether an integer sits between 0.96N and 0.97N at all
  const possible = [];
  for (let n = 2; n <= 40; n++) {
    const lo = Math.ceil((96 * n) / 100);
    if (100 * lo <= 97 * n) possible.push(n);
  }
  assert.equal(possible[0], 25, 'the smallest equal-slice wheel is ' + possible[0] + ' segments');
  for (let n = 2; n < 25; n++) assert.ok(possible.indexOf(n) < 0, n + ' equal segments should be impossible');
  // and at 28, the count the wheel used to have, the numerator had ONE value: 27. Three wheels, one
  // shape, nothing to tune
  const at28 = [];
  for (let n = 0; n <= 28; n++) if (100 * n >= 96 * 28 && 100 * n <= 97 * 28) at28.push(n);
  assert.deepEqual(at28, [27]);
  console.log('  equal-slice wheels are possible at ' + possible.join(', ') + ' segments, and 28 could only be 27/28');
});

test('the dials are the ones the comments claim', () => {
  // A table is the whole game, so the shape of each is pinned here rather than described.
  // units by multiplier, written in labels so a changed figure is a changed test
  const spread = (risk) => {
    const out = {};
    for (const [u, h] of wh.WHEELS[risk]) out[wh.labelOf(h)] = (out[wh.labelOf(h)] || 0) + u;
    return out;
  };
  assert.deepEqual(spread('mild'), { '÷2': 10, '×1': 10, '×2': 4, '×3': 2, '×0': 4 });
  assert.deepEqual(spread('medium'), { '÷2': 4, '×1': 3, '×2': 3, '×3': 2, '×6': 2, '×0': 16 });
  assert.deepEqual(spread('wild'), { '÷2': 2, '×2': 2, '×12': 2, '×0': 24 });
  // the tops double and the dead share climbs: that is the taste the player is choosing between
  assert.deepEqual(wh.RISKS.map((r) => wh.wheelView(r).top), [3, 6, 12]);
  assert.deepEqual(wh.RISKS.map((r) => wh.wheelView(r).dead.num), [4, 16, 24]);
  // no wheel can be built without a dead slice: 30 units all paying ×1 or more would be 60 halves
  // and the band stops at 58
  assert.ok(wh.RETURN_HALVES < HALVES * UNITS, 'a wheel with no dead slice would be over the band');
  // and the wild wheel is its jackpot: the ×12 slice carries this much of what that wheel returns
  const jackpot = 2 * 24;
  assert.equal(jackpot / wh.RETURN_HALVES > 0.8, true);
  console.log('  the wild wheel\'s ×12 carries ' + pct(jackpot / wh.RETURN_HALVES) + ' of what that wheel returns');
});

test('no slice is thinner than a label, and nothing bigger than ×14 could be on a wheel at all', () => {
  // MIN_UNITS is a label rule wearing a number, so this is the number it is wearing. A slice can be
  // no rarer than MIN_UNITS/UNITS, so the biggest multiplier a wheel can carry is capped by the
  // return itself. The old ×20 is not merely absent, it is unbuildable
  const thinnest = wh.MIN_UNITS / UNITS;
  const cap = (wh.RETURN_HALVES / (HALVES * UNITS)) / thinnest;
  assert.ok(cap > 14 && cap < 15, 'the cap moved: ' + cap);
  assert.ok(wh.TOP <= cap, 'the top multiplier is over the cap');
  for (const risk of wh.RISKS) {
    for (const [u, h] of wh.WHEELS[risk]) {
      // the same thing said per slice: no slice may pay more than the whole wheel returns
      assert.ok(u * h <= wh.RETURN_HALVES, risk + ': a slice of ' + u + ' units paying ' + h + ' halves');
    }
  }
  console.log('  slices stop at ' + (wh.MIN_UNITS * wh.UNIT_DEG) + 'deg, so no wheel can carry more than ×'
    + cap.toFixed(1) + '. The top on any wheel is ' + wh.labelOf(wh.TOP_HALVES));
});

// --- the angles, and the figures on them -----------------------------------------------------------

test('every angle the screen is handed is a whole number of degrees, and they tile the circle', () => {
  for (const w of wh.WHEEL_VIEWS) {
    let at = 0;
    for (const s of w.segments) {
      assert.equal(s.from, at, w.risk + ': a gap or an overlap at ' + at + 'deg');
      assert.ok(Number.isSafeInteger(s.from) && Number.isSafeInteger(s.span) && Number.isSafeInteger(s.mid),
        w.risk + ': ' + s.from + '/' + s.span + '/' + s.mid + ' is not whole degrees');
      assert.equal(s.span, s.units * wh.UNIT_DEG);
      assert.equal(s.mid, s.from + s.span / 2);
      assert.ok(s.span >= wh.MIN_UNITS * wh.UNIT_DEG, w.risk + ': a ' + s.span + 'deg slice');
      at += s.span;
    }
    assert.equal(at, 360, w.risk + ' covers ' + at + ' degrees');
  }
});

test('the figure on a slice is the host\'s own string, and it fits the slice it is written on', () => {
  // The ink widths are MEASURED, in the panel, at 10.5px/700 with tabular figures (Chrome, the
  // webview's engine). They are here rather than in a comment because they are what makes
  // MIN_UNITS a rule instead of a hunch: a new label with no measurement fails this test
  const INK = { '×0': 12.14, '÷2': 12.14, '×1': 12.14, '×2': 12.14, '×3': 12.14, '×6': 12.14, '×12': 17.98 };
  const R = 56;    // games/wheel/meta.js, WH_R: where the label's box is centred
  const BOX = 12;  // the label's line box, so its inner edge is at R - BOX / 2
  let worst = 0, worstAt = '';
  for (const w of wh.WHEEL_VIEWS) {
    for (const s of w.segments) {
      assert.equal(s.label, wh.labelOf(s.halves), w.risk + ': the label is not the engine\'s own');
      const ink = INK[s.label];
      assert.ok(ink, 'no measured width for the label ' + JSON.stringify(s.label) + ': measure it before using it');
      // laid along the arc, the label's inner corners stand this far off the middle of its slice
      const needs = 2 * Math.atan((ink / 2) / (R - BOX / 2)) * 180 / Math.PI;
      assert.ok(needs <= s.span, w.risk + ': ' + s.label + ' needs ' + needs.toFixed(1) + 'deg in a ' + s.span + 'deg slice');
      if (needs / s.span > worst) { worst = needs / s.span; worstAt = w.risk + ' ' + s.label + ' in ' + s.span + 'deg'; }
    }
  }
  // ÷2 is the point of the whole retune: a figure that is not a whole multiple of the bet
  const labels = new Set();
  for (const w of wh.WHEEL_VIEWS) for (const s of w.segments) labels.add(s.label);
  assert.ok(labels.has('÷2'), 'no wheel carries a divide');
  assert.deepEqual(wh.labelOf(0), '×0');
  assert.deepEqual(wh.labelOf(1), '÷2');
  assert.deepEqual(wh.labelOf(2), '×1');
  assert.deepEqual(wh.labelOf(3), '×1.5');
  assert.deepEqual(wh.labelOf(24), '×12');
  console.log('  ' + labels.size + ' figures on three dials, tightest fit ' + pct(worst) + ' of its slice (' + worstAt + ')');
});

// --- the money path ----------------------------------------------------------------------------

test('the return is exact at EVERY bet it will take, because nothing is ever rounded', () => {
  // This is the whole argument for taking the bet in steps of two. Walk every UNIT of every wheel
  // at a range of bets and the credits paid out must be exactly bet * 58 / 60 against a bet * 30
  // staked. No tolerance, no band: an equality
  for (const risk of wh.RISKS) {
    for (const bet of BETS) {
      let paid = 0;
      for (let unit = 0; unit < UNITS; unit++) {
        const halves = wh.WHEELS[risk][wh.sliceAtUnit(risk, unit)][1];
        const pay = (bet / STEP) * halves;
        assert.ok(Number.isSafeInteger(pay), 'a payout that is not a whole number of credits');
        paid += pay;
      }
      assert.equal(paid * (HALVES * UNITS), bet * UNITS * wh.RETURN_HALVES, risk + ' at a bet of ' + bet);
    }
  }
  // and the same walked through the engine, which is what actually pays, slice by slice
  for (const risk of wh.RISKS) {
    for (const bet of [wh.MIN_BET, 12, 38]) {
      let paid = 0, staked = 0;
      for (let slot = 0; slot < wh.WHEELS[risk].length; slot++) {
        const done = spin(deal(bet, seedForSlot(slot, risk, 'exact')), risk);
        assert.equal(done.stop, slot);
        // a slice as wide as N units is worth N units of the walk above
        const units = wh.WHEELS[risk][slot][0];
        paid += done.pay * units;
        staked += wh.stake(done) * units;
        assert.equal(done.net, done.pay - bet, 'net is what the balance moved by');
      }
      assert.equal(staked, bet * UNITS);
      assert.equal(paid * (HALVES * UNITS), bet * UNITS * wh.RETURN_HALVES, risk + ' through the engine at a bet of ' + bet);
    }
  }
  console.log('  three wheels x ' + UNITS + ' units x ' + BETS.length + ' bets: paid exactly '
    + wh.RETURN_HALVES + '/' + (HALVES * UNITS) + ' of the stake every time');
});

test('a bet the halves do not divide is refused, and so is one too big to pay exactly', () => {
  assert.equal(STEP, 2);
  assert.equal(wh.MIN_BET % STEP, 0, 'the smallest bet the casino offers must be one this wheel takes');
  for (const odd of [11, 13, 999, 123457]) {
    assert.throws(() => deal(odd), RangeError, String(odd));
    // and the sentence is one a player can read: games/tables.js hands a RangeError's message
    // straight to the panel
    try { deal(odd); } catch (e) { assert.equal(e.message, 'this wheel takes bets in steps of 2'); }
  }
  // the casino's own chips are all even, so nothing a player can press is refused
  for (const chip of [10, 100, 1000]) assert.equal(chip % STEP, 0, chip + ' is not a bet this wheel takes');
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / wh.TOP_HALVES) * STEP;
  assert.equal(wh.TOP_HALVES, 24);
  assert.equal(wh.TOP, 12);
  assert.equal(deal(cap).bet, cap);
  assert.throws(() => deal(cap + STEP), RangeError);
  assert.ok(Number.isSafeInteger((cap / STEP) * wh.TOP_HALVES));
  for (const bad of [0, -1, 1.5, NaN, Infinity, '10', null, undefined]) {
    assert.throws(() => wh.newRound({ seed: 's', bet: bad }), RangeError, String(bad));
  }
});

// --- the spin ----------------------------------------------------------------------------------

test('a spin is one seed and one roll, and it lands on the wheel', () => {
  for (let i = 0; i < 5000; i++) {
    const unit = wh.unitOf('land-' + i);
    assert.ok(Number.isInteger(unit) && unit >= 0 && unit < UNITS, 'stopped at unit ' + unit);
    for (const risk of wh.RISKS) {
      const slot = wh.stopOf('land-' + i, risk);
      assert.ok(Number.isInteger(slot) && slot >= 0 && slot < wh.WHEELS[risk].length, risk + ' stopped at ' + slot);
    }
  }
  // the same seed always stops in the same place, and a different seed usually does not
  assert.equal(wh.unitOf('same'), wh.unitOf('same'));
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(wh.unitOf('spread-' + i));
  assert.equal(seen.size, UNITS, 'only ' + seen.size + ' of ' + UNITS + ' units were ever reached');
  // one seed is three different outcomes, because the three wheels are cut differently
  let differed = 0;
  for (let i = 0; i < 200; i++) {
    const a = wh.WHEELS.mild[wh.stopOf('three-' + i, 'mild')][1];
    const b = wh.WHEELS.wild[wh.stopOf('three-' + i, 'wild')][1];
    if (a !== b) differed += 1;
  }
  assert.ok(differed > 100, 'the wheels pay the same seed the same way ' + (200 - differed) + ' times in 200');
});

test('a slice comes up as often as it is wide', () => {
  // The solve believes the roll is uniform OVER UNITS, and that a slice's chance is its width. This
  // is the check that both halves of that are true of the engine's own rolls, which is what makes
  // the exact return above a measurement of the game rather than of a table. Fixed seeds, so the
  // counts are the same on every run
  const N = 300000;
  const units = new Array(UNITS).fill(0);
  for (let i = 0; i < N; i++) units[wh.unitOf('freq-' + i)] += 1;
  const p = 1 / UNITS;
  const se = Math.sqrt((p * (1 - p)) / N);
  let worst = 0, worstAt = -1;
  for (let unit = 0; unit < UNITS; unit++) {
    const off = Math.abs(units[unit] / N - p) / se;
    if (off > worst) { worst = off; worstAt = unit; }
    assert.ok(off < 5, 'unit ' + unit + ' came up ' + pct(units[unit] / N) + ' of the time');
  }
  console.log('  ' + N.toLocaleString('en-US') + ' spins, furthest off: ' + worst.toFixed(1)
    + ' SE (unit ' + worstAt + ')');
  for (const risk of wh.RISKS) {
    // every slice, counted by the units that fall in it
    const hits = new Array(wh.WHEELS[risk].length).fill(0);
    for (let unit = 0; unit < UNITS; unit++) hits[wh.sliceAtUnit(risk, unit)] += units[unit];
    let paid = 0;
    for (let slot = 0; slot < hits.length; slot++) {
      const [u, h] = wh.WHEELS[risk][slot];
      const off = Math.abs(hits[slot] / N - u / UNITS) / Math.sqrt(((u / UNITS) * (1 - u / UNITS)) / N);
      assert.ok(off < 5, risk + ' slice ' + slot + ' (' + u + ' units) came up ' + pct(hits[slot] / N));
      paid += hits[slot] * h;
    }
    const rtp = paid / (HALVES * N);
    console.log('    ' + risk.padEnd(8) + ' measured ' + pct(rtp) + ' against a solved '
      + pct(wh.RETURN_HALVES / (HALVES * UNITS)));
    assert.ok(Math.abs(rtp - wh.RETURN_HALVES / (HALVES * UNITS)) < 0.01, risk + ' measured ' + pct(rtp));
  }
});

// --- the state machine -------------------------------------------------------------------------

test('a round is dealt live and one spin ends it', () => {
  const st = deal();
  assert.equal(st.phase, 'spin');
  assert.equal(st.risk, null);
  assert.equal(st.stop, null);
  assert.equal(st.net, null);
  assert.equal(wh.stake(st), 10);
  const done = spin(st, 'mild');
  assert.equal(done.phase, 'done');
  assert.equal(done.risk, 'mild');
  assert.ok(Number.isInteger(done.stop));
  assert.equal(done.halves, wh.WHEELS.mild[done.stop][1]);
  assert.equal(done.pay, (10 / STEP) * done.halves);
  assert.equal(done.net, done.pay - 10);
  // and a second spin is refused rather than paid again
  assert.equal(wh.whyNot(done, { op: 'spin', risk: 'mild' }), 'the round is over');
  assert.equal(spin(done, 'mild'), done, 'the state was replaced after the round was over');
});

test('act() never touches its input and hands the same object back when the move is refused', () => {
  const st = deal();
  const before = snapshot(st);
  const done = spin(st, 'wild');
  assert.equal(snapshot(st), before, 'the live round was mutated');
  assert.notEqual(done, st);
  // every refusal returns the very same object, so a host that pushes on every reply pushes the
  // state it already had
  const refusals = [
    { op: 'spin' }, { op: 'spin', risk: null }, { op: 'spin', risk: 'MILD' },
    { op: 'spin', risk: 'hot' }, { op: 'spin', risk: 3 }, { op: 'nudge', risk: 'mild' }, 'spin'
  ];
  for (const op of refusals) {
    assert.ok(wh.whyNot(st, op), 'should refuse ' + JSON.stringify(op));
    assert.equal(wh.act(st, op), st, 'refused but returned a new state: ' + JSON.stringify(op));
  }
  assert.equal(snapshot(st), before);
});

test('whyNot says which wheel and nothing else', () => {
  const st = deal();
  assert.equal(wh.whyNot(st, { op: 'spin', risk: 'mild' }), null);
  assert.equal(wh.whyNot(st, { op: 'spin', risk: 'medium' }), null);
  assert.equal(wh.whyNot(st, { op: 'spin', risk: 'wild' }), null);
  assert.equal(wh.whyNot(st, { op: 'spin', risk: 'warm' }), 'pick a wheel: mild, medium, wild');
  assert.equal(wh.whyNot(st, { op: 'flip', risk: 'mild' }), 'unknown action');
  assert.equal(wh.whyNot(null, { op: 'spin', risk: 'mild' }), 'the round is over');
  // the risk is the move, so the host can ask about its shape on its own
  assert.equal(wh.badRisk('mild'), null);
  assert.equal(wh.badRisk(''), 'pick a wheel: mild, medium, wild');
  assert.equal(wh.badRisk(undefined), 'pick a wheel: mild, medium, wild');
  // a budget is taken and ignored: a round cannot cost more than the bet it was dealt with
  assert.equal(wh.whyNot(st, { op: 'spin', risk: 'mild' }, 0), null);
  assert.equal(wh.whyNot(st, { op: 'spin', risk: 'mild' }, NaN), null);
});

// --- what the webview sees ---------------------------------------------------------------------

test('the seed is not in the view until the round is over, and the id is not the seed', () => {
  const st = wh.newRound({ seed: 'the-whole-wheel', id: 'public-name', bet: 10 });
  const live = wh.view(st);
  assert.equal('seed' in live, false, 'the seed was handed over while the round was live');
  assert.equal(live.id, 'public-name');
  assert.notEqual(live.id, 'the-whole-wheel');
  assert.equal(JSON.stringify(live).indexOf('the-whole-wheel'), -1, 'the seed leaked through some other field');
  // and where it stops is held back too, because the screen animates getting there
  assert.equal(live.stop, null);
  assert.equal(live.mult, null);
  assert.equal(live.label, null);
  assert.equal(live.pay, null);
  const done = wh.view(spin(st, 'medium'));
  assert.equal(done.seed, 'the-whole-wheel');
  assert.ok(Number.isInteger(done.stop));
});

test('the view carries all three dials, every angle on them, before the bet and after it', () => {
  for (const v of [wh.idleView(), wh.view(null), wh.view(deal()), wh.view(spin(deal(), 'wild'))]) {
    assert.equal(v.units, UNITS);
    assert.equal(v.step, STEP);
    assert.equal(v.wheels.length, 3);
    for (const w of v.wheels) {
      assert.ok(wh.RISKS.indexOf(w.risk) >= 0);
      assert.equal(w.rtp.num, wh.RETURN_HALVES);
      assert.equal(w.rtp.den, HALVES * UNITS);
      let units = 0, halves = 0;
      for (const s of w.segments) {
        units += s.units;
        halves += s.units * s.halves;
        assert.equal(s.chance.num, s.units);
        assert.equal(s.chance.den, UNITS);
        assert.equal(s.dead, s.halves === 0);
        assert.equal(s.mult * HALVES, s.halves, 'the slice multiplier is not its halves');
      }
      assert.equal(units, UNITS, w.risk + ' segments cover ' + units + ' units');
      assert.equal(halves, wh.RETURN_HALVES, w.risk + ' segments sum to ' + halves);
      // the legend is the wheel read by multiplier: how much of the dial each figure is
      let rows = 0, rowHalves = 0, slices = 0;
      for (const row of w.legend) {
        rows += row.chance.num;
        rowHalves += row.halves * row.chance.num;
        slices += row.slices;
        assert.equal(row.chance.den, UNITS);
        assert.equal(row.label, wh.labelOf(row.halves));
      }
      assert.equal(rows, UNITS, w.risk + ' legend counts ' + rows + ' units');
      assert.equal(rowHalves, wh.RETURN_HALVES, w.risk + ' legend sums to ' + rowHalves);
      assert.equal(slices, w.segments.length, w.risk + ' legend counts ' + slices + ' slices');
      assert.equal(w.top, w.legend[0].mult, 'the legend is not biggest first');
      assert.equal(w.topLabel, w.legend[0].label);
      let dead = 0;
      for (const s of w.segments) if (s.dead) dead += s.units;
      assert.equal(w.dead.num, dead);
    }
  }
  // the bet screen has the wheels and nothing live
  const idle = wh.idleView();
  assert.equal(idle.phase, 'bet');
  assert.equal(idle.can.spin, false);
  assert.equal(idle.net, null);
});

test('the figure in the view is read back out of the payout, not copied off the slice', () => {
  // A screen that prints a figure the payout does not support is the bug this closes, so the view
  // divides rather than copies. Walked over every slice of every wheel at more than one bet
  for (const risk of wh.RISKS) {
    for (const bet of [10, 26, 1000]) {
      for (let slot = 0; slot < wh.WHEELS[risk].length; slot++) {
        const done = spin(deal(bet, seedForSlot(slot, risk, 'back')), risk);
        const v = wh.view(done);
        const [, halves] = wh.WHEELS[risk][slot];
        assert.equal(v.pay, (bet / STEP) * halves);
        assert.equal(v.mult * bet, v.pay, risk + ' slot ' + slot + ' at ' + bet);
        assert.equal(v.label, wh.labelOf(halves), risk + ' slot ' + slot);
        // and the figure printed is the one on the slice the screen just lit
        assert.equal(v.label, v.wheels[wh.RISKS.indexOf(risk)].segments[slot].label);
        assert.equal(v.net, v.pay - bet);
      }
    }
  }
});

test('the view is JSON and holds no state of the engine\'s', () => {
  const done = spin(deal(), 'medium');
  const v = wh.view(done);
  assert.deepEqual(JSON.parse(JSON.stringify(v)), JSON.parse(JSON.stringify(v)));
  // the tables handed over are frozen, so a webview that mutates one cannot retune the casino
  assert.ok(Object.isFrozen(v.wheels));
  assert.ok(Object.isFrozen(v.wheels[0]));
  assert.ok(Object.isFrozen(v.wheels[0].segments));
  assert.ok(Object.isFrozen(v.wheels[0].segments[0]));
  assert.throws(() => { v.wheels[0].segments[0] = 999; }, TypeError);
  assert.throws(() => { v.wheels[0].segments[0].span = 999; }, TypeError);
});

test('the engine knows nothing but cards.js', () => {
  // Pure: no vscode, no ledger. The one import is the shared seeded source, and what it uses from
  // it is the ROLL stream, not a shuffle: a wheel has no cards
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'wheel.js'), 'utf8');
  const requires = src.match(/require\(([^)]*)\)/g) || [];
  assert.deepEqual(requires, ["require('./cards')"]);
  assert.ok(src.indexOf('rollsFrom') > 0, 'the spin should roll, not shuffle');
  assert.equal(typeof C.rollsFrom, 'function');
  assert.equal(wh.MIN_BET, 10);
  assert.deepEqual(wh.OPS, ['spin']);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
