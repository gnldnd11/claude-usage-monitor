// The scratch card: the bag, the paytable, the squares, what a view may say, and what the house
// keeps. No dependencies: node's assert only. Run: node test/scratch.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const sc = require(path.join(__dirname, '..', 'scratch.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const N = sc.CELLS;
const ALL = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const V = (st) => sc.view(st);
const snapshot = (st) => JSON.stringify(st);
const card = (cells, bet) => sc.newRound({ seed: 'stacked', bet: bet == null ? 10 : bet, cells });
const rub = (st, cell) => sc.act(st, { op: 'scratch', cell });
const reveal = (st) => sc.act(st, { op: 'reveal' });
const rubAll = (st, order) => (order || ALL).reduce((s, i) => rub(s, i), st);
const pct = (x) => (x * 100).toFixed(4) + '%';

// A card made of `n` copies of `sym`, padded out with symbols that cannot reach the pay line
function pile(sym, n) {
  const rest = sc.SYMBOLS.filter((s) => s !== sym);
  const out = new Array(n).fill(sym);
  for (let i = 0; out.length < N; i++) out.push(rest[i % rest.length]);
  // the padding must not itself triple, or the card is testing two rows at once
  const seen = {};
  for (const s of out.slice(n)) { seen[s] = (seen[s] || 0) + 1; assert.ok(seen[s] < 3, 'the padding tripled ' + s); }
  return out;
}

// --- the bag and the table ----------------------------------------------------------------

test('the bag holds every symbol as often as the table says', () => {
  assert.equal(sc.BAG_SIZE, sc.PAYS.reduce((n, r) => n + r.weight, 0));
  assert.equal(sc.BAG_SIZE, 52);
  for (const row of sc.PAYS) {
    assert.equal(sc.BAG.filter((s) => s === row.sym).length, row.weight, row.sym);
  }
  for (const s of sc.BAG) assert.ok(sc.ROW[s], 'the bag holds an unknown ' + s);
  assert.equal(sc.CELLS, 9);
  assert.equal(sc.SIDE, 3);
  assert.equal(sc.MIN_MATCH, 3);
  assert.equal(sc.TOP_MATCH, 6);
  assert.equal(sc.MIN_BET, 10);
});

test('the table is printed rarest first, climbs with every copy, and nobody outside can edit it', () => {
  assert.deepEqual(sc.PAYS.map((r) => r.sym),
    ['crab', 'pearl', 'anchor', 'starfish', 'urchin', 'jellyfish', 'bottle', 'coral', 'shell', 'kelp']);
  assert.deepEqual(sc.PAYS.map((r) => r.weight), [3, 4, 4, 5, 5, 5, 6, 6, 7, 7]);
  assert.deepEqual(sc.PAYS.map((r) => r.mult), [
    [1, 15, 100, 1000], [1, 8, 50, 300], [1, 8, 50, 300],
    [1, 4, 20, 130], [1, 4, 20, 130], [1, 4, 20, 130],
    [1, 3, 13, 70], [1, 3, 13, 70], [1, 2, 9, 45], [1, 2, 9, 45]
  ]);
  // three alike is the bet coming back and no more. That is not a taste, it is forced: more than
  // half of all cards triple something (the enumeration below prints the figure)
  for (const r of sc.PAYS) {
    assert.equal(r.mult[0], 1, r.sym + ' pays ' + r.mult[0] + ' for three');
    for (let k = 1; k < r.mult.length; k++) assert.ok(r.mult[k] > r.mult[k - 1], r.sym + ' at ' + (3 + k));
    for (const m of r.mult) assert.ok(Number.isSafeInteger(m), r.sym);
  }
  // a commoner symbol never outpays a rarer one, at any count
  for (let i = 1; i < sc.PAYS.length; i++) {
    assert.ok(sc.PAYS[i].weight >= sc.PAYS[i - 1].weight, 'weight at ' + sc.PAYS[i].sym);
    for (let k = 0; k < 4; k++) {
      assert.ok(sc.PAYS[i].mult[k] <= sc.PAYS[i - 1].mult[k], sc.PAYS[i].sym + ' at ' + (3 + k));
    }
  }
  assert.equal(sc.NO_WIN.mult, 0);
  assert.equal(sc.NO_WIN.sym, null);
  assert.throws(() => { sc.PAYS[0].weight = 1; }, TypeError);
  assert.throws(() => { sc.PAYS[0].mult[0] = 9; }, TypeError);
  assert.throws(() => { sc.PAYS.push({}); }, TypeError);
  assert.throws(() => { sc.BAG.push('crab'); }, TypeError);
});

