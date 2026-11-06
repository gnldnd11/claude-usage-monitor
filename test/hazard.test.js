// Hazard: the rate, the ladder solved exactly, every stopping rule there is, and what the house
// keeps. No dependencies: node's assert only. Run: node test/hazard.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const hz = require(path.join(__dirname, '..', 'hazard.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const CAP = hz.POT_CAP;
const V = (st) => hz.view(st);
const snapshot = (st) => JSON.stringify(st);
const deal = (opts) => hz.newRound(Object.assign({ seed: 'x', bet: 100 }, opts));
// A round pinned to a run of faces, which is how a test chooses what comes up
const run = (faces, amount) => hz.newRound({ seed: 'pinned', bet: amount == null ? 100 : amount, stack: faces });
const roll = (st) => hz.act(st, { op: 'roll' });
const bank = (st) => hz.act(st, { op: 'bank' });

const BETS = [100, 101, 103, 107, 110, 150, 199, 200, 300, 999, 1000, 1001, 10000];
const pct = (x) => (x * 100).toFixed(4) + '%';

// --- the test's own solver ----------------------------------------------------------------------
//
// Written here as well as in the engine, and deliberately parameterized by the cap, for two
// reasons: it derives the engine's figure instead of repeating it, and it can solve a SMALLER
// version of the same game, which is what makes the claim "no rule returns more" checkable by
// walking every rule there is rather than by trusting the method.
//
// Same arithmetic as the engine: whole numbers over 6^(the most rolls a round can take), so the
// division by six is exact

const denFor = (cap) => 6n ** BigInt(Math.ceil(cap / hz.MIN_PIP));

// pay(pot) -> BigInt. Returns the best play's value at every pot, and where it banks
function solve(cap, pay) {
  const den = denFor(cap);
  const value = new Array(cap + hz.SIDES + 1);
  const cash = new Array(cap + hz.SIDES + 1).fill(true);
  for (let p = cap; p <= cap + hz.SIDES; p++) value[p] = pay(p) * den;
  for (let p = cap - 1; p >= 0; p--) {
    let sum = 0n;
    for (let k = hz.MIN_PIP; k <= hz.SIDES; k++) sum += value[p + k];
    const rollValue = sum / BigInt(hz.SIDES);
    const bankValue = pay(p) * den;
    cash[p] = p > 0 && bankValue >= rollValue;   // the first roll is bought with the bet
    value[p] = cash[p] ? bankValue : rollValue;
  }
  return { value, cash, den };
}

// The value of ONE fixed rule: bank wherever `banks(pot)` says so, roll everywhere else
function underRule(cap, pay, banks) {
  const den = denFor(cap);
  const value = new Array(cap + hz.SIDES + 1);
  for (let p = cap; p <= cap + hz.SIDES; p++) value[p] = pay(p) * den;
  for (let p = cap - 1; p >= 0; p--) {
    if (p > 0 && banks(p)) { value[p] = pay(p) * den; continue; }
    let sum = 0n;
    for (let k = hz.MIN_PIP; k <= hz.SIDES; k++) sum += value[p + k];
    value[p] = sum / BigInt(hz.SIDES);
  }
  return { value: value[0], den };
}

const RATE = (p) => BigInt(p) * BigInt(hz.PER_PIP);          // the unfloored rate, scaled by PER_DEN
const asRtp = (v, den) => Number(v) / Number(hz.PER_DEN) / Number(den);

// A copy of the engine with one line of its table broken, so the check it runs when it loads can be
// watched doing its job. A check that only ever passes is not a check
function loadBroken(from, to) {
  const file = path.join(__dirname, '..', 'hazard.js');
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(from, to);
  assert.notEqual(out, src, 'the sabotage did not apply: ' + from);
  const mod = { exports: {} };
  const dir = path.dirname(file);
  new Function('require', 'module', 'exports', '__dirname', out)(
    (id) => require(id.charAt(0) === '.' ? path.join(dir, id) : id), mod, mod.exports, dir);
  return mod.exports;
}

// --- the ladder ---------------------------------------------------------------------------------

