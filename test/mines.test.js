// The minefield: the ladder, the layout, the moves, what the view keeps back, and the house's cut.
// No dependencies: node's assert only. Run: node test/mines.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const m = require(path.join(__dirname, '..', 'mines.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const CELLS = m.CELLS;
const COUNTS = m.MINE_COUNTS;
const BET = m.MIN_BET;

const snapshot = (st) => JSON.stringify(st);
const dig = (st, cell) => m.act(st, { op: 'dig', cell: cell });
const cash = (st) => m.act(st, 'cashout');
const pct = (x) => (x * 100).toFixed(2) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');

function round(over) {
  return m.newRound(Object.assign({ seed: 'seed-0', id: 'round-0', bet: BET, mines: 5 }, over));
}

// C(n, k), written again here so the ladder is checked against arithmetic this file did itself
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

// P(k digs in a row are all safe) on a board with this many mines: hypergeometric, exact
function survive(mines, k) {
  return comb(CELLS - mines, k) / comb(CELLS, k);
}

// The first seed (from a fixed list) whose layout satisfies `ok`. The host makes a fresh seed per
// round and keeps it, so this is how a test picks a board: the same way the card tests search a
// seed for a deal
function seedWhere(mines, ok, tag) {
  for (let i = 0; i < 20000; i++) {
    const seed = (tag || 'pin') + '-' + mines + '-' + i;
    const st = round({ seed, mines });
    if (ok(st.layout, st)) return seed;
  }
  throw new Error('no seed lays out a board like that');
}

// A seed whose board has no mine under any of `cells`, so a test can dig them in order
function clearSeed(mines, cells, tag) {
  return seedWhere(mines, (layout) => cells.every((c) => !layout[c]), tag || 'clear');
}

// Digs `cells` in order and asserts every one of them was safe
function walk(st, cells) {
  for (const cell of cells) {
    const before = st.dug.length;
    st = dig(st, cell);
    assert.equal(st.dug.length, before + 1, 'cell ' + cell + ' was mined');
  }
  return st;
}

// --- the ladder ---------------------------------------------------------------------------

test('the ladder is 0.97 / P(k safe digs), as whole numbers', () => {
  for (const mines of COUNTS) {
    const rows = m.LADDERS[mines];
    assert.equal(rows.length, CELLS - mines + 1, mines + ' mines');
    for (const r of rows) {
      // the rung against the hypergeometric worked out here, as a ratio rather than a float compare
      assert.equal(r.num * comb(CELLS - mines, r.k) * m.EDGE_DEN, r.den * comb(CELLS, r.k) * m.EDGE_NUM,
        mines + ' mines, k=' + r.k + ': ' + r.num + '/' + r.den);
      assert.ok(Number.isSafeInteger(r.num) && Number.isSafeInteger(r.den), 'k=' + r.k + ' is not whole');
    }
    // the opening rung is the house's cut and nothing else, which is what makes a cash-out before
    // the first dig a refusal rather than a move that gives up 3% for free
    assert.equal(rows[0].num, m.EDGE_NUM);
    assert.equal(rows[0].den, m.EDGE_DEN);
  }
});

test('the ladder climbs, and every rung pays above the bet', () => {
  for (const mines of COUNTS) {
    const rows = m.LADDERS[mines];
    for (let k = 1; k < rows.length; k++) {
      assert.ok(rows[k].num > rows[k].den, mines + ' mines, k=' + k + ' does not pay above the bet');
      assert.ok(rows[k].num * rows[k - 1].den > rows[k - 1].num * rows[k].den, mines + ' mines: flat at k=' + k);
    }
    // more mines is a steeper ladder at every rung the two boards share
    if (mines !== COUNTS[0]) {
      const easier = m.LADDERS[COUNTS[0]];
      for (let k = 1; k < rows.length; k++) {
        assert.ok(rows[k].num * easier[k].den > easier[k].num * rows[k].den, 'k=' + k + ' is no steeper with ' + mines + ' mines');
      }
    }
  }
});

test('the ladder is frozen, so nothing that is handed it can retune the game', () => {
  const was = JSON.stringify(m.LADDERS);
  try { m.LADDERS[3][1].num = 1; } catch (e) { /* strict mode throws, sloppy mode ignores */ }
  try { m.LADDERS[3].push({ k: 99 }); } catch (e) { /* frozen array */ }
  assert.equal(JSON.stringify(m.LADDERS), was);
});

