// The crab's wheel: one spin, one of SLOTS segments, and the segment's multiplier. Pure: knows
// nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - the wheel has SLOTS equal segments, each carrying a whole-number multiplier
//  - three wheels, mild to wild. The player picks one WITH the spin, so the bet screen takes a bet
//    and nothing else
//  - the spin pays `bet * the stopped segment's multiplier`, which is zero on a dead segment
//  - every wheel is visible from the start. Only where it stops is secret
//
// Money: the bet is at risk from the deal and the spin settles it exactly once. The payout is one
// integer product, so NOTHING is rounded and no float touches the money path. That is not a detail,
// it is why the wheel has 28 segments rather than the 16 or 20 a narrow panel would prefer: see
// SLOTS below.
//
// Determinism: a spin is one seed and one roll (C.rollsFrom), the way the forge rolls an attempt.
// The seed is made fresh by the host per round, so there is nothing to carry and no stream position
// to persist. The same seed on the same wheel always stops in the same segment.
//
// What is kept from the screen: the seed, and only until the round is done. Unlike the card games
// there is nothing else face down, because the segments themselves are public: the whole point of a
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

// The smallest bet the host will take. Every other game in the casino uses the same figure, and the
// wheel's whole arithmetic is built on it: see SLOTS
const MIN_BET = 10;

// --- the segment count, and why it is not smaller -----------------------------------------------
//
// A wheel returns (the sum of its multipliers) / (its segment count). To sit in the casino's band,
// 96% to 97%, that fraction has to land between 0.96 and 0.97, and with whole-number multipliers
// the numerator moves in steps of one. There is no integer between 0.96*N and 0.97*N until N = 25,
// so a 16- or 20-segment wheel cannot be built out of whole multipliers at all.
//
// The way out would be fractional multipliers (0.5x, 2/3x) paid as floor(bet * num / den). That is
// worse, and the reason is MIN_BET: flooring throws away up to a whole credit per spin, and against
// a 10-credit bet one credit is ten percent. A wheel of halves pays a 0.5x segment 5 on a bet of 11
// instead of 5.5, and the dropped halves alone walk the return out of the band at the small bets
// the game is mostly played at. Rounding belongs to the house, but a house edge that depends on
// whether the bet was odd is not an edge, it is a bug.
//
// So: whole multipliers, and the fewest segments that leave room on both sides of the band.
// 25 would be exactly 96.00%, the very edge, where any retune falls out. 28 returns 27/28, which is
// 96.4286%, and 28 draws as four quadrants of seven.
const SLOTS = 28;

// The sum of every wheel's multipliers. One number for all three, so the three wheels differ in
// shape and not at all in what they return: whichever one the player picks, the house keeps the
// same 3.57%. That is the invariant the band exists for, and it is also why the choice of wheel is
// a matter of taste rather than a right answer to be found
const RETURN = 27;

// --- the three wheels ---------------------------------------------------------------------------
//
// Each is SLOTS whole multipliers that sum to RETURN. The ORDER is cosmetic (the return depends on
// the multiset alone) and is laid out so equal segments are not neighbours: a wheel with its six
// dead segments in a block reads as a broken wheel.
//
// One consequence of RETURN < SLOTS is worth knowing before reading the mild wheel: a wheel with no
// dead segment would have every multiplier at 1 or more and so would sum to at least SLOTS, which
// is 28, which is over the band. Even the gentlest wheel HAS to be able to take the bet.
const WHEELS = Object.freeze({
  // Mild: four spins in five give the bet back or better. 18 segments are a flat 1x, so the wheel
  // mostly just hands the bet back, and the 3x is the only thing on it worth waiting for
  mild: Object.freeze([
    1, 0, 1, 1, 2, 1, 0, 1, 1, 1, 3, 1, 0, 1, 1, 2, 1, 0, 1, 1, 1, 2, 0, 1, 1, 1, 0, 1
  ]),
  // Medium: dead and live alternate exactly, so half the spins pay. The live half is a ladder from
  // 1x to a single 6x
  medium: Object.freeze([
    0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 6, 0, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 2, 0, 1
  ]),
  // Wild: three live segments in 28. The 20x alone carries three quarters of what this wheel
  // returns, so almost every spin is nothing and the wheel is about the one that is not
  wild: Object.freeze([
    20, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0
  ])
});

// The order the screen lists them in, mild first. Also the order a test walks them
const RISKS = Object.freeze(['mild', 'medium', 'wild']);

// What the screen prints over each wheel. Held here so the wheels can be renamed without a rule
// moving, the way poker's PAYS holds its row names
const NAMES = Object.freeze({ mild: 'Mild', medium: 'Medium', wild: 'Wild' });

