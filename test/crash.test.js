// Crash: the dial, the burst distribution, the one move that settles a round, what the view keeps
// back, and the house's cut.
// No dependencies: node's assert only. Run: node test/crash.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const cr = require(path.join(__dirname, '..', 'crash.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const DRAWS = cr.DRAWS;
const HOUSE = cr.HOUSE;
const LO = cr.MIN_TICKS;
const HI = cr.MAX_TICKS;
const BET = cr.MIN_BET;

const snapshot = (st) => JSON.stringify(st);
const aim = (st, ticks) => cr.act(st, { op: 'aim', ticks: ticks });
const go = (st) => cr.act(st, 'launch');
const pct = (x) => (x * 100).toFixed(2) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');
const x = (h) => (h / 100).toFixed(2) + 'x';

function round(over) {
  return cr.newRound(Object.assign({ seed: 'seed-0', id: 'round-0', bet: BET, ticks: 200 }, over));
}

// Every tick on the dial
const TICKS = [];
for (let k = LO; k <= HI; k++) TICKS.push(k);

// Bets chosen to catch the flooring: the house minimum, numbers that do not divide the dial, and the
// far end where one credit is noise
const BETS = [BET, 11, 13, 17, 23, 99, 100, 137, 1000, 99999, cr.MAX_BET];

// The inverse transform, written again here so the engine is checked against arithmetic this file
// did itself. P(burst >= k) = P(r <= 97 * DRAWS / k), so inverting a whole draw r keeps the
// distribution countable
function burstFromDraw(r) {
  return Math.min(cr.MAX_AT, Math.floor(HOUSE * DRAWS / r));
}

// --- the dial ---------------------------------------------------------------------------

test('the dial is whole tenths, above 1.00x, and the cap sits above all of it', () => {
  assert.equal(cr.TICK_PER, 10);                     // one tick is 0.1x
  assert.ok(LO * cr.TICK_PER > 100, 'the smallest target does not pay above the bet');
  assert.equal(LO * cr.TICK_PER, 110);
  assert.equal(HI * cr.TICK_PER, 5000);
  // the cap only bounds what a replay has to draw. If it were inside the dial it would decide rounds
  assert.ok(HI * cr.TICK_PER < cr.MAX_AT, 'the cap is inside the dial');
  assert.ok(cr.MAX_AT >= 20 * HI * cr.TICK_PER, 'the cap is close enough to the dial to be felt');
  // a target is a whole number of tenths, because 1.1 cannot be written down in binary and a screen
  // and a host that each round their own copy of it disagree about who won
  for (const bad of [1.1, 2.5, '20', NaN, Infinity, LO - 1, HI + 1, 0, -20]) {
    assert.throws(() => round({ ticks: bad }), RangeError, 'ticks ' + bad + ' was taken');
  }
  // null and undefined mean "where the dial was last left", which the host hands back as the default
  assert.equal(round({ ticks: null }).ticks, cr.DEFAULT_TICKS);
  assert.equal(round({ ticks: undefined }).ticks, cr.DEFAULT_TICKS);
});

test('every target on the dial can come in, and none of them is certain', () => {
  for (const ticks of TICKS) {
    const w = cr.winsFor(ticks * cr.TICK_PER);
    assert.ok(w > 0, (ticks / 10) + 'x can never come in');
    assert.ok(w < DRAWS, (ticks / 10) + 'x always comes in');
  }
  // and the odds fall the whole way along the dial
  for (let i = 1; i < TICKS.length; i++) {
    const lo = cr.winsFor(TICKS[i - 1] * cr.TICK_PER), hi = cr.winsFor(TICKS[i] * cr.TICK_PER);
    assert.ok(hi <= lo, 'the odds rise from ' + TICKS[i - 1] + ' to ' + TICKS[i] + ' tenths');
  }
});

test('the bet is a whole number inside the house limits', () => {
  for (const bad of [0, -1, BET - 1, 10.5, NaN, Infinity, '100', null, cr.MAX_BET + 1]) {
    assert.throws(() => round({ bet: bad }), RangeError, 'bet ' + bad + ' was taken');
  }
});

