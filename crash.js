// The crab's crash: a multiplier climbs from 1.00x and bursts somewhere. Get out before it does and
// the bet comes back multiplied. Pure: knows nothing about vscode or credits. The one require is
// ./cards, for the shared PRNG.
//
// THERE IS NO CLOCK IN HERE, AND THAT IS THE DESIGN. The player names the multiplier to get out at
// BEFORE the round is launched, the way a standing sell order names its price. The host then settles
// the whole round in one move and the webview only replays it. Anyone who reaches for a timer later
// should read this first:
//
//  - a live clock keeps running while the panel is hidden, the window is reloaded or the editor is
//    closed. Voiding and refunding those rounds makes closing the panel a way OUT of a bad round,
//    which is free money and puts the return past 97%. Not refunding them takes credits off a player
//    who changed tabs. There is no third option, because the host cannot see a webview that is gone
//  - every other game in this casino is "the host decides, the screen draws" (games/tables.js). A
//    real-time crash would be the only game whose outcome depends on when a message arrives, and
//    message timing is exactly what a renderer under load does not promise
//  - an armed round that is abandoned costs nothing and is worth nothing. That is only true because
//    nothing about the burst is visible until the launch: there is no information to walk away from,
//    so walking away cannot be played. That property is what keeps the void harmless, and a clock
//    would take it away
//
// The burst point: P(burst at or above x) = 0.97 / x. That single line is the whole house edge, and
// the reason it is this shape rather than any other: the return of getting out at x is
//    P(reaching x) * x = (0.97 / x) * x = 0.97
// for EVERY x. So no target is a better bet than another, only a safer or a wilder one, and there is
// no corner of the dial to farm. 3 in 100 rounds burst before 1.00x, which is the cut made visible
// rather than skimmed off the payouts.
//
// Money: whole credits, and the dial is whole tenths (1.1x .. 50.0x in 0.1 steps), so the wire
// carries an integer number of tenths and never a float. 1.1 cannot be written down exactly in
// binary, and a screen and a host that each round their own copy of it are a screen and a host that
// disagree about whether the player won.
//    payout = floor(bet * ticks / 10)        one floor, always the house's way
//    bar    = ceil(100 * payout / bet)       the multiplier that payout really is, in hundredths
// and the round is judged against `bar`, not against the dial. That is the fix for the oldest bug in
// this casino: a screen showing 1.1x while the ledger pays 1.0x. Here the figure on the screen is
// read back OUT of the payout, so the two cannot drift. Flooring the payout can only make `bar`
// lower than the dial, never higher, so the player is never judged against a harder number than the
// one they asked for (test/crash.test.js asserts that over every bet and every tick).
//
// What that buys: the return is 0.97 * bar / (bar + the rounding) for every bet the engine takes,
// which measures between 96.20% and 97.00% across the whole dial, inside the band every game here
// sits in. Flooring the payout alone (judging against the dial) would drop a 1.9x order on an
// 11-credit bet to 92.8%, because one floored credit out of 20 is worth four times the house's cut.
//
// What `view()` does not carry: the burst point, until the round is settled. The armed state holds
// the seed and nothing else about where it will go, and `view` withholds the seed exactly as
// high-low withholds its shoe. At 'done' both are handed over: the replay has to climb to the burst
// point to draw it, and the seed is then spent.
//
// Determinism: the burst point is a function of the seed alone, not of the target. A player cannot
// re-aim to shop for a different burst, and re-aiming is free precisely because it changes nothing
// that is already decided.
//
// State is internal (it holds the seed); `view()` makes what the webview may see.
// `act()` never mutates its input and returns the very same object when the move is not allowed;
// `whyNot()` says why.

const C = require('./cards');

// 'aim' moves the dial, 'launch' settles the round. Both are ops rather than one deal message so the
// driver in games/tables.js can stay as it is: a deal carries a bet and nothing else
const OPS = ['aim', 'launch'];

// The house keeps 3%: P(burst at or above x) = HOUSE / (100 * x)
const HOUSE = 97;

// The dial, in tenths of a multiplier. 1.1x is the first target that can pay above the bet at all,
// and 50.0x is the last one whose odds (about 1 in 52) still come up inside a session
const TICK_PER = 10;        // hundredths of a multiplier per tick, so one tick is 0.1x
const MIN_TICKS = 11;       // 1.1x
const MAX_TICKS = 500;      // 50.0x
const DEFAULT_TICKS = 200;  // 2.0x, where the odds are about a coin toss

// The burst point is drawn by inverting P(burst >= x) = 0.97 / x. Picking a whole number out of
// DRAWS and inverting that (rather than inverting a float) keeps the distribution exactly countable:
// a target at `bar` hundredths wins on floor(97 * DRAWS / bar) of the DRAWS, and the test enumerates
// the return from that count instead of sampling it.
// A million draws puts the thinnest target on the dial (50.0x) at 19,400 winning draws, so the dial
// is nowhere near the resolution of the draw
const DRAWS = 1000000;

// The burst point is capped, because the tail of 0.97 / x is unbounded and a replay has to be able
// to draw it. 1000.00x is twenty times the widest target on the dial, so the cap can never decide a
// round: it only stops the animation from being asked to climb to a million. Checked below
const MAX_AT = 100000;

