// Sic bo: the felt, every one of the 216 rolls against every row, and what the house keeps.
// No dependencies: node's assert only. Run: node test/sicbo.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const fs = require('fs');
const sb = require(path.join(__dirname, '..', 'sicbo.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const FACES = sb.FACES;
const V = (st) => sb.view(st);
const snapshot = (st) => JSON.stringify(st);
const bet = (opts) => sb.newRound(Object.assign({ seed: 'x', bet: 100, kind: 'small' }, opts));
// A round pinned to three dice, which is how a test chooses the roll
const on = (dice, kind, total, amount) => sb.newRound({
  seed: 'pinned', bet: amount == null ? 100 : amount, kind, total, dice
});

// every roll three dice can make, once
const ROLLS = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) ROLLS.push([a, b, c]);

// the bets a player can build out of the chips, plus the ones where the floor bites hardest
const BETS = [100, 101, 103, 107, 110, 150, 199, 200, 300, 999, 1000, 1001, 10000, 123457];

const pct = (x) => (x * 100).toFixed(4) + '%';

// A copy of the engine with one line of its table broken, so the check it runs when it loads can be
// watched doing its job. A check that only ever passes is not a check
function loadBroken(from, to) {
  const file = path.join(__dirname, '..', 'sicbo.js');
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(from, to);
  assert.notEqual(out, src, 'the sabotage did not apply: ' + from);
  const mod = { exports: {} };
  const dir = path.dirname(file);
  new Function('require', 'module', 'exports', '__dirname', out)(
    (id) => require(id.charAt(0) === '.' ? path.join(dir, id) : id), mod, mod.exports, dir);
  return mod.exports;
}

// --- the felt -----------------------------------------------------------------------------------

test('four bets, seventeen rows, and one pricing rule behind all of them', () => {
  assert.equal(FACES, 216);
  assert.equal(ROLLS.length, FACES);
  assert.deepEqual(sb.KINDS, ['small', 'big', 'triple', 'total']);
  assert.equal(sb.PAYS.length, 3 + (sb.MAX_TOTAL - sb.MIN_TOTAL + 1));
  assert.deepEqual(sb.PAYS.slice(0, 3).map((r) => r.kind), ['small', 'big', 'triple']);
  for (const row of sb.PAYS) {
    // the one rule: the top of the band, split over how often the row comes up
    assert.equal(row.mult100, sb.multFor(row.ways), row.name);
    assert.deepEqual(row.chance, { num: row.ways, den: FACES });
    assert.ok(Number.isSafeInteger(row.mult100) && row.mult100 > 100, row.name + ' pays ' + row.mult100);
    // and the rule itself: never above the band's ceiling, and within one hundredth of it
    assert.ok(row.ways * row.mult100 <= sb.BAND_HI * FACES, row.name + ' is priced over the band');
    assert.ok(row.ways * (row.mult100 + 1) > sb.BAND_HI * FACES, row.name + ' is priced a hundredth low');
  }
  // small and big are the same bet mirrored, and between them they are every roll but the triples
  const small = sb.FLAT.small, big = sb.FLAT.big;
  assert.equal(small.ways, 105);
  assert.equal(big.ways, 105);
  assert.equal(small.mult100, 199);
  assert.equal(big.mult100, 199);
  assert.equal(small.ways + big.ways + sb.FLAT.triple.ways, FACES);
  assert.equal(sb.FLAT.triple.ways, 6);
  assert.equal(sb.FLAT.triple.mult100, 3492);
  // the totals are symmetric about the middle, so the dial reads the same from either end
  for (let t = sb.MIN_TOTAL; t <= sb.MAX_TOTAL; t++) {
    const mirror = 21 - t;
    assert.equal(sb.BY_TOTAL[t].ways, sb.BY_TOTAL[mirror].ways, 'total ' + t);
    assert.equal(sb.BY_TOTAL[t].mult100, sb.BY_TOTAL[mirror].mult100, 'total ' + t);
  }
  assert.equal(sb.BY_TOTAL[4].mult100, 6984);
  assert.equal(sb.BY_TOTAL[10].mult100, 776);
  // nobody outside can retune it
  assert.throws(() => { sb.PAYS[0].mult100 = 1; }, TypeError);
  assert.throws(() => { sb.PAYS.push({}); }, TypeError);
  assert.throws(() => { sb.KINDS.push('odd'); }, TypeError);
});

test('the counts are counted, not typed', () => {
  // every row's `ways` is checked against the enumeration rather than against itself
  for (const row of sb.PAYS) {
    let n = 0;
    for (const dice of ROLLS) if (sb.winsOn(sb.readOf(dice), row.kind, row.total)) n += 1;
    assert.equal(n, row.ways, row.name);
  }
  // a triple loses small and big both, which is what keeps those two off even money
  for (let f = 1; f <= 6; f++) {
    const read = sb.readOf([f, f, f]);
    assert.equal(read.triple, f);
    assert.equal(sb.winsOn(read, 'small'), false, 'a triple of ' + f + ' should lose small');
    assert.equal(sb.winsOn(read, 'big'), false, 'a triple of ' + f + ' should lose big');
    assert.equal(sb.winsOn(read, 'triple'), true);
    // and it still wins its own total, which is the one place the two bets overlap
    assert.equal(sb.winsOn(read, 'total', 3 * f), true);
  }
  // 3 and 18 are triples only, which is why they are not on the dial
  assert.equal(sb.badBet('total', 3), 'a total runs from 4 to 17');
  assert.equal(sb.badBet('total', 18), 'a total runs from 4 to 17');
  // small and big meet without a gap: 10 is the top of one and 11 the bottom of the other
  assert.equal(sb.SMALL_HI + 1, sb.BIG_LO);
});

// --- the return ---------------------------------------------------------------------------------

test('all 216 rolls x every row: the house keeps 3 to 4%, at every bet', () => {
  let worst = { rtp: 9 }, best = { rtp: -1 };
  console.log('  row'.padEnd(14) + 'ways'.padStart(6) + 'chance'.padStart(10) + 'once in'.padStart(9)
    + 'pays'.padStart(9) + 'return'.padStart(11));
  for (const row of sb.PAYS) {
    // the enumeration, at the smallest bet the game takes
    let gross = 0;
    for (const dice of ROLLS) {
      if (sb.winsOn(sb.readOf(dice), row.kind, row.total)) gross += sb.payoutOf(sb.MIN_BET, row.mult100);
    }
    const staked = FACES * sb.MIN_BET;
    console.log('  ' + row.name.padEnd(12) + String(row.ways).padStart(6) + pct(row.ways / FACES).padStart(10)
      + (FACES / row.ways).toFixed(1).padStart(9) + ('x' + (row.mult100 / 100).toFixed(2)).padStart(9)
      + pct(gross / staked).padStart(11));
    assert.ok(100 * gross >= sb.BAND_LO * staked && 100 * gross <= sb.BAND_HI * staked,
      row.name + ' returns ' + pct(gross / staked));
    // and over every bet in the list, so the floor is priced rather than assumed
    for (const amount of BETS) {
      const g = row.ways * sb.payoutOf(amount, row.mult100);
      const s = FACES * amount;
      const rtp = g / s;
      if (rtp < worst.rtp) worst = { rtp, row: row.name, bet: amount };
      if (rtp > best.rtp) best = { rtp, row: row.name, bet: amount };
      assert.ok(100 * g >= sb.BAND_LO * s && 100 * g <= sb.BAND_HI * s,
        row.name + ' at a bet of ' + amount + ' returns ' + pct(rtp));
    }
  }
  console.log('  over ' + (sb.PAYS.length * BETS.length) + ' (row, bet) pairs: worst ' + pct(worst.rtp)
    + ' on ' + worst.row + ' at ' + worst.bet + ', best ' + pct(best.rtp) + ' on ' + best.row);
  // the best is the table itself: the floor can only take, never give
  assert.ok(best.rtp <= sb.BAND_HI / 100);
  // the two widest rows are the ones the floor can hurt, because they win so often
  assert.ok(worst.row.indexOf('Small') === 0 || worst.row.indexOf('Big') === 0, 'worst was ' + worst.row);
});

test('a sweep of every bet from 100 to 2,000 holds the band on the widest rows', () => {
  let worst = { rtp: 9 };
  for (const row of [sb.FLAT.small, sb.FLAT.big, sb.BY_TOTAL[10], sb.BY_TOTAL[11]]) {
    for (let amount = sb.MIN_BET; amount <= 2000; amount++) {
      const g = row.ways * sb.payoutOf(amount, row.mult100);
      const s = FACES * amount;
      if (g / s < worst.rtp) worst = { rtp: g / s, row: row.name, bet: amount };
      assert.ok(100 * g >= sb.BAND_LO * s, row.name + ' at ' + amount + ' returns ' + pct(g / s));
    }
  }
  console.log('  7,604 bets: worst ' + pct(worst.rtp) + ' on ' + worst.row + ' at a bet of ' + worst.bet);
});

test('a floor of 10 would break the band, which is why it is 100', () => {
  // The figure MIN_BET is solved from. The floor eats under one credit on a win, and a win on small
  // comes up 48.6% of the time, so at a bet of 10 that is nearly 5% of the stake against a band 1%
  // wide. This is the same arithmetic the minefield and the tower settled on 100 for
  let bad = 0, worst = { rtp: 9 };
  for (const row of sb.PAYS) {
    const g = row.ways * sb.payoutOf(10, row.mult100);
    const s = FACES * 10;
    if (g / s < worst.rtp) worst = { rtp: g / s, row: row.name };
    if (100 * g < sb.BAND_LO * s) bad += 1;
  }
  console.log('  at a bet of 10: ' + bad + ' of ' + sb.PAYS.length + ' rows fall out of the band, worst '
    + pct(worst.rtp) + ' on ' + worst.row);
  assert.ok(bad >= 2, 'only ' + bad + ' rows break at a bet of 10');
  assert.equal(sb.MIN_BET, 100);
});

test('the check it runs when it loads has teeth', () => {
  // one credit more on every row: the order of the table survives it and the band does not
  assert.throws(() => loadBroken(
    'return (top - (top % ways)) / ways;',
    'return (top - (top % ways)) / ways + 1;'
  ), /returns over the band/);
  // a small that runs one total too far: the count stops being half the felt
  assert.throws(() => loadBroken('const SMALL_LO = 4, SMALL_HI = 10;', 'const SMALL_LO = 4, SMALL_HI = 11;'),
    /small and big do not cover the roll/);
  // and the floor that holds the widest rows inside the band
  assert.throws(() => loadBroken('const MIN_BET = 100;', 'const MIN_BET = 10;'), /cannot hold Small/);
  // the sabotage harness itself works, or the three above would pass on a typo
  assert.equal(loadBroken('const MIN_BET = 100;', 'const MIN_BET = 100; /* x */').MIN_BET, 100);
});

// --- the roll -----------------------------------------------------------------------------------

test('a roll is three dice, from the shared roll stream', () => {
  for (let i = 0; i < 3000; i++) {
    const dice = sb.diceOf('r-' + i);
    assert.equal(dice.length, 3);
    for (const d of dice) assert.ok(Number.isInteger(d) && d >= 1 && d <= 6, 'die ' + d);
  }
  // the dice come off cards.js's seeded stream: one PRNG in the repo, not a second copy
  for (let i = 0; i < 200; i++) {
    const seed = 'stream-' + i;
    const r = C.rollsFrom(seed);
    assert.deepEqual(sb.diceOf(seed), [0, 1, 2].map(() => 1 + Math.floor(r() * 6)));
  }
  // and a pinned roll has to be three real dice
  assert.throws(() => sb.readOf([1, 2]), RangeError);
  assert.throws(() => sb.readOf([1, 2, 3, 4]), RangeError);
  assert.throws(() => sb.readOf([1, 2, 7]), RangeError);
  assert.throws(() => sb.readOf([1, 2, 0]), RangeError);
  assert.throws(() => sb.readOf([1, 2, 1.5]), RangeError);
  assert.throws(() => sb.readOf('123'), RangeError);
});

test('the dice land evenly, which is what makes the enumeration a fact about the engine', () => {
  // The return above is exact GIVEN even dice. This is the check that the engine's own stream
  // really is even, which is the one thing an enumeration cannot see. Fixed seeds, same counts
  // every run
  const N = 120000;
  const byFace = [0, 1, 2].map(() => new Array(7).fill(0));
  const byTotal = new Array(19).fill(0);
  let triples = 0;
  for (let i = 0; i < N; i++) {
    const dice = sb.diceOf('even-' + i);
    for (let d = 0; d < 3; d++) byFace[d][dice[d]] += 1;
    const read = sb.readOf(dice);
    byTotal[read.total] += 1;
    if (read.triple !== null) triples += 1;
  }
  const p = 1 / 6, se = Math.sqrt(p * (1 - p) / N);
  let worst = 0, worstAt = '';
  for (let d = 0; d < 3; d++) {
    for (let f = 1; f <= 6; f++) {
      const off = Math.abs(byFace[d][f] / N - p) / se;
      if (off > worst) { worst = off; worstAt = 'die ' + d + ' face ' + f; }
      assert.ok(off < 5, 'die ' + d + ' showed ' + f + ' ' + pct(byFace[d][f] / N) + ' of the time');
    }
  }
  console.log('  ' + (N * 3).toLocaleString('en-US') + ' dice, furthest off: ' + worst.toFixed(1) + ' SE (' + worstAt + ')');
  // the totals follow the 216, which is the distribution the whole table was priced off
  for (let t = 3; t <= 18; t++) {
    const q = sb.waysOf('total', t) / FACES;
    const off = Math.abs(byTotal[t] / N - q) / Math.sqrt(q * (1 - q) / N);
    assert.ok(off < 5, 'total ' + t + ' came up ' + pct(byTotal[t] / N) + ', not ' + pct(q));
  }
  const q = 6 / FACES;
  const off = Math.abs(triples / N - q) / Math.sqrt(q * (1 - q) / N);
  console.log('  triples ' + pct(triples / N) + ' against ' + pct(q) + ' (' + off.toFixed(1) + ' SE)');
  assert.ok(off < 5, 'triples came up ' + pct(triples / N));
});

// --- the round ----------------------------------------------------------------------------------

test('a roll is one press: it is born settled and nothing can be played on it', () => {
  const st = on([1, 1, 2], 'small', null, 100);
  assert.equal(st.phase, 'done');
  assert.equal(st.sum, 4);
  assert.equal(st.win, true);
  assert.equal(st.payout, 199);
  assert.equal(st.net, 99);
  assert.deepEqual(sb.OPS, []);
  for (const op of [undefined, null, 'roll', 'bet', { op: 'roll' }, { op: 'close', tiles: [1] }]) {
    assert.equal(sb.whyNot(st, op), 'a roll settles on the press, so there is nothing to play');
    assert.equal(sb.act(st, op), st, 'a refused action gives back the very same object');
  }
  assert.equal(sb.whyNot(null, 'roll'), 'a roll settles on the press, so there is nothing to play');
  assert.equal(sb.stake(st), 0);
  assert.equal(sb.stake(null), 0);
});

test('a refused move moves no money, and act never mutates its input', () => {
  for (let i = 0; i < 300; i++) {
    const st = sb.newRound({ seed: 'mut-' + i, bet: 100, kind: 'total', total: 4 + (i % 14) });
    const before = snapshot(st);
    const net = st.net;
    sb.act(st, { op: 'roll' });
    sb.act(st, 'bank');
    sb.act(st, null);
    assert.equal(snapshot(st), before, 'act mutated the round it was handed');
    assert.equal(st.net, net, 'a refused action moved the money');
  }
});

test('a bet this game does not take is refused, with the sentence the player reads', () => {
  assert.equal(sb.badBet('small'), null);
  assert.equal(sb.badBet('big'), null);
  assert.equal(sb.badBet('triple'), null);
  assert.equal(sb.badBet('total', 10), null);
  for (const kind of ['odd', 'even', 'pair', '', null, undefined, 5, {}]) {
    assert.equal(sb.badBet(kind, 10), 'bet on small, big, a total or any triple', String(kind));
    assert.throws(() => sb.newRound({ seed: 'x', bet: 100, kind, total: 10 }), RangeError, String(kind));
  }
  for (const total of [3, 18, 0, -1, 1.5, '10', null, undefined, NaN]) {
    assert.equal(sb.badBet('total', total), 'a total runs from 4 to 17', String(total));
    assert.throws(() => sb.newRound({ seed: 'x', bet: 100, kind: 'total', total }), RangeError, String(total));
  }
  // a total handed to a bet that is not on a total is ignored rather than refused: the webview
  // sends both fields every time, and the row it is on is the one that decides
  const st = on([1, 1, 2], 'small', 17, 100);
  assert.equal(st.total, null);
  assert.equal(st.win, true);
  assert.equal(sb.rowFor('small', 17), sb.FLAT.small);
  assert.equal(sb.rowFor('nonsense', null), null);
});

// --- money --------------------------------------------------------------------------------------

test('every payout is a whole number, rounded the house way, and a win beats the bet', () => {
  for (const amount of BETS) {
    for (const row of sb.PAYS) {
      const pay = sb.payoutOf(amount, row.mult100);
      assert.ok(Number.isSafeInteger(pay), 'payout ' + pay);
      assert.ok(pay <= amount * row.mult100 / 100, row.name + ' at ' + amount + ' pays over the odds');
      assert.ok(pay > amount * row.mult100 / 100 - 1, row.name + ' at ' + amount + ' pays over a credit under');
      assert.ok(pay > amount, row.name + ' at a bet of ' + amount + ' pays ' + pay);
    }
  }
  // the round itself: a win pays the row, a loss costs the bet and nothing else
  const win = on([2, 2, 2], 'triple', null, 100);
  assert.equal(win.payout, 3492);
  assert.equal(win.net, 3392);
  assert.equal(win.mult100, 3492);
  const lose = on([2, 2, 3], 'triple', null, 100);
  assert.equal(lose.payout, 0);
  assert.equal(lose.net, -100);
  assert.equal(lose.mult100, 0);
  // the bet does not change the game, only the size of it
  for (const amount of [100, 500, 1000]) {
    const st = on([1, 2, 4], 'total', 7, amount);
    assert.equal(st.win, true);
    assert.equal(st.payout, sb.payoutOf(amount, sb.BY_TOTAL[7].mult100));
    assert.equal(st.net, Math.trunc(st.net), 'no fraction survives the payout');
  }
});

test('the bet is a whole number the top row can be paid on', () => {
  assert.throws(() => sb.newRound({ seed: 'x', bet: 1.5, kind: 'small' }), RangeError);
  assert.throws(() => sb.newRound({ seed: 'x', bet: 0, kind: 'small' }), RangeError);
  assert.throws(() => sb.newRound({ seed: 'x', bet: -100, kind: 'small' }), RangeError);
  assert.throws(() => sb.newRound({ seed: 'x', bet: 2 ** 53, kind: 'small' }), RangeError);
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / sb.TOP_MULT);
  assert.equal(sb.newRound({ seed: 'x', bet: cap, kind: 'total', total: 4 }).bet, cap);
  assert.ok(Number.isSafeInteger(cap * sb.TOP_MULT), 'the cap itself still pays exactly');
  assert.throws(() => sb.newRound({ seed: 'x', bet: cap + 1, kind: 'small' }), RangeError);
  assert.equal(sb.MIN_BET, 100);
  assert.equal(sb.idleView().minBet, 100);
  assert.equal(sb.TOP_MULT, sb.BY_TOTAL[4].mult100);
});

