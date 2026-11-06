// The crab's shut the box: nine tiles, two dice, and the tiles that add up to the roll come down.
// Pure: knows nothing about vscode or credits. The one require is ./cards, for the shared seeded
// source.
//
// Rules (fixed, kept simple):
//  - tiles 1 to 9 start open. The bet buys the first roll, which happens at the deal
//  - the player closes ANY set of open tiles that adds up to the roll exactly: a 9 can come down as
//    the 9, as 4 and 5, as 1, 3 and 5, and the choice between those is the whole game
//  - then the next roll comes. When a roll has no set that adds up to it, the round is over and
//    what is still open is what it pays on
//  - closing every tile is shutting the box, and that is the top row of the table
//
// What is left out and why. The traditional game has house rules by the dozen: roll ONE die when
// the open tiles total 6 or less, tiles 1 to 12, two players taking turns. One die as an option is
// a second decision on every turn and moves every number in the table below, and twelve tiles make
// shutting the box a 1 in 500 event rather than a 1 in 14 one. Nine tiles, two dice, every turn the
// same, and the endgame paid by the table instead of by a special rule.
//
// THE TABLE, AND WHERE IT COMES FROM.
//    shut the box (nothing open)      4.40x      comes up 7.11% of the time
//    4 or less still open             2.50x                13.84%
//    9 or less still open             1.20x                25.77%
//    anything more                    nothing               53.28%
// Something pays in 46.7% of rounds and no row carries the return: the jackpot is 32% of it, the
// middle row 36%, the bottom row 32%. That spread is deliberate. A table whose return is one
// jackpot is a table where nothing ever happens, and the "so close" of ending with the 2 and the 3
// still standing is the feeling this game has to pay for.
//
// WHY THE PLAYER'S CHOICE IS REAL, AND WHY THAT MAKES THIS A SOLVE RATHER THAN A SUM. A roll of 9
// taken as the 9 leaves eight tiles that can make anything; taken as 1, 3 and 5 it leaves a board
// that cannot make a 9 at all. So the return of this game is not a property of the table alone: it
// is the table played as well as it can be played. The whole thing is solved exactly when this
// module loads, by backward induction over all 512 ways the board can stand (see solveBoard): the
// best play returns 96.7966% and shuts the box 7.108% of the time. The band here is therefore a
// claim about the BEST play, the way red dog's is, and no play returns more than a value iteration
// does by construction.
//
// Money: whole credits, one floor, always the house's way.
//    payout = floor(bet * mult100 / 100)      written as integer division, so no float rounds it
//
// MIN_BET IS 100, AND THAT IS ARITHMETIC RATHER THAN TASTE. The floor can cost at most one credit,
// and only on a round that pays, which is 46.7% of them. So the best play returns at least
// 96.7966% - 0.467/bet, which is 96.33% at a bet of 100 and 95.0% at a bet of 13. The load check
// prices exactly that, as integers.
//
// A bet of 10 is the trap in that sentence rather than the proof of it: every multiplier in the
// table is a whole number of tenths, so a bet of 10 divides exactly, nothing is floored, and the
// table returns its full 96.7966%. The chips would therefore never show the problem. The engine
// takes any whole bet at or over its floor, and at a floor of 10 the bets between the chips (11,
// 13, 17) return as little as 94.97%, so the floor has to be a figure where EVERY bet inside it
// holds and not just the ones a chip can build.
//
// WHY THE WHOLE ROUND IS ROLLED AT THE DEAL. The dice are drawn from the seed when the round is
// dealt, the way the card games shuffle a shoe, and the round walks through them. A move closes at
// least one tile, so nine rolls is every roll a round can possibly ask for. That is what makes the
// round a value rather than a closure, and it is why the seed is a secret while the round is live:
// it is every roll the player has not seen yet. view() hands it over only at 'done'.
//
// Determinism: the same seed always rolls the same dice, whatever the player does with them. The
// seed is a roll stream (cards.js rollsFrom), never a shuffle, and the round id is a separate value.
//
// The op contract the screen is written against:
//   act(st, { op: 'close', tiles: [4, 5] })      the tiles, by their own numbers
// There is no other move: the next roll comes with the close, and a round that cannot move is over
// before the player is asked.

const C = require('./cards');

const OPS = ['close'];

// The smallest bet the game takes. See the note above: this is a solved figure, not a preference
const MIN_BET = 100;

// The band every game in this casino returns inside, as whole percents
const BAND_LO = 96;
const BAND_HI = 97;

