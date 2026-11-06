// Keno: the tables, the hypergeometric arithmetic they were solved against, the draw, and what the
// house keeps. No dependencies: node's assert only. Run: node test/keno.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const kn = require(path.join(__dirname, '..', 'keno.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const POOL = kn.POOL, DRAWN = kn.DRAWN;
const snapshot = (st) => JSON.stringify(st);
const pct = (n) => (n * 100).toFixed(4) + '%';
const num = (n) => n.toLocaleString('en-US');
const deal = (bet, seed) => kn.newRound({ seed: seed == null ? 'seed' : seed, id: 'round-1', bet: bet == null ? 10 : bet });
const draw = (st, picks) => kn.act(st, { op: 'draw', picks });
const first = (k) => { const out = []; for (let n = 1; n <= k; n++) out.push(n); return out; };

// The first seed (from a fixed list) whose draw catches exactly `hit` of `picks`. This is how a
// test pins an outcome: the same way the card tests search a seed for a deal
function seedForHit(picks, hit, tag) {
  const want = new Set(picks);
  for (let i = 0; i < 400000; i++) {
    const seed = (tag || 'pin') + '-' + picks.length + '-' + hit + '-' + i;
    let n = 0;
    for (const d of kn.drawOf(seed)) if (want.has(d)) n += 1;
    if (n === hit) return seed;
  }
  throw new Error('no seed catches ' + hit + ' of ' + picks.length);
}

// --- the tables ---------------------------------------------------------------------------------

test('every offered board returns inside the band, and said so in whole numbers', () => {
  assert.equal(POOL, 40);
  assert.equal(DRAWN, 10);
  assert.deepEqual(kn.PICKS, [2, 3, 4, 5, 6, 7, 8, 9, 10]);
  console.log('  spot  pays from   top        return      pays at all   nothing');
  for (const k of kn.PICKS) {
    const r = kn.returnOf(k);
    // 0.96 <= num/den <= 0.97, written the way keno.js checks it: no float decides this
    assert.ok(100 * r.num >= 96 * r.den, k + '-spot returns under 96%');
    assert.ok(100 * r.num <= 97 * r.den, k + '-spot returns over 97%');
    const t = kn.BY_PICKS[k];
    console.log('  ' + String(k).padStart(3) + String(t.from + ' hits').padStart(11)
      + String(t.top + 'x').padStart(10) + pct(r.num / r.den).padStart(14)
      + pct(t.paying.num / t.paying.den).padStart(15)
      + pct(1 - t.paying.num / t.paying.den).padStart(11));
  }
});

test('a board climbs: catching one more number is never worth less', () => {
  for (const k of kn.PICKS) {
    const pays = kn.TABLES[k];
    assert.equal(pays.length, k + 1);
    let prev = -1, started = false;
    for (let h = 0; h <= k; h++) {
      assert.ok(Number.isSafeInteger(pays[h]) && pays[h] >= 0, k + '-spot at ' + h);
      if (pays[h] > 0) {
        assert.ok(pays[h] > prev, k + '-spot does not climb at ' + h);
        prev = pays[h];
        started = true;
      } else {
        // a gap in the middle would be a board where catching more pays nothing again
        assert.equal(started, false, k + '-spot stops paying at ' + h + ' and starts again');
      }
    }
    assert.ok(started, k + '-spot pays nothing at all');
  }
});

test('the hit distribution of every board, counted exactly', () => {
  for (const k of kn.PICKS) {
    const t = kn.BY_PICKS[k];
    const line = t.rows.map((r) => r.hit + ':' + (r.chance.num / r.chance.den * 100).toFixed(2) + '%'
      + (r.mult ? '=' + r.mult + 'x' : '')).join(' ');
    console.log('  ' + String(k).padStart(2) + '-spot  ' + line);
    let sum = 0;
    for (const r of t.rows) sum += r.chance.num;
    assert.equal(sum, kn.WAYS[k], k + '-spot chances do not sum to one');
  }
});

