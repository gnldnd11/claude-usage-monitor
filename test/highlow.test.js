// High-low engine tests. No dependencies: node's assert only.
// Run: node test/highlow.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const hl = require(path.join(__dirname, '..', 'highlow.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const V = (st) => hl.view(st);
const snapshot = (st) => JSON.stringify(st);
const play = (st, ops) => ops.reduce((s, op) => hl.act(s, op), st);
const str = (code) => { const c = C.cardOf(code); return c.r + c.s; };

// Every card of a 6-deck shoe, as 'AS', '2S', ... strings
function fullDeck() {
  const out = [];
  for (let d = 0; d < C.DECKS; d++) for (const s of C.SUITS) for (const r of C.RANKS) out.push(r + s);
  return out;
}

// A whole 6-deck shoe whose first cards are the ones named, the rest following in a fixed order.
// The odds after the named cards are therefore the real odds of a shoe with exactly those gone
function stackOf(head) {
  const all = fullDeck();
  for (const c of head) {
    const i = all.indexOf(c);
    if (i < 0) throw new Error('no ' + c + ' left to stack');
    all.splice(i, 1);
  }
  return head.concat(all);
}

const run = (head, bet) => hl.newRun({ seed: 'stack', bet: bet == null ? 10 : bet, stack: stackOf(head) });
// A short stack, dealt exactly as given (not padded to a full shoe)
const tiny = (cards, bet) => hl.newRun({ seed: 'tiny', bet: bet == null ? 10 : bet, stack: cards });

// --- determinism -------------------------------------------------------------------------
test('same seed and same calls give the same run', () => {
  for (let i = 0; i < 200; i++) {
    const seed = 'det-' + i;
    const ops = ['higher', 'higher', 'lower', 'higher', 'cashout'];
    const a = play(hl.newRun({ seed, bet: 100 }), ops);
    const b = play(hl.newRun({ seed, bet: 100 }), ops);
    assert.deepEqual(V(a), V(b));
  }
  const first = (seed) => V(hl.newRun({ seed, bet: 10 })).card.r + V(hl.newRun({ seed, bet: 10 })).card.s;
  const distinct = new Set(Array.from({ length: 200 }, (_, i) => first('d' + i)));
  assert.ok(distinct.size > 30, 'different seeds deal different cards, saw ' + distinct.size);
});

test('act never mutates its input, and a refused call gives back the very same object', () => {
  for (let i = 0; i < 200; i++) {
    let st = hl.newRun({ seed: 'mut-' + i, bet: 100 });
    for (const op of ['higher', 'lower', 'higher', 'cashout', 'higher']) {
      const before = snapshot(st);
      const next = hl.act(st, op);
      assert.equal(snapshot(st), before);
      if (hl.whyNot(st, op)) assert.equal(next, st);
      st = next;
    }
  }
  const st = hl.newRun({ seed: 'z', bet: 10 });
  assert.equal(hl.act(st, 'surrender'), st);
  assert.equal(hl.whyNot(st, 'surrender'), 'unknown action');
  assert.throws(() => hl.newRun({ seed: 'x', bet: 1.5 }), RangeError);
  assert.throws(() => hl.newRun({ seed: 'x', bet: 0 }), RangeError);
  assert.throws(() => hl.newRun({ seed: 'x', bet: 2 ** 53 }), RangeError);
});

// --- odds come from the shoe --------------------------------------------------------------
// A fresh 6-deck shoe, one card face up: 311 left, 23 of them tying. The fair price of a call is
// 1 / P(win | the card resolves) = (win + lose) / win = 288 / win, and the house keeps 3% of it
const EDGE = 0.97;
const fair = (win) => (288 / win) * EDGE;