// --- the money ----------------------------------------------------------------------------

test('a payout is one floor of the rung, and the shown multiplier is read back out of it', () => {
  const BETS = [m.MIN_BET, 100, 137, 1000, 99999, m.MAX_BET];
  for (const mines of COUNTS) {
    for (let k = 1; k <= CELLS - mines; k++) {
      const r = m.rungOf(mines, k);
      for (const bet of BETS) {
        const payout = m.payoutAt(bet, mines, k);
        assert.ok(Number.isSafeInteger(payout), 'bet ' + bet + ', k=' + k + ' pays ' + payout);
        // the floor, as an integer identity: payout <= bet * num / den < payout + 1
        assert.ok(payout * r.den <= bet * r.num, 'bet ' + bet + ', k=' + k + ' pays above the rung');
        assert.ok((payout + 1) * r.den > bet * r.num, 'bet ' + bet + ', k=' + k + ' pays below the floor');
        // and the multiplier the screen prints never promises a credit the payout does not carry
        const shown = m.mult100Of(bet, payout);
        assert.ok(bet * shown <= 100 * payout, 'bet ' + bet + ', k=' + k + ' shows ' + shown + ' for ' + payout);
        assert.ok(bet * (shown + 1) > 100 * payout, 'bet ' + bet + ', k=' + k + ' shows less than it pays');
      }
    }
  }
});

test('the bet is a whole number inside the house limits, and the mine count is one of three', () => {
  for (const bad of [0, -1, 9, m.MIN_BET - 1, 10.5, NaN, Infinity, '100', null, m.MAX_BET + 1]) {
    assert.throws(() => round({ bet: bad }), RangeError, 'bet ' + bad + ' was taken');
  }
  for (const bad of [0, 1, 4, 11, 25, '5', null]) {
    if (bad === null) continue; // null means "use the default"
    assert.throws(() => round({ mines: bad }), RangeError, 'mines ' + bad + ' was taken');
  }
  assert.equal(round({ mines: null }).mines, m.DEFAULT_MINES);
  for (const mines of COUNTS) assert.equal(round({ mines }).mines, mines);
});

// --- the layout ---------------------------------------------------------------------------

test('a board holds exactly the mines it was dealt, and every cell is equally likely to hold one', () => {
  const N = 20000;
  for (const mines of COUNTS) {
    const seen = new Array(CELLS).fill(0);
    for (let i = 0; i < N; i++) {
      const st = round({ seed: 'layout-' + mines + '-' + i, mines });
      let count = 0;
      for (let cell = 0; cell < CELLS; cell++) if (st.layout[cell]) { count += 1; seen[cell] += 1; }
      assert.equal(count, mines, 'seed ' + i + ' buried ' + count + ' mines');
    }
    // a uniform shuffle puts a mine under every cell mines/25 of the time. 4 SE of the frequency
    const p = mines / CELLS;
    const se = Math.sqrt(p * (1 - p) / N);
    let worst = 0;
    for (let cell = 0; cell < CELLS; cell++) {
      const off = Math.abs(seen[cell] / N - p) / se;
      if (off > worst) worst = off;
      assert.ok(off < 4, mines + ' mines: cell ' + cell + ' was mined ' + pct(seen[cell] / N) + ' of the time');
    }
    console.log('  ' + mines + ' mines over ' + num(N) + ' boards: furthest cell ' + worst.toFixed(1) + ' SE off ' + pct(p));
  }
});

test('a stacked board is the board, so a test can place the mines itself', () => {
  const st = round({ stack: [0, 7, 24], mines: 3 });
  assert.deepEqual(st.layout.map((x, i) => (x ? i : null)).filter((x) => x != null), [0, 7, 24]);
  assert.equal(dig(st, 0).ended, 'boom');
  assert.equal(dig(st, 1).ended, null);
  for (const bad of [-1, 25, 1.5, '3']) assert.throws(() => round({ stack: [bad] }), RangeError);
});

// --- the moves ----------------------------------------------------------------------------

