// Marketplace captures, shot from the REAL webview.
//
// The listing had one game picture (media/blackjack.png) for five games, and the four it was
// missing are the four this makes. It is in the repository rather than in a scratch directory
// because the last set was made by a generator that no longer exists: six PNGs survived and the
// thing that made them did not, so the next release has no way to reshoot them.
//
// WHAT THIS IS NOT. It is not the extension. It is the extension's own page (html.js), its own
// stylesheet (styles.js), its own client (webview.js) and its own panel scripts, opened in Chrome
// with `acquireVsCodeApi` stubbed. Everything a reader sees is drawn by the shipped code; what is
// faked is the host on the other side of postMessage. The differences that remain are listed at
// the bottom of this file under KNOWN DIFFERENCES, and they belong in any report about these PNGs.
//
// WHY IT READS AND DOES NOT COPY. Every number on screen comes from the real engine, reached
// through the real round driver (games/tables.js) with the real table spec off games/<id>/meta.js.
// Nothing here writes a card, a multiplier, a payout or a balance. A capture that hard-coded them
// would keep showing last year's game after the next retune, which is exactly how a listing starts
// lying about the product.
//
// NO DEPENDENCIES ARE ADDED. This file is `tools/`, which .vscodeignore keeps out of the package,
// and it shells out to the Chrome that is already on the machine. package.json is untouched.
//
//   node tools/shoot-panels.mjs                      every shot, light, into media/
//   node tools/shoot-panels.mjs --only wheel,slots   just those
//   node tools/shoot-panels.mjs --theme both         light and dark, dark suffixed -dark
//   node tools/shoot-panels.mjs --keep               leave the built pages in tools/.shoot/
//
//   node tools/shoot-panels.mjs --help               every flag, and what --only is for
//
// Flags: --only --theme (light|dark|both) --width --dpr --bg --out --keep --list --probe --click
//        --no-session --stale --pct --warn --purse --help

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(path.join(ROOT, 'package.json'));

// ---------------------------------------------------------------------------------------------
// the house style of the existing media/*.png, MEASURED off them rather than chosen here.
// usage-panel.png and agents-room.png both have a 331px .card, which is a 351px sidebar once the
// wrap's 10px padding is added back, and all three sample the same page background. A new capture
// at a different width sits next to them in the README at the same display width and reads as a
// different zoom level, which is worse than one picture missing.
// ---------------------------------------------------------------------------------------------
const HOUSE = {
  width: 351, dpr: 2, theme: 'light', purse: 20544,
  // body is transparent in the shipped page, so what sits behind it belongs to the editor theme.
  // The light value is sampled off the existing media/*.png (all three agree on rgb(214,216,223)),
  // which is what keeps a new capture on the same ground as the ones already in the README
  bg: { light: '#d6d8df', dark: '#1f1f22' }
};
const HOUR = 3600e3;
const DAY = 24 * HOUR;

const CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
].find((p) => fs.existsSync(p));

// ---------------------------------------------------------------------------------------------
// the host, faked only where it touches the operating system
// ---------------------------------------------------------------------------------------------

// A seeded stream, so a capture is the same picture on every machine and after every reshoot.
// The engines take a seed per round; this is what hands them out.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// games/tables.js's deps, with the two that reach the real world (the ledger, the webview) turned
// into a list of the messages a webview would have been sent. gameReply's shape is mirrored here
// rather than imported because extension.js does not export it; it is six fields and the test
// suite pins them.
function fakeHost({ balance, seed }) {
  const sent = [];
  const rand = rng(seed);
  let bal = balance;
  const deps = {
    reply(key, engine, round, reqN, error, withSeq) {
      const msg = { type: key, balance: bal, free: bal };
      if (reqN != null) msg.n = reqN;
      if (error) msg.error = error;
      const state = engine.view(round, bal);
      if (!withSeq && state.seq) state.seq = [];
      msg.state = state;
      sent.push(msg);
    },
    afterMove(settled, net, reply) { if (settled) bal += net; reply(); },
    budget: () => bal,
    random: () => Math.floor(rand() * 0xffffffff),
    ensureReplica() {},
    log() {}
  };
  return { deps, sent, seeds: () => Math.floor(rand() * 0xffffffff), balance: () => bal };
}

// Play one game through the real driver and keep every reply. `script` is the messages a panel
// would have posted, in order.
function playGame(id, script, { balance, seed }) {
  const { createTable } = require(path.join(ROOT, 'games/tables.js'));
  const meta = require(path.join(ROOT, 'games', id, 'meta.js'));
  if (!meta.table) throw new Error(id + ' has no table spec; this harness drives table games only');
  const host = fakeHost({ balance, seed });
  const t = createTable(meta.table, host.deps);
  t.setSeeds(host.seeds);
  let n = 0;
  for (const m of script) t.handle(Object.assign({ n: ++n }, m));
  return { sent: host.sent, key: meta.key, last: host.sent[host.sent.length - 1] };
}

// The market is not a table game: it has no round, it settles on the press and it stores what it
// settles, so it keeps its own handler (games/market/meta.js) and a driver of its own here.
//
// The position it shows is seeded through the STORAGE boundary rather than bought on the spot, and
// that is deliberate twice over. A position bought a second ago is worth the fee less than it cost,
// so a freshly-bought screen can only ever show a small loss, which is neither the common state nor
// a fair picture of the game. And the state this panel exists for is the one where the number moved
// while the panel was shut. So the harness hands the host a record the way the credit store would,
// holding a lot opened hours ago at the price the engine really had at that minute (priceAt), and
// every figure on screen is then the shipped payoutOf working on two real prices.
function playMarket({ purse, ticker, amount, agoMs }) {
  const engine = require(path.join(ROOT, 'market.js'));
  const meta = require(path.join(ROOT, 'games/market/meta.js'));
  const now = Date.now();
  const at = now - agoMs;
  const by = 'a1b2c3d4e5f60718';
  // cleaned by the engine's own storage boundary, so this is a record save() could have produced
  let store = engine.clean({
    pos: { [ticker]: { amount, entryTicks: engine.priceAt(ticker, at), at } },
    moves: 1, trades: 0, staked: amount, earned: 0, best: 0, at, by
  });
  const sent = [];
  const balance = () => purse + engine.netOf(store);
  const deps = {
    reply(key, viewer, wallet, reqN, error) {
      const bal = balance();
      const msg = { type: key, balance: bal, free: bal };
      if (reqN != null) msg.n = reqN;
      if (error) msg.error = error;
      msg.state = viewer.view(wallet, bal);
      sent.push(msg);
    },
    budget: () => balance(),
    replica: () => by,
    storedMarket: () => store,
    record(_net, extra) { store = engine.merge(store, extra.market); return { market: store }; },
    ensureReplica() {}, push() {}, log() {}, live: () => true,
    random: () => 0, afterMove() {}, storedForge: () => null
  };
  const h = meta.createHandler(deps);
  h.handle({ type: 'mk', op: 'open', n: 1, span: '1D' });
  const last = sent[sent.length - 1];
  const coin = last.state.coins.find((c) => c.code === ticker);
  return {
    sent,
    note: ticker + ' ' + coin.name + ', ' + (coin.position.unitsMilli / 1000).toFixed(1) + ' held, '
      + 'entry ' + (coin.position.entryTicks / last.state.ticksPerCredit).toFixed(2)
      + ', now ' + (coin.ticks / last.state.ticksPerCredit).toFixed(2)
      + ', P/L ' + coin.position.pl
  };
}

