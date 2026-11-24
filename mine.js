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
//   dug   = used, while the pick lasts, and (used - durability) / FIST_DIV after it
//   depth = anchorDepth + bonus + dug
//
// A FIST IS NOT STORED AT ALL. "The pick broke and now you are digging with your hands" is `used`
// having passed the pick's durability, which is a comparison and not a field, so there is no state
// to get out of step with the token count.
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
//   a  NET PAY PER TOKEN HAS A CEILING. What the mine adds to the balance grows at no more than
//      EARN_CAP_NUM/EARN_CAP_DEN of what the same tokens earn in the ledger. Enumerated over the
//      seam table, the relic spacing rule and the fever's grant, as an exact rational
//   b  A STRETCH PAYS ONCE. `claimedTo` is a boundary, so the same ground cannot be claimed twice,
//      and a claim that loses a merge takes `earned` and `claimedTo` back together
//   c  PICKS DO NOT OVERLAP. Fitting one replaces the anchor and the old pick's unused durability
//      is gone, so two purchases in a row cannot add the same ground twice
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

// --- the ruler ----------------------------------------------------------------------------------
//
// One metre is a tenth of a million weighted tokens. Read against this reader's own thirty days
// (52.4 MT a day, 5.32 MT an hour of activity):
//
//   an hour of activity   53 m
//   an average day       524 m
//   a seam cell           20 m, so a find about every 22 minutes of activity
//
// TOK_PER_M is the one number the whole game's feel hangs off, and it is not a free choice: a cell
// is CELL_M of it, and the window below is a multiple of a cell, and the window has to be wide
// enough that the heaviest single push does not jump across it (PUSH_M).
const TOK_PER_MT = 1000000;      // weighted tokens in a million of them, for reading the table below
const TOK_PER_M = 100000;        // weighted tokens a metre
const UNIT = 'm';                // the host names the unit; the screen never invents a word

// What a fist is worth. The pick is 1 token to 1 token of digging and the fist is one eighth of it,
// which is the whole of "the efficiency collapses": a day's work that was 524 m becomes 65 m.
// INTEGER division, so this cannot drift with a float
const FIST_DIV = 8;

// --- the picks ----------------------------------------------------------------------------------
//
// Four rungs, five times apart in price, and the only thing that differs between them is the price
// and how long they last. THEY ALL DIG AT THE SAME SPEED, and that is a condition rather than a
// simplification: claim (a) caps what the mine may pay per TOKEN, so a pick that dug faster would
// have to pay less per metre to stay under it, and the four rungs would then be four different
// games. One speed means one ceiling, proved once, and the rungs are about how long you can keep
// digging before the hands come out.
//
// `durMt` is the durability in millions of weighted tokens. For this reader:
//
//   1    15 MT     2.8 hours of activity (24 minutes on a busy day)
//   2    85 MT     16 hours
//   3   470 MT     88 hours
//   4  2700 MT     52 days
//
// THE PRICES ARE HALF WHAT WAS PROPOSED and the ceiling is why, not taste. Over its whole
// durability a pick can return at most
//
//     EARN_CAP x (durMt x TOK_PER_MT / CREDIT_UNIT) x (1 - 1/FIST_DIV)
//
// credits, the last factor being the fist it replaces rather than adds to. At 15% that is 196.9
// credits for a 15 MT pick, so the proposed 200 was a rung that could not pay for itself however
// the seam table was written. Halved, every rung returns more than it costs and the RATIO rises up
// the ladder (1.67 / 1.90 / 2.10 / 2.41 at the realised rate), which is what saving for the next one
// should buy. test/mine.test.js asserts both the ceiling and the ratios off these numbers.
const PICKS = Object.freeze([
  { tier: 1, name: 'Tin pick', price: 100, durMt: 15 },
  { tier: 2, name: 'Iron pick', price: 500, durMt: 85 },
  { tier: 3, name: 'Steel pick', price: 2500, durMt: 470 },
  { tier: 4, name: 'Crab pick', price: 12500, durMt: 2700 }
].map((p) => Object.freeze(p)));

// Tier 0 is no pick at all, which is the fist. It is not a row of the table because it is not
// bought and has nothing to wear out
const FIST = 0;
const TOP_TIER = PICKS.length;

