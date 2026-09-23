// Blackjack engine tests. No dependencies: node's assert only.
// Run: node test/blackjack.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const bj = require(path.join(__dirname, '..', 'blackjack.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// Stacked shoe: deal order is player, dealer up, player, dealer hole, then draws in order
const round = (stack, bet) => bj.newRound({ seed: 'stack', bet: bet || 10, stack });
const play = (st, ops) => ops.reduce((s, op) => bj.act(s, op), st);
const V = (st) => bj.view(st);
const snapshot = (st) => JSON.stringify(st);

// --- determinism -------------------------------------------------------------------------
test('same seed and same actions give the same round', () => {
  for (let i = 0; i < 200; i++) {
    const seed = 'det-' + i;
    const ops = ['hit', 'double', 'split', 'stand', 'hit', 'stand', 'stand'];
    const a = play(bj.newRound({ seed, bet: 10 }), ops);
    const b = play(bj.newRound({ seed, bet: 10 }), ops);
    assert.deepEqual(V(a), V(b));
  }
  const cards = (seed) => V(bj.newRound({ seed, bet: 10 })).hands[0].cards.map((c) => c.r + c.s).join();
  const distinct = new Set(Array.from({ length: 50 }, (_, i) => cards('d' + i)));
  assert.ok(distinct.size > 40, 'different seeds deal different cards');
});

test('act never mutates its input', () => {
  for (let i = 0; i < 100; i++) {
    let st = bj.newRound({ seed: 'mut-' + i, bet: 10 });
    for (const op of ['split', 'hit', 'double', 'stand', 'stand']) {
      const before = snapshot(st);
      const next = bj.act(st, op);
      assert.equal(snapshot(st), before);
      st = next;
    }
  }
});

// --- hand totals -----------------------------------------------------------------------------
test('totals: soft and hard, several aces', () => {
  const hv = (...rs) => bj.handValue(rs.map((r) => ({ r, s: 'S' })));
  assert.deepEqual(hv('A', '6'), { total: 17, soft: true });
  assert.deepEqual(hv('A', '6', '10'), { total: 17, soft: false });
  assert.deepEqual(hv('A', 'A'), { total: 12, soft: true });
  assert.deepEqual(hv('A', 'A', '9'), { total: 21, soft: true });
  assert.deepEqual(hv('A', 'A', 'A', '8'), { total: 21, soft: true });
  assert.deepEqual(hv('5', 'A', 'A', 'A', 'A'), { total: 19, soft: true });
  assert.deepEqual(hv('K', 'Q', 'A'), { total: 21, soft: false });
  assert.deepEqual(hv('K', 'Q', '5'), { total: 25, soft: false });
  assert.deepEqual(hv('A', 'K'), { total: 21, soft: true });
});

// --- dealer ----------------------------------------------------------------------------------
test('dealer stands on soft 17 (S17) and hits hard 16', () => {
  // player 10+9; dealer A up, 6 hole (soft 17); the 5 must stay in the shoe
  let st = play(round(['10S', 'AH', '9S', '6D', '5C']), ['stand']);
  assert.equal(st.phase, 'done');
  assert.deepEqual(V(st).dealer, { cards: [{ r: 'A', s: 'H' }, { r: '6', s: 'D' }], hole: false, total: 17 });
  assert.equal(st.hands[0].result, 'win');
  // dealer 10+6 = hard 16 draws the 5 -> 21
  st = play(round(['10S', '10H', '9S', '6D', '5C']), ['stand']);
  assert.equal(V(st).dealer.total, 21);
  assert.equal(st.hands[0].result, 'lose');
  assert.equal(st.net, -10);
});

test('peek: dealer blackjack ends the round at once; no peek without A or ten up', () => {
  let st = round(['9S', 'AH', '8S', 'KD']);            // ace up, blackjack underneath
  assert.equal(st.phase, 'done');
  assert.equal(st.hands[0].result, 'lose');
  assert.equal(st.net, -10);
  assert.equal(V(st).dealer.hole, false);
  st = round(['9S', 'QH', '8S', 'AD']);                // ten up, ace underneath
  assert.equal(st.phase, 'done');
  assert.equal(st.net, -10);
  st = round(['AS', 'AH', 'KS', 'KD']);                // both have blackjack: push
  assert.equal(st.hands[0].result, 'push');
  assert.equal(st.net, 0);
  st = round(['9S', 'AH', '8S', '7D']);                // ace up, no blackjack: play on, hole stays down
  assert.equal(st.phase, 'player');
  assert.deepEqual(V(st).dealer, { cards: [{ r: 'A', s: 'H' }], hole: true, total: null });
});