// --- the prize ----------------------------------------------------------------------------

test('three or more of one symbol pays its row, and more copies pay more', () => {
  for (const row of sc.PAYS) {
    for (let n = 3; n <= N; n++) {
      // nine of one symbol leaves no room for padding, so only the pile is built there
      const cells = n === N ? new Array(N).fill(row.sym) : pile(row.sym, n);
      const w = sc.winOf(cells);
      assert.equal(w.sym, row.sym, row.sym + ' x' + n);
      assert.equal(w.count, n);
      assert.equal(w.mult, row.mult[Math.min(n, 6) - 3], row.sym + ' x' + n);
      assert.deepEqual(w.cells.slice(), ALL.slice(0, n), 'the winning squares are the ones holding it');
    }
    // two copies is nothing, whatever the symbol
    assert.equal(sc.winOf(pile(row.sym, 2)), sc.NO_WIN, row.sym + ' x2');
  }
  // and the row stops climbing at six: seven, eight and nine pay the same as six
  const top = sc.PAYS[0];
  for (const n of [6, 7, 8, 9]) {
    const cells = n === N ? new Array(N).fill(top.sym) : pile(top.sym, n);
    assert.equal(sc.winOf(cells).mult, top.mult[3], top.sym + ' x' + n);
  }
  // a card is nine known symbols, nothing else
  assert.throws(() => sc.winOf(new Array(8).fill('kelp')), RangeError);
  assert.throws(() => sc.winOf(new Array(10).fill('kelp')), RangeError);
  assert.throws(() => sc.winOf(pile('kelp', 3).map((s, i) => (i === 8 ? 'lobster' : s))), RangeError);
  assert.throws(() => sc.winOf('kelp'), RangeError);
});

test('when two symbols reach the line, the better-paying row is the prize', () => {
  // four crabs (15) against three kelp (1): the bigger prize, not the bigger pile
  const a = sc.winOf(['crab', 'crab', 'crab', 'crab', 'kelp', 'kelp', 'kelp', 'shell', 'shell']);
  assert.equal(a.sym, 'crab');
  assert.equal(a.mult, 15);
  assert.deepEqual(a.cells.slice(), [0, 1, 2, 3]);
  // six kelp (45) against three crabs (1): a common symbol wins on the strength of the pile, which
  // is the point of the rule being the payout and not the rarity
  const b = sc.winOf(['kelp', 'kelp', 'kelp', 'kelp', 'kelp', 'kelp', 'crab', 'crab', 'crab']);
  assert.equal(b.sym, 'kelp');
  assert.equal(b.mult, 45);
  // three symbols at three each: every row pays one, so the tie goes to the rarest of them
  const c = sc.winOf(['shell', 'shell', 'shell', 'kelp', 'kelp', 'kelp', 'crab', 'crab', 'crab']);
  assert.equal(c.sym, 'crab', 'the rarest of three tied rows');
  assert.equal(c.mult, 1);
  assert.deepEqual(c.cells.slice(), [6, 7, 8]);
  // the tie-break does not depend on where the squares sit: the same card dealt in another order
  // names the same symbol
  const d = sc.winOf(['crab', 'kelp', 'shell', 'crab', 'kelp', 'shell', 'crab', 'kelp', 'shell']);
  assert.equal(d.sym, 'crab');
  assert.equal(d.mult, 1);
  // four kelp (2) against four crabs (15)
  const e = sc.winOf(['kelp', 'kelp', 'kelp', 'kelp', 'crab', 'crab', 'crab', 'crab', 'shell']);
  assert.equal(e.sym, 'crab');
  assert.equal(e.mult, 15);
  // five shells (9) against three pearls (1)
  const f = sc.winOf(['shell', 'shell', 'shell', 'shell', 'shell', 'pearl', 'pearl', 'pearl', 'kelp']);
  assert.equal(f.sym, 'shell');
  assert.equal(f.mult, 9);
});

