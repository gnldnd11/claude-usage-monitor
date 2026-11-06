// The crab's coin market: four coins, bought with credits and sold for credits. Pure in the sense
// the other games are pure (no vscode, no storage), with one exception named at the end of this note.
//
// What makes this game different from the other four: it is the only one whose numbers move while
// nobody is looking. That is the whole point of it, and it is also the only reason a panel that was
// closed is worth opening again.
//
// --- 1. the price is a function of the clock, not a stored thing --------------------------------
// priceAt(code, tMs) takes a time and gives back a price. Nothing is written down anywhere: the same
// minute always prices the same, in this window, in a tenth window, and in a candle redrawn a month
// later. There is no "current price" to keep in sync, so the merge problem the sword has (credits.js)
// simply does not exist here, and nothing can be rewound and rolled again.
//
// How: a hash-addressed lattice over log(price), walked top down. The whole span from the epoch to
// year 2153 is one block of 2^LEVELS minutes with a hash-drawn total; a block of size 2^L splits into
// halves whose totals are T/2 + D and T/2 - D, with D drawn from hash(coin, L, index) and scaled by
// sqrt(v * 2^(L-2)). That scale is not decoration: it is what makes the two halves come out with
// variance 2^(L-1) * v each AND uncorrelated, so the per-minute steps the lattice implies are exactly
// the independent draws a random walk is made of. The sum over [0, n) is therefore one descent,
// LEVELS nodes deep whatever n is, instead of n additions from the epoch. Adding from the epoch would
// work today and be unusable in a year.
//
// Why a random walk and not a sum of waves. A bounded wiggle (sines, value noise) oscillates inside a
// band the player can learn, and then "buy at the floor of the band, sell at the ceiling" beats the
// fee for free. That breaks the one invariant every game in this casino is built to keep: no strategy
// returns more than the fee leaves, which here is 99.5%. A walk has no band to learn.
//
// --- 2. the drift, and why the price is not exp(walk) -------------------------------------------
// exp of a driftless walk is NOT a fair price. Its log has mean zero, so the price itself drifts UP
// by v/2 a step, and a player who buys and waits long enough beats any fixed fee. So the drift is
// taken out: log(price) = squash(walk(n) - DRIFT * v * n), with DRIFT = 0.5 + a guard explained in
// section 3. At DRIFT = 0.5 the price is an exact martingale, which is the strongest statement this
// file can make about itself: for ANY rule for choosing when to sell, including rules nobody has
// thought of, the expected sale price equals the purchase price, so the expected return is exactly
// the fee. test/market.test.js proves that per step by quadrature rather than by sampling.
//
// The cost of being fair is that the MEDIAN of a fair geometric price has to fall, by DRIFT * sigma^2
// a day. That is not a house cut (the mean is flat) and it is not a bug to be fixed: a price process
// that is bounded, fair and alive forever does not exist, since a bounded martingale has to converge.
// What it does mean is that daily volatility cannot be chosen freely. At 10% a day the median halves
// every 110 days; the table below tops out at 4%, where it halves in 688 days, and the ceiling is a
// load-time check rather than a choice (see checkCoins). The test prints the half-life of every coin
// so a retune shows up there. On the panel's own time scale (hours, a few days) the slide is
// invisible under the noise.
//
// --- 3. the band, and why a pull toward the middle is dangerous ---------------------------------
// Left alone the walk wanders off, so log(price) is passed through `squash`, which is the identity
// inside base/8 .. base*8 and bends beyond it, asymptotically bounded at base/64 .. base*64.
//
// A pull toward the middle is exactly the free money section 1 warns about: if the price reliably
// comes back, buying low and waiting pays better than the fee. The bend is therefore paid for rather
// than trusted. The per-step condition for the price to stay a supermartingale (fair or worse for the
// player) is 0.5 * (g'^2 - g' + g'') <= guard * g', and for this squash the left side peaks at
// 1/(2*s^2) = 0.1156, so the guard is set to 0.13: a touch of extra downward drift, everywhere, that
// buys back everything the bend hands over. Being level-INDEPENDENT is what makes it harmless. It
// costs every holder the same whatever price they bought at (0.021% a day on the wildest coin, 0.003%
// on the calmest), so there is nothing to buy low for. The test checks the inequality on a grid AND
// integrates the real
// one-step expectation for every coin, so the proof is of this code and not of this paragraph.
//
// --- 4. my own activity moves the SPREAD, not the direction. it moves neither, here -------------
// The idea was to feed the day's token burn in as `heat` and let a busy day be a rough sea. It is not
// wired, on purpose, and the reason is worth keeping:
//  - heat on the DIRECTION is a credit printer. Buy, then burn tokens to push the price up. Never.
//  - heat on the per-step SIZE changes the past. The walk accumulates, so raising today's step size
//    moves every price after it, which means today's earlier candles, and the entry marker drawn on
//    them, move under the player.
//  - worse, it is exploitable even so: today's burn is not final until midnight, so a player who is
//    up on the day could raise the heat and amplify the move they are already on the right side of.
//    Scaling an accumulated displacement after the fact pays out in the direction it already went.
//  - heat on the candle WICK only (open and close untouched) is safe, because money never touches a
//    wick, but then it is decoration and the honest way to show the day's heat is to show the day's
//    heat, next to the chart, as itself.
// So volatility is fixed per coin and the door is shut. There is a safe version of this: a per-DAY
// variance schedule, stored once a day is over and never revised, with the lattice cut on day
// boundaries so a day's steps only ever scale that day's own draws. It is a different lattice and it
// needs a stored schedule, so it is not in this file.
//
// --- 5. nothing here may ever be sent to the webview -------------------------------------------
// This is a host-side module. It must not be loaded into webview.js, listed in the webview's script
// tags, or have any of its functions mirrored there.
// The reason is that this game, alone among the five, has no secret to keep and therefore no secret
// to lean on. A card game hides its shoe and the forge makes a fresh seed per attempt, so a screen
// holding the whole engine still cannot see the next card. Here the next minute's price is simply
// priceAt(code, now + 60000): a screen that could compute prices could read the future and buy the
// winner. So the screen gets numbers, never the function:
//  - the host computes candles and the current price and posts them
//  - the host trades at ITS OWN clock, which is the one rule this file cannot check from state
//    alone, so it is the one impure thing in here: whyNot refuses a nowMs that is not the clock's.
//    Refusing the future is what makes "the price of a minute that has not happened" unreachable,
//    whether the caller is a webview, a hand-edited message, or a later version of the host that
//    forgot why this check is here.
//  - `seed` is not in TICKERS and not in any view. There is nothing to leak, and nothing is handed
//    over anyway, because the cheapest way to keep a rule is to make it impossible to break
//
// --- 6. positions hold CREDITS, not units ------------------------------------------------------
// A position is { ticker, amount, entryTicks, at } where `amount` is a whole number of credits
// staked. It is deliberately not a number of coins. Units would be fractional the moment a stake is
// not a multiple of the price, and a fraction on the money path is a float on the money path, which
// is the one thing the ledger does not allow (credits.js keeps its weights as integers for the same
// reason). The sale is a ratio of two integer prices instead:
//   payout = floor(amount * 199 * exitTicks / (entryTicks * 200))
// The whole 0.5% round trip is taken once, on the sale. Taken as 0.25% each way it would be the same
// number and two floors instead of one. Prices are integers, in hundredths of a credit (`ticks`), so
// nothing on this path is ever multiplied by a fraction. 199/200 and 995/1000 are the same rational
// and the same floor, but the second grouping multiplies by five more than it needs to, which costs
// this market four fifths of the position it can count exactly, so the code and this line both use
// the first. MAX_BUY exists so the product cannot leave Number.MAX_SAFE_INTEGER at all, and it is
// derived from the table at load time rather than picked.
//
// One position per coin, and buying a coin already held is refused. Averaging down would mean a
// weighted entry price, which means a division, which means a rounded entry price that is nobody's
// real price. There is a line in whyNot instead.
//
// --- 7. the wallet outlives the window, and windows share it ----------------------------------
// Like the sword, and for the same reason: a position is the player's property, not a round. So the
// wallet is saved, several windows share one, and the merge is forge's merge (credits.js):
//  - `moves` is a count of accepted moves. It only ever grows, so of two copies the one with more
//    moves is the later one, and a tie goes to the larger writer id. A window makes exactly one
//    record per move count, so (moves, by) names a record
//  - nothing is maxed across the two copies, and that is a difference from the sword rather than an
//    omission. forge.js maxes `tries` and `best` because they are lifetime figures that a dropped
//    attempt would otherwise walk backwards. Here there is no such figure: `moves` is the clock and
//    the winner holds the largest one by definition, and everything else is money or made of money,
//    which has to travel with the record or be wrong (next point). Maxing `best` in particular would
//    print the price of a sale that was dropped and never paid, as a record the player never set
//  - THE MONEY IS IN THE RECORD. `earned` and `staked` are inside it, they are adopted with it and
//    dropped with it, and the balance is earned - staked (netOf). Counting a payout in a per-window
//    counter instead is the bug that pays twice: two windows selling one position each bank the
//    price of it, and a sale the merge drops leaves the player holding both the position and the
//    money for it. Counting the BUY in a per-window counter has the mirror problem, and it is worse
//    here than in the forge: a dropped forge attempt costs its fee, which is small and fixed, while
//    a dropped buy would charge a stake that can be the whole purse and hand back nothing. Both
//    halves of a trade therefore travel with the record
//  - so the host cannot pay out before it knows its own record survived. It writes, reads back the
//    merged record, and calls kept(mine, landed): same moves, same by. That is the fgSettle pattern
//    (extension.js) and `kept` is here so the host does not have to rederive it
// load() takes anything: a record from a newer version, a hand-edited one, junk, null. 569 installs
// have a store this is going into, and a game that throws on read is a panel that does not open.

