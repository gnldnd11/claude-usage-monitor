// The crab's slot machine: three reels, one line. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - each reel is a ring of STRIP_LEN symbols. One spin stops each ring at a uniformly random
//    position, so a symbol comes up exactly as often as it appears on that ring
//  - three alike pays the symbol's `three` row. Exactly two alike pays its `pair` row, which is 1
//    for every symbol that has one and 0 for kelp (see PAYS for why kelp is the exception)
//  - that is the whole game. A spin is one press and settles on the press
//
// Money: the payout is `bet * the row's multiplier` (zero when nothing lines up) and
// `net = that - bet`. Every multiplier is a whole number, so the payout is one integer product:
// nothing is rounded and no float touches the money path. A paid pair is a multiplier of 1, which
// hands the bet straight back for a net of zero. The screen is told the net, so it can say "the bet
// came back" rather than calling a push a win.
//
// A spin settles inside newRound(), which is the shape of the game rather than a shortcut: the
// press IS the bet, there is no decision inside a spin, and so there is nothing for act() to do.
// That has three consequences worth writing down, because each is a rule the other games need and
// this one gets for free:
//  - nothing is face down. A round exists only after it has settled, so there is no live view to
//    keep a seed out of and no predetermined result to hide
//  - nothing is riding. A stake never sits between two messages, so stake() is 0 and a reload has
//    no round to void
//  - the round settles exactly once, because the only thing that can settle it is its own creation
// OPS is therefore empty and act() returns the very same object for anything it is handed. The
// functions are still here because every engine in this casino answers the same four questions
// (see games/README.md), and a game that answers three of them is a game the shared driver and the
// review checklist have to make an exception for.
//
// WHAT THE HOST'S TABLE SPEC HAS TO SAY (games/tables.js, games/<id>/meta.js). A round born 'done'
// is a third shape the driver's spec was not written for, and it runs on it unchanged only if the
// spec is filled in like this:
//  - `livePhase` must name a phase this engine NEVER enters. 'spin' will do. It must NOT be 'done',
//    because the driver refuses a deal while `state.phase === livePhase`: with 'done' there, the
//    first spin would be the last one the game ever took
//  - `stakeOf` is never reached (the driver only asks it of a live round), so `() => 0` says what
//    stake() below says
//  - there is no `carryOf` and no `opArg`: nothing survives a spin and no move carries an argument
//
// Determinism: the same seed always stops the three reels in the same places. The seed is a roll
// stream (cards.js rollsFrom), never a shuffle, and the hand id is a separate value: a view that
// carried the id as its seed would be a view that re-rolls the spin.
//
// State is internal; `view()` makes what the webview may see, PAYS and STRIPS included, so the
// screen holds no multiplier and no symbol ring of its own.

const C = require('./cards');

// The smallest bet the game takes. The host's table spec reads this, so the floor is one number
// in one place rather than one per game screen
const MIN_BET = 10;

const REELS = 3;
const STRIP_LEN = 24;

// No action exists inside a spin: see the note at the top of the file
const OPS = [];

// The band every game in this casino returns inside, as whole percents. Checked against the table
// when the module loads, so a retuned row cannot leave the band without the game refusing to start
const BAND_LO = 96;
const BAND_HI = 97;

