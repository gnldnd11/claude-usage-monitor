// The tower: the ladder, the traps, the climb, what the view keeps back, and the house's cut.
// No dependencies: node's assert only. Run: node test/tower.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const t = require(path.join(__dirname, '..', 'tower.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const FLOORS = t.FLOORS;
const DIFFS = t.DIFFS;
const IDS = DIFFS.map((d) => d.id);
const BET = t.MIN_BET;

const snapshot = (st) => JSON.stringify(st);
const climb = (st, cell) => t.act(st, { op: 'climb', cell: cell });
const cash = (st) => t.act(st, 'cashout');
const pct = (x) => (x * 100).toFixed(2) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');

function round(over) {
  return t.newRound(Object.assign({ seed: 'seed-0', id: 'round-0', bet: BET, diff: 'normal' }, over));
}

// P(n floors cleared) on this tower: the same gamble n times over, so it is a plain power
function survive(diff, n) {
  const d = t.diffOf(diff);
  return Math.pow((d.cells - d.traps) / d.cells, n);
}

// A tower with the traps placed by hand: every floor's trap on the same door, so a test can climb
// any other door all the way to the top
function stacked(diff, trapCell, over) {
  const rows = [];
  for (let f = 0; f < FLOORS; f++) rows.push([trapCell]);
  return round(Object.assign({ diff, stack: rows }, over));
}

// Climbs `cell` on every floor and asserts it was safe each time
function walk(st, cell, floors) {
  for (let i = 0; i < floors; i++) {
    const before = st.picks.length;
    st = climb(st, cell);
    assert.equal(st.picks.length, before + 1, 'floor ' + (before + 1) + ' was trapped');
  }
  return st;
}

// --- the ladder ---------------------------------------------------------------------------

test('the ladder is 0.97 / p^n, as whole numbers', () => {
  for (const d of DIFFS) {
    const rows = t.LADDERS[d.id];
    assert.equal(rows.length, FLOORS + 1, d.id);
    let up = 1, down = 1;
    for (const r of rows) {
      // the rung against the power worked out here, as a ratio rather than a float compare
      assert.equal(r.num * down * t.EDGE_DEN, r.den * up * t.EDGE_NUM, d.id + ' floor ' + r.n + ': ' + r.num + '/' + r.den);
      assert.ok(Number.isSafeInteger(r.num) && Number.isSafeInteger(r.den), 'floor ' + r.n + ' is not whole');
      up *= d.cells;
      down *= d.cells - d.traps;
    }
    // the opening rung is the house's cut and nothing else, which is what makes a cash-out before
    // the first floor a refusal rather than a move that gives up 3% for free
    assert.equal(rows[0].num, t.EDGE_NUM);
    assert.equal(rows[0].den, t.EDGE_DEN);
  }
});

test('the ladder climbs, every rung pays above the bet, and a harder tower pays more', () => {
  for (const d of DIFFS) {
    const rows = t.LADDERS[d.id];
    for (let n = 1; n <= FLOORS; n++) {
      assert.ok(rows[n].num > rows[n].den, d.id + ' floor ' + n + ' does not pay above the bet');
      assert.ok(rows[n].num * rows[n - 1].den > rows[n - 1].num * rows[n].den, d.id + ': flat at floor ' + n);
    }
  }
  // fewer safe doors is a steeper ladder, floor for floor
  for (let i = 1; i < DIFFS.length; i++) {
    const lo = t.LADDERS[DIFFS[i - 1].id], hi = t.LADDERS[DIFFS[i].id];
    for (let n = 1; n <= FLOORS; n++) {
      assert.ok(hi[n].num * lo[n].den > lo[n].num * hi[n].den, DIFFS[i].id + ' pays no more than ' + DIFFS[i - 1].id + ' at floor ' + n);
    }
  }
  // and every tower leaves at least one safe door, or the ladder would price a certainty
  for (const d of DIFFS) assert.ok(d.traps >= 1 && d.traps < d.cells, d.id);
});

test('the ladder is frozen, so nothing that is handed it can retune the game', () => {
  const was = JSON.stringify(t.LADDERS) + JSON.stringify(t.DIFFS);
  try { t.LADDERS.normal[1].num = 1; } catch (e) { /* strict mode throws, sloppy mode ignores */ }
  try { t.DIFFS.push({ id: 'free', cells: 2, traps: 0 }); } catch (e) { /* frozen array */ }
  assert.equal(JSON.stringify(t.LADDERS) + JSON.stringify(t.DIFFS), was);
});

