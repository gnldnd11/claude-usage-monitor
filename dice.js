// The crab's dice: one roll of 0.00 to 99.99 against a target the player names. Pure: knows
// nothing about vscode or credits. The one require is ./cards, for the shared seeded source.
//
// Rules (fixed, kept simple):
//  - the player names a TARGET, a whole percent from 1 to 96
//  - one roll comes up, a whole number of hundredths from 0.00 to 99.99: FACES = 10,000 outcomes
//  - the roll is UNDER the target or it is not. Under pays, at or over loses, and there is nothing
//    in between: the roll settles the round at the press
//  - the payout is the whole number of credits `floor(bet * 97 / target)`, so a target of 1 pays
//    97.00x and a target of 96 pays 1.01x
//
// WHY EVERY TARGET RETURNS THE SAME. The chance of winning is exactly target/100, and the return of
// a win is 97/target, so
//    chance * multiple = (target / 100) * (97 / target) = 0.97
// for EVERY target. No corner of the dial is a better bet than another, only a safer or a wilder
// one, and the 3% the house keeps is the same 3% wherever the player aims. That is the same shape
// the crash ran on, and it is the reason the payout is written as a division by the target rather
// than as a table of ninety-six numbers somebody tuned one at a time.
//
// Money: whole credits, one floor, always the house's way.
//    payout = floor(bet * 97 / target)        written as integer division, so no float rounds it
//    mult100 = floor(100 * payout / bet)      the multiple that payout really IS, in hundredths
// The screen is handed `mult100` rather than 97/target, so the figure it prints is read back OUT of
// the payout and the two cannot drift. That is the oldest bug in this casino: a screen showing 1.1x
// while the ledger pays 1.0x.
//
// MIN_BET IS 100, AND THAT IS ARITHMETIC RATHER THAN TASTE. The floor can cost at most one credit,
// and it only costs it on a win, which comes up target/100 of the time. So the return is
//    0.97 - (something under target / (100 * bet))   ...  and never above 0.97
// The band has exactly 1% of room under 97%, so the whole question is whether
// target/(100 * bet) stays under 1/100, which it does for every bet of MAX_TARGET or more. A floor
// of 100 is therefore the smallest one that cannot put any target outside the band, and the check
// when this module loads is that one line: MAX_TARGET <= MIN_BET. At a bet of 10 the worst target
// returns 88%, which is what the minefield and the tower found the same way.
//
// WHY THE DIAL STOPS AT 96. At a target of 97 the multiple is exactly 1.00x: a "win" that hands the
// bet back and nothing else. Above it the multiple is under one, so a win pays LESS than the bet and
// the word stops meaning anything. 96 is the last target where every win pays more than it cost,
// and the load check asserts that for the smallest bet the game takes.
//
// A roll settles inside newRound(), like a spin of the slots: the press IS the bet, there is no
// decision inside a roll, and so OPS is empty and there is no live phase to keep a seed out of. The
// target travels with the DEAL (games/README.md: `startArg` and `badStart`, with `badTarget` below
// as the check the host calls first), not with a move, because it is chosen before the round exists.
//
// Determinism: the same seed always rolls the same number. The seed is a roll stream (cards.js
// rollsFrom), never a shuffle, and the round id is a separate value: a view that carried the id as
// its seed would be a view that re-rolls the roll.

const C = require('./cards');

// The smallest bet the game takes. See the note above: this is a solved figure, not a preference
const MIN_BET = 100;

// No action exists inside a roll: the round is born settled
const OPS = [];

// The band every game in this casino returns inside, as whole percents
const BAND_LO = 96;
const BAND_HI = 97;

// The roll: whole hundredths, 0.00 to 99.99. The wire carries the integer and the screen puts the
// point in, because 0.01 cannot be written down exactly in binary and a screen and a host that each
// round their own copy of it are a screen and a host that disagree about whether the player won
const FACES = 10000;
const PER_PERCENT = FACES / 100;   // 100 rolls sit under every whole percent

// The 97 in "pays 97 / target". It is the house edge and nothing else: see the note above
const HOUSE = 97;

const MIN_TARGET = 1;
const MAX_TARGET = 96;
const DEFAULT_TARGET = 50;   // a coin toss at 1.94x, which is where the dial opens

// --- the table ----------------------------------------------------------------------------------

// What a target pays on a bet, as a whole number of credits. Written as integer division (a
// remainder taken off before the divide) rather than Math.floor(a / b), so the result is exact for
// every bet the engine takes instead of exact for the ones where the double happened to land right
function payoutOf(bet, target) {
  const gross = bet * HOUSE;
  return (gross - (gross % target)) / target;
}

