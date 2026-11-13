// The slot machine: the rings, the paytable, the spin, and what the house keeps.
// No dependencies: node's assert only. Run: node test/slots.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const sl = require(path.join(__dirname, '..', 'slots.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const L = sl.STRIP_LEN;
const COMBOS = L * L * L;
const V = (st) => sl.view(st);
const snapshot = (st) => JSON.stringify(st);
const spin = (opts) => sl.newRound(Object.assign({ seed: 'x', bet: 10 }, opts));
// A spin pinned to three ring positions, which is how a test chooses the symbols
const at = (stops, bet) => sl.newRound({ seed: 'pinned', bet: bet == null ? 10 : bet, stops });
// The first ring position on each reel holding a symbol, so a test can name a line by symbol
const firstAt = (sym) => sl.STRIPS.map((strip) => strip.indexOf(sym));
const line = (sym, bet) => at(firstAt(sym), bet);

const pct = (x) => (x * 100).toFixed(4) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');

// --- the rings and the table --------------------------------------------------------------

test('every ring holds the same symbols, in a different order', () => {
  assert.equal(sl.STRIPS.length, sl.REELS);
  assert.equal(sl.REELS, 3);
  assert.equal(L, 24);
  // The odds per reel are identical, which is the point: no reel is the one tuned to deny a win
  // the player can already see two thirds of
  for (const strip of sl.STRIPS) {
    assert.equal(strip.length, L);
    for (const row of sl.PAYS) {
      assert.equal(strip.filter((s) => s === row.sym).length, row.weight, row.sym);
    }
    for (const s of strip) assert.ok(sl.ROW[s], 'a ring holds an unknown ' + s);
  }
  // and the three orders really are different, or the screen scrolls three copies of one ring
  const joined = sl.STRIPS.map((s) => s.join(','));
  assert.equal(new Set(joined).size, sl.REELS);
  // the weights fill a ring exactly: this is what the whole table was solved from
  assert.equal(sl.PAYS.reduce((n, r) => n + r.weight, 0), L);
});

test('the table is printed rarest first and climbs, and nobody outside can edit it', () => {
  assert.deepEqual(sl.PAYS.map((r) => r.sym), ['crab', 'pearl', 'anchor', 'starfish', 'shell', 'kelp']);
  assert.deepEqual(sl.PAYS.map((r) => r.weight), [1, 2, 3, 4, 6, 8]);
  assert.deepEqual(sl.PAYS.map((r) => r.three), [1000, 100, 45, 20, 10, 6]);
  assert.deepEqual(sl.PAYS.map((r) => r.pair), [1, 1, 1, 1, 1, 0]);
  for (let i = 1; i < sl.PAYS.length; i++) {
    assert.ok(sl.PAYS[i].weight > sl.PAYS[i - 1].weight, 'weight at ' + sl.PAYS[i].sym);
    assert.ok(sl.PAYS[i].three < sl.PAYS[i - 1].three, 'pay at ' + sl.PAYS[i].sym);
  }
  // every multiplier is a whole number, which is what keeps the money path free of rounding
  for (const r of sl.PAYS) {
    assert.ok(Number.isSafeInteger(r.three) && Number.isSafeInteger(r.pair), r.sym);
  }
  assert.equal(sl.NO_WIN.mult, 0);
  assert.throws(() => { sl.PAYS[0].three = 1; }, TypeError);
  assert.throws(() => { sl.PAYS.push({}); }, TypeError);
  assert.throws(() => { sl.STRIPS[0][0] = 'crab'; }, TypeError);
});

// --- the line -----------------------------------------------------------------------------