// --- determinism and what the webview sees ------------------------------------------------------

test('the same seed rolls the same dice, and the id is not the seed', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'det-' + i;
    assert.deepEqual(V(bet({ seed })), V(bet({ seed })));
  }
  const distinct = new Set(Array.from({ length: 400 }, (_, i) => sb.diceOf('d' + i).join(',')));
  assert.ok(distinct.size > 150, 'only ' + distinct.size + ' different rolls in 400 seeds');
  // the id names the round and does not roll it
  const id = 'c0ffee';
  const byId = sb.newRound({ seed: 'the-seed', id, bet: 100, kind: 'small' });
  assert.equal(byId.id, id);
  assert.notEqual(V(byId).id, V(byId).seed);
  assert.notDeepEqual(sb.diceOf(id), sb.diceOf('the-seed'));
  // and what the player bet on does not move the dice: the same seed rolls the same three
  for (let i = 0; i < 50; i++) {
    const seed = 'pick-' + i;
    const a = sb.newRound({ seed, bet: 100, kind: 'small' });
    const b = sb.newRound({ seed, bet: 100, kind: 'total', total: 17 });
    assert.deepEqual(a.dice, b.dice, seed);
  }
});

test('the view carries the felt and the seed only once the round is over', () => {
  for (let i = 0; i < 200; i++) {
    const kinds = ['small', 'big', 'triple', 'total'];
    const kind = kinds[i % 4];
    const st = sb.newRound({ seed: 'view-' + i, id: 'id-' + i, bet: 100, kind, total: 4 + (i % 14) });
    const v = V(st);
    assert.equal(v.phase, 'done');
    assert.deepEqual(v.dice, st.dice);
    assert.notEqual(v.dice, st.dice, 'the view hands over a copy of the dice');
    assert.equal(v.sum, st.sum);
    assert.equal(v.triple, st.triple);
    assert.equal(v.win, st.win);
    assert.equal(v.row, sb.rowFor(st.kind, st.total));
    assert.equal(v.payout, st.payout);
    assert.equal(v.net, st.net);
    assert.equal(v.pays, sb.PAYS);
    assert.equal(v.minBet, sb.MIN_BET);
    assert.deepEqual(v.can, {});
    assert.equal(v.seed, st.seed);
  }
  // the rule is the SHAPE of the function, not a property of there being one phase
  const live = Object.assign({}, bet({ seed: 'live' }), { phase: 'roll' });
  assert.equal('seed' in sb.view(live), false, 'a live round must not carry its seed');
  assert.equal('seed' in sb.idleView(), false, 'there is no roll, so there is no seed');
});

