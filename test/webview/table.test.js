// The webview harness: the real extension.js host, the real engines and the real webview.js, on the
// HTML the host itself renders, loaded into minidom. Messages and timers run on a fake clock, so
// every timing a mode measures is in that clock's milliseconds.
//
// This file is the page and the plumbing. What is CHECKED lives in test/webview/games/, one file per
// game (test/webview/modes.js is the register), and this file knows nothing about any of them: it
// builds the handle `h` below, asks the register which file owns the mode it was given, and calls it.
// A game is therefore its own file and one line of nothing else, the same promise games/README.md
// makes about games/registry.js.
//
// Run one mode: node test/webview/table.test.js <mode>   (test/webview/run.js runs them all)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { createDocument } = require('./minidom');
const modes = require('./modes');

const MODE = process.argv[2] || 'normal';
const EXT = process.env.EXT || path.join(__dirname, '..', '..');
const CASE = modes.forMode(MODE);                      // throws on a name no file claims
const START = (CASE.start && CASE.start[MODE]) || 1000;
const HOME = fs.mkdtempSync(path.join(process.env.CUC_TABLE_TMPDIR || os.tmpdir(), 'cuc-table-')); // run.js passes a parent it cleans up

let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  | ' + extra : '')); if (!cond) fails++; }

// --- fake clock shared by webview timers and message delivery ---
let now = 0; let q = []; let seqNo = 0;
function later(ms, fn) { const t = { at: now + Math.max(0, ms || 0), fn, id: ++seqNo }; q.push(t); return t.id; }
function cancel(id) { q = q.filter((t) => t.id !== id); }
function advance(ms) {
  const end = now + ms;
  for (;;) {
    q.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = q[0]; if (!t || t.at > end) break;
    q.shift(); now = t.at; t.fn();
  }
  now = end;
}

