// The crab's scratch card: nine squares, three in a row by three. Pure: knows nothing about vscode
// or credits.
//
// Rules (fixed, kept simple):
//  - buying a card deals nine symbols, one per square, each drawn on its own from the bag below
//  - the player rubs the squares off one at a time, or rubs the rest off in one press
//  - once all nine are showing, three or more of one symbol pays that symbol's row. More copies pay
//    more: the rows are 3, 4, 5 and 6-or-more (see PAYS)
//  - if two symbols both reach three, the better-paying one is the prize. Nothing is paid twice
//
// What makes it a lottery ticket rather than a game of skill: THE NINE SYMBOLS ARE DEALT WHEN THE
// CARD IS BOUGHT. `scratch` turns a square face up and does nothing else, so the order the squares
// are rubbed off in cannot change what is under them, and a player who presses "rub the rest off"
// gets exactly the card they would have got square by square. Everything about the result is fixed
// by the seed at newRound(); the moves after it only decide how much of it is on screen.
//
// That is also why view() is written as a function of the SHOWN squares and nothing else. The state
// holds all nine symbols from the start, and handing an unrubbed one to the screen would be the
// same leak as sending blackjack's hole card: the screen would be holding the answer. The test
// deals two cards that agree on the squares already rubbed off and differ underneath, and asserts
// the two views are identical, which is a stronger statement than walking the view for symbols.
//
// Why there is no early settlement, and a "rub the rest off" instead: the prize depends on how many
// copies are among all nine, so three crabs showing is not a prize yet (a fourth crab pays 15 times
// as much, and a rarer symbol reaching three would outrank it). A figure shown before the last
// square would therefore be either a guess or a peek at what is still face down.
//
// There IS a card where eight squares already fix the answer, and it is worth knowing which way it
// points before building a branch for it. With one square left the answer is fixed on 1 card in 65,
// and of those: 1 in 67 are fixed at NOTHING and only 1 in 2,298 at a prize (six or more of one
// symbol, where the row is already at its top and a seventh copy cannot raise it).
// test/scratch.test.js expands the eight-square tallies and prints all three figures. So an early
// settlement would exist almost entirely to tell a player, with one square still to rub, that they
// have already lost. That is the branch, not a kindness.
//
// The one honest shortcut is to stop rubbing one square at a time, which is what `reveal` is: it
// turns over everything that is left and settles, in one message.
//
// Money: the payout is `bet * the row's multiplier` (zero on a card that misses) and
// `net = that - bet`, set once, on the move that turns the ninth square over. Every multiplier is a
// whole number, so the payout is one integer product: nothing is rounded and no float touches the
// money path. A three-of-a-kind row is a multiplier of 1, which hands the bet straight back for a
// net of zero. The screen is told the net, so it can say the bet came back rather than calling a
// push a win. Until the card settles, `net` is null and the bet is what the card has riding on it
// (stake), because a card is live across several messages, unlike a spin of the slots.
//
// Determinism: the same seed always deals the same nine squares. The seed is a roll stream
// (cards.js rollsFrom), never a shuffle, and the card id is a separate value: a view that carried
// the id as its seed would be a view that re-deals the card. The seed is handed over at 'done' and
// never before, which is the whole of keeping a card face down.
//
// The op contract the screen is written against:
//   act(st, { op: 'scratch', cell })   cell 0..8, counting left to right then down
//   act(st, { op: 'reveal' })
// `act()` never mutates its input and returns the very same object when the move is not allowed;
// `whyNot()` says why. `view()` makes what the webview may see, PAYS included, so the screen holds
// no multiplier of its own.

const C = require('./cards');

// The smallest bet the game takes. The host's table spec reads this, so the floor is one number in
// one place rather than one per game screen
const MIN_BET = 10;

const CELLS = 9;
const SIDE = 3;
const OPS = ['scratch', 'reveal'];

// How many copies a symbol needs before it pays anything, and the count its row stops climbing at
const MIN_MATCH = 3;
const TOP_MATCH = 6;