// The multiple that payout really is, in hundredths, read back out of the payout itself
function mult100Of(bet, target) {
  const scaled = 100 * payoutOf(bet, target);
  return (scaled - (scaled % bet)) / bet;
}

// The exact chance of winning at a target, as num/den. Never a float: the screen prints it and the
// tests count with it
function chanceOf(target) {
  return { num: PER_PERCENT * target, den: FACES };
}

// Why that target is not one this game takes, or null. The host calls this on the deal, before
// anything is staked (games/README.md, "the deal's selection"), and newRound throws the same
// sentence for anyone who gets past it
function badTarget(target) {
  if (!Number.isSafeInteger(target)) return 'pick a target between ' + MIN_TARGET + ' and ' + MAX_TARGET;
  if (target < MIN_TARGET || target > MAX_TARGET) {
    return 'the target runs from ' + MIN_TARGET + ' to ' + MAX_TARGET;
  }
  return null;
}

// The whole rulebook, a row per target, in the order the screen prints it. `mult` is the TOTAL
// return multiple as a fraction (97/target), not odds to one, and it is handed over as num/den so
// the screen never divides to decide anything. `mult100` is what the smallest bet actually pays,
// which is the figure a player can check against their own balance
const PAYS = Object.freeze((function () {
  const rows = [];
  for (let t = MIN_TARGET; t <= MAX_TARGET; t++) {
    rows.push(Object.freeze({
      target: t,
      chance: Object.freeze(chanceOf(t)),
      mult: Object.freeze({ num: HOUSE, den: t }),
      mult100: mult100Of(MIN_BET, t)
    }));
  }
  return rows;
})());

const ROW = Object.freeze(PAYS.reduce((m, r) => { m[r.target] = r; return m; }, {}));

// The table is one division, so what can be wrong with it is the three numbers the division is
// made of. Checked once, when the module loads, the way slots.js checks its rings.
//
// The band is priced as integers over the whole outcome space at the SMALLEST bet, which is the bet
// where the floor costs the most, and the three lines after it are the reasons that is enough
(function checkTable() {
  if (OPS.length) throw new Error('dice: a roll settles on the press, so OPS must stay empty');
  if (FACES % 100 !== 0) throw new Error('dice: the roll has to divide into whole percents');
  if (!Number.isSafeInteger(HOUSE) || HOUSE < 1 || HOUSE > 100) throw new Error('dice: bad house figure');
  if (MIN_TARGET < 1 || MAX_TARGET < MIN_TARGET || MAX_TARGET >= 100) throw new Error('dice: the dial is not a dial');
  if (badTarget(DEFAULT_TARGET)) throw new Error('dice: the dial opens on a target it would refuse');
  // Nothing the game pays may be above the band, and nothing is: the exact return of a target is
  // HOUSE/100 and the floor only ever takes from it
  if (HOUSE > BAND_HI) throw new Error('dice: the table returns ' + HOUSE + '%, over the band');
  // The one line MIN_BET exists for. The floor costs under one credit, and only on a win, so the
  // most it can take off a target's return is target / (100 * bet). The band has BAND_HI - BAND_LO
  // percent of room under the table's own return, so that fraction has to stay inside it
  if (MAX_TARGET * 100 > (BAND_HI - BAND_LO) * 100 * MIN_BET) {
    throw new Error('dice: a bet of ' + MIN_BET + ' cannot hold target ' + MAX_TARGET + ' inside the band');
  }
  for (let t = MIN_TARGET; t <= MAX_TARGET; t++) {
    const pay = payoutOf(MIN_BET, t);
    // A win has to be a win. At a target of HOUSE the multiple is exactly one and above it a win
    // pays less than the bet, which is the reason the dial stops where it does
    if (!(pay > MIN_BET)) throw new Error('dice: a win at target ' + t + ' pays ' + pay + ' on a bet of ' + MIN_BET);
    // and the band itself, over all FACES outcomes, as integers: PER_PERCENT * t of them pay `pay`
    const gross = PER_PERCENT * t * pay;
    const staked = FACES * MIN_BET;
    if (100 * gross < BAND_LO * staked || 100 * gross > BAND_HI * staked) {
      throw new Error('dice: target ' + t + ' returns ' + (gross / staked * 100).toFixed(2) + '%, outside the band');
    }
  }
})();

// --- the roll -----------------------------------------------------------------------------------

// The roll, in hundredths. Exported so a test can walk every outcome and so a test can search a
// seed for a roll, the way the card tests search a seed for a deal. The host makes a fresh seed per
// round and never hands it over before the roll
function rollOf(seed) {
  return Math.floor(C.rollsFrom(seed)() * FACES);
}

