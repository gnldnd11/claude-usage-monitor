// The crab's wheel: one spin, one slice of a dial, and the multiplier WRITTEN ON THAT SLICE.
//
// Rules (fixed, kept simple):
//  - the dial is cut into UNITS equal units of angle. A slice is a whole number of units, so the
//    slices are NOT all the same width: a slice's width IS its chance
//  - every slice carries a multiplier in halves of a bet, which is how divide-by-two gets onto a
//    wheel whose money is still whole credits (see BET_STEP)
//  - three wheels, mild to wild. The player picks one WITH the spin, so the bet screen takes a bet
//    and nothing else
//  - the spin pays `bet * the stopped slice's multiplier`, which is zero on a dead slice
//  - every wheel is visible from the start. Only where it stops is secret
//
// --- why the slices are not equal, and why that was the whole unlock ------------------------------
//
// The wheel used to be 28 equal segments carrying whole multipliers, and it had exactly one shape it
// could take: 27/28. Equal slices and whole multipliers leave the return moving in steps of 1/28,
// and only one of those steps is inside the casino's band. There was nothing to tune.
//
// Widths are the degree of freedom that was missing. The return of a weighted wheel is
//
//     sum(units_i * halves_i) / (HALVES * UNITS)
//
// and the numerator now moves one unit-of-width at a time instead of one whole multiplier at a time.
// That is what makes three genuinely different wheels possible at one exact return, and it is also
// what lets a jackpot be a THIN slice rather than a rare one among equals.
//
// --- why the numbers can now sit inside the dial --------------------------------------------------
//
// The old screen printed the figures in a legend beside the wheel, and the reason given was that one
// of 28 segments is an 18px arc at 150px across and no figure goes in it. That reason was an
// argument about 28 EQUAL segments, not about wheels. Measured at 10.5px/700 in this panel: '×12' is
// 17.98px of ink and every two-character label is 12.14px. Laid along the arc, centred at radius 56
// in a 12px line box, the widest label's inner corners stand 10.2 degrees off its slice's middle. So
// a slice of 20.4 degrees holds any label on any of these wheels, and MIN_UNITS below is the rule
// that keeps every slice above that with room to spare.
//
// Money: the bet is at risk from the deal and the spin settles it exactly once. NOTHING is rounded
// and no float touches the money path, which is a stronger promise than it was when every multiplier
// was whole. See BET_STEP: the payout is (bet / BET_STEP) * halves, two integers multiplied.
//
// Determinism: a spin is one seed and one roll (C.rollsFrom), the way the forge rolls an attempt.
// The seed is made fresh by the host per round, so there is nothing to carry and no stream position
// to persist. The same seed on the same wheel always stops in the same slice.
//
// What is kept from the screen: the seed, and only until the round is done. Unlike the card games
// there is nothing else face down, because the slices themselves are public: the whole point of a
// wheel is that the big multiplier can be seen before the bet. `id` is the round's public name and
// is NOT the seed; one of them names the spin in a log and the other IS the spin.
//
// The op contract the screen is written against, one message per round:
//   act(st, { op: 'spin', risk: 'mild' | 'medium' | 'wild' })
// The risk rides along with the spin for the same reason poker's hold flags ride along with the
// draw: the choice is made on the felt, it costs no round trip, and there is no ordering to get
// wrong between choosing a wheel and spinning it. The risk IS part of the move, which is why its
// shape is a rule here (see badRisk) rather than something the host checks on the side.

const C = require('./cards');

const OPS = ['spin'];

// The smallest bet the host will take. Every other game in the casino uses the same figure
const MIN_BET = 10;

// --- the dial ------------------------------------------------------------------------------------

// The dial is cut into UNITS units of UNIT_DEG degrees. 30 units of 12 degrees, and that pair is
// chosen rather than convenient:
//
//  - 360 / 30 is a WHOLE number of degrees, so every slice edge, every slice middle and every
//    resting angle this engine hands the screen is an integer. Nothing downstream rounds an angle
//  - with multipliers in halves, the return is sum(units * halves) / 60, and the only integer
//    numerator inside the 96%-97% band is 58 (57.6 < 58 < 58.2). ONE shape, so a mistuned wheel
//    cannot quietly land somewhere else inside the band: it falls out of it and the check below
//    throws at load
//  - 2 units is 24 degrees, which clears the 20.4 degrees the widest label needs (see the header)
const UNITS = 30;
const UNIT_DEG = 12;

