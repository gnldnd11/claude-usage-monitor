// The crab's minefield: 25 cells, a few of them mined, and the only decision is when to stop.
// Pure: knows nothing about vscode or credits. The one require is ./cards, for the shared PRNG.
//
// Rules (fixed, kept simple):
//  - a 5x5 board, 25 cells, with MINE_COUNTS mines buried in it. The count is chosen at the deal
//  - the player digs one cell at a time. A safe cell lifts the payout, a mine ends the round and
//    the bet is lost
//  - the player may cash out at any point from the first safe cell on, and keeps the payout
//  - digging every safe cell ends the round at the top of the ladder. There is nothing left to
//    decide there, so the round settles itself rather than waiting for a cash-out
//
// The ladder: after k safe cells the fair price is 1 / P(k safe digs in a row), and the house keeps
// 3% of it. The digs are draws without replacement, so that probability is hypergeometric and exact:
//
//    P(k safe) = C(25 - M, k) / C(25, k)        M mines, k cells dug
//    payout multiplier = 97 * C(25, k) / (100 * C(25 - M, k))
//
// Both halves are whole numbers, so the ladder is kept as a reduced integer numerator and
// denominator and never as a float. A multiplier stored as a float and multiplied by the bet lands
// a credit low whenever the product falls just under a whole number, which is how a screen comes to
// promise 1.1x and a ledger to pay 1.0x (high-low's `grow` carries the same note).
//
// Money: whole credits, one floor, always the house's way.
//    payout = floor(bet * num / den)
// and the multiplier the screen prints is read back OUT of that payout (`mult100`), never the other
// way round. A figure derived from the ladder instead would be a promise the ledger does not keep.
//
// Why the minimum bet is 100 and not the house's usual 10. The return of "pick M mines, stop after
// k safe cells" is exactly
//    0.97 * floor(bet * mult) / (bet * mult)
// because the ladder's own P cancels the multiplier. The flooring is the whole of the gap, so the
// return is at worst 0.97 * (1 - 1 / (bet * mult)): one credit of flooring over the money riding.
// At a 10-credit bet that one credit is worth more than the house's entire 3% cut (10 mines, stop at
// 2 cells, measured 94.50%), and the band this repo holds every game to would break downward. At 100
// the worst play in the whole table returns 96.22%. test/mines.test.js prints both columns, so the
// figure that chose this constant is in the output rather than in a memory.
//
// What `view()` does not carry: the layout. Nothing a player has not dug is ever in the state the
// webview is handed, and the seed only appears once the round is done (high-low withholds its shoe
// and its seed for the same reason). The layout IS kept in the state rather than re-derived from the
// seed on every dig: one shuffle at the deal is one place where "which cells are mined" is decided,
// and a deriving reader that drifts from the dealer is a hard bug to see. The seed is what must stay
// in, not the cells, and `view` is the only door out.
//
// The op is 'dig', not 'open'. On the wire 'open' already means "show me this panel" (games/tables.js
// answers it before any game rule runs), so a game action by that name would be swallowed.
//
// Determinism: the same seed and the same cells always give the same round, so a settled round can
// be replayed from its view.
//
// State is internal (it holds the layout); `view()` makes what the webview may see.
// `act()` never mutates its input and returns the very same object when the move is not allowed;
// `whyNot()` says why.

const C = require('./cards');

const OPS = ['dig', 'cashout'];

// The board. 5x5 is the whole game: a width that fits the panel and a count small enough that the
// ladder can be enumerated in full by a test
const SIZE = 5;
const CELLS = SIZE * SIZE;

// Three boards, and the spread is the point: 3 mines is a long gentle ladder (2,231x at the top),
// 10 mines doubles the payout every second cell and is over in a few digs
const MINE_COUNTS = [3, 5, 10];
const DEFAULT_MINES = 5;

// The house keeps 3% of every payout, the same cut blackjack, high-low, poker and the forge keep
const EDGE_NUM = 97;
const EDGE_DEN = 100;

// See the header: at 10 the flooring alone costs more than the cut
const MIN_BET = 100;

// The payout is floor(bet * num / den) and the screen's multiplier is floor(100 * payout / bet), so
// what has to stay a safe integer is bet * num and 100 * payout. The widest row on the table is
// 15,853,486 / 5 (10 mines, the board cleared), which puts both products inside 2^53 at this cap.
// Checked below rather than trusted
const MAX_BET = 10000000;