// --- the money ----------------------------------------------------------------------------

test('a payout is one floor of the rung, and the shown multiplier is read back out of it', () => {
  const BETS = [t.MIN_BET, 137, 1000, 99999, t.MAX_BET];
  for (const d of DIFFS) {
    for (let n = 1; n <= FLOORS; n++) {
      const r = t.rungOf(d.id, n);
      for (const bet of BETS) {
        const payout = t.payoutAt(bet, d.id, n);
        assert.ok(Number.isSafeInteger(payout), 'bet ' + bet + ', floor ' + n + ' pays ' + payout);
        // the floor, as an integer identity: payout <= bet * num / den < payout + 1
        assert.ok(payout * r.den <= bet * r.num, 'bet ' + bet + ', floor ' + n + ' pays above the rung');
        assert.ok((payout + 1) * r.den > bet * r.num, 'bet ' + bet + ', floor ' + n + ' pays below the floor');
        // and the multiplier the screen prints never promises a credit the payout does not carry
        const shown = t.mult100Of(bet, payout);
        assert.ok(bet * shown <= 100 * payout, 'bet ' + bet + ', floor ' + n + ' shows ' + shown + ' for ' + payout);
        assert.ok(bet * (shown + 1) > 100 * payout, 'bet ' + bet + ', floor ' + n + ' shows less than it pays');
      }
    }
  }
});

test('the bet is a whole number inside the house limits, and the difficulty is one of three', () => {
  for (const bad of [0, -1, 9, t.MIN_BET - 1, 10.5, NaN, Infinity, '100', t.MAX_BET + 1]) {
    assert.throws(() => round({ bet: bad }), RangeError, 'bet ' + bad + ' was taken');
  }
  for (const bad of ['', 'EASY', 'impossible', 0, 3]) {
    assert.throws(() => round({ diff: bad }), RangeError, 'diff ' + bad + ' was taken');
  }
  assert.equal(round({ diff: null }).diff, t.DEFAULT_DIFF);
  for (const id of IDS) assert.equal(round({ diff: id }).diff, id);
});

// --- the traps ----------------------------------------------------------------------------

test('every floor holds exactly its traps, and every door is equally likely to be one', () => {
  const N = 20000;
  for (const d of DIFFS) {
    const seen = [];
    for (let f = 0; f < FLOORS; f++) seen.push(new Array(d.cells).fill(0));
    for (let i = 0; i < N; i++) {
      const st = round({ seed: 'traps-' + d.id + '-' + i, diff: d.id });
      assert.equal(st.layout.length, FLOORS);
      for (let f = 0; f < FLOORS; f++) {
        const row = st.layout[f];
        assert.equal(row.length, d.traps, d.id + ' floor ' + f + ' has ' + row.length + ' traps');
        assert.equal(new Set(row).size, d.traps, d.id + ' floor ' + f + ' repeats a door');
        for (const cell of row) {
          assert.ok(cell >= 0 && cell < d.cells, 'door ' + cell + ' is not on the floor');
          seen[f][cell] += 1;
        }
      }
    }
    // a uniform shuffle traps every door traps/cells of the time, on every floor. 4 SE of the frequency
    const p = d.traps / d.cells;
    const se = Math.sqrt(p * (1 - p) / N);
    let worst = 0;
    for (let f = 0; f < FLOORS; f++) {
      for (let cell = 0; cell < d.cells; cell++) {
        const off = Math.abs(seen[f][cell] / N - p) / se;
        if (off > worst) worst = off;
        assert.ok(off < 4, d.id + ' floor ' + f + ' door ' + cell + ' was trapped ' + pct(seen[f][cell] / N) + ' of the time');
      }
    }
    console.log('  ' + d.id.padEnd(7) + ' over ' + num(N) + ' towers: furthest door ' + worst.toFixed(1) + ' SE off ' + pct(p));
  }
});

test('a stacked tower is the tower, so a test can place the traps itself', () => {
  const st = stacked('normal', 1);
  assert.deepEqual(st.layout, new Array(FLOORS).fill([1]));
  assert.equal(climb(st, 1).ended, 'fell');
  assert.equal(climb(st, 0).ended, null);
  for (const bad of [-1, 3, 1.5, '1']) assert.throws(() => round({ stack: [[bad]] }), RangeError);
});

