// The crab's shop. Credits go OUT here and nothing comes back, which makes it the only place in
// this extension where money moves in one direction, and that is what every rule below is about.
//
// THREE THINGS ARE ON SALE. The floating crab and the sleeping crab are each an ALTERNATIVE
// inside a scene the panel already draws something for, so before either is bought that moment
// looks exactly as it did before this screen existed. The black hole is not an alternative to
// anything: it belongs to no scene and turns up on its own. It costs ten times as much because it
// is twice the drawing, eight frames against four, and the ladder is read off frames (PRICES).
//
// Nothing that was free has a price put on it, and that rule has held through every addition: the
// agents' 34 appearances stay free, the rooms stay free, every scene keeps the free drawing it
// opened with, and the drawing shown WHILE the account is being used (mascot-coding.png) is free
// and is a scene's fallback rather than a catalog row anybody has to buy.
//
// The shelf has room for more and the rest of it is empty on purpose. What goes there has not been
// decided, so the screen draws the empty slots as slots and this file does not invent names for
// them: a placeholder is not a catalog row, which is also why nothing can be bought by naming one
// (itemOf below believes the catalog and nothing else).
//
// 2026-11-20 added two drawings and neither is for sale: a sleeping crab, which joined the quiet
// scene beside the small one, and a crab going into a black hole, which belongs to no scene at all
// and is the first thing in the POOL (below). Both are free and the shelf still has one price on
// it. Where a new drawing goes is a question with three answers in this file now, and they are
// different shapes rather than three sizes of the same one: a scene's option, a scene's fallback,
// or the pool.
//
// --- the money, and why this file owns its own record -------------------------------------------
//
// A purchase outlives the window, several windows share one purse, and a message that acted on the
// copy in memory would be a purchase the merge then throws away. That is the market's situation
// exactly (market.js, section 7), so this keeps the market's shape and not the forge's:
//
//  - THE MONEY IS IN THE RECORD. `spent` is a field of the record, so netOf is -spent and a
//    purchase that loses the merge charges nothing. The bank (credits.js's grow-only counters per
//    window) is the wrong place for it twice over: a purchase can empty the whole purse, and two
//    windows buying the same thing would each bank the price of it. That bug has already been
//    written once in this repository, with a forge sale banked per window, and one sword minted
//    372,000 credits.
//  - BOTH HALVES OF THE TRADE ARE ONE RECORD. What was bought (`owned`) and what it cost (`spent`)
//    are fields of the same object, so they are adopted together and dropped together. Kept apart,
//    a collision could leave the money gone with nothing to show for it, or the drawing with
//    nothing paid.
//  - `owned` IS NEVER UNIONED ACROSS TWO COPIES. The later record wins WHOLE. A union would keep a
//    dropped purchase's item while its `spent` went with the record that lost, which is the shop's
//    own version of the 372,000 bug.
//  - NOTHING IS MAXED. MAX_FIELDS is empty, as it is in the market: every figure here is money or
//    made of money, so it has to travel with the record or be wrong.
//  - THERE IS NO REFUND. No selling back, no undo, no cancel. It is not on the screen and it is not
//    in the record: the market can be sold back and so it has an `earned`, and this cannot and so
//    it has only `spent`. A refund would make that model a lie.
//
// AND WHAT IS BOUGHT STAYS BOUGHT. The forge was abolished and its record is still read by
// credits.js, because deleting a game does not entitle anyone to delete what it paid out. The same
// holds the other way round here: an item taken off the price list keeps its place in RETIRED below
// rather than being cleaned out of the records that paid for it.
//
// This module is PURE: no vscode, no fs, no clock, no randomness. A record is a value and a move
// returns the next value. `at` is deliberately not a field: the market stores the time of its last
// move because a clock that runs backwards is a way to settle at a price already read off the
// chart, and nothing here is priced off a clock.
'use strict';

// extension.js makes these (16 hex characters). Anything else, "__proto__" included, is dropped
const REPLICA_RE = /^[0-9a-f]{16}$/;

