// The wheel: the three tables, the spin, the money path, and what the house keeps.
// No dependencies: node's assert only. Run: node test/wheel.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const wh = require(path.join(__dirname, '..', 'wheel.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SLOTS = wh.SLOTS;
const snapshot = (st) => JSON.stringify(st);
const pct = (n) => (n * 100).toFixed(4) + '%';
const spin = (st, risk) => wh.act(st, { op: 'spin', risk });
const deal = (bet, seed) => wh.newRound({ seed: seed == null ? 'seed' : seed, id: 'round-1', bet: bet == null ? 10 : bet });

// The first seed (from a fixed list) that stops the wheel in `slot`. The host makes a fresh seed
// per round and keeps it, so this is how a test picks an outcome: the same way the forge's tests
// search a seed for a roll
function seedForSlot(slot, tag) {
  for (let i = 0; i < 20000; i++) {
    const seed = (tag || 'pin') + '-' + slot + '-' + i;
    if (wh.stopOf(seed) === slot) return seed;
  }
  throw new Error('no seed stops in slot ' + slot);
}

// --- the tables ---------------------------------------------------------------------------------

test('every wheel has the same segment count and returns the same exact fraction', () => {
  assert.equal(SLOTS, 28);
  assert.equal(wh.RETURN, 27);
  assert.deepEqual(wh.RISKS, ['mild', 'medium', 'wild']);
  console.log('  wheel   slots  dead      1x+      top   sum   return');
  for (const risk of wh.RISKS) {
    const segs = wh.WHEELS[risk];
    assert.equal(segs.length, SLOTS, risk);
    let sum = 0, dead = 0, top = 0;
    for (const m of segs) {
      assert.ok(Number.isSafeInteger(m) && m >= 0, risk + ' holds ' + m);
      sum += m;
      if (m === 0) dead += 1;
      if (m > top) top = m;
    }
    // the one number that matters: every wheel sums to the same thing, so the three differ in
    // shape and not at all in what the house keeps
    assert.equal(sum, wh.RETURN, risk + ' sums to ' + sum);
    console.log('  ' + risk.padEnd(8) + String(SLOTS).padStart(4)
      + String(dead).padStart(6) + ' (' + pct(dead / SLOTS).padStart(8) + ')'
      + String(SLOTS - dead).padStart(6) + String(top + 'x').padStart(8)
      + String(sum).padStart(6) + pct(sum / SLOTS).padStart(10));
  }
});

test('the return is inside the band, and said so in whole numbers', () => {
  // 0.96 <= RETURN / SLOTS <= 0.97, written the way wheel.js checks it: no float decides this
  assert.ok(100 * wh.RETURN >= 96 * SLOTS, 'under 96%');
  assert.ok(100 * wh.RETURN <= 97 * SLOTS, 'over 97%');
  // and with room on both sides, which is why it is 28 segments and not 25
  assert.ok(100 * wh.RETURN > 96 * SLOTS, 'sitting exactly on the floor of the band');
  console.log('  ' + wh.RETURN + '/' + SLOTS + ' = ' + pct(wh.RETURN / SLOTS)
    + ', so the house keeps ' + pct(1 - wh.RETURN / SLOTS));
});

test('no segment count under 25 can hold a whole-number wheel at all', () => {
  // The reason the panel does not get the 16 or 20 segments it would prefer. For each N, is there
  // an integer between 0.96N and 0.97N? Checked in whole numbers: ceil(96N/100) * 100 <= 97N
  const possible = [];
  for (let n = 2; n <= 40; n++) {
    const lo = Math.ceil((96 * n) / 100);
    if (100 * lo <= 97 * n) possible.push(n);
  }
  assert.equal(possible[0], 25, 'the smallest wheel that can be built is ' + possible[0] + ' segments');
  for (let n = 2; n < 25; n++) assert.ok(possible.indexOf(n) < 0, n + ' segments should be impossible');
  assert.ok(possible.indexOf(SLOTS) >= 0, SLOTS + ' segments must be one of the possible ones');
  // 25 is possible but lands on exactly 96.00%, the edge a retune falls off
  assert.equal(24 * 100, 96 * 25);
  console.log('  whole-number wheels are possible at ' + possible.join(', ') + ' segments');
});

