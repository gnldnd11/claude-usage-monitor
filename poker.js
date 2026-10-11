// Solo draw poker (Jacks or Better) against the crab dealer. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - one 52-card deck, shuffled from a seed. Every hand gets a fresh deck and a fresh seed, so
//    nothing carries from hand to hand: unlike high-low, what has already come out is never a price
//  - five cards face up, the player marks the ones to keep, and one draw replaces the rest
//  - keeping all five is a draw that replaces nothing, and is allowed
//  - the hand is paid off PAYS below. Jacks or better is the lowest paid pair, so a pair of tens or
//    less is nothing
//  - 8/5 Jacks or Better (full house 8, flush 5). See PAYS for why those two rows and not 9/6
//
// Money: the bet is at risk from the deal and the hand settles exactly once, at the draw.
// What the player receives is `bet * the row's multiplier` (zero on a losing hand) and
// `net = that - bet`. So a paid pair of jacks is a net of zero, the bet coming straight back, and a
// losing hand is a net of minus the bet, never more: there is nothing else on the table to lose.
// Every multiplier is a whole number, so the payout is one integer product. Nothing is rounded and
// no float touches the money path (high-low has to floor, because it prices calls off card counts).
//
// Determinism: the same seed and the same holds always give the same five cards and the same draw,
// so a "same deck" challenge can replay a hand. The seed is the whole deck, the undealt cards
// included, so it must never be visible while a hand is live: view() shows it only once the hand is
// done, and the hand id is a separate value.
//
// State is internal (it holds the deck); `view()` makes what the webview may see.
// `act()` never mutates its input and returns the very same object when the action is not allowed;
// `whyNot()` says why.
//
// The op contract the screen is written against, one message per hand:
//   act(st, { op: 'draw', hold: [b, b, b, b, b] })
// The holds are toggled inside the webview and arrive as one array, so marking a card costs no
// round trip and there is no ordering to get wrong between five toggles and the draw that follows
// them. The array is the whole move, which is why its shape is a rule here (see badHold) rather
// than something the host checks on the side.

const C = require('./cards');

const HAND = 5;
const OPS = ['draw'];

// 8/5 Jacks or Better, best first, and the order the screen prints them in.
//
// A video poker table is named after its full house and flush rows, because those two are what set
// the house's cut: the 9/6 table everyone quotes returns 99.5%, far softer than the crab's other
// two games. 8/5 is the same ladder with those rows one step lower and comes out near 97%, which is
// the ~3% blackjack and high-low keep. test/poker.test.js measures it and prints the figure.
//
// The royal pays 800, which a real machine pays only at max coins. There is a single bet here, so
// there is no max-coin bonus to miss by betting small, and at the 250 a machine pays for one coin
// the whole table drops under 96%.
//
// `name` is what the screen prints: it holds the paytable and the result chip, and neither has a
// label of its own. Tests and code name a row through ROW below instead, so these strings can be
// reworded without a rule moving.
const PAYS = Object.freeze([
  { name: 'Royal flush', mult: 800 },
  { name: 'Str. flush', mult: 50 },
  { name: '4 of a kind', mult: 25 },
  { name: 'Full house', mult: 8 },
  { name: 'Flush', mult: 5 },
  { name: 'Straight', mult: 4 },
  { name: '3 of a kind', mult: 3 },
  { name: '2 pair', mult: 2 },
  { name: 'Jacks+', mult: 1 }
].map((r) => Object.freeze(r)));

// The tenth row, the one the paytable does not print. It is still handed over at 'done' so the
// result chip reads the same way whatever happened: a name and a net
const NO_WIN = Object.freeze({ name: 'No win', mult: 0 });

const ROW = Object.freeze({
  royal: PAYS[0], straightFlush: PAYS[1], four: PAYS[2], fullHouse: PAYS[3], flush: PAYS[4],
  straight: PAYS[5], three: PAYS[6], twoPair: PAYS[7], jacks: PAYS[8], none: NO_WIN
});

// --- rank order ------------------------------------------------------------------------

// Two lowest, ace highest. Card codes number the ranks A,2..10,J,Q,K, so rotating the rank index by
// one puts the ace on top: 2 -> 0, 10 -> 8, J -> 9, Q -> 10, K -> 11, A -> 12 (high-low turns it
// the same way, for the same reason)
function orderOf(code) {
  return (code % 13 + 12) % 13;
}

