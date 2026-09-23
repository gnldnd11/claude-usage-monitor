// Solo blackjack against the crab dealer. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - 6-deck shoe shuffled from a seed; every round uses a fresh shoe (a fresh seed)
//  - deal order: player, dealer up, player, dealer hole
//  - the dealer stands on every 17, soft 17 included (S17)
//  - blackjack pays 3:2 rounded down (credits are whole numbers, so an odd bet loses the half)
//  - with an ace or ten-value upcard the dealer peeks; a dealer blackjack settles the round at once
//    (a player blackjack pushes, anything else loses the base bet)
//  - double on the first two cards of any hand, split hands included
//  - split once, on two cards of the same value (10, J, Q and K pair with each other); no resplit.
//    Both split hands get their second card at once, hand 0 first, before either is played
//  - split aces get one card each and stand; 21 after a split is not a blackjack
//  - a hand that reaches 21 stands by itself
//  - no insurance, no surrender
//
// Determinism: the same seed and the same actions always give the same cards and the same result,
// so a "same deck" challenge can replay a seed.
// The seed is the whole shoe, face-down card included, so it must never be visible while a round
// is live: `view()` shows it only once the round is done, and the round id is a separate value.
//
// State is internal (it holds the shoe and the face-down card); `view()` makes what the webview may see.
// `act()` never mutates its input and returns the very same object when the action is not allowed;
// `whyNot()` says why.

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['S', 'H', 'D', 'C'];
const DECKS = 6;
const OPS = ['hit', 'stand', 'double', 'split'];

// --- seeded shoe -------------------------------------------------------------------

// FNV-1a: seed string -> 32-bit integer
function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// mulberry32: small, fast 32-bit PRNG, uniform in [0, 1)
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Card codes 0..51: suit * 13 + rank index. Fisher-Yates over DECKS decks
function shuffledShoe(seed) {
  const rand = mulberry32(hashSeed(String(seed)));
  const shoe = [];
  for (let d = 0; d < DECKS; d++) for (let c = 0; c < 52; c++) shoe.push(c);
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = shoe[i]; shoe[i] = shoe[j]; shoe[j] = t;
  }
  return shoe;
}

// 'AS', '10H', 'KD' -> card code (a stacked shoe, for tests and replays)
function codeOf(str) {
  const s = String(str);
  const r = RANKS.indexOf(s.slice(0, -1));
  const u = SUITS.indexOf(s.slice(-1));
  if (r < 0 || u < 0) throw new RangeError('bad card: ' + s);
  return u * 13 + r;
}

function cardOf(code) {
  return { r: RANKS[code % 13], s: SUITS[Math.floor(code / 13)] };
}

// --- hand arithmetic ------------------------------------------------------------------

// Ace 1 here; handValue promotes one ace to 11 when that does not bust
function points(card) {
  if (card.r === 'A') return 1;
  if (card.r === 'J' || card.r === 'Q' || card.r === 'K') return 10;
  return Number(card.r);
}

function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) { total += points(c); if (c.r === 'A') aces++; }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

function isNatural(cards) {
  return cards.length === 2 && handValue(cards).total === 21;
}

// --- state ----------------------------------------------------------------------------

function draw(st) {
  if (st.pos >= st.shoe.length) throw new RangeError('the shoe ran out'); // a stacked shoe too short for the round
  const card = cardOf(st.shoe[st.pos]);
  st.pos += 1;
  return card;
}

function dealPlayer(st, i) {
  const card = draw(st);
  st.hands[i].cards.push(card);
  st.seq.push({ ev: 'card', to: 'player', hand: i, card });
}

// faceUp false = the hole card: dealt, but the event carries no card
function dealDealer(st, faceUp) {
  const card = draw(st);
  st.dealer.cards.push(card);
  st.seq.push({ ev: 'card', to: 'dealer', card: faceUp ? card : null });
}

function newHand(cards, bet, fromSplit) {
  return { cards, bet, done: false, result: null, fromSplit, splitAce: fromSplit && cards[0].r === 'A' };
}

// Copy for act(): hands and dealer are rebuilt, the shoe is never mutated so it is shared
function clone(st) {
  return Object.assign({}, st, {
    hands: st.hands.map((h) => Object.assign({}, h, { cards: h.cards.slice() })),
    dealer: { cards: st.dealer.cards.slice(), hole: st.dealer.hole },
    seq: []
  });
}

function payout(h) {
  if (h.result === 'blackjack') return Math.floor((h.bet * 3) / 2);
  if (h.result === 'win') return h.bet;
  if (h.result === 'push') return 0;
  return -h.bet; // lose, bust
}

function compare(h, dealerTotal) {
  const p = handValue(h.cards).total;
  if (dealerTotal > 21 || p > dealerTotal) return 'win';
  return p < dealerTotal ? 'lose' : 'push';
}

// Turn the hole card, let the dealer draw if any hand is still open, settle, close the round
function finish(st) {
  st.dealer.hole = false;
  st.seq.push({ ev: 'reveal', card: st.dealer.cards[1] });
  if (st.hands.some((h) => h.result === null)) {
    while (handValue(st.dealer.cards).total < 17) dealDealer(st, true);
  }
  const dealerTotal = handValue(st.dealer.cards).total;
  for (const h of st.hands) if (h.result === null) h.result = compare(h, dealerTotal);
  st.net = st.hands.reduce((sum, h) => sum + payout(h), 0);
  st.phase = 'done';
}

