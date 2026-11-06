// The crab's tower: ten floors, one of the doors on each of them is a trap, and the only decision is
// which floor to stop on. Pure: knows nothing about vscode or credits. The one require is ./cards.
//
// Rules (fixed, kept simple):
//  - a floor has `cells` doors, `traps` of them trapped. The difficulty chooses both at the deal
//  - the player picks one door per floor, from the bottom up. A safe door lifts the payout and opens
//    the next floor, a trap ends the round and the bet is lost
//  - the player may cash out from the first cleared floor on, and keeps the payout
//  - clearing FLOORS floors is the top. There is nothing above it and nothing left to decide, so the
//    round settles itself at the top of the ladder rather than waiting for a cash-out
//
// The ladder: every floor is the same gamble, so after n floors the fair price is 1 / p^n with
// p = safe / cells, and the house keeps 3% of it:
//
//    payout multiplier = 97 * cells^n / (100 * safe^n)
//
// Both halves are whole numbers, so the ladder is kept as a reduced integer numerator and
// denominator and never as a float (the note in mines.js and in high-low's `grow` is the same one:
// a float multiplier is how a screen comes to promise 1.5x and a ledger to pay 1.4x).
//
// Money: whole credits, one floor, always the house's way.
//    payout = floor(bet * num / den)
// and the multiplier the screen prints is read back OUT of that payout (`mult100`), never the other
// way round.
//
// Why the minimum bet is 100 and not the house's usual 10. The return of "pick a difficulty, stop
// after n floors" is exactly
//    0.97 * floor(bet * mult) / (bet * mult)
// because the ladder's own p^n cancels the multiplier, so the flooring is the whole of the gap. At a
// 10-credit bet one floored credit is worth more than the house's entire 3% cut (the easy tower's
// first floor measures 90.00%) and the band this repo holds every game to would break downward. At
// 100 the worst play in the whole table returns 96.32%. test/tower.test.js prints both columns.
//
// This is the same arithmetic as the minefield, deliberately, and what has to differ is the feel.
// The minefield is a wide board the player scratches at in any order; the tower is one row at a
// time, upward, with the floors it has already passed behind it. That is why `view` hands over the
// whole building as `rows` (every floor, its price, the door that was taken) rather than a grid, and
// why a settled round reveals the traps on EVERY floor, the ones it never reached included. "It was
// that one" is the feeling this game is for, and it only lands if the floors above are shown too.
//
// What `view()` does not carry: the layout, while the round is live. Not the floor being climbed and
// not the floors above it. The seed only appears once the round is done (high-low withholds its shoe
// and its seed for the same reason). The layout IS kept in the state rather than re-derived on every
// climb: one draw at the deal is one place where "which door is trapped" is decided, and a deriving
// reader that drifts from the dealer is a hard bug to see.
//
// Determinism: the same seed and the same doors always give the same round, so a settled round can
// be replayed from its view.
//
// State is internal (it holds the layout); `view()` makes what the webview may see.
// `act()` never mutates its input and returns the very same object when the move is not allowed;
// `whyNot()` says why.

const C = require('./cards');

const OPS = ['climb', 'cashout'];

// Ten floors. Enough that the top is a real climb and few enough that the whole ladder fits in the
// panel as one column
const FLOORS = 10;

// Three towers out of two numbers. The spread is the point: the easy one is a long slow climb
// (17.2x at the top), the hard one doubles three times a floor and tops out at 57,277x
const DIFFS = [
  Object.freeze({ id: 'easy', cells: 4, traps: 1 }),
  Object.freeze({ id: 'normal', cells: 3, traps: 1 }),
  Object.freeze({ id: 'hard', cells: 3, traps: 2 })
].map((d) => Object.freeze(d));
Object.freeze(DIFFS);
const DEFAULT_DIFF = 'normal';

// The house keeps 3% of every payout, the same cut blackjack, high-low, poker and the forge keep
const EDGE_NUM = 97;
const EDGE_DEN = 100;

// See the header: at 10 the flooring alone costs more than the cut
const MIN_BET = 100;

// The payout is floor(bet * num / den) and the screen's multiplier is floor(100 * payout / bet), so
// what has to stay a safe integer is bet * num and 100 * payout. The widest rung on the table is the
// hard tower's top, 5,727,753 / 100, which puts both products inside 2^53 at this cap. Checked below
const MAX_BET = 10000000;

// --- integer money ----------------------------------------------------------------------