test('the hole card never reaches the view or the deal events while face down', () => {
  const st = round(['9S', '7H', '8S', 'KD']);
  const v = V(st);
  assert.equal(JSON.stringify(v).includes('"r":"K"'), false);
  assert.deepEqual(v.seq.map((e) => e.to), ['player', 'dealer', 'player', 'dealer']);
  assert.equal(v.seq[3].card, null);
  const done = bj.act(st, 'stand');
  assert.deepEqual(V(done).seq[0], { ev: 'reveal', card: { r: 'K', s: 'D' } });
});

// Every string and number anywhere inside a value
function leaves(x, out) {
  out = out || [];
  if (x == null) return out;
  if (typeof x === 'string' || typeof x === 'number') out.push(x);
  else if (typeof x === 'object') for (const k in x) { out.push(k); leaves(x[k], out); }
  return out;
}
const firstCards = (st) => JSON.stringify(st.shoe.slice(0, 12));

test('a live view gives nothing that re-deals the shoe; the seed shows only at done', () => {
  const crypto = require('crypto');
  let live = 0;
  for (let i = 0; i < 300; i++) {
    const seed = crypto.randomBytes(12).toString('hex');
    let st = bj.newRound({ seed, id: crypto.randomBytes(12).toString('hex'), bet: 10 });
    if (st.phase !== 'player') { assert.equal(bj.view(st).seed, seed); continue; }
    live++;
    const real = firstCards(st);
    for (const v of [bj.view(st), bj.view(bj.act(st, 'hit'))].filter((x) => x.phase === 'player')) {
      assert.equal('seed' in v, false);
      for (const leaf of leaves(v)) assert.notEqual(firstCards(bj.newRound({ seed: String(leaf), bet: 10 })), real, 'leaf ' + leaf);
    }
    while (st.phase === 'player') st = bj.act(st, 'stand');
    assert.equal(bj.view(st).seed, seed);
    assert.equal(firstCards(bj.newRound({ seed: bj.view(st).seed, bet: 10 })), real); // and the check itself can see a match
  }
  assert.ok(live > 200);
});

test('a stacked shoe that runs out throws instead of dealing empty cards', () => {
  assert.throws(() => play(round(['2S', '3H', '2D', '3D']), ['hit']), RangeError);
  assert.throws(() => bj.newRound({ seed: 'x', bet: 1.5 }), RangeError);
  assert.throws(() => bj.newRound({ seed: 'x', bet: 2 ** 53 }), RangeError);
});

// --- payouts ---------------------------------------------------------------------------------
test('blackjack pays 3:2, rounded down on an odd bet', () => {
  const st10 = round(['AS', '9H', 'KS', '7D'], 10);
  assert.equal(st10.phase, 'done');
  assert.equal(st10.hands[0].result, 'blackjack');
  assert.equal(st10.net, 15);
  assert.equal(round(['AS', '9H', 'KS', '7D'], 11).net, 16);   // 16.5 -> 16
  assert.equal(round(['AS', '9H', 'KS', '7D'], 25).net, 37);   // 37.5 -> 37
  assert.equal(V(st10).dealer.cards.length, 2);                // no dealer draw after a natural
});

test('a plain push: 18 against 18', () => {
  const st = play(round(['10S', '10H', '8S', '8D']), ['stand']);
  assert.equal(st.hands[0].result, 'push');
  assert.equal(st.net, 0);
  assert.equal(V(st).dealer.total, 18);
});