test('payouts are 0.97 / P(win), priced off the cards left', () => {
  const table = [
    // card, higher count, lower count
    ['2S', 288, 0],   // nothing is lower than a two
    ['3S', 264, 24],
    ['7S', 168, 120],
    ['10S', 96, 192],
    ['KS', 24, 264],
    ['AS', 0, 288]    // nothing is higher than an ace
  ];
  const seen = [];
  for (const [card, higher, lower] of table) {
    const st = run([card], 100);
    assert.deepEqual(hl.counts(st), { higher, lower, tie: 23 }, card);
    const v = V(st);
    // a side with no cards has no price and cannot be called
    assert.equal(v.odds.higher, higher ? Math.max(1, fair(higher)) : null, card + ' higher');
    assert.equal(v.odds.lower, lower ? Math.max(1, fair(lower)) : null, card + ' lower');
    assert.equal(v.can.higher, higher > 0);
    assert.equal(v.can.lower, lower > 0);
    assert.equal(v.can.cashout, false, 'nothing called yet, so there is nothing to take');
    seen.push(card + ' higher ' + (v.odds.higher == null ? '-' : v.odds.higher.toFixed(3))
      + ' / lower ' + (v.odds.lower == null ? '-' : v.odds.lower.toFixed(3)));
  }
  for (const line of seen) console.log('  ' + line);
  // an easy call is cheap and a hard one is dear, with no gap in between
  const highs = table.map(([c]) => V(run([c], 100)).odds.higher).filter((x) => x != null);
  for (let i = 1; i < highs.length; i++) assert.ok(highs[i] > highs[i - 1], 'higher gets dearer as the card rises');
  assert.equal(hl.whyNot(run(['2S']), 'lower'), 'nothing loses to this card');
  assert.equal(hl.whyNot(run(['AS']), 'higher'), 'nothing beats this card');
});

test('a call that cannot lose is clamped to 1 rather than priced under it', () => {
  // fair price of a certainty is 1.000; 0.97 of it would shrink the pot on a correct call
  assert.equal(V(run(['2S'], 100)).odds.higher, 1);
  assert.equal(V(run(['AS'], 100)).odds.lower, 1);
  const st = hl.act(run(['2S', '3H'], 100), 'higher');
  assert.equal(st.pot, 100, 'the pot is returned, never cut');
  assert.equal(st.streak, 1);
});

test('the odds move as the cards come out', () => {
  // only two cards left, both under the king: higher has no price and no button
  const spent = tiny(['KS', '2H', '3D'], 10);
  assert.deepEqual(hl.counts(spent), { higher: 0, lower: 2, tie: 0 });
  assert.deepEqual(V(spent).odds, { higher: null, lower: 1 });
  assert.equal(V(spent).can.higher, false);
  // one of each: both sides 2/1 of fair, the tie priced into neither
  const even = tiny(['7S', '8H', '2D', '7C'], 10);
  assert.deepEqual(hl.counts(even), { higher: 1, lower: 1, tie: 1 });
  assert.deepEqual(V(even).odds, { higher: 2 * EDGE, lower: 2 * EDGE });
  // the last card gone: nothing left to call, only cashing out
  const last = hl.act(tiny(['7S', '8H'], 10), 'higher');
  assert.equal(last.phase, 'play');
  assert.deepEqual(V(last).can, { higher: false, lower: false, cashout: true });
  assert.equal(hl.whyNot(last, 'higher'), 'the shoe is spent');
  assert.equal(hl.whyNot(last, 'lower'), 'the shoe is spent');
});

// --- the pot ---------------------------------------------------------------------------------
test('a tie leaves the pot and the streak alone and moves to the new card', () => {
  const st = hl.act(run(['7S', '7H'], 100), 'higher');
  assert.equal(st.phase, 'play');
  assert.equal(st.pot, 100);
  assert.equal(st.streak, 0);
  assert.deepEqual(V(st).card, { r: '7', s: 'H' }, 'the card that answered is now the one on the table');
  assert.deepEqual(V(st).history, [{ card: { r: '7', s: 'S' }, guess: 'higher', result: 'push', mult: fair(168), pot: 100 }],
    'history holds the card the call was played onto, which the screen draws as the pile');
  assert.equal(st.net, null);
  // a tie called the other way is the same push
  assert.equal(hl.act(run(['7S', '7H'], 100), 'lower').pot, 100);
});

