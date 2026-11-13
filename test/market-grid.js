// The prices the minute lattice gave, frozen. THIS FILE IS THE WHOLE SAFETY OF 1.31.0.
//
// market.js cut its grid from a minute to a 64th of a minute (its note, section 1). A price is the
// seed of nothing and the store of nothing, but `entryTicks` IS stored, in 639 installs, so a price
// that comes out one tick different is a position that pays a ratio nobody bought at. CRAB's log
// sigma over 316 days is 0.711: a version that redrew the past could hand someone +700% or take half
// their position away, silently, on an update they did not ask for.
//
// So the old prices are not recomputed here, they are REMEMBERED. Every figure below was taken off
// the 1.30.1 engine (the minute lattice, LEVELS = 26) before a line of it was changed, and the test
// compares the shipped engine against these. A test that priced both sides with the same code would
// prove nothing at all: it would agree with itself whatever either one did.
//
// The sweeps are in here rather than in the test because the figure and the sweep it was measured
// over have to travel together. Digests rather than 160,000 literals: the fold is order-sensitive
// (digest below), so a table with the right prices in the wrong minutes fails too, and `spot` keeps
// a readable handful so a failure prints numbers and not only a hash.
//
// Regenerating this file is not a fix. If the test fails, the engine moved a stored price.
'use strict';



// 20,000 consecutive minutes from day 500, which is the sweep the dense figure is quoted over
const DENSE_FROM = 1440 * 500;
const DENSE_N = 20000;
// and 20,000 minutes spread over the whole grid. The stride is coprime with the modulus, so the
// samples do not land on a lattice of their own
const WIDE_N = 20000;
const WIDE_STEP = 2999999;
const WIDE_MOD = 60000000;

function denseMinutes() {
  const out = [];
  for (let i = 0; i < DENSE_N; i++) out.push(DENSE_FROM + i);
  return out;
}
function wideMinutes() {
  const out = [];
  for (let k = 0; k < WIDE_N; k++) out.push((k * WIDE_STEP) % WIDE_MOD);
  return out;
}
// every power-of-two edge and its neighbours, which is where a descent parts company with itself
function edgeMinutes() {
  const out = [0, 1, 2, 3];
  for (let L = 1; L <= 26; L++) {
    const e = Math.pow(2, L);
    out.push(e - 1, e, e + 1, 3 * e - 1, 3 * e, 3 * e + 1);
  }
  return out.filter((n) => n >= 0 && n <= Math.pow(2, 26));
}

// A 64-bit-ish fold of a list of integers, in two 32-bit lanes. Order matters, so a table that has
// the right prices in the wrong places still fails
function digest(nums) {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < nums.length; i++) {
    const v = nums[i] | 0;
    h1 = Math.imul(h1 ^ v, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 + v, 0x85ebca6b) ^ (h2 >>> 13)) >>> 0;
  }
  const hex = (h) => ('00000000' + h.toString(16)).slice(-8);
  return hex(h1) + hex(h2);
}

// The candle window the frozen opens and closes are taken over: an hour a candle, twenty-four of
// them, ending between two grid steps (720,077 is 17 minutes past the hour) so the newest candle is
// a part one and the rest are whole. `CANDLE_GRID` is plain floor division, not engine code: the
// claim being pinned is that the engine lands its candles on exactly these minutes
const CANDLE_STEP_MIN = 60;
const CANDLE_COUNT = 24;
const CANDLE_END_MIN = 1440 * 500 + 77;
const CANDLE_GRID = Math.floor(CANDLE_END_MIN / CANDLE_STEP_MIN) * CANDLE_STEP_MIN;
// the grid minutes the window's candles open and close on, oldest first. count of them: candle k
// opens at edge[k] and closes at edge[k+1], and the last one is the part candle, which opens at the
// end of this list and closes wherever the clock is
function candleEdges() {
  const out = [];
  for (let k = CANDLE_COUNT - 1; k >= 0; k--) out.push(CANDLE_GRID - k * CANDLE_STEP_MIN);
  return out;
}

