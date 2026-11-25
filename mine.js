// The credit mine. The only screen in this extension the player does not press: the tokens they
// spend working ARE the digging, so the drift goes deeper while nobody is looking and what comes out
// of the wall is credits. The one thing there is to press is a pick, and a pick is a bet on how much
// work is still ahead.
//
// Depth is a FUNCTION OF THE TOKEN COUNT and is not stored. A record keeps the four facts the token
// count cannot carry (where the current pick was fitted, how much ground a fever gave away, how far
// the paying has got, and the money), and everything else is derived on every read:
//
//   used  = max(0, tokens - anchorTok)      the tokens this pick has seen. CLAMPED, because two
//                                           windows can hold ledgers of different ages and the count
//                                           a window reads is not monotone between them
//   dug   = used / the work one stone takes at the step in hand
//   depth = anchorDepth + bonus + dug
//
// A PICK NEVER WEARS OUT. It is bought once and it is in hand for ever, so `step` is the whole of
// what tool is being used: there is no second figure about the tool to get out of step with the
// token count, and nothing on this screen can be lost. Bare hands are `step` 0, which is the reader
// who has not bought one yet, and that is the only way a fist is ever in the picture.
//
// --- the units, and why they are the weighted ones ----------------------------------------------
//
// Depth is metres and a metre is TOK_PER_M WEIGHTED tokens (credits.js's weights: input 1, output 5,
// cache write 1.25, cache read 0.1). The raw count is not used and may not be: 97.2% of this
// reader's lifetime tokens are cache reads, so a mine dug on raw tokens would measure how LONG the
// conversations were rather than how much work was done, and a reader who keeps one enormous context
// warm would out-dig one who is actually building something.
//
// credits.js exports `weightedTotal(ledger)` for exactly this, which is the sum `creditSummary`
// already walks lifted out of it. This module requires NOTHING (so credits.js can require it without
// a cycle) and takes the count as an argument.
//
// --- what is proved, and where (games/README.md, section 7) -------------------------------------
//
// This game has no round, so "the return of one play" is not defined for it and the casino's 96-97%
// band does not apply, the same way it does not apply to the market. Five claims stand in its place
// and `test/mine.test.js` is where each one is made:
//
//   a  NET PAY PER TOKEN HAS A CEILING, AND EVERY STEP HAS ITS OWN. What the mine adds to the
//      balance grows at no more than EARN_CAP_NUM/EARN_CAP_DEN of what the same tokens earn in the
//      ledger. Enumerated over the seam table, the relic spacing rule and the fever's grant, as an
//      exact rational, ONCE PER STEP, all five hundred of them: a step is a key (see the ladder
//      below), so each one takes a different set out of the wall and the ceiling has to stand
//      against the richest of them. THE CEILING IS 2:1 SINCE 1.42.0 and the table under it is
//      sixteen times what it was; the derivation is at EARN_CAP and the sum is in the suite
//   b  A STRETCH PAYS ONCE. `claimedTo` is a boundary, so the same ground cannot be claimed twice,
//      and a claim that loses a merge takes `earned` and `claimedTo` back together
//   c  PICKS DO NOT OVERLAP: THE GROUND IS COUNTED ONCE. Fitting one replaces the anchor, so two
//      purchases in a row cannot each add a stretch of ground, and the anchor is never moved BACK,
//      so a window holding an older ledger cannot hand the new pick work that has already been
//      done. A step costs its price and nothing else: there is nothing to lose by buying early and
//      nothing to carry over, because the pick that is being replaced had no life left to count
//   d  THE GROUND IS MONOTONE. `weightedTotal` only grows, whatever order the days arrive in
//      (test/credits.test.js)
//   e  ONE CLAIM WALKS A BOUNDED NUMBER OF CELLS. A mine nobody has opened for a month does not
//      hash a hundred thousand cells in one message; it takes CLAIM_CELLS and leaves the rest
//
// The one thing an enumeration cannot see is whether the layout really is the uniform, uncorrelated
// one the enumeration assumed, and that is the only thing the suite samples for.
'use strict';

// extension.js makes these (16 hex characters). Anything else, "__proto__" included, is dropped
const REPLICA_RE = /^[0-9a-f]{16}$/;

// --- the ruler: one stone, one metre -------------------------------------------------------------
//
// THE DRIFT ADVANCES ONE STONE AT A TIME and a stone is one metre. A stone takes `workOf(step)`
// weighted tokens to break, so nothing moves while nobody is working: the crab's swing runs off the
// clock (the screen's own animation) and the STONE breaks when the work actually arrives. Welding
// the two together would dig the drift while the reader sat still, which is the one thing this game
// may not do.
//
// Read against this reader's own thirty days (52.4 MT a day, 5.32 MT an hour of activity, a reply
// of about 30,600 weighted tokens):
//
//                       step 1        step 500
//   a stone            14,950 tok     6,124 tok
//   ...which is        10 swings      4 swings      at the working rung's 1,320 ms
//   a reply moves      2.05 m         5.00 m        6.8% of the lookahead / 16.7%
//   ...which is        6.39 px        15.59 px      of a 156px band at a 250px sidebar
//   a seam cell        every 16.9 min every 6.9 min of activity
//
// BOTH ENDS OF THAT COLUMN ARE PINNED AND 1.42.0 DID NOT MOVE EITHER OF THEM: the ladder is five
// hundred steps where it was a hundred, and it runs between the same two stones. See STEPS
//
// 1.40.0 WAS 100,000 TOKENS A METRE AND IT READ AS STANDING STILL: a reply moved 0.3 m of a 63 m
// window, which is half a pixel.
//
// --- WHY THE RULER IS NOT WHAT WAS WRONG (1.41.0, and this is the whole release) ----------------
//
// The first answer to "I cannot tell the ground is being dug" was to cut the ruler finer, twice,
// and the second time the window was held still on purpose. IT BARELY MOVED THE PICTURE, and the
// algebra says it never could have. Write out what a reply is worth in pixels:
//
//   reply px = (REPLY_TOK / work) x bandPx / (AHEAD_M + BEHIND_M)
//
// and the lookahead is not a free number: it is a number of ordinary replies, because a marker the
// reader cannot see coming is the one thing this screen may not draw. Pin it at N of them and
// substitute, with BEHIND_M at the screen's own 2:3:
//
//   AHEAD_M = N x REPLY_TOK / work      =>      reply px = 3 x bandPx / (5 x N)
//
// THE RULER CANCELS. How fast the ground is dug does not appear in the answer at all: a reply is
// worth 9.4 px of a 156px band at N = 4 and 6.4 px at N = 6, whatever a stone costs, and the only
// way to change it is to change how much of the drift is on screen. 1.40.0 and the two halvings
// after it were all the same picture because N never moved: it was 13.2 replies at a 99 m window
// and 3 x 156 / (5 x 13.2) is 7.1 px at the fastest step and 2.9 px at the first, which is what
// the reader was looking at when they said it was standing still.
//
// WHAT HAD PINNED N WAS THE WRONG READER. The old window was sized so that the HEAVIEST PUSH, a
// window that had been shut for a week coming back in one beat, still could not cross the
// lookahead. That is a real thing to protect and it was protected in the wrong place: a reading
// that happens once a month was setting the scale of the one that happens every ten seconds. The
// screen already has an honest answer for the heaviest push, and it is not a wide window -- it is
// the DASH (games/mine/panel.js, MN_BURST: more than DASH_M stones in one push and the ground runs
// instead of the crab walking). So the window is sized for the ordinary reply now, the heaviest
// push is contractually a run, and both of those are invariants below.
//
// WHAT THE RULER IS STILL FOR, since it is not for pixels: a stone is an EVENT (the chips, the
// step into the hole), and how many of them a reply breaks is exactly REPLY_TOK / work. At this
// window a reply breaks 2 stones at the first step and 4 at the top one, where 1.40.0 broke one
// every three replies. That is the second half of "I cannot tell it is digging" and it is the half
// the ruler can actually answer.
const TOK_PER_MT = 1000000;      // weighted tokens in a million of them, for reading the tables
const STONE_M = 1;               // metres a stone advances the face. The depth is a stone count
const UNIT = 'm';                // the host names the unit; the screen never invents a word

// WORK IS COUNTED IN SWINGS and a swing is a unit of WORK rather than of time: 1,495 weighted
// tokens, which at this reader's own pace happens to take about one turn of the screen's animation.
// That is what lets the host answer "how many swings is a stone" (the reader's own words for the
// ladder) without the engine knowing anything about milliseconds.
//
// IT MOVES WITH THE WORK AND IS NOT A FREE NUMBER: "ten swings and the stone breaks" is the
// reader's own figure for the first step, so WORK[1] / TOK_PER_SWING is theirs and not this
// file's to retune. Every ruler this game has had is a multiple of ten for exactly that reason,
// and the suite asserts the division rather than the rounded count
const TOK_PER_SWING = 1495;

// What a fist is worth. A stone takes FIST_DIV times the work when there is no pick in hand, which
// is the whole of "the efficiency collapses": a day that broke 3,505 stones breaks 438.
// THE HANDS ARE THE READER WHO HAS NOT BOUGHT A PICK and nothing else, because a pick that was
// bought stays bought. They are also step 0, so the wall gives them gems and nothing else (the
// seam table's `gate`), and the first purchase is what lifts both halves at once
const FIST_DIV = 8;

// --- the ladder: five hundred steps, which are 1.41.0's hundred split five ways -----------------
//
// A step buys two things and the second one is why the top of the ladder is worth anything:
//
//   work   fewer tokens a stone, so the drift advances faster and visibly (the table above)
//   gate   WHAT THE WALL GIVES UP (the seam table's `gate` column, as a step)
//
// AND IT BUYS THEM FOR GOOD. A step is fitted once and it is never spent, so what a purchase is
// worth is a speed and a key rather than an amount of digging: there is no amount of work that
// takes a pick away, and there is nothing on this screen a reader can lose by not looking at it.
//
// THE TWO CURVES ARE INTEGER RECURRENCES AND NOT FORMULAS, and that is a correctness condition
// rather than a style: `Math.pow` is not guaranteed bit-identical between engine versions, the
// depth is derived from the work curve, and two windows that disagreed about how many tokens a
// stone costs would disagree about the depth and about the money. Every figure below is built once,
// at load, out of integer multiplies and floors.
//
// WHAT THE CURVES ARE TUNED AGAINST, in order of who wins:
//
//   1. claim (a). rate(step) = E_cell x CREDIT_UNIT / (CELL_M x work(step)), and the WORST step has
//      to come in under EARN_CAP. The worst is step 500 at 191.750%, so the margin is 8.250 points.
//      WHAT FIXES THE PAY TABLE IS THE WINDOW, not the ruler. A cell is the lookahead (CELL_M) and
//      the lookahead is six ordinary replies of the fastest step, so a cell costs six replies of
//      work however fast the ruler is, and the credits a cell may pay are EARN_CAP of that:
//      6 x REPLY_TOK x EARN_CAP / CREDIT_UNIT = 36.72 credits, whatever else moves
//   2. EVERY STEP IS RECOVERED BY THE GROUND IT DIGS, because a pick is for ever: a step brings in
//      the extra credits its extra speed is worth from the moment it is fitted until the reader
//      stops working, so there is no amount of digging over which it fails to clear its price. The
//      figure to read when the price curve is retuned is therefore HOW MUCH WORK recovers a step
//      rather than whether anything recovers it, and test/mine.test.js prints that curve. The one
//      rule left on it is that each step's speed really does rise, or there would be nothing to
//      recover the price with
// FIVE HUNDRED STEPS, AND THEY ARE THE SAME CLIMB AS 1.41.0'S HUNDRED (1.42.0). The reader asked
// for more of them, and the one thing more of them cannot be is a FASTER ladder: both ends of the
// work column are pinned and neither one is this file's to move.
//
//   step 1    ten swings a stone, which is the reader's own figure for the first pick, and
//             FIST_WORK hangs off it
//   step 500  the lookahead is six ordinary replies of the TOP step (the window's own condition
//             below), so the fastest stone may not cost less than 6 x REPLY_TOK / AHEAD_M = 6,120
//             weighted tokens. 1.41.0's hundredth step was 6,124, which is four tokens off the line
//
// So a longer ladder is a FINER one, and the whole of 1.42.0's ladder is that: SUB rungs in place
// of each of 1.41.0's, between the same two stones. NOTHING ABOVE HAD TO MOVE for it -- the ruler,
// the window, the cell, the gates and the lights are all where they were, and what changed is how
// many presses it takes to cross them. WHY THAT IS NOT A SMALLER CHANGE THAN IT SOUNDS: what a
// press buys is measured in credits and not in rungs, so five rungs at a fifth of the speed gain
// and half the price hand the reader the same climb with five times as many places to stand on it.
const STEPS = 500;

