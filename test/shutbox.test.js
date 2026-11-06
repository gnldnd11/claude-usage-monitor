// Shut the box: the table, the board solved exactly over all 512 ways it can stand, and what the
// house keeps. No dependencies: node's assert only. Run: node test/shutbox.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const sx = require(path.join(__dirname, '..', 'shutbox.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const ALL = sx.ALL;
const V = (st) => sx.view(st);
const snapshot = (st) => JSON.stringify(st);
const deal = (opts) => sx.newRound(Object.assign({ seed: 'x', bet: 100 }, opts));
// A round pinned to a list of throws, which is how a test chooses what comes up
const run = (throws, amount) => sx.newRound({ seed: 'pinned', bet: amount == null ? 100 : amount, stack: throws });
const close = (st, tiles) => sx.act(st, { op: 'close', tiles });

const BETS = [100, 101, 103, 107, 110, 150, 199, 200, 300, 999, 1000, 1001, 10000];
const pct = (x) => (x * 100).toFixed(4) + '%';

// --- the test's own solver ----------------------------------------------------------------------
//
// Written here as well as in the engine, with its own subset walk, so the engine's figure is
// derived twice rather than asserted once. Same arithmetic: whole numbers over 36^9, which is what
// makes the division by 36 exact (a board that can still be rolled from has a tile open, so it is
// at most eight moves in and every term carries a factor of 36 to spare).
//
// Backward induction over the boards in order of how much is open: a move closes a tile, so a
// board's value only ever depends on boards with less on them

const SUM = new Array(ALL + 1).fill(0);
for (let m = 1; m <= ALL; m++) {
  for (let i = 0; i < sx.TILES; i++) if (m & (1 << i)) SUM[m] += i + 1;
}
const WAYS = new Array(13).fill(0);
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) WAYS[a + b] += 1;

function subsFor(mask, roll) {
  const out = [];
  for (let sub = mask; sub > 0; sub = (sub - 1) & mask) if (SUM[sub] === roll) out.push(sub);
  return out;
}

// pay(rem) -> BigInt. Returns every board's value and the move the best play makes
function solve(pay) {
  const den = 36n ** BigInt(sx.TILES);
  const order = [];
  for (let m = 0; m <= ALL; m++) order.push(m);
  order.sort((a, b) => SUM[a] - SUM[b]);
  const value = new Array(ALL + 1);
  const pick = new Array(ALL + 1);
  for (const mask of order) {
    if (mask === 0) { value[0] = pay(0) * den; continue; }
    let acc = 0n;
    const chosen = new Array(13).fill(-1);
    for (let roll = 2; roll <= 12; roll++) {
      const subs = subsFor(mask, roll);
      let best = subs.length ? null : pay(SUM[mask]) * den;
      for (const sub of subs) {
        const v = value[mask & ~sub];
        if (best === null || v > best) { best = v; chosen[roll] = sub; }
      }
      acc += BigInt(WAYS[roll]) * best;
    }
    assert.equal(acc % 36n, 0n, 'the board at ' + mask + ' did not divide');
    value[mask] = acc / 36n;
    pick[mask] = chosen;
  }
  return { value, pick, den };
}

// Where a play ends up, as exact chances over the same denominator: `dist[rem]` is how often the
// round ends with that much still open
function spread(pick) {
  const den = 36n ** BigInt(sx.TILES);
  const reach = new Array(ALL + 1).fill(0n);
  const dist = new Array(sx.FULL + 1).fill(0n);
  reach[ALL] = den;
  const order = [];
  for (let m = 0; m <= ALL; m++) order.push(m);
  order.sort((a, b) => SUM[b] - SUM[a]);
  for (const mask of order) {
    if (reach[mask] === 0n) continue;
    if (mask === 0) { dist[0] += reach[mask]; continue; }
    for (let roll = 2; roll <= 12; roll++) {
      const q = (reach[mask] * BigInt(WAYS[roll])) / 36n;
      const sub = pick[mask][roll];
      if (sub < 0) dist[SUM[mask]] += q;
      else reach[mask & ~sub] += q;
    }
  }
  return { dist, den };
}

const TABLE = (rem) => { const r = sx.rowFor(rem); return BigInt(r ? r.mult100 : 0); };