// The shop is not a game either: no round, no driver, no register entry (docs/shop-spec.md,
// section 4-5), so it has a driver of its own here, the way the market does. Like the market's, the
// record is seeded through the STORAGE boundary rather than bought on the spot, so that both states
// of the screen are reachable: `owned: []` is the one with something to buy and a button, and
// `owned: ['float']` is the one with neither.
function playShop({ purse, owned, slots }) {
  const shop = require(path.join(ROOT, 'shop.js'));
  const by = 'a1b2c3d4e5f60718';
  // cleaned by the module's own boundary, so this is a record save() could have produced
  let store = shop.clean({
    by,
    owned: (owned || []).reduce((o, k) => Object.assign(o, { [shop.slotOf(k)]: 1 }), {}),
    moves: (owned || []).length,
    spent: (owned || []).reduce((n, k) => n + shop.itemOf(k).price, 0)
  });
  const sent = [];
  const balance = () => purse + shop.netOf(store);
  const h = shop.createHandler({
    // which drawing is in which scene is a PREFERENCE and the host's (globalState), so the driver
    // stands in for that store the way it stands in for the ledger
    pref: () => slots || {},
    reply(key, viewer, rec, reqN, error) {
      const bal = balance();
      const msg = { type: key, balance: bal, free: bal };
      if (reqN != null) msg.n = reqN;
      if (error) msg.error = error;
      msg.state = viewer.view(rec, bal);
      sent.push(msg);
    },
    budget: () => balance(),
    replica: () => by,
    storedShop: () => store,
    record: (_net, extra) => { store = shop.merge(store, extra.shop); return { shop: store }; },
    ensureReplica() {}, push() {}, log() {}
  });
  h.handle({ type: 'shop', op: 'open', n: 1 });
  const v = sent[sent.length - 1].state;
  const worn = shop.wornSlots(v.owned, slots || {});
  // ...and the row that has no scene, which the push carries beside the worn ones: a shot without
  // it would draw that row switched off, and the measurement would be of a screen nobody has
  const pool = shop.randomPool(v.owned, slots || {});
  return {
    sent,
    owned: v.owned,
    slots: worn,
    pool,
    note: v.owned.length + ' bought, purse ' + balance() + ', spent ' + v.spent
      + ', worn ' + Object.keys(worn).map((k) => k + '=' + worn[k]).join(' ')
      + ', in play ' + (pool.join(' ') || 'nothing')
  };
}