// HOW MANY OF THESE RUNGS MAKE ONE OF 1.41.0'S. It is here for the storage boundary and for one
// sentence: a `step` is a number on a ladder OF A KNOWN LENGTH, so a record written against a
// shorter ladder names its rung with the wrong number and has to be read as the fraction of the
// climb it was. `clean` does that with `rungs`, and this is the length every record in the field
// was written against
const SUB = 5;
const LADDER_1_41 = STEPS / SUB;

// Tokens a stone takes, step by step. 14,950 down to 6,124, which is 2.441 times faster end to end.
// THE SPREAD IS NOT A FREE CHOICE: the rate above is linear in 1/work, so the whole ladder's speed
// gain is bounded by EARN_CAP divided by step 1's rate, and step 1's rate is what the game pays
// somebody who has just opened it.
//
// WHAT FIXES THE HEAD OF THE CURVE (1.41.0) is the window and not a taste. The lookahead is six
// ordinary replies of the FASTEST step, and a reply may not be so much work that the screen runs
// the ground instead of walking it (REPLY_M <= DASH_M), so WORK[STEPS] is pinned into a narrow
// band and WORK[1] is that times the spread: 6 x REPLY_TOK <= AHEAD_M x WORK[STEPS], which at a
// 30 m lookahead is WORK[STEPS] >= 6,120, and 14,950 is the fastest multiple of ten whose curve
// clears it. THE SPREAD IS WHAT COSTS THE FIRST STEP, and it is the lever left for next time: the
// lookahead is sized by the fastest step while the reader who says nothing is moving is on the
// slowest one, so a flatter ladder would hand step 1 the pixels the top step is getting. It is out
// of this release's scope because it changes what a step is worth rather than what a metre is.
//
// THE RATIO IS 1.41.0'S OWN, TAKEN A FIFTH AT A TIME (1.42.0). That curve stepped by 1000/1009 a
// rung; this one steps by the fifth root of it, which is 0.1790% a step, and the figure below is
// that root rounded to the part in a million AT WHICH THE FIVE-HUNDREDTH STEP LANDS EXACTLY ON
// 1.41.0'S HUNDREDTH (6,124 tokens) rather than past it. That is the whole reason it is a seven
// digit literal and not a tidy one: the window forbids anything faster (the condition block
// throws) and a stored record forbids anything slower at the five-hundredth step, so the two
// bracket this ratio to a single value. Both ends are proved rather than asserted in a comment --
// test/mine.test.js walks all hundred of 1.41.0's rungs against WORK[s x SUB] and would fail on a
// ratio a part in a million either way.
//
// CARRIED IN THOUSANDTHS, like the price below, for the reason the price needs it: at 0.179% a step
// the tail of the curve moves by eleven tokens a rung, and a floor taken on the whole number every
// step would eat a fifth of that and land the top step short of the window's line
const WORK = (function () {
  const out = [0];
  let mil = 14950 * 1000;
  for (let s = 1; s <= STEPS; s++) { out[s] = Math.round(mil / 1000); mil = Math.floor(mil * 998213 / 1000000); }
  return Object.freeze(out);
})();

// What a step costs. 5 credits up to 17,072, and 1,054,575 for the whole ladder.
//
// THE RATIO IS AGAIN 1.41.0'S A FIFTH AT A TIME: that curve stepped by 1.085 a rung, this one by
// 101645/100000, which is its fifth root, so five of these steps cost what one of 1.41.0's did
// times the base. AND THE BASE WENT 10 -> 5, WHICH IS THE ONE ECONOMIC CHOICE IN THIS CURVE. Five
// steps at half the old price is two and a half old steps, so the whole ladder is 2.57 times
// 1.41.0's 410,383 credits -- and it has to be, because the ceiling below took what a token earns
// in the mine up sixteenfold. Priced at a fifth of the old rung (the arithmetically pure
// subdivision) the ladder came to 417,780 credits and this reader's own throughput cleared it in
// 38 days against 1.41.0's 87. A ladder five times as long that is over in half the time is the
// reader's complaint coming back with more steps in it. At 1,054,575 the top step lands on day 94.
//
// CARRIED IN THOUSANDTHS so the floor does not stall the bottom of the curve: a price of 5 times
// 1.01645 floors back to 5, and without the finer unit every step under the tenth would cost the
// same. It still stalls for six steps at the very bottom, which is where 1.41.0's own curve was
// flat for one, and six steps at five credits is six presses a reader makes in their first minute
const PRICE = (function () {
  const out = [0];
  let mil = 5 * 1000;
  for (let s = 1; s <= STEPS; s++) { out[s] = Math.round(mil / 1000); mil = Math.floor(mil * 101645 / 100000); }
  return Object.freeze(out);
})();

// Step 0 is no pick at all, which is the fist. It is not a row of the ladder because it is not
// bought: it is where every reader starts and the only place the hands are ever in the picture
const FIST = 0;
const TOP_STEP = STEPS;

function hasStep(step) { return step >= 1 && step <= STEPS; }
// Tokens a stone takes at that step, and 0 for the fist, which is handled where it matters: bare
// hands break a stone in FIST_DIV times step 1's work
function workOf(step) { return hasStep(step) ? WORK[step] : 0; }
const FIST_WORK = WORK[1] * FIST_DIV;
function priceOf(step) { return hasStep(step) ? PRICE[step] : 0; }
// Swings a stone takes at that step: the reader's own unit for the ladder ("ten swings, then nine")
function swingsOf(step) { return Math.round((workOf(step) || FIST_WORK) / TOK_PER_SWING); }

// WHAT THE BUTTON OFFERS: the next step up, and the top step again once it is reached. One offer at
// a time is the screen's own rule (docs/game-panels.md, 5-15: no chips, one button), and the ladder
// being one way is also what keeps the gate from being bought around -- an idol two cells ahead
// cannot be answered by jumping to the step that lifts it
function nextStep(step) { return Math.min((step >= 1 ? step : 0) + 1, TOP_STEP); }

// THE FOUR BANDS, which are the gate steps. The screen draws a band and not a step (four looks, not
// five hundred), so this is the one place the two are tied together, and the rows a band opens are
// the rows whose gate is at or below its first step.
//
// THEY ARE 1.41.0'S FOUR, FIVE TIMES OVER (1.42.0): 1 / 10 / 35 / 70 became 1 / 50 / 175 / 350, and
// the first band is the first step at either length because it is the step that replaces the fist.
// That is what lets a stored record keep the key it paid for: `clean` multiplies its step by SUB,
// so a reader who bought the idol open at step 70 of a hundred is at step 350 of five hundred with
// the idol still open, and nothing about the wall changed under them
const BANDS = Object.freeze([1, 50, 175, 350]);
function bandOf(step) {
  let b = 0;
  for (let i = 0; i < BANDS.length; i++) if (step >= BANDS[i]) b = i + 1;
  return b;
}

// --- the ceiling --------------------------------------------------------------------------------
//
// The promise of claim (a), as this module's own constant so the suite is written against it rather
// than against a number typed twice.
//
// 200%, AND THE REASON IS THE LEDGER (1.42.0). Every ceiling this game has had was 15%, and at
// 15% the mine is a rounding error on the balance: this reader's own throughput is 43.1 MT of
// weighted tokens a day, which is 4,310 credits of ordinary earning, and the most the wall could
// add to that was 522. The reader's words for it were that the ore is far too cheap, and they are
// arithmetically right -- at a twelfth of the ledger, the thing that pays is the work and the mine
// is a decoration on it. 200% is TWICE WHAT THE LEDGER GIVES FOR THE SAME TOKENS, so at the top of
// the ladder two credits in three on this screen were dug rather than earned, and that is the
// figure the reader chose out of three.
//
// WHY A MULTIPLE OF THE LEDGER AT ALL, now that it is above 1:1. The mine is still a game played
// with work that was done anyway, so it may not pay for work that was not: every term in the sum
// is a number of weighted tokens times a rate, which means a reader who stops working stops being
// paid however deep they are and however long the pick sat in the wall. That property is what the
// ceiling is for, and it does not care whether the multiple is a tenth or a double.
//
// WHAT THE BAND NOW IS: the realised rate is 191.750% at the worst step and the margin of 8.250
// points is the room the seam table has to be retuned in without this line moving. The band is
// one-sided on purpose. It has been RE-ENUMERATED at every release that touched the window, the
// ruler, the cell or the table, and 1.42.0 touched two of them -- there is no sentence about this
// one that is true without doing the sum.
const EARN_CAP_NUM = 200;
const EARN_CAP_DEN = 100;

// --- the layout ---------------------------------------------------------------------------------
//
// A seam sits at the top boundary of a cell of CELL_M metres, at most one to a cell, and which one
// is a pure function of the cell's number. There is NO SEED and no stored layout: the same metre
// holds the same thing in every window, on every machine, for ever. The secret this screen keeps is
// not the layout, it is only how far ahead the reader is allowed to see (`seam` in view(), and
// docs/game-panels.md 5-15: "the host withholds what is beyond the lookahead").
//
// A CELL IS THE LOOKAHEAD, which is the one place it can be once the window is sized for the
// ordinary reply (1.41.0). Two conditions already bracketed it -- not narrower than AHEAD_M, or
// two markers share the screen and the spacing rule comes back, and not wider than twice it, or
// the rock ahead is usually empty -- and the bottom of that bracket is also the DENSEST it can be:
// a marker stands in the lookahead at 61.8% of depths, which is the figure the window was widened
// for in the first place. So CELL_M = AHEAD_M, and the two move together for ever.
//
// AND THAT IS WHAT FIXES THE PAY TABLE. A cell costs CELL_M x work(step) tokens, the lookahead is
// six ordinary replies of the fastest step, so a cell is six replies of work: 183,600 weighted
// tokens, or 18.36 credits of ordinary earning, whatever the ruler. EARN_CAP of that is 36.72
// credits a cell, and the table below is what fits under it in whole credits
const CELL_M = 30;

