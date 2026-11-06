// The dice: the dial, every one of the 10,000 rolls against every one of the 96 targets, and what
// the house keeps. No dependencies: node's assert only. Run: node test/dice.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const di = require(path.join(__dirname, '..', 'dice.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const FACES = di.FACES;
const PER = di.PER_PERCENT;
const V = (st) => di.view(st);
const snapshot = (st) => JSON.stringify(st);
const roll = (opts) => di.newRound(Object.assign({ seed: 'x', bet: 100, target: 50 }, opts));
// A round pinned to a roll, which is how a test chooses the outcome
const at = (r, target, bet) => di.newRound({ seed: 'pinned', bet: bet == null ? 100 : bet, target, roll: r });

const TARGETS = [];
for (let t = di.MIN_TARGET; t <= di.MAX_TARGET; t++) TARGETS.push(t);
// the bets a player can actually build out of the chips, plus the ones where the floor bites
// hardest (a bet one over a round hundred leaves the biggest remainder behind)
const BETS = [100, 101, 103, 107, 110, 150, 199, 200, 300, 999, 1000, 1001, 10000, 123457];

const pct = (x) => (x * 100).toFixed(4) + '%';

// A copy of the engine with one line of its table broken, so the check it runs when it loads can be
// watched doing its job. A check that only ever passes is not a check
function loadBroken(from, to) {
  const file = path.join(__dirname, '..', 'dice.js');
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(from, to);
  assert.notEqual(out, src, 'the sabotage did not apply: ' + from);
  const mod = { exports: {} };
  const dir = path.dirname(file);
  new Function('require', 'module', 'exports', '__dirname', out)(
    (id) => require(id.charAt(0) === '.' ? path.join(dir, id) : id), mod, mod.exports, dir);
  return mod.exports;
}

// --- the dial -----------------------------------------------------------------------------------

test('the dial is 1 to 96 and every row is the same division', () => {
  assert.equal(FACES, 10000);
  assert.equal(PER, 100);
  assert.equal(di.HOUSE, 97);
  assert.equal(di.MIN_TARGET, 1);
  assert.equal(di.MAX_TARGET, 96);
  assert.equal(di.PAYS.length, 96);
  for (const row of di.PAYS) {
    assert.deepEqual(row.chance, { num: 100 * row.target, den: FACES });
    assert.deepEqual(row.mult, { num: 97, den: row.target });
    assert.equal(row.mult100, di.mult100Of(di.MIN_BET, row.target));
    // the chance of winning times the multiple is the house's figure, exactly, on every row
    assert.equal(row.chance.num * row.mult.num * 100, di.HOUSE * row.chance.den * row.mult.den,
      'target ' + row.target + ' does not return ' + di.HOUSE + '%');
  }
  // a thinner target always pays more, and every payout beats the bet
  for (let i = 1; i < di.PAYS.length; i++) {
    const a = di.PAYS[i - 1], b = di.PAYS[i];
    assert.ok(b.target > a.target, 'the dial does not climb at ' + b.target);
    assert.ok(b.mult100 < a.mult100, 'target ' + b.target + ' pays as much as ' + a.target);
    assert.ok(b.mult100 > 100, 'a win at target ' + b.target + ' pays ' + b.mult100 / 100 + 'x');
  }
  assert.equal(di.PAYS[0].mult100, 9700);
  assert.equal(di.PAYS[95].mult100, 101);
  // and nobody outside can retune it
  assert.throws(() => { di.PAYS[0].mult100 = 1; }, TypeError);
  assert.throws(() => { di.PAYS.push({}); }, TypeError);
  assert.throws(() => { di.PAYS[0].chance.num = 1; }, TypeError);
});

test('the targets above 96 are cut because a win there is not a win', () => {
  // this is the whole reason the dial stops where it does: at 97 the multiple is exactly one and
  // above it a "win" pays less than the bet
  assert.equal(di.payoutOf(100, 96), 101);
  assert.equal(di.badTarget(97), 'the target runs from 1 to 96');
  for (const t of [97, 98, 99]) {
    // what those rows would have paid, worked out the same way the engine works out a payout
    const pay = Math.floor(100 * di.HOUSE / t);
    assert.ok(pay <= 100, 'target ' + t + ' would pay ' + pay + ' on a bet of 100');
  }
  for (const bad of [0, -1, 100, 1.5, '50', null, undefined, NaN, Infinity]) {
    assert.ok(di.badTarget(bad), 'target ' + bad + ' should be refused');
    assert.throws(() => di.newRound({ seed: 'x', bet: 100, target: bad }), RangeError, 'target ' + bad);
  }
  assert.equal(di.badTarget(di.DEFAULT_TARGET), null);
});

