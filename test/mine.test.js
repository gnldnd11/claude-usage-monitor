// The credit mine: the ruler, the stone, the hundred-step ladder, the layout, the bag and the
// ceiling. No dependencies: node's assert only. Run: node test/mine.test.js
//
// This game has no round, so the casino's 96-97% band is not what is proved here (games/README.md,
// section 7). Five claims stand in its place and each one has its own block below:
//
//   (a) net pay per token has a ceiling, at every step   'the ceiling'
//   (b) a stretch yields once, and a gem is sold once    'yielded once' / 'sold once'
//   (c) steps do not overlap, and a pick is for ever     'the ladder'
//   (d) the ground is monotone                           test/credits.test.js (weightedTotal)
//   (e) one claim walks a bounded number of cells         'the budget'
//
// (a) IS AN ENUMERATION AND NOT A SIMULATION. The seam table is 64 buckets a cell and the spacing
// rule reads three cells around one, so the exact expectation is a sum over the table crossed with
// whether a relic stands on either side: 512 cases, done below as exact rationals over BUCKETS^6.
// The one thing that enumeration believes and cannot check is that the layout hash really is the
// uniform, uncorrelated thing it assumed, and that is the only claim this file samples for ('the
// hash', at the end).
//
// AND IT IS RUN ONCE PER STEP, ALL FIVE HUNDRED OF THEM. A step is a key (the seam table's `gate`) and
// it is also a speed (`WORK`), and the rate is linear in the second and a step function of the
// first, so the ceiling has to be held against the worst step rather than against an argument about
// which one that is.
//
// NO CEILING IS WRITTEN AS A LITERAL HERE. The 200% is mine.js's own EARN_CAP and the credits a
// token earns is credits.js's own CREDIT_UNIT, so this file cannot drift into agreeing with itself:
// games/README.md section 7 records what a literal cost once, when an `rtp < 0.98` quietly became a
// tautology after the fee it was measuring moved.
'use strict';
const assert = require('assert/strict');
const path = require('path');
const mn = require(path.join(__dirname, '..', 'mine.js'));
const credits = require(path.join(__dirname, '..', 'credits.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const B = mn.BUCKETS;
const CELL = mn.CELL_M;
const TOP = mn.TOP_STEP;

// A record the way the STORE would hand one back. Since 1.41.0 there is nothing to fill in: a
// `step` is the whole of what tool is in hand, so a record is its fields and nothing is derived
// from a second one
const rec = (over) => Object.assign(mn.fresh('', 0), over || {});
// Tokens that break `m` stones at that step, which is also `m` metres of drift
const tokFor = (step, m) => m * mn.workOf(step);
const pct = (x) => (x * 100).toFixed(4) + '%';
const num = (x) => Math.round(x).toLocaleString('en-US');

// The seams standing in (fromCell, toCell] THAT `step` IS THE KEY TO, summed WITHOUT the engine's
// claim, so a claim can be held against something that was not produced by the code under test.
// The gate is read off the table here rather than through mine.takes, which is the function the
// claim itself uses: a sum that called it would agree with the engine about the gate by
// construction, and the gate is half of what these tests are about
function sumCells(fromCell, toCell, step) {
  let worth = 0, n = 0, fevers = 0, locked = 0;
  const got = new Array(mn.ROWS).fill(0);
  for (let c = fromCell + 1; c <= toCell; c++) {
    const s = mn.seamAt(c);
    if (!s) continue;
    if (step < s.gate) { locked += 1; continue; }
    if (s.kind === 'fever') { fevers += 1; continue; }
    worth += s.pay; n += 1; got[mn.SEAMS.indexOf(s)] += 1;
  }
  return { worth, n, fevers, locked, got };
}
// The first cell at or after `from` holding a row of this name, which the layout being a pure
// function of the metre makes a lookup rather than a search for luck
function cellOf(name, from) {
  for (let c = (from || 1); c < 2000000; c++) { const s = mn.seamAt(c); if (s && s.name === name) return c; }
  throw new Error('no ' + name + ' in two million cells');
}

// --- the ruler, the stone and the ladder ---------------------------------------------------------

test('a stone is a metre, and the ladder rises in both its columns', () => {
  assert.equal(mn.STONE_M, 1, 'a stone is not a metre, so the depth is not a stone count');
  assert.equal(mn.FIST_DIV, 8);
  // THE READER'S OWN UNIT. The first step breaks a stone in ten swings, which is the sentence the
  // whole ladder was asked for in ("ten swings, then nine"), and a swing is a unit of WORK
  assert.equal(mn.swingsOf(1), 10, 'the first step does not break a stone in ten swings');
  assert.ok(mn.swingsOf(TOP) >= 2, 'the top step breaks a stone in under two swings');
  assert.ok(mn.swingsOf(1) > mn.swingsOf(TOP), 'the ladder is not faster at the top');
  // ...AND THE RATIO IS EXACT, WHICH IS WHAT HOLDS THE TWO CONSTANTS TOGETHER. `swingsOf` rounds,
  // so "ten swings" survives a TOK_PER_SWING left behind when WORK moved: at half the work and the
  // old swing unit a stone is five swings and the line above would read 5 and fail, but a ruler
  // moved by anything less than 10% would round back to ten and pass. This is the division itself
  assert.equal(mn.workOf(1), mn.TOK_PER_SWING * 10,
    'the first step is not exactly ten swings: WORK and TOK_PER_SWING have come apart');
  assert.equal(mn.swingsOf(TOP), 4, 'the top step is not four swings a stone');
  // a swing is a unit of WORK and it has to be a real fraction of a stone, or the screen's own
  // "ten swings, then nine" would be a count of something invisible
  assert.ok(mn.TOK_PER_SWING >= 1 && mn.workOf(TOP) >= mn.TOK_PER_SWING,
    'the top step breaks a stone in under one swing');
  // bare hands are the floor and they are FIST_DIV of the first step, which is the one thing on
  // this screen that is unchanged since the mine was built
  assert.equal(mn.FIST_WORK, mn.workOf(1) * mn.FIST_DIV);
  // the two curves are integer tables, not formulas: Math.pow is not bit-identical between
  // engine versions and the depth is derived from the work curve.
  // THERE IS NO THIRD COLUMN. A step buys a speed and a key, and both are kept for good, so a
  // durability table reappearing here is this whole release coming back
  for (let s = 1; s <= TOP; s++) {
    assert.ok(Number.isSafeInteger(mn.workOf(s)) && mn.workOf(s) > 0, 'step ' + s + ' has no work figure');
    assert.ok(Number.isSafeInteger(mn.priceOf(s)) && mn.priceOf(s) > 0, 'step ' + s + ' has no price');
    if (s > 1) {
      assert.ok(mn.workOf(s) <= mn.workOf(s - 1), 'step ' + s + ' is slower than the one below it');
      assert.ok(mn.priceOf(s) >= mn.priceOf(s - 1), 'step ' + s + ' costs less than the one below it');
    }
  }
  assert.equal(mn.DUR_M, undefined, 'there is a durability table again');
  assert.equal(mn.durMOf, undefined, 'there is a durability row again');
  assert.equal(mn.reachOf, undefined, 'there is a reach again');
  assert.ok(mn.REC_FIELDS.every((k) => !/^dur/.test(k)), 'the record carries a durability: ' + mn.REC_FIELDS);
  // the ladder is one way and the top repeats, which is what makes "a rising price" true
  assert.equal(mn.nextStep(0), 1);
  assert.equal(mn.nextStep(TOP), TOP, 'the top step does not repeat');
  for (let s = 1; s < TOP; s++) assert.equal(mn.nextStep(s), s + 1);
  // step 0 is the fist: not a row, and the only state with no pick in it
  assert.equal(mn.hasStep(0), false);
  assert.equal(mn.workOf(0), 0);
  assert.equal(mn.priceOf(TOP + 1), 0);
  console.log('      work ' + mn.workOf(1) + ' -> ' + mn.workOf(TOP) + ' tokens a stone ('
    + (mn.workOf(1) / mn.workOf(TOP)).toFixed(3) + 'x), swings ' + mn.swingsOf(1) + ' -> ' + mn.swingsOf(TOP));
  console.log('      price ' + num(mn.priceOf(1)) + ' -> ' + num(mn.priceOf(TOP))
    + ' cr, whole ladder ' + num(mn.PRICE.reduce((a, b) => a + b, 0)) + ' cr, and every step is kept');
});

test('a step is a key: the gate column is a ladder with both ends on it', () => {
  // The two ends are the ones a retune can break without any figure moving, and mine.js THROWS on
  // either of them at load rather than only being tested here (its own conditions block)
  const byStep = [];
  for (const g of [0].concat(mn.BANDS)) byStep.push(mn.SEAMS.filter((s) => mn.takes(g, s)));
  assert.ok(byStep[0].length > 0, 'bare hands take nothing out of the wall');
  assert.ok(byStep[0].every((s) => s.kind === 'gem'), 'bare hands take more than gems');
  // EVERY BAND IS A SUPERSET OF THE ONE BELOW IT, which is what makes the ladder one way
  for (let i = 1; i < byStep.length; i++) {
    for (const s of byStep[i - 1]) assert.ok(byStep[i].indexOf(s) >= 0, s.name + ' was taken away by a dearer step');
  }
  assert.ok(byStep[byStep.length - 1].length > byStep[byStep.length - 2].length,
    'the top band opens nothing the band below it cannot take');
  // EVERY GATE IS A BAND'S FIRST STEP, or the screen has a look with no set of rows behind it
  for (const s of mn.SEAMS) {
    assert.ok(Number.isInteger(s.gate) && s.gate >= 0 && s.gate <= TOP, s.name + ' is behind a step off the ladder');
    if (s.gate) assert.ok(mn.BANDS.indexOf(s.gate) >= 0, s.name + ' is gated between two bands');
  }
  // ...and the band a step wears is the one its gates say it is
  assert.equal(mn.bandOf(0), 0);
  for (let i = 0; i < mn.BANDS.length; i++) {
    assert.equal(mn.bandOf(mn.BANDS[i]), i + 1, 'the band boundary is not the gate');
    if (mn.BANDS[i] > 1) assert.equal(mn.bandOf(mn.BANDS[i] - 1), i, 'a step below a gate wears the band above it');
  }
  console.log('      gates: ' + mn.SEAMS.map((s) => s.name + ' ' + (s.gate ? 'step ' + s.gate : 'hands')).join(' · '));
});

test('the window is the size the screen measured, and a reply moves a visible part of it', () => {
  // 20 credits is webview.js's CC_LANDING_JUMP, the measured "even the busiest stretch rarely earns
  // this much between two pushes". mine.js states the metres; the division is done here so the two
  // cannot drift apart, and it is done AT THE FASTEST STEP because that is the worst case
  assert.equal(mn.PUSH_M, Math.floor(20 * credits.CREDIT_UNIT / mn.workOf(TOP)), 'PUSH_M is not 20 credits of ground');
  assert.equal(mn.REPLY_M, Math.floor(mn.REPLY_TOK / mn.workOf(TOP)), 'REPLY_M is not a reply of ground');
  // the screen splits the drift 40% / 60%, so the two halves are at one scale only in 2:3
  assert.equal(mn.AHEAD_M * 2, mn.BEHIND_M * 3, 'the window is not the screen\'s 2:3');
  // A SEAM IS ON SCREEN FOR SIX ORDINARY REPLIES, IN TOKENS. The engine holds this on REPLY_TOK
  // rather than on the floored REPLY_M for the reason mine.js gives: a reply moves 4.996 m and
  // REPLY_M says 4, so the floored form would pass a window a fifth narrower than six replies
  assert.ok(mn.REPLY_TOK * 6 <= mn.AHEAD_M * mn.workOf(TOP),
    'a seam is on screen for fewer than six ordinary replies');
  // ...and it is the BINDING line, which is this release's whole claim: one metre wider and the
  // lookahead would be holding slack again. Checked by taking a metre off it
  assert.ok(mn.REPLY_TOK * 6 > (mn.AHEAD_M - 1) * mn.workOf(TOP),
    'the lookahead is wider than six replies need: the window is carrying slack again');
  // AN ORDINARY REPLY IS WALKED AND THE HEAVIEST PUSH IS RUN. The two sides of the dash, which is
  // what replaced `PUSH_M * 2 <= AHEAD_M`: the window no longer has to be wide enough to walk a
  // month of backlog, because a month of backlog is not walked
  assert.ok(mn.REPLY_M <= mn.DASH_M, 'an ordinary reply is drawn as a run');
  assert.ok(mn.PUSH_M > mn.DASH_M, 'the heaviest push is drawn as a walk');
  assert.ok(mn.DASH_M * 2 <= mn.AHEAD_M, 'the dash runs for less than a seventh of the rock');
  // ...AND A STONE IS A METRE, which is what makes the two comparable at all: the panel counts
  // stones (`broke`) and this file counts metres, and the dash threshold is one line in both
  assert.equal(mn.STONE_M, 1, 'a stone is not a metre: the dash threshold means two things now');
  // WHAT THE BAND IS WORTH IN PIXELS, which is the reading this release was asked for. 156px is
  // the measured band at a 250px sidebar (docs/game-panels.md), and the identity being checked is
  // that a reply is 3 x bandPx / (5 x six) of it whatever the ruler does -- see mine.js's header
  const BAND = 156, span = mn.AHEAD_M + mn.BEHIND_M;
  const px = (step) => mn.REPLY_TOK / mn.workOf(step) * BAND / span;
  assert.ok(px(TOP) > 15 && px(1) > 6, 'a reply is worth fewer pixels than the window promises');
  for (const step of [1, TOP]) {
    const m = mn.REPLY_TOK / mn.workOf(step);
    console.log('      step ' + String(step).padStart(3) + ': a reply moves ' + m.toFixed(2)
      + ' m = ' + px(step).toFixed(2) + ' px = ' + pct(m / mn.AHEAD_M) + ' of the rock, '
      + Math.floor(m) + ' stone(s), seen for ' + (mn.AHEAD_M / m).toFixed(1) + ' replies');
  }
  console.log('      the dash takes over at ' + mn.DASH_M + ' stones; the heaviest push is '
    + mn.PUSH_M + ' m and is always run');
  // ONE MARKER AT A TIME. A cell wider than the window is what makes the measured 24px and 48px
  // spacings unbreakable, and it is why the old "two markers would touch" pair is gone
  assert.ok(CELL >= mn.AHEAD_M, 'two markers can be on screen at once');
  assert.ok(CELL <= mn.AHEAD_M * 2, 'the lookahead is empty more often than not');
  // HOW OFTEN THERE IS SOMETHING TO LOOK AT, which is this screen's reason to come back. Two
  // thirds of depths have a cell boundary inside the lookahead and two thirds of cells hold a
  // standing seam, so the product is a little under a half; measured over four hundred cells it is
  // the figure printed below. A cell wider than the window is what costs the other half, and the
  // trade is that a marker is never crowded by another one
  let seen = 0, tried = 0, most = 0;
  for (let d = 0; d < 40000; d += 7) {
    tried += 1;
    const n = mn.seamsAhead(d, TOP).length;
    if (n) seen += 1;
    if (n > most) most = n;
  }
  // MORE OFTEN THAN NOT, which is the requirement as mine.js actually states it ("an empty
  // lookahead is the one thing this screen cannot afford"). The old bound of a quarter was weaker
  // than the sentence it was testing: it passed a cell twice the lookahead, which is 31% and less
  // than the 38.9% that was rejected by name when the window was last chosen
  assert.ok(seen > tried * 0.5, 'the lookahead is empty more often than not: ' + seen + ' of ' + tried);
  // ...AND NEVER TWO AT ONCE, walked rather than argued. This is the condition that used to need a
  // pixel figure and a sidebar width: with CELL_M at the lookahead there is no second marker to
  // space against at ANY width, so the 24px and 48px spacings cannot be broken by a narrow sidebar
  assert.equal(most, 1, 'two markers stood in the lookahead at once: the spacing rule is back');
  for (const step of [1, TOP]) {
    assert.ok(Math.floor(mn.REPLY_TOK / mn.workOf(step)) >= 1,
      'a reply does not break a stone at step ' + step);
  }
  console.log('      a seam is in the window at ' + pct(seen / tried) + ' of depths, never two at once');
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
  // ...and a fever is never a thing in the bag, which is the one row that is not sellable
  for (let i = 0; i < mn.ROWS; i++) {
    assert.equal(mn.sellable(i), mn.SEAMS[i].pay > 0, mn.SEAMS[i].name + ' is sellable or not against its pay');
  }
  console.log('      ' + odds + ' of ' + B + ' buckets hold something; ' + (B - odds) + ' are barren rock');
});

test('a standing relic has nothing in the cell before or after it', () => {
  // The spacing rule, walked rather than reasoned about. This is the condition the screen cannot
  // keep for itself: a panel that nudged a marker sideways to stop it overlapping would be drawing
  // a seam at a depth it is not at
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
  for (const c of [1, 2, 7, 64, 65, 1000, 123456, 4294967297]) {
    assert.equal(mn.seamAt(c), mn.seamAt(c), 'cell ' + c + ' answered twice differently');
    assert.ok(mn.bucketOf(c) >= 0 && mn.bucketOf(c) < B, 'cell ' + c + ' hashed outside the buckets');
  }
  assert.ok(mn.bucketOf(4294967297) !== mn.bucketOf(1) || mn.bucketOf(8589934593) !== mn.bucketOf(1),
    'the high word of a cell number is not mixed in');
  assert.equal(mn.seamAt(0), null, 'cell 0 holds something');
  assert.equal(mn.seamAt(-3), null, 'a cell below the mouth holds something');
  // AND IT IS THE SAME LAYOUT AT EVERY STEP. A step changes what comes OUT of the wall, never what
  // is in it: a drift that rearranged itself per step would be a different drift for every pick
  for (const d of [0, 137, 4096]) {
    const a = mn.seamsAhead(d, 1).map((s) => s.at + ':' + s.kind);
    const b = mn.seamsAhead(d, TOP).map((s) => s.at + ':' + s.kind);
    assert.deepEqual(a, b, 'the wall is a different wall at a different step');
  }
});

// --- depth: a count of stones --------------------------------------------------------------------

test('depth is the stones the work has broken, at the step that broke them', () => {
  for (const step of [1, 10, 35, 70, TOP]) {
    const st = rec({ step, anchorTok: 0 });
    assert.equal(mn.depthOf(st, 0), 0);
    // a hundred stones is a hundred metres, and what differs by step is the WORK it took
    assert.equal(mn.cutOf(st, tokFor(step, 100)), 100, 'step ' + step + ' did not cut a stone per work');
    assert.equal(mn.depthOf(st, tokFor(step, 100)), 100);
    // ...and a stone is whole: the work for 99.9 of them has broken 99
    assert.equal(mn.cutOf(st, tokFor(step, 100) - 1), 99, 'a part-broken stone counted as broken');
  }
  // A DEARER STEP GOES FURTHER ON THE SAME TOKENS, which is the whole of what the ladder buys
  const t = tokFor(1, 100);
  let last = 0;
  for (let s = 1; s <= TOP; s++) {
    const d = mn.cutOf(rec({ step: s, anchorTok: 0 }), t);
    assert.ok(d >= last, 'step ' + s + ' cut less ground than the step below it');
    last = d;
  }
  assert.ok(last > mn.cutOf(rec({ step: 1, anchorTok: 0 }), t) * 2,
    'the top step is not twice the first step\'s speed');
  // A PICK NEVER GIVES OUT, which is the whole of 1.41.0 in one line: a lifetime of work at the
  // first step cuts a stone per `work` from the first token to the last, and the hands never come
  // back. 1e12 weighted tokens is twenty thousand of this reader's days
  const st1 = rec({ step: 1, anchorTok: 0 });
  for (const m of [1, 700, 701, 2000, 201258, 1e6]) {
    assert.equal(mn.cutOf(st1, tokFor(1, m)), m, 'the pick stopped cutting at ' + m + ' m');
    assert.equal(mn.hasPick(st1), true, 'a pick that has cut ' + m + ' m is not a pick');
  }
  assert.equal(mn.cutOf(st1, 1e12), Math.floor(1e12 / mn.workOf(1)), 'a lifetime of work wore a pick out');
  assert.equal(mn.workIn(st1), mn.workOf(1), 'a stone does not cost the step\'s own work');
  // ...and with no pick at all it is the fist, at FIST_DIV times the work, from the first stone to
  // the last: step 0 is the reader who has bought nothing and it is the only state the hands are in
  const bare = rec({ step: 0, anchorTok: 0 });
  assert.equal(mn.cutOf(bare, mn.FIST_WORK * 10), 10, 'bare hands cut at a pick\'s speed');
  assert.equal(mn.cutOf(bare, mn.FIST_WORK * 1e6), 1e6, 'bare hands changed pace somewhere');
  assert.equal(mn.workIn(bare), mn.FIST_WORK);
  assert.equal(mn.hasPick(bare), false, 'no pick read as a pick');
  assert.equal(mn.hasPick(null), false);
  // the bonus is part of the depth and is NOT re-cut
  assert.equal(mn.depthOf(rec({ step: 1, anchorTok: 0, bonus: 240 }), tokFor(1, 100)), 340);
  // THE DEPTH IS MONOTONE IN THE TOKEN COUNT. There is one floor and one divisor now, so this is
  // true for the plainest reason there is, and it is still walked because every figure the money
  // is worked out from rests on it
  let prev = -1;
  for (let k = 0; k < 4000; k++) {
    const d = mn.cutOf(st1, Math.floor(tokFor(1, 700) - 2000 + k * 100));
    assert.ok(d >= prev, 'the depth went backwards');
    prev = d;
  }
});

test('the stone in hand is reported in swings, and it belongs to the tool in hand', () => {
  const st = rec({ step: 1, anchorTok: 0 });
  assert.deepEqual(mn.stoneOf(st, 0), { at: 0, of: 10 }, 'a fresh stone is not ten swings');
  assert.deepEqual(mn.stoneOf(st, mn.TOK_PER_SWING * 7), { at: 7, of: 10 }, 'seven swings did not read as seven');
  // a stone that is broken rolls over to the next one rather than overflowing
  assert.deepEqual(mn.stoneOf(st, mn.workOf(1)), { at: 0, of: 10 });
  assert.deepEqual(mn.stoneOf(st, mn.workOf(1) + mn.TOK_PER_SWING), { at: 1, of: 10 });
  // AND THE STONE BELONGS TO THE TOOL, which is one tool for the whole of a record's life: the
  // stone the work is going into is the same size at the first token and at the thousand-millionth
  assert.deepEqual(mn.stoneOf(st, tokFor(1, 1e6) + mn.TOK_PER_SWING * 4), { at: 4, of: 10 },
    'the stone changed size somewhere down the drift');
  // BARE HANDS ARE A STONE OF THEIR OWN, eight times the work, and reading the pick's stone there
  // would draw a bar that fills eight times too fast
  const hands = rec({ step: 0, anchorTok: 0 });
  assert.equal(mn.stoneOf(hands, 0).of, mn.swingsOf(1) * mn.FIST_DIV, 'bare hands kept a pick\'s stone');
  assert.deepEqual(mn.stoneOf(hands, mn.TOK_PER_SWING * 3), { at: 3, of: 80 });
  // ...and a faster step has a shorter stone
  assert.ok(mn.stoneOf(rec({ step: TOP, anchorTok: 0 }), 0).of < mn.stoneOf(st, 0).of,
    'the top step\'s stone takes as many swings as the first step\'s');
  // the pair never runs past itself, whatever the store says
  for (const bad of [undefined, null, NaN, -1, 1.5, '900', Infinity]) {
    const o = mn.stoneOf(st, bad);
    assert.ok(o.at >= 0 && o.at <= o.of, 'a count of ' + String(bad) + ' made a stone of ' + JSON.stringify(o));
  }
});

test('the token count is clamped, because it is not monotone between two windows', () => {
  const st = rec({ step: 1, anchorTok: tokFor(1, 500), anchorDepth: 500 });
  assert.equal(mn.usedOf(st, tokFor(1, 400)), 0, 'a stale count cut a negative distance');
  assert.equal(mn.depthOf(st, tokFor(1, 400)), 500, 'a stale count moved the face back');
  assert.equal(mn.depthOf(st, tokFor(1, 600)), 600);
  for (const bad of [undefined, null, NaN, -1, 1.5, '900', Infinity]) {
    assert.equal(mn.usedOf(st, bad), 0, 'a count of ' + String(bad) + ' was believed');
  }
  assert.equal(mn.sweep(rec({ step: 1, anchorTok: tokFor(1, 500), claimedTo: 480 }), tokFor(1, 400)).claim, null);
});

// --- (a) THE CEILING -----------------------------------------------------------------------------

// Exact rationals over B^6, for ONE STEP: the rows the gate opens to it and no others.
//
// THE 512 CASES, folded. A cell's own bucket is independent of its neighbours', so the expectation
// factorises and the three conditions are these:
//   a relic stands             the cell below is not a relic            (B - R) / B
//   a gem or fever stands      no relic stands either side of it
//       below: isRelic(c-1) && !isRelic(c-2)                            R(B - R) / B^2
//       above: isRelic(c+1) && !isRelic(c), and c is not a relic         R / B
//     so (1 - R(B-R)/B^2)(1 - R/B) = (B^2 - R(B-R))(B - R) / B^3
//
// `R` IS EVERY RELIC BUCKET AND NOT ONLY THE ONES THIS STEP CAN TAKE. The spacing rule reads the
// LAYOUT (mine.js, seamAt), which is the same drift at every step, so an idol a first-step pick
// cannot lift still clears the cells beside it and still keeps the gems there off this sum
const Bb = BigInt(B);
const DEN = Bb ** 6n;
function enumerate(step) {
  let gemSum = 0n, relicSum = 0n, rawSum = 0n, relicOdds = 0n, feverOdds = 0n;
  for (const s of mn.SEAMS) {
    const o = BigInt(s.odds), p = BigInt(s.pay);
    if (s.kind === 'relic') relicOdds += o;               // the layout, gate or no gate
    if (step < s.gate) continue;                          // the wall keeps it from this step
    rawSum += o * p;
    if (s.kind === 'relic') relicSum += o * p;
    else if (s.kind === 'fever') feverOdds += o;
    else gemSum += o * p;
  }
  const R = relicOdds;
  const standOther = (Bb * Bb - R * (Bb - R)) * (Bb - R);        // over B^3
  // E[credits a DUG cell yields], over B^6
  const eDug = relicSum * (Bb - R) * Bb * Bb * Bb * Bb           // relicSum/B x (B-R)/B
    + gemSum * standOther * Bb * Bb;                             // gemSum/B x standOther/B^3
  // E[cells a dug cell's fever gives away], over B^5
  const cells = feverOdds * standOther * BigInt(mn.FEVER_M / CELL) * Bb;
  // ...and what those cells can yield. AN UPPER BOUND AND NOT THE EXPECTATION, on purpose: a
  // granted cell sits right after the fever that granted it, so its neighbours are conditioned and
  // the exact figure is a shade above E[dug]. The bound is this STEP's own mean with the spacing
  // rule thrown away, rawSum/B, and it is rigorous because a cell's bucket is independent of its
  // neighbours' and the rule only ever REMOVES a seam
  const eGrant = cells * rawSum;                                 // over B^6
  return { eDug, eGrant, earnPerCell: eDug + eGrant };
}

test('(a) what the mine yields per token has a ceiling, enumerated exactly, at all five hundred steps', () => {
  const cap = BigInt(mn.EARN_CAP_NUM), capDen = BigInt(mn.EARN_CAP_DEN);
  const cu = BigInt(credits.CREDIT_UNIT);
  const rates = [];
  let worst = 0, worstAt = 0;
  for (let step = 0; step <= TOP; step++) {
    const { earnPerCell } = enumerate(step);
    // the ledger's own side: one cell of drift is CELL_M stones and a stone is work(step) weighted
    // tokens, which is work x CELL_M / CREDIT_UNIT credits of ordinary earning. BARE HANDS PAY
    // FIST_DIV TIMES THE WORK for the same cell, so step 0 is measured against its own figure and
    // not against a pick's: that was wrong until 1.41.0 and it overstated the fist's rate eightfold
    const work = BigInt(step === 0 ? mn.FIST_WORK : mn.workOf(step));
    const ledgerPerCell = BigInt(CELL) * work;                   // over CREDIT_UNIT
    //    earnPerCell / DEN   <=   cap / capDen   x   ledgerPerCell / CREDIT_UNIT
    assert.ok(earnPerCell * capDen * cu <= DEN * ledgerPerCell * cap,
      'step ' + step + ' is over the ceiling of ' + mn.EARN_CAP_NUM + '/' + mn.EARN_CAP_DEN);
    const rate = Number(earnPerCell) / Number(DEN) / (Number(ledgerPerCell) / credits.CREDIT_UNIT);
    rates.push(rate);
    if (rate > worst) { worst = rate; worstAt = step; }
  }
  // A FASTER, BETTER-KEYED STEP NEVER YIELDS LESS per token, so the worst step is the top one and
  // the margin under the cap is the room the table has to be retuned in
  for (let s = 2; s <= TOP; s++) {
    assert.ok(rates[s] >= rates[s - 1] - 1e-12, 'step ' + s + ' yields less per token than the step below it');
  }
  assert.equal(worstAt, TOP, 'the worst step is not the top one: the enumeration found something odd');
  assert.ok(rates[TOP] > rates[1] * 2, 'the ladder hardly changes what a token is worth');
  for (const s of [0, 1, 10, 35, 70, TOP]) {
    const e = enumerate(s);
    console.log('      step ' + String(s).padStart(3) + ': ' + (Number(e.eDug) / Number(DEN)).toFixed(4)
      + ' cr a dug cell + ' + (Number(e.eGrant) / Number(DEN)).toFixed(4) + ' of fever ground, rate '
      + pct(rates[s]));
  }
  console.log('      ceiling ' + mn.EARN_CAP_NUM + '/' + mn.EARN_CAP_DEN + ', worst step ' + worstAt
    + ' at ' + pct(worst) + ', margin ' + pct(mn.EARN_CAP_NUM / mn.EARN_CAP_DEN - worst));
  // ...AND THE BAND IS TWO-SIDED. The line above is the only one that can refuse a table, so on its
  // own a table of zeroes passes the whole block -- and that is not a theoretical worry, it is what
  // 1.41.0 shipped: 12.108% against an allowance of 15 was 81% of the ceiling, and under the 200%
  // ceiling the same table is 6% of it. The reader's words were that the ore is far too cheap, and
  // THE CHEAPNESS WAS A NUMBER NOTHING IN THIS FILE WAS LOOKING AT.
  //
  // So the worst step has to come in at four fifths of the ceiling or better. That is a real
  // constraint on a retune and it is meant to be: the seam table is tuned UP to this line (mine.js,
  // SEAMS), the pays are whole credits over 64 buckets so the grain is coarse, and a fifth of the
  // ceiling is the room that leaves. It also catches the other half of the cell: a lookahead
  // widened without the table following it would drop the realised rate and nothing else here
  // would say so
  const top = enumerate(TOP).earnPerCell;
  const ledgerTop = BigInt(CELL) * BigInt(mn.workOf(TOP));
  assert.ok(top * capDen * cu * 5n >= DEN * ledgerTop * cap * 4n,
    'the mine yields under four fifths of what the ceiling allows (' + pct(worst) + ' of '
    + pct(mn.EARN_CAP_NUM / mn.EARN_CAP_DEN) + '): the table is being left behind its own ceiling');
});

// THE MUTATION THIS RELEASE WAS ONE EDIT AWAY FROM, IN BOTH DIRECTIONS. The ceiling and the pay
// table are ONE CHANGE (1.42.0: the ceiling went 15% -> 200% and the table went up sixteenfold),
// and the enumeration above passes whatever they are because it reads both of them off the engine.
// Either half on its own is a shipped defect with nothing to say so:
//
//   the ceiling alone   a mine allowed 200% and paying 12%, which is the screen the reader
//                       rejected, with the line that was supposed to stop it moved for nothing
//   the table alone     a mine paying sixteen times what its own ceiling allows, which is the
//                       balance earning credits out of the game rather than out of the work
//
// So both halves are frozen as literals here -- 1.41.0's five pays and 1.41.0's 15/100 -- and each
// one has to disagree with the engine in the right direction. These are the exact figures a merge,
// a revert or a careless hand would put back.
const PAYS_1_41 = Object.freeze([1, 2, 3, 7, 26, 0]);
const CAP_1_41 = Object.freeze({ num: 15, den: 100 });

test('(a) the ceiling and the pay table are one change, and each half fails without the other', () => {
  const cap = BigInt(mn.EARN_CAP_NUM), capDen = BigInt(mn.EARN_CAP_DEN);
  const cu = BigInt(credits.CREDIT_UNIT);
  assert.notDeepEqual(mn.SEAMS.map((s) => s.pay), PAYS_1_41.slice(),
    'the pay table is 1.41.0\'s again: the ceiling was raised and the table was not');
  assert.ok(mn.EARN_CAP_NUM * CAP_1_41.den !== CAP_1_41.num * mn.EARN_CAP_DEN,
    'the ceiling is 1.41.0\'s again: the table was raised and the ceiling was not');
  // the same fold as `enumerate`, with the pays handed in rather than read off the table. Held
  // beside the real one at the current pays, so this is not a second implementation drifting
  const fold = (pays, step) => {
    let gem = 0n, relic = 0n, raw = 0n, R = 0n, fever = 0n;
    mn.SEAMS.forEach((s, i) => {
      const o = BigInt(s.odds), p = BigInt(s.kind === 'fever' ? 0 : pays[i]);
      if (s.kind === 'relic') R += o;
      if (step < s.gate) return;
      raw += o * p;
      if (s.kind === 'relic') relic += o * p;
      else if (s.kind === 'fever') fever += o;
      else gem += o * p;
    });
    const Bb = BigInt(B);
    const standOther = (Bb * Bb - R * (Bb - R)) * (Bb - R);
    return relic * (Bb - R) * Bb * Bb * Bb * Bb + gem * standOther * Bb * Bb
      + fever * standOther * BigInt(mn.FEVER_M / CELL) * Bb * raw;
  };
  const now = mn.SEAMS.map((s) => s.pay);
  for (const step of [0, 1, mn.BANDS[2], mn.BANDS[3], TOP]) {
    assert.equal(fold(now, step), enumerate(step).earnPerCell,
      'the fold used here does not agree with the one the ceiling is proved with');
  }
  // the rate of a table at a step, as a Number, with the same two sides the ceiling is proved over
  const rateOf = (pays, step) => {
    const work = BigInt(step === 0 ? mn.FIST_WORK : mn.workOf(step));
    return Number(fold(pays, step)) / Number(DEN) / (Number(BigInt(CELL) * work) / credits.CREDIT_UNIT);
  };
  // HALF ONE: the ceiling raised, the table left behind. 1.41.0's five pays under THIS ceiling, at
  // every step, and the best of them has to be a small fraction of what it is allowed -- that is
  // the screen the reader rejected, and the number is why they were right to
  let bestOld = 0, bestAt = 0;
  for (let step = 0; step <= TOP; step++) {
    const r = rateOf(PAYS_1_41, step);
    if (r > bestOld) { bestOld = r; bestAt = step; }
  }
  const capNum = mn.EARN_CAP_NUM / mn.EARN_CAP_DEN;
  assert.ok(bestOld * 4 < capNum,
    '1.41.0\'s pay table would come within a quarter of this ceiling: the sixteenfold raise is not '
    + 'in the table any more and only the line moved');
  // HALF TWO: the table raised, the ceiling left behind. THIS table under 1.41.0's 15/100, which
  // has to break at substantially every step and not just at the top: one step over the line could
  // be a rounding artefact, the whole ladder over it is what a sixteenfold raise looks like
  let over = 0, firstOver = -1, worst = 0;
  for (let step = 0; step <= TOP; step++) {
    const earn = fold(now, step);
    const work = BigInt(step === 0 ? mn.FIST_WORK : mn.workOf(step));
    const ledgerPerCell = BigInt(CELL) * work;
    if (earn * BigInt(CAP_1_41.den) * cu > DEN * ledgerPerCell * BigInt(CAP_1_41.num)) {
      over += 1;
      if (firstOver < 0) firstOver = step;
    }
    worst = Math.max(worst, rateOf(now, step));
  }
  assert.ok(over >= TOP, 'only ' + over + ' step(s) of this table would break 1.41.0\'s 15/100 '
    + 'ceiling: the table has fallen back to something the old line would have allowed');
  // ...and the sum that is actually being proved above, printed: the two halves and the pair
  console.log('      1.41.0\'s table under this ceiling: ' + pct(bestOld) + ' at step ' + bestAt
    + ', which is ' + (bestOld / capNum * 100).toFixed(1) + '% of an allowance of ' + pct(capNum));
  console.log('      this table under 1.41.0\'s ceiling: ' + over + ' of ' + (TOP + 1)
    + ' steps over it, from step ' + firstOver + ', worst ' + pct(worst) + ' against '
    + pct(CAP_1_41.num / CAP_1_41.den));
  // the cap the block read is the engine's and not a literal that drifted into agreeing with it
  assert.equal(Number(cap) / Number(capDen), capNum);
});

test('(a) every step is recovered by the ground it digs, and a row beats a speed bump', () => {
  // WHAT A STEP IS WORTH, NOW THAT A PICK IS FOR EVER. There is no "does it pay for itself" left to
  // ask: a step brings in the extra credits its extra speed is worth from the moment it is fitted
  // until the reader stops working, so every price is recovered by SOME amount of work and the
  // figure that means anything is HOW MUCH. That is the one this block measures, and it replaces
  // 1.41.0's ratio over the pick's own durability, which cannot be computed for a pick that has
  // none.
  //
  // THE WORK THAT RECOVERS STEP s, AS AN EXACT RATIONAL. A token at step s yields
  // eDug(s) / (DEN x CELL_M x work(s)) credits, so what the step ADDS over the step below it is
  //     gain(s) = eDug(s)/W(s-1 denom...) - eDug(s-1)/...
  // and over the common denominator DEN x CELL_M x W(s) x W(s-1) the numerator is
  //     eDug(s) x W(s-1) - eDug(s-1) x W(s)
  // which is positive exactly when the step really is faster per credit. Step 1's baseline is the
  // FIST, at FIST_DIV times the first step's work, because that is what a first pick replaces.
  //
  // MEASURED AGAINST E[dug] ALONE, which keeps it a LOWER bound: the ground a fever gives away is
  // a bonus on top, and `eGrant` is an upper bound rather than an expectation (see `enumerate`), so
  // counting it here would be an optimistic answer to a question about what is promised
  const W = (s) => BigInt(s >= 1 ? mn.workOf(s) : mn.FIST_WORK);
  const payback = (s) => {
    const gain = enumerate(s).eDug * W(s - 1) - enumerate(s - 1).eDug * W(s);
    return { num: BigInt(mn.priceOf(s)) * DEN * BigInt(CELL) * W(s) * W(s - 1), den: gain };
  };
  // a < b, cross-multiplied: both denominators are the gains and both are asserted positive first
  const sooner = (a, b) => a.num * b.den < b.num * a.den;
  const toks = (p) => Number(p.num) / Number(p.den);
  const curve = [];
  for (let s = 1; s <= TOP; s++) {
    const p = payback(s);
    // EVERY STEP IS FASTER PER CREDIT THAN THE ONE BELOW IT. This is the only line here that is a
    // rule, and it is what makes the rest of the block mean anything: a step whose gain was 0 or
    // negative would be a purchase no amount of digging ever recovers
    assert.ok(p.den > 0n, 'step ' + s + ' adds nothing a token can recover its price with');
    curve.push({ s, p, toks: toks(p) });
  }
  // THE FIRST PICK IS THE BEST PURCHASE ON THE LADDER, and it has to be: it is the one the screen
  // opens on, and it is the only step that replaces the fist rather than another pick, so it buys
  // the whole FIST_DIV at the price of the cheapest rung
  for (let s = 2; s <= TOP; s++) {
    assert.ok(sooner(curve[0].p, curve[s - 1].p), 'step ' + s + ' is recovered sooner than the first pick');
  }
  // A ROW OF THE TABLE BEATS ANY SPEED BUMP NEAR IT. The gates that open a PAYING row are read off
  // the table rather than listed, and each one has to be recovered sooner than the step below it
  // and the step above it: that is what "a pick is a key" is worth in credits.
  // THE FEVER'S GATE IS NOT IN HERE and cannot be: what a fever gives is GROUND, which is `eGrant`
  // and deliberately not counted above, so on this measure step 10 is an ordinary speed step
  const paying = mn.SEAMS.filter((s) => s.gate > 0 && s.pay > 0).map((s) => s.gate);
  assert.ok(paying.length >= 2, 'no gated row pays anything: this block is measuring nothing');
  for (const g of paying) {
    assert.ok(sooner(curve[g - 1].p, curve[g - 2].p), 'gate step ' + g + ' is dearer than the step below it');
    assert.ok(sooner(curve[g - 1].p, curve[g].p), 'gate step ' + g + ' is dearer than the step above it');
  }
  // ...and the curve itself, printed rather than asserted: THIS is the figure to read when the
  // price ladder is retuned. 52.4 MT a day is this reader's own measured pace (mine.js's header)
  const days = (t) => (t / 52.4e6).toFixed(1);
  for (const s of [1, 2, 10, 35, 70, TOP]) {
    const c = curve[s - 1];
    console.log('      step ' + String(s).padStart(3) + ': ' + num(mn.priceOf(s)) + ' cr recovered by '
      + num(c.toks / mn.workOf(s)) + ' m of digging (' + days(c.toks) + ' days of this reader\'s work)');
  }
  const worst = curve.reduce((a, b) => (a.toks >= b.toks ? a : b));
  console.log('      the slowest to recover is step ' + worst.s + ' at ' + days(worst.toks)
    + ' days, which is the top of the ladder being bought for speed and for the look of the pick');
});

// --- (b) YIELDED ONCE ----------------------------------------------------------------------------

test('(b) a stretch yields once: the second claim of the same ground is nothing', () => {
  const st = rec({ step: TOP, anchorTok: 0 });
  const tok = tokFor(TOP, 3000);
  const first = mn.sweep(st, tok);
  assert.ok(first.claim, 'three thousand metres yielded nothing');
  assert.notEqual(first.rec, st, 'sweep mutated or returned its argument');
  assert.equal(st.claimedTo, 0, 'sweep mutated its argument');
  // NO CREDITS MOVED. The wall yields gems and the credits arrive when the reader sells
  assert.equal(first.rec.earned, 0, 'the wall paid credits straight into the balance');
  assert.equal(mn.netOf(first.rec), 0, 'a claim moved the balance');
  // what is in the bag is exactly what stands in the stretch, counted without the engine
  const want = sumCells(0, first.claim.to / CELL, TOP);
  assert.deepEqual(first.rec.got, want.got, 'the bag is not what stands in the ground');
  assert.equal(first.claim.worth, want.worth, 'the claim is not worth what stands in the ground');
  assert.equal(first.rec.finds, want.n);
  // ...and the same ground again is null, not zero: there is no second claim to make
  assert.equal(mn.sweep(first.rec, tok).claim, null, 'the same ground yielded twice');
  assert.equal(mn.sweep(first.rec, tok).rec, first.rec, 'a claim with nothing to do still wrote');
});

test('(b) the claims tile the drift: no cell is skipped and no cell is in two of them', () => {
  // The strongest form of (b) there is. `claimedTo` is a BOUNDARY rather than a list of what was
  // taken, and this is the property that makes one number able to say all of it: the taken ground
  // is always a prefix, so the claims are intervals laid end to end
  let st = rec({ step: TOP, anchorTok: 0 });
  let at = 0, worth = 0, n = 0, claims = 0;
  for (let step = 1; step <= 200; step++) {
    const tok = tokFor(TOP, step * 137);           // 137 m a push: not a multiple of a cell
    for (;;) {
      const r = mn.sweep(st, tok);
      if (!r.claim) break;
      assert.equal(r.claim.from, at, 'claim ' + claims + ' did not start where the last one ended');
      assert.ok(r.claim.to > r.claim.from, 'a claim moved the boundary nowhere');
      at = r.claim.to;
      worth += r.claim.worth;
      n += r.claim.finds.length;
      claims += 1;
      st = r.rec;
      if (!r.claim.more) break;
    }
    assert.equal(st.claimedTo, at);
    assert.ok(at <= mn.depthOf(st, tok), 'the boundary ran past the face');
  }
  const want = sumCells(0, at / CELL, TOP);
  assert.equal(worth, want.worth, 'the claims and the ground disagree about the worth');
  assert.equal(n, want.n, 'the claims and the ground disagree about the count');
  assert.deepEqual(st.got, want.got, 'the bag and the ground disagree');
  assert.ok(st.bonus > 0, 'not one fever fired over twenty-seven thousand metres');
  assert.equal(st.bonus % mn.FEVER_M, 0, 'a fever gave a part of a grant');
  assert.ok(st.bonus <= want.fevers * mn.FEVER_M, 'more ground was given than there are fevers to give it');
  console.log('      ' + claims + ' claims tiled ' + num(at) + ' m: ' + num(want.n) + ' finds worth '
    + num(want.worth) + ' cr, ' + want.fevers + ' fevers worth ' + num(st.bonus) + ' m');
});

test('(b) a claim that loses the merge takes its gems AND its boundary back', () => {
  // The record is adopted whole or dropped whole, which is only true because MAX_FIELDS is empty.
  // Max `got` and a dropped claim's gems survive next to a boundary that says the ground is still
  // there: that is the 372,000 bug with a bag in its hand instead of a sword
  assert.deepEqual(mn.MAX_FIELDS.slice(), [], 'MAX_FIELDS is not empty: see mine.js');
  const A = 'a'.repeat(16), Z = 'f'.repeat(16);
  const base = rec({ step: TOP, anchorTok: 0 });
  const mine = Object.assign(mn.sweep(base, tokFor(TOP, 3000)).rec, { by: A });
  let other = base;
  for (let i = 0; i < 3; i++) other = mn.sweep(other, tokFor(TOP, 1000 * (i + 1) + 3000)).rec;
  other = Object.assign({}, other, { by: Z });
  assert.ok(other.moves > mine.moves);
  const landed = mn.merge(mine, other);
  assert.equal(mn.kept(mine, landed), false, 'the losing record was reported as kept');
  assert.deepEqual(landed.got, other.got, 'the loser\'s gems survived the merge');
  assert.equal(landed.claimedTo, other.claimedTo, 'the loser\'s boundary survived the merge');
  // ...and they fall together, which is the whole point: a boundary behind the bag would hand the
  // same ground over twice, and a bag behind the boundary would be ground taken and lost
  assert.equal(mn.netOf(landed), other.earned - other.spent);
  assert.deepEqual(mn.merge(other, mine), landed);
  assert.deepEqual(mn.merge(landed, mine), landed);
  assert.deepEqual(mn.merge(landed, other), landed);
  // the merged record's bag is a COPY: a host holding what it merged cannot reach into the record
  landed.got[0] += 99;
  assert.notEqual(other.got[0], landed.got[0], 'the merge handed back the winner\'s own array');

  // AND NOTHING IS UNIONED, which the pair above cannot show on its own: the window that dug
  // further has everything the other one has, so a merge that took the larger count per row would
  // come out identical. THIS is the case that tells them apart. The window that wins here has an
  // EMPTY bag, because what it did was buy rather than dig, so a union would leave it holding gems
  // that only the dropped claim ever saw
  const digger = Object.assign({}, mn.sweep(base, tokFor(TOP, 3000)).rec, { by: A });
  const buyer = Object.assign({}, base, { by: Z, moves: digger.moves + 1, spent: 10 });
  assert.ok(digger.got.some((n) => n > 0) && buyer.got.every((n) => n === 0));
  const won = mn.merge(digger, buyer);
  assert.equal(mn.kept(digger, won), false, 'the claim did not lose this merge');
  assert.deepEqual(won.got, buyer.got, 'the merge unioned the two bags');
  assert.deepEqual(won.sold, buyer.sold, 'the merge unioned the two sold counts');
  assert.equal(won.claimedTo, buyer.claimedTo, 'the gems went back but the boundary did not');
  // ...and the same the other way up: a window that SOLD loses to one that did not, and the sale
  // goes with it rather than leaving a count behind
  const sellRow = digger.got.findIndex((n, i) => n > 0 && mn.sellable(i));
  const sold = Object.assign({}, mn.act(digger, { op: 'sell', kind: sellRow }, 0), { by: A });
  const quiet = Object.assign({}, base, { by: Z, moves: sold.moves + 1 });
  const won2 = mn.merge(sold, quiet);
  assert.deepEqual(won2.sold, quiet.sold, 'the dropped sale left its count behind');
  assert.equal(won2.earned, quiet.earned, 'the dropped sale left its credits behind');
});

// --- (b) SOLD ONCE -------------------------------------------------------------------------------

test('(b) a gem is sold once, and the rate does not care when', () => {
  const st = mn.sweep(rec({ step: TOP, anchorTok: 0 }), tokFor(TOP, 3000)).rec;
  const row = st.got.findIndex((n, i) => n > 0 && mn.sellable(i));
  assert.ok(row >= 0, 'nothing was found to sell');
  const held = mn.heldOf(st, row);
  const price = mn.SEAMS[row].pay;
  const after = mn.act(st, { op: 'sell', kind: row }, 0);
  assert.equal(after.earned, st.earned + held * price, 'the sale did not pay the table\'s price');
  assert.equal(after.sold[row], held, 'the sale was not written down');
  assert.equal(after.got[row], st.got[row], 'the sale took the gems out of the found count');
  assert.equal(mn.heldOf(after, row), 0, 'the gems are still in hand after being sold');
  // THE SECOND SALE IS NOTHING. `sold` only rises and what is held is the difference, so there is
  // nothing left to sell and the refusal says so rather than paying zero
  assert.equal(mn.whyNotSell ? mn.whyNotSell(after, { kind: row }) : mn.whyNot(after, { op: 'sell', kind: row }, null), 'nothing to sell');
  assert.equal(mn.act(after, { op: 'sell', kind: row }, 0), after, 'the same gems were sold twice');
  // HOARDING IS WORTH NOTHING, which is what keeps the ceiling where it is: the rate is the table's
  // and it is fixed, so selling one at a time and selling the lot come to the same credit
  let drip = st;
  for (let i = 0; i < held; i++) {
    const one = Object.assign({}, drip, { got: drip.got.slice(), sold: drip.sold.slice() });
    one.got[row] = one.sold[row] + 1;                 // exactly one in hand
    drip = Object.assign({}, mn.act(one, { op: 'sell', kind: row }, 0), { got: drip.got.slice() });
    drip.sold = drip.sold.slice();
  }
  assert.equal(drip.earned, held * price, 'selling one at a time paid a different rate');
  // ...and a row with nothing in it is refused rather than written
  const empty = st.got.findIndex((n) => n === 0);
  if (empty >= 0) assert.equal(mn.act(st, { op: 'sell', kind: empty }, 0), st, 'an empty row was sold');
});

test('(b) a sale that loses the merge takes the credits back with the gems', () => {
  // THE MOST DANGEROUS CORNER IN THIS CHANGE: a window sells, loses the merge, and the question is
  // what happens to credits that were already paid. The answer is the market's: both halves of the
  // trade are fields of ONE record, so the winning record carries its own `sold` and its own
  // `earned` and the loser's sale simply did not happen. The gems are back in the bag to prove it
  const A = '0'.repeat(16), Z = 'f'.repeat(16);
  const base = mn.sweep(rec({ step: TOP, anchorTok: 0 }), tokFor(TOP, 3000)).rec;
  const row = base.got.findIndex((n, i) => n > 0 && mn.sellable(i));
  const seller = Object.assign({}, mn.act(base, { op: 'sell', kind: row }, 0), { by: A });
  assert.ok(seller.earned > 0);
  // the other window dug on instead, so it has more moves and wins
  let other = base;
  for (let i = 0; i < 3; i++) other = mn.sweep(other, tokFor(TOP, 1000 * (i + 1) + 3000)).rec;
  other = Object.assign({}, other, { by: Z });
  const landed = mn.merge(seller, other);
  assert.equal(mn.kept(seller, landed), false);
  assert.equal(landed.earned, other.earned, 'the dropped sale\'s credits survived the merge');
  assert.equal(landed.sold[row], other.sold[row], 'the dropped sale was still written down');
  assert.ok(mn.heldOf(landed, row) > 0, 'the gems of a dropped sale are gone from the bag as well');
  // the invariant that makes the pair safe at all: sold never runs ahead of got, in any record the
  // merge can produce
  for (const r of [seller, other, landed]) {
    for (let i = 0; i < mn.ROWS; i++) assert.ok(r.sold[i] <= r.got[i], 'sold ran ahead of got');
  }
  console.log('      a dropped sale: ' + seller.earned + ' cr and ' + seller.sold[row]
    + ' sold became ' + landed.earned + ' cr and ' + landed.sold[row] + ', with '
    + mn.heldOf(landed, row) + ' back in the bag');
});

// --- (c) THE LADDER ------------------------------------------------------------------------------

test('(c) fitting a step replaces the anchor: two in a row cannot add the same ground twice', () => {
  const tok = mn.FIST_WORK * 300;
  const st = rec({ step: 0, anchorTok: 0 });
  const before = mn.depthOf(st, tok);
  assert.equal(before, 300);
  const one = mn.act(st, { op: 'buy' }, tok);
  assert.equal(one.step, 1);
  assert.equal(mn.depthOf(one, tok), before, 'fitting a pick moved the face');
  const two = mn.act(one, { op: 'buy' }, tok);
  assert.equal(two.step, 2);
  assert.equal(mn.depthOf(two, tok), before, 'the second pick added a stretch of its own');
  assert.equal(two.spent, mn.priceOf(1) + mn.priceOf(2));
  assert.equal(two.anchorTok, tok, 'the anchor was not replaced');
  // ...and from here on there is ONE stretch being cut, not two
  assert.equal(mn.depthOf(two, tok + tokFor(2, 100)), before + 100, 'the picks cut the same ground twice');
});

test('(c) a step costs its price and nothing else: there is no early and no late', () => {
  // WHAT 1.41.0 TOOK OUT. A pick used to be worth an amount of digging, so fitting one carried the
  // last one's remainder over (1.41.0) to stop the best play being "wait until it breaks". Neither
  // the loss nor the fix is here any more: there is no remainder, because there is nothing to spend
  const st = mn.act(rec({ step: 0, anchorTok: 0 }), { op: 'buy' }, 0);
  assert.equal(st.step, 1);
  assert.equal(st.spent, mn.priceOf(1), 'the first pick cost something other than its price');
  assert.equal(st.durM, undefined, 'a purchase wrote a durability');
  const offer = mn.offerFor(st);
  assert.deepEqual(Object.keys(offer).sort(), ['opens', 'price', 'step', 'swings', 'tier']);
  assert.equal(offer.reach, undefined, 'the offer still says how far the new pick will get');
  assert.equal(offer.name, undefined, 'the offer still carries a name');
  assert.equal(offer.lose, undefined, 'the offer still carries what it used to throw away');
  // THE SAME PURCHASE AT EVERY MOMENT. A step bought on the first token and the same step bought
  // after a million metres leave records that differ only in where they are anchored, so there is
  // no moment that is the right one to press at
  const early = mn.act(st, { op: 'buy' }, 0);
  const late = mn.act(st, { op: 'buy' }, tokFor(1, 1e6));
  assert.equal(early.step, late.step);
  assert.equal(early.spent, late.spent, 'buying later cost a different price');
  for (const r of [early, late]) {
    assert.equal(mn.cutOf(r, r.anchorTok + tokFor(2, 500)), 500, 'the new pick cuts at the wrong rate');
  }
  // ...and the ladder is still one way and still charged once per step
  const up3 = mn.act(late, { op: 'buy' }, tokFor(1, 1e6));
  assert.equal(up3.step, 3);
  assert.equal(up3.spent, mn.priceOf(1) + mn.priceOf(2) + mn.priceOf(3), 'a step was charged twice or not at all');
});

test('(c) a stale window cannot move the anchor back and dig the same ground again', () => {
  // THE ONE WAY A PURCHASE COULD STILL MINT GROUND. Two windows hold ledgers of different ages, so
  // the count one of them reads can be LOWER than the count that anchored the pick. An anchor moved
  // back to it would hand the new, faster step work that has already been done, and that work would
  // be cut a second time at the new rate: the depth would jump on a purchase
  const anchor = tokFor(1, 500);
  const done = tokFor(1, 90);
  const fitted = rec({ step: 1, anchorTok: anchor, anchorDepth: 500 });
  const truth = anchor + done;
  const fresh = mn.act(fitted, { op: 'buy' }, truth);          // bought at the true count
  const stale = mn.act(fitted, { op: 'buy' }, anchor - done);  // bought off an older ledger
  assert.equal(stale.anchorTok, anchor, 'a stale count moved the anchor back');
  assert.equal(fresh.anchorTok, truth);
  // the stale window believes the face is 90 m shallower, which is its own ledger being behind and
  // not a loss: the ground is a function of the count and the count catches up
  assert.equal(mn.depthOf(stale, anchor - done), 500);
  assert.equal(mn.depthOf(fresh, truth), 590);
  // ...AND NEITHER ONE CUTS THE SAME GROUND TWICE. Read at the true count, the stale record's face
  // is exactly the 90 m it had already dug plus what the new step cuts from there
  // The work the stale window had not seen is measured at the NEW step's rate rather than at the
  // old one's, which is the same arrangement as before this release and is bounded by how far
  // behind that window's ledger is: 90 m of step-1 work is 90 m at step 2. What it may never be is
  // that ground counted twice
  assert.equal(mn.depthOf(stale, truth), 500 + Math.floor(done / mn.workOf(2)));
  assert.ok(mn.depthOf(stale, truth) >= mn.depthOf(fresh, truth), 'this test is not measuring what it says');
  assert.ok(mn.depthOf(stale, truth) < 590 + 90, 'a stale purchase dug the same ninety metres twice');
});

test('(c) a step is not maxed across a merge: a dropped purchase takes the pick with it', () => {
  const A = '0'.repeat(16), Z = 'f'.repeat(16);
  const base = rec({ step: 1, anchorTok: 0 });
  const buyer = Object.assign(mn.act(base, { op: 'buy' }, 0), { by: A });
  let other = base;
  for (let i = 1; i <= 2; i++) other = mn.sweep(other, tokFor(1, i * 300)).rec;
  other = Object.assign({}, other, { by: Z });
  assert.ok(other.moves > buyer.moves && other.step < buyer.step);
  const landed = mn.merge(buyer, other);
  assert.equal(mn.kept(buyer, landed), false);
  assert.equal(landed.step, other.step, 'the dropped purchase\'s pick survived the merge');
  assert.equal(landed.spent, other.spent, 'the dropped purchase was charged for anyway');
  // the pair that has to fall together is the step and what was paid for it, and both are fields of
  // one record, so the winning record carries its own
  assert.equal(mn.netOf(landed), other.earned - other.spent);
});

test('(c) the top of the ladder is not sold again, however many times it is pressed', () => {
  // THE CREDIT SINK THE READER FOUND ON 1.40.0. The top step is offered again for ever (nextStep
  // repeats it) and the money rule only looks at the balance, so pressing the button at the top
  // took the price over and over while nothing on the screen could change.
  // IT IS ONE CONDITION NOW. The two that read the token count were both about a pick running out
  const top = rec({ step: TOP, anchorTok: 0 });
  assert.deepEqual(mn.opensFor(top, TOP), [], 'the top step opens something after all');
  assert.equal(mn.sealed(top), true, 'a purchase with no possible result was not sealed');
  assert.equal(mn.offerFor(top), null, 'the button was offered a purchase with no result');
  assert.equal(mn.view(top, 1e9, 0, null, -1).offer, null, 'the screen was sent an offer with no result');
  // AND THE HOST REFUSES IT, not the screen. A hidden button is not a rule
  assert.equal(mn.whyNot(top, { op: 'buy' }, 1e9), 'nothing is sold above this step');
  assert.equal(mn.act(top, { op: 'buy' }, 0), top, 'the sealed purchase went through anyway');
  assert.equal(mn.act(top, { op: 'buy' }, 0).spent, 0, 'the sealed purchase was charged for');
  // AND IT NEVER LIFTS. On 1.41.0 the seal came and went with the wear on the pick, so the top step
  // was refused and then offered again; now the top of the ladder is the top of the ladder at every
  // token count and at every depth
  for (const tok of [0, tokFor(TOP, 1e6), 1e12]) {
    assert.equal(mn.sealed(top), true);
    assert.equal(mn.view(top, 1e9, tok, null, -1).offer, null, 'the top step was offered again at ' + tok);
  }
  const deep = rec({ step: TOP, anchorTok: 0, bonus: 400000 });
  assert.ok(mn.depthOf(deep, 0) > mn.AHEAD_M * 100);
  assert.equal(mn.sealed(deep), true, 'a deep drift unsealed a purchase with no result');
});

test('(c) every step below the top is sold, because a step is also a speed', () => {
  // What keeps a hundred-step ladder buyable: a real step up breaks stones in fewer tokens, and
  // that always shows on the screen whether it opens a row or not. Only four of the hundred open a
  // row, so a seal that asked for one would refuse 96 of them
  for (const s of [0, 1, 2, 9, 10, 34, 35, 69, 70, 99]) {
    const st = rec({ step: s, anchorTok: 0 });
    assert.equal(mn.sealed(st), false, 'step ' + s + ' was sealed with a step still above it');
    assert.ok(mn.offerFor(st), 'step ' + s + ' was offered nothing');
    assert.equal(mn.whyNot(st, { op: 'buy' }, 1e9), null, 'step ' + s + ' was refused');
    assert.equal(mn.offerFor(st).step, s + 1, 'the offer is not the next step up');
    assert.ok(mn.offerFor(st).swings <= mn.swingsOf(s || 1), 'the next step is not faster');
  }
});

// --- the gate at the claim -----------------------------------------------------------------------

function claimAt(cell, step) {
  const st = rec({ step, anchorTok: 0, anchorDepth: (cell - 1) * CELL, claimedTo: (cell - 1) * CELL });
  return mn.sweep(st, tokFor(step, CELL));
}

test('the wall keeps what the key does not open, and gives it up at the step that does', () => {
  for (const s of mn.SEAMS) {
    if (!s.gate) continue;
    const c = cellOf(s.name, 1);
    const row = mn.SEAMS.indexOf(s);
    // the step below the gate: nothing. Not a smaller yield, nothing at all
    const shut = claimAt(c, s.gate - 1);
    assert.ok(shut.claim, 'a cell nobody can take claimed nothing at all: the boundary has to move');
    assert.equal(shut.claim.worth, 0, s.name + ' yielded to a step that cannot take it');
    assert.equal(shut.claim.finds.length, 0, s.name + ' was reported as a find to a step that cannot take it');
    assert.equal(shut.claim.grant, 0, s.name + ' gave ground to a step that cannot take it');
    assert.equal(shut.rec.got[row], 0, 'a locked row went into the bag');
    assert.equal(shut.rec.finds, 0, 'a locked row was counted in the tally');
    // ...and the step at the gate takes it
    const open = claimAt(c, s.gate);
    if (s.kind === 'fever') {
      assert.equal(open.claim.grant, mn.FEVER_M, 'the fever gave no ground to the step that opens it');
      assert.equal(open.claim.to, (c + mn.FEVER_M / CELL) * CELL, 'the grant was not claimed by its own write');
      assert.equal(open.rec.got[row], 0, 'a fever went into the bag as a thing');
    } else {
      assert.equal(open.claim.worth, s.pay, s.name + ' did not yield its own price');
      assert.equal(open.rec.got[row], 1, s.name + ' did not go into the bag');
      assert.equal(open.claim.finds.length, 1);
      assert.equal(open.claim.finds[0].row, row, 'the find named the wrong row');
    }
    console.log('      ' + s.name + ' at cell ' + c + ': step ' + (s.gate - 1) + ' takes '
      + shut.claim.worth + ' cr, step ' + s.gate + ' takes ' + open.claim.worth + ' cr'
      + (s.kind === 'fever' ? ' and ' + open.claim.grant + ' m of ground' : ''));
  }
});

test('a locked seam the face has passed does not come back when the next band is fitted', () => {
  // THE HARSH HALF OF THE GATE, and it is claim (b)'s shape rather than a penalty bolted on: the
  // boundary is ONE NUMBER, so a cell is behind it the moment the claim passes it. A list of the
  // cells that were left would be the union-across-two-copies the forge minted 372,000 credits out
  // of. The screen says so in advance instead: the seam was drawn with `locked` on it
  const idol = mn.SEAMS.filter((s) => s.gate === mn.BANDS[mn.BANDS.length - 1])[0];
  const c = cellOf(idol.name, 1);
  const shut = claimAt(c, 1);
  assert.equal(shut.claim.worth, 0);
  assert.ok(shut.rec.claimedTo >= c * CELL, 'the boundary did not pass the cell it could not take');
  const up = Object.assign({}, shut.rec, { step: idol.gate });
  assert.equal(mn.sweep(up, tokFor(idol.gate, CELL)).claim, null, 'ground behind the boundary was taken twice');
  assert.equal(claimAt(c, idol.gate).claim.worth, idol.pay, 'the step that opens it still cannot take it');
});

test('the lookahead flags what the key does not open, at the depth where it matters', () => {
  const idol = mn.SEAMS.filter((s) => s.gate === mn.BANDS[mn.BANDS.length - 1])[0];
  const c = cellOf(idol.name, 10);
  const depth = c * CELL - CELL / 2;                 // half a cell short: inside the lookahead
  const here = (step) => mn.seamsAhead(depth, step).filter((s) => s.at === c * CELL)[0];
  assert.ok(here(mn.FIST), 'the idol is not in the window at this depth: pick another');
  assert.equal(here(mn.FIST).locked, true, 'bare hands were told they could take the idol');
  assert.equal(here(1).locked, true, 'the first step was told it could take the idol');
  assert.equal(here(idol.gate).locked, false, 'the step that opens it was told it could not');
  assert.equal(here(mn.FIST).row, mn.SEAMS.indexOf(idol), 'the marker did not name its row');
  assert.equal(here(mn.FIST).at, here(TOP).at, 'the position changed with the key');
  console.log('      the ' + idol.name + ' at ' + (c * CELL) + ' m is drawn from ' + depth
    + ' m at every step, locked below step ' + idol.gate);
});

test('what a step takes out of a long stretch rises with the step, and never falls', () => {
  const CELLS = 2000;
  const seen = [];
  for (const step of [0].concat(mn.BANDS)) {
    // THE SAME STRETCH AT EVERY STEP, which no longer takes a pick chosen to survive it
    let st = rec({ step, anchorTok: 0 });
    const tok = (step ? mn.workOf(step) : mn.FIST_WORK) * CELLS * CELL;
    assert.equal(mn.depthOf(st, tok), CELLS * CELL, 'step ' + step + ' did not reach the same depth');
    let worth = 0, grant = 0;
    for (let i = 0; i < 2000; i++) {
      const r = mn.sweep(st, tok);
      if (!r.claim) break;
      worth += r.claim.worth; grant += r.claim.grant; st = r.rec;
    }
    assert.ok(st.claimedTo >= CELLS * CELL, 'the stretch was not cleared: raise the loop');
    seen.push({ step, worth, grant, locked: sumCells(0, CELLS, step).locked });
    if (seen.length > 1) {
      const prev = seen[seen.length - 2];
      assert.ok(worth >= prev.worth, 'step ' + step + ' took less than step ' + prev.step);
      assert.ok(grant >= prev.grant, 'step ' + step + ' was given less ground than step ' + prev.step);
      assert.ok(seen[seen.length - 1].locked <= prev.locked, 'step ' + step + ' had more of the wall shut');
    }
    console.log('      step ' + String(step).padStart(3) + ' over ' + num(CELLS) + ' cells: '
      + num(worth) + ' cr, ' + num(grant) + ' m of fever ground, ' + num(seen[seen.length - 1].locked)
      + ' rows left in the wall');
  }
  assert.ok(seen[seen.length - 1].worth > seen[0].worth * 2, 'the top key hardly takes more than bare hands');
  assert.equal(seen[seen.length - 1].locked, 0, 'the top key cannot take everything in the table');
  assert.ok(seen[0].worth > 0, 'bare hands took nothing at all');
});

// --- (e) THE BUDGET ------------------------------------------------------------------------------

// A BACKLOG BIG ENOUGH TO BE ONE, in cells rather than in a pick's old lifetime: twenty bites of
// the claim budget, which is 128,000 m, or about three weeks of this reader's work at the top step
const BACKLOG_M = CELL * mn.CLAIM_CELLS * 20;

test('(e) a mine left for a month takes a bite and leaves the rest', () => {
  const st0 = rec({ step: TOP, anchorTok: 0 });
  const tok = tokFor(TOP, BACKLOG_M) - 1;
  const dugCells = Math.floor((BACKLOG_M - 1) / CELL);
  assert.ok(dugCells > mn.CLAIM_CELLS * 10, 'the backlog in this test is not big enough to be one');
  const first = mn.sweep(st0, tok);
  assert.ok(first.claim, 'a backlog claimed nothing');
  assert.equal(first.claim.more, true, 'a backlog bigger than the budget said it was finished');
  const walked = (first.claim.to - first.claim.from) / CELL;
  const ceiling = mn.CLAIM_CELLS * (1 + mn.FEVER_M / CELL);
  assert.ok(walked <= ceiling, 'one claim walked ' + walked + ' cells, over its own bound of ' + ceiling);
  assert.ok(walked >= 1, 'a claim made no progress at all: this is the stall this budget must not have');
  assert.ok(first.claim.to < mn.depthOf(first.rec, tok), 'the bite claimed the whole backlog');
  console.log('      ' + num(dugCells) + ' cells of backlog: the first claim took ' + walked
    + ' (bound ' + ceiling + '), worth ' + num(first.claim.worth) + ' cr');
  let st = first.rec, bites = 1, worth = first.claim.worth, at = first.claim.to;
  while (bites < 20000) {
    const r = mn.sweep(st, tok);
    if (!r.claim) break;
    assert.equal(r.claim.from, at, 'a bite left a hole');
    at = r.claim.to; worth += r.claim.worth; st = r.rec; bites += 1;
  }
  assert.equal(mn.sweep(st, tok).claim, null, 'the backlog never cleared');
  assert.equal(worth, sumCells(0, at / CELL, TOP).worth, 'the bites and the ground disagree');
  assert.ok(bites < dugCells, 'the budget made the backlog slower than one cell a claim');
  console.log('      cleared in ' + num(bites) + ' claims (' + num(at) + ' m, ' + num(worth) + ' cr)');
});

test('a fever in the ground another fever gave is inert: the chain is broken', () => {
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
  const st = rec({ step: TOP, anchorTok: 0, anchorDepth: (f - 1) * CELL, claimedTo: (f - 1) * CELL });
  const r = mn.sweep(st, tokFor(TOP, CELL));
  assert.ok(r.claim, 'the cell holding the fever claimed nothing');
  assert.equal(r.claim.grant, mn.FEVER_M, 'the fever at cell ' + second + ' chained off the one at ' + f);
  assert.equal(r.rec.bonus, mn.FEVER_M);
  assert.equal(r.rec.claimedTo, (f + span) * CELL, 'the grant was not claimed by its own write');
  assert.ok(r.rec.claimedTo > second * CELL, 'the second fever is still in front of the boundary');
  assert.equal(mn.sweep(r.rec, tokFor(TOP, CELL)).claim, null, 'there was a second claim to make');
  console.log('      fevers at ' + f + ' and ' + second + ' (' + (second - f) + ' cells apart): one grant of ' + mn.FEVER_M + ' m');
});

test('(e) every grant is claimed by the write that gives it, whatever the backlog', () => {
  const st0 = rec({ step: TOP, anchorTok: 0 });
  const tok = tokFor(TOP, BACKLOG_M) - 1;
  let st = st0, fired = 0, claims = 0;
  for (let i = 0; i < 20000; i++) {
    const r = mn.sweep(st, tok);
    if (!r.claim) break;
    claims += 1;
    if (r.claim.grant) {
      fired += r.claim.grant / mn.FEVER_M;
      assert.equal(r.rec.bonus - st.bonus, r.claim.grant);
      assert.ok(r.claim.to >= r.claim.from + r.claim.grant, 'a grant was not claimed by its own write');
    }
    st = r.rec;
  }
  assert.ok(fired > 0, 'no fever fired over the whole backlog');
  assert.equal(st.bonus, fired * mn.FEVER_M);
  const there = sumCells(0, st.claimedTo / CELL, TOP).fevers;
  assert.ok(fired <= there, fired + ' grants from ' + there + ' fevers: something chained');
  console.log('      ' + num(claims) + ' claims, ' + fired + ' of ' + there + ' fevers fired ('
    + (there - fired) + ' stood in given ground), ' + num(st.bonus) + ' m granted');
});

// --- refusals and the moves ----------------------------------------------------------------------

test('every refusal is a sentence, and nothing off the wire can name a price or a row', () => {
  const st = rec({ step: 0 });
  assert.deepEqual(mn.OPS.slice(), ['buy', 'sell']);
  for (const bad of [undefined, null, 'dig', 'fit', '', { op: 'hit' }]) {
    const why = mn.whyNot(st, typeof bad === 'object' && bad ? bad : { op: bad }, null);
    assert.equal(why, 'unknown action', 'a move of ' + JSON.stringify(bad) + ' was not refused');
  }
  assert.equal(mn.whyNot(st, { op: 'buy' }, null), null);
  assert.equal(mn.whyNot(null, { op: 'buy' }, 1e9), 'there is nothing to spend');
  assert.equal(mn.whyNot(st, { op: 'buy' }, mn.priceOf(1) - 1), 'not enough credits');
  assert.equal(mn.whyNot(st, { op: 'buy' }, mn.priceOf(1)), null);
  // a NaN budget is a broken ledger: it refuses rather than allows
  assert.equal(mn.whyNot(st, { op: 'buy' }, NaN), 'not enough credits');
  // THE PRICE AND THE STEP ARE THIS MODULE'S, so the only field a buy may carry is the op
  const spoof = mn.act(st, { op: 'buy', price: 1, step: TOP }, 0);
  assert.equal(spoof.step, 1, 'a message chose which step to fit');
  assert.equal(spoof.spent, mn.priceOf(1), 'a message named a price');
  // ...AND A SELL'S ROW IS CHECKED AGAINST THE TABLE. Anything that is not a row, and the fever row
  // which is ground rather than a thing, is refused before anything is counted
  const bag = mn.sweep(rec({ step: TOP, anchorTok: 0 }), tokFor(TOP, 3000)).rec;
  const fever = mn.SEAMS.findIndex((s) => s.kind === 'fever');
  for (const bad of [undefined, null, -1, 1.5, '0', mn.ROWS, 1e9, fever]) {
    assert.equal(mn.whyNot(bag, { op: 'sell', kind: bad }, null), 'there is nothing of that kind',
      'a sell of row ' + String(bad) + ' was not refused');
  }
  const empty = bag.got.findIndex((n, i) => n === 0 && mn.sellable(i));
  if (empty >= 0) assert.equal(mn.whyNot(bag, { op: 'sell', kind: empty }, null), 'nothing to sell');
  // a refused move hands the very same object back, so a host can test for identity
  assert.equal(mn.act(st, { op: 'dig' }, 0), st);
  assert.equal(mn.act(bag, { op: 'sell', kind: fever }, 0), bag);
});

// --- storage -------------------------------------------------------------------------------------

test('a stored record is rebuilt field by field, and a figure outside the ceiling is nothing', () => {
  assert.equal(mn.clean(null), null, 'a reader who has never dug has a record');
  assert.equal(mn.clean('nope'), null);
  const ok = mn.act(mn.sweep(rec({ step: 10, anchorTok: 0 }), tokFor(10, 3000)).rec, { op: 'sell', kind: 0 }, 0);
  const saved = Object.assign(mn.save(ok), { by: 'a'.repeat(16) });
  const back = mn.clean(saved);
  for (const k of mn.REC_FIELDS) assert.equal(back[k], ok[k], k + ' did not survive save and clean');
  for (const k of mn.BAG_FIELDS) assert.deepEqual(back[k], ok[k], k + ' did not survive save and clean');
  assert.equal(back.by, 'a'.repeat(16));
  // save hands back COPIES of the bags, so a host that kept what it stored cannot reach in
  saved.got[0] += 7;
  assert.notEqual(mn.save(ok).got[0], saved.got[0], 'save handed over the record\'s own array');
  // a writer id outside the shape is dropped, "__proto__" included
  assert.equal(mn.clean(Object.assign({}, saved, { by: 'zz' })).by, '');
  assert.equal(mn.clean(Object.assign({}, saved, { by: '__proto__' })).by, '');
  assert.equal(Object.prototype.hasOwnProperty.call(mn.clean(JSON.parse('{"__proto__":{"x":1},"moves":1}')), 'x'), false);
  // ...and so is a figure a save could not have produced. `step` and `rungs` are the two that are
  // not simply dropped, because they are read TOGETHER: a step is a rung of a ladder of a stated
  // length, so what either one of them means depends on the other and both are checked below
  for (const k of mn.REC_FIELDS) {
    if (k === 'step' || k === 'rungs') continue;                 // read as a pair, below
    assert.equal(mn.clean(Object.assign({}, saved, { [k]: mn.REC_CEIL[k] + 1 }))[k], 0, k + ' was believed past its ceiling');
    assert.equal(mn.clean(Object.assign({}, saved, { [k]: -1 }))[k], 0, k + ' was believed negative');
    assert.equal(mn.clean(Object.assign({}, saved, { [k]: 1.5 }))[k], 0, k + ' was believed fractional');
  }
  // `rungs` IS THIS BUILD'S LADDER ON THE WAY OUT, WHATEVER CAME IN. It is the one field in the
  // record that is not a fact about the reader: it says which ladder the `step` beside it was
  // counted on, so a stored figure is read (the block below) and never kept
  for (const bad of [-1, 1.5, 0, 'nope', null, mn.REC_CEIL.rungs + 1]) {
    assert.equal(mn.clean(Object.assign({}, saved, { rungs: bad })).rungs, mn.STEPS,
      'a record came back on a ladder of ' + JSON.stringify(bad) + ' rungs');
  }
  // ...AND A STEP IS ONLY A STEP IF IT IS A RUNG OF THE LADDER IT NAMES. Past that it is a forgery
  // and reads as nothing at all, which is the fist
  assert.equal(mn.clean(Object.assign({}, saved, { rungs: 50, step: 51, pick: 0 })).step, 0,
    'a step past the end of its own ladder was believed');
  assert.equal(mn.clean(Object.assign({}, saved, { rungs: 50, step: 50, pick: 0 })).step, mn.STEPS,
    'the top of a short ladder is not the top of this one');
  // THE BAGS, ROW BY ROW, and a count that is not one a claim could have made is nothing
  for (const k of mn.BAG_FIELDS) {
    for (const bad of [[mn.MAX_COUNT + 1], [-1], [1.5], 'nope', 42, null]) {
      const c = mn.clean(Object.assign({}, saved, { [k]: bad }));
      assert.ok(c[k].every((n) => Number.isSafeInteger(n) && n >= 0), k + ' believed ' + JSON.stringify(bad));
      assert.equal(c[k].length, mn.ROWS, k + ' came back the wrong length');
    }
  }
  // SOLD CANNOT RUN AHEAD OF GOT, whatever the store says, or a forged record would be holding
  // credits it never earned
  const liar = mn.clean(Object.assign({}, saved, { got: [1, 0, 0, 0, 0, 0], sold: [9, 9, 9, 9, 9, 9] }));
  for (let i = 0; i < mn.ROWS; i++) {
    assert.ok(liar.sold[i] <= liar.got[i], 'sold ran ahead of got through clean');
    assert.equal(mn.heldOf(liar, i), 0, 'a forged sold left something in hand');
  }
  // the fever row is ground and never a thing, so a store that put one in the bag loses it
  const fever = mn.SEAMS.findIndex((s) => s.kind === 'fever');
  const bagged = Object.assign({}, saved, { got: saved.got.slice() });
  bagged.got[fever] = 5;
  assert.equal(mn.clean(bagged).got[fever], 0, 'a fever was kept in the bag');
  // a step this build does not have is no step, which is the fist and not a throw
  assert.equal(mn.clean(Object.assign({}, saved, { step: TOP + 1, pick: 0 })).step, 0);
  // AND A DURABILITY IN THE STORE IS NOT A FIELD OF THIS RECORD. Whatever is in there, from
  // whichever build wrote it, `clean` rebuilds field by field and neither figure comes across
  for (const k of ['durM', 'durTok']) {
    const back = mn.clean(Object.assign({}, saved, { [k]: 4321 }));
    assert.equal(back[k], undefined, k + ' came back out of the store');
    assert.equal(mn.save(back)[k], undefined, k + ' went back into the store');
  }
  // the mine is BORN AT THE TOKEN COUNT IT IS FIRST READ AT, so nothing is paid for work done
  // before the screen existed
  const born = mn.load(null, tokFor(1, 50000));
  assert.equal(born.anchorTok, tokFor(1, 50000));
  assert.equal(mn.depthOf(born, tokFor(1, 50000)), 0, 'a new mine started below the mouth');
  assert.equal(mn.sweep(born, tokFor(1, 50000)).claim, null, 'a new mine paid for the past');
  assert.equal(mn.load(saved, tokFor(1, 50000)).anchorTok, ok.anchorTok, 'a stored anchor was overwritten');
});

test('a record from an older build keeps the pick it paid for, and nobody\'s pick breaks', () => {
  // FOUR SHAPES ARE IN THE FIELD and all four keep the step they paid for. A reader who bought a
  // pick owns it, so the one answer that is not allowed is an empty claw.
  //
  //   1.39.0 and before   `pick` 1..4, durability derived from the tier
  //   1.40.0              `pick` 1..4 and `durTok`, the remainder in TOKENS
  //   1.41.0              `step` 1..100 and `durM`, the remainder in METRES
  //   1.42.0              `step` 1..500 and `rungs`, the length of the ladder it is a rung of
  //
  // A tier becomes the FIRST STEP OF ITS BAND, which is the step with exactly the rows that tier
  // could take: a tier-4 reader lands with the idol still open rather than losing it
  for (let tier = 1; tier <= mn.BANDS.length; tier++) {
    const base = { by: 'b'.repeat(16), moves: 4, pick: tier, anchorTok: 7, anchorDepth: 1284, claimedTo: 1280, bonus: 80, spent: 100, earned: 420, finds: 6 };
    // the same tier in all three shapes, including a 1.40.0 pick that had worn through (`durTok` 0
    // is what a broken one looked like) and a 1.41.0 one with two metres left
    for (const old of [base, Object.assign({}, base, { durTok: 0 }),
      Object.assign({}, base, { durTok: 850 * 100000 + 99999 })]) {
      const got = mn.clean(old);
      assert.equal(got.step, mn.BANDS[tier - 1], 'tier ' + tier + ' did not land on its own band');
      assert.equal(mn.bandOf(got.step), tier, 'tier ' + tier + ' changed band');
      assert.equal(mn.hasPick(got), true, 'the migrated pick came back broken');
      assert.equal(got.durM, undefined, 'the migration kept a durability');
      // the rows that tier could take are the rows this step can take
      for (const s of mn.SEAMS) {
        assert.equal(mn.takes(got.step, s), mn.BANDS.indexOf(s.gate) + 1 <= tier || s.gate === 0,
          s.name + ' changed hands on the way from tier ' + tier);
      }
    }
  }
  // THE 1.41.0 SHAPE: a `step` of its own, no `rungs` beside it, and a `durM` down to its last
  // metre. The durability is dropped, and the STEP IS THE SAME RUNG ON A LADDER FIVE TIMES AS LONG
  // (1.42.0): a step-88 pick out of a hundred comes back as step 440 out of five hundred, which is
  // the same fraction of the climb, the same stone and the same set of keys
  const v141 = mn.clean({ by: 'e'.repeat(16), moves: 9, step: 88, durM: 1, anchorTok: 11, anchorDepth: 500, claimedTo: 500, bonus: 0, spent: 700, earned: 900, finds: 3 });
  assert.equal(v141.step, 88 * mn.SUB, 'a step-88 pick out of a hundred is not step 440 out of five hundred');
  assert.equal(v141.rungs, mn.STEPS, 'the migrated record is still on the old ladder');
  assert.equal(mn.hasPick(v141), true, 'a pick with one metre left came back as bare hands');
  assert.equal(mn.cutOf(v141, 11 + tokFor(v141.step, 1000)), 1000, 'the migrated pick stopped at its old durability');
  // ...AND EVERY RUNG OF THAT LADDER LANDS ON ONE OF THIS ONE'S, with its keys and at least its
  // speed. The whole hundred, because the one that matters is whichever one the reader is on
  const W_1_41 = Object.freeze((function () {
    const o = [0, 14950];
    for (let s = 2; s <= mn.LADDER_1_41; s++) o[s] = Math.floor(o[s - 1] * 1000 / 1009);
    return o;
  })());
  for (let s = 1; s <= mn.LADDER_1_41; s++) {
    const got = mn.clean({ by: 'f'.repeat(16), moves: 2, step: s, durM: 5, anchorTok: 0 });
    assert.equal(got.step, s * mn.SUB, 'step ' + s + ' of a hundred did not land on its own rung');
    assert.ok(mn.workOf(got.step) <= W_1_41[s],
      'step ' + s + ' came back SLOWER: ' + mn.workOf(got.step) + ' tokens a stone where it was ' + W_1_41[s]);
    // the keys too: a row the old rung opened is a row the new one opens
    for (const seam of mn.SEAMS) {
      const wasOpen = s >= Math.ceil(seam.gate / mn.SUB);
      assert.equal(mn.takes(got.step, seam), wasOpen, seam.name + ' changed hands at step ' + s);
    }
  }
  // THE STORED DEPTH IS STILL THE STORED DEPTH. `anchorDepth`, `bonus` and `claimedTo` are all in
  // METRES and none of them is converted, so a record read at the token count it was anchored at
  // comes back at the depth it was written with. What the ruler moving DOES do is to the ground
  // dug since that anchor, and the test below this one is about nothing else
  assert.equal(mn.depthOf(v141, 11), 500, 'the stored depth moved');
  assert.equal(mn.depthOf(v141, 11 + tokFor(v141.step, 10)), 510, 'the drift does not go on from there');
  // ...AND A RECORD THIS BUILD WROTE IS NOT RESCALED AGAIN. It names its own ladder, so the step
  // stands exactly: without this, every read would multiply by SUB and the reader would be at the
  // top of the ladder after four reloads
  const mine142 = mn.save(rec({ step: 123, anchorTok: 11 }));
  assert.equal(mn.clean(mine142).step, 123, 'a record from this build was rescaled');
  assert.equal(mn.clean(mn.save(mn.clean(mine142))).step, 123, 'the rescale ran twice');
  const v140 = mn.clean({ by: 'c'.repeat(16), moves: 9, pick: 2, durTok: 850 * 100000 + 99999, anchorTok: 11, anchorDepth: 500, claimedTo: 500, bonus: 0, spent: 700, earned: 900, finds: 3 });
  assert.equal(mn.depthOf(v140, 11), 500, 'the stored depth moved');
  const old39 = mn.clean({ by: 'd'.repeat(16), moves: 1, pick: 4, anchorTok: 0, anchorDepth: 1284, claimedTo: 1200, bonus: 0, spent: 1, earned: 2, finds: 1 });
  assert.equal(mn.depthOf(old39, 0), 1284, 'a 1.39.0 depth moved');
  assert.equal(old39.step, mn.BANDS[3], 'a 1.39.0 tier-4 pick is not the top band');
  // ...and the boundary is still a boundary: the cell it falls inside is not taken again
  // ...AND THE BOUNDARY IS STILL A BOUNDARY. It used to be checked as "no claim at all", which was
  // true only because 1,200 and 1,284 fell inside one 100 m cell; a cell is 30 m now, so the
  // stretch between an old boundary and an old depth is several cells and the catch-up claims
  // them. What may NOT happen is that any of it is claimed twice, so what is asserted is the
  // shape: the first claim starts exactly at the stored boundary, and a second read takes nothing
  const back = mn.sweep(old39, 0);
  assert.ok(back.claim && back.claim.from === 1200,
    'the catch-up did not start at the stored boundary');
  assert.equal(mn.sweep(back.rec, 0).claim, null, 'ground behind an old boundary was taken again');
  // an old record has no bag, and it is not given one: `earned` already holds what the wall paid
  // under the old rule, so handing those gems over now would pay for the same ground twice
  assert.deepEqual(old39.got, new Array(mn.ROWS).fill(0), 'an old record was handed a bag of gems');
  assert.deepEqual(old39.sold, new Array(mn.ROWS).fill(0));
  assert.equal(old39.earned, 2, 'what the wall had already paid was taken away');
  console.log('      tiers 1..4 land on steps ' + mn.BANDS.join(' / ') + ' with their rows intact');
});

// 1.41.0'S STORAGE BOUNDARY, FROZEN, BECAUSE IT IS STILL RUNNING. VS Code replaces an extension
// globally but a window that is already open keeps the old code until it is reloaded, so for as
// long as one 1.41.0 window is up two builds share one store. 1.41.0 shipped the day before this
// release and those windows are on people's screens right now.
//
// WHAT IT DOES WITH A 1.42.0 RECORD, in its own two rules and nothing else:
//
//   REC_CEIL.step is 100   so a step of 350 is a figure its own save could not have produced, and
//                          its `clean` drops it to 0 rather than clamping it
//   migrateStep            it then runs `if (out.step < 1) out.step = migrateStep(rec)`, which
//                          reads `pick` (1..4) and lands on the first step of that band
//
// So the whole of the reader's protection is that `pick` is in the store, and that is why
// mine.save writes a field this build never reads (see its own note, which says not to delete it).
// Both of 1.41.0's rules are copied out here as literals: a test that called the engine for them
// would be asking the new build what the old one does.
const CEIL_1_41 = Object.freeze({
  moves: 1e9, step: 100, anchorTok: 1e15, anchorDepth: 1e12, claimedTo: 1e12, bonus: 1e12,
  spent: 1e15, earned: 1e15, finds: 1e9
});
const BANDS_1_41 = Object.freeze([1, 10, 35, 70]);
// 1.41.0's `clean`, down to the two lines that decide whether a pick survives
function step_1_41(stored) {
  const n = stored.step;
  let step = (Number.isSafeInteger(n) && n > 0 && n <= CEIL_1_41.step) ? n : 0;
  if (step < 1) {
    const t = stored.pick;
    step = (!Number.isSafeInteger(t) || t < 1) ? 0 : BANDS_1_41[Math.min(t, BANDS_1_41.length) - 1];
  }
  return step;
}
// ...and which of its four bands that is. 1.41.0's own bandOf, which is this build's with its own
// four boundaries: a step BELOW the top of this ladder is a number its `clean` accepts as it
// stands, so the tier it shows is not always read off `pick`
function band_1_41(step) {
  let b = 0;
  for (let i = 0; i < BANDS_1_41.length; i++) if (step >= BANDS_1_41[i]) b = i + 1;
  return b;
}

test('a 1.41.0 window reading a 1.42.0 record does not take the pick away', () => {
  // the premise, which is what makes the rest of this block worth asserting: this ladder really
  // does run past the end of 1.41.0's, so its own `clean` cannot keep a step from the top of it
  assert.ok(TOP > CEIL_1_41.step, 'this ladder fits inside 1.41.0\'s, so there is nothing to protect');
  // EVERY RUNG, because the one that matters is whichever one the reader is standing on
  let dropped = 0, kept = 0;
  for (let step = 1; step <= TOP; step++) {
    const stored = mn.save(rec({ step, anchorTok: 11, anchorDepth: 500, claimedTo: 480, spent: 700 }));
    const seen = step_1_41(stored);
    assert.ok(seen >= 1, 'step ' + step + ' of this ladder reads as bare hands in a 1.41.0 window: '
      + 'the climb is gone and `spent` is still charged for it');
    // ...AND THE BAND NEVER GOES DOWN. A band is the four looks and the four sets of keys, so what
    // may not happen is a reader watching the wall close on them. IT IS ONE-SIDED on purpose: a
    // step inside 1.41.0's own hundred is a number its `clean` takes as it stands, so step 60 of
    // five hundred reads as step 60 of a hundred and shows a HIGHER band than it should. That
    // direction only ever gives
    assert.ok(band_1_41(seen) >= mn.bandOf(step),
      'step ' + step + ' shows band ' + band_1_41(seen) + ' in a 1.41.0 window where it is band '
      + mn.bandOf(step) + ' here: the wall closed on the reader');
    // ...AND THE ROUND TRIP BACK. The old window saves its own fields, which drops `rungs` and
    // `pick`, so this build reads a bare step out of a hundred and `rescaleStep` multiplies it.
    //
    // THE AMBIGUITY IS REAL AND THIS IS THE SIDE TO ERR ON. A bare step of 60 could be 1.41.0's
    // own rung or a rung of THIS ladder laundered through one of its windows, and nothing in the
    // record can tell the two apart. Read as 1.41.0's, it can hand a reader rungs they did not buy
    // (bounded by SUB times the step, and the ceiling is enumerated at every one of them, so no
    // credit is minted by it). Read as this build's, a genuine 1.41.0 record would land on a
    // SLOWER rung and that reader's depth would go backwards, which is the one thing that may not
    // happen. So the gain is asserted as a BOUND rather than forbidden
    const back = mn.clean({ by: stored.by, moves: stored.moves + 1, step: seen, anchorTok: 11, anchorDepth: 500, claimedTo: 480, spent: 700 });
    assert.ok(mn.bandIn(back) >= mn.bandOf(step), 'the round trip closed the wall');
    assert.ok(back.step >= mn.BANDS[mn.bandOf(step) - 1], 'the round trip landed below its own band');
    assert.ok(back.step <= step * mn.SUB && back.step <= TOP,
      'the round trip handed out more than the rescale can: ' + back.step + ' from ' + step);
    assert.equal(mn.depthOf(back, 11), 500, 'the round trip moved the depth');
    if (back.step < step) dropped += 1; else kept += 1;
  }
  // BARE HANDS STAY BARE HANDS. `pick` is 0 for a reader who has bought nothing, and 1.41.0's own
  // rule reads that as no pick, which is the truth rather than a loss
  assert.equal(mn.save(rec({ step: 0 })).pick, 0, 'a reader with no pick is sent a tier');
  assert.equal(step_1_41(mn.save(rec({ step: 0 }))), 0, 'bare hands came back holding something');
  // THE FIELD IS WRITTEN AND NEVER READ, and both halves of that are the contract. Written: a
  // record without it is the defect this block is about. Never read: `pick` must not be able to
  // overrule a `step` this build knows exactly, or a stale tier from an older window would pull a
  // reader back down the ladder on every read
  assert.ok(mn.REC_FIELDS.indexOf('pick') < 0, '`pick` is in REC_FIELDS: clean would read it');
  assert.ok(mn.MAX_FIELDS.indexOf('pick') < 0, '`pick` is maxed across a merge: that is `step` maxed');
  for (const t of [1, 2, 3, 4]) {
    const spoof = Object.assign(mn.save(rec({ step: 440, anchorTok: 11 })), { pick: t });
    assert.equal(mn.clean(spoof).step, 440, 'a stale tier of ' + t + ' overruled a step this build knows');
  }
  // ...and it is derived, so it cannot disagree with the step it was taken from
  for (const step of [1, 49, 50, 174, 175, 349, 350, TOP]) {
    assert.equal(mn.save(rec({ step })).pick, mn.bandOf(step), 'the tier sent out is not the step\'s band');
  }
  console.log('      all ' + TOP + ' rungs survive a 1.41.0 window with their band or better; '
    + dropped + ' come back down at the band\'s first step and ' + kept + ' come back at or above '
    + 'the rung they left');
});

// THE RULERS THAT HAVE BEEN IN THE FIELD, FROZEN. Two releases running have changed what a stone
// costs and converted NOTHING at the storage boundary, which is only defensible in one direction:
// a reader's depth may come forward and may never go back. The inequality that makes it true is one
// line -- floor(u / w') >= floor(u / w) whenever w' <= w -- and a frozen fixture is what keeps it
// from being an argument in a comment.
//
// WHAT CHANGED IN WHICH RELEASE, because the two are different shapes of the same promise:
//
//   1.40.0   a flat 100,000 weighted tokens a metre, every tier at one speed (its own CHANGELOG),
//            and eight times that for bare hands. A hundred steps, so a step is a step
//   1.41.0   14,950 down to 6,124 over a hundred steps, by 1000/1009 a rung
//   1.42.0   THE SAME TWO STONES OVER FIVE HUNDRED RUNGS, so the step NUMBER means something else
//            and a stored record is rescaled (mine.js, `rescaleStep`). The fixture is held against
//            `step x SUB`, which is where a stored rung lands
//
// Both of the old curves are walked here against the rung this build puts their records on, so
// what is proved is the promise itself and not the arithmetic of one release.
const WORK_1_40 = Object.freeze({ any: 100000, fist: 100000 * 8 });
const WORK_1_41 = (function () {
  const out = [0, 14950];
  for (let s = 2; s <= mn.LADDER_1_41; s++) out[s] = Math.floor(out[s - 1] * 1000 / 1009);
  return Object.freeze(out);
})();
// where a rung of either of those ladders lands on this one. Both were a hundred rungs long
const landed = (step) => (step < 1 ? 0 : Math.min(TOP, step * mn.SUB));

test('the ruler moved and no stored record came back shallower than it went in', () => {
  // the fixtures really are slower than the rung their records land on, which is the precondition
  // for the whole block: a FASTER ruler cannot move a stored record backwards, and a slower one can
  for (let s = 1; s <= mn.LADDER_1_41; s++) {
    assert.ok(mn.workOf(landed(s)) < WORK_1_40.any, 'step ' + s + ' is slower than the 1.40.0 ruler');
    assert.ok(mn.workOf(landed(s)) <= WORK_1_41[s],
      'step ' + s + ' of 1.41.0 lands on a SLOWER rung: ' + mn.workOf(landed(s)) + ' where it was ' + WORK_1_41[s]);
  }
  assert.ok(mn.FIST_WORK < WORK_1_40.fist, 'bare hands are slower than 1.40.0\'s');
  assert.equal(mn.FIST_WORK, WORK_1_41[1] * mn.FIST_DIV, 'bare hands changed with the ladder');
  // a month of this reader's work, a day of it, a single stone and the awkward remainders around
  // one: what is being looked for is a floor landing differently, so the boundaries matter more
  // than the big numbers
  const useds = [0, 1, 999, 1000, 9999, 10000, 10001, 20001, 123456, 5e6, 52.4e6, 1572e6];
  let worst = Infinity, forward = 0, same = 0;
  for (const [name, workOf] of [['1.40.0', (s) => (s === 0 ? WORK_1_40.fist : WORK_1_40.any)],
    ['1.41.0', (s) => (s === 0 ? mn.FIST_WORK : WORK_1_41[s])]]) {
    for (const step of [0, 1, 2, 10, 35, 70, 99, mn.LADDER_1_41]) {
      for (const used of useds) {
        // a record as the STORE hands one back: metres in three fields and a count in a fourth,
        // and a `step` that is a rung of the ladder the fixture was written on
        const r = mn.clean({ by: 'a'.repeat(16), moves: 3, step, anchorTok: 400, anchorDepth: 4321, bonus: 700, claimedTo: 5000 });
        assert.equal(r.step, landed(step), 'the fixture record did not land where the migration puts it');
        const was = r.anchorDepth + r.bonus + Math.floor(used / workOf(step));
        const now = mn.depthOf(r, 400 + used);
        assert.ok(now >= was, name + ', step ' + step + ' at ' + used + ' tokens went backwards: '
          + now + ' m where the old ruler had ' + was + ' m');
        if (now > was) forward += 1; else same += 1;
        worst = Math.min(worst, now - was);
        // ...AND A DAY'S WORK REALLY DOES COME OUT DEEPER WHEREVER THE RULER ACTUALLY MOVED, which
        // is what stops this block passing on a grid where every sample happened to be too small
        // to break a stone either way. WHERE IT DID NOT MOVE, STANDING STILL IS THE RIGHT ANSWER
        // and the line above is the whole claim: the fist is the case (1.42.0 changed the ladder
        // and a fist is not on it, so FIST_WORK is 1.41.0's to the token), and a record on it has
        // to come back at exactly the depth it went in with rather than deeper
        if (used >= 52.4e6 && workOf(step) > mn.workIn(r)) {
          assert.ok(now > was, name + ', step ' + step + ': a day of work did not move forward');
        }
        if (workOf(step) === mn.workIn(r)) {
          assert.equal(now, was, name + ', step ' + step + ': an unchanged ruler moved the depth');
        }
      }
    }
  }
  assert.equal(worst, 0, 'the worst case is not a record that merely stood still');
  assert.ok(forward > 0, 'no sample moved forward at all: the grid is measuring nothing');
  // AND THE BOUNDARY IS STILL BEHIND THE FACE, which is what makes the catch-up ordinary ground
  // rather than a second payment: `claimedTo` is a prefix of the drift, the face is deeper than it
  // was, so the stretch between them yields exactly once (claim (b)) and then never again
  const deep = rec({ step: 1, anchorTok: 0, anchorDepth: 0, claimedTo: 400 });
  const tok = tokFor(1, 10000);
  const first = mn.sweep(deep, tok);
  assert.ok(first.claim && first.claim.from === 400, 'the catch-up did not start at the old boundary');
  // ...and it arrives OVER SEVERAL MESSAGES rather than as a lump, because the catch-up is a
  // backlog and a backlog is what CLAIM_CELLS is for (claim (e)). What each bite may not do is
  // overlap the one before it: every claim starts exactly where the last one stopped
  let st = first.rec, cur = first.claim, bites = 1, worth = cur.worth;
  while (cur.more && bites < 100) {
    const next = mn.sweep(st, tok);
    assert.ok(next.claim, 'the backlog said there was more and the next claim was nothing');
    assert.equal(next.claim.from, cur.to, 'a catch-up bite overlapped the one before it');
    st = next.rec; cur = next.claim; worth += cur.worth; bites += 1;
  }
  assert.equal(mn.sweep(st, tok).claim, null, 'the caught-up ground was taken twice');
  console.log('      the new ruler moved ' + forward + ' of ' + (forward + same)
    + ' sampled records forward and none of them back; a 10,000 m catch-up yields ' + worth
    + ' cr once, over ' + bites + ' bite(s)');
});

test('the merge is a register: more moves wins whole, a tie goes to the larger writer', () => {
  const A = '0'.repeat(16), Z = 'f'.repeat(16);
  const one = Object.assign(mn.sweep(rec({ step: 35, anchorTok: 0 }), tokFor(35, 3000)).rec, { by: A });
  const two = Object.assign({}, one, { by: Z, earned: one.earned + 5 });
  assert.equal(mn.newer(two, one), true, 'a tie did not go to the larger writer');
  assert.equal(mn.newer(one, two), false);
  assert.equal(mn.newer(null, one), false);
  assert.equal(mn.newer(one, null), true);
  assert.equal(mn.merge(one, null), one);
  assert.deepEqual(mn.merge(null, one), one);
  assert.equal(mn.merge(null, null), null);
  assert.deepEqual(mn.merge(one, two), two);
  assert.equal(mn.same(one, one), true);
  assert.equal(mn.same(one, two), false);
  assert.equal(mn.same(null, null), true);
  assert.equal(mn.same(one, null), false);
  assert.equal(mn.same(one, Object.assign({}, one, { by: Z })), false);
  for (const k of mn.REC_FIELDS) {
    assert.equal(mn.same(one, Object.assign({}, one, { [k]: one[k] + 1 })), false, k + ' is not part of a record\'s identity');
  }
  // ...AND THE BAGS ARE PART OF IT, row by row: a window whose only change was one gem still has a
  // write to make
  for (const k of mn.BAG_FIELDS) {
    for (let i = 0; i < mn.ROWS; i++) {
      const bump = one[k].slice();
      bump[i] += 1;
      assert.equal(mn.same(one, Object.assign({}, one, { [k]: bump })), false,
        k + '[' + i + '] is not part of a record\'s identity');
    }
  }
  assert.equal(mn.kept(one, one), true);
  assert.equal(mn.kept(one, Object.assign({}, one, { earned: 0 })), true, 'kept() read the money');
  assert.equal(mn.kept(one, Object.assign({}, one, { by: Z })), false);
  assert.equal(mn.kept(one, Object.assign({}, one, { moves: one.moves + 1 })), false);
  assert.equal(mn.kept(one, null), false);
  assert.equal(mn.kept(null, one), false);
  // both halves of the trade are in the record, so netOf is the whole of what the mine did
  assert.equal(mn.netOf(null), 0);
  assert.equal(mn.netOf({ earned: 900, spent: 600 }), 300);
  assert.equal(mn.netOf({ earned: 0, spent: mn.priceOf(1) }), -mn.priceOf(1));
});

// --- what the webview sees -----------------------------------------------------------------------

test('the view sends what the screen draws, and no words at all', () => {
  const step = 35;
  const tok = tokFor(step, 4284);
  const st = mn.sweep(rec({ step, anchorTok: 0 }), tok).rec;
  const v = mn.view(st, 10000, tok, null, -1);
  assert.equal(v.depth, mn.depthOf(st, tok));
  assert.equal(v.unit, 'm');
  // THREE FIGURES AND NOT TWO. `cell` is the camera's, and it is read as a whole rather than
  // field by field on purpose: the screen's stops are cell / 3, so a window that quietly stopped
  // carrying it would leave the band drawing a camera whose stops are not the layout's
  // (docs/mine-mockup/spec-idle.md, section 9)
  assert.deepEqual(v.window, { behind: mn.BEHIND_M, ahead: mn.AHEAD_M, cell: mn.CELL_M });
  assert.equal(v.tool, 'pick');
  assert.equal(v.step, step, 'the view does not say which step is in hand');
  assert.equal(v.steps, mn.STEPS);
  assert.equal(v.tier, mn.bandOf(step), 'the view does not say which look to draw');
  assert.equal(v.tiers, mn.BANDS.length);
  assert.deepEqual(v.stone, mn.stoneOf(st, tok), 'the stone in hand is not reported');
  assert.equal(v.found, null, 'a view with no claim behind it reported a find');
  assert.equal(v.fever, null);
  assert.equal(v.pickName, undefined, 'the view still sends the pick\'s name');
  // THE REACH IS GONE AND SO IS WHAT IT DREW (1.41.0). A pick has no distance at which it stops
  // cutting, so there is no line and no veil, and a `reach` back on the reply is a screen that
  // would start drawing them again out of a figure that cannot mean anything
  assert.equal(v.reach, undefined, 'the view still sends a reach');
  assert.equal(v.durM, undefined, 'the view sends a durability');
  // NOT ONE WORD ANYWHERE. Every kind is a row subscript and every figure is a number, which is
  // what the reader asked for when they took the sentences off this screen
  const walk = (o) => {
    for (const k in o) {
      const x = o[k];
      // `unit`, `tool` and `kind` are the three strings that are allowed, and none of them is a
      // sentence: the unit is the host naming the ruler, the tool is which of the three line states
      // to draw, and the kind is the marker's SIZE CLASS (24px gem, 48px relic, the fever's own).
      // What went with 1.41.0 is everything the screen would have PRINTED: the four pick names, the
      // row names and the `needs` line that named the step a row waits for
      if (typeof x === 'string') {
        assert.ok(k === 'unit' || k === 'tool' || k === 'kind' || k === 'name',
          'the view sent a word: ' + k + ' = ' + x);
      }
      else if (x && typeof x === 'object') walk(x);
    }
  };
  walk(v);
  // THE SEAMS BEYOND THE LOOKAHEAD ARE THIS SCREEN'S FACE-DOWN CARDS
  for (const s of v.seam) {
    assert.ok(s.at > v.depth, 'a seam behind the face was sent to be drawn');
    assert.ok(s.at <= v.depth + mn.AHEAD_M, 'a seam beyond the lookahead was sent: ' + s.at);
    assert.deepEqual(Object.keys(s).sort(), ['at', 'kind', 'locked', 'row'], 'a seam carried something else');
    assert.equal(s.pay, undefined, 'a seam in the wall carried its price');
    assert.equal(s.locked, !mn.takes(v.step, mn.seamAt(s.at / CELL)), 'a seam was flagged against the wrong key');
  }
  assert.ok(v.seam.length <= 1, 'a cell is wider than the window, so two markers cannot be in it');
  // the bag, per row, and what it is worth: the screen may not multiply a count by a price
  assert.equal(v.got.length, mn.ROWS);
  for (let i = 0; i < mn.ROWS; i++) assert.equal(v.got[i], mn.heldOf(st, i), 'row ' + i + ' is not what is held');
  assert.equal(v.worth, mn.bagValue(st), 'the bag\'s worth is not the host\'s figure');
  // the fold, with the odds NOT in it and no `needs` line either
  assert.equal(v.pays.length, mn.SEAMS.length);
  for (let i = 0; i < mn.ROWS; i++) {
    assert.deepEqual(Object.keys(v.pays[i]).sort(), ['kind', 'locked', 'name', 'pay', 'row']);
    assert.equal(v.pays[i].row, i);
    assert.equal(v.pays[i].pay, mn.SEAMS[i].pay);
    assert.equal(v.pays[i].locked, mn.SEAMS[i].gate > step);
    assert.equal(v.pays[i].odds, undefined, 'the odds travelled with the pay table');
  }
  // the offer: a step number, a price, how fast it cuts, what it opens
  assert.deepEqual(Object.keys(v.offer).sort(), ['opens', 'price', 'step', 'swings', 'tier']);
  assert.equal(v.offer.tier, mn.bandOf(step + 1), 'the offer does not say which look it fits');
  assert.equal(v.offer.step, step + 1);
  assert.equal(v.offer.swings, mn.swingsOf(step + 1), 'the offer does not say how fast the next step cuts');
  assert.ok(v.offer.swings <= v.stone.of, 'the next step is slower than the one in hand');
});

test('the view tells the screen what just came out of the wall, and how many stones broke', () => {
  const st = rec({ step: TOP, anchorTok: 0 });
  const tok = tokFor(TOP, 3000);
  const r = mn.sweep(st, tok);
  const v = mn.view(r.rec, 0, tok, r.claim, -1);
  assert.ok(v.found, 'a claim that yielded reported no find');
  assert.equal(v.found.pay, r.claim.worth, 'the find line did not carry the claim\'s worth');
  assert.equal(v.found.n, r.claim.finds.length);
  let top = null;
  for (const f of r.claim.finds) if (!top || f.pay > top.pay) top = f;
  assert.equal(v.found.row, top.row, 'the find line did not name the biggest row in the claim');
  assert.equal(v.found.name, mn.SEAMS[top.row].name, 'the find line cannot be read out');
  // ...and a redraw with no claim behind it says nothing, which is what stops a reload celebrating
  // a find from last week
  assert.equal(mn.view(r.rec, 0, tok, null, -1).found, null);
  assert.equal(r.rec.finds, r.claim.finds.length);
  // HOW MANY STONES BROKE SINCE THIS WINDOW LAST DREW, which is the handler's figure and not the
  // record's: the screen runs its chip of rock once per stone
  const depth = mn.depthOf(r.rec, tok);
  assert.equal(mn.view(r.rec, 0, tok, null, depth - 3).broke, 3, 'three stones did not read as three');
  assert.equal(mn.view(r.rec, 0, tok, null, depth).broke, 0, 'a push that moved nothing broke a stone');
  assert.equal(mn.view(r.rec, 0, tok, null, -1).broke, 0, 'the first draw of a week showed a week of stones');
  assert.equal(mn.view(r.rec, 0, tok, null, depth + 10).broke, 0, 'a stale told-depth broke negative stones');
});

test('bare hands are the reader who has bought nothing, and nothing else is', () => {
  // THE STATE THAT WENT. Until 1.41.0 a record could say step 10 and be holding a fist, because the
  // pick had worn through, and the screen drew the tool rather than the receipt. There is no such
  // record any more: the step IS the tool, at every token count, so a reader is one of two things
  const st = rec({ step: 10, anchorTok: 0 });
  for (const tok of [0, tokFor(10, 1e6), 1e12]) {
    const v = mn.view(st, 0, tok, null, -1);
    assert.equal(v.tool, 'pick', 'a pick that had dug a long way came back as a claw');
    assert.equal(v.step, 10, 'the step in hand changed with the token count');
    assert.equal(v.tier, mn.bandOf(10), 'the look changed with the token count');
    assert.equal(mn.stepOf(st), 10);
  }
  // ...and the drift goes on getting deeper at that step's own pace for ever
  const far = tokFor(10, 1e6);
  assert.equal(mn.depthOf(st, far + tokFor(10, 10)) - mn.depthOf(st, far), 10);
  // A READER WHO HAS BOUGHT NOTHING is at the mouth with their hands, which is the opening state
  // and the only state the fist is in
  const fresh0 = mn.view(rec({}), 0, 0, null, -1);
  assert.equal(fresh0.depth, 0);
  assert.equal(fresh0.tool, 'claw');
  assert.equal(fresh0.step, mn.FIST);
  assert.equal(fresh0.tier, 0, 'bare hands were given a look');
  assert.equal(fresh0.offer.price, mn.priceOf(1));
  assert.ok(fresh0.pays.some((p) => !p.locked), 'a new reader can take nothing out of the wall');
  assert.equal(fresh0.stone.of, mn.swingsOf(1) * mn.FIST_DIV, 'bare hands break a stone at a pick\'s pace');
  // ...and the hands dig at FIST_DIV for ever as well: a reader who never buys is not stuck, only
  // slow, which is what makes the first purchase worth something rather than necessary
  const bare = rec({});
  assert.equal(mn.cutOf(bare, mn.FIST_WORK * 1e6), 1e6);
  assert.equal(mn.view(bare, 0, mn.FIST_WORK * 1e6, null, -1).tool, 'claw');
});

// --- the hash: the one thing an enumeration cannot see --------------------------------------------

test('the layout is uniform over the buckets and does not correlate with the next metre', () => {
  const N = 64000 * (Number(process.env.MN_MC) || 10);
  const seen = new Array(B).fill(0);
  for (let c = 1; c <= N; c++) seen[mn.bucketOf(c)] += 1;
  const want = N / B;
  let chi = 0;
  for (const n of seen) chi += ((n - want) * (n - want)) / want;
  console.log('      ' + num(N) + ' cells over ' + B + ' buckets: chi-square ' + chi.toFixed(1) + ' on 63 df (bound 150)');
  assert.ok(chi < 150, 'the bucket spread is not uniform: chi-square ' + chi.toFixed(1));
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