// The hash's outcome space. 64 buckets a cell: fine enough for a 2-in-64 rarity and small enough
// that the suite can enumerate every bucket exactly rather than sample it
const BUCKETS = 64;

// THE SEAM TABLE. `odds` is buckets out of BUCKETS and the 16 left over are barren rock, which is
// what makes the drift read as rock with things in it rather than as a conveyor belt.
//
// The pays are tuned DOWN to the ceiling and not up to a feeling: see test/mine.test.js, which
// enumerates this table against EARN_CAP at every step and would fail on a single pay raised past
// it. The shape of the ladder is 1 / 3 / 7 for the three gems and 20 / 71 for the two relics, so
// a relic is worth a handful of gems and the rarest find is a thirtieth of the ladder it opens on.
//
// SIXTEEN TIMES 1.41.0'S TABLE (1.42.0), which is the whole of what the ceiling above bought. The
// reader's complaint was that the ore is far too cheap, and under a 15% ceiling they were right by
// construction: a quartz was one credit, which is a tenth of the first pick and four thousandths
// of an hour's ordinary earning, so no find could be worth looking at. The multiple is not a taste
// either -- it is EARN_CAP divided by what the table realised, and the enumeration is what says
// where that lands (191.750% against a 200% line; the brief's own estimate of sixteen and a half
// came out at 200.982% and would have shipped a mine over its own ceiling).
//
// AND THE GEMS GOT THEIR OWN LADDER BACK. 1.41.0 compressed them to 1/2/3 for one reason: quartz
// cannot go under one whole credit and it is 20 of the 64 buckets, so a table fitting under 2.75
// credits a cell could not also be 1/3/7. Under 36.72 credits a cell it can, and 7/21/49 is that
// shape at the scale the ceiling allows: amethyst is seven quartz again rather than three, which
// is what makes the rarer gem a different event and not a bigger number. The RELICS keep the
// proportions they have had since 1.40.0 (140 is 2.86x the best gem against 2.79x, and 500 is
// 3.57x the coin against 3.59x), and the two round numbers at the top are round on purpose: they
// are what the Sell button prints.
//
// `gate` IS THE LOWEST STEP THE WALL GIVES THE ROW UP TO, and it is the whole of "a pick is a key".
// Three things to keep about it:
//
//   gate 0    bare hands take it. The gems are all 0, so a reader who has bought nothing still has
//             something coming out of the wall and the screen is not dead on its first open
//   gate 50+  the row is in the rock for everybody and OUT OF REACH below that step. It is still
//             drawn (`seamsAhead` sends it with `locked`), because a thing you can see and cannot
//             take is the whole of what the next band is for
//   BANDS     every gate is the first step of a band, so the four looks the screen draws are
//             exactly the four sets of rows. The load-time check below refuses anything else
//
// AND A LOCKED ROW STILL CLEARS ITS NEIGHBOURS. The spacing rule (`seamAt`) reads the LAYOUT, which
// is the same at every step, so an idol a first-step pick cannot lift still keeps the two cells
// beside it empty. That is deliberate twice over: the screen's 48px marker needs that room whether
// the reader can take the thing or not, and a layout that rearranged itself per step would be a
// different drift for every pick.
//
// A FEVER PAYS NOTHING. What it gives is ground, which is the reader's own words for it ("it digs
// through a lot of DIRT"), and the gems standing in that ground pay because they are gems. Written
// as a pay of 0 rather than as a separate table so the walk below has one kind of thing to look at.
// Its gate is the lowest of the three because the ground it gives is worth less than a relic is:
// the bands open the three gated rows in the order of what they are worth, cheapest first.
const SEAMS = Object.freeze([
  { name: 'Quartz', kind: 'gem', pay: 7, odds: 20, gate: 0 },
  { name: 'Garnet', kind: 'gem', pay: 21, odds: 14, gate: 0 },
  { name: 'Amethyst', kind: 'gem', pay: 49, odds: 6, gate: 0 },
  { name: 'Old coin', kind: 'relic', pay: 140, odds: 4, gate: 175 },
  { name: 'Crab idol', kind: 'relic', pay: 500, odds: 2, gate: 350 },
  { name: 'Fever', kind: 'fever', pay: 0, odds: 2, gate: 50 }
].map((s) => Object.freeze(s)));

// How many kinds there are to hold. The inventory is indexed by the row's place in the table above,
// so a count and a pay are the same subscript and nothing has to carry a name to be sold
const ROWS = SEAMS.length;

// How far a fever carries. FOUR CELLS, written as the multiplication so that it stays four cells
// when the window moves: what a fever costs the ceiling is a number of CELLS, and four of them is
// four times the whole lookahead whatever a metre has come to be worth
const FEVER_M = CELL_M * 4;

// --- the window ---------------------------------------------------------------------------------
//
// What the screen may see: BEHIND_M of dug drift and AHEAD_M of rock. The RATIO is the screen's
// (40% / 60% of the drift, docs/game-panels.md 5-15), so these two have to be in 2:3 or the two
// halves would be drawn at different scales and the picture would lie about distance.
//
// THE LOOKAHEAD IS A NUMBER OF ORDINARY REPLIES AND NOTHING ELSE (1.41.0, and it is the whole
// release). 99 and 66 were sized against the heaviest push -- a window that had been shut for a
// week arriving in one beat -- and the file header has the algebra for what that cost: with the
// window pinned to the rarest reading, the ruler cancels out of the pixels and no amount of
// digging speed can make an ordinary reply visible. Six replies of the FASTEST step is what the
// lookahead is now, which is the same rule the screen always had (below) with the floor taken off
// it and the heaviest push moved to the dash where it belongs.
//
// WHAT IT BUYS, at a 250px sidebar where the band measures 156px over AHEAD_M + BEHIND_M metres:
//
//                       step 1        step 100
//   a reply moves      2.05 m         5.00 m
//   ...in pixels       6.39 px        15.59 px      against 2.89 px and 7.08 px at a 99 m window
//   a marker is seen   14.7 replies   6.0 replies   before the face reaches it
//
// A WIDER WINDOW CANNOT BE TRADED FOR A FASTER RULER. Every metre is drawn in 156 / span pixels,
// so doubling the window halves the pixel a metre is worth and doubling the digging speed hands it
// straight back. That is why this is the only lever that moves the picture, and it is why the
// three halvings of WORK before it did not.
//
// ONE MARKER AT A TIME SURVIVES, and for free: CELL_M is AHEAD_M, so at most one cell boundary is
// ever inside the lookahead and two markers cannot share the screen whatever the sidebar is doing.
// The measured 24px and 48px spacings are satisfied by there being nothing to space, at every
// width, which is the same guarantee the 100 m cell gave and not a weaker one.
const AHEAD_M = 30;
const BEHIND_M = 20;

// What a reply moves, in metres, at the FASTEST step: 30,600 weighted tokens is this reader's
// measured mean reply and the top step breaks a stone every 6,124. Written here because the window
// is chosen against it; test/mine.test.js does the division so the two cannot drift apart.
// THE INVARIANT BELOW USES THE TOKENS AND NOT THIS FIGURE, because this one is floored (4 m for
// 4.996) and a rule held against a floored metre count is a rule with 20% of slack hidden in it
const REPLY_TOK = 30600;
const REPLY_M = 4;

// HOW MANY STONES THE SCREEN WILL BREAK ONE AT A TIME before it runs the ground instead
// (games/mine/panel.js, MN_BURST, where the figure is measured against the swing and the ten
// second push interval). It is in the engine because two of the conditions below are about it and
// the engine cannot ask a panel anything; test/webview/games/mine.js reads MN_BURST out of the
// panel's source and holds the pair together, the way it already does for the chips and the lights.
//
// A STONE IS A METRE, so this is also a DISTANCE: a push that moves more than DASH_M of drift is
// drawn as a run, and one that moves less is drawn as the crab walking it. That identity is what
// lets the heaviest push stop being the window's problem
const DASH_M = 4;

// The heaviest single push, in metres, at the FASTEST step. 20 credits is webview.js's
// CC_LANDING_JUMP, the measured figure for "even the busiest stretch rarely earns this much between
// two pushes", and 20 credits is 20 x CREDIT_UNIT weighted tokens. At the top step that is 32 m,
// which is past the whole lookahead.
//
// AND THAT IS NOW THE CONTRACT RATHER THAN THE DEFECT (1.41.0). 32 m is 32 stones, which is eight
// times DASH_M, so this push is drawn as the ground RUNNING for 1,200ms and the reader sees the
// distance travel rather than a marker vanishing between two frames. The old window was three
// times wider than it needed to be in order to make this one reading safe as a WALK, and it was
// never going to be: what makes it safe is that it is not a walk
const PUSH_M = 32;

// --- how much one claim may walk ----------------------------------------------------------------
//
// A mine nobody has looked at for a month is 3,504 cells behind (52.4 MT a day for thirty days at
// the first step, and 8,557 at the top one), and a reader coming back from leave is further.
// THE BUDGET WENT UP WITH THE CELL COUNT (1.41.0, 64 to 256): a cell is 30 m where it was 100, so
// the same month is three times as many cells and a 64-cell bite would have taken 134 pushes, or
// 22 minutes of dashes, to catch up. 256 brings that back to 34 pushes, which is what it was, and
// the hashing is a murmur3 per cell -- the cost is nowhere near the thing claim (e) is about.
// One message takes at most this many cells OF DUG GROUND and LEAVES THE REST: `claimedTo`
// stops where the walk stopped, so nothing is skipped and nothing is taken twice, and the next push
// takes the next bite.
//
// THE BUDGET COUNTS DUG CELLS, AND THE GROUND A FEVER GIVES IS ALWAYS CLAIMED BY THE SAME WRITE
// however much of it there is. That is not generosity, it is the only arrangement in which the chain
// stays broken: "the ground this fever gave" is a position, the record stores no positions, so the
// instant a write ends with granted ground left unclaimed, the next read cannot tell that ground
// from ground the tokens dug and the fever standing in it fires again. Claimed in the same write it
// is behind `claimedTo` for ever, and a cell behind `claimedTo` is never walked again.
//
// So the real ceiling on one message is CLAIM_CELLS x (1 + FEVER_M / CELL_M), which is 1,280 cells:
// every dug cell in the bite could hold a fever and each would add four. Measured against claim (e),
// a hundred thousand is seventy-eight times that.
const CLAIM_CELLS = 256;