// Move to the first unfinished hand, or to the dealer when there is none
function advance(st) {
  const i = st.hands.findIndex((h) => !h.done);
  if (i >= 0) st.active = i;
  else finish(st);
}

// After a card: bust ends the hand lost, 21 stands by itself
function checkHand(h) {
  const t = handValue(h.cards).total;
  if (t > 21) { h.result = 'bust'; h.done = true; }
  else if (t === 21) h.done = true;
}

// Peek and naturals, right after the deal
function settleOpening(st) {
  const up = st.dealer.cards[0];
  const peeks = up.r === 'A' || points(up) === 10;
  const hand = st.hands[0];
  const playerBJ = isNatural(hand.cards);
  if (peeks && isNatural(st.dealer.cards)) {
    hand.result = playerBJ ? 'push' : 'lose';
  } else if (playerBJ) {
    hand.result = 'blackjack';
  } else {
    return;
  }
  hand.done = true;
  finish(st);
}

// seed: any string (a fresh one per round). id: the round's public name, which must not be the seed
// (null if not given). stack: explicit card order such as ['AS', '10H', ...] instead of the seeded
// shuffle, for tests and replays
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const st = {
    id: opts.id == null ? null : String(opts.id), seed, phase: 'player', bet,
    shoe: opts.stack ? opts.stack.map(codeOf) : shuffledShoe(seed), pos: 0,
    hands: [newHand([], bet, false)], active: 0,
    dealer: { cards: [], hole: true },
    net: null, seq: []
  };
  dealPlayer(st, 0); dealDealer(st, true); dealPlayer(st, 0); dealDealer(st, false);
  settleOpening(st);
  return st;
}

function stake(st) {
  return st.hands.reduce((sum, h) => sum + h.bet, 0);
}

// Why `op` cannot be played now, or null. budget (optional): credits available for stakes; the
// round's current stake is not yet taken from it (stakes move only at settlement)
function whyNot(st, op, budget) {
  if (!OPS.includes(op)) return 'unknown action';
  if (!st || st.phase !== 'player') return 'the round is over';
  const h = st.hands[st.active];
  const room = budget == null ? Infinity : budget - stake(st);
  if (op === 'hit' && h.splitAce) return 'split aces take one card';
  // written as !(a <= b) so a NaN budget refuses instead of slipping through
  if (op === 'double') {
    if (h.cards.length !== 2 || h.splitAce) return 'double only on the first two cards';
    if (!(h.bet <= room)) return 'not enough credits';
  }
  if (op === 'split') {
    if (st.hands.length > 1) return 'already split once';
    if (h.cards.length !== 2 || points(h.cards[0]) !== points(h.cards[1])) return 'not a pair';
    if (!(st.bet <= room)) return 'not enough credits';
  }
  return null;
}

const MOVES = {
  hit(st) {
    const h = st.hands[st.active];
    dealPlayer(st, st.active);
    checkHand(h);
    if (h.done) advance(st);
  },
  stand(st) {
    st.hands[st.active].done = true;
    advance(st);
  },
  double(st) {
    const h = st.hands[st.active];
    h.bet *= 2;
    dealPlayer(st, st.active);
    checkHand(h);
    h.done = true;
    advance(st);
  },
  split(st) {
    const [a, b] = st.hands[0].cards;
    st.hands = [newHand([a], st.bet, true), newHand([b], st.bet, true)];
    st.seq.push({ ev: 'split', hand: 0 });
    dealPlayer(st, 0);
    dealPlayer(st, 1);
    for (const h of st.hands) {
      if (h.splitAce) h.done = true;
      else checkHand(h);
    }
    advance(st);
  }
};

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  MOVES[op](next);
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

function idleView() {
  return {
    id: null, phase: 'bet', bet: null, hands: [], active: 0,
    dealer: { cards: [], hole: false, total: null },
    can: { hit: false, stand: false, double: false, split: false },
    net: null, seq: []
  };
}

// The hole card is left out while it is face down: dealer.cards then holds only the upcard and
// hole=true tells the webview to draw a card back next to it. The seed appears only at 'done'
function view(st, budget) {
  if (!st) return idleView();
  const copy = (c) => ({ r: c.r, s: c.s });
  const v = {
    id: st.id,
    phase: st.phase,
    bet: st.bet,
    hands: st.hands.map((h) => {
      const v = handValue(h.cards);
      return { cards: h.cards.map(copy), total: v.total, soft: v.soft, bet: h.bet, done: h.done, result: h.result };
    }),
    active: st.active,
    dealer: {
      cards: (st.dealer.hole ? st.dealer.cards.slice(0, 1) : st.dealer.cards).map(copy),
      hole: st.dealer.hole,
      total: st.dealer.hole ? null : handValue(st.dealer.cards).total
    },
    can: {
      hit: !whyNot(st, 'hit', budget), stand: !whyNot(st, 'stand', budget),
      double: !whyNot(st, 'double', budget), split: !whyNot(st, 'split', budget)
    },
    net: st.net,
    seq: st.seq.map((e) => Object.assign({}, e, e.card ? { card: copy(e.card) } : {}))
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = { newRound, act, whyNot, view, idleView, stake, handValue, points, OPS, DECKS };