// ---------------------------------------------------------------------------------------------
// the shots
//
// `pick` lets a shot search seeds for an ordinary round instead of accepting whatever the first
// seed gave. It may NOT ask for a jackpot: the rule is that the listing shows a round the engine
// actually plays, not the best one it can be made to play. Each pick below says what it rejects
// and why, and the runner prints the outcome it settled on so the report can quote it.
// ---------------------------------------------------------------------------------------------
const SHOTS = {
  blackjack: {
    file: 'blackjack-table',
    tab: 'games', game: 'blackjack',
    // deal, then stand. Both hands are face up at the end, which is the thing the picture is for
    script: [{ op: 'open' }, { op: 'deal', bet: 1000 }, { op: 'stand' }],
    // An ordinary settled round that the player won. A listing may choose WHICH real round it
    // shows; it may not invent one, so this searches seeds and prints the one it used. Ruled out:
    // a natural (result 'blackjack', a 4.8% round and the exception), a bust, a split, and a
    // dealer who went over, because each of those is a picture of something other than the game's
    // ordinary shape. The capture already in the listing shows a loss, so this one shows a win
    pick: (st) => st.phase === 'done' && st.hands && st.hands.length === 1
      && st.hands[0].result === 'win' && st.hands[0].total <= 21
      && st.dealer && st.dealer.hole === false && st.dealer.total <= 21
      && st.hands[0].cards.length >= 2 && st.dealer.cards.length >= 2
  },
  highlow: {
    file: 'highlow-run',
    // the DIRECTORY is games/highlow and the game's id is 'hilo' (its meta). The page keys panels
    // by id, the harness loads a spec by directory, and they are not the same string here
    dir: 'highlow',
    tab: 'games', game: 'hilo',
    // deal and call it right once, so the screen is mid-run: a card is up, the two odds are on the
    // buttons and the streak has something in it. This is the state the game is normally LOOKED at
    // in, which a settled one is not
    script: [{ op: 'open' }, { op: 'deal', bet: 100 }, { op: 'higher' }],
    // BOTH sides have to be live. An ace or a two is a real card and a real state, but it kills
    // one of the two buttons, and a picture of this game with one button dead is a picture of the
    // one case where there is no choice to make. A middle card also keeps the two multipliers far
    // enough apart to read as a price rather than as decoration
    pick: (st) => st.phase === 'play' && (st.streak || 0) >= 1
      && st.can && st.can.higher && st.can.lower
      && st.pays && st.pays.higher > 0 && st.pays.lower > 0
      && Math.min(st.pays.higher, st.pays.lower) >= Math.round(st.pot * 1.15)
  },
  slots: {
    file: 'slots-reels',
    tab: 'games', game: 'slots',
    // one spin. The engine is born 'done', so the deal is the round
    script: [{ op: 'open' }, { op: 'deal', bet: 100 }],
    // reels stopped and readable. Not a three-of-a-kind: that is the 1-in-13,824 picture
    pick: (st) => st.phase === 'done' && (st.reels || []).length === 3
      && !(st.win && st.win.kind === 'three')
  },
  wheel: {
    file: 'wheel-stopped',
    tab: 'games', game: 'wheel',
    // deal then spin. 1.28.0's point is that the stop is not on screen until the wheel is there,
    // so the capture is the stopped wheel
    script: [{ op: 'open' }, { op: 'deal', bet: 100 }, { op: 'spin', risk: 'medium' }],
    // stopped on a slice that pays something. A dead slice is the commonest single outcome on the
    // medium wheel, and a listing picture of a wheel is a picture of where it stopped: a stop on
    // nothing says the game has no result rather than that this round had none
    pick: (st) => st.phase === 'done' && st.stop != null && st.mult >= 1
  },
  market: {
    file: 'market-coin',
    tab: 'games', game: 'market',
    // the market opens on its list of four. The picture worth having is the depth below it, which
    // is reached by pressing a row and needs no second reply: the open already carried all four
    // coins, so mkOpenCoin only repaints
    click: '#mkRow-CRAB',
    market: { ticker: 'CRAB', amount: 6000, agoMs: 5 * HOUR }
  },
  weekly: {
    file: 'weekly-details',
    tab: 'usage',
    weekly: true
  },
  // --- MEASURING SHOTS ---------------------------------------------------------------------
  // These two exist to be probed, not published: a picture of the dashboard with invented
  // readings in it has no business on a listing, so `measure` keeps them out of the default run
  // and only --only reaches them. What they are FOR is the question a stylesheet cannot answer:
  // how tall the mascot's box comes out, how many type sizes the tab really renders, and whether
  // a heading fits at a 170px sidebar (docs/game-panels.md, section 9: count it in the browser).
  //
  //   node tools/shoot-panels.mjs --only usage --probe 'fonts:#panelUsage' --theme dark
  //   node tools/shoot-panels.mjs --only usage --pct 95 --probe '#mascot,.mascot-wrap'
  //   node tools/shoot-panels.mjs --only agents --width 170 --probe '.ws-head .it,.crew-head .it'
  // The names begin with `measure-` and the output goes to tools/.measure, not media/: the first
  // draft of this called itself `usage-panel`, which is the name of the dashboard screenshot the
  // README serves off raw.githubusercontent, so one run of it would have replaced the listing's
  // own picture with one full of invented numbers and the next subtree push would have shipped it.
  //   node tools/shoot-panels.mjs --only usage --no-session --probe '.card,.meters,.rtext'
  usage: {
    file: 'measure-usage', tab: 'usage', measure: true,
    usage: { pct: 42, weekly: 61 }
  },
  agents: {
    file: 'measure-agents', tab: 'agents', measure: true,
    usage: { pct: 42, weekly: 61 }
  },
  // The two screens the coin button leads to. Both are measuring shots for the same reason the two
  // above are: what is read off them is geometry (how tall the crossroads comes out, how many
  // columns the shelf makes at a 250px sidebar), and the readings behind them are invented.
  // `door` is which side of the crossroads the stored view is on, and without it there is no way
  // into either screen: the crossroads is what `tab: 'games'` alone now shows.
  cross: {
    file: 'measure-cross', tab: 'games', measure: true,
    usage: { pct: 42, weekly: 61 }
  },
  shop: {
    file: 'measure-shop', tab: 'games', door: 'shop', measure: true,
    // NOTHING BOUGHT, which is the state every reader sees first: the block saying what is on sale
    // is on the screen and so is the button
    shop: { owned: [] }
  },
  // ...and the same screen with nothing left to buy, which is the OTHER state and not a smaller
  // version of this one: the sale block and the control row both go, so which of the two is taller
  // is a question only a measurement answers
  'shop-own': {
    file: 'measure-shop-own', tab: 'games', door: 'shop', measure: true,
    shop: { owned: ['float'], slots: { burn: 'float', typing: 'working' } }
  }
};

// One `data` message, the shape push() sends. Every number in it is made up, which is why the two
// shots that use it are measuring shots: what is being read off them is geometry, and geometry does
// not care whose tokens they are. The readings are chosen to put the panel in its ordinary state
// (nothing at a threshold, no warning bar), and --pct moves the session to reach the other three
// mascot states.
// `session: false` is the account the panel could not be measured in before: an authenticated Ultra
// has no five-hour limit, so the host pushes five_hour: null for ever and half of the Usage tab is
// drawn from a reading that is not there. This harness always filled it, so that half had no way of
// being seen at all (docs/header-fold-spec.md, 7-2).
// `stale: true` is the other state that cannot otherwise be reached here: the usage endpoint has
// not answered in a while (a 429, an expired token, a sign-out), which is the only condition that
// puts the freshness row on the screen. Without it the row is never measurable, since every
// reading this file invents is stamped "now".
// What the host's own push carries about the shop, built by the module that builds it there: the
// reader's stored choice read against what they own, in one place (shop.js, wornSlots)
function shopPush(owned, pref) {
  const shop = require(path.join(ROOT, 'shop.js'));
  // the worn scenes AND the row that has no scene, both as the host resolves them: a shot that
  // left the pool out would draw that row switched off and nothing would say why
  return {
    owned: owned || [], slots: shop.wornSlots(owned || [], pref || {}),
    pool: shop.randomPool(owned || [], pref || {})
  };
}
function usageData({ pct, weekly, warn, session, stale, quiet, bought, worn, shop }) {
  const now = Date.now(), sec = Math.floor(now / 1000);
  const agents = [
    { name: 'code-reviewer', model: 'opus', description: 'Reviews a change.' },
    { name: 'test-runner', model: 'sonnet', description: 'Runs the suite.' },
    { name: 'designer', model: 'opus', description: 'Draws the screen.' },
    { name: 'librarian', model: 'haiku', description: 'Finds things.' },
    { name: 'Explore', model: 'inherit', description: 'Built in.', builtin: true },
    { name: 'Plan', model: 'inherit', description: 'Built in.', builtin: true },
    { name: 'general-purpose', model: 'inherit', description: 'Built in.', builtin: true }
  ];
  const xp = {};
  agents.forEach((a, i) => { xp[a.name] = { xp: 40 + i * 25, level: 1 + (i % 3), runs: 3 + i, tokens: 120000 * (i + 1), ms: 90000 * (i + 1) }; });
  return {
    fh: session === false ? null : { used_percentage: pct, resets_at: sec + 2 * 3600 + 55 * 60 },
    sd: { used_percentage: weekly, resets_at: sec + 3 * 86400 },
    // today's first message, which is what the Active tile falls back to without a window. Four
    // hours and twelve minutes before the last one, so the tile has a span to print
    firstT: now - (4 * 3600 + 12 * 60) * 1000,
    // THE SECOND MASCOT AXIS reads this stamp and nothing else: 90 seconds ago is inside the
    // threshold, so the ordinary capture is the busy column (webview.js, QUIET_MS). --quiet pushes
    // it ten minutes back, which is the only way the float drawing can be measured at all
    last: { t: now - (quiet ? 10 * 60 : 90) * 1000, input: 42000, output: 1200, cache_creation: 0, cache_read: 310000 },
    fable: { used_percentage: 12, resets_at: sec + 3 * 86400 },
    ctx: { used_percentage: 38, window: 200000 },
    usageLoading: false, signedIn: true,
    today: { input: 812000, output: 54000, cache_creation: 120000, cache_read: 9900000 },
    // 18 minutes with --stale, which is past the five the panel calls old (webview.js,
    // STALE_AFTER_MS), and a fresh answer otherwise
    count: 143, refreshedAt: now, usageAt: stale ? now - 18 * 60 * 1000 : now, avg: 74000,
    // --warn puts the burn-rate bubble on screen (webview.js wants a peak 2.5x the average over at
    // least four requests). It is off by default because the ordinary panel has no warning on it,
    // and it is reachable because the bubble hangs over the mascot and the mascot's box changed
    peak: warn ? { total: 420000, t: now - 120000, prompt: 'a long paste' } : null,
    agents, xp,
    agentActivity: {
      instances: [{ key: 'toolu_a', agent: 'test-runner', state: 'active', since: now - 42000, desc: 'Run the suite.' }],
      stats: {}, scope: { all: false, calls: 6, matched: 6, verdict: 'matched' }
    },
    nicknames: {}, roles: {}, appearance: {}, hidden: {}, favGames: [],
    // WHAT THE SHOP HAS SOLD AND WHICH CRAB IS IN WHICH SCENE. A push carries this whether the
    // shop has ever been opened or not (extension.js), and every drawing but one is chosen by it.
    // --bought buys the floating crab and puts it in the scene it is sold for, which is the only
    // way to reach that drawing here. --worn reaches the rest: a scene with more than one FREE
    // drawing in it (the quiet one, since the sleeping crab arrived) cannot be measured any other
    // way, because the drawing it falls back to is the one that was always there.
    shop: shop || shopPush(bought ? ['mascot:float'] : [],
      Object.assign(bought ? { burn: 'float' } : {}, worn || {})),
    credits: { balance: 1240, today: 86, frac: 3, perCredit: 10000, counting: false },
    cfg: { statusBar: 'session+weekly', panelHidden: [], burnRate: true }
  };
}