function pickOf(tier) { return (tier >= 1 && tier <= TOP_TIER) ? PICKS[tier - 1] : null; }
// The tokens a tier can dig at full speed. Tier 0 has none, which is why a reader who has bought
// nothing digs with their hands from the first metre
function durTokOf(tier) { const p = pickOf(tier); return p ? p.durMt * TOK_PER_MT : 0; }

// WHAT THE BUTTON OFFERS: the next rung up, and the top rung again once it is reached. One offer at
// a time is the screen's own rule (docs/game-panels.md, 5-15: no chips, one button, and the decision
// is already "now or at the next seam"), and the ladder being one way is what makes "a rising price"
// true. A worn tier-1 pick is therefore not replaced by another tier-1 pick: the reader digs with
// their hands until tier 2 is affordable, which is the only tension this screen has
function nextTier(tier) { return Math.min((tier >= 1 ? tier : 0) + 1, TOP_TIER); }

// --- the ceiling --------------------------------------------------------------------------------
//
// The promise of claim (a), as this module's own constant so the suite is written against it rather
// than against a number typed twice. 15%: the mine is a game played with work that was done anyway,
// so it may garnish what that work earns and may not become the way credits are earned. The band is
// one-sided on purpose; the realised rate is 12.76% and the margin is the room the seam table has to
// be retuned in without this line moving.
const EARN_CAP_NUM = 15;
const EARN_CAP_DEN = 100;

// --- the layout ---------------------------------------------------------------------------------
//
// A seam sits at the top boundary of a cell of CELL_M metres, at most one to a cell, and which one
// is a pure function of the cell's number. There is NO SEED and no stored layout: the same metre
// holds the same thing in every window, on every machine, for ever. The secret this screen keeps is
// not the layout, it is only how far ahead the reader is allowed to see (`seam` in view(), and
// docs/game-panels.md 5-15: "the host withholds what is beyond the lookahead").
const CELL_M = 20;

// The hash's outcome space. 64 buckets a cell: fine enough for a 2-in-64 rarity and small enough
// that the suite can enumerate every bucket exactly rather than sample it
const BUCKETS = 64;

// THE SEAM TABLE. `odds` is buckets out of BUCKETS and the 16 left over are barren rock, which is
// what makes the drift read as rock with things in it rather than as a conveyor belt.
//
// The pays are tuned DOWN to the ceiling and not up to a feeling: see test/mine.test.js, which
// enumerates this table against EARN_CAP and would fail on a single pay raised past it. The shape
// of the ladder is 6 / 16 / 36 for the three gems and 100 / 360 for the two relics, so a relic is
// worth a handful of gems and the rarest find is three tier-1 picks.
//
// A FEVER PAYS NOTHING. What it gives is ground, which is the reader's own words for it ("it digs
// through a lot of DIRT"), and the gems standing in that ground pay because they are gems. Written
// as a pay of 0 rather than as a separate table so the walk below has one kind of thing to look at.
const SEAMS = Object.freeze([
  { name: 'Quartz', kind: 'gem', pay: 6, odds: 20 },
  { name: 'Garnet', kind: 'gem', pay: 16, odds: 14 },
  { name: 'Amethyst', kind: 'gem', pay: 36, odds: 6 },
  { name: 'Old coin', kind: 'relic', pay: 100, odds: 4 },
  { name: 'Crab idol', kind: 'relic', pay: 360, odds: 2 },
  { name: 'Fever', kind: 'fever', pay: 0, odds: 2 }
].map((s) => Object.freeze(s)));

// How far a fever carries. Four cells, which is more than the whole lookahead window, so the ground
// a fever gives away is ground the reader could not see coming
const FEVER_M = 80;