// Every card there is, expanded exactly. A card is nine independent draws from a bag of 52, so the
// chance of a given tally is the multinomial 9!/(prod k!) * prod w^k over 52^9. That sum is run in
// BigInt below, which makes the return an exact fraction rather than a measurement: the only
// floating point here is turning the answer into a percentage to print.
//
// The multiplier of each tally comes from the engine's own winOf, so this measures the game rather
// than restating a spreadsheet.
test('all 48,620 tallies, expanded exactly: the house keeps 3.4%', () => {
  const W = sc.PAYS.map((r) => BigInt(r.weight));
  const S = W.length;
  const fact = [1n];
  for (let i = 1; i <= N; i++) fact.push(fact[i - 1] * BigInt(i));
  const den = BigInt(sc.BAG_SIZE) ** BigInt(N);

  let num = 0n, hit = 0n, ways = 0n, tallies = 0;
  const byMult = new Map();
  const vec = new Array(S).fill(0);
  const cells = new Array(N);
  (function walk(i, left) {
    if (i === S - 1) {
      vec[i] = left;
      let coef = fact[N], prod = 1n, at = 0;
      for (let k = 0; k < S; k++) {
        coef /= fact[vec[k]];
        prod *= W[k] ** BigInt(vec[k]);
        for (let c = 0; c < vec[k]; c++) cells[at++] = sc.SYMBOLS[k];
      }
      const n = coef * prod;
      const mult = sc.winOf(cells).mult;
      num += n * BigInt(mult);
      ways += n;
      tallies += 1;
      if (mult) hit += n;
      byMult.set(mult, (byMult.get(mult) || 0n) + n);
      return;
    }
    for (let k = 0; k <= left; k++) { vec[i] = k; walk(i + 1, left - k); }
    vec[i] = 0;
  })(0, N);

  // Every card is accounted for exactly once: the tallies have to add up to the whole bag raised to
  // the nine, or something was double counted and the return is measured against the wrong total
  assert.equal(ways, den, 'the tallies do not cover every card');
  assert.equal(tallies, 48620, 'compositions of 9 into 10 parts');

  // a percentage out of an exact fraction, scaled in BigInt first so the rarest row (one card in
  // 375,940) still prints as a number rather than as a rounded zero
  const asPct = (n, d) => Number((n * 100000000000000n) / d) / 1000000000000;
  const rtp = asPct(num, den);
  const hitPct = asPct(hit, den);
  console.log('  mult'.padEnd(10) + 'chance'.padStart(11) + 'once in'.padStart(12) + 'of the return'.padStart(15));
  for (const m of Array.from(byMult.keys()).sort((a, b) => a - b)) {
    const n = byMult.get(m);
    const chance = asPct(n, den);
    console.log('  ' + (m ? 'x' + m : 'nothing').padEnd(8) + (chance.toFixed(5) + '%').padStart(12)
      + (chance ? (100 / chance).toFixed(0) : '-').padStart(12)
      + (m ? (m * chance / rtp * 100).toFixed(2) + '%' : '-').padStart(15));
  }
  console.log('  return ' + rtp.toFixed(4) + '%   something pays once in '
    + (100 / hitPct).toFixed(2) + ' cards (' + hitPct.toFixed(4) + '%)');
  console.log('  gross ' + num + ' over ' + den + ' cards staked');

  // The band every game in this casino sits in. The figure is exact, so this only moves if the
  // table or the weights do
  assert.equal(num, 2684060588414604n, 'the exact gross, over 52^9 cards staked');
  assert.ok(rtp > 96 && rtp < 97, 'the card returns ' + rtp.toFixed(4) + '%');
  // Over half of all cards pay. That is what forces the three-alike row to be a flat 1: at twice
  // the bet it would return more than everything staked before a four-copy card was paid at all
  assert.ok(hitPct > 50, 'only ' + hitPct.toFixed(2) + '% of cards pay');
  const flat = asPct(byMult.get(1), den);
  assert.ok(flat > 40, 'the bet comes back on only ' + flat.toFixed(2) + '% of cards');
  // and the arithmetic that forces it: 42% of cards pay the flat row, so raising it from the bet to
  // twice the bet adds at least that 42% onto the return and takes the table past everything
  // staked. "At least", because a flat row of 2 would also become the best row on some cards it is
  // not the best row on now, and that can only add more
  assert.ok(rtp + flat > 100, 'three alike at twice the bet would return at least ' + (rtp + flat).toFixed(2) + '%');
  // and the top row is decoration, not the table: a player who never sees it is still paid 96%
  const top = sc.PAYS[0].mult[3];
  const jack = asPct(byMult.get(top), den);
  assert.ok(jack * top / rtp < 0.01, 'the top row carries ' + (jack * top / rtp * 100).toFixed(2) + '% of the return');
  assert.ok(rtp - jack * top > 96, 'without the top row the card returns ' + (rtp - jack * top).toFixed(2) + '%');
});