const TILES = 9;
const DICE = 2;
const SIDES = 6;
const ALL = (1 << TILES) - 1;        // every tile open
const FULL = (TILES * (TILES + 1)) / 2;  // 45: what the whole board adds up to

// A move closes at least one tile, so a round is nine rolls at the very most
const MAX_ROLLS = TILES;

// How many of the 36 throws make each total
const WAYS = Object.freeze((function () {
  const w = new Array(2 * SIDES + 1).fill(0);
  for (let a = 1; a <= SIDES; a++) for (let b = 1; b <= SIDES; b++) w[a + b] += 1;
  return w;
})());
const THROWS = SIDES * SIDES;        // 36
const MIN_ROLL = DICE;               // 2
const MAX_ROLL = DICE * SIDES;       // 12

// --- the board, as a number ---------------------------------------------------------------------
//
// A board is a bit per tile: bit 0 is the 1, bit 8 is the 9, set means open. The engine's state
// carries the mask and view() hands over the tile numbers, so nothing outside this file has to know
// that.

const bitOf = (tile) => 1 << (tile - 1);

// What every board adds up to, once, as a lookup: the solve asks this of all 512 boards and of
// 19,683 subsets of them, and a loop over nine bits each time is the one thing in this file that
// would be worth noticing at load
const SUM = (function () {
  const sums = new Int16Array(ALL + 1);
  for (let mask = 1; mask <= ALL; mask++) {
    const low = mask & -mask;                       // the lowest open tile, as a bit
    sums[mask] = sums[mask ^ low] + (32 - Math.clz32(low));
  }
  return sums;
})();

function sumOfMask(mask) {
  return SUM[mask];
}

function tilesOfMask(mask) {
  const out = [];
  for (let i = 0; i < TILES; i++) if (mask & (1 << i)) out.push(i + 1);
  return out;
}

function maskOfTiles(tiles) {
  let m = 0;
  for (const t of tiles) m |= bitOf(t);
  return m;
}

// Every subset of a board, grouped by what it adds up to: out[total] is a list of the subsets of
// `mask` that make `total`. One question asked in one place, because the solve below and every move
// the game takes both ask it, and asking it twice in two ways is how the two answers start to
// differ. It is not cached: a board has at most 2^9 subsets and the solve walks 3^9 = 19,683 of
// them across all 512 boards, which is cheaper than keeping 5,632 arrays alive for the life of the
// window
function subsetsBySum(mask) {
  const out = new Array(MAX_ROLL + 1);
  for (let t = MIN_ROLL; t <= MAX_ROLL; t++) out[t] = [];
  for (let sub = mask; sub > 0; sub = (sub - 1) & mask) {
    const t = SUM[sub];
    if (t >= MIN_ROLL && t <= MAX_ROLL) out[t].push(sub);
  }
  return out;
}

// Whether anything on this board makes that roll. The round ends when the answer is no, so this is
// asked once per throw and stops at the first set it finds
function hasMove(mask, roll) {
  if (roll < MIN_ROLL || roll > MAX_ROLL) return false;
  for (let sub = mask; sub > 0; sub = (sub - 1) & mask) if (SUM[sub] === roll) return true;
  return false;
}

// The sets of tiles that can be closed on this roll, as tile numbers, shortest set first so the
// screen lists the single tile before the pair. Exported: this is the host's ruling on what is
// playable, and the panel offers exactly these
function movesFor(mask, roll) {
  if (roll < MIN_ROLL || roll > MAX_ROLL) return [];
  const out = [];
  for (let sub = mask; sub > 0; sub = (sub - 1) & mask) if (SUM[sub] === roll) out.push(tilesOfMask(sub));
  return out.sort((a, b) => a.length - b.length || a[0] - b[0]);
}

// --- the table ----------------------------------------------------------------------------------

// What is left open, and what that pays, in hundredths of the bet. The rows are read in order and
// the first one that covers the remaining total wins, so they are written widest-paying first
const PAYS = Object.freeze([
  { lo: 0, hi: 0, name: 'Shut the box', mult100: 440 },
  { lo: 1, hi: 4, name: '4 or less left', mult100: 250 },
  { lo: 5, hi: 9, name: '9 or less left', mult100: 120 }
].map((r) => Object.freeze(r)));

// The row a remaining total falls in, or null when it pays nothing
function rowFor(rem) {
  for (const r of PAYS) if (rem >= r.lo && rem <= r.hi) return r;
  return null;
}

