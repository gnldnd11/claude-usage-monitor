// Draw poker (Jacks or Better) engine tests. No dependencies: node's assert only.
// Run: node test/poker.test.js
'use strict';
const assert = require('assert/strict');
const path = require('path');
const pk = require(path.join(__dirname, '..', 'poker.js'));
const C = require(path.join(__dirname, '..', 'cards.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const V = (st) => pk.view(st);
const snapshot = (st) => JSON.stringify(st);
const codes = (names) => names.map(C.codeOf);
const rank = (names) => pk.rankOf(codes(names));

// One whole deck, as 'AS', '2S', ... strings
function fullDeck() {
  const out = [];
  for (const s of C.SUITS) for (const r of C.RANKS) out.push(r + s);
  return out;
}

// A whole deck whose first cards are the ones named, the rest following in a fixed order, so the
// draw takes cards this test chose and the deck is still a real 52
function stackOf(head) {
  const all = fullDeck();
  for (const c of head) {
    const i = all.indexOf(c);
    if (i < 0) throw new Error('no ' + c + ' left to stack');
    all.splice(i, 1);
  }
  return head.concat(all);
}

const deal = (head, bet) => pk.newHand({ seed: 'stack', bet: bet == null ? 10 : bet, stack: stackOf(head) });
const ALL = [true, true, true, true, true];
const NONE = [false, false, false, false, false];
const holdAt = (keep) => [0, 1, 2, 3, 4].map((i) => keep.includes(i));
const drawWith = (st, hold) => pk.act(st, { op: 'draw', hold });

// --- the ranking ------------------------------------------------------------------------

test('every paid row is recognised, best first', () => {
  const table = [
    [['AS', 'KS', 'QS', 'JS', '10S'], pk.ROW.royal],
    [['10H', 'JH', 'QH', 'KH', 'AH'], pk.ROW.royal],             // dealt in the other order
    [['9C', '10C', 'JC', 'QC', 'KC'], pk.ROW.straightFlush],
    [['AD', '2D', '3D', '4D', '5D'], pk.ROW.straightFlush],      // the steel wheel
    [['7S', '7H', '7D', '7C', '2S'], pk.ROW.four],
    [['7S', '7H', '7D', '3C', '3S'], pk.ROW.fullHouse],
    [['3C', '3S', '7S', '7H', '7D'], pk.ROW.fullHouse],          // the pair dealt first
    [['AS', 'KS', 'QS', 'JS', '9S'], pk.ROW.flush],              // one card off a royal
    [['2H', '4H', '6H', '8H', '10H'], pk.ROW.flush],
    [['10S', 'JH', 'QD', 'KC', 'AS'], pk.ROW.straight],          // broadway, unsuited
    [['AS', '2H', '3D', '4C', '5S'], pk.ROW.straight],           // the wheel, unsuited
    [['7S', '7H', '7D', '2C', '5S'], pk.ROW.three],
    [['7S', '7H', '2D', '2C', '5S'], pk.ROW.twoPair],
    [['AS', 'AH', '2D', '7C', '9S'], pk.ROW.jacks],
    [['JS', 'JH', '2D', '7C', '9S'], pk.ROW.jacks],
    [['KS', 'KH', '2D', '7C', '9S'], pk.ROW.jacks],
    [['QS', 'QH', '2D', '7C', '9S'], pk.ROW.jacks]
  ];
  for (const [hand, row] of table) assert.equal(rank(hand), row, hand.join(' '));
  // the rows are the ones the screen prints, in the order it prints them
  assert.deepEqual(pk.PAYS.map((r) => r.name),
    ['Royal flush', 'Str. flush', '4 of a kind', 'Full house', 'Flush', 'Straight', '3 of a kind', '2 pair', 'Jacks+']);
  assert.deepEqual(pk.PAYS.map((r) => r.mult), [800, 50, 25, 8, 5, 4, 3, 2, 1]);
  for (let i = 1; i < pk.PAYS.length; i++) assert.ok(pk.PAYS[i].mult < pk.PAYS[i - 1].mult, 'row ' + i);
  assert.equal(pk.NO_WIN.mult, 0);
});

test('the rows nothing is paid for', () => {
  const nothing = [
    ['10S', '10H', '2D', '7C', '9S'],   // a pair of tens: one rank under the pay line
    ['2S', '2H', '3D', '7C', '9S'],
    ['9S', '9H', 'AD', 'KC', 'QS'],     // a low pair with three high cards is still a low pair
    ['AS', 'KH', 'QD', 'JC', '9S'],     // four high cards, no pair
    ['AS', '2H', '3D', '4C', '6S'],     // one card off the wheel
    ['2S', '3H', '4D', '5C', '7S'],
    ['JS', 'QH', 'KD', 'AC', '2S'],     // J-Q-K-A needs a ten, and a two is not one
    ['AS', 'KH', 'QD', 'JC', '2S']
  ];
  for (const hand of nothing) assert.equal(rank(hand), pk.ROW.none, hand.join(' '));
});

test('a straight is five ranks in a row, with the ace at either end and nowhere else', () => {
  // the ten windows the game allows, as hands: the wheel, then 2-3-4-5-6 up to 10-J-Q-K-A
  const SUITS = ['S', 'H', 'D', 'C', 'S'];
  const made = [['A', '2', '3', '4', '5']];
  const order = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  for (let lo = 0; lo <= 8; lo++) made.push(order.slice(lo, lo + 5));
  assert.equal(made.length, 10);
  for (const ranks of made) {
    const hand = ranks.map((r, i) => r + SUITS[i]);
    assert.equal(rank(hand), pk.ROW.straight, hand.join(' '));
  }
  // the ace does not bridge the two ends: K-A-2-3-4 is nothing
  assert.equal(rank(['KS', 'AH', '2D', '3C', '4S']), pk.ROW.none);
  assert.equal(rank(['QS', 'KH', 'AD', '2C', '3S']), pk.ROW.none);
  // and a pair inside a straight's window is a pair, not a straight
  assert.equal(rank(['AS', 'AH', '2D', '3C', '4S']), pk.ROW.jacks);
  assert.equal(rank(['5S', '5H', '6D', '7C', '8S']), pk.ROW.none);
  // windowsOver is the one place that knows which runs exist: a four-card draw open at both ends
  // sits in two windows, one open at a single end in one
  assert.equal(pk.windowsOver([0, 1, 2, 3]), 2, '2-3-4-5 takes an ace or a six');
  assert.equal(pk.windowsOver([8, 9, 10, 11]), 2, '10-J-Q-K takes a nine or an ace');
  assert.equal(pk.windowsOver([9, 10, 11, 12]), 1, 'J-Q-K-A takes only a ten');
  assert.equal(pk.windowsOver([12, 0, 1, 2]), 1, 'A-2-3-4 takes only a five');
  assert.equal(pk.windowsOver([0, 1, 2, 4]), 1, 'a gap inside leaves one window');
  assert.equal(pk.windowsOver([0, 1, 2, 5]), 0);
});

// Every five-card hand there is, counted by row and checked against the arithmetic of a 52-card
// deck. This is what says the ranking is right: the numbers below are not measurements, they are
// what combinatorics says a deck holds, and a ranking that is wrong anywhere cannot match all ten
test('all 2,598,960 hands fall into the rows a deck actually holds', () => {
  const EXPECT = {
    'Royal flush': 4,                                          // 4 suits
    'Str. flush': 36,                                           // 4 suits * 10 runs - 4 royals
    '4 of a kind': 624,                                         // 13 * 48
    'Full house': 3744,                                         // 13 * 4 * 12 * 6
    'Flush': 5108,                                              // 4 * C(13,5) - 40
    'Straight': 10200,                                          // 10 * 4^5 - 40
    '3 of a kind': 54912,                                       // 13 * 4 * C(12,2) * 16
    '2 pair': 123552,                                           // C(13,2) * 36 * 44
    'Jacks+': 337920,                                           // 4 ranks * 6 * C(12,3) * 64
    'No win': 2062860                                           // 9 low pairs (760,320) + no pair (1,302,540)
  };
  const seen = {};
  const h = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < 52; h[0]++)
    for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
      for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
        for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
          for (h[4] = h[3] + 1; h[4] < 52; h[4]++) {
            const name = pk.rankOf(h).name;
            seen[name] = (seen[name] || 0) + 1;
          }
  assert.deepEqual(seen, EXPECT);
  const total = Object.values(seen).reduce((a, b) => a + b, 0);
  assert.equal(total, 2598960);
  // and the return of a hand nobody chooses: the table priced against a deck dealt and left alone
  let gross = 0;
  for (const r of pk.PAYS) gross += r.mult * EXPECT[r.name];
  console.log('  a dealt hand, never drawn to, returns ' + (gross / total * 100).toFixed(2) + '% of the bet');
  assert.ok(Number.isSafeInteger(gross));
});

test('rankOf takes five cards and nothing else', () => {
  assert.throws(() => pk.rankOf(codes(['AS', 'KS', 'QS', 'JS'])), RangeError);
  assert.throws(() => pk.rankOf(codes(['AS', 'KS', 'QS', 'JS', '10S', '9S'])), RangeError);
  assert.throws(() => pk.rankOf('AS'), RangeError);
});

// --- the deal and the draw ---------------------------------------------------------------

test('the deal turns five cards face up and settles nothing', () => {
  const st = deal(['AS', 'KH', 'QD', 'JC', '9S'], 100);
  const v = V(st);
  assert.equal(v.phase, 'draw');
  assert.deepEqual(v.cards.map((c) => c.r + c.s), ['AS', 'KH', 'QD', 'JC', '9S']);
  assert.deepEqual(v.held, NONE);
  assert.equal(v.hand, null, 'nothing is paid before the draw');
  assert.equal(v.net, null);
  assert.equal(v.bet, 100);
  assert.deepEqual(v.can, { draw: true });
  assert.equal('seq' in v, false, 'one draw a hand: there is no sequence to pace');
  assert.throws(() => pk.newHand({ seed: 'x', bet: 1.5 }), RangeError);
  assert.throws(() => pk.newHand({ seed: 'x', bet: 0 }), RangeError);
  assert.throws(() => pk.newHand({ seed: 'x', bet: 2 ** 53 }), RangeError);
  // and a bet the top row could not be paid on exactly, which is where the integer money path ends
  const cap = Math.floor(Number.MAX_SAFE_INTEGER / pk.PAYS[0].mult);
  assert.equal(pk.newHand({ seed: 'x', bet: cap }).bet, cap);
  assert.ok(Number.isSafeInteger(cap * pk.PAYS[0].mult), 'the cap itself still pays exactly');
  assert.throws(() => pk.newHand({ seed: 'x', bet: cap + 1 }), RangeError);
});

test('the draw replaces what was not kept, from the top of the deck, left to right', () => {
  const st = deal(['2S', '3S', '4S', '5S', '6S', '7H', '8H', '9H']);
  const out = drawWith(st, holdAt([0, 2, 4]));
  assert.deepEqual(V(out).cards.map((c) => c.r + c.s), ['2S', '7H', '4S', '8H', '6S'],
    'slot 1 took the first card off the deck and slot 3 the second');
  assert.deepEqual(V(out).held, holdAt([0, 2, 4]), 'held comes back as the mask the draw used');
  // keeping everything is a draw that moves no card
  const pat = drawWith(deal(['AS', 'KS', 'QS', 'JS', '10S']), ALL);
  assert.equal(pat.hand, pk.ROW.royal);
  assert.deepEqual(V(pat).cards.map((c) => c.r + c.s), ['AS', 'KS', 'QS', 'JS', '10S']);
  // and keeping nothing replaces all five
  const fresh = drawWith(deal(['2S', '3S', '4S', '5S', '7S', 'AH', 'KH', 'QH', 'JH', '10H']), NONE);
  assert.deepEqual(V(fresh).cards.map((c) => c.r + c.s), ['AH', 'KH', 'QH', 'JH', '10H']);
  assert.equal(fresh.hand, pk.ROW.royal);
});

test('a hand settles exactly once, and nothing can be played on it after that', () => {
  const out = drawWith(deal(['AS', 'AH', '2D', '7C', '9S']), holdAt([0, 1]));
  assert.equal(out.phase, 'done');
  assert.equal(pk.whyNot(out, { op: 'draw', hold: ALL }), 'the hand is over');
  assert.equal(drawWith(out, ALL), out, 'a refused draw gives back the very same object');
  assert.equal(pk.whyNot(null, { op: 'draw', hold: ALL }), 'the hand is over');
  assert.equal(pk.whyNot(undefined, { op: 'draw', hold: ALL }), 'the hand is over');
});

test('act never mutates its input', () => {
  for (let i = 0; i < 300; i++) {
    const st = pk.newHand({ seed: 'mut-' + i, bet: 100 });
    const before = snapshot(st);
    const keep = [0, 1, 2, 3, 4].map(() => (i % 3 === 0));
    pk.act(st, { op: 'draw', hold: keep });
    pk.act(st, { op: 'draw', hold: [true] });     // refused
    pk.act(st, 'draw');                            // refused
    assert.equal(snapshot(st), before);
  }
});

test('the hold array is the move, so its shape is a rule', () => {
  const st = deal(['AS', 'KH', 'QD', 'JC', '9S']);
  const bad = [
    undefined, null, 'true', 5, {}, ALL.slice(0, 4), ALL.concat([true]), [],
    [true, true, true, true, 1], [true, true, true, true, 0], [true, true, true, true, null],
    [true, true, true, true, 'false'], [1, 0, 1, 0, 1]
  ];
  for (const hold of bad) {
    assert.equal(pk.whyNot(st, { op: 'draw', hold }), 'hold must be 5 true/false flags', JSON.stringify(hold));
    assert.equal(pk.act(st, { op: 'draw', hold }), st, JSON.stringify(hold));
  }
  for (const hold of [ALL, NONE, holdAt([2])]) assert.equal(pk.whyNot(st, { op: 'draw', hold }), null);
  // badHold is the same answer on its own, which is what the host refuses on
  assert.equal(pk.badHold(ALL), null);
  assert.equal(pk.badHold([true, true]), 'hold must be 5 true/false flags');
  // and no other action exists
  assert.deepEqual(pk.OPS, ['draw']);
  assert.equal(pk.whyNot(st, { op: 'hold', i: 1 }), 'unknown action');
  assert.equal(pk.whyNot(st, 'surrender'), 'unknown action');
  assert.equal(pk.whyNot(st, 'draw'), 'hold must be 5 true/false flags', 'a draw without the flags is not a draw');
  assert.equal(pk.act(st, { op: 'hold', i: 1 }), st);
});

// --- money ------------------------------------------------------------------------------

test('the payout is a whole multiple of the bet, and a paid pair hands the bet straight back', () => {
  const HANDS = [
    [['AS', 'KS', 'QS', 'JS', '10S'], pk.ROW.royal],
    [['9C', '10C', 'JC', 'QC', 'KC'], pk.ROW.straightFlush],
    [['7S', '7H', '7D', '7C', '2S'], pk.ROW.four],
    [['7S', '7H', '7D', '3C', '3S'], pk.ROW.fullHouse],
    [['2H', '4H', '6H', '8H', '10H'], pk.ROW.flush],
    [['AS', '2H', '3D', '4C', '5S'], pk.ROW.straight],
    [['7S', '7H', '7D', '2C', '5S'], pk.ROW.three],
    [['7S', '7H', '2D', '2C', '5S'], pk.ROW.twoPair],
    [['JS', 'JH', '2D', '7C', '9S'], pk.ROW.jacks],
    [['10S', '10H', '2D', '7C', '9S'], pk.ROW.none]
  ];
  // the chips are 10 / 100 / 1K, so these are the bets a player can actually build
  for (const bet of [10, 20, 100, 110, 1000, 1010, 9990, 123450]) {
    for (const [hand, row] of HANDS) {
      const out = drawWith(deal(hand, bet), ALL);
      assert.equal(out.hand, row, hand.join(' '));
      assert.equal(out.net, bet * row.mult - bet, hand.join(' ') + ' at ' + bet);
      assert.ok(Number.isSafeInteger(out.net), 'net ' + out.net);
      assert.equal(out.net, Math.trunc(out.net), 'no fraction survives the payout');
    }
  }
  // the pay line itself: a pair of jacks returns the bet and a pair of tens loses it
  const back = drawWith(deal(['JS', 'JH', '2D', '7C', '9S'], 10), ALL);
  assert.equal(back.hand, pk.ROW.jacks);
  assert.equal(back.net, 0, 'the minimum bet comes back whole');
  const gone = drawWith(deal(['10S', '10H', '2D', '7C', '9S'], 10), ALL);
  assert.equal(gone.hand, pk.ROW.none);
  assert.equal(gone.net, -10, 'a losing hand costs the bet and nothing else');
  assert.equal(V(gone).hand.name, 'No win', 'the result chip has a name even when nothing was won');
  // and the biggest thing on the table, at the minimum bet
  assert.equal(drawWith(deal(['AS', 'KS', 'QS', 'JS', '10S'], 10), ALL).net, 7990);
});

test('the bet does not change the game, only the size of it', () => {
  // every multiplier is whole, so there is no flooring to make a small bet worse (high-low's is
  // the opposite: there, the minimum bet sits in a flat zone a big bet never sees)
  for (let i = 0; i < 400; i++) {
    const seed = 'scale-' + i;
    const hold = [0, 1, 2, 3, 4].map((k) => ((i >> k) & 1) === 1);
    const one = drawWith(pk.newHand({ seed, bet: 1 }), hold);
    for (const bet of [10, 97, 1000]) {
      const big = drawWith(pk.newHand({ seed, bet }), hold);
      assert.equal(big.hand, one.hand, seed);
      assert.equal(big.net, one.net * bet, seed + ' at ' + bet);
    }
  }
});

// --- determinism and what the webview may see --------------------------------------------

test('the same seed and the same holds give the same hand', () => {
  for (let i = 0; i < 300; i++) {
    const seed = 'det-' + i;
    const hold = holdAt([0, 2, 3]);
    assert.deepEqual(V(drawWith(pk.newHand({ seed, bet: 100 }), hold)),
      V(drawWith(pk.newHand({ seed, bet: 100 }), hold)));
  }
  // different seeds deal different cards
  const first = (seed) => V(pk.newHand({ seed, bet: 10 })).cards.map((c) => c.r + c.s).join(',');
  const distinct = new Set(Array.from({ length: 300 }, (_, i) => first('d' + i)));
  assert.equal(distinct.size, 300, 'every seed dealt its own five cards');
  // and the same deck, held differently, is a different hand
  const a = drawWith(pk.newHand({ seed: 'same', bet: 10 }), NONE);
  const b = drawWith(pk.newHand({ seed: 'same', bet: 10 }), holdAt([0]));
  assert.notDeepEqual(V(a).cards, V(b).cards);
});

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
const str = (code) => { const c = C.cardOf(code); return c.r + c.s; };
const firstCards = (st) => JSON.stringify(st.deck.slice(0, 12));
// Seeds and ids shaped exactly like the host's (12 random bytes as hex) but fixed, so this walks
// the same hands every time
const hexSeed = (tag, i) => require('crypto').createHash('sha256').update(tag + i).digest('hex').slice(0, 24);

test('a live view shows only the five cards on the table, and no seed', () => {
  for (let i = 0; i < 300; i++) {
    const seed = hexSeed('live-seed-', i);
    const st = pk.newHand({ seed, id: hexSeed('live-id-', i), bet: 100 });
    const real = firstCards(st);
    const v = V(st);
    assert.equal('seed' in v, false);
    assert.equal(v.net, null);
    assert.equal(v.hand, null);
    assert.notEqual(v.id, seed);
    // nothing in the view names a card the deck has not dealt
    const shown = new Set(cardsIn(v));
    const dealt = new Set(st.deck.slice(0, st.pos).map(str));
    assert.equal(shown.size, 5);
    for (const c of shown) assert.ok(dealt.has(c), 'view shows an undealt ' + c);
    // and nothing in it re-deals the deck: not the id, not a rank, not a paytable row
    for (const leaf of leaves(v)) {
      assert.notEqual(firstCards(pk.newHand({ seed: String(leaf), bet: 10 })), real, 'leaf ' + leaf);
    }
    // the draw cannot be read off the view either: the same table with a different deck under it
    // would show exactly the same thing
    const out = drawWith(st, holdAt([0, 1]));
    assert.equal(V(out).seed, seed, 'the seed arrives once the hand is over');
    assert.equal(firstCards(pk.newHand({ seed: V(out).seed, bet: 10 })), real); // and the check can see a match
  }
});

test('the idle view is a bet screen with the paytable on it', () => {
  const v = pk.view(null);
  assert.equal(v.phase, 'bet');
  assert.deepEqual(v.cards, []);
  assert.deepEqual(v.held, NONE);
  assert.equal(v.hand, null);
  assert.equal(v.net, null);
  assert.equal(v.bet, null);
  assert.deepEqual(v.can, { draw: false });
  assert.equal('seed' in v, false);
  // the screen holds no numbers of its own: the nine rows come from here, on every view
  assert.equal(v.pays, pk.PAYS);
  assert.equal(V(deal(['AS', 'KH', 'QD', 'JC', '9S'])).pays, pk.PAYS);
  assert.equal(V(drawWith(deal(['AS', 'KH', 'QD', 'JC', '9S']), ALL)).pays, pk.PAYS);
  assert.equal(pk.PAYS.length, 9);
  // and it cannot be edited from the outside, by the screen or by a test
  assert.throws(() => { pk.PAYS[0].mult = 1; }, TypeError);
  assert.throws(() => { pk.PAYS.push({}); }, TypeError);
});

// --- a player, for the Monte Carlo -------------------------------------------------------
// The published simplified strategy for Jacks or Better: hold the first thing on the list that
// fits. It gives up a fraction of a percent against a perfect solver, so what it measures is a
// floor under the table's return rather than the table's own figure. The two cruder players below
// are there to show how much of the measured return is the table and how much is the player.
const ord = pk.orderOf;
const high = (code) => ord(code) >= pk.JACK;
const ALL5 = [0, 1, 2, 3, 4];

function suitGroups(hand) {
  const g = [[], [], [], []];
  for (let i = 0; i < 5; i++) g[pk.suitOf(hand[i])].push(i);
  return g;
}
// Index groups of cards sharing a rank, biggest group first
function rankGroups(hand) {
  const by = new Map();
  for (let i = 0; i < 5; i++) {
    const o = ord(hand[i]);
    if (!by.has(o)) by.set(o, []);
    by.get(o).push(i);
  }
  return Array.from(by.values()).sort((a, b) => b.length - a.length);
}
const sameRank = (hand, n) => rankGroups(hand).find((g) => g.length === n) || null;
function choose(arr, k) {
  if (k === 0) return [[]];
  const out = [];
  for (let i = 0; i <= arr.length - k; i++) for (const rest of choose(arr.slice(i + 1), k - 1)) out.push([arr[i]].concat(rest));
  return out;
}
// k cards of one suit, all a ten or better: the royal draws
function toRoyal(hand, g, k) {
  for (const idx of g) {
    const r = idx.filter((i) => ord(hand[i]) >= pk.TEN);
    if (r.length >= k) return r.slice(0, k);
  }
  return null;
}
// k cards of one suit that fit inside one straight window
function toStraightFlush(hand, g, k) {
  for (const idx of g) {
    if (idx.length < k) continue;
    for (const pick of choose(idx, k)) if (pk.windowsOver(pick.map((i) => ord(hand[i]))) > 0) return pick;
  }
  return null;
}
// k cards of one suit, whatever their ranks
function toFlush(hand, g, k) {
  const idx = g.find((group) => group.length >= k);
  return idx ? idx.slice(0, k) : null;
}
// four to a straight, picked by how many windows hold it: 2 is open at both ends, 1 at one
function toStraight4(hand, windows) {
  for (const pick of choose(ALL5, 4)) {
    const os = pick.map((i) => ord(hand[i]));
    if (new Set(os).size === 4 && pk.windowsOver(os) === windows) return pick;
  }
  return null;
}
function suitedHigh2(hand, g) {
  for (const idx of g) {
    const h = idx.filter((i) => high(hand[i]));
    if (h.length >= 2) return h.slice(0, 2);
  }
  return null;
}
// a suited ten next to one high card: the smallest royal draw worth keeping
function suitedTenHigh(hand, g) {
  for (const idx of g) {
    const ten = idx.find((i) => ord(hand[i]) === pk.TEN);
    const h = idx.filter((i) => high(hand[i]));
    if (ten != null && h.length >= 1) return [ten, h[0]];
  }
  return null;
}
// the lowest n high cards (the ace is the one to let go of first)
function highCards(hand, n) {
  const h = ALL5.filter((i) => high(hand[i])).sort((a, b) => ord(hand[a]) - ord(hand[b]));
  return h.length >= n ? h.slice(0, n) : null;
}

function chart(hand) {
  const g = suitGroups(hand);
  const made = pk.rankOf(hand);
  let pick;
  if (made === pk.ROW.four || made === pk.ROW.straightFlush || made === pk.ROW.royal) return ALL5;
  if ((pick = toRoyal(hand, g, 4))) return pick;          // worth breaking a made flush or straight for
  if (made === pk.ROW.fullHouse || made === pk.ROW.flush || made === pk.ROW.straight) return ALL5;
  if (made === pk.ROW.three) return sameRank(hand, 3);    // the two kickers are what become a full house
  if ((pick = toStraightFlush(hand, g, 4))) return pick;
  if (made === pk.ROW.twoPair) return rankGroups(hand).slice(0, 2).flat();
  if (made === pk.ROW.jacks) return sameRank(hand, 2);
  if ((pick = toRoyal(hand, g, 3))) return pick;
  if ((pick = toFlush(hand, g, 4))) return pick;
  if ((pick = sameRank(hand, 2))) return pick;            // a pair that pays nothing by itself
  if ((pick = toStraight4(hand, 2))) return pick;
  if ((pick = suitedHigh2(hand, g))) return pick;
  if ((pick = toStraightFlush(hand, g, 3))) return pick;
  pick = toStraight4(hand, 1);
  if (pick && pick.filter((i) => high(hand[i])).length >= 3) return pick;
  if ((pick = highCards(hand, 2))) return pick;
  if ((pick = suitedTenHigh(hand, g))) return pick;
  if ((pick = highCards(hand, 1))) return pick;
  return [];
}

// Keep anything already paid, and otherwise every high card. No draw is ever reached for
function crude(hand) {
  const made = pk.rankOf(hand);
  if (made === pk.ROW.three) return sameRank(hand, 3);
  if (made === pk.ROW.twoPair) return rankGroups(hand).slice(0, 2).flat();
  if (made === pk.ROW.jacks) return sameRank(hand, 2);
  if (made !== pk.ROW.none) return ALL5;
  const pair = sameRank(hand, 2);
  if (pair) return pair;
  return highCards(hand, 5) || highCards(hand, 4) || highCards(hand, 3) || highCards(hand, 2) || highCards(hand, 1) || [];
}

// Keep a paid hand and throw everything else away, high cards included
function patOnly(hand) {
  const made = pk.rankOf(hand);
  if (made === pk.ROW.none) return [];
  if (made === pk.ROW.three) return sameRank(hand, 3);
  if (made === pk.ROW.twoPair) return rankGroups(hand).slice(0, 2).flat();
  if (made === pk.ROW.jacks) return sameRank(hand, 2);
  return ALL5;
}

test('the chart player only ever keeps cards it was dealt', () => {
  for (const pick of [chart, crude, patOnly]) {
    for (let i = 0; i < 2000; i++) {
      const st = pk.newHand({ seed: 'legal-' + i, bet: 1 });
      const keep = pick(st.cards);
      assert.ok(Array.isArray(keep), 'no hold at all for ' + st.cards.map(str).join(' '));
      assert.equal(new Set(keep).size, keep.length, 'a card kept twice');
      for (const k of keep) assert.ok(Number.isInteger(k) && k >= 0 && k < 5, 'index ' + k);
    }
  }
});

// --- Monte Carlo ------------------------------------------------------------------------
// The house's cut is the whole reason the table reads 8/5 and not 9/6, and the only way to see it
// is to play the table. A hand is one deck and one draw, so a run is: deal from a seed, hand the
// five cards to a strategy, draw on what it keeps, and bank the net.
//
// Bet 1, because every multiplier is whole: nothing is floored, so the bet cancels out of the
// return entirely (the test above proves that separately) and the numbers below are returns per
// credit staked.
function simulate(pick, n, tag) {
  let sum = 0, sumSq = 0;
  const rows = new Map();
  for (let i = 0; i < n; i++) {
    const st = pk.newHand({ seed: tag + '-' + i, bet: 1 });
    const keep = pick(st.cards);
    const hold = [false, false, false, false, false];
    for (const k of keep) hold[k] = true;
    const out = pk.act(st, { op: 'draw', hold });
    const paid = out.hand.mult;
    sum += paid; sumSq += paid * paid;
    rows.set(out.hand.name, (rows.get(out.hand.name) || 0) + 1);
  }
  const rtp = sum / n;
  return { rtp, se: Math.sqrt((sumSq / n - rtp * rtp) / n), rows, n };
}

// What this has to be is tight enough to tell an 8/5 table from a 9/6 one, which the assertion
// below writes down as SE < 0.4%: a single row of the table is worth more than a percent. The
// royal is 800 of the return and turns up about once in 60,000 hands, so the error bar comes down
// slowly, and the seeds are fixed, so each count measures the very same number on every run.
// Measured here (whole file, wall clock): 500,000 -> SE 0.52% and 1,000,000 -> 0.43%, both too
// coarse to pass; 1,500,000 -> 97.37% +-0.37% in 7.7s; 3,000,000 -> 97.24% +-0.26% in 13.6s.
// 1,500,000 is the smallest round count that clears the band. A tighter reading is a flag away,
// and it settles at 97.24% +-0.14% over ten million:
//   PK_MC_HANDS=10000000 node test/poker.test.js
const MC_HANDS = Number(process.env.PK_MC_HANDS || 1500000);
const pct = (x) => (x * 100).toFixed(2) + '%';

function report(name, r) {
  console.log('  ' + name.padEnd(24) + 'return ' + pct(r.rtp) + '  (SE ' + pct(r.se) + ', ' + r.n.toLocaleString('en-US') + ' hands)');
}

// The return a strategy measures is one number with a wide error bar on it, because the royal is
// 800 of it and turns up about once in 40,000 hands. The breakdown is the same measurement read
// row by row, which is what shows where the return comes from and how much of it is the jackpot
function breakdown(r) {
  console.log('  ' + 'row'.padEnd(14) + 'hands'.padStart(9) + 'once in'.padStart(10) + 'of the return'.padStart(15));
  for (const row of pk.PAYS.concat([pk.NO_WIN])) {
    const n = r.rows.get(row.name) || 0;
    const share = (n * row.mult) / (r.rtp * r.n);
    console.log('  ' + row.name.padEnd(14) + String(n).padStart(9)
      + (n ? (r.n / n).toFixed(0) : '-').padStart(10)
      + (row.mult ? pct(share) : '-').padStart(15));
  }
}

test('Monte Carlo ' + MC_HANDS.toLocaleString('en-US') + ' hands: the 8/5 table keeps about 3%', () => {
  const t0 = Date.now();
  const c = simulate(chart, MC_HANDS, 'mc-chart');
  const k = simulate(crude, Math.min(MC_HANDS, 300000), 'mc-crude');
  const p = simulate(patOnly, Math.min(MC_HANDS, 300000), 'mc-pat');
  report('simplified chart', c);
  report('pair-or-high-cards', k);
  report('paid hands only', p);
  breakdown(c);
  console.log('  measured in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  // A worse player cannot be paid more by the same table
  assert.ok(c.rtp > k.rtp, 'the chart beats the crude player: ' + pct(c.rtp) + ' vs ' + pct(k.rtp));
  assert.ok(k.rtp > p.rtp, 'keeping high cards beats throwing them: ' + pct(k.rtp) + ' vs ' + pct(p.rtp));
  // The error bar has to be small against one row of the table, or this cannot tell 8/5 from 9/6
  assert.ok(c.se < 0.004, 'measured too coarsely to judge the band: SE ' + pct(c.se));
  // and the house keeps 2-4% of what the best player here stakes, the band the other two games sit
  // in. The seeds are fixed, so this figure is the same on every run and only moves if the table or
  // the strategy does
  assert.ok(c.rtp > 0.96 && c.rtp < 0.98, 'the chart player returns ' + pct(c.rtp) + ' +-' + pct(c.se));
  // the jackpot is not the whole table: a player who never hits one is still returned most of this
  const royals = c.rows.get('Royal flush') || 0;
  assert.ok(royals > 0, 'no royal in ' + c.n.toLocaleString('en-US') + ' hands');
  assert.ok(c.rtp - (royals * 800) / c.n > 0.9, 'without the royal the table pays too little to play');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
