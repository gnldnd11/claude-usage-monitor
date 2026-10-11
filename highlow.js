// Solo high-low against the crab dealer. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - one card lies face up; the player calls whether the next card is higher or lower
//  - ace high, two low; suits never break a tie
//  - a tie (the same rank) is a push: the pot rides, the new card takes over, nothing moves
//  - a correct call multiplies the pot by that side's payout and the new card takes over
//  - a wrong call ends the run. What is lost is the opening bet, never the pot: the grown part was
//    the house's money the whole time and was never paid out
//  - the player may cash out at any point and keep the pot
//  - payouts come from the cards actually left in the shoe, so they move as the run goes on
//  - 6 decks. What a run leaves is carried into the next run (see newRun's `deck`)
//
// Money: the opening bet is the only thing at risk, and it moves only when the run settles.
// `net = pot - bet`, with `pot` at 'done' meaning what the player receives: the grown pot after a
// cash-out, zero after a wrong call. One formula covers both endings.
//
// Determinism: the same seed, the same deck and the same calls always give the same cards, so a
// "same shoe" challenge can replay a run. The seed is the whole shuffle, so it must never be visible
// while a run is live: view() shows it only once the run is done, and the run id is a separate value.
//
// State is internal (it holds the shoe); `view()` makes what the webview may see.
// `act()` never mutates its input and returns the very same object when the call is not allowed;
// `whyNot()` says why.

const C = require('./cards');

const OPS = ['higher', 'lower', 'cashout'];

// The house keeps 3% of every payout. Payouts are 1/P, so the player gives back about 3 credits per
// 100 riding, whichever side is called and whatever card is up. That the edge does not depend on the
// call is what makes "the odds come from the shoe" true rather than decorative: there is no card and
// no side that is a better bet than another, only safer or wilder ones.
const EDGE_NUM = 97;
const EDGE_DEN = 100;
const HL_EDGE = EDGE_NUM / EDGE_DEN;

// A deck carried over from the last run with fewer cards than this is thrown away and the shoe
// reshuffled. Cutting at a new run (never inside one) keeps a run's odds honest from first card to
// last: they only ever move because cards came out, not because the shoe was swapped underneath
const MIN_DECK = 20;

// --- rank order -----------------------------------------------------------------------

// Ace high, two low. Card codes number the ranks A,2..10,J,Q,K, so rotating the rank index by one
// puts the ace on top: 2 -> 0, 10 -> 8, J -> 9, Q -> 10, K -> 11, A -> 12
function orderOf(code) {
  return (code % 13 + 12) % 13;
}

// --- odds ------------------------------------------------------------------------------

function draw(st) {
  if (st.pos >= st.shoe.length) throw new RangeError('the shoe ran out'); // blocked by whyNot; a stacked shoe too short for the run
  const code = st.shoe[st.pos];
  st.pos += 1;
  return code;
}

// Is a side possible at all: one card left that beats (or loses to) the face-up card. Stops at the
// first one it finds, so asking what the player may do does not walk the whole shoe
function hasSide(st, side) {
  const cur = orderOf(st.card);
  for (let i = st.pos; i < st.shoe.length; i++) {
    const o = orderOf(st.shoe[i]);
    if (side === 'higher' ? o > cur : o < cur) return true;
  }
  return false;
}

// How many of the cards left beat the face-up card, lose to it, or tie it
function counts(st) {
  const cur = orderOf(st.card);
  let higher = 0, lower = 0, tie = 0;
  for (let i = st.pos; i < st.shoe.length; i++) {
    const o = orderOf(st.shoe[i]);
    if (o > cur) higher += 1;
    else if (o < cur) lower += 1;
    else tie += 1;
  }
  return { higher, lower, tie };
}