// --- integer money ----------------------------------------------------------------------

// floor(a / b) and ceil(a / b) for whole a, b, without trusting the division. a / b is rounded to
// the nearest double, so for a large a the result can land exactly ON the integer above the true
// quotient and Math.floor then returns one too many. The corrections cost a comparison and make
// these exact for every a inside 2^53
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

// C(n, k). The running value is a whole number at every step (that is the binomial identity), so
// this is exact in doubles for everything this board can ask: C(25, 12) is 5,200,300
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

// --- the ladder -------------------------------------------------------------------------

// One ladder per mine count: index k holds the fair price of k safe cells as a reduced fraction.
// Index 0 is the opening, 97/100, which is why cashing out before the first dig is refused: it
// would hand back less than the bet for no risk at all, and a game that charges to look at a board
// is a fee rather than a bet (high-low refuses the same move for the same reason).
const LADDERS = {};
for (const mines of MINE_COUNTS) {
  const safe = CELLS - mines;
  const rows = [];
  for (let k = 0; k <= safe; k++) {
    let num = EDGE_NUM * comb(CELLS, k);
    let den = EDGE_DEN * comb(safe, k);
    const g = gcd(num, den);
    rows.push(Object.freeze({ k, num: num / g, den: den / g }));
  }
  LADDERS[mines] = Object.freeze(rows);
}
Object.freeze(LADDERS);

// The ladder is the whole game, so an arithmetic slip in it is the whole game being wrong. Checked
// once, when the module loads, the way forge.js checks its table
(function checkLadders() {
  for (const mines of MINE_COUNTS) {
    const rows = LADDERS[mines];
    const safe = CELLS - mines;
    if (rows.length !== safe + 1) throw new Error('mines: ' + mines + ' needs a rung per safe cell');
    for (const r of rows) {
      if (!Number.isSafeInteger(r.num) || !Number.isSafeInteger(r.den) || r.den < 1) throw new Error('mines: bad rung at k=' + r.k);
      // the price has to beat the bet from the first safe cell on, or a correct dig would shrink it
      if (r.k > 0 && r.num <= r.den) throw new Error('mines: k=' + r.k + ' does not pay above the bet');
      // and climb, or stopping later would be worse than stopping now
      if (r.k > 0 && r.num * rows[r.k - 1].den <= rows[r.k - 1].num * r.den) throw new Error('mines: the ladder does not climb at k=' + r.k);
      // the two products the money path forms, at the widest bet the engine will take
      if (!Number.isSafeInteger(MAX_BET * r.num)) throw new Error('mines: MAX_BET overflows the rung at k=' + r.k);
      if (!Number.isSafeInteger(100 * floorDiv(MAX_BET * r.num, r.den))) throw new Error('mines: MAX_BET overflows the shown multiplier at k=' + r.k);
    }
    // the opening rung is the house's cut and nothing else: 0.97 of the bet, which is what makes
    // "cash out before digging" a refusal rather than a move that loses 3% for free
    if (rows[0].num !== EDGE_NUM || rows[0].den !== EDGE_DEN) throw new Error('mines: the opening rung is not the house cut');
  }
})();

function rungOf(mines, k) {
  const rows = LADDERS[mines];
  return rows && rows[k] ? rows[k] : null;
}

// What k safe cells pay on this bet. One floor, the house's way
function payoutAt(bet, mines, k) {
  const r = rungOf(mines, k);
  if (!r) return null;
  return floorDiv(bet * r.num, r.den);
}

// The multiplier the screen prints, in hundredths, read back out of the payout that will really
// land. Flooring it too means the printed figure never promises a credit the payout does not carry
function mult100Of(bet, payout) {
  return floorDiv(100 * payout, bet);
}

// --- the layout -------------------------------------------------------------------------

// Which cells are mined: a shuffle of the 25 cells, the first `mines` of them. Every M-subset is
// equally likely, which is exactly what makes P(k safe digs) hypergeometric and the ladder above
// honest whichever cells the player picks.
// `stack` takes an explicit list of mined cells instead, for tests and replays
function layoutOf(seed, mines, stack) {
  const flags = new Array(CELLS).fill(false);
  if (stack) {
    for (const cell of stack) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) throw new RangeError('bad cell: ' + cell);
      flags[cell] = true;
    }
    return flags;
  }
  const cells = [];
  for (let i = 0; i < CELLS; i++) cells.push(i);
  const order = C.shuffle(cells, seed);
  for (let i = 0; i < mines; i++) flags[order[i]] = true;
  return flags;
}