test('the best play banks at 20, and the test solves the same ladder the engine did', () => {
  const mine = solve(CAP, RATE);
  assert.equal(mine.value[0], hz.SOLVED.value, 'two solves of one ladder disagree');
  assert.equal(mine.den, hz.SOLVED.den);
  // where it banks, and that the figure is DERIVED rather than typed: 19 rolls, 20 banks
  let at = CAP;
  for (let p = 1; p <= CAP; p++) if (mine.cash[p]) { at = p; break; }
  assert.equal(at, 20);
  assert.equal(hz.SOLVED.bankAt, 20);
  assert.equal(mine.cash[19], false, 'a pot of 19 should still roll');
  assert.equal(mine.cash[20], true, 'a pot of 20 should bank');
  // and the arithmetic behind it, which is the one line in the header: one more roll turns p into
  // (5/6)(p + 4), which beats p exactly while p is under 20
  for (const p of [10, 19, 20, 21]) {
    const rolling = 5 * (p + 4) > 6 * p;
    assert.equal(!mine.cash[p], rolling, 'pot ' + p);
  }
  const rtp = asRtp(hz.SOLVED.value, hz.SOLVED.den);
  console.log('  the best play returns ' + pct(rtp) + ' and banks '
    + pct(Number(hz.SOLVED.pCash) / Number(hz.SOLVED.den)) + ' of its rounds');
  assert.ok(rtp > 0.96 && rtp < 0.97, 'the best play returns ' + pct(rtp));
  // priced as integers, which is the band itself rather than a rounding of it
  assert.ok(100n * hz.SOLVED.value <= BigInt(hz.BAND_HI) * BigInt(hz.PER_DEN) * hz.SOLVED.den);
});

test('every threshold rule there is, solved exactly: none of them beats the band', () => {
  const rows = [];
  let best = { rtp: -1 };
  for (let t = hz.MIN_PIP; t <= CAP; t++) {
    const r = underRule(CAP, RATE, (p) => p >= t);
    const rtp = asRtp(r.value, r.den);
    rows.push({ t, rtp });
    if (rtp > best.rtp) best = { t, rtp };
    // THE claim: the band's ceiling holds whatever the player does
    assert.ok(100n * r.value <= BigInt(hz.BAND_HI) * BigInt(hz.PER_DEN) * r.den,
      'banking at ' + t + ' returns ' + pct(rtp));
  }
  for (const t of [2, 6, 9, 12, 16, 19, 20, 21, 24, 30, 50, CAP]) {
    console.log('  bank at ' + String(t).padStart(3) + ': ' + pct(rows[t - hz.MIN_PIP].rtp));
  }
  // the best threshold is the one the value iteration found, and it is the value iteration's figure
  assert.equal(best.t, hz.SOLVED.bankAt);
  assert.equal(underRule(CAP, RATE, (p) => p >= hz.SOLVED.bankAt).value, hz.SOLVED.value,
    'the best play and the best threshold should be the same play');
  // and the rules a player might actually reach for are all inside or under the band
  assert.ok(rows[0].rtp < 0.5, 'banking at the first chance returns ' + pct(rows[0].rtp));
  assert.ok(rows[rows.length - 1].rtp < 0.2, 'rolling to the cap returns ' + pct(rows[rows.length - 1].rtp));
});

test('all 4,096 rules of a smaller hazard: the value iteration really is the best of them', () => {
  // A value iteration is the greatest return any rule can reach BY CONSTRUCTION, and that is a
  // claim about the method rather than about this game. Here it is checked against the method's own
  // definition, in a version of the game small enough to walk every rule: a cap of 13 has 2^12
  // ways to choose which pots to bank at, since a pot of 0 is always rolled (the bet buys the first
  // roll) and a pot at the cap always banks
  const SMALL = 13;
  const opt = solve(SMALL, RATE);
  let best = { v: -1n, mask: -1 }, worst = { v: null };
  let n = 0;
  for (let mask = 0; mask < (1 << (SMALL - 1)); mask++) {
    const r = underRule(SMALL, RATE, (p) => !!(mask & (1 << (p - 1))));
    n += 1;
    if (r.value > best.v) best = { v: r.value, mask };
    if (worst.v === null || r.value < worst.v) worst = { v: r.value, mask };
    assert.ok(r.value <= opt.value[0], 'rule ' + mask.toString(2) + ' beats the value iteration');
  }
  assert.equal(n, 4096);
  assert.equal(best.v, opt.value[0], 'no rule reached the value iteration');
  // and the rule that reached it is the threshold the solve names
  const banksAt = [];
  for (let p = 1; p < SMALL; p++) if (best.mask & (1 << (p - 1))) banksAt.push(p);
  console.log('  cap ' + SMALL + ': the best of 4,096 rules banks at {' + banksAt.join(',') + '} and returns '
    + pct(asRtp(best.v, opt.den)) + ', the worst returns ' + pct(asRtp(worst.v, opt.den)));
  // in that smaller game the cap binds, so the best rule is "never bank below the cap": the point
  // here is the method, not the figure
  assert.ok(asRtp(best.v, opt.den) <= hz.BAND_HI / 100 || SMALL < hz.SOLVED.bankAt);
});