// floor(a / b) for whole a, b, without trusting the division. a / b is rounded to the nearest
// double, so for a large a the result can land exactly ON the integer above the true quotient and
// Math.floor then returns one too many. The corrections cost a comparison and make this exact for
// every a inside 2^53
function floorDiv(a, b) {
  let q = Math.floor(a / b);
  while (q * b > a) q -= 1;
  while ((q + 1) * b <= a) q += 1;
  return q;
}

function gcd(a, b) {
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

// --- the ladder -------------------------------------------------------------------------

function diffOf(id) {
  for (const d of DIFFS) if (d.id === id) return d;
  return null;
}

// One ladder per difficulty: index n holds the fair price of n cleared floors as a reduced fraction.
// Index 0 is the opening, 97/100, which is why cashing out before the first climb is refused: it
// would hand back less than the bet for no risk at all, and a game that charges to look at a tower
// is a fee rather than a bet (high-low and the minefield refuse the same move for the same reason).
const LADDERS = {};
for (const d of DIFFS) {
  const safe = d.cells - d.traps;
  const rows = [];
  let up = 1, down = 1;
  for (let n = 0; n <= FLOORS; n++) {
    let num = EDGE_NUM * up;
    let den = EDGE_DEN * down;
    const g = gcd(num, den);
    rows.push(Object.freeze({ n, num: num / g, den: den / g }));
    up *= d.cells;
    down *= safe;
  }
  LADDERS[d.id] = Object.freeze(rows);
}
Object.freeze(LADDERS);

// The ladder is the whole game, so an arithmetic slip in it is the whole game being wrong. Checked
// once, when the module loads, the way forge.js checks its table
(function checkLadders() {
  for (const d of DIFFS) {
    if (d.traps < 1 || d.traps >= d.cells) throw new Error('tower: ' + d.id + ' leaves no safe door');
    const rows = LADDERS[d.id];
    if (rows.length !== FLOORS + 1) throw new Error('tower: ' + d.id + ' needs a rung per floor');
    if (rows[0].num !== EDGE_NUM || rows[0].den !== EDGE_DEN) throw new Error('tower: the opening rung is not the house cut');
    for (const r of rows) {
      if (!Number.isSafeInteger(r.num) || !Number.isSafeInteger(r.den) || r.den < 1) throw new Error('tower: bad rung at floor ' + r.n);
      // the price has to beat the bet from the first cleared floor on, or a safe door would shrink it
      if (r.n > 0 && r.num <= r.den) throw new Error('tower: floor ' + r.n + ' does not pay above the bet');
      // and climb, or stopping higher would be worse than stopping here
      if (r.n > 0 && r.num * rows[r.n - 1].den <= rows[r.n - 1].num * r.den) throw new Error('tower: the ladder does not climb at floor ' + r.n);
      // the two products the money path forms, at the widest bet the engine will take
      if (!Number.isSafeInteger(MAX_BET * r.num)) throw new Error('tower: MAX_BET overflows the rung at floor ' + r.n);
      if (!Number.isSafeInteger(100 * floorDiv(MAX_BET * r.num, r.den))) throw new Error('tower: MAX_BET overflows the shown multiplier at floor ' + r.n);
    }
  }
})();

function rungOf(diff, n) {
  const rows = LADDERS[diff];
  return rows && rows[n] ? rows[n] : null;
}

// What n cleared floors pay on this bet. One floor, the house's way
function payoutAt(bet, diff, n) {
  const r = rungOf(diff, n);
  if (!r) return null;
  return floorDiv(bet * r.num, r.den);
}

// The multiplier the screen prints, in hundredths, read back out of the payout that will really
// land. Flooring it too means the printed figure never promises a credit the payout does not carry
function mult100Of(bet, payout) {
  return floorDiv(100 * payout, bet);
}

// --- the layout -------------------------------------------------------------------------

// Which door is trapped on each floor: a shuffle of that floor's doors, the first `traps` of them.
// Every choice of traps is equally likely, which is what makes P(a door is safe) = safe / cells
// whichever door the player picks, and the ladder above honest.
//
// A floor gets its own derived seed rather than its own stream. cards.js owns the repo's one
// Fisher-Yates on purpose (a second copy is how two copies drift apart), and C.shuffle takes a seed
// rather than a generator, so the choice is a derived seed per floor or a shuffle written again here.
// A derived seed it is: the round's seed is a shuffle's seed and nothing else, which is the rule
// cards.js asks for.
// `stack` takes the traps per floor explicitly instead, for tests and replays
function layoutOf(seed, d, stack) {
  const out = [];
  const doors = [];
  for (let i = 0; i < d.cells; i++) doors.push(i);
  for (let f = 0; f < FLOORS; f++) {
    if (stack) {
      const row = stack[f] || [];
      for (const cell of row) {
        if (!Number.isInteger(cell) || cell < 0 || cell >= d.cells) throw new RangeError('bad door: ' + cell);
      }
      out.push(row.slice().sort((a, b) => a - b));
      continue;
    }
    const order = C.shuffle(doors, seed + '/' + f);
    out.push(order.slice(0, d.traps).sort((a, b) => a - b));
  }
  return out;
}

// --- state ------------------------------------------------------------------------------

// The layout is never mutated, so a copy shares it. `picks` is the player's own climb and is copied
function clone(st) {
  return Object.assign({}, st, { picks: st.picks.slice() });
}

// seed: any string, fresh per round. id: the round's public name, which must NOT be the seed (the
//   seed is the layout, and a round id is in every message).
// bet: whole credits, MIN_BET..MAX_BET.
// diff: one of DIFFS' ids.
// stack: the traps per floor, for tests and replays.
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < MIN_BET) throw new RangeError('bet must be a whole number of at least ' + MIN_BET);
  if (bet > MAX_BET) throw new RangeError('bet must be at most ' + MAX_BET);
  const d = diffOf(opts.diff == null ? DEFAULT_DIFF : opts.diff);
  if (!d) throw new RangeError('diff must be one of ' + DIFFS.map((x) => x.id).join(', '));
  const seed = String(opts.seed == null ? '' : opts.seed);
  return {
    id: opts.id == null ? null : String(opts.id),
    seed,
    phase: 'play',
    bet,
    diff: d.id,
    cells: d.cells,
    traps: d.traps,
    floors: FLOORS,
    layout: layoutOf(seed, d, opts.stack),
    picks: [],     // the door taken on each floor cleared, from the bottom up
    hit: null,     // { floor, cell }: the trap that ended the climb
    payout: 0,
    net: null,
    ended: null
  };
}