// --- the burst point ----------------------------------------------------------------------

test('the burst point is the inverse of 0.97 / x, counted over every draw there is', () => {
  // Not sampled: every one of the DRAWS is walked, so the distribution below is the distribution and
  // not an estimate of it. P(burst >= k) must be floor(97 * DRAWS / k) / DRAWS, which is 0.97 / x
  // to the resolution of one draw
  const bars = [100, 110, 150, 200, 500, 1000, 2000, 5000, 20000, cr.MAX_AT];
  const seen = new Array(bars.length).fill(0);
  let min = Infinity, max = 0, capped = 0;
  for (let r = 1; r <= DRAWS; r++) {
    const at = burstFromDraw(r);
    if (at < min) min = at;
    if (at > max) max = at;
    if (at === cr.MAX_AT) capped += 1;
    for (let i = 0; i < bars.length; i++) if (at >= bars[i]) seen[i] += 1;
  }
  console.log('        bar      reach      0.97 / x        off');
  for (let i = 0; i < bars.length; i++) {
    const want = cr.winsFor(bars[i]);
    const fair = (HOUSE / 100) / (bars[i] / 100);
    console.log('  ' + x(bars[i]).padStart(11) + pct(seen[i] / DRAWS).padStart(11)
      + pct(fair).padStart(14) + (seen[i] / DRAWS - fair >= 0 ? '+' : '') + ((seen[i] / DRAWS - fair) * 100).toFixed(4) + '%');
    assert.equal(seen[i], want, 'bar ' + bars[i] + ': ' + seen[i] + ' draws reach it, priced off ' + want);
    // and the count is the fair one to within the single draw the flooring can cost
    assert.ok(Math.abs(seen[i] / DRAWS - fair) <= 1 / DRAWS, 'bar ' + bars[i] + ' is off the curve');
  }
  // 3 in 100 rounds burst before 1.00x. That IS the house's cut, shown rather than skimmed
  assert.equal(seen[0], DRAWS * HOUSE / 100);
  console.log('  bursts below 1.00x: ' + pct(1 - seen[0] / DRAWS) + ' (the house cut, made visible)');
  assert.ok(min >= HOUSE, 'a burst came in under ' + HOUSE + ' hundredths');
  assert.equal(max, cr.MAX_AT);
  console.log('  the cap is hit by ' + pct(capped / DRAWS) + ' of draws, all of them far above the dial');
});

test('the engine draws from that transform, off the shared stream', () => {
  // one PRNG in the repo, not a second copy, and the draw it becomes is never 0: no division by
  // zero and no Infinity to clean up afterwards
  for (let i = 0; i < 5000; i++) {
    const seed = 'burst-' + i;
    const u = C.rollsFrom(seed)();
    const r = Math.floor(u * DRAWS) + 1;
    assert.ok(r >= 1 && r <= DRAWS, 'draw ' + r);
    const at = cr.burstOf(seed);
    assert.equal(at, burstFromDraw(r), 'seed ' + seed);
    assert.ok(Number.isSafeInteger(at) && at >= HOUSE && at <= cr.MAX_AT, 'burst ' + at);
    assert.equal(cr.burstOf(seed), at, 'the same seed burst twice in two places');
  }
});

// --- the money ----------------------------------------------------------------------------