const OPS = ['buy', 'sell'];

// --- the money path -----------------------------------------------------------------------------

// Prices are integers in hundredths of a credit. A credit is already a coarse unit (100,000 weighted
// tokens, credits.js), so this is fine enough to show a 0.01% move on the calmest coin
const TICKS_PER_CREDIT = 100;

// The house's cut on a round trip: 0.5%. It is deliberately NOT the 3% the card games take, and the
// reason is a measurement rather than a taste. A position here is held for minutes or days instead of
// for a round, so what the fee has to be smaller than is how far the price actually travels while it
// is held. Measured on this engine's own prices, the median move over a day is 0.99% on the calmest
// coin and 2.60% on the wildest, so at 3% a day's move did not reach the fee: 98% of day-long holds
// on TIDE and 76% on CRAB came back short of the stake. That kills the one loop this game exists
// for, which is buy, close the panel, come back and find the number somewhere else. At 0.5% a day is
// worth 2.0x the fee on TIDE and 5.2x on CRAB, and the same holds come back short 65% and 56% of the
// time. Over half, and that is correct: the price is fair, so the fee is the whole of the house's
// edge and a coin flip plus 0.5% is what a round trip should be.
//
// Lowering it does not open the other door. The median move over ONE minute is 0.026% to 0.072% and
// the 99th percentile 0.10% to 0.27%, so 0.5% is 7x to 19x a typical minute and still 1.9x the
// wildest minute in a hundred. Measured over 20,000 consecutive minutes a coin, the share of minutes
// whose own move clears the fee is 0.000% on all four. Scraping a coin minute by minute pays the fee
// and nothing else, so the panel stays a thing to come back to rather than a thing to sit in front
// of. The figure that moved the most in going from 3% to 0.5% is how long a position has to be left
// alone to be worth closing: the median wait for the price to clear the fee on the upside fell from
// 10.9 days to 8 hours on TIDE and from 1.3 days to 58 minutes on CRAB.
//
// Written 199/200 rather than 995/1000: the same rational, the same floor on every integer input, and
// a product five times smaller. That is not tidiness. MAX_BUY is solved from this numerator (below),
// and at 995 the product only leaves room for a 565,778 credit position, which is under the floor
// checkCoins holds it to. 199/200 leaves 2,828,894.
const FEE_NUM = 199;
const FEE_DEN = 200;

// The minimum bet of the other games. One number, so a player does not have to learn four
const MIN_BUY = 10;

// --- the lattice --------------------------------------------------------------------------------

// Where minute zero is. Before it, every coin sits at its base price: there is no history to draw
// and no trade can settle there (the clock check in whyNot sees to that)
const EPOCH_MS = Date.UTC(2026, 0, 1);
const MS_PER_MIN = 60000;
const MIN_PER_DAY = 1440;

// The lattice is one block of 2^LEVELS minutes, which runs out in 2153. A descent is LEVELS nodes
// deep whatever the minute, so this is also the cost of a price. 26 rather than 40 because the root
// total's size grows as sqrt(2^LEVELS) and every price is a difference of numbers that big: at 26
// the root is about 11 log units wide against an answer of about 3, which costs one digit of the
// double's fifteen. Past the end the price freezes, which is a better failure than a wrong number
const LEVELS = 26;
const MAX_MINUTE = Math.pow(2, LEVELS);
// block sizes, looked up rather than computed: the descent reads one per level and a chart is
// hundreds of descents, so Math.pow in there is the difference between a redraw and a stutter
const POW2 = [];
for (let i = 0; i <= LEVELS + 1; i++) POW2[i] = Math.pow(2, i);