// ---------------------------------------------------------------------------------------------
// the weekly report: the real builder, over transcripts this file writes
//
// weekly.report() scans ~/.claude and stamps os.hostname() and os.userInfo().username onto the
// result. Both of those are the person using the machine, and this picture goes on a public
// listing, so the scan is pointed at a temporary directory of synthetic sessions and the two
// personal fields are replaced. Everything between those two ends is the shipped code: the same
// parser, the same model prices, the same ranking, the same per-day split.
// ---------------------------------------------------------------------------------------------

function writeTranscripts(dir, now) {
  const rand = rng(20261113);
  const line = (id, req, t, model, cwd, v) => JSON.stringify({
    type: 'assistant', requestId: req, timestamp: new Date(t).toISOString(), cwd,
    message: { id, model, usage: { input_tokens: v[0], output_tokens: v[1], cache_creation_input_tokens: v[2], cache_read_input_tokens: v[3] } }
  });
  const ask = (t, cwd, text) => JSON.stringify({
    type: 'user', timestamp: new Date(t).toISOString(), cwd, message: { role: 'user', content: text }
  });
  // three projects with names that are obviously not anybody's, and a day shape that rises into
  // midweek and falls off: a flat chart says nothing about what the chart is for
  const projects = [
    { slug: '-work-orchard', cwd: '/work/orchard', weight: 1.0, titles: ['rewrite the import step', 'why does the queue stall'] },
    { slug: '-work-lantern', cwd: '/work/lantern', weight: 0.55, titles: ['settings sheet layout'] },
    { slug: '-work-sandbar', cwd: '/work/sandbar', weight: 0.25, titles: ['bump the parser'] }
  ];
  const shape = [0.45, 0.8, 1.0, 0.9, 0.6, 0.2, 0.35];
  let req = 0;
  for (const p of projects) {
    const proj = path.join(dir, p.slug);
    fs.mkdirSync(path.join(proj, 'sess-a', 'subagents'), { recursive: true });
    const main = [];
    p.titles.forEach((title, k) => {
      const t0 = now - (6 - k) * DAY + 10 * HOUR;
      main.push(ask(t0, p.cwd, title));
    });
    for (let d = 6; d >= 0; d--) {
      const scale = shape[6 - d] * p.weight;
      for (let k = 0; k < 3; k++) {
        const t = now - d * DAY - new Date(now).getHours() * HOUR + (9 + k * 4) * HOUR;
        if (t > now) continue;
        const model = rand() < 0.62 ? 'claude-opus-5-5' : 'claude-sonnet-5-5';
        req += 1;
        main.push(line('m' + req, 'r' + req, t, model, p.cwd, [
          Math.round(scale * (9000 + rand() * 14000)),
          Math.round(scale * (900 + rand() * 2200)),
          Math.round(scale * (4000 + rand() * 9000)),
          Math.round(scale * (120000 + rand() * 260000))
        ]));
      }
    }
    fs.writeFileSync(path.join(proj, 'sess-a.jsonl'), main.join('\n') + '\n');
    // one subagent stream, so the per-day bars split into main and subagents the way they do in
    // real use and the legend under the chart has something to point at
    const sub = [];
    for (let d = 5; d >= 1; d--) {
      const t = now - d * DAY + 14 * HOUR;
      req += 1;
      sub.push(line('s' + req, 'sr' + req, t, 'claude-sonnet-5-5', p.cwd, [
        Math.round(p.weight * (3000 + rand() * 5000)),
        Math.round(p.weight * (400 + rand() * 900)),
        Math.round(p.weight * (1500 + rand() * 3000)),
        Math.round(p.weight * (40000 + rand() * 90000))
      ]));
    }
    fs.writeFileSync(path.join(proj, 'sess-a', 'subagents', 'agent-impl.jsonl'), sub.join('\n') + '\n');
    fs.writeFileSync(path.join(proj, 'sess-a', 'subagents', 'agent-impl.meta.json'), JSON.stringify({ agentType: 'implementer' }));
  }
}