test('a payout is one floor of the dial, and the bar is read back out of that payout', () => {
  for (const bet of BETS) {
    for (const ticks of TICKS) {
      const payout = cr.payoutFor(bet, ticks);
      const bar = cr.barFor(bet, ticks);
      const target = ticks * cr.TICK_PER;
      assert.ok(Number.isSafeInteger(payout) && Number.isSafeInteger(100 * payout), 'bet ' + bet + ' pays ' + payout);
      // the floor: payout <= bet * ticks / 10 < payout + 1
      assert.ok(payout * cr.TICK_PER <= bet * ticks, 'bet ' + bet + ', ' + ticks + ' tenths pays above the dial');
      assert.ok((payout + 1) * cr.TICK_PER > bet * ticks, 'bet ' + bet + ', ' + ticks + ' tenths pays below the floor');
      // the bar is the ceiling of what that payout really multiplies the bet by, so it is never
      // easier than the money
      assert.ok(bar * bet >= 100 * payout, 'bet ' + bet + ', ' + ticks + ' tenths: bar ' + bar + ' is under the payout');
      assert.ok((bar - 1) * bet < 100 * payout, 'bet ' + bet + ', ' + ticks + ' tenths: bar ' + bar + ' is above the ceiling');
      // and never harder than the target the player dialled in. THIS is the one that matters: the
      // flooring can only ever move the bar in the player's favour
      assert.ok(bar <= target, 'bet ' + bet + ' was judged at ' + bar + ' against a ' + target + ' order');
      assert.ok(bar > 100, 'bet ' + bet + ', ' + ticks + ' tenths is judged at or below 1.00x');
      // a bet in whole tens is the common case and comes out exactly on the dial
      if (bet % 10 === 0) assert.equal(bar, target, 'bet ' + bet + ' trimmed a whole-ten dial');
    }
  }
});

test('the figure the screen prints is the bar, and `exact` says when the dial was trimmed', () => {
  // the view must never hand over a multiplier the payout does not carry. bet 11 at 1.9x pays 20,
  // which is 1.81x and change, so the screen is told 1.82x (the bar it is judged against) and the
  // payout in credits beside it. Showing 1.90x there is the bug this engine is written against
  const odd = cr.view(round({ bet: 11, ticks: 19 }), 0);
  assert.equal(odd.payout, 20);
  assert.equal(odd.target100, 190);
  assert.equal(odd.bar100, 182);
  assert.equal(odd.exact, false);
  assert.ok(odd.bar100 * odd.bet >= 100 * odd.payout);
  const even = cr.view(round({ bet: 100, ticks: 19 }), 0);
  assert.equal(even.payout, 190);
  assert.equal(even.bar100, 190);
  assert.equal(even.exact, true);
});

// --- the moves ----------------------------------------------------------------------------

test('aiming moves the dial, settles nothing, and act never mutates its input', () => {
  const st = round({ ticks: 200 });
  const was = snapshot(st);
  const next = aim(st, 350);
  assert.equal(snapshot(st), was, 'the aim moved the round it was given');
  assert.notEqual(next, st);
  assert.equal(next.ticks, 350);
  assert.equal(next.phase, 'arm');
  assert.equal(next.net, null);
  assert.equal(next.at, null, 'aiming showed where it would burst');
  // re-aiming is free precisely because it changes nothing already decided: the burst point is a
  // function of the seed, not of the dial
  const a = go(aim(st, 350)), b = go(aim(aim(st, 110), 350));
  assert.equal(a.at, b.at);
  assert.equal(a.won, b.won);
  assert.equal(a.payout, b.payout);
});

test('a launch settles the round once, and pays off the bar it was judged against', () => {
  // a seed whose burst is high enough to pay a 1.5x order and not a 5.0x one
  let seed = null;
  for (let i = 0; i < 20000 && !seed; i++) {
    const at = cr.burstOf('split-' + i);
    if (at >= 150 && at < 500) seed = 'split-' + i;
  }
  assert.ok(seed, 'no seed bursts between 1.50x and 5.00x');
  const at = cr.burstOf(seed);
  const win = go(round({ seed, bet: 1000, ticks: 15 }));
  assert.equal(win.phase, 'done');
  assert.equal(win.ended, 'cashed');
  assert.equal(win.won, true);
  assert.equal(win.at, at);
  assert.equal(win.payout, 1500);
  assert.equal(win.net, 500);
  const lose = go(round({ seed, bet: 1000, ticks: 50 }));
  assert.equal(lose.ended, 'busted');
  assert.equal(lose.won, false);
  assert.equal(lose.payout, 0);
  assert.equal(lose.net, -1000);
  assert.equal(lose.at, at, 'the burst point moved with the dial');
});