// A copy of the engine with one line of its table broken, so the check it runs when it loads can be
// watched doing its job. A check that only ever passes is not a check
function loadBroken(from, to) {
  const file = path.join(__dirname, '..', 'shutbox.js');
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(from, to);
  assert.notEqual(out, src, 'the sabotage did not apply: ' + from);
  const mod = { exports: {} };
  const dir = path.dirname(file);
  new Function('require', 'module', 'exports', '__dirname', out)(
    (id) => require(id.charAt(0) === '.' ? path.join(dir, id) : id), mod, mod.exports, dir);
  return mod.exports;
}

// --- the table ----------------------------------------------------------------------------------

test('three rows, and they meet without a gap', () => {
  assert.equal(sx.TILES, 9);
  assert.equal(sx.FULL, 45);
  assert.equal(sx.DICE, 2);
  assert.equal(sx.MAX_ROLLS, 9);
  assert.deepEqual(sx.PAYS.map((r) => [r.lo, r.hi, r.mult100]), [[0, 0, 440], [1, 4, 250], [5, 9, 120]]);
  for (let i = 1; i < sx.PAYS.length; i++) {
    assert.equal(sx.PAYS[i].lo, sx.PAYS[i - 1].hi + 1, 'a gap before ' + sx.PAYS[i].name);
    assert.ok(sx.PAYS[i].mult100 < sx.PAYS[i - 1].mult100, sx.PAYS[i].name + ' pays as much as the row above');
  }
  // every remaining total lands on exactly one row, or on none at all
  for (let rem = 0; rem <= sx.FULL; rem++) {
    const hits = sx.PAYS.filter((r) => rem >= r.lo && rem <= r.hi);
    assert.ok(hits.length <= 1, rem + ' is on ' + hits.length + ' rows');
    assert.equal(sx.rowFor(rem), hits[0] || null, 'row for ' + rem);
    if (rem > 9) assert.equal(sx.rowFor(rem), null, rem + ' should pay nothing');
  }
  // a paid row always beats the bet, at every bet the game takes
  for (const amount of BETS) {
    for (const row of sx.PAYS) assert.ok(sx.payoutOf(amount, row.mult100) > amount, row.name + ' at ' + amount);
  }
  assert.throws(() => { sx.PAYS[0].mult100 = 1; }, TypeError);
  assert.throws(() => { sx.PAYS.push({}); }, TypeError);
});

test('the board: every total two dice can make comes down off a full board', () => {
  for (let roll = 2; roll <= 12; roll++) {
    assert.ok(sx.hasMove(ALL, roll), 'a full board cannot make ' + roll);
    const moves = sx.movesFor(ALL, roll);
    assert.ok(moves.length > 0);
    // the host's rulings and nothing else: every move adds up to the roll, out of open tiles
    for (const m of moves) {
      assert.equal(m.reduce((n, t) => n + t, 0), roll, m.join('+'));
      assert.equal(new Set(m).size, m.length, 'a tile twice in ' + m.join('+'));
    }
    // the single tile first, so the screen lists the obvious move at the top
    if (roll <= 9) assert.deepEqual(moves[0], [roll]);
  }
  assert.deepEqual(sx.movesFor(ALL, 9), [[9], [1, 8], [2, 7], [3, 6], [4, 5], [1, 2, 6], [1, 3, 5], [2, 3, 4]]);
  // and a board that cannot make a roll says so rather than offering nothing
  const two = sx.maskOfTiles([8, 9]);
  assert.deepEqual(sx.movesFor(two, 5), []);
  assert.equal(sx.hasMove(two, 5), false);
  assert.deepEqual(sx.movesFor(two, 9), [[9]]);
  assert.deepEqual(sx.movesFor(two, 8), [[8]]);
  // 8 and 9 add up to 17, which is not a total two dice can throw, so it is not a move either
  assert.deepEqual(sx.movesFor(two, 17), []);
  assert.equal(sx.movesFor(ALL, 13).length, 0, 'two dice cannot make 13');
  assert.equal(sx.sumOfMask(ALL), 45);
  assert.deepEqual(sx.tilesOfMask(sx.maskOfTiles([1, 5, 9])), [1, 5, 9]);
});

// --- the return ---------------------------------------------------------------------------------