// --- state ------------------------------------------------------------------------------

// The layout is never mutated, so a copy shares it. `dug` is the player's own history and is copied
function clone(st) {
  return Object.assign({}, st, { dug: st.dug.slice() });
}

// seed: any string, fresh per round. id: the round's public name, which must NOT be the seed (the
//   seed is the layout, and a round id is in every message).
// bet: whole credits, MIN_BET..MAX_BET.
// mines: one of MINE_COUNTS.
// stack: explicit mined cells, for tests and replays.
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < MIN_BET) throw new RangeError('bet must be a whole number of at least ' + MIN_BET);
  if (bet > MAX_BET) throw new RangeError('bet must be at most ' + MAX_BET);
  const mines = opts.mines == null ? DEFAULT_MINES : opts.mines;
  if (MINE_COUNTS.indexOf(mines) < 0) throw new RangeError('mines must be one of ' + MINE_COUNTS.join(', '));
  const seed = String(opts.seed == null ? '' : opts.seed);
  return {
    id: opts.id == null ? null : String(opts.id),
    seed,
    phase: 'play',
    bet,
    mines,
    layout: layoutOf(seed, mines, opts.stack),
    dug: [],        // safe cells, in the order they were dug
    hit: null,      // the mined cell that ended the round
    payout: 0,
    net: null,
    ended: null
  };
}

// How many safe cells there are in all, and how many are left
function safeTotal(st) { return CELLS - st.mines; }

// An op is either a bare string ('cashout') or an object carrying its argument ({ op: 'dig', cell }),
// the shape poker's draw already uses
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
    // cashing out before a single dig would pay 0.97 of the bet back for no risk taken
    if (st.dug.length === 0) return 'dig a cell first';
    return null;
  }
  const cell = cellOf(op);
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return 'pick a cell on the board';
  if (st.dug.indexOf(cell) >= 0) return 'that cell is already dug';
  return null;
}

// Closes the round. `payout` is what the player receives, so one formula settles every ending
function end(st, how, payout) {
  st.payout = payout;
  st.net = payout - st.bet;
  st.ended = how;
  st.phase = 'done';
}

function dig(st, cell) {
  if (st.layout[cell]) { st.hit = cell; return end(st, 'boom', 0); }
  st.dug.push(cell);
  // the board is clear: there is no cell left to dig and nothing left to decide, so the round pays
  // out by itself rather than sitting there waiting for the one move it still allows
  if (st.dug.length === safeTotal(st)) end(st, 'cleared', payoutAt(st.bet, st.mines, st.dug.length));
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  if (nameOf(op) === 'cashout') end(next, 'cashout', payoutAt(next.bet, next.mines, next.dug.length));
  else dig(next, cellOf(op));
  return next;
}

// What a live round has riding on it, held back from the other games' budgets. The payout the ladder
// has climbed to is the house's money until the player cashes out, so only the bet is ever at stake
function stake(st) {
  return st && st.phase === 'play' ? st.bet : 0;
}

// --- what the webview sees --------------------------------------------------------------

// The ladder priced for this bet: what each rung really pays and the multiplier read back out of it.
// The screen holds no arithmetic of its own, so this is the whole column it draws
function ladderOf(bet, mines) {
  const rows = [];
  for (let k = 1; k <= CELLS - mines; k++) {
    const payout = payoutAt(bet, mines, k);
    rows.push({ k, payout, mult100: mult100Of(bet, payout) });
  }
  return rows;
}

// The fair price of each rung in hundredths, floored, for a board nobody has bet on yet. It is the
// board's geometry and nothing else, so it is the same for every player. Named apart from `mult100`
// on purpose: this one is NOT a payout anybody is owed, and a screen that prints it beside a live
// bet would be quoting a figure the ledger has not agreed to
function fairTable() {
  const out = {};
  for (const mines of MINE_COUNTS) {
    const col = [];
    for (let k = 1; k <= CELLS - mines; k++) {
      const r = rungOf(mines, k);
      col.push(floorDiv(100 * r.num, r.den));
    }
    out[mines] = col;
  }
  return out;
}