test('a burst below 1.00x is an instant bust, and the view says so', () => {
  let seed = null;
  for (let i = 0; i < 20000 && !seed; i++) if (cr.burstOf('inst-' + i) < 100) seed = 'inst-' + i;
  assert.ok(seed, 'no seed bursts before 1.00x');
  const v = cr.view(go(round({ seed, ticks: LO })), 0);
  assert.equal(v.instant, true);
  assert.equal(v.won, false);
  assert.ok(v.at >= HOUSE && v.at < 100, 'the burst was ' + v.at);
  assert.equal(cr.view(round({ seed }), 0).instant, false, 'an armed round claimed an instant bust');
});

test('every refused move hands back the very same object, with a reason', () => {
  const st = round({});
  const bad = [
    [{ op: 'aim', ticks: LO - 1 }, 'the target must be between ' + LO + ' and ' + HI + ' tenths'],
    [{ op: 'aim', ticks: HI + 1 }, 'the target must be between ' + LO + ' and ' + HI + ' tenths'],
    [{ op: 'aim', ticks: 20.5 }, 'the target is a whole number of tenths'],
    [{ op: 'aim', ticks: '20' }, 'the target is a whole number of tenths'],
    [{ op: 'aim' }, 'the target is a whole number of tenths'],
    ['aim', 'the target is a whole number of tenths'],
    ['go', 'unknown action'],
    [null, 'unknown action'],
    [{ op: 'cashout' }, 'unknown action']
  ];
  for (const [op, why] of bad) {
    assert.equal(cr.whyNot(st, op, 0), why, JSON.stringify(op));
    assert.equal(cr.act(st, op), st, JSON.stringify(op) + ' changed the round');
  }
  // and nothing at all is allowed once the round is over: a settled round cannot be re-launched,
  // which is the whole of "a round settles exactly once"
  const done = go(st);
  for (const op of ['launch', { op: 'aim', ticks: 200 }]) {
    assert.equal(cr.whyNot(done, op, 0), 'the round is over');
    assert.equal(cr.act(done, op), done);
  }
  assert.equal(cr.whyNot(null, 'launch', 0), 'the round is over');
});

test('the same seed and the same dial give the same round', () => {
  const run = () => {
    const out = [];
    for (let i = 0; i < 200; i++) out.push(snapshot(go(round({ seed: 'replay-' + i, ticks: 110 + i }))));
    return out.join('|');
  };
  assert.equal(run(), run());
});

// --- what the view keeps back ---------------------------------------------------------------

// The strongest form of "the burst is not in there": two armed rounds that burst in different places
// hand the webview the same bytes. There is nothing to read, which is also what makes an abandoned
// armed round worth exactly nothing, which is what makes a reload harmless. A clock would take all
// three of those away at once
test('an armed view cannot tell two different bursts apart', () => {
  let a = null, b = null;
  for (let i = 0; i < 20000 && !(a && b); i++) {
    const seed = 'arm-' + i;
    const at = cr.burstOf(seed);
    if (!a && at < 150) a = seed;
    if (!b && at > 1000) b = seed;
  }
  assert.ok(a && b, 'no pair of seeds bursts far enough apart');
  assert.notEqual(cr.burstOf(a), cr.burstOf(b));
  const va = JSON.stringify(cr.view(round({ seed: a, bet: 137, ticks: 250 }), 5000));
  const vb = JSON.stringify(cr.view(round({ seed: b, bet: 137, ticks: 250 }), 5000));
  assert.equal(va, vb, 'the armed view told the two bursts apart');
  // and the settled views differ, because the replay has to climb to the burst point to draw it
  assert.notEqual(JSON.stringify(cr.view(go(round({ seed: a })), 0)), JSON.stringify(cr.view(go(round({ seed: b })), 0)));
});

test('the seed and the burst point appear only once the round is settled', () => {
  const st = round({ seed: 'secret' });
  const live = cr.view(st, 0);
  assert.equal('seed' in live, false);
  assert.equal(live.at, null);
  assert.equal(live.won, null);
  const out = cr.view(go(st), 0);
  assert.equal(out.seed, 'secret');
  assert.ok(out.at > 0, 'the replay has nothing to climb to');
  // the seed and the round id are different values: the id travels in every message, the seed is
  // the burst point itself
  assert.notEqual(st.id, st.seed);
});