test('the traps come off the shared shuffle, one derived seed a floor', () => {
  // cards.js owns the repo's one Fisher-Yates on purpose, and C.shuffle takes a seed rather than a
  // generator, so a floor gets a seed of its own rather than a second shuffle written here. This is
  // the check that the tower really is that shuffle
  for (let i = 0; i < 200; i++) {
    const seed = 'shuffle-' + i;
    for (const d of DIFFS) {
      const doors = [];
      for (let c = 0; c < d.cells; c++) doors.push(c);
      const st = round({ seed, diff: d.id });
      for (let f = 0; f < FLOORS; f++) {
        const want = C.shuffle(doors, seed + '/' + f).slice(0, d.traps).sort((a, b) => a - b);
        assert.deepEqual(st.layout[f], want, d.id + ' floor ' + f + ' of ' + seed);
      }
    }
  }
});

// --- the climb ----------------------------------------------------------------------------

test('a safe door climbs the ladder and act never mutates its input', () => {
  let st = stacked('normal', 2);
  for (let n = 1; n <= 4; n++) {
    const was = snapshot(st);
    const next = climb(st, 0);
    assert.equal(snapshot(st), was, 'the climb moved the round it was given');
    assert.notEqual(next, st);
    assert.equal(next.picks.length, n);
    assert.equal(next.phase, 'play');
    assert.equal(next.net, null, 'nothing settles until the round ends');
    assert.equal(t.view(next, 0).cash, t.payoutAt(BET, 'normal', n));
    st = next;
  }
});

test('a trap ends the climb, the bet is lost, and every floor comes out', () => {
  // a hard tower traps two of the three doors, so the layout is placed floor by floor: door 2 is
  // open on the first two floors and the third floor is the one that takes the climb
  const rows = [];
  for (let f = 0; f < FLOORS; f++) rows.push(f === 2 ? [1, 2] : [0, 1]);
  const st = walk(round({ diff: 'hard', stack: rows }), 2, 2);
  assert.equal(st.picks.length, 2);
  const fell = climb(st, 1);
  assert.equal(fell.phase, 'done');
  assert.equal(fell.ended, 'fell');
  assert.deepEqual(fell.hit, { floor: 2, cell: 1 });
  assert.equal(fell.payout, 0);
  assert.equal(fell.net, -BET);
  const v = t.view(fell, 0);
  assert.equal(v.cash, null, 'a settled round offers nothing');
  assert.equal(v.mult100, 0, 'a lost round paid nothing');
  assert.deepEqual(v.can, { climb: false, cashout: false });
  // the floor it fell on says which door was taken, and the floors above say what was waiting
  assert.equal(v.rows[2].where, 'now');
  assert.equal(v.rows[2].pick, 1);
  for (const row of v.rows) assert.notEqual(row.traps, null, 'floor ' + row.floor + ' kept its traps back');
});

test('a cash-out pays the floor the climb reached, and needs one floor first', () => {
  let st = stacked('easy', 3);
  assert.equal(t.whyNot(st, 'cashout'), 'clear a floor first');
  assert.equal(cash(st), st, 'the refusal handed back a different object');
  st = walk(st, 0, 3);
  const out = cash(st);
  assert.equal(out.ended, 'cashout');
  assert.equal(out.payout, t.payoutAt(BET, 'easy', 3));
  assert.equal(out.net, out.payout - BET);
  assert.equal(t.view(out, 0).mult100, t.mult100Of(BET, out.payout));
});

test('the top settles by itself at the top of the ladder', () => {
  const st = walk(stacked('normal', 2), 0, FLOORS);
  assert.equal(st.phase, 'done');
  assert.equal(st.ended, 'topped');
  assert.equal(st.payout, t.payoutAt(BET, 'normal', FLOORS));
  const v = t.view(st, 0);
  assert.equal(v.next, null, 'there is no floor above the top');
  assert.equal(v.at, FLOORS);
  assert.equal(v.rows[FLOORS - 1].where, 'past');
});