// FOUR TIERS, TEN TIMES APART, AND NOTHING BETWEEN THEM. A price is a judgement, and a judgement
// made per item comes out differently every time; a ladder is a judgement made once, after which
// pricing an item is only choosing which rung it stands on. A row priced off the ladder refuses to
// load (the price check below ITEMS), so the ladder cannot be widened by one item quietly adding
// a rung of its own.
//
// Ten times apart rather than two, because the rungs have to be TELLABLE APART at a glance on a
// shelf where the price is a two or three character tag (`1K`, `10K`). Doubling reads as noise;
// an order of magnitude reads as a different kind of thing.
//
// WHICH RUNG AN ITEM STANDS ON IS ITS FRAME COUNT, which is the one thing about a drawing that is
// not an opinion: it is how much was drawn. Four frames is a rung, eight is the next one up. That
// also means the ladder cannot drift, because nobody has to argue about how good a drawing is.
//
//     1K      4 frames    floating crab, sleeping crab
//     10K     8 frames    black hole crab
//     100K   16 frames    unclaimed
//     1000K  32 frames    unclaimed
//
// Frames double while the price goes up tenfold, which is on purpose: drawing twice as many
// frames is far more than twice the work, and the top of the ladder should be something somebody
// saved for rather than something they passed on the way.
//
// For scale, against this reader's own earning of 4,807 credits a day over 30 days: 1K is a
// quarter of a day, 10K is two days, 100K is three weeks, 1000K is seven months. The top two
// rungs are deliberately empty and may stay that way. A ladder with only its bottom rungs used is
// still a ladder; a rung invented to fit one item is a number pulled out of the air.
//
// NOT RETUNED when CREDIT_UNIT moves. The ledger stores raw tokens and prices them on every read,
// so a changed rate re-prices the past and leaves this where it is, which is the same promise the
// casino's MIN_BET makes.
const PRICES = Object.freeze([1000, 10000, 100000, 1000000]);

// The prefix every record key carries (`mascot:float`). It names the KIND of thing bought, not the
// scene it is worn in, so the scenes below did not move a single stored key when they arrived:
// everything here is a drawing of the crab. A shop that one day sells something that is not is a
// second prefix, not a migration.
const SLOT = 'mascot';

// The catalog. `key` MAY NOT CHANGE: it is what a record holds, so renaming one would orphan
// everything bought. `name` is only what the screen prints.
//
// Each key is webview.js's name for the drawing as well (MASCOT_ART and #mascot's data-*
// attributes), and that is the whole of the wiring: the chosen key IS the picture that is drawn.
//
// WHAT IS FREE COMES WITH THE EXTENSION and is never in a record's `owned`: nothing was paid for
// it, and a record that held it could be made to un-hold it. It is on the shelf rather than off it
// because the reader CHOOSES it, and a shelf showing only what is on sale cannot tell "has not
// bought the floating crab" from "prefers the one that was always there".
const ITEMS = Object.freeze([
  { key: 'idle', name: 'Small crab', price: 0 },
  { key: 'sleep', name: 'Sleeping crab', price: 1000 },
  { key: 'coding', name: 'Laptop crab', price: 0 },
  { key: 'working', name: 'Busy crab', price: 0 },
  { key: 'despair', name: 'Sinking crab', price: 0 },
  { key: 'stunned', name: 'Flat crab', price: 0 },
  { key: 'float', name: 'Floating crab', price: 1000 },
  { key: 'blackhole', name: 'Black hole crab', price: 10000 }
].map((s) => Object.freeze(s)));

// SOLD ONCE AND NO LONGER OFFERED. Empty today, and it is here rather than waiting to be invented:
// `clean` below believes only keys it knows, so an item simply deleted from ITEMS would be cleaned
// out of the records of everyone who paid for it. An item leaving the shop MOVES HERE. It then keeps
// its place in every record and is not drawn on the shelf, because the shelf is built from ITEMS.
const RETIRED = Object.freeze([]);