// --- the conditions the numbers above have to keep ----------------------------------------------
//
// Every one of these is a measured condition from docs/game-panels.md 5-15 or a rule the walk below
// relies on, and it THROWS rather than only being tested, because a retune that broke one of them
// would otherwise ship a screen that draws seams at depths they are not at. shop.js's price ladder
// is checked the same way and for the same reason: a rule that lives only in a test is a comment
// with a test beside it.
(function () {
  if (FEVER_M % CELL_M) throw new Error('mine: a fever has to give whole cells away');
  if (CELL_M % STONE_M) throw new Error('mine: a cell is not a whole number of stones');
  // the screen splits the drift 40% / 60%, so these two are drawn at one scale only in 2:3
  if (AHEAD_M * 2 !== BEHIND_M * 3) throw new Error('mine: the window is not the screen\'s 2:3');
  // A SEAM IS ON SCREEN FOR SIX ORDINARY REPLIES, AND THIS IS THE LINE THE WINDOW IS SIZED BY
  // (1.41.0). It is the same rule it has always been with two things changed about how it is read.
  //
  // IT IS HELD IN TOKENS, not on REPLY_M. That constant is a floored metre count (4 m for a reply
  // that moves 4.996), so `REPLY_M * 6 <= AHEAD_M` would pass a window a fifth narrower than six
  // replies really need, and a rule with 20% of slack inside it is a rule that will be spent.
  //
  // AND IT IS THE BINDING ONE NOW, which is the whole of this release: the lookahead is exactly
  // what six replies of the fastest step cover, so the band's scale is set by the reading that
  // happens every ten seconds rather than by the one that happens once a month. Loosen the six and
  // the ground moves faster across the screen; tighten it and a marker is on screen longer. There
  // is no third thing it trades against, because the ruler cancels (see the file header)
  if (REPLY_TOK * 6 > AHEAD_M * WORK[STEPS]) {
    throw new Error('mine: a seam is on screen for fewer than six ordinary replies');
  }
  // ...AND AN ORDINARY REPLY IS WALKED, NEVER RUN. The screen draws up to DASH_M stones one at a
  // time and runs the ground for anything above that, so a reply past the line would be drawn as
  // a backlog every single time and "a stone broke" would never be a countable event again. This
  // is the condition that stops the ruler being made faster without end
  if (REPLY_M > DASH_M) throw new Error('mine: an ordinary reply is drawn as a run, not a walk');
  // ...AND WHAT IS RUN HAS MOVED A VISIBLE PART OF THE ROCK. The other side of the same line: the
  // dash costs 1,200ms and it is the screen's way of saying "more happened than you can watch", so
  // the smallest thing it can be asked to say that about has to be worth saying. DASH_M stones is
  // DASH_M metres (a stone is one), and at twice it the run is at least a seventh of the lookahead
  if (DASH_M * 2 > AHEAD_M) throw new Error('mine: the dash runs for less than a seventh of the rock');
  // ...AND THE HEAVIEST PUSH IS ALWAYS ONE OF THOSE RUNS. This is what replaced
  // `PUSH_M * 2 <= AHEAD_M` (1.41.0). The old line made the window wide enough that a week of
  // backlog arriving in one beat could be drawn as a WALK without a marker vanishing between two
  // frames, and the cost of that was the window being three times wider than the ordinary reply
  // needs -- the rarest reading setting the scale for the commonest one. The protection itself was
  // right and it is kept: a push this size is drawn as the ground running, so the reader sees the
  // distance travel instead of the rock jumping. Measured at the FASTEST step, which is where the
  // push covers the most ground; the fist's own heaviest push is 1 m and needs no run at all
  if (PUSH_M <= DASH_M) throw new Error('mine: the heaviest push is drawn as a walk');
  // ...AND A WALKED PUSH MAY NOT TAKE THE CAMERA TWO STOPS AT ONCE. This is the camera spec's own
  // rule (docs/mine-mockup/spec-idle.md, 1-4) with the same substitution: it was written as
  // "a stride has to be longer than the HEAVIEST PUSH", because a push that swallowed a whole
  // stride would draw the crab standing still with the ground sliding left, which is the conveyor
  // belt this screen was twice rejected for. What actually has to be longer than a stride is the
  // biggest push that is WALKED, and that is DASH_M: anything past it is run, and a run sliding
  // the ground left is what a run is. The stride is CELL_M / 3 and a stone is a metre
  if (DASH_M * 3 >= CELL_M) throw new Error('mine: a walked push can take the camera two stops');
  // ONE MARKER AT A TIME. A cell at least as wide as the lookahead is what makes the measured 24px
  // and 48px spacings unbreakable AT EVERY SIDEBAR WIDTH: there is never a second marker to space
  // against, so no pixel figure enters into it. CELL_M is AHEAD_M exactly, which is also the
  // densest the rock can be (see CELL_M)
  if (CELL_M < AHEAD_M) throw new Error('mine: two markers can be on screen at once: check the spacing');
  // ...but not so wide that the lookahead is usually empty, which is the reason to come back
  if (CELL_M > AHEAD_M * 2) throw new Error('mine: the lookahead is empty more often than not');
  // the ladder has to be a ladder in both columns, or a step would offer something worse.
  // THE WORK COLUMN IS STRICT AND THE PRICE COLUMN IS NOT, and that asymmetry is 1.42.0's: a
  // flat price is two steps a reader buys for the same money, which is nothing to answer for, but
  // a flat RUNG is a purchase that buys nothing at all. It is the one way a longer ladder can go
  // wrong that no figure in this file would show -- a curve run past the window's line and clamped
  // flat at the bottom would pass every other condition here and sell the reader five hundred
  // steps of which the last hundred do nothing. There is a price curve asserted against this too
  // (test/mine.test.js: every step is recovered by the ground it digs), and this line is why it
  // can be
  for (let s = 2; s <= STEPS; s++) {
    if (PRICE[s] < PRICE[s - 1]) throw new Error('mine: the steps are not a rising price');
    if (WORK[s] >= WORK[s - 1]) throw new Error('mine: a dearer step is not faster');
  }
  if (WORK[STEPS] < TOK_PER_SWING) throw new Error('mine: the top step breaks a stone in under one swing');
  if (PRICE[1] < 1) throw new Error('mine: the first step is free');
  // THE GATE COLUMN IS A LADDER TOO, and these are what make it one. The suite proves the ceiling
  // and the paybacks off the table; these are the ends of it, which a retune can break without any
  // figure moving: a table with nothing at gate 0 is a screen that pays a new reader nothing, and a
  // gate that is not a band's first step is a look the screen cannot draw
  let free = 0, top = 0;
  for (const s of SEAMS) {
    if (!Number.isInteger(s.gate) || s.gate < 0 || s.gate > STEPS) {
      throw new Error('mine: ' + s.name + ' is behind a step that is not on the ladder');
    }
    if (s.gate !== 0 && BANDS.indexOf(s.gate) < 0) {
      throw new Error('mine: ' + s.name + ' is gated between two bands, so no look says it is open');
    }
    if (s.gate === 0) free += 1;
    if (s.gate === BANDS[BANDS.length - 1]) top += 1;
  }
  if (!free) throw new Error('mine: bare hands can take nothing out of the wall');
  if (!top) throw new Error('mine: the top band opens nothing the band below it cannot take');
})();

// --- the record ---------------------------------------------------------------------------------
//
//   by           the window that last wrote it. The host fills it in; this module invents nothing
//   moves        accepted writes. The merge clock: it only grows, so of two copies the one with more
//                moves is the later one, and a window writes exactly one record per move count,
//                which is what makes (moves, by) the record's name
//   rungs        HOW LONG THE LADDER WAS WHEN `step` WAS WRITTEN. It is always this build's STEPS
//                on the way out and it is read on the way in for one job: a step is a number on a
//                ladder of a known length, so a record from a ladder of a different length names
//                its rung with the wrong number and `clean` rescales it. Nothing else reads it and
//                nothing in the game can change it
//   step         THE WHOLE OF WHAT TOOL IS IN HAND: the step fitted, 0 for none, and it only ever
//                rises (nextStep). There is no second field about the pick, because a pick never
//                wears out: what was bought is what is being dug with, at every token count, for
//                ever. 1.41.0 had a `durM` beside this one and 1.40.0 a `durTok`, and both are
//                simply dropped on load (see `clean`) rather than migrated into anything
//   anchorTok    the weighted token count when that pick was fitted
//   anchorDepth  the depth it was fitted at, MINUS `bonus`, so that depth = anchorDepth + bonus + cut
//                is continuous across a purchase while `bonus` goes on being a lifetime figure
//   claimedTo    HOW FAR THE TAKING HAS GOT. A boundary, one number, NOT a list of what was taken.
//                Depth only rises, so what has been taken is always a prefix of the drift and a
//                boundary says all of it. A list would have to be unioned across two windows' copies
//                on a merge, which is the shape of the bug that minted 372,000 credits out of one
//                sword (shop.js's header, games/README.md section 3 point 3)
//   bonus        metres the fevers have given, for ever. Part of depth, and claimed by the same write
//                that grants it
//   spent        credits paid for steps. IN the record, so a purchase the merge drops charges nothing
//   earned       credits SELLING has paid out. IN the record, so a sale the merge drops pays nothing
//   got[]        HOW MANY OF EACH ROW THE WALL HAS GIVEN UP, for ever. One count per row of SEAMS
//   sold[]       how many of each row have been sold, for ever. Both only ever rise, and what is
//                held is the difference: two monotone counters cannot disagree about a sale the way
//                a single mutable count and a cash figure can, and a merge that drops a sale takes
//                `sold` and `earned` back together because they are fields of one record
//   finds        how many things have come out of the wall. For the screen
//
// WHY AN INVENTORY AT ALL. Until 1.41.0 the wall paid credits the instant the face passed a seam,
// so the money arrived with nothing to look at and the reader never met the thing they had found.
// Now the ground yields STONES AND GEMS and the credits arrive when the reader sells, which splits
// claim (b) in two: a stretch yields once (the boundary) and a gem is sold once (sold <= got).
//
// WHAT IS NOT IN HERE: the depth, how far into the current stone the work has got, and what is in
// the stretch between `claimedTo` and the face. All of them are derived, which is the point: a
// stored depth and a token count that disagreed would be two answers to one question, and the
// token count is the one that cannot be edited by hand.
const REC_FIELDS = Object.freeze([
  'moves', 'rungs', 'step', 'anchorTok', 'anchorDepth', 'claimedTo', 'bonus', 'spent', 'earned',
  'finds'
]);
// The two counters that are kept per row. Held apart from REC_FIELDS because every rule that walks
// a record (clean, save, same) has to walk these one element at a time
const BAG_FIELDS = Object.freeze(['got', 'sold']);