test('every refused move hands back the very same object, with a reason', () => {
  const st = walk(stacked('normal', 2), 0, 1);
  const bad = [
    [{ op: 'climb', cell: -1 }, 'pick a door on this floor'],
    [{ op: 'climb', cell: 3 }, 'pick a door on this floor'],
    [{ op: 'climb', cell: 0.5 }, 'pick a door on this floor'],
    [{ op: 'climb' }, 'pick a door on this floor'],
    ['climb', 'pick a door on this floor'],
    ['up', 'unknown action'],
    [null, 'unknown action'],
    [{ op: 'cash' }, 'unknown action']
  ];
  for (const [op, why] of bad) {
    assert.equal(t.whyNot(st, op, 0), why, JSON.stringify(op));
    assert.equal(t.act(st, op), st, JSON.stringify(op) + ' changed the round');
  }
  // a door that exists on a wider tower is still not on this one
  assert.equal(t.whyNot(round({ diff: 'easy' }), { op: 'climb', cell: 3 }, 0), null);
  // and nothing at all is allowed once the round is over
  const done = cash(st);
  for (const op of [{ op: 'climb', cell: 0 }, 'cashout']) {
    assert.equal(t.whyNot(done, op, 0), 'the round is over');
    assert.equal(t.act(done, op), done);
  }
  assert.equal(t.whyNot(null, 'cashout', 0), 'the round is over');
});

test('the same seed and the same doors give the same round', () => {
  const run = () => {
    let st = round({ seed: 'replay', diff: 'hard' });
    for (let i = 0; i < FLOORS && st.phase === 'play'; i++) st = climb(st, i % st.cells);
    return st;
  };
  assert.equal(snapshot(run()), snapshot(run()));
});

// --- what the view keeps back ---------------------------------------------------------------

// The strongest form of "the traps are not in there": two rounds with DIFFERENT towers that have
// been climbed the same way hand the webview the same bytes. If any clue about the floor being
// climbed or the floors above it were in the view, these two could not match
test('a live view cannot tell two different towers apart', () => {
  const cell = 0;
  const found = [];
  for (let i = 0; i < 20000 && found.length < 2; i++) {
    const seed = 'twin-' + i;
    const st = round({ seed, diff: 'normal' });
    // the first two floors must be safe on the same door, so the climb is identical
    if (st.layout[0].indexOf(cell) >= 0 || st.layout[1].indexOf(cell) >= 0) continue;
    const key = JSON.stringify(st.layout);
    if (found.every((f) => f.key !== key)) found.push({ seed, key });
  }
  assert.equal(found.length, 2, 'could not find two different towers safe on the same two doors');
  const views = found.map((f) => JSON.stringify(t.view(walk(round({ seed: f.seed, diff: 'normal' }), cell, 2), 5000)));
  assert.equal(views[0], views[1], 'the view told the two towers apart');
  assert.notEqual(found[0].key, found[1].key);
});

test('the seed appears only once the round is done', () => {
  const seed = 'secret';
  let st = stacked('normal', 2, { seed });
  assert.equal('seed' in t.view(st, 0), false);
  st = walk(st, 0, 1);
  assert.equal('seed' in t.view(st, 0), false);
  assert.equal(t.view(cash(st), 0).seed, seed);
  // the seed and the round id are different values: the id travels in every message, the seed is
  // the tower itself
  assert.notEqual(st.id, st.seed);
});