// --- THE FIVE SCENES ----------------------------------------------------------------------------
//
// What the reader sees is five moments, and these are the ones they named: quiet, typing, working
// while the limit fills, burning through it, and out of it. Each one is a SLOT holding one drawing,
// with the free drawing it has always held and whatever else may go in it.
//
// THE ORDER IS THE LADDER. The shelf draws them in this order (two abreast where there is room,
// then the next row) and `when` says how much of the limit is gone, so reading it runs from
// "nothing answered" to "limit used up". Quiet stands first because it is the one scene that is not
// on that ladder: it crosses two steps and what it answers is the activity.
//
// A slot is NOT a cell of MASCOT_ART. That table is four steps by two columns and it is not
// touched: webview.js keeps it as the drawing every cell uses by default and reads a slot only
// where one governs the cell (MASCOT_SLOT there). The mapping:
//
//   idle step,    quiet  ->  quiet      working step, quiet  ->  quiet
//   idle step,    busy   ->  typing     working step, busy   ->  work
//   despair step, both   ->  burn       stunned step, both   ->  spent
//
// THE WORKING STEP'S BUSY CELL IS A SCENE OF ITS OWN (2026-11-24), and the judgement that kept it
// out of the typing scene is why it is its own rather than typing's. That cell is the one picture
// which says the limit is filling up WHILE you work, and letting the typing choice reach it would
// flatten 5% and 65% of the limit into one drawing: the step axis would then say nothing at all in
// the busy column until despair. It was left with NO scene instead, and what that cost came back
// as a fault report: a reader who had put the laptop crab in a scene labelled `Replies landing` was
// shown the busy one while replies were landing, which is the drawing they did not choose. So the
// cell is named now, its fallback is the drawing it always had, and the step axis is kept by that
// fallback rather than by the cell being unreachable (docs/shop-spec.md, 3-1b and 5-1a).
//
// `when` IS A RUNG OF THE LADDER rather than a description of the activity. Typing and working are
// both "a reply is landing" and what tells them apart is the limit, so stating the activity twice
// would leave one of the two rows with nothing to say. It is SHORT because of where it is drawn,
// under the scene's name in one cell of a two-column grid: 132.5px of 10.5px text at the sidebar
// width this panel is built for, and a line that ellipsizes explains nothing (measured 2026-11-24,
// docs/shop-spec.md section 3-1b; the earlier "about 90px" here predated the two-line heading)
//
// QUIET HOLDS TWO AND ITS FALLBACK DID NOT MOVE. The sleeping crab (2026-11-20) went in beside the
// small one rather than over it. `free` is what a reader who has pressed nothing sees, and the
// quiet scene is the one the panel is in most of the time, so that drawing is the most looked-at
// thing in this product: changing it would redraw every installed copy without anybody pressing
// anything, which is precisely what this fallback exists to make impossible. It is also what turns
// the one scene that could not be chosen in (`pick` was false with a single drawing) into a row
// with something to press. Making the sleeping crab the default is one word here if that is wanted.
//
// THE WORK SCENE SELLS NOTHING, and its second cell is a drawing another scene also holds. Both of
// those are conditions rather than conveniences. Every drawing in the catalog already belongs to a
// scene or to the pool, so a new cell can only hold a key some other scene has, and `shopForSale`
// walks the whole shelf without de-duplicating: a PRICED key standing in two scenes would put the
// one aiming bar on two cells at once. Only the free drawings may be shared, and `coding` is the one
// which says the thing this cell shares with typing, that a reply is landing. Its id is `work` and
// not `working`, because `working` is already a step's name and a drawing's key and a third meaning
// would make a typo in MASCOT_SLOT invisible (docs/shop-spec.md, 3-1b).
const SLOTS = Object.freeze([
  { id: 'quiet', name: 'Quiet', when: 'Nothing answered', free: 'idle', opts: ['idle', 'sleep'] },
  { id: 'typing', name: 'Typing', when: 'Limit has room', free: 'coding', opts: ['coding', 'working'] },
  { id: 'work', name: 'Working', when: 'Limit half gone', free: 'working', opts: ['working', 'coding'] },
  { id: 'burn', name: 'Burning', when: 'Limit mostly gone', free: 'despair', opts: ['despair', 'float'] },
  { id: 'spent', name: 'Spent', when: 'Limit used up', free: 'stunned', opts: ['stunned'] }
].map((s) => Object.freeze(Object.assign({}, s, { opts: Object.freeze(s.opts) }))));

// --- THE POOL: DRAWINGS WITH NO SCENE -----------------------------------------------------------
//
// A scene is a condition: nothing answered, a reply landing, the limit nearly gone, the limit gone.
// The pool is the absence of one. What is in it turns up now and then, for a few seconds, and then
// is not there any more, and the whole of it is that there is no rule to find. It holds four and
// there is one drawing in it today; the other three cells are empty on the shelf for the same
// reason the scenes' spare cells are, and nothing can be bought or stored under them.
//
// IT IS NOT A SCENE AND IT IS NOT A FIFTH SLOT, which is a shape decision and not a label. A slot
// holds exactly ONE drawing and always has one, because a moment the panel can be in must always
// have something to draw. The pool holds a SET, it may be empty, and empty is a legal and useful
// state: it is how a reader who does not want the panel changing under them turns the whole thing
// off, in the one place they would look for it. Those are different objects and one name for both
// would be a slot whose rules only half apply.
//
// NOTHING IS WON BY IT. Everything in here is free and stays free (see `price` below, and the
// header's rule about the single price): paying for a drawing nobody can summon would be the worst
// thing in this file. No credit is earned, spent or held by its appearing, nothing is recorded, and
// the timer that shows it is the window's own and reads nothing but a clock (webview.js).
const POOL_ID = 'pool';                 // what the preference stores the chosen set under
const POOL_NAME = 'Random';
// `when` answers the same question the scenes' does, with the only honest answer there is. The
// screen may not be told the rest (which steps it skips, how rare): that is the panel explaining
// itself, and this product does not do that on screen (docs/game-panels.md)
const POOL_WHEN = 'Now and then';
const POOL_CELLS = 4;                   // how many fit on the shelf's last row
const POOL = Object.freeze(['blackhole']);