test('a safe dig climbs the ladder and act never mutates its input', () => {
  const seed = clearSeed(5, [0, 1, 2, 3]);
  let st = round({ seed, mines: 5 });
  for (let k = 1; k <= 4; k++) {
    const was = snapshot(st);
    const next = dig(st, k - 1);
    assert.equal(snapshot(st), was, 'the dig moved the round it was given');
    assert.notEqual(next, st);
    assert.equal(next.dug.length, k);
    assert.equal(next.phase, 'play');
    assert.equal(next.net, null, 'nothing settles until the round ends');
    assert.equal(m.view(next, 0).cash, m.payoutAt(BET, 5, k));
    st = next;
  }
});

test('a mine ends the round, the bet is lost, and the whole board comes out', () => {
  const st = round({ stack: [12], mines: 3 });
  const hit = dig(st, 12);
  assert.equal(hit.phase, 'done');
  assert.equal(hit.ended, 'boom');
  assert.equal(hit.payout, 0);
  assert.equal(hit.net, -BET);
  const v = m.view(hit, 0);
  assert.equal(v.grid[12], 'boom');
  assert.equal(v.grid.filter((x) => x === 'mine').length, 0, 'the other two mines were not placed by the stack');
  assert.equal(v.cash, null, 'a settled round offers nothing');
  assert.equal(v.mult100, 0, 'a lost round paid nothing');
  assert.deepEqual(v.can, { dig: false, cashout: false });
});

test('a cash-out pays the rung the digging reached, and needs one dig first', () => {
  const seed = clearSeed(10, [5, 6]);
  let st = round({ seed, mines: 10 });
  assert.equal(m.whyNot(st, 'cashout'), 'dig a cell first');
  assert.equal(cash(st), st, 'the refusal handed back a different object');
  st = walk(st, [5, 6]);
  const out = cash(st);
  assert.equal(out.ended, 'cashout');
  assert.equal(out.payout, m.payoutAt(BET, 10, 2));
  assert.equal(out.net, out.payout - BET);
  assert.equal(m.view(out, 0).mult100, m.mult100Of(BET, out.payout));
});

test('clearing the board settles by itself at the top of the ladder', () => {
  // a 10-mine board has 15 safe cells, and the stack puts the mines where they are known
  const mined = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  let st = round({ stack: mined, mines: 10 });
  for (let cell = 10; cell < CELLS; cell++) st = dig(st, cell);
  assert.equal(st.phase, 'done');
  assert.equal(st.ended, 'cleared');
  assert.equal(st.payout, m.payoutAt(BET, 10, 15));
  assert.equal(st.dug.length, 15);
  const v = m.view(st, 0);
  assert.equal(v.next, null, 'there is no next cell on a cleared board');
  assert.equal(v.grid.filter((x) => x === 'mine').length, 10);
  assert.equal(v.grid.filter((x) => x === 'free').length, 0);
});

test('every refused move hands back the very same object, with a reason', () => {
  const seed = clearSeed(3, [0]);
  const st = walk(round({ seed, mines: 3 }), [0]);
  const bad = [
    [{ op: 'dig', cell: 0 }, 'that cell is already dug'],
    [{ op: 'dig', cell: -1 }, 'pick a cell on the board'],
    [{ op: 'dig', cell: CELLS }, 'pick a cell on the board'],
    [{ op: 'dig', cell: 1.5 }, 'pick a cell on the board'],
    [{ op: 'dig' }, 'pick a cell on the board'],
    ['dig', 'pick a cell on the board'],
    ['hit', 'unknown action'],
    [null, 'unknown action'],
    [{ op: 'cash' }, 'unknown action']
  ];
  for (const [op, why] of bad) {
    assert.equal(m.whyNot(st, op, 0), why, JSON.stringify(op));
    assert.equal(m.act(st, op), st, JSON.stringify(op) + ' changed the round');
  }
  // and nothing at all is allowed once the round is over
  const done = cash(st);
  for (const op of [{ op: 'dig', cell: 1 }, 'cashout']) {
    assert.equal(m.whyNot(done, op, 0), 'the round is over');
    assert.equal(m.act(done, op), done);
  }
  assert.equal(m.whyNot(null, 'cashout', 0), 'the round is over');
});

test('the same seed and the same digs give the same round', () => {
  const run = () => {
    let st = round({ seed: 'replay', mines: 5 });
    for (let cell = 0; cell < CELLS && st.phase === 'play'; cell++) st = dig(st, cell);
    return st;
  };
  assert.equal(snapshot(run()), snapshot(run()));
});

