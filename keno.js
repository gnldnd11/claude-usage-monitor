// The crab's keno: mark numbers on a board of POOL, DRAWN are drawn, and the table pays by how
// many were caught. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - the board is 1..POOL. DRAWN numbers come out of it, in order
//  - the player marks between the fewest and the most PICKS allows. How many were marked chooses
//    the pay table: a 3-spot and an 8-spot are different games on the same board
//  - the payout is `bet * the row for the number caught`, and a row the table does not name pays
//    nothing
//  - every multiplier is a whole number, the way a real keno board posts them
//
// Money: the bet is at risk from the deal and the draw settles it exactly once. The payout is one
// integer product, so NOTHING is rounded and no float touches the money path. That is also the
// reason a pick count with no whole-number table is not offered at all: see PICKS
//
// Determinism: the draw is one seeded shuffle of the board (C.shuffle), and the first DRAWN of it
// IN ORDER are the numbers. The order is kept because the screen draws them one at a time, and a
// shuffle of the whole board rather than ten rolls is what makes that order a fact of the seed
// rather than of how many times something was asked for.
// The seed is the whole draw, so it must never be visible while a round is live: view() shows it
// only once the round is done, and the round id is a separate value.
//
// The op contract the screen is written against, one message per round:
//   act(st, { op: 'draw', picks: [n, n, ...] })
// The marks are toggled inside the webview and arrive as one array, so marking a number costs no
// round trip and there is no ordering to get wrong between ten toggles and the draw that follows
// them. The array IS the move, which is why its shape is a rule here (see badPicks) rather than
// something the host checks on the side. It is the same contract poker's hold flags travel under.

const C = require('./cards');

const OPS = ['draw'];

// The smallest bet the host will take, the same figure as every other game in the casino
const MIN_BET = 10;

const POOL = 40;
const DRAWN = 10;

// --- the tables, and how they were solved -------------------------------------------------------
//
// Catching h of k when DRAWN come out of POOL is hypergeometric: of the C(POOL, k) ways to mark k
// numbers, C(DRAWN, h) * C(POOL - DRAWN, k - h) of them catch exactly h. So a table's return is
//
//     sum over h of  C(DRAWN, h) * C(POOL - DRAWN, k - h) * pays[h]   /   C(POOL, k)
//
// which is exact, countable, and has nothing to do with simulation. WEIGHTS below holds the
// numerators and WAYS the denominator, and the module-load check asserts every table lands in the
// casino's band, 96% to 97%, in whole numbers.
//
// Where the numbers come from. A table was not picked, it was solved, under three rules:
//  1) the lowest paid row is as low as the band allows, because a game that pays nothing in nine
//     rounds out of ten is a game nobody watches. That is the one real design question here: a row
//     paid at h costs the whole budget its probability is worth, and paying the bet back on a 44%
//     event spends 44 of the 96.5 points available. So the cheap rows go first and the lowest paid
//     row rises with k
//  2) above it, each row is set so that every row contributes a comparable share of the return.
//     A row that contributes nothing is decoration, and a row that contributes everything is the
//     only row. The comment on each table prints the shares it came out at
//  3) one row is then solved exactly against the band. It has to be a row whose weight is smaller
//     than the band is wide (1% of C(POOL, k)), or the steps are coarser than the target
//
// Two consequences worth stating, because they look like omissions:
//  - a 1-spot is NOT offered. Catching it is 1 in 4, so the table is a single row and its return is
//    pays[1] / 4: 3 pays 75% and 4 pays 100%, and there is no whole number in between. This is the
//    case the brief for this game asked about, and the answer is that dropping the pick count is
//    the only move that keeps the band
//  - the top row of a large table is a prize, not a contribution. Catching 10 of 10 is 1 in 847
//    million, so its weight is 1 against a band 8.4 million wide: it could pay 200,000x or 2x and
//    the return would not move in the fourth decimal. It is set to the number that reads like the
//    board's headline, and the rows under it carry the game
const TABLES = Object.freeze({
  // 2-spot. The ONLY whole-number table there is: the return has to be a multiple of 15 and the
  // band 748.8..756.6 holds exactly one, 750. Shares: 38.5 / 57.7
  2: Object.freeze([0, 1, 10]),
  // 3-spot. Pays in 59 rounds out of 100, the friendliest board here. Shares: 44.0 / 27.3 / 25.5
  3: Object.freeze([0, 1, 2, 21]),
  // 4-spot. Catching 1 of 4 is 44%, which the band cannot pay even the bet back for without the
  // rows above it going flat, so this board starts at 2. Shares: 42.8 / 35.5 / 18.4
  4: Object.freeze([0, 0, 2, 9, 80]),
  // 5-spot. Shares: 27.8 / 23.8 / 23.9 / 23.0
  5: Object.freeze([0, 0, 1, 3, 25, 550]),
  // 6-spot. Shares: 32.1 / 25.4 / 19.0 / 7.9 / 12.0
  6: Object.freeze([0, 0, 1, 2, 8, 40, 2200]),
  // 7-spot. Shares: 17.6 / 22.9 / 29.4 / 20.3 / 6.4
  7: Object.freeze([0, 0, 0, 1, 5, 50, 600, 10000]),
  // 8-spot. Shares: 22.2 / 15.0 / 20.0 / 23.8 / 14.0 / 1.5
  8: Object.freeze([0, 0, 0, 1, 2, 15, 200, 3000, 25000]),
  // 9-spot. Shares: 26.1 / 21.9 / 15.2 / 14.0 / 11.4 / 7.4 / 0.4
  9: Object.freeze([0, 0, 0, 1, 2, 6, 45, 600, 15000, 100000]),
  // 10-spot. Catching 3 of 10 is 29%, too dear to pay, so this board starts at 4.
  // Shares: 14.7 / 21.2 / 27.2 / 20.1 / 11.6 / 1.8 / 0.0
  10: Object.freeze([0, 0, 0, 0, 1, 5, 40, 350, 5000, 50000, 200000])
});