// --- the deal and the squares -------------------------------------------------------------

test('a card deals nine squares from the shared roll stream', () => {
  for (let i = 0; i < 2000; i++) {
    const cells = sc.dealOf('deal-' + i);
    assert.equal(cells.length, N);
    for (const s of cells) assert.ok(sc.ROW[s], 'dealt an unknown ' + s);
  }
  // the squares come off cards.js's seeded stream: one PRNG in the repo, not a second copy
  for (let i = 0; i < 200; i++) {
    const seed = 'stream-' + i;
    const roll = C.rollsFrom(seed);
    assert.deepEqual(sc.dealOf(seed), ALL.map(() => sc.BAG[Math.floor(roll() * sc.BAG_SIZE)]));
  }
});

test('the bag is drawn from evenly, so a symbol turns up as often as its weight', () => {
  // The return above is exact given even draws. This is the check that the engine's own rolls really
  // land evenly, which is what makes that expansion a measurement of the game rather than of a
  // spreadsheet. Fixed seeds, so the counts are the same on every run
  const DEALS = 40000;
  const tol = 5; // in standard errors
  const seen = new Map(sc.SYMBOLS.map((s) => [s, 0]));
  for (let i = 0; i < DEALS; i++) {
    for (const s of sc.dealOf('even-' + i)) seen.set(s, seen.get(s) + 1);
  }
  const total = DEALS * N;
  console.log('  symbol'.padEnd(14) + 'dealt'.padStart(10) + 'in the bag'.padStart(12));
  let worst = 0, worstAt = '';
  for (const row of sc.PAYS) {
    const got = seen.get(row.sym) / total;
    const p = row.weight / sc.BAG_SIZE;
    const off = Math.abs(got - p) / Math.sqrt(p * (1 - p) / total);
    if (off > worst) { worst = off; worstAt = row.sym; }
    console.log('  ' + row.sym.padEnd(12) + pct(got).padStart(10) + pct(p).padStart(12));
    assert.ok(off < tol, row.sym + ' came up ' + pct(got) + ' against ' + pct(p));
  }
  console.log('  ' + total.toLocaleString('en-US') + ' squares, furthest off: ' + worst.toFixed(1) + ' SE (' + worstAt + ')');
});

test('the order the squares are rubbed off in cannot change the card', () => {
  // The nine symbols are dealt when the card is bought, so this is a property of the engine's shape
  // rather than of its arithmetic. It is the one thing that makes the game a lottery ticket
  const shuffleOf = (seed) => C.shuffle(ALL, seed);
  for (let i = 0; i < 300; i++) {
    const seed = 'order-' + i;
    const straight = rubAll(sc.newRound({ seed, id: 'id-' + i, bet: 100 }));
    const jumbled = rubAll(sc.newRound({ seed, id: 'id-' + i, bet: 100 }), shuffleOf('mix-' + i));
    const atOnce = reveal(sc.newRound({ seed, id: 'id-' + i, bet: 100 }));
    assert.deepEqual(V(jumbled), V(straight), seed);
    assert.deepEqual(V(atOnce), V(straight), seed + ' rubbed off in one press');
    assert.equal(straight.phase, 'done');
  }
});

test('a card settles on the ninth square, once, and nothing can be played on it after that', () => {
  let st = card(pile('crab', 4));
  for (let i = 0; i < N - 1; i++) {
    st = rub(st, i);
    assert.equal(st.phase, 'scratch', 'settled after ' + (i + 1) + ' squares');
    assert.equal(st.win, null, 'a prize was named with ' + (N - i - 1) + ' squares still covered');
    assert.equal(st.net, null);
  }
  st = rub(st, N - 1);
  assert.equal(st.phase, 'done');
  assert.equal(st.win.sym, 'crab');
  assert.equal(st.net, 10 * 15 - 10);
  // and the card is closed
  for (const op of [{ op: 'scratch', cell: 0 }, { op: 'reveal' }]) {
    assert.equal(sc.whyNot(st, op), 'the card is finished');
    assert.equal(sc.act(st, op), st, 'a refused move gives back the very same object');
  }
  assert.equal(sc.whyNot(null, { op: 'reveal' }), 'the card is finished');
  assert.equal(sc.whyNot(undefined, { op: 'scratch', cell: 0 }), 'the card is finished');
});