const OPS = Object.freeze(['buy']);

const BY_KEY = new Map(ITEMS.concat(RETIRED).map((s) => [s.key, s]));
const BY_SLOT = new Map(SLOTS.map((s) => [s.id, s]));
function itemOf(key) { return (typeof key === 'string' && BY_KEY.get(key)) || null; }
function slotOf(key) { return SLOT + ':' + key; }

// every price has to be one of the table's or nothing at all, or the rule above is a comment
// rather than a rule
for (const s of ITEMS.concat(RETIRED)) {
  if (s.price !== 0 && PRICES.indexOf(s.price) < 0) throw new Error('shop: ' + s.key + ' is priced outside the table');
}
// and two rows may not claim one key: `owned` is keyed by it
(function () {
  const seen = Object.create(null);
  for (const s of ITEMS.concat(RETIRED)) {
    if (seen[s.key]) throw new Error('shop: two rows claim the key ' + s.key);
    seen[s.key] = 1;
  }
  if (BY_SLOT.size !== SLOTS.length) throw new Error('shop: two slots claim one id');
  // ...and a slot's options have to be rows, its default has to be one of its own options, and
  // that default has to be free: a slot whose fallback had a price would be a slot a reader who
  // bought nothing could not fill at all
  // ...and a drawing that stands in MORE THAN ONE scene has to be free, which is the condition the
  // fifth scene arrived under (docs/shop-spec.md, 3-1b). `shopForSale` in webview.js walks the whole
  // shelf without de-duplicating and the one aiming bar is chosen by KEY alone, so a priced key
  // standing in two scenes would put that bar on two cells at once and break "there is one mark on
  // the whole screen". Free keys may be shared and one is: `coding` stands in typing and in work.
  // It throws here rather than only being tested because every other rule in this block does, and a
  // rule that lives in a test is a comment with a test beside it.
  const inScenes = new Map();
  for (const s of SLOTS) {
    if (s.opts.indexOf(s.free) < 0) throw new Error('shop: ' + s.id + ' falls back to something it does not hold');
    for (const k of s.opts) {
      const it = itemOf(k);
      if (!it) throw new Error('shop: ' + s.id + ' holds ' + k + ', which is not a row');
      if (k === s.free && it.price) throw new Error('shop: ' + s.id + ' falls back to something priced');
      if (inScenes.has(k) && it.price) {
        throw new Error('shop: ' + k + ' is priced and stands in both ' + inScenes.get(k) + ' and ' + s.id);
      }
      inScenes.set(k, s.id);
    }
  }
  // ...and the pool: its key may not collide with a scene's (they share one preference object), it
  // may not outgrow the row it is drawn on, everything in it has to be a row of the catalog, and
  // nothing in it may ALSO belong to a scene. That last one is the rule worth stating: a drawing
  // that is both a scene's answer and a random one would turn up meaning "this is the state" and
  // meaning "this is nothing" and the reader could not tell the two apart.
  if (BY_SLOT.has(POOL_ID)) throw new Error('shop: the pool and a scene claim the id ' + POOL_ID);
  if (POOL.length > POOL_CELLS) throw new Error('shop: the pool holds more than its row shows');
  for (const k of POOL) {
    const it = itemOf(k);
    if (!it) throw new Error('shop: the pool holds ' + k + ', which is not a row');
    // A POOL ITEM MAY BE PRICED, and the black hole is (10K, PRICES). It reads oddly at first,
    // since nobody can summon it to look at what they bought, and the answer is that randomPool
    // already filters by ownership: an unbought pool drawing is not in play, so buying it is what
    // puts it in play, which is the same bargain a scene's drawing makes. What it may NOT be is
    // the only thing in the pool while unbought AND the pool's whole default, which is checked a
    // line down rather than here: nothing stored means everything OWNED is in play, so a reader
    // who has bought nothing has an empty pool and sees nothing rather than a teaser.
    for (const s of SLOTS) {
      if (s.opts.indexOf(k) >= 0) throw new Error('shop: ' + k + ' is both a ' + s.id + ' drawing and a random one');
    }
  }
})();

// --- the record ---------------------------------------------------------------------------------
//
//   owned  slot -> 1, for everything bought. A key is only ever 1: a count would mean something
//          nobody can buy twice
//   spent  credits this record has paid, ever. IN the record, so a dropped purchase charges nothing
//   moves  accepted moves. The merge clock: it only ever grows, so of two copies the one with more
//          moves is the later one, and a window writes exactly one record per move count, which is
//          what makes (moves, by) the record's name
//   by     the window that last wrote it. The host fills it in; this module invents nothing
//
// WHICH DRAWING IS IN WHICH SCENE IS NOT IN HERE. That is a preference and this is money: a reader
// changing their mind may not rewrite the record that says what they paid, and `owned` answering
// "what was bought" while a second field answered "what is worn" is one fact with two homes. The
// preference lives in globalState beside the nicknames and the agents' appearances
// (extension.js), and `wornSlots` below is what the two of them mean together.
const REC_FIELDS = Object.freeze(['moves', 'spent']);