// --- the return, with the floor on -------------------------------------------------------------

test('the best play, solved again with the FLOORED payouts, holds the band at every bet', () => {
  let worst = { rtp: 9 }, best = { rtp: -1 };
  const bets = BETS.slice();
  for (let b = hz.MIN_BET; b <= 300; b++) if (bets.indexOf(b) < 0) bets.push(b);
  for (const b of bets) {
    // the payout the engine really pays, floored, is what the player optimises against
    const r = solve(CAP, (p) => BigInt(hz.payoutOf(b, p)));
    const rtp = Number(r.value[0]) / Number(r.den) / b;
    if (rtp < worst.rtp) worst = { rtp, bet: b };
    if (rtp > best.rtp) best = { rtp, bet: b };
    assert.ok(rtp >= hz.BAND_LO / 100 && rtp <= hz.BAND_HI / 100, 'a bet of ' + b + ' returns ' + pct(rtp));
  }
  console.log('  ' + bets.length + ' bets: worst ' + pct(worst.rtp) + ' at a bet of ' + worst.bet
    + ', best ' + pct(best.rtp) + ' at a bet of ' + best.bet);
  // the floor can only take: the unfloored solve is the ceiling on all of them
  assert.ok(best.rtp <= asRtp(hz.SOLVED.value, hz.SOLVED.den) + 1e-12);
  // and the bound the engine checks itself against when it loads really does bound it
  const bound = asRtp(hz.SOLVED.value, hz.SOLVED.den) - Number(hz.SOLVED.pCash) / Number(hz.SOLVED.den) / hz.MIN_BET;
  console.log('  the load check\'s bound is ' + pct(bound) + ', and nothing measured came under it');
  assert.ok(worst.rtp >= bound, 'the bound is not a bound');
  assert.ok(bound >= hz.BAND_LO / 100, 'the bound itself is outside the band');
});

test('a floor of 10 would break the band, which is why it is 100', () => {
  // The figure MIN_BET is solved from. The floor eats under one credit on the 37.5% of rounds that
  // bank, so at a bet of 10 that is 3.8% of the stake against a band 1% wide
  const r = solve(CAP, (p) => BigInt(hz.payoutOf(10, p)));
  const rtp = Number(r.value[0]) / Number(r.den) / 10;
  console.log('  at a bet of 10 the best play returns ' + pct(rtp));
  assert.ok(rtp < hz.BAND_LO / 100, 'a bet of 10 returns ' + pct(rtp) + ', which is inside the band after all');
  assert.equal(hz.MIN_BET, 100);
});

test('the check it runs when it loads has teeth', () => {
  // one thousandth more per pip: every other property of the game survives it and the band does not
  assert.throws(() => loadBroken('const PER_PIP = 119;', 'const PER_PIP = 120;'), /returns over the band/);
  // the floor that holds the best play inside the band
  assert.throws(() => loadBroken('const MIN_BET = 100;', 'const MIN_BET = 10;'), /cannot hold the best play/);
  // and a cap low enough to decide a round the best play would still be playing
  assert.throws(() => loadBroken('const POT_CAP = 100;', 'const POT_CAP = 15;'), /the cap decides/);
  // the sabotage harness itself works, or the three above would pass on a typo
  assert.equal(loadBroken('const PER_PIP = 119;', 'const PER_PIP = 119; /* x */').PER_PIP, 119);
});

// --- the round ----------------------------------------------------------------------------------

test('the bet buys the first roll, and a 1 takes the pot', () => {
  const st = run([4, 3, 1]);
  assert.equal(st.phase, 'play');
  assert.equal(st.pot, 4);
  assert.deepEqual(st.faces, [4]);
  const two = roll(st);
  assert.equal(two.pot, 7);
  assert.deepEqual(two.faces, [4, 3]);
  const gone = roll(two);
  assert.equal(gone.phase, 'done');
  assert.equal(gone.result, 'bust');
  assert.equal(gone.pot, 0, 'a bust takes the whole pot');
  assert.equal(gone.paid, 0);
  assert.equal(gone.net, -100);
  // a round that busts on the very first roll is a round that happened: the bet bought that roll
  const atOnce = run([1, 6, 6]);
  assert.equal(atOnce.phase, 'done');
  assert.equal(atOnce.result, 'bust');
  assert.deepEqual(atOnce.faces, [1]);
  assert.equal(atOnce.net, -100);
  // every face but the 1 adds itself
  for (let f = hz.MIN_PIP; f <= hz.SIDES; f++) {
    assert.equal(run([f]).pot, f, 'a ' + f + ' should add ' + f);
  }
  assert.equal(hz.BUST, 1);
});