async function buildWeekly() {
  const weekly = require(path.join(ROOT, 'weekly.js'));
  const team = require(path.join(ROOT, 'team.js'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-shoot-'));
  const now = Date.now();
  try {
    writeTranscripts(dir, now);
    weekly.setProjectsDir(dir);
    // windowStartOf steps back seven days from the reset, so this puts the window's first hour at
    // 02:00 six days ago: every synthetic session below falls inside it and no column is empty
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const resetsAt = Math.floor((midnight.getTime() + DAY + 2 * HOUR) / 1000);
    const r = await weekly.report({ used_percentage: 41, resets_at: resetsAt }, now, 'max_20x');
    // the only two fields that carry the real person
    r.host = 'studio-mini';
    r.user = 'dev';
    // two PCs, split by the shipped splitter. The names are made up and the second PC's spend is
    // this one's scaled, so the bar has two pieces that add to the account total
    const mine = r.plan.windowCost;
    const summary = {
      account_pct: r.plan.pct,
      pcs: [
        { pc_id: 'me', name: 'studio-mini', cost: mine, tokens: r.total.input + r.total.output + r.total.cache_creation + r.total.cache_read },
        { pc_id: 'other', name: 'bench-tower', cost: mine * 0.58, tokens: Math.round((r.total.input + r.total.output) * 0.58) }
      ]
    };
    r.team = team.split(summary, 'me', r.plan.rate, r.plan.pct);
    r.teamCfg = { on: true, account: 'demo' };
    return r;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------------------------

// A seeded round id/seed pair makes the same picture every time; searching for one that passes the
// shot's `pick` makes it an ORDINARY picture. Caps out rather than looping forever, and says so.
function playUntil(id, shot, balance) {
  let out = null, tried = 0;
  for (let seed = 1; seed <= 400; seed++) {
    tried = seed;
    const r = playGame(id, shot.script, { balance, seed });
    const st = r.last && r.last.state;
    if (st && (!shot.pick || shot.pick(st))) { out = Object.assign(r, { seed }); break; }
  }
  if (!out) throw new Error(id + ': no seed in ' + tried + ' gave a round this shot would show');
  return out;
}

function renderPage({ messages, tab, game, door, theme, width, bg, openWeekly, click, probe, tall }) {
  const html = require(path.join(ROOT, 'html.js'));
  const registry = require(path.join(ROOT, 'games/registry.js'));
  const IC = require(path.join(ROOT, 'icons.js'));
  const { buildNpcCatalog } = require(path.join(ROOT, 'sprites.js'));
  const spriteData = require(path.join(ROOT, 'sprite-data.js'));
  const uri = (n) => n;                       // <base> below makes these the repository's own files
  const gameList = registry.view(uri, (k) => IC[k]);
  // The card tables sit a player sprite at the felt (CUC.npc('player')), and it comes out of this
  // catalog. An empty one is not an empty chair, it is a missing piece of the product: the first
  // run of this harness shot a blackjack table with nobody at it. Built by the shipped builder,
  // off the shipped sprite sheet, exactly as extension.js does it.
  // One room, because the Agents tab's header measures itself against the name of the room that is
  // on: with none the picker falls back to the word "Room" and reads 11px narrower than it is in
  // use. The default room and its real name, taken no further: the picker's grid is a sheet and
  // nothing here opens it.
  const npcs = buildNpcCatalog((n) => spriteData[n] || n, path.join(ROOT, 'sprite-bbox.json'));
  const assetsJson = JSON.stringify({
    rooms: { cave: { name: 'Blocky Cave', dark: 'room-minecraft.png', light: 'room-minecraft-light.png', thumb: 'thumb-cave.png', entry: [0.08, 0.72], desk: [0.3, 0.64] } },
    npcs, ui: { crab: 'crab.png', chevron: IC.chevron, tag: IC.tag, games: gameList }
  }).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  let page = html.renderHtml({
    csp: '*',
    scriptUri: 'webview.js', crabUri: 'crab.png',
    mascotIdleUri: 'mascot-idle.png', mascotWorkingUri: 'mascot-working.png',
    mascotDespairUri: 'mascot-despair.png', mascotStunnedUri: 'mascot-stunned.png',
    // the activity axis's two drawings and the crossroads' two doors: the page names them all, so
    // leaving one out here measures a box with a broken image in it
    mascotCodingUri: 'mascot-coding.png', mascotFloatUri: 'mascot-float.png',
    mascotSleepUri: 'mascot-sleep.png', mascotBlackholeUri: 'mascot-blackhole.png',
    heroGamesUri: 'hero-games.png', heroShopUri: 'hero-shop.png',
    roomMinecraftUri: 'room-minecraft.png',
    assetsJson, gameList, gameScripts: registry.panels()
  });
  // the asset catalog the page carries is built above, and the shop's heading glyph travels in it
  // the way the back arrow's does

  // The CSP meta is written for a vscode-webview:// origin and refuses file:// scripts. Dropping it
  // changes nothing a reader sees; it is the one line of the shipped page this harness removes.
  page = page.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '');

  const boot = `
<base href="${pathToFileURL(ROOT + path.sep).href}">
<style>
  /* the page background is the VS Code sidebar's, which the webview does not own: body is
     transparent in styles.js. Sampled off the existing media/*.png so a new capture sits on the
     same colour as the ones already in the README */
  html,body{background:${bg};margin:0;}
  html{-webkit-font-smoothing:antialiased;}
  /* the sidebar, as a real viewport: the transform makes this the containing block for the
     position:fixed sheets, which otherwise resolve against a window this platform will not make
     narrower than about 500px */
  #shot-vp{position:relative;width:${width}px;min-height:${tall ? 1000 : 1}px;transform:translateZ(0);}
</style>
<script>
(function () {
  // The weekly header prints a time with toLocaleTimeString([], ...), which means "whatever locale
  // the viewer has". That is right in the product and undecided in a picture, so the capture picks
  // one: en-US, because the listing is in English. Chrome's --lang does not move this on macOS,
  // where the renderer takes its locale from the system.
  ['toLocaleTimeString', 'toLocaleDateString', 'toLocaleString'].forEach(function (k) {
    var orig = Date.prototype[k];
    Date.prototype[k] = function (loc, opt) { return orig.call(this, loc && loc.length ? loc : 'en-US', opt); };
  });
  // THE SIDEBAR'S WIDTH, as the page asks for it.
  // #shot-vp below is ${width}px wide, but body is as wide as the window, and this platform will
  // not make a Chrome window narrower than about 500px. webview.js picks its responsive layout off
  // document.body.clientWidth, so without this a 170px capture renders the 500px layout inside a
  // 170px box: every heading squeezed, and body.narrow (which is what decides what gets dropped at
  // that width) never set. Rather than set those classes here, which would be this file guessing at
  // the product's rule, the ONE number the rule reads is answered with the width being pretended.
  // Only body is affected; every other element still measures itself.
  var VPW = ${width};
  (function () {
    var native = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get: function () { return this === document.body ? VPW : native.get.call(this); }
    });
  })();
  // The door is which side of the crossroads this view is on, and it is part of the stored view:
  // without it there is no way to shoot either screen behind the coin button, because the tab
  // 'games' on its own is now the crossroads itself (docs/shop-spec.md, section 4-4)
  var STATE = ${JSON.stringify({ tab, game: game || null, door: door || null, lastTab: 'usage' })};
  window.acquireVsCodeApi = function () {
    return {
      getState: function () { return STATE; },
      setState: function (s) { STATE = s; return s; },
      postMessage: function (m) { (window.__posted = window.__posted || []).push(m); }
    };
  };
  var MSGS = ${JSON.stringify(messages)};
  var OPEN_WEEKLY = ${openWeekly ? 'true' : 'false'};
  var CLICK = ${JSON.stringify(click || null)};
  var PROBE = ${JSON.stringify(probe || null)};
  // how many LINES a flex row wrapped into, by grouping its children on vertical overlap. The
  // question "is the amount row two lines or three" is not answerable from the stylesheet
  function lines(box) {
    var ks = [].slice.call(box.children).map(function (c) { var r = c.getBoundingClientRect(); return [r.top, r.bottom]; });
    var rows = [];
    ks.forEach(function (k) {
      for (var i = 0; i < rows.length; i++) if (k[0] < rows[i][1] && k[1] > rows[i][0]) {
        rows[i][0] = Math.min(rows[i][0], k[0]); rows[i][1] = Math.max(rows[i][1], k[1]); return;
      }
      rows.push([k[0], k[1]]);
    });
    return rows.length;
  }
  // Every type size one root RENDERS, and what asks for it. A stylesheet cannot be counted by
  // hand: a rule may be overridden, may never match anything, or may sit in a subtree that is
  // not on screen, and none of those is a size the reader sees.
  function fontsUnder(sel) {
    var root = document.querySelector(sel);
    if (!root) return null;
    var seen = {};
    [root].concat([].slice.call(root.querySelectorAll('*'))).forEach(function (e) {
      if (!e.getClientRects().length) return;      // hidden, or inside something hidden
      var own = [].slice.call(e.childNodes).some(function (n) { return n.nodeType === 3 && n.data.trim(); });
      if (!own) return;                            // a wrapper's size is not on screen
      var k = getComputedStyle(e).fontSize;
      var cls = e.getAttribute && e.getAttribute('class');
      var who = e.id ? '#' + e.id : (cls ? '.' + String(cls).split(/\\s+/)[0] : e.localName);
      if (!seen[k]) seen[k] = [];
      if (seen[k].indexOf(who) < 0) seen[k].push(who);
    });
    return seen;
  }
  function probe() {
    // SETTLED GEOMETRY, not a frame of an animation. The panel's fold runs 450ms of transition and
    // this harness runs under Chrome's virtual clock, where a transition sometimes advances with
    // the clock and sometimes makes no progress at all: measured over four runs of the same
    // command at a 700ms delay, one came back with the ring column still at its full 88x180 and
    // the card 141px taller than its folded height, while the properties that are NOT animated
    // (the meter margins) were already final. Waiting longer does not fix that, because the frames
    // the transition needs may never be produced.
    // So the measurement pins the page's own no-animation class first (styles.js, .notrans, which
    // the product uses for its first paint): transition:none resolves every property to its target
    // at once, which is the value a reader ends up looking at and the only value worth printing.
    try { document.body.classList.add('notrans'); void document.body.offsetWidth; } catch (e) {}
    var out = {};
    PROBE.forEach(function (sel) {
      if (sel.indexOf('fonts:') === 0) { out[sel] = fontsUnder(sel.slice(6)); return; }
      // "ink:<sel>" is the PAINTED size of an object-fit:contain image, which is not its box.
      // Once a picture is given a box of its own (.cr-art), getBoundingClientRect answers with the
      // box for every ratio alike and the drawing's real size on screen becomes invisible to a
      // probe. This is the one question those rows of docs/shop-spec.md are actually asking.
      if (sel.indexOf('ink:') === 0) {
        var im = document.querySelector(sel.slice(4));
        if (!im || !im.naturalWidth) { out[sel] = null; return; }
        var ib = im.getBoundingClientRect(), ar = im.naturalWidth / im.naturalHeight;
        var iw = Math.min(ib.width, ib.height * ar), ih = Math.min(ib.height, ib.width / ar);
        out[sel] = { w: +iw.toFixed(2), h: +ih.toFixed(2), x: +ib.left.toFixed(2), y: +ib.top.toFixed(2),
          lines: 1, font: im.naturalWidth + 'x' + im.naturalHeight, color: '', clipped: false,
          text: 'ratio ' + ar.toFixed(3) + ', box ' + ib.width.toFixed(2) + ' x ' + ib.height.toFixed(2) };
        return;
      }
      var e = document.querySelector(sel);
      if (!e) { out[sel] = null; return; }
      var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      out[sel] = {
        w: +r.width.toFixed(2), h: +r.height.toFixed(2),
        // page coordinates too: a question like "does this bubble point at that head" is about
        // where two boxes are relative to each other, which a width and a height cannot answer
        x: +r.left.toFixed(2), y: +r.top.toFixed(2),
        lines: e.children.length ? lines(e) : 1,
        font: cs.fontSize + '/' + cs.fontWeight, color: cs.color,
        clipped: e.scrollWidth > e.clientWidth + 1,
        text: (e.textContent || '').trim().slice(0, 60)
      };
    });
    var tag = document.createElement('script');
    tag.type = 'application/json'; tag.id = 'cuc-probe';
    tag.textContent = JSON.stringify(out);
    document.body.appendChild(tag);
  }
  window.addEventListener('load', function () {
    // the replies the host would have sent, in the order it would have sent them. A panel tells its
    // own reply from a late one by \`n\`, and the numbers here are the ones the driver answered with
    setTimeout(function () {
      if (OPEN_WEEKLY) window.postMessage({ type: 'openWeekly' }, '*');
      MSGS.forEach(function (m) { window.postMessage(m, '*'); });
      // a depth inside a game is reached the way a player reaches it: by pressing the thing that
      // opens it. Nothing is posted for this, so it runs once the replies above have been drawn
      if (CLICK) setTimeout(function () {
        var el = document.querySelector(CLICK);
        if (!el) { document.title = 'CUCERR:' + CLICK; return; }
        el.click();
      }, 120);
      // the page is as tall as its content; the runner reads this back to size the window
      setTimeout(function () {
        // panels hand the focus to the button a player would press next, which is correct in use
        // and reads as a stuck highlight in a still picture
        try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) {}
        if (PROBE) probe();
        var w = document.querySelector('#shot-vp');
        var m = document.querySelector('.wk-sheet:not([hidden]) .wk-card');
        var h = Math.ceil((m ? m.getBoundingClientRect().bottom + 20 : w.getBoundingClientRect().height) + 2);
        document.title = 'CUCH:' + h;
        document.documentElement.setAttribute('data-shot-height', String(h));
        // 700, not 400. A --click lands at 180ms (the 60 below plus the 120 above) and the panel's
        // own transitions run 450, so nothing is still until 630. At 400 this measured a box
        // mid-flight: the same fold came out 427 one run and 318 the next
      }, 700);
    }, 60);
  });
})();
</script>`;
  page = page.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + boot);
  page = page.replace('<body>', '<body' + (theme === 'light' ? ' class="vscode-light"' : '') + '><div id="shot-vp">')
             .replace('</body>', '</div></body>');
  return page;
}

// ---------------------------------------------------------------------------------------------
// chrome
// ---------------------------------------------------------------------------------------------
function chrome(args) {
  return execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--force-prefers-reduced-motion',
    '--lang=en-US',
    '--run-all-compositor-stages-before-draw', ...args
  ], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000,
    // toLocaleTimeString in the weekly header follows the process locale, and these PNGs go on an
    // English listing
    env: Object.assign({}, process.env, { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' })
  });
}

// Two passes. The first asks the page how tall it is (the shots differ by hundreds of pixels and a
// fixed window leaves a band of background under the short ones); the second shoots it.
// --force-prefers-reduced-motion is what makes the second pass safe: every panel draws its final
// state in one step under it (docs/game-panels.md, section 6), so there is no pacing to race.
function shoot(pagePath, outPath, { width, dpr, profile, probe }) {
  const url = pathToFileURL(pagePath).href;
  const dom = chrome(['--virtual-time-budget=4000', `--user-data-dir=${profile}`,
    `--window-size=${width},1400`, '--dump-dom', url]);
  if (probe) {
    const j = /<script type="application\/json" id="cuc-probe">([\s\S]*?)<\/script>/.exec(dom);
    if (!j) throw new Error('the page never reported its measurements: ' + path.basename(pagePath));
    return { probe: JSON.parse(j[1]) };
  }
  const bad = /<title>CUCERR:([^<]+)<\/title>/.exec(dom);
  if (bad) throw new Error('the shot could not press ' + bad[1] + ': ' + path.basename(pagePath));
  const m = /<title>CUCH:(\d+)<\/title>/.exec(dom);
  if (!m) throw new Error('the page never reported its height: ' + path.basename(pagePath));
  const height = Math.max(120, Number(m[1]));
  chrome(['--virtual-time-budget=4000', `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${dpr}`, `--window-size=${width},${height}`,
    `--screenshot=${outPath}`, url]);
  return { height };
}

// ---------------------------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------------------------
// A flag that takes no value has to be LISTED here, or it swallows the next argument as its value
// and whatever that was is lost. Every switch belongs in the first line.
const BOOLS = ['keep', 'list', 'warn', 'no-session', 'stale', 'quiet', 'bought', 'help'];
function flags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (BOOLS.indexOf(k) >= 0) f[k] = true;
    else f[k] = argv[++i];
  }
  return f;
}