// Empty, and that is the rule rather than an omission (see the header). The market's is empty for
// the same reason and the forge's is not, because the forge has lifetime figures a dropped attempt
// would walk backwards. There is no such figure here
const MAX_FIELDS = Object.freeze([]);

// What `clean` will believe. A figure outside these is not one `save` could have produced, so it
// reads as nothing at all: without them a hand-edited store can set `moves` to 1e15 and win every
// merge forever, which would leave every real window told that another window moved first.
// A purchase a second for thirty years is 1e9, and 1e15 credits is a trillion of the one item
const REC_CEIL = Object.freeze({ moves: 1e9, spent: 1e15 });

function fresh(by) {
  return { by: by == null ? '' : String(by), owned: {}, moves: 0, spent: 0 };
}

// THE ONE PLACE THAT ANSWERS "do they have it". Free is had by everyone from the first launch and
// is never in a record, priced is had only if the record says it was paid for. Asked by the screen,
// by the purchase rule, and by the slot resolver below, so two answers here would be two shops
function owns(rec, key) {
  const it = itemOf(key);
  if (!it) return false;
  return !it.price || !!(rec && rec.owned && rec.owned[slotOf(key)]);
}
// ...and the same question off the push's own list, which is all a window has when it has not read
// the record (extension.js composes the push from both)
function heldIn(ownedSlots, key) {
  const it = itemOf(key);
  if (!it) return false;
  return !it.price || (ownedSlots || []).indexOf(slotOf(key)) >= 0;
}
// The slots a record holds, in the catalog's own order rather than the object's: the same record
// has to read the same whichever window wrote it, and insertion order is whoever bought first
function ownedList(rec) {
  const out = [];
  for (const s of ITEMS.concat(RETIRED)) {
    if (s.price && rec && rec.owned[slotOf(s.key)]) out.push(slotOf(s.key));
  }
  return out;
}

// A stored record, field by field, or null for a reader who has never opened the shop. Only these
// fields travel, and the record is REBUILT rather than copied, so a "__proto__" in the stored JSON
// cannot ride along. The host calls this at the storage boundary, the way credits.js calls
// market.clean.
//
// `owned` takes only PRICED keys this build knows (ITEMS and RETIRED), which is what stops a
// hand-edited store from holding a thousand items, and is the same rule that makes an empty shelf
// slot unbuyable: there is no key for it to be bought or stored under. A free drawing is dropped
// rather than kept, because `owns` already answers yes for it and a record that held it could be
// edited into one that does not.
function clean(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const out = fresh(REPLICA_RE.test(rec.by) ? rec.by : '');
  for (const k of REC_FIELDS) {
    const n = rec[k];
    out[k] = (Number.isSafeInteger(n) && n > 0 && n <= REC_CEIL[k]) ? n : 0;
  }
  const src = (rec.owned && typeof rec.owned === 'object') ? rec.owned : {};
  for (const s of ITEMS.concat(RETIRED)) {
    if (!s.price) continue;                           // free comes with the extension, not with a record
    if (src[slotOf(s.key)]) out.owned[slotOf(s.key)] = 1;
  }
  return out;
}

// A record back into one this module will act on. Everything that can be wrong with a record is
// wrong in clean() rather than thrown: a missing one is a reader who has never bought anything
function load(rec) {
  return clean(rec) || fresh('');
}

// What the host stores. The same fields back out, so a record that goes through save(load(x)) is
// the record clean() believed
function save(rec) {
  return { by: rec.by, owned: Object.assign({}, rec.owned), moves: rec.moves, spent: rec.spent };
}

// Is `inc` the later of two records? More moves is later, full stop: a move only ever adds one and
// never takes it back, so this is a clock that cannot run backwards. A tie goes to the larger
// writer id, which is random per activation and so favours neither window and neither outcome: two
// windows buying in the same instant get one of the two purchases, not both.
// The last two comparisons only ever separate two records a hand-edited store put under the same
// pair, and they are here so the merge settles on one of them instead of two windows writing each
// other's copy back and forth forever. Same shape as market.newer and credits.js's forgeNewer
function newer(inc, cur) {
  if (!inc) return false;
  if (!cur) return true;
  if (inc.moves !== cur.moves) return inc.moves > cur.moves;
  if (inc.by !== cur.by) return inc.by > cur.by;
  if (inc.spent !== cur.spent) return inc.spent > cur.spent;
  return ownedList(inc).length > ownedList(cur).length;
}

