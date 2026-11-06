// The crab's forge: one sword, enhanced a level at a time. Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - the shop hands out a +0 sword for nothing. There is always exactly one sword
//  - an attempt costs the credits in TABLE[level].cost and rolls one of four outcomes: the sword
//    goes up a level, stays where it is, drops a level, or breaks
//  - the higher the sword, the thinner the chance. +0 goes up 95 times in 100, +9 ten times
//  - an attempt that did NOT raise the level fills one of HEAT_MAX heat bars, and each bar adds
//    HEAT_STEP points to the next attempt's chance of going up (see oddsAt). Going up empties the
//    gauge; a break takes it with the sword. So a stay is no longer nothing happening
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
// Everything else the record carries is there for the same reason or the opposite one, and which is
// which is the whole of the merge (credits.js FORGE_FIELDS and FORGE_MAX_FIELDS):
//   heat, level, spent  belong to the sword in hand, so they are adopted WHOLE with the record and
//                       never maxed. Maxing `heat` would hand the kept sword the dropped sword's
//                       gauge, which is free odds; maxing `spent` would put a dead sword's bill on
//                       a live one
//   tries, best, broke  are lifetime figures for the screen, so they are maxed across both copies
//                       and a dropped record cannot take one backwards. `broke` counts swords
//                       destroyed, and it is maxed rather than added because two windows that
//                       break the same sword broke ONE sword
// `spent` is also the figure a break is counted in: it is the credits fed to the sword in hand, so
// there is no second field for that. What a break has to say ("23,400 fed, gone") cannot be read
// off it afterwards, because the sword is gone and `spent` goes with it, so the attempt puts the
// total in `last.fed` instead, where it belongs: that is the move speaking, not the sword.
// The house's cut: every price in TABLE is set so that "push to +T, then sell" returns at most
// 96.50% of what it stakes, and no play of any kind returns more. That is a property of the whole
// table rather than of one row, because a break restarts the climb: the price of a +T sword is
// floor(96.5% of the credits it takes to reach +T from +0), breaks, drops and heat included, which
// is why the prices are not round numbers. The ceiling measured over all 512 ways of choosing
// where to sell is 96.4983% (the push to the top), and the floor is +1's 95.00%, where the fee is
// 40 against an expected 42.1 and a whole number of credits cannot land closer.
// test/forge.test.js solves that expectation for every level, prints the table it measures, does
// the same over all 512 stopping rules, and then solves for the best HEAT-AWARE policy as well,
// because "sell at +9 only while the gauge is cold" is a rule no set of levels can express.
// Retuning any row shows up in all four.
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

// The heat gauge: how many bars it holds, what one bar is worth, and the ceiling a heated chance
// cannot pass. The ceiling is the same 95 as +0's own chance, so the opening levels are already at
// it and heat does nothing for them. That is the point: heat only means something where the chance
// is thin
const HEAT_MAX = 6;
const HEAT_STEP = 5;
const UP_CAP = 95;