test('three alike pays its row, two alike pays a flat one, and kelp pays only on three', () => {
  for (const row of sl.PAYS) {
    const three = sl.winOf([row.sym, row.sym, row.sym]);
    assert.equal(three.kind, 'three', row.sym);
    assert.equal(three.sym, row.sym);
    assert.equal(three.mult, row.three);
    assert.deepEqual(three.reels, [0, 1, 2]);
  }
  // a pair in each of the three places it can sit, with a third symbol that is not it
  const other = (sym) => sl.SYMBOLS.find((s) => s !== sym);
  for (const row of sl.PAYS) {
    const o = other(row.sym);
    const cases = [
      [[row.sym, row.sym, o], [0, 1]],
      [[row.sym, o, row.sym], [0, 2]],
      [[o, row.sym, row.sym], [1, 2]]
    ];
    for (const [syms, reels] of cases) {
      const w = sl.winOf(syms);
      if (!row.pair) {
        assert.equal(w, sl.NO_WIN, 'a ' + row.sym + ' pair pays nothing: ' + syms.join(' '));
        continue;
      }
      assert.equal(w.kind, 'pair', syms.join(' '));
      assert.equal(w.sym, row.sym);
      assert.equal(w.mult, 1, 'a paid pair is a flat one');
      assert.deepEqual(w.reels, reels, syms.join(' '));
    }
  }
  // three different symbols is nothing, whichever three
  assert.equal(sl.winOf(['crab', 'pearl', 'anchor']), sl.NO_WIN);
  assert.equal(sl.winOf(['kelp', 'shell', 'starfish']), sl.NO_WIN);
  // and a line is three known symbols, nothing else
  assert.throws(() => sl.winOf(['crab', 'crab']), RangeError);
  assert.throws(() => sl.winOf(['crab', 'crab', 'crab', 'crab']), RangeError);
  assert.throws(() => sl.winOf(['crab', 'crab', 'lobster']), RangeError);
  assert.throws(() => sl.winOf('crab'), RangeError);
});

// Every stop the machine has, counted and priced. This is what says the return is what the file
// header claims: the numbers below are not measurements, they are every outcome the three rings
// can show, and a paytable that is retuned anywhere cannot keep this total
test('all 13,824 stops: the house keeps 3.5%, and no single row carries the return', () => {
  assert.equal(COMBOS, 13824);
  const rows = new Map();   // row name -> { n, mult }
  let gross = 0, hits = 0, anyTwo = 0;
  const bump = (name, mult) => {
    if (!rows.has(name)) rows.set(name, { n: 0, mult });
    rows.get(name).n += 1;
  };
  // The row is read off the three symbols, not off the win, so a kelp pair is counted as the kelp
  // pair it is and shows up in the table below paying nothing. Counting it as "no win" would hide
  // the one line of the machine a player is most likely to misread
  const nameOf = (syms) => {
    if (syms[0] === syms[1] && syms[1] === syms[2]) return syms[0] + ' x3';
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) if (syms[i] === syms[j]) return syms[i] + ' x2';
    return 'three different';
  };
  for (let a = 0; a < L; a++) {
    for (let b = 0; b < L; b++) {
      for (let c = 0; c < L; c++) {
        const syms = [sl.symAt(0, a), sl.symAt(1, b), sl.symAt(2, c)];
        const w = sl.winOf(syms);
        gross += w.mult;
        if (w.mult) hits += 1;
        if (new Set(syms).size < 3) anyTwo += 1;
        bump(nameOf(syms), w.mult);
      }
    }
  }
  // Every count here is exact: the weights are 1, 2, 3, 4, 6, 8 out of 24, so three alike is
  // weight^3 of 24^3 and a pair is 3 * weight^2 * (24 - weight). The enumeration above has to
  // agree with that arithmetic, or the rings are not holding the weights the table was solved from
  for (const row of sl.PAYS) {
    const w = row.weight;
    assert.equal(rows.get(row.sym + ' x3').n, w * w * w, row.sym + ' x3');
    assert.equal(rows.get(row.sym + ' x2').n, 3 * w * w * (L - w), row.sym + ' x2');
  }
  const rtp = gross / COMBOS;
  console.log('  row'.padEnd(16) + 'stops'.padStart(7) + 'chance'.padStart(10) + 'once in'.padStart(10)
    + 'pays'.padStart(7) + 'of the return'.padStart(15));
  const order = sl.PAYS.map((r) => r.sym + ' x3').concat(sl.PAYS.map((r) => r.sym + ' x2'), ['three different']);
  for (const name of order) {
    const r = rows.get(name);
    if (!r) continue;
    console.log('  ' + name.padEnd(14) + String(r.n).padStart(7) + pct(r.n / COMBOS).padStart(10)
      + num(COMBOS / r.n).padStart(10) + ('x' + r.mult).padStart(7)
      + (r.mult ? pct(r.n * r.mult / gross) : '-').padStart(15));
  }
  console.log('  gross ' + gross + ' of ' + COMBOS + ' staked');
  console.log('  return ' + pct(rtp) + '   something pays once in ' + (COMBOS / hits).toFixed(2)
    + ' spins (' + pct(hits / COMBOS) + ')');
  console.log('  two or more alike (paid or not) ' + pct(anyTwo / COMBOS));

  // The band every game in this casino sits in. The figure is exact, so this only moves if the
  // table or the rings do
  assert.equal(gross, 13331);
  assert.ok(rtp > 0.96 && rtp < 0.97, 'the machine returns ' + pct(rtp));
  // The enumeration above and the closed form the module checks itself against when it loads are
  // the same number. That is what makes the load check worth having: it trusts a formula, and this
  // is the only place that says the formula is the machine
  assert.equal(sl.grossOf(), gross, 'the closed form and the enumeration disagree');
  assert.equal(sl.COMBOS, COMBOS);
  assert.ok(100 * gross >= sl.BAND_LO * COMBOS && 100 * gross <= sl.BAND_HI * COMBOS, 'the band, as integers');
  // and the load check has teeth, which a check that only ever passes does not. One digit on the
  // kelp row, the row carrying 23% of the payout, is enough: the order of the table survives it
  // (seven is still under the shell's ten) and the return does not
  const kelp = sl.ROW.kelp;
  const bumped = gross - kelp.weight ** 3 * kelp.three + kelp.weight ** 3 * (kelp.three + 1);
  console.log('  one digit on the kelp row (x6 to x7) would make it ' + pct(bumped / COMBOS));
  assert.ok(100 * bumped > sl.BAND_HI * COMBOS, 'a kelp row of x7 should be outside the band');
  // Something pays about one spin in three. A 96% built out of one jackpot is a machine where
  // nothing ever happens, so the hit rate is part of the spec and not a side effect
  assert.ok(hits / COMBOS > 0.3, 'only ' + pct(hits / COMBOS) + ' of spins pay anything');
  // and the jackpot is a tenth of the return at most: a player who never sees a crab is still
  // returned the great majority of what the table promises
  const jack = rows.get('crab x3');
  const jackShare = jack.n * jack.mult / gross;
  assert.ok(jackShare < 0.1, 'the crab carries ' + pct(jackShare) + ' of the return');
  assert.ok(rtp - (jack.n * jack.mult) / COMBOS > 0.85, 'without the crab the table pays too little to play');
  // no other row carries more than a third either
  for (const [name, r] of rows) {
    if (!r.mult) continue;
    assert.ok(r.n * r.mult / gross < 0.34, name + ' carries ' + pct(r.n * r.mult / gross));
  }
});

