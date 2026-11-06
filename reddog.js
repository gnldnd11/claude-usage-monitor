// The crab's red dog (acey-deucey). Two cards from a 6-deck shoe, and the question is whether a
// third lands between them. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - a 6-deck shoe shuffled from a seed. Ace high, two low, and suits never matter
//  - two cards come up. CONSECUTIVE ranks (a spread of 0) is a push: the bet comes straight back
//  - a PAIR deals a third card at once, with nothing to decide: a third of the same rank pays
//    PAIR_ODDS to 1, anything else is a push
//  - otherwise the SPREAD is how many ranks sit strictly between the two, 1 to MAX_SPREAD, and the
//    player may raise by the bet once, or stand. Then the third card comes: inside the two pays the
//    spread's odds, outside loses
//  - the odds pay on the WHOLE wager, the raise included, which is what makes the raise a bet on
//    the same question rather than a second game
//
// A fresh shoe every round, and that is a rule rather than a convenience. Blackjack and high-low
// deal on through a shoe, and high-low even prices its calls off what is left, which is the honest
// thing to do when the cards left are on the screen. Here the whole game is one posted number, the
// chance that a third card lands inside a spread, and that number is 24 * spread / 310 only while
// the shoe is full. Deal a second round from the same shoe and the true chance drifts away from the
// posted table, upward or downward depending on what has already come out, and a player who
// tracked the in-between ranks could wait for the rounds where the table is paying over the odds.
// A fresh shoe makes the table exact, every round, for everyone.
//
// Money: the wager is at risk from the deal, the raise adds exactly the bet to it, and the round
// settles exactly once. Every payout is `wager * a whole number`, so NOTHING is rounded and no
// float touches the money path.
//
// Determinism: the same seed always deals the same shoe, so a "same shoe" challenge can replay a
// round. The seed is the whole shoe, the third card included, so it must never be visible while a
// round is live: view() shows it only once the round is done, and the round id is a separate value.
//
// What this game cannot promise, and the reason is structural. Every other game in the casino
// returns 96-97% whatever the player does. Here the RAISE is a choice, and a choice that cannot be
// made neutral: a round at spread s returns (1 + odds) * 24s / 310 per credit staked whether or not
// it was raised (raising doubles the stake and the return together), so raising only shifts weight
// onto that number. At the traditional odds those numbers run from 0.46 at spread 1 to 1.70 at
// spread 11, so raising a narrow spread is a bad bet and raising a wide one is a good one.
// Flattening them with whole-number odds was tried and does not work: the smallest whole odds that
// bring spreads 1 to 4 near 0.96 are 11, 5, 3 and 2, and since those four spreads are 45% of all
// rounds the wheel comes off the cart, with the house losing 4% even when a pair pays nothing at
// all. So the band here is asserted where it can be: the BEST play returns 96.73%, no play returns
// more, and test/reddog.test.js proves it over all 2^11 ways of choosing where to raise. Every
// posted chance is in view() before the choice is made, which is the most the game can offer.
//
// The op contract the screen is written against, at most one message per round:
//   act(st, { op: 'raise' })   or   act(st, 'raise')
//   act(st, { op: 'stand' })   or   act(st, 'stand')
// A pair and a consecutive pair settle at the deal, so those rounds take no message at all.

const C = require('./cards');

const OPS = ['raise', 'stand'];

// The smallest bet the host will take, the same figure as every other game in the casino
const MIN_BET = 10;

const RANKS = 13;
const PER_RANK = 4 * C.DECKS;          // 24 of every rank in a 6-deck shoe
const SHOE = 52 * C.DECKS;             // 312
const LEFT = SHOE - 2;                 // what the third card comes from, after two are up
const MAX_SPREAD = RANKS - 2;          // 11: a two and an ace, with every other rank between them
const COMBOS = (SHOE * (SHOE - 1)) / 2; // the two-card openings there are, 48,516