// A target has to pay above the bet, so the smallest tick is above 1.00x
const MIN_BET = 10;

// The payout is floor(bet * ticks / 10) and the bar is ceil(100 * payout / bet), so what has to stay
// a safe integer is bet * MAX_TICKS and 100 * payout. Checked below
const MAX_BET = 10000000;

// --- integer money ----------------------------------------------------------------------

// floor(a / b) and ceil(a / b) for whole a, b, without trusting the division. a / b is rounded to
// the nearest double, so for a large a the result can land exactly ON the integer next to the true
// quotient and Math.floor then returns the wrong one. The corrections cost a comparison and make
// these exact for every a inside 2^53
function floorDiv(a, b) {
  let q = Math.floor(a / b);
  while (q * b > a) q -= 1;
  while ((q + 1) * b <= a) q += 1;
  return q;
}

function ceilDiv(a, b) {
  let q = Math.floor(a / b);
  while (q * b < a) q += 1;
  while ((q - 1) * b >= a) q -= 1;
  return q;
}

// --- the dial ---------------------------------------------------------------------------

// What a target pays if it comes in: the bet multiplied by whole tenths, floored once
function payoutFor(bet, ticks) {
  return floorDiv(bet * ticks, TICK_PER);
}

// The multiplier that payout really is, in hundredths, rounded UP. This is the number the round is
// judged against and the number the screen prints, and both of those follow from it being read out
// of the payout: rounding it up means the bar is never easier than the money, and the floor in
// payoutFor means it is never harder than the dial
function barFor(bet, ticks) {
  return ceilDiv(100 * payoutFor(bet, ticks), bet);
}

// How many of the DRAWS reach a bar, which is the win count a target is priced off. Exact:
// floor(97 * DRAWS / bar) draws out of DRAWS (see burstOf)
function winsFor(bar) {
  return floorDiv(HOUSE * DRAWS, bar);
}

// Where this round bursts, in hundredths of a multiplier.
//
// One roll from the shared stream becomes a whole draw r in 1..DRAWS, and the burst point is
// floor(97 * DRAWS / r). Inverting the whole draw rather than the float is what makes the
// distribution countable, and the +1 is what makes the division safe: r is never 0, so there is no
// division by zero and no Infinity to cap after the fact. The cap is still applied, because r = 1
// means 970,000.00x and nothing on the screen can draw that.
//    P(burst >= k) = P(r <= 97 * DRAWS / k) = floor(97 * DRAWS / k) / DRAWS
// which is 0.97 / (k / 100), the line in the header, to the resolution of one draw
function burstOf(seed) {
  const u = C.rollsFrom(String(seed))();
  const r = Math.floor(u * DRAWS) + 1;
  return Math.min(MAX_AT, floorDiv(HOUSE * DRAWS, r));
}

// The dial and the cap are the whole game, so a slip in them is the whole game being wrong. Checked
// once, when the module loads, the way forge.js checks its table
(function checkDial() {
  if (MIN_TICKS * TICK_PER <= 100) throw new Error('crash: the smallest target does not pay above the bet');
  if (MAX_TICKS <= MIN_TICKS) throw new Error('crash: the dial has no range');
  // the cap must sit above every target, or it would decide a round instead of only bounding a replay
  if (MAX_TICKS * TICK_PER >= MAX_AT) throw new Error('crash: the cap is inside the dial');
  // every target has to be winnable, and none of them certain
  for (const ticks of [MIN_TICKS, MAX_TICKS]) {
    const w = winsFor(ticks * TICK_PER);
    if (w < 1) throw new Error('crash: ' + ticks + ' tenths can never come in');
    if (w >= DRAWS) throw new Error('crash: ' + ticks + ' tenths always comes in');
  }
  // the two products the money path forms, at the widest bet the engine will take
  if (!Number.isSafeInteger(MAX_BET * MAX_TICKS)) throw new Error('crash: MAX_BET overflows the dial');
  if (!Number.isSafeInteger(100 * payoutFor(MAX_BET, MAX_TICKS))) throw new Error('crash: MAX_BET overflows the shown multiplier');
  if (!Number.isSafeInteger(HOUSE * DRAWS)) throw new Error('crash: the draw overflows');
})();

// --- state ------------------------------------------------------------------------------

function clone(st) {
  return Object.assign({}, st);
}

function badTicks(ticks) {
  if (!Number.isInteger(ticks)) return 'the target is a whole number of tenths';
  if (ticks < MIN_TICKS || ticks > MAX_TICKS) return 'the target must be between ' + MIN_TICKS + ' and ' + MAX_TICKS + ' tenths';
  return null;
}

