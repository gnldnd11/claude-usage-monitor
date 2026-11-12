// The coin market: the price function, the band, the sale's arithmetic, what it saves, how two
// windows settle, and the one thing this game has to prove about itself, which is that no way of
// trading it returns more than the fee leaves (99.5%, the fee being 0.5% on the round trip). Nothing
// in the proof depends on what the fee IS, which is why lowering it from 3% changed no assertion.
//
// The proof comes in two pieces, and the order matters.
//  - the EXACT piece ('the price is a supermartingale'): the price is a function of one random walk,
//    so one step's expected ratio can be integrated rather than sampled. If that is at most 1 at
//    every level of every coin, then by optional stopping EVERY rule for choosing when to sell,
//    including rules nobody has written down, has an expected sale price at most the purchase price,
//    and the return is at most the fee. That is a statement about all strategies, not about four of
//    them, and it is where the invariant actually comes from
//  - the SAMPLED piece (the Monte Carlo table): what the exact piece cannot see is whether the code
//    that trades is the code that was integrated. So the strategies are played, through the same
//    payout function the engine sells with, and their returns have to agree with the fee
//
// Sample sizes are solved from the error bar wanted, not picked: a strategy's return is a mean of
// ratios whose spread is about sigma * sqrt(days held), so the count needed for a given standard
// error falls out of the coin and the horizon. test/poker.test.js is where that habit comes from.
//
// Strategies are measured over many markets rather than one long history (market.js's _test.lane
// makes a coin's parameters into a fresh path). What a mean's error bar needs is not independence
// but zero covariance, and a fair price gives exactly that: the expected ratio over any later
// stretch is 1 whatever the price did before it, so two returns from one path have no covariance
// even though they are not independent (the band is a function of the level, so an earlier stretch
// does change how big a later one tends to be). Separate markets are used anyway, because a rule
// that watches the price has to be given the same chance to find a pattern many times over.
//
// No dependencies: node's assert only. Run: node test/market.test.js
// Heavier readings:  MK_MC=4 node test/market.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const M = require(path.join(__dirname, '..', 'market.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const MC = Number(process.env.MK_MC || 1);
const CODES = M.CODES;
const EP = M.EPOCH_MS;
const MIN = M.MS_PER_MIN;
const DAY = M.MIN_PER_DAY;
const FEE = M.FEE_NUM / M.FEE_DEN;

const pct = (x) => (x * 100).toFixed(2) + '%';
const pct4 = (x) => (x * 100).toFixed(4) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');
const snapshot = (st) => JSON.stringify(st);
const at = (min) => EP + min * MIN;

// A wallet with a writer id of the shape credits.js accepts
const wallet = (over) => Object.assign(M.newWallet({ by: 'aaaaaaaaaaaaaaaa' }), over || {});

// The clock is the one thing market.js reads from outside its own state, so every test that trades
// pins it. Left pinned at the end of a test it would leak into the next one, so `atClock` puts it back
function atClock(nowMs, fn) {
  M._test.setClock(() => nowMs);
  try { return fn(); } finally { M._test.setClock(null); }
}

const buyOp = (ticker, amount, nowMs) => ({ op: 'buy', ticker, amount, nowMs });
const sellOp = (ticker, nowMs) => ({ op: 'sell', ticker, nowMs });

// --- the coins ----------------------------------------------------------------------------------

test('four coins, each its own volatility, and nothing else between them', () => {
  assert.equal(M.TICKERS.length, 4);
  assert.deepEqual(CODES, M.TICKERS.map((t) => t.code));
  const vols = M.TICKERS.map((t) => t.volBp);
  assert.equal(new Set(CODES).size, 4);
  assert.equal(new Set(vols).size, 4, 'two coins with the same volatility are one coin twice');
  assert.ok(Math.min(...vols) <= 200, 'no coin is calm: ' + vols.join(', '));
  assert.ok(Math.max(...vols) >= 350, 'no coin is rough: ' + vols.join(', '));
  for (const t of M.TICKERS) {
    assert.ok(Number.isSafeInteger(t.baseTicks) && t.baseTicks === t.base * M.TICKS_PER_CREDIT);
    // the price is rounded to a whole tick, so the floor of the band is where rounding is coarsest
    assert.ok(t.floorTicks >= 1000, t.code + ' rounds to ' + pct4(0.5 / t.floorTicks) + ' at its floor');
    assert.equal(t.capTicks, t.baseTicks * M.BAND_X * M.BAND_X);
    // nothing a coin hands over says anything about its path
    assert.equal('seed' in t, false);
    assert.equal('path' in t, false);
    assert.equal('v' in t, false);
  }
  // and the list cannot be retuned by whatever is handed it
  const was = JSON.stringify(M.TICKERS);
  try { M.TICKERS[0].volBp = 9999; } catch (e) { /* frozen */ }
  try { M.TICKERS.push({ code: 'XXXX' }); } catch (e) { /* frozen */ }
  assert.equal(JSON.stringify(M.TICKERS), was);
});

test('the fee is a 0.5% round trip, which is the one figure this game does not share', () => {
  assert.equal(M.FEE_NUM, 199);
  assert.equal(M.FEE_DEN, 200);
  // The card games take 3%. This one cannot: a position is held for minutes or days rather than for
  // a round, so the fee has to be smaller than the move it is charged against, and the measured
  // median move over a day is 0.99% on the calmest coin (market.js, at FEE_NUM). The two figures the
  // fee is solved between are checked here rather than in a comment
  assert.ok(1 - FEE < 0.015, 'the fee is not under the calmest coin\'s own daily move: ' + pct(1 - FEE));
  assert.ok(1 - FEE > 0.003, 'a fee this small does not pay for the tick rounding at the band floor');
  // 199/200 is 995/1000: the same rational, the same floor, a product five times smaller. The
  // grouping is not cosmetic, MAX_BUY being solved from the numerator (market.js, section 6)
  for (const [a, e, x] of [[1000, 500, 500], [10, 12345, 9999], [3333, 777, 919], [M.MAX_BUY, 1093, 999999]]) {
    assert.equal(M.payoutOf(a, e, x), Math.floor((a * x * 995) / (e * 1000)), a + ' ' + e + ' ' + x);
  }
  // a sale at the price it was bought at gives back the fee and nothing else
  assert.equal(M.payoutOf(1000, 12345, 12345), 995);
  assert.equal(M.MIN_BUY, 10, 'the other games open at 10 credits');
  // and the cap is still a number a refusal sentence can carry, which is the whole of its first
  // argument's job: min() with BUY_LIMIT is what makes it safe, the round number is what makes it
  // readable, and the round number has to be the smaller of the two
  assert.ok(M.MAX_BUY % 100000 === 0, 'the cap a player is shown is ' + M.MAX_BUY);
});

// --- the price function -------------------------------------------------------------------------

test('a price is the same every time it is asked for, in any order', () => {
  const times = [];
  for (let i = 0; i < 1500; i++) times.push(at(Math.floor(i * 7919) % (DAY * 4000)));
  const first = new Map();
  for (const code of CODES) for (const t of times) first.set(code + '@' + t, M.priceAt(code, t));
  // backwards, which makes the descent cache miss in a different pattern
  for (let i = times.length - 1; i >= 0; i--) {
    for (const code of CODES) assert.equal(M.priceAt(code, times[i]), first.get(code + '@' + times[i]), code + ' at ' + times[i]);
  }
  // shuffled, and interleaved across coins, which is what the panel really does
  for (let i = 0; i < times.length; i++) {
    const t = times[(i * 613) % times.length];
    for (const code of CODES) assert.equal(M.priceAt(code, t), first.get(code + '@' + t));
  }
});

test('a cached descent gives the very bits a cold one gives, not merely the same price', () => {
  // The strong form, and the one that matters: a price is a rounded exponential, so two sums that
  // differ by an ulp agree on the tick almost always and disagree the day one lands on a half. So
  // the sums are compared and not the prices, and the cold side is made genuinely cold.
  // This is also what pins the strict containment in sumAt's cache lookup (market.js): with the
  // boundary included instead, a frame whose right edge is exactly the minute asked for gets reused,
  // and it answers (acc + left) + (total - left) where a cold descent answers acc + total
  let checked = 0;
  for (const code of CODES) {
    const row = M._test.rowOf(code);
    // a sequential sweep, which is the access pattern the cache was put there for and where nearly
    // every call is answered from a kept frame, against a cold descent for the same minute
    const swept = [];
    for (let n = 1; n <= 2500; n++) swept[n] = M._test.sumAt(row, n);
    for (let n = 1; n <= 2500; n++) {
      M._test.chill(row);
      assert.equal(swept[n], M._test.sumAt(row, n), code + ' at minute ' + n);
      checked += 1;
    }
    // and the minutes that sit ON a lattice boundary, which is where the two descents part company
    // if the cache is allowed to reuse a block the cold side answers from the level above
    for (let L = 1; L <= 22; L++) {
      for (const n of [1 << L, (1 << L) + 1, (1 << L) - 1, 3 << L, (3 << L) + 1]) {
        M._test.chill(row);
        const cold = M._test.sumAt(row, n);
        for (let m = n - 3; m < n; m++) M._test.sumAt(row, m);
        assert.equal(M._test.sumAt(row, n), cold, code + ' at minute ' + n + ' (a level-' + L + ' edge)');
        checked += 1;
      }
    }
  }
  console.log('  ' + num(checked) + ' minutes compared warm against cold, to the bit');
});