test('the segments are the ones the comments claim', () => {
  // A table is the whole game, so the shape of each is pinned here rather than described
  const counts = (risk) => {
    const out = {};
    for (const m of wh.WHEELS[risk]) out[m] = (out[m] || 0) + 1;
    return out;
  };
  assert.deepEqual(counts('mild'), { 0: 6, 1: 18, 2: 3, 3: 1 });
  assert.deepEqual(counts('medium'), { 0: 14, 1: 7, 2: 4, 3: 2, 6: 1 });
  assert.deepEqual(counts('wild'), { 0: 25, 2: 1, 5: 1, 20: 1 });
  // the mild wheel cannot be built without a dead segment: 28 segments all paying 1x or more would
  // sum to at least 28, and the band stops at 27
  assert.ok(wh.RETURN < SLOTS, 'a wheel with no dead segment would be over the band');
  // and the wild wheel is its jackpot: the 20x carries this much of what the wheel returns
  assert.equal(20 / wh.RETURN > 0.7, true);
  console.log('  the wild wheel\'s 20x carries ' + pct(20 / wh.RETURN) + ' of what that wheel returns');
});

// --- the money path ----------------------------------------------------------------------------

test('the return is exact at EVERY bet, because nothing is ever rounded', () => {
  // This is the whole argument for whole-number multipliers. Walk every segment of every wheel at
  // a range of bets, odd ones included, and the credits paid out must be exactly bet * RETURN
  // against a bet * SLOTS staked. No tolerance, no band: an equality
  const bets = [wh.MIN_BET, 11, 13, 17, 25, 100, 999, 1000, 123457];
  for (const risk of wh.RISKS) {
    for (const bet of bets) {
      let paid = 0;
      for (let slot = 0; slot < SLOTS; slot++) {
        const st = { bet, mult: wh.WHEELS[risk][slot] };
        paid += st.bet * st.mult;
      }
      assert.equal(paid, bet * wh.RETURN, risk + ' at a bet of ' + bet);
      assert.equal(paid % bet, 0, 'a payout that is not a whole number of bets');
    }
  }
  // and the same walked through the engine, which is what actually pays
  for (const risk of wh.RISKS) {
    for (const bet of [wh.MIN_BET, 11, 37]) {
      let paid = 0, staked = 0;
      for (let slot = 0; slot < SLOTS; slot++) {
        const done = spin(deal(bet, seedForSlot(slot, 'exact')), risk);
        assert.equal(done.stop, slot);
        paid += done.pay;
        staked += wh.stake(done);
        assert.equal(done.net, done.pay - bet, 'net is what the balance moved by');
      }
      assert.equal(staked, bet * SLOTS);
      assert.equal(paid, bet * wh.RETURN, risk + ' through the engine at a bet of ' + bet);
    }
  }
  console.log('  three wheels x ' + SLOTS + ' segments x ' + bets.length + ' bets: paid exactly '
    + wh.RETURN + '/' + SLOTS + ' of the stake every time');
});

test('a bet too big to pay the top segment exactly is refused', () => {
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / wh.TOP);
  assert.equal(wh.TOP, 20);
  const st = deal(cap);
  assert.equal(st.bet, cap);
  assert.throws(() => deal(cap + 1), RangeError);
  // and the cap really is the point where the product stops being exact
  assert.ok(Number.isSafeInteger(cap * wh.TOP));
  for (const bad of [0, -1, 1.5, NaN, Infinity, '10', null, undefined]) {
    assert.throws(() => wh.newRound({ seed: 's', bet: bad }), RangeError, String(bad));
  }
});

// --- the spin ----------------------------------------------------------------------------------

test('a spin is one seed and one roll, and it lands on the wheel', () => {
  for (let i = 0; i < 5000; i++) {
    const slot = wh.stopOf('land-' + i);
    assert.ok(Number.isInteger(slot) && slot >= 0 && slot < SLOTS, 'stopped at ' + slot);
  }
  // the same seed always stops in the same place, and a different seed usually does not
  assert.equal(wh.stopOf('same'), wh.stopOf('same'));
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(wh.stopOf('spread-' + i));
  assert.equal(seen.size, SLOTS, 'only ' + seen.size + ' of ' + SLOTS + ' segments were ever reached');
});

