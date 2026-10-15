// The crab's forge: one sword, enhanced a level at a time. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - the shop hands out a +0 sword for nothing. There is always exactly one sword
//  - an attempt costs the credits in TABLE[level].cost and rolls one of four outcomes: the sword
//    goes up a level, stays where it is, drops a level, or breaks
//  - the higher the sword, the thinner the chance. +0 goes up 95 times in 100, +9 ten times
//  - a break is possible from +RISK_FROM upward, nowhere below it. Below that a failure is either
//    a stay or a drop, and which of the two is per level (see TABLE: +0..+2 only ever stay, so the
//    opening levels cost nothing but the fee)
//  - a break takes the sword away and the shop hands over a fresh +0. What was spent does not come back
//  - the sword can be sold at any level above +0, for TABLE[level].sell, and the shop hands over a
//    fresh +0. The price is in every view, so it is read before the button is pressed, not after
//  - +MAX_LEVEL is the top. There is no attempt from there, only the sale
//
// Money: an attempt IS the settlement. The fee leaves at once whatever it rolls, and a sale arrives
// at once, so unlike the card games there is no stake sitting on the table between two messages and
// nothing for a reload to void. `net` is what the balance moved by for the move just made: minus the
// fee for an attempt, plus the price for a sale. Every figure in TABLE is a whole number of credits
// and nothing is multiplied, so no float touches the money path.
//
// A sale's money is carried IN the sword, as `earned`, and that is not a detail of the save format
// but the only way the sum can be right. The sword is one thing two windows share, and of two
// windows moving it at the same move count one copy is dropped (credits.js). A fee can sit in a
// grow-only counter per window, because a window that paid for an attempt paid for it whichever
// sword the merge keeps. A payout cannot: counted that way, two windows selling one sword are paid
// for it twice, and a sale whose sword comes back is paid for a sword the player still has. Carried
// in the record, the payout lives and dies with the move that earned it.
//
// The house's cut: every price in TABLE is set so that "push to +T, then sell" returns 95-98% of
// what it stakes, the band blackjack, high-low and poker sit in. That is a property of the whole
// table rather than of one row, because a break restarts the climb: the price of a +T sword is
// about 96.5% of the credits it takes to reach +T from +0, breaks and drops included.
// test/forge.test.js solves that expectation for every level, prints the table it measures, and
// does the same over all 512 ways of choosing where to sell, so retuning any row shows up there.
//
// Determinism: an attempt is one seed and one roll. The seed is made fresh by the host for each
// attempt and never stored, so there is no stream position to persist and nothing in a saved sword
// says what the next attempt will do. The same seed on the same sword always rolls the same thing.
//
// State is the sword, and it OUTLIVES the window: `save()` makes the record the host stores next to
// the credit ledger and `load()` reads one back. The three card games keep a round in memory and a
// reload voids it; a sword is the player's property, so it has to survive one. What does not survive
// is `last` and `net`, the chip that says what just happened: those belong to the move, like a round.
//
// The op contract the screen is written against, one message per move:
//   act(st, { op: 'enhance', seed })   the host's seed, not the screen's
//   act(st, { op: 'sell' })
// `act()` never mutates its input and returns the very same object when the move is not allowed;
// `whyNot()` says why. `view()` makes what the webview may see, TABLE included, so the screen holds
// no price and no percentage of its own.

const C = require('./cards');

const OPS = ['enhance', 'sell'];

// The top of the ladder, and the level a break becomes possible from
const MAX_LEVEL = 10;
const RISK_FROM = 5;

// Odds are whole percents, so one roll is an integer 0..99 read against the row. A finer
// denominator would buy nothing: the thinnest chance on the table is 10 in 100
const DEN = 100;