test('the idle view is a bet screen with the whole felt on it', () => {
  const v = sb.idleView();
  assert.equal(v.phase, 'bet');
  assert.equal(v.id, null);
  assert.equal(v.bet, null);
  assert.equal(v.kind, null);
  assert.deepEqual(v.dice, []);
  assert.equal(v.win, null);
  assert.equal(v.net, null);
  assert.equal(v.pays, sb.PAYS);
  assert.equal(v.defaultTotal, sb.DEFAULT_TOTAL);
  assert.deepEqual(v.can, {});
  assert.deepEqual(sb.view(null), v);
  const done = V(bet({}));
  for (const k of ['pays', 'faces', 'kinds', 'minTotal', 'maxTotal', 'defaultTotal', 'minBet']) {
    assert.equal(done[k], v[k], k);
  }
});

test('the engine knows nothing but cards.js', () => {
  // Pure: no vscode, no ledger. The one import is the shared seeded source, and what it uses from
  // it is the ROLL stream, not a shuffle: there are no cards here
  const src = fs.readFileSync(path.join(__dirname, '..', 'sicbo.js'), 'utf8');
  const requires = src.match(/require\(([^)]*)\)/g) || [];
  assert.deepEqual(requires, ["require('./cards')"]);
  assert.ok(src.indexOf('rollsFrom') > 0, 'the roll should roll, not shuffle');
  assert.equal(src.indexOf('Math.random'), -1, 'the seed comes from the host');
  assert.equal(sb.MIN_BET, 100);
  assert.deepEqual(sb.OPS, []);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