// The card where eight squares already fix the answer, counted exactly, because the engine's
// decision not to settle early rests on which way it points rather than on its being rare. Expanded
// over the eight-square tallies, which is the same multinomial as above with one fewer draw: the
// ninth square is independent of them, so "could any symbol under it change the prize" is a
// question about the eight on the table and nothing else
test('eight squares fix the prize once in 65 cards, and almost always at nothing', () => {
  const W = sc.PAYS.map((r) => BigInt(r.weight));
  const S = W.length;
  const SHOWN = N - 1;
  const fact = [1n];
  for (let i = 1; i <= N; i++) fact.push(fact[i - 1] * BigInt(i));
  const den = BigInt(sc.BAG_SIZE) ** BigInt(SHOWN);
  // what `count` copies of the symbol at `i` pay, zero under the pay line
  const payAt = (i, count) => (count < sc.MIN_MATCH ? 0 : sc.PAYS[i].mult[Math.min(count, sc.TOP_MATCH) - sc.MIN_MATCH]);

  let ways = 0n, fixedAtPrize = 0n, fixedAtNothing = 0n;
  const vec = new Array(S).fill(0);
  (function walk(i, left) {
    if (i === S - 1) {
      vec[i] = left;
      let coef = fact[SHOWN], prod = 1n, best = 0;
      for (let k = 0; k < S; k++) {
        coef /= fact[vec[k]];
        prod *= W[k] ** BigInt(vec[k]);
        best = Math.max(best, payAt(k, vec[k]));
      }
      const n = coef * prod;
      ways += n;
      // the prize is fixed when no symbol the last square could hold would pay more than what is
      // already showing. Read off the eight shown squares alone, which is what makes it honest
      let fixed = true;
      for (let k = 0; k < S; k++) if (payAt(k, vec[k] + 1) > best) { fixed = false; break; }
      if (fixed) { if (best > 0) fixedAtPrize += n; else fixedAtNothing += n; }
      return;
    }
    for (let k = 0; k <= left; k++) { vec[i] = k; walk(i + 1, left - k); }
    vec[i] = 0;
  })(0, SHOWN);

  assert.equal(ways, den, 'the eight-square tallies do not cover every card');
  const asPct = (n) => Number((n * 100000000000000n) / den) / 1000000000000;
  const prize = asPct(fixedAtPrize), nothing = asPct(fixedAtNothing), both = prize + nothing;
  const once = (x) => (x ? '1 in ' + (100 / x).toFixed(0) : '-');
  console.log('  with one square left, the prize is already fixed on ' + both.toFixed(4) + '% of cards (' + once(both) + ')');
  console.log('    fixed at a prize   ' + prize.toFixed(4) + '%  ' + once(prize));
  console.log('    fixed at nothing   ' + nothing.toFixed(4) + '%  ' + once(nothing));

  // Both halves are needed to make the engine's case, and they say different things:
  //  - fixing happens often enough that "it would never run" is not the argument
  assert.ok(both > 0.01, 'eight squares fix the prize on only ' + both.toFixed(4) + '% of cards');
  //  - and it points the wrong way. An early settlement would be telling the player they have
  //    already lost about thirty times as often as it would hand them a prize early
  assert.ok(nothing > prize * 20, 'fixed at nothing ' + nothing.toFixed(4) + '% against a prize ' + prize.toFixed(4) + '%');
  // the figures scratch.js's header quotes, so the header cannot drift from them
  assert.equal(Math.round(100 / both), 65);
  assert.equal(Math.round(100 / prize), 2298);
  assert.equal(Math.round(100 / nothing), 67);
});

test('the last square is a real last square: the prize can still change on it', () => {
  // This is why no figure is shown before the ninth square. Three crabs are showing and the fourth
  // is under the one square left: at that moment the card is worth the bet back, and a square later
  // it is worth fifteen times it
  const cells = ['crab', 'crab', 'crab', 'crab', 'kelp', 'shell', 'bottle', 'coral', 'pearl'];
  let st = card(cells, 100);
  for (const i of [0, 1, 2, 4, 5, 6, 7, 8]) st = rub(st, i);
  const before = V(st);
  assert.equal(before.left, 1);
  assert.equal(before.counts.crab, 3);
  assert.equal(before.win, null, 'three crabs showing is not a prize yet');
  assert.equal(before.net, null);
  assert.equal(sc.winOf(before.cells.map((s, i) => (s == null ? 'kelp' : s))).mult, 1,
    'what the shown squares alone would have been worth');
  const after = V(rub(st, 3));
  assert.equal(after.win.count, 4);
  assert.equal(after.win.mult, 15);
  assert.equal(after.net, 100 * 15 - 100);
});