// The pick counts the game offers, fewest first, and the order the screen lists them in
const PICKS = Object.freeze(Object.keys(TABLES).map(Number).sort((a, b) => a - b));
const MIN_PICK = PICKS[0];
const MAX_PICK = PICKS[PICKS.length - 1];

// --- the arithmetic the tables were solved against ----------------------------------------------

// C(n, r) as an exact integer. The products here stay far inside a safe integer (the largest is
// C(40, 10), about 8.5e8), and the load check below proves it by requiring the weights of every
// table to sum back to its denominator
function choose(n, r) {
  if (r < 0 || r > n) return 0;
  let out = 1;
  for (let i = 0; i < r; i++) out = (out * (n - i)) / (i + 1);
  return Math.round(out);
}

// WAYS[k]: how many ways k numbers can be marked. WEIGHTS[k][h]: how many of those catch exactly h
const WAYS = {};
const WEIGHTS = {};
for (const k of PICKS) {
  WAYS[k] = choose(POOL, k);
  const row = [];
  for (let h = 0; h <= k; h++) row.push(choose(DRAWN, h) * choose(POOL - DRAWN, k - h));
  WEIGHTS[k] = Object.freeze(row);
}
Object.freeze(WAYS);
Object.freeze(WEIGHTS);

// What a table returns, as the exact fraction num/den. Exported, because this is the figure the
// band is about and no screen or test should recompute it from percentages
function returnOf(k) {
  const pays = TABLES[k], w = WEIGHTS[k];
  let num = 0;
  for (let h = 0; h <= k; h++) num += w[h] * pays[h];
  return { num, den: WAYS[k] };
}