// The whole game in one table, one row per level: what an attempt FROM this level costs and rolls,
// and what a sword AT this level fetches in the shop.
//
// The four odds are the four things an attempt can do and sum to DEN. `break` is 0 below RISK_FROM
// and `down` is 0 at +0 (there is nothing below it), and both are checked below rather than trusted.
//
// Where the numbers come from:
//  - the chance falls 95, 90, 85, 75, 60, 50, 40, 30, 20, 10. The first three are near-certain and
//    cost nothing but the fee, which is the part of the game that teaches it
//  - the fee rises about 1.6x a level, 100 at +0 to 6,500 at +9: late attempts hurt by themselves,
//    before the sword is even at risk
//  - the price is then solved, not picked: 96.5% of the expected credits it takes to reach that
//    level from +0 (see the header). That is why they are not round numbers
//  - and it is what makes the top a jackpot without breaking the band. A +10 fetches 8.4x a +9 and
//    240x the fee of the attempt that gets there, so a player sitting on +9 is looking at 65,000
//    credits' worth of attempts against a 1,560,000 prize. The reason that is not free money is the
//    1 in 4 break: measured over the whole climb, pushing to +10 returns 96.22%
const TABLE = [
  { level: 0, cost: 100, sell: 0, up: 95, keep: 5, down: 0, break: 0 },
  { level: 1, cost: 160, sell: 102, up: 90, keep: 10, down: 0, break: 0 },
  { level: 2, cost: 250, sell: 273, up: 85, keep: 15, down: 0, break: 0 },
  { level: 3, cost: 400, sell: 560, up: 75, keep: 10, down: 15, break: 0 },
  { level: 4, cost: 650, sell: 1130, up: 60, keep: 10, down: 30, break: 0 },
  { level: 5, cost: 1000, sell: 2460, up: 50, keep: 5, down: 40, break: 5 },
  { level: 6, cost: 1600, sell: 5700, up: 40, keep: 5, down: 47, break: 8 },
  { level: 7, cost: 2500, sell: 14500, up: 30, keep: 5, down: 53, break: 12 },
  { level: 8, cost: 4000, sell: 44000, up: 20, keep: 5, down: 58, break: 17 },
  { level: 9, cost: 6500, sell: 186000, up: 10, keep: 5, down: 60, break: 25 },
  // the top: no attempt, no odds, only a price
  { level: 10, cost: null, sell: 1560000, up: 0, keep: 0, down: 0, break: 0 }
].map((r) => Object.freeze(r));
Object.freeze(TABLE);

// The table is the whole game, so a typo in it is the whole game being wrong. Checked once, when
// the module loads, the way credits.js checks that every counted token field has a weight
(function checkTable() {
  if (TABLE.length !== MAX_LEVEL + 1) throw new Error('forge: the table needs a row per level');
  for (const r of TABLE) {
    if (r.level === MAX_LEVEL) {
      if (r.cost !== null) throw new Error('forge: +' + MAX_LEVEL + ' cannot be forged further');
    } else {
      if (!Number.isSafeInteger(r.cost) || r.cost < 1) throw new Error('forge: bad fee at +' + r.level);
      if (r.up + r.keep + r.down + r.break !== DEN) throw new Error('forge: the odds at +' + r.level + ' do not sum to ' + DEN);
      if (r.up < 1) throw new Error('forge: +' + r.level + ' can never go up');
      if (r.level === 0 && r.down !== 0) throw new Error('forge: nothing is below +0');
      if ((r.level >= RISK_FROM) !== (r.break > 0)) throw new Error('forge: the break risk starts at +' + RISK_FROM);
    }
    if (!Number.isSafeInteger(r.sell) || r.sell < 0) throw new Error('forge: bad price at +' + r.level);
    // a price that is not climbing would make a drop a profit
    if (r.level > 0 && r.sell <= TABLE[r.level - 1].sell) throw new Error('forge: the price does not climb at +' + r.level);
  }
  // a +0 sword is given away, so it must fetch nothing: a price on it would be a credit printer
  if (TABLE[0].sell !== 0) throw new Error('forge: a +0 sword must fetch nothing');
})();

// --- the roll ---------------------------------------------------------------------------

// What one seed rolls: an integer 0..DEN-1. Exported so a test can search for the seed that forces
// an outcome, the way the card tests search for a deal. It tells nobody anything on its own: the
// host makes a fresh seed per attempt and never hands it over (see view)
function rollOf(seed) {
  return Math.floor(C.rollsFrom(seed)() * DEN);
}

