// The crab's plinko board: a bead dropped through twelve rows of pins into one of thirteen cups.
// Pure: knows nothing about vscode or credits.
//
// Rules (fixed, kept simple):
//  - the bead takes twelve bounces. Each one sends it left or right with the same chance, so the
//    cup it lands in is the number of rights: Binomial(12, 1/2), and the thirteen cups come up
//    1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1 times in 4096
//  - each cup is worth a multiple of the bet, and which multiples depends on the risk the player
//    picked: mild, medium or spicy (see RISKS)
//  - that is the whole game. A drop is one press and settles on the press
//
// Money: THIS IS THE ONE GAME IN THE CASINO WHOSE MULTIPLES ARE NOT WHOLE NUMBERS, and the reason
// is the shape of the board rather than taste: five of the thirteen cups hold 85% of the drops, so
// the middle of the board is what sets the return. Every cup at one times the bet returns exactly
// 100%, and the next whole number down is zero, which is a board nobody would drop a bead onto. So
// a cup is a whole number of TENTHS of the bet (DEN below), which is the coarsest denominator that
// can put a cup at 0.9 and still land the whole board inside the 96-97% band.
//
// A payout is therefore computed the way high-low's is: one integer product, then an integer
// division, and never a float anywhere near the money (see payOf). The remainder stays with the
// house, which is the only direction it may go: rounding a payout up would make the smallest bets
// worth more than they stake and the board farmable at the minimum. At the minimum bet of 10 and
// every multiple of it, nothing is lost to the division at all, so a player betting in chips sees
// the posted multiple exactly.
//
// Which is why there are two kinds of multiple here and they must not be confused:
//  - `nums` is the money: whole tenths, and the only thing payOf reads
//  - `mults` is for printing: nums over ten, as a number, and the result chip does not use it
// The chip's own multiple is read BACK off the credits paid (`mult` in the view, pay over bet), so
// what the screen prints is what the balance moved by and not what the table promised. The two
// differ whenever a bet is not a multiple of ten, and a screen that printed the posted figure would
// be showing a payout nobody received.
//
// A drop settles inside newRound(), which is the shape of the game rather than a shortcut: the
// press IS the bet, there is no decision between the press and the cup. See slots.js for the three
// consequences that come with that (nothing face down, nothing riding, settles exactly once); they
// hold here for the same reason, and OPS is empty here for the same reason.
//
// WHAT THE HOST HAS TO DO, and it is more than the slot machine needs:
//  - `livePhase` in the table spec must name a phase this engine NEVER enters ('drop' will do). It
//    must not be 'done', or the driver would refuse every drop after the first (see slots.js)
//  - THE RISK HAS TO REACH newRound, AND THE DRIVER AS IT STANDS HAS NO ROUTE FOR IT.
//    games/tables.js reads `m.bet` off the deal message and hands `start()` nothing else, so a
//    `risk` on that message is dropped on the floor. This game therefore needs either a way for
//    the deal to carry an argument or its own handler (games/forge/meta.js is the example)
//  - and the host must call badRisk() on that argument BEFORE dealing. newRound throws a RangeError
//    on an unknown risk, which is the right answer to a programmer error and the wrong one to a
//    message off the wire: nothing in the driver catches it, so the webview would get no reply at
//    all and sit out its four second timeout. A refusal sentence is what that case wants
//
// Determinism: the same seed always walks the same twelve bounces. The seed is a roll stream
// (cards.js rollsFrom), never a shuffle, and the drop id is a separate value.
//
// State is internal; `view()` makes what the webview may see, all three risk tables and the cup
// odds included, so the screen holds no multiple and no probability of its own. `path` is in it so
// the screen drops the bead down the pins the bead really took, rather than animating a fall that
// ends up somewhere else.

const C = require('./cards');

// The smallest bet the game takes. The host's table spec reads this, so the floor is one number in
// one place rather than one per game screen
const MIN_BET = 10;

const ROWS = 12;
const BINS = ROWS + 1;

// A cup is a whole number of tenths of the bet: see the money note at the top of the file
const DEN = 10;

// No action exists inside a drop: see the note at the top of the file
const OPS = [];

// The band every game in this casino returns inside, as whole percents. Checked against all three
// risk tables when the module loads, so a retuned cup cannot leave the band without the game
// refusing to start
const BAND_LO = 96;
const BAND_HI = 97;

// How many of the 4096 paths end in each cup: Pascal's row for twelve bounces. Built rather than
// written out, because a hand-typed binomial row is a typo waiting to be a paytable
const WAYS = Object.freeze((function () {
  let row = [1];
  for (let r = 1; r <= ROWS; r++) {
    const next = [1];
    for (let k = 1; k < r; k++) next.push(row[k - 1] + row[k]);
    next.push(1);
    row = next;
  }
  return row;
})());
const PATHS = WAYS.reduce((a, b) => a + b, 0);   // 2^ROWS