// --- the spin -----------------------------------------------------------------------------

test('a spin stops three rings inside their length, from the shared roll stream', () => {
  for (let i = 0; i < 2000; i++) {
    const stops = sl.stopsOf('stop-' + i);
    assert.equal(stops.length, 3);
    for (const s of stops) assert.ok(Number.isInteger(s) && s >= 0 && s < L, 'stop ' + s);
  }
  // the stops come off cards.js's seeded stream: one PRNG in the repo, not a second copy
  for (let i = 0; i < 200; i++) {
    const seed = 'stream-' + i;
    const roll = C.rollsFrom(seed);
    assert.deepEqual(sl.stopsOf(seed), [0, 1, 2].map(() => Math.floor(roll() * L)));
  }
});

test('the rings stop evenly, so a symbol comes up as often as it is on the ring', () => {
  // The return above is exact given even stops. This is the check that the engine's own rolls
  // really land evenly, which is what makes that enumeration a measurement of the machine rather
  // than of a spreadsheet. Fixed seeds, so the counts are the same on every run
  const N = 120000;
  const tol = 5; // in standard errors
  const seen = sl.STRIPS.map(() => new Array(L).fill(0));
  const bySym = new Map(sl.SYMBOLS.map((s) => [s, 0]));
  for (let i = 0; i < N; i++) {
    const stops = sl.stopsOf('even-' + i);
    for (let r = 0; r < sl.REELS; r++) {
      seen[r][stops[r]] += 1;
      bySym.set(sl.symAt(r, stops[r]), bySym.get(sl.symAt(r, stops[r])) + 1);
    }
  }
  let worst = 0, worstAt = '';
  const p = 1 / L, se = Math.sqrt(p * (1 - p) / N);
  for (let r = 0; r < sl.REELS; r++) {
    for (let i = 0; i < L; i++) {
      const off = Math.abs(seen[r][i] / N - p) / se;
      if (off > worst) { worst = off; worstAt = 'reel ' + r + ' position ' + i; }
      assert.ok(off < tol, 'reel ' + r + ' stopped on ' + i + ' ' + (seen[r][i] / N * 100).toFixed(3) + '% of the time');
    }
  }
  console.log('  ' + (N * sl.REELS).toLocaleString('en-US') + ' stops, furthest off: ' + worst.toFixed(1) + ' SE (' + worstAt + ')');
  console.log('  symbol'.padEnd(14) + 'rolled'.padStart(10) + 'on the ring'.padStart(13));
  for (const row of sl.PAYS) {
    const got = bySym.get(row.sym) / (N * sl.REELS);
    console.log('  ' + row.sym.padEnd(12) + pct(got).padStart(10) + pct(row.weight / L).padStart(13));
    const q = row.weight / L;
    assert.ok(Math.abs(got - q) / Math.sqrt(q * (1 - q) / (N * sl.REELS)) < tol, row.sym + ' came up ' + pct(got));
  }
});