// --- what the view keeps back ---------------------------------------------------------------

// The strongest form of "the layout is not in there": two rounds with DIFFERENT boards that have
// been dug in the same places hand the webview the same bytes. If any clue about an untouched cell
// were in the view, these two could not match
test('a live view cannot tell two different boards apart', () => {
  const cells = [0, 1, 2];
  const seeds = [];
  for (let i = 0; i < 20000 && seeds.length < 2; i++) {
    const seed = 'twin-' + i;
    const st = round({ seed, mines: 5 });
    if (!cells.every((c) => !st.layout[c])) continue;
    const key = st.layout.join('');
    if (seeds.every((s) => s.key !== key)) seeds.push({ seed, key });
  }
  assert.equal(seeds.length, 2, 'could not find two different boards clear on the same three cells');
  const views = seeds.map((s) => {
    let st = walk(round({ seed: s.seed, mines: 5 }), cells);
    return JSON.stringify(m.view(st, 5000));
  });
  assert.equal(views[0], views[1], 'the view told the two boards apart');
  // and the two states themselves are NOT the same, so the match above is the view's doing
  assert.notEqual(seeds[0].key, seeds[1].key);
});

test('the seed appears only once the round is done', () => {
  const seed = clearSeed(3, [0, 1]);
  let st = round({ seed, mines: 3 });
  assert.equal('seed' in m.view(st, 0), false);
  st = walk(st, [0]);
  assert.equal('seed' in m.view(st, 0), false);
  const out = cash(st);
  assert.equal(m.view(out, 0).seed, seed);
  // the seed and the round id are different values: the id travels in every message, the seed is
  // the board itself
  assert.notEqual(out.id, out.seed);
});

test('a live grid says nothing but what has been dug, and a settled one says everything', () => {
  const st = walk(round({ stack: [20, 21, 22], mines: 3, seed: 'grid' }), [0, 1]);
  const live = m.view(st, 0);
  assert.deepEqual(live.grid.slice(0, 2), ['safe', 'safe']);
  assert.equal(live.grid.slice(2).every((x) => x === null), true, 'an undug cell was described');
  assert.equal(live.left, CELLS - 2);
  assert.deepEqual(live.next.chance, { num: 22 - 2, den: CELLS - 2 });
  const out = m.view(cash(st), 0);
  assert.equal(out.grid.filter((x) => x === 'mine').length, 3);
  assert.equal(out.grid.filter((x) => x === 'safe').length, 2);
  assert.equal(out.grid.filter((x) => x === 'free').length, CELLS - 5);
});

test('the view hands the screen every figure it needs, and the idle one is the same shape', () => {
  const seed = clearSeed(5, [0]);
  const st = walk(round({ seed, mines: 5 }), [0]);
  const v = m.view(st, 9999);
  const idle = m.idleView();
  // the same keys either way, so the screen never reads an undefined
  assert.deepEqual(Object.keys(v).sort(), Object.keys(idle).sort());
  assert.deepEqual(m.view(null, 0), idle);
  // the ladder is priced for this bet, rung by rung, so the screen holds no arithmetic
  assert.equal(v.ladder.length, CELLS - 5);
  for (const row of v.ladder) {
    assert.equal(row.payout, m.payoutAt(BET, 5, row.k));
    assert.equal(row.mult100, m.mult100Of(BET, row.payout));
  }
  assert.equal(v.next.payout, m.payoutAt(BET, 5, 2));
  assert.equal(v.cash, m.payoutAt(BET, 5, 1));
  // the fair column is the board's geometry, for the screen to show before a bet is placed
  for (const mines of COUNTS) {
    assert.equal(idle.fair[mines].length, CELLS - mines);
    const r = m.rungOf(mines, 1);
    assert.equal(idle.fair[mines][0], Math.floor(100 * r.num / r.den));
  }
});

test('a live round stakes its bet and a settled one stakes nothing', () => {
  const seed = clearSeed(3, [0]);
  const st = round({ seed, mines: 3 });
  assert.equal(m.stake(st), BET);
  assert.equal(m.stake(walk(st, [0])), BET, 'the climbing payout is the house money, the bet is the stake');
  assert.equal(m.stake(cash(walk(st, [0]))), 0);
  assert.equal(m.stake(null), 0);
});