test('a correct call multiplies the pot, floored, and the streak grows', () => {
  // king up, ace turned: 24 of the 311 left beat it, so 288/24 * 0.97 = 11.64x
  const won = hl.act(run(['KS', 'AH'], 100), 'higher');
  assert.equal(won.pot, 1164, 'floating point would land this on 1163');
  assert.deepEqual(V(won).odds, { higher: null, lower: 1 }, 'the ace on top leaves only one side');
  assert.equal(won.streak, 1);
  assert.equal(won.net, null, 'a live run has settled nothing');
  // and again on the next card: from an ace the only side left is priced at a clamped 1, so a
  // grown pot is handed back whole rather than cut by the house's 3%
  const twice = play(run(['KS', 'AH', 'QD'], 100), ['higher', 'lower']);
  assert.equal(twice.pot, 1164);
  assert.equal(twice.streak, 2);
  // an ace on an ace is a tie, so it is the streak that stops, not the pot
  const tied = play(run(['KS', 'AH', 'AD'], 100), ['higher', 'lower']);
  assert.equal(tied.pot, 1164);
  assert.equal(tied.streak, 1);
  // three in a row, priced off a shoe that is one card shorter each time
  const three = play(run(['7S', '8H', '9D', '10C'], 1000), ['higher', 'higher', 'higher']);
  assert.equal(three.streak, 3);
  assert.deepEqual(three.history.map((h) => h.pot), [1662, 3213, 7427]);
});

test('flooring leaves small pots flat on a near-certain call', () => {
  // 1.0582x on the minimum bet is 10.58 -> 10: the pot does not move until it passes 1/(mult-1)
  const flat = hl.act(run(['KS', 'QH'], 10), 'lower');
  assert.equal(flat.history[0].mult, fair(264));
  assert.equal(flat.pot, 10, 'the flat zone is real and is reported');
  assert.equal(hl.act(run(['KS', 'QH'], 17), 'lower').pot, 17);
  assert.equal(hl.act(run(['KS', 'QH'], 18), 'lower').pot, 19);
  assert.equal(hl.act(run(['KS', 'QH'], 100), 'lower').pot, 105);
});

// Ace high, two low: the ranks in the order this game compares them
const ORDERED = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

test('the pot a correct call pays is published, so a price can be read back from it', () => {
  // The screen prices the buttons off `pays`, never off `odds`: pots are whole credits, so at the
  // minimum bet a call the odds price above 1 can still hand the pot back unchanged, and a price
  // worked out from the odds alone would promise a credit that never arrives
  let flatButPriced = 0, grown = 0;
  for (const bet of [10, 17, 100, 1000]) {
    for (let p = 0; p < ORDERED.length; p++) {
      for (const side of ['higher', 'lower']) {
        const q = side === 'higher' ? p + 1 : p - 1;
        if (q < 0 || q >= ORDERED.length) {        // no card on that side: no price and no payout
          const only = V(run([ORDERED[p] + 'S', ORDERED[p === 0 ? 1 : p - 1] + 'H'], bet));
          assert.equal(only.pays[side], null, ORDERED[p] + ' ' + side);
          continue;
        }
        // the view and the call are read off the SAME state, so the price is the price of this shoe
        const st = run([ORDERED[p] + 'S', ORDERED[q] + 'H'], bet);
        const v = V(st);
        const won = hl.act(st, side);
        assert.equal(won.history[0].result, 'win', ORDERED[p] + ' ' + side);
        assert.equal(v.pays[side], won.pot, 'pays is the pot a correct ' + side + ' on a ' + ORDERED[p] + ' leaves at bet ' + bet);
        assert.ok(Number.isSafeInteger(v.pays[side]) && v.pays[side] >= v.pot, 'pays ' + v.pays[side]);
        if (v.pays[side] === v.pot) { if (v.odds[side] > 1) flatButPriced++; } else grown++;
      }
    }
  }
  assert.ok(grown > 0 && flatButPriced > 0,
    'at the minimum bet some calls are priced above 1 and still pay nothing: ' + flatButPriced + ' flat, ' + grown + ' grown');
  // and the idle board offers no price at all
  assert.deepEqual(hl.view(null).pays, { higher: null, lower: null });
});