// EMPTY, AND THIS IS THE ONE LINE IN THIS FILE THAT COULD MINT MONEY. Max a field across a merge and
// the loser's figure survives into the winner's record:
//   `claimedTo` maxed  the winner's `got` with the loser's boundary: ground taken once and marked as
//                      taken twice over, or the other way round, ground skipped for nothing
//   `earned` maxed     the money of a sale that was dropped, next to the `sold` that says the gems
//                      are still there to sell again. That is claim (b) broken, and it is the
//                      372,000 bug exactly
//   `got` maxed        THE GEMS OF A DROPPED CLAIM, kept next to a boundary that says the ground
//                      they came out of is still there. Max it per row and two windows reading the
//                      same stretch each keep a copy of everything in it
//   `sold` maxed       gems marked as sold without the credits that paid for them, which is the
//                      same bug pointing the other way: the reader loses them
//   `bonus` maxed      a fever's ground kept while the write that claimed it was thrown away
//   `step` maxed       THE PICK OF A DROPPED PURCHASE. A step is paid for and it is what the wall
//                      is opened with, so a window whose purchase lost the merge would keep the
//                      pick it did not buy next to a `spent` that says it never paid for one
// `finds` is not maxed either, for the market's reason (market.js, MAX_FIELDS): a find that was
// dropped did not happen, so its figure may not outlive it. `rungs` is not maxed because it is not
// a figure about the reader at all: it is the length of the ladder the step beside it was counted
// on, and maxing it across a merge would read a step on this ladder as a step on a longer one and
// rescale a number that was already right. `pick` is not maxed and is not even in the record: it
// is written by `save` for an older build to read and it is derived from `step`, so lifting it out
// of the loser would carry the band of a purchase the merge threw away, which is `step` being
// maxed by the side door. The winning record is adopted WHOLE and nothing is lifted out of the
// loser.
const MAX_FIELDS = Object.freeze([]);

// What `clean` will believe. A figure outside these is not one `save` could have produced, so it
// reads as nothing at all: without them a hand-edited store sets `moves` to 1e15 and wins every
// merge for ever, and every real window is told another window moved first.
//  - a write a second for thirty years is 1e9
//  - 1e15 weighted tokens is ten million of this reader's days, and 1e15 credits is a thousand times
//    the casino's largest jackpot
//  - 1e12 metres is 6e15 weighted tokens at the fastest step, so a depth past it is a depth no token
//    count can reach (MAX_TOK is 1e15)
const MAX_MOVES = 1e9;
const MAX_MONEY = 1e15;
const MAX_TOK = 1e15;
const MAX_DEPTH = 1e12;
// A FORGED `step` IS NOT A HOLE IN CLAIM (a). The ceiling is enumerated at every step including the
// top one, and the enumeration prices a cell at that step's own full digging speed, so the most a
// hand-edited store can give itself is the rate step 100 was already proved against
// `rungs` IS NOT CEILED AT STEPS, and that is deliberate: a ladder longer than this build's is
// exactly the record a NEWER build writes, and dropping its length to 0 would read its step as a
// rung of 1.41.0's hundred and multiply it by five. Held as written, `clean` divides instead and
// the reader comes back at the same fraction of the climb. The step itself is still ceiled, so no
// `rungs` can hand out a rung that is not on this ladder
const REC_CEIL = Object.freeze({
  moves: MAX_MOVES, rungs: MAX_MOVES, step: STEPS, anchorTok: MAX_TOK, anchorDepth: MAX_DEPTH,
  claimedTo: MAX_DEPTH, bonus: MAX_DEPTH, spent: MAX_MONEY, earned: MAX_MONEY, finds: MAX_MOVES
});
// One row cannot hold more than this. A reader at the top step breaks 8,556 stones a day, so a
// count past 1e12 is one no amount of digging could reach
const MAX_COUNT = 1e12;

function zeroBag() { const out = []; for (let i = 0; i < ROWS; i++) out.push(0); return out; }

// A record for a reader who has never dug. `anchorTok` IS AN ARGUMENT and that is deliberate: the
// mine is born at the token count it is first read at, so nothing is paid for work done before the
// screen existed. Anchored at 0 instead, a reader's first claim would walk their whole history and
// hand over a lump sum, which is a retroactive payout dressed as a game.
function fresh(by, anchorTok) {
  const tok = (Number.isSafeInteger(anchorTok) && anchorTok > 0) ? Math.min(anchorTok, MAX_TOK) : 0;
  return {
    by: by == null ? '' : String(by),
    moves: 0, rungs: STEPS, step: FIST, anchorTok: tok, anchorDepth: 0, claimedTo: 0, bonus: 0,
    spent: 0, earned: 0, finds: 0, got: zeroBag(), sold: zeroBag()
  };
}

// --- the layout, cell by cell -------------------------------------------------------------------

// Which bucket a cell falls in. A murmur3 finaliser over the cell number with the high word folded
// through it, so a cell past 2^32 is not an alias of one below it, and the top six bits are taken
// rather than the bottom ones. No Math.random anywhere: the same metre is the same metre for ever.
function bucketOf(cell) {
  let h = ((cell % 4294967296) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ Math.floor(cell / 4294967296)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h = (h ^ (h >>> 16)) >>> 0;
  return h >>> 26;                       // the top 6 bits: BUCKETS is 64
}

// The bucket table, built once: 64 slots, one per bucket, holding a seam or nothing
const BY_BUCKET = (function () {
  const out = [];
  for (const s of SEAMS) for (let i = 0; i < s.odds; i++) out.push(s);
  if (out.length > BUCKETS) throw new Error('mine: the seam table claims more buckets than there are');
  while (out.length < BUCKETS) out.push(null);     // barren rock
  return Object.freeze(out);
})();

// The hash's own answer for a cell, before the spacing rule
function rawAt(cell) { return cell >= 1 ? BY_BUCKET[bucketOf(cell)] : null; }
function isRelicRaw(cell) { const s = rawAt(cell); return !!s && s.kind === 'relic'; }
// Does the relic the hash put at `cell` actually stand? Two relics side by side and the LOWER cell
// keeps its, which settles the pair without either one having to ask about the other
function relicStands(cell) { return isRelicRaw(cell) && !isRelicRaw(cell - 1); }

// WHAT IS REALLY AT A CELL, spacing rule and all, or null for barren rock.
//
// A standing relic clears its two neighbours, and that is the whole of the spacing rule: the window
// above needs 45% of its width between a 48px relic and anything else and only 30% between two 24px
// markers, so a uniform cell cannot satisfy both and still show three markers. Cleared neighbours
// put two cells between a relic and the next marker (63.5% of the window) and leave gem against gem
// at one cell (31.75%), and both clear.
//
// Nothing here recurses: the answer for a cell reads the hash for that cell and three around it.
function seamAt(cell) {
  const s = rawAt(cell);
  if (!s) return null;
  if (s.kind === 'relic') return relicStands(cell) ? s : null;
  return (relicStands(cell - 1) || relicStands(cell + 1)) ? null : s;
}

// --- what a tier may take out of the wall ---------------------------------------------------------

// Is this row's gate open at that step? One comparison, in one place, and every reader of it goes
// through here: the claim (`sweep`), what the screen is shown (`seamsAhead`) and the fold
// (`paysFor`). Written as a function rather than inlined three times because the three have to
// agree -- a locked row the screen drew as takeable, or a row the wall gave up while the fold said
// it was out of reach, is the host telling the reader two things
function takes(step, s) { return !!s && step >= s.gate; }

// --- depth: a count of stones --------------------------------------------------------------------

// The tokens this pick has seen. CLAMPED AT 0, which is not defensive tidying: two windows hold
// ledger copies of different ages, so the count one window reads can be lower than the count that
// anchored the pick, and an unclamped subtraction would run the mine backwards
function usedOf(rec, tok) {
  const t = Number.isSafeInteger(tok) && tok > 0 ? tok : 0;
  return Math.max(0, t - rec.anchorTok);
}

// IS THERE A PICK IN HAND AT ALL? One comparison on one field, which is the whole of it since
// 1.41.0: a pick that was bought is in hand at every token count, so the only reader with no pick
// is the one who has not bought one. `view`'s `tool` and the work per stone below are the two
// things that hang off it, and they go through here so they cannot disagree
function hasPick(rec) { return !!rec && rec.step >= 1; }

// WHAT ONE STONE COSTS THE READER IN FRONT OF THIS RECORD: the step's own work, or FIST_DIV times
// the first step's when nothing has been bought
function workIn(rec) { return workOf(rec.step) || FIST_WORK; }

// STONES BROKEN SINCE THE ANCHOR, which is also the metres advanced: a stone is STONE_M of them.
//
// ONE FLOOR AND ONE DIVISOR. There is no boundary inside this any more: the tool cannot change
// while the tokens arrive, so the whole stretch since the anchor is cut at one rate and a stone is
// whole or it is not broken. The count is monotone in `tok`, which is the property the whole
// derivation rests on, and it is now monotone for the plainest possible reason
function cutOf(rec, tok) {
  return Math.floor(usedOf(rec, tok) / workIn(rec)) * STONE_M;
}

function depthOf(rec, tok) { return rec.anchorDepth + rec.bonus + cutOf(rec, tok); }

// WHICH KEY IS IN HAND. The step the gate is read against, and it is the record's own step: the
// tool and the receipt are the same thing now, because nothing takes a pick away. The function
// stays because every reader of the gate goes through it (the claim, the lookahead, the fold) and
// one place is what makes them agree
function stepOf(rec) { return hasPick(rec) ? rec.step : FIST; }
// ...and which of the four looks that is. The screen draws a band, never a step
function bandIn(rec) { return bandOf(stepOf(rec)); }

// HOW FAR INTO THE STONE IN HAND THE WORK HAS GOT, in swings, which is the reader's own unit for
// this ladder. The screen draws the next stone from it and works nothing out: `of` is how many
// swings this step takes to break a stone (ten at the first step, four at the top one) and `at`
// is how many of them have landed. Bare hands are a stone of their own, eight times the first
// step's, so the pair still says something true when there is no pick
function stoneOf(rec, tok) {
  const unit = workIn(rec);
  const into = usedOf(rec, tok) % unit;
  const of = Math.max(1, Math.round(unit / TOK_PER_SWING));
  const at = Math.min(of, Math.max(0, Math.floor(into / TOK_PER_SWING)));
  return { at, of };
}

// --- the claim -----------------------------------------------------------------------------------

// Walks the cells between `claimedTo` and the face, TAKES WHAT STANDS IN THEM INTO THE BAG, and
// lets a fever in the dug stretch give away ground that this same walk then claims. Pure: the
// record handed in is not touched and the one handed back is new, or is the very same object when
// there was nothing to do.
//
// NO CREDITS MOVE HERE. The wall yields gems and the gems become credits when the reader sells
// (`act`'s sell), which is the first half of claim (b): a stretch yields exactly once, because
// `claimedTo` is a boundary and the ground behind it is never walked again.
//
// ONLY TOKENS SET OFF A FEVER. A fever standing in the ground another fever gave away is inert,
// because that ground was claimed by the write that granted it, and that is what "the chain is
// broken" means in one line of code. A fever therefore cannot pay for itself twice and a run of them
// cannot run away.
//
// Returns { rec, claim }, with `claim` null when the face has not passed another cell. The claim is
// what the screen is told about and it is NOT in the record: a find is an event, and a record that
// stored the last one would show it again after a reload.
function sweep(rec, tok) {
  const face = depthOf(rec, tok);
  const step = stepOf(rec);
  const from = rec.claimedTo;
  const paidTo = Math.floor(from / CELL_M);         // the last cell already taken
  const dugEnd = Math.floor(face / CELL_M);         // the last cell the TOKENS have reached
  if (dugEnd <= paidTo) return { rec, claim: null };

  // The dug cells this write takes. Beyond it is a backlog and `more` says so
  const bite = Math.min(dugEnd, paidTo + CLAIM_CELLS);
  const finds = [];
  const got = rec.got.slice();
  let end = bite;                                   // ...and the fevers push this out
  let worth = 0, grant = 0, dashWorth = 0, dashHits = 0, n = 0;
  for (let c = paidTo + 1; c <= end; c++) {
    const s = seamAt(c);
    if (!s) continue;
    // THE WALL KEEPS WHAT THIS STEP IS NOT THE KEY TO, and it keeps it for good: the boundary is
    // one number, so the cell is behind `claimedTo` the moment the claim passes it and no later
    // purchase can come back for it. That is claim (b) having one shape, not a penalty bolted on --
    // a list of the cells that were left would be the union-across-two-copies the forge minted
    // 372,000 credits out of. The screen says so in advance: a locked seam is drawn in the
    // lookahead with `locked` on it, which is the reader's cue to fit the next band before it goes
    if (!takes(step, s)) continue;
    if (s.kind === 'fever') {
      // A fever in the ground the TOKENS dug gives FEVER_M away; one standing in ground a fever
      // already gave is inert, and those two sentences are the whole of "the chain is broken"
      if (c <= bite) { grant += FEVER_M; end += FEVER_M / CELL_M; }
      continue;
    }
    const row = SEAMS.indexOf(s);
    got[row] = Math.min(got[row] + 1, MAX_COUNT);
    n += 1;
    worth += s.pay;
    // `row` and not a name: the screen draws a picture per row and the host sends no words
    finds.push({ at: c * CELL_M, row, kind: s.kind, pay: s.pay });
    // the dash's own tally, which is what the screen divides 1,200 ms by
    if (c > bite) { dashWorth += s.pay; dashHits += 1; }
  }

  // `end` is at least paidTo + 1 and `from` is under (paidTo + 1) x CELL_M, so the boundary only
  // ever moves forward even when a hand-edited record left it off a cell boundary. The claim is one
  // unbroken prefix: the granted cells are simply the cells after the bite, which is what makes a
  // single boundary able to say all of it
  const to = end * CELL_M;
  const next = Object.assign({}, rec, {
    moves: rec.moves + 1,
    claimedTo: to,
    bonus: rec.bonus + grant,
    got,
    finds: rec.finds + n
  });
  return {
    rec: next,
    claim: {
      from, to, finds, grant, dashHits,
      // WHAT THE CLAIM IS WORTH IF IT IS SOLD, which is not what it paid: nothing was paid. The
      // host works it out because the screen may not multiply a count by a price
      worth, dashWorth,
      depth: next.anchorDepth + next.bonus + cutOf(next, tok),
      // ground the tokens have already dug and this write did not reach. The next message takes it.
      // Measured against `end` and not against the bite, because a fever's grant walks past the
      // bite and can clear the backlog on its way
      more: end < dugEnd
    }
  };
}

// --- the bag -------------------------------------------------------------------------------------

// How many of a row are in hand: everything the wall has given up, less everything that has been
// sold. TWO MONOTONE COUNTERS AND A SUBTRACTION, which is the whole reason a sale cannot happen
// twice: `sold` only rises, it rises in the same write that raises `earned`, and a merge that drops
// that write drops both of them together because they are fields of one record
function heldOf(rec, row) {
  if (!rec || row < 0 || row >= ROWS) return 0;
  const n = rec.got[row] - rec.sold[row];
  return n > 0 ? n : 0;
}
// What one row in hand is worth in credits. The rate is the table's and it is FIXED, which is what
// makes hoarding worth nothing: a gem sells for what it was worth when the wall gave it up
function valueOf(rec, row) { return heldOf(rec, row) * (SEAMS[row] ? SEAMS[row].pay : 0); }
// ...and the whole bag, for the heading
function bagValue(rec) { let v = 0; for (let i = 0; i < ROWS; i++) v += valueOf(rec, i); return v; }
// Is this row one the wall can give up and the reader can sell? A fever is in the table but it is
// ground rather than a thing, so it is never in the bag
function sellable(row) { return row >= 0 && row < ROWS && SEAMS[row].pay > 0; }

// --- what may be done ----------------------------------------------------------------------------

// `sell` carries a row off the wire, which is the only field any message to this game may name
const OPS = Object.freeze(['buy', 'sell']);

// Why `op` cannot be done, or null. `budget` is the credits this game may spend; left out means no
// limit, which is how act() runs: the money rule is the host's and it reads the live balance before
// calling in. Written as !(a <= b) so a NaN budget, which is a broken ledger, refuses rather than
// allows.
//
// THERE IS NO REFUSAL FOR BUYING EARLY, and since 1.41.0 there is nothing early to refuse: a pick
// is never spent, so there is no moment that is the right one to replace it in. A step costs its
// price and nothing else. The warning that stood here once (`offer.lose`) went with the loss it
// described, and the refusal that replaced it (`sealed`) is down to one case, which is the top of
// the ladder: nothing is sold above it
function whyNot(rec, op, budget) {
  const name = op && typeof op === 'object' ? op.op : null;
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!rec) return 'there is nothing to spend';
  if (name === 'sell') return whyNotSell(rec, op);
  if (sealed(rec)) return 'nothing is sold above this step';
  const room = budget == null ? Infinity : budget;
  if (!(priceOf(nextStep(rec.step)) <= room)) return 'not enough credits';
  return null;
}