test('a square is one of the nine, and a rubbed square cannot be rubbed again', () => {
  const st = card(pile('kelp', 3));
  const bad = [undefined, null, '3', 3.5, -1, N, 99, {}, [], NaN, true];
  for (const cell of bad) {
    assert.equal(sc.whyNot(st, { op: 'scratch', cell }), 'a scratch names a square from 0 to 8', JSON.stringify(cell));
    assert.equal(sc.act(st, { op: 'scratch', cell }), st, JSON.stringify(cell));
  }
  for (const cell of ALL) assert.equal(sc.whyNot(st, { op: 'scratch', cell }), null);
  // badCell is the same answer on its own, which is what the host refuses on
  assert.equal(sc.badCell(0), null);
  assert.equal(sc.badCell(8), null);
  assert.equal(sc.badCell(9), 'a scratch names a square from 0 to 8');
  // the same square twice is refused, and the second ask changes nothing
  const once = rub(st, 4);
  assert.equal(sc.whyNot(once, { op: 'scratch', cell: 4 }), 'that square is already scratched');
  assert.equal(rub(once, 4), once, 'a second rub gives back the very same object');
  assert.equal(V(once).left, N - 1);
  // and no other action exists
  assert.deepEqual(sc.OPS, ['scratch', 'reveal']);
  assert.equal(sc.whyNot(st, { op: 'peek', cell: 0 }), 'unknown action');
  assert.equal(sc.whyNot(st, 'cashout'), 'unknown action');
  assert.equal(sc.whyNot(st, 'scratch'), 'a scratch names a square from 0 to 8', 'a scratch without a square is not a scratch');
  assert.equal(sc.whyNot(st, 'reveal'), null, 'reveal is the whole move, so a bare name is enough');
  assert.equal(sc.act(st, { op: 'peek', cell: 0 }), st);
});

test('reveal turns over everything that is left, from anywhere in the card', () => {
  const cells = pile('pearl', 5);
  for (const first of [[], [0], [0, 1, 2], ALL.slice(0, 8)]) {
    let st = card(cells, 20);
    for (const i of first) st = rub(st, i);
    const out = reveal(st);
    assert.equal(out.phase, 'done', 'revealed from ' + first.length + ' squares');
    assert.equal(V(out).left, 0);
    assert.deepEqual(V(out).cells, cells);
    assert.equal(out.win.sym, 'pearl');
    assert.equal(out.win.mult, 50);
    assert.equal(out.net, 20 * 50 - 20);
  }
  // revealing a card nobody has touched is the one-press way to play it
  const straight = reveal(card(cells, 20));
  assert.deepEqual(V(straight), V(rubAll(card(cells, 20))));
});

test('act never mutates its input', () => {
  for (let i = 0; i < 300; i++) {
    const st = sc.newRound({ seed: 'mut-' + i, bet: 100 });
    const before = snapshot(st);
    sc.act(st, { op: 'scratch', cell: i % N });
    sc.act(st, { op: 'reveal' });
    sc.act(st, { op: 'scratch', cell: 99 });   // refused
    sc.act(st, 'scratch');                      // refused
    assert.equal(snapshot(st), before);
    // and a half-rubbed card is not mutated by the rest of the moves either
    const half = rubAll(st, [0, 1, 2, 3]);
    const halfWas = snapshot(half);
    sc.act(half, { op: 'reveal' });
    sc.act(half, { op: 'scratch', cell: 0 });
    assert.equal(snapshot(half), halfWas);
  }
});