test('double: one card, twice the bet, then the dealer', () => {
  // 6+5 = 11 vs dealer 10+7; double draws a 10 -> 21
  let st = play(round(['6S', '10H', '5S', '7D', '10C']), ['double']);
  assert.equal(st.phase, 'done');
  assert.equal(st.hands[0].bet, 20);
  assert.equal(st.hands[0].cards.length, 3);
  assert.equal(st.net, 20);
  // double into a bust loses the doubled bet
  st = play(round(['10S', '10H', '6S', '7D', 'KC']), ['double']);
  assert.equal(st.hands[0].result, 'bust');
  assert.equal(st.net, -20);
  // not after a hit
  const hit = play(round(['2S', '10H', '3S', '7D', '4C', '9C']), ['hit']);
  assert.equal(bj.whyNot(hit, 'double'), 'double only on the first two cards');
});

test('split once: two hands, no resplit, 21 after a split is not blackjack', () => {
  // 8,8 vs dealer 10+7. Split deals an 8 to hand 0 (a new pair) and a 3 to hand 1
  let st = play(round(['8S', '10H', '8D', '7D', '8C', '3S', '10D', 'KC']), ['split']);
  assert.equal(st.hands.length, 2);
  assert.equal(bj.whyNot(st, 'split'), 'already split once');
  assert.equal(V(st).can.split, false);
  assert.equal(V(st).seq[0].ev, 'split');
  st = play(st, ['stand', 'hit']);                  // hand 0 stands on 16; hand 1: 8+3+10 = 21 stands itself
  assert.equal(st.phase, 'done');
  assert.deepEqual(st.hands.map((h) => h.result), ['lose', 'win']);
  assert.equal(st.net, 0);
  // two-card 21 on a split hand (K then A) stands by itself and pays 1:1, not 3:2
  st = play(round(['KS', '9H', 'QD', '7D', 'AC', '5S', '10D']), ['split']);
  assert.deepEqual(V(st).hands.map((h) => [h.total, h.done]), [[21, true], [15, false]]);
  assert.equal(st.active, 1);
  st = play(st, ['stand']);                         // dealer 9+7 draws the 10 and busts
  assert.deepEqual(st.hands.map((h) => h.result), ['win', 'win']);
  assert.equal(st.net, 20);
  // ten-values pair with each other
  assert.equal(bj.whyNot(round(['KS', '9H', 'QD', '7D']), 'split'), null);
  assert.equal(bj.whyNot(round(['KS', '9H', '9D', '7D']), 'split'), 'not a pair');
});

test('split aces: one card each, then done; A+10 pays 1:1', () => {
  // A,A vs dealer 9+7 (16). Aces get K and 5; dealer draws 10 -> 26 bust
  const st = play(round(['AS', '9H', 'AD', '7D', 'KC', '5S', '10D']), ['split']);
  assert.equal(st.phase, 'done');
  assert.deepEqual(st.hands.map((h) => h.cards.length), [2, 2]);
  assert.deepEqual(st.hands.map((h) => h.result), ['win', 'win']);
  assert.equal(st.net, 20);                          // 10 + 10, not 15 + 10
});

test('double after split is allowed; the stake counts every hand', () => {
  const st = play(round(['8S', '10H', '8D', '7D', '3C', '2S', '10D', 'KC']), ['split']);
  assert.equal(bj.whyNot(st, 'double'), null);
  assert.equal(bj.stake(st), 20);
  assert.equal(bj.whyNot(st, 'double', 29), 'not enough credits'); // 20 staked + 10 more > 29
  assert.equal(bj.whyNot(st, 'double', 30), null);
  // a NaN budget (a broken ledger) refuses rather than slipping through
  assert.equal(bj.whyNot(st, 'double', NaN), 'not enough credits');
  assert.equal(bj.whyNot(round(['9S', '7H', '9D', 'KD']), 'split', NaN), 'not enough credits');
  assert.equal(V(bj.act(st, 'double')).hands[0].bet, 20);
});