// What a row pays on a bet, as a whole number of credits. Integer division, so the result is exact
// for every bet the engine takes
function payoutOf(bet, mult100) {
  const gross = bet * mult100;
  return (gross - (gross % 100)) / 100;
}

function payFor(bet, rem) {
  const row = rowFor(rem);
  return row ? payoutOf(bet, row.mult100) : 0;
}

// --- solving the board --------------------------------------------------------------------------
//
// Exact, in integers, with no floats anywhere. Every value is a whole number over 36^MAX_ROLLS: a
// board is at most MAX_ROLLS moves from the end (each move closes a tile), so its value's
// denominator divides 36 to that power. A board that can still be rolled from has a tile open, so
// it is at most MAX_ROLLS - 1 moves in and the sum below is divisible by 36 at least once over,
// which is what makes the division exact rather than a rounding. Hence BigInt and not Number.
//
// Backward induction and not iteration: a move closes a tile, so the boards form a ladder and a
// board's value only ever depends on boards with fewer tiles open. Walking them in order of how
// much is open solves each exactly once.
const DEN = 36n ** BigInt(MAX_ROLLS);

// `pay100(rem)` is what a round ending with `rem` still open pays, in whatever unit the caller
// works in. Returns the value of the full board and the chance the best play ends on a paid row.
// Exported so the tests can solve the same board with FLOORED payouts, one bet at a time
function solveBoard(pay100) {
  const order = [];
  for (let mask = 0; mask <= ALL; mask++) order.push(mask);
  order.sort((a, b) => SUM[a] - SUM[b]);

  const value = new Array(ALL + 1);
  const pick = new Array(ALL + 1);     // mask -> roll -> the subset the best play closes, or -1
  for (const mask of order) {
    if (mask === 0) { value[0] = BigInt(pay100(0)) * DEN; continue; }
    const subs = subsetsBySum(mask);
    let acc = 0n;
    const chosen = new Array(MAX_ROLL + 1).fill(-1);
    for (let roll = MIN_ROLL; roll <= MAX_ROLL; roll++) {
      let best = null;
      if (!subs[roll].length) best = BigInt(pay100(SUM[mask])) * DEN;  // stuck: this is where it ends
      else {
        for (const sub of subs[roll]) {
          const v = value[mask & ~sub];
          if (best === null || v > best) { best = v; chosen[roll] = sub; }
        }
      }
      acc += BigInt(WAYS[roll]) * best;
    }
    value[mask] = acc / BigInt(THROWS);
    pick[mask] = chosen;
  }

  // and how often that play ends on a row that pays anything, over the same denominator
  const reach = new Array(ALL + 1).fill(0n);
  reach[ALL] = DEN;
  let paid = 0n;
  for (const mask of order.slice().reverse()) {
    if (reach[mask] === 0n) continue;
    if (mask === 0) { if (pay100(0) > 0) paid += reach[mask]; continue; }
    for (let roll = MIN_ROLL; roll <= MAX_ROLL; roll++) {
      const q = (reach[mask] * BigInt(WAYS[roll])) / BigInt(THROWS);
      const sub = pick[mask][roll];
      if (sub < 0) { if (pay100(sumOfMask(mask)) > 0) paid += q; }
      else reach[mask & ~sub] += q;
    }
  }
  return { value: value[ALL], paid, pick, den: DEN, boards: value };
}

// The two figures the band is checked against, solved from the table above
const SOLVED = (function () {
  const s = solveBoard((rem) => { const r = rowFor(rem); return r ? r.mult100 : 0; });
  return Object.freeze({ value: s.value, paid: s.paid, den: DEN });
})();

