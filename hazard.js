// The crab's hazard: one die, rolled as often as the player dares. Pure: knows nothing about
// vscode or credits. The one require is ./cards, for the shared seeded source.
//
// Rules (fixed, kept simple):
//  - the bet buys the first roll, which happens at the deal
//  - a 2, 3, 4, 5 or 6 is ADDED to the pot. A 1 takes the whole pot and the bet with it
//  - the player rolls again, or banks the pot, as often as they like
//  - the pot is worth `floor(bet * pot * 119 / 1000)` credits: a little under 0.12x of the bet per
//    pip. Banking pays that and ends the round
//  - the pot is capped at 100 pips, and reaching the cap banks the round where it stands
//
// WHY THIS GAME IS HERE. The casino had two games whose whole question was "once more, or take it
// now": the minefield and the tower. Both needed a paragraph of rules before the question made any
// sense, and the player they were built for said, of both of them, that they could not tell what
// the game was. A die needs no paragraph. A 1 is bad, everything else is good, and the question is
// the same question. That is the entire design brief: keep the tension, lose the rule book. (The
// name is the old dice game's, because this is the feeling that game had; the historical rules,
// with their main and their chance, are not these.)
//
// WHAT IT COSTS TO ROLL AGAIN, AND WHY THERE IS A RIGHT ANSWER. A roll busts one time in six and
// otherwise adds 4 pips on average, so one more roll turns a pot of p into
//    (5/6) * (p + 4)   ...  which beats p exactly while p < 20
// so the best play is to roll while the pot is under 20 and bank at 20 or over, and that answer
// does not depend on the bet, the rate, or anything else the player can see. The whole ladder is
// solved exactly when this module loads (see checkTable): the best play returns 96.8874%, inside
// the band, and NO rule returns more, because a value iteration is the greatest return any rule can
// reach by construction. Banking at 12 returns 87.7%, banking at 30 returns 90.2%, never banking at
// all returns 12.3%. The game is honest about having a right answer, and the right answer is inside
// the band like everything else here.
//
// Money: whole credits, one floor, always the house's way.
//    payout = floor(bet * pot * 119 / 1000)       written as integer division, no float
//    mult100 = floor(100 * payout / bet)          the multiple that payout really IS, in hundredths
// The screen is handed `mult100` rather than the rate, so the figure it prints is read back OUT of
// the payout and the two cannot drift.
//
// MIN_BET IS 100, AND THAT IS ARITHMETIC RATHER THAN TASTE. The floor can cost at most one credit,
// and only on a round that banks, which is 37.5% of them under the best play. So the best play
// returns at least 96.8874% - 0.375/bet, which is 96.51% at a bet of 100 and 92.1% at a bet of 10.
// The load check prices exactly that, as integers: the solved return, minus the chance of banking
// over MIN_BET, has to stay inside the band.
//
// THE CAP IS ARITHMETIC TOO. The best play banks at 20, so a cap of 100 pips can never decide a
// round that is played well: what it decides is how much arithmetic this file has to be able to do.
// With it, the pot is bounded, the biggest payout is known, and the bet can be checked against it.
// A player who insists on rolling to the cap gets there once in 95 rounds and is returned 12%.
//
// WHY THE WHOLE ROUND IS ROLLED AT THE DEAL. The faces are drawn from the seed when the round is
// dealt, the way the card games shuffle a shoe, and the round walks through them. That is what
// makes the round a value rather than a closure: act() can copy it, a test can stack it, and the
// same seed always plays the same round. It is also why the seed is a secret while the round is
// live: it is every face the player has not seen yet. view() hands it over only at 'done'.
//
// Determinism: the same seed always rolls the same faces. The seed is a roll stream (cards.js
// rollsFrom), never a shuffle, and the round id is a separate value: a view that carried the id as
// its seed would be a view that can read the next face.
//
// The op contract the screen is written against:
//   act(st, { op: 'roll' })   or   act(st, 'roll')
//   act(st, { op: 'bank' })   or   act(st, 'bank')

const C = require('./cards');

const OPS = ['roll', 'bank'];

// The smallest bet the game takes. See the note above: this is a solved figure, not a preference
const MIN_BET = 100;