test('a spin is one press: it is born settled and nothing can be played on it', () => {
  const st = line('crab', 100);
  assert.equal(st.phase, 'done');
  assert.equal(st.win.kind, 'three');
  assert.equal(st.net, 100 * 1000 - 100);
  // there is no action inside a spin, so every ask is refused and the object comes back untouched
  assert.deepEqual(sl.OPS, []);
  for (const op of [undefined, null, 'spin', 'stop', { op: 'spin' }, { op: 'hold', i: 1 }]) {
    assert.equal(sl.whyNot(st, op), 'a spin settles on the press, so there is nothing to play');
    assert.equal(sl.act(st, op), st, 'a refused action gives back the very same object');
  }
  assert.equal(sl.whyNot(null, 'spin'), 'a spin settles on the press, so there is nothing to play');
  // and nothing is ever riding between two messages, which is what the other games' budgets read
  assert.equal(sl.stake(st), 0);
  assert.equal(sl.stake(null), 0);
});

test('act never mutates its input', () => {
  for (let i = 0; i < 300; i++) {
    const st = sl.newRound({ seed: 'mut-' + i, bet: 100 });
    const before = snapshot(st);
    sl.act(st, { op: 'spin' });
    sl.act(st, 'spin');
    sl.act(st, null);
    assert.equal(snapshot(st), before);
  }
});

test('the bet is a whole number the top row can be paid on', () => {
  assert.throws(() => sl.newRound({ seed: 'x', bet: 1.5 }), RangeError);
  assert.throws(() => sl.newRound({ seed: 'x', bet: 0 }), RangeError);
  assert.throws(() => sl.newRound({ seed: 'x', bet: -10 }), RangeError);
  assert.throws(() => sl.newRound({ seed: 'x', bet: 2 ** 53 }), RangeError);
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / sl.PAYS[0].three);
  assert.equal(sl.newRound({ seed: 'x', bet: cap }).bet, cap);
  assert.ok(Number.isSafeInteger(cap * sl.PAYS[0].three), 'the cap itself still pays exactly');
  assert.throws(() => sl.newRound({ seed: 'x', bet: cap + 1 }), RangeError);
  // the floor the host reads, so a game screen holds no minimum of its own
  assert.equal(sl.MIN_BET, 10);
  // a pinned stop has to be a real ring position
  assert.throws(() => at([0, 0, L]), RangeError);
  assert.throws(() => at([0, 0, -1]), RangeError);
  assert.throws(() => at([0, 0, 1.5]), RangeError);
  assert.throws(() => sl.newRound({ seed: 'x', bet: 10, stops: [0, 0] }), RangeError);
});

// --- money --------------------------------------------------------------------------------

test('the payout is a whole multiple of the bet, and a paid pair hands the bet straight back', () => {
  // the chips are 10 / 100 / 1K, so these are the bets a player can actually build
  for (const bet of [10, 20, 100, 110, 1000, 1010, 9990, 123450]) {
    for (const row of sl.PAYS) {
      const three = line(row.sym, bet);
      assert.equal(three.win.mult, row.three, row.sym);
      assert.equal(three.net, bet * row.three - bet, row.sym + ' x3 at ' + bet);
      assert.ok(Number.isSafeInteger(three.net), 'net ' + three.net);
      assert.equal(three.net, Math.trunc(three.net), 'no fraction survives the payout');
    }
  }
  // the pay line itself: a paid pair returns the bet, a kelp pair loses it
  const pairAt = (sym, third) => {
    const stops = [sl.STRIPS[0].indexOf(sym), sl.STRIPS[1].indexOf(sym), sl.STRIPS[2].indexOf(third)];
    return at(stops, 10);
  };
  const back = pairAt('shell', 'crab');
  assert.equal(back.win.kind, 'pair');
  assert.equal(back.net, 0, 'the minimum bet comes back whole');
  const gone = pairAt('kelp', 'crab');
  assert.equal(gone.win, sl.NO_WIN);
  assert.equal(gone.net, -10, 'a spin that misses costs the bet and nothing else');
  // and the biggest thing on the machine, at the minimum bet
  assert.equal(line('crab', 10).net, 9990);
});