// The narrowest slice, in units. This is a LABEL rule wearing a number: a slice thinner than this
// cannot hold the figure written on it, and a wheel whose jackpot slice is unreadable is a wheel
// with its best news hidden. It is also what caps the top multiplier, and that is worth saying out
// loud rather than discovering: a slice can be no rarer than MIN_UNITS/UNITS, so no multiplier can
// be larger than (the return) * UNITS / MIN_UNITS = 14.5. The old 20x is gone, and it is gone
// because the figures moved onto the dial
const MIN_UNITS = 2;

// Multipliers are counted in halves of a bet. Two is the whole granularity: it buys the ÷2 slice
// (one half) and nothing finer, because a finer one buys nothing a player can read off a dial
const HALVES = 2;

// THE BET IS TAKEN IN WHOLE STEPS OF THIS, and that one rule is what keeps halves off the money
// path. A payout is (bet / BET_STEP) * halves: two integers multiplied, no division, no floor, no
// float, exact at every bet this engine will accept.
//
// The alternative was floor(bet * halves / 2), and it is worse for the reason MIN_BET gives: a
// flooring wheel pays a ÷2 slice 5 on a bet of 11 instead of 5.5, and the dropped halves walk the
// return out of the band at the small bets the game is mostly played at. A house edge that depends
// on whether the bet was odd is not an edge, it is a bug. Refusing the odd bet instead costs
// nothing: the casino's chips are 10, 100 and 1000
const BET_STEP = HALVES;

// What sum(units * halves) comes to on EVERY wheel. One number for all three, so the three differ
// in shape and not at all in what they return: whichever one the player picks, the house keeps the
// same 3.33%. That is the invariant the band exists for, and it is also why the choice of wheel is
// a matter of taste rather than a right answer to be found
const RETURN_HALVES = 58;

// --- the three wheels -----------------------------------------------------------------------------
//
// Each slice is [units, halves]: how wide it is, and what it pays in halves of a bet.
//   halves 0 = nothing   1 = ÷2   2 = ×1   4 = ×2   6 = ×3   12 = ×6   24 = ×12
//
// Each wheel's units sum to UNITS and its units*halves sum to RETURN_HALVES. The ORDER is cosmetic
// (the return depends on the multiset alone) and is laid out so that neighbours differ: equal
// slices side by side read as one wider slice, and on the wild wheel, where four fifths of the dial
// is dead, two dead slices of the SAME width touching is the one thing that makes the wheel look
// broken. Where two dead slices must touch they are given different widths.
//
// The tops double from wheel to wheel, ×3 then ×6 then ×12, and the dead share goes 4 units, then
// 16, then 24. That is the taste the player is choosing between
const WHEELS = Object.freeze({
  // Mild: four units in five pay something back. Half the dial is ×1 and ÷2 in alternating slices,
  // so it mostly hands most of the bet back, and the single ×3 is the only thing worth waiting for
  mild: Object.freeze([
    [3, 1], [2, 2], [2, 4], [2, 1], [3, 2], [2, 0], [3, 1],
    [2, 2], [2, 6], [2, 1], [3, 2], [2, 0], [2, 4]
  ].map(Object.freeze)),
  // Medium: a little over half the dial is dead and the live slices are a ladder from ÷2 to a
  // single ×6. Dead and live alternate all the way round
  medium: Object.freeze([
    [3, 0], [2, 1], [3, 0], [3, 4], [4, 0], [2, 12],
    [3, 0], [3, 2], [3, 0], [2, 1], [2, 6]
  ].map(Object.freeze)),
  // Wild: four fifths of the dial is dead and the ×12 is the thinnest slice on any of the three.
  // That one slice carries 48 of the 58 this wheel returns, so almost every spin is nothing and the
  // wheel is about the one that is not
  wild: Object.freeze([
    [5, 0], [2, 24], [4, 0], [2, 4], [3, 0], [4, 0], [2, 1], [5, 0], [3, 0]
  ].map(Object.freeze))
});