// The band every game in this casino returns inside, as whole percents
const BAND_LO = 96;
const BAND_HI = 97;

const SIDES = 6;
const BUST = 1;             // the one face that takes the pot
const MIN_PIP = BUST + 1;   // the smallest face that adds to it

// What a pip is worth, as a fraction of the bet. Thousandths rather than hundredths because the
// band is 1% wide and a hundredth of a bet per pip moves the return by 8%: 0.118 returns 96.07% and
// 0.120 returns 98.52%, so there is no figure in hundredths that lands inside the band
const PER_PIP = 119;
const PER_DEN = 1000;

// The pot banks itself here. See the note above
const POT_CAP = 100;

// Every face the round could possibly need. A surviving roll adds at least MIN_PIP, so a round that
// never busts reaches the cap in POT_CAP / MIN_PIP rolls and ends there: there is no round that can
// ask for one more face than this
const MAX_ROLLS = Math.ceil(POT_CAP / MIN_PIP);

// --- the table ----------------------------------------------------------------------------------

// What a pot is worth on a bet, as a whole number of credits. Integer division (the remainder taken
// off before the divide), so the result is exact for every bet the engine takes
function payoutOf(bet, pot) {
  const gross = bet * pot * PER_PIP;
  return (gross - (gross % PER_DEN)) / PER_DEN;
}

// The multiple that payout really is, in hundredths, read back out of the payout itself
function mult100Of(bet, pot) {
  const scaled = 100 * payoutOf(bet, pot);
  return (scaled - (scaled % bet)) / bet;
}

// The smallest pot worth more than the bet. Under it, banking takes back less than was staked,
// which is a real choice (losing less) rather than a trap, and the screen labels it with this
function breakEvenOf(bet) {
  for (let pot = MIN_PIP; pot <= POT_CAP + SIDES; pot++) {
    if (payoutOf(bet, pot) > bet) return pot;
  }
  return null;
}

// --- solving the ladder -------------------------------------------------------------------------
//
// Exact, in integers, with no floats anywhere. Every value on the ladder is a whole number over
// 6^MAX_ROLLS: a pot of p is at most ceil((POT_CAP - p) / MIN_PIP) rolls from the end, so its
// denominator divides 6 to that power, and multiplying by 6^MAX_ROLLS leaves an integer. Each of
// the five faces summed below is therefore divisible by 6 at least once over, which is what makes
// the division by 6 exact rather than a rounding, and it is why this is BigInt and not Number.
//
// Returns { value, cash, pCash } over the same denominator: the best return per credit staked
// (scaled by PER_DEN as well, since a pip is PER_PIP/PER_DEN), which of the two moves is best at
// each pot, and the chance a round ends by banking when it is played that way.
const DEN = 6n ** BigInt(MAX_ROLLS);

function solveLadder() {
  const top = POT_CAP + SIDES;
  const value = new Array(top + 1);
  const cash = new Array(top + 1).fill(true);
  // At the cap and above, the round banks itself: there is no choice left to make
  for (let p = POT_CAP; p <= top; p++) value[p] = BigInt(p) * BigInt(PER_PIP) * DEN;
  for (let p = POT_CAP - 1; p >= 0; p--) {
    let sum = 0n;
    for (let k = MIN_PIP; k <= SIDES; k++) sum += value[p + k];
    // one face in SIDES busts and pays nothing, so the roll's value is the surviving faces over six
    const roll = sum / BigInt(SIDES);
    const bank = BigInt(p) * BigInt(PER_PIP) * DEN;
    // a tie goes to banking, which is what makes the rule "bank at 20 or over" rather than "over 20"
    cash[p] = bank >= roll;
    value[p] = cash[p] ? bank : roll;
  }
  // and the chance of ending by banking, under exactly that play
  const pCash = new Array(top + 1).fill(DEN);
  for (let p = POT_CAP - 1; p >= 0; p--) {
    if (cash[p]) continue;
    let sum = 0n;
    for (let k = MIN_PIP; k <= SIDES; k++) sum += pCash[p + k];
    pCash[p] = sum / BigInt(SIDES);
  }
  return { value, cash, pCash };
}