// The paytable, rarest symbol first, and the order the screen prints it in.
//
// `weight` is how many of the bag's BAG_SIZE slots hold this symbol, so a square is this symbol
// exactly weight/BAG_SIZE of the time. `mult` is the row: what three, four, five and six-or-more
// copies pay.
//
// Where the numbers come from (test/scratch.test.js expands the whole multinomial in BigInt and
// prints the exact figure, card by card):
//  - nine squares over ten symbols triple something more than half the time. That is arithmetic,
//    not a choice: 52.39% of cards hold three of something. So the three-copy row cannot pay more
//    than the bet back for anybody. Paying even twice the bet on three copies would return 105% of
//    everything staked before a single four-copy card was paid at all
//  - which is why the row for three is a flat 1 for every symbol, and the game's actual ladder
//    starts at four copies. The screen should say so: "three alike and the bet comes back"
//  - the ladder is then the symbol's rarity. Symbols that share a weight share a row, so the table
//    is five rows for ten symbols and a player can read it: rarer symbol, bigger prize, always
//  - the figures are solved against the 96-97% band the forge, poker, blackjack and high-low all
//    sit in, and come to 96.55%
//  - the spread: a card pays something once in 1.9, the bet comes back on 42% of all cards, and
//    the biggest row (six crabs, 1000 times the bet) is 0.3% of the return. A player who never
//    sees it is returned 96.3%
const PAYS = Object.freeze([
  { sym: 'crab', weight: 3, mult: Object.freeze([1, 15, 100, 1000]) },
  { sym: 'pearl', weight: 4, mult: Object.freeze([1, 8, 50, 300]) },
  { sym: 'anchor', weight: 4, mult: Object.freeze([1, 8, 50, 300]) },
  { sym: 'starfish', weight: 5, mult: Object.freeze([1, 4, 20, 130]) },
  { sym: 'urchin', weight: 5, mult: Object.freeze([1, 4, 20, 130]) },
  { sym: 'jellyfish', weight: 5, mult: Object.freeze([1, 4, 20, 130]) },
  { sym: 'bottle', weight: 6, mult: Object.freeze([1, 3, 13, 70]) },
  { sym: 'coral', weight: 6, mult: Object.freeze([1, 3, 13, 70]) },
  { sym: 'shell', weight: 7, mult: Object.freeze([1, 2, 9, 45]) },
  { sym: 'kelp', weight: 7, mult: Object.freeze([1, 2, 9, 45]) }
].map((r) => Object.freeze(r)));

// The row nothing is paid for. It is still handed over at 'done' so the result chip reads the same
// way whatever happened: a symbol (none), a count, a multiplier and a net
const NO_WIN = Object.freeze({ sym: null, count: 0, mult: 0, cells: Object.freeze([]) });

const SYMBOLS = Object.freeze(PAYS.map((r) => r.sym));
const ROW = Object.freeze(PAYS.reduce((m, r) => { m[r.sym] = r; return m; }, {}));
// Where a symbol sits in the table, which is the rarity order. Used to settle a tie between two
// rows that pay the same
const RANK = Object.freeze(PAYS.reduce((m, r, i) => { m[r.sym] = i; return m; }, {}));

// The bag a square is drawn from: one slot per unit of weight, so a draw is an even pick over
// BAG_SIZE and a symbol's chance is its weight over that. Generated rather than written out,
// unlike the slot machine's rings: nothing here shows a square's neighbours, so the order of the
// bag is not something the player can see and there is nothing to arrange it for
const BAG = Object.freeze(PAYS.reduce((bag, r) => {
  for (let i = 0; i < r.weight; i++) bag.push(r.sym);
  return bag;
}, []));
const BAG_SIZE = BAG.length;

// Whether `row` pays more than `rarer` at any count: the rule the table is printed in order by, out
// here rather than inside the loop below so the check reads as the rule and not as a nest
function outpaysRarer(row, rarer) {
  for (let k = 0; k < row.mult.length; k++) if (row.mult[k] > rarer.mult[k]) return true;
  return false;
}

// The table is the whole game, so a typo in it is the whole game being wrong. Checked once, when
// the module loads, the way forge.js checks its ladder.
//
// What is NOT checked here is the return. The slot machine and the plinko board both check their
// band when they load, because both have a closed form: this one does not. The return of this table
// is a sum over 48,620 tallies and takes 50ms to expand, which is 50ms of every activation of the
// extension to re-prove a constant. It is proved in test/scratch.test.js instead, exactly, and that
// test is in the gate (package.json). Retuning a row here without running it is how the band moves
// without anyone seeing
(function checkTable() {
  if (PAYS.length < 2) throw new Error('scratch: a paytable needs rows');
  for (let i = 0; i < PAYS.length; i++) {
    const r = PAYS[i];
    if (!Number.isSafeInteger(r.weight) || r.weight < 1) throw new Error('scratch: bad weight for ' + r.sym);
    if (r.mult.length !== TOP_MATCH - MIN_MATCH + 1) throw new Error('scratch: ' + r.sym + ' needs a row per count');
    for (const m of r.mult) if (!Number.isSafeInteger(m) || m < 1) throw new Error('scratch: bad pay for ' + r.sym);
    // more copies cannot pay less, or a player would be hoping not to find another one
    for (let k = 1; k < r.mult.length; k++) {
      if (r.mult[k] <= r.mult[k - 1]) throw new Error('scratch: ' + r.sym + ' does not climb at ' + (MIN_MATCH + k));
    }
    // the table is printed rarest first, and a commoner symbol that paid more would make the order
    // a lie as well as making the rarer row pointless
    if (i > 0 && r.weight < PAYS[i - 1].weight) throw new Error('scratch: the weights do not climb at ' + r.sym);
    if (i > 0 && outpaysRarer(r, PAYS[i - 1])) throw new Error('scratch: ' + r.sym + ' outpays a rarer symbol');
  }
  // three of a kind has to be the bet coming back and no more: see the note above PAYS
  for (const r of PAYS) if (r.mult[0] !== 1) throw new Error('scratch: three alike pays the bet back, nothing else');
  if (CELLS !== SIDE * SIDE) throw new Error('scratch: the card is ' + SIDE + ' by ' + SIDE);
  // The symbols are the table's keys and its tie-break order at the same time, so a name appearing
  // twice would be one row shadowing another and a tie with no answer
  if (new Set(PAYS.map((r) => r.sym)).size !== PAYS.length) throw new Error('scratch: a symbol is in the table twice');
})();