// --- the window ---------------------------------------------------------------------------------
//
// What the screen may see: BEHIND_M of dug drift and AHEAD_M of rock. The RATIO is the screen's
// (40% / 60% of the drift, docs/game-panels.md 5-15), so these two have to be in 2:3 or the two
// halves would be drawn at different scales and the picture would lie about distance.
//
// The size is this file's, and four conditions pin it. Three are the screen's own and the fourth is
// the geometry of the markers:
//
//   PUSH_M x 20 <= AHEAD_M        the heaviest push moves less than 5% of the window
//   AHEAD_M / PUSH_M >= 6         a seam is on screen for at least five or six pushes
//   CELL_M >= 0.30 x AHEAD_M      two 24px markers do not touch (28px of the 93.61px rock measured
//                                 at a sidebar of 250)
//   2 x CELL_M >= 0.45 x AHEAD_M  a 48px relic does not touch its neighbour, which it cannot,
//                                 because a standing relic's neighbouring cells are cleared out
//                                 (seamAt below)
//
// THE SPACING IS THIS FILE'S JOB. A screen that nudged a marker aside to stop it overlapping would
// be drawing a seam at a depth it is not at, and this screen's whole question is whether the pick
// reaches the thing in front of it.
//
// 63 is the largest window those four allow at a 20 m cell, and the margins come out 31.75% against
// 30% and 3.15 m against a 2 m push. The illustrative 96/144 in docs/game-panels.md 5-15 cannot
// hold the third condition at this cell size: 0.30 x 144 is 43.2 m and two cells are 40 m apart.
const AHEAD_M = 63;
const BEHIND_M = 42;

// The heaviest single push, in metres. 20 credits is webview.js's CC_LANDING_JUMP, which is the
// measured figure for "even the busiest stretch rarely earns this much between two pushes", and
// 20 credits is 20 x CREDIT_UNIT weighted tokens, which is 2 metres. Written here rather than
// derived because this module may not require credits.js; test/mine.test.js does the division
// against credits.CREDIT_UNIT so the two cannot drift apart
const PUSH_M = 2;

// --- how much one claim may walk ----------------------------------------------------------------
//
// A mine nobody has looked at for a month is 786 cells behind (52.4 MT a day for thirty days), and a
// reader coming back from leave is further. One message takes at most this many cells OF DUG GROUND
// and LEAVES THE REST: `claimedTo` stops where the walk stopped, so nothing is skipped and nothing
// is paid twice, and the next push takes the next bite. Thirteen pushes clear a month, which is two
// minutes.
//
// THE BUDGET COUNTS DUG CELLS, AND THE GROUND A FEVER GIVES IS ALWAYS CLAIMED BY THE SAME WRITE
// however much of it there is. That is not generosity, it is the only arrangement in which the chain
// stays broken: "the ground this fever gave" is a position, the record stores no positions, so the
// instant a write ends with granted ground left unclaimed, the next read cannot tell that ground
// from ground the tokens dug and the fever standing in it fires again. Claimed in the same write it
// is behind `claimedTo` for ever, and a cell behind `claimedTo` is never walked again.
//
// So the real ceiling on one message is CLAIM_CELLS x (1 + FEVER_M / CELL_M), which is 320 cells:
// every dug cell in the bite could hold a fever and each would add four. Measured against claim (e),
// a hundred thousand is three hundred times that.
const CLAIM_CELLS = 64;

// --- the conditions the numbers above have to keep ----------------------------------------------
//
// Every one of these is a measured condition from docs/game-panels.md 5-15 or a rule the walk below
// relies on, and it THROWS rather than only being tested, because a retune that broke one of them
// would otherwise ship a screen that draws seams at depths they are not at. shop.js's price ladder
// is checked the same way and for the same reason: a rule that lives only in a test is a comment
// with a test beside it.
(function () {
  if (FEVER_M % CELL_M) throw new Error('mine: a fever has to give whole cells away');
  // the screen splits the drift 40% / 60%, so these two are drawn at one scale only in 2:3
  if (AHEAD_M * 2 !== BEHIND_M * 3) throw new Error('mine: the window is not the screen\'s 2:3');
  if (PUSH_M * 20 > AHEAD_M) throw new Error('mine: the heaviest push moves more than a twentieth of the window');
  if (AHEAD_M < PUSH_M * 6) throw new Error('mine: a seam is on screen for fewer than six pushes');
  // two 24px markers need 30% of the rock between their centres, and a 48px relic needs 45%. A
  // relic's neighbouring cells are cleared (seamAt), so the second one is measured over two cells
  if (CELL_M * 10 < AHEAD_M * 3) throw new Error('mine: two 24px markers would touch');
  if (CELL_M * 2 * 100 < AHEAD_M * 45) throw new Error('mine: a 48px relic would touch its neighbour');
  if (CELL_M > AHEAD_M) throw new Error('mine: the window cannot hold a seam');
  // the ladder has to be a ladder in both columns, or nextTier would offer something worse
  for (let i = 1; i < PICKS.length; i++) {
    if (PICKS[i].price <= PICKS[i - 1].price) throw new Error('mine: the picks are not a rising price');
    if (PICKS[i].durMt <= PICKS[i - 1].durMt) throw new Error('mine: a dearer pick does not last longer');
  }
})();

