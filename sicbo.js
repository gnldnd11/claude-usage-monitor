// The crab's sic bo: three dice, one bet, one roll. Pure: knows nothing about vscode or credits.
// The one require is ./cards, for the shared seeded source.
//
// Rules (fixed, kept simple):
//  - three dice come up: FACES = 216 outcomes, every one of them as likely as every other
//  - the player has put the bet on exactly one of four things, chosen before the roll:
//      SMALL    the three add up to 4 through 10
//      BIG      the three add up to 11 through 17
//      TOTAL    a total the player names, 4 through 17
//      TRIPLE   all three dice alike, any face
//    SMALL and BIG both lose to a triple, which is the traditional rule and the reason those two
//    are not simply a coin toss
//  - that is the whole game. The roll settles on the press
//
// WHY FOUR BETS. Sic bo as a casino prints it has a felt with thirty-odd squares on it: single
// numbers paying 1, 2 or 3 to 1 depending on how many dice show the face, pairs, two-dice
// combinations, specific triples, odd and even. A panel in a sidebar is narrower than a felt, and a
// list of thirty squares in that width is a list nobody reads, so what is here is one bet of each
// SHAPE a player can judge without a rule book:
//  - a near coin toss that pays about even (small, big)
//  - a dial between the two, where the player picks how thin a slice to aim at (total)
//  - a long shot (any triple)
// What is left out, and why: single-number bets pay three different amounts for one bet, which
// needs its own row of rules; a SPECIFIC triple is the long shot with a face bolted on, 1 in 216
// instead of 1 in 36, and reads as the same bet with worse odds; pairs, two-dice combinations and
// odd/even are all slices of the three above. None of them is a shape this list does not already
// have.
//
// WHERE THE PAYOUTS COME FROM. Every row is priced by one rule and none of them is hand tuned:
//    mult100 = floor(BAND_HI * FACES / ways)        the top of the band, split over how often it
//                                                   comes up, rounded the house's way
// so a row that comes up on `ways` of the 216 returns ways * mult100 / 21600, which lands at the
// top of the 96-97% band or just under it for every row in the table. The traditional payouts do
// NOT: small and big at even money return 97.22%, over the band, and the traditional 150 to 1 on a
// specific triple or 60 to 1 on a total of 4 return 70% and 85%, far under it. The brief for this
// casino says the band comes before the traditional figure, and this is where the two disagree:
// small and big pay 1.99x here rather than 2.00x, and a total of 4 pays 69.84x rather than 61x.
//
// Money: whole credits, one floor, always the house's way.
//    payout = floor(bet * mult100 / 100)      written as integer division, so no float rounds it
//
// MIN_BET IS 100, AND THAT IS ARITHMETIC RATHER THAN TASTE. The floor can cost at most one credit,
// and only on a win, so the most it takes off a row's return is (ways / FACES) / bet. Small is the
// widest row at 105 ways, so at a bet of 100 that is 0.49% against the 0.76% of room the row has
// under the band's ceiling, and at a bet of 10 it would be 4.9% and the row would return 92%. The
// check when this module loads prices exactly that, as integers, for every row.
//
// A roll settles inside newRound(), like a spin of the slots: the press IS the bet, there is no
// decision inside a roll, so OPS is empty and there is no live phase to keep a seed out of. The bet
// travels with the DEAL (games/README.md: `startArg` and `badStart`, with `badBet` below as the
// check the host calls first), not with a move, because it is chosen before the round exists.
//
// Determinism: the same seed always rolls the same three dice. The seed is a roll stream (cards.js
// rollsFrom), never a shuffle, and the round id is a separate value.

const C = require('./cards');

// The smallest bet the game takes. See the note above: this is a solved figure, not a preference
const MIN_BET = 100;

// No action exists inside a roll: the round is born settled
const OPS = [];

// The band every game in this casino returns inside, as whole percents
const BAND_LO = 96;
const BAND_HI = 97;

const DICE = 3;
const SIDES = 6;
const FACES = SIDES ** DICE;    // 216 rolls of three dice, each one as likely as the next

