// The credit mine: the ruler, the layout, the claim, the picks and the ceiling.
// No dependencies: node's assert only. Run: node test/mine.test.js
//
// This game has no round, so the casino's 96-97% band is not what is proved here (games/README.md,
// section 7). Five claims stand in its place and each one has its own block below:
//
//   (a) net pay per token has a ceiling, per tier 'the ceiling'
//   (b) a stretch of drift pays exactly once     'paid once'
//   (c) picks do not overlap, and the remainder carries over   'the picks'
//   (d) the ground is monotone                   test/credits.test.js (weightedTotal)
//   (e) one claim walks a bounded number of cells 'the budget'
//
// (a) IS AN ENUMERATION AND NOT A SIMULATION. The seam table is 64 buckets a cell and the spacing
// rule reads three cells around one, so the exact expectation is a sum over the table crossed with
// whether a relic stands on either side: 512 cases, done below as exact rationals over BUCKETS^6.
// The one thing that enumeration believes and cannot check is that the layout hash really is the
// uniform, uncorrelated thing it assumed, and that is the only claim this file samples for ('the
// hash', at the end).
//
// AND IT IS RUN ONCE PER TIER. A pick is a key (mine.js, the picks): the seam table's `gate` column
// says which rung the wall gives each row up to, so there are TOP_TIER + 1 tables rather than one
// and the ceiling has to stand against the richest of them. The enumeration is the same arithmetic
// with the locked rows left out, which is also what proves the gate is a gate: tier 0 and tier
// TOP_TIER come out of it at different rates.
//
// NO CEILING IS WRITTEN AS A LITERAL HERE. The 15% is mine.js's own EARN_CAP and the credits a
// metre of tokens earns is credits.js's own CREDIT_UNIT, so this file cannot drift into agreeing
// with itself: games/README.md section 7 records what a literal cost once, when an `rtp < 0.98`
// quietly became a tautology after the fee it was measuring moved.
'use strict';
const assert = require('assert/strict');
const path = require('path');
const mn = require(path.join(__dirname, '..', 'mine.js'));
const credits = require(path.join(__dirname, '..', 'credits.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const B = mn.BUCKETS;
const CELL = mn.CELL_M;
const MT = mn.TOK_PER_MT;

// What one metre of drift earns in the LEDGER. mine.js may not require credits.js (it would be a
// cycle), so this is the one place the two numbers are multiplied together, and both come off the
// modules rather than out of this file
const CR_PER_M = mn.TOK_PER_M / credits.CREDIT_UNIT;

// A record the way the STORE would hand one back. A `pick` given without a `durTok` is the shape a
// record from before 1.40.0 has, and mine.js's `clean` repairs it to the tier's own row; filling it
// in the same way here keeps this file from asserting against a state no save could produce
const rec = (over) => {
  const st = Object.assign(mn.fresh('', 0), over || {});
  if (st.pick >= 1 && !st.durTok) st.durTok = mn.durTokOf(st.pick);
  return st;
};
const tokOfM = (m) => m * mn.TOK_PER_M;                 // tokens that dig `m` metres with a pick
const pct = (x) => (x * 100).toFixed(4) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');

// The seams standing in (fromCell, toCell] THAT `tier` IS THE KEY TO, summed WITHOUT the engine's
// claim, so a claim can be held against something that was not produced by the code under test.
// The gate is read off the table here rather than through mine.takes, which is the function the
// claim itself uses: a sum that called it would agree with the engine about the gate by
// construction, and the gate is half of what these tests are about
function sumCells(fromCell, toCell, tier) {
  let pay = 0, n = 0, fevers = 0, locked = 0;
  for (let c = fromCell + 1; c <= toCell; c++) {
    const s = mn.seamAt(c);
    if (!s) continue;
    if (tier < s.gate) { locked += 1; continue; }
    if (s.kind === 'fever') { fevers += 1; continue; }
    pay += s.pay; n += 1;
  }
  return { pay, n, fevers, locked };
}
// The first cell at or after `from` holding a row of this name, which the layout being a pure
// function of the metre makes a lookup rather than a search for luck
function cellOf(name, from) {
  for (let c = (from || 1); c < 2000000; c++) { const s = mn.seamAt(c); if (s && s.name === name) return c; }
  throw new Error('no ' + name + ' in two million cells');
}

// --- the ruler and the window -------------------------------------------------------------------

test('a metre is a tenth of a million weighted tokens, and the picks are a ladder in both columns', () => {
  assert.equal(mn.TOK_PER_M * 10, MT, 'a metre is not a tenth of an MT');
  assert.equal(mn.FIST_DIV, 8);
  assert.equal(mn.PICKS.length, mn.TOP_TIER);
  for (let i = 1; i < mn.PICKS.length; i++) {
    assert.ok(mn.PICKS[i].price > mn.PICKS[i - 1].price, 'the prices do not rise');
    assert.ok(mn.PICKS[i].durMt > mn.PICKS[i - 1].durMt, 'a dearer pick does not last longer');
  }
  // THE BUTTON OFFERS THE NEXT RUNG AND THE TOP RUNG REPEATS. One way up, which is what makes "a
  // rising price" true and is also why a worn tier-1 pick is not replaced by another tier-1 pick
  assert.equal(mn.nextTier(0), 1);
  for (let t = 1; t < mn.TOP_TIER; t++) assert.equal(mn.nextTier(t), t + 1);
  assert.equal(mn.nextTier(mn.TOP_TIER), mn.TOP_TIER, 'the top rung does not repeat');
  // tier 0 is the fist: not a row, and nothing to wear out
  assert.equal(mn.pickOf(0), null);
  assert.equal(mn.durTokOf(0), 0);
  assert.equal(mn.pickOf(mn.TOP_TIER + 1), null);
  // for the reader this was tuned against: 5.32 MT an hour of activity, 52.4 MT a day
  const hours = mn.PICKS.map((p) => (p.durMt / 5.32).toFixed(1));
  console.log('      picks: ' + mn.PICKS.map((p, i) => p.price + ' cr / ' + p.durMt + ' MT / ' + hours[i] + ' activity hours').join(' | '));
});

test('a pick is a key: the gate column is a ladder with both ends on it', () => {
  // The two ends are the ones a retune can break without any ratio moving, and mine.js THROWS on
  // either of them at load rather than only being tested here (its own conditions block). This is
  // the same pair said out loud, plus what they are for
  const byTier = [];
  for (let t = 0; t <= mn.TOP_TIER; t++) byTier.push(mn.SEAMS.filter((s) => mn.takes(t, s)));
  // bare hands take something, or the screen pays a new reader nothing at all
  assert.ok(byTier[0].length > 0, 'bare hands take nothing out of the wall');
  // ...and what they take is the gems, so the one thing a reader sees before buying is the thing
  // the drift is made of
  assert.ok(byTier[0].every((s) => s.kind === 'gem'), 'bare hands take more than gems');
  // EVERY RUNG IS A SUPERSET OF THE ONE BELOW IT, which is what makes the ladder one way
  for (let t = 1; t <= mn.TOP_TIER; t++) {
    for (const s of byTier[t - 1]) assert.ok(byTier[t].indexOf(s) >= 0, s.name + ' was taken away by a dearer pick');
  }
  // ...and the top rung opens something no other rung can take, or 12,500 credits buys a delay
  assert.ok(byTier[mn.TOP_TIER].length > byTier[mn.TOP_TIER - 1].length,
    'the top rung opens nothing the rung below it cannot take');
  // the gate is a tier that exists. mine.js refuses a table where it is not, so this is the shape
  // of that refusal rather than a second opinion about it
  for (const s of mn.SEAMS) {
    assert.ok(Number.isInteger(s.gate) && s.gate >= 0 && s.gate <= mn.TOP_TIER, s.name + ' is behind a tier that is not on the ladder');
  }
  console.log('      ' + byTier.map((rows, t) => 't' + t + ' ' + rows.length + ' rows').join(' | '));
  console.log('      gates: ' + mn.SEAMS.map((s) => s.name + ' ' + (s.gate ? 't' + s.gate : 'hands')).join(' · '));
});

test('the window is the size the screen measured, and the heaviest push cannot jump it', () => {
  // 20 credits is webview.js's CC_LANDING_JUMP, the measured "even the busiest stretch rarely earns
  // this much between two pushes". mine.js states the metres; the division is done here so the two
  // cannot drift apart
  assert.equal(mn.PUSH_M, 20 * credits.CREDIT_UNIT / mn.TOK_PER_M, 'PUSH_M is not 20 credits of ground');
  // the screen splits the drift 40% / 60%, so the two halves are at one scale only in 2:3
  assert.equal(mn.AHEAD_M * 2, mn.BEHIND_M * 3, 'the window is not the screen\'s 2:3');
  // a push moves less than a twentieth of the window...
  assert.ok(mn.PUSH_M * 20 <= mn.AHEAD_M, 'a push moves more than 5% of the window');
  // ...and a seam is on screen for at least five or six of them
  assert.ok(mn.AHEAD_M / mn.PUSH_M >= 6, 'a seam is visible for fewer than six pushes');
  // 24px markers need 30% of the 93.61px rock between their centres (28px, measured at a sidebar of
  // 250), and one cell is the closest two markers can ever be
  assert.ok(CELL * 10 >= mn.AHEAD_M * 3, 'two 24px markers would touch');
  // ...and a 48px relic needs 45%, which it has because a standing relic's neighbours are cleared,
  // so the closest anything gets to a relic is TWO cells
  assert.ok(CELL * 2 * 100 >= mn.AHEAD_M * 45, 'a 48px relic would touch its neighbour');
  console.log('      window ' + mn.BEHIND_M + ' / ' + mn.AHEAD_M + ' m, push ' + mn.PUSH_M
    + ' m (' + pct(mn.PUSH_M / mn.AHEAD_M) + ' of it), gem gap ' + pct(CELL / mn.AHEAD_M)
    + ' (needs 30%), relic gap ' + pct(2 * CELL / mn.AHEAD_M) + ' (needs 45%)');
  // and three markers fit, which is what the screen's own example draws
  assert.equal(Math.floor(mn.AHEAD_M / CELL), 3, 'the lookahead does not hold three cells');
});

// --- the layout ----------------------------------------------------------------------------------

test('the seam table fits the buckets, and the rock left over is barren', () => {
  let odds = 0;
  for (const s of mn.SEAMS) {
    assert.ok(s.odds > 0 && Number.isInteger(s.odds), s.name + ' has odds that are not whole');
    assert.ok(s.pay >= 0 && Number.isInteger(s.pay), s.name + ' has a pay that is not whole');
    assert.ok(['gem', 'relic', 'fever'].indexOf(s.kind) >= 0, s.name + ' is an unknown kind');
    odds += s.odds;
  }
  assert.ok(odds < B, 'the table fills every bucket: there is no barren rock');
  // A FEVER PAYS NOTHING. What it gives is ground, which is also why claim (a) has to count the
  // ground: a fever that paid credits as well would be two payouts wearing one name
  for (const s of mn.SEAMS) if (s.kind === 'fever') assert.equal(s.pay, 0, 'a fever pays credits');
  assert.equal(mn.FEVER_M % CELL, 0, 'a fever does not give whole cells away');
  console.log('      ' + odds + ' of ' + B + ' buckets hold something; ' + (B - odds) + ' are barren rock');
});

test('a standing relic has nothing in the cell before or after it', () => {
  // The spacing rule, walked rather than reasoned about. This is the condition the screen cannot
  // keep for itself: a panel that nudged a marker sideways to stop it overlapping would be drawing
  // a seam at a depth it is not at, and this screen's whole question is what the pick reaches
  const N = 200000;
  let relics = 0, gems = 0, fevers = 0;
  for (let c = 2; c < N; c++) {
    const s = mn.seamAt(c);
    if (!s) continue;
    if (s.kind === 'relic') {
      relics += 1;
      assert.equal(mn.seamAt(c - 1), null, 'a relic at ' + c + ' has a neighbour below it');
      assert.equal(mn.seamAt(c + 1), null, 'a relic at ' + c + ' has a neighbour above it');
    } else if (s.kind === 'fever') fevers += 1;
    else gems += 1;
  }
  assert.ok(relics > 0 && gems > 0 && fevers > 0, 'a kind never turned up at all');
  console.log('      over ' + num(N) + ' cells: ' + num(gems) + ' gems, ' + num(relics)
    + ' relics, ' + num(fevers) + ' fevers, ' + num(N - gems - relics - fevers) + ' barren');
});

test('the layout is a pure function of the metre: no seed, no clock, no randomness', () => {
  // The same metre holds the same thing in every window and on every machine, for ever. What this
  // screen withholds is not the layout, it is how far ahead the reader may see (the view, below)
  for (const c of [1, 2, 7, 64, 65, 1000, 123456, 4294967297]) {
    const a = mn.seamAt(c), b = mn.seamAt(c);
    assert.equal(a, b, 'cell ' + c + ' answered twice differently');
    assert.ok(mn.bucketOf(c) >= 0 && mn.bucketOf(c) < B, 'cell ' + c + ' hashed outside the buckets');
  }
  // a cell past 2^32 is not an alias of the one below it
  assert.ok(mn.bucketOf(4294967297) !== mn.bucketOf(1) || mn.bucketOf(8589934593) !== mn.bucketOf(1),
    'the high word of a cell number is not mixed in');
  assert.equal(mn.seamAt(0), null, 'cell 0 holds something');
  assert.equal(mn.seamAt(-3), null, 'a cell below the mouth holds something');
});

// --- depth, which is derived and never stored ----------------------------------------------------

test('depth is the token count, the pick, and the ground the fevers gave', () => {
  const st = rec({ pick: 1, anchorTok: 0 });
  assert.equal(mn.depthOf(st, 0), 0);
  assert.equal(mn.depthOf(st, tokOfM(100)), 100, 'a pick does not dig a metre a metre');
  // every pick digs at the SAME speed, which is the condition claim (a) rests on: one ceiling,
  // proved once, instead of four games
  for (const p of mn.PICKS) {
    assert.equal(mn.depthOf(rec({ pick: p.tier, anchorTok: 0 }), tokOfM(100)), 100, p.name + ' digs at its own speed');
  }
  // past the durability the hands come out and the efficiency collapses by FIST_DIV
  const t1 = mn.PICKS[0];
  const dur = t1.durMt * MT;
  const over = dur + tokOfM(80);
  assert.equal(mn.dugOf(rec({ pick: 1, anchorTok: 0 }), dur), t1.durMt * 10, 'the pick did not dig its whole durability');
  assert.equal(mn.dugOf(rec({ pick: 1, anchorTok: 0 }), over), t1.durMt * 10 + 10, 'the fist is not an eighth');
  // ...and with no pick at all it is the fist from the first metre
  assert.equal(mn.dugOf(rec({ pick: 0, anchorTok: 0 }), tokOfM(80)), 10, 'bare hands dug at pick speed');
  assert.equal(mn.hasPick(rec({ pick: 1, anchorTok: 0 }), dur - 1), true);
  assert.equal(mn.hasPick(rec({ pick: 1, anchorTok: 0 }), dur), false, 'a spent pick is still a pick');
  assert.equal(mn.hasPick(rec({ pick: 0, anchorTok: 0 }), 0), false, 'no pick read as a pick');
  // the bonus is part of the depth and is NOT re-dug
  assert.equal(mn.depthOf(rec({ pick: 1, anchorTok: 0, bonus: 240 }), tokOfM(100)), 340);
});

test('the token count is clamped, because it is not monotone between two windows', () => {
  // A window holding an older ledger reads a lower count than the one that anchored the pick. An
  // unclamped subtraction would run the mine backwards, and a mine that can go backwards is a mine
  // whose claimed ground becomes unclaimed
  const st = rec({ pick: 1, anchorTok: tokOfM(500), anchorDepth: 500 });
  assert.equal(mn.usedOf(st, tokOfM(400)), 0, 'a stale count dug a negative distance');
  assert.equal(mn.depthOf(st, tokOfM(400)), 500, 'a stale count moved the face back');
  assert.equal(mn.depthOf(st, tokOfM(600)), 600);
  // and the same for nonsense off a hand-edited store
  for (const bad of [undefined, null, NaN, -1, 1.5, '900', Infinity]) {
    assert.equal(mn.usedOf(st, bad), 0, 'a count of ' + String(bad) + ' was believed');
  }
  // reading a stale count never claims anything either
  assert.equal(mn.sweep(rec({ pick: 1, anchorTok: tokOfM(500), claimedTo: 480 }), tokOfM(400)).claim, null);
});

// --- (a) THE CEILING ----------------------------------------------------------------------------

// Exact rationals over B^6, for ONE TIER: the rows the gate opens to it and no others. Nothing in
// here is a float.
//
// THE 512 CASES, folded. A cell's own bucket is independent of its neighbours', so the expectation
// factorises and the three conditions are these:
//   a relic stands             the cell below is not a relic            (B - R) / B
//   a gem or fever stands      no relic stands either side of it
//       below: isRelic(c-1) && !isRelic(c-2)                            R(B - R) / B^2
//       above: isRelic(c+1) && !isRelic(c), and c is not a relic         R / B
//     so (1 - R(B-R)/B^2)(1 - R/B) = (B^2 - R(B-R))(B - R) / B^3
//
// `R` IS EVERY RELIC BUCKET AND NOT ONLY THE ONES THIS TIER CAN TAKE. The spacing rule reads the
// LAYOUT (mine.js, seamAt), which is the same drift for every tier, so an idol a tin pick cannot
// lift still clears the cells beside it and still keeps the gems there off this sum
const Bb = BigInt(B);
const DEN = Bb ** 6n;
function enumerate(tier) {
  let gemSum = 0n, relicSum = 0n, rawSum = 0n, relicOdds = 0n, feverOdds = 0n;
  for (const s of mn.SEAMS) {
    const o = BigInt(s.odds), p = BigInt(s.pay);
    if (s.kind === 'relic') relicOdds += o;               // the layout, gate or no gate
    if (tier < s.gate) continue;                          // the wall keeps it from this tier
    rawSum += o * p;
    if (s.kind === 'relic') relicSum += o * p;
    else if (s.kind === 'fever') feverOdds += o;
    else gemSum += o * p;
  }
  const R = relicOdds;
  const standOther = (Bb * Bb - R * (Bb - R)) * (Bb - R);        // over B^3
  // E[credits a DUG cell pays], over B^6
  const eDug = relicSum * (Bb - R) * Bb * Bb * Bb * Bb           // relicSum/B x (B-R)/B
    + gemSum * standOther * Bb * Bb;                             // gemSum/B x standOther/B^3
  // E[cells a dug cell's fever gives away], over B^5
  const cells = feverOdds * standOther * BigInt(mn.FEVER_M / CELL) * Bb;
  // ...and what those cells can pay. AN UPPER BOUND AND NOT THE EXPECTATION, on purpose: a granted
  // cell sits right after the fever that granted it, so its neighbours are conditioned (the cell
  // below is known not to be a relic) and the exact figure is a shade above E[dug]. The bound is
  // this TIER's own mean with the spacing rule thrown away, rawSum/B, and it is rigorous because a
  // cell's bucket is independent of its neighbours' and the rule only ever REMOVES a seam
  const eGrant = cells * rawSum;                                 // over B^6
  return { eDug, eGrant, earnPerCell: eDug + eGrant };
}

test('(a) what the mine pays per token has a ceiling, enumerated exactly, at every tier', () => {
  // the ledger's own side: one cell of drift is CELL_M metres and a metre earns TOK_PER_M weighted
  // tokens' worth, which is TOK_PER_M / CREDIT_UNIT credits
  const ledgerPerCell = BigInt(CELL) * BigInt(mn.TOK_PER_M);     // over CREDIT_UNIT
  const cap = BigInt(mn.EARN_CAP_NUM), capDen = BigInt(mn.EARN_CAP_DEN);
  const rates = [];
  for (let t = 0; t <= mn.TOP_TIER; t++) {
    const { eDug, eGrant, earnPerCell } = enumerate(t);
    //    earnPerCell / DEN   <=   cap / capDen   x   ledgerPerCell / CREDIT_UNIT
    const lhs = earnPerCell * capDen * BigInt(credits.CREDIT_UNIT);
    const rhs = DEN * ledgerPerCell * cap;
    const rate = Number(earnPerCell) / Number(DEN) / (Number(ledgerPerCell) / credits.CREDIT_UNIT);
    rates.push(rate);
    console.log('      t' + t + ': ' + (Number(eDug) / Number(DEN)).toFixed(5) + ' cr a dug cell + '
      + (Number(eGrant) / Number(DEN)).toFixed(5) + ' of fever ground = '
      + (Number(earnPerCell) / Number(DEN)).toFixed(5) + ' cr per ' + CELL + ' m = ' + pct(rate)
      + ' of the ' + (Number(ledgerPerCell) / credits.CREDIT_UNIT) + ' cr the same tokens earn');
    assert.ok(lhs <= rhs, 'tier ' + t + ' pays ' + pct(rate) + ' a token, over the ceiling of '
      + mn.EARN_CAP_NUM + '/' + mn.EARN_CAP_DEN);
  }
  // A DEARER KEY NEVER PAYS LESS, because what it takes is a superset of what the rung below takes.
  // So the ceiling is the top rung's and the margin under it is the room the table has to be
  // retuned in, and this is also the proof that the gate IS a gate: the two ends differ
  for (let t = 1; t <= mn.TOP_TIER; t++) {
    assert.ok(rates[t] >= rates[t - 1], 'tier ' + t + ' pays less per token than tier ' + (t - 1));
  }
  assert.ok(rates[mn.TOP_TIER] > rates[0] * 2, 'the gate hardly changes what comes out of the wall');
  console.log('      ceiling ' + mn.EARN_CAP_NUM + '/' + mn.EARN_CAP_DEN + ', top tier ' + pct(rates[mn.TOP_TIER])
    + ', margin ' + pct(mn.EARN_CAP_NUM / mn.EARN_CAP_DEN - rates[mn.TOP_TIER]));

  // ...and the enumeration is not vacuous: the top tier has to be a real fraction of the ceiling,
  // or a table of zeroes would pass every line above
  const top = enumerate(mn.TOP_TIER).earnPerCell;
  assert.ok(top * capDen * BigInt(credits.CREDIT_UNIT) * 3n >= DEN * ledgerPerCell * cap,
    'the mine pays so little that this assertion proves nothing');
});

test('(a) every rung pays for itself on what IT can take, and the ratio rises up the ladder', () => {
  // THE GATE MOVED ALL FOUR OF THESE, which is why the bottom three prices came down with it: a
  // rung is priced against what it can pull out of the wall, so the tin pick is measured on the
  // gems alone and only the crab pick is measured on the whole table.
  //
  // Measured against E[dug] ALONE, so the ground a fever gives away is a bonus on top of a rung
  // that already clears its price. A pick replaces the fist rather than adding to it, which is the
  // (FIST_DIV - 1) / FIST_DIV, and the measure stays a LOWER bound under the gate for a second
  // reason as well: the eighth of the ground the fist would have dug anyway is subtracted at this
  // tier's rate, while by hand it would have paid at tier 0's
  const ratios = [];
  for (const p of mn.PICKS) {
    const { eDug } = enumerate(p.tier);
    // metres the pick digs that the same tokens would not have dug by hand
    const marginal = BigInt(p.durMt) * BigInt(MT / mn.TOK_PER_M) * BigInt(mn.FIST_DIV - 1);
    // credits those metres pay: marginal / FIST_DIV x eDug / (DEN x CELL)
    const got = marginal * eDug;
    const over = BigInt(mn.FIST_DIV) * DEN * BigInt(CELL);
    assert.ok(got > BigInt(p.price) * over, p.name + ' cannot pay for itself on what it can take');
    ratios.push(Number(got) / Number(over) / p.price);
    console.log('      ' + p.name + ' ' + p.price + ' cr: ' + (Number(got) / Number(over)).toFixed(1)
      + ' cr over its life = ' + ratios[ratios.length - 1].toFixed(3) + 'x its price');
  }
  for (let i = 1; i < ratios.length; i++) {
    assert.ok(ratios[i] > ratios[i - 1], 'rung ' + (i + 1) + ' is worse value than the one below it');
  }
  console.log('      a rung returns ' + ratios.map((r) => r.toFixed(2) + 'x').join(' / ') + ' of its price (fevers not counted)');
});

// --- (b) PAID ONCE ------------------------------------------------------------------------------

test('(b) a stretch pays once: the second claim of the same ground is nothing', () => {
  const st = rec({ pick: 4, anchorTok: 0 });
  const tok = tokOfM(600);
  const first = mn.sweep(st, tok);
  assert.ok(first.claim, 'six hundred metres claimed nothing');
  assert.notEqual(first.rec, st, 'sweep mutated or returned its argument');
  assert.equal(st.claimedTo, 0, 'sweep mutated its argument');
  // the money is exactly the seams standing in the stretch THAT THIS KEY OPENS, summed without the
  // engine. The top pick opens the whole table, which is why this is the tier (b) is measured at:
  // what is being held here is the boundary and not the gate
  const want = sumCells(0, first.claim.to / CELL, mn.TOP_TIER);
  assert.equal(first.claim.pay, want.pay, 'the claim did not pay what stands in the ground');
  assert.equal(first.rec.earned, want.pay);
  assert.equal(first.rec.finds, want.n);
  // ...and the same ground again is null, not zero: there is no second claim to make
  assert.equal(mn.sweep(first.rec, tok).claim, null, 'the same ground claimed twice');
  assert.equal(mn.sweep(first.rec, tok).rec, first.rec, 'a claim with nothing to do still wrote');
});

test('(b) the claims tile the drift: no cell is skipped and no cell is in two of them', () => {
  // The strongest form of (b) there is. `claimedTo` is a BOUNDARY rather than a list of what was
  // taken, and this is the property that makes one number able to say all of it: the paid ground is
  // always a prefix, so the claims are intervals laid end to end
  let st = rec({ pick: 4, anchorTok: 0 });
  let at = 0, pay = 0, n = 0, claims = 0;
  for (let step = 1; step <= 200; step++) {
    const tok = tokOfM(step * 37);                 // 37 m a push: not a multiple of a cell
    for (;;) {
      const r = mn.sweep(st, tok);
      if (!r.claim) break;
      assert.equal(r.claim.from, at, 'claim ' + claims + ' did not start where the last one ended');
      assert.ok(r.claim.to > r.claim.from, 'a claim moved the boundary nowhere');
      at = r.claim.to;
      pay += r.claim.pay;
      n += r.claim.finds.length;
      claims += 1;
      st = r.rec;
      if (!r.claim.more) break;
    }
    assert.equal(st.claimedTo, at);
    assert.ok(at <= mn.depthOf(st, tok), 'the boundary ran past the face');
  }
  // every credit is a seam in [0, at], counted once, with no engine involved
  const want = sumCells(0, at / CELL, mn.TOP_TIER);
  assert.equal(pay, want.pay, 'the claims and the ground disagree about the money');
  assert.equal(n, want.n, 'the claims and the ground disagree about the count');
  assert.equal(st.earned, want.pay);
  // the fevers really did fire: `bonus` is their ground and it is in the depth. AT MOST one grant
  // per fever standing in the prefix, and fewer when one of them stood in ground another fever had
  // already given, which is the chain being broken (its own test, below)
  assert.ok(st.bonus > 0, 'not one fever fired over eight thousand metres');
  assert.equal(st.bonus % mn.FEVER_M, 0, 'a fever gave a part of a grant');
  assert.ok(st.bonus <= want.fevers * mn.FEVER_M, 'more ground was given than there are fevers to give it');
  console.log('      ' + claims + ' claims tiled ' + num(at) + ' m: ' + num(want.n) + ' finds, '
    + num(want.pay) + ' cr, ' + want.fevers + ' fevers worth ' + num(st.bonus) + ' m');
});

test('(b) a claim that loses the merge takes its money AND its boundary back', () => {
  // The record is adopted whole or dropped whole, which is only true because MAX_FIELDS is empty.
  // Max `earned` and a dropped claim's money survives next to a boundary that says the ground is
  // still there: that is the 372,000 bug, with a pick in its hand instead of a sword
  assert.deepEqual(mn.MAX_FIELDS.slice(), [], 'MAX_FIELDS is not empty: see mine.js');
  const A = 'a'.repeat(16), Z = 'f'.repeat(16);
  const base = rec({ pick: 4, anchorTok: 0 });
  const mineRec = Object.assign(mn.sweep(base, tokOfM(600)).rec, { by: A });
  // the other window dug further and claimed more, so it has more moves and wins
  let other = base;
  for (let i = 0; i < 3; i++) other = mn.sweep(other, tokOfM(200 * (i + 1) + 600)).rec;
  other = Object.assign({}, other, { by: Z });
  assert.ok(other.moves > mineRec.moves);
  const landed = mn.merge(mineRec, other);
  assert.equal(mn.kept(mineRec, landed), false, 'the losing record was reported as kept');
  assert.equal(landed.earned, other.earned, 'the loser\'s money survived the merge');
  assert.equal(landed.claimedTo, other.claimedTo, 'the loser\'s boundary survived the merge');
  // ...and they fall together, which is the whole point: a boundary behind the money would hand the
  // same ground over twice, and money behind the boundary would be ground paid for and skipped
  assert.equal(mn.netOf(landed), other.earned - other.spent);
  // the winner is the same whichever order the two arrive in, and merging again changes nothing
  assert.deepEqual(mn.merge(other, mineRec), landed);
  assert.deepEqual(mn.merge(landed, mineRec), landed);
  assert.deepEqual(mn.merge(landed, other), landed);
});

// --- (c) THE PICKS ------------------------------------------------------------------------------

test('(c) fitting a pick replaces the anchor: two in a row cannot add the same ground twice', () => {
  const tok = tokOfM(300);
  let st = rec({ pick: 0, anchorTok: 0 });
  // dug by hand to here
  const before = mn.depthOf(st, tok);
  assert.equal(before, 300 / mn.FIST_DIV | 0);
  const one = mn.act(st, { op: 'buy' }, tok);
  assert.equal(one.pick, 1);
  assert.equal(mn.depthOf(one, tok), before, 'fitting a pick moved the face');
  const two = mn.act(one, { op: 'buy' }, tok);
  assert.equal(two.pick, 2);
  assert.equal(mn.depthOf(two, tok), before, 'the second pick added a stretch of its own');
  assert.equal(two.spent, mn.PICKS[0].price + mn.PICKS[1].price);
  assert.equal(two.anchorTok, tok, 'the anchor was not replaced');
  // ...and from here on there is ONE stretch being dug, not two
  assert.equal(mn.depthOf(two, tok + tokOfM(100)), before + 100, 'the picks dug the same ground twice');
});

test('(c) a pick fitted early carries the old one\'s remainder, and the offer says what it will reach', () => {
  // THE HALF OF (c) THAT WAS REWRITTEN IN 1.40.0. Thrown away, the remainder made the best play
  // "wait until it breaks", and the moment it broke was the moment this screen had least to offer.
  // Carried, the ground is still counted once (the test above) and buying early costs the price
  const t1 = mn.PICKS[0], t2 = mn.PICKS[1];
  const st = mn.act(rec({ pick: 0, anchorTok: 0 }), { op: 'buy' }, 0);
  assert.equal(st.durTok, mn.durTokOf(1), 'a first pick is worth more or less than its own row');
  assert.equal(mn.reachOf(st, 0), t1.durMt * 10, 'a new pick does not reach its whole durability');
  // five of its fifteen MT gone
  const used = 5 * MT;
  const left = mn.reachOf(st, used);
  assert.equal(left, (t1.durMt - 5) * 10);
  // the offer says where the line is going, which is the sentence that replaced "and you lose the
  // rest" (docs/game-panels.md 5-15 asked for a screen that does not have to say it)
  const offer = mn.offerFor(st, used);
  assert.equal(offer.reach, left + t2.durMt * 10, 'the offer did not say what the new pick will reach');
  assert.equal(offer.price, t2.price);
  assert.equal(offer.name, t2.name);
  assert.equal(offer.tier, 2);
  assert.equal(offer.lose, undefined, 'the offer still carries what it used to throw away');
  // ...and that is what it really reaches: ITS durability PLUS what was left, to the token
  const up = mn.act(st, { op: 'buy' }, used);
  assert.equal(up.durTok, mn.durTokOf(2) + mn.reachTokOf(st, used), 'the carry is not the reach that was left');
  assert.equal(mn.reachOf(up, used), offer.reach, 'the pick does not reach what the offer promised');
  assert.equal(mn.reachOf(up, used), (t2.durMt + t1.durMt - 5) * 10);
  // THE CARRY IS ADDED ONCE. A second purchase at the same count carries what the second pick has,
  // and the third rung is its own row plus that, not plus it twice
  const up3 = mn.act(up, { op: 'buy' }, used);
  assert.equal(up3.durTok, mn.durTokOf(3) + up.durTok, 'the carry was doubled or dropped');
  // ...and nothing was lost to rounding on the way: three rungs and five MT of wear, in tokens
  assert.equal(up3.durTok, mn.durTokOf(1) + mn.durTokOf(2) + mn.durTokOf(3) - used);
  // IT IS IN TOKENS AND NOT IN THE METRES THE SCREEN WAS SHOWN. Half a metre of wear is still
  // carried, where a carry rounded to the line's own figure would hand back a metre that was paid
  // for or keep one that was not
  const half = mn.act(rec({ pick: 1, anchorTok: 0 }), { op: 'buy' }, mn.TOK_PER_M / 2);
  assert.equal(half.durTok, mn.durTokOf(2) + mn.durTokOf(1) - mn.TOK_PER_M / 2, 'the carry was rounded to a metre');
  // a spent pick carries nothing, and the offer then promises the new pick's own row
  const worn = rec({ pick: 1, anchorTok: 0 });
  const dead = t1.durMt * MT + 1;
  assert.equal(mn.reachOf(worn, dead), 0);
  assert.equal(mn.reachTokOf(worn, dead), 0);
  assert.equal(mn.offerFor(worn, dead).reach, t2.durMt * 10, 'a spent pick carried something over');
  assert.equal(mn.act(worn, { op: 'buy' }, dead).durTok, mn.durTokOf(2));
});

test('(c) a stale window cannot grow the carry: the anchor and the durability move together', () => {
  // THE ONE WAY A CARRY COULD MINT SOMETHING. Two windows hold ledgers of different ages, so the
  // count one of them reads can be lower than the count that anchored the pick in hand, and a carry
  // measured off a wear of 0 is the whole remainder rather than what is left.
  //
  // It is exact rather than merely safe, and that is the point: the carry is measured off the SAME
  // anchor `act` holds forward, so the tokens already spent still count against the sum. The stale
  // window's record reaches, at the true count, precisely what a purchase made at the true count
  // would have reached
  const t2 = mn.PICKS[1];
  const anchor = tokOfM(500);
  const wear = tokOfM(90);
  const fitted = rec({ pick: 1, anchorTok: anchor, anchorDepth: 500 });
  const truth = anchor + wear;
  const fresh = mn.act(fitted, { op: 'buy' }, truth);          // bought at the true count
  const stale = mn.act(fitted, { op: 'buy' }, anchor - wear);  // bought off a ledger 90 m behind
  assert.equal(stale.anchorTok, anchor, 'a stale count moved the anchor back');
  assert.equal(stale.durTok, mn.durTokOf(2) + mn.durTokOf(1), 'the stale window did not carry the whole figure');
  assert.ok(stale.durTok > fresh.durTok, 'this test is not measuring what it says it is');
  // ...and the two reach the same distance, because the stale one is anchored that much further back
  assert.equal(mn.reachOf(stale, truth), mn.reachOf(fresh, truth), 'the stale window got a longer pick');
  assert.equal(mn.reachOf(stale, truth), (t2.durMt + mn.PICKS[0].durMt) * 10 - 90);
  assert.equal(mn.depthOf(stale, truth), mn.depthOf(fresh, truth), 'the stale window dug further');
  // and the pick dies at the same token count in both
  const end = anchor + (mn.durTokOf(1) + mn.durTokOf(2));
  assert.equal(mn.hasPick(stale, end - 1), true);
  assert.equal(mn.hasPick(stale, end), false, 'the stale window\'s pick outlived the figure it was sold');
  assert.equal(mn.hasPick(fresh, end), false);
});

test('(c) durability is not maxed across a merge: a dropped purchase takes the carry with it', () => {
  // Durability is money here: it is paid for and it is the key the wall is opened with. Max it and
  // a window whose purchase was dropped keeps the pick it did not buy, which is the 372,000 bug
  // with a pick in its hand (mine.js, MAX_FIELDS)
  assert.deepEqual(mn.MAX_FIELDS.slice(), [], 'MAX_FIELDS is not empty: see mine.js');
  const A = '0'.repeat(16), Z = 'f'.repeat(16);
  const base = rec({ pick: 1, anchorTok: 0 });
  const mine = Object.assign(mn.act(base, { op: 'buy' }, 0), { by: A });     // this window buys
  // the other window claimed twice instead, so it has more moves and wins
  let other = base;
  for (let i = 1; i <= 2; i++) other = mn.sweep(other, tokOfM(i * 60)).rec;
  other = Object.assign({}, other, { by: Z });
  assert.ok(other.moves > mine.moves && other.durTok < mine.durTok);
  const landed = mn.merge(mine, other);
  assert.equal(mn.kept(mine, landed), false, 'the losing record was reported as kept');
  assert.equal(landed.durTok, other.durTok, 'the dropped purchase\'s durability survived the merge');
  assert.equal(landed.pick, other.pick, 'the dropped purchase\'s tier survived the merge');
  assert.equal(landed.spent, other.spent, 'the dropped purchase was charged for anyway');
  // the pick and its durability fall together, so the pair is never the fist-at-full-speed shape
  assert.equal(landed.pick >= 1, landed.durTok > 0, 'a tier and its durability came apart');
  assert.deepEqual(mn.merge(other, mine), landed);
  assert.deepEqual(mn.merge(landed, mine), landed);
});

test('(c) the clamp pulls a boundary back only where the record knows the depth', () => {
  // The one moment a record knows its own depth without a clock in its hand is the moment a pick is
  // fitted, because `dug` is then zero. So that is where a boundary left ahead of the face by a
  // hand-edited store is pulled back. Doing it on every read would be wrong by `dug`: a boundary
  // sits ahead of anchorDepth + bonus the instant a metre has been dug and paid for
  const tok = tokOfM(100);
  const sane = rec({ pick: 1, anchorTok: 0, claimedTo: 80 });
  assert.equal(mn.act(sane, { op: 'buy' }, tok).claimedTo, 80, 'a sane boundary was pulled back');
  const mad = rec({ pick: 1, anchorTok: 0, claimedTo: 900 });
  assert.equal(mn.act(mad, { op: 'buy' }, tok).claimedTo, 100, 'a boundary ahead of the face survived');
  // ...and a stale token count cannot move the anchor backwards and hand the new pick the old one's
  // wear as fresh durability
  const anchored = rec({ pick: 1, anchorTok: tokOfM(500) });
  assert.equal(mn.act(anchored, { op: 'buy' }, tokOfM(400)).anchorTok, tokOfM(500), 'a stale count moved the anchor back');
});

// --- the gate: what the wall gives up to the key in hand -----------------------------------------

// The claim for exactly the cell `cell` stands in, with `pick` in hand. The layout is a pure
// function of the metre, so this is a lookup and not a search: the record is placed so the face
// lands on that one cell and the bite is that one cell
function claimAt(cell, pick) {
  const st = rec({ pick, anchorTok: 0, anchorDepth: (cell - 1) * CELL, claimedTo: (cell - 1) * CELL });
  return mn.sweep(st, tokOfM(CELL));
}

test('the wall keeps what the key does not open, and pays for it at the rung that does', () => {
  // THE GATE IS WHAT A RUNG BUYS (mine.js, the picks). Three rows are gated and each one is held
  // here against the two tiers either side of its own gate, so a gate moved by one is a failure
  for (const s of mn.SEAMS) {
    if (!s.gate) continue;
    const c = cellOf(s.name, 1);
    assert.equal(mn.seamAt(c).name, s.name, 'the cell found does not hold what it was looked up by');
    // the rung below the gate: nothing. Not a smaller payment, nothing at all
    const shut = claimAt(c, s.gate - 1);
    assert.ok(shut.claim, 'a cell nobody can take claimed nothing at all: the boundary has to move');
    assert.equal(shut.claim.pay, 0, s.name + ' paid a tier that cannot take it');
    assert.equal(shut.claim.finds.length, 0, s.name + ' was reported as a find to a tier that cannot take it');
    assert.equal(shut.claim.grant, 0, s.name + ' gave ground to a tier that cannot take it');
    assert.equal(shut.rec.finds, 0, 'a locked row was counted in the tally');
    assert.equal(shut.rec.best, 0, 'a locked row became a record high');
    // ...and the rung at the gate takes it
    const open = claimAt(c, s.gate);
    if (s.kind === 'fever') {
      // a fever pays in GROUND, so what is asserted is the grant. What that ground then pays is
      // whatever stands in it, which is the next test's business
      assert.equal(open.claim.grant, mn.FEVER_M, 'the fever gave no ground to the rung that opens it');
      assert.equal(open.claim.to, (c + mn.FEVER_M / CELL) * CELL, 'the grant was not claimed by its own write');
      assert.equal(shut.claim.to, c * CELL, 'a locked fever moved the boundary as if it had fired');
    } else {
      assert.equal(open.claim.pay, s.pay, s.name + ' did not pay the rung its gate names');
      assert.equal(open.claim.finds.length, 1, s.name + ' was not reported as a find');
      assert.equal(open.rec.best, s.pay);
    }
    console.log('      ' + s.name + ' at cell ' + c + ': t' + (s.gate - 1) + ' takes ' + shut.claim.pay
      + ' cr, t' + s.gate + ' takes ' + open.claim.pay + ' cr'
      + (s.kind === 'fever' ? ' and ' + open.claim.grant + ' m of ground' : ''));
  }
});

test('a locked seam the face has passed does not come back when the next rung is fitted', () => {
  // THE HARSH HALF OF THE GATE, and it is claim (b)'s shape rather than a penalty bolted on: the
  // boundary is ONE NUMBER, so a cell is behind it the moment the claim passes it. A list of the
  // cells that were left would be the union-across-two-copies the forge minted 372,000 credits out
  // of (games/README.md section 3 point 3), and this screen says so in advance instead: the seam
  // was drawn in the lookahead with `locked` on it for as long as it was in the window
  const idol = mn.SEAMS.filter((s) => s.gate === mn.TOP_TIER)[0];
  const c = cellOf(idol.name, 1);
  const shut = claimAt(c, 1);
  assert.equal(shut.claim.pay, 0);
  assert.ok(shut.rec.claimedTo >= c * CELL, 'the boundary did not pass the cell it could not take');
  // now the top rung is fitted, and the ground behind the boundary is gone for good
  const up = mn.act(shut.rec, { op: 'buy' }, tokOfM(CELL));
  assert.equal(mn.sweep(up, tokOfM(CELL)).claim, null, 'ground behind the boundary was claimed a second time');
  // ...and the same cell, reached with the top rung in hand the first time, pays
  assert.equal(claimAt(c, mn.TOP_TIER).claim.pay, idol.pay);
});

test('the lookahead flags what the key does not open, at the depth where it matters', () => {
  // The flag is the only warning the reader gets before the boundary passes the thing (the test
  // above), so it is held at a DEPTH WITH A LOCKED SEAM IN THE WINDOW rather than anywhere: at a
  // depth where the window happens to hold gems only, every tier is shown the same picture and a
  // screen told nothing is ever locked would pass
  const idol = mn.SEAMS.filter((s) => s.gate === mn.TOP_TIER)[0];
  const c = cellOf(idol.name, 10);
  const depth = c * CELL - CELL;                     // one cell short of it: well inside AHEAD_M
  const here = (tier) => mn.seamsAhead(depth, tier).filter((s) => s.at === c * CELL)[0];
  assert.ok(here(mn.FIST), 'the idol is not in the window at this depth: pick another');
  assert.equal(here(mn.FIST).locked, true, 'bare hands were told they could take the idol');
  assert.equal(here(1).locked, true, 'a tin pick was told it could take the idol');
  assert.equal(here(mn.TOP_TIER).locked, false, 'the top rung was told it could not take the idol');
  assert.equal(here(mn.FIST).kind, here(mn.TOP_TIER).kind, 'the kind changed with the key');
  assert.equal(here(mn.FIST).at, here(mn.TOP_TIER).at, 'the position changed with the key');
  // ...and the view is the same answer, read through the record rather than through a tier
  const st = rec({ pick: 1, anchorTok: 0, anchorDepth: depth, claimedTo: depth });
  const v = mn.view(st, 0, 0, null);
  assert.equal(v.depth, depth);
  assert.equal(v.seam.filter((s) => s.at === c * CELL)[0].locked, true,
    'the view did not flag the idol a tin pick cannot lift');
  assert.ok(v.seam.some((s) => !s.locked) || v.seam.length === 1,
    'this depth locks everything, so the flag is not telling the two apart');
  console.log('      the ' + idol.name + ' at ' + (c * CELL) + ' m is drawn from ' + depth
    + ' m at every tier, locked below t' + idol.gate);
});

test('what a tier takes out of a long stretch rises with the tier, and never falls', () => {
  // The same drift read by five keys. This is the gate as the reader meets it rather than as the
  // enumeration states it, and it is what makes "a dearer pick pays more" a fact about the engine
  // and not only about the table
  const CELLS = 20000;
  const seen = [];
  for (let t = 0; t <= mn.TOP_TIER; t++) {
    // THE SAME STRETCH OF DRIFT AT EVERY TIER, which takes two things: a pick with enough
    // durability to dig all of it (so what is compared is the key and not how long it lasted) and
    // FIST_DIV times the tokens at tier 0, because bare hands dig an eighth as far per token
    let st = rec({ pick: t, durTok: t ? mn.REC_CEIL.durTok : 0, anchorTok: 0 });
    const tok = tokOfM(CELLS * CELL) * (t ? 1 : mn.FIST_DIV);
    assert.equal(mn.depthOf(st, tok), CELLS * CELL, 'tier ' + t + ' did not reach the same depth');
    let pay = 0, grant = 0;
    for (let i = 0; i < 1000; i++) {
      const r = mn.sweep(st, tok);
      if (!r.claim) break;
      pay += r.claim.pay; grant += r.claim.grant; st = r.rec;
    }
    assert.ok(st.claimedTo >= CELLS * CELL, 'the stretch was not cleared: raise the loop');
    // counted over the FIXED prefix and off the table, not over the boundary: a fever's grant
    // carries tier 2 and up further than the tokens dug, so the boundaries are not the same length
    seen.push({ pay, grant, locked: sumCells(0, CELLS, t).locked });
    if (t) {
      assert.ok(pay >= seen[t - 1].pay, 'tier ' + t + ' took less money than tier ' + (t - 1));
      assert.ok(grant >= seen[t - 1].grant, 'tier ' + t + ' was given less ground than tier ' + (t - 1));
      assert.ok(seen[t].locked <= seen[t - 1].locked, 'tier ' + t + ' had more of the wall shut to it');
    }
    console.log('      t' + t + ' over ' + num(CELLS) + ' cells: ' + num(pay) + ' cr, ' + num(grant)
      + ' m of fever ground, ' + num(seen[t].locked) + ' rows left in the wall');
  }
  assert.ok(seen[mn.TOP_TIER].pay > seen[0].pay * 2, 'the top key hardly pays better than bare hands');
  assert.equal(seen[mn.TOP_TIER].locked, 0, 'the top key cannot take everything in the table');
  assert.ok(seen[0].pay > 0, 'bare hands took nothing at all');
});

// --- (e) THE BUDGET -----------------------------------------------------------------------------

test('(e) a mine left for a month takes a bite and leaves the rest', () => {
  // 52.4 MT a day for thirty days is 786 cells of backlog, and a reader back from leave is further.
  // The top pick lasts long enough to have dug all of it
  const top = mn.PICKS[mn.PICKS.length - 1];
  // ONE TOKEN SHORT OF THE WHOLE DURABILITY, so the pick is still in hand when the claim is made.
  // At the figure exactly the pick has just died, which is the fist (`tierOf`) and a different
  // table: what is being measured here is the budget, so the richest key is the one to measure it
  // with and the gate has its own tests
  const tok = top.durMt * MT - 1;
  const dugCells = Math.floor((top.durMt * 10 - 1) / CELL);
  assert.ok(dugCells > mn.CLAIM_CELLS * 10, 'the backlog in this test is not big enough to be one');
  const first = mn.sweep(rec({ pick: top.tier, anchorTok: 0 }), tok);
  assert.ok(first.claim, 'a backlog claimed nothing');
  assert.equal(first.claim.more, true, 'a backlog bigger than the budget said it was finished');
  // ONE WRITE WALKS AT MOST CLAIM_CELLS OF DUG GROUND, and the ground the fevers in it gave, which
  // is why the real bound is CLAIM_CELLS x (1 + FEVER_M / CELL_M)
  const walked = (first.claim.to - first.claim.from) / CELL;
  const ceiling = mn.CLAIM_CELLS * (1 + mn.FEVER_M / CELL);
  assert.ok(walked <= ceiling, 'one claim walked ' + walked + ' cells, over its own bound of ' + ceiling);
  assert.ok(walked >= 1, 'a claim made no progress at all: this is the stall this budget must not have');
  assert.ok(first.claim.to < mn.depthOf(first.rec, tok), 'the bite claimed the whole backlog');
  console.log('      ' + num(dugCells) + ' cells of backlog: the first claim took ' + walked
    + ' (bound ' + ceiling + '), paying ' + num(first.claim.pay) + ' cr');

  // ...and the rest is still there. It clears in bites, every cell paid exactly once
  let st = first.rec, bites = 1, pay = first.claim.pay, at = first.claim.to;
  while (bites < 10000) {
    const r = mn.sweep(st, tok);
    if (!r.claim) break;
    assert.equal(r.claim.from, at, 'a bite left a hole');
    at = r.claim.to; pay += r.claim.pay; st = r.rec; bites += 1;
  }
  assert.equal(mn.sweep(st, tok).claim, null, 'the backlog never cleared');
  assert.equal(pay, sumCells(0, at / CELL, mn.TOP_TIER).pay, 'the bites and the ground disagree');
  assert.ok(bites < dugCells, 'the budget made the backlog slower than one cell a claim');
  console.log('      cleared in ' + bites + ' claims (' + num(at) + ' m, ' + num(pay) + ' cr)');
});

test('a fever in the ground another fever gave is inert: the chain is broken', () => {
  // A deterministic case rather than a hope. The layout is a pure function of the metre, so a fever
  // with another fever inside its own grant can simply be found, and then there is exactly one
  // thing to assert about it
  const span = mn.FEVER_M / CELL;
  let f = 0, second = 0;
  for (let c = 1; c < 500000 && !f; c++) {
    const s = mn.seamAt(c);
    if (!s || s.kind !== 'fever') continue;
    for (let k = 1; k <= span; k++) {
      const t = mn.seamAt(c + k);
      if (t && t.kind === 'fever') { f = c; second = c + k; break; }
    }
  }
  assert.ok(f, 'no fever in half a million cells has another inside its grant: nothing to test');
  // the face lands exactly on the first fever's cell, so the bite is that one cell
  const st = rec({ pick: 4, anchorTok: 0, anchorDepth: (f - 1) * CELL, claimedTo: (f - 1) * CELL });
  const r = mn.sweep(st, tokOfM(CELL));
  assert.ok(r.claim, 'the cell holding the fever claimed nothing');
  // ONE GRANT, not two. The second fever stands in ground the first gave, so it gives nothing
  assert.equal(r.claim.grant, mn.FEVER_M, 'the fever at cell ' + second + ' chained off the one at ' + f);
  assert.equal(r.rec.bonus, mn.FEVER_M);
  // ...and it can never fire later either, because the grant is behind the boundary for ever
  assert.equal(r.rec.claimedTo, (f + span) * CELL, 'the grant was not claimed by its own write');
  assert.ok(r.rec.claimedTo > second * CELL, 'the second fever is still in front of the boundary');
  assert.equal(mn.sweep(r.rec, tokOfM(CELL)).claim, null, 'there was a second claim to make');
  console.log('      fevers at ' + f + ' and ' + second + ' (' + (second - f) + ' cells apart): one grant of ' + mn.FEVER_M + ' m');
});

test('(e) every grant is claimed by the write that gives it, whatever the backlog', () => {
  // This is why the budget counts DUG cells only. "The ground this fever gave" is a position and the
  // record stores no positions, so a write that ended with granted ground unclaimed could not tell
  // it from dug ground on the next read, and the fever standing in it would fire again
  const top = mn.PICKS[mn.PICKS.length - 1];
  const tok = top.durMt * MT - 1;      // the pick is still in hand: see the test above
  let st = rec({ pick: top.tier, anchorTok: 0 });
  let fired = 0, claims = 0;
  for (let i = 0; i < 400; i++) {
    const r = mn.sweep(st, tok);
    if (!r.claim) break;
    claims += 1;
    if (r.claim.grant) {
      fired += r.claim.grant / mn.FEVER_M;
      // the boundary covers the grant: bonus went up by exactly what this write granted, and the
      // boundary moved at least that far, so nothing granted is left for a second read to find
      assert.equal(r.rec.bonus - st.bonus, r.claim.grant);
      assert.ok(r.claim.to >= r.claim.from + r.claim.grant, 'a grant was not claimed by its own write');
    }
    st = r.rec;
  }
  assert.ok(fired > 0, 'no fever fired in the whole of the top pick\'s life');
  assert.equal(st.bonus, fired * mn.FEVER_M);
  // at most one grant per fever in the claimed prefix. Fewer is the inert ones, which is the test
  // above; more would be the chain
  const there = sumCells(0, st.claimedTo / CELL, mn.TOP_TIER).fevers;
  assert.ok(fired <= there, fired + ' grants from ' + there + ' fevers: something chained');
  console.log('      ' + claims + ' claims, ' + fired + ' of ' + there + ' fevers fired ('
    + (there - fired) + ' stood in given ground), ' + num(st.bonus) + ' m granted');
});

// --- refusals and the move ----------------------------------------------------------------------

test('every refusal is a sentence, and nothing off the wire can name a price', () => {
  const st = rec({ pick: 0 });
  assert.deepEqual(mn.OPS.slice(), ['buy']);
  for (const bad of [undefined, null, 'dig', 'sell', '', { op: 'hit' }, 'buy']) {
    const why = mn.whyNot(st, typeof bad === 'object' ? bad : { op: bad }, null);
    if (bad === 'buy') assert.equal(why, null);
    else assert.equal(why, 'unknown action', 'a move of ' + JSON.stringify(bad) + ' was not refused');
  }
  assert.equal(mn.whyNot(null, { op: 'buy' }, 1e9), 'there is nothing to spend');
  assert.equal(mn.whyNot(st, { op: 'buy' }, mn.PICKS[0].price - 1), 'not enough credits');
  assert.equal(mn.whyNot(st, { op: 'buy' }, mn.PICKS[0].price), null);
  // a NaN budget is a broken ledger: it refuses rather than allows
  assert.equal(mn.whyNot(st, { op: 'buy' }, NaN), 'not enough credits');
  // the price is this module's, so the only field a buy may carry is the op
  const spoof = mn.act(st, { op: 'buy', price: 1, tier: 4 }, 0);
  assert.equal(spoof.pick, 1, 'a message chose which pick to fit');
  assert.equal(spoof.spent, mn.PICKS[0].price, 'a message named a price');
  // a refused move hands the very same object back, so a host can test for identity
  assert.equal(mn.act(st, { op: 'dig' }, 0), st);
});

// --- storage ------------------------------------------------------------------------------------

test('a stored record is rebuilt field by field, and a figure outside the ceiling is nothing', () => {
  assert.equal(mn.clean(null), null, 'a reader who has never dug has a record');
  assert.equal(mn.clean('nope'), null);
  const ok = mn.sweep(rec({ pick: 2, anchorTok: 0 }), tokOfM(400)).rec;
  const saved = Object.assign(mn.save(ok), { by: 'a'.repeat(16) });
  const back = mn.clean(saved);
  for (const k of mn.REC_FIELDS) assert.equal(back[k], ok[k], k + ' did not survive save and clean');
  assert.equal(back.by, 'a'.repeat(16));
  // a writer id outside the shape is dropped, "__proto__" included
  assert.equal(mn.clean(Object.assign({}, saved, { by: 'zz' })).by, '');
  assert.equal(mn.clean(Object.assign({}, saved, { by: '__proto__' })).by, '');
  assert.equal(Object.prototype.hasOwnProperty.call(mn.clean(JSON.parse('{"__proto__":{"x":1},"moves":1}')), 'x'), false);
  // ...and so is a figure a save could not have produced. Without this a hand-edited store sets
  // `moves` to 1e15 and wins every merge for ever.
  // `durTok` IS THE ONE FIELD A ZERO IS NOT THE ANSWER FOR, because it has to agree with `pick`:
  // the repair is the next block
  for (const k of mn.REC_FIELDS) {
    if (k === 'durTok') continue;
    const over = Object.assign({}, saved, { [k]: mn.REC_CEIL[k] + 1 });
    assert.equal(mn.clean(over)[k], 0, k + ' was believed past its ceiling');
    assert.equal(mn.clean(Object.assign({}, saved, { [k]: -1 }))[k], 0, k + ' was believed negative');
    assert.equal(mn.clean(Object.assign({}, saved, { [k]: 1.5 }))[k], 0, k + ' was believed fractional');
  }
  // THE PAIR (pick, durTok) IS REPAIRED RATHER THAN BELIEVED, and the same repair covers the two
  // ways it can arrive broken. A RECORD FROM BEFORE 1.40.0 has no field at all and its pick was
  // worth its tier's row, so that is what it is given: read as a worn-out pick instead, every pick
  // in the field would break on upgrade
  const old = mn.save(ok);
  delete old.durTok;
  assert.equal(mn.clean(old).durTok, mn.durTokOf(ok.pick), 'a record from before the field lost its pick');
  assert.equal(mn.hasPick(mn.clean(old), 0), true, 'a pick bought before 1.40.0 came back broken');
  // ...AND A HAND-EDITED FIGURE falls back to the same thing, so forging it gains nothing a forged
  // `pick` could not already claim
  for (const bad of [mn.REC_CEIL.durTok + 1, -1, 1.5, 0, '9e9', null, undefined]) {
    assert.equal(mn.clean(Object.assign({}, saved, { durTok: bad })).durTok, mn.durTokOf(ok.pick),
      'a durability of ' + String(bad) + ' was not repaired to the tier\'s own row');
  }
  // the other way round has no honest reading: durability without a pick would be a fist digging at
  // full speed, which is the one shape of nonsense in this record that pays
  const noPick = mn.clean(Object.assign({}, saved, { pick: 0, durTok: 900 * MT }));
  assert.equal(noPick.durTok, 0, 'bare hands kept a durability');
  assert.equal(mn.hasPick(noPick, 0), false, 'bare hands dug at full speed');
  assert.equal(mn.durOf(Object.assign({}, noPick, { durTok: 900 * MT })), 0, 'durOf believed a fist with a durability');
  // a pick this build does not have is no pick, which is the fist and not a throw
  assert.equal(mn.clean(Object.assign({}, saved, { pick: 99 })).pick, 0);
  assert.equal(mn.clean(Object.assign({}, saved, { pick: 99 })).durTok, 0);
  assert.equal(mn.durTokOf(mn.clean(Object.assign({}, saved, { pick: 99 })).pick), 0);
  // the mine is BORN AT THE TOKEN COUNT IT IS FIRST READ AT, so nothing is paid for work done
  // before the screen existed. Anchored at 0 instead, a first claim would walk a whole history and
  // hand over a lump sum, which is a retroactive payout wearing a game's clothes
  const born = mn.load(null, tokOfM(5000));
  assert.equal(born.anchorTok, tokOfM(5000));
  assert.equal(mn.depthOf(born, tokOfM(5000)), 0, 'a new mine started below the mouth');
  assert.equal(mn.sweep(born, tokOfM(5000)).claim, null, 'a new mine paid for the past');
  assert.equal(mn.load(saved, tokOfM(5000)).anchorTok, ok.anchorTok, 'a stored anchor was overwritten');
});

test('the merge is a register: more moves wins whole, a tie goes to the larger writer', () => {
  const A = '0'.repeat(16), Z = 'f'.repeat(16);
  const one = Object.assign(mn.sweep(rec({ pick: 2, anchorTok: 0 }), tokOfM(300)).rec, { by: A });
  const two = Object.assign({}, one, { by: Z, earned: one.earned + 5 });
  assert.equal(mn.newer(two, one), true, 'a tie did not go to the larger writer');
  assert.equal(mn.newer(one, two), false);
  assert.equal(mn.newer(null, one), false);
  assert.equal(mn.newer(one, null), true);
  // merge(cur, inc): nothing coming in leaves what is there, and nothing there adopts what comes in
  assert.equal(mn.merge(one, null), one);
  assert.deepEqual(mn.merge(null, one), one);
  assert.equal(mn.merge(null, null), null);
  assert.deepEqual(mn.merge(one, two), two);
  // same() is what tells the host there is a write to make at all
  assert.equal(mn.same(one, one), true);
  assert.equal(mn.same(one, two), false);
  assert.equal(mn.same(null, null), true);
  assert.equal(mn.same(one, null), false);
  assert.equal(mn.same(one, Object.assign({}, one, { by: Z })), false);
  for (const k of mn.REC_FIELDS) {
    assert.equal(mn.same(one, Object.assign({}, one, { [k]: one[k] + 1 })), false, k + ' is not part of a record\'s identity');
  }
  // kept() is (moves, by) and nothing else: a window writes exactly one record per move count
  assert.equal(mn.kept(one, one), true);
  assert.equal(mn.kept(one, Object.assign({}, one, { earned: 0 })), true, 'kept() read the money');
  assert.equal(mn.kept(one, Object.assign({}, one, { by: Z })), false);
  assert.equal(mn.kept(one, Object.assign({}, one, { moves: one.moves + 1 })), false);
  assert.equal(mn.kept(one, null), false);
  assert.equal(mn.kept(null, one), false);
  // both halves of the trade are in the record, so netOf is the whole of what the mine did
  assert.equal(mn.netOf(null), 0);
  assert.equal(mn.netOf({ earned: 900, spent: 600 }), 300);
  assert.equal(mn.netOf({ earned: 0, spent: mn.PICKS[0].price }), -mn.PICKS[0].price);
});

// --- what the webview sees ----------------------------------------------------------------------

test('the view sends what the screen draws, and nothing beyond the lookahead', () => {
  const tok = tokOfM(1284);
  const st = mn.sweep(rec({ pick: 3, anchorTok: 0 }), tok).rec;
  const v = mn.view(st, 10000, tok, null);
  assert.equal(v.depth, mn.depthOf(st, tok));
  assert.equal(v.unit, 'm');
  assert.deepEqual(v.window, { behind: mn.BEHIND_M, ahead: mn.AHEAD_M });
  assert.equal(v.tool, 'pick');
  // WHICH RUNG IS IN HAND, which the screen draws (the colour of the swing, the cell that shows the
  // pick). `tool` cannot say it: 'pick' is the same word for a tin one and a crab one
  assert.equal(v.tier, 3, 'the view does not say which pick is in hand');
  assert.equal(v.tiers, mn.TOP_TIER, 'the screen would have to know how many rungs there are');
  assert.equal(v.pickName, mn.PICKS[2].name);
  assert.equal(v.reach, mn.reachOf(st, tok));
  assert.equal(v.found, null, 'a view with no claim behind it reported a find');
  assert.equal(v.fever, null);
  assert.deepEqual(v.offer, mn.offerFor(st, tok));
  assert.deepEqual(v.offer.opens, ['Crab idol'], 'the offer does not say what the next rung opens');
  // THE SEAMS BEYOND THE LOOKAHEAD ARE THIS SCREEN'S FACE-DOWN CARDS. A webview holding the relic
  // positions ten thousand metres out is holding the rest of the deck (games/README.md, section 2)
  for (const s of v.seam) {
    assert.ok(s.at > v.depth, 'a seam behind the face was sent to be drawn');
    assert.ok(s.at <= v.depth + mn.AHEAD_M, 'a seam beyond the lookahead was sent: ' + s.at);
    assert.deepEqual(Object.keys(s).sort(), ['at', 'kind', 'locked'],
      'a seam carried more than where it is, what it is, and whether this pick opens it');
    assert.equal(s.pay, undefined, 'a seam in the wall carried its price');
    // the flag is the host's reading of the gate, not a guess from the kind: it is what the claim
    // will do when the face reaches that cell
    assert.equal(s.locked, !mn.takes(v.tier, mn.seamAt(s.at / CELL)), 'a seam was flagged against the wrong key');
  }
  assert.ok(v.seam.length <= Math.floor(mn.AHEAD_M / CELL) + 1);
  // and the window really does hold something, often enough to be the reason to come back
  let seen = 0;
  for (let d = 0; d < 4000; d += 7) if (mn.seamsAhead(d, v.tier).length) seen += 1;
  assert.ok(seen > 400, 'the lookahead is almost always empty: only ' + seen + ' of 572 depths held a seam');
  console.log('      a seam is in the window at ' + pct(seen / Math.ceil(4000 / 7)) + ' of depths');
  // WHAT IS LOCKED IS STILL DRAWN, and the same set is drawn at every tier: a tin pick sees the
  // idol it cannot lift, which is the reason to fit the next rung
  const bare = mn.seamsAhead(v.depth, mn.FIST);
  assert.deepEqual(bare.map((s) => s.at), v.seam.map((s) => s.at), 'the wall is a different wall per tier');
  assert.ok(bare.filter((s) => s.locked).length >= v.seam.filter((s) => s.locked).length,
    'bare hands were shown fewer locked seams than a steel pick');
  // the pay table for the ? fold, with the odds NOT in it: how dense the rock is belongs with the
  // layout the host withholds. `needs` names the rung, so the fold holds no tier table of its own
  assert.equal(v.pays.length, mn.SEAMS.length);
  for (const p of v.pays) assert.deepEqual(Object.keys(p).sort(), ['kind', 'locked', 'name', 'needs', 'pay']);
  for (let i = 0; i < mn.SEAMS.length; i++) {
    const s = mn.SEAMS[i], row = v.pays[i];
    assert.equal(row.needs, s.gate ? mn.pickOf(s.gate).name : null, s.name + ' names the wrong rung');
    assert.equal(row.locked, s.gate > v.tier, s.name + ' is locked against the wrong key');
    assert.equal(row.odds, undefined, 'the odds travelled with the pay table');
  }
  // ...and a reader with no pick is told the same table with more of it out of reach
  const poor = mn.paysFor(mn.FIST);
  assert.equal(poor.filter((p) => p.locked).length, mn.SEAMS.filter((s) => s.gate > 0).length);
  assert.ok(poor.filter((p) => !p.locked).length > 0, 'bare hands are shown a table they can take nothing from');
});

test('the view tells the screen what just came out of the wall, once', () => {
  const st = rec({ pick: 4, anchorTok: 0 });
  const tok = tokOfM(600);
  const r = mn.sweep(st, tok);
  const v = mn.view(r.rec, 0, tok, r.claim);
  assert.ok(v.found, 'a claim that paid reported no find');
  assert.equal(v.found.pay, r.claim.pay, 'the find line did not carry the claim\'s money');
  assert.equal(v.found.n, r.claim.finds.length);
  let top = null;
  for (const f of r.claim.finds) if (!top || f.pay > top.pay) top = f;
  assert.equal(v.found.name, top.name, 'the find line did not name the biggest thing in the claim');
  // ...and a redraw with no claim behind it says nothing, which is what stops a reload celebrating
  // a find from last week. The event is the handler's; the record keeps only the tally
  assert.equal(mn.view(r.rec, 0, tok, null).found, null);
  assert.equal(r.rec.finds, r.claim.finds.length);
  assert.ok(r.rec.best > 0 && r.rec.best === top.pay, 'the best find was not kept');
});

test('bare hands are a comparison and not a field', () => {
  const t1 = mn.PICKS[0];
  const st = rec({ pick: 1, anchorTok: 0 });
  const spent = t1.durMt * MT + 1;
  const v = mn.view(st, 0, spent, null);
  assert.equal(v.tool, 'claw', 'a spent pick still stood at the face');
  assert.equal(v.reach, 0, 'a spent pick still reached');
  // THE TIER IS THE TOOL AND NOT THE RECEIPT. The record still says `pick: 1`, because that is what
  // the one-way ladder offers the next rung off, but what is in hand is the fist and what the wall
  // gives it is tier 0's rows
  assert.equal(st.pick, 1, 'the record forgot what was bought');
  assert.equal(v.tier, mn.FIST, 'a spent pick was still sent as a rung');
  assert.equal(v.pickName, null, 'bare hands were given a name');
  assert.equal(mn.tierOf(st, spent), mn.FIST);
  // and the drift goes on getting deeper, an eighth as fast. The reach line sitting ON the face is
  // how the screen says this, with no number anywhere (docs/game-panels.md 5-15)
  assert.ok(mn.depthOf(st, spent + tokOfM(80)) > mn.depthOf(st, spent), 'bare hands dug nothing at all');
  assert.equal(mn.depthOf(st, spent + tokOfM(80)) - mn.depthOf(st, spent), 10);
  // a reader who has bought nothing is at the mouth with their hands, which is the opening state
  const fresh0 = mn.view(rec({}), 0, 0, null);
  assert.equal(fresh0.depth, 0);
  assert.equal(fresh0.tool, 'claw');
  assert.equal(fresh0.tier, mn.FIST);
  assert.equal(fresh0.offer.price, mn.PICKS[0].price);
  assert.equal(fresh0.offer.reach, mn.PICKS[0].durMt * 10, 'the first offer promised something other than its own row');
  // ...and the gems are what it can take, which is why the screen is not dead on its first open
  assert.ok(fresh0.pays.some((p) => !p.locked), 'a new reader can take nothing out of the wall');
});

// --- the hash: the one thing an enumeration cannot see -------------------------------------------

test('the layout is uniform over the buckets and does not correlate with the next metre', () => {
  // (a) assumed a uniform, independent bucket per cell. Every pay in it is exact GIVEN that, and
  // this is the only thing in the file that is measured rather than enumerated. The model is
  // test/slots.test.js and test/wheel.test.js: the table is solved and the dealer is sampled.
  const N = 64000 * (Number(process.env.MN_MC) || 10);
  const seen = new Array(B).fill(0);
  for (let c = 1; c <= N; c++) seen[mn.bucketOf(c)] += 1;
  const want = N / B;
  let chi = 0;
  for (const n of seen) chi += ((n - want) * (n - want)) / want;
  // 63 degrees of freedom: 92.0 at p = 0.01, 112.3 at p = 0.001. A bound of 150 fails a hash with a
  // real bias and passes the sampling noise of an honest one
  console.log('      ' + num(N) + ' cells over ' + B + ' buckets: chi-square ' + chi.toFixed(1) + ' on 63 df (bound 150)');
  assert.ok(chi < 150, 'the bucket spread is not uniform: chi-square ' + chi.toFixed(1));

  // ...and the RAW layer's neighbours are independent. Measured on the raw pay rather than on
  // seamAt's, because the spacing rule puts a real negative correlation into seamAt on purpose (a
  // relic clears its neighbours) and measuring that layer would be measuring the rule
  const raw = new Array(N + 4);
  for (let c = 1; c <= N + 3; c++) { const s = mn.rawAt(c); raw[c] = s ? s.pay : 0; }
  for (const lag of [1, 2, 3]) {
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, n = 0;
    for (let c = 1; c + lag <= N; c++) {
      const x = raw[c], y = raw[c + lag];
      sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y; n += 1;
    }
    const cov = sxy / n - (sx / n) * (sy / n);
    const sd = Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
    const r = cov / sd;
    console.log('      lag ' + lag + ' correlation of the raw pay: ' + r.toFixed(5));
    assert.ok(Math.abs(r) < 0.02, 'cell pays correlate at lag ' + lag + ': r = ' + r.toFixed(5));
  }
  // the spacing rule, on the other hand, is SUPPOSED to be visible: a relic's neighbours are empty
  let after = 0, relics = 0;
  for (let c = 2; c <= N; c++) {
    const s = mn.seamAt(c);
    if (s && s.kind === 'relic') { relics += 1; if (mn.seamAt(c + 1)) after += 1; }
  }
  assert.ok(relics > 0);
  assert.equal(after, 0, 'the spacing rule is not in seamAt at all');
});

// --- run ----------------------------------------------------------------------------------------
let failed = 0;
for (const t of tests) {
  try {
    const r = t.fn();
    if (r && typeof r.then === 'function') throw new Error('async test in a sync runner');
    console.log('PASS ' + t.name);
  } catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + ((e && e.stack) || e)); }
}
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