test('all 512 boards solved exactly: the best play returns 96.80% and shuts the box 7.1% of the time', () => {
  const mine = solve(TABLE);
  assert.equal(mine.value[ALL], sx.SOLVED.value, 'two solves of one board disagree');
  assert.equal(mine.den, sx.SOLVED.den);
  const rtp = Number(sx.SOLVED.value) / 100 / Number(sx.SOLVED.den);
  const sp = spread(mine.pick);
  const share = (rem) => Number(sp.dist[rem]) / Number(sp.den);
  // the table, row by row, with how often each one lands and how much of the return it carries
  console.log('  row'.padEnd(18) + 'pays'.padStart(8) + 'lands'.padStart(11) + 'of the return'.padStart(15));
  let paid = 0, carried = 0;
  for (const row of sx.PAYS) {
    let p = 0;
    for (let rem = row.lo; rem <= row.hi; rem++) p += share(rem);
    paid += p;
    const part = p * row.mult100 / 100 / rtp;
    carried += part;
    console.log('  ' + row.name.padEnd(16) + ('x' + (row.mult100 / 100).toFixed(2)).padStart(8)
      + pct(p).padStart(11) + pct(part).padStart(15));
    // no row carries the return: the jackpot is a third of it and so is each of the others
    assert.ok(part < 0.4, row.name + ' carries ' + pct(part));
  }
  console.log('  something pays in ' + pct(paid) + ' of rounds, and the best play returns ' + pct(rtp));
  assert.ok(Math.abs(carried - 1) < 1e-9, 'the rows carry ' + pct(carried) + ' of the return');
  assert.ok(paid > 0.4, 'only ' + pct(paid) + ' of rounds pay anything');
  // the two figures the load check is built on
  assert.equal(sx.SOLVED.paid, sp.dist.reduce((n, q, rem) => (sx.rowFor(rem) ? n + q : n), 0n));
  assert.ok(rtp > 0.96 && rtp < 0.97, 'the best play returns ' + pct(rtp));
  // priced as integers, which is the band itself rather than a rounding of it
  assert.ok(sx.SOLVED.value <= BigInt(sx.BAND_HI) * sx.SOLVED.den);
  // and shutting the box is a 1 in 14 event, which is what makes it a jackpot rather than a legend
  const shut = share(0);
  console.log('  the box shuts once in ' + (1 / shut).toFixed(1) + ' rounds');
  assert.ok(shut > 0.07 && shut < 0.072, 'the box shuts ' + pct(shut) + ' of the time');
});

test('the solve is optimal at every board and every roll, so no play returns more', () => {
  // A backward induction is the greatest return any play can reach BY CONSTRUCTION, and this is
  // that construction checked rather than trusted: at every one of the 512 boards and every one of
  // the 11 rolls, the move the solve picked is worth at least as much as every other legal move.
  // Any play at all is a choice of one of those moves at each board, so by induction up the ladder
  // no play can be worth more than this one
  const mine = solve(TABLE);
  let states = 0, choices = 0, forks = 0;
  for (let mask = 1; mask <= ALL; mask++) {
    for (let roll = 2; roll <= 12; roll++) {
      const subs = subsFor(mask, roll);
      if (!subs.length) continue;
      states += 1;
      choices += subs.length;
      if (subs.length > 1) forks += 1;
      const taken = mine.pick[mask][roll];
      assert.ok(taken > 0, 'no move was picked at ' + mask + ' on ' + roll);
      for (const sub of subs) {
        assert.ok(mine.value[mask & ~sub] <= mine.value[mask & ~taken],
          'a better move than the one picked at board ' + mask + ' on a roll of ' + roll);
      }
    }
  }
  console.log('  ' + states.toLocaleString('en-US') + ' playable states, ' + choices.toLocaleString('en-US')
    + ' legal moves, ' + forks.toLocaleString('en-US') + ' of them a real choice');
  assert.ok(forks > 1000, 'only ' + forks + ' states offer a choice at all');
});