// --- the return ---------------------------------------------------------------------------------

// Every roll there is, against every target there is. These are not measurements: they are the
// whole outcome space, so the figures below only move if the table does
test('all 10,000 rolls x all 96 targets: the house keeps 3 to 4%, at every bet', () => {
  let worst = { rtp: 9 }, best = { rtp: -1 };
  // the enumeration, at the smallest bet the game takes
  console.log('  target'.padEnd(10) + 'wins'.padStart(7) + 'chance'.padStart(10)
    + 'pays'.padStart(11) + 'return'.padStart(11));
  for (const t of TARGETS) {
    let wins = 0;
    for (let r = 0; r < FACES; r++) if (di.winsAt(r, t)) wins += 1;
    // the count is the arithmetic the whole table was solved from: 100 rolls per whole percent
    assert.equal(wins, PER * t, 'target ' + t);
    const pay = di.payoutOf(di.MIN_BET, t);
    const gross = wins * pay;
    const staked = FACES * di.MIN_BET;
    assert.ok(100 * gross >= di.BAND_LO * staked && 100 * gross <= di.BAND_HI * staked,
      'target ' + t + ' returns ' + pct(gross / staked));
    if ([1, 2, 5, 25, 50, 75, 89, 95, 96].indexOf(t) >= 0) {
      console.log('  ' + String(t).padEnd(8) + String(wins).padStart(7) + pct(wins / FACES).padStart(10)
        + ('x' + (pay / di.MIN_BET).toFixed(4)).padStart(11) + pct(gross / staked).padStart(11));
    }
  }
  // and the same thing over every bet in the list, so the floor is priced rather than assumed
  for (const t of TARGETS) {
    for (const bet of BETS) {
      const pay = di.payoutOf(bet, t);
      const gross = PER * t * pay;
      const staked = FACES * bet;
      const rtp = gross / staked;
      if (rtp < worst.rtp) worst = { rtp, t, bet };
      if (rtp > best.rtp) best = { rtp, t, bet };
      assert.ok(100 * gross >= di.BAND_LO * staked && 100 * gross <= di.BAND_HI * staked,
        'target ' + t + ' at a bet of ' + bet + ' returns ' + pct(rtp));
    }
  }
  console.log('  over ' + (TARGETS.length * BETS.length) + ' (target, bet) pairs: worst '
    + pct(worst.rtp) + ' at target ' + worst.t + ' bet ' + worst.bet
    + ', best ' + pct(best.rtp) + ' at target ' + best.t);
  // the best is the table itself: the floor can only take, never give
  assert.equal(best.rtp, di.HOUSE / 100);
  // and the worst is the bound the module checks itself against when it loads: the floor costs
  // under one credit on a win, so it costs under target / (100 * bet) of the stake
  assert.ok(worst.rtp > di.HOUSE / 100 - di.MAX_TARGET / (100 * di.MIN_BET), 'the bound is not a bound');
});

test('a sweep of every bet from 100 to 2,000 holds the band on the worst targets', () => {
  // the targets the enumeration above found at the bottom of the band, every bet, no sampling
  let worst = { rtp: 9 };
  for (const t of [85, 87, 89, 91, 93, 95, 96]) {
    for (let bet = di.MIN_BET; bet <= 2000; bet++) {
      const gross = PER * t * di.payoutOf(bet, t);
      const staked = FACES * bet;
      if (gross / staked < worst.rtp) worst = { rtp: gross / staked, t, bet };
      assert.ok(100 * gross >= di.BAND_LO * staked, 'target ' + t + ' at ' + bet + ' returns ' + pct(gross / staked));
    }
  }
  console.log('  13,307 bets: worst ' + pct(worst.rtp) + ' at target ' + worst.t + ' bet ' + worst.bet);
});