test('the view hands the screen every figure it needs, and the idle one is the same shape', () => {
  const v = cr.view(round({ bet: 137, ticks: 250 }), 9999);
  const idle = cr.idleView();
  assert.deepEqual(Object.keys(v).sort(), Object.keys(idle).sort());
  assert.deepEqual(cr.view(null, 0), idle);
  // the odds are two whole numbers, so the screen prints a percentage without holding the curve
  assert.deepEqual(v.chance, { num: cr.winsFor(v.bar100), den: DRAWS });
  assert.deepEqual(v.range, { minTicks: LO, maxTicks: HI, step: 1, per: cr.TICK_PER, cap100: cr.MAX_AT });
  assert.equal(v.payout, cr.payoutFor(137, 250));
  assert.deepEqual(v.can, { aim: true, launch: true });
  assert.deepEqual(idle.can, { aim: false, launch: false });
});

test('an armed round stakes its bet and a settled one stakes nothing', () => {
  const st = round({ bet: 500 });
  assert.equal(cr.stake(st), 500);
  assert.equal(cr.stake(aim(st, 480)), 500);
  assert.equal(cr.stake(go(st)), 0);
  assert.equal(cr.stake(null), 0);
});

// --- the house's cut, enumerated ------------------------------------------------------------
// A strategy here is one number, the target, so the whole game is 490 strategies and nothing is
// sampled. The return of one of them is
//    P(reaching the bar) * payout / bet = (0.97 / bar) * bar = 0.97
// with the flooring of the payout and of the win count as the only gap, and that is the point of
// shaping the curve as 0.97 / x: no target is a better bet than another.

function rtpOf(bet, ticks) {
  const payout = cr.payoutFor(bet, ticks);
  const bar = cr.barFor(bet, ticks);
  return (cr.winsFor(bar) * payout) / (DRAWS * bet);
}

test('the table: every target returns the same 97%, whichever one is dialled', () => {
  console.log('      target        odds      bet 10      bet 137     bet 1,000   bet 10,000');
  for (const ticks of [LO, 15, 20, 30, 50, 100, 200, 300, HI]) {
    const bar = cr.barFor(1000, ticks);
    console.log('  ' + x(ticks * cr.TICK_PER).padStart(10) + pct(cr.winsFor(bar) / DRAWS).padStart(12)
      + [10, 137, 1000, 10000].map((bet) => pct(rtpOf(bet, ticks)).padStart(13)).join(''));
  }
  // the whole dial, at the bet where one floored credit is noise: this is the curve itself
  let lo = null, hi = null;
  for (const ticks of TICKS) {
    const rtp = rtpOf(1000000, ticks);
    if (!lo || rtp < lo.rtp) lo = { rtp, ticks };
    if (!hi || rtp > hi.rtp) hi = { rtp, ticks };
  }
  console.log('  the whole dial at a 1,000,000 bet: ' + pct(lo.rtp) + ' (' + (lo.ticks / 10) + 'x) to '
    + pct(hi.rtp) + ' (' + (hi.ticks / 10) + 'x)');
  assert.ok(hi.rtp - lo.rtp < 0.0005, 'the dial is not flat: ' + pct(lo.rtp) + ' to ' + pct(hi.rtp));
  assert.ok(hi.rtp <= HOUSE / 100);
});