// Why a sale cannot be made. THE ROW COMES OFF THE WIRE, so it is checked against the table rather
// than trusted: anything that is not a row of SEAMS, and the fever row which is ground and never a
// thing, is refused before anything is counted. No budget is read here, because a sale spends
// nothing
function whyNotSell(rec, op) {
  const row = op && Number.isSafeInteger(op.kind) ? op.kind : -1;
  if (!sellable(row)) return 'there is nothing of that kind';
  if (heldOf(rec, row) <= 0) return 'nothing to sell';
  return null;
}

// IS THERE NOTHING LEFT TO SELL? One condition since 1.41.0: there is no step above the one in
// hand. `nextStep` repeats the top step for ever, so without this the button would take the price
// again and again at the top of the ladder and nothing on the screen could change -- which is the
// credit sink the reader found on 1.40.0, at 12,500 credits a press.
//
// IT TAKES NO TOKEN COUNT. The two conditions that did were about a pick running out: whether a
// longer pick would move the line (there is no line, because there is nothing to run out of) and
// whether the gated rows had come back because the pick in hand had gone. Neither can happen now,
// so what is left is a question about the ladder alone and the answer is the same at every depth
// and every token count.
//
// WHY A FUNCTION RATHER THAN THE COMPARISON TWICE. `offerFor` decides whether the button is there
// and `whyNot` decides whether the press is allowed, and a screen offering a purchase the host
// refuses is the one defect here with no innocent reading
function sealed(rec) { return nextStep(rec.step) <= rec.step; }

// Fits the next step, or sells a row. Never mutates its input and hands the very same object back
// when the move is not allowed, so a host can test for identity rather than for a reason (the
// market's rule).
//
// THE ANCHOR IS REPLACED, which is what makes claim (c) true: there is one anchor, so two purchases
// in a row cannot each contribute a stretch of ground. `anchorDepth` is the depth at the moment of
// fitting MINUS `bonus`, which keeps the depth continuous across the purchase while `bonus` goes on
// being a lifetime count.
//
// A STEP COSTS ITS PRICE AND NOTHING ELSE. There is nothing to carry over any more, because the
// pick being replaced had no life to lose: the whole question of when to buy, which is what the
// carry was built to answer on 1.41.0, is gone with the thing that posed it.
//
// `claimedTo` is clamped to the new depth here and nowhere else. This is the one moment the record
// knows what the depth is without a clock in its hand, so it is the one moment a boundary left
// ahead of the face by a hand-edited store can be pulled back. Doing it on every read would be
// wrong by the cut: a boundary legitimately sits ahead of anchorDepth + bonus as soon as a stone
// has been broken and taken, and clamping there would hand back ground that was already taken.
function act(rec, op, tok) {
  // the money rule is the host's, so no budget is handed in here. The token count is, because the
  // anchor and the depth are read off it below
  if (whyNot(rec, op, null)) return rec;
  if (op.op === 'sell') return sell(rec, op.kind);
  const next = nextStep(rec.step);
  const depth = depthOf(rec, tok);
  const now = Number.isSafeInteger(tok) && tok > 0 ? Math.min(tok, MAX_TOK) : 0;
  return Object.assign({}, rec, {
    moves: rec.moves + 1,
    step: next,
    // NEVER BELOW THE OLD ANCHOR. A window holding an older ledger reads a lower count than the one
    // that anchored the last pick, and an anchor moved back to it would hand the new pick work that
    // has already been done, which the new step would then cut again at its own faster rate. Held
    // forward, the purchase a stale window makes lands exactly where one made at the true count
    // would have: `anchorDepth` is this window's own reading of the depth, and `usedOf` clamps the
    // stretch it has not seen to 0 rather than to a negative one
    anchorTok: Math.max(rec.anchorTok, now),
    anchorDepth: depth - rec.bonus,
    claimedTo: Math.min(rec.claimedTo, depth),
    spent: rec.spent + priceOf(next)
  });
}

// Sells everything of one row. THE SECOND HALF OF CLAIM (b): `sold` rises by exactly what was held
// and `earned` rises by that times the table's own price, in ONE write, so the pair can never come
// apart. A merge that drops this write drops both of them and the gems are back in the bag, which
// is the market's rule for a trade: both halves in the record or neither
function sell(rec, row) {
  const n = heldOf(rec, row);
  if (n <= 0) return rec;
  const sold = rec.sold.slice();
  sold[row] = Math.min(sold[row] + n, MAX_COUNT);
  return Object.assign({}, rec, {
    moves: rec.moves + 1,
    sold,
    earned: Math.min(rec.earned + n * SEAMS[row].pay, MAX_MONEY)
  });
}

// --- storage: the rules credits.js calls rather than copies --------------------------------------