test('cashing out hands over the pot; a wrong call costs the opening bet and nothing else', () => {
  const won = hl.act(run(['KS', 'AH'], 100), 'higher');
  const out = hl.act(won, 'cashout');
  assert.equal(out.phase, 'done');
  assert.equal(out.ended, 'cashout');
  assert.equal(out.pot, 1164);
  assert.equal(out.net, 1064, 'the stake was already in the pot');
  assert.equal(hl.whyNot(out, 'higher'), 'the run is over');
  assert.equal(hl.act(out, 'cashout'), out);
  // looking at the card and walking off with the bet is not a move
  const fresh = run(['KS'], 100);
  assert.equal(hl.whyNot(fresh, 'cashout'), 'call the card first');
  assert.equal(V(fresh).can.cashout, false);
  assert.equal(hl.act(fresh, 'cashout'), fresh);
  // unless there is no call left to make, which would leave the run with no way out
  const stuck = hl.act(tiny(['7S', '8H'], 100), 'higher');
  assert.deepEqual(V(stuck).can, { higher: false, lower: false, cashout: true });
  assert.equal(hl.act(stuck, 'cashout').phase, 'done');
  // the wrong call: the grown pot was never the player's, so only the bet goes.
  // 7 up, king turned (a win at 1.66x), then a two that does not beat the king
  const lost = play(run(['7S', 'KH', '2D'], 100), ['higher', 'higher']);
  assert.equal(lost.history[0].pot, 166);
  assert.equal(lost.phase, 'done');
  assert.equal(lost.ended, 'wrong');
  assert.equal(lost.pot, 0, "pot at 'done' is what the player receives");
  assert.equal(lost.net, -100);
  assert.equal(lost.streak, 1, 'the streak it reached is still on the record');
  assert.deepEqual(lost.history.map((h) => h.result), ['win', 'lose']);
});

// --- what the webview may see ------------------------------------------------------------------
function leaves(x, out) {
  out = out || [];
  if (x == null) return out;
  if (typeof x === 'string' || typeof x === 'number') out.push(x);
  else if (typeof x === 'object') for (const k in x) { out.push(k); leaves(x[k], out); }
  return out;
}
// Every { r, s } anywhere inside a value
function cardsIn(x, out) {
  out = out || [];
  if (!x || typeof x !== 'object') return out;
  if (typeof x.r === 'string' && typeof x.s === 'string') { out.push(x.r + x.s); return out; }
  for (const k in x) cardsIn(x[k], out);
  return out;
}
const firstCards = (st) => JSON.stringify(st.shoe.slice(0, 12));

// Seeds and run ids shaped exactly like the host's (12 random bytes as hex) but fixed, so this walks
// the same runs every time. Taken from a counter through a hash rather than from crypto: how far a
// run gets moves with the shuffle, which made the coverage guard at the end of this test a coin toss
// (measured: 400 views or fewer in about one run in seven)
const hexSeed = (tag, i) => require('crypto').createHash('sha256').update(tag + i).digest('hex').slice(0, 24);

test('a live view shows only cards already turned over, and no seed', () => {
  let live = 0;
  for (let i = 0; i < 200; i++) {
    const seed = hexSeed('live-seed-', i);
    let st = hl.newRun({ seed, id: hexSeed('live-id-', i), bet: 100 });
    const real = firstCards(st);
    for (let k = 0; k < 4 && st.phase === 'play'; k++) {
      const v = V(st);
      live++;
      assert.equal('seed' in v, false);
      assert.equal(v.net, null);
      // nothing in the view names a card the shoe has not dealt yet
      const shown = new Set(cardsIn(v));
      const dealt = new Set(st.shoe.slice(0, st.pos).map(str));
      for (const c of shown) assert.ok(dealt.has(c), 'view shows an undealt ' + c);
      assert.equal(shown.size > 0, true);
      // and nothing in it re-deals the shoe
      for (const leaf of leaves(v)) assert.notEqual(firstCards(hl.newRun({ seed: String(leaf), bet: 10 })), real, 'leaf ' + leaf);
      st = hl.act(st, V(st).can.higher ? 'higher' : 'lower');
    }
    if (st.phase === 'play') st = hl.act(st, 'cashout');
    assert.equal(V(st).seed, seed, 'the seed arrives once the run is over');
    assert.equal(firstCards(hl.newRun({ seed: V(st).seed, bet: 10 })), real); // and the check itself can see a match
  }
  assert.ok(live > 400, 'live views checked: ' + live);
});