// The three boards, in the order the screen offers them. `nums` is one entry per cup, left to
// right, in tenths of the bet.
//
// Where the numbers come from (test/plinko.test.js prints every cup's chance and its share of the
// return, for all three):
//  - the middle cup comes up 924 times in 4096 and the five middle cups 3498 times, so the middle
//    is the return. The edges are 1 in 4096 each and can be made enormous without moving it much,
//    which is the whole lever this game has
//  - mild is a board that barely moves the balance: the worst cup is 0.9 and the best is 2.5, so a
//    player can sit on it for a long time. 61% of drops lose a tenth of the bet
//  - medium drops the middle to 0.5 and pays 35 at the edges: the five middle cups now cost
//    something and the 1 in 4096 is worth looking at
//  - spicy pays NOTHING in the middle cup and 680 at the edges. 85% of drops come back with half
//    the bet or less, and the board is carried by cups the bead reaches once in a few hundred drops
//  - all three are solved to the same band. Mild 96.34%, medium 96.30%, spicy 96.38%, and the
//    module refuses to load if any of them drifts out
//
// `mults` on each table is the tenths as a number, FOR PRINTING ONLY. It is filled in below rather
// than typed out, so it cannot disagree with `nums`, and it is deliberately not what payOf reads:
// see the money note at the top of the file
const RISKS = Object.freeze((function () {
  const boards = [
    { key: 'mild', label: 'Mild', nums: [25, 16, 13, 11, 10, 9, 9, 9, 10, 11, 13, 16, 25] },
    { key: 'medium', label: 'Medium', nums: [350, 100, 26, 13, 10, 8, 5, 8, 10, 13, 26, 100, 350] },
    { key: 'spicy', label: 'Spicy', nums: [6800, 300, 40, 12, 5, 2, 0, 2, 5, 12, 40, 300, 6800] }
  ];
  const out = {};
  for (const b of boards) {
    out[b.key] = Object.freeze({
      key: b.key,
      label: b.label,
      nums: Object.freeze(b.nums.slice()),
      mults: Object.freeze(b.nums.map((n) => n / DEN))
    });
  }
  return out;
})());

const RISK_KEYS = Object.freeze(Object.keys(RISKS));

// The tables are the whole game, so a typo in one is the whole game being wrong. Checked once, when
// the module loads, the way forge.js checks its ladder. The return is the part worth checking here:
// it is an exact fraction of whole numbers (cups times tenths over paths times ten), so it is
// compared as integers and the band is a property of the module rather than of a test run
(function checkTables() {
  if (WAYS.length !== BINS) throw new Error('plinko: ' + ROWS + ' rows make ' + BINS + ' cups');
  if (OPS.length) throw new Error('plinko: a drop takes no actions, so OPS must stay empty');
  if (PATHS !== 2 ** ROWS) throw new Error('plinko: the cups do not add up to every path');
  for (const key of RISK_KEYS) {
    const nums = RISKS[key].nums;
    if (nums.length !== BINS) throw new Error('plinko: ' + key + ' needs a cup per column');
    for (const n of nums) {
      if (!Number.isSafeInteger(n) || n < 0) throw new Error('plinko: bad cup in ' + key + ': ' + n);
    }
    // the board is symmetric, because the bead's walk is: a cup that paid more on one side than the
    // other would be a board where the player hopes for a direction
    for (let k = 0; k < BINS; k++) {
      if (nums[k] !== nums[BINS - 1 - k]) throw new Error('plinko: ' + key + ' is not symmetric at cup ' + k);
    }
    // and the edge has to be the best cup, or the board is not a plinko board
    for (let k = 1; k <= ROWS / 2; k++) {
      if (nums[k] > nums[k - 1]) throw new Error('plinko: ' + key + ' climbs towards the middle at cup ' + k);
    }
    let gross = 0;
    for (let k = 0; k < BINS; k++) gross += WAYS[k] * nums[k];
    // 100 * gross / (PATHS * DEN) is the return in percent, all of it whole numbers
    if (100 * gross < BAND_LO * PATHS * DEN || 100 * gross > BAND_HI * PATHS * DEN) {
      throw new Error('plinko: ' + key + ' returns ' + (gross / (PATHS * DEN) * 100).toFixed(2) + '%, outside the band');
    }
  }
})();

// --- the drop ---------------------------------------------------------------------------

// The twelve bounces a seed walks, as 0 for left and 1 for right. Exported so a test can walk every
// path there is and so a test can search for the seed that lands in a given cup. The host makes a
// fresh seed per drop and never hands it over before the drop
function pathOf(seed) {
  const roll = C.rollsFrom(seed);
  const out = [];
  // the stream is uniform on [0, 1), so the half it falls in is one fair bounce
  for (let i = 0; i < ROWS; i++) out.push(roll() < 0.5 ? 0 : 1);
  return out;
}

// Which cup a walk ends in: the number of rights, which is what makes the cups binomial
function binOf(path) {
  if (!Array.isArray(path) || path.length !== ROWS) throw new RangeError('a drop is ' + ROWS + ' bounces');
  let bin = 0;
  for (const step of path) {
    if (step !== 0 && step !== 1) throw new RangeError('a bounce is 0 or 1, not ' + step);
    bin += step;
  }
  return bin;
}

