// HOW HARD THIS MACHINE IS BEING WORKED RIGHT NOW, as one number.
//
// WHY IT EXISTS. The crab used to be measured against a LIMIT: how much of the five-hour window
// was gone, or, on an account with no window, how fast the week was being spent. That answers a
// question the panel already answers five other ways (the ring, the weekly bar, the Fable bar, the
// status bar, the burn-rate banner), and it does NOT answer the one the crab is actually read for,
// which is "is anything happening". A reader sitting on 72% of a window that resets in four hours
// got a crab in despair while the machine was idle, and a reader who had just signed in got an idle
// crab while eight agents ran. The owner asked twice why the crab kept collapsing while the weekly
// bar read 19%.
//
// So this measures WORK, not allowance: the API-equivalent cost of the replies that have landed in
// the last hour, weighted so that the last few minutes count for most of it. Nothing in here reads
// a limit, a percentage or a reset time, and that is the point. The limits keep every place they
// already had.
//
// THE RING. Each reply's cost goes into the ten-second cell its timestamp falls in, and only the
// last sixty minutes of cells are kept. Ten seconds is below anything a reader can perceive as a
// change of state and coarse enough that a busy hour is 360 numbers rather than thousands; sixty
// minutes is where the kernel below has decayed to e^-6, which is 0.2% and is not worth carrying.
//
// THE KERNEL is an exponential moving rate rather than a plain average over a window:
//
//     rate ($/min) = (1/tau) * sum over cells of  cost * exp(-age / tau)
//
// A boxcar average over the same hour would make work that stopped forty minutes ago count exactly
// as much as work happening now, and then drop it off a cliff at the hour; an exponential has no
// cliff and no plateau, so a reader who stops is seen slowing down rather than falling over.
//
// TAU IS MEASURED, NOT CHOSEN. Over this reader's own transcripts a single reply's cost has a
// median of $0.101, a 99th percentile of $0.45 and a maximum of $4.22. With tau at ten minutes the
// biggest single reply ever seen makes a drive of 1.55, which does not reach the second rung (2.0):
// ONE REPLY MUST NOT CHANGE THE CRAB. At tau = 5 minutes that same reply makes 3.10 and reaches the
// third. Ten minutes is the smallest round figure that keeps the worst single reply inside the
// bottom rung, and it is also about how long a piece of work feels like it lasts.
//
// THE SCALE. A rate in dollars a minute means nothing to a reader, so it is divided by the rate
// that would spend the whole weekly allowance evenly over the week:
//
//     drive = rate ($/min) / (weekly budget $ / 10,080 min)
//
// 1.0 is therefore "working at exactly the pace the week allows", which is the one number on this
// scale that has a meaning without being told, and the rungs are multiples of it (webview.js,
// DRIVE_STEPS). It is a RATIO, so the tier only changes what counts as hard work, not what the
// crab means: a Pro account at 1.0 and a Max 20x account at 1.0 are both spending their week evenly.
//
// THE BUDGET is 100 points of the weekly limit at the percent-per-dollar figure weekly.js measured
// (REFERENCE_RATE there), so the three figures here are 100 / 0.0364, 100 / 0.1456 and 100 / 0.728.
// They are written as that division rather than imported, because this file may not reach for
// weekly.js: that one reads the home directory at load (claudedir.js) and this one has to stay a
// function of its arguments. test/drive.test.js asserts the two agree, so the pair cannot drift.
'use strict';

const BUCKET_MS = 10000;                       // one cell of the ring
const KEEP_MS = 60 * 60 * 1000;                // the hour of cells kept
const CELLS = KEEP_MS / BUCKET_MS;             // 360
const TAU_MIN = 10;                            // the decay, in minutes. Measured: see the header
const TAU_MS = TAU_MIN * 60 * 1000;
const WEEK_MINUTES = 7 * 24 * 60;              // 10,080

// Weekly allowance in API-equivalent dollars, per plan tier (weekly.js tierKey makes these keys)
const WEEK_BUDGET = Object.freeze({
  max_20x: 100 / 0.0364,                       // $2,747
  max_5x: 100 / 0.1456,                        // $687
  pro: 100 / 0.728                             // $137
});
// AN UNKNOWN TIER READS AS THE LARGEST ALLOWANCE, which is the quiet answer: the same work divided
// by a bigger budget is a smaller drive, so a tier this extension could not read leaves the crab
// calmer than it should be rather than collapsing on an account that is barely being used
const DEFAULT_TIER = 'max_20x';