test('a floor of 10 would break the band, which is why it is 100', () => {
  // The figure MIN_BET is solved from. At a bet of 10 the one credit the floor eats is 10% of the
  // stake and the band is 1% wide, so the wide end of the dial falls out of it. This is the same
  // arithmetic the minefield and the tower settled on 100 for
  let bad = 0, worst = { rtp: 9 };
  for (const t of TARGETS) {
    const gross = PER * t * di.payoutOf(10, t);
    const staked = FACES * 10;
    if (gross / staked < worst.rtp) worst = { rtp: gross / staked, t };
    if (100 * gross < di.BAND_LO * staked) bad += 1;
  }
  console.log('  at a bet of 10: ' + bad + ' of 96 targets fall out of the band, worst '
    + pct(worst.rtp) + ' at target ' + worst.t);
  assert.ok(bad > 20, 'only ' + bad + ' targets break at a bet of 10');
  assert.equal(di.MIN_BET, 100);
  // and the engine's own check says the same thing in one line
  assert.ok(di.MAX_TARGET <= (di.BAND_HI - di.BAND_LO) * di.MIN_BET);
});

test('the check it runs when it loads has teeth', () => {
  // a house figure over the band: the game refuses to exist rather than paying out more than it
  // takes. One digit, and every other property of the table survives it
  assert.throws(() => loadBroken('const HOUSE = 97;', 'const HOUSE = 98;'), /returns 98%, over the band/);
  // a dial that runs past the point where a win pays more than the bet
  assert.throws(() => loadBroken('const MAX_TARGET = 96;', 'const MAX_TARGET = 99;'), /pays 100 on a bet of 100/);
  // and the floor that holds the whole thing inside the band
  assert.throws(() => loadBroken('const MIN_BET = 100;', 'const MIN_BET = 10;'), /cannot hold target 96/);
  // the sabotage harness itself works, or the three above would pass on a typo
  assert.equal(loadBroken('const HOUSE = 97;', 'const HOUSE = 97; /* x */').HOUSE, 97);
});

// --- the roll -----------------------------------------------------------------------------------

test('a roll is a whole hundredth inside the dial, from the shared roll stream', () => {
  for (let i = 0; i < 5000; i++) {
    const r = di.rollOf('r-' + i);
    assert.ok(Number.isInteger(r) && r >= 0 && r < FACES, 'roll ' + r);
  }
  // the roll comes off cards.js's seeded stream: one PRNG in the repo, not a second copy
  for (let i = 0; i < 300; i++) {
    const seed = 'stream-' + i;
    assert.equal(di.rollOf(seed), Math.floor(C.rollsFrom(seed)() * FACES));
  }
  // a pinned roll has to be a real one
  assert.throws(() => at(FACES, 50), RangeError);
  assert.throws(() => at(-1, 50), RangeError);
  assert.throws(() => at(1.5, 50), RangeError);
  assert.throws(() => di.winsAt(0, 0), RangeError);
});

test('the rolls land evenly, which is what makes the enumeration a fact about the engine', () => {
  // The return above is exact GIVEN even rolls. This is the check that the engine's own stream
  // really is even, which is the one thing an enumeration cannot see. Fixed seeds, same counts
  // every run
  const N = 200000;
  const BUCKETS = 100;              // one per whole percent, which is what a target is
  const seen = new Array(BUCKETS).fill(0);
  for (let i = 0; i < N; i++) seen[Math.floor(di.rollOf('even-' + i) / PER)] += 1;
  const p = 1 / BUCKETS, se = Math.sqrt(p * (1 - p) / N);
  let worst = 0, worstAt = 0;
  for (let i = 0; i < BUCKETS; i++) {
    const off = Math.abs(seen[i] / N - p) / se;
    if (off > worst) { worst = off; worstAt = i; }
    assert.ok(off < 5, 'percent ' + i + ' came up ' + pct(seen[i] / N));
  }
  console.log('  ' + N.toLocaleString('en-US') + ' rolls, furthest off: ' + worst.toFixed(1)
    + ' SE (the ' + worstAt + ' percent)');
  // and the win rate of a target is its own chance, measured rather than assumed
  for (const t of [1, 25, 50, 96]) {
    let wins = 0;
    for (let i = 0; i < N; i++) if (di.winsAt(di.rollOf('even-' + i), t)) wins += 1;
    const q = t / 100;
    const off = Math.abs(wins / N - q) / Math.sqrt(q * (1 - q) / N);
    assert.ok(off < 5, 'target ' + t + ' won ' + pct(wins / N) + ' of the time');
  }
});

// --- the round ----------------------------------------------------------------------------------