test('banking pays the pot and ends the round, and the pot banks itself at the cap', () => {
  // five fours is a pot of 20, which is where the best play stops
  const st = [2, 3, 4, 5].reduce((s) => roll(s), run([4, 4, 4, 4, 4]));
  assert.equal(st.pot, 20);
  assert.equal(st.phase, 'play');
  const took = bank(st);
  assert.equal(took.phase, 'done');
  assert.equal(took.result, 'banked');
  assert.equal(took.capped, false);
  assert.equal(took.paid, hz.payoutOf(100, 20));
  assert.equal(took.paid, 238);
  assert.equal(took.net, 138);
  // and the cap: a run of sixes banks itself where it lands, which is at or just over the cap
  const sixes = new Array(hz.MAX_ROLLS).fill(6);
  let far = run(sixes);
  while (far.phase === 'play') far = roll(far);
  assert.equal(far.result, 'banked');
  assert.equal(far.capped, true);
  assert.ok(far.pot >= CAP && far.pot < CAP + hz.SIDES, 'the cap let the pot reach ' + far.pot);
  assert.equal(far.paid, hz.payoutOf(100, far.pot));
  console.log('  the cap banks at a pot of ' + far.pot + ', worth ' + far.paid + ' on a bet of 100');
  // a round can never ask for more faces than were drawn at the deal
  assert.ok(far.pos <= hz.MAX_ROLLS, 'the round drew ' + far.pos + ' of ' + hz.MAX_ROLLS);
  assert.equal(hz.MAX_ROLLS * hz.MIN_PIP >= CAP, true);
});

test('a settled round cannot be settled twice, and the sentences say why', () => {
  const done = bank(run([6, 6]));
  assert.equal(done.phase, 'done');
  const paid = done.paid, net = done.net;
  for (const op of ['roll', 'bank', { op: 'roll' }, { op: 'bank' }]) {
    assert.equal(hz.whyNot(done, op), 'the round is over');
    assert.equal(hz.act(done, op), done, 'a refused action gives back the very same object');
  }
  assert.equal(done.paid, paid, 'a refused action moved the money');
  assert.equal(done.net, net);
  // an op this game does not have
  const live = run([6, 6]);
  for (const op of ['hit', 'spin', 'close', undefined, null, {}, { op: 'dig' }]) {
    assert.equal(hz.whyNot(live, op), 'unknown action', String(op));
    assert.equal(hz.act(live, op), live);
  }
  assert.equal(hz.whyNot(null, 'roll'), 'the round is over');
  assert.equal(hz.whyNot(live, 'roll'), null);
  assert.equal(hz.whyNot(live, 'bank'), null);
  // a short stack is a test's mistake, not a player's: the engine says so rather than paying out
  assert.throws(() => roll(run([6])), RangeError);
});

test('act never mutates its input, and both moves leave the round it was handed alone', () => {
  for (let i = 0; i < 300; i++) {
    let st = hz.newRound({ seed: 'mut-' + i, bet: 100 });
    while (st.phase === 'play' && st.pot < 20) {
      const before = snapshot(st);
      const next = roll(st);
      assert.equal(snapshot(st), before, 'roll mutated the round it was handed');
      bank(st);
      assert.equal(snapshot(st), before, 'bank mutated the round it was handed');
      st = next;
    }
  }
});

test('the bet is riding from the deal until it settles', () => {
  const live = run([6, 6, 6]);
  assert.equal(hz.stake(live), 100);
  assert.equal(hz.stake(bank(live)), 100, 'stake() answers for the round, live or not');
  // which is what the driver reads to hold it back from the other games
  assert.equal(hz.stake(hz.newRound({ seed: 'x', bet: 5000 })), 5000);
});

// --- money --------------------------------------------------------------------------------------