// Are two records the same record? The host needs this to decide whether a merge changed anything
// and so whether there is a write to make at all (credits.js's mergeLedger asks the market exactly
// that question). Exported for that, and used nowhere in this file
function same(a, b) {
  if (!a || !b) return a === b;
  if (a.by !== b.by) return false;
  for (const k of REC_FIELDS) if (a[k] !== b[k]) return false;
  return ownedList(a).join() === ownedList(b).join();
}

// The later record, WHOLE. Nothing is lifted out of the loser and `owned` is not unioned: a union
// is the 372,000 bug wearing a different hat, because the item of a dropped purchase would stay
// while the `spent` that paid for it went with the record that lost.
// `owned` is copied rather than shared, so the result cannot be a record the host still holds
function merge(cur, inc) {
  if (!inc) return cur || null;
  const win = newer(inc, cur) ? inc : cur;
  const out = Object.assign({}, win, { owned: Object.assign({}, win.owned) });
  for (const k of MAX_FIELDS) {
    if (cur && cur[k] > out[k]) out[k] = cur[k];
    if (inc[k] > out[k]) out[k] = inc[k];
  }
  return out;
}

// Did the record THIS window wrote survive the merge? The host writes, reads the merged record back
// and asks this before it lets the purchase stand. The pair is (moves, by) and nothing else: a
// window writes exactly one record per move count, so that pair is the record's name. Comparing
// `spent` would answer a different question, and comparing the whole record would answer no when
// another window's merge had merely changed something else
function kept(mine, landed) {
  return !!mine && !!landed && landed.moves === mine.moves && landed.by === mine.by;
}

// What the shop has done to the balance. The host adds this the way it adds market.netOf, and it is
// never positive: this is the one direction money moves here
function netOf(rec) {
  return rec ? -rec.spent : 0;
}

// --- which drawing is in which scene ------------------------------------------------------------

// WHAT THE PREFERENCE AND THE RECORD MEAN TOGETHER, in one function, because every way of getting
// it wrong has to land in the same place. A stored choice can name a slot this build dropped, a
// drawing that slot does not hold, a drawing this build does not have at all, or a purchase whose
// record lost a merge in another window; a first launch has nothing stored; and the answer to all
// of those is the drawing the slot has always held. The host is the only thing that calls this and
// the screen and the panel are told the result, so no window works it out for itself.
//
// `ownedSlots` is the push's own list (`owned`), not a record: a window that has never opened the
// shop still has to be able to draw the right crab.
function wornSlots(ownedSlots, pref) {
  const out = {};
  for (const s of SLOTS) {
    const want = (pref && typeof pref[s.id] === 'string') ? pref[s.id] : '';
    if (s.opts.indexOf(want) >= 0 && heldIn(ownedSlots, want)) { out[s.id] = want; continue; }
    // NOTHING CHOSEN: what has been BOUGHT for this slot, and the free one otherwise. A purchase
    // that showed nothing until a second press would read as nothing having happened, and a reader
    // who then prefers the free drawing says so and is kept, because a choice is stored by name
    out[s.id] = s.free;
    for (const k of s.opts) {
      const it = itemOf(k);
      if (it && it.price && heldIn(ownedSlots, k)) { out[s.id] = k; break; }
    }
  }
  return out;
}
// WHAT IS IN PLAY, by the same discipline one line up: every way of being wrong lands in one
// place. A stored list can name a drawing this build dropped, one that was never in the pool, or
// one whose purchase lost a merge, and the answer to all of them is that it is not in play.
//
// NOTHING STORED MEANS EVERYTHING IS IN PLAY, which is the one default worth arguing. A gimmick
// nobody has seen is not one, and unlike a changed scene default this adds a four-second showing
// roughly three times in a working day and leaves every other second of the panel exactly as it
// was. It is also off again in one press, and that press is on the drawing itself.
function randomPool(ownedSlots, pref) {
  const want = (pref && Array.isArray(pref[POOL_ID])) ? pref[POOL_ID] : null;
  const out = [];
  for (const k of POOL) {
    if (!heldIn(ownedSlots, k)) continue;
    if (!want || want.indexOf(k) >= 0) out.push(k);
  }
  return out;
}
// The pool preference after one press, or null when the press changes nothing.
// A SET AND NOT A TOGGLE: the window says which state it wants rather than "the other one", so two
// windows pressing at the same moment land on a value instead of flipping past each other. The
// result is in the catalog's order, so one set reads the same whichever window wrote it.
function poolAfter(ownedSlots, pref, key, on) {
  if (POOL.indexOf(key) < 0) return null;
  const now = randomPool(ownedSlots, pref);
  const want = on ? now.concat([key]) : now.filter((k) => k !== key);
  const out = POOL.filter((k) => want.indexOf(k) >= 0);
  return (out.length === now.length && out.every((k, i) => k === now[i])) ? null : out;
}
// Why `key` cannot be switched, or null. Asked on the message for the reason whyNotWear is
function whyNotPool(ownedSlots, key) {
  if (POOL.indexOf(key) < 0) return 'that is not one of the random drawings';
  if (!heldIn(ownedSlots, key)) return 'that has not been bought';
  return null;
}
// Why `slot` cannot be given `key`, or null. The host asks this on the message, so the screen is
// not what stops it: a drawing nobody bought cannot be worn however the press was made
function whyNotWear(ownedSlots, slot, key) {
  const s = (typeof slot === 'string' && BY_SLOT.get(slot)) || null;
  if (!s) return 'no such scene';
  if (s.opts.indexOf(key) < 0) return 'that does not go there';
  if (!heldIn(ownedSlots, key)) return 'that has not been bought';
  return null;
}

