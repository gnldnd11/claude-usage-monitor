// Blackjack table, end to end: the real extension.js host, the real blackjack.js engine and the real
// webview.js, on the HTML the host itself renders, loaded into minidom. Messages and timers run on a
// fake clock, so every timing below is in that clock's milliseconds.
// Run one mode: node test/webview/table.test.js <mode>   (test/webview/run.js runs them all)
// Modes: normal, reduce, poor50, poor5, compact, badtab, nohero, resume-list, resume-bj,
//        hilo, hilo-reduce, hilo-poor, header, header-reduce
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { createDocument } = require('./minidom');

const MODE = process.argv[2] || 'normal';
const EXT = process.env.EXT || path.join(__dirname, '..', '..');
const START = { poor50: 50, poor5: 5, 'hilo-poor': 5 }[MODE] || 1000;
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
  context = { subscriptions: [], globalState: gs, workspaceState: mem({}), secrets: { get: async () => undefined, delete: async () => {} }, extensionUri: { fsPath: EXT } };
  ext.activate(context);

  // host <-> webview through the fake clock, like the real async postMessage (order kept).
  // hostDelay stretches the host's replies; intercept lets a test answer a webview message itself;
  // errors collects exceptions from webview handlers and timers (the browser would only log them)
  let toWebview = null, hostOnMessage = null, hostDelay = 1, intercept = null;
  const hostLog = [], sentOps = [], sentHl = [], errors = [];
  const webviewApi = {
    cspSource: 'csp', asWebviewUri: (u) => u,
    onDidReceiveMessage: (f) => { hostOnMessage = f; return noop(); },
    postMessage: (m) => { hostLog.push({ t: now, type: m.type }); const copy = JSON.parse(JSON.stringify(m)); later(hostDelay, () => toWebview(copy)); return Promise.resolve(true); }
  };
  provider.resolveWebviewView({ webview: webviewApi, visible: true, onDidChangeVisibility: noop });

  // --- webview: the host's HTML in minidom, webview.js in a vm ---
  let html = webviewApi.html;
  if (MODE === 'nohero') { // an asset catalog without the player sprite: the seat stays empty
    const m = /data-json='([^']*)'/.exec(html);
    const decode = (x) => x.replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    const cat = JSON.parse(decode(m[1]));
    delete cat.npcs.player;
    html = html.replace(m[1], JSON.stringify(cat).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;'));
  }
  const doc = createDocument(html);
  let winMessage = null;
  let vsState = { compact: { tab: 'usage', compact: true }, badtab: { tab: 'bogus' },
    'resume-list': { tab: 'games', lastTab: 'usage' }, 'resume-bj': { tab: 'games', game: 'blackjack', lastTab: 'agents' } }[MODE] || {};
  const roCbs = [];
  const guard = (f) => () => { try { f(); } catch (e) { errors.push(e); } };
  const sandbox = {
    document: doc,
    acquireVsCodeApi: () => ({ getState: () => vsState, setState: (s) => { vsState = s; }, postMessage: (m) => {
      const c = JSON.parse(JSON.stringify(m));
      later(1, () => { if (c.type === 'bj') sentOps.push(c.op); if (c.type === 'hl') sentHl.push(c.op); if (intercept && intercept(c)) return; hostOnMessage(c); });
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
  vm.runInContext(fs.readFileSync(path.join(EXT, 'webview.js'), 'utf8'), sandbox, { filename: 'webview.js' });
  advance(50); // ready -> host push -> data

  // --- helpers ---
  const $ = (id) => doc.getElementById(id);
  const bodyTabs = () => ['tab-usage', 'tab-agents', 'tab-games', 'game-bj', 'compact'].filter((c) => doc.body.classList.contains(c)).join(' ');
  const inGames = () => doc.body.classList.contains('tab-games');
  const atTable = () => doc.body.classList.contains('game-bj');
  const gameRow = () => doc.querySelector('#panelGames .gm-row');
  const openList = () => { // out of whichever game is open, back to the list
    if (!inGames()) { $('hdCredits').click(); advance(5); }
    if (doc.body.classList.contains('game-bj')) { $('bjBack').click(); advance(5); }
    if (doc.body.classList.contains('game-hl')) { $('hlBack').click(); advance(5); }
  };
  const openTable = () => { openList(); gameRow().click(); advance(5); };
  const reopenTable = () => { $('bjBack').click(); advance(5); gameRow().click(); advance(5); }; // forces a fresh 'open'
  const dealerCards = () => $('bjDFan').children;
  const allCards = () => [...dealerCards()].map((c, i) => ({ key: 'D' + i, el: c })).concat(
    [...doc.querySelectorAll('#bjHands .bj-p')].flatMap((row) => [...row.querySelector('.bj-fan').children].map((c, i) => ({ key: 'P' + row.getAttribute('data-h') + '.' + i, el: c }))));
  const isBack = (c) => c.innerHTML.includes('fill="#e8895a"');
  const lineText = (h) => { const r = doc.querySelector('#bjHands .bj-p[data-h="' + h + '"] .bj-line'); return r ? r.textContent : null; };
  const hdrBal = () => $('ccBal').textContent;
  const idleSrc = $('bjCrab') && $('bjCrab').getAttribute('src');
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
      const dl = $('bjDTot').textContent; if (dl && lines.d == null) lines.d = now - t0;
      if (extra) extra(marks, now - t0);
    };
    snap();
    for (let i = 0; i < ms; i++) { advance(1); snap(); }
    return { seen, flips, faces, lines, marks };
  }
  // after each hand the no-reply timer must be gone: 5 more seconds and still no error
  function noStaleTimer(tag) { advance(5000); ok(tag + ': no "didn’t respond" error 5s later', $('bjErr').hidden); }

  console.log('mode=' + MODE + ' start=' + START);

  if (MODE === 'header' || MODE === 'header-reduce') {
    // the header credits line, re-checked on the real HTML now that it is a button
    const R = MODE === 'header-reduce';
    const box = $('hdCredits'), bal = $('ccBal'), coin = box.querySelector('.cc-coin');
    const base = { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] } };
    const push = (c, extra) => { toWebview({ type: 'data', data: Object.assign({}, base, { credits: c }, extra || {}) }); };
    const C = (balance, frac, counting, today) => ({ balance, today: today || 0, frac: frac || 0, perCredit: 100000, counting: !!counting });
    const lit = () => doc.querySelectorAll('#hdCredits .cc-r.on').length;
    const clear = () => { bal.classList.remove('roll'); coin.classList.remove('flip'); advance(1000); };
    function paint(ms) { const out = []; for (let i = 0; i < ms; i += 16) { advance(16); out.push(bal.textContent); } return out.filter((v, i, a) => v !== a[i - 1]); }
    const num = (x) => Number(String(x).replace(/,/g, ''));
    push(C(0)); advance(600);
    ok('zero: "0", no rows', bal.textContent === '0' && lit() === 0, bal.textContent);
    ok('title: weighted wording and the way in', box.title === '0 credits · +0 today\n1 credit per 100k tokens, weighted by API price\nClick for games', JSON.stringify(box.title));
    clear(); push(C(12, 0.5, true)); advance(600);
    ok('counting: class, rows 3, title', box.classList.contains('counting') && lit() === 3 && box.title === 'Counting past sessions…\n12 credits so far\nClick for games', JSON.stringify(box.title));
    clear(); push(C(15370, 0.22)); const land = paint(600);
    ok('landing after counting: counted up, no flip, no roll', (R ? land.length === 1 : land.length > 3) && !coin.classList.contains('flip') && !bal.classList.contains('roll') && bal.textContent === '15,370', land.length + ' distinct');
    const mint = (from, to, frac) => { clear(); push(C(from, 0.9)); advance(700); clear(); push(C(to, frac || 0.05)); return { flip: coin.classList.contains('flip'), roll: bal.classList.contains('roll'), rows: lit() }; };
    let m = mint(15370, 15371);
    ok('+1: roll and coin flip (all rows lit)' + (R ? ' [reduced motion: none]' : ''), R ? (!m.flip && !m.roll) : (m.flip && m.roll && m.rows === 6), JSON.stringify(m));
    if (!R) { advance(200); ok('+1: fresh coin at 200ms', lit() === 0, 'rows ' + lit()); coin.dispatchEvent({ type: 'animationend', animationName: 'ccFlip' }); ok('flip class dropped on animationend', !coin.classList.contains('flip')); }
    m = mint(16000, 16019); ok('+19: still a mint' + (R ? ' [reduced motion: none]' : ''), R ? !m.flip : m.flip && m.roll, JSON.stringify(m));
    m = mint(17000, 17020); ok('+20: a landing, no flip, no roll', !m.flip && !m.roll, JSON.stringify(m));
    m = mint(18000, 18300); ok('+300: a landing, no flip, no roll', !m.flip && !m.roll, JSON.stringify(m));
    clear(); push(C(18300)); advance(700); clear(); push(C(18250)); const down = paint(600);
    ok('decrease: counts down, no flip, no roll', !coin.classList.contains('flip') && !bal.classList.contains('roll') && bal.textContent === '18,250' && down.every((v, i) => i === 0 || num(v) <= num(down[i - 1])), down.join('>'));
    // fit: the observer must watch the parent (.ttl), not the fit-content button
    const fitRec = roCbs.find((r) => r.targets.some((t) => t === box.parentNode));
    ok('fit observer watches the parent .ttl', !!fitRec && box.parentNode.classList.contains('ttl'));
    let W = 300; Object.defineProperty(box, 'clientWidth', { get: () => W, configurable: true });
    Object.defineProperty(box, 'scrollWidth', { get: () => 16 + (box.classList.contains('fit2') ? 0 : 4 + bal.textContent.length * 7) + (box.classList.contains('fit1') ? 0 : 49), configurable: true });
    const fit = () => fitRec.cb();
    fit(); ok('fit: wide -> nothing dropped', !box.classList.contains('fit1') && !box.classList.contains('fit2'));
    W = 70; fit(); ok('fit: 70px -> word dropped', box.classList.contains('fit1') && !box.classList.contains('fit2'));
    W = 30; fit(); ok('fit: 30px -> number dropped too', box.classList.contains('fit2'));
    W = 300; fit(); ok('fit: widening brings both back', !box.classList.contains('fit1') && !box.classList.contains('fit2'));
    push(C(18250), { cfg: { panelHidden: ['credits'] } }); advance(5);
    ok('hidden from settings', box.style.display === 'none');
    push(C(18250), { cfg: { panelHidden: [] } }); advance(5);
    ok('shown again', box.style.display === '');
  } else if (MODE === 'compact') {
    // Usage compact must survive the selector swap: tab-usage is on the body whenever Usage shows
    ok('initial load (stored tab usage, compact): body has tab-usage + compact', bodyTabs() === 'tab-usage compact', bodyTabs());
    $('hdCredits').click(); advance(20);
    ok('games: tab-usage gone (compact rules off), compact kept for later', bodyTabs() === 'tab-games compact', bodyTabs());
    ok('games: header chevron hidden by body:not(.tab-usage) rule', /body:not\(\.tab-usage\) \.toggle\{display:none;\}/.test(doc.querySelector('style').textContent));
    $('hdCredits').click(); advance(20);
    ok('back to usage: tab-usage + compact again', bodyTabs() === 'tab-usage compact', bodyTabs());
    $('tabAgents').click(); advance(5); ok('agents: tab-agents only', bodyTabs() === 'tab-agents compact', bodyTabs());
    $('tabUsage').click(); advance(5); ok('usage again', bodyTabs() === 'tab-usage compact', bodyTabs());
    const css = doc.querySelector('style').textContent;
    ok('no body:not(.tab-agents) selector left; six body.tab-usage.compact rules', !css.includes('body:not(.tab-agents)') && (css.match(/body\.tab-usage\.compact/g) || []).length === 6);
  } else if (MODE === 'nohero') {
    // no player sprite in the catalog: the seat is empty and everything else still works
    openTable();
    ok('no player sprite: nothing sits at the table', doc.querySelectorAll('#bjHands .bj-hero').length === 0);
    ok('no player sprite: the stake preview and Deal are there', doc.querySelector('#bjHands .bj-stake.preview b').textContent === '10' && !$('bjDeal').disabled);
    useSeed((st) => st.phase === 'player', 'nohero-');
    $('bjDeal').click(); advance(2); advance(1200);
    ok('no player sprite: a hand still deals and shows', allCards().length === 4 && lineText(0) && !$('bjPlay').hidden, 'cards ' + allCards().length);
    ok('no player sprite: still no hero after the deal', doc.querySelectorAll('#bjHands .bj-hero').length === 0);
  } else if (MODE === 'badtab') {
    ok('an unknown stored tab falls back to Usage', bodyTabs() === 'tab-usage' && $('panelUsage').style.display === '' && $('panelGames').style.display === 'none' && $('panelTable').style.display === 'none', bodyTabs());
  } else if (MODE.indexOf('hilo') === 0) {
    // The real host and the real engine. Situations (a tie, a wrong call, a card with only one live
    // side) are made by searching the engine for a seed, exactly as the blackjack modes do. A seed
    // does not name a run by itself, because the host carries the shoe from run to run, so the
    // search runs against the deck the host is holding (_test.hlDeck) and the run it finds is the
    // run the host will deal. That is what makes the expectations below exact.
    const highlow = require(path.join(EXT, 'highlow.js'));
    const R = MODE === 'hilo-reduce';
    const BET = 10;
    function hlSeed(want, tag) {
      const deck = ext._test.hlDeck();
      for (let i = 0; i < 20000; i++) {
        const seed = tag + i;
        const run = highlow.newRun({ seed, id: 't', bet: BET, deck });
        if (want(run, highlow.view(run, 1e9))) { ext._test.setHlSeeds(() => seed); return run; }
      }
      throw new Error('no High-Low seed for ' + tag);
    }
    const line = () => $('hlLine').textContent;
    const cardW = (id) => { const svg = $(id).querySelector('svg'); return svg ? svg.getAttribute('width') : null; };
    const chip = () => { const c = doc.querySelector('#hlLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const settle = () => advance(600);
    const money = (n) => Math.round(n).toLocaleString('en-US'); // the same formatting the header uses
    // What a guess button must read: the multiple is read back from the pot the host says a correct
    // call pays, floored, so the price on the button is never one the table cannot honour
    const xOf = (pays, pot) => { const m = pays / pot; return '×' + (m >= 10 ? Math.floor(m) : (Math.floor(m * 10) / 10).toFixed(1)); };
    // hidden mid-animation and empty (or never set, under reduced motion) the rest of the time
    const heroHidden = () => $('hlCard').style.visibility === 'hidden';
    const said = () => $('hlLive').textContent;
    const word = (c) => (({ A: 'ace', J: 'jack', Q: 'queen', K: 'king' })[c.r] || c.r) + ' of ' + ({ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' })[c.s];
    const chips = () => doc.querySelectorAll('#hlStakes button').map((b) => b.getAttribute('data-v') + (b.disabled ? '-off' : '-on')).join(' ');
    openList(); doc.querySelectorAll('#panelGames .gm-row')[1].click(); advance(20);
    ok('the second row opens High-Low and asks the host for its state',
      doc.body.classList.contains('game-hl') && $('panelHiLo').style.display === '' && $('panelTable').style.display === 'none' && sentHl.join() === 'open', bodyTabs() + ' ' + sentHl.join());
    if (MODE === 'hilo-poor') {
      ok('not enough credits: chips off, Deal off, note shown',
        doc.querySelectorAll('#hlStakes button').every((b) => b.disabled) && $('hlDeal').disabled && !$('hlNote').hidden && $('hlNote').textContent === 'You need 10 credits to play.', $('hlNote').textContent);
    } else {
      ok('betting: a dim pot preview of the stake, Deal ready and focused',
        doc.querySelector('#hlLine .hl-pot.preview b').textContent === '10' && !$('hlDeal').disabled && active() === $('hlDeal'), line() + ' focus ' + activeName());

      // --- a run that wins a call and is cashed out ---
      let run = hlSeed((r, v) => v.odds.higher != null && v.odds.lower != null && highlow.act(r, 'higher').history[0].result === 'win', 'hl-win-');
      const afterCall = highlow.act(run, 'higher');
      const cashed = highlow.act(afterCall, 'cashout');
      const v0 = highlow.view(run, 1e9);
      doc.pressKey('Enter'); advance(2);
      const w1 = watch(400, (marks, t) => { if (!$('hlPlay').hidden && !doc.querySelector('#hlPlay [data-op="higher"]').disabled && marks.unlock == null) marks.unlock = t; });
      ok('deal: one hero card at 4px cells, no pile yet', cardW('hlCard') === '64' && !$('hlPrev').querySelector('svg'), cardW('hlCard'));
      ok('deal: the pot shows and the guesses unlock', line().indexOf(String(BET)) >= 0 && w1.marks.unlock <= (R ? 1 : 200), 'unlock ' + w1.marks.unlock + ' line ' + line());
      ok('the buttons price what a correct call really pays', $('hlUp').textContent === xOf(v0.pays.higher, v0.pot) && $('hlDn').textContent === xOf(v0.pays.lower, v0.pot),
        $('hlUp').textContent + ' ' + $('hlDn').textContent + ' engine pays ' + v0.pays.higher + '/' + v0.pays.lower + ' on a pot of ' + v0.pot);
      ok('cash out is closed until the first call', doc.querySelector('#hlPlay [data-op="cashout"]').disabled && v0.can.cashout === false);
      const potBefore = line(), upBefore = $('hlUp').textContent;
      doc.pressKey('ArrowUp'); advance(2);
      const seen = { line: null, odds: null, prev: null };
      for (let i = 0; i <= 320; i++) {
        if (seen.prev == null && $('hlPrev').querySelector('svg')) seen.prev = i;
        if (seen.line == null && line() !== potBefore) seen.line = i;
        if (seen.odds == null && $('hlUp').textContent !== upBefore) seen.odds = i;
        advance(1);
      }
      ok('a call: the card called on drops to the pile at 32px', cardW('hlPrev') === '32' && seen.prev <= 2, 'pile at ' + seen.prev + 'ms, width ' + cardW('hlPrev'));
      ok('a call: the pot and the odds wait for the card', R ? (seen.line <= 1 && seen.odds <= 1) : (seen.line === 220 && seen.odds === 220), 'pot at ' + seen.line + 'ms, odds at ' + seen.odds + 'ms');
      ok('a call: the pot is the engine’s', line().indexOf(String(afterCall.pot)) >= 0, line() + ' engine pot ' + afterCall.pot);
      // nothing above this line reaches a screen reader: the cards are drawn as bare divs over
      // aria-hidden art, so the hero card has to carry its own name and the move has to be read out
      ok('a call is read out, and the hero card carries its own name',
        said() === 'Higher: right. ' + word(highlow.view(afterCall, 1e9).card) + '. Pot ' + money(afterCall.pot) + '.'
        && $('hlCard').getAttribute('aria-label') === 'Face up: ' + word(highlow.view(afterCall, 1e9).card),
        JSON.stringify(said()) + ' label ' + JSON.stringify($('hlCard').getAttribute('aria-label')));
      doc.pressKey('c'); settle();
      ok('cash out: a win chip carrying the engine’s net, and the cards stay',
        chip() === 'bj-chip win Cashed out +' + money(cashed.net) && !!$('hlCard').querySelector('svg'), chip() + ' engine net ' + cashed.net);
      ok('cash out: back to the bet controls', !$('hlBet').hidden && $('hlPlay').hidden && !$('hlDeal').disabled);
      ok('cash out is read out with the balance', said() === 'Cashed out +' + money(cashed.net) + '. Balance ' + hdrBal() + '.', JSON.stringify(said()));

      // --- a tie carries the pot ---
      run = hlSeed((r) => highlow.act(r, 'higher').history[0].result === 'push', 'hl-tie-');
      const tied = highlow.act(run, 'higher');
      doc.pressKey('Enter'); settle();
      const potAtDeal = line();
      doc.pressKey('ArrowUp'); settle();
      ok('a tie carries the pot and the run goes on', line() === potAtDeal && $('hlPlay').hidden === false && tied.phase === 'play' && tied.pot === run.pot, line() + ' vs ' + potAtDeal);
      ok('only the latest card is kept as the pile', doc.querySelectorAll('#hlPrev svg').length === 1, doc.querySelectorAll('#hlPrev svg').length + ' piles');
      const tiedOut = highlow.act(tied, 'cashout');
      doc.pressKey('c'); settle();

      // --- a wrong call loses the opening bet, never the pot ---
      run = hlSeed((r) => { const a = highlow.act(r, 'higher'); return a.phase === 'done' && a.ended === 'wrong'; }, 'hl-lose-');
      const lost = highlow.act(run, 'higher');
      doc.pressKey('Enter'); settle();
      doc.pressKey('ArrowUp'); settle();
      ok('a wrong call: a lose chip carrying the engine’s net, bet controls back',
        chip() === 'bj-chip lose Wrong −' + money(Math.abs(lost.net)) && lost.net === -BET && !$('hlBet').hidden, chip() + ' engine net ' + lost.net);

      // --- a card with only one live side shows a dash and disables it ---
      run = hlSeed((r, v) => v.odds.lower == null || v.odds.higher == null, 'hl-edge-');
      const vEdge = highlow.view(run, 1e9);
      const dead = vEdge.odds.lower == null ? 'lower' : 'higher';
      const live = dead === 'lower' ? 'higher' : 'lower';
      doc.pressKey('Enter'); settle();
      ok('a side that cannot happen shows a dash and is disabled',
        $(dead === 'lower' ? 'hlDn' : 'hlUp').textContent === '—' && doc.querySelector('#hlPlay [data-op="' + dead + '"]').disabled
        && !doc.querySelector('#hlPlay [data-op="' + live + '"]').disabled, $('hlUp').textContent + '/' + $('hlDn').textContent + ' dead ' + dead);
      doc.pressKey(dead === 'lower' ? 'ArrowUp' : 'ArrowDown'); settle();
      if (!$('hlPlay').hidden) { doc.pressKey('c'); settle(); }

      // --- the shortcuts belong to this game only ---
      const hlBefore = sentHl.length;
      openList(); doc.pressKey('ArrowUp'); doc.pressKey('c'); doc.pressKey('Enter', { target: doc.body }); advance(5);
      ok('guard: High-Low keys do nothing on the list', sentHl.length === hlBefore, sentHl.slice(hlBefore).join());
      gameRow().click(); advance(20); doc.pressKey('ArrowUp'); doc.pressKey('c'); advance(20); // Enter would legitimately deal blackjack here
      ok('guard: High-Low keys do nothing at the blackjack table', sentHl.length === hlBefore && sentOps.indexOf('higher') < 0, sentOps.slice(-3).join() + ' hl ' + sentHl.slice(hlBefore).join());
      $('bjBack').click(); advance(5); doc.querySelectorAll('#panelGames .gm-row')[1].click(); advance(20);
      const opsBefore = sentOps.length;
      doc.dispatchKey('s'); doc.dispatchKey('h'); advance(5);
      ok('guard: blackjack keys do nothing at High-Low', sentOps.length === opsBefore, sentOps.slice(opsBefore).join());

      // --- a run survives walking out of it and back in (the host keeps it; the screen asks again) ---
      const backRun = hlSeed((r, v) => v.odds.higher != null && highlow.act(r, 'higher').phase === 'play', 'hl-back-');
      const backState = highlow.view(highlow.act(backRun, 'higher'), 1e9); // what the host holds after the call below
      doc.pressKey('Enter'); settle();
      doc.pressKey('ArrowUp'); settle();
      const midCard = $('hlCard').innerHTML, midLine = line(), midUp = $('hlUp').textContent;
      openList(); advance(5);
      doc.querySelectorAll('#panelGames .gm-row')[1].click(); advance(20);
      ok('back from the list mid-run: the same card, pot and prices, the guesses live',
        $('hlCard').innerHTML === midCard && line() === midLine && $('hlUp').textContent === midUp && !$('hlPlay').hidden && $('hlBet').hidden,
        line() + ' vs ' + midLine + ', up ' + $('hlUp').textContent + ' vs ' + midUp);
      ok('back from the list mid-run: the card did not deal itself again', !heroHidden() && !$('hlCard').classList.contains('in'));

      // --- a refused move draws no cards: nothing happened, so nothing moves ---
      // The host answers a move it will not allow with the run exactly as it stands plus an error.
      // Replaying the pacing on that would drop the same card onto the felt a second time
      intercept = (m) => {
        if (m.op !== 'higher') return false;
        intercept = null;
        later(1, () => toWebview({ type: 'hl', n: m.n, state: backState, error: 'nothing beats this card', balance: ledgerBalance(), free: ledgerBalance() }));
        return true;
      };
      doc.pressKey('ArrowUp'); advance(3);
      ok('a refused move: the notice shows and the hero card is not re-dealt',
        !$('hlErr').hidden && !heroHidden() && !$('hlCard').classList.contains('in')
        && !$('hlPrev').classList.contains('drop'), $('hlErr').textContent + ' vis ' + JSON.stringify($('hlCard').style.visibility));
      advance(600);
      ok('a refused move: the pot and the prices are untouched and the buttons come back',
        line() === midLine && $('hlUp').textContent === midUp && !doc.querySelector('#hlPlay [data-op="cashout"]').disabled, line() + ' up ' + $('hlUp').textContent);
      doc.pressKey('c'); settle();

      // --- the other game's stake is not this one's to bet ---
      // Blackjack holds nearly the whole purse open, so High-Low has to count what is left, not the
      // header number. Crossing straight from a mid-deal table into High-Low must also let the
      // header move again: the table's hold on it goes when the table is left
      useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').net >= 0, 'hl-cross-');
      openList(); gameRow().click(); advance(5);
      const purse = ledgerBalance();
      // the chips only offer 10/100/1000; the host takes any whole bet, and this one leaves 9 credits
      $('bjDeal').setAttribute('data-bet', String(purse - 9));
      $('bjDeal').click(); advance(2);
      const paced = () => q.filter((t) => t.at > now + 50).length; // pacing and settle timers still to fire
      const pacedBj = paced(); // the deal is still being paced
      openList(); doc.querySelectorAll('#panelGames .gm-row')[1].click(); advance(20);
      ok('blackjack holding the purse: every High-Low chip is off and the note says who has them',
        chips() === '10-off 100-off 1000-off' && !$('hlNote').hidden && $('hlDeal').disabled,
        chips() + ' note ' + JSON.stringify($('hlNote').textContent) + ' purse ' + purse);
      ok('crossing from a mid-deal table into High-Low drops the table\u2019s pacing',
        (R || pacedBj > 0) && paced() === 0, pacedBj + ' -> ' + paced());
      toWebview({ type: 'data', data: { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: purse, today: 111, frac: 0.5, perCredit: 100000, counting: false } } });
      advance(5);
      ok('crossing from a mid-deal table into High-Low releases the header hold',
        /\+111 today/.test($('hdCredits').title) && (R || pacedBj > 0), JSON.stringify($('hdCredits').title) + ' paced ' + pacedBj);
      openList(); gameRow().click(); advance(5);
      ok('and the blackjack hand is still live after the detour', !$('bjPlay').hidden, sentOps.slice(-2).join());
      standOut(4); advance(4000);
      openList(); doc.querySelectorAll('#panelGames .gm-row')[1].click(); advance(20);
      ok('with the table settled the chips come back', chips().indexOf('10-on') === 0 && $('hlNote').hidden && !$('hlDeal').disabled, chips());

      // --- walking out mid-run must not freeze the header ---
      hlSeed(() => true, 'hl-leave-');
      doc.pressKey('Enter'); settle(); doc.pressKey('ArrowUp'); advance(2);
      $('hdCredits').click(); advance(5);
      toWebview({ type: 'data', data: { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: 4321, today: 777, frac: 0.5, perCredit: 100000, counting: false } } });
      advance(5);
      ok('leaving mid-run releases the header hold', /\+777 today/.test($('hdCredits').title) && hdrBal() === '4,321', JSON.stringify($('hdCredits').title) + ' ' + hdrBal());

      // --- every rank, at the minimum bet: the button may only print a price the table can pay ---
      // Thirteen stacked shoes, each handed over the way the host hands a reply over, so the whole
      // board is walked without thirteen seed searches. Last in this mode: it leaves a state on
      // screen that the host never dealt
      const RANKS_UP = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const cardsLib = require(path.join(EXT, 'cards.js'));
      const stackOf = (head) => {
        const all = [];
        for (let d = 0; d < cardsLib.DECKS; d++) for (const s of cardsLib.SUITS) for (const r of cardsLib.RANKS) all.push(r + s);
        for (const c of head) all.splice(all.indexOf(c), 1);
        return head.concat(all);
      };
      const bad = [];
      for (const r of RANKS_UP) {
        const st = highlow.newRun({ seed: 'sweep', bet: BET, stack: stackOf([r + 'S']) });
        const v = highlow.view(st, 1e9);
        toWebview({ type: 'hl', state: v }); // no n: a reply nobody is waiting for, so it is drawn as it stands
        advance(5);
        for (const side of ['higher', 'lower']) {
          const txt = $(side === 'higher' ? 'hlUp' : 'hlDn').textContent;
          const want = v.pays[side] == null ? '—' : xOf(v.pays[side], v.pot);
          if (txt !== want) bad.push(r + ' ' + side + ': shows ' + txt + ', should show ' + want + ' (pays ' + v.pays[side] + ' on ' + v.pot + ')');
          // and the number on the button, taken at face value, never asks for more than it pays
          const promised = Math.floor(v.pot * parseFloat(txt.slice(1)));
          if (v.pays[side] != null && promised > v.pays[side]) bad.push(r + ' ' + side + ': ' + txt + ' promises ' + promised + ', pays ' + v.pays[side]);
        }
      }
      ok('every rank at the minimum bet: the price on the button is the pot that really lands', bad.length === 0, bad.slice(0, 4).join(' | '));
    }
  } else if (MODE === 'resume-list' || MODE === 'resume-bj') {
    // a reloaded webview comes back where it was
    if (MODE === 'resume-list') {
      ok('reload with the list stored: the list is back', inGames() && !atTable() && $('panelGames').style.display === '' && $('panelTable').style.display === 'none', bodyTabs());
      ok('reload with the list stored: no game state asked for', sentOps.filter((o) => o === 'open').length === 0, sentOps.join(','));
      $('hdCredits').click(); advance(5);
      ok('and it still leaves to the stored last tab', bodyTabs() === 'tab-usage', bodyTabs());
    } else {
      ok('reload with blackjack stored: the table is back', atTable() && $('panelTable').style.display === '' && $('panelGames').style.display === 'none', bodyTabs());
      ok('reload with blackjack stored: the host was asked for the round', sentOps.filter((o) => o === 'open').length === 1, sentOps.join(','));
      $('bjBack').click(); advance(5);
      ok('back still goes to the list', inGames() && !atTable(), bodyTabs());
      $('hdCredits').click(); advance(5);
      ok('and leaving goes to the stored last tab (agents)', bodyTabs() === 'tab-agents', bodyTabs());
    }
  } else if (MODE === 'poor50' || MODE === 'poor5') {
    openTable();
    const bs = [...doc.querySelectorAll('#bjStakes button')].map((b) => b.getAttribute('data-v') + (b.disabled ? ':off' : ':on') + (b.classList.contains('on') ? '*' : ''));
    const note = $('bjNote');
    if (MODE === 'poor50') {
      ok('50 credits: 10 on and picked, 100 and 1K off', bs.join(' ') === '10:on* 100:off 1000:off', bs.join(' '));
      ok('50 credits: deal enabled with bet 10, no note', !$('bjDeal').disabled && $('bjDeal').getAttribute('data-bet') === '10' && note.hidden);
      ok('disabled chip says why', doc.querySelector('#bjStakes button[data-v="100"]').title === 'Not enough credits');
    } else {
      ok('5 credits: every stake off, nothing picked', bs.join(' ') === '10:off 100:off 1000:off', bs.join(' '));
      ok('5 credits: deal disabled, note shown', $('bjDeal').disabled && !note.hidden && note.textContent === 'You need 10 credits to play.', note.textContent);
    }
  } else {
    const R = MODE === 'reduce';
    // ---------- entry with the mouse, then Enter ----------
    ok('initial: tab-usage on body', bodyTabs() === 'tab-usage', bodyTabs());
    ok('header shows the balance', hdrBal() === '1,000', hdrBal());
    mouseClick($('hdCredits')); advance(20);
    ok('credits click opens the games list, not a game', $('panelGames').style.display === '' && $('panelTable').style.display === 'none' && $('panelUsage').style.display === 'none' && bodyTabs() === 'tab-games' && $('hdCredits').getAttribute('aria-pressed') === 'true', bodyTabs());
    ok('the list has both games with their minimums',
      doc.querySelectorAll('#panelGames .gm-row').map((r) => r.getAttribute('data-game')).join() === 'blackjack,hilo'
      && doc.querySelectorAll('#panelGames .gm-nm').map((e) => e.textContent).join() === 'Blackjack,High-Low'
      && doc.querySelectorAll('#panelGames .gm-sub').every((e) => e.textContent === 'Min bet 10'),
      doc.querySelectorAll('#panelGames .gm-row').map((r) => r.getAttribute('data-game')).join());
    ok('the list takes the focus', active() === gameRow(), 'focus on ' + activeName());
    ok('no felt on the games list', !doc.querySelector('#panelGames .bj-felt') && !$('panelGames').classList.contains('bj-felt'), $('panelGames').className);
    const opens0 = sentOps.filter((o) => o === 'open').length;
    gameRow().click(); advance(5);
    ok('a list row opens that game and asks the host for its state', atTable() && $('panelTable').style.display === '' && $('panelGames').style.display === 'none' && sentOps.filter((o) => o === 'open').length === opens0 + 1, bodyTabs());
    $('bjBack').click(); advance(5);
    ok('back returns to the list', inGames() && !atTable() && $('panelGames').style.display === '' && $('panelTable').style.display === 'none', bodyTabs());
    ok('back leaves the focus on the list', active() === gameRow(), 'focus on ' + activeName());
    $('hdCredits').click(); advance(5);
    ok('credits click from the list leaves for the last tab', bodyTabs() === 'tab-usage', bodyTabs());
    openTable();
    // the felt is the table surface: dealer, rule, hands and net sit on it, the controls do not
    const felt = doc.querySelector('#panelTable .bj-felt');
    const onFelt = (sel) => { const e = doc.querySelector(sel); return !!e && felt.contains(e); };
    ok('the felt holds the dealer row, the rule, the hands and the net',
      !!felt && onFelt('#panelTable .bj-dealer') && onFelt('#panelTable .bj-rule') && onFelt('#bjHands') && onFelt('#bjNet'));
    ok('the heading, the warning and the controls stay off the felt',
      !felt.contains(doc.querySelector('#panelTable .ihead')) && !felt.contains($('bjErr')) && !felt.contains($('bjBet')) && !felt.contains($('bjPlay')) && !felt.contains($('bjNote')));
    ok('the dealer is drawn from the crab asset', /crab\.png$/.test($('bjCrab').getAttribute('src')), $('bjCrab').getAttribute('src'));
    ok('betting: the player sits at the table with a dim stake under them',
      doc.querySelectorAll('#bjHands .bj-hero').length === 1 && doc.querySelector('#bjHands .bj-p[data-h="0"] .bj-hero') && doc.querySelector('#bjHands .bj-stake').classList.contains('preview'),
      doc.querySelector('#bjHands .bj-who').innerHTML.slice(0, 60));
    ok('empty seat with stake preview 10, deal enabled', doc.querySelectorAll('#bjHands .bj-p').length === 1 && doc.querySelector('#bjHands .bj-stake.preview b').textContent === '10' && !$('bjDeal').disabled);
    ok('focus moved from the header button to Deal', active() === $('bjDeal'), 'focus on ' + activeName());

    // ---------- deal (by Enter on the focused Deal) ----------
    const liveSeed = useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').dealer.cards.length >= 4 && bj.act(st, 'stand').net !== 0, 'live-');
    doc.pressKey('Enter'); advance(1); // default action presses Deal, message to the host
    advance(1);                        // reply back
    const w = watch(1200, (marks, t) => { if (!$('bjPlay').hidden && !doc.querySelector('#bjPlay [data-op="stand"]').disabled && marks.unlock == null) marks.unlock = t; });
    ok('Enter dealt and stayed at the table', sentOps[sentOps.length - 1] === 'deal' && bodyTabs() === 'tab-games game-bj', sentOps.slice(-2).join(',') + ' ' + bodyTabs());
    const deal = ['P0.0', 'D0', 'P0.1', 'D1'].map((k) => w.seen[k]);
    if (!R) ok('deal: four cards in at 0/250/500/750ms', JSON.stringify(deal) === '[0,250,500,750]', JSON.stringify(deal));
    else ok('reduced motion: all four cards at once', JSON.stringify(deal) === '[0,0,0,0]', JSON.stringify(deal));
    ok('deal: the hole is a card back', isBack(dealerCards()[1]) && dealerCards()[1].classList.contains('down'));
    ok('deal: totals only after the cards (settle at 750+200+50)', R ? w.lines.p0 <= 1 : w.lines.p0 === 1000, 'player total at ' + w.lines.p0 + 'ms');
    ok('deal: dealer total hidden while the hole is down', !$('bjDTot').textContent);
    ok('deal: actions unlock at settle', R ? w.marks.unlock <= 1 : w.marks.unlock === 1000, 'unlock ' + w.marks.unlock);
    ok('deal: focus on the first action', active() && active().getAttribute('data-op') === 'hit', 'focus on ' + activeName());
    ok('deal: dealer label says the hole is face down', /face down$/.test($('bjDFan').getAttribute('aria-label')), $('bjDFan').getAttribute('aria-label'));

    // ---------- stand: reveal, dealer draws, settle, header ----------
    const before = hdrBal();
    const expect = bj.act(bj.newRound({ seed: liveSeed, bet: 10 }), 'stand');
    const tweenSeen = new Set();
    doc.dispatchKey('s'); advance(1); advance(1);
    const w2 = watch(3000, (marks, t) => {
      tweenSeen.add(hdrBal());
      if (hdrBal() !== before && marks.hdr == null) marks.hdr = t;
      if ($('hdCredits').querySelector('.cc-coin').classList.contains('flip')) marks.coinFlip = true;
      if ($('ccBal').classList.contains('roll')) marks.roll = true;
    });
    const draws = expect.dealer.cards.length - 2;
    const dT = [...Array(draws)].map((_, i) => w2.seen['D' + (i + 2)]);
    const settleAt = 150 + 550 * draws + 200 + 300; // flip at 150, a draw every 550, card-in 200, settle 300
    if (!R) {
      ok('stand: hole flips at 150ms, face swaps at 300ms', w2.flips.D1 === 150 && w2.faces.D1 === 300, 'flip ' + w2.flips.D1 + ' face ' + w2.faces.D1);
      ok('stand: dealer draws every 550ms after the flip', JSON.stringify(dT) === JSON.stringify(dT.map((_, i) => 150 + 550 * (i + 1))), JSON.stringify(dT));
      ok('stand: totals and chips wait for the last card', w2.lines.d === settleAt, 'dealer total at ' + w2.lines.d + ', expected ' + settleAt);
      ok('stand: header held while dealing, moves at settle', w2.marks.hdr === settleAt, 'header moved at ' + w2.marks.hdr);
      ok('stand: header counts up/down (tween), no coin flip, no roll', tweenSeen.size > 3 && !w2.marks.coinFlip && !w2.marks.roll, 'distinct header values ' + tweenSeen.size);
    } else {
      ok('reduced motion stand: final at once', w2.lines.d <= 1 && dealerCards().length === expect.dealer.cards.length && !isBack(dealerCards()[1]), 'dealer total at ' + w2.lines.d);
      ok('reduced motion: header jumps straight, no flip', !w2.marks.coinFlip && tweenSeen.size <= 2, 'distinct ' + tweenSeen.size);
    }
    ok('stand: the dealer stays on the idle image, win or lose', $('bjCrab').getAttribute('src') === idleSrc && $('bjCrab').attrs['data-despair'] === undefined, $('bjCrab').getAttribute('src'));
    const finalBal = (START + expect.net).toLocaleString('en-US');
    ok('stand: header ends at start + net', hdrBal() === finalBal, hdrBal() + ' vs ' + finalBal);
    ok('stand: result chip matches the engine', lineText(0).includes({ win: 'Win', lose: 'Lose', push: 'Push', bust: 'Bust', blackjack: 'Blackjack' }[expect.hands[0].result]), lineText(0));
    ok('stand: bet controls back, focus on Deal', !$('bjBet').hidden && $('bjPlay').hidden && !$('bjDeal').disabled && active() === $('bjDeal'), 'focus on ' + activeName());
    ok('reply went before the data push', (() => { const i = hostLog.map((m) => m.type); const k = i.lastIndexOf('bj'); return i.indexOf('data', k) > k; })(), hostLog.slice(-4).map((m) => m.type).join(','));
    ok('stand: result read out', /^(Win|Lose|Push|Bust|Blackjack).*Balance [\d,]+\.$/.test($('bjLive').textContent), JSON.stringify($('bjLive').textContent));
    ok('stand: dealer label gives the total', /, total \d+$/.test($('bjDFan').getAttribute('aria-label')), $('bjDFan').getAttribute('aria-label'));
    // a resize redraw repeats the result without popping the chips again
    const bodyRo = roCbs.find((r) => r.targets.includes(doc.body));
    bodyRo.cb(); advance(200);
    const chips = doc.querySelectorAll('#bjHands .bj-chip');
    ok('resize redraw: chips drawn still', chips.length > 0 && chips.every((c) => c.classList.contains('still')), chips.map((c) => c.className).join('|'));
    noStaleTimer('stand');

    // ---------- a stake chip picked with the mouse, then Enter deals ----------
    const splitSeed = useSeed((st) => st.phase === 'player' && bj.whyNot(st, 'split') == null && st.hands[0].cards[0].r !== 'A' && bj.act(st, 'split').phase === 'player', 'split-');
    const afterSplit = bj.act(bj.newRound({ seed: splitSeed, bet: 10 }), 'split');
    const wantDim = afterSplit.hands.map((h, i) => (i === afterSplit.active ? 'on' : 'dim')).join(',');
    mouseClick(doc.querySelector('#bjStakes button[data-v="10"]')); advance(1);
    ok('after picking a stake, focus is on Deal', active() === $('bjDeal'), 'focus on ' + activeName());
    doc.pressKey('Enter'); advance(2); advance(1200);
    ok('Enter after a stake pick deals', sentOps[sentOps.length - 1] === 'deal' && !$('bjPlay').hidden, sentOps.slice(-2).join(','));

    // ---------- split ----------
    ok('split offered', !doc.querySelector('#bjPlay [data-op="split"]').hidden && !doc.querySelector('#bjPlay [data-op="split"]').disabled);
    doc.dispatchKey('p'); advance(2);
    const w3 = watch(1500);
    ok('split: two rows', doc.querySelectorAll('#bjHands .bj-p').length === 2);
    ok('split: still one player, on the first row only', doc.querySelectorAll('#bjHands .bj-hero').length === 1 && !!doc.querySelector('#bjHands .bj-p[data-h="0"] .bj-hero'), doc.querySelectorAll('#bjHands .bj-hero').length + ' heroes');
    if (!R) ok('split: new cards at 0 (hand 1) and 250ms (hand 2)', w3.seen['P0.1'] === 0 && w3.seen['P1.1'] === 250, 'P0.1 ' + w3.seen['P0.1'] + ' P1.1 ' + w3.seen['P1.1']);
    const rows = () => [...doc.querySelectorAll('#bjHands .bj-p')].map((r) => r.classList.contains('dim') ? 'dim' : 'on').join(',');
    ok('split: the hand not in play is dimmed', rows() === wantDim, rows() + ' want ' + wantDim);
    ok('split: the round ends within four stands', standOut(4));
    ok('split done: nothing dimmed, net line shown', rows() === 'on,on' && !$('bjNet').hidden && /^Net /.test($('bjNet').textContent), rows() + ' ' + $('bjNet').textContent);
    noStaleTimer('split');

    // ---------- key guards ----------
    useSeed((st) => st.phase === 'player', 'guard-');
    $('bjDeal').click(); advance(2); advance(1200);
    const ops0 = sentOps.length;
    doc.pressKey('s', { target: $('amNick') });
    advance(5); ok('guard: a key typed into an input does not play', sentOps.length === ops0);
    $('settingsSheet').hidden = false; doc.dispatchKey('s'); advance(5); $('settingsSheet').hidden = true;
    ok('guard: an open sheet blocks the keys', sentOps.length === ops0);
    doc.pressKey('s', { target: doc.body, repeat: true }); advance(5);
    ok('guard: a held key (repeat) does not play', sentOps.length === ops0);
    $('tabUsage').click(); advance(2); doc.dispatchKey('s'); doc.dispatchKey('h'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: keys do nothing outside the games area', sentOps.length === ops0 && bodyTabs() === 'tab-usage');
    openList(); doc.dispatchKey('s'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: keys do nothing on the games list either', sentOps.length === ops0, bodyTabs());
    gameRow().click(); advance(5);
    ok('back at the table the hand is still live', !$('bjPlay').hidden, sentOps.slice(-1).join());
    ok('guard: a plain key still plays', standOut(4) && sentOps.slice(ops0).includes('stand'), sentOps.slice(ops0).join(','));

    // ---------- open resumes at once ----------
    useSeed((st) => st.phase === 'player', 'open-');
    $('bjDeal').click(); advance(2); advance(1200);
    const cardsBefore = allCards().length;
    $('hdCredits').click(); advance(5);
    ok('credits click again leaves the game for the last tab', bodyTabs() === 'tab-usage' && $('panelTable').style.display === 'none' && $('panelGames').style.display === 'none', bodyTabs());
    openTable(); advance(2);
    ok('reopen: the live round is drawn at once, nothing pending', allCards().length === cardsBefore && allCards().every((c) => !c.el.classList.contains('pending')) && lineText(0), 'cards ' + allCards().length + ', line ' + lineText(0));
    ok('reopen: actions live again, focus on the first action', !$('bjPlay').hidden && !doc.querySelector('#bjPlay [data-op="stand"]').disabled && active() && active().getAttribute('data-op') === 'hit', 'focus on ' + activeName());
    // an open reply that (wrongly) carries a seq is still drawn at once
    const fake = bj.view(bj.newRound({ seed: 'fake-open', bet: 10 }), 1000);
    intercept = (m) => { if (m.op !== 'open') return false; intercept = null; later(1, () => toWebview({ type: 'bj', n: m.n, state: fake, balance: ledgerBalance() })); return true; };
    reopenTable(); advance(3);
    ok('open with a seq: nothing pending, nothing paced', fake.seq.length > 0 && allCards().every((c) => !c.el.classList.contains('pending')), 'seq ' + fake.seq.length);
    reopenTable(); // re-sync with the host's real round
    ok('the host’s round ends within four stands', standOut(4));
    noStaleTimer('open');

    // ---------- a data push during the deal is held, then applied in full ----------
    useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').net !== 0, 'hold-');
    $('bjDeal').click(); advance(2); advance(1200);
    const b0 = hdrBal();
    const dataOf = (today, frac) => ({ agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: ledgerBalance(), today, frac, perCredit: 100000, counting: false } });
    const rowsLit = () => doc.querySelectorAll('#hdCredits .cc-r.on').length;
    doc.dispatchKey('s'); advance(1); advance(2); // stand reaches the host; its reply and data push come back
    toWebview({ type: 'data', data: dataOf(777, 0.5) }); advance(5); // a push only this test sends: today 777, three coin rows
    if (R) {
      ok('reduced motion: nothing held, the push shows at once', /\+777 today/.test($('hdCredits').title) && rowsLit() === 3, JSON.stringify($('hdCredits').title));
    } else {
      ok('mid-deal: header number and title held', hdrBal() === b0 && !/\+777 today/.test($('hdCredits').title), hdrBal() + ' ' + JSON.stringify($('hdCredits').title));
      advance(4000);
      ok('after settle the held push applies in full (today 777, three coin rows)', /\+777 today/.test($('hdCredits').title) && rowsLit() === 3 && hdrBal() === ledgerBalance().toLocaleString('en-US'), JSON.stringify($('hdCredits').title) + ' rows ' + rowsLit());
    }
    toWebview({ type: 'data', data: dataOf(888, 0) }); advance(5);
    ok('the hold is released: the next push shows at once', /\+888 today/.test($('hdCredits').title), JSON.stringify($('hdCredits').title));
    noStaleTimer('hold');

    // ---------- walking out mid-deal must not freeze the header ----------
    useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').net !== 0, 'leave-');
    openTable(); $('bjDeal').click(); advance(2); advance(1200);
    doc.dispatchKey('s'); advance(1); advance(2); // the reply is in and the cards are still coming
    const paced = () => q.filter((t) => t.at > now + 50).length; // pacing and settle timers still to fire
    const pacedBefore = paced();
    $('hdCredits').click(); advance(5);           // walk out of the games area mid-deal
    ok('leaving mid-deal drops the pacing timers', (MODE === 'reduce' || pacedBefore > 0) && paced() === 0, pacedBefore + ' -> ' + paced());
    ok('leaving mid-deal: out of the games area', bodyTabs() === 'tab-usage', bodyTabs());
    toWebview({ type: 'data', data: dataOf(555, 0.5) }); advance(5);
    ok('leaving mid-deal releases the hold: the header moves again, quietly', /\+555 today/.test($('hdCredits').title) && hdrBal() === ledgerBalance().toLocaleString('en-US')
      && !$('hdCredits').querySelector('.cc-coin').classList.contains('flip') && !$('ccBal').classList.contains('roll'), JSON.stringify($('hdCredits').title) + ' ' + hdrBal());
    advance(5000);
    ok('leaving mid-deal: no stale notice, and the table opens clean again', $('bjErr').hidden && (openTable() || atTable()), bodyTabs());

    // ---------- a late reply (after the no-reply timeout) is drawn without pacing or reactions ----------
    useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').dealer.cards.length >= 3 && bj.act(st, 'stand').net > 0, 'late-');
    $('bjDeal').click(); advance(2); advance(1200);
    const liveBefore = $('bjLive').textContent;
    hostDelay = 5000;
    doc.dispatchKey('s'); advance(2); hostDelay = 1;
    advance(4001);
    ok('late: the no-reply notice shows at 4s', !$('bjErr').hidden);
    advance(1000);
    ok('late reply: drawn at once, nothing pending, notice cleared', allCards().every((c) => !c.el.classList.contains('pending')) && $('bjErr').hidden && !$('bjDFan').children[1].classList.contains('down'));
    advance(2000);
    ok('late reply: not read out, dealer image untouched', $('bjLive').textContent === liveBefore && $('bjCrab').getAttribute('src') === idleSrc, JSON.stringify($('bjLive').textContent));
    ok('late reply: header moved quietly', !$('hdCredits').querySelector('.cc-coin').classList.contains('flip') && !$('ccBal').classList.contains('roll'));

    // ---------- the table never locks up on a reply it cannot draw ----------
    const answerOpen = (state) => { intercept = (m) => { if (m.op !== 'open') return false; intercept = null; later(1, () => toWebview({ type: 'bj', n: m.n, state, balance: ledgerBalance() })); return true; }; };
    const odd = { r: 'Z', s: 'X' };
    answerOpen({ id: 'x', phase: 'done', bet: 10, hands: [{ cards: [odd, { r: '9', s: 'S' }], total: 19, soft: false, bet: 10, done: true, result: 'win' }], active: 0, dealer: { cards: [odd, { r: '5', s: 'H' }], hole: false, total: 15 }, can: { hit: false, stand: false, double: false, split: false }, net: 10, seq: [] });
    const e0 = errors.length;
    reopenTable();
    ok('an unknown card is drawn as a back, no error', errors.length === e0 && isBack(dealerCards()[0]) && !$('bjDeal').disabled, errors.slice(e0).map((e) => e.message).join('; '));
    answerOpen({ id: 'y', phase: 'player', bet: 10, hands: [{ bet: 10 }], active: 0, dealer: { cards: [], hole: true, total: null }, can: { hit: true, stand: true, double: false, split: false }, net: null, seq: [] });
    reopenTable(); advance(50);
    ok('a state that breaks the drawing throws inside the handler', errors.length > e0, errors.slice(e0).map((e) => e.message).join('; '));
    const opens = sentOps.filter((o) => o === 'open').length;
    reopenTable();
    ok('...and the table is not locked: the next open still goes out and redraws', sentOps.filter((o) => o === 'open').length === opens + 1 && !$('bjDeal').disabled, 'opens ' + opens + ' -> ' + sentOps.filter((o) => o === 'open').length);

    // ---------- Credits hidden while at the table ----------
    openTable();
    ok('at the table again', atTable(), bodyTabs());
    config['panel.hidden'] = ['credits'];
    hostOnMessage({ type: 'ready' }); advance(5);
    ok('hiding Credits leaves the games area for the last tab', bodyTabs() === 'tab-usage' && $('panelTable').style.display === 'none' && $('panelGames').style.display === 'none' && $('hdCredits').style.display === 'none', bodyTabs());
    $('hdCredits').click(); advance(5);
    ok('with Credits hidden the games list does not open', bodyTabs() === 'tab-usage', bodyTabs());
    config['panel.hidden'] = [];
  }
} catch (e) {
  fails++;
  console.log('FAIL uncaught: ' + (e && e.stack || e));
} finally {
  if (context) context.subscriptions.forEach((s) => { try { s.dispose(); } catch (e) { /* teardown only */ } });
  fs.rmSync(HOME, { recursive: true, force: true });
}
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