// Which outcome a roll means at a level. The four bands are laid out in the table's own order, so
// the sum check above is also what makes this total: `break` is whatever is left over
function outcomeAt(level, roll) {
  const r = TABLE[level];
  // the top has no odds at all, so there is no outcome to name: asking is a mistake, not a break
  if (!r || r.cost == null) throw new RangeError('+' + level + ' takes no attempts');
  if (roll < r.up) return 'up';
  if (roll < r.up + r.keep) return 'keep';
  if (roll < r.up + r.keep + r.down) return 'down';
  return 'break';
}

// Where an outcome leaves the sword
function levelAfter(level, outcome) {
  if (outcome === 'up') return level + 1;
  if (outcome === 'down') return level - 1;
  if (outcome === 'break') return 0;
  return level;
}

// --- state -----------------------------------------------------------------------------
//
// The sword:
//   level   0..MAX_LEVEL
//   moves   accepted moves, attempts and sales alike. The host's merge clock: it only ever grows,
//           so of two windows' copies the one with more moves is the later one. It counts sales too
//           because `tries` alone would tie a sale against the attempt before it, and a tie between
//           two different swords has no answer (see credits.js forgeNewer)
//   tries   attempts over this save's whole life, a figure for the screen. Also only grows
//   spent   credits poured into THIS sword. Cleared when the sword goes, by a break or a sale
//   best    the highest level this save has ever seen. Only grows
//   earned  credits the shop has paid this save for swords sold. The balance is built from it
//           (credits.js), so it is the one figure here that IS money, and it travels with the
//           record rather than being maxed: see the money note at the top of the file
//   last    what the move just made did, or null. Not saved: a reload keeps the sword, not the chip
//   net     what the balance moved by for that move, or null. Not saved, for the same reason

function freshSword(by) {
  return { level: 0, moves: 0, tries: 0, spent: 0, best: 0, earned: 0, last: null, net: null, by: by == null ? '' : String(by) };
}

function newSword(opts) {
  return freshSword(opts && opts.by);
}

function clone(st) {
  return Object.assign({}, st, { last: st.last ? Object.assign({}, st.last) : null });
}

function costAt(level) {
  return TABLE[level].cost;
}

function priceAt(level) {
  return TABLE[level].sell;
}

// Why `name` cannot be done now, as far as the sword and the purse are concerned: the reasons that
// do not depend on what the message carries. view()'s `can` is this and nothing else, so a button
// the screen greys out and a move the host refuses always agree.
// budget is the credits this game may stake. Left out it means no limit, which is how act() runs:
// the money rule belongs to the host, which checked it against the live balance before calling in
// (blackjack's double does the same)
function unavailable(st, name, budget) {
  if (!st) return 'there is no sword';
  if (name === 'sell') {
    return st.level > 0 ? null : 'a +0 sword is the one the shop gives away';
  }
  if (st.level >= MAX_LEVEL) return 'the sword is already +' + MAX_LEVEL;
  const room = budget == null ? Infinity : budget;
  // written as !(a <= b) so a NaN budget (a broken ledger) refuses instead of slipping through
  if (!(costAt(st.level) <= room)) return 'not enough credits';
  return null;
}

// The seed is part of the attempt, so its shape is a rule of the game rather than a detail of the
// message: one attempt, one seed, one roll. A missing or empty seed would roll the same thing every
// time, and a number or an object would be stringified by whatever got to it first
function badSeed(seed) {
  return (typeof seed === 'string' && seed.length > 0) ? null : 'a forge attempt needs a seed';
}

// Why `op` cannot be played now, or null. Takes the message form ({ op, seed }) or a bare name
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : op;
  if (!OPS.includes(name)) return 'unknown action';
  const no = unavailable(st, name, budget);
  if (no) return no;
  if (name === 'enhance') return badSeed(op && op.seed);
  return null;
}

// One attempt: the fee goes whatever happens, and the roll says where the sword lands.
// `spent` is cleared with the sword itself, so what it shows is always this sword's own bill
function enhance(st, seed) {
  const from = st.level;
  const cost = costAt(from);
  const outcome = outcomeAt(from, rollOf(seed));
  st.level = levelAfter(from, outcome);
  st.moves += 1;
  st.tries += 1;
  st.spent = outcome === 'break' ? 0 : st.spent + cost;
  if (st.level > st.best) st.best = st.level;
  st.net = -cost;
  st.last = { op: 'enhance', outcome, from, to: st.level, cost, paid: 0 };
}