test('every payout is a whole number, rounded the house way, and the pot only grows', () => {
  for (const b of BETS) {
    let last = -1;
    for (let pot = 0; pot <= CAP + hz.SIDES; pot++) {
      const pay = hz.payoutOf(b, pot);
      assert.ok(Number.isSafeInteger(pay), 'payout ' + pay);
      assert.ok(pay <= b * pot * hz.PER_PIP / hz.PER_DEN, 'the pot pays over the rate at ' + pot);
      assert.ok(pay > b * pot * hz.PER_PIP / hz.PER_DEN - 1, 'the pot pays over a credit under at ' + pot);
      assert.ok(pay >= last, 'a bigger pot paid less at ' + pot);
      last = pay;
      // and the multiple the screen prints is the one the payout really is, never higher
      const m = hz.mult100Of(b, pot);
      assert.ok(m * b <= 100 * pay, 'the screen would print more than the payout at ' + pot);
      assert.ok((m + 1) * b > 100 * pay, 'the multiple is further than a hundredth under at ' + pot);
    }
  }
  // where banking starts being worth more than the bet. Under it, taking the pot is a smaller loss
  // rather than a win, which the screen labels with this figure
  assert.equal(hz.breakEvenOf(100), 9);
  assert.ok(hz.payoutOf(100, 8) < 100 && hz.payoutOf(100, 9) > 100);
  for (const b of BETS) {
    const e = hz.breakEvenOf(b);
    assert.ok(hz.payoutOf(b, e) > b, 'break even at ' + b + ' is ' + e);
    assert.ok(hz.payoutOf(b, e - 1) <= b, 'break even at ' + b + ' is later than ' + e);
  }
  // the bet does not change the game, only the size of it
  for (const b of [100, 1000, 10000]) {
    const st = bank([2, 3, 4].reduce((s) => roll(s), run([5, 5, 5, 5], b)));
    assert.equal(st.pot, 20);
    assert.equal(st.paid, hz.payoutOf(b, 20));
    assert.equal(st.net, st.paid - b);
    assert.equal(st.net, Math.trunc(st.net), 'no fraction survives the payout');
  }
});

test('the bet is a whole number the biggest pot can be paid on', () => {
  assert.throws(() => hz.newRound({ seed: 'x', bet: 1.5 }), RangeError);
  assert.throws(() => hz.newRound({ seed: 'x', bet: 0 }), RangeError);
  assert.throws(() => hz.newRound({ seed: 'x', bet: -100 }), RangeError);
  assert.throws(() => hz.newRound({ seed: 'x', bet: 2 ** 53 }), RangeError);
  const top = CAP + hz.SIDES - 1;
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / (100 * top * hz.PER_PIP));
  assert.equal(hz.newRound({ seed: 'x', bet: cap }).bet, cap);
  assert.ok(Number.isSafeInteger(100 * hz.payoutOf(cap, top)), 'the cap itself still pays exactly');
  assert.throws(() => hz.newRound({ seed: 'x', bet: cap + 1 }), RangeError);
  assert.equal(hz.MIN_BET, 100);
  assert.equal(hz.idleView().minBet, 100);
});

// --- determinism and what the webview sees ------------------------------------------------------

test('the same seed rolls the same faces, and the id is not the seed', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'det-' + i;
    assert.deepEqual(hz.rollsOf(seed), hz.rollsOf(seed));
    assert.deepEqual(V(deal({ seed })), V(deal({ seed })));
  }
  const distinct = new Set(Array.from({ length: 300 }, (_, i) => hz.rollsOf('d' + i).join(',')));
  assert.equal(distinct.size, 300, 'only ' + distinct.size + ' different runs in 300 seeds');
  // the id names the round and does not roll it
  const id = 'c0ffee';
  const byId = hz.newRound({ seed: 'the-seed', id, bet: 100 });
  assert.equal(byId.id, id);
  assert.notEqual(V(byId).id, V(byId).seed === undefined ? null : V(byId).seed);
  assert.notDeepEqual(hz.rollsOf(id), hz.rollsOf('the-seed'));
  // and the faces do not depend on what the player does with them: the same seed plays out the
  // same run whether it is banked at once or rolled to the cap
  for (let i = 0; i < 50; i++) {
    const seed = 'play-' + i;
    const a = hz.newRound({ seed, bet: 100 });
    let b = hz.newRound({ seed, bet: 100 });
    while (b.phase === 'play' && b.faces.length < 3) b = roll(b);
    assert.equal(b.faces[0], a.faces[0], seed);
    assert.deepEqual(b.rolls, a.rolls, seed);
  }
  // the faces land evenly, which is the one thing the exact solve above cannot see
  const N = 60000;
  const seen = new Array(7).fill(0);
  for (let i = 0; i < N; i++) for (const f of hz.rollsOf('even-' + i)) seen[f] += 1;
  const total = N * hz.MAX_ROLLS;
  const p = 1 / hz.SIDES, se = Math.sqrt(p * (1 - p) / total);
  let worst = 0;
  for (let f = 1; f <= hz.SIDES; f++) {
    const off = Math.abs(seen[f] / total - p) / se;
    if (off > worst) worst = off;
    assert.ok(off < 5, 'the ' + f + ' came up ' + pct(seen[f] / total) + ' of the time');
  }
  console.log('  ' + total.toLocaleString('en-US') + ' faces, furthest off: ' + worst.toFixed(1) + ' SE');
});