// The payout for a side, or null when that side cannot come: no chance, no price, no bet.
//
// A tie does not settle the call, it replays it on a new card with the pot untouched, so the price
// is the fair price of the call GIVEN the card resolves: P(win | not a tie) = win / (win + lose).
// Pricing off win / (all cards left) instead, counting the tie as if it were a loss, would pay
// for a risk the player never takes, because a tie keeps the pot. That hands the player the tie's
// own probability as profit, about +7% on a fresh shoe, well past the house's 3%.
//
// Clamped at 1: a call that cannot lose (higher on a two, lower on an ace) is priced at exactly 1 by
// the fair formula, and the house cut alone would drop it below that, so a correct call would shrink
// the pot. At 1 such a call simply returns the pot. The clamp never pays above fair, so it cannot be
// farmed: the best it can ever be is break-even.
function multOf(win, lose) {
  if (win <= 0) return null;
  return Math.max(1, ((win + lose) * EDGE_NUM) / (win * EDGE_DEN));
}

// The pot after a correct call, as one integer expression rather than floor(pot * multOf(...)).
// Floating point makes that land a credit low whenever the product falls just under a whole number
// (12 * 0.97 * 100 comes out 1163.9999999999998, and floor turns a 1164 payout into 1163). The
// counts and the edge are whole numbers, so this division is exact for any pot the game can reach.
//
// Pots are whole credits, so the payout is floored (blackjack floors its 3:2 the same way) and a pot
// below 1/(mult - 1) does not grow at all: at the minimum bet of 10, a near-certain call (about
// 1.06x) stays flat until the pot passes 17. Rounding up instead would pay above fair on small pots,
// which is exactly the size a player can farm cheaply.
// Math.max(pot, ...) is the clamp at 1 in integer form.
function grow(pot, win, lose) {
  return Math.max(pot, Math.floor((pot * (win + lose) * EDGE_NUM) / (win * EDGE_DEN)));
}

// The board a face-up card offers: the fair price of each side, and the pot a correct call on it
// really leaves. Both come out of one walk of the shoe.
//
// `pays` is there because `odds` alone cannot be shown to the player. Pots are whole credits, so a
// small pot priced a little above 1 comes back unchanged (see grow), and a price printed from the
// odds would then promise a credit that never arrives. The screen prices its buttons off `pays`
function boardOf(st) {
  const c = counts(st);
  return {
    odds: { higher: multOf(c.higher, c.lower), lower: multOf(c.lower, c.higher) },
    pays: {
      higher: c.higher > 0 ? grow(st.pot, c.higher, c.lower) : null,
      lower: c.lower > 0 ? grow(st.pot, c.lower, c.higher) : null
    }
  };
}

// --- state -----------------------------------------------------------------------------

// The shoe is never mutated (only `pos` moves), so a copy shares it.
// There is no event list to reset the way blackjack's clone resets seq: a move here turns exactly
// one card, so the state itself already says what changed and the screen paces it from that
function clone(st) {
  return Object.assign({}, st, { history: st.history.slice() });
}

// seed: any string (a fresh one per run). id: the run's public name, which must not be the seed
// (null if not given).
// deck: the card codes the last run left. The shoe carries across runs, but each run shuffles what
//   is left with its own seed instead of continuing a fixed order. To a player who cannot see the
//   order the two are the same shoe, and it is what lets view() hand over the seed at 'done': the
//   seed names cards that are already spent, and says nothing about what the next run will deal.
//   Fewer than MIN_DECK cards left (or none given) and a fresh 6-deck shoe is built instead.
// stack: explicit card order such as ['2S', 'KH', ...] instead of the shuffle, for tests and replays
function newRun(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const carried = Array.isArray(opts.deck) && opts.deck.length >= MIN_DECK ? opts.deck : null;
  const st = {
    id: opts.id == null ? null : String(opts.id), seed, phase: 'play', bet, pot: bet,
    shoe: opts.stack ? opts.stack.map(C.codeOf) : C.shuffle(carried || C.freshShoe(), seed),
    pos: 0, card: null, streak: 0, history: [], net: null, ended: null
  };
  st.card = draw(st);
  return st;
}