test('the plays a person would actually make all land under the best play', () => {
  // Not a proof (the check above is), but the figures that say the choice is worth something: the
  // obvious plays give up between one and seven points of return
  const plans = [
    { name: 'the single tile when there is one', pickOf: (ms) => ms[0] },
    { name: 'the most tiles it can', pickOf: (ms) => ms[ms.length - 1] },
    { name: 'the lowest tiles it can', pickOf: (ms) => ms.slice().sort((a, b) => a[0] - b[0])[0] },
    { name: 'the highest tile it can', pickOf: (ms) => ms.slice().sort((a, b) => b[b.length - 1] - a[a.length - 1])[0] }
  ];
  const best = Number(sx.SOLVED.value) / 100 / Number(sx.SOLVED.den);
  const N = 40000;
  for (const plan of plans) {
    let paid = 0;
    for (let i = 0; i < N; i++) {
      let st = sx.newRound({ seed: 'plan-' + i, bet: 100 });
      while (st.phase === 'play') st = close(st, plan.pickOf(sx.movesFor(sx.maskOfTiles(V(st).open), st.roll)));
      paid += st.paid;
    }
    const rtp = paid / (N * 100);
    console.log('  ' + plan.name.padEnd(36) + pct(rtp));
    // sampled, so this is an error bar rather than an equality: the claim is only that it is not
    // better than the solve, which it cannot be
    assert.ok(rtp < best + 0.01, plan.name + ' returned ' + pct(rtp));
  }
  console.log('  the best play, solved exactly'.padEnd(38) + pct(best));
});

test('the best play, solved again with the FLOORED payouts, holds the band at every bet', () => {
  let worst = { rtp: 9 }, best = { rtp: -1 };
  const bets = BETS.slice();
  for (let b = sx.MIN_BET; b <= 200; b++) if (bets.indexOf(b) < 0) bets.push(b);
  for (const b of bets) {
    // the payout the engine really pays, floored, is what the player optimises against
    const r = solve((rem) => BigInt(sx.payFor(b, rem)));
    const rtp = Number(r.value[ALL]) / Number(r.den) / b;
    if (rtp < worst.rtp) worst = { rtp, bet: b };
    if (rtp > best.rtp) best = { rtp, bet: b };
    assert.ok(rtp >= sx.BAND_LO / 100 && rtp <= sx.BAND_HI / 100, 'a bet of ' + b + ' returns ' + pct(rtp));
  }
  console.log('  ' + bets.length + ' bets: worst ' + pct(worst.rtp) + ' at a bet of ' + worst.bet
    + ', best ' + pct(best.rtp) + ' at a bet of ' + best.bet);
  // the floor can only take: the unfloored solve is the ceiling on all of them
  assert.ok(best.rtp <= Number(sx.SOLVED.value) / 100 / Number(sx.SOLVED.den) + 1e-12);
  // and the bound the engine checks itself against when it loads really does bound it
  const bound = Number(sx.SOLVED.value) / 100 / Number(sx.SOLVED.den)
    - Number(sx.SOLVED.paid) / Number(sx.SOLVED.den) / sx.MIN_BET;
  console.log('  the load check\'s bound is ' + pct(bound) + ', and nothing measured came under it');
  assert.ok(worst.rtp >= bound, 'the bound is not a bound');
  assert.ok(bound >= sx.BAND_LO / 100, 'the bound itself is outside the band');
});

test('a floor of 10 would break the band, and a bet of 10 is not how you find that out', () => {
  // The figure MIN_BET is solved from, and the trap in it. Every multiplier in the table is a whole
  // number of tenths, so a bet of 10 divides exactly and returns the table's full figure: the chips
  // would never show the problem. The engine takes any whole bet at or over its floor, and the bets
  // BETWEEN the chips are where the floor eats a credit
  const at = (b) => Number(solve((rem) => BigInt(sx.payFor(b, rem))).value[ALL]) / Number(36n ** 9n) / b;
  const exact = Number(sx.SOLVED.value) / 100 / Number(sx.SOLVED.den);
  assert.equal(at(10), exact, 'a bet of 10 should divide the table exactly');
  let bad = 0, worst = { rtp: 9 };
  for (let b = 10; b < 100; b++) {
    const rtp = at(b);
    if (rtp < worst.rtp) worst = { rtp, bet: b };
    if (rtp < sx.BAND_LO / 100) bad += 1;
  }
  console.log('  at a floor of 10: ' + bad + ' of the 90 bets it would take fall out of the band, worst '
    + pct(worst.rtp) + ' at a bet of ' + worst.bet);
  assert.ok(bad >= 10, 'only ' + bad + ' bets under 100 break the band');
  assert.ok(worst.rtp < 0.95, 'the worst bet under 100 returns ' + pct(worst.rtp));
  assert.equal(sx.MIN_BET, 100);
});