// Whether a roll wins against a target. Takes the roll rather than the seed, so the ranking can be
// run over every outcome there is
function winsAt(roll, target) {
  if (!Number.isInteger(roll) || roll < 0 || roll >= FACES) throw new RangeError('roll out of the dial: ' + roll);
  if (badTarget(target)) throw new RangeError(badTarget(target));
  return roll < PER_PERCENT * target;
}

// --- state --------------------------------------------------------------------------------------

// seed: any string (a fresh one per round). id: the round's public name, which must not be the seed
// (null if not given). target: 1..96. roll: an explicit roll in hundredths instead of the seeded
// one, for tests and replays, the way poker.js takes a stacked deck
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (integer division, nothing rounded) only holds while both products are
  // still safe integers: bet * HOUSE for the payout, and 100 * payout for the multiple read back
  // out of it. The host caps a bet at the balance long before this, so the check is the promise
  // made structural rather than a case anyone meets
  if (bet > Number.MAX_SAFE_INTEGER / (100 * HOUSE)) throw new RangeError('bet is too large to pay exactly');
  const target = opts.target;
  const bad = badTarget(target);
  if (bad) throw new RangeError(bad);
  const seed = String(opts.seed == null ? '' : opts.seed);
  const roll = opts.roll == null ? rollOf(seed) : opts.roll;
  const win = winsAt(roll, target);
  const payout = win ? payoutOf(bet, target) : 0;
  return {
    id: opts.id == null ? null : String(opts.id),
    seed,
    // a roll settles on the press, so a round is born done and there is no other phase to be in
    phase: 'done',
    bet,
    target,
    roll,
    win,
    payout,
    // the multiple the payout really is, so the screen and the ledger cannot disagree
    mult100: win ? mult100Of(bet, target) : 0,
    net: payout - bet
  };
}

// What a live round has riding on it, for the other games' budgets (games/tables.js). A roll
// settles on the press, so there is never a live round and the answer is always nothing
function stake(st) {
  return 0;
}

// Why `op` cannot be played now. There is no action inside a roll, so the answer is always the same
// one, and it is the answer the host needs: a webview asking for something this game does not have
// has to be told, or it waits out its no-reply timeout
function whyNot(st, op, budget) {
  return 'a roll settles on the press, so there is nothing to play';
}

// Nothing can be played on a roll, so this gives back the very same object every time
function act(st, op) {
  return st;
}

// --- what the webview sees ----------------------------------------------------------------------

// `pays` is the dial, not a result: ninety-six rows the screen reads its figures off, so the screen
// holds no multiple and no chance of its own and a retune here moves it. Handed over on the bet
// screen too, where the dial is the only thing to look at
function idleView() {
  return {
    phase: 'bet', id: null, bet: null, target: null, roll: null,
    win: null, row: null, payout: null, mult100: null, net: null,
    pays: PAYS, faces: FACES, perPercent: PER_PERCENT, house: HOUSE,
    minTarget: MIN_TARGET, maxTarget: MAX_TARGET, defaultTarget: DEFAULT_TARGET,
    minBet: MIN_BET, can: {}
  };
}

// Everything here is face up. A round exists only after it has settled, so there is no face-down
// number to leak and no live phase to keep the seed out of: the seed is handed over because the
// roll it names is already over and the next round rolls a fresh one of its own.
//
// `roll` is in hundredths, the way it came off the dial, and the screen puts the point in. `win` is
// a boolean rather than a word because the round has exactly two endings. `mult100` is read out of
// the payout, so a screen printing it is printing a figure the balance agrees with.
//
// The seed is still handed over under a phase test rather than unconditionally. As the game stands
// the test is always true, so the line looks like it does nothing: what it does is keep the rule
// (games/README.md section 6: a seed only at 'done') as the SHAPE of the function instead of as a
// property of there being one phase
function view(st, budget) {
  if (!st) return idleView();
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    target: st.target,
    roll: st.roll,
    win: st.win,
    row: ROW[st.target] || null,
    payout: st.payout,
    mult100: st.mult100,
    net: st.net,
    pays: PAYS,
    faces: FACES,
    perPercent: PER_PERCENT,
    house: HOUSE,
    minTarget: MIN_TARGET,
    maxTarget: MAX_TARGET,
    defaultTarget: DEFAULT_TARGET,
    minBet: MIN_BET,
    can: {}
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  rollOf, winsAt, payoutOf, mult100Of, chanceOf, badTarget,
  PAYS, ROW, OPS, MIN_BET, FACES, PER_PERCENT, HOUSE,
  MIN_TARGET, MAX_TARGET, DEFAULT_TARGET, BAND_LO, BAND_HI
};