// --- the table ----------------------------------------------------------------------------------
//
// A pair's third card matching: PER_RANK - 2 of the LEFT cards, so 22 in 310.
// A spread's third card landing inside: PER_RANK * spread of the LEFT cards, 24s in 310, and it is
// exactly 24s because neither card that is up can be one of the ranks between them.
//
// The spread odds are the traditional ones. PAIR_ODDS is not: the traditional 11 to 1 puts the best
// play at 97.63%, over the casino's band, because a pair is 7.4% of all rounds and returns 178% of
// its stake (a match pays 12 for 1 and a miss still pushes). Walking it down is the only lever the
// band has, since the five spreads worth raising already pay the lowest whole odds there are:
//   11 to 1 -> 97.63%   10 to 1 -> 97.18%   9 to 1 -> 96.73%   8 to 1 -> 96.29%
// 9 keeps the band with room on both sides, so 9 it is. The brief for this game said the band comes
// before the traditional figure, and this is the one place the two disagree
const PAIR_ODDS = 9;

// Odds to 1 per spread, index = spread - 1. Spread 1 is the hardest to hit and pays the most
const SPREAD_ODDS = Object.freeze([5, 4, 2, 1, 1, 1, 1, 1, 1, 1, 1]);

// The table is the whole game, so a typo in it is the whole game being wrong. Checked once, when
// the module loads, the way forge.js checks its table
(function checkTable() {
  if (SPREAD_ODDS.length !== MAX_SPREAD) throw new Error('reddog: the table needs a row per spread');
  if (!Number.isSafeInteger(PAIR_ODDS) || PAIR_ODDS < 1) throw new Error('reddog: bad pair odds');
  if (PER_RANK < 3) throw new Error('reddog: a pair could not be beaten by a third of the same rank');
  for (let s = 1; s <= MAX_SPREAD; s++) {
    const o = SPREAD_ODDS[s - 1];
    if (!Number.isSafeInteger(o) || o < 1) throw new Error('reddog: bad odds at spread ' + s);
    // a wider spread is easier to hit, so it must never pay more. Odds that climbed with the
    // spread would make the easy bet the rich one as well
    if (s > 1 && o > SPREAD_ODDS[s - 2]) throw new Error('reddog: the odds climb at spread ' + s);
    // a spread can never be a certainty, or its odds would be free money
    if (PER_RANK * s >= LEFT) throw new Error('reddog: spread ' + s + ' cannot miss');
  }
})();

const TOP_ODDS = Math.max(PAIR_ODDS, SPREAD_ODDS[0]);

// Odds to 1 for a spread, or null where there is nothing to win: 0 is a push and a pair is its own
// row. Exported because this is the one place that knows the table
function oddsAt(spread) {
  if (spread < 1 || spread > MAX_SPREAD) return null;
  return SPREAD_ODDS[spread - 1];
}

// The exact chance a third card lands inside a spread, as num/den. Never a float: the screen prints
// it and the tests count with it
function chanceAt(spread) {
  if (spread < 1 || spread > MAX_SPREAD) return null;
  return { num: PER_RANK * spread, den: LEFT };
}

// How often an opening comes up, as num/den over every two-card combination there is. `kind` is
// 'pair', 'consecutive', or a spread of 1..MAX_SPREAD
function dealChance(kind, spread) {
  if (kind === 'pair') return { num: RANKS * ((PER_RANK * (PER_RANK - 1)) / 2), den: COMBOS };
  if (kind === 'consecutive') return { num: (RANKS - 1) * PER_RANK * PER_RANK, den: COMBOS };
  return { num: (RANKS - 1 - spread) * PER_RANK * PER_RANK, den: COMBOS };
}

// --- rank order ---------------------------------------------------------------------------------

// Two lowest, ace highest. Card codes number the ranks A,2..10,J,Q,K, so rotating the rank index by
// one puts the ace on top: 2 -> 0, 10 -> 8, J -> 9, Q -> 10, K -> 11, A -> 12 (poker and high-low
// turn it the same way, for the same reason)
function orderOf(code) {
  return (code % 13 + 12) % 13;
}