// The table is the whole game, so a typo in it is the whole game being wrong. Checked once, when
// the module loads, the way slots.js checks its rings
(function checkTable() {
  if (!Array.isArray(PAYS) || PAYS.length < 2) throw new Error('shutbox: a table needs rows');
  if (PAYS[0].lo !== 0 || PAYS[0].hi !== 0) throw new Error('shutbox: the top row is shutting the box');
  for (let i = 0; i < PAYS.length; i++) {
    const r = PAYS[i];
    if (!Number.isSafeInteger(r.mult100) || r.mult100 < 1) throw new Error('shutbox: bad payout for ' + r.name);
    if (r.lo > r.hi) throw new Error('shutbox: ' + r.name + ' covers nothing');
    // the rows have to run in one direction and meet: a gap or an overlap is a remaining total that
    // pays twice or falls through
    if (i > 0 && (r.lo !== PAYS[i - 1].hi + 1 || r.mult100 >= PAYS[i - 1].mult100)) {
      throw new Error('shutbox: the table does not climb at ' + r.name);
    }
    if (r.hi > FULL) throw new Error('shutbox: ' + r.name + ' covers more than the board');
    // A win has to be a win: the payout at the smallest bet the game takes has to beat that bet
    const pay = payoutOf(MIN_BET, r.mult100);
    if (!(pay > MIN_BET)) throw new Error('shutbox: ' + r.name + ' pays ' + pay + ' on a bet of ' + MIN_BET);
  }
  if (WAYS.reduce((n, x) => n + x, 0) !== THROWS) throw new Error('shutbox: the throws do not add up to ' + THROWS);
  // every roll two dice can make has to be makeable from the full board, or the round could end on
  // the first roll with nine tiles standing
  for (let roll = MIN_ROLL; roll <= MAX_ROLL; roll++) {
    if (!hasMove(ALL, roll)) throw new Error('shutbox: a full board cannot make ' + roll);
  }
  // The band, as integers, both ends. SOLVED.value is the best play's return in hundredths of the
  // bet over DEN, and no play returns more.
  //
  // Above: this is the end the table can break. One digit on the top row (4.40x to 4.50x) returns
  // 97.51%, which keeps the order of the table and loses the band
  if (SOLVED.value > BigInt(BAND_HI) * DEN) {
    throw new Error('shutbox: the best play returns over the band');
  }
  // Below: the floor costs under one credit on the rounds that pay, which is SOLVED.paid of them,
  // so the best play returns at least value - paid/bet. Multiplied out by 100 * DEN * MIN_BET
  if (SOLVED.value * BigInt(MIN_BET) - 100n * SOLVED.paid < BigInt(BAND_LO) * DEN * BigInt(MIN_BET)) {
    throw new Error('shutbox: a bet of ' + MIN_BET + ' cannot hold the best play inside the band');
  }
})();

const TOP_MULT = PAYS.reduce((m, r) => Math.max(m, r.mult100), 0);

// --- the roll -----------------------------------------------------------------------------------

// Every throw the round could need, drawn from the seed at the deal: MAX_ROLLS pairs of dice.
// Exported so a test can search a seed for a board, the way the card tests search one for a deal
function rollsOf(seed) {
  const roll = C.rollsFrom(seed);
  const out = [];
  for (let i = 0; i < MAX_ROLLS; i++) {
    const pair = [];
    for (let d = 0; d < DICE; d++) pair.push(1 + Math.floor(roll() * SIDES));
    out.push(pair);
  }
  return out;
}

// --- state --------------------------------------------------------------------------------------

function draw(st) {
  if (st.pos >= st.rolls.length) throw new RangeError('the round ran out of throws'); // a short stack
  const pair = st.rolls[st.pos];
  st.pos += 1;
  return pair;
}

// The throws are never mutated (only `pos` moves), so a copy shares them
function clone(st) {
  return Object.assign({}, st, { dice: st.dice.slice(), closed: st.closed.map((m) => m.slice()) });
}

function live(st) {
  return !!st && st.phase === 'play';
}

// Settling, and the only place money is named. `rem` is what is still open, which is what the table
// is read with
function settle(st, result) {
  const rem = sumOfMask(st.open);
  st.result = result;
  st.rem = rem;
  st.paid = payFor(st.bet, rem);
  st.net = st.paid - st.bet;
  st.phase = 'done';
}

// The next throw, and what it leaves the player. A board with nothing open has already shut and is
// never rolled for; a throw with no set that makes it ends the round where it stands
function nextRoll(st) {
  if (st.open === 0) { settle(st, 'shut'); return; }
  const pair = draw(st);
  st.dice = pair.slice();
  st.roll = pair[0] + pair[1];
  if (!hasMove(st.open, st.roll)) settle(st, 'stuck');
}