// The paytable, rarest symbol first, and the order the screen prints it in.
//
// `weight` is how many of the symbol sit on EVERY ring, which is what makes the odds per reel
// identical and the three rings different only in the order they are arranged in. That is a
// deliberate choice and the reason is honesty: a machine that puts fewer jackpot symbols on the
// last reel is a machine tuned to deny a win the player can already see two thirds of. Here, a
// third crab is exactly as likely as the first, and the "so close" the player does feel is a real
// property of the rings rather than something generated per spin.
//
// Where the numbers come from (test/slots.test.js enumerates all 13,824 stops and prints them):
//  - the weights are 1, 2, 3, 4, 6, 8 out of 24, so three alike comes up once in (24/weight)^3:
//    once in 27 for kelp, once in 13,824 for the crab. Those are exact, which is what makes the
//    whole table solvable by hand
//  - `three` is then set so the return lands near the middle of the 96-97% band the forge, poker,
//    blackjack and high-low all sit in. It comes to 96.43%
//  - `pair` is a flat 1 wherever it is paid, so the rule reads "two alike and the bet comes back"
//    and the screen needs no second column of numbers to explain. Kelp is left out of it because a
//    kelp pair alone turns up once in 4.5 spins: paying it would hand back 22% of everything
//    staked, and the whole table has 96% to spend
//  - the result: something pays once in 3 spins, kelp's row (a six) carries most of the return, and
//    the crab's 1000 is 7.5% of it. A player who never sees a crab is still returned 89%, which is
//    the point of spreading it: a 96% built out of one jackpot is a machine where nothing happens
const PAYS = Object.freeze([
  { sym: 'crab', weight: 1, three: 1000, pair: 1 },
  { sym: 'pearl', weight: 2, three: 100, pair: 1 },
  { sym: 'anchor', weight: 3, three: 45, pair: 1 },
  { sym: 'starfish', weight: 4, three: 20, pair: 1 },
  { sym: 'shell', weight: 6, three: 10, pair: 1 },
  { sym: 'kelp', weight: 8, three: 6, pair: 0 }
].map((r) => Object.freeze(r)));

// The row nothing is paid for. It is still handed over at the end of a spin so the result chip
// reads the same way whatever happened: a kind, a name and a net
const NO_WIN = Object.freeze({ kind: 'none', sym: null, mult: 0, reels: Object.freeze([]) });

const SYMBOLS = Object.freeze(PAYS.map((r) => r.sym));
const ROW = Object.freeze(PAYS.reduce((m, r) => { m[r.sym] = r; return m; }, {}));

// The three rings, written out rather than generated, because the order is what the screen scrolls
// through and a generated order is one nobody has looked at. Each holds the same symbols in a
// different arrangement: same odds, different neighbours.
const STRIPS = Object.freeze([
  Object.freeze(['kelp', 'shell', 'kelp', 'starfish', 'kelp', 'anchor', 'shell', 'kelp',
    'pearl', 'kelp', 'shell', 'starfish', 'kelp', 'anchor', 'shell', 'crab',
    'kelp', 'shell', 'starfish', 'pearl', 'kelp', 'anchor', 'shell', 'starfish']),
  Object.freeze(['shell', 'kelp', 'starfish', 'kelp', 'anchor', 'shell', 'kelp', 'pearl',
    'kelp', 'starfish', 'shell', 'kelp', 'anchor', 'shell', 'kelp', 'starfish',
    'pearl', 'kelp', 'crab', 'shell', 'kelp', 'anchor', 'starfish', 'shell']),
  Object.freeze(['kelp', 'starfish', 'shell', 'kelp', 'pearl', 'kelp', 'anchor', 'shell',
    'kelp', 'starfish', 'kelp', 'shell', 'crab', 'kelp', 'anchor', 'shell',
    'starfish', 'kelp', 'pearl', 'shell', 'kelp', 'anchor', 'starfish', 'shell'])
]);

// Every stop the three rings can make
const COMBOS = STRIP_LEN ** REELS;

// What all of those stops pay, added up, in closed form: a symbol is three alike on weight^3 of
// them and exactly two alike on 3 * weight^2 * (STRIP_LEN - weight) of them, both of which are
// whole numbers, so the return is an exact fraction and the band below is compared as integers.
//
// Exported because the load check trusts this formula and test/slots.test.js enumerates all 13,824
// stops and checks the enumeration against it. That way the figure is written down once: a number
// typed into two places is a number that will disagree with itself
function grossOf() {
  let gross = 0;
  for (const r of PAYS) {
    const w = r.weight;
    gross += w * w * w * r.three + 3 * w * w * (STRIP_LEN - w) * r.pair;
  }
  return gross;
}