test('the weights are what a board actually holds, counted without the formula', () => {
  // keno.js believes C(DRAWN, h) * C(POOL - DRAWN, k - h). This counts it instead: fix the ten
  // numbers that came out, walk every way of marking k, and tally the catches. By symmetry the
  // tally IS the weight, so a wrong binomial anywhere cannot match
  const out = new Set(first(DRAWN));
  for (const k of [2, 3, 4, 5, 6]) {
    const seen = new Array(k + 1).fill(0);
    const pick = new Array(k).fill(0);
    const walk = (i, from, hit) => {
      if (i === k) { seen[hit] += 1; return; }
      for (let n = from; n <= POOL - (k - i - 1); n++) {
        pick[i] = n;
        walk(i + 1, n + 1, hit + (out.has(n) ? 1 : 0));
      }
    };
    walk(0, 1, 0);
    assert.deepEqual(seen, kn.WEIGHTS[k].slice(), k + '-spot weights');
    assert.equal(seen.reduce((a, b) => a + b, 0), kn.WAYS[k]);
  }
  // and the binomials themselves, against the row they are asked for most
  assert.equal(kn.choose(POOL, DRAWN), 847660528);
  assert.equal(kn.choose(POOL, 0), 1);
  assert.equal(kn.choose(5, 7), 0);
  console.log('  counted every way of marking 2 to 6 numbers: '
    + num([2, 3, 4, 5, 6].reduce((a, k) => a + kn.WAYS[k], 0)) + ' tickets');
});

test('the 1-spot is not offered because no whole-number table exists for it', () => {
  // Catching the one number is 10 in 40, so the board's return is pays[1] / 4, and the band
  // 0.96..0.97 holds no quarter. The pick count was dropped rather than the band bent
  assert.equal(kn.PICKS.indexOf(1), -1);
  const D = kn.choose(POOL, 1);
  const w1 = kn.choose(DRAWN, 1) * kn.choose(POOL - DRAWN, 0);
  assert.equal(D, 40);
  assert.equal(w1, 10);
  for (let pay = 0; pay <= 1000; pay++) {
    const inBand = 100 * (w1 * pay) >= 96 * D && 100 * (w1 * pay) <= 97 * D;
    assert.equal(inBand, false, 'a 1-spot paying ' + pay + 'x would land in the band');
  }
  console.log('  a 1-spot paying 3x returns 75%, paying 4x returns 100%, and there is nothing between');
});

test('the 2-spot table is the only one there is', () => {
  // Claimed in keno.js: the return has to be a multiple of 15 and the band holds exactly one.
  // Searched here so the claim is checked rather than believed
  const w = kn.WEIGHTS[2], D = kn.WAYS[2];
  const found = [];
  for (let a = 0; a <= 40; a++) {
    for (let b = a + 1; b <= 400; b++) {
      const W = w[1] * a + w[2] * b;
      if (100 * W >= 96 * D && 100 * W <= 97 * D) found.push([a, b]);
    }
  }
  // a = 0 means the board pays nothing for one catch, which is a legal shape and still has no table
  for (let b = 1; b <= 400; b++) {
    const W = w[2] * b;
    assert.ok(!(100 * W >= 96 * D && 100 * W <= 97 * D), 'a 2-spot paying only on both would work at ' + b);
  }
  assert.deepEqual(found, [[1, 10]]);
  assert.deepEqual(kn.TABLES[2].slice(), [0, 1, 10]);
});

// --- the money path ----------------------------------------------------------------------------