// The totals a player may name. 3 and 18 are left out because each is a triple and a triple is
// already its own bet: two names for one outcome is two rows that have to agree forever
const MIN_TOTAL = 4;
const MAX_TOTAL = 17;
const DEFAULT_TOTAL = 10;       // the fattest slice on the dial, and where it opens

const SMALL_LO = 4, SMALL_HI = 10;
const BIG_LO = 11, BIG_HI = 17;

const KINDS = Object.freeze(['small', 'big', 'triple', 'total']);

// --- counting -----------------------------------------------------------------------------------

// How many of the 216 rolls make each total, and how many of those are triples. Counted rather
// than typed: a table of fourteen numbers somebody wrote out by hand is a table with a typo in it
const WAYS = (function () {
  const byTotal = new Array(3 * SIDES + 1).fill(0);
  const tripleTotals = new Array(3 * SIDES + 1).fill(0);
  for (let a = 1; a <= SIDES; a++) {
    for (let b = 1; b <= SIDES; b++) {
      for (let c = 1; c <= SIDES; c++) {
        const t = a + b + c;
        byTotal[t] += 1;
        if (a === b && b === c) tripleTotals[t] += 1;
      }
    }
  }
  return { byTotal, tripleTotals };
})();

// The rolls a row wins on, as a count out of FACES
function waysOf(kind, total) {
  if (kind === 'triple') return SIDES;                // one triple per face
  if (kind === 'total') return WAYS.byTotal[total] || 0;
  const lo = kind === 'small' ? SMALL_LO : BIG_LO;
  const hi = kind === 'small' ? SMALL_HI : BIG_HI;
  let n = 0;
  for (let t = lo; t <= hi; t++) n += WAYS.byTotal[t] - WAYS.tripleTotals[t];
  return n;
}

// --- the table ----------------------------------------------------------------------------------

// The one pricing rule in this game: the top of the band split over how often the row comes up.
// Exported because the load check and the tests both have to price the table the same way, and a
// number typed into two places is a number that will disagree with itself
function multFor(ways) {
  const top = BAND_HI * FACES;
  return (top - (top % ways)) / ways;
}

// What a row pays on a bet, as a whole number of credits. Integer division, so the result is exact
// for every bet the engine takes
function payoutOf(bet, mult100) {
  const gross = bet * mult100;
  return (gross - (gross % 100)) / 100;
}

const NAMES = Object.freeze({
  small: 'Small ' + SMALL_LO + '-' + SMALL_HI,
  big: 'Big ' + BIG_LO + '-' + BIG_HI,
  triple: 'Any triple'
});

// The whole rulebook, a row at a time, in the order the screen prints it: the three one-press bets
// first, then the dial of totals. `chance` is num/den over every roll there is, so the screen never
// divides to decide anything, and `mult100` is the whole payout in hundredths of the bet rather
// than odds to one, because a payout that includes the stake is the figure the balance moves by
function rowOf(kind, total) {
  const ways = waysOf(kind, total);
  return Object.freeze({
    kind,
    total: kind === 'total' ? total : null,
    name: kind === 'total' ? 'Total ' + total : NAMES[kind],
    ways,
    chance: Object.freeze({ num: ways, den: FACES }),
    mult100: multFor(ways),
    note: kind === 'small' || kind === 'big' ? 'any triple loses' : null
  });
}

const PAYS = Object.freeze((function () {
  const rows = [rowOf('small'), rowOf('big'), rowOf('triple')];
  for (let t = MIN_TOTAL; t <= MAX_TOTAL; t++) rows.push(rowOf('total', t));
  return rows;
})());

const BY_TOTAL = Object.freeze(PAYS.reduce((m, r) => { if (r.kind === 'total') m[r.total] = r; return m; }, {}));
const FLAT = Object.freeze(PAYS.reduce((m, r) => { if (r.kind !== 'total') m[r.kind] = r; return m; }, {}));

// Why that bet is not one this game takes, or null. The host calls this on the deal, before
// anything is staked (games/README.md, "the deal's selection"), and newRound throws the same
// sentence for anyone who gets past it
function badBet(kind, total) {
  if (KINDS.indexOf(kind) < 0) return 'bet on small, big, a total or any triple';
  if (kind !== 'total') return null;
  if (!Number.isSafeInteger(total) || total < MIN_TOTAL || total > MAX_TOTAL) {
    return 'a total runs from ' + MIN_TOTAL + ' to ' + MAX_TOTAL;
  }
  return null;
}