// Which cell a moment falls in. Integer cell indexes, so a ring is plain JSON and two windows
// reading the same ring at the same instant cannot disagree
function bucketOf(ms) { return Math.floor(ms / BUCKET_MS); }

// The oldest cell an hour-wide ring may hold at `nowMs`, inclusive
function oldestKept(nowMs) { return bucketOf(nowMs) - (CELLS - 1); }

function emptyRing() { return {}; }

// THE CELL A REPLY BELONGS IN: its own, unless it is stamped AHEAD of this clock, in which case the
// present one.
//
// A transcript timestamp can sit ahead of the clock reading it -- two machines writing one
// directory, a clock that was just corrected -- and that is real work, so it is counted. It is
// counted as happening NOW, which is the most it can ever be worth and the only age that cannot
// inflate it. Filing it in the future instead is what the first version of this did, and a cell in
// the future is a cell no window ever contains: `trim` below cuts the old end, so it would sit at
// age zero for as long as the skew lasted. Measured on the module as it stood: one $4.22 reply
// stamped a day ahead read as a drive of 1.55 for a whole day of an idle machine, and a few of them
// would have pinned the crab to the top rung with nothing running.
function cellOf(ms, nowMs) { return Math.min(bucketOf(ms), bucketOf(nowMs)); }

// One reply's cost, into its cell. A cost of zero or less is not an event.
//
// `nowMs` IS REQUIRED. It is the whole of the rule above, and a call that leaves it out is refused
// rather than trusted: without a clock the cell came out as NaN, which is a key no window contains
// and no trim removes, so a ring with one in it was wrong for as long as the window lived. Refusing
// loses that reply, which reads as a quieter machine, and that is the safe direction of the two.
function add(ring, ms, cost, nowMs) {
  if (!(cost > 0)) return ring;
  if (!isFinite(ms) || !isFinite(nowMs)) return ring;
  const b = cellOf(ms, nowMs);
  ring[b] = (ring[b] || 0) + cost;
  return ring;
}

// Several rings into one. Transcripts are per session and the drive is the machine's, so the cells
// are summed: two sessions answering in the same ten seconds are twice the work, not one of them
function merge(into, ring) {
  for (const b in ring) into[b] = (into[b] || 0) + ring[b];
  return into;
}

// THE RING'S CELLS ARE THE LAST HOUR AND NOTHING ELSE, so this drops both ends. Called on the
// accumulator a transcript keeps, so a session running all day holds 360 numbers rather than a day
// of them.
//
// The old end is the ordinary one. The NEW end cannot be reached by accrual at all (cellOf above
// pins a stamp to the present), and is there for the one way a cell can become future after it was
// filed: this machine's clock going backwards. A cell the clock has moved behind would otherwise
// read at age zero until the clock caught up again, which is the same fault cellOf exists to stop,
// arriving from the other side.
function trim(ring, nowMs) {
  const cut = oldestKept(nowMs);
  const top = bucketOf(nowMs);
  for (const b in ring) { const k = +b; if (k < cut || k > top) delete ring[b]; }
  return ring;
}

// The kernel, in API-equivalent dollars a minute.
//
// The age is floored at zero, which matters for a ring that has not been trimmed since the clock
// moved: a bare exp(-age/tau) with a negative age weighs a cell ABOVE the present, and no cell may
// ever be worth more than one landing this instant.
function ratePerMin(ring, nowMs) {
  const nb = bucketOf(nowMs);
  const cut = nb - (CELLS - 1);
  let sum = 0;
  for (const b in ring) {
    const k = +b;
    if (k < cut) continue;
    const age = Math.max(0, nb - k) * BUCKET_MS;
    sum += ring[b] * Math.exp(-age / TAU_MS);
  }
  return sum / TAU_MIN;
}

// The weekly allowance this tier gets, in API-equivalent dollars
function budgetFor(tier) {
  return WEEK_BUDGET[tier] || WEEK_BUDGET[DEFAULT_TIER];
}

// THE NUMBER THE CRAB IS READ FROM: the rate above over an even week's rate, so 1.0 is spending the
// week exactly evenly and the rungs are multiples of that (webview.js, DRIVE_STEPS)
function of(ring, nowMs, tier) {
  const even = budgetFor(tier) / WEEK_MINUTES;
  return even > 0 ? ratePerMin(ring, nowMs) / even : 0;
}

module.exports = {
  BUCKET_MS, KEEP_MS, CELLS, TAU_MIN, TAU_MS, WEEK_MINUTES, WEEK_BUDGET, DEFAULT_TIER,
  bucketOf, cellOf, oldestKept, emptyRing, add, merge, trim, ratePerMin, budgetFor, of
};