test('the idle view is a bet screen with nothing on the table', () => {
  const v = hl.view(null);
  assert.equal(v.phase, 'bet');
  assert.deepEqual(v.can, { higher: false, lower: false, cashout: false });
  assert.deepEqual(v.history, []);
  assert.equal(v.card, null);
  assert.equal('seed' in v, false);
});

// --- the shoe between runs ----------------------------------------------------------------
test('what a run leaves is carried into the next one, and a short deck is reshuffled', () => {
  const first = play(hl.newRun({ seed: 'carry-a', bet: 100 }), ['higher', 'higher', 'cashout']);
  const left = hl.remaining(first);
  assert.equal(left.length, 312 - first.pos);
  const next = hl.newRun({ seed: 'carry-b', bet: 100, deck: left });
  assert.equal(next.shoe.length, left.length, 'the same cards, not a fresh shoe');
  assert.deepEqual(next.shoe.slice().sort((a, b) => a - b), left.slice().sort((a, b) => a - b));
  assert.notDeepEqual(next.shoe, left, 'shuffled with its own seed, so the old seed says nothing about it');
  // a deck under MIN_DECK is thrown away
  const short = Array.from({ length: hl.MIN_DECK - 1 }, (_, i) => i);
  assert.equal(hl.newRun({ seed: 'c', bet: 10, deck: short }).shoe.length, 312);
  assert.equal(hl.newRun({ seed: 'c', bet: 10, deck: [] }).shoe.length, 312);
  assert.equal(hl.newRun({ seed: 'c', bet: 10 }).shoe.length, 312);
  // exactly MIN_DECK is kept
  const atLimit = Array.from({ length: hl.MIN_DECK }, (_, i) => i);
  assert.equal(hl.newRun({ seed: 'c', bet: 10, deck: atLimit }).shoe.length, hl.MIN_DECK);
  // a carried shoe deals a run that is priced off what is left in it
  let st = hl.newRun({ seed: 'carry-c', bet: 100, deck: atLimit });
  const c = hl.counts(st);
  assert.equal(c.higher + c.lower + c.tie, hl.MIN_DECK - 1);
});

// --- Monte Carlo --------------------------------------------------------------------------------
// Both games are the same bet at different prices, so every strategy must come out at the same edge.
// `safe` always calls the likelier side, `risky` the dearer one, `high` just calls higher.
// A tie is a free retry, so a "call" below means a call that resolved
const safe = (v) => (v.odds.lower == null || (v.odds.higher != null && v.odds.higher <= v.odds.lower) ? 'higher' : 'lower');
const risky = (v) => (v.odds.lower == null || (v.odds.higher != null && v.odds.higher > v.odds.lower) ? 'higher' : 'lower');
const high = (v) => (v.can.higher ? 'higher' : 'lower');