// The pot the best play banks at, and the two figures the band is checked against. Exported because
// the tests solve the same ladder with FLOORED payouts, one per bet, and have to agree with this
const SOLVED = (function () {
  const s = solveLadder();
  let at = POT_CAP;
  for (let p = 0; p <= POT_CAP; p++) if (s.cash[p]) { at = p; break; }
  return Object.freeze({
    bankAt: at,
    // the best return any rule can reach, as value / (PER_DEN * DEN)
    value: s.value[0],
    // the chance that round ends by banking rather than busting, as pCash / DEN
    pCash: s.pCash[0],
    den: DEN
  });
})();

// The game is a rate and a cap, so what can be wrong with it is the rate. Checked once, when the
// module loads, the way slots.js checks its rings: an unplayable rate is a game that refuses to
// start rather than a game that quietly pays out more than it takes
(function checkTable() {
  if (OPS.length !== 2) throw new Error('hazard: the round is roll or bank, and nothing else');
  if (BUST < 1 || BUST > SIDES) throw new Error('hazard: the busting face is not on the die');
  if (!Number.isSafeInteger(PER_PIP) || PER_PIP < 1) throw new Error('hazard: bad rate');
  if (MAX_ROLLS * MIN_PIP < POT_CAP) throw new Error('hazard: a round could ask for a face that was never rolled');
  if (SOLVED.bankAt >= POT_CAP) throw new Error('hazard: the cap decides the round the best play would play');
  // A pot worth banking has to be worth more than the bet, or the best play is to take a loss
  if (!(payoutOf(MIN_BET, SOLVED.bankAt) > MIN_BET)) {
    throw new Error('hazard: banking at ' + SOLVED.bankAt + ' pays under the bet');
  }
  // The band, as integers, both ends.
  //
  // Above: SOLVED.value is the greatest return ANY rule can reach, floors aside, so this is the one
  // end a rate can break. 0.120 per pip puts it at 98.52%
  if (100n * SOLVED.value > BigInt(BAND_HI) * BigInt(PER_DEN) * DEN) {
    throw new Error('hazard: the best play returns over the band');
  }
  // Below: under the best play the floor costs under one credit on the rounds that bank, which is
  // SOLVED.pCash of them, so the best play returns at least value - pCash/bet. Multiplied out by
  // 100 * PER_DEN * DEN * MIN_BET, which is what makes this a comparison of whole numbers
  const lhs = 100n * SOLVED.value * BigInt(MIN_BET) - 100n * BigInt(PER_DEN) * SOLVED.pCash;
  if (lhs < BigInt(BAND_LO) * BigInt(PER_DEN) * DEN * BigInt(MIN_BET)) {
    throw new Error('hazard: a bet of ' + MIN_BET + ' cannot hold the best play inside the band');
  }
})();

// --- the roll -----------------------------------------------------------------------------------

// Every face the round could need, drawn from the seed at the deal. Exported so a test can search a
// seed for a run, the way the card tests search a seed for a deal
function rollsOf(seed) {
  const roll = C.rollsFrom(seed);
  const out = [];
  for (let i = 0; i < MAX_ROLLS; i++) out.push(1 + Math.floor(roll() * SIDES));
  return out;
}

// --- state --------------------------------------------------------------------------------------

function draw(st) {
  if (st.pos >= st.rolls.length) throw new RangeError('the round ran out of faces'); // a short stack
  const face = st.rolls[st.pos];
  st.pos += 1;
  return face;
}

// The faces are never mutated (only `pos` moves), so a copy shares them
function clone(st) {
  return Object.assign({}, st, { faces: st.faces.slice() });
}

function live(st) {
  return !!st && st.phase === 'play';
}

// Settling, and the only place money is named
function settle(st, result, capped) {
  st.result = result;
  st.capped = !!capped;
  st.paid = result === 'banked' ? payoutOf(st.bet, st.pot) : 0;
  st.net = st.paid - st.bet;
  st.phase = 'done';
}

// One roll, and what it does to the pot. The pot going over the cap banks the round where it lands
function roll(st) {
  const face = draw(st);
  st.faces.push(face);
  if (face === BUST) {
    st.pot = 0;
    settle(st, 'bust');
    return;
  }
  st.pot += face;
  if (st.pot >= POT_CAP) settle(st, 'banked', true);
}