// The order the screen lists them in, mild first. Also the order a test walks them
const RISKS = Object.freeze(['mild', 'medium', 'wild']);

// What the screen prints over each wheel. Held here so the wheels can be renamed without a rule
// moving, the way poker's PAYS holds its row names
const NAMES = Object.freeze({ mild: 'Mild', medium: 'Medium', wild: 'Wild' });

// What is WRITTEN ON THE SLICE, and the only place that text is decided. The screen prints what it
// is handed: a panel that turned halves into words of its own would be a second rulebook, and the
// first time the two disagreed the dial would be lying about what it pays.
//
// ÷2 rather than ×0.5 because that is the figure on a prize wheel, and because 'half back' is read
// faster than 'nought point five times'
function labelOf(halves) {
  if (halves === 0) return '×0';
  if (halves % HALVES === 0) return '×' + (halves / HALVES);
  if (halves === 1) return '÷' + HALVES;
  // a half-step above a whole multiplier (×1.5, ×2.5). None of the three wheels uses one today;
  // written out in whole numbers so no float reaches the text
  return '×' + Math.floor(halves / HALVES) + '.5';
}

// A wheel is the whole game, so a typo in one is the whole game being wrong. Checked once, when the
// module loads, the way forge.js checks its table.
//
// The band is asserted in integers (100 * RETURN_HALVES against 96 and 97 times HALVES * UNITS)
// because a comparison against 0.96 is the one place a float could decide whether the casino is
// solvent
(function checkWheels() {
  if (!Number.isSafeInteger(UNITS) || UNITS < 2) throw new Error('wheel: UNITS must be a unit count');
  if (UNITS * UNIT_DEG !== 360) throw new Error('wheel: ' + UNITS + ' units of ' + UNIT_DEG + 'deg is not a circle');
  if (UNIT_DEG % 2 !== 0) throw new Error('wheel: a slice middle must be a whole number of degrees');
  if (100 * RETURN_HALVES < 96 * HALVES * UNITS) throw new Error('wheel: ' + RETURN_HALVES + '/' + (HALVES * UNITS) + ' returns under 96%');
  if (100 * RETURN_HALVES > 97 * HALVES * UNITS) throw new Error('wheel: ' + RETURN_HALVES + '/' + (HALVES * UNITS) + ' returns over 97%');
  if (RISKS.length !== Object.keys(WHEELS).length) throw new Error('wheel: RISKS does not list every wheel');
  for (const risk of RISKS) {
    const segs = WHEELS[risk];
    if (!segs || !segs.length) throw new Error('wheel: no wheel named ' + risk);
    if (!NAMES[risk]) throw new Error('wheel: no name for ' + risk);
    let units = 0, sum = 0;
    for (const [u, h] of segs) {
      if (!Number.isSafeInteger(u) || u < MIN_UNITS) throw new Error('wheel: ' + risk + ' has a slice of ' + u + ' units, under the ' + MIN_UNITS + ' a label needs');
      if (!Number.isSafeInteger(h) || h < 0) throw new Error('wheel: ' + risk + ' holds a multiplier that is not a whole number of halves');
      units += u;
      sum += u * h;
    }
    if (units !== UNITS) throw new Error('wheel: ' + risk + ' is ' + units + ' units wide, not ' + UNITS);
    if (sum !== RETURN_HALVES) throw new Error('wheel: ' + risk + ' sums to ' + sum + ' halves, not ' + RETURN_HALVES);
  }
})();

// The biggest multiplier on any wheel, in halves. The bet cap below is read off it, so a retune that
// adds a bigger prize tightens the cap by itself
const TOP_HALVES = (function () {
  let top = 0;
  for (const risk of RISKS) for (const [, h] of WHEELS[risk]) if (h > top) top = h;
  return top;
})();