test('a price is whole ticks, inside the band, and still moving ten years out', () => {
  console.log('  coin   vol/day        base       lowest      highest      10y median    half-life     10y size');
  for (const t of M.TICKERS) {
    let lo = Infinity, hi = 0;
    // every two hours for ten years: 43,800 samples a coin
    for (let m = 0; m <= DAY * 3650; m += 120) {
      const p = M.priceAt(t.code, at(m));
      assert.ok(Number.isSafeInteger(p) && p > 0, t.code + ' priced ' + p + ' at minute ' + m);
      assert.ok(p >= t.floorTicks && p <= t.capTicks, t.code + ' left the band: ' + p + ' at minute ' + m);
      if (p < lo) lo = p;
      if (p > hi) hi = p;
    }
    // what being fair costs: a geometric price with a flat MEAN has a median that falls by
    // DRIFT * sigma^2 a day (market.js, section 2). Printed so a retune of the table shows up here
    const vol = t.volBp / 10000;
    const perDay = M.DRIFT * vol * vol;
    const half = Math.log(2) / perDay;
    const live = M.liveliness(vol, M.ALIVE_DAYS);
    console.log('  ' + t.code.padEnd(7) + ((t.volBp / 100).toFixed(2) + '%').padStart(7)
      + num(t.baseTicks).padStart(12) + num(lo).padStart(13) + num(hi).padStart(13)
      + ((Math.exp(-perDay * 3650) * 100).toFixed(1) + '% of base').padStart(16)
      + (num(half) + ' days').padStart(13)
      + (live * 100).toFixed(0).padStart(11) + '%');
    // What the vol ceiling is really protecting: a coin that has slid past the band gets damped by
    // the bend, and a damped coin does not merely get cheap, it stops moving. The slide itself is
    // the price of being fair (market.js, section 2) and is invisible on the panel's own horizon
    assert.ok(live >= M.ALIVE_FRACTION, t.code + ' is damped to ' + live.toFixed(2) + 'x of its own size by year ten');
    // the band is a net, not a cage: a coin that never moves out of a tenth of it is not a market
    assert.ok(hi / lo > 2, t.code + ' only moved ' + (hi / lo).toFixed(2) + 'x in ten years');
  }
});

test('before the epoch every coin sits at its base, and past the lattice it stops', () => {
  for (const t of M.TICKERS) {
    assert.equal(M.priceAt(t.code, EP), t.baseTicks);
    assert.equal(M.priceAt(t.code, EP - 1), t.baseTicks);
    assert.equal(M.priceAt(t.code, EP - 1e12), t.baseTicks, 'a time before the epoch has no history');
    // the lattice runs out in 2153; past it the price freezes rather than coming out wrong
    const end = EP + M.MAX_MINUTE * MIN;
    assert.equal(M.priceAt(t.code, end + 1e9), M.priceAt(t.code, end));
  }
  assert.throws(() => M.priceAt('NOPE', EP), RangeError);
});

test('a price costs the same whether the minute is tomorrow or a century out', () => {
  // The descent is LEVELS nodes deep whatever the minute, which is a stronger claim than O(log t):
  // the cost does not grow with the minute at all. What DOES move the measurement is the descent
  // cache: times drawn from one day share all but the last few frames, so the near eras come out
  // faster than the far ones. That is the cache working, not the lattice being shallower there, so
  // the figure held to is the far pair, where the cache has nothing to give either of them
  const eras = [['a day', DAY], ['a year', DAY * 365], ['ten years', DAY * 3650], ['a century', DAY * 36500]];
  const N = 40000;
  const times = [];
  for (const [, span] of eras) {
    const list = [];
    for (let i = 0; i < N; i++) list.push(at(Math.floor(((i * 2654435761) % 1000003) / 1000003 * span)));
    times.push(list);
  }
  const costs = [];
  for (let pass = 0; pass < 2; pass++) {       // the first pass warms the code, the second is read
    costs.length = 0;
    for (let e = 0; e < eras.length; e++) {
      const list = times[e];
      const t0 = Date.now();
      let sink = 0;
      for (let i = 0; i < N; i++) sink += M.priceAt('CRAB', list[i]);
      costs.push({ era: eras[e][0], ms: Date.now() - t0, sink });
    }
  }
  console.log('  ' + costs.map((c) => c.era + ' ' + (c.ms * 1000 / N).toFixed(2) + 'us').join(',  '));
  const by = {};
  for (const c of costs) by[c.era] = c.ms;
  // a thousand times further out, for the same money. An O(t) walk from the epoch would be about
  // 36,500 times slower over the same span, which is the whole reason the lattice exists
  assert.ok(by['a century'] <= by['a year'] * 2 + 5,
    'a century out costs ' + (by['a century'] / Math.max(1, by['a year'])).toFixed(1) + 'x a year out');
  assert.ok(by['a century'] <= by['ten years'] * 1.6 + 5);
  for (const c of costs) assert.ok(c.ms * 1000 / N < 12, c.era + ' costs ' + (c.ms * 1000 / N).toFixed(1) + 'us a price');
});

test('a chart of a day is quick enough to redraw on every push', () => {
  const now = at(DAY * 500);
  const t0 = Date.now();
  const R = 20;
  for (let i = 0; i < R; i++) for (const code of CODES) M.candles(code, { toMs: now + i * MIN, stepMs: 5 * MIN, count: 36 });
  const per = (Date.now() - t0) / R;
  console.log('  four coins, 36 candles each: ' + per.toFixed(1) + 'ms a redraw');
  assert.ok(per < 20, 'a redraw costs ' + per.toFixed(1) + 'ms');
});

test('candles touch end to end and their wicks hold their bodies', () => {
  const now = at(DAY * 300 + 77);
  for (const code of CODES) {
    const rows = M.candles(code, { toMs: now, stepMs: 15 * MIN, count: 40 });
    assert.equal(rows.length, 40);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      for (const k of ['o', 'h', 'l', 'c']) assert.ok(Number.isSafeInteger(r[k]) && r[k] > 0, code + ' ' + k);
      assert.ok(r.h >= Math.max(r.o, r.c), code + ' candle ' + i + ' has a body outside its wick');
      assert.ok(r.l <= Math.min(r.o, r.c), code + ' candle ' + i + ' has a body outside its wick');
      if (i > 0) {
        assert.equal(r.o, rows[i - 1].c, code + ' candle ' + i + ' does not open where the last one closed');
        assert.equal(r.t, rows[i - 1].t + 15 * MIN);
      }
    }
    // the last candle closes at the price the game trades at
    assert.equal(rows[rows.length - 1].c, M.priceAt(code, now));
    assert.equal(rows[rows.length - 1].t, at(M._test.minuteOf(now)));
    // a one-minute step still makes a candle, and then the wick is the body
    const fine = M.candles(code, { toMs: now, stepMs: MIN, count: 3 });
    for (const r of fine) {
      assert.equal(r.h, Math.max(r.o, r.c));
      assert.equal(r.l, Math.min(r.o, r.c));
    }
  }
});

// --- what the lattice is made of ----------------------------------------------------------------