let context = null;
try {
  // --- host: real extension.js under a fake vscode, temp HOME ---
  fs.mkdirSync(path.join(HOME, '.claude', 'projects'), { recursive: true });
  process.env.HOME = HOME; process.env.CUC_TEST = '1';
  const noop = () => ({ dispose() {} });
  let provider = null;
  const config = {};
  const vscodeStub = {
    window: {
      createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
      createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
      registerWebviewViewProvider: (id, p) => { provider = p; return noop(); },
      onDidChangeWindowState: noop, setStatusBarMessage() {}, showInformationMessage() {}, showWarningMessage() {}
    },
    commands: { executeCommand: () => Promise.resolve(), registerCommand: noop },
    workspace: { onDidChangeConfiguration: noop, getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d), update: () => Promise.resolve() }), workspaceFolders: undefined },
    Uri: { joinPath: (base, ...p) => ({ fsPath: path.join(base.fsPath, ...p), toString() { return 'file://' + this.fsPath; } }) },
    StatusBarAlignment: { Left: 1 }, ConfigurationTarget: { Global: 1 }, ThemeColor: function () {}
  };
  const mem = (init) => { const data = Object.assign({}, init); return { data, get: (k, d) => (k in data ? data[k] : d), update: (k, v) => { data[k] = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); return Promise.resolve(); } }; };
  const gs = mem({
    agentXpV2: { agents: {}, seen: {}, backfilled: true },
    creditLedgerV1: { days: { '2026-09-01': { input: START * 100000, output: 0, cache_creation: 0, cache_read: 0 } }, backfilled: true, sweptAt: Date.now() }
  });
  const origLoad = Module._load;
  Module._load = function (req) { return req === 'vscode' ? vscodeStub : origLoad.apply(this, arguments); };
  const ext = require(path.join(EXT, 'extension.js'));
  const bj = require(path.join(EXT, 'blackjack.js'));
  const credits = require(path.join(EXT, 'credits.js'));
  const registry = require(path.join(EXT, 'games', 'registry.js')); // the games list's expectation
  context = { subscriptions: [], globalState: gs, workspaceState: mem({}), secrets: { get: async () => undefined, delete: async () => {} }, extensionUri: { fsPath: EXT } };
  ext.activate(context);

  // host <-> webview through the fake clock, like the real async postMessage (order kept).
  // hostDelay stretches the host's replies; intercept lets a test answer a webview message itself;
  // errors collects exceptions from webview handlers and timers (the browser would only log them)
  let toWebview = null, hostOnMessage = null, hostDelay = 1, intercept = null;
  // Every message the webview posted, kept whole and filed by type. A new game needs nothing added
  // here: it asks for its own type with h.sent('mg'). `sentOps` and `sentHl` are the two lists of
  // bare op names that blackjack and High-Low were written against, kept because those two read
  // better for it, not because the store needs them
  const sent = {};
  const sentOf = (k) => (sent[k] = sent[k] || []);
  const hostLog = [], sentOps = [], sentHl = [], errors = [];
  const webviewApi = {
    cspSource: 'csp', asWebviewUri: (u) => u,
    onDidReceiveMessage: (f) => { hostOnMessage = f; return noop(); },
    postMessage: (m) => { hostLog.push({ t: now, type: m.type }); const copy = JSON.parse(JSON.stringify(m)); later(hostDelay, () => toWebview(copy)); return Promise.resolve(true); }
  };
  provider.resolveWebviewView({ webview: webviewApi, visible: true, onDidChangeVisibility: noop });

  // --- webview: the host's HTML in minidom, webview.js in a vm ---
  // a mode may break the page before it is parsed (the asset catalog with no player sprite), and it
  // may say what the webview had stored when it loaded (a reload resuming where it was)
  const html = CASE.html ? CASE.html(webviewApi.html, MODE) : webviewApi.html;
  const doc = createDocument(html);
  let winMessage = null;
  let vsState = (CASE.state && CASE.state[MODE]) || {};
  const roCbs = [];
  const guard = (f) => () => { try { f(); } catch (e) { errors.push(e); } };
  const sandbox = {
    document: doc,
    acquireVsCodeApi: () => ({ getState: () => vsState, setState: (s) => { vsState = s; }, postMessage: (m) => {
      const c = JSON.parse(JSON.stringify(m));
      later(1, () => {
        sentOf(c.type).push(c);
        if (c.type === 'bj') sentOps.push(c.op);
        if (c.type === 'hl') sentHl.push(c.op);
        if (intercept && intercept(c)) return;
        hostOnMessage(c);
      });
    } }),
    requestAnimationFrame: (f) => later(16, guard(() => f(now))),
    setTimeout: (f, ms) => later(ms, guard(f)), clearTimeout: cancel,
    setInterval: () => 0, clearInterval() {},
    matchMedia: (qs) => ({ matches: /(^|-)reduce$/.test(MODE) && /reduced-motion/.test(qs) }), // reduce, header-reduce, hilo-reduce
    ResizeObserver: function (cb) { const rec = { cb, targets: [] }; roCbs.push(rec); this.observe = (t) => rec.targets.push(t); },
    addEventListener: (t, f) => { if (t === 'message') winMessage = f; },
    console
  };
  sandbox.window = sandbox;
  toWebview = (m) => { try { winMessage({ data: m }); } catch (e) { errors.push(e); } };
  vm.createContext(sandbox);
  // Every script the page carries, in the order the HTML lists them: webview.js first, then one
  // panel per registered game. Taken from the rendered HTML rather than listed here, so a game
  // added to games/registry.js is loaded by this harness without touching it
  const scripts = (html.match(/<script src="([^"]+)"><\/script>/g) || [])
    .map((tag) => /src="([^"]+)"/.exec(tag)[1].replace(/^file:\/\//, ''));
  if (scripts.length < 2) throw new Error('expected webview.js plus the games’ panels, got ' + scripts.length);
  for (const src of scripts) vm.runInContext(fs.readFileSync(src, 'utf8'), sandbox, { filename: path.basename(src) });
  doc.ready(); // DOMContentLoaded: webview.js applies the stored view once the panels are in
  advance(50); // ready -> host push -> data

  // --- helpers ---
  const $ = (id) => doc.getElementById(id);
  // A game's panel is built the first time that game is opened, so "not showing" covers both
  // hidden and not yet built. Nobody can see either one
  const notShown = (id) => { const e = $(id); return !e || e.style.display === 'none'; };
  const bodyTabs = () => ['tab-usage', 'tab-agents', 'tab-games', 'game-bj', 'compact'].filter((c) => doc.body.classList.contains(c)).join(' ');
  const inGames = () => doc.body.classList.contains('tab-games');
  const atTable = () => doc.body.classList.contains('game-bj');
  const gameRow = () => doc.querySelector('#panelGames .gm-row');
  // Out of whichever game is open, back to the list. The register is what says which games there
  // are, so a game added to games/registry.js needs no line here: the body carries game-<key> while
  // a game is open and its back arrow is <key>Back
  const openList = () => {
    if (!inGames()) { $('hdCredits').click(); advance(5); }
    for (const g of registry.GAMES) {
      if (!doc.body.classList.contains('game-' + g.key)) continue;
      const back = $(g.key + 'Back');
      if (back) { back.click(); advance(5); }
    }
  };
  // The list row that opens a game, by id rather than by its place in the list: a game added above
  // another one must not move anybody else's test
  const rowFor = (id) => doc.querySelector('#panelGames .gm-row[data-game="' + id + '"]');
  const openGame = (id) => { openList(); rowFor(id).click(); advance(20); };
  const openTable = () => { openList(); gameRow().click(); advance(5); latchIdle(); };
  const reopenTable = () => { $('bjBack').click(); advance(5); gameRow().click(); advance(5); }; // forces a fresh 'open'
  // no blackjack table built (another game's mode) means no cards, not a crash: watch() is shared
  const dealerCards = () => { const fan = $('bjDFan'); return fan ? fan.children : []; };
  const allCards = () => [...dealerCards()].map((c, i) => ({ key: 'D' + i, el: c })).concat(
    [...doc.querySelectorAll('#bjHands .bj-p')].flatMap((row) => [...row.querySelector('.bj-fan').children].map((c, i) => ({ key: 'P' + row.getAttribute('data-h') + '.' + i, el: c }))));
  const isBack = (c) => c.innerHTML.includes('fill="#e8895a"');
  const lineText = (h) => { const r = doc.querySelector('#bjHands .bj-p[data-h="' + h + '"] .bj-line'); return r ? r.textContent : null; };
  const hdrBal = () => $('ccBal').textContent;
  // the dealer's image, latched the first time the table is built (the panel does not exist
  // before that) so a later hand can be checked against it
  let idleSrc = null;
  const latchIdle = () => { const e = $('bjCrab'); if (idleSrc == null && e) idleSrc = e.getAttribute('src'); };
  const active = () => doc.activeElement;
  const activeName = () => { const a = active(); return a ? (a.id || a.getAttribute('data-op') || a.localName) : 'none'; };
  const mouseClick = (e) => { e.focus(); e.click(); }; // Chromium focuses a button it clicks
  const ledgerBalance = () => credits.creditSummary(credits.normalizeLedger(gs.data.creditLedgerV1), 'x', false).balance;
  function useSeed(want, tag) {
    for (let i = 0; i < 20000; i++) { const s = tag + i; if (want(bj.newRound({ seed: s, bet: 10 }))) { ext._test.setBjSeeds(() => s); return s; } }
    throw new Error('no seed for ' + tag);
  }
  // Stand until the hand is over, at most `max` times: a stand that stops working fails here instead of looping forever
  function standOut(max) {
    for (let k = 0; k < (max || 4) && !$('bjPlay').hidden; k++) { doc.dispatchKey('s'); advance(2); advance(4000); }
    return $('bjPlay').hidden;
  }
  // Watch every card and the lines 1ms at a time for `ms`; returns first-seen times relative to the start
  function watch(ms, extra) {
    const t0 = now, seen = {}, flips = {}, faces = {}, lines = {}, marks = {};
    const snap = () => {
      for (const { key, el } of allCards()) {
        if (!el.classList.contains('pending') && seen[key] == null) seen[key] = now - t0;
        if (el.classList.contains('flip') && flips[key] == null) flips[key] = now - t0;
        if (key === 'D1' && !isBack(el) && faces[key] == null && seen[key] != null) faces[key] = now - t0;
      }
      const l0 = lineText(0); if (l0 && lines.p0 == null) lines.p0 = now - t0;
      const dl = $('bjDTot') && $('bjDTot').textContent; if (dl && lines.d == null) lines.d = now - t0;
      if (extra) extra(marks, now - t0);
    };
    snap();
    for (let i = 0; i < ms; i++) { advance(1); snap(); }
    return { seen, flips, faces, lines, marks };
  }
  // after each hand the no-reply timer must be gone: 5 more seconds and still no error
  function noStaleTimer(tag) { advance(5000); ok(tag + ': no "didn’t respond" error 5s later', $('bjErr').hidden); }

  console.log('mode=' + MODE + ' start=' + START + ' case=' + CASE.file);

  // --- the handle a mode file is given -----------------------------------------------------
  // Everything above, named. Three of these are PROPERTIES rather than functions because a mode
  // assigns to them (`h.intercept = fn` answers a message itself, `h.hostDelay = 5000` stretches the
  // host's replies) and two are getters over values that move under them (`h.now` is the fake
  // clock, `h.idleSrc` is latched the first time a table is built).
  // Nothing in here is per-game. A new game asks for its own messages with h.sent('<key>') and
  // opens its own screen with h.openGame('<id>')
  const h = {
    MODE, START, EXT, path,
    ok, advance, later,
    pending: (ms) => q.filter((t) => t.at > now + (ms || 0)).length,  // pacing timers still to fire
    doc, $, notShown, bodyTabs, inGames, atTable, gameRow, rowFor, openGame, openList, openTable,
    reopenTable, dealerCards, allCards, isBack, lineText, hdrBal, latchIdle, active, activeName,
    mouseClick, ledgerBalance, useSeed, standOut, watch, noStaleTimer,
    sent: sentOf, sentOps, sentHl, hostLog, errors, roCbs,
    toWebview: (m) => toWebview(m),
    hostSend: (m) => hostOnMessage(m),
    ext, bj, credits, registry, gs, config
  };
  Object.defineProperty(h, 'now', { get: () => now });
  Object.defineProperty(h, 'idleSrc', { get: () => idleSrc });
  Object.defineProperty(h, 'intercept', { get: () => intercept, set: (v) => { intercept = v; } });
  Object.defineProperty(h, 'hostDelay', { get: () => hostDelay, set: (v) => { hostDelay = v; } });

  CASE.run(h, MODE);
} catch (e) {
  fails++;
  console.log('FAIL uncaught: ' + (e && e.stack || e));
} finally {
  if (context) context.subscriptions.forEach((s) => { try { s.dispose(); } catch (e) { /* teardown only */ } });
  fs.rmSync(HOME, { recursive: true, force: true });
}
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