// seed: any string (a fresh one per round). id: the round's public name, which must not be the seed
// (null if not given). stack: explicit throws such as [[3, 4], [6, 6]] instead of the seeded ones,
// for tests and replays
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (integer division, nothing rounded) only holds while bet * mult100 is
  // still a safe integer, and the top row is what that is read off
  if (bet > Number.MAX_SAFE_INTEGER / TOP_MULT) throw new RangeError('bet is too large to pay the top row exactly');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const st = {
    id: opts.id == null ? null : String(opts.id), seed, phase: 'play', bet,
    rolls: opts.stack ? opts.stack.map((p) => p.slice()) : rollsOf(seed), pos: 0,
    open: ALL, closed: [], dice: [], roll: null,
    result: null, rem: null, paid: null, net: null
  };
  // the bet buys the first throw, and a full board can make every total two dice can
  nextRoll(st);
  return st;
}

// What this round has riding on it: the bet, from the deal until it settles
function stake(st) {
  return st.bet;
}

// Why `op` cannot be played now, or null. Every sentence here is one the player is shown, so each
// one says which tile or which total is the problem. budget is not read: nothing but the bet is
// ever staked, and the host cleared that before the deal
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : op;
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!live(st)) return 'the round is over';
  const tiles = op && typeof op === 'object' ? op.tiles : null;
  if (!Array.isArray(tiles) || !tiles.length) return 'pick the tiles that add up to ' + st.roll;
  let mask = 0, total = 0;
  for (const t of tiles) {
    if (!Number.isInteger(t) || t < 1 || t > TILES) return 'there is no tile ' + t;
    const bit = bitOf(t);
    if (mask & bit) return 'tile ' + t + ' twice';
    if (!(st.open & bit)) return 'tile ' + t + ' is already down';
    mask |= bit;
    total += t;
  }
  if (total !== st.roll) return 'those tiles add up to ' + total + ', not ' + st.roll;
  return null;
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  const tiles = op.tiles.slice().sort((a, b) => a - b);
  next.open &= ~maskOfTiles(tiles);
  next.closed.push(tiles);
  nextRoll(next);
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

// What the round is worth if it ends right here. Honest rather than a leak: the remaining total is
// on the screen already, and this is the host doing the arithmetic on it instead of the panel
function standingOf(bet, rem) {
  const row = rowFor(rem);
  const paid = row ? payoutOf(bet, row.mult100) : 0;
  return { rem, row, payout: paid, mult100: row ? row.mult100 : 0 };
}

function idleView() {
  return {
    phase: 'bet', id: null, bet: null,
    open: tilesOfMask(ALL), closed: [], dice: [], roll: null, moves: [],
    result: null, rem: null, standing: null, row: null, paid: null, net: null,
    pays: PAYS, tiles: TILES, diceCount: DICE, sides: SIDES, throws: THROWS,
    ways: WAYS, full: FULL, maxRolls: MAX_ROLLS, minBet: MIN_BET,
    can: { close: false }
  };
}

// The throws NOT yet rolled, `pos`, the open board as a mask and the seed stay inside the state.
// The seed is every throw the player has not seen, so it appears only at 'done', where the round it
// names is over and the next round draws its own.
//
// `moves` is the host's ruling on what can be closed on this throw, as tile numbers, so the panel
// offers exactly the sets the engine would accept and computes nothing. An empty `moves` on a live
// round cannot happen: a throw with no move ends the round before anyone is asked
function view(st, budget) {
  if (!st) return idleView();
  const done = st.phase === 'done';
  const rem = done ? st.rem : sumOfMask(st.open);
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    open: tilesOfMask(st.open),
    closed: st.closed.map((m) => m.slice()),
    dice: st.dice.slice(),
    roll: st.roll,
    moves: done ? [] : movesFor(st.open, st.roll),
    result: st.result,
    rem,
    standing: standingOf(st.bet, rem),
    row: done ? rowFor(st.rem) : null,
    paid: st.paid,
    net: st.net,
    pays: PAYS,
    tiles: TILES,
    diceCount: DICE,
    sides: SIDES,
    throws: THROWS,
    ways: WAYS,
    full: FULL,
    maxRolls: MAX_ROLLS,
    minBet: MIN_BET,
    can: { close: !whyNot(st, { op: 'close', tiles: (movesFor(st.open, st.roll)[0] || []) }, budget) }
  };
  if (done) v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  rollsOf, movesFor, hasMove, subsetsBySum, rowFor, payoutOf, payFor, standingOf, solveBoard,
  sumOfMask, tilesOfMask, maskOfTiles, bitOf,
  SOLVED, PAYS, OPS, MIN_BET, TILES, DICE, SIDES, ALL, FULL, THROWS, WAYS,
  MIN_ROLL, MAX_ROLL, MAX_ROLLS, TOP_MULT, DEN, BAND_LO, BAND_HI
};