// log(price) is the identity inside base/BAND_X .. base*BAND_X, so inside the band the price does not
// know where it is and there is nothing to mean-revert to (see the note, section 3)
const BAND_X = 8;
const BAND = Math.log(BAND_X);
// how far the bend reaches. Equal to BAND, so the hard bound is base/64 .. base*64. Bigger would
// need a smaller guard and give a wider band; this pair is the one the table below is tuned for
const SPAN = BAND;
const HARD = BAND + SPAN;

// 0.5 makes the price an exact martingale. The rest buys back the bend: the per-step edge the squash
// hands the player peaks at 1/(2*SPAN^2) = 0.1156, and 0.13 covers it with room. Both halves are
// multiplied by the per-minute variance, so on the calmest coin the guard is 0.003% a day
const FAIR_DRIFT = 0.5;
const BEND_GUARD = 0.13;
const DRIFT = FAIR_DRIFT + BEND_GUARD;

// A trade settles at the host's clock. The slack is for a message that crossed a tick boundary, not
// for a choice of time
const CLOCK_SLACK_MS = 5000;

// A writer id is 16 hex characters (extension.js makes them). Same shape as credits.js's, and
// checked here too so a hand-edited store cannot win a merge tie with "__proto__"
const REPLICA_RE = /^[0-9a-f]{16}$/;

// --- the coins ----------------------------------------------------------------------------------
//
// Four of them, so the screen has a list rather than a toggle, and four volatilities so the choice
// is a real one: a coin that moves 1.5% a day and one that moves 5% are different games at the same
// fee. Volatility is daily, in basis points, and it is the ONLY thing that differs between them.
//
// Names are sea and crab words. Nothing here is the name or ticker of a real coin, share or company,
// and nothing should become one: this is a toy inside an editor, and a toy that borrows a real
// market's name is making a claim about that market.
//
// Base prices are large in ticks on purpose. The price is rounded to a whole tick, so the rounding
// is worth 0.5/ticks of the price, and that error is the one thing in this file the fee has to
// swallow. At 70,000 ticks it is 0.0007%, and at the bottom of the band (1,093 ticks) 0.05%, both
// nothing against 3%. A coin based at 20 credits would be 2,000 ticks and 31 at the floor, where
// rounding is worth 1.6% and the game would be gameable by arithmetic alone.
//
// Why 4% is the ceiling, and why the "10% a day" this was asked for is not reachable: the median of
// a fair coin falls DRIFT * sigma^2 a day (section 2), and once it has fallen past the band the bend
// starts flattening the coin as well, so a coin that slides far enough stops MOVING. Ten years out,
// 4% a day leaves a coin at 2.5% of its base and still moving at 58% of its nominal size; 5% leaves
// it sitting on the floor of the band, flat, which is a dead coin inside the life of the extension.
// checkCoins below turns that into a load-time refusal rather than a paragraph.
const COINS = [
  { code: 'TIDE', name: 'Tide Pool', grade: 'calm', base: 1200, volBp: 150 },
  { code: 'KELP', name: 'Kelp Line', grade: 'steady', base: 2500, volBp: 240 },
  { code: 'SHEL', name: 'Shellback', grade: 'choppy', base: 700, volBp: 320 },
  { code: 'CRAB', name: 'Crabclaw', grade: 'wild', base: 1600, volBp: 400 }
];

// How long a coin has to still be worth watching. Not a tuning knob: it is the horizon the vol
// ceiling is solved against, and test/market.test.js samples the same number of years
const ALIVE_DAYS = 3650;
const ALIVE_FRACTION = 0.5;

// --- the node hash ------------------------------------------------------------------------------
//
// cards.js owns the one seeded stream in this repo, and the rule that comes with it is that a game
// does not keep a second copy of it. This is not one. A stream is walked from a seed and gives its
// values in order; the lattice needs the value AT an address (coin, level, index) without walking to
// it, which a stream cannot do unless a fresh seed string is built per node, 26 of them per price,
// which would make a chart the most expensive thing in the panel.
// What makes the rule a rule does not apply either: there is no hidden outcome rolled from a seed
// here, nothing face down, and no seed that leaves this module (see the note, section 5). The guard
// against a bad mixer is not this paragraph but test/market.test.js, which measures the moments of
// the increments it actually produces.

// 32-bit mix of a coin seed and a node address. murmur3's finalizer with the address folded in
function nodeHash(seed, level, index) {
  let h = (seed ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ level, 0x85ebca6b);
  h = (h << 15) | (h >>> 17);
  h = Math.imul(h ^ index, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

// FNV-1a over a string: how a coin's code becomes its seed. One call per coin, at load
function seedOf(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// The normal quantile (Acklam's rational approximation, relative error under 1.2e-9). It is here
// rather than Box-Muller because the middle branch has no log and no cos in it, and 95% of draws
// take the middle branch: a price is 26 of these, and a chart is a few hundred prices.
// Exactness matters more than it looks. The two halves of a split are uncorrelated by construction
// whatever the distribution, but only GAUSSIAN draws make them independent, and only independence
// makes the per-minute steps a real random walk rather than something with structure in it that a
// strategy could find
const PA = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const PB = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
const PC = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const PD = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
const P_LOW = 0.02425;

function probit(p) {
  if (p < P_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((PC[0] * q + PC[1]) * q + PC[2]) * q + PC[3]) * q + PC[4]) * q + PC[5]) /
      ((((PD[0] * q + PD[1]) * q + PD[2]) * q + PD[3]) * q + 1);
  }
  if (p > 1 - P_LOW) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((PC[0] * q + PC[1]) * q + PC[2]) * q + PC[3]) * q + PC[4]) * q + PC[5]) /
      ((((PD[0] * q + PD[1]) * q + PD[2]) * q + PD[3]) * q + 1);
  }
  const q = p - 0.5, r = q * q;
  return (((((PA[0] * r + PA[1]) * r + PA[2]) * r + PA[3]) * r + PA[4]) * r + PA[5]) * q /
    (((((PB[0] * r + PB[1]) * r + PB[2]) * r + PB[3]) * r + PB[4]) * r + 1);
}

// A standard normal draw for one node, cut off at 8 sigma. The cut is symmetric, so it moves no
// mean; what it does is stop one absurd draw (probability about 1e-15) from carrying a price
const Z_CAP = 8;

function nodeZ(row, level, index) {
  const u = (nodeHash(row.seed, level, index) + 0.5) / 4294967296;
  const z = probit(u);
  return z > Z_CAP ? Z_CAP : (z < -Z_CAP ? -Z_CAP : z);
}