// An op is either a bare string ('cashout') or an object carrying its argument
// ({ op: 'climb', cell }), the shape poker's draw already uses
function nameOf(op) {
  if (typeof op === 'string') return op;
  return op && typeof op === 'object' ? op.op : null;
}

function cellOf(op) {
  return op && typeof op === 'object' ? op.cell : undefined;
}

// Why `op` cannot be played now, or null.
// budget is not read: a round stakes only its bet, and the host cleared that at the deal, so nothing
// inside a round can cost more credits. The parameter is taken so every engine answers the same
// question with the same signature
function whyNot(st, op, budget) {
  const name = nameOf(op);
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!st || st.phase !== 'play') return 'the round is over';
  if (name === 'cashout') {
    // cashing out before a single floor would pay 0.97 of the bet back for no risk taken
    if (st.picks.length === 0) return 'clear a floor first';
    return null;
  }
  const cell = cellOf(op);
  if (!Number.isInteger(cell) || cell < 0 || cell >= st.cells) return 'pick a door on this floor';
  return null;
}

// Closes the round. `payout` is what the player receives, so one formula settles every ending
function end(st, how, payout) {
  st.payout = payout;
  st.net = payout - st.bet;
  st.ended = how;
  st.phase = 'done';
}

function climb(st, cell) {
  const floor = st.picks.length;
  if (st.layout[floor].indexOf(cell) >= 0) { st.hit = { floor, cell }; return end(st, 'fell', 0); }
  st.picks.push(cell);
  // the top: there is no floor above and nothing left to decide, so the round pays out by itself
  // rather than sitting there waiting for the one move it still allows
  if (st.picks.length === FLOORS) end(st, 'topped', payoutAt(st.bet, st.diff, st.picks.length));
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  if (nameOf(op) === 'cashout') end(next, 'cashout', payoutAt(next.bet, next.diff, next.picks.length));
  else climb(next, cellOf(op));
  return next;
}

// What a live round has riding on it, held back from the other games' budgets. The payout the climb
// has reached is the house's money until the player cashes out, so only the bet is ever at stake
function stake(st) {
  return st && st.phase === 'play' ? st.bet : 0;
}

// --- what the webview sees --------------------------------------------------------------