// A table is the whole game for its pick count, so a typo in one is that game being wrong. Checked
// once, when the module loads, the way forge.js checks its table.
//
// The band is asserted in whole numbers (100 * num against 96 * den and 97 * den) because a
// comparison against 0.96 is the one place a float could decide whether the casino is solvent
(function checkTables() {
  if (DRAWN >= POOL) throw new Error('keno: the draw cannot be the whole board');
  for (const k of PICKS) {
    const pays = TABLES[k], w = WEIGHTS[k];
    if (pays.length !== k + 1) throw new Error('keno: the ' + k + '-spot needs a row per catch');
    let sum = 0, prev = -1, paid = 0;
    for (let h = 0; h <= k; h++) {
      if (!Number.isSafeInteger(pays[h]) || pays[h] < 0) throw new Error('keno: the ' + k + '-spot pays something that is not a whole number of bets at ' + h);
      // a row that pays no more than a smaller catch would be a table where catching another
      // number can be worse than not catching it
      if (pays[h] > 0) {
        if (pays[h] <= prev) throw new Error('keno: the ' + k + '-spot does not climb at ' + h);
        prev = pays[h];
        paid += 1;
      } else if (prev >= 0) {
        throw new Error('keno: the ' + k + '-spot stops paying at ' + h + ' and starts again');
      }
      sum += w[h];
    }
    if (!paid) throw new Error('keno: the ' + k + '-spot pays nothing at all');
    if (sum !== WAYS[k]) throw new Error('keno: the ' + k + '-spot weights sum to ' + sum + ', not ' + WAYS[k]);
    const r = returnOf(k);
    if (100 * r.num < 96 * r.den) throw new Error('keno: the ' + k + '-spot returns under 96%');
    if (100 * r.num > 97 * r.den) throw new Error('keno: the ' + k + '-spot returns over 97%');
  }
})();

// The biggest multiplier on any board. The bet cap is read off it, so a retune that adds a bigger
// prize tightens the cap by itself
const TOP = (function () {
  let top = 0;
  for (const k of PICKS) for (const m of TABLES[k]) if (m > top) top = m;
  return top;
})();

// --- the draw -----------------------------------------------------------------------------------

// The board, 1..POOL, unshuffled
const BOARD = Object.freeze((function () {
  const out = [];
  for (let n = 1; n <= POOL; n++) out.push(n);
  return out;
})());

// The DRAWN numbers a seed draws, in the order they come out. Exported so a test can search for the
// seed that draws a chosen set, the way the card tests search a seed for a deal. It is a SHUFFLE of
// the board and not a stream of rolls, which is the rule cards.js states: one seed is a shuffle's
// or a roll's, never both
function drawOf(seed) {
  return C.shuffle(BOARD, seed).slice(0, DRAWN);
}

// --- state --------------------------------------------------------------------------------------

function live(st) {
  return !!st && st.phase === 'draw';
}

// The picks ARE the move, so their shape is a rule of the game rather than a detail of the
// message: a count the game offers, whole numbers on the board, and no number twice. A repeated
// number would be a ticket that is shorter than it says it is, and it would be paid as if it were
// not. Exported so the host can refuse a malformed draw with the same words the engine would use
function badPicks(picks) {
  if (!Array.isArray(picks)) return 'mark ' + MIN_PICK + ' to ' + MAX_PICK + ' numbers';
  if (PICKS.indexOf(picks.length) < 0) return 'mark ' + MIN_PICK + ' to ' + MAX_PICK + ' numbers';
  const seen = new Set();
  for (const n of picks) {
    if (!Number.isSafeInteger(n) || n < 1 || n > POOL) return 'the board is 1 to ' + POOL;
    if (seen.has(n)) return 'the same number cannot be marked twice';
    seen.add(n);
  }
  return null;
}

// seed: any string (a fresh one per round). id: the round's public name, which must not be the seed
// (null if not given)
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (one integer product, nothing rounded) only holds while the top row's
  // payout is still a safe integer. The host caps a bet at the balance long before this, so this is
  // the promise made structural rather than a case anyone meets
  if (bet > Number.MAX_SAFE_INTEGER / TOP) throw new RangeError('bet is too large to pay the top row exactly');
  return {
    id: opts.id == null ? null : String(opts.id),
    seed: String(opts.seed == null ? '' : opts.seed),
    phase: 'draw', bet,
    picks: null, drawn: null, matched: null, hit: null, mult: null, pay: null, net: null
  };
}

// What this round has riding on it: the bet, from the deal to the draw
function stake(st) {
  return st.bet;
}