// The same figure as a multiplier, for anyone who wants to say it out loud
const TOP = TOP_HALVES / HALVES;

// --- the spin --------------------------------------------------------------------------------------

// Which UNIT a seed stops in: an integer 0..UNITS-1, uniform. The unit is where the randomness ends;
// everything after it is the wheel's own shape, which is what makes a wide slice likelier than a
// thin one without the roll knowing anything about widths
function unitOf(seed) {
  const unit = Math.floor(C.rollsFrom(seed)() * UNITS);
  // rollsFrom is uniform in [0, 1), so this cannot reach UNITS. Clamped anyway, because the one
  // thing that must not happen here is an index off the end of the wheel
  return unit < UNITS ? unit : UNITS - 1;
}

// Which SLICE of `risk` holds that unit. Exported so a test can walk the wheel unit by unit
function sliceAtUnit(risk, unit) {
  const segs = WHEELS[risk];
  let at = 0;
  for (let i = 0; i < segs.length; i++) {
    at += segs[i][0];
    if (unit < at) return i;
  }
  return segs.length - 1;
}

// Where a seed stops this wheel: an index into WHEELS[risk]. Exported so a test can search for the
// seed that lands on a chosen slice, the way the forge's tests search for an outcome. It tells
// nobody anything on its own: the host makes a fresh seed per round and never hands it over (see
// view). The risk is taken because the slices differ per wheel, so one seed is three outcomes
function stopOf(seed, risk) {
  return sliceAtUnit(risk, unitOf(seed));
}

// --- state ----------------------------------------------------------------------------------------

function live(st) {
  return !!st && st.phase === 'spin';
}

// The risk IS the move, so its shape is a rule of the game rather than a detail of the message:
// one of the three names, and nothing else. Exported so the host can refuse a malformed deal with
// the same words the engine would use
function badRisk(risk) {
  if (typeof risk !== 'string' || RISKS.indexOf(risk) < 0) return 'pick a wheel: ' + RISKS.join(', ');
  return null;
}

// seed: any string (a fresh one per round). id: the round's public name, which must not be the seed
// (null if not given)
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // The rule that keeps the halves off the money path. A RangeError here reaches the player as the
  // sentence itself (games/tables.js, refusal), so it is written as one
  if (bet % BET_STEP !== 0) throw new RangeError('this wheel takes bets in steps of ' + BET_STEP);
  // What the header promises (two integers multiplied, nothing rounded) only holds while the top
  // slice's payout is still a safe integer. The host caps a bet at the balance long before this,
  // so this is the promise made structural rather than a case anyone meets
  if (bet / BET_STEP > Math.floor(Number.MAX_SAFE_INTEGER / TOP_HALVES)) {
    throw new RangeError('bet is too large to pay the top slice exactly');
  }
  return {
    id: opts.id == null ? null : String(opts.id),
    seed: String(opts.seed == null ? '' : opts.seed),
    phase: 'spin', bet,
    risk: null, stop: null, halves: null, pay: null, net: null
  };
}

// What this round has riding on it: the bet, from the deal to the spin
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
  return badRisk(op && op.risk);
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = Object.assign({}, st);
  next.risk = op.risk;
  next.stop = stopOf(next.seed, next.risk);
  next.halves = WHEELS[next.risk][next.stop][1];
  // the whole money path, in one line of integer arithmetic. bet is a whole number of BET_STEP
  // (newRound saw to that), so bet / BET_STEP is a whole number of credits-per-half
  next.pay = (next.bet / BET_STEP) * next.halves;
  next.net = next.pay - next.bet;
  next.phase = 'done';
  return next;
}

// --- what the webview sees --------------------------------------------------------------------------