test('the walk is made of independent draws with the variance the table says', () => {
  // The lattice is only a random walk if the per-minute steps it implies really are independent and
  // the right size. That is a property of the node hash, which no comment can vouch for
  console.log('  coin     steps        mean/SE      var/expected      kurtosis      lag-1 r');
  const N = 120000;
  for (const t of M.TICKERS) {
    const row = M._test.rowOf(t.code);
    const v = (t.volBp / 10000) * (t.volBp / 10000) / DAY;
    let s1 = 0, s2 = 0, s4 = 0, cross = 0, prev = null;
    let last = M._test.sumAt(row, 0);
    const xs = [];
    for (let n = 1; n <= N; n++) {
      const cur = M._test.sumAt(row, n);
      const x = cur - last;
      last = cur;
      xs.push(x);
      s1 += x; s2 += x * x; s4 += x * x * x * x;
      if (prev !== null) cross += prev * x;
      prev = x;
    }
    const mean = s1 / N;
    const varr = s2 / N - mean * mean;
    const seMean = Math.sqrt(v / N);
    const seVar = v * Math.sqrt(2 / N);
    const kurt = (s4 / N) / (varr * varr);
    const r1 = (cross / (N - 1)) / varr;
    console.log('  ' + t.code.padEnd(8) + num(N).padStart(8)
      + (mean / seMean).toFixed(2).padStart(13) + ' SE'
      + (varr / v).toFixed(4).padStart(15)
      + kurt.toFixed(3).padStart(14)
      + r1.toFixed(4).padStart(13));
    assert.ok(Math.abs(mean / seMean) < 4, t.code + ': the steps have a drift of their own, ' + (mean / seMean).toFixed(1) + ' SE');
    assert.ok(Math.abs(varr - v) < 4 * seVar, t.code + ': the steps are the wrong size, ' + (varr / v).toFixed(3) + 'x');
    // normal, so the two halves of a split are independent and not merely uncorrelated
    assert.ok(Math.abs(kurt - 3) < 4 * Math.sqrt(24 / N), t.code + ': the steps are not normal, kurtosis ' + kurt.toFixed(2));
    assert.ok(Math.abs(r1) < 4 / Math.sqrt(N), t.code + ': consecutive steps are correlated, r = ' + r1.toFixed(4));
    assert.equal(xs.length, N);
  }
});

test('the band is the identity in the middle, so inside it the price does not know where it is', () => {
  // Being level-independent is the whole safety of the drift (market.js, section 3): a force that
  // depends on the level is a force that can be bought low
  for (let d = -M.BAND; d <= M.BAND; d += M.BAND / 500) assert.equal(M.squash(d), d);
  assert.equal(M.squash(0), 0);
  // and beyond, it bends and is bounded. Far enough out it saturates exactly at the bound, which is
  // what the band is for: a walk of 1e9 is a price of base*64 and not of base*e^1e9
  for (const d of [M.BAND * 1.0001, 3, 5, 12, 400, 1e9]) {
    assert.ok(M.squash(d) > M.BAND && M.squash(d) <= M.HARD, 'squash(' + d + ') = ' + M.squash(d));
    assert.equal(M.squash(-d), -M.squash(d), 'the two ends of the band have to behave the same');
  }
  for (const d of [M.BAND * 1.0001, 3, 5, 12]) {
    assert.ok(M.squash(d) < M.squash(d * 1.01), 'the band stopped climbing at ' + d);
  }
  assert.equal(M.squash(1e9), M.HARD, 'and it never goes past the bound');
  assert.ok(Math.abs(M.HARD - Math.log(64)) < 1e-12, 'the hard bound is base/64 .. base*64');
});

// --- the proof: no strategy beats the fee -------------------------------------------------------

test('every level of every coin is a step the player cannot win, which is the whole invariant', () => {
  // ONE step's expected price ratio, integrated rather than sampled. The price is
  // base * exp(squash(walk - DRIFT*v*n)), the walk's steps are independent normals, so
  //   E[ P(n+1) / P(n) | walk = d ] = E_z[ exp(squash(d + z*sqrt(v) - DRIFT*v) - squash(d)) ]
  // and if that is at most 1 for every d, the price is a supermartingale. Optional stopping then
  // says E[P(sell)] <= P(buy) for EVERY rule for choosing when to sell, so every strategy returns at
  // most the fee. The Monte Carlo below cannot say that; no amount of sampling can.
  //
  // The integral is a normalised Riemann sum of the normal density over +-9 sigma. Normalised, so a
  // constant integrand comes back as exactly 1 and the figure below is an excess and not a
  // quadrature artefact
  const zs = [], ws = [];
  let wsum = 0;
  for (let z = -9; z <= 9; z += 0.01) {
    const w = Math.exp(-0.5 * z * z);
    zs.push(z); ws.push(w); wsum += w;
  }
  console.log('  coin     worst step edge     worst over a day     at level      a day of the guard');
  for (const t of M.TICKERS) {
    const vol = t.volBp / 10000;
    const v = vol * vol / DAY;
    const sd = Math.sqrt(v);
    let worst = -Infinity, worstAt = 0;
    // d is the walk before the band, so it has to be swept well past the band's own edge
    for (let d = -14; d <= 14; d += 0.02) {
      const g0 = M.squash(d);
      let e = 0;
      for (let i = 0; i < zs.length; i++) e += ws[i] * Math.exp(M.squash(d + zs[i] * sd - M.DRIFT * v) - g0);
      e /= wsum;
      if (e - 1 > worst) { worst = e - 1; worstAt = d; }
    }
    console.log('  ' + t.code.padEnd(8) + worst.toExponential(2).padStart(14)
      + (worst * DAY * 100).toFixed(4).padStart(20) + '%'
      + ('d = ' + worstAt.toFixed(2)).padStart(14)
      + (M.BEND_GUARD * v * DAY * 100).toFixed(4).padStart(20) + '%');
    assert.ok(worst <= 1e-12, t.code + ': a step at d = ' + worstAt.toFixed(2) + ' pays ' + worst.toExponential(2) + ' over fair');
  }
});

test('and the inequality the guard was solved from holds in closed form too', () => {
  // The continuum form of the test above: with g the band, the price is a supermartingale when
  //   0.5 * (g'^2 - g' + g'') <= BEND_GUARD * g'
  // Inside the band that is -BEND_GUARD, which is the level-independent drag. Outside, the left side
  // peaks at 1/(2*SPAN^2); this walks it rather than trusting the algebra
  const gp = (d) => {
    const a = Math.abs(d);
    if (a <= M.BAND) return 1;
    const c = 1 / Math.cosh((a - M.BAND) / M.SPAN);
    return c * c;
  };
  const gpp = (d) => {
    const a = Math.abs(d);
    if (a <= M.BAND) return 0;
    const u = (a - M.BAND) / M.SPAN;
    const c = 1 / Math.cosh(u);
    const k = (2 / M.SPAN) * c * c * Math.tanh(u);
    return d < 0 ? k : -k;      // the lower end bends upward, which is the dangerous side
  };
  // Divided through by g', which is positive everywhere, so the inequality becomes
  //   0.5 * (g'^2 - g' + g'') / g' <= BEND_GUARD
  // and reads as "what the bend asks of the guard". Without the division the figure printed would be
  // the sweep's own edge, where g' has gone to zero and both sides vanish, which looks like a pass
  // by a hair and is nothing of the kind
  let worst = -Infinity, worstAt = 0;
  for (let d = -40; d <= 40; d += 0.001) {
    const p = gp(d), q = gpp(d);
    const need = 0.5 * (p * p - p + q) / p;
    if (need > worst) { worst = need; worstAt = d; }
  }
  const peak = 1 / (2 * M.SPAN * M.SPAN);
  console.log('  the bend asks for at most ' + worst.toFixed(5) + ' (at d = ' + worstAt.toFixed(3)
    + '), the algebra says ' + peak.toFixed(5) + ', the guard is ' + M.BEND_GUARD
    + ':  margin ' + (M.BEND_GUARD - worst).toFixed(5));
  assert.ok(worst < M.BEND_GUARD, 'the band asks for ' + worst.toFixed(5) + ' and the guard is only ' + M.BEND_GUARD);
  // and the measured peak is the one solved for, which is what makes the guard a derivation
  assert.ok(Math.abs(worst - peak) < 1e-4, 'the bend peaks at ' + worst.toFixed(6) + ', not at ' + peak.toFixed(6));
  assert.ok(M.BEND_GUARD > 1 / (2 * M.SPAN * M.SPAN));
  assert.equal(M.DRIFT, M.FAIR_DRIFT + M.BEND_GUARD);
  assert.equal(M.FAIR_DRIFT, 0.5, 'half the variance is what makes a geometric price fair at all');
});

// --- the sale's arithmetic ----------------------------------------------------------------------