// The spread between two cards: how many ranks sit strictly between them. 0 is consecutive and -1
// is a pair, which is not a spread at all but the branch that deals a third card for free.
// Exported so a test can name an opening without rebuilding the arithmetic
function spreadOf(a, b) {
  return Math.abs(orderOf(a) - orderOf(b)) - 1;
}

// --- state --------------------------------------------------------------------------------------

function draw(st) {
  if (st.pos >= st.shoe.length) throw new RangeError('the shoe ran out'); // a stacked shoe too short
  const code = st.shoe[st.pos];
  st.pos += 1;
  return code;
}

// The shoe is never mutated (only `pos` moves), so a copy shares it
function clone(st) {
  return Object.assign({}, st, { cards: st.cards.slice() });
}

function live(st) {
  return !!st && st.phase === 'play';
}

// Settling, and the only place money is named. `paid` is what comes back from the table, which is
// the whole wager on a push and nothing at all on a loss, and `net` is what the balance moved by
function settle(st, result, odds) {
  st.result = result;
  st.odds = odds;
  st.paid = result === 'win' ? st.wager * (1 + odds) : result === 'push' ? st.wager : 0;
  st.net = st.paid - st.wager;
  st.phase = 'done';
}

// The third card, and what it means. Called for a pair at the deal and for a spread once the player
// has chosen, and those are the only two ways a third card is ever dealt
function third(st) {
  const card = draw(st);
  st.cards.push(card);
  if (st.kind === 'pair') {
    const matched = orderOf(card) === orderOf(st.cards[0]);
    settle(st, matched ? 'win' : 'push', matched ? PAIR_ODDS : null);
    return;
  }
  const lo = Math.min(orderOf(st.cards[0]), orderOf(st.cards[1]));
  const hi = Math.max(orderOf(st.cards[0]), orderOf(st.cards[1]));
  const inside = orderOf(card) > lo && orderOf(card) < hi;
  settle(st, inside ? 'win' : 'lose', inside ? oddsAt(st.spread) : null);
}

// seed: any string (a fresh one per round, and a fresh shoe with it). id: the round's public name,
// which must not be the seed (null if not given). stack: explicit card order such as
// ['AS', '10H', ...] instead of the seeded shuffle, for tests and replays
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (whole-number payouts, nothing rounded) only holds while the biggest
  // one is still a safe integer. A raised wager is twice the bet and the richest row pays
  // 1 + TOP_ODDS on it, so that product is what the cap is read off
  if (bet > Number.MAX_SAFE_INTEGER / (2 * (1 + TOP_ODDS))) throw new RangeError('bet is too large to pay the top row exactly');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const st = {
    id: opts.id == null ? null : String(opts.id), seed, phase: 'play', bet,
    wager: bet, raised: false,
    shoe: opts.stack ? opts.stack.map(C.codeOf) : C.shuffledShoe(seed), pos: 0,
    cards: [], kind: null, spread: null,
    result: null, odds: null, paid: null, net: null
  };
  st.cards.push(draw(st));
  st.cards.push(draw(st));
  const spread = spreadOf(st.cards[0], st.cards[1]);
  if (spread < 0) {
    st.kind = 'pair';
    third(st);                 // nothing to decide: the third card comes at once
  } else if (spread === 0) {
    // the spread is carried even though there is nothing to bet on it: the screen prints the
    // opening, and "spread 0" is what a consecutive pair IS. A pair's spread stays null, because
    // a pair is not a narrow spread, it is the other branch
    st.kind = 'consecutive';
    st.spread = 0;
    settle(st, 'push', null);  // and no third card is dealt at all
  } else {
    st.kind = 'spread';
    st.spread = spread;
  }
  return st;
}

// What this round has riding on it: the wager, which the raise has already doubled if it happened
function stake(st) {
  return st.wager;
}

// Why `op` cannot be played now, or null. budget (optional): credits available for stakes; this
// round's current wager is not yet taken from it (stakes move only at settlement)
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : op;
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!live(st)) return 'the round is over';
  if (name === 'raise') {
    const room = budget == null ? Infinity : budget - stake(st);
    // written as !(a <= b) so a NaN budget refuses instead of slipping through
    if (!(st.bet <= room)) return 'not enough credits';
  }
  return null;
}