// The table and the rings are the whole game, so a typo in either is the whole game being wrong.
// Checked once, when the module loads, the way forge.js checks its ladder
(function checkTable() {
  if (PAYS.length < 2) throw new Error('slots: a paytable needs rows');
  if (OPS.length) throw new Error('slots: a spin takes no actions, so OPS must stay empty');
  let weights = 0;
  for (let i = 0; i < PAYS.length; i++) {
    const r = PAYS[i];
    if (!Number.isSafeInteger(r.weight) || r.weight < 1) throw new Error('slots: bad weight for ' + r.sym);
    if (!Number.isSafeInteger(r.three) || r.three < 1) throw new Error('slots: bad three-alike pay for ' + r.sym);
    if (!Number.isSafeInteger(r.pair) || r.pair < 0) throw new Error('slots: bad pair pay for ' + r.sym);
    // the table is printed rarest first, and a commoner symbol that paid more would make the order
    // a lie as well as making the rarer row pointless
    if (i > 0 && (r.weight < PAYS[i - 1].weight || r.three >= PAYS[i - 1].three)) {
      throw new Error('slots: the table does not climb at ' + r.sym);
    }
    weights += r.weight;
  }
  if (weights !== STRIP_LEN) throw new Error('slots: the weights do not fill a ring of ' + STRIP_LEN);
  if (STRIPS.length !== REELS) throw new Error('slots: there are ' + REELS + ' reels');
  // Every ring has to hold exactly the weights above, or the odds the table was solved from are not
  // the odds the machine runs on. This is the check that matters: the rings are hand written
  for (const strip of STRIPS) {
    if (strip.length !== STRIP_LEN) throw new Error('slots: a ring is ' + STRIP_LEN + ' long');
    for (const r of PAYS) {
      const n = strip.filter((s) => s === r.sym).length;
      if (n !== r.weight) throw new Error('slots: a ring holds ' + n + ' ' + r.sym + ', not ' + r.weight);
    }
  }
  // And the figure none of the checks above can see: the return. Every one of them passes on a
  // table that pays out more than it takes, because each only looks at one row against its
  // neighbour. One digit on the kelp row (a six to a seven) keeps the order, keeps the weights, and
  // makes the machine return 100.14%, and the kelp row is the one carrying 23% of the payout.
  // Priced as integers, so this is the band itself and not a rounding of it
  const gross = grossOf();
  if (100 * gross < BAND_LO * COMBOS || 100 * gross > BAND_HI * COMBOS) {
    throw new Error('slots: the table returns ' + (gross / COMBOS * 100).toFixed(2) + '%, outside the band');
  }
})();

// --- the spin ---------------------------------------------------------------------------

// Where the three rings stop, as ring positions. Exported so a test can walk every stop there is
// and so a test can search for the seed that stops on a crab, the way the card tests search a seed
// for a deal. The host makes a fresh seed per spin and never hands it over before the spin
function stopsOf(seed) {
  const roll = C.rollsFrom(seed);
  const out = [];
  for (let i = 0; i < REELS; i++) out.push(Math.floor(roll() * STRIP_LEN));
  return out;
}

const symAt = (reel, at) => STRIPS[reel][((at % STRIP_LEN) + STRIP_LEN) % STRIP_LEN];

// Which row three stopped symbols pay, and which reels made it. Takes the symbols rather than the
// stops, so the ranking can be run over every combination of symbols the rings can show.
//
// With three reels there is no ambiguity to resolve: either all three match, or one symbol appears
// twice and another once, or all three differ. Two different pairs cannot both be on the line
function winOf(syms) {
  if (!Array.isArray(syms) || syms.length !== REELS) throw new RangeError('a line is ' + REELS + ' symbols');
  for (const s of syms) if (!ROW[s]) throw new RangeError('no such symbol: ' + s);
  if (syms[0] === syms[1] && syms[1] === syms[2]) {
    return Object.freeze({ kind: 'three', sym: syms[0], mult: ROW[syms[0]].three, reels: Object.freeze([0, 1, 2]) });
  }
  for (const pair of [[0, 1], [0, 2], [1, 2]]) {
    if (syms[pair[0]] !== syms[pair[1]]) continue;
    const row = ROW[syms[pair[0]]];
    // a symbol whose pair pays nothing is not a win, and saying so is the point: the screen lights
    // the line it is handed and nothing else, so a kelp pair lights nothing
    if (!row.pair) return NO_WIN;
    return Object.freeze({ kind: 'pair', sym: row.sym, mult: row.pair, reels: Object.freeze(pair) });
  }
  return NO_WIN;
}

// --- state -----------------------------------------------------------------------------