test('the check it runs when it loads has teeth', () => {
  // one digit on the top row: the order of the table survives it and the band does not
  assert.throws(() => loadBroken("name: 'Shut the box', mult100: 440", "name: 'Shut the box', mult100: 450"),
    /returns over the band/);
  // a row that overlaps the one above it, so a remaining total would be on two rows
  assert.throws(() => loadBroken("{ lo: 5, hi: 9, name: '9 or less left'", "{ lo: 4, hi: 9, name: '9 or less left'"),
    /does not climb/);
  // and the floor that holds the best play inside the band
  assert.throws(() => loadBroken('const MIN_BET = 100;', 'const MIN_BET = 10;'), /cannot hold the best play/);
  // the sabotage harness itself works, or the three above would pass on a typo
  assert.equal(loadBroken('const MIN_BET = 100;', 'const MIN_BET = 100; /* x */').MIN_BET, 100);
});

// --- the round ----------------------------------------------------------------------------------

test('the bet buys the first throw, and the tiles that add up to it come down', () => {
  const st = run([[3, 4], [1, 1], [6, 6]]);
  assert.equal(st.phase, 'play');
  assert.deepEqual(st.dice, [3, 4]);
  assert.equal(st.roll, 7);
  assert.deepEqual(sx.tilesOfMask(st.open), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const one = close(st, [7]);
  assert.deepEqual(sx.tilesOfMask(one.open), [1, 2, 3, 4, 5, 6, 8, 9]);
  assert.deepEqual(one.closed, [[7]]);
  assert.equal(one.roll, 2, 'the next throw comes with the close');
  // the same roll, taken a different way, leaves a different board: this is the whole game
  const other = close(st, [3, 4]);
  assert.deepEqual(sx.tilesOfMask(other.open), [1, 2, 5, 6, 7, 8, 9]);
  assert.deepEqual(other.closed, [[3, 4]]);
  // the tiles are recorded in order, however they were sent
  assert.deepEqual(close(st, [4, 3]).closed, [[3, 4]]);
});

test('a throw with no move ends the round, and what is left is what it pays on', () => {
  // the 7, then 1 + 5 + 6, then 2 + 3 + 4, leaves the 8 and the 9 standing, and a throw of 5
  // cannot be made out of those two
  let st = run([[3, 4], [6, 6], [4, 5], [2, 3]]);
  st = close(st, [7]);
  st = close(st, [1, 5, 6]);
  st = close(st, [2, 3, 4]);
  assert.equal(st.phase, 'done');
  assert.equal(st.result, 'stuck');
  assert.equal(st.roll, 5, 'the throw that ended it is the one on the screen');
  assert.deepEqual(sx.tilesOfMask(st.open), [8, 9]);
  assert.equal(st.rem, 17);
  assert.equal(sx.rowFor(17), null);
  assert.equal(st.paid, 0);
  assert.equal(st.net, -100);
  // and a round that ends with little open pays its row
  let low = run([[4, 5], [3, 5], [3, 4], [1, 5], [2, 3], [1, 2], [4, 4]]);
  for (const tiles of [[9], [8], [7], [6], [5], [3]]) low = close(low, tiles);
  assert.equal(low.phase, 'done');
  assert.equal(low.result, 'stuck');
  assert.deepEqual(sx.tilesOfMask(low.open), [1, 2, 4]);
  assert.equal(low.rem, 7);
  assert.equal(low.row, undefined, 'the row is the view\'s business, not the state\'s');
  assert.equal(low.paid, sx.payoutOf(100, 120));
  assert.equal(low.paid, 120);
  assert.equal(low.net, 20);
});

test('shutting the box pays the top row and asks for no further throw', () => {
  // nine tiles in six throws: the 9, the 8, the 7, the 6, then 3 + 4 + 5, then 1 + 2
  let st = run([[4, 5], [3, 5], [3, 4], [2, 4], [6, 6], [1, 2]]);
  st = close(st, [9]);
  st = close(st, [8]);
  st = close(st, [7]);
  st = close(st, [6]);
  assert.equal(st.roll, 12);
  st = close(st, [3, 4, 5]);
  assert.deepEqual(sx.tilesOfMask(st.open), [1, 2]);
  assert.equal(st.phase, 'play');
  assert.equal(st.roll, 3);
  st = close(st, [1, 2]);
  assert.equal(st.phase, 'done');
  assert.equal(st.result, 'shut');
  assert.equal(st.open, 0);
  assert.equal(st.rem, 0);
  assert.equal(st.paid, sx.payoutOf(100, 440));
  assert.equal(st.paid, 440);
  assert.equal(st.net, 340);
  assert.ok(st.pos < sx.MAX_ROLLS, 'a shut box asked for a throw it did not need');
  // a round can never ask for more throws than were drawn at the deal, because a move closes a tile
  for (let i = 0; i < 400; i++) {
    let r = sx.newRound({ seed: 'rolls-' + i, bet: 100 });
    while (r.phase === 'play') r = close(r, sx.movesFor(r.open, r.roll)[0]);
    assert.ok(r.pos <= sx.MAX_ROLLS, 'the round drew ' + r.pos + ' of ' + sx.MAX_ROLLS);
    assert.ok(r.closed.length <= sx.TILES);
  }
});

test('every refusal says what is wrong with the move, and moves nothing', () => {
  const st = run([[3, 4], [1, 1]]);
  const before = snapshot(st);
  const cases = [
    [{ op: 'close', tiles: [6] }, 'those tiles add up to 6, not 7'],
    [{ op: 'close', tiles: [1, 2, 3] }, 'those tiles add up to 6, not 7'],
    [{ op: 'close', tiles: [] }, 'pick the tiles that add up to 7'],
    [{ op: 'close' }, 'pick the tiles that add up to 7'],
    [{ op: 'close', tiles: 7 }, 'pick the tiles that add up to 7'],
    [{ op: 'close', tiles: [10] }, 'there is no tile 10'],
    [{ op: 'close', tiles: [0] }, 'there is no tile 0'],
    [{ op: 'close', tiles: [2.5] }, 'there is no tile 2.5'],
    [{ op: 'close', tiles: [3, 3, 1] }, 'tile 3 twice'],
    [{ op: 'open' }, 'unknown action'],
    ['close', 'pick the tiles that add up to 7'],
    [null, 'unknown action'],
    [undefined, 'unknown action']
  ];
  for (const [op, why] of cases) {
    assert.equal(sx.whyNot(st, op), why, JSON.stringify(op));
    assert.equal(sx.act(st, op), st, 'a refused move gives back the very same object');
  }
  assert.equal(snapshot(st), before, 'a refused move changed the round');
  // a tile already down
  const one = close(st, [7]);
  assert.equal(sx.whyNot(one, { op: 'close', tiles: [7] }), 'tile 7 is already down');
  // and a settled round takes nothing at all
  let done = run([[3, 4], [6, 6], [4, 5], [2, 3]]);
  for (const tiles of [[7], [1, 5, 6], [2, 3, 4]]) done = close(done, tiles);
  assert.equal(done.phase, 'done');
  const paid = done.paid;
  for (const op of [{ op: 'close', tiles: [1] }, 'close', null]) {
    assert.equal(sx.whyNot(done, op), op === null ? 'unknown action' : 'the round is over');
    assert.equal(sx.act(done, op), done);
  }
  assert.equal(done.paid, paid, 'a refused move moved the money');
  assert.equal(sx.whyNot(null, { op: 'close', tiles: [1] }), 'the round is over');
  // a short stack is a test's mistake, not a player's: the engine says so rather than paying out
  assert.throws(() => close(run([[3, 4]]), [7]), RangeError);
});

test('act never mutates its input', () => {
  for (let i = 0; i < 200; i++) {
    let st = sx.newRound({ seed: 'mut-' + i, bet: 100 });
    while (st.phase === 'play') {
      const before = snapshot(st);
      const moves = sx.movesFor(st.open, st.roll);
      const next = close(st, moves[0]);
      for (const m of moves) close(st, m);
      assert.equal(snapshot(st), before, 'close mutated the round it was handed');
      st = next;
    }
  }
});

test('the bet is riding from the deal until it settles', () => {
  const live = run([[3, 4], [1, 1]]);
  assert.equal(sx.stake(live), 100);
  assert.equal(sx.stake(sx.newRound({ seed: 'x', bet: 5000 })), 5000);
});

// --- money --------------------------------------------------------------------------------------

test('every payout is a whole number, rounded the house way', () => {
  for (const amount of BETS) {
    for (let rem = 0; rem <= sx.FULL; rem++) {
      const pay = sx.payFor(amount, rem);
      const row = sx.rowFor(rem);
      assert.ok(Number.isSafeInteger(pay), 'payout ' + pay);
      if (!row) { assert.equal(pay, 0, rem + ' should pay nothing'); continue; }
      assert.ok(pay <= amount * row.mult100 / 100, row.name + ' at ' + amount + ' pays over the odds');
      assert.ok(pay > amount * row.mult100 / 100 - 1, row.name + ' at ' + amount + ' pays over a credit under');
      assert.ok(pay > amount, row.name + ' at ' + amount + ' pays ' + pay);
    }
  }
  // the bet does not change the game, only the size of it
  for (const amount of [100, 1000, 10000]) {
    let st = run([[4, 5], [3, 5], [3, 4], [1, 5], [2, 3], [1, 2], [4, 4]], amount);
    for (const tiles of [[9], [8], [7], [6], [5], [3]]) st = close(st, tiles);
    assert.equal(st.rem, 7);
    assert.equal(st.paid, sx.payoutOf(amount, 120));
    assert.equal(st.net, st.paid - amount);
    assert.equal(st.net, Math.trunc(st.net), 'no fraction survives the payout');
  }
});

test('the bet is a whole number the top row can be paid on', () => {
  assert.throws(() => sx.newRound({ seed: 'x', bet: 1.5 }), RangeError);
  assert.throws(() => sx.newRound({ seed: 'x', bet: 0 }), RangeError);
  assert.throws(() => sx.newRound({ seed: 'x', bet: -100 }), RangeError);
  assert.throws(() => sx.newRound({ seed: 'x', bet: 2 ** 53 }), RangeError);
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / sx.TOP_MULT);
  assert.equal(sx.newRound({ seed: 'x', bet: cap }).bet, cap);
  assert.ok(Number.isSafeInteger(cap * sx.TOP_MULT), 'the cap itself still pays exactly');
  assert.throws(() => sx.newRound({ seed: 'x', bet: cap + 1 }), RangeError);
  assert.equal(sx.MIN_BET, 100);
  assert.equal(sx.idleView().minBet, 100);
  assert.equal(sx.TOP_MULT, 440);
});