test('a payout is always a whole number of credits, and a safe one at the top of the market', () => {
  const worst = Math.max(...M.TICKERS.map((t) => t.capTicks));
  const best = Math.min(...M.TICKERS.map((t) => t.floorTicks));
  // the worst case the game can build: the whole cap staked, bought at the floor of the band and
  // sold at the ceiling of the widest coin
  const top = M.MAX_BUY * M.FEE_NUM * worst;
  console.log('  cap ' + num(M.MAX_BUY) + ' credits;  worst product ' + top.toExponential(3)
    + ' against MAX_SAFE ' + Number.MAX_SAFE_INTEGER.toExponential(3));
  assert.ok(Number.isSafeInteger(top), 'the largest sale this market can build cannot be counted');
  const p = M.payoutOf(M.MAX_BUY, best, worst);
  assert.ok(Number.isSafeInteger(p) && p > 0);
  assert.equal(p, Math.floor((M.MAX_BUY * M.FEE_NUM * worst) / (best * M.FEE_DEN)));
  // and it is the ratio of prices that pays, so a 64x move pays 64x less the fee
  assert.ok(Math.abs(p / (M.MAX_BUY * (worst / best) * FEE) - 1) < 1e-9);
  for (let i = 0; i < 4000; i++) {
    const a = M.MIN_BUY + (i * 7919) % (M.MAX_BUY - M.MIN_BUY);
    const e = best + (i * 104729) % (worst - best);
    const x = best + (i * 15485863) % (worst - best);
    const out = M.payoutOf(a, e, x);
    assert.ok(Number.isSafeInteger(out) && out >= 0, a + ' ' + e + ' ' + x + ' -> ' + out);
    assert.ok(out <= a * (x / e) * FEE + 1);
  }
});

// --- a move -------------------------------------------------------------------------------------

test('a buy takes the stake, records the price it took it at, and act leaves its input alone', () => {
  const now = at(DAY * 100);
  atClock(now, () => {
    const st = wallet();
    const was = snapshot(st);
    const out = M.act(st, buyOp('CRAB', 500, now));
    assert.equal(snapshot(st), was, 'act mutated the wallet it was handed');
    assert.notEqual(out, st);
    assert.equal(out.pos.CRAB.length, 1, 'one buy is one lot');
    assert.equal(out.pos.CRAB[0].amount, 500);
    assert.equal(out.pos.CRAB[0].entryTicks, M.priceAt('CRAB', now));
    assert.equal(out.pos.CRAB[0].at, now);
    assert.equal(out.net, -500, 'the stake leaves at once: there is nothing on the table');
    assert.equal(out.staked, 500);
    assert.equal(out.earned, 0);
    assert.equal(out.moves, 1);
    assert.equal(out.trades, 0, 'a buy is a position, not a round trip: it is a trade when it is sold');
    assert.equal(out.at, now);
    assert.equal(out.last.op, 'buy');
    assert.equal(out.last.payout, 0);
    // the other three coins are untouched, and the position object is not shared with the input
    assert.equal(Object.keys(out.pos).length, 1);
    const two = M.act(out, buyOp('KELP', 10, now));
    assert.equal(out.pos.KELP, undefined, 'a later buy reached back into the wallet it came from');
    assert.equal(two.pos.CRAB[0].amount, 500);
  });
});

test('a sale pays the ratio of the two prices, less the whole round trip, and ends the position', () => {
  const inMs = at(DAY * 100);
  const outMs = at(DAY * 100 + 4000);
  let st = atClock(inMs, () => M.act(wallet(), buyOp('SHEL', 20000, inMs)));
  const entry = st.pos.SHEL[0].entryTicks;
  atClock(outMs, () => {
    const exit = M.priceAt('SHEL', outMs);
    const sold = M.act(st, sellOp('SHEL', outMs));
    // the engine's payout IS payoutOf: the Monte Carlo below measures that function, so this is the
    // line that makes the measurement a measurement of the game
    assert.equal(sold.net, M.payoutOf(20000, entry, exit));
    assert.equal(sold.last.payout, sold.net);
    assert.equal(sold.last.pl, sold.net - 20000);
    assert.equal(sold.last.entryTicks, entry);
    assert.equal(sold.last.ticks, exit);
    assert.equal(sold.last.heldMs, outMs - inMs);
    assert.equal(sold.pos.SHEL, undefined);
    assert.equal(sold.earned, sold.net, 'the money the market pays has to be in the record');
    assert.equal(sold.staked, 20000, 'and so has the money it took');
    assert.equal(M.netOf(M.save(sold)), sold.earned - sold.staked);
    assert.equal(sold.best, sold.net);
    assert.equal(sold.moves, 2);
    assert.equal(sold.trades, 1, 'the round trip closed');
    // selling twice is not a thing
    assert.equal(M.whyNot(sold, sellOp('SHEL', outMs)), 'nothing is held in SHEL');
    assert.equal(M.act(sold, sellOp('SHEL', outMs)), sold, 'a refused move returns the very same wallet');
  });
});

test('a held coin can be bought again: each buy is its own lot, and the sale pays each by its own price', () => {
  const t1 = at(DAY * 7), t2 = at(DAY * 7 + 600), t3 = at(DAY * 7 + 3000);
  let st = atClock(t1, () => M.act(wallet(), buyOp('TIDE', 100, t1)));
  st = atClock(t2, () => {
    assert.equal(M.whyNot(st, buyOp('TIDE', 250, t2), Infinity), null, 'buying more of a held coin is allowed');
    return M.act(st, buyOp('TIDE', 250, t2));
  });
  assert.equal(st.pos.TIDE.length, 2);
  assert.equal(st.staked, 350);
  const e1 = st.pos.TIDE[0].entryTicks, e2 = st.pos.TIDE[1].entryTicks;
  assert.equal(e1, M.priceAt('TIDE', t1));
  assert.equal(e2, M.priceAt('TIDE', t2));
  // no averaged entry on the money path: the payout is the sum of the two lots' own payouts
  atClock(t3, () => {
    const exit = M.priceAt('TIDE', t3);
    const v = M.view(st, 0, t3).coins.find((c) => c.code === 'TIDE');
    assert.equal(v.position.amount, 350);
    assert.equal(v.position.lots, 2);
    assert.equal(v.position.payout, M.payoutOf(100, e1, exit) + M.payoutOf(250, e2, exit));
    assert.equal(v.position.unitsMilli, Math.round(100 * 100000 / e1) + Math.round(250 * 100000 / e2));
    const sold = M.act(st, sellOp('TIDE', t3));
    assert.equal(sold.net, M.payoutOf(100, e1, exit) + M.payoutOf(250, e2, exit));
    assert.equal(sold.last.amount, 350);
    assert.equal(sold.pos.TIDE, undefined, 'a sale sells the whole coin');
    assert.equal(sold.trades, 1);
  });
  // a saved record keeps the first lot where a single position always was, so an older build still
  // reads the coin as held, and the rest come back from `more`
  const rec = M.save(st);
  assert.equal(rec.pos.TIDE.amount, 100);
  assert.equal(rec.pos.TIDE.more.length, 1);
  assert.deepEqual(M.load(JSON.parse(JSON.stringify(rec))).pos.TIDE, st.pos.TIDE);
  assert.ok(M.same(rec, M.save(M.load(rec))));
  assert.ok(!M.same(rec, M.save(M.load({ ...rec, pos: { TIDE: { amount: 100, entryTicks: e1, at: t1 } } }))), 'a lost lot is a different record');
  // and there is a ceiling on lots a coin can hold
  const tn = at(DAY * 8);
  atClock(tn, () => {
    let w = wallet();
    for (let i = 0; i < M.MAX_LOTS; i++) w = M.act(w, buyOp('KELP', 10, tn));
    assert.equal(w.pos.KELP.length, M.MAX_LOTS);
    assert.match(M.whyNot(w, buyOp('KELP', 10, tn), Infinity), /at most/);
    assert.equal(M.act(w, buyOp('KELP', 10, tn)), w);
    // four coins, each still its own position
    for (const code of CODES) if (code !== 'KELP') w = M.act(w, buyOp(code, 100, tn));
    assert.equal(M.view(w, 0, tn).holding, 4);
  });
});

test('a stake is a whole number between the minimum and the cap, and inside the purse', () => {
  const now = at(DAY * 9);
  atClock(now, () => {
    const st = wallet();
    for (const bad of [undefined, null, 0, 9, -5, 1.5, NaN, Infinity, '100', M.MAX_BUY + 1]) {
      const why = M.whyNot(st, buyOp('CRAB', bad, now), Infinity);
      assert.ok(why, 'a stake of ' + bad + ' was allowed');
      assert.equal(M.act(st, buyOp('CRAB', bad, now)), st);
    }
    assert.equal(M.whyNot(st, buyOp('CRAB', M.MIN_BUY, now), M.MIN_BUY), null, 'exactly the stake is enough');
    assert.equal(M.whyNot(st, buyOp('CRAB', M.MIN_BUY, now), M.MIN_BUY - 1), 'not enough credits');
    assert.equal(M.whyNot(st, buyOp('CRAB', 100, now), 0), 'not enough credits');
    // a broken ledger must refuse, not slip through
    assert.equal(M.whyNot(st, buyOp('CRAB', 100, now), NaN), 'not enough credits');
    assert.equal(M.whyNot(st, buyOp('NOPE', 100, now), Infinity), 'no such coin');
    assert.equal(M.whyNot(st, sellOp('NOPE', now), Infinity), 'no such coin');
    // a sale is not a stake, so an empty purse cannot stop one
    const held = M.act(wallet(), buyOp('CRAB', 100, now));
    assert.equal(M.whyNot(held, sellOp('CRAB', now), 0), null);
  });
});

