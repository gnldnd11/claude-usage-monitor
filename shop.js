// The crab's shop. Credits go OUT here and nothing comes back, which makes it the only place in
// this extension where money moves in one direction, and that is what every rule below is about.
//
// THERE IS ONE THING ON SALE: the drawing of the crab floating in the water, which the panel shows
// while nothing is being answered (mascot-float.png, webview.js's MASCOT_ART). Before it is bought
// that quiet moment is the old small crab, exactly as it was before this screen existed, and buying
// it is what puts the floating one there instead. Nothing that was free has a price put on it: the
// agents' 34 appearances stay free, the rooms stay free, and the drawing shown WHILE the account is
// being used (mascot-coding.png) is free and is not in the catalog at all.
//
// The shelf has room for more and the rest of it is empty on purpose. What goes there has not been
// decided, so the screen draws the empty slots as slots and this file does not invent names for
// them: a placeholder is not a catalog row, which is also why nothing can be bought by naming one
// (itemOf below believes the catalog and nothing else).
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

// ONE PRICE, AND A SECOND IS NOT ADDED without a reason written down here. A price per item is a
// judgement per item, and that judgement comes out differently every time. 1,000 is a quarter of a
// day of this reader's own earning (4,807 credits a day over the last 30 days), so the one thing on
// the shelf is affordable within a day of installing and is still worth pressing a button for.
// It is NOT retuned when CREDIT_UNIT moves. The ledger stores raw tokens and prices them on every
// read, so a changed rate re-prices the past and leaves this where it is, which is the same promise
// the casino's MIN_BET makes.
const PRICES = Object.freeze([1000]);

// The one slot there is: which drawing the crab uses when nothing is being answered. A key carries
// it (`mascot:float`) so that the day a second kind of thing is sold there is no record to move: a
// shop with two slots is two prefixes, not a migration.
const SLOT = 'mascot';

// The catalog. `key` MAY NOT CHANGE: it is what a record holds, so renaming one would orphan
// everything bought. `name` is only what the screen prints.
//
// `float` is webview.js's name for the drawing as well (MASCOT_ART's quiet column), and that is the
// whole of the wiring: owning this key is what lets that column be drawn.
const ITEMS = Object.freeze([
  { key: 'float', name: 'Floating crab', price: 1000 }
].map((s) => Object.freeze(s)));

// SOLD ONCE AND NO LONGER OFFERED. Empty today, and it is here rather than waiting to be invented:
// `clean` below believes only keys it knows, so an item simply deleted from ITEMS would be cleaned
// out of the records of everyone who paid for it. An item leaving the shop MOVES HERE. It then keeps
// its place in every record and is not drawn on the shelf, because the shelf is built from ITEMS.
const RETIRED = Object.freeze([]);

// every price has to be one of the table's, or the rule above is a comment rather than a rule, and
// nothing may be priced at nothing: a free row would be something the shop cannot sell
for (const s of ITEMS.concat(RETIRED)) {
  if (PRICES.indexOf(s.price) < 0) throw new Error('shop: ' + s.key + ' is priced outside the table');
}
// and two rows may not claim one key: `owned` is keyed by it
(function () {
  const seen = Object.create(null);
  for (const s of ITEMS.concat(RETIRED)) {
    if (seen[s.key]) throw new Error('shop: two rows claim the key ' + s.key);
    seen[s.key] = 1;
  }
})();

const OPS = Object.freeze(['buy']);

const BY_KEY = new Map(ITEMS.concat(RETIRED).map((s) => [s.key, s]));
function itemOf(key) { return (typeof key === 'string' && BY_KEY.get(key)) || null; }
function slotOf(key) { return SLOT + ':' + key; }

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
// THERE IS NO "WHICH ONE IS ON" FIELD. With one slot and no way back, owning the drawing IS using
// it, and a field saying so again could disagree with `owned` (webview.js reads ownership and
// nothing else). The day something is sold that can be turned off, that is the day for the field.
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

function owns(rec, key) {
  return !!(rec && rec.owned && rec.owned[slotOf(key)]);
}
// The slots a record holds, in the catalog's own order rather than the object's: the same record
// has to read the same whichever window wrote it, and insertion order is whoever bought first
function ownedList(rec) {
  const out = [];
  for (const s of ITEMS.concat(RETIRED)) if (rec && rec.owned[slotOf(s.key)]) out.push(slotOf(s.key));
  return out;
}

// A stored record, field by field, or null for a reader who has never opened the shop. Only these
// fields travel, and the record is REBUILT rather than copied, so a "__proto__" in the stored JSON
// cannot ride along. The host calls this at the storage boundary, the way credits.js calls
// market.clean.
//
// `owned` takes only keys this build knows (ITEMS and RETIRED), which is what stops a hand-edited
// store from holding a thousand items, and is the same rule that makes an empty shelf slot
// unbuyable: there is no key for it to be bought or stored under.
function clean(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const out = fresh(REPLICA_RE.test(rec.by) ? rec.by : '');
  for (const k of REC_FIELDS) {
    const n = rec[k];
    out[k] = (Number.isSafeInteger(n) && n > 0 && n <= REC_CEIL[k]) ? n : 0;
  }
  const src = (rec.owned && typeof rec.owned === 'object') ? rec.owned : {};
  for (const s of ITEMS.concat(RETIRED)) if (src[slotOf(s.key)]) out.owned[slotOf(s.key)] = 1;
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
// A shelf row is three facts (what it is, what it costs, is it mine) and the screen draws them.
// What it may not do is work out a PRICE, and it does not: the only comparison it makes is the
// stake chips' own, the price against what this screen may spend (webview.js, freeFor), and the
// figure in it is the one below. A second verdict sent from here would be a second answer to the
// same question that could disagree with the first between two replies, which is precisely what the
// chips read `free` rather than the header balance to avoid.
// The HOST is still the only thing that can accept a purchase: whyNot() is asked again on the
// message, and its sentence is what the screen's warning bar shows.
function view(rec) {
  const st = rec || fresh('');
  return {
    owned: ownedList(st),
    spent: st.spent,
    prices: PRICES.slice(),
    items: ITEMS.map((s) => ({
      key: s.key, slot: slotOf(s.key), name: s.name, price: s.price, owned: owns(st, s.key)
    }))
  };
}

// What every data push carries, so the panel can draw the right crab without the shop having been
// opened and a second window hears about a purchase it did not make
function push(rec) {
  return { owned: ownedList(rec || fresh('')) };
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
    // still draws the crab another window bought
    pushed() { sync(); return push(rec); },
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
  // the catalog
  ITEMS, RETIRED, PRICES, SLOT, OPS, slotOf, itemOf, owns,
  // storage: the rules credits.js calls rather than copies
  clean, load, save, newer, merge, same, kept, netOf, REC_FIELDS, MAX_FIELDS,
  // the game that is not a game
  fresh, whyNot, act, view, push, createHandler
};