// WHY AN UNKNOWN FLAG STOPS THE RUN. `--help` was not a flag, so it was read as a stray argument,
// the run fell through to its default (every listing shot, into media/) and overwrote the six
// PNGs the marketplace README serves off raw.githubusercontent. A subtree push would have shipped
// them. The default run is the destructive one, so it may not be what a typo lands on.
const KNOWN = BOOLS.concat(['only', 'theme', 'width', 'dpr', 'bg', 'out', 'purse', 'probe', 'pct', 'click', 'worn']);
const USAGE = [
  'node tools/shoot-panels.mjs [--only <shot,shot>] [--theme light|dark|both] [--probe <sel,sel>]',
  '',
  '  --only <ids>     just these shots (--list names them). WITHOUT it every listing shot is',
  '                   reshot into media/, which is what the marketplace README serves',
  '  --probe <sels>   measure instead of shooting: no file is written at all. "fonts:<sel>"',
  '                   answers with the type sizes rendered under one root, "ink:<img sel>" with',
  '                   the painted size of a contained image rather than the size of its box',
  '  --no-session     push five_hour: null, the account with no five-hour limit',
  '  --stale          push a usage reading 18 minutes old, which shows the freshness row',
  '  --quiet          push the last reply as ten minutes old, which is the mascot\'s quiet drawing',
  '  --bought         the floating crab has been bought and is in the scene it is sold for',
  '  --worn <s=k,..>  which drawing is in which scene, as a stored choice (quiet=sleep). The only',
  '                   way to reach the second FREE drawing in a scene, since the fallback wins',
  '  --click <sel>    press something once the replies have been drawn, then measure',
  '  --out <dir>      write the PNGs somewhere other than media/',
  '  --width --dpr --bg --pct --purse --warn --theme --keep --list'
].join('\n');