test('the move is the message, so its shape is a rule', () => {
  const now = at(DAY * 3);
  atClock(now, () => {
    const st = wallet();
    for (const op of [undefined, null, 'buy', 'sell', 3, {}, { op: 'trade' }, { op: 'buy ' }, []]) {
      assert.equal(M.whyNot(st, op, Infinity), 'unknown action', JSON.stringify(op));
      assert.equal(M.act(st, op), st);
    }
    assert.equal(M.whyNot(null, buyOp('CRAB', 100, now), Infinity), 'there is no wallet');
    assert.deepEqual(M.OPS, ['buy', 'sell']);
  });
});

test('a trade happens now: not in the future, not at a time read off the chart', () => {
  const now = at(DAY * 200);
  atClock(now, () => {
    const st = wallet();
    // the future is the exploit this whole game is arranged around (market.js, section 5)
    for (const skew of [60000, 5 * 60000, DAY * MIN, 1e11]) {
      assert.equal(M.whyNot(st, buyOp('CRAB', 100, now + skew), Infinity), 'the market has not reached that minute yet', 'skew ' + skew);
      assert.equal(M.act(st, buyOp('CRAB', 100, now + skew)), st);
    }
    // and a price already drawn on the chart is a price already read
    for (const back of [60000, DAY * MIN, 1e11]) {
      assert.equal(M.whyNot(st, buyOp('CRAB', 100, now - back), Infinity), 'a trade settles at the clock, not at a chosen time');
    }
    // a message that crossed a tick boundary is still now
    assert.equal(M.whyNot(st, buyOp('CRAB', 100, now + 1000), Infinity), null);
    assert.equal(M.whyNot(st, buyOp('CRAB', 100, now - 1000), Infinity), null);
    for (const bad of [undefined, null, 1.5, NaN, '123', Infinity]) {
      assert.equal(M.whyNot(st, buyOp('CRAB', 100, bad), Infinity), 'a trade needs the time it happened');
    }
  });
  // a wallet that has moved cannot be moved at an earlier clock, which is what a system clock
  // dragged backwards would otherwise buy
  const later = at(DAY * 200 + 10);
  const st = atClock(later, () => M.act(wallet(), buyOp('CRAB', 100, later)));
  atClock(now, () => {
    assert.equal(M.whyNot(st, sellOp('CRAB', now), Infinity), 'the clock moved backwards');
    assert.equal(M.act(st, sellOp('CRAB', now)), st);
  });
});

test('moves only ever grow, which is what lets two windows be ordered', () => {
  let st = wallet();
  let moves = 0, trips = 0;
  let t = DAY * 400;
  for (let i = 0; i < 300; i++) {
    t += 11;
    const now = at(t);
    const code = CODES[i % CODES.length];
    const selling = !!st.pos[code];
    const next = atClock(now, () => M.act(st, selling ? sellOp(code, now) : buyOp(code, 50, now)));
    if (next !== st) { moves += 1; if (selling) trips += 1; }
    assert.equal(next.moves, moves);
    assert.equal(next.trades, trips);
    assert.ok(next.at >= st.at);
    st = next;
  }
  assert.equal(moves, 300, 'every one of those moves should have been allowed');
  assert.ok(trips > 100, 'only ' + trips + ' of those 300 moves closed a round trip');
});

// --- saving -------------------------------------------------------------------------------------

test('a wallet survives being saved and read back, and the chip does not', () => {
  const now = at(DAY * 500);
  let st = atClock(now, () => {
    let s = M.act(wallet(), buyOp('CRAB', 1234, now));
    s = M.act(s, buyOp('KELP', 77, now));
    s = M.act(s, sellOp('CRAB', now));
    return s;
  });
  const rec = M.save(st);
  assert.deepEqual(Object.keys(rec).sort(), ['at', 'best', 'by', 'earned', 'moves', 'pos', 'staked', 'trades']);
  assert.deepEqual(Object.keys(rec.pos), ['KELP']);
  const back = M.load(rec);
  for (const k of M.REC_FIELDS) assert.equal(back[k], st[k], k);
  assert.equal(back.by, st.by);
  assert.deepEqual(back.pos, st.pos);
  assert.equal(back.last, null, 'a reload keeps the wallet, not the chip that says what just happened');
  assert.equal(back.net, null);
  assert.deepEqual(M.save(back), rec, 'a round trip has to be idempotent');
  // and the view of a reloaded wallet is the view of the same wallet, once the chip is set aside:
  // that is the one thing a reload is meant to lose
  const bare = (w) => atClock(now, () => JSON.stringify(Object.assign(M.view(w, 0, now), { last: null, net: null })));
  assert.equal(bare(back), bare(st));
  assert.notEqual(atClock(now, () => JSON.stringify(M.view(back, 0, now))), atClock(now, () => JSON.stringify(M.view(st, 0, now))));
});

test('a record from somewhere else is read at the boundary, never trusted', () => {
  assert.equal(M.load(null).moves, 0, 'a player who has never traded gets an empty wallet');
  assert.deepEqual(M.load(undefined).pos, {});
  assert.equal(M.clean(null), null);
  for (const junk of ['nope', 7, [], true, 0, NaN]) {
    const w = M.load(junk);
    assert.equal(w.moves, 0, JSON.stringify(junk));
    assert.deepEqual(w.pos, {});
  }
  assert.deepEqual(M.save(M.load({})), M.save(M.newWallet({})));
  // anything that is not a count reads as none of it
  const z = M.load({ moves: 1.5, trades: 'x', staked: NaN, earned: -3, best: null, at: {} , by: 'not an id' });
  for (const k of M.REC_FIELDS) assert.equal(z[k], 0, k);
  // clean() IS the boundary here (forge.js leans on credits.js's cleanForge for this), so a `by`
  // outside the shape has to be gone by the time a wallet holds it. Taken raw, it would be written
  // back out by save(), come back as '' on the next read, and kept() would answer false for every
  // move this window ever made
  assert.equal(z.by, '', 'a writer id outside the shape reached a wallet');
  assert.equal(M.clean({ by: 'not an id' }).by, '');
  assert.equal(M.clean({ by: 'abcdef0123456789' }).by, 'abcdef0123456789');
  assert.equal(M.load({ by: 'abcdef0123456789' }).by, 'abcdef0123456789');
  // a count no save could have produced is not a count. Without this a hand-edited store sets
  // `moves` to 1e15 and wins every merge forever, so no window's own move is ever kept
  const huge = M.clean({ moves: 1e15, trades: 1e12, staked: Number.MAX_SAFE_INTEGER, earned: 1e16, best: 1e16, at: 1e18 });
  for (const k of M.REC_FIELDS) assert.equal(huge[k], 0, k + ' was believed at ' + k);
  assert.equal(M.newer(huge, M.clean({ moves: 1, by: 'abcdef0123456789' })), false);
  // a position has to be a position: a stake under the minimum, a price of zero, a coin that does
  // not exist, a prototype smuggled in through the stored JSON
  const bad = M.load({
    moves: 4, trades: 4, staked: 10, earned: 0, best: 0, at: 5, by: 'abcdef0123456789',
    pos: {
      CRAB: { amount: 1, entryTicks: 160000 },            // under the minimum stake
      KELP: { amount: 100, entryTicks: 0 },               // no price
      SHEL: { amount: 100, entryTicks: 1e18 },            // a price no coin can reach
      TIDE: { amount: 100, entryTicks: 120000, at: 99, extra: 'dropped' },
      NOPE: { amount: 100, entryTicks: 500 },             // not a coin
      __proto__: { amount: 100, entryTicks: 500 }
    }
  });
  assert.deepEqual(Object.keys(bad.pos), ['TIDE']);
  assert.deepEqual(bad.pos.TIDE, [{ amount: 100, entryTicks: 120000, at: 99 }]);
  assert.deepEqual(M.clean({ pos: { TIDE: { amount: 100, entryTicks: 120000, at: 99 } } }).pos.TIDE, { amount: 100, entryTicks: 120000, at: 99 }, 'a single lot is stored the way a position always was');
  // extra lots are held to the same rule one by one, and to the ceiling on lots
  const many = M.load({ pos: { TIDE: { amount: 100, entryTicks: 120000, at: 9, more: [
    { amount: 1, entryTicks: 120000 }, { amount: 200, entryTicks: 120000, at: 10 }, 'junk', null,
    ...Array.from({ length: 40 }, () => ({ amount: 10, entryTicks: 120000, at: 11 }))
  ] } } });
  assert.equal(many.pos.TIDE.length, M.MAX_LOTS - 3, 'the three bad entries inside the first ' + M.MAX_LOTS + ' were dropped');
  assert.equal(many.pos.TIDE[1].amount, 200);
  assert.equal(Object.getPrototypeOf(bad.pos), Object.prototype);
  assert.equal(bad.pos.extra, undefined);
  // a price has to be one THAT coin can reach: outside its own band is a position the market never
  // sold, and selling it would pay a ratio the band says cannot happen
  for (const t of M.TICKERS) {
    const below = { pos: { [t.code]: { amount: 100, entryTicks: t.floorTicks - 1, at: 1 } } };
    const above = { pos: { [t.code]: { amount: 100, entryTicks: t.capTicks + 1, at: 1 } } };
    assert.equal(M.clean(below).pos[t.code], undefined, t.code + ' took a price under its floor');
    assert.equal(M.clean(above).pos[t.code], undefined, t.code + ' took a price over its cap');
    assert.ok(M.clean({ pos: { [t.code]: { amount: 100, entryTicks: t.floorTicks, at: 1 } } }).pos[t.code], t.code);
  }
  // a wallet cannot have last moved before a position it is holding was opened
  assert.equal(M.clean({ at: 1, pos: { CRAB: { amount: 50, entryTicks: 160000, at: 900 } } }).at, 900);
  // a record with a position but no counters is still readable: a view of it must not throw
  const now = at(DAY * 5);
  assert.ok(M.view(M.load({ pos: { CRAB: { amount: 50, entryTicks: 160000, at: 0 } } }), 0, now).coins.length === 4);
});