// A stored record, field by field, or null for a reader who has never opened the mine. Only these
// fields travel, and the record is REBUILT rather than copied, so a "__proto__" in the stored JSON
// cannot ride along. The host calls this at the storage boundary, the way credits.js calls
// market.clean and shop.clean
function clean(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const out = fresh(REPLICA_RE.test(rec.by) ? rec.by : '', 0);
  for (const k of REC_FIELDS) {
    const n = rec[k];
    out[k] = (Number.isSafeInteger(n) && n > 0 && n <= REC_CEIL[k]) ? n : 0;
  }
  // THE BAGS, ROW BY ROW. Rebuilt rather than copied for the same reason the scalars are, and the
  // length is this build's and not the stored one's: a record written by a version with a different
  // table reads as a bag of what this build can hold
  for (const k of BAG_FIELDS) {
    const src = Array.isArray(rec[k]) ? rec[k] : [];
    for (let i = 0; i < ROWS; i++) {
      const n = src[i];
      out[k][i] = (Number.isSafeInteger(n) && n > 0 && n <= MAX_COUNT) ? n : 0;
    }
  }
  // SOLD CANNOT RUN AHEAD OF GOT. Held is `got - sold` and it is read through `heldOf`, which
  // clamps, so a forged `sold` could not hand anything over either way; it is pulled back here as
  // well so that what is stored is a record this module could have written
  for (let i = 0; i < ROWS; i++) if (out.sold[i] > out.got[i]) out.sold[i] = out.got[i];
  // ...and the fever row is ground rather than a thing, so it is never in the bag
  for (let i = 0; i < ROWS; i++) if (!sellable(i)) { out.got[i] = 0; out.sold[i] = 0; }
  // `step` IS READ TWICE, AND THIS IS THE READING THAT COUNTS. The loop above held it against
  // REC_CEIL, which is THIS ladder's end, and a step past this ladder's end is exactly what a
  // record from a longer one has: dropping it there would take the pick off a reader whose only
  // mistake was running a newer window. So the raw figure is taken again and held against the
  // ladder the record NAMES (`rungs`), which is the only length it could have been a rung of, and
  // the rescale turns it into a rung of this one. A figure past that length is still a forgery and
  // still reads as nothing at all.
  // A TIER FROM AN OLDER RECORD IS A STEP TOO: those records have no `step` at all, and without
  // the line below the reader would be back to bare hands with their purchase gone
  const named = rec.step;
  const rungs = out.rungs > 0 ? out.rungs : LADDER_1_41;
  out.step = (Number.isSafeInteger(named) && named > 0 && named <= rungs)
    ? rescaleStep(named, rungs) : migrateStep(rec);
  // ...and what goes back out is always this build's ladder, whatever came in
  out.rungs = STEPS;
  return out;
}

// THE SAME RUNG ON A LADDER OF A DIFFERENT LENGTH. A `step` means nothing without the number of
// rungs it was counted against, and 1.42.0 is the release that made that true: five hundred rungs
// where there were a hundred, between the SAME TWO STONES (see STEPS, and the work curve's own
// note). So what travels between ladders is the FRACTION OF THE CLIMB, and that fraction is what
// this reads back.
//
// ROUNDED UP AND NEVER DOWN. A rung that lands between two of this ladder's takes the FASTER of
// them, which is the direction every migration in this file errs in and the only one that is
// allowed here: the depth is derived from the work curve, so a step rounded DOWN would be a slower
// stone and the reader's own depth would come back shallower than it went in. That is the one
// thing on this screen that would be unforgivable (see the note on the ruler below).
//
// AND IT WORKS BOTH WAYS, which is why it is a division and not a multiplication by SUB. A record
// written by a NEWER build names a longer ladder, and reading its step as a rung of the hundred
// would multiply a number that was already too big. The fraction is the invariant because both
// ends of the work column are pinned (STEPS): every ladder this game can ever have runs between
// ten swings and the window's own line, so the same fraction is the same stone at any length
function rescaleStep(step, rungs) {
  if (rungs === STEPS) return step;
  return Math.max(1, Math.min(STEPS, Math.ceil(step * STEPS / rungs)));
}

// WHAT A RECORD FROM AN OLDER BUILD MEANS HERE. Four shapes have been in the field and all four
// keep the step they paid for, because a reader who bought a pick owns it:
//
//   1.39.0 and before   `pick` 1..4, and the durability was derived from the tier
//   1.40.0              `pick` 1..4 and `durTok`, the remaining durability in TOKENS
//   1.41.0              `step` 1..100 and `durM`, the remaining durability in METRES
//   1.42.0              `step` 1..500 and `rungs`, the length of the ladder it is counted on
//
// THE 1.41.0 SHAPE IS NOT READ HERE but by `rescaleStep` above: it has a `step`, so `clean`'s own
// loop took it, and what it has no way of saying is that the number is out of a hundred. A missing
// `rungs` is that ladder and there is only one it can be, because 1.41.0 is the only build that
// ever wrote a `step` without a length beside it.
//
// THE DURABILITY FIELDS ARE DROPPED AND NOT MIGRATED, which is the whole of this release at the
// storage boundary: they are not in REC_FIELDS, so `clean` never reads them, and a pick that had
// two metres left is the same pick as one that had two hundred thousand. NOBODY'S PICK BREAKS on
// the way across, and a record whose pick had already worn through comes back as the step it was
// bought at, which is the one reading that cannot take something away from a reader who paid for
// it: the ladder is one way (`nextStep`), so the step the record names is also where the next
// purchase goes from.
//
// `pick` is the one field that still has to be read here, because `clean`'s loop only walks fields
// this build has: a tier becomes the FIRST STEP OF ITS BAND, which is the step with exactly the
// rows that tier could take. A tier-4 reader lands on step 350 with the idol still open, because
// the bands moved with the ladder and a band's first step is still the step its rows open at.
//
// --- AND THE RULER MOVED UNDER THESE RECORDS, WHICH IS NOT MIGRATED EITHER ----------------------
//
// `anchorDepth`, `claimedTo` and `bonus` are all stored IN METRES and nothing converts them, at
// any release. The reason is that there is only one direction the arithmetic can go:
// depth = anchorDepth + bonus + floor(used / work), so for any two rulers w' <= w
//
//   floor(used / w')  >=  floor(used / w)
//
// for every `used`. A STORED RECORD CANNOT COME BACK SHALLOWER THAN IT WENT IN, at any step, at
// any token count, which is the one thing that would be unforgivable here: the depth is the only
// thing on this screen a reader has been watching for a month. So every release that touches the
// work curve owes exactly one thing, which is that the rung a record lands on is AT LEAST AS FAST
// as the rung it left: 1.41.0 owed it per step (the ruler halved under a ladder of the same
// length) and 1.42.0 owes it per FRACTION (`rescaleStep` above, five hundred rungs where there
// were a hundred). test/mine.test.js keeps both of the curves that have been in the field frozen
// as fixtures and walks a grid of (step, used) against them rather than taking the inequality
// above on trust.
//
// WHAT IT DOES COST is a one-off catch-up: a reader whose anchor is a long way back comes forward
// by the ground they had already dug, and the stretch between `claimedTo` and that new face yields
// once, as ordinary ground. It is bounded by CLAIM_CELLS a message so it arrives over several
// pushes rather than as a lump, and it is drawn from the table above. That is the same direction
// every other migration in this file errs in (nobody's pick breaks, nobody's step is taken away,
// nobody's rung comes back slower), and the alternative was a stored field whose only job was to
// mark the one release the ruler changed in.
function migrateStep(src) {
  const t = src && src.pick;
  if (!Number.isSafeInteger(t) || t < 1) return 0;
  return BANDS[Math.min(t, BANDS.length) - 1];
}

// A record back into one this module will act on. Everything that can be wrong with a record is
// wrong in clean() rather than thrown, and a missing one is a reader whose mine starts HERE: the
// token count is handed in so the new record anchors at it (see fresh)
function load(rec, anchorTok) {
  return clean(rec) || fresh('', anchorTok);
}

// What the host stores. The same fields back out, so a record through save(load(x)) is the record
// clean() believed, PLUS one field that this build never reads. See below.
function save(rec) {
  const out = { by: rec.by };
  for (const k of REC_FIELDS) out[k] = rec[k];
  // the bags are copied rather than handed over, so a host that held on to what it stored cannot
  // reach into the record this module is still acting on
  for (const k of BAG_FIELDS) out[k] = rec[k].slice();
  // --- THE ONE FIELD THAT IS WRITTEN AND NEVER READ. DO NOT DELETE IT. -------------------------
  //
  // It is not dead code and it is not a leftover: it is the only thing standing between a reader
  // and the loss of their whole climb, and the reason it looks dead is that THE CODE IT IS FOR IS
  // IN A BUILD THAT IS ALREADY ON PEOPLE'S MACHINES and cannot be edited any more.
  //
  // THE PATH, which happens on every update and not in theory. VS Code replaces the extension
  // globally but a window that is already open keeps running the old code until it is reloaded, so
  // two builds share one store for as long as that window is up:
  //
  //   1  the reader updates to 1.42.0
  //   2  a window opened after that writes step 350 of 500
  //   3  a window still running 1.41.0 reads it. Its REC_CEIL.step is 100, so 350 is a figure its
  //      save could not have produced and its `clean` drops it to 0
  //   4  it then runs `if (out.step < 1) out.step = migrateStep(rec)`, and 1.41.0's migrateStep
  //      reads the field below
  //   5  it writes the record back
  //
  // WITHOUT THIS FIELD step 4 finds nothing, the reader is handed bare hands, and the record that
  // goes back to the store is a mine with no pick in it: five hundred rungs of climbing gone, and
  // gone for good, because `spent` is still there and nothing refunds it. WITH IT, the old window
  // reads a tier of 1 to 4 and lands on the first step of that band (1 / 10 / 35 / 70 on ITS
  // ladder, which this build's `clean` then rescales back to 1 / 50 / 175 / 350). The reader loses
  // the rungs between bands and keeps the band, the keys and the depth. Those two outcomes are not
  // the same kind of thing.
  //
  // IT IS WRITE-ONLY, AND THAT IS THE RULE. The truth about the tool in this build is `step` and
  // `rungs`; this is a projection of them for a reader that cannot see either. `clean` must never
  // take it (REC_FIELDS does not list it, and `migrateStep` only sees it on a record whose `step`
  // was not a rung of its own ladder, which is what an OLD record looks like), because the moment
  // it is read, a stale four-value tier can overwrite a step this build knows exactly.
  //
  // AND IT MAY NOT BE MAXED ACROSS A MERGE. MAX_FIELDS is empty and it stays empty: it is derived
  // from `step`, so lifting it out of the losing record would carry the band of a purchase the
  // merge threw away, which is `step` being maxed by the side door (see MAX_FIELDS' own note).
  //
  // WHEN IT CAN GO: when no 1.41.0 window can be running any more, which is not a date this file
  // can know. Until then it costs one small integer per write
  out.pick = bandIn(rec);
  return out;
}

// Is `inc` the later of two records? More moves is later, full stop: a write only ever adds one and
// never takes it back, so this is a clock that cannot run backwards. A tie goes to the larger writer
// id, which is random per activation and so favours neither window and neither outcome.
// The last two comparisons only ever separate two records a hand-edited store put under the same
// pair, and they are here so the merge settles on one of them instead of two windows writing each
// other's copy back and forth for ever. Same shape as market.newer and shop.newer
function newer(inc, cur) {
  if (!inc) return false;
  if (!cur) return true;
  if (inc.moves !== cur.moves) return inc.moves > cur.moves;
  if (inc.by !== cur.by) return inc.by > cur.by;
  if (inc.claimedTo !== cur.claimedTo) return inc.claimedTo > cur.claimedTo;
  return inc.earned > cur.earned;
}

// Are two records the same record? The host needs this to decide whether a merge changed anything
// and so whether there is a write to make at all (credits.js's mergeLedger asks the market exactly
// that question). Exported for that, and used nowhere in this file
function same(a, b) {
  if (!a || !b) return a === b;
  if (a.by !== b.by) return false;
  for (const k of REC_FIELDS) if (a[k] !== b[k]) return false;
  // row by row, because a bag that differed in one count is a different record and the host asks
  // this to decide whether there is a write to make at all
  for (const k of BAG_FIELDS) for (let i = 0; i < ROWS; i++) if (a[k][i] !== b[k][i]) return false;
  return true;
}