test('the bet is a whole number the top row can be paid on', () => {
  assert.throws(() => sc.newRound({ seed: 'x', bet: 1.5 }), RangeError);
  assert.throws(() => sc.newRound({ seed: 'x', bet: 0 }), RangeError);
  assert.throws(() => sc.newRound({ seed: 'x', bet: 2 ** 53 }), RangeError);
  const top = sc.PAYS[0].mult[3];
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / top);
  assert.equal(sc.newRound({ seed: 'x', bet: cap }).bet, cap);
  assert.ok(Number.isSafeInteger(cap * top), 'the cap itself still pays exactly');
  assert.throws(() => sc.newRound({ seed: 'x', bet: cap + 1 }), RangeError);
  // a stacked card is checked at the deal, not eight squares later
  assert.throws(() => sc.newRound({ seed: 'x', bet: 10, cells: ['kelp'] }), RangeError);
  assert.throws(() => sc.newRound({ seed: 'x', bet: 10, cells: new Array(N).fill('lobster') }), RangeError);
});

// --- money --------------------------------------------------------------------------------

test('the payout is a whole multiple of the bet, and three alike hands the bet straight back', () => {
  // the chips are 10 / 100 / 1K, so these are the bets a player can actually build
  for (const bet of [10, 20, 100, 110, 1000, 1010, 9990, 123450]) {
    for (const row of sc.PAYS) {
      for (const n of [3, 4, 5, 6]) {
        const out = reveal(card(pile(row.sym, n), bet));
        assert.equal(out.win.mult, row.mult[n - 3], row.sym + ' x' + n);
        assert.equal(out.net, bet * row.mult[n - 3] - bet, row.sym + ' x' + n + ' at ' + bet);
        assert.ok(Number.isSafeInteger(out.net), 'net ' + out.net);
        assert.equal(out.net, Math.trunc(out.net), 'no fraction survives the payout');
      }
    }
  }
  // the pay line itself: three alike returns the bet, two alike loses it
  const back = reveal(card(pile('crab', 3), 10));
  assert.equal(back.win.mult, 1);
  assert.equal(back.net, 0, 'the minimum bet comes back whole');
  const gone = reveal(card(pile('crab', 2), 10));
  assert.equal(gone.win, sc.NO_WIN);
  assert.equal(gone.net, -10, 'a card that misses costs the bet and nothing else');
  assert.equal(V(gone).win.sym, null, 'the result chip is a row even when nothing was won');
  // and the biggest thing on the card, at the minimum bet
  assert.equal(reveal(card(new Array(N).fill('crab'), 10)).net, 9990);
});

test('the bet does not change the game, only the size of it', () => {
  // every multiplier is whole, so there is no flooring to make a small bet worse (plinko's is the
  // opposite: there, a bin is a fraction and the remainder stays with the house)
  for (let i = 0; i < 400; i++) {
    const seed = 'scale-' + i;
    const one = reveal(sc.newRound({ seed, bet: 1 }));
    for (const bet of [10, 97, 1000]) {
      const big = reveal(sc.newRound({ seed, bet }));
      assert.deepEqual(big.cells, one.cells, seed);
      assert.equal(big.win.mult, one.win.mult, seed);
      assert.equal(big.net, one.net * bet, seed + ' at ' + bet);
    }
  }
});

test('a live card has its bet riding on it, and a finished one has nothing', () => {
  const st = card(pile('kelp', 3), 250);
  assert.equal(sc.stake(st), 250, 'the bet is riding from the deal');
  assert.equal(sc.stake(rub(st, 0)), 250, 'and still riding mid-card');
  assert.equal(sc.stake(reveal(st)), 0, 'a settled card has nothing riding');
  assert.equal(sc.stake(null), 0);
});

// --- determinism and what the webview may see ----------------------------------------------

test('the same seed deals the same card, and the id is not the seed', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'det-' + i;
    assert.deepEqual(V(reveal(sc.newRound({ seed, bet: 100 }))), V(reveal(sc.newRound({ seed, bet: 100 }))));
  }
  const dealt = (seed) => sc.dealOf(seed).join(',');
  const distinct = new Set(Array.from({ length: 300 }, (_, i) => dealt('d' + i)));
  assert.ok(distinct.size > 250, 'only ' + distinct.size + ' different cards in 300 seeds');
  // the id names the card and does not deal it: handed the id, the bag deals something else
  const id = 'c0ffee';
  const st = sc.newRound({ seed: 'the-seed', id, bet: 10 });
  assert.equal(st.id, id);
  assert.notDeepEqual(sc.dealOf(id), sc.dealOf('the-seed'));
  assert.equal('seed' in V(st), false, 'a live card does not carry its seed');
  assert.equal(V(reveal(st)).seed, 'the-seed', 'the seed arrives once the card is finished');
  assert.notEqual(V(reveal(st)).id, V(reveal(st)).seed);
});