// --- two windows --------------------------------------------------------------------------------

test('two windows trading at once settle on one wallet, and the money goes with it', () => {
  const now = at(DAY * 600);
  const base = atClock(now, () => M.act(wallet({ by: '1111111111111111' }), buyOp('CRAB', 1000, now)));
  // both windows read the same wallet and both sell the position
  const a = atClock(now, () => Object.assign(M.act(base, sellOp('CRAB', now)), { by: 'aaaaaaaaaaaaaaaa' }));
  const b = atClock(now, () => Object.assign(M.act(base, sellOp('CRAB', now)), { by: 'bbbbbbbbbbbbbbbb' }));
  const ra = M.save(a), rb = M.save(b);
  assert.equal(ra.moves, rb.moves, 'the collision this is about is two records at the same move count');
  assert.ok(ra.earned > 0 && ra.earned === rb.earned);
  // the merge picks one, whichever order it sees them in, and says the same thing twice
  const m1 = M.merge(ra, rb), m2 = M.merge(rb, ra);
  assert.deepEqual(m1, m2, 'the merge has to be order-free or two windows write each other forever');
  assert.deepEqual(M.merge(m1, ra), m1, 'and idempotent');
  assert.deepEqual(M.merge(m1, rb), m1);
  assert.equal(m1.by, 'bbbbbbbbbbbbbbbb', 'the larger writer id settles the tie');
  // the payout is counted ONCE, because it rode in the record that won
  assert.equal(M.netOf(m1), ra.earned - ra.staked);
  assert.equal(M.netOf(m1), M.netOf(rb));
  // which window may pay out is the (moves, by) pair and nothing else: this is the fgSettle check
  assert.equal(M.kept(rb, m1), true);
  assert.equal(M.kept(ra, m1), false, 'the losing window must not pay itself');
  assert.equal(M.kept(null, m1), false);
  assert.equal(M.kept(ra, null), false);
  // and the window that lost takes the merged wallet, which still holds the coin: it was not sold
  const dropped = M.load(M.merge(ra, rb));
  assert.equal(dropped.pos.CRAB, undefined, 'the surviving record did sell');
  // the mirror case: a buy that is dropped must not be charged either, which is why `staked` is in
  // the record and not in a per-window counter (market.js, section 7)
  const c = atClock(now, () => Object.assign(M.act(base, buyOp('KELP', 4000, now)), { by: 'cccccccccccccccc' }));
  const d = atClock(now, () => Object.assign(M.act(base, buyOp('SHEL', 9000, now)), { by: 'dddddddddddddddd' }));
  const m3 = M.merge(M.save(c), M.save(d));
  assert.equal(m3.by, 'dddddddddddddddd');
  // the wallet they both started from had already staked 1,000 on CRAB, so the one surviving buy
  // leaves 1,000 + 9,000 out. What matters is that the dropped 4,000 is NOT also charged
  assert.equal(M.netOf(m3), -10000, 'the dropped buy was charged too: ' + M.netOf(m3));
  assert.notEqual(M.netOf(m3), -14000);
  assert.deepEqual(Object.keys(m3.pos).sort(), ['CRAB', 'SHEL']);
  assert.equal(m3.pos.KELP, undefined, 'the dropped buy left a position behind');
  assert.equal(M.kept(M.save(c), m3), false);
});

test('more moves is later, and a lifetime figure never falls back', () => {
  const now = at(DAY * 610);
  let a = atClock(now, () => M.act(wallet({ by: '1111111111111111' }), buyOp('CRAB', 1000, now)));
  a = atClock(now, () => M.act(a, sellOp('CRAB', now)));
  const ahead = M.save(a);
  const behind = M.save(wallet({ by: 'ffffffffffffffff', trades: 7, best: 99999 }));
  assert.equal(M.newer(ahead, behind), true, 'two moves beats none whatever the writer id');
  assert.equal(M.newer(behind, ahead), false);
  assert.equal(M.newer(null, ahead), false);
  assert.equal(M.newer(ahead, null), true);
  const m = M.merge(behind, ahead);
  assert.equal(m.moves, ahead.moves);
  assert.equal(m.by, ahead.by);
  assert.equal(m.earned, ahead.earned, 'the money comes whole from the record that won');
  assert.equal(m.staked, ahead.staked);
  // NOTHING is lifted out of the loser, which is a difference from the sword and not an omission:
  // the winner holds the largest `moves` by definition, and every other field here is money or made
  // of money. `best` is the one that would bite: maxed, it would print the price of a dropped sale
  // as a record the player never set
  assert.deepEqual(M.MAX_FIELDS, []);
  assert.equal(m.best, ahead.best);
  assert.equal(m.trades, ahead.trades, 'a count lifted out of the loser would count a dropped move');
  assert.deepEqual(M.merge(m, behind), m, 'merging the loser back in changes nothing');
  assert.equal(M.same(m, M.merge(m, behind)), true);
  assert.equal(M.same(m, behind), false);
  assert.equal(M.same(null, null), true);
  assert.equal(M.same(m, null), false);
  // and the merged record does not share a position object with either input, or a window writing
  // to the record it just got back would reach into the copy the other side is still holding
  const withPos = M.save(atClock(now, () => M.act(M.load(ahead), buyOp('KELP', 60, now))));
  const out = M.merge(behind, withPos);
  assert.equal(out.pos.KELP.amount, 60);
  out.pos.KELP.amount = 1;
  assert.equal(withPos.pos.KELP.amount, 60, 'the merge handed back the input\'s own position object');
});

// --- what the webview sees ----------------------------------------------------------------------

function leaves(x, out) {
  if (x == null) return out;
  if (typeof x !== 'object') { out.push(String(x)); return out; }
  for (const k in x) { out.push(k); leaves(x[k], out); }
  return out;
}

test('a view carries every number the screen needs and none the screen could misuse', () => {
  const now = at(DAY * 800 + 123);
  // the clock is pinned for the whole test: `can` folds in the clock's own refusal, so a view drawn
  // at a time the host would not trade at greys everything out, which is the right answer and not
  // the one being measured here
  M._test.setClock(() => now);
  try { viewChecks(now); } finally { M._test.setClock(null); }
});