// --- a coin's row -------------------------------------------------------------------------------

// Everything a price needs, built once. `sd` is the displacement scale per level: a block of size
// 2^L splits with D ~ N(0, v * 2^(L-2)), which is what makes each half come out at variance
// 2^(L-1) * v with zero covariance (the note, section 1). `path` is the descent cache (below)
function buildRow(code, name, grade, base, volBp, seedKey) {
  const vol = volBp / 10000;                 // daily, as a fraction
  const v = (vol * vol) / MIN_PER_DAY;       // per-minute variance of log(price)
  const baseTicks = base * TICKS_PER_CREDIT;
  const sd = [];
  for (let L = 0; L <= LEVELS; L++) sd[L] = Math.sqrt(v * Math.pow(2, L - 2));
  return {
    code, name, grade, base, baseTicks, volBp, vol, v,
    seed: seedOf(seedKey),
    sd,
    rootSd: Math.sqrt(v * Math.pow(2, LEVELS)),
    floorTicks: Math.max(1, Math.floor(baseTicks / (BAND_X * BAND_X))),
    capTicks: baseTicks * BAND_X * BAND_X,
    path: [], depth: 0
  };
}

const ROWS = COINS.map((c) => buildRow(c.code, c.name, c.grade, c.base, c.volBp, c.code));
const BY_CODE = new Map(ROWS.map((r) => [r.code, r]));
const CODES = Object.freeze(ROWS.map((r) => r.code));

// What leaves this module as the coin list. The seed, the lattice scales and the cache are not in
// it, and that is not tidiness: a screen holding a seed is a screen that can price the next minute
const TICKERS = Object.freeze(ROWS.map((r) => Object.freeze({
  code: r.code, name: r.name, grade: r.grade,
  base: r.base, baseTicks: r.baseTicks, volBp: r.volBp,
  floorTicks: r.floorTicks, capTicks: r.capTicks
})));

// The largest price any coin can reach, which is what bounds the sale's product. MAX_BUY is then
// solved rather than picked: amount * FEE_NUM * exitTicks has to stay a safe integer
const MAX_TICKS = ROWS.reduce((m, r) => Math.max(m, r.capTicks), 0);
const BUY_LIMIT = Math.floor(Number.MAX_SAFE_INTEGER / (FEE_NUM * MAX_TICKS));
// a round number under the limit, so the refusal message is one a player can read. The limit moves
// when the numerator does: it was 5,803,607 at 97/100 and is 2,828,894 at 199/200, so the round
// number under it moved from 5,000,000 to 2,500,000. Being a round number is the whole job of the
// first argument, and min() is what keeps the second one binding whatever the fee becomes
const MAX_BUY = Math.min(2500000, BUY_LIMIT);

// The table is the whole game, so a typo in it is the whole game being wrong. Checked once, at load,
// the way forge.js checks its ladder
(function checkCoins() {
  if (ROWS.length < 2) throw new Error('market: a market with one coin is a toggle');
  const seen = new Set();
  for (const r of ROWS) {
    if (!/^[A-Z]{3,5}$/.test(r.code)) throw new Error('market: bad code ' + r.code);
    if (seen.has(r.code) || seen.has(r.seed)) throw new Error('market: ' + r.code + ' is not unique');
    seen.add(r.code); seen.add(r.seed);
    if (!Number.isSafeInteger(r.base) || r.base < 100) throw new Error('market: ' + r.code + ' is based too low to price in ticks');
    if (!Number.isSafeInteger(r.volBp) || r.volBp < 1) throw new Error('market: ' + r.code + ' has no volatility');
    // The volatility ceiling, solved rather than guessed. A fair coin's median falls DRIFT*sigma^2 a
    // day; once it is past the band the bend damps the coin by squash'(d), so a coin that slides too
    // far does not just get cheap, it goes still. This asks that ALIVE_DAYS out it is still moving at
    // ALIVE_FRACTION of its nominal size
    if (liveliness(r.vol, ALIVE_DAYS) < ALIVE_FRACTION) {
      throw new Error('market: ' + r.code + ' is damped to ' + liveliness(r.vol, ALIVE_DAYS).toFixed(2)
        + 'x of its own size within ' + ALIVE_DAYS + ' days, which is a coin that stops moving');
    }
    if (r.floorTicks < 1000) throw new Error('market: ' + r.code + ' rounds too coarsely at the floor of its band');
  }
  // the bend's guard has to cover the edge the bend hands over (the note, section 3)
  if (BEND_GUARD <= 1 / (2 * SPAN * SPAN)) throw new Error('market: the bend guard is too small for the band');
  if (MAX_BUY < 1000000 || MAX_BUY > BUY_LIMIT) throw new Error('market: MAX_BUY is outside what the sale can multiply');
  if (MIN_BUY < 1) throw new Error('market: a buy has to stake something');
})();

// --- the walk -----------------------------------------------------------------------------------

// Minute index of a time, clamped at both ends of the lattice
function minuteOf(tMs) {
  if (!Number.isFinite(tMs)) return 0;
  const n = Math.floor((tMs - EPOCH_MS) / MS_PER_MIN);
  if (n < 0) return 0;
  return n > MAX_MINUTE ? MAX_MINUTE : n;
}

// Sum of the walk's steps over [0, n), by descent.
//
// The invariant down the descent is: `acc` is the sum over [0, lo), and `total` is the sum over the
// block [lo, lo + 2^level). A block wholly inside [0, n) is added and done with; a block wholly
// outside is dropped; otherwise it is split and the half that holds the boundary is descended into.
//
// The cache is the same descent, kept. Two prices a minute apart share every frame but the last few,
// and a chart asks for prices in order, so keeping the frames turns a chart from LEVELS nodes a
// price into about four.
//
// It may only ever skip work a cold descent would have done, and that is why the lookup below asks
// for STRICT containment. A cold descent enters a block only when n falls strictly inside it; a
// block whose right edge is exactly n is answered one level up, as acc + total. Reusing such a
// frame would answer the same question as (acc + left) + (total - left), which is the same number
// in arithmetic and a different sum in doubles. One ulp is nothing to a price rounded to a tick
// until the day it lands on a half and the two answers differ by one. The test makes a genuinely
// cold descent (_test.chill) and compares the raw sums, not the prices, so this is checked and not
// merely intended
// The frames are reused rather than reallocated: the array is at most LEVELS+1 long and a chart
// walks it hundreds of times, so an object per level per price would be garbage by the megabyte
function keepFrame(path, i, acc, lo, level, index, total) {
  const f = path[i];
  if (f) { f.acc = acc; f.lo = lo; f.level = level; f.index = index; f.total = total; }
  else path[i] = { acc, lo, level, index, total };
}