test('the payout is a whole number of bets at EVERY bet, because nothing is rounded', () => {
  // Walk every row of every board at a range of bets, odd ones included, and the credits paid must
  // be exactly bet * the row. No tolerance: an equality
  const bets = [kn.MIN_BET, 11, 13, 17, 25, 100, 999, 123457];
  for (const k of kn.PICKS) {
    for (const bet of bets) {
      for (let h = 0; h <= k; h++) {
        const pay = bet * kn.TABLES[k][h];
        assert.equal(pay % bet, 0, k + '-spot at ' + h + ' catches, bet ' + bet);
        assert.ok(Number.isSafeInteger(pay));
      }
    }
  }
  // and the return of a whole board walked row by row is the exact fraction, at any bet
  for (const k of kn.PICKS) {
    for (const bet of [kn.MIN_BET, 11, 37]) {
      let paid = 0, staked = 0;
      for (let h = 0; h <= k; h++) {
        paid += kn.WEIGHTS[k][h] * bet * kn.TABLES[k][h];
        staked += kn.WEIGHTS[k][h] * bet;
      }
      const r = kn.returnOf(k);
      assert.equal(paid, bet * r.num, k + '-spot at a bet of ' + bet);
      assert.equal(staked, bet * r.den);
    }
  }
  console.log('  nine boards x ' + bets.length + ' bets: every payout an exact whole number of bets');
});

test('a bet too big to pay the top row exactly is refused', () => {
  assert.equal(kn.TOP, 200000);
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / kn.TOP);
  assert.equal(deal(cap).bet, cap);
  assert.throws(() => deal(cap + 1), RangeError);
  assert.ok(Number.isSafeInteger(cap * kn.TOP));
  for (const bad of [0, -1, 1.5, NaN, Infinity, '10', null, undefined]) {
    assert.throws(() => kn.newRound({ seed: 's', bet: bad }), RangeError, String(bad));
  }
});

// --- the draw ----------------------------------------------------------------------------------

test('a draw is DRAWN numbers off the board, in order, and the same seed draws the same ones', () => {
  for (let i = 0; i < 3000; i++) {
    const d = kn.drawOf('draw-' + i);
    assert.equal(d.length, DRAWN);
    assert.equal(new Set(d).size, DRAWN, 'the same number came out twice');
    for (const n of d) assert.ok(Number.isSafeInteger(n) && n >= 1 && n <= POOL, 'drew ' + n);
  }
  assert.deepEqual(kn.drawOf('same'), kn.drawOf('same'));
  // the ORDER is part of what the seed says, because the screen draws the numbers one at a time
  const d = kn.drawOf('order');
  assert.notDeepEqual(d, d.slice().sort((a, b) => a - b), 'the draw came out sorted, so the order is not the seed\'s');
  // the board is never shuffled in place: a second draw from the same seed is identical, and the
  // board itself is still 1..POOL
  assert.deepEqual(kn.BOARD.slice(), first(POOL));
});

test('every number on the board comes out equally often', () => {
  // The tables believe the draw is uniform over the board. This is the check that the engine's own
  // shuffle really is, which is what makes the exact returns above measurements of the game rather
  // than of a spreadsheet. Fixed seeds, so the counts are the same on every run
  const N = 120000;
  const seen = new Array(POOL + 1).fill(0);
  for (let i = 0; i < N; i++) for (const n of kn.drawOf('freq-' + i)) seen[n] += 1;
  const p = DRAWN / POOL;
  const se = Math.sqrt((p * (1 - p)) / N);
  let worst = 0, worstAt = 0;
  for (let n = 1; n <= POOL; n++) {
    const off = Math.abs(seen[n] / N - p) / se;
    if (off > worst) { worst = off; worstAt = n; }
    assert.ok(off < 5, n + ' came out ' + pct(seen[n] / N) + ' of the draws');
  }
  console.log('  ' + num(N) + ' draws, furthest off: ' + worst.toFixed(1) + ' SE (number ' + worstAt + ')');
});