function viewChecks(now) {
  const st = M.act(wallet(), buyOp('CRAB', 3000, now));
  const v = M.view(st, 100000, now);
  assert.equal(v.nowMs, now);
  assert.equal(v.minBuy, M.MIN_BUY);
  assert.equal(v.maxBuy, M.MAX_BUY);
  // the fee in ten-thousandths, so the screen prints a percent without dividing. It is the ONLY
  // place the screen can learn the fee from: games/market/panel.js prints pct(st.feeBp) and holds no
  // figure of its own, which is why a change here is a change everywhere it is said
  assert.equal(v.feeBp, 50, 'the fee is 0.5%, in ten-thousandths, so the screen prints it');
  assert.equal(v.feeBp, (M.FEE_DEN - M.FEE_NUM) * (10000 / M.FEE_DEN));
  assert.equal(v.coins.length, 4);
  for (const c of v.coins) {
    assert.equal(c.ticks, M.priceAt(c.code, now));
    assert.equal(c.candles.length, 36);
    assert.equal(c.candles[c.candles.length - 1].c, c.ticks);
    assert.equal(c.openTicks, c.candles[0].o);
    assert.equal(c.chgBp, Math.round(((c.ticks - c.openTicks) * 10000) / c.openTicks));
    assert.ok(Number.isSafeInteger(c.chgBp) && Number.isSafeInteger(c.baseBp));
    assert.equal(c.can.buy, !c.why.buy);
    assert.equal(c.can.sell, !c.why.sell);
    // can is exactly what whyNot refuses, so a greyed button and a refused move always agree
    assert.equal(c.can.buy, !M.whyNot(st, buyOp(c.code, M.MIN_BUY, now), 100000));
    assert.equal(c.can.sell, !M.whyNot(st, sellOp(c.code, now), 100000));
  }
  const crab = v.coins.find((c) => c.code === 'CRAB');
  assert.equal(crab.can.buy, true, 'a held coin can be bought again');
  assert.equal(crab.can.sell, true);
  const p = crab.position;
  // every one of these is a multiplication the screen does not have to do
  assert.equal(p.amount, 3000);
  assert.equal(p.entryTicks, st.pos.CRAB[0].entryTicks);
  assert.equal(p.lots, 1);
  assert.equal(p.unitsMilli, Math.round(3000 * M.TICKS_PER_CREDIT * 1000 / p.entryTicks));
  assert.equal(p.payout, M.payoutOf(3000, p.entryTicks, crab.ticks));
  assert.equal(p.gross, M.grossOf(3000, p.entryTicks, crab.ticks));
  assert.equal(p.pl, p.payout - 3000);
  assert.ok(Number.isSafeInteger(p.payout) && Number.isSafeInteger(p.pl));
  assert.ok(p.payout < p.gross, 'the payout the screen shows has to have the fee in it already');
  assert.equal(v.held, 3000);
  assert.equal(v.heldPayout, p.payout);
  assert.equal(v.heldPl, p.payout - 3000);
  assert.equal(v.holding, 1);
  // nothing in the view is a seed, a lattice scale or a future price
  const flat = leaves(v, []);
  assert.equal(flat.includes('seed'), false);
  assert.equal(flat.includes('path'), false);
  for (const c of v.coins) for (const row of c.candles) assert.ok(row.t <= now, 'a view carried a candle from the future');
  // a budget that cannot cover the minimum greys every coin out
  const poor = M.view(st, 0, now);
  for (const c of poor.coins) assert.equal(c.can.buy, false);
  assert.equal(poor.coins.find((c) => c.code === 'CRAB').can.sell, true);
  // and a view drawn at a minute the host would refuse to trade at offers nothing at all
  const stale = M.view(st, 100000, now - 600000);
  for (const c of stale.coins) assert.deepEqual(c.can, { buy: false, sell: false });
  // the coin that IS held has nothing else to refuse it, so it is the one that shows the clock's
  // own reason rather than a reason of its own
  assert.equal(stale.coins.find((c) => c.code === 'CRAB').why.sell, 'a trade settles at the clock, not at a chosen time');
  assert.equal(stale.coins.find((c) => c.code === 'TIDE').why.sell, 'nothing is held in TIDE');
}

test('the idle view is a market with nothing held and nothing to press', () => {
  const now = at(DAY * 800);
  const v = M.idleView(now);
  assert.equal(JSON.stringify(M.view(null, 0, now)), JSON.stringify(v), 'no wallet at all reads as an empty one');
  assert.equal(v.holding, 0);
  assert.equal(v.held, 0);
  assert.equal(v.trades, 0);
  assert.equal(v.last, null);
  assert.equal(v.net, null);
  for (const c of v.coins) {
    assert.equal(c.position, null);
    assert.deepEqual(c.can, { buy: false, sell: false });
    assert.ok(c.candles.length > 0, 'the chart is on the idle screen: that is what the panel opens on');
    assert.equal(c.ticks, M.priceAt(c.code, now));
  }
});

test('a view of the same minute twice is the same view, so a redraw cannot flicker', () => {
  const now = at(DAY * 801 + 5);
  const st = atClock(now, () => M.act(wallet(), buyOp('KELP', 900, now)));
  assert.equal(JSON.stringify(M.view(st, 5000, now)), JSON.stringify(M.view(st, 5000, now)));
  // and the same minute at a different millisecond prices the same: the grid is the minute, which is
  // also why "wait for the second the minute turns" buys nothing
  assert.equal(M.priceAt('KELP', now), M.priceAt('KELP', now + 10));
  assert.equal(M.priceAt('KELP', at(M._test.minuteOf(now))), M.priceAt('KELP', now));
});

// --- Monte Carlo: the strategies ----------------------------------------------------------------
// The exact test above says every strategy returns at most the fee. These are four of them, played
// through the same payout function the engine sells with, so the table measures the game rather than
// the algebra.
//
// Every trip is on its own market (_test.lane): trades cut out of one history share draws, and an
// error bar read off them understates itself.
//
// The target error bar comes first and the count is solved from it. A trip's return has a spread of
// about sigma * sqrt(days held), so n = (spread / SE)^2. The stake is a million credits, which puts
// the floor in the payout at under a millionth and out of the way of what is being measured.
//
// What the error bar has to be tight enough to see. The house cut here is 0.5%, not the 3% the card
// games take, and the error bars below did NOT move with it: the 24 fixed holds settle at an SE of
// 0.0002% to 0.04% and the 16 rules that watch the price at 0.02% to 0.16%, in 28s, exactly as they
// did at 3%. So this table's power is unchanged in absolute terms (it still catches a strategy that
// beats fair by about half a percent) and is now a larger fraction of the cut being looked at.
// That is a deliberate split of labour rather than a gap: the claim "no strategy beats the fee" is
// the EXACT test above, proved by quadrature and optional stopping, and holds for any fee at all.
// This table's job is to show the shipped code is the code that was integrated, and the assertion it
// makes (rtp - 4*SE <= FEE) does not reference 3% or 0.5% or any other number.
// Four times the counts halves the error bars and costs four times the clock:
//   MK_MC=4 node test/market.test.js
const STAKE = 1000000;
const TARGET_SE = 0.0004;
const MIN_TRIPS = 50000 * MC;
const MAX_TRIPS = 400000 * MC;
// For the rules that watch the price, the spread cannot be written down in advance, so the count is
// not either: scanRun opens markets until the error bar it has MEASURED is inside this, and the
// assertion at the end holds it to it. 0.15% is what 8,000 lanes of a rule that waits for a
// four-sigma move can actually buy; it is not solved from the fee, and the note above says why
const SCAN_SE = 0.0015;
const SCAN_MIN = 4000;
const laneOf = (code, tag) => M._test.lane(code, tag);
const onLane = (row, minute) => M._test.priceOn(row, at(minute));

function tripsFor(vol, days) {
  const spread = Math.max(1e-6, vol * Math.sqrt(days));
  const want = Math.ceil(Math.pow(spread / TARGET_SE, 2));
  return Math.max(MIN_TRIPS, Math.min(MAX_TRIPS, want));
}

function tally() {
  return { n: 0, sumR: 0, sumSq: 0, sumFair: 0, paid: 0, staked: 0, heldMin: 0 };
}

function add(t, entry, exit, heldMin) {
  const out = M.payoutOf(STAKE, entry, exit);
  const r = out / STAKE;
  t.n += 1;
  t.sumR += r; t.sumSq += r * r;
  t.sumFair += exit / entry;
  t.paid += out; t.staked += STAKE;
  t.heldMin += heldMin;
}

function done(t, want) {
  const rtp = t.sumR / t.n;
  const sd = Math.sqrt(Math.max(0, t.sumSq / t.n - rtp * rtp));
  return { rtp, se: sd / Math.sqrt(t.n), fair: t.sumFair / t.n, n: t.n, held: t.heldMin / t.n, want };
}

