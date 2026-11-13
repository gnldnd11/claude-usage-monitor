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
// Flags: --only --theme (light|dark|both) --width --dpr --bg --out --keep --list

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
  }
};

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

function renderPage({ messages, tab, game, theme, width, bg, openWeekly, click, probe, tall }) {
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
  // `rooms` stays empty: it feeds the Agents tab, which nothing here shoots.
  const npcs = buildNpcCatalog((n) => spriteData[n] || n, path.join(ROOT, 'sprite-bbox.json'));
  const assetsJson = JSON.stringify({
    rooms: {}, npcs, ui: { crab: 'crab.png', games: gameList }
  }).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  let page = html.renderHtml({
    csp: '*',
    scriptUri: 'webview.js', logoUri: 'logo.png', crabUri: 'crab.png', sparkleUri: 'sparkle.png',
    mascotIdleUri: 'mascot-idle.png', mascotWorkingUri: 'mascot-working.png',
    mascotDespairUri: 'mascot-despair.png', mascotStunnedUri: 'mascot-stunned.png',
    roomMinecraftUri: 'room-minecraft.png',
    assetsJson, gameList, gameScripts: registry.panels()
  });

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
  var STATE = ${JSON.stringify({ tab, game: game || null, lastTab: 'usage' })};
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
  function probe() {
    var out = {};
    PROBE.forEach(function (sel) {
      var e = document.querySelector(sel);
      if (!e) { out[sel] = null; return; }
      var r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      out[sel] = {
        w: +r.width.toFixed(2), h: +r.height.toFixed(2),
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
      }, 400);
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
function flags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    if (k === 'keep' || k === 'list') f[k] = true;
    else f[k] = argv[++i];
  }
  return f;
}

async function main() {
  const f = flags(process.argv.slice(2));
  if (f.list) { console.log(Object.keys(SHOTS).join('\n')); return; }
  if (!CHROME) throw new Error('no Chrome, Chromium or Edge found; this harness shoots with the browser already on the machine');

  const width = Number(f.width || HOUSE.width);
  const dpr = Number(f.dpr || HOUSE.dpr);

  const themes = (f.theme || HOUSE.theme) === 'both' ? ['light', 'dark'] : [f.theme || HOUSE.theme];
  const outDir = f.out ? path.resolve(ROOT, f.out) : path.join(ROOT, 'media');
  const work = path.join(HERE, '.shoot');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-chrome-'));
  const purse = Number(f.purse || HOUSE.purse);
  const probeSel = f.probe ? String(f.probe).split(',').map((x) => x.trim()) : null;
  const only = f.only ? String(f.only).split(',').map((s) => s.trim()) : Object.keys(SHOTS);

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
    } else if (shot.market) {
      const m = playMarket(Object.assign({ purse }, shot.market));
      messages = m.sent;
      note = m.note;
    } else {
      const played = playUntil(shot.dir || shot.game, shot, purse);
      messages = played.sent;
      const st = played.last.state;
      note = 'seed ' + played.seed + ', ' + (st.outcome || (st.win && st.win.kind) || st.phase)
        + (st.net != null ? ', net ' + st.net : '');
    }
    for (const theme of themes) {
      const page = renderPage({
        messages, tab: shot.tab, game: shot.game, theme, width,
        bg: f.bg || HOUSE.bg[theme],
        openWeekly: !!shot.weekly, click: shot.click, probe: probeSel, tall: !!shot.weekly
      });
      const pagePath = path.join(work, shot.file + '-' + theme + '.html');
      fs.writeFileSync(pagePath, page);
      const name = shot.file + (theme === 'dark' ? '-dark' : '') + '.png';
      const outPath = path.join(outDir, name);
      const r = shoot(pagePath, outPath, { width, dpr, profile, probe: probeSel });
      if (probeSel) {
        console.log('\n-- ' + id + ' / ' + theme + ' / sidebar ' + width);
        for (const [sel, v] of Object.entries(r.probe)) {
          console.log('   ' + sel.padEnd(14) + (v ? (v.w + ' x ' + v.h).padEnd(18) + v.lines + ' line(s)  '
            + v.font.padEnd(10) + (v.clipped ? 'CLIPPED  ' : '') + v.text : 'not in the page'));
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