// --- what may be done ---------------------------------------------------------------------------

// Why `op` cannot be done, or null. Takes the message form, because every move here is about one
// item. `budget` is the credits the shop may spend; left out means no limit, which is how act()
// runs: the money rule is the host's and it checks the live balance before calling in.
// Written as !(a <= b) so a NaN budget, which is a broken ledger, refuses rather than allows
function whyNot(rec, op, budget) {
  const name = op && typeof op === 'object' ? op.op : null;
  if (OPS.indexOf(name) < 0) return 'unknown action';
  if (!rec) return 'there is nothing to spend';
  const it = itemOf(op.key);
  if (!it) return 'nothing is sold under that name';
  if (owns(rec, it.key)) return 'you already have the ' + it.name;
  const room = budget == null ? Infinity : budget;
  if (!(it.price <= room)) return 'not enough credits';
  return null;
}

// act() never mutates its input and returns the very same object when the move is not allowed, so a
// host can test for identity rather than for a reason (the market's rule, and the forge's before it)
function act(rec, op) {
  if (whyNot(rec, op)) return rec;
  const it = itemOf(op.key);
  const owned = Object.assign({}, rec.owned);
  owned[slotOf(it.key)] = 1;
  return Object.assign({}, rec, { owned, spent: rec.spent + it.price, moves: rec.moves + 1 });
}

// --- what the webview sees ----------------------------------------------------------------------

// Everything the screen needs and nothing more. There is nothing face down in a shop, so nothing is
// withheld either; what is NOT here is a verdict per row, and that is deliberate.
//
// The shelf is the scenes, each with what may go in it: a cell is four facts (what it is,
// what it costs, is it mine, can choosing it change anything) and the screen draws them.
// What the screen may not do is work out a PRICE, and it does not: the only comparison it makes is
// the stake chips' own, the price against what this screen may spend (webview.js, freeFor), and the
// figure in it is the one below. A second verdict sent from here would be a second answer to the
// same question that could disagree with the first between two replies, which is precisely what the
// chips read `free` rather than the header balance to avoid.
// WHICH ONE IS WORN IS NOT IN HERE: it is on every data push instead (`slots` below), because the
// panel's own crab needs it whether the shop was ever opened or not, and a second copy of it in
// this reply could disagree with that one between two messages.
// The HOST is still the only thing that can accept a purchase: whyNot() is asked again on the
// message, and its sentence is what the screen's warning bar shows.
function view(rec) {
  const st = rec || fresh('');
  const owned = ownedList(st);
  return {
    owned: owned,
    spent: st.spent,
    prices: PRICES.slice(),
    slots: SLOTS.map((s) => {
      const opts = s.opts.map((k) => {
        const it = itemOf(k);
        return { key: k, name: it.name, price: it.price, owned: owns(st, k) };
      });
      return {
        id: s.id, name: s.name, when: s.when, free: s.free, opts: opts,
        // CAN A PRESS CHANGE ANYTHING. One owned drawing means the scene is settled, and a cell
        // that cannot change the answer may not be a button: a keyboard would otherwise stop on
        // it and nothing would happen (docs/game-panels.md, section 2)
        pick: opts.filter((o) => o.owned).length > 1
      };
    }),
    // THE LAST ROW, and what is NOT in it: which of these is in play. That rides the push beside
    // the worn scenes (`push` below) for the same reason they do, and a second copy of it here
    // could disagree with that one between two messages. The cell count IS here, because an empty
    // cell is a shape and not a state
    pool: {
      id: POOL_ID, name: POOL_NAME, when: POOL_WHEN, cells: POOL_CELLS,
      opts: POOL.map((k) => {
        const it = itemOf(k);
        return { key: k, name: it.name, price: it.price, owned: owns(st, k) };
      })
    }
  };
}