const MOVES = {
  raise(st) {
    st.wager += st.bet;
    st.raised = true;
    third(st);
  },
  stand(st) {
    third(st);
  }
};

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  MOVES[op && typeof op === 'object' ? op.op : op](next);
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

// The whole rulebook, a row at a time, in the order the screen prints it. The screen holds no odds
// and no chance of its own, so a retune here moves the screen with it.
//
// Both chances are handed over as num/den rather than percentages, so the screen never divides:
// `chance` is how often the third card settles the row the player's way, and `deal` is how often
// the opening comes up at all. The second one is what makes the table honest rather than
// flattering: spread 1 pays 5 to 1 and comes up in one round out of eight, and the player can see
// both before deciding whether to double the bet on it
const PAYS = Object.freeze([
  Object.freeze({
    kind: 'pair', spread: null, name: 'Pair, then its rank', odds: PAIR_ODDS,
    chance: Object.freeze({ num: PER_RANK - 2, den: LEFT }),
    deal: Object.freeze(dealChance('pair')),
    note: 'any other third card pushes'
  }),
  Object.freeze({
    kind: 'consecutive', spread: 0, name: 'Consecutive', odds: null,
    chance: null, deal: Object.freeze(dealChance('consecutive')),
    note: 'the bet comes back'
  })
].concat((function () {
  const rows = [];
  for (let s = 1; s <= MAX_SPREAD; s++) {
    rows.push(Object.freeze({
      kind: 'spread', spread: s, name: 'Spread ' + s, odds: oddsAt(s),
      chance: Object.freeze(chanceAt(s)),
      deal: Object.freeze(dealChance('spread', s)),
      note: null
    }));
  }
  return rows;
})()));

const BY_SPREAD = Object.freeze(PAYS.reduce((m, r) => { if (r.kind === 'spread') m[r.spread] = r; return m; }, {}));

function idleView() {
  return {
    phase: 'bet', id: null, bet: null, wager: null, raised: false,
    cards: [], kind: null, spread: null, row: null,
    pays: PAYS, decks: C.DECKS, left: LEFT,
    result: null, odds: null, paid: null, mult: null, net: null,
    can: { raise: false, stand: false }
  };
}

// The shoe, `pos` and the seed stay inside the state, and the seed appears only at 'done', where
// the shoe it names is thrown away and the next round shuffles a new one of its own. Every card
// handed over here is face up: the third card does not exist until it is dealt, so there is no hole
// card to hide and nothing face down to leak through a derived number either.
//
// `mult` is read BACK OUT of the payout rather than taken from the table. The two cannot differ
// while a payout is `wager * a whole number`, which is exactly why it is written this way: a screen
// that prints a multiplier the payout does not support is the bug this closes. It is 1 + the odds
// on a win, 1 on a push and 0 on a loss, so the result chip is always a figure the balance agrees
// with
function view(st, budget) {
  if (!st) return idleView();
  const done = st.phase === 'done';
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    wager: st.wager,
    raised: st.raised,
    cards: st.cards.map(C.cardOf),
    kind: st.kind,
    spread: st.spread,
    // the row in hand: the one the player is deciding against, or the one that settled the round
    row: st.kind === 'spread' ? BY_SPREAD[st.spread] : PAYS.find((r) => r.kind === st.kind) || null,
    pays: PAYS,
    decks: C.DECKS,
    left: LEFT,
    result: st.result,
    odds: st.odds,
    paid: st.paid,
    mult: done ? st.paid / st.wager : null,
    net: st.net,
    can: {
      raise: !whyNot(st, 'raise', budget),
      stand: !whyNot(st, 'stand', budget)
    }
  };
  if (done) v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  orderOf, spreadOf, oddsAt, chanceAt, dealChance,
  PAYS, BY_SPREAD, SPREAD_ODDS, PAIR_ODDS, MAX_SPREAD, PER_RANK, RANKS, SHOE, LEFT, COMBOS,
  OPS, MIN_BET, DECKS: C.DECKS
};