test('the segments come up equally often', () => {
  // The solve believes the wheel is uniform. This is the check that the engine's own rolls really
  // are, which is what makes the exact return above a measurement of the game rather than of a
  // table. Fixed seeds, so the counts are the same on every run
  const N = 280000;
  const seen = new Array(SLOTS).fill(0);
  for (let i = 0; i < N; i++) seen[wh.stopOf('freq-' + i)] += 1;
  const p = 1 / SLOTS;
  const se = Math.sqrt((p * (1 - p)) / N);
  let worst = 0, worstAt = -1;
  for (let slot = 0; slot < SLOTS; slot++) {
    const off = Math.abs(seen[slot] / N - p) / se;
    if (off > worst) { worst = off; worstAt = slot; }
    assert.ok(off < 5, 'slot ' + slot + ' came up ' + pct(seen[slot] / N) + ' of the time');
  }
  console.log('  ' + N.toLocaleString('en-US') + ' spins, furthest off: ' + worst.toFixed(1)
    + ' SE (slot ' + worstAt + ')');
  // and the measured return over those spins, per wheel
  for (const risk of wh.RISKS) {
    let paid = 0;
    for (let slot = 0; slot < SLOTS; slot++) paid += seen[slot] * wh.WHEELS[risk][slot];
    const rtp = paid / N;
    console.log('    ' + risk.padEnd(8) + ' measured ' + pct(rtp) + ' against a solved ' + pct(wh.RETURN / SLOTS));
    assert.ok(Math.abs(rtp - wh.RETURN / SLOTS) < 0.01, risk + ' measured ' + pct(rtp));
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
  assert.equal(done.mult, wh.WHEELS.mild[done.stop]);
  assert.equal(done.pay, 10 * done.mult);
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
  assert.equal(live.pay, null);
  const done = wh.view(spin(st, 'medium'));
  assert.equal(done.seed, 'the-whole-wheel');
  assert.ok(Number.isInteger(done.stop));
});

test('the view carries all three wheels, before the bet and after it', () => {
  for (const v of [wh.idleView(), wh.view(null), wh.view(deal()), wh.view(spin(deal(), 'wild'))]) {
    assert.equal(v.slots, SLOTS);
    assert.equal(v.wheels.length, 3);
    for (const w of v.wheels) {
      assert.ok(wh.RISKS.indexOf(w.risk) >= 0);
      assert.equal(w.segments.length, SLOTS);
      assert.equal(w.rtp.num, wh.RETURN);
      assert.equal(w.rtp.den, SLOTS);
      // the legend is the wheel read by multiplier, which is what the screen prints beside it
      let slots = 0, sum = 0;
      for (const row of w.legend) {
        slots += row.slots;
        sum += row.mult * row.slots;
        assert.equal(row.chance.num, row.slots);
        assert.equal(row.chance.den, SLOTS);
      }
      assert.equal(slots, SLOTS, w.risk + ' legend counts ' + slots + ' segments');
      assert.equal(sum, wh.RETURN, w.risk + ' legend sums to ' + sum);
      assert.equal(w.top, w.legend[0].mult, 'the legend is not biggest first');
      assert.equal(w.dead.num, w.segments.filter((m) => m === 0).length);
    }
  }
  // the bet screen has the wheels and nothing live
  const idle = wh.idleView();
  assert.equal(idle.phase, 'bet');
  assert.equal(idle.can.spin, false);
  assert.equal(idle.net, null);
});

test('the multiplier in the view is read back out of the payout', () => {
  // A screen that prints a multiplier the payout does not support is the bug this closes, so the
  // view divides rather than copies. Walked over every segment of every wheel at an odd bet
  for (const risk of wh.RISKS) {
    for (let slot = 0; slot < SLOTS; slot++) {
      const done = spin(deal(13, seedForSlot(slot, 'back')), risk);
      const v = wh.view(done);
      assert.equal(v.mult, done.pay / 13);
      assert.equal(v.mult, wh.WHEELS[risk][slot], risk + ' slot ' + slot);
      assert.ok(Number.isSafeInteger(v.mult), 'a multiplier that is not a whole number');
      assert.equal(v.pay, 13 * v.mult);
      assert.equal(v.net, v.pay - 13);
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
  assert.throws(() => { v.wheels[0].segments[0] = 999; }, TypeError);
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