function sumAt(row, n) {
  if (n <= 0) return 0;
  const path = row.path;
  // the deepest kept frame whose block STRICTLY contains n, which is the deepest frame a cold
  // descent would have entered (see the note above). Frames are nested, so the first one that does
  // is the deepest one that does
  let k = row.depth - 1;
  while (k >= 0) {
    const f = path[k];
    if (n > f.lo && n < f.lo + POW2[f.level]) break;
    k -= 1;
  }
  let acc, lo, level, index, total;
  if (k < 0) {
    acc = 0; lo = 0; level = LEVELS; index = 0;
    // the root's own draw, addressed one level above any split so it collides with none of them
    total = nodeZ(row, LEVELS + 1, 0) * row.rootSd;
    k = 0;
    keepFrame(path, 0, acc, lo, level, index, total);
  } else {
    const f = path[k];
    acc = f.acc; lo = f.lo; level = f.level; index = f.index; total = f.total;
  }
  let depth = k + 1;
  for (;;) {
    const size = POW2[level];
    // the whole block is inside [0, n), or none of it is, or it is one minute wide and so neither
    // (which cannot happen: a level-0 block is always one of the two)
    if (n >= lo + size || n <= lo || level === 0) {
      row.depth = depth;
      return n >= lo + size ? acc + total : acc;
    }
    const mid = lo + size / 2;
    const left = total / 2 + nodeZ(row, level, index) * row.sd[level];
    if (n <= mid) { total = left; index = index * 2; }
    else { acc += left; total = total - left; lo = mid; index = index * 2 + 1; }
    level -= 1;
    keepFrame(path, depth, acc, lo, level, index, total);
    depth += 1;
  }
}

// The band. Identity inside, bending beyond, bounded at HARD. Odd, so the two ends behave the same
function squash(d) {
  const a = d < 0 ? -d : d;
  if (a <= BAND) return d;
  const y = BAND + SPAN * Math.tanh((a - BAND) / SPAN);
  return d < 0 ? -y : y;
}

// How much of its nominal size a coin is still moving by, `days` out. The median of the walk sits at
// -DRIFT * sigma^2 * days, and the band's slope there is what the coin's moves get multiplied by, so
// this is one number for "is this coin still alive". 1 means untouched; it only ever falls
function liveliness(vol, days) {
  const d = DRIFT * vol * vol * days;
  if (d <= BAND) return 1;
  const c = 1 / Math.cosh((d - BAND) / SPAN);
  return c * c;
}

// log(price / base) at a minute: the walk, less the drift, through the band
function logDevAt(row, n) {
  return squash(sumAt(row, n) - DRIFT * row.v * n);
}

// A price, in whole ticks. The clamp is belt and braces: squash already bounds the exponent, and
// what is left for the clamp is the rounding at the very edge of the band
function priceOn(row, tMs) {
  const t = Math.round(row.baseTicks * Math.exp(logDevAt(row, minuteOf(tMs))));
  if (t < row.floorTicks) return row.floorTicks;
  return t > row.capTicks ? row.capTicks : t;
}

function rowOf(code) {
  return BY_CODE.get(code) || null;
}

// The price of a coin at a time. The one function this whole file is built around
function priceAt(code, tMs) {
  const row = rowOf(code);
  if (!row) throw new RangeError('no such coin: ' + code);
  return priceOn(row, tMs);
}

// --- candles ------------------------------------------------------------------------------------

// A candle's high and low are read off samples inside it, not off every minute in it: a day-wide
// candle holds 1,440 minutes and a chart of sixty of them would be 86,400 prices for two numbers
// nobody can see the difference in. The open and the close are exact, and they are in the sample, so
// the wick always contains the body
const WICK_SAMPLES = 8;
const MAX_CANDLES = 240;

// Display OHLC, oldest first. Candle k ends at toMs minus (count-1-k) steps and opens a step before
// that, so consecutive candles touch: one candle's open is the one before it's close.
// `toMs` is the host's own clock (see the note, section 5). Nothing here refuses a future one,
// because nothing here can know: a chart is drawn from what the host hands over, and the host is the
// thing that knows what time it is. The refusal that matters is on the trade, in whyNot
function candles(code, opts) {
  const row = rowOf(code);
  if (!row) throw new RangeError('no such coin: ' + code);
  const o = opts || {};
  const stepMin = Math.max(1, Math.round((o.stepMs || MS_PER_MIN) / MS_PER_MIN));
  const count = Math.max(1, Math.min(MAX_CANDLES, Math.floor(o.count || 1)));
  const endMin = minuteOf(o.toMs);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = endMin - i * stepMin;
    const start = end - stepMin;
    const open = priceOn(row, EPOCH_MS + start * MS_PER_MIN);
    const close = priceOn(row, EPOCH_MS + end * MS_PER_MIN);
    let hi = open > close ? open : close;
    let lo = open < close ? open : close;
    const inner = Math.min(WICK_SAMPLES, stepMin);
    for (let j = 1; j < inner; j++) {
      const m = start + Math.round((j * stepMin) / inner);
      const p = priceOn(row, EPOCH_MS + m * MS_PER_MIN);
      if (p > hi) hi = p;
      if (p < lo) lo = p;
    }
    out.push({ t: EPOCH_MS + end * MS_PER_MIN, o: open, h: hi, l: lo, c: close });
  }
  return out;
}

// --- the sale's arithmetic ----------------------------------------------------------------------

// What a position fetches, net of the whole round trip. Integer in, integer out, one floor.
// FEE_NUM/FEE_DEN is 199/200, which is 995/1000 with a product five times smaller (see the note,
// section 6). MAX_BUY keeps the product safe; this checks it anyway, because a cap that is only
// enforced at the door is a cap that a later caller walks around
function payoutOf(amount, entryTicks, exitTicks) {
  const top = amount * FEE_NUM * exitTicks;
  if (!Number.isSafeInteger(top)) throw new RangeError('market: a sale this large cannot be counted exactly');
  return Math.floor(top / (entryTicks * FEE_DEN));
}

// What a position is worth before the fee, for the screen to show next to the payout. Checked the
// same way payoutOf is, so the two have the same posture: a cap enforced only at the door is a cap
// the next caller walks around
function grossOf(amount, entryTicks, exitTicks) {
  const top = amount * exitTicks;
  if (!Number.isSafeInteger(top)) throw new RangeError('market: a position this large cannot be valued exactly');
  return Math.floor(top / entryTicks);
}