// What the board looks like from outside.
//  live: 'safe' for a cell the player has dug, null for every other cell. A null is all the webview
//        is ever told about a cell nobody has touched
//  done: the whole board, so the player can see where the rest of them were. 'boom' is the mine that
//        ended it, 'mine' one that was never dug, 'free' a safe cell left behind
function gridOf(st) {
  const out = new Array(CELLS).fill(null);
  for (const cell of st.dug) out[cell] = 'safe';
  if (st.phase !== 'done') return out;
  for (let cell = 0; cell < CELLS; cell++) {
    if (out[cell]) continue;
    out[cell] = st.layout[cell] ? (cell === st.hit ? 'boom' : 'mine') : 'free';
  }
  return out;
}

function idleView() {
  return {
    phase: 'bet',
    id: null,
    bet: null,
    mines: DEFAULT_MINES,
    choices: MINE_COUNTS.slice(),
    size: SIZE,
    cells: CELLS,
    grid: new Array(CELLS).fill(null),
    dug: [],
    safe: 0,
    safeTotal: CELLS - DEFAULT_MINES,
    left: CELLS,
    cash: null,
    mult100: null,
    next: null,
    ladder: [],
    fair: fairTable(),
    can: { dig: false, cashout: false },
    why: { dig: 'place a bet first', cashout: 'place a bet first' },
    hit: null,
    payout: 0,
    net: null,
    ended: null
  };
}

// A cell the player could still dig, for asking whyNot whether ANY dig is open. There is always one
// while the round is live (the board ends itself when the safe cells run out), so this only returns
// -1 on a settled round, where whyNot refuses on the phase before it ever looks at the cell
function firstUndug(st) {
  for (let cell = 0; cell < CELLS; cell++) if (st.dug.indexOf(cell) < 0) return cell;
  return -1;
}

// Everything here is either public already (the bet, the mine count, the cells the player dug) or
// settled (the full board and the seed, at 'done'). The layout stays in the state while the round is
// live, and so does the seed that made it.
//
// `cash` is what cashing out right now really pays and `next` what one more safe cell would pay,
// both as whole credits with the multiplier read back out of them. `next.chance` is the odds that
// cell is safe, as two whole numbers, so the screen can print a percentage without holding the
// hypergeometric itself
function view(st, budget) {
  if (!st) return idleView();
  const k = st.dug.length;
  const total = safeTotal(st);
  const live = st.phase === 'play';
  // `cash` is an offer, so it is null the moment there is nothing left to accept. A settled round
  // reports its money in `payout`, and a board that printed a cash-out figure after a mine went off
  // would be showing a number nobody is owed, which is the one mistake this engine is written against
  const cash = live && k > 0 ? payoutAt(st.bet, st.mines, k) : null;
  const unopened = CELLS - k - (st.hit == null ? 0 : 1);
  const whyDig = whyNot(st, { op: 'dig', cell: firstUndug(st) }, budget);
  const whyCash = whyNot(st, 'cashout', budget);
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    mines: st.mines,
    choices: MINE_COUNTS.slice(),
    size: SIZE,
    cells: CELLS,
    grid: gridOf(st),
    dug: st.dug.slice(),
    safe: k,
    safeTotal: total,
    left: unopened,
    cash,
    // always the multiplier of money that is, or would be, received: the offer while the round is
    // live, what was paid once it is over, and 0 after a mine
    mult100: live ? (cash == null ? null : mult100Of(st.bet, cash)) : mult100Of(st.bet, st.payout),
    next: null,
    ladder: ladderOf(st.bet, st.mines),
    fair: fairTable(),
    can: { dig: !whyDig, cashout: !whyCash },
    why: { dig: whyDig, cashout: whyCash },
    hit: st.hit,
    payout: st.payout,
    net: st.net,
    ended: st.ended
  };
  if (live && k < total) {
    const payout = payoutAt(st.bet, st.mines, k + 1);
    v.next = {
      payout,
      mult100: mult100Of(st.bet, payout),
      chance: { num: total - k, den: CELLS - k }
    };
  }
  // the cards it names are spent and the next round shuffles its own board with a seed of its own
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  OPS, SIZE, CELLS, MINE_COUNTS, DEFAULT_MINES, MIN_BET, MAX_BET, EDGE_NUM, EDGE_DEN,
  LADDERS, payoutAt, mult100Of, rungOf, floorDiv, comb
};