// --- the deal ---------------------------------------------------------------------------

// The nine squares a seed deals, each drawn on its own. Exported so a test can search for the seed
// that deals a particular card, the way the card tests search a seed for a deal
function dealOf(seed) {
  const roll = C.rollsFrom(seed);
  const out = [];
  for (let i = 0; i < CELLS; i++) out.push(BAG[Math.floor(roll() * BAG_SIZE)]);
  return out;
}

// What a full card pays, as a row the screen can print: the symbol, how many copies, the multiplier
// and which squares hold them. Takes the nine symbols, so the ranking can be run over cards a test
// built by hand as well as cards a seed dealt.
//
// Two symbols can both reach three (three shells and three kelp, say), and the prize is the
// better-paying one. When two rows pay the same the chip still has to name ONE symbol, so the tie
// goes to the bigger pile and then to the rarer symbol: both are things the player can see, and a
// rule that depended on the order the squares were rubbed off in would make the prize depend on the
// scratching after all
function winOf(cells) {
  if (!Array.isArray(cells) || cells.length !== CELLS) throw new RangeError('a card is ' + CELLS + ' squares');
  const where = new Map();
  for (let i = 0; i < CELLS; i++) {
    const sym = cells[i];
    if (!ROW[sym]) throw new RangeError('no such symbol: ' + sym);
    if (!where.has(sym)) where.set(sym, []);
    where.get(sym).push(i);
  }
  let best = NO_WIN;
  for (const [sym, idx] of where) {
    if (idx.length < MIN_MATCH) continue;
    const count = idx.length;
    const mult = ROW[sym].mult[Math.min(count, TOP_MATCH) - MIN_MATCH];
    const better = mult !== best.mult ? mult > best.mult
      : count !== best.count ? count > best.count
        : RANK[sym] < RANK[best.sym];
    if (better) best = Object.freeze({ sym, count, mult, cells: Object.freeze(idx.slice()) });
  }
  return best;
}

// --- state -----------------------------------------------------------------------------

function clone(st) {
  return Object.assign({}, st, { shown: st.shown.slice() });
}

function live(st) {
  return !!st && st.phase === 'scratch';
}

// seed: any string (a fresh one per card). id: the card's public name, which must not be the seed
// (null if not given). cells: an explicit nine symbols instead of the seeded deal, for tests and
// replays, the way poker.js takes a stacked deck
function newRound(opts) {
  const bet = opts.bet;
  if (!Number.isSafeInteger(bet) || bet < 1) throw new RangeError('bet must be a positive integer');
  // What the header promises (one integer product, nothing rounded) only holds while the top row's
  // payout is still a safe integer. The host caps a bet at the balance long before this, so the
  // check is the promise made structural rather than a case anyone meets
  const top = PAYS[0].mult[PAYS[0].mult.length - 1];
  if (bet > Number.MAX_SAFE_INTEGER / top) throw new RangeError('bet is too large to pay the top row exactly');
  const seed = String(opts.seed == null ? '' : opts.seed);
  const cells = opts.cells ? opts.cells.slice() : dealOf(seed);
  // winOf does the checking, and doing it here means a bad stacked card is refused at the deal
  // rather than eight scratches later
  winOf(cells);
  return {
    id: opts.id == null ? null : String(opts.id),
    seed,
    phase: 'scratch',
    bet,
    cells,
    shown: new Array(CELLS).fill(false),
    win: null,
    net: null
  };
}

// What a live card has riding on it, for the other games' budgets (games/tables.js). A card is live
// across several messages, so unlike a spin of the slots this is a real claim on the balance until
// the ninth square turns over
function stake(st) {
  return live(st) ? st.bet : 0;
}