// `calls` resolved calls, then cash out.
// Two means come back. `mean` is over every run. `pure` is over the runs whose FIRST card priced
// both sides above 1, where one call is worth exactly HL_EDGE and nothing else is in the way.
// Only the first card is used to split them because it is drawn before anything is won or lost:
// filtering on "met no clamped call anywhere" instead would throw away the long runs, which are
// the ones that won, and drag the mean down by selection alone
function simulate(pick, calls, n, tag, bet) {
  let sum = 0, sumSq = 0, pure = 0, pureSq = 0, pureN = 0;
  for (let i = 0; i < n; i++) {
    let st = hl.newRun({ seed: tag + '-' + i, bet });
    const opening = hl.view(st);
    const priced = opening.odds[pick(opening)] > 1;
    while (st.phase === 'play' && st.streak < calls) {
      const next = hl.act(st, pick(hl.view(st)));
      assert.notEqual(next, st, 'the strategy only picks allowed calls');
      st = next;
    }
    if (st.phase === 'play') st = hl.act(st, 'cashout');
    const r = st.net / bet;
    sum += r; sumSq += r * r;
    if (priced) { pure += r; pureSq += r * r; pureN += 1; }
  }
  const mean = sum / n;
  const pureMean = pure / pureN;
  return {
    mean, se: Math.sqrt((sumSq / n - mean * mean) / n),
    pure: pureMean, pureSe: Math.sqrt((pureSq / pureN - pureMean * pureMean) / pureN), pureN
  };
}

const MC_RUNS = 120000;
const BIG = 1000000; // big enough that flooring a payout is noise, so this measures the edge alone
const pct = (x) => (x * 100).toFixed(2) + '%';
function report(name, r) {
  console.log('  ' + name.padEnd(26) + pct(r.mean) + ' per run (SE ' + pct(r.se) + ')'
    + '  |  priced openings only ' + pct(r.pure) + ' (SE ' + pct(r.pureSe) + ', ' + r.pureN + ' runs)');
}

test('Monte Carlo ' + MC_RUNS + ' runs: every strategy pays the same 3%', () => {
  const s = simulate(safe, 1, MC_RUNS, 'mc-safe', BIG);
  const r = simulate(risky, 1, MC_RUNS, 'mc-risky', BIG);
  const h = simulate(high, 1, MC_RUNS, 'mc-high', BIG);
  report('safest side, one call', s);
  report('dearest side, one call', r);
  report('always higher, one call', h);
  // A two or an ace opens with a call that cannot lose, clamped to 1, so about 2 openings in 13
  // are free and the overall mean sits a little above -3%. On the openings that are priced, one
  // call gives up exactly the house's cut, whichever side the strategy picked
  for (const [name, x] of [['safe', s], ['risky', r], ['high', h]]) {
    assert.ok(Math.abs(x.pure - (hl.HL_EDGE - 1)) < 4 * x.pureSe, name + ' priced ' + pct(x.pure) + ' +-' + pct(x.pureSe));
    assert.ok(x.mean > -0.05 && x.mean < 0, name + ' overall ' + pct(x.mean));
  }
});

test('Monte Carlo: the edge compounds with every call, and never cashing out loses everything', () => {
  const one = simulate(safe, 1, MC_RUNS, 'mc-c1', BIG);
  const three = simulate(safe, 3, MC_RUNS, 'mc-c3', BIG);
  report('safest side, three calls', three);
  assert.ok(three.mean < one.mean - 0.02, 'three calls give up more than one: ' + pct(three.mean));
  // three calls is the cut taken three times, minus the free calls a two or an ace hands back
  assert.ok(three.mean < Math.pow(1 + one.mean, 3) - 1 + 4 * three.se, 'three calls ' + pct(three.mean));
  assert.ok(three.mean > Math.pow(hl.HL_EDGE, 3) - 1 - 4 * three.se, 'three calls ' + pct(three.mean));
  const forever = simulate(safe, Infinity, 20000, 'mc-ever', BIG);
  console.log('  never cashing out         ' + pct(forever.mean) + ' per run');
  assert.equal(forever.mean, -1, 'a run that never stops always ends on a wrong call');
});

test('Monte Carlo at the minimum bet: flooring is the only thing that makes it worse', () => {
  const big = simulate(safe, 3, MC_RUNS, 'mc-floor', BIG);
  const small = simulate(safe, 3, MC_RUNS, 'mc-floor', 10);
  console.log('  three calls at ' + BIG.toLocaleString('en-US') + ': ' + pct(big.mean)
    + ' / at the minimum bet of 10: ' + pct(small.mean));
  assert.ok(small.mean < big.mean, 'flooring never pays the player');
  assert.ok(small.mean > -0.30, 'and it does not eat the game: ' + pct(small.mean));
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