// Buy, wait a fixed stretch, sell.
// The trips are taken back to back along a lane, [0,h), [h,2h), and so on. They are not independent
// of each other, and the reason is worth being precise about: a return is
// exp(squash(d_exit) - squash(d_entry)) and the band is a function of the LEVEL, so where the walk
// has got to by the start of a stretch changes how big that stretch tends to come out. What the
// error bar below actually needs is weaker, and does hold: a fair price has expected ratio 1 over
// any later stretch whatever the price did before it, so two returns from one lane have no
// covariance, and the variance of a mean asks for nothing more than that. A lane is three years
// long, so a long hold needs many lanes and a one-minute hold needs one
function holdRun(code, holdMin, vol) {
  const n = tripsFor(vol, holdMin / DAY);
  const perLane = Math.max(1, Math.floor((DAY * 365 * 3) / holdMin));
  const t = tally();
  let lane = 0;
  while (t.n < n) {
    const row = laneOf(code, 'h' + holdMin + '-' + lane);
    lane += 1;
    let entry = onLane(row, 0);
    for (let i = 1; i <= perLane && t.n < n; i++) {
      const exit = onLane(row, i * holdMin);
      add(t, entry, exit, holdMin);
      entry = exit;
    }
  }
  // a quarter of slack over the target, because a hold long enough to hit MAX_TRIPS stops short of
  // the count its own spread asked for
  return done(t, (TARGET_SE * 1.25) / Math.sqrt(MC));
}

// A scanner for the two rules that watch the price before they trade. `enter` sees the price, the
// running peak and the running trough; `exit` sees the price, the entry and how long it has been
// held. The sampling step is how often a player looks at the panel, and a coarse one is generous to
// the player rather than to the house: it is a player who never misses the moment they wanted
// The count is not set here either: the loop keeps opening markets until the error bar it has
// measured is inside SCAN_SE, and gives up at a lane budget. A rule that watches the price has a
// spread nobody can write down in advance, so the only honest way round is to measure it and stop
// when it is tight enough. SCAN_MIN is there so the first reading of that spread is not itself noise
function scanRun(code, cfg) {
  const t = tally();
  const want = SCAN_SE / Math.sqrt(MC);
  let lanes = 0;
  const target = Math.round(cfg.trips * MC);
  while (lanes < cfg.maxLanes) {
    if (t.n >= Math.max(SCAN_MIN, target) && done(t, want).se <= want) break;
    const row = laneOf(code, cfg.tag + lanes);
    lanes += 1;
    let peak = 0, trough = Infinity, entry = 0, entryAt = 0;
    for (let m = 0; m <= cfg.laneMin; m += cfg.stepMin) {
      const p = onLane(row, m);
      if (!entry) {
        if (p > peak) peak = p;
        if (p < trough) trough = p;
        if (cfg.enter(p, peak, trough)) { entry = p; entryAt = m; }
      } else if (cfg.exit(p, entry, m - entryAt)) {
        add(t, entry, p, m - entryAt);
        entry = 0; peak = p; trough = p;
      }
    }
  }
  const r = done(t, want);
  r.lanes = lanes;
  return r;
}

// How often the player looks at the panel. A rule that waits for a four-sigma move does not need
// half-hourly glances, and the coarse step is what keeps this test inside half a minute
const WATCH_MIN = { 2: 60, 4: 180 };
// Thresholds are in units of the coin's own daily move, not in flat percents: a 10% dip is a
// Tuesday on the wild coin and a once-a-year event on the calm one, and a strategy that does not
// scale to its coin is not being given a fair run

function dipRun(code, vol, k) {
  const drop = 1 - k * vol, rise = 1 + k * vol;
  return scanRun(code, {
    tag: 'dip' + k + '-',
    stepMin: WATCH_MIN[k], laneMin: DAY * 365 * 3, maxLanes: 8000, trips: 20000,
    enter: (p, peak) => p <= peak * drop,
    exit: (p, entry, held) => p >= entry * rise || p <= entry * (1 - 2 * k * vol) || held > DAY * 20 * k * k
  });
}

// The other way round: buy what is already climbing
function rideRun(code, vol, k) {
  const up = 1 + k * vol, take = 1 + k * vol, stop = 1 - k * vol;
  return scanRun(code, {
    tag: 'ride' + k + '-',
    stepMin: WATCH_MIN[k], laneMin: DAY * 365 * 3, maxLanes: 8000, trips: 20000,
    enter: (p, peak, trough) => p >= trough * up,
    exit: (p, entry, held) => p >= entry * take || p <= entry * stop || held > DAY * 20 * k * k
  });
}

const HOLDS = [1, 10, 60, 480, DAY, DAY * 7];

test('Monte Carlo: no way of trading this market returns more than ' + pct(FEE), () => {
  const t0 = Date.now();
  const rows = [];
  for (const t of M.TICKERS) {
    const vol = t.volBp / 10000;
    for (const h of HOLDS) rows.push(['hold ' + (h < DAY ? h + 'm' : (h / DAY) + 'd'), t.code, holdRun(t.code, h, vol)]);
    for (const k of [2, 4]) rows.push(['buy the dip ' + k + 'sd', t.code, dipRun(t.code, vol, k)]);
    for (const k of [2, 4]) rows.push(['ride the trend ' + k + 'sd', t.code, rideRun(t.code, vol, k)]);
  }
  console.log('  strategy                coin        trips     avg hold        return          SE'
    + '    over ' + pct(FEE).padEnd(7) + ' fair ratio');
  let worstSe = 0, overs = 0;
  for (const [name, code, r] of rows) {
    const over = (r.rtp - FEE) / r.se;
    if (over > 0) overs += 1;
    if (r.se > worstSe) worstSe = r.se;
    console.log('  ' + name.padEnd(22) + code.padEnd(8)
      + num(r.n).padStart(10)
      + (r.held < DAY ? r.held.toFixed(0) + 'm' : (r.held / DAY).toFixed(1) + 'd').padStart(13)
      + pct4(r.rtp).padStart(15)
      + pct4(r.se).padStart(12)
      + over.toFixed(1).padStart(12) + ' SE'
      + r.fair.toFixed(5).padStart(15));
    // The statement being made is "this measurement does not reach above the fee by more than its own
    // noise". It names no number: FEE is read off the engine, so lowering the fee cannot loosen this
    // line. A bare rtp < FEE would be a coin flip for a one-minute hold, where the true return IS the
    // fee less a hair: it is the exact test above that rules the band out, and this one that says the
    // engine is playing in it
    assert.ok(r.rtp - 4 * r.se <= FEE, name + ' on ' + code + ' returned ' + pct4(r.rtp) + ' +-' + pct4(r.se));
    // and the price itself is fair: the ratio of the two prices, before the fee, averages 1 or less
    assert.ok(r.fair - 4 * (r.se / FEE) <= 1, name + ' on ' + code + ' moved the price ' + r.fair.toFixed(5) + 'x');
    // a player who is being robbed stops playing: the fee is the only thing that should be eating.
    // The floor is the fee less seven points, which is what 0.90 was at a fee of 97% and is 92.5%
    // now: tied to the fee rather than to a figure that was once seven points under it
    assert.ok(r.rtp > FEE - 0.07, name + ' on ' + code + ' returned only ' + pct4(r.rtp));
    // the count was solved from the error bar wanted, so the error bar is what gets asserted
    assert.ok(r.se <= r.want + 1e-9,
      name + ' on ' + code + ' never got inside its error bar: ' + pct4(r.se)
      + ' over ' + num(r.n) + ' trips, wanted ' + pct4(r.want));
    assert.ok(r.n >= 3000, name + ' on ' + code + ' only took ' + r.n + ' trips');
  }
  console.log('  ' + rows.length + ' strategies, worst error bar ' + pct4(worstSe)
    + ', ' + overs + ' of them above ' + pct(FEE) + ' by any margin, measured in '
    + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // Where the error bar is small enough for a hard number to mean something, a hard number is
  // asserted, and it is two-sided: the return is the fee to within six of its own error bars, so the
  // fee is the WHOLE of what the house takes on a hold of this length and the drift and the band
  // and the rounding together are worth nothing against it. A one-sided "under the fee" would be a
  // coin flip here, because the true answer is the fee less a hair and half the draws land above it;
  // which is also why about a dozen of the forty rows above print over it and none is a finding
  let tight = 0;
  for (const [name, code, r] of rows) {
    if (r.se > 0.0001) continue;
    tight += 1;
    assert.ok(Math.abs(r.rtp - FEE) < 6 * 0.0001,
      name + ' on ' + code + ' measured ' + pct4(r.rtp) + ' with an SE of ' + pct4(r.se));
  }
  assert.ok(tight >= 12, 'only ' + tight + ' rows were measured tightly enough to hold to a number');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