// --- the wallet ---------------------------------------------------------------------------------
//
//   pos      code -> { amount, entryTicks, at }. At most one per coin, and a coin either has one or
//            is absent from the object. `amount` is credits, never units (the note, section 6)
//   moves    accepted moves, buys and sales alike. The merge clock: it only grows, so of two copies
//            the one with more moves is the later one (credits.js's register merge)
//   trades   round trips closed, which is sales and not moves: a buy that has not been sold is not
//            a trade yet, it is a position. A figure for the screen
//   staked   credits the market has taken in. IN the record, so a dropped buy charges nothing
//   earned   credits the market has paid out. IN the record, so a dropped sale pays nothing
//   best     the largest single payout this save has seen. Only grows
//   at       the clock of the last accepted move. Saved, because a clock that can go backwards is a
//            way to settle at a price that has already been read off the chart
//   last     what the move just made did, or null. Not saved: a reload keeps the wallet, not the chip
//   net      what the balance moved by for that move, or null. Not saved, for the same reason
//   by       the id of the window that last wrote it. The host fills it in; this module has no
//            business inventing one

const REC_FIELDS = ['moves', 'trades', 'staked', 'earned', 'best', 'at'];

// Empty, and deliberately: see the note, section 7. forge.js has to raise `tries` and `best` across
// a merge because a dropped attempt would walk a lifetime figure backwards. Nothing here is that
// kind of figure, so the winning record is adopted whole and nothing is lifted out of the loser.
// It is exported because the host's merge is written against the same shape as credits.js's, and a
// host reading an empty list here is reading the rule
const MAX_FIELDS = Object.freeze([]);

// What `clean` will believe. A record out of these is not a record `save` could have produced, so it
// reads as none of it: these are not game limits, they are the shape of a stored record.
//  - a move a second for thirty years is 1e9, and no wallet reaches it
//  - 1e15 credits is a thousand times the forge's jackpot and still well under a safe integer
//  - a time past the end of the lattice is a time with no price in it
// Without these, a hand-edited store can set `moves` to 1e15 and win every merge forever, which
// would leave every real window told that another window moved first
const MAX_MOVES = 1e9;
const MAX_MONEY = 1e15;
const MAX_AT = EPOCH_MS + MAX_MINUTE * MS_PER_MIN;
const REC_CEIL = { moves: MAX_MOVES, trades: MAX_MOVES, staked: MAX_MONEY, earned: MAX_MONEY, best: MAX_MONEY, at: MAX_AT };

function freshWallet(by) {
  return {
    pos: {}, moves: 0, trades: 0, staked: 0, earned: 0, best: 0, at: 0,
    last: null, net: null, by: by == null ? '' : String(by)
  };
}

function newWallet(opts) {
  return freshWallet(opts && opts.by);
}

function clone(st) {
  const pos = {};
  for (const code of CODES) if (st.pos[code]) pos[code] = Object.assign({}, st.pos[code]);
  return Object.assign({}, st, { pos, last: st.last ? Object.assign({}, st.last) : null });
}

function heldCount(st) {
  let n = 0;
  for (const code of CODES) if (st.pos[code]) n += 1;
  return n;
}

// --- what may be done ---------------------------------------------------------------------------

// The clock. The only impure thing in this file, and the only rule that cannot be answered from
// state: whether a time is now.
// `setClock` is how the test settles trades spread over ten years without waiting ten years, and it
// is reached through `_test` and not through the module's own face. Refusing a future minute is the
// whole of this game's safety (the note, section 5), so the one function that can switch that off
// does not sit next to `squash` where a host could find it by accident
let clock = Date.now;
function setClock(fn) { clock = typeof fn === 'function' ? fn : Date.now; }

// Why `nowMs` cannot be the moment of a trade. Three separate refusals, and the comment is longer
// than the code because each one is a hole someone will otherwise reopen:
//  - the future is the whole exploit (the note, section 5). The lattice will happily price next
//    Tuesday, so the only thing standing between a player and next Tuesday's close is this line
//  - the past is the same exploit wearing a hat: a time already drawn on the chart is a price the
//    player has read, and buying at a price you have already seen move is buying a result
//  - backwards from the wallet's own last move, which a system clock really can do, would let the
//    two above be reached one trade at a time
function badTime(st, nowMs) {
  if (!Number.isSafeInteger(nowMs)) return 'a trade needs the time it happened';
  const now = clock();
  if (nowMs > now + CLOCK_SLACK_MS) return 'the market has not reached that minute yet';
  if (nowMs < now - CLOCK_SLACK_MS) return 'a trade settles at the clock, not at a chosen time';
  if (nowMs < st.at) return 'the clock moved backwards';
  return null;
}

// Why a buy of `amount` cannot be made, as far as the wallet and the purse are concerned.
// budget is the credits this game may stake; left out it means no limit, which is how act() runs:
// the money rule is the host's and it checked the live balance before calling in (forge.js does the
// same). Comparisons are written as !(a <= b) so a NaN budget, which is a broken ledger, refuses
function cannotBuy(st, code, amount, budget) {
  if (!rowOf(code)) return 'no such coin';
  if (st.pos[code]) return code + ' is already held';
  if (!Number.isSafeInteger(amount) || !(amount >= MIN_BUY)) return 'the stake must be a whole number of at least ' + MIN_BUY;
  if (!(amount <= MAX_BUY)) return 'the market takes at most ' + MAX_BUY + ' credits a position';
  const room = budget == null ? Infinity : budget;
  if (!(amount <= room)) return 'not enough credits';
  return null;
}

function cannotSell(st, code) {
  if (!rowOf(code)) return 'no such coin';
  if (!st.pos[code]) return 'nothing is held in ' + code;
  return null;
}

// Why `op` cannot be played now, or null. Takes the message form: a bare name cannot be answered,
// because every move in this game is about one coin
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : null;
  if (!OPS.includes(name)) return 'unknown action';
  if (!st) return 'there is no wallet';
  const no = name === 'buy' ? cannotBuy(st, op.ticker, op.amount, budget) : cannotSell(st, op.ticker);
  if (no) return no;
  return badTime(st, op.nowMs);
}

// --- a move -------------------------------------------------------------------------------------

function buy(st, code, amount, nowMs) {
  const ticks = priceAt(code, nowMs);
  st.pos[code] = { amount, entryTicks: ticks, at: nowMs };
  st.moves += 1;
  st.staked += amount;
  st.at = nowMs;
  st.net = -amount;
  st.last = { op: 'buy', ticker: code, amount, ticks, entryTicks: ticks, payout: 0, pl: 0, heldMs: 0, at: nowMs };
}