// The sale: the price is the one the view has been showing all along, and the shop's replacement
// starts at +0 with a clean bill
function sell(st) {
  const from = st.level;
  const paid = priceAt(from);
  st.level = 0;
  st.moves += 1;
  st.spent = 0;
  // the money the shop hands over goes in the sword's own record, which is where the balance reads
  // it from: a sale that is dropped by the merge takes its payout with it
  st.earned += paid;
  st.net = paid;
  st.last = { op: 'sell', outcome: 'sold', from, to: 0, cost: 0, paid };
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  if (op.op === 'sell') sell(next);
  else enhance(next, op.seed);
  return next;
}

// --- saving ----------------------------------------------------------------------------

// The record the host stores. `last` and `net` are left out on purpose (see the state notes), and
// `by` is filled in by the host with the window's own id: the merge needs to know which window
// wrote a record to settle a tie, and this module has no business inventing one
function save(st) {
  return { level: st.level, moves: st.moves, tries: st.tries, spent: st.spent, best: st.best, earned: st.earned, by: st.by };
}

// A record back into a sword. The record has been through credits.js, which fixes its shape at the
// storage boundary, so the only thing left to do here is the rule credits.js cannot know: a level
// above the top (a save from a version with a longer ladder) is pulled back to the top.
// A missing record is a player who has never forged: the shop's free +0
function load(rec) {
  if (!rec || typeof rec !== 'object') return freshSword('');
  const st = freshSword(rec.by);
  const level = Number.isSafeInteger(rec.level) && rec.level > 0 ? Math.min(rec.level, MAX_LEVEL) : 0;
  st.level = level;
  for (const k of ['moves', 'tries', 'spent', 'earned']) {
    st[k] = Number.isSafeInteger(rec[k]) && rec[k] > 0 ? rec[k] : 0;
  }
  st.best = Number.isSafeInteger(rec.best) && rec.best > 0 ? Math.min(rec.best, MAX_LEVEL) : 0;
  if (st.best < level) st.best = level;
  return st;
}

// --- what the webview sees ----------------------------------------------------------------------

// `table` is the ladder, not a payout: the screen prints these rows and holds no price and no
// percentage of its own, so the game can be retuned here and the screen follows. `odds` and `cost`
// are that same table read at the level the sword is at now, which is the one row the screen has to
// show big. Both are null at the top, where there is no attempt left to price
function idleView() {
  // The shop's free +0 sword with an empty purse: the odds and the fee of a first attempt are on
  // it, and nothing can be pressed. This is only what the screen gets before the host has read the
  // saved sword, since a forge always has a sword where a card game has no round
  return view(freshSword(''), 0);
}

// There is nothing face down in this game and nothing to leak through a derived number: the odds
// are the table, the table is public, and the seed of the next attempt does not exist yet (the host
// makes one per message). So a view before an attempt is the same whatever that attempt will roll,
// which is what test/forge.test.js checks rather than taking it on trust.
// `last` is the move just made, so the screen can say what happened without keeping its own log,
// and `net` is what the balance moved by
function view(st, budget) {
  if (!st) return idleView();
  const row = TABLE[st.level];
  return {
    level: st.level,
    max: MAX_LEVEL,
    riskFrom: RISK_FROM,
    den: DEN,
    odds: st.level < MAX_LEVEL ? { up: row.up, keep: row.keep, down: row.down, break: row.break } : null,
    cost: row.cost,
    sell: row.sell,
    best: st.best,
    tries: st.tries,
    spent: st.spent,
    earned: st.earned,
    table: TABLE,
    can: {
      enhance: !unavailable(st, 'enhance', budget),
      sell: !unavailable(st, 'sell', budget)
    },
    last: st.last,
    net: st.net
  };
}

module.exports = {
  newSword, act, whyNot, view, idleView, save, load,
  rollOf, outcomeAt, levelAfter, costAt, priceAt,
  TABLE, OPS, MAX_LEVEL, RISK_FROM, DEN
};