test('a live round carries no seed and none of the faces still to come', () => {
  // THIS is the game where that rule has teeth: the seed is every face the player has not seen, and
  // a webview holding it would know whether the next roll busts
  let st = run([6, 5, 4, 1]);
  for (let i = 0; i < 3; i++) {
    const v = V(st);
    assert.equal(v.phase, 'play');
    assert.equal('seed' in v, false, 'a live round must not carry its seed');
    assert.equal('rolls' in v, false, 'a live round must not carry the faces still to come');
    assert.equal('pos' in v, false);
    assert.deepEqual(v.faces, st.faces, 'only the faces already rolled');
    assert.equal(v.rolled, st.faces.length);
    assert.equal(v.pot, st.pot);
    // what banking right now would pay, which is the figure the player is deciding against
    assert.equal(v.payout, hz.payoutOf(st.bet, st.pot));
    assert.equal(v.mult100, hz.mult100Of(st.bet, st.pot));
    assert.deepEqual(v.can, { roll: true, bank: true });
    assert.equal(v.paid, null);
    assert.equal(v.net, null);
    st = roll(st);
  }
  // and at the end the seed is handed over, because the run it names is spent
  assert.equal(st.phase, 'done');
  const v = V(st);
  assert.equal(v.seed, st.seed);
  assert.equal('rolls' in v, false, 'a settled round still hands over no face list');
  assert.equal(v.result, 'bust');
  assert.equal(v.payout, 0);
  assert.deepEqual(v.can, { roll: false, bank: false });
  // a banked round hands over what it was worth
  const took = bank(run([6, 6]));
  assert.equal(V(took).payout, took.paid);
  assert.equal(V(took).mult100, hz.mult100Of(100, took.pot));
});

test('the idle view is a bet screen with the rate on it', () => {
  const v = hz.idleView();
  assert.equal(v.phase, 'bet');
  assert.equal(v.id, null);
  assert.equal(v.bet, null);
  assert.equal(v.pot, 0);
  assert.deepEqual(v.faces, []);
  assert.equal(v.paid, null);
  assert.equal(v.net, null);
  assert.equal('seed' in v, false, 'there is no round, so there is no seed');
  assert.deepEqual(v.rate, { num: hz.PER_PIP, den: hz.PER_DEN });
  assert.equal(v.bust, 1);
  assert.equal(v.potCap, CAP);
  assert.equal(v.bankAt, hz.SOLVED.bankAt);
  assert.equal(v.breakEven, hz.breakEvenOf(hz.MIN_BET));
  assert.deepEqual(v.can, { roll: false, bank: false });
  assert.deepEqual(hz.view(null), v);
  // the two views agree on everything the game is, and differ only in what one round did
  const live = V(run([6]));
  for (const k of ['bust', 'sides', 'potCap', 'maxRolls', 'bankAt', 'minBet']) assert.equal(live[k], v[k], k);
});

test('the engine knows nothing but cards.js', () => {
  // Pure: no vscode, no ledger. The one import is the shared seeded source, and what it uses from
  // it is the ROLL stream, not a shuffle: there are no cards here
  const src = fs.readFileSync(path.join(__dirname, '..', 'hazard.js'), 'utf8');
  const requires = src.match(/require\(([^)]*)\)/g) || [];
  assert.deepEqual(requires, ["require('./cards')"]);
  assert.ok(src.indexOf('rollsFrom') > 0, 'the faces should roll, not shuffle');
  assert.equal(src.indexOf('Math.random'), -1, 'the seed comes from the host');
  assert.equal(hz.MIN_BET, 100);
  assert.deepEqual(hz.OPS, ['roll', 'bank']);
  assert.equal(typeof C.rollsFrom, 'function');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