test('the catches land on the table: the hit distribution of the engine\'s own draws', () => {
  // The exact return is a fact about the table AND about how often each row comes up. The table is
  // counted above; this is the other half, measured through the engine. Where a row is too rare to
  // measure in this many rounds it is skipped, and the line says so
  const N = 60000;
  console.log('  spot      rounds   furthest off   rows measured');
  for (const k of kn.PICKS) {
    const picks = first(k);
    const seen = new Array(k + 1).fill(0);
    for (let i = 0; i < N; i++) {
      const done = draw(deal(10, 'hit-' + k + '-' + i), picks);
      seen[done.hit] += 1;
    }
    let worst = 0, worstAt = -1, measured = 0;
    for (let h = 0; h <= k; h++) {
      const p = kn.WEIGHTS[k][h] / kn.WAYS[k];
      if (p * N < 20) continue;                 // too rare to say anything about in N rounds
      measured += 1;
      const se = Math.sqrt((p * (1 - p)) / N);
      const off = Math.abs(seen[h] / N - p) / se;
      if (off > worst) { worst = off; worstAt = h; }
      assert.ok(off < 5, k + '-spot caught ' + h + ' in ' + pct(seen[h] / N) + ' against ' + pct(p));
    }
    console.log('  ' + String(k).padStart(3) + num(N).padStart(12)
      + (worst.toFixed(1) + ' SE (at ' + worstAt + ')').padStart(16) + String(measured).padStart(12));
  }
});

test('Monte Carlo: the small boards return what the table says', () => {
  // Only the boards whose top row is small enough to be seen in this many rounds. A 10-spot's
  // 200,000x comes up once in 847 million, so a measurement of it would be a measurement of
  // whether it happened to turn up, not of the board. For those, the test above is the proof
  const N = 60000;
  console.log('  spot      rounds     measured      solved    off by');
  for (const k of [2, 3, 4, 5]) {
    const picks = first(k);
    let paid = 0, staked = 0;
    const pays = [];
    for (let i = 0; i < N; i++) {
      const done = draw(deal(10, 'mc-' + k + '-' + i), picks);
      paid += done.pay;
      staked += kn.stake(done);
      pays.push(done.pay / 10);
    }
    const rtp = paid / staked;
    const mean = pays.reduce((a, b) => a + b, 0) / N;
    let v = 0;
    for (const x of pays) v += (x - mean) * (x - mean);
    const se = Math.sqrt(v / (N - 1)) / Math.sqrt(N);
    const r = kn.returnOf(k);
    const exact = r.num / r.den;
    console.log('  ' + String(k).padStart(3) + num(N).padStart(12)
      + (pct(rtp) + ' +-' + pct(se)).padStart(22) + pct(exact).padStart(12)
      + (Math.abs(rtp - exact) / se).toFixed(1).padStart(8) + ' SE');
    assert.ok(Math.abs(rtp - exact) < 4 * se + 1e-9, k + '-spot measured ' + pct(rtp) + ' against ' + pct(exact));
    if (se < 0.004) assert.ok(rtp > 0.95 && rtp < 0.98, k + '-spot measured ' + pct(rtp));
  }
});

// --- the state machine -------------------------------------------------------------------------

test('a round is dealt live and one draw ends it', () => {
  const st = deal();
  assert.equal(st.phase, 'draw');
  assert.equal(st.picks, null);
  assert.equal(st.hit, null);
  assert.equal(kn.stake(st), 10);
  const done = draw(st, [3, 14, 15, 9, 26]);
  assert.equal(done.phase, 'done');
  assert.deepEqual(done.picks, [3, 14, 15, 9, 26]);
  assert.equal(done.drawn.length, DRAWN);
  assert.equal(done.hit, done.matched.length);
  assert.equal(done.mult, kn.TABLES[5][done.hit]);
  assert.equal(done.pay, 10 * done.mult);
  assert.equal(done.net, done.pay - 10);
  // matched is the marked numbers that came out, in the order they were marked
  for (const n of done.matched) assert.ok(done.picks.indexOf(n) >= 0 && done.drawn.indexOf(n) >= 0);
  assert.deepEqual(done.matched, done.picks.filter((n) => done.drawn.indexOf(n) >= 0));
  // and a second draw is refused rather than paid again
  assert.equal(kn.whyNot(done, { op: 'draw', picks: [1, 2] }), 'the round is over');
  assert.equal(draw(done, [1, 2]), done);
});