// --- the record ---------------------------------------------------------------------------------
//
//   by           the window that last wrote it. The host fills it in; this module invents nothing
//   moves        accepted writes. The merge clock: it only grows, so of two copies the one with more
//                moves is the later one, and a window writes exactly one record per move count,
//                which is what makes (moves, by) the record's name
//   pick         the tier fitted, 0 for none. Only ever rises (nextTier)
//   anchorTok    the weighted token count when that pick was fitted
//   anchorDepth  the depth it was fitted at, MINUS `bonus`, so that depth = anchorDepth + bonus + dug
//                is continuous across a purchase while `bonus` goes on being a lifetime figure
//   claimedTo    HOW FAR THE PAYING HAS GOT. A boundary, one number, NOT a list of what was taken.
//                Depth only rises, so what has been taken is always a prefix of the drift and a
//                boundary says all of it. A list would have to be unioned across two windows' copies
//                on a merge, which is the shape of the bug that minted 372,000 credits out of one
//                sword (shop.js's header, games/README.md section 3 point 3)
//   bonus        metres the fevers have given, for ever. Part of depth, and claimed by the same write
//                that grants it
//   spent        credits paid for picks. IN the record, so a purchase the merge drops charges nothing
//   earned       credits the wall has paid out. IN the record, so a claim the merge drops pays nothing
//   best, finds  the biggest single find and how many there have been. For the screen
//
// WHAT IS NOT IN HERE: the depth, the reach, whether the hands are out, and what is in the stretch
// between `claimedTo` and the face. All five are derived, which is the point: a stored depth and a
// token count that disagreed would be two answers to one question, and the token count is the one
// that cannot be edited by hand.
const REC_FIELDS = Object.freeze([
  'moves', 'pick', 'anchorTok', 'anchorDepth', 'claimedTo', 'bonus', 'spent', 'earned', 'best', 'finds'
]);

// EMPTY, AND THIS IS THE ONE LINE IN THIS FILE THAT COULD MINT MONEY. Max a field across a merge and
// the loser's figure survives into the winner's record:
//   `claimedTo` maxed  the winner's `earned` with the loser's boundary: ground paid for once and
//                      marked as paid twice over, or the other way round, ground skipped for nothing
//   `earned` maxed     the money of a claim that was dropped, next to the boundary that says the
//                      ground is still there to be claimed again. That is claim (b) broken, and it
//                      is the 372,000 bug exactly
//   `bonus` maxed      a fever's ground kept while the write that claimed it was thrown away
// `best` and `finds` are not maxed either, for the market's reason (market.js, MAX_FIELDS): a find
// that was dropped did not happen, so its figure may not outlive it. The winning record is adopted
// WHOLE and nothing is lifted out of the loser.
const MAX_FIELDS = Object.freeze([]);

// What `clean` will believe. A figure outside these is not one `save` could have produced, so it
// reads as nothing at all: without them a hand-edited store sets `moves` to 1e15 and wins every
// merge for ever, and every real window is told another window moved first.
//  - a write a second for thirty years is 1e9
//  - 1e15 weighted tokens is ten million of this reader's days, and 1e15 credits is a thousand times
//    the casino's largest jackpot
//  - 1e12 metres is 1e17 weighted tokens, so a depth past it is a depth no token count can reach
const MAX_MOVES = 1e9;
const MAX_MONEY = 1e15;
const MAX_TOK = 1e15;
const MAX_DEPTH = 1e12;
const REC_CEIL = Object.freeze({
  moves: MAX_MOVES, pick: TOP_TIER, anchorTok: MAX_TOK, anchorDepth: MAX_DEPTH,
  claimedTo: MAX_DEPTH, bonus: MAX_DEPTH, spent: MAX_MONEY, earned: MAX_MONEY,
  best: MAX_MONEY, finds: MAX_MOVES
});