// What a cup pays, in credits. One integer product and one integer division, so there is no
// floating point in the money path at all and no rounding behaviour to argue about: `rest` is what
// the tenths do not divide evenly into, and it stays with the house.
// The bet is capped at newRound so `bet * num` is still an exact integer here
function payOf(bet, num) {
  const total = bet * num;
  const rest = total % DEN;
  return (total - rest) / DEN;
}

// The biggest numerator on any board, which is what a bet has to be small enough to multiply by
const TOP_NUM = RISK_KEYS.reduce((top, key) => Math.max(top, ...RISKS[key].nums), 0);

// --- state -----------------------------------------------------------------------------

// Why `risk` is not a board, or null. The risk arrives with the bet, so the host checks it with
// this before dealing: an unknown key must be refused and never quietly defaulted, because a
// default would be a typo silently changing which paytable the player was paid off
function badRisk(risk) {
  return (typeof risk === 'string' && Object.prototype.hasOwnProperty.call(RISKS, risk))
    ? null
    : 'pick a risk: ' + RISK_KEYS.join(', ');
}

// seed: any string (a fresh one per drop). id: the drop's public name, which must not be the seed
// (null if not given). risk: one of RISK_KEYS. path: an explicit walk instead of the seeded one,
// for tests and replays, the way poker.js takes a stacked deck
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the money note promises (one exact integer product) only holds while the biggest cup's
  // product is still a safe integer. The host caps a bet at the balance long before this, so the
  // check is the promise made structural rather than a case anyone meets
  if (bet > Number.MAX_SAFE_INTEGER / TOP_NUM) throw new RangeError('bet is too large to pay the top cup exactly');
  const bad = badRisk(opts.risk);
  if (bad) throw new RangeError(bad);
  const seed = String(opts.seed == null ? '' : opts.seed);
  const path = opts.path ? opts.path.slice() : pathOf(seed);
  const bin = binOf(path);
  const num = RISKS[opts.risk].nums[bin];
  const pay = payOf(bet, num);
  return {
    id: opts.id == null ? null : String(opts.id),
    seed,
    // a drop settles on the press, so a round is born done and there is no other phase to be in
    phase: 'done',
    bet,
    risk: opts.risk,
    path,
    bin,
    num,
    pay,
    net: pay - bet
  };
}

// What a live round has riding on it, for the other games' budgets (games/tables.js). A drop settles
// on the press, so there is never a live round and the answer is always nothing
function stake(st) {
  return 0;
}

// Why `op` cannot be played now. There is no action inside a drop, so the answer is always the same
// one, and it is the answer the host needs: a webview asking for something this game does not have
// has to be told, or it waits out its no-reply timeout.
// budget is not read: the only money decision is the bet, and the host cleared that before the drop
function whyNot(st, op, budget) {
  return 'a drop settles on the press, so there is nothing to play';
}

// Nothing can be played on a drop, so this gives back the very same object every time. It is the
// contract's shape rather than a branch: see the note at the top of the file
function act(st, op) {
  return st;
}

// --- what the webview sees ----------------------------------------------------------------------

// `risks` is all three boards, not one: the screen prints the table the player is about to drop
// onto and the two they could switch to, and holds no multiple of its own. `ways` and `paths` are
// the cup odds, so the screen can print "1 in 4096" without a binomial of its own
function idleView() {
  return {
    phase: 'bet', id: null, bet: null, risk: null,
    path: [], bin: null, pay: null, mult: null, net: null,
    risks: RISKS, riskKeys: RISK_KEYS, ways: WAYS, paths: PATHS,
    rows: ROWS, bins: BINS, den: DEN, minBet: MIN_BET,
    can: {}
  };
}

// Everything here is face up. A round exists only after it has settled, so there is no bounce left
// to hide and no live phase to keep the seed out of: the seed is handed over because the drop it
// names is already over and the next drop rolls a fresh one of its own.
//
// `path` is the twelve bounces the bead took, so the screen drops it down the real pins. `bin` is
// where it ended, `pay` is the credits that were paid and `mult` is that payout read back as a
// multiple of the bet: a number for printing, derived from the money rather than from the table, so
// the figure on the chip is the one the balance moved by. `net` is pay minus bet.
//
// The seed is handed over under a phase test rather than unconditionally. As the game stands the
// test is always true: what it does is keep the rule (games/README.md section 6: a seed only at
// 'done') as the SHAPE of the function instead of as a property of there being one phase. This game
// is the likeliest of the three to grow a phase, since a bead takes a second to fall and a future
// version might hold the round open while it does, and then this line is already right
function view(st, budget) {
  if (!st) return idleView();
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    risk: st.risk,
    path: st.path.slice(),
    bin: st.bin,
    pay: st.pay,
    mult: st.pay / st.bet,
    net: st.net,
    risks: RISKS,
    riskKeys: RISK_KEYS,
    ways: WAYS,
    paths: PATHS,
    rows: ROWS,
    bins: BINS,
    den: DEN,
    minBet: MIN_BET,
    can: {}
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  pathOf, binOf, payOf, badRisk,
  RISKS, RISK_KEYS, WAYS, PATHS, OPS, MIN_BET, ROWS, BINS, DEN, TOP_NUM, BAND_LO, BAND_HI
};