test('a roll is one press: it is born settled and nothing can be played on it', () => {
  const st = at(0, 50, 100);
  assert.equal(st.phase, 'done');
  assert.equal(st.win, true);
  assert.equal(st.payout, 194);
  assert.equal(st.net, 94);
  assert.deepEqual(di.OPS, []);
  for (const op of [undefined, null, 'roll', 'aim', { op: 'roll' }, { op: 'close', tiles: [1] }]) {
    assert.equal(di.whyNot(st, op), 'a roll settles on the press, so there is nothing to play');
    assert.equal(di.act(st, op), st, 'a refused action gives back the very same object');
  }
  assert.equal(di.whyNot(null, 'roll'), 'a roll settles on the press, so there is nothing to play');
  // nothing is ever riding between two messages, which is what the other games' budgets read
  assert.equal(di.stake(st), 0);
  assert.equal(di.stake(null), 0);
});

test('a refused move moves no money, and act never mutates its input', () => {
  for (let i = 0; i < 300; i++) {
    const st = di.newRound({ seed: 'mut-' + i, bet: 100, target: 1 + (i % 96) });
    const before = snapshot(st);
    const net = st.net;
    di.act(st, { op: 'roll' });
    di.act(st, 'bank');
    di.act(st, null);
    assert.equal(snapshot(st), before, 'act mutated the round it was handed');
    assert.equal(st.net, net, 'a refused action moved the money');
  }
});

test('the roll settles under the target and nowhere else', () => {
  for (const t of [1, 2, 50, 95, 96]) {
    const edge = PER * t;
    const win = at(edge - 1, t, 100);
    assert.equal(win.win, true, 'target ' + t + ' should win on ' + (edge - 1));
    assert.equal(win.payout, di.payoutOf(100, t));
    assert.equal(win.net, win.payout - 100);
    const lose = at(edge, t, 100);
    assert.equal(lose.win, false, 'target ' + t + ' should lose on ' + edge);
    assert.equal(lose.payout, 0);
    assert.equal(lose.net, -100);
    assert.equal(lose.mult100, 0);
  }
  // 0.00 is under every target, so the smallest roll there is always wins
  for (const t of TARGETS) assert.equal(at(0, t).win, true, 'target ' + t);
  // and 99.99 is under none of them
  for (const t of TARGETS) assert.equal(at(FACES - 1, t).win, false, 'target ' + t);
});

// --- money --------------------------------------------------------------------------------------

test('every payout is a whole number, rounded the house way, and the multiple is read back out of it', () => {
  for (const bet of BETS) {
    for (const t of TARGETS) {
      const pay = di.payoutOf(bet, t);
      assert.ok(Number.isSafeInteger(pay), 'payout ' + pay);
      // the floor is the house's: never more than the true figure, and under one credit less
      assert.ok(pay <= bet * di.HOUSE / t, 'target ' + t + ' at ' + bet + ' pays over the odds');
      assert.ok(pay > bet * di.HOUSE / t - 1, 'target ' + t + ' at ' + bet + ' pays over a credit under');
      // a win is a win at every bet the game takes
      assert.ok(pay > bet, 'target ' + t + ' at a bet of ' + bet + ' pays ' + pay);
      // and the multiple the screen prints is the one the payout really is, never higher
      const m = di.mult100Of(bet, t);
      assert.ok(Number.isSafeInteger(m));
      assert.ok(m * bet <= 100 * pay, 'the screen would print more than the payout');
      assert.ok((m + 1) * bet > 100 * pay, 'the multiple is further than a hundredth under');
      const st = at(0, t, bet);
      assert.equal(st.payout, pay);
      assert.equal(st.mult100, m);
      assert.equal(st.net, pay - bet);
      assert.equal(st.net, Math.trunc(st.net), 'no fraction survives the payout');
    }
  }
});

test('the bet is a whole number the top row can be paid on', () => {
  assert.throws(() => di.newRound({ seed: 'x', bet: 1.5, target: 50 }), RangeError);
  assert.throws(() => di.newRound({ seed: 'x', bet: 0, target: 50 }), RangeError);
  assert.throws(() => di.newRound({ seed: 'x', bet: -100, target: 50 }), RangeError);
  assert.throws(() => di.newRound({ seed: 'x', bet: 2 ** 53, target: 50 }), RangeError);
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / (100 * di.HOUSE));
  assert.equal(di.newRound({ seed: 'x', bet: cap, target: 1 }).bet, cap);
  assert.ok(Number.isSafeInteger(100 * di.payoutOf(cap, 1)), 'the cap itself still pays exactly');
  assert.throws(() => di.newRound({ seed: 'x', bet: cap + 1, target: 1 }), RangeError);
  // the floor the host reads, so a game screen holds no minimum of its own
  assert.equal(di.MIN_BET, 100);
  assert.equal(di.idleView().minBet, 100);
});