function suitOf(code) {
  return Math.floor(code / 13);
}

// The order of a jack: the lowest rank a bare pair is paid for, and so the only number in the rules
// that the game's name refers to
const JACK = 9;
// The order of a ten: the bottom of the only run that can be royal
const TEN = 8;

// The ten rank windows a straight can fill, 2-3-4-5-6 up to 10-J-Q-K-A plus the wheel A-2-3-4-5
// where the ace plays low. Written out rather than derived from consecutive orders, because the
// wheel is not consecutive in this order and every straight question asks over the same ten
const WINDOWS = (function () {
  const out = [[12, 0, 1, 2, 3]];
  for (let lo = 0; lo <= 8; lo++) out.push([lo, lo + 1, lo + 2, lo + 3, lo + 4]);
  return out.map((w) => new Set(w));
})();

// How many of the ten windows hold every one of these orders.
//
// A made straight is five distinct orders inside one window. The player's strategy asks the same
// question of four or three cards, and the difference between a four-card draw open at both ends
// and one open at one is exactly this count being 2 rather than 1, the wheel included: 2-3-4-5 sits
// in two windows (an ace or a six fills it) and J-Q-K-A in one (only a ten does)
function windowsOver(orders) {
  let n = 0;
  for (const w of WINDOWS) {
    let all = true;
    for (const o of orders) if (!w.has(o)) { all = false; break; }
    if (all) n += 1;
  }
  return n;
}

// --- the hand ---------------------------------------------------------------------------

// Everything about five cards that the table asks after, out of one pass over them: whether they
// share a suit, whether they make a run, and how the ranks group up.
//
// Pulled out of rankOf so that the ranking itself is nothing but the ladder below: this part knows
// cards, that part knows the table, and neither has to be read to follow the other
function shapeOf(codes) {
  const orders = [];
  const byOrder = new Array(13).fill(0);
  const suit = suitOf(codes[0]);
  let flush = true, distinct = 0;
  for (let i = 0; i < HAND; i++) {
    const o = orderOf(codes[i]);
    orders.push(o);
    if (suitOf(codes[i]) !== suit) flush = false;
    if (byOrder[o] === 0) distinct += 1;
    byOrder[o] += 1;
  }
  // the distinct count is what keeps a pair out: A-A-2-3-4 is five cards all inside the wheel's
  // window, and membership alone would read it as a straight
  const straight = distinct === HAND && windowsOver(orders) > 0;
  const shape = {
    flush,
    straight,
    // five distinct orders that make a straight and are all a ten or better can only be 10-J-Q-K-A
    royal: straight && orders.every((o) => o >= TEN),
    pairs: 0, trips: 0, quads: 0, paidPair: false
  };
  for (let o = 0; o < 13; o++) {
    if (byOrder[o] === 4) shape.quads += 1;
    else if (byOrder[o] === 3) shape.trips += 1;
    else if (byOrder[o] === 2) { shape.pairs += 1; if (o >= JACK) shape.paidPair = true; }
  }
  return shape;
}

// Which row five cards pay, as the very row object out of PAYS (or NO_WIN). Takes card codes, the
// shape the deck is in, and is exported so the ranking can be run over all 2,598,960 hands.
//
// The order of the tests is the order of the table, which is what makes it a ranking: a hand that
// answers to two rows is paid for the better one, and every row excludes the ones under it by
// itself (a full house is three and a pair, so `trips && pairs` cannot also be two pair)
function rankOf(codes) {
  if (!Array.isArray(codes) || codes.length !== HAND) throw new RangeError('a hand is ' + HAND + ' cards');
  const s = shapeOf(codes);
  if (s.flush && s.royal) return ROW.royal;
  if (s.flush && s.straight) return ROW.straightFlush;
  if (s.quads) return ROW.four;
  if (s.trips && s.pairs) return ROW.fullHouse;
  if (s.flush) return ROW.flush;
  if (s.straight) return ROW.straight;
  if (s.trips) return ROW.three;
  if (s.pairs === 2) return ROW.twoPair;
  if (s.pairs === 1 && s.paidPair) return ROW.jacks;
  return ROW.none;
}

// --- state -----------------------------------------------------------------------------

function take(st) {
  if (st.pos >= st.deck.length) throw new RangeError('the deck ran out'); // a stacked deck too short for the hand
  const code = st.deck[st.pos];
  st.pos += 1;
  return code;
}