// seed: any string, fresh per round. id: the round's public name, which must NOT be the seed (the
//   seed is the burst point, and a round id is in every message).
// bet: whole credits, MIN_BET..MAX_BET.
// ticks: the opening position of the dial, in tenths. The player may move it with 'aim' before
//   launching, so this is only where it starts (the screen hands back the last one used).
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < MIN_BET) throw new RangeError('bet must be a whole number of at least ' + MIN_BET);
  if (bet > MAX_BET) throw new RangeError('bet must be at most ' + MAX_BET);
  const ticks = opts.ticks == null ? DEFAULT_TICKS : opts.ticks;
  const bad = badTicks(ticks);
  if (bad) throw new RangeError(bad);
  return {
    id: opts.id == null ? null : String(opts.id),
    seed: String(opts.seed == null ? '' : opts.seed),
    phase: 'arm',
    bet,
    ticks,
    at: null,       // where it burst, in hundredths. Drawn at the launch and not before
    won: null,
    payout: 0,
    net: null,
    ended: null
  };
}

// An op is either a bare string ('launch') or an object carrying its argument ({ op: 'aim', ticks }),
// the shape poker's draw already uses
function nameOf(op) {
  if (typeof op === 'string') return op;
  return op && typeof op === 'object' ? op.op : null;
}

// Why `op` cannot be played now, or null.
// budget is not read: a round stakes only its bet, and the host cleared that at the deal, so nothing
// inside a round can cost more credits. The parameter is taken so every engine answers the same
// question with the same signature
function whyNot(st, op, budget) {
  const name = nameOf(op);
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!st || st.phase !== 'arm') return 'the round is over';
  if (name === 'aim') return badTicks(op && typeof op === 'object' ? op.ticks : undefined);
  return null;
}

// Settles the round. `payout` is what the player receives, so one formula covers both endings
function launch(st) {
  const bar = barFor(st.bet, st.ticks);
  st.at = burstOf(st.seed);
  st.won = st.at >= bar;
  st.payout = st.won ? payoutFor(st.bet, st.ticks) : 0;
  st.net = st.payout - st.bet;
  st.ended = st.won ? 'cashed' : 'busted';
  st.phase = 'done';
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  if (nameOf(op) === 'aim') next.ticks = op.ticks;
  else launch(next);
  return next;
}

// What a live round has riding on it, held back from the other games' budgets. An armed round holds
// its bet: it has not been judged yet, and the host does not move the ledger until it has
function stake(st) {
  return st && st.phase === 'arm' ? st.bet : 0;
}

// --- what the webview sees --------------------------------------------------------------

// Everything a target is worth, from the one integer payout it pays: the money, the multiplier that
// money is (the bar the burst is judged against) and the odds of reaching it. `exact` says the dial
// came out whole, which it does for every bet that is a multiple of ten; when it does not, the bar
// is the lower figure the screen must print, because the bar is what the payout really is
function priceOf(bet, ticks) {
  const payout = payoutFor(bet, ticks);
  const bar = barFor(bet, ticks);
  return {
    ticks,
    target100: ticks * TICK_PER,
    bar100: bar,
    exact: bar === ticks * TICK_PER,
    payout,
    chance: { num: winsFor(bar), den: DRAWS }
  };
}

function range() {
  return { minTicks: MIN_TICKS, maxTicks: MAX_TICKS, step: 1, per: TICK_PER, cap100: MAX_AT };
}

function idleView() {
  return {
    phase: 'bet',
    id: null,
    bet: null,
    ticks: DEFAULT_TICKS,
    target100: DEFAULT_TICKS * TICK_PER,
    bar100: null,
    exact: true,
    payout: null,
    // before a bet there is no payout to read a bar out of, so the odds are quoted off the dial
    // itself. It is the same number for every bet that is a multiple of ten
    chance: { num: winsFor(DEFAULT_TICKS * TICK_PER), den: DRAWS },
    range: range(),
    at: null,
    won: null,
    instant: false,
    can: { aim: false, launch: false },
    why: { aim: 'place a bet first', launch: 'place a bet first' },
    net: null,
    ended: null
  };
}

// The armed round carries its price and nothing about the burst. The settled round carries the burst
// point as well, because the replay has to climb to it, and the seed, which is then spent.
// `instant` is the 3 in 100 that burst before 1.00x: the house's cut, shown rather than hidden, and
// the screen draws it as a round that never got off the ground
function view(st, budget) {
  if (!st) return idleView();
  const live = st.phase === 'arm';
  const p = priceOf(st.bet, st.ticks);
  const whyAim = whyNot(st, { op: 'aim', ticks: st.ticks }, budget);
  const whyLaunch = whyNot(st, 'launch', budget);
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    ticks: st.ticks,
    target100: p.target100,
    bar100: p.bar100,
    exact: p.exact,
    // while the round is armed this is what a win would pay; once it is over it is what was paid
    payout: live ? p.payout : st.payout,
    chance: p.chance,
    range: range(),
    at: st.at,
    won: st.won,
    instant: st.at != null && st.at < 100,
    can: { aim: !whyAim, launch: !whyLaunch },
    why: { aim: whyAim, launch: whyLaunch },
    net: st.net,
    ended: st.ended
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  OPS, HOUSE, DRAWS, MAX_AT, TICK_PER, MIN_TICKS, MAX_TICKS, DEFAULT_TICKS, MIN_BET, MAX_BET,
  payoutFor, barFor, winsFor, burstOf, priceOf, floorDiv, ceilDiv
};