test('the rows are the building, and only a settled one shows the traps', () => {
  const st = walk(stacked('normal', 2), 0, 3);
  const live = t.view(st, 0);
  assert.equal(live.rows.length, FLOORS);
  assert.deepEqual(live.rows.map((r) => r.where), ['past', 'past', 'past', 'now', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead', 'ahead']);
  assert.deepEqual(live.rows.slice(0, 3).map((r) => r.pick), [0, 0, 0]);
  assert.equal(live.rows.every((r) => r.traps === null), true, 'a live row described its traps');
  assert.equal(live.rows.slice(3).every((r) => r.pick === null), true, 'a row the climb has not reached named a door');
  assert.deepEqual(live.next, {
    floor: 4,
    payout: t.payoutAt(BET, 'normal', 4),
    mult100: t.mult100Of(BET, t.payoutAt(BET, 'normal', 4)),
    chance: { num: 2, den: 3 }
  });
  const out = t.view(cash(st), 0);
  assert.equal(out.rows.every((r) => Array.isArray(r.traps)), true, 'a settled row kept its traps back');
  // the floors it never reached are shown too: "it was that one" only lands if they are
  assert.deepEqual(out.rows[FLOORS - 1].traps, [2]);
});

test('the view hands the screen every figure it needs, and the idle one is the same shape', () => {
  const st = walk(stacked('normal', 2), 0, 1);
  const v = t.view(st, 9999);
  const idle = t.idleView();
  assert.deepEqual(Object.keys(v).sort(), Object.keys(idle).sort());
  assert.deepEqual(t.view(null, 0), idle);
  // every row is priced for this bet, so the screen holds no arithmetic
  for (const row of v.rows) {
    assert.equal(row.payout, t.payoutAt(BET, 'normal', row.floor));
    assert.equal(row.mult100, t.mult100Of(BET, row.payout));
  }
  // the fair column is the tower's geometry, for the screen to show before a bet is placed
  assert.deepEqual(idle.choices.map((c) => c.id), IDS);
  for (const c of idle.choices) {
    assert.equal(c.fair.length, FLOORS);
    const r = t.rungOf(c.id, 1);
    assert.equal(c.fair[0], Math.floor(100 * r.num / r.den));
  }
});

test('a live round stakes its bet and a settled one stakes nothing', () => {
  const st = stacked('normal', 2);
  assert.equal(t.stake(st), BET);
  assert.equal(t.stake(walk(st, 0, 4)), BET, 'the climbing payout is the house money, the bet is the stake');
  assert.equal(t.stake(cash(walk(st, 0, 1))), 0);
  assert.equal(t.stake(null), 0);
});

// --- the house's cut, enumerated ------------------------------------------------------------
// Every way to play this game is "choose a difficulty, stop after n floors", and there are 30 of
// them in all, so nothing here is sampled. The return of one of them is
//    p^n * payout / bet
// and because the rung IS 0.97 / p^n, that comes out as
//    0.97 * floor(bet * mult) / (bet * mult)
// The flooring is the whole of the gap, which is why the minimum bet is where it is: see the second
// table below.

function rtpOf(diff, n, bet) {
  const r = t.rungOf(diff, n);
  const payout = t.payoutAt(bet, diff, n);
  // p^n = 0.97 / mult = 97 * den / (100 * num), so the return is this ratio of whole numbers
  return (t.EDGE_NUM * r.den * payout) / (t.EDGE_DEN * r.num * bet);
}

test('the table: every "' + IDS.join('/') + ', stop at floor n" returns 96-97%', () => {
  console.log('      ' + DIFFS.map((d) => (d.id + ' (' + (d.cells - d.traps) + '/' + d.cells + ')').padStart(22)).join(''));
  console.log('  flr' + DIFFS.map(() => 'multiplier'.padStart(13) + 'return'.padStart(9)).join(''));
  let worst = null, best = null, n = 0;
  for (let f = 1; f <= FLOORS; f++) {
    let line = '  ' + String(f).padStart(3);
    for (const d of DIFFS) {
      const r = t.rungOf(d.id, f);
      const rtp = rtpOf(d.id, f, BET);
      n += 1;
      if (!worst || rtp < worst.rtp) worst = { rtp, diff: d.id, f };
      if (!best || rtp > best.rtp) best = { rtp, diff: d.id, f };
      line += ((r.num / r.den).toFixed(2) + 'x').padStart(13) + pct(rtp).padStart(9);
      // never above the cut, as an integer identity: payout <= bet * num / den is the floor itself
      assert.ok(t.payoutAt(BET, d.id, f) * r.den <= BET * r.num, d.id + ' floor ' + f + ' pays above fair');
      assert.ok(rtp <= t.EDGE_NUM / t.EDGE_DEN, d.id + ' floor ' + f + ' returns ' + pct(rtp));
      assert.ok(rtp > 0.96, d.id + ' floor ' + f + ' returns ' + pct(rtp));
    }
    console.log(line);
  }
  console.log('  ' + n + ' ways to play, at the minimum bet of ' + num(BET));
  console.log('  worst  ' + worst.diff + ', stop at floor ' + worst.f + ': ' + pct(worst.rtp));
  console.log('  best   ' + best.diff + ', stop at floor ' + best.f + ': ' + pct(best.rtp));
  // the top of the hard tower is the jackpot this game is for
  const top = t.rungOf('hard', FLOORS);
  console.log('  the hard tower\'s top pays ' + (top.num / top.den).toFixed(0) + 'x, about 1 climb in '
    + num(1 / survive('hard', FLOORS)));
});

test('the minimum bet of ' + t.MIN_BET + ' is what keeps the band, and 10 would not', () => {
  // The gap is one floored credit over the money riding, so it shrinks as the bet grows. This is the
  // measurement that chose MIN_BET, printed rather than remembered
  console.log('       bet     worst return    where');
  for (const bet of [10, 20, 50, 100, 200, 1000, 10000]) {
    let worst = null;
    for (const d of DIFFS) {
      for (let f = 1; f <= FLOORS; f++) {
        // payoutAt does not care about MIN_BET, so a bet below it can still be priced here
        const r = t.rungOf(d.id, f);
        const payout = t.floorDiv(bet * r.num, r.den);
        const rtp = (t.EDGE_NUM * r.den * payout) / (t.EDGE_DEN * r.num * bet);
        if (!worst || rtp < worst.rtp) worst = { rtp, diff: d.id, f };
      }
    }
    console.log('  ' + num(bet).padStart(8) + pct(worst.rtp).padStart(17)
      + ('   ' + worst.diff + ', floor ' + worst.f).padStart(24)
      + (bet === t.MIN_BET ? '   <- MIN_BET' : ''));
    if (bet >= t.MIN_BET) assert.ok(worst.rtp > 0.96, 'bet ' + bet + ' drops to ' + pct(worst.rtp));
    if (bet === 10) assert.ok(worst.rtp < 0.96, 'a 10-credit bet is in the band after all, so MIN_BET could come down');
  }
});

test('and no bet the engine takes falls out of the band, whichever tower it is', () => {
  let worst = null;
  for (let bet = t.MIN_BET; bet <= 2000; bet++) {
    for (const d of DIFFS) {
      for (let f = 1; f <= FLOORS; f++) {
        const rtp = rtpOf(d.id, f, bet);
        if (!worst || rtp < worst.rtp) worst = { rtp, bet, diff: d.id, f };
      }
    }
  }
  console.log('  bets ' + num(t.MIN_BET) + '..2,000: worst ' + pct(worst.rtp)
    + ' (bet ' + num(worst.bet) + ', ' + worst.diff + ', floor ' + worst.f + ')');
  assert.ok(worst.rtp > 0.96, 'the worst bet returns ' + pct(worst.rtp));
  for (const d of DIFFS) {
    for (let f = 1; f <= FLOORS; f++) {
      const far = rtpOf(d.id, f, t.MAX_BET);
      assert.ok(far > 0.9699 && far <= 0.97, 'at the house limit ' + d.id + ' floor ' + f + ' returns ' + pct(far));
    }
  }
});

// --- Monte Carlo ----------------------------------------------------------------------------
// The enumeration above believes two things it cannot check. One, that a door really is trapped
// traps/cells of the time (the frequency test up top measures that). Two, that the floors are
// INDEPENDENT, which is what makes P(n floors) a power rather than something else, and which is a
// claim about the derived seeds rather than about the shuffle. A tower whose floors agreed with each
// other would survive more often than p^n and the ladder would be mispriced.
//
// The sample size is read off the precision wanted rather than picked: one climb is a Bernoulli
// draw, so N = p(1-p)/SE^2 at the precision asked for, and 4 SE is then well inside the house's cut.
test('Monte Carlo: real climbs survive at the rate the ladder is priced off', () => {
  const SE = 0.002;
  const t0 = Date.now();
  console.log('       tower   flr        p^n       measured    off      climbs');
  let total = 0;
  for (const d of DIFFS) {
    const deep = Math.min(FLOORS, 6);
    const p = survive(d.id, 1);
    const N = Math.ceil(Math.max(p * (1 - p), 0.2) / (SE * SE));
    const lived = new Array(deep + 1).fill(0);
    for (let i = 0; i < N; i++) {
      let st = t.newRound({ seed: 'mc-' + d.id + '-' + i, id: 'mc', bet: BET, diff: d.id });
      let n = 0;
      for (let f = 0; f < deep; f++) {
        st = t.act(st, { op: 'climb', cell: f % d.cells });  // a different door each floor, so the
        if (st.ended === 'fell') break;                      // measurement is not one door's luck
        n += 1;
      }
      for (let j = 0; j <= n; j++) lived[j] += 1;
      total += 1;
    }
    for (let f = 1; f <= deep; f++) {
      const want = survive(d.id, f);
      const got = lived[f] / N;
      const se = Math.sqrt(want * (1 - want) / N);
      const off = Math.abs(got - want) / se;
      console.log('  ' + d.id.padStart(8) + String(f).padStart(6)
        + pct(want).padStart(13) + pct(got).padStart(15) + (off.toFixed(1) + ' SE').padStart(9) + num(N).padStart(12));
      assert.ok(off < 4, d.id + ' floor ' + f + ': ' + pct(got) + ' against ' + pct(want));
    }
  }
  console.log('  ' + num(total) + ' climbs in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
});

let failed = 0;
for (const test_ of tests) {
  try { test_.fn(); console.log('PASS ' + test_.name); }
  catch (e) { failed++; console.log('FAIL ' + test_.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