// A wheel is the whole game, so a typo in one is the whole game being wrong. Checked once, when the
// module loads, the way forge.js checks its table.
//
// The band is asserted in integers (100 * RETURN against 96 * SLOTS and 97 * SLOTS) because a
// comparison against 0.96 is the one place a float could decide whether the casino is solvent
(function checkWheels() {
  if (!Number.isSafeInteger(SLOTS) || SLOTS < 2) throw new Error('wheel: SLOTS must be a segment count');
  if (100 * RETURN < 96 * SLOTS) throw new Error('wheel: ' + RETURN + '/' + SLOTS + ' returns under 96%');
  if (100 * RETURN > 97 * SLOTS) throw new Error('wheel: ' + RETURN + '/' + SLOTS + ' returns over 97%');
  if (RISKS.length !== Object.keys(WHEELS).length) throw new Error('wheel: RISKS does not list every wheel');
  for (const risk of RISKS) {
    const segs = WHEELS[risk];
    if (!segs) throw new Error('wheel: no wheel named ' + risk);
    if (!NAMES[risk]) throw new Error('wheel: no name for ' + risk);
    if (segs.length !== SLOTS) throw new Error('wheel: ' + risk + ' has ' + segs.length + ' segments, not ' + SLOTS);
    let sum = 0;
    for (const m of segs) {
      if (!Number.isSafeInteger(m) || m < 0) throw new Error('wheel: ' + risk + ' holds a multiplier that is not a whole number of bets');
      sum += m;
    }
    if (sum !== RETURN) throw new Error('wheel: ' + risk + ' sums to ' + sum + ', not ' + RETURN);
  }
})();

// The biggest multiplier on any wheel. The bet cap below is read off it, so a retune that adds a
// bigger prize tightens the cap by itself
const TOP = (function () {
  let top = 0;
  for (const risk of RISKS) for (const m of WHEELS[risk]) if (m > top) top = m;
  return top;
})();

// --- the spin -----------------------------------------------------------------------------------

// Which segment a seed stops in: an integer 0..SLOTS-1. Exported so a test can search for the seed
// that lands on a chosen segment, the way the forge's tests search for an outcome. It tells nobody
// anything on its own: the host makes a fresh seed per round and never hands it over (see view)
function stopOf(seed) {
  const stop = Math.floor(C.rollsFrom(seed)() * SLOTS);
  // rollsFrom is uniform in [0, 1), so this cannot reach SLOTS. Clamped anyway, because the one
  // thing that must not happen here is an index off the end of the wheel
  return stop < SLOTS ? stop : SLOTS - 1;
}

// --- state --------------------------------------------------------------------------------------

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
  // What the header promises (one integer product, nothing rounded) only holds while the top
  // segment's payout is still a safe integer. The host caps a bet at the balance long before this,
  // so this is the promise made structural rather than a case anyone meets
  if (bet > Number.MAX_SAFE_INTEGER / TOP) throw new RangeError('bet is too large to pay the top segment exactly');
  return {
    id: opts.id == null ? null : String(opts.id),
    seed: String(opts.seed == null ? '' : opts.seed),
    phase: 'spin', bet,
    risk: null, stop: null, mult: null, pay: null, net: null
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
  next.stop = stopOf(next.seed);
  next.mult = WHEELS[next.risk][next.stop];
  next.pay = next.bet * next.mult;
  next.net = next.pay - next.bet;
  next.phase = 'done';
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

// One wheel, in the shape the screen draws it in. `legend` is the wheel read the other way round,
// by multiplier rather than by segment, because that is what a wheel this size needs: at 28
// segments a label does not fit inside the arc, so the screen colours the segments and prints the
// legend beside them. The chances are handed over as num/den rather than a percentage so the screen
// never divides: a rounded percentage printed next to an exact table is a table nobody trusts
function wheelView(risk) {
  const segs = WHEELS[risk];
  const counts = new Map();
  for (const m of segs) counts.set(m, (counts.get(m) || 0) + 1);
  const legend = Array.from(counts.keys()).sort((a, b) => b - a).map((mult) => Object.freeze({
    mult, slots: counts.get(mult), chance: Object.freeze({ num: counts.get(mult), den: SLOTS })
  }));
  return Object.freeze({
    risk, name: NAMES[risk],
    segments: segs,                                   // already frozen
    legend: Object.freeze(legend),
    top: legend[0].mult,
    dead: Object.freeze({ num: counts.get(0) || 0, den: SLOTS }),
    // the house's side of this wheel, exact. Every wheel's is the same, which is the point
    rtp: Object.freeze({ num: RETURN, den: SLOTS })
  });
}

// All three wheels, built once. They never change, so the screen may hold on to them
const WHEEL_VIEWS = Object.freeze(RISKS.map(wheelView));

// `wheels` is the whole rulebook, not a result: the screen draws these three and holds no
// multiplier and no chance of its own, so a retune here moves the screen with it. It is handed over
// on the bet screen too, where it is the only thing to look at
function idleView() {
  return {
    phase: 'bet', id: null, bet: null, risk: null,
    slots: SLOTS, wheels: WHEEL_VIEWS,
    stop: null, mult: null, pay: null, net: null,
    can: { spin: false }
  };
}

// Everything here is public except the seed, which appears only at 'done', where the spin it names
// is over and the next round gets a fresh one.
//
// `stop` is null until the wheel has turned. That is the one thing this view exists to hold back:
// handing the segment over before the spin would let the screen know where it lands before it
// animates getting there.
//
// `mult` is read BACK OUT of the payout rather than copied from the segment. The two cannot differ
// while a payout is one integer product, which is exactly why it is written this way: a screen that
// prints a multiplier the payout does not support is the bug this closes
function view(st, budget) {
  if (!st) return idleView();
  const done = st.phase === 'done';
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    risk: st.risk,
    slots: SLOTS,
    wheels: WHEEL_VIEWS,
    stop: done ? st.stop : null,
    mult: done ? st.pay / st.bet : null,
    pay: st.pay,
    net: st.net,
    can: { spin: live(st) }
  };
  if (done) v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  stopOf, badRisk, wheelView,
  WHEELS, WHEEL_VIEWS, RISKS, NAMES, SLOTS, RETURN, TOP, OPS, MIN_BET
};