test('a caught ticket pays the row it caught, at every row the boards hold', () => {
  // Pinned seeds, so every row of the small boards is actually settled by the engine rather than
  // reasoned about
  for (const k of [2, 3, 4, 5]) {
    const picks = first(k);
    for (let h = 0; h <= k; h++) {
      const seed = seedForHit(picks, h, 'row');
      const done = draw(deal(10, seed), picks);
      assert.equal(done.hit, h, k + '-spot wanted ' + h);
      assert.equal(done.mult, kn.TABLES[k][h]);
      assert.equal(done.pay, 10 * kn.TABLES[k][h]);
      assert.equal(done.net, done.pay - 10);
      const v = kn.view(done);
      assert.equal(v.row.hit, h);
      assert.equal(v.row.mult, kn.TABLES[k][h]);
      assert.equal(v.table.picks, k);
    }
  }
});

test('act() never touches its input and hands the same object back when the move is refused', () => {
  const st = deal();
  const before = snapshot(st);
  draw(st, [1, 2, 3]);
  assert.equal(snapshot(st), before, 'the live round was mutated');
  const refusals = [
    { op: 'draw' }, { op: 'draw', picks: null }, { op: 'draw', picks: [] },
    { op: 'draw', picks: [7] },                               // one number: not an offered board
    { op: 'draw', picks: first(11) },                         // eleven: past the biggest board
    { op: 'draw', picks: [1, 1, 2] },                         // the same number twice
    { op: 'draw', picks: [0, 1, 2] }, { op: 'draw', picks: [1, 2, 41] },
    { op: 'draw', picks: [1, 2, 3.5] }, { op: 'draw', picks: [1, 2, '3'] },
    { op: 'mark', picks: [1, 2, 3] }, 'draw'
  ];
  for (const op of refusals) {
    assert.ok(kn.whyNot(st, op), 'should refuse ' + JSON.stringify(op));
    assert.equal(kn.act(st, op), st, 'refused but returned a new state: ' + JSON.stringify(op));
  }
  assert.equal(snapshot(st), before);
  // and the ticket that is refused is refused for a reason the host can ask about on its own
  assert.equal(kn.badPicks(first(2)), null);
  assert.equal(kn.badPicks(first(10)), null);
  assert.equal(kn.badPicks(first(1)), 'mark 2 to 10 numbers');
  assert.equal(kn.badPicks([1, 2, 99]), 'the board is 1 to 40');
  assert.equal(kn.badPicks([5, 5]), 'the same number cannot be marked twice');
  // a budget is taken and ignored: a round cannot cost more than the bet it was dealt with
  assert.equal(kn.whyNot(st, { op: 'draw', picks: first(3) }, 0), null);
});

test('the marks are copied in, so a webview cannot change its ticket after the draw', () => {
  const st = deal();
  const picks = [1, 2, 3, 4, 5];
  const done = draw(st, picks);
  picks.push(6);
  picks[0] = 40;
  assert.deepEqual(done.picks, [1, 2, 3, 4, 5], 'the engine kept the caller\'s array');
  assert.deepEqual(kn.view(done).picks, [1, 2, 3, 4, 5]);
  // and the view hands out copies too
  const v = kn.view(done);
  v.picks.push(99);
  v.drawn.push(99);
  assert.equal(kn.view(done).picks.length, 5);
  assert.equal(kn.view(done).drawn.length, DRAWN);
});

// --- what the webview sees ---------------------------------------------------------------------