// --- determinism and what the webview sees ------------------------------------------------------

test('the same seed rolls the same number, and the id is not the seed', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'det-' + i;
    assert.deepEqual(V(roll({ seed })), V(roll({ seed })));
  }
  const distinct = new Set(Array.from({ length: 500 }, (_, i) => di.rollOf('d' + i)));
  assert.ok(distinct.size > 450, 'only ' + distinct.size + ' different rolls in 500 seeds');
  // the id names the round and does not roll it: handed the id, the dial lands somewhere else
  const id = 'c0ffee';
  const byId = di.newRound({ seed: 'the-seed', id, bet: 100, target: 50 });
  assert.equal(byId.id, id);
  assert.notEqual(V(byId).id, V(byId).seed);
  assert.notEqual(di.rollOf(id), di.rollOf('the-seed'));
  // and the target does not move the roll: the same seed lands on the same number whatever the
  // player aimed at, so re-aiming cannot shop for a roll
  for (let i = 0; i < 50; i++) {
    const seed = 'aim-' + i;
    const a = di.newRound({ seed, bet: 100, target: 10 });
    const b = di.newRound({ seed, bet: 100, target: 90 });
    assert.equal(a.roll, b.roll, seed);
  }
});

test('the view carries the dial and the seed only once the round is over', () => {
  for (let i = 0; i < 200; i++) {
    const st = di.newRound({ seed: 'view-' + i, id: 'id-' + i, bet: 100, target: 1 + (i % 96) });
    const v = V(st);
    assert.equal(v.phase, 'done');
    assert.equal(v.roll, st.roll);
    assert.equal(v.target, st.target);
    assert.equal(v.win, st.win);
    assert.equal(v.payout, st.payout);
    assert.equal(v.mult100, st.mult100);
    assert.equal(v.net, st.net);
    assert.equal(v.row, di.ROW[st.target]);
    assert.equal(v.pays, di.PAYS);
    assert.equal(v.faces, FACES);
    assert.equal(v.minBet, di.MIN_BET);
    assert.deepEqual(v.can, {});
    // the seed is handed over because the roll it names is already over
    assert.equal(v.seed, st.seed);
  }
  // and the rule is the SHAPE of the function, not a property of there being one phase: a round in
  // any other phase gets no seed, which is the line that leaked a whole deck once
  const live = Object.assign({}, roll({ seed: 'live' }), { phase: 'roll' });
  assert.equal('seed' in di.view(live), false, 'a live round must not carry its seed');
  assert.equal('seed' in di.idleView(), false, 'there is no roll, so there is no seed');
});

test('the idle view is a bet screen with the whole dial on it', () => {
  const v = di.idleView();
  assert.equal(v.phase, 'bet');
  assert.equal(v.id, null);
  assert.equal(v.bet, null);
  assert.equal(v.target, null);
  assert.equal(v.roll, null);
  assert.equal(v.win, null);
  assert.equal(v.net, null);
  assert.equal(v.pays, di.PAYS);
  assert.equal(v.defaultTarget, di.DEFAULT_TARGET);
  assert.deepEqual(v.can, {});
  assert.deepEqual(di.view(null), v);
  // the two views agree on everything the dial is, and differ only in what one roll did
  const done = V(roll({}));
  for (const k of ['pays', 'faces', 'perPercent', 'house', 'minTarget', 'maxTarget', 'defaultTarget', 'minBet']) {
    assert.equal(done[k], v[k], k);
  }
});

test('the engine knows nothing but cards.js', () => {
  // Pure: no vscode, no ledger. The one import is the shared seeded source, and what it uses from
  // it is the ROLL stream, not a shuffle: there are no cards here
  const src = fs.readFileSync(path.join(__dirname, '..', 'dice.js'), 'utf8');
  const requires = src.match(/require\(([^)]*)\)/g) || [];
  assert.deepEqual(requires, ["require('./cards')"]);
  assert.ok(src.indexOf('rollsFrom') > 0, 'the roll should roll, not shuffle');
  assert.equal(src.indexOf('Math.random'), -1, 'the seed comes from the host');
  assert.equal(di.MIN_BET, 100);
  assert.deepEqual(di.OPS, []);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