// The deck is never mutated (only `pos` moves), so a copy shares it
function clone(st) {
  return Object.assign({}, st, { cards: st.cards.slice(), held: st.held.slice() });
}

function live(st) {
  return !!st && st.phase === 'draw';
}

// seed: any string (a fresh one per hand). id: the hand's public name, which must not be the seed
// (null if not given). stack: explicit card order such as ['AS', '10H', ...] instead of the seeded
// shuffle, for tests and replays
function newHand(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the file's header promises (one integer product, nothing rounded) only holds while the
  // top row's payout is still a safe integer. The host caps a bet at the balance long before this,
  // and 11,258,999,068,426 credits is not reachable, so this is the promise made structural rather
  // than a case anyone meets: past it `bet * 800` loses precision and the money path is floats
  if (bet > Number.MAX_SAFE_INTEGER / PAYS[0].mult) throw new RangeError('bet is too large to pay the top row exactly');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const st = {
    id: opts.id == null ? null : String(opts.id), seed, phase: 'draw', bet,
    deck: opts.stack ? opts.stack.map(C.codeOf) : C.shuffle(C.freshDeck(), seed),
    pos: 0, cards: [], held: [false, false, false, false, false],
    hand: null, net: null
  };
  for (let i = 0; i < HAND; i++) st.cards.push(take(st));
  return st;
}

// The hold array is the move, so its shape is a rule of the game rather than a detail of the
// message: five flags, one per card on the table, and nothing else. A length that is not five
// cannot say which cards were kept, and a value that is not a boolean ('1', 0, null) would be read
// as a keep or a discard by whatever happened to coerce it
function badHold(hold) {
  if (!Array.isArray(hold) || hold.length !== HAND) return 'hold must be ' + HAND + ' true/false flags';
  for (const h of hold) if (typeof h !== 'boolean') return 'hold must be ' + HAND + ' true/false flags';
  return null;
}

// Why `op` cannot be played now, or null.
// budget is not read: a hand stakes only its bet, and the host cleared that at the deal, so nothing
// inside a hand can cost more credits. The parameter is taken so every game's engine answers the
// same question with the same signature
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : op;
  if (!OPS.includes(name)) return 'unknown action';
  if (!live(st)) return 'the hand is over';
  return badHold(op && op.hold);
}

// The draw: every card not kept is replaced from the top of the deck, left to right, and the hand
// is paid. `held` is left as the mask the draw used, so at 'done' a false flag marks a card that
// came from the draw. That is the whole reason the screen does not need an event list: it sent the
// array, and it gets it back alongside the five cards it chose against
function drawTo(st, hold) {
  for (let i = 0; i < HAND; i++) {
    st.held[i] = hold[i];
    if (!hold[i]) st.cards[i] = take(st);
  }
  st.hand = rankOf(st.cards);
  st.net = st.bet * st.hand.mult - st.bet;
  st.phase = 'done';
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  drawTo(next, op.hold);
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

// `pays` is the paytable, not a payout: the screen prints these nine rows and holds no numbers of
// its own, so the table can be retuned here and the screen follows. It is handed over on the bet
// screen too, where it is the only thing to look at
function idleView() {
  return {
    phase: 'bet', id: null, bet: null,
    cards: [], held: [false, false, false, false, false],
    hand: null, pays: PAYS, can: { draw: false }, net: null
  };
}

// Every card this hands over is face up: the deck, `pos` and the seed stay inside the state, and
// there is nothing face down in this game to leak through a derived number either.
// `hand` is null while the hand is live and one of the ten rows at 'done', NO_WIN included, so the
// result chip is always a name and a net. `net` is what the balance moved by: zero for a paid pair
// of jacks, minus the bet for a hand that missed.
// The seed appears at 'done', where the deck it names is thrown away and the next hand shuffles a
// new one of its own
function view(st, budget) {
  if (!st) return idleView();
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    cards: st.cards.map(C.cardOf),
    held: st.held.slice(),
    hand: st.hand,
    pays: PAYS,
    // the draw also needs a well-formed hold array, which only the message can carry: `can` says
    // the table is open, not that any particular message will be taken
    can: { draw: live(st) },
    net: st.net
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newHand, act, whyNot, view, idleView,
  rankOf, orderOf, suitOf, windowsOver, badHold,
  PAYS, NO_WIN, ROW, OPS, HAND, JACK, TEN
};