// Why `op` cannot be played now, or null.
// budget is not read: a round stakes only its bet, and the host cleared that at the deal, so
// nothing inside a round can cost more credits. The parameter is taken so every game's engine
// answers the same question with the same signature
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : op;
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!live(st)) return 'the round is over';
  return badPicks(op && op.picks);
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = Object.assign({}, st);
  const picks = op.picks.slice();
  const drawn = drawOf(next.seed);
  const out = new Set(drawn);
  // matched is in the order the numbers were MARKED, not drawn: it is what the screen lights up on
  // the ticket, and the ticket is the player's own ordering
  const matched = picks.filter((n) => out.has(n));
  next.picks = picks;
  next.drawn = drawn;
  next.matched = matched;
  next.hit = matched.length;
  next.mult = TABLES[picks.length][next.hit];
  next.pay = next.bet * next.mult;
  next.net = next.pay - next.bet;
  next.phase = 'done';
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

// One pick count's table, in the shape the screen prints it in: a row per catch, the chance handed
// over as num/den rather than a percentage so the screen never divides. A rounded percentage
// printed next to an exact table is a table nobody trusts.
//
// Every row is here, the unpaid ones included, because the unpaid rows are the game: a 10-spot
// board that printed only its five paid rows would be hiding that four fifths of the draws land
// under them
function tableView(k) {
  const pays = TABLES[k], w = WEIGHTS[k];
  const rows = [];
  for (let h = 0; h <= k; h++) {
    rows.push(Object.freeze({ hit: h, mult: pays[h], chance: Object.freeze({ num: w[h], den: WAYS[k] }) }));
  }
  let from = null, pAny = 0;
  for (let h = 0; h <= k; h++) if (pays[h] > 0) { if (from === null) from = h; pAny += w[h]; }
  return Object.freeze({
    picks: k,
    rows: Object.freeze(rows),
    from,                                                       // the lowest catch this board pays
    top: pays[k],
    paying: Object.freeze({ num: pAny, den: WAYS[k] }),          // how often this board pays at all
    rtp: Object.freeze(returnOf(k))                             // the house's side, exact
  });
}

// Every table, built once. They never change, so the screen may hold on to them, and it needs them
// all: the row set it highlights follows how many numbers are marked, and the marks are the
// webview's own until the draw carries them over
const TABLE_VIEWS = Object.freeze(PICKS.map(tableView));
const BY_PICKS = Object.freeze(TABLE_VIEWS.reduce((m, t) => { m[t.picks] = t; return m; }, {}));

function idleView() {
  return {
    phase: 'bet', id: null, bet: null,
    pool: POOL, drawn: null, draws: DRAWN, picks: [], counts: PICKS,
    tables: TABLE_VIEWS, table: null,
    matched: [], hit: null, row: null, mult: null, pay: null, net: null,
    can: { draw: false }
  };
}

// The seed, and with it the draw, appear only at 'done'. While the round is live there is nothing
// else to hold back: the board, every table and every chance on them are public, which is the whole
// idea of a posted keno board.
//
// `mult` is read BACK OUT of the payout rather than copied from the table. The two cannot differ
// while a payout is one integer product, which is exactly why it is written this way: a screen that
// prints a multiplier the payout does not support is the bug this closes
function view(st, budget) {
  if (!st) return idleView();
  const done = st.phase === 'done';
  const table = done ? BY_PICKS[st.picks.length] : null;
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    pool: POOL,
    draws: DRAWN,
    counts: PICKS,
    tables: TABLE_VIEWS,
    // the ticket and the draw, both of which exist only once the draw has happened: the picks ride
    // in with the move, so there is nothing to show before it
    picks: done ? st.picks.slice() : [],
    drawn: done ? st.drawn.slice() : null,
    matched: done ? st.matched.slice() : [],
    hit: st.hit,
    table,
    row: table ? table.rows[st.hit] : null,
    mult: done ? st.pay / st.bet : null,
    pay: st.pay,
    net: st.net,
    can: { draw: live(st) }
  };
  if (done) v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  drawOf, badPicks, returnOf, tableView, choose,
  TABLES, TABLE_VIEWS, BY_PICKS, WEIGHTS, WAYS, BOARD,
  PICKS, MIN_PICK, MAX_PICK, POOL, DRAWN, TOP, OPS, MIN_BET
};