// --- the house's cut, enumerated ------------------------------------------------------------
// Every way to play this game is "choose a mine count, stop after k safe cells", and there are 57 of
// them in all, so nothing here is sampled. The return of one of them is
//    P(k safe) * payout / bet
// and because the rung IS 0.97 / P(k safe), that comes out as
//    0.97 * floor(bet * mult) / (bet * mult)
// The flooring is the whole of the gap, which is why the minimum bet is where it is: see the second
// table below.

function rtpOf(mines, k, bet) {
  const r = m.rungOf(mines, k);
  const payout = m.payoutAt(bet, mines, k);
  // P(k safe) = 0.97 / mult = 97 * den / (100 * num), so the return is this ratio of whole numbers
  return (m.EDGE_NUM * r.den * payout) / (m.EDGE_DEN * r.num * bet);
}

test('the table: every "' + COUNTS.join('/') + ' mines, stop at k" returns 96-97%', () => {
  console.log('      ' + COUNTS.map((n) => (n + ' mines').padStart(22)).join(''));
  console.log('    k' + COUNTS.map(() => 'multiplier'.padStart(13) + 'return'.padStart(9)).join(''));
  let worst = null, best = null, n = 0;
  for (let k = 1; k <= CELLS - COUNTS[0]; k++) {
    let line = '  ' + String(k).padStart(3);
    for (const mines of COUNTS) {
      if (k > CELLS - mines) { line += ''.padStart(22); continue; }
      const r = m.rungOf(mines, k);
      const rtp = rtpOf(mines, k, BET);
      n += 1;
      if (!worst || rtp < worst.rtp) worst = { rtp, mines, k };
      if (!best || rtp > best.rtp) best = { rtp, mines, k };
      line += ((r.num / r.den).toFixed(2) + 'x').padStart(13) + pct(rtp).padStart(9);
      // never above the cut, as an integer identity: payout <= bet * num / den is the floor itself
      assert.ok(m.payoutAt(BET, mines, k) * r.den <= BET * r.num, mines + ' mines, k=' + k + ' pays above fair');
      assert.ok(rtp <= m.EDGE_NUM / m.EDGE_DEN, mines + ' mines, k=' + k + ' returns ' + pct(rtp));
      assert.ok(rtp > 0.96, mines + ' mines, k=' + k + ' returns ' + pct(rtp));
    }
    console.log(line);
  }
  console.log('  ' + n + ' ways to play, at the minimum bet of ' + num(BET));
  console.log('  worst  ' + worst.mines + ' mines, stop at ' + worst.k + ': ' + pct(worst.rtp));
  console.log('  best   ' + best.mines + ' mines, stop at ' + best.k + ': ' + pct(best.rtp));
});

test('the minimum bet of ' + m.MIN_BET + ' is what keeps the band, and 10 would not', () => {
  // The gap is one floored credit over the money riding, so it shrinks as the bet grows. This is the
  // measurement that chose MIN_BET, printed rather than remembered
  console.log('       bet     worst return    where');
  for (const bet of [10, 20, 50, 100, 200, 1000, 10000]) {
    if (bet < 10) continue;
    let worst = null;
    for (const mines of COUNTS) {
      for (let k = 1; k <= CELLS - mines; k++) {
        // payoutAt does not care about MIN_BET, so a bet below it can still be priced here
        const r = m.rungOf(mines, k);
        const payout = m.floorDiv(bet * r.num, r.den);
        const rtp = (m.EDGE_NUM * r.den * payout) / (m.EDGE_DEN * r.num * bet);
        if (!worst || rtp < worst.rtp) worst = { rtp, mines, k };
      }
    }
    console.log('  ' + num(bet).padStart(8) + pct(worst.rtp).padStart(17)
      + ('   ' + worst.mines + ' mines, stop at ' + worst.k).padStart(24)
      + (bet === m.MIN_BET ? '   <- MIN_BET' : ''));
    if (bet >= m.MIN_BET) assert.ok(worst.rtp > 0.96, 'bet ' + bet + ' drops to ' + pct(worst.rtp));
    if (bet === 10) assert.ok(worst.rtp < 0.96, 'a 10-credit bet is in the band after all, so MIN_BET could come down');
  }
});