// seed: any string (a fresh one per spin). id: the spin's public name, which must not be the seed
// (null if not given). stops: explicit ring positions instead of the seeded roll, for tests and
// replays, the way poker.js takes a stacked deck
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (one integer product, nothing rounded) only holds while the top row's
  // payout is still a safe integer. The host caps a bet at the balance long before this, so the
  // check is the promise made structural rather than a case anyone meets
  if (bet > Number.MAX_SAFE_INTEGER / PAYS[0].three) throw new RangeError('bet is too large to pay the top row exactly');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const stops = opts.stops ? opts.stops.slice() : stopsOf(seed);
  if (stops.length !== REELS) throw new RangeError('a spin stops ' + REELS + ' reels');
  for (const at of stops) {
    if (!Number.isInteger(at) || at < 0 || at >= STRIP_LEN) throw new RangeError('stop out of the ring: ' + at);
  }
  const syms = stops.map((at, reel) => symAt(reel, at));
  const win = winOf(syms);
  return {
    id: opts.id == null ? null : String(opts.id),
    seed,
    // a spin settles on the press, so a round is born done and there is no other phase to be in
    phase: 'done',
    bet,
    stops,
    syms,
    win,
    net: bet * win.mult - bet
  };
}

// What a live round has riding on it, for the other games' budgets (games/tables.js). A spin
// settles on the press, so there is never a live round and the answer is always nothing
function stake(st) {
  return 0;
}

// Why `op` cannot be played now. There is no action inside a spin, so the answer is always the same
// one, and it is the answer the host needs: a webview asking for something this game does not have
// has to be told, or it waits out its no-reply timeout.
// budget is not read: the only money decision is the bet, and the host cleared that before the spin
function whyNot(st, op, budget) {
  return 'a spin settles on the press, so there is nothing to play';
}

// Nothing can be played on a spin, so this gives back the very same object every time. It is the
// contract's shape rather than a branch: see the note at the top of the file
function act(st, op) {
  return st;
}

// --- what the webview sees ----------------------------------------------------------------------

// `pays` and `strips` are the machine, not a result: the screen prints these six rows and scrolls
// these three rings, and holds no multiplier and no symbol order of its own, so the machine can be
// retuned here and the screen follows. Both are handed over on the bet screen too, where the
// paytable is the only thing to look at
function idleView() {
  return {
    phase: 'bet', id: null, bet: null,
    reels: [], win: null, net: null,
    pays: PAYS, strips: STRIPS, stripLen: STRIP_LEN, reelCount: REELS, minBet: MIN_BET,
    can: {}
  };
}

// Everything here is face up. A round exists only after it has settled, so there is no face-down
// card to leak and no live phase to keep the seed out of: the seed is handed over because the spin
// it names is already over and the next spin rolls a fresh one of its own.
//
// `reels` is one entry per reel: the symbol it stopped on, the two either side of it on the ring,
// and the ring position itself, which is what lets the screen scroll the real ring to the real
// place rather than inventing a stop of its own.
// `win` is one of the paid rows or NO_WIN, never null, so the result chip is always a kind and a
// net. `net` is what the balance moved by: zero for a paid pair, minus the bet for a spin that
// missed, and nothing in between.
//
// The seed is still handed over under a phase test rather than unconditionally. As the game stands
// the test is always true, so the line looks like it does nothing: what it does is keep the rule
// (games/README.md section 6: a seed only at 'done') as the SHAPE of the function instead of as a
// property of there being one phase. If a later version ever holds a round open while the reels
// spin, this line is already right, and that is the mistake that leaked a whole deck once
function view(st, budget) {
  if (!st) return idleView();
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    reels: st.stops.map((at, reel) => ({
      sym: st.syms[reel],
      at,
      above: symAt(reel, at - 1),
      below: symAt(reel, at + 1)
    })),
    win: st.win,
    net: st.net,
    pays: PAYS,
    strips: STRIPS,
    stripLen: STRIP_LEN,
    reelCount: REELS,
    minBet: MIN_BET,
    can: {}
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  stopsOf, winOf, symAt, grossOf,
  PAYS, NO_WIN, ROW, SYMBOLS, STRIPS, OPS, MIN_BET, REELS, STRIP_LEN, COMBOS, BAND_LO, BAND_HI
};