// What every data push carries: what was bought, and which drawing is in each scene. The panel's
// crab is drawn from this and nothing else, so it is right in a window that has never opened the
// shop and in a second window that did not make the purchase.
// `pref` is the reader's stored choice, which is the host's (globalState) and not this module's
function push(rec, pref) {
  const owned = ownedList(rec || fresh(''));
  return { owned: owned, slots: wornSlots(owned, pref), pool: randomPool(owned, pref) };
}

// --- the host side ------------------------------------------------------------------------------
//
// The shop is NOT a game: no round, no stake, no return band, so it is not in games/registry.js and
// nothing in webview.js, html.js or styles.js has to learn a game's name for it (docs/shop-spec.md,
// section 4-5). It answers its own message type instead, and this is that handler, written against
// the same deps the market's is so the two can be read side by side.
//
// deps: reply, budget, replica, ensureReplica, record, storedShop, push, log
function createHandler(deps) {
  let rec = null;      // rebuilt from the ledger whenever storage is ahead of it
  let reqN = null;

  // ...and the record THIS window writes: its own id settles a merge tie (newer), so a record
  // without one loses every tie, which is the right way round
  function mine() { return Object.assign(save(rec), { by: deps.replica() || '' }); }

  // Takes the stored record when it is the later one. Returns whether the record in memory moved
  function sync() {
    const stored = clean(deps.storedShop());
    if (!rec || newer(stored, rec)) { rec = load(stored); return true; }
    return false;
  }

  // gameReply calls engine.view(state, free), and that is this module's view exactly, so the host's
  // own reply builder is handed this module and needs nothing of its own
  function reply(error) {
    deps.reply('shop', { view: (st) => view(st) }, rec, reqN, error, false);
  }

  // ONE FORCED WRITE carries the purchase and the money together, because here they are one thing:
  // `spent` is a field of the record, so the bank is handed 0. What comes back is the merged ledger,
  // which is also how this window finds out whether its purchase is the one every window will see.
  //
  // A dropped purchase is shown as what it is: the record another window left, with a line saying
  // why. Nothing was banked for it, so there is nothing to take back.
  function settle() {
    const sent = mine();
    const ledger = deps.record(0, { shop: sent });
    const landed = ledger && ledger.shop;
    const dropped = !kept(sent, landed);
    if (dropped) rec = load(landed);
    // The merge lifts nothing out of the loser, so the only field to take back is `by`, which is
    // this window's now. Without it the next sync() would read storage's copy of this very purchase
    // as the later one and adopt it
    else rec = Object.assign({}, rec, { by: landed.by });
    reply(dropped ? 'another window spent these credits first' : null);
    try { deps.push(); } catch (e) { deps.log('shop: push after a purchase failed: ' + (e && e.message)); }
  }

  return {
    key: 'shop',
    // What the data push carries. Read through sync() so a window that has never opened the shop
    // still draws the crab another window bought, and handed the reader's own choice, which is the
    // host's (globalState) rather than this module's
    pushed() { sync(); return push(rec, deps.pref && deps.pref()); },
    // What the reader has bought, for the host's own refusals: the same list the push carries
    owned() { sync(); return ownedList(rec); },
    handle(m) {
      reqN = Number.isSafeInteger(m.n) ? m.n : null;
      sync();
      if (m.op === 'open') return reply(null);
      if (OPS.indexOf(m.op) < 0) return reply('unknown action');
      // only the fields named here are read, and a price is not one of them: the price is this
      // file's, so nothing off the wire can name what something costs
      const op = { op: m.op, key: typeof m.key === 'string' ? m.key : '' };
      const reason = whyNot(rec, op, deps.budget('shop'));
      if (reason) return reply(reason);
      deps.ensureReplica();
      rec = act(rec, op);
      settle();   // every accepted move settles, so this records exactly once per message
    }
  };
}

module.exports = {
  // the catalog, the scenes, and the pool that is not one
  ITEMS, SLOTS, RETIRED, PRICES, SLOT, OPS, slotOf, itemOf, owns, heldIn,
  POOL, POOL_ID, POOL_NAME, POOL_WHEN, POOL_CELLS,
  // what the preference and the record mean together. The host's, and nobody else's
  wornSlots, whyNotWear, randomPool, poolAfter, whyNotPool,
  // storage: the rules credits.js calls rather than copies
  clean, load, save, newer, merge, same, kept, netOf, REC_FIELDS, MAX_FIELDS,
  // the game that is not a game
  fresh, whyNot, act, view, push, createHandler
};