// seed: any string (a fresh one per round). id: the round's public name, which must not be the seed
// (null if not given). stack: explicit faces instead of the seeded ones, for tests and replays
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (integer division, nothing rounded) only holds while both products are
  // still safe integers: bet * pot * PER_PIP for the payout, and 100 * payout for the multiple read
  // back out of it. The biggest pot there is, is the cap plus one roll
  const topPot = POT_CAP + SIDES - 1;
  if (bet > Number.MAX_SAFE_INTEGER / (100 * topPot * PER_PIP)) throw new RangeError('bet is too large to pay exactly');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const st = {
    id: opts.id == null ? null : String(opts.id), seed, phase: 'play', bet,
    rolls: opts.stack ? opts.stack.slice() : rollsOf(seed), pos: 0,
    pot: 0, faces: [], result: null, capped: false, paid: null, net: null
  };
  // the bet buys the first roll, so a round that busts at once is a round that happened
  roll(st);
  return st;
}

// What this round has riding on it: the bet, from the deal until it settles
function stake(st) {
  return st.bet;
}

// Why `op` cannot be played now, or null. budget is not read: neither move stakes anything beyond
// the bet, which the host cleared before the deal
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : op;
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!live(st)) return 'the round is over';
  return null;
}

const MOVES = {
  roll(st) { roll(st); },
  bank(st) { settle(st, 'banked'); }
};

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  MOVES[op && typeof op === 'object' ? op.op : op](next);
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

// The screen holds no rate and no arithmetic of its own: what the pot is worth right now, what one
// more pip would add, and where banking starts paying more than the bet all come from here
function describe(bet, pot) {
  return {
    pot,
    payout: payoutOf(bet, pot),
    mult100: mult100Of(bet, pot),
    breakEven: breakEvenOf(bet)
  };
}

function idleView() {
  const d = describe(MIN_BET, 0);
  return {
    phase: 'bet', id: null, bet: null, pot: 0, faces: [], rolled: 0,
    result: null, capped: false, paid: null, net: null,
    payout: null, mult100: null, breakEven: d.breakEven,
    bust: BUST, sides: SIDES, potCap: POT_CAP, maxRolls: MAX_ROLLS,
    rate: Object.freeze({ num: PER_PIP, den: PER_DEN }),
    bankAt: SOLVED.bankAt, minBet: MIN_BET,
    can: { roll: false, bank: false }
  };
}

// The faces NOT yet rolled, `pos` and the seed stay inside the state. The seed is every face the
// player has not seen, so it appears only at 'done', where the round it names is over and the next
// round draws its own: this is the game in this casino where that rule has teeth.
//
// `payout` on a live round is what banking RIGHT NOW would pay, which is the figure the player is
// deciding against, and it is the host's own arithmetic rather than the screen's. At 'done' it is
// `paid`, the figure the balance moved by
function view(st, budget) {
  if (!st) return idleView();
  const done = st.phase === 'done';
  const d = describe(st.bet, st.pot);
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    pot: st.pot,
    faces: st.faces.slice(),
    rolled: st.faces.length,
    result: st.result,
    capped: st.capped,
    paid: st.paid,
    net: st.net,
    payout: done ? st.paid : d.payout,
    mult100: done ? (st.paid ? mult100Of(st.bet, st.pot) : 0) : d.mult100,
    breakEven: d.breakEven,
    bust: BUST,
    sides: SIDES,
    potCap: POT_CAP,
    maxRolls: MAX_ROLLS,
    rate: Object.freeze({ num: PER_PIP, den: PER_DEN }),
    bankAt: SOLVED.bankAt,
    minBet: MIN_BET,
    can: {
      roll: !whyNot(st, 'roll', budget),
      bank: !whyNot(st, 'bank', budget)
    }
  };
  if (done) v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  rollsOf, payoutOf, mult100Of, breakEvenOf, describe, solveLadder,
  SOLVED, OPS, MIN_BET, SIDES, BUST, MIN_PIP, PER_PIP, PER_DEN, POT_CAP, MAX_ROLLS, DEN,
  BAND_LO, BAND_HI
};