// Taken off the 1.30.1 engine. Do not regenerate (see the note at the top of this file)
const EXPECT = {
  // 20,000 consecutive minutes from day 500
  dense: {"TIDE": "c17ba0f7a8f469ae", "KELP": "69b2f3c053ef5b0c", "SHEL": "4d4fbefe91c7b639", "CRAB": "a23c44331548dbd6"},
  // 20,000 minutes spread over the whole grid
  wide: {"TIDE": "a0d01acc40828e47", "KELP": "7f45235f9f985baa", "SHEL": "a993bcaa847c418c", "CRAB": "de26eabfc23105ef"},
  // every power-of-two block edge and its neighbours
  edge: {"TIDE": "decbded52fbe0ab4", "KELP": "bf73d81746c3bd4e", "SHEL": "7db1e47b967e8976", "CRAB": "2550c789f3d2d0f0"},
  // a readable handful: [minute, price]
  spot: {
    TIDE: [[720000, 200319], [721000, 198123], [722000, 194331], [723000, 189354], [724000, 189169], [725000, 190568], [726000, 187373], [727000, 186389], [728000, 186871], [729000, 187991], [730000, 188584], [731000, 191965], [732000, 193420], [733000, 194923], [734000, 188574], [735000, 194565], [736000, 195158], [737000, 193033], [738000, 193500], [739000, 194390], [0, 120000], [2999999, 149399], [56980001, 1967], [0, 120000], [67108864, 1964]],
    KELP: [[720000, 116456], [721000, 116619], [722000, 120863], [723000, 127928], [724000, 124333], [725000, 123852], [726000, 121849], [727000, 121150], [728000, 121171], [729000, 124307], [730000, 124236], [731000, 121614], [732000, 118707], [733000, 116237], [734000, 116090], [735000, 115824], [736000, 117310], [737000, 116502], [738000, 117099], [739000, 116995], [0, 250000], [2999999, 30346], [56980001, 3906], [0, 250000], [67108864, 3906]],
    SHEL: [[720000, 82162], [721000, 79591], [722000, 77781], [723000, 80085], [724000, 80840], [725000, 83736], [726000, 83419], [727000, 86438], [728000, 84780], [729000, 85288], [730000, 84719], [731000, 86873], [732000, 89033], [733000, 90153], [734000, 89143], [735000, 90745], [736000, 94986], [737000, 95145], [738000, 95630], [739000, 98131], [0, 70000], [2999999, 8437], [56980001, 1094], [0, 70000], [67108864, 1094]],
    CRAB: [[720000, 51690], [721000, 54493], [722000, 53901], [723000, 54599], [724000, 53564], [725000, 52144], [726000, 49553], [727000, 45516], [728000, 45632], [729000, 44378], [730000, 43312], [731000, 44808], [732000, 44172], [733000, 44393], [734000, 45094], [735000, 44369], [736000, 41933], [737000, 43572], [738000, 43547], [739000, 42267], [0, 160000], [2999999, 13419], [56980001, 2500], [0, 160000], [67108864, 2500]],
  },
  // the old price at each grid minute of the candle window (candleEdges)
  closes: {
    TIDE: [203176, 202641, 202993, 202656, 202490, 202278, 201607, 201210, 201399, 200890, 200661, 201115, 201942, 201731, 200986, 200056, 199521, 199656, 199971, 200605, 200586, 200649, 200319, 199786],
    KELP: [121871, 122307, 122526, 121387, 121035, 120459, 120296, 120079, 120720, 120501, 120973, 120095, 119394, 118749, 118395, 118720, 117589, 117045, 116704, 117045, 116903, 116305, 116456, 116135],
    SHEL: [80316, 80379, 79752, 79762, 79639, 79359, 79815, 80683, 81267, 81799, 82128, 82237, 81489, 81836, 82149, 81933, 82545, 82023, 81634, 81240, 81249, 81934, 82162, 82186],
    CRAB: [52445, 52303, 52168, 52390, 51975, 51394, 51863, 51854, 51720, 51803, 51838, 52118, 52054, 52213, 52166, 51807, 51852, 52482, 52214, 52350, 52319, 52041, 51690, 51420],
  }
};

module.exports = {
  DENSE_FROM, DENSE_N, WIDE_N, WIDE_STEP, WIDE_MOD,
  CANDLE_STEP_MIN, CANDLE_COUNT, CANDLE_END_MIN, CANDLE_GRID,
  denseMinutes, wideMinutes, edgeMinutes, candleEdges, digest, EXPECT
};