// The row a bet is on, or null
function rowFor(kind, total) {
  if (badBet(kind, total)) return null;
  return kind === 'total' ? BY_TOTAL[total] : FLAT[kind];
}

// The table is one formula and a count, so what can be wrong with it is the count. Checked once,
// when the module loads, the way slots.js checks its rings
(function checkTable() {
  if (OPS.length) throw new Error('sicbo: a roll settles on the press, so OPS must stay empty');
  if (WAYS.byTotal.reduce((n, x) => n + x, 0) !== FACES) throw new Error('sicbo: the totals do not add up to ' + FACES);
  if (WAYS.tripleTotals.reduce((n, x) => n + x, 0) !== SIDES) throw new Error('sicbo: there are ' + SIDES + ' triples');
  // Small and big between them are every roll that is not a triple, which is what makes the pair of
  // them a complete choice rather than two slices with a gap between
  if (waysOf('small') + waysOf('big') + SIDES !== FACES) throw new Error('sicbo: small and big do not cover the roll');
  if (badBet('total', DEFAULT_TOTAL)) throw new Error('sicbo: the dial opens on a total it would refuse');
  for (const row of PAYS) {
    if (!Number.isSafeInteger(row.ways) || row.ways < 1) throw new Error('sicbo: bad count for ' + row.name);
    if (!Number.isSafeInteger(row.mult100) || row.mult100 < 1) throw new Error('sicbo: bad payout for ' + row.name);
    // A win has to be a win: the payout at the smallest bet the game takes has to beat that bet
    const pay = payoutOf(MIN_BET, row.mult100);
    if (!(pay > MIN_BET)) throw new Error('sicbo: a win on ' + row.name + ' pays ' + pay + ' on a bet of ' + MIN_BET);
    // The band, as integers, twice over.
    // Above: the row's exact return is ways * mult100 / (FACES * 100) and the floor only takes
    // from it, so this is the one end the table itself can break
    if (row.ways * row.mult100 > BAND_HI * FACES) {
      throw new Error('sicbo: ' + row.name + ' returns over the band');
    }
    // Below: the floor costs under one credit on a win, so the most it takes is
    // (ways / FACES) / bet, and at MIN_BET that has to leave the row inside the band. Multiplied
    // out by FACES * 100 * MIN_BET, which is what makes this a comparison of whole numbers
    if (row.ways * row.mult100 * MIN_BET - row.ways * 100 < BAND_LO * FACES * MIN_BET) {
      throw new Error('sicbo: a bet of ' + MIN_BET + ' cannot hold ' + row.name + ' inside the band');
    }
  }
})();

const TOP_MULT = PAYS.reduce((m, r) => Math.max(m, r.mult100), 0);

// --- the roll -----------------------------------------------------------------------------------

// The three dice. Exported so a test can walk every roll there is and so a test can search a seed
// for a triple. The host makes a fresh seed per round and never hands it over before the roll
function diceOf(seed) {
  const roll = C.rollsFrom(seed);
  const out = [];
  for (let i = 0; i < DICE; i++) out.push(1 + Math.floor(roll() * SIDES));
  return out;
}

// What three dice are, as the facts every row is judged against. Takes the dice rather than the
// seed, so the ranking can be run over all 216 rolls
function readOf(dice) {
  if (!Array.isArray(dice) || dice.length !== DICE) throw new RangeError('a roll is ' + DICE + ' dice');
  for (const d of dice) {
    if (!Number.isInteger(d) || d < 1 || d > SIDES) throw new RangeError('not a die face: ' + d);
  }
  const total = dice[0] + dice[1] + dice[2];
  const triple = dice[0] === dice[1] && dice[1] === dice[2] ? dice[0] : null;
  return { total, triple };
}

// Whether a row wins on a roll
function winsOn(read, kind, total) {
  if (kind === 'triple') return read.triple !== null;
  if (kind === 'total') return read.total === total;
  if (read.triple !== null) return false;     // a triple loses small and big both
  return kind === 'small'
    ? read.total >= SMALL_LO && read.total <= SMALL_HI
    : read.total >= BIG_LO && read.total <= BIG_HI;
}