function sell(st, code, nowMs) {
  const p = st.pos[code];
  const ticks = priceAt(code, nowMs);
  const paid = payoutOf(p.amount, p.entryTicks, ticks);
  delete st.pos[code];
  st.moves += 1;
  st.trades += 1;
  // the money the market hands over goes in the wallet's own record, which is where the balance
  // reads it from: a sale the merge drops takes its payout with it (the note, section 7)
  st.earned += paid;
  if (paid > st.best) st.best = paid;
  st.at = nowMs;
  st.net = paid;
  st.last = {
    op: 'sell', ticker: code, amount: p.amount, ticks, entryTicks: p.entryTicks,
    payout: paid, pl: paid - p.amount, heldMs: nowMs - p.at, at: nowMs
  };
}

// act() never mutates its input and returns the very same object when the move is not allowed
// (forge.js's rule, so a host can test for identity rather than for a reason)
function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  if (op.op === 'buy') buy(next, op.ticker, op.amount, op.nowMs);
  else sell(next, op.ticker, op.nowMs);
  return next;
}

// --- saving and merging -------------------------------------------------------------------------

// The record the host stores. `last` and `net` are left out on purpose: they belong to the move, the
// way the forge's chip does
function save(st) {
  const pos = {};
  for (const code of CODES) {
    const p = st.pos[code];
    if (p) pos[code] = { amount: p.amount, entryTicks: p.entryTicks, at: p.at };
  }
  const rec = { pos, by: st.by };
  for (const k of REC_FIELDS) rec[k] = st[k];
  return rec;
}

// A stored record, field by field, or null for a player who has never traded. Only these fields
// travel, and the record is rebuilt rather than copied, so a "__proto__" in the stored JSON cannot
// ride along. The host calls this at the storage boundary, the way credits.js calls cleanForge
function clean(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const out = { pos: {}, by: REPLICA_RE.test(rec.by) ? rec.by : '' };
  for (const k of REC_FIELDS) {
    const n = rec[k];
    out[k] = (Number.isSafeInteger(n) && n > 0 && n <= REC_CEIL[k]) ? n : 0;
  }
  const src = (rec.pos && typeof rec.pos === 'object') ? rec.pos : {};
  for (const code of CODES) {
    const p = src[code];
    if (!p || typeof p !== 'object') continue;
    const row = rowOf(code);
    const amount = p.amount, entryTicks = p.entryTicks, at = p.at;
    if (!Number.isSafeInteger(amount) || amount < MIN_BUY || amount > MAX_BUY) continue;
    // the price has to be one THIS coin can reach, not one some coin can: a position bought at a
    // tick outside its own band is a position the market never sold, and its sale would pay a ratio
    // the band says is impossible
    if (!Number.isSafeInteger(entryTicks) || entryTicks < row.floorTicks || entryTicks > row.capTicks) continue;
    out.pos[code] = { amount, entryTicks, at: (Number.isSafeInteger(at) && at > 0 && at <= MAX_AT) ? at : 0 };
  }
  // a wallet cannot have moved before its own positions were opened
  for (const code of CODES) {
    const p = out.pos[code];
    if (p && p.at > out.at) out.at = p.at;
  }
  return out;
}

// A record back into a wallet. Everything that can be wrong with a record is wrong here rather than
// thrown: a missing one is a player who has never traded.
//
// Everything comes through clean(), `by` included. forge.js carries `by` through its load as an
// opaque string, and that is right THERE because credits.js's cleanForge is the boundary and has
// already held it to the shape. Here clean() is the boundary, so taking the raw one back would undo
// the check: a stored `by` outside the shape would be written back out by save(), come in as '' on
// the next read, and kept() would then answer false for every move this window ever makes
function load(rec) {
  const c = clean(rec);
  if (!c) return freshWallet('');
  const st = freshWallet(c.by);
  for (const k of REC_FIELDS) st[k] = c[k];
  st.pos = c.pos;
  return st;
}

// Is `inc` the later of two wallets? More moves is later, full stop: a move only ever adds one and
// never takes it back, so this is a clock that cannot run backwards. A tie goes to the larger writer
// id, which is random per activation and so favours neither window and neither outcome.
// (moves, by) names a record on its own under any play, because a window makes exactly one record
// per move count. The last two comparisons only ever separate two records a hand-edited store put
// under the same pair, and they are here so the merge settles on one instead of two windows writing
// each other's copy back and forth forever. Same shape as credits.js's forgeNewer
function newer(inc, cur) {
  if (!inc) return false;
  if (!cur) return true;
  if (inc.moves !== cur.moves) return inc.moves > cur.moves;
  if (inc.by !== cur.by) return inc.by > cur.by;
  if (inc.trades !== cur.trades) return inc.trades > cur.trades;
  return inc.staked > cur.staked;
}

// Are two records the same record? The host needs this to decide whether a merge changed anything
// and so whether there is a write to make at all (credits.js's mergeLedger asks sameForge exactly
// that question of the sword). It is exported for that reason and used nowhere in this file
function same(a, b) {
  if (!a || !b) return a === b;
  if (a.by !== b.by) return false;
  for (const k of REC_FIELDS) if (a[k] !== b[k]) return false;
  for (const code of CODES) {
    const x = a.pos[code], y = b.pos[code];
    if (!x !== !y) return false;
    if (x && (x.amount !== y.amount || x.entryTicks !== y.entryTicks || x.at !== y.at)) return false;
  }
  return true;
}

// The later record, whole. Nothing is lifted out of the loser (see the note, section 7), so this is
// a pick and a copy: merging the result again with either input gives the result back, and the two
// orders of the same pair give the same answer.
// The positions are copied one by one rather than with the object: the result must not share a
// position with a record the host still holds, or a later move would reach back into storage's copy
function merge(cur, inc) {
  if (!inc) return cur || null;
  const win = newer(inc, cur) ? inc : cur;
  const pos = {};
  for (const code of CODES) if (win.pos[code]) pos[code] = Object.assign({}, win.pos[code]);
  const out = Object.assign({}, win, { pos });
  for (const k of MAX_FIELDS) {
    if (cur && cur[k] > out[k]) out[k] = cur[k];
    if (inc[k] > out[k]) out[k] = inc[k];
  }
  return out;
}

// Did the record THIS window wrote survive the merge? The host writes, reads the merged record back,
// and asks this before it lets the move stand. The pair is (moves, by) and nothing else: a window
// writes exactly one record per move count, so that pair is the record's name. Comparing `earned`
// would answer a different question (whether the money matches), and comparing the whole record
// would answer no when the merge had merely raised a lifetime figure.
// This is the fgSettle pattern (extension.js). It is here so the host does not rederive it, and so
// the rule and the merge that has to agree with it live in one file
function kept(mine, landed) {
  return !!mine && !!landed && landed.moves === mine.moves && landed.by === mine.by;
}