// The strongest statement this file makes. Two cards that agree on the squares already rubbed off
// and differ underneath produce the SAME view, which is what "a view is a function of the shown
// squares" means. A walk looking for symbol names could not say this: the paytable names all ten
// symbols, so the leak would be hiding in plain sight
test('a view says nothing about a square that has not been rubbed off', () => {
  const fillers = ['kelp', 'shell', 'coral', 'bottle'];
  for (let i = 0; i < 200; i++) {
    const seed = 'hide-' + i;
    const base = sc.dealOf(seed);
    // the squares this pair agrees on: a different subset every time round
    const open = ALL.filter((k) => ((i >> (k % 8)) & 1) === 1 || k === i % N);
    if (open.length === N) continue; // nothing left covered, so nothing to hide
    for (const filler of fillers) {
      const other = base.map((s, k) => (open.includes(k) ? s : filler));
      const a = open.reduce((s, k) => rub(s, k), sc.newRound({ seed, id: 'same', bet: 50, cells: base }));
      const b = open.reduce((s, k) => rub(s, k), sc.newRound({ seed, id: 'same', bet: 50, cells: other }));
      assert.deepEqual(V(b), V(a), seed + ' with ' + filler + ' underneath');
      // the shown squares are the ones that were asked for, and no others
      const v = V(a);
      for (const k of ALL) {
        if (open.includes(k)) assert.equal(v.cells[k], base[k], 'square ' + k);
        else assert.equal(v.cells[k], null, 'square ' + k + ' is showing and nobody rubbed it');
      }
      assert.equal(v.left, N - open.length);
      // and the tally is the tally of what is showing, so the screen counts nothing itself
      const tally = {};
      for (const k of open) tally[base[k]] = (tally[base[k]] || 0) + 1;
      assert.deepEqual(v.counts, tally);
    }
  }
});

test('a view carries the whole card and the whole table', () => {
  for (let i = 0; i < 200; i++) {
    const st = reveal(sc.newRound({ seed: 'view-' + i, id: 'id-' + i, bet: 50 }));
    const v = V(st);
    assert.equal(v.phase, 'done');
    assert.equal(v.left, 0);
    assert.deepEqual(v.cells, st.cells);
    assert.ok(v.win && 'sym' in v.win && 'count' in v.win && 'mult' in v.win);
    assert.equal(v.net, st.bet * v.win.mult - st.bet);
    // the winning squares really hold the winning symbol
    for (const k of v.win.cells) assert.equal(v.cells[k], v.win.sym, 'square ' + k);
    if (v.win.sym) assert.equal(v.win.cells.length, v.win.count);
    // the screen holds no numbers of its own
    assert.equal(v.pays, sc.PAYS);
    assert.equal(v.cellCount, N);
    assert.equal(v.side, sc.SIDE);
    assert.equal(v.minMatch, 3);
    assert.equal(v.topMatch, 6);
    assert.equal(v.bagSize, sc.BAG_SIZE);
    assert.equal(v.minBet, 10);
    assert.deepEqual(v.can, { scratch: false, reveal: false });
  }
  // what the screen may press, at every stage
  const live = card(pile('kelp', 3));
  assert.deepEqual(V(live).can, { scratch: true, reveal: true });
  assert.deepEqual(V(rub(live, 0)).can, { scratch: true, reveal: true });
  assert.deepEqual(V(reveal(live)).can, { scratch: false, reveal: false });
});

test('the idle view is a bet screen with the paytable on it', () => {
  const v = sc.view(null);
  assert.equal(v.phase, 'bet');
  assert.equal(v.id, null);
  assert.equal(v.bet, null);
  assert.deepEqual(v.cells, new Array(N).fill(null));
  assert.equal(v.left, N);
  assert.deepEqual(v.counts, {});
  assert.equal(v.win, null);
  assert.equal(v.net, null);
  assert.equal('seed' in v, false);
  assert.equal(v.pays, sc.PAYS);
  assert.equal(v.pays.length, 10);
  assert.deepEqual(v.can, { scratch: false, reveal: false });
  // the two views agree on everything the card is, and differ only in what one card did
  const open = V(card(pile('kelp', 3)));
  for (const k of ['pays', 'cellCount', 'side', 'minMatch', 'topMatch', 'bagSize', 'minBet']) {
    assert.equal(open[k], v[k], k);
  }
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