// --- state --------------------------------------------------------------------------------------

// seed: any string (a fresh one per round). id: the round's public name, which must not be the seed
// (null if not given). kind: one of KINDS. total: 4..17, read only when kind is 'total'. dice: an
// explicit roll instead of the seeded one, for tests and replays
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (integer division, nothing rounded) only holds while bet * mult100 is
  // still a safe integer, and the richest row on the table is what that is read off
  if (bet > Number.MAX_SAFE_INTEGER / TOP_MULT) throw new RangeError('bet is too large to pay the top row exactly');
  const kind = opts.kind;
  const total = opts.total == null ? null : opts.total;
  const bad = badBet(kind, kind === 'total' ? total : null);
  if (bad) throw new RangeError(bad);
  const row = rowFor(kind, total);
  const seed = String(opts.seed == null ? '' : opts.seed);
  const dice = opts.dice ? opts.dice.slice() : diceOf(seed);
  const read = readOf(dice);
  const win = winsOn(read, kind, total);
  const payout = win ? payoutOf(bet, row.mult100) : 0;
  return {
    id: opts.id == null ? null : String(opts.id),
    seed,
    // a roll settles on the press, so a round is born done and there is no other phase to be in
    phase: 'done',
    bet,
    kind,
    total: row.total,
    dice,
    sum: read.total,
    triple: read.triple,
    win,
    payout,
    mult100: win ? row.mult100 : 0,
    net: payout - bet
  };
}

// What a live round has riding on it (games/tables.js). A roll settles on the press, so there is
// never a live round and the answer is always nothing
function stake(st) {
  return 0;
}

// Why `op` cannot be played now. There is no action inside a roll, so the answer is always the same
// one, and it is the answer the host needs: a webview asking for something this game does not have
// has to be told, or it waits out its no-reply timeout
function whyNot(st, op, budget) {
  return 'a roll settles on the press, so there is nothing to play';
}

function act(st, op) {
  return st;
}

// --- what the webview sees ----------------------------------------------------------------------

// `pays` is the felt, not a result: the screen prints these rows and holds no payout and no chance
// of its own. Handed over on the bet screen too, where the felt is the only thing to look at
function idleView() {
  return {
    phase: 'bet', id: null, bet: null, kind: null, total: null,
    dice: [], sum: null, triple: null, win: null, row: null,
    payout: null, mult100: null, net: null,
    pays: PAYS, faces: FACES, diceCount: DICE, sides: SIDES,
    kinds: KINDS, minTotal: MIN_TOTAL, maxTotal: MAX_TOTAL, defaultTotal: DEFAULT_TOTAL,
    minBet: MIN_BET, can: {}
  };
}

// Everything here is face up. A round exists only after it has settled, so there is nothing face
// down to leak and no live phase to keep the seed out of: the seed is handed over because the roll
// it names is already over and the next round rolls a fresh one of its own.
//
// The seed is still handed over under a phase test rather than unconditionally, which keeps the
// rule (games/README.md section 6) as the shape of the function rather than as a property of there
// being one phase
function view(st, budget) {
  if (!st) return idleView();
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    kind: st.kind,
    total: st.total,
    dice: st.dice.slice(),
    sum: st.sum,
    triple: st.triple,
    win: st.win,
    row: rowFor(st.kind, st.total),
    payout: st.payout,
    mult100: st.mult100,
    net: st.net,
    pays: PAYS,
    faces: FACES,
    diceCount: DICE,
    sides: SIDES,
    kinds: KINDS,
    minTotal: MIN_TOTAL,
    maxTotal: MAX_TOTAL,
    defaultTotal: DEFAULT_TOTAL,
    minBet: MIN_BET,
    can: {}
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  diceOf, readOf, winsOn, waysOf, multFor, payoutOf, badBet, rowFor, rowOf,
  PAYS, BY_TOTAL, FLAT, KINDS, OPS, MIN_BET, FACES, DICE, SIDES, TOP_MULT,
  MIN_TOTAL, MAX_TOTAL, DEFAULT_TOTAL, SMALL_LO, SMALL_HI, BIG_LO, BIG_HI, BAND_LO, BAND_HI
};