// A record for a reader who has never dug. `anchorTok` IS AN ARGUMENT and that is deliberate: the
// mine is born at the token count it is first read at, so nothing is paid for work done before the
// screen existed. Anchored at 0 instead, a reader's first claim would walk their whole history and
// hand over a lump sum, which is a retroactive payout dressed as a game.
function fresh(by, anchorTok) {
  const tok = (Number.isSafeInteger(anchorTok) && anchorTok > 0) ? Math.min(anchorTok, MAX_TOK) : 0;
  return {
    by: by == null ? '' : String(by),
    moves: 0, pick: FIST, anchorTok: tok, anchorDepth: 0, claimedTo: 0, bonus: 0,
    spent: 0, earned: 0, best: 0, finds: 0
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

// --- depth ---------------------------------------------------------------------------------------

// The tokens this pick has seen. CLAMPED AT 0, which is not defensive tidying: two windows hold
// ledger copies of different ages, so the count one window reads can be lower than the count that
// anchored the pick, and an unclamped subtraction would run the mine backwards
function usedOf(rec, tok) {
  const t = Number.isSafeInteger(tok) && tok > 0 ? tok : 0;
  return Math.max(0, t - rec.anchorTok);
}

// Metres dug since the anchor. The pick's stretch at full speed, then the fist's at one eighth.
// Integer throughout: the division by FIST_DIV happens on TOKENS and the division to metres happens
// once, so there is no float in the chain and the result cannot drift between two windows
function dugOf(rec, tok) {
  const used = usedOf(rec, tok);
  const dur = durTokOf(rec.pick);
  const t = used <= dur ? used : dur + Math.floor((used - dur) / FIST_DIV);
  return Math.floor(t / TOK_PER_M);
}

function depthOf(rec, tok) { return rec.anchorDepth + rec.bonus + dugOf(rec, tok); }

// Is the pick still in one piece? Asked in tokens rather than in metres, so the last fraction of a
// metre of a pick is still a pick
function hasPick(rec, tok) { return usedOf(rec, tok) < durTokOf(rec.pick); }

// How much further this pick can dig, in metres, and 0 for bare hands. This is the number the
// screen draws as a line in the rock rather than printing: the question it answers is "does it reach
// that seam", and a line beside the seam answers that without any arithmetic
function reachOf(rec, tok) {
  const left = durTokOf(rec.pick) - usedOf(rec, tok);
  return left > 0 ? Math.floor(left / TOK_PER_M) : 0;
}

// --- the claim -----------------------------------------------------------------------------------

// Walks the cells between `claimedTo` and the face, pays for what stands in them, and lets a fever
// in the DUG stretch give away ground that this same walk then claims. Pure: the record handed in is
// not touched and the one handed back is new, or is the very same object when there was nothing to do.
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
  const from = rec.claimedTo;
  const paidTo = Math.floor(from / CELL_M);         // the last cell already paid for
  const dugEnd = Math.floor(face / CELL_M);         // the last cell the TOKENS have reached
  if (dugEnd <= paidTo) return { rec, claim: null };

  // The dug cells this write takes. Beyond it is a backlog and `more` says so
  const bite = Math.min(dugEnd, paidTo + CLAIM_CELLS);
  const finds = [];
  let end = bite;                                   // ...and the fevers push this out
  let pay = 0, grant = 0, dashPay = 0, dashHits = 0, best = 0;
  for (let c = paidTo + 1; c <= end; c++) {
    const s = seamAt(c);
    if (!s) continue;
    if (s.kind === 'fever') {
      // A fever in the ground the TOKENS dug gives FEVER_M away; one standing in ground a fever
      // already gave is inert, and those two sentences are the whole of "the chain is broken"
      if (c <= bite) { grant += FEVER_M; end += FEVER_M / CELL_M; }
      continue;
    }
    pay += s.pay;
    if (s.pay > best) best = s.pay;
    finds.push({ at: c * CELL_M, name: s.name, kind: s.kind, pay: s.pay });
    // the dash's own tally, which is what the screen divides 1,200 ms by
    if (c > bite) { dashPay += s.pay; dashHits += 1; }
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
    earned: rec.earned + pay,
    best: best > rec.best ? best : rec.best,
    finds: rec.finds + finds.length
  });
  return {
    rec: next,
    claim: {
      from, to, pay, finds, grant, dashPay, dashHits,
      depth: next.anchorDepth + next.bonus + dugOf(next, tok),
      // ground the tokens have already dug and this write did not reach. The next message takes it.
      // Measured against `end` and not against the bite, because a fever's grant walks past the
      // bite and can clear the backlog on its way
      more: end < dugEnd
    }
  };
}