// Why `op` cannot be played now, or null.
// budget is not read: a run stakes only its opening bet, and the host cleared that at the deal, so
// nothing inside a run can cost more credits. The parameter is taken so both games' engines answer
// the same question with the same signature
function whyNot(st, op, budget) {
  if (!OPS.includes(op)) return 'unknown action';
  if (!st || st.phase !== 'play') return 'the run is over';
  // Cashing out takes the pot, so it is not a way to look at the opening card and walk off with the
  // bet still in hand: one call has to have been made. The exception is a run with no call left to
  // make, which would otherwise have no way out at all
  if (op === 'cashout') {
    if (st.history.length > 0) return null;
    if (!hasSide(st, 'higher') && !hasSide(st, 'lower')) return null;
    return 'call the card first';
  }
  if (st.pos >= st.shoe.length) return 'the shoe is spent';
  if (!hasSide(st, op)) return op === 'higher' ? 'nothing beats this card' : 'nothing loses to this card';
  return null;
}

// Closes the run. `pot` is left as what the player receives, so one formula settles both endings
function end(st, how) {
  st.ended = how;
  st.phase = 'done';
  st.net = st.pot - st.bet;
}

// A history entry is the card the call was made AGAINST, with what that call was worth and what it
// did to the pot. The card that answers it becomes the new face-up card, so `card` and the last
// entry are always two different cards: the one now on the table and the one it was played onto
function call(st, side) {
  const c = counts(st);
  const mult = side === 'higher' ? multOf(c.higher, c.lower) : multOf(c.lower, c.higher);
  const played = st.card;
  const next = draw(st);
  const was = orderOf(played);
  const now = orderOf(next);
  const result = now === was ? 'push' : ((now > was) === (side === 'higher') ? 'win' : 'lose');
  if (result === 'win') {
    st.pot = side === 'higher' ? grow(st.pot, c.higher, c.lower) : grow(st.pot, c.lower, c.higher);
    st.streak += 1;
  }
  st.card = next;
  st.history.push({ code: played, guess: side, result, mult, pot: st.pot });
  if (result === 'lose') { st.pot = 0; end(st, 'wrong'); }
}

const MOVES = {
  higher(st) { call(st, 'higher'); },
  lower(st) { call(st, 'lower'); },
  cashout(st) { end(st, 'cashout'); }
};

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  MOVES[op](next);
  return next;
}

// What the run leaves in the shoe, for the next run to carry
function remaining(st) {
  return st ? st.shoe.slice(st.pos) : [];
}

// --- what the webview sees ----------------------------------------------------------------------

function idleView() {
  return {
    phase: 'bet', id: null, bet: null, pot: 0, card: null, streak: 0, history: [],
    odds: { higher: null, lower: null },
    pays: { higher: null, lower: null },
    can: { higher: false, lower: false, cashout: false },
    net: null, ended: null
  };
}

// Every card this hands over has already been turned face up; the shoe and the seed stay inside the
// state. `odds` and `pays` describe the face-up card against the cards left, which is public
// knowledge in this game (nothing is ever dealt face down). At 'done' they are what the next call
// would have paid, and `can` is what stops the webview offering it. `odds` is the fair price and
// `pays` the pot that would really land: the screen prices its buttons off `pays`, because only
// that one is a number the table can honour (see boardOf).
// The seed appears at 'done', where the cards it names are spent and the next run reshuffles what is
// left with a seed of its own
function view(st, budget) {
  if (!st) return idleView();
  const board = boardOf(st);
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    pot: st.pot,
    card: C.cardOf(st.card),
    streak: st.streak,
    history: st.history.map((h) => ({ card: C.cardOf(h.code), guess: h.guess, result: h.result, mult: h.mult, pot: h.pot })),
    odds: board.odds,
    pays: board.pays,
    can: {
      higher: !whyNot(st, 'higher', budget),
      lower: !whyNot(st, 'lower', budget),
      cashout: !whyNot(st, 'cashout', budget)
    },
    net: st.net,
    ended: st.ended
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = { newRun, act, whyNot, view, idleView, remaining, orderOf, counts, OPS, HL_EDGE, MIN_DECK };