const shownCount = (st) => st.shown.reduce((n, s) => n + (s ? 1 : 0), 0);

// The square a scratch names is the whole move, so its shape is a rule of the game rather than a
// detail of the message: one of the nine, and nothing else. A value that is not an integer in range
// ('3', 3.5, null) would be read as a square by whatever happened to coerce it
function badCell(cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return 'a scratch names a square from 0 to ' + (CELLS - 1);
  return null;
}

// Why `op` cannot be played now, or null.
// budget is not read: a card stakes only its bet, and the host cleared that at the deal, so nothing
// inside a card can cost more credits. The parameter is taken so every game's engine answers the
// same question with the same signature
function whyNot(st, op, budget) {
  const name = op && typeof op === 'object' ? op.op : op;
  if (!OPS.includes(name)) return 'unknown action';
  if (!live(st)) return 'the card is finished';
  if (name === 'reveal') return null;
  const bad = badCell(op && op.cell);
  if (bad) return bad;
  if (st.shown[op.cell]) return 'that square is already scratched';
  return null;
}

// The ninth square is the settlement, and it is the only one: the counts the prize is read off are
// counts over all nine, so there is nothing to settle before that and nothing left to settle after
function settleIfFull(st) {
  if (shownCount(st) < CELLS) return;
  st.win = winOf(st.cells);
  st.net = st.bet * st.win.mult - st.bet;
  st.phase = 'done';
}

function act(st, op) {
  if (whyNot(st, op)) return st;
  const next = clone(st);
  if (op.op === 'reveal') next.shown.fill(true);
  else next.shown[op.cell] = true;
  settleIfFull(next);
  return next;
}

// --- what the webview sees ----------------------------------------------------------------------

// `pays` is the paytable, not a payout: the screen prints these ten rows and holds no numbers of
// its own, so the table can be retuned here and the screen follows. It is handed over on the bet
// screen too, where it is the only thing to look at
function idleView() {
  return {
    phase: 'bet', id: null, bet: null,
    cells: new Array(CELLS).fill(null), left: CELLS, counts: {},
    win: null, net: null,
    pays: PAYS, cellCount: CELLS, side: SIDE, minMatch: MIN_MATCH, topMatch: TOP_MATCH,
    bagSize: BAG_SIZE, minBet: MIN_BET,
    can: { scratch: false, reveal: false }
  };
}

// THE ONE PLACE THAT DECIDES WHAT THE SCREEN IS ALLOWED TO KNOW. All nine symbols are in the state
// from the deal, and this reads only the ones the player has turned over:
//  - `cells` is a symbol where a square has been rubbed off and null where it has not
//  - `counts` is the tally of those same squares, so the screen does not count them itself. It
//    cannot say anything the player has not already seen
// It is a function of its own, and not four lines inside view(), because that is the rule this
// whole game rests on and a rule is easier to keep when it has a name
function shownOf(st) {
  const counts = {};
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    if (!st.shown[i]) { cells.push(null); continue; }
    const sym = st.cells[i];
    cells.push(sym);
    counts[sym] = (counts[sym] || 0) + 1;
  }
  return { cells, counts };
}

// What the webview gets. Everything about the squares comes from shownOf above, and:
//  - `left` is how many squares are still covered
//  - `win` is null until the ninth square turns over, and then one row, NO_WIN included, so the
//    result chip is always a symbol, a count and a net. There is no partial prize and no best case:
//    see the note at the top of the file
//  - the seed appears at 'done', where the card it names is finished and the next card deals a new
//    one of its own
function view(st, budget) {
  if (!st) return idleView();
  const shown = shownOf(st);
  const v = {
    phase: st.phase,
    id: st.id,
    bet: st.bet,
    cells: shown.cells,
    left: CELLS - shownCount(st),
    counts: shown.counts,
    win: st.win,
    net: st.net,
    pays: PAYS,
    cellCount: CELLS,
    side: SIDE,
    minMatch: MIN_MATCH,
    topMatch: TOP_MATCH,
    bagSize: BAG_SIZE,
    minBet: MIN_BET,
    // `scratch` says the card is open, not that any particular square will be taken: a square that
    // is already showing is refused by whyNot, which is what the screen disables a rubbed square on
    can: { scratch: live(st), reveal: live(st) }
  };
  if (st.phase === 'done') v.seed = st.seed;
  return v;
}

module.exports = {
  newRound, act, whyNot, view, idleView, stake,
  dealOf, winOf, badCell,
  PAYS, NO_WIN, ROW, SYMBOLS, BAG, OPS, MIN_BET, CELLS, SIDE, MIN_MATCH, TOP_MATCH, BAG_SIZE
};