// --- determinism and what the webview sees ------------------------------------------------------

test('the same seed throws the same dice, and the id is not the seed', () => {
  for (let i = 0; i < 200; i++) {
    const seed = 'det-' + i;
    assert.deepEqual(sx.rollsOf(seed), sx.rollsOf(seed));
    assert.deepEqual(V(deal({ seed })), V(deal({ seed })));
  }
  const distinct = new Set(Array.from({ length: 300 }, (_, i) => JSON.stringify(sx.rollsOf('d' + i))));
  assert.equal(distinct.size, 300, 'only ' + distinct.size + ' different runs in 300 seeds');
  const id = 'c0ffee';
  const byId = sx.newRound({ seed: 'the-seed', id, bet: 100 });
  assert.equal(byId.id, id);
  assert.notDeepEqual(sx.rollsOf(id), sx.rollsOf('the-seed'));
  // the throws do not depend on what the player does with them: the same seed throws the same dice
  // whichever way the tiles come down
  for (let i = 0; i < 50; i++) {
    const seed = 'play-' + i;
    const a = sx.newRound({ seed, bet: 100 });
    const moves = sx.movesFor(a.open, a.roll);
    const first = close(a, moves[0]);
    const last = close(a, moves[moves.length - 1]);
    assert.equal(first.roll, last.roll, seed + ': the next throw moved with the choice');
    assert.deepEqual(first.rolls, a.rolls, seed);
  }
  // the dice land evenly, which is the one thing the exact solve cannot see
  const N = 40000;
  const byTotal = new Array(13).fill(0);
  let n = 0;
  for (let i = 0; i < N; i++) {
    for (const pair of sx.rollsOf('even-' + i)) { byTotal[pair[0] + pair[1]] += 1; n += 1; }
  }
  let worst = 0;
  for (let t = 2; t <= 12; t++) {
    const q = sx.WAYS[t] / 36;
    const off = Math.abs(byTotal[t] / n - q) / Math.sqrt(q * (1 - q) / n);
    if (off > worst) worst = off;
    assert.ok(off < 5, 'a throw of ' + t + ' came up ' + pct(byTotal[t] / n) + ', not ' + pct(q));
  }
  console.log('  ' + n.toLocaleString('en-US') + ' throws, furthest off: ' + worst.toFixed(1) + ' SE');
});