// One wheel, in the shape the screen draws it in.
//
// EVERY ANGLE IS COMPUTED HERE. The screen is handed each slice's `from`, its `span` and its `mid`
// in whole degrees and works out none of them: a panel that divided 360 by something would be
// holding a second copy of the wheel's shape, and the first time the two disagreed the lit slice
// and the slice the host paid for would be different slices.
//
// `label` is the figure written on the slice, decided here for the same reason (see labelOf).
//
// `legend` is the wheel read the other way round, by multiplier rather than by slice: how wide, in
// units, each multiplier is in total. The chances are handed over as num/den rather than a
// percentage so the screen never divides: a rounded percentage printed next to an exact table is a
// table nobody trusts
function wheelView(risk) {
  const segs = WHEELS[risk];
  const counts = new Map();   // halves -> { units, slices }
  let at = 0;
  const segments = segs.map(([units, halves]) => {
    const from = at * UNIT_DEG;
    const span = units * UNIT_DEG;
    at += units;
    const seen = counts.get(halves) || { units: 0, slices: 0 };
    seen.units += units;
    seen.slices += 1;
    counts.set(halves, seen);
    return Object.freeze({
      from, span,
      mid: from + span / 2,           // whole degrees: span is a multiple of UNIT_DEG, which is even
      units, halves,
      mult: halves / HALVES,          // halves are 1 or even, so this is exact in binary
      label: labelOf(halves),
      dead: halves === 0,
      chance: Object.freeze({ num: units, den: UNITS })
    });
  });
  const legend = Array.from(counts.keys()).sort((a, b) => b - a).map((halves) => Object.freeze({
    halves, mult: halves / HALVES, label: labelOf(halves),
    slices: counts.get(halves).slices,
    chance: Object.freeze({ num: counts.get(halves).units, den: UNITS })
  }));
  const dead = counts.get(0);
  return Object.freeze({
    risk, name: NAMES[risk],
    segments: Object.freeze(segments),
    legend: Object.freeze(legend),
    top: legend[0].mult,
    topLabel: legend[0].label,
    dead: Object.freeze({ num: dead ? dead.units : 0, den: UNITS }),
    // the house's side of this wheel, exact. Every wheel's is the same, which is the point
    rtp: Object.freeze({ num: RETURN_HALVES, den: HALVES * UNITS })
  });
}

// All three wheels, built once. They never change, so the screen may hold on to them
const WHEEL_VIEWS = Object.freeze(RISKS.map(wheelView));

// `wheels` is the whole rulebook, not a result: the screen draws these three and holds no
// multiplier, no angle and no chance of its own, so a retune here moves the screen with it. It is
// handed over on the bet screen too, where it is the only thing to look at
function idleView() {
  return {
    phase: 'bet', id: null, bet: null, risk: null,
    units: UNITS, step: BET_STEP, wheels: WHEEL_VIEWS,
    stop: null, mult: null, label: null, pay: null, net: null,
    can: { spin: false }
  };
}

// Everything here is public except the seed, which appears only at 'done', where the spin it names
// is over and the next round gets a fresh one.
//
// `stop` is null until the wheel has turned. That is the one thing this view exists to hold back:
// handing the slice over before the spin would let the screen know where it lands before it
// animates getting there.
//
// `mult` AND `label` are read BACK OUT of the payout rather than copied from the slice. The two
// cannot differ while a payout is (bet / BET_STEP) * halves, which is exactly why they are written
// this way: a screen that prints a figure the payout does not support is the bug this closes
function view(st, budget) {
  if (!st) return idleView();
  const done = st.phase === 'done';
  const paidHalves = done ? st.pay / (st.bet / BET_STEP) : null;   // exact: both sides are integers
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    risk: st.risk,
    units: UNITS,
    step: BET_STEP,
    wheels: WHEEL_VIEWS,
    stop: done ? st.stop : null,
    mult: done ? paidHalves / HALVES : null,
    label: done ? labelOf(paidHalves) : null,
    pay: st.pay,
    net: st.net,
    can: { spin: live(st) }
  };
  if (done) v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  stopOf, unitOf, sliceAtUnit, badRisk, wheelView, labelOf,
  WHEELS, WHEEL_VIEWS, RISKS, NAMES,
  UNITS, UNIT_DEG, MIN_UNITS, HALVES, BET_STEP, RETURN_HALVES, TOP_HALVES, TOP,
  OPS, MIN_BET
};