// What the market has done to the balance. The host adds this, the way it adds forgeEarned: it can
// go DOWN, once, when a collision drops a trade, and that is the trade not having happened
function netOf(rec) {
  return rec ? rec.earned - rec.staked : 0;
}

// --- what the webview sees ----------------------------------------------------------------------

// Candle shape. Three hours at five minutes is what a panel can show without a scroll bar and
// enough of a line to see a shape in, and it is what the panel asks for too (games/market/meta.js
// hands this same pair in). A thirty minute window was tried and is a straight line: the median
// high-to-low of thirty one-minute candles is 0.28% on the calmest coin, against 0.75% over three
// hours. A five minute step also means WICK_SAMPLES has something to sample, so the candles have
// wicks; at one minute a step the high and low ARE the open and close and every wick is empty
const VIEW_STEP_MS = 5 * MS_PER_MIN;
const VIEW_COUNT = 36;

// Per ten thousand, as an integer, so the screen prints a percent without dividing. Ten thousandths
// rather than hundredths because the calm coin moves 0.1% in an hour and a percent would read zero
function bpOf(now, then) {
  if (!then) return 0;
  return Math.round(((now - then) * 10000) / then);
}

// One coin, as the screen needs it. Everything the screen could have worked out is worked out here:
// the payout already has the fee in it, the profit is a subtraction already done, and the move is in
// ten-thousandths. A screen that multiplies is a screen that will one day disagree with the host
function coinView(st, row, nowMs, shape, budget, late) {
  const rows = candles(row.code, { toMs: nowMs, stepMs: shape.stepMs, count: shape.count });
  const ticks = priceOn(row, nowMs);
  const first = rows[0];
  const held = st ? st.pos[row.code] : null;
  const out = {
    code: row.code, name: row.name, grade: row.grade, volBp: row.volBp,
    base: row.base, baseTicks: row.baseTicks,
    floorTicks: row.floorTicks, capTicks: row.capTicks,
    ticks,
    openTicks: first.o,
    chgBp: bpOf(ticks, first.o),
    baseBp: bpOf(ticks, row.baseTicks),
    candles: rows,
    position: null,
    can: { buy: false, sell: false },
    why: { buy: 'there is no wallet', sell: 'there is no wallet' }
  };
  if (!st) return out;
  if (held) {
    const payout = payoutOf(held.amount, held.entryTicks, ticks);
    out.position = {
      amount: held.amount,
      entryTicks: held.entryTicks,
      at: held.at,
      heldMs: Math.max(0, nowMs - held.at),
      gross: grossOf(held.amount, held.entryTicks, ticks),
      payout,
      pl: payout - held.amount,
      plBp: bpOf(payout, held.amount),
      moveBp: bpOf(ticks, held.entryTicks)
    };
  }
  // `can.buy` is about the smallest buy there is: the screen greys the coin out when even the
  // minimum is refused, and prices the amount it is actually offering off minBuy/maxBuy/free.
  // `late` is the clock's own refusal, folded in so that `can` is exactly what whyNot allows: a
  // button the screen offers and a move the host accepts have to be the same set, or the player
  // presses something and is told no
  out.why = {
    buy: cannotBuy(st, row.code, MIN_BUY, budget) || late,
    sell: cannotSell(st, row.code) || late
  };
  out.can = { buy: !out.why.buy, sell: !out.why.sell };
  return out;
}

function idleView(nowMs, shape) {
  return view(null, 0, nowMs, shape);
}

// Everything the screen may see, and everything it needs. There is nothing face down in this game,
// and nothing derived that could leak one: the prices handed over are the prices of minutes that
// have happened, and the function that makes them does not go to the webview (the note, section 5)
function view(st, budget, nowMs, shape) {
  const s = shape || {};
  const form = {
    stepMs: Number.isFinite(s.stepMs) && s.stepMs >= MS_PER_MIN ? s.stepMs : VIEW_STEP_MS,
    count: Number.isSafeInteger(s.count) && s.count > 0 ? s.count : VIEW_COUNT
  };
  const at = Number.isSafeInteger(nowMs) ? nowMs : clock();
  const late = st ? badTime(st, at) : null;
  const coins = ROWS.map((r) => coinView(st, r, at, form, budget, late));
  let staked = 0, worth = 0;
  for (const c of coins) {
    if (!c.position) continue;
    staked += c.position.amount;
    worth += c.position.payout;
  }
  return {
    nowMs: at,
    minBuy: MIN_BUY,
    maxBuy: MAX_BUY,
    feeBp: (FEE_DEN - FEE_NUM) * (10000 / FEE_DEN),
    bandX: BAND_X,
    coins,
    holding: st ? heldCount(st) : 0,
    held: staked,
    heldPayout: worth,
    heldPl: worth - staked,
    trades: st ? st.trades : 0,
    staked: st ? st.staked : 0,
    earned: st ? st.earned : 0,
    best: st ? st.best : 0,
    last: st ? st.last : null,
    net: st ? st.net : null
  };
}

module.exports = {
  // the price
  priceAt, candles, TICKERS, CODES,
  // the game
  newWallet, act, whyNot, view, idleView, payoutOf, grossOf,
  // storage
  save, load, clean, newer, merge, same, kept, netOf, REC_FIELDS, MAX_FIELDS,
  // constants a host or a test reads
  OPS, MIN_BUY, MAX_BUY, TICKS_PER_CREDIT, FEE_NUM, FEE_DEN,
  EPOCH_MS, MS_PER_MIN, MIN_PER_DAY, LEVELS, MAX_MINUTE,
  BAND, SPAN, HARD, BAND_X, DRIFT, FAIR_DRIFT, BEND_GUARD, ALIVE_DAYS, ALIVE_FRACTION,
  squash, liveliness,
  // Test only, and nothing outside test/market.test.js may reach in here. `setClock` is in it
  // because it can switch off the refusal that keeps the future out of reach, and `lane` because a
  // strategy has to be measured over separate markets: trips cut from one history are not
  // independent of each other, and an error bar read off them as if they were is a fiction
  _test: {
    lane(code, k) {
      const r = rowOf(code);
      if (!r) throw new RangeError('no such coin: ' + code);
      return buildRow(r.code, r.name, r.grade, r.base, r.volBp, r.code + '#' + k);
    },
    // throws the descent cache away, so the next price is computed the cold way
    chill(row) { row.path.length = 0; row.depth = 0; },
    setClock, priceOn, logDevAt, minuteOf, sumAt, nodeZ, probit, rowOf
  }
};