// The fair price of each floor in hundredths, floored, for a tower nobody has bet on yet. It is the
// difficulty's geometry and nothing else. Named apart from `mult100` on purpose: this one is NOT a
// payout anybody is owed, and a screen that printed it beside a live bet would be quoting a figure
// the ledger has not agreed to
function fairOf(diff) {
  const col = [];
  for (let n = 1; n <= FLOORS; n++) {
    const r = rungOf(diff, n);
    col.push(floorDiv(100 * r.num, r.den));
  }
  return col;
}

function choices() {
  return DIFFS.map((d) => ({ id: d.id, cells: d.cells, traps: d.traps, fair: fairOf(d.id) }));
}

// The building, bottom floor first. One row per floor, each carrying its own price, so the screen
// draws the ladder as the tower itself rather than as a table beside it.
//  where: 'past' a floor already cleared, 'now' the floor the climb is standing on (the one it fell
//         on, once the round is over), 'ahead' one above it
//  pick:  the door taken, on a cleared floor
//  traps: the trapped doors, and ONLY once the round is done. On a live round this is null on every
//         floor, the one being climbed included: that is the whole of what this game keeps back
function rowsOf(st) {
  const at = st.picks.length;
  const done = st.phase === 'done';
  const rows = [];
  for (let f = 0; f < FLOORS; f++) {
    const payout = payoutAt(st.bet, st.diff, f + 1);
    rows.push({
      floor: f + 1,
      where: f < at ? 'past' : (f === at ? 'now' : 'ahead'),
      pick: f < at ? st.picks[f] : (st.hit && st.hit.floor === f ? st.hit.cell : null),
      traps: done ? st.layout[f].slice() : null,
      payout,
      mult100: mult100Of(st.bet, payout)
    });
  }
  return rows;
}

function idleView() {
  const d = diffOf(DEFAULT_DIFF);
  return {
    phase: 'bet',
    id: null,
    bet: null,
    diff: d.id,
    cells: d.cells,
    traps: d.traps,
    floors: FLOORS,
    choices: choices(),
    at: 0,
    rows: [],
    cash: null,
    mult100: null,
    next: null,
    can: { climb: false, cashout: false },
    why: { climb: 'place a bet first', cashout: 'place a bet first' },
    hit: null,
    payout: 0,
    net: null,
    ended: null
  };
}

// Everything here is either public already (the bet, the difficulty, the doors the player took) or
// settled (every floor's traps and the seed, at 'done'). The layout stays in the state while the
// round is live, and so does the seed that made it.
//
// `cash` is what cashing out right now really pays and `next` what one more floor would pay, both as
// whole credits with the multiplier read back out of them. `next.chance` is the odds a door on this
// floor is safe, as two whole numbers, so the screen can print a percentage without holding the
// arithmetic itself
function view(st, budget) {
  if (!st) return idleView();
  const at = st.picks.length;
  const live = st.phase === 'play';
  // `cash` is an offer, so it is null the moment there is nothing left to accept. A settled round
  // reports its money in `payout`, and a tower that printed a cash-out figure after a fall would be
  // showing a number nobody is owed, which is the one mistake this engine is written against
  const cash = live && at > 0 ? payoutAt(st.bet, st.diff, at) : null;
  const whyClimb = whyNot(st, { op: 'climb', cell: 0 }, budget);
  const whyCash = whyNot(st, 'cashout', budget);
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    diff: st.diff,
    cells: st.cells,
    traps: st.traps,
    floors: FLOORS,
    choices: choices(),
    at,
    rows: rowsOf(st),
    cash,
    // always the multiplier of money that is, or would be, received: the offer while the round is
    // live, what was paid once it is over, and 0 after a fall
    mult100: live ? (cash == null ? null : mult100Of(st.bet, cash)) : mult100Of(st.bet, st.payout),
    next: null,
    can: { climb: !whyClimb, cashout: !whyCash },
    why: { climb: whyClimb, cashout: whyCash },
    hit: st.hit,
    payout: st.payout,
    net: st.net,
    ended: st.ended
  };
  if (live && at < FLOORS) {
    const payout = payoutAt(st.bet, st.diff, at + 1);
    v.next = {
      floor: at + 1,
      payout,
      mult100: mult100Of(st.bet, payout),
      chance: { num: st.cells - st.traps, den: st.cells }
    };
  }
  // the doors it names are spent and the next round draws its own tower with a seed of its own
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  OPS, FLOORS, DIFFS, DEFAULT_DIFF, MIN_BET, MAX_BET, EDGE_NUM, EDGE_DEN,
  LADDERS, payoutAt, mult100Of, rungOf, diffOf, fairOf, floorDiv
};