// --- rejected actions -----------------------------------------------------------------------------
test('an impossible action returns the same state untouched', () => {
  const live = round(['9S', '7H', '8S', 'KD', '2C']);
  const cases = [
    [live, 'split'],                               // not a pair
    [live, 'surrender'],                           // not a rule here
    [play(live, ['hit']), 'double'],               // after a hit
    [play(live, ['stand']), 'hit'],                // round over
    [round(['9S', '7H', '9D', 'KD']), 'split', 17] // pair, but no budget for the second bet
  ];
  for (const [st, op, budget] of cases) {
    const before = snapshot(st);
    assert.ok(bj.whyNot(st, op, budget));
    if (budget == null) assert.equal(bj.act(st, op), st);
    assert.equal(snapshot(st), before);
  }
  assert.equal(V(round(['9S', '7H', '9D', 'KD'])).can.split, true);
  assert.equal(bj.view(round(['9S', '7H', '9D', 'KD']), 17).can.split, false);
});

// --- Monte Carlo --------------------------------------------------------------------------------
// Basic strategy for 6 decks, S17, double after split, no surrender, as far as these rules allow
function basic(v) {
  const h = v.hands[v.active];
  const upCard = v.dealer.cards[0];
  const up = upCard.r === 'A' ? 11 : bj.points(upCard);
  const can = v.can;
  if (can.split) {
    const p = h.cards[0].r === 'A' ? 11 : bj.points(h.cards[0]);
    const split = { 11: true, 10: false, 9: up !== 7 && up < 10, 8: true, 7: up <= 7, 6: up <= 6, 5: false, 4: up === 5 || up === 6, 3: up <= 7, 2: up <= 7 }[p];
    if (split) return 'split';
  }
  const t = h.total;
  const dbl = (cond, otherwise) => (cond && can.double ? 'double' : otherwise);
  if (h.soft) {
    if (t >= 19) return 'stand';
    if (t === 18) return up >= 3 && up <= 6 ? dbl(true, 'stand') : up <= 8 ? 'stand' : 'hit';
    if (t === 17) return dbl(up >= 3 && up <= 6, 'hit');
    if (t >= 15) return dbl(up >= 4 && up <= 6, 'hit');
    if (t >= 13) return dbl(up === 5 || up === 6, 'hit');
    return 'hit';
  }
  if (t >= 17) return 'stand';
  if (t >= 13) return up <= 6 ? 'stand' : 'hit';
  if (t === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
  if (t === 11) return dbl(up <= 10, 'hit');
  if (t === 10) return dbl(up <= 9, 'hit');
  if (t === 9) return dbl(up >= 3 && up <= 6, 'hit');
  return 'hit';
}
const simple = (v) => (v.hands[v.active].total >= 17 ? 'stand' : 'hit');

function simulate(strategy, n, tag) {
  const bet = 10; // even, so 3:2 has no rounding
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    let st = bj.newRound({ seed: tag + '-' + i, bet });
    while (st.phase === 'player') {
      const next = bj.act(st, strategy(bj.view(st)));
      assert.notEqual(next, st, 'the strategy only picks allowed actions');
      st = next;
    }
    const r = st.net / bet;
    sum += r; sumSq += r * r;
  }
  const mean = sum / n;
  const se = Math.sqrt((sumSq / n - mean * mean) / n);
  return { mean, se };
}

const MC_ROUNDS = 100000;
const pct = (x) => (x * 100).toFixed(2) + '%';
// Basic strategy's theoretical edge for these rules is about -0.5%; the band is that +-3 standard
// errors (SE ~0.36% at 100k rounds). Seeds are fixed, so the result does not move between runs
test('Monte Carlo ' + MC_ROUNDS + ' rounds: basic strategy near -0.5%, stand-on-17 clearly worse', () => {
  const b = simulate(basic, MC_ROUNDS, 'mc-basic');
  const s = simulate(simple, MC_ROUNDS, 'mc-simple');
  console.log('  basic strategy : ' + pct(b.mean) + ' per round (SE ' + pct(b.se) + ')');
  console.log('  stand on 17+   : ' + pct(s.mean) + ' per round (SE ' + pct(s.se) + ')');
  assert.ok(b.mean > -0.016 && b.mean < 0.006, 'basic strategy ' + pct(b.mean));
  assert.ok(s.mean > -0.09 && s.mean < -0.02, 'stand on 17 ' + pct(s.mean));
  assert.ok(s.mean < b.mean - 0.02, 'basic strategy beats the naive one');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