// The later record, WHOLE. Nothing is lifted out of the loser: MAX_FIELDS is empty and its own
// comment says what each field would cost if it were not
function merge(cur, inc) {
  if (!inc) return cur || null;
  const win = newer(inc, cur) ? inc : cur;
  // the bags travel with the record that won, as copies: nothing is unioned and nothing is maxed,
  // which is what MAX_FIELDS being empty means for them (see its own comment)
  const out = Object.assign({}, win, { got: win.got.slice(), sold: win.sold.slice() });
  for (const k of MAX_FIELDS) {
    if (cur && cur[k] > out[k]) out[k] = cur[k];
    if (inc[k] > out[k]) out[k] = inc[k];
  }
  return out;
}

// Did the record THIS window wrote survive the merge? The host writes, reads the merged record back
// and asks this before it lets the claim stand. The pair is (moves, by) and nothing else: a window
// writes exactly one record per move count, so that pair is the record's name. Comparing `earned`
// answers a different question, and comparing the whole record would answer no when another window's
// merge had merely changed something else
function kept(mine, landed) {
  return !!mine && !!landed && landed.moves === mine.moves && landed.by === mine.by;
}

// What the mine has done to the balance. The host adds this the way it adds market.netOf. Both
// halves are in the record, so a claim the merge drops pays nothing and a purchase it drops charges
// nothing
function netOf(rec) {
  return rec ? rec.earned - rec.spent : 0;
}

// --- what the webview sees -----------------------------------------------------------------------

// The seams inside the lookahead, and NOTHING BEYOND IT. This is the one thing this screen's host
// keeps back, and it keeps it back for the reason a live round's seed is kept back: a webview
// holding the relic positions ten thousand metres out is holding the rest of the deck
// (games/README.md section 2, docs/game-panels.md 5-15).
//
// Only what is in FRONT of the face: the dug half of the drift carries no markers (the screen draws
// seams in the rock, which is its right 60%), and a seam the budget has not reached yet is behind
// the face and will be taken by the next claim rather than drawn twice.
//
// WHAT IS LOCKED IS STILL SENT, and that is the gate's whole point on this screen: a seam the pick
// in hand cannot take is drawn in the rock with `locked` on it, so the reason to buy the next band
// is a thing the reader can see rather than a sentence. It is not a secret either -- its position
// was already inside the lookahead, and what the host withholds is distance and not kind.
//
// A CELL IS WIDER THAN THE WINDOW, so this returns one marker or none, and the lookahead holds
// something at 63% of depths. `row` rides along because the screen draws a picture per row and is
// sent no words at all; `step` is the key in hand (`stepOf`) and leaving it out reads as bare hands
function seamsAhead(depth, step) {
  const t = step >= 1 ? step : FIST;
  const out = [];
  const first = Math.floor(depth / CELL_M) + 1;
  const last = Math.floor((depth + AHEAD_M) / CELL_M);
  for (let c = first; c <= last; c++) {
    const s = seamAt(c);
    if (s) out.push({ at: c * CELL_M, row: SEAMS.indexOf(s), kind: s.kind, locked: !takes(t, s) });
  }
  return out;
}

// The pay table, for the `?` fold. The odds are NOT in it: how dense the rock is belongs with the
// layout the host withholds.
//
// NO SENTENCES, and one name. `row` is the subscript the screen draws its picture from, `pay` is
// what one sells for, and `locked` says whether the wall will give it up to the pick in hand. The
// `needs` line that named the step a row waits for is GONE, which is the sentence the reader asked
// to have off this screen; `name` STAYS, because a count of pictures has to be announced somehow
// and games/README.md section 4 is explicit that whatever draws a card carries its name. The
// screen shows the picture and reads the name out, which is the arrangement every other table has
function paysFor(step) {
  const t = step >= 1 ? step : FIST;
  return SEAMS.map((s, i) => ({ row: i, name: s.name, kind: s.kind, pay: s.pay, locked: !takes(t, s) }));
}

// The rows a step would take out of `locked`, measured against the key in HAND. ROWS AND NOT
// NAMES, for the same reason as above
function opensFor(rec, step) {
  const now = stepOf(rec);
  const out = [];
  for (let i = 0; i < ROWS; i++) if (SEAMS[i].gate > now && SEAMS[i].gate <= step) out.push(i);
  return out;
}

// What the one button fits, what it costs, HOW FAST IT CUTS and WHAT IT OPENS.
//
// `lose` went with the loss it described, `reach` with the durability that was the only thing it
// could have measured, and `name` with the four names: five hundred steps cannot have five hundred names,
// so the button carries the STEP NUMBER and the price, which is fewer glyphs than a name as well as
// being true at every step.
//   swings  how many swings a stone takes once it is fitted. Beside `stone.of` in the view, that is
//           the reader's own sentence for the whole ladder ("ten swings, then nine")
//   opens   the rows this purchase takes out of `locked`, measured against the key in HAND
function offerFor(rec) {
  // NOTHING IS OFFERED WHEN THE PURCHASE WOULD DO NOTHING. The screen hides the button on a null
  // offer (games/mine/panel.js), and no word is sent with it: there is no sentence on this screen
  // to put one in
  if (sealed(rec)) return null;
  const next = nextStep(rec.step);
  return {
    // `tier` and not `band`, because that is the name the view uses for the four looks
    step: next, tier: bandOf(next), price: priceOf(next),
    swings: swingsOf(next),
    opens: opensFor(rec, next)
  };
}

// Everything the screen needs and nothing more (docs/game-panels.md 5-15 is the shape).
//
// `free` is not read here and is part of the signature because that is how the host's reply builder
// calls an engine (extension.js's gameReply). What this screen may spend rides the message itself,
// the way it does for every other game.
//
// `ev` is the claim that just landed, or null. It is the handler's and not the record's, so a reload
// shows a quiet drift rather than celebrating a find from last week. `since` is the depth this
// window last told the screen about, or -1, and it is the handler's too: the stones that broke
// between two replies are a fact about this window's last reply and not about the record.
//
// WHAT THE TOOL IS, in four fields, because no one of them can stand for the others:
//   tool    'pick' or 'claw': whether anything has been bought. The tool in the crab's claw hangs
//           off this and nothing else does, now that there is no line and no veil to hang
//   step    0..steps, the step in hand, 0 being the fist
//   tier    0..4, WHICH OF THE FOUR LOOKS that step wears, and it keeps the name it has had since
//           1.40.0 because that is what the screen always meant by it: `.mn-pick.t3` is a drawing
//           and not a rung. Five hundred steps cannot be five hundred drawings, and the four bands are
//           exactly the four sets of rows the gate opens, so the look and the key are one thing
//   stone   { at, of } in SWINGS: how far into the stone in hand the work has got. The screen draws
//           the next stone from this pair and the reader reads their own "ten swings" off `of`
// NO WORDS ANYWHERE IN HERE. Every kind is a `row` subscript and every figure is a number.
function view(rec, free, tok, ev, since) {
  const st = rec || fresh('', tok);
  const depth = depthOf(st, tok);
  const step = stepOf(st);
  const finds = (ev && ev.finds) || [];
  let top = null;
  for (const f of finds) if (!top || f.pay > top.pay) top = f;
  const got = [];
  for (let i = 0; i < ROWS; i++) got.push(heldOf(st, i));
  return {
    depth: depth,
    unit: UNIT,
    // WHAT THE BAND IS A MAP OF: the dug drift behind the face, the rock in front of it, and how
    // far apart two markers can stand. `cell` is the third one and it arrived with the camera
    // (docs/mine-mockup/spec-idle.md, section 9): the screen parks its camera every cell / 3
    // metres so that every cell boundary is one of its stops, which is what makes a find always
    // happen at the same place on the band. A screen that guessed the figure off `ahead` would
    // park at 33 m and the stops would slide off the boundaries for good.
    // IT IS THE HOST'S BECAUSE IT IS THE LAYOUT'S. Where a seam may stand is this file's judgment
    // (seamAt), and a camera whose stops come from somewhere else is a camera pointed at a drift
    // this engine is not digging
    window: { behind: BEHIND_M, ahead: AHEAD_M, cell: CELL_M },
    tool: hasPick(st) ? 'pick' : 'claw',
    step: step,
    steps: STEPS,
    tier: bandOf(step),
    tiers: BANDS.length,
    stone: stoneOf(st, tok),
    // HOW MANY STONES BROKE SINCE THIS WINDOW LAST DREW, so the screen knows how many times to run
    // the chip of rock flying off. 0 when this window has not drawn yet, because the first draw is
    // not an event: a reader opening the screen after a week would otherwise be shown a week of
    // stones breaking at once
    broke: Number.isSafeInteger(since) && since >= 0 ? Math.max(0, depth - since) : 0,
    seam: seamsAhead(depth, step),
    // WHAT IS IN THE BAG, per row, and what it is worth if it is sold. The screen may not multiply
    // a count by a price, so the host does it
    got: got,
    worth: bagValue(st),
    // the biggest thing in the claim, WHAT THE CLAIM IS WORTH, and how many things were in it.
    // `pay` keeps the name it has always had and it means what the table means by it, which is
    // what one of these sells for: the credits do not arrive until the reader sells, so this is a
    // valuation and not a payment. `name` is here for the read-out and not for the chip (paysFor)
    found: top ? { row: top.row, name: SEAMS[top.row].name, pay: ev.worth, n: finds.length } : null,
    // the dash: where it ended, how many seams it passed (the screen's pacing divides by this) and
    // what they came to. A fever's own pay is 0; this is the ground's
    fever: (ev && ev.grant) ? { to: ev.depth, hits: ev.dashHits, pay: ev.dashWorth } : null,
    offer: offerFor(st),
    pays: paysFor(step)
  };
}

module.exports = {
  // the ruler, the stone and the ladder
  TOK_PER_MT, STONE_M, TOK_PER_SWING, UNIT, FIST_DIV, FIST, STEPS, SUB, LADDER_1_41, TOP_STEP, BANDS,
  WORK, PRICE, hasStep, workOf, FIST_WORK, priceOf, swingsOf, nextStep, bandOf,
  // the ceiling claim (a) is made against
  EARN_CAP_NUM, EARN_CAP_DEN,
  // the layout and the window
  CELL_M, BUCKETS, SEAMS, ROWS, FEVER_M, AHEAD_M, BEHIND_M, PUSH_M, REPLY_M, REPLY_TOK, DASH_M,
  CLAIM_CELLS,
  bucketOf, rawAt, relicStands, seamAt, seamsAhead,
  // which key is in hand, and what the wall gives up to it
  takes, stepOf, bandIn,
  // depth, derived on every read
  usedOf, workIn, cutOf, depthOf, hasPick, stoneOf,
  // the bag
  heldOf, valueOf, bagValue, sellable,
  // storage: the rules credits.js calls rather than copies
  clean, load, save, newer, merge, same, kept, netOf, REC_FIELDS, BAG_FIELDS, MAX_FIELDS, REC_CEIL,
  MAX_COUNT,
  // the game
  fresh, OPS, whyNot, sealed, act, sell, sweep, view, offerFor, opensFor, paysFor
};