test('the bet does not change the game, only the size of it', () => {
  // every multiplier is whole, so there is no flooring to make a small bet worse (high-low's is the
  // opposite: there, the minimum bet sits in a flat zone a big bet never sees)
  for (let i = 0; i < 400; i++) {
    const seed = 'scale-' + i;
    const one = sl.newRound({ seed, bet: 1 });
    for (const bet of [10, 97, 1000]) {
      const big = sl.newRound({ seed, bet });
      assert.deepEqual(big.syms, one.syms, seed);
      assert.equal(big.win.mult, one.win.mult, seed);
      assert.equal(big.net, one.net * bet, seed + ' at ' + bet);
    }
  }
});

// --- determinism and what the webview sees -------------------------------------------------

test('the same seed stops the same way, and the id is not the seed', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'det-' + i;
    assert.deepEqual(V(sl.newRound({ seed, bet: 100 })), V(sl.newRound({ seed, bet: 100 })));
  }
  const stops = (seed) => sl.stopsOf(seed).join(',');
  const distinct = new Set(Array.from({ length: 300 }, (_, i) => stops('d' + i)));
  assert.ok(distinct.size > 250, 'only ' + distinct.size + ' different stops in 300 seeds');
  // the id names the spin and does not roll it: handed the id, the machine stops somewhere else
  const id = 'c0ffee';
  const byId = sl.newRound({ seed: 'the-seed', id, bet: 10 });
  assert.equal(byId.id, id);
  assert.notEqual(V(byId).id, V(byId).seed);
  assert.notDeepEqual(sl.stopsOf(id), sl.stopsOf('the-seed'));
});

test('a view carries the whole machine, and the reels carry their neighbours', () => {
  for (let i = 0; i < 300; i++) {
    const st = sl.newRound({ seed: 'view-' + i, id: 'id-' + i, bet: 50 });
    const v = V(st);
    assert.equal(v.phase, 'done');
    assert.equal(v.reels.length, sl.REELS);
    for (let r = 0; r < sl.REELS; r++) {
      const reel = v.reels[r];
      const strip = sl.STRIPS[r];
      // the neighbours are the ring's own, so the screen scrolls the real ring to the real place
      assert.equal(reel.sym, strip[reel.at], 'reel ' + r);
      assert.equal(reel.above, strip[(reel.at - 1 + L) % L], 'above reel ' + r);
      assert.equal(reel.below, strip[(reel.at + 1) % L], 'below reel ' + r);
    }
    // the win is a row or NO_WIN, never null, so the chip is always a kind and a net
    assert.ok(v.win && typeof v.win.kind === 'string');
    assert.equal(v.net, st.bet * v.win.mult - st.bet);
    // the screen holds no numbers and no ring of its own
    assert.equal(v.pays, sl.PAYS);
    assert.equal(v.strips, sl.STRIPS);
    assert.equal(v.stripLen, L);
    assert.equal(v.reelCount, sl.REELS);
    assert.equal(v.minBet, sl.MIN_BET);
    // the seed is handed over because the spin it names is already over: there is no face-down
    // symbol in this game and the next spin rolls a fresh seed of its own
    assert.equal(v.seed, st.seed);
    assert.deepEqual(v.can, {});
  }
});

test('the idle view is a bet screen with the paytable and the rings on it', () => {
  const v = sl.view(null);
  assert.equal(v.phase, 'bet');
  assert.equal(v.id, null);
  assert.equal(v.bet, null);
  assert.deepEqual(v.reels, []);
  assert.equal(v.win, null);
  assert.equal(v.net, null);
  assert.equal('seed' in v, false, 'there is no spin, so there is no seed');
  assert.equal(v.pays, sl.PAYS);
  assert.equal(v.strips, sl.STRIPS);
  assert.equal(v.minBet, 10);
  assert.deepEqual(v.can, {});
  // the two views agree on everything the machine is, and differ only in what one spin did
  const live = V(spin({ bet: 10 }));
  for (const k of ['pays', 'strips', 'stripLen', 'reelCount', 'minBet']) assert.equal(live[k], v[k], k);
});

let failed = 0;
for (const t of tests) {
  // A sync runner drops a promise on the floor: an async test would stop at its first await
  // and still be counted as a pass. Refuse one instead of reporting a result nobody produced.
  try {
    const r = t.fn();
    if (r && typeof r.then === 'function') throw new Error('async test in a sync runner: use await t.fn()');
    console.log('PASS ' + t.name);
  }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