test('and no bet on the dial falls out of the band', () => {
  // every bet from the house minimum up to 2,000, against every tick: 980,000 strategies, counted
  let worst = null, best = null, n = 0;
  for (let bet = BET; bet <= 2000; bet++) {
    for (const ticks of TICKS) {
      const payout = cr.payoutFor(bet, ticks);
      const bar = cr.barFor(bet, ticks);
      const rtp = (cr.winsFor(bar) * payout) / (DRAWS * bet);
      n += 1;
      // never above the cut, as two integer identities: the win count is floored and so is the payout
      assert.ok(cr.winsFor(bar) * bar <= HOUSE * DRAWS, 'bet ' + bet + ', ' + ticks + ' tenths over-counts its wins');
      assert.ok(100 * payout <= bet * bar, 'bet ' + bet + ', ' + ticks + ' tenths pays above its bar');
      if (!worst || rtp < worst.rtp) worst = { rtp, bet, ticks };
      if (!best || rtp > best.rtp) best = { rtp, bet, ticks };
    }
  }
  console.log('  ' + num(n) + ' bet-and-target pairs counted');
  console.log('  worst  bet ' + num(worst.bet) + ' at ' + (worst.ticks / 10) + 'x: ' + pct(worst.rtp));
  console.log('  best   bet ' + num(best.bet) + ' at ' + (best.ticks / 10) + 'x: ' + pct(best.rtp));
  assert.ok(best.rtp <= HOUSE / 100, 'the best pair returns ' + pct(best.rtp));
  assert.ok(worst.rtp > 0.96, 'the worst pair returns ' + pct(worst.rtp));
  // and at the house limit, where the flooring is noise, it is the flat 97%
  for (const ticks of TICKS) {
    const far = rtpOf(cr.MAX_BET, ticks);
    assert.ok(far > 0.9699 && far <= 0.97, 'at the house limit ' + (ticks / 10) + 'x returns ' + pct(far));
  }
});

test('the cap can never decide a round, at any bet on the dial', () => {
  // the burst point is capped so a replay has something finite to draw. If a bar could reach the cap
  // the capping would be taking wins away, so this is the check that it never can
  for (const bet of BETS) {
    for (const ticks of TICKS) assert.ok(cr.barFor(bet, ticks) < cr.MAX_AT, 'bet ' + bet + ', ' + ticks + ' tenths');
  }
});

// --- Monte Carlo ----------------------------------------------------------------------------
// The enumeration above believes one thing it cannot check: that the engine's own rounds really
// burst in those proportions, which is a claim about the shared PRNG rather than about the curve.
// That is what this measures, through act().
//
// The sample size is read off the precision wanted rather than picked. The payout is not random
// (only whether it lands is), so one round is a Bernoulli draw and the error bar on the measured
// RETURN is the target multiplier times the error bar on the frequency:
//    SE(return) = m * sqrt(p (1 - p) / N)   ->   N = p (1 - p) m^2 / SE^2
// At SE 0.4% of the return, a sixth of the house's cut, the widest target here needs about a quarter
// of a million rounds.
test('Monte Carlo: real rounds come in at the rate the dial is priced off', () => {
  const SE = 0.004;
  const t0 = Date.now();
  console.log('      target     priced       came in     off          return         rounds');
  let total = 0;
  for (const ticks of [LO, 20, 50]) {
    const bet = 1000;
    const bar = cr.barFor(bet, ticks);
    const payout = cr.payoutFor(bet, ticks);
    const p = cr.winsFor(bar) / DRAWS;
    const mult = payout / bet;
    const N = Math.ceil(p * (1 - p) * mult * mult / (SE * SE));
    let won = 0, paid = 0;
    for (let i = 0; i < N; i++) {
      const st = cr.act(cr.newRound({ seed: 'mc-' + ticks + '-' + i, id: 'mc', bet, ticks }), 'launch');
      if (st.won) { won += 1; paid += st.payout; }
      total += 1;
    }
    const got = won / N;
    const se = Math.sqrt(p * (1 - p) / N);
    const off = Math.abs(got - p) / se;
    const rtp = paid / (N * bet);
    console.log('  ' + x(ticks * cr.TICK_PER).padStart(10) + pct(p).padStart(11) + pct(got).padStart(14)
      + (off.toFixed(1) + ' SE').padStart(8) + (pct(rtp) + ' +-' + pct(mult * se)).padStart(17) + num(N).padStart(15));
    assert.ok(off < 4, (ticks / 10) + 'x came in ' + pct(got) + ' of the time against ' + pct(p));
    // the measured return is the band, at the precision the sample size was chosen for
    assert.ok(Math.abs(rtp - rtpOf(bet, ticks)) < 4 * mult * se, (ticks / 10) + 'x returned ' + pct(rtp));
  }
  console.log('  ' + num(total) + ' rounds in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