async function main() {
  const f = flags(process.argv.slice(2));
  if (f.help) { console.log(USAGE); return; }
  const unknown = Object.keys(f).filter((k) => KNOWN.indexOf(k) < 0);
  if (unknown.length) { console.error('unknown flag: --' + unknown.join(' --') + '\n\n' + USAGE); process.exit(2); }
  if (f.list) { console.log(Object.keys(SHOTS).join('\n')); return; }
  if (!CHROME) throw new Error('no Chrome, Chromium or Edge found; this harness shoots with the browser already on the machine');

  const width = Number(f.width || HOUSE.width);
  const dpr = Number(f.dpr || HOUSE.dpr);

  const themes = (f.theme || HOUSE.theme) === 'both' ? ['light', 'dark'] : [f.theme || HOUSE.theme];
  // the measuring shots are reached by name only: see SHOTS
  const only = f.only ? String(f.only).split(',').map((s) => s.trim()) : Object.keys(SHOTS).filter((k) => !SHOTS[k].measure);
  // media/ is the listing's folder, so only the shots the listing uses default into it. A measuring
  // shot writes beside the harness instead: nothing it draws should be able to reach a reader
  const measuring = only.some((id) => SHOTS[id] && SHOTS[id].measure);
  const outDir = f.out ? path.resolve(ROOT, f.out) : (measuring ? path.join(HERE, '.measure') : path.join(ROOT, 'media'));
  const work = path.join(HERE, '.shoot');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-chrome-'));
  const purse = Number(f.purse || HOUSE.purse);
  const probeSel = f.probe ? String(f.probe).split(',').map((x) => x.trim()) : null;

  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // The register drops a game it cannot load rather than throwing (games/registry.js), so a game
  // being edited in another window costs its own row and not this run. Say so instead of shooting
  // a list with a hole in it and calling it done.
  const problems = require(path.join(ROOT, 'games/registry.js')).PROBLEMS;
  if (problems && problems.length) {
    console.log('NOTE: the register could not list ' + problems.length + ' game(s):');
    for (const p of problems) console.log('  ' + p);
  }

  const made = [];
  for (const id of only) {
    const shot = SHOTS[id];
    if (!shot) { console.log('skip ' + id + ': no such shot (try --list)'); continue; }
    let messages = [], note = '';
    if (shot.weekly) {
      const r = await buildWeekly();
      messages = [{ type: 'weekly', data: r }];
      note = r.days.length + ' days, ' + r.team.rows.length + ' PCs, account ' + r.plan.pct + '%';
    } else if (shot.usage) {
      // --worn quiet=sleep,typing=working: which drawing is in which scene, as the reader's own
      // stored choice. Unknown scenes and drawings are dropped by shop.js, not here
      const worn = String(f.worn || '').split(',').filter(Boolean).reduce((o, pair) => {
        const [k, v] = pair.split('=');
        if (k && v) o[k.trim()] = v.trim();
        return o;
      }, {});
      const want = Object.assign({ warn: !!f.warn, session: !f['no-session'], stale: !!f.stale, quiet: !!f.quiet, bought: !!f.bought, worn }, shot.usage, f.pct != null ? { pct: Number(f.pct) } : null);
      messages = [{ type: 'data', data: usageData(want) }];
      note = (want.session === false ? 'no 5h limit on this account' : 'session ' + want.pct + '%')
        + ', weekly ' + want.weekly + '%' + (want.warn ? ', burn-rate warning' : '')
        + (want.stale ? ', usage 18m old' : '') + (want.quiet ? ', last reply 10m ago' : '')
        + (want.bought ? ', the floating crab bought and worn' : '')
        + ' (invented readings)';
    } else if (shot.market) {
      const m = playMarket(Object.assign({ purse }, shot.market));
      messages = m.sent;
      note = m.note;
    } else if (shot.shop) {
      const s = playShop(Object.assign({ purse }, shot.shop));
      // the data push first (what the shop has sold, and the readings the header needs), then the
      // shop's own reply: the screen asks for itself on entry, and this is that answer
      messages = [{ type: 'data', data: usageData({ pct: 42, weekly: 61, session: true, quiet: !!f.quiet, shop: { owned: s.owned, slots: s.slots, pool: s.pool } }) }].concat(s.sent);
      note = s.note;
    } else {
      const played = playUntil(shot.dir || shot.game, shot, purse);
      messages = played.sent;
      const st = played.last.state;
      note = 'seed ' + played.seed + ', ' + (st.outcome || (st.win && st.win.kind) || st.phase)
        + (st.net != null ? ', net ' + st.net : '');
    }
    for (const theme of themes) {
      const page = renderPage({
        messages, tab: shot.tab, game: shot.game, door: shot.door, theme, width,
        bg: f.bg || HOUSE.bg[theme],
        // --click reaches a state that only a press can reach, and a measuring shot needs it for
        // the same reason a game shot does: "how much does the fold actually fold" is a question
        // about the page AFTER the chevron, and no stylesheet rule answers it
        openWeekly: !!shot.weekly, click: f.click || shot.click, probe: probeSel, tall: !!shot.weekly
      });
      const pagePath = path.join(work, shot.file + '-' + theme + '.html');
      fs.writeFileSync(pagePath, page);
      const name = shot.file + (theme === 'dark' ? '-dark' : '') + '.png';
      const outPath = path.join(outDir, name);
      const r = shoot(pagePath, outPath, { width, dpr, profile, probe: probeSel });
      if (probeSel) {
        console.log('\n-- ' + id + ' / ' + theme + ' / sidebar ' + width + (note ? ' / ' + note : ''));
        for (const [sel, v] of Object.entries(r.probe)) {
          // a fonts: probe answers with a size -> who-asked-for-it map, not one box
          if (sel.startsWith('fonts:')) {
            if (!v) { console.log('   ' + sel + '  not in the page'); continue; }
            const sizes = Object.keys(v).sort((a, b) => parseFloat(b) - parseFloat(a));
            console.log('   ' + sel + '  ' + sizes.length + ' size(s) rendered');
            for (const s of sizes) console.log('      ' + s.padEnd(9) + v[s].join(' '));
            continue;
          }
          console.log('   ' + sel.padEnd(18) + (v ? (v.w + ' x ' + v.h).padEnd(16) + ('at ' + v.x + ',' + v.y).padEnd(18)
            + v.lines + ' line(s)  ' + v.font.padEnd(10) + (v.clipped ? 'CLIPPED  ' : '') + v.text : 'not in the page'));
        }
        continue;
      }
      made.push({ name, theme, h: r.height, note });
      console.log(name.padEnd(26) + ' ' + width + 'x' + r.height + ' css @' + dpr + 'x  ' + note);
    }
  }

  if (!f.keep) fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });
  console.log('\n' + made.length + ' file(s) in ' + outDir);
}