test('the seed and the draw are not in the view until the round is over', () => {
  const st = kn.newRound({ seed: 'the-whole-draw', id: 'public-name', bet: 10 });
  const live = kn.view(st);
  assert.equal('seed' in live, false, 'the seed was handed over while the round was live');
  assert.equal(live.id, 'public-name');
  assert.notEqual(live.id, 'the-whole-draw');
  assert.equal(JSON.stringify(live).indexOf('the-whole-draw'), -1, 'the seed leaked through some other field');
  assert.equal(live.drawn, null);
  assert.deepEqual(live.picks, []);
  assert.deepEqual(live.matched, []);
  assert.equal(live.row, null);
  assert.equal(live.table, null);
  const done = kn.view(draw(st, first(4)));
  assert.equal(done.seed, 'the-whole-draw');
  assert.equal(done.drawn.length, DRAWN);
  assert.deepEqual(done.picks, first(4));
});

test('the view carries every board, before the bet and after it', () => {
  for (const v of [kn.idleView(), kn.view(null), kn.view(deal()), kn.view(draw(deal(), first(6)))]) {
    assert.equal(v.pool, POOL);
    assert.equal(v.draws, DRAWN);
    assert.deepEqual(v.counts.slice(), kn.PICKS.slice());
    assert.equal(v.tables.length, kn.PICKS.length);
    for (const t of v.tables) {
      assert.equal(t.rows.length, t.picks + 1);
      let ways = 0;
      for (const row of t.rows) {
        assert.equal(row.chance.den, kn.WAYS[t.picks]);
        ways += row.chance.num;
      }
      assert.equal(ways, kn.WAYS[t.picks], t.picks + '-spot chances do not sum to one');
      assert.equal(t.rtp.den, kn.WAYS[t.picks]);
      assert.ok(100 * t.rtp.num >= 96 * t.rtp.den && 100 * t.rtp.num <= 97 * t.rtp.den);
      assert.equal(t.rows[t.from].mult > 0, true);
      if (t.from > 0) assert.equal(t.rows[t.from - 1].mult, 0);
    }
  }
  const idle = kn.idleView();
  assert.equal(idle.phase, 'bet');
  assert.equal(idle.can.draw, false);
});

test('the multiplier in the view is read back out of the payout', () => {
  // A screen that prints a multiplier the payout does not support is the bug this closes, so the
  // view divides rather than copies
  for (const k of [2, 3, 4, 5]) {
    for (let h = 0; h <= k; h++) {
      const done = draw(deal(13, seedForHit(first(k), h, 'back')), first(k));
      const v = kn.view(done);
      assert.equal(v.mult, done.pay / 13);
      assert.equal(v.mult, kn.TABLES[k][h], k + '-spot at ' + h);
      assert.ok(Number.isSafeInteger(v.mult));
      assert.equal(v.pay, 13 * v.mult);
      assert.equal(v.net, v.pay - 13);
    }
  }
});

test('the view is JSON and the tables it hands over are frozen', () => {
  const v = kn.view(draw(deal(), first(3)));
  assert.deepEqual(JSON.parse(JSON.stringify(v)), JSON.parse(JSON.stringify(v)));
  assert.ok(Object.isFrozen(v.tables));
  assert.ok(Object.isFrozen(v.tables[0]));
  assert.ok(Object.isFrozen(v.tables[0].rows));
  assert.throws(() => { v.tables[0].rows[0].mult = 999; }, TypeError);
  assert.throws(() => { kn.TABLES[3][3] = 999; }, TypeError);
});

test('the engine knows nothing but cards.js', () => {
  // Pure: no vscode, no ledger. The one import is the shared seeded source, and what it uses from
  // it is a SHUFFLE, not a roll stream: cards.js's rule is that a seed is one or the other
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'keno.js'), 'utf8');
  const requires = src.match(/require\(([^)]*)\)/g) || [];
  assert.deepEqual(requires, ["require('./cards')"]);
  assert.ok(src.indexOf('C.shuffle(') > 0, 'the draw should shuffle the board');
  assert.equal(src.indexOf('rollsFrom'), -1, 'a draw must not also roll from the same seed');
  assert.equal(typeof C.shuffle, 'function');
  assert.equal(kn.MIN_BET, 10);
  assert.deepEqual(kn.OPS, ['draw']);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