test('a live round carries no seed and none of the throws still to come', () => {
  let st = run([[3, 4], [1, 1], [6, 6], [5, 6], [4, 5], [3, 4], [2, 3], [1, 2], [1, 1]]);
  let guard = 0;
  while (st.phase === 'play' && guard++ < 9) {
    const v = V(st);
    assert.equal('seed' in v, false, 'a live round must not carry its seed');
    assert.equal('rolls' in v, false, 'a live round must not carry the throws still to come');
    assert.equal('pos' in v, false);
    assert.equal('open' in v, true);
    assert.deepEqual(v.open, sx.tilesOfMask(st.open), 'the board as tile numbers');
    assert.deepEqual(v.dice, st.dice);
    assert.equal(v.roll, st.roll);
    // the host's ruling on what can be closed, and the panel offers exactly these
    assert.deepEqual(v.moves, sx.movesFor(st.open, st.roll));
    assert.ok(v.moves.length > 0, 'a live round always has a move');
    for (const m of v.moves) assert.equal(sx.whyNot(st, { op: 'close', tiles: m }), null, m.join('+'));
    assert.equal(v.can.close, true);
    // what the round is worth if it ends right here, which the remaining total already says
    assert.equal(v.standing.rem, sx.sumOfMask(st.open));
    assert.equal(v.standing.payout, sx.payFor(st.bet, v.standing.rem));
    assert.equal(v.paid, null);
    assert.equal(v.row, null);
    st = close(st, v.moves[0]);
  }
  assert.equal(st.phase, 'done');
  const v = V(st);
  assert.equal(v.seed, st.seed);
  assert.equal('rolls' in v, false, 'a settled round still hands over no throw list');
  assert.deepEqual(v.moves, []);
  assert.equal(v.row, sx.rowFor(st.rem));
  assert.equal(v.paid, st.paid);
  assert.equal(v.can.close, false);
});