test('and no bet the engine takes falls out of the band, whichever board it is on', () => {
  let worst = null;
  for (let bet = m.MIN_BET; bet <= 2000; bet++) {
    for (const mines of COUNTS) {
      for (let k = 1; k <= CELLS - mines; k++) {
        const rtp = rtpOf(mines, k, bet);
        if (!worst || rtp < worst.rtp) worst = { rtp, bet, mines, k };
      }
    }
  }
  // the gap is widest at the smallest bets, so a scan from MIN_BET up is where the floor of the band
  // lives. The far end is checked at MAX_BET, where one credit is noise
  console.log('  bets ' + num(m.MIN_BET) + '..2,000: worst ' + pct(worst.rtp)
    + ' (bet ' + num(worst.bet) + ', ' + worst.mines + ' mines, stop at ' + worst.k + ')');
  assert.ok(worst.rtp > 0.96, 'the worst bet returns ' + pct(worst.rtp));
  for (const mines of COUNTS) {
    for (let k = 1; k <= CELLS - mines; k++) {
      const far = rtpOf(mines, k, m.MAX_BET);
      assert.ok(far > 0.9699 && far <= 0.97, 'at the house limit ' + mines + '/' + k + ' returns ' + pct(far));
    }
  }
});

// --- Monte Carlo ----------------------------------------------------------------------------
// The enumeration above believes one thing it cannot check: that the engine's own boards really are
// uniform M-subsets, which is what makes P(k safe) hypergeometric. That is what this measures, by
// digging real rounds through act().
//
// The sample size is read off the precision wanted rather than picked. One round is a Bernoulli
// draw, so the standard error of the measured P is sqrt(p(1-p)/N), and N = p(1-p)/SE^2. At SE 0.2%
// the thinnest of these needs 62,500 boards, which is a second of work, and 4 SE is then a tenth of
// the house's cut.
test('Monte Carlo: real boards survive at the rate the ladder is priced off', () => {
  const SE = 0.002;
  const t0 = Date.now();
  const cells = [0, 1, 2, 3, 4, 5];
  console.log('       mines   k      P(k safe)       measured    off      boards');
  let total = 0;
  for (const mines of COUNTS) {
    const want = survive(mines, 1);
    const N = Math.ceil(Math.max(want * (1 - want), 0.25) / (SE * SE));
    const lived = new Array(cells.length + 1).fill(0);
    for (let i = 0; i < N; i++) {
      let st = m.newRound({ seed: 'mc-' + mines + '-' + i, id: 'mc', bet: BET, mines });
      let k = 0;
      for (const cell of cells) {
        st = m.act(st, { op: 'dig', cell });
        if (st.ended === 'boom') break;
        k += 1;
      }
      for (let j = 0; j <= k; j++) lived[j] += 1;
      total += 1;
    }
    for (let k = 1; k <= cells.length; k++) {
      const p = survive(mines, k);
      const got = lived[k] / N;
      const se = Math.sqrt(p * (1 - p) / N);
      const off = Math.abs(got - p) / se;
      console.log('  ' + String(mines).padStart(8) + String(k).padStart(4)
        + pct(p).padStart(15) + pct(got).padStart(15) + (off.toFixed(1) + ' SE').padStart(9) + num(N).padStart(12));
      assert.ok(off < 4, mines + ' mines, k=' + k + ': ' + pct(got) + ' against ' + pct(p));
    }
  }
  console.log('  ' + num(total) + ' boards in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
});

test('the layout comes off the shared shuffle, not a second copy of one', () => {
  // cards.js owns the repo's one Fisher-Yates on purpose. This is the check that the board really is
  // that shuffle: the first `mines` cells of C.shuffle on the round's own seed
  for (let i = 0; i < 200; i++) {
    const seed = 'shuffle-' + i;
    const cells = [];
    for (let c = 0; c < CELLS; c++) cells.push(c);
    const order = C.shuffle(cells, seed);
    for (const mines of COUNTS) {
      const st = m.newRound({ seed, id: 'x', bet: BET, mines });
      const want = new Array(CELLS).fill(false);
      for (let j = 0; j < mines; j++) want[order[j]] = true;
      assert.deepEqual(st.layout, want, 'seed ' + seed + ', ' + mines + ' mines');
    }
  }
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