// The whole game in one table, one row per level: what an attempt FROM this level costs and rolls,
// and what a sword AT this level fetches in the shop.
//
// The four odds are the four things an attempt can do and sum to DEN. `break` is 0 below RISK_FROM
// and `down` is 0 at +0 (there is nothing below it), and both are checked below rather than trusted.
//
// The four odds on a row are the COLD ones, the gauge empty. oddsAt() is what an attempt is really
// rolled against, and it is the cold row that is tuned here.
//
// Where the numbers come from, and the ruler they were cut to: this account earns about 300 credits
// a day, so a figure here is only readable next to that. The old table wanted 1,621,265 credits for
// a +10, which is 5,404 days. It was a three-level game with seven levels of scenery on top.
//  - the chance falls 95, 90, 85, 75, 60, 50, 40, 30, 20, 10. The first three are near-certain and
//    cost nothing but the fee, which is the part of the game that teaches it
//  - the fee rises about 1.28x a level, 40 at +0 to 368 at +9. A +9 attempt costs more than a whole
//    day's earnings on its own, which is what makes the press at the top a decision
//  - the price is then solved, not picked: floor(96.5% of the expected credits it takes to reach
//    that level from +0), heat included. That is why they are not round numbers
//  - what that buys, measured in test/forge.test.js: +5 costs 478 credits and 6.5 attempts (1.6
//    days), +7 1,427 and 13.5 (4.8 days), +9 6,273 and 42.1 (20.9 days), +10 20,525 and 121
//    attempts (68 days). The tension starts at +5, and +5 is now four days closer than it was
//  - the top is still the jackpot, in the only terms that are honest about a ladder this short: a
//    +10 fetches 3.27x a +9 and 54x the fee of the attempt that gets there, and the 7.2 attempts a
//    top cycle expects to spend sitting on +9 cost 2,647 of the 19,806 it pays
const TABLE = [
  { level: 0, cost: 40, sell: 0, up: 95, keep: 5, down: 0, break: 0 },
  { level: 1, cost: 51, sell: 40, up: 90, keep: 10, down: 0, break: 0 },
  { level: 2, cost: 65, sell: 95, up: 85, keep: 15, down: 0, break: 0 },
  { level: 3, cost: 84, sell: 168, up: 75, keep: 20, down: 5, break: 0 },
  { level: 4, cost: 107, sell: 278, up: 60, keep: 28, down: 12, break: 0 },
  { level: 5, cost: 137, sell: 461, up: 50, keep: 32, down: 15, break: 3 },
  { level: 6, cost: 175, sell: 779, up: 40, keep: 35, down: 20, break: 5 },
  { level: 7, cost: 225, sell: 1376, up: 30, keep: 38, down: 25, break: 7 },
  { level: 8, cost: 287, sell: 2658, up: 20, keep: 41, down: 30, break: 9 },
  { level: 9, cost: 368, sell: 6053, up: 10, keep: 44, down: 34, break: 12 },
  // the top: no attempt, no odds, only a price
  { level: 10, cost: null, sell: 19806, up: 0, keep: 0, down: 0, break: 0 }
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
      // a cold chance above the ceiling would make a heated one LOWER than it, which is a progress
      // bar that takes something away. The check is here because it is a property of the row
      if (r.up > UP_CAP) throw new Error('forge: +' + r.level + ' starts above the heat ceiling ' + UP_CAP);
      // and every bar of the gauge has to leave a row that still sums to DEN with a stay to spare
      for (let h = 0; h <= HEAT_MAX; h++) {
        const o = oddsAt(r.level, h);
        if (o.up + o.keep + o.down + o.break !== DEN) throw new Error('forge: +' + r.level + ' at heat ' + h + ' does not sum to ' + DEN);
        if (o.keep < 0 || o.down < 0) throw new Error('forge: heat ' + h + ' overruns the row at +' + r.level);
        if (o.break !== r.break) throw new Error('forge: heat ' + h + ' moved the break risk at +' + r.level);
        if (o.up < r.up) throw new Error('forge: heat ' + h + ' lowered the chance at +' + r.level);
      }
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

// How many bars of the gauge a figure off the wire is worth. Anything that is not a whole count
// inside the gauge reads as a cold sword, never as a hotter one
function heatOf(heat) {
  if (!Number.isSafeInteger(heat) || heat < 0) return 0;
  return Math.min(heat, HEAT_MAX);
}

// What an attempt from `level` with `heat` bars lit is really rolled against, in whole percents.
// Null at the top, where there is no attempt to price.
//
// The heat's points are taken out of `down` FIRST and out of `keep` only once `down` is empty, and
// they are NEVER taken out of `break`. Both halves of that are deliberate:
//  - the fear at the top is the whole game. A gauge that quietly lowered the break risk as it
//    filled would be a progress bar telling the player a lie, and +9 would stop being +9. A full
//    gauge still breaks 12 swords in 100
//  - taking it off `down` first is also the order it reads in: heat buys protection from falling
//    back before it buys protection from standing still, which is what a player watching the bar
//    grow expects of it
// Whole percents throughout, so the four still sum to DEN at every bar (checkTable counts it).
function oddsAt(level, heat) {
  const r = TABLE[level];
  if (!r || r.cost == null) return null;
  const up = Math.min(r.up + HEAT_STEP * heatOf(heat), UP_CAP);
  let gain = up - r.up;
  const down = Math.max(0, r.down - gain);
  gain -= r.down - down;
  return { up, keep: r.keep - gain, down, break: r.break };
}

// Which outcome a roll means at a level, with the gauge as it stands. The four bands are laid out
// in the table's own order and `break` is whatever is left over, so the break band is the top
// `break` percent of the range whatever the heat does to the other three: that is the arithmetic
// behind "heat never touches the break risk", not a second rule to keep in step with it
function outcomeAt(level, roll, heat) {
  const o = oddsAt(level, heat);
  // the top has no odds at all, so there is no outcome to name: asking is a mistake, not a break
  if (!o) throw new RangeError('+' + level + ' takes no attempts');
  if (roll < o.up) return 'up';
  if (roll < o.up + o.keep) return 'keep';
  if (roll < o.up + o.keep + o.down) return 'down';
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
//   spent   credits poured into THIS sword. Cleared when the sword goes, by a break or a sale.
//           This is the sword's bill, the figure a break is counted in (see the money note)
//   heat    bars of the gauge lit, 0..HEAT_MAX. Filled by an attempt that did not raise the level,
//           emptied by one that did, and gone with the sword on a break. Part of the sword in hand,
//           so it travels with the record and is never maxed across two windows
//   best    the highest level this save has ever seen. Only grows
//   broke   swords this save has had destroyed. Only grows, and it is the other half of `best`: a
//           record high with no count of what it cost says half of what happened
//   earned  credits the shop has paid this save for swords sold. The balance is built from it
//           (credits.js), so it is the one figure here that IS money, and it travels with the
//           record rather than being maxed: see the money note at the top of the file
//   last    what the move just made did, or null. Not saved: a reload keeps the sword, not the chip
//   net     what the balance moved by for that move, or null. Not saved, for the same reason

function freshSword(by) {
  return { level: 0, moves: 0, tries: 0, spent: 0, heat: 0, best: 0, broke: 0, earned: 0, last: null, net: null, by: by == null ? '' : String(by) };
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
// `spent` is cleared with the sword itself, so what it shows is always this sword's own bill.
//
// `last` carries three figures the move knows and the sword no longer will: the heat the attempt
// was rolled AT (not the gauge it leaves behind), the total fed to the sword including this fee, and
// the two prices the level moved between. All three are gone from the state a moment later, and the
// screen is not allowed to work any of them out for itself (games/README.md rule 1)
function enhance(st, seed) {
  const from = st.level;
  const cost = costAt(from);
  const heat = st.heat;
  const outcome = outcomeAt(from, rollOf(seed), heat);
  const fed = st.spent + cost;
  st.level = levelAfter(from, outcome);
  st.moves += 1;
  st.tries += 1;
  if (outcome === 'break') {
    st.spent = 0;
    st.heat = 0;       // the gauge was the sword's, and the sword is gone
    st.broke += 1;
  } else {
    st.spent = fed;
    // an attempt that raised the level spends the gauge; any other one fills it a bar further
    st.heat = outcome === 'up' ? 0 : Math.min(heat + 1, HEAT_MAX);
  }
  if (st.level > st.best) st.best = st.level;
  st.net = -cost;
  st.last = {
    op: 'enhance', outcome, from, to: st.level, cost, paid: 0,
    heat, fed, sellFrom: priceAt(from), sellTo: priceAt(st.level)
  };
}

// The sale: the price is the one the view has been showing all along, and the shop's replacement
// starts at +0 with a clean bill
function sell(st) {
  const from = st.level;
  const paid = priceAt(from);
  const fed = st.spent;
  const heat = st.heat;
  st.level = 0;
  st.moves += 1;
  st.spent = 0;
  st.heat = 0;   // a fresh sword comes with a cold gauge, however hot the one that was sold
  // the money the shop hands over goes in the sword's own record, which is where the balance reads
  // it from: a sale that is dropped by the merge takes its payout with it
  st.earned += paid;
  st.net = paid;
  st.last = { op: 'sell', outcome: 'sold', from, to: 0, cost: 0, paid, heat, fed, sellFrom: paid, sellTo: 0 };
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
  return {
    level: st.level, moves: st.moves, tries: st.tries, spent: st.spent, heat: st.heat,
    best: st.best, broke: st.broke, earned: st.earned, by: st.by
  };
}

// A record back into a sword. The record has been through credits.js, which fixes its shape at the
// storage boundary, so the only thing left to do here is the rules credits.js cannot know: a level
// above the top (a save from a version with a longer ladder) is pulled back to the top, and a gauge
// past the top of this one's is pulled back the same way.
// A missing record is a player who has never forged: the shop's free +0.
//
// Every field is read, none is required. 569 installs have a record in their globalState written
// before `heat` and `broke` existed, and a record without them is not broken: it is a player whose
// gauge is cold and who has broken nothing this version can count. Reading one must not throw and
// must not reset the sword, so the level in an old record is kept exactly as it stands
function load(rec) {
  if (!rec || typeof rec !== 'object') return freshSword('');
  const st = freshSword(rec.by);
  const level = Number.isSafeInteger(rec.level) && rec.level > 0 ? Math.min(rec.level, MAX_LEVEL) : 0;
  st.level = level;
  for (const k of ['moves', 'tries', 'spent', 'broke', 'earned']) {
    st[k] = Number.isSafeInteger(rec[k]) && rec[k] > 0 ? rec[k] : 0;
  }
  st.heat = heatOf(rec.heat);
  st.best = Number.isSafeInteger(rec.best) && rec.best > 0 ? Math.min(rec.best, MAX_LEVEL) : 0;
  if (st.best < level) st.best = level;
  return st;
}

// --- what the webview sees ----------------------------------------------------------------------

// `table` is the ladder, not a payout: the screen prints these rows and holds no price and no
// percentage of its own, so the game can be retuned here and the screen follows. `odds` and `cost`
// are that same table read at the level the sword is at now, which is the one row the screen has to
// show big. Both are null at the top, where there is no attempt left to price.
//
// `odds` is the HEATED row, which is what the next press is really rolled against, and `cold` is
// the same row with the gauge empty. `heatUp` is the difference in points. The screen shows all
// three and works out none of them: a gauge that did not move the number next to it would be the
// old "no change" wearing a bar
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
  const odds = oddsAt(st.level, st.heat);
  return {
    level: st.level,
    max: MAX_LEVEL,
    riskFrom: RISK_FROM,
    den: DEN,
    odds: odds,
    cold: odds ? { up: row.up, keep: row.keep, down: row.down, break: row.break } : null,
    heat: st.heat,
    heatMax: HEAT_MAX,
    heatStep: HEAT_STEP,
    heatUp: odds ? odds.up - row.up : 0,
    cost: row.cost,
    sell: row.sell,
    best: st.best,
    broke: st.broke,
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
  rollOf, outcomeAt, oddsAt, heatOf, levelAfter, costAt, priceAt,
  TABLE, OPS, MAX_LEVEL, RISK_FROM, DEN, HEAT_MAX, HEAT_STEP, UP_CAP
};