// KNOWN DIFFERENCES from a capture taken inside VS Code. These are the honest caveats and they go
// in any report about the output:
//  - FONT. styles.js asks for var(--vscode-font-family) first and nothing defines it here, so the
//    stack falls through to -apple-system. VS Code on macOS resolves --vscode-font-family to the
//    same family, so the two agree on this machine; on a machine whose editor font is set to
//    something else they would not.
//  - THEME TOKENS. A real webview also inherits VS Code's own --vscode-* variables. styles.js
//    defines every colour it uses itself and only reads the body theme class, which this sets, so
//    nothing here depends on the missing ones. body.vscode-high-contrast is not shot.
//  - PAGE BACKGROUND. body is transparent in the shipped page and the colour behind it belongs to
//    the editor theme. HOUSE.bg is sampled off the existing media/*.png so the new files match
//    them, which means it matches THAT editor theme and not every reader's.
//  - CSP. The page's Content-Security-Policy meta is removed so file:// scripts load.
//  - MOTION. Shot under prefers-reduced-motion, which is a state the product really has; every
//    panel is specified to draw its final frame in one step under it.
//  - WEEKLY. Built by the shipped report() over synthetic transcripts in a temp directory. The
//    hostname and username it stamps on are replaced with made-up ones before rendering.

main().catch((e) => { console.error(String((e && e.stack) || e)); process.exit(1); });