test('the idle view is a bet screen with a full board and the table on it', () => {
  const v = sx.idleView();
  assert.equal(v.phase, 'bet');
  assert.equal(v.id, null);
  assert.equal(v.bet, null);
  assert.deepEqual(v.open, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(v.closed, []);
  assert.deepEqual(v.dice, []);
  assert.equal(v.roll, null);
  assert.deepEqual(v.moves, []);
  assert.equal(v.paid, null);
  assert.equal(v.net, null);
  assert.equal('seed' in v, false, 'there is no round, so there is no seed');
  assert.equal(v.pays, sx.PAYS);
  assert.equal(v.full, 45);
  assert.deepEqual(v.can, { close: false });
  assert.deepEqual(sx.view(null), v);
  const live = V(run([[3, 4], [1, 1]]));
  for (const k of ['pays', 'tiles', 'diceCount', 'sides', 'throws', 'full', 'maxRolls', 'minBet']) {
    assert.equal(live[k], v[k], k);
  }
});

test('the engine knows nothing but cards.js', () => {
  // Pure: no vscode, no ledger. The one import is the shared seeded source, and what it uses from
  // it is the ROLL stream, not a shuffle: there are no cards here
  const src = fs.readFileSync(path.join(__dirname, '..', 'shutbox.js'), 'utf8');
  const requires = src.match(/require\(([^)]*)\)/g) || [];
  assert.deepEqual(requires, ["require('./cards')"]);
  assert.ok(src.indexOf('rollsFrom') > 0, 'the throws should roll, not shuffle');
  assert.equal(src.indexOf('Math.random'), -1, 'the seed comes from the host');
  assert.equal(sx.MIN_BET, 100);
  assert.deepEqual(sx.OPS, ['close']);
  assert.equal(typeof C.rollsFrom, 'function');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