// --- what may be done ----------------------------------------------------------------------------

const OPS = Object.freeze(['buy']);

// Why `op` cannot be done, or null. `budget` is the credits this game may spend; left out means no
// limit, which is how act() runs: the money rule is the host's and it reads the live balance before
// calling in. Written as !(a <= b) so a NaN budget, which is a broken ledger, refuses rather than
// allows.
//
// There is no refusal for a pick that still has life in it. Fitting a new one early throws the rest
// of the old one away, which is a real cost, and the screen is told what it is (`offer.lose`) rather
// than being stopped from making the trade
function whyNot(rec, op, budget) {
  const name = op && typeof op === 'object' ? op.op : null;
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!rec) return 'there is nothing to spend';
  const p = pickOf(nextTier(rec.pick));
  if (!p) return 'nothing is sold here';
  const room = budget == null ? Infinity : budget;
  if (!(p.price <= room)) return 'not enough credits';
  return null;
}

// Fits the offered pick. Never mutates its input and hands the very same object back when the move
// is not allowed, so a host can test for identity rather than for a reason (the market's rule).
//
// THE ANCHOR IS REPLACED AND THE OLD PICK'S REMAINING DURABILITY IS GONE. That is what makes claim
// (c) true: there is one anchor, so two purchases in a row cannot each contribute a stretch of
// ground. `anchorDepth` is the depth at the moment of fitting MINUS `bonus`, which keeps the depth
// continuous across the purchase while `bonus` goes on being a lifetime count.
//
// `claimedTo` is clamped to the new depth here and nowhere else. This is the one moment the record
// knows what the depth is without a clock in its hand, so it is the one moment a boundary left
// ahead of the face by a hand-edited store can be pulled back. Doing it on every read would be
// wrong by `dug`: a boundary legitimately sits ahead of anchorDepth + bonus as soon as a metre has
// been dug and paid for, and clamping there would hand back ground that was already paid for.
function act(rec, op, tok) {
  if (whyNot(rec, op)) return rec;
  const p = pickOf(nextTier(rec.pick));
  const depth = depthOf(rec, tok);
  const now = Number.isSafeInteger(tok) && tok > 0 ? Math.min(tok, MAX_TOK) : 0;
  return Object.assign({}, rec, {
    moves: rec.moves + 1,
    pick: p.tier,
    // NEVER BELOW THE OLD ANCHOR. A window holding an older ledger reads a lower count than the one
    // that anchored the last pick, and an anchor moved back to it would hand the new pick the old
    // one's wear as fresh durability. Held forward, the stale window's pick is a little worn when it
    // is fitted, which is the side of the clamp that cannot pay anybody anything
    anchorTok: Math.max(rec.anchorTok, now),
    anchorDepth: depth - rec.bonus,
    claimedTo: Math.min(rec.claimedTo, depth),
    spent: rec.spent + p.price
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
  return out;
}

// A record back into one this module will act on. Everything that can be wrong with a record is
// wrong in clean() rather than thrown, and a missing one is a reader whose mine starts HERE: the
// token count is handed in so the new record anchors at it (see fresh)
function load(rec, anchorTok) {
  return clean(rec) || fresh('', anchorTok);
}

// What the host stores. The same fields back out, so a record through save(load(x)) is the record
// clean() believed
function save(rec) {
  const out = { by: rec.by };
  for (const k of REC_FIELDS) out[k] = rec[k];
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
  return true;
}

// The later record, WHOLE. Nothing is lifted out of the loser: MAX_FIELDS is empty and its own
// comment says what each field would cost if it were not
function merge(cur, inc) {
  if (!inc) return cur || null;
  const out = Object.assign({}, newer(inc, cur) ? inc : cur);
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
// the face and will be paid for by the next claim rather than drawn twice.
function seamsAhead(depth) {
  const out = [];
  const first = Math.floor(depth / CELL_M) + 1;
  const last = Math.floor((depth + AHEAD_M) / CELL_M);
  for (let c = first; c <= last; c++) {
    const s = seamAt(c);
    if (s) out.push({ at: c * CELL_M, kind: s.kind });
  }
  return out;
}

// The pay table, for the `?` fold. The odds are NOT in it: how dense the rock is belongs with the
// layout the host withholds, and a name against a figure is the whole of what the fold is for
const PAYS = Object.freeze(SEAMS.map((s) => Object.freeze({ name: s.name, kind: s.kind, pay: s.pay })));

// What the one button fits, what it costs, and WHAT IT THROWS AWAY. `lose` is the reach of the pick
// in hand, which fitting a new one discards, and it is here because this module is the only thing
// that can work it out: docs/game-panels.md 5-15 asks for a screen that does not have to say "and
// you lose the rest", and it can only avoid saying it by being handed the number and staying quiet
// when it is 0
function offerFor(rec, tok) {
  const p = pickOf(nextTier(rec.pick));
  if (!p) return null;
  return { name: p.name, price: p.price, lose: reachOf(rec, tok) };
}

// Everything the screen needs and nothing more (docs/game-panels.md 5-15 is the shape).
//
// `free` is not read here and is part of the signature because that is how the host's reply builder
// calls an engine (extension.js's gameReply). What this screen may spend rides the message itself,
// the way it does for every other game.
//
// `ev` is the claim that just landed, or null. It is the handler's and not the record's, so a reload
// shows a quiet drift rather than celebrating a find from last week.
function view(rec, free, tok, ev) {
  const st = rec || fresh('', tok);
  const depth = depthOf(st, tok);
  const finds = (ev && ev.finds) || [];
  let top = null;
  for (const f of finds) if (!top || f.pay > top.pay) top = f;
  return {
    depth: depth,
    unit: UNIT,
    window: { behind: BEHIND_M, ahead: AHEAD_M },
    tool: hasPick(st, tok) ? 'pick' : 'claw',
    reach: reachOf(st, tok),
    seam: seamsAhead(depth),
    // the biggest name in the claim, the claim's whole pay, and how many things were in it
    found: top ? { name: top.name, pay: ev.pay, n: finds.length } : null,
    // the dash: where it ended, how many seams it passed (the screen's pacing divides by this) and
    // what they came to. A fever's own pay is 0; this is the ground's
    fever: (ev && ev.grant) ? { to: ev.depth, hits: ev.dashHits, pay: ev.dashPay } : null,
    offer: offerFor(st, tok),
    pays: PAYS
  };
}

module.exports = {
  // the ruler and the tools
  TOK_PER_M, TOK_PER_MT, UNIT, FIST_DIV, FIST, PICKS, TOP_TIER, pickOf, durTokOf, nextTier,
  // the ceiling claim (a) is made against
  EARN_CAP_NUM, EARN_CAP_DEN,
  // the layout and the window
  CELL_M, BUCKETS, SEAMS, FEVER_M, AHEAD_M, BEHIND_M, PUSH_M, CLAIM_CELLS,
  bucketOf, rawAt, relicStands, seamAt, seamsAhead,
  // depth, derived on every read
  usedOf, dugOf, depthOf, hasPick, reachOf,
  // storage: the rules credits.js calls rather than copies
  clean, load, save, newer, merge, same, kept, netOf, REC_FIELDS, MAX_FIELDS, REC_CEIL,
  // the game
  fresh, OPS, whyNot, act, sweep, view, offerFor, PAYS
};
