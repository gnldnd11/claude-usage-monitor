// Host wiring for blackjack: the real activate() and webview message handler under a fake vscode.
// No dependencies: node's assert only. Run: node test/host.test.js
// A temp HOME stands in for ~/.claude, so no real transcript or credential is touched.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-host-'));
fs.mkdirSync(path.join(HOME, '.claude', 'projects'), { recursive: true });
process.env.HOME = HOME; // extension.js reads os.homedir() when it loads
process.env.CUC_TEST = '1'; // exposes _test.setBjSeeds, used to pick the cards in two tests

// --- fake vscode ------------------------------------------------------------------------
const noop = () => ({ dispose() {} });
let provider = null;
const vscode = {
  window: {
    createOutputChannel: () => ({ appendLine() {}, show() {}, dispose() {} }),
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
    registerWebviewViewProvider: (id, p) => { provider = p; return noop(); },
    onDidChangeWindowState: noop,
    setStatusBarMessage() {}, showInformationMessage() {}, showWarningMessage() {}
  },
  commands: { executeCommand: () => Promise.resolve(), registerCommand: noop },
  workspace: { onDidChangeConfiguration: noop, getConfiguration: () => ({ get: (k, d) => d, update: () => Promise.resolve() }), workspaceFolders: undefined },
  Uri: { joinPath: (base, ...p) => ({ fsPath: path.join(base.fsPath, ...p), toString() { return 'file://' + this.fsPath; } }) },
  StatusBarAlignment: { Left: 1 },
  ConfigurationTarget: { Global: 1 },
  ThemeColor: function () {}
};

function memento(init) {
  const data = Object.assign({}, init);
  return {
    data,
    get: (k, d) => (k in data ? data[k] : d),
    update: (k, v) => { data[k] = v === undefined ? undefined : JSON.parse(JSON.stringify(v)); return Promise.resolve(); }
  };
}

const LEDGER = 'creditLedgerV1';
const START_CREDITS = 1000; // 100M input tokens = 1,000 credits
const gs = memento({
  agentXpV2: { agents: {}, seen: {}, backfilled: true },
  [LEDGER]: { days: { '2026-09-01': { input: 100000000, output: 0, cache_creation: 0, cache_read: 0 } }, backfilled: true, sweptAt: Date.now() }
});

const origLoad = Module._load;
Module._load = function (req) { return req === 'vscode' ? vscode : origLoad.apply(this, arguments); };
const ext = require(path.join(ROOT, 'extension.js'));
const bj = require(path.join(ROOT, 'blackjack.js'));
// first seed (from a fixed list) whose deal matches `want`
function findSeed(tag, want) {
  for (let i = 0; i < 5000; i++) { const seed = tag + i; if (want(bj.newRound({ seed, bet: 10 }))) return seed; }
  throw new Error('no seed for ' + tag);
}
const context = { subscriptions: [], globalState: gs, workspaceState: memento({}), secrets: { get: async () => undefined, delete: async () => {} }, extensionUri: { fsPath: ROOT } };
ext.activate(context);

// --- fake webview -------------------------------------------------------------------------
const posted = [];
let onMessage = null;
const webview = {
  cspSource: 'csp',
  asWebviewUri: (u) => u,
  onDidReceiveMessage: (f) => { onMessage = f; return noop(); },
  postMessage: (m) => { posted.push(m); return Promise.resolve(true); }
};
provider.resolveWebviewView({ webview, visible: true, onDidChangeVisibility: noop });

// Sends one message, returns the blackjack reply it produced
function send(msg) {
  const from = posted.length;
  onMessage(msg);
  const replies = posted.slice(from).filter((m) => m.type === 'bj');
  assert.equal(replies.length, 1, 'one reply per message');
  return replies[0];
}
const bank = () => (gs.data[LEDGER].bank || {});
const bankSum = (f) => Object.values(bank()).reduce((s, c) => s + c[f], 0);
const lastHeaderBalance = () => posted.filter((m) => m.type === 'data').pop().data.credits.balance;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('open with no round: phase bet, full balance', () => {
  const r = send({ type: 'bj', op: 'open' });
  assert.equal(r.state.phase, 'bet');
  assert.equal(r.balance, START_CREDITS);
  assert.equal(r.error, undefined);
});

test('bad bets are refused and change nothing', () => {
  for (const bet of [9, 10.5, '10', null, -10, START_CREDITS + 1]) {
    const r = send({ type: 'bj', op: 'deal', bet });
    assert.ok(r.error, 'bet ' + JSON.stringify(bet));
    assert.equal(r.state.phase, 'bet');
  }
  assert.deepEqual(bank(), {});
});

test('rounds settle once into the bank, the balance and the header', () => {
  let expected = START_CREDITS;
  for (let i = 0; i < 25; i++) {
    let r = send({ type: 'bj', op: 'deal', bet: 10 });
    assert.equal(r.error, undefined);
    assert.ok(r.state.seq.length >= 4, 'the deal is in seq');
    while (r.state.phase === 'player') r = send({ type: 'bj', op: 'stand' });
    assert.equal(r.state.phase, 'done');
    expected += r.state.net;
    assert.equal(r.balance, expected);
    assert.equal(lastHeaderBalance(), expected);
    assert.equal(bankSum('hands'), i + 1);
    assert.equal(bankSum('won') - bankSum('lost'), expected - START_CREDITS);
    // anything after settlement is refused and does not settle again
    const again = send({ type: 'bj', op: 'stand' });
    assert.ok(again.error);
    assert.equal(bankSum('hands'), i + 1);
  }
  assert.equal(Object.keys(bank()).length, 1, 'one replica for this activation');
  assert.match(Object.keys(bank())[0], /^[0-9a-f]{16}$/);
});

test('a deal during a round is refused; open resumes the round without replaying seq', () => {
  let r;
  for (let i = 0; i < 50; i++) {
    r = send({ type: 'bj', op: 'deal', bet: 10 });
    if (r.state.phase === 'player') break;
  }
  assert.equal(r.state.phase, 'player');
  const refused = send({ type: 'bj', op: 'deal', bet: 10 });
  assert.equal(refused.error, 'a round is already in progress');
  assert.deepEqual(refused.state.hands, r.state.hands);
  const reopened = send({ type: 'bj', op: 'open' });
  assert.deepEqual(reopened.state.hands, r.state.hands);
  assert.deepEqual(reopened.state.seq, []);
  while (r.state.phase === 'player') r = send({ type: 'bj', op: 'stand' });
});

test('double and split need the extra stake inside the balance', () => {
  // over half the balance: a second stake of the same size cannot fit. Recomputed each try,
  // because a round that ends at once (a natural on either side) moves the balance
  let r, bet;
  for (let i = 0; i < 50; i++) {
    bet = Math.floor(send({ type: 'bj', op: 'open' }).balance / 2) + 1;
    r = send({ type: 'bj', op: 'deal', bet });
    assert.equal(r.error, undefined);
    if (r.state.phase === 'player') break;
  }
  assert.equal(r.state.phase, 'player');
  assert.equal(r.state.can.double, false);
  assert.equal(r.state.can.split, false);
  const d = send({ type: 'bj', op: 'double' });
  assert.equal(d.error, 'not enough credits');
  assert.equal(d.state.hands[0].bet, bet);
  while (r.state.phase === 'player') r = send({ type: 'bj', op: 'stand' });
});

test('a deal that settles at once (a natural or the peek) is banked, and the reply comes before the push', () => {
  const seed = findSeed('natural-', (st) => st.phase === 'done' && st.net !== 0);
  ext._test.setBjSeeds(() => seed);
  try {
    const hands = bankSum('hands'), net = bankSum('won') - bankSum('lost'), from = posted.length;
    const r = send({ type: 'bj', op: 'deal', bet: 10 });
    assert.equal(r.state.phase, 'done');
    assert.equal(bankSum('hands'), hands + 1);
    assert.equal(bankSum('won') - bankSum('lost'), net + r.state.net);
    const kinds = posted.slice(from).map((m) => m.type);
    assert.ok(kinds.indexOf('bj') >= 0 && kinds.indexOf('data') > kinds.indexOf('bj'), 'order ' + kinds.join(','));
  } finally { ext._test.setBjSeeds(null); }
});

test('a bet equal to the whole balance is allowed', () => {
  // a live hand that standing does not lose, so the tests after this one still have credits
  const seed = findSeed('live-', (st) => st.phase === 'player' && bj.act(st, 'stand').net >= 0);
  ext._test.setBjSeeds(() => seed);
  try {
    const all = send({ type: 'bj', op: 'open' }).balance;
    let r = send({ type: 'bj', op: 'deal', bet: all });
    assert.equal(r.error, undefined);
    assert.equal(r.state.bet, all);
    while (r.state.phase === 'player') r = send({ type: 'bj', op: 'stand' });
  } finally { ext._test.setBjSeeds(null); }
});

test('nothing a live reply carries re-deals the shoe; the seed arrives at done, apart from the id', () => {
  let live = 0;
  for (let i = 0; i < 60; i++) {
    let r = send({ type: 'bj', op: 'deal', bet: 10 });
    if (r.state.phase !== 'player') continue;
    live++;
    const leaves = [];
    (function walk(x) { if (x == null) return; if (typeof x !== 'object') { leaves.push(String(x)); return; } for (const k in x) { leaves.push(k); walk(x[k]); } })(r);
    assert.equal('seed' in r.state, false);
    while (r.state.phase === 'player') r = send({ type: 'bj', op: 'stand' });
    const real = JSON.stringify(bj.newRound({ seed: r.state.seed, bet: 10 }).shoe.slice(0, 12));
    assert.notEqual(r.state.id, r.state.seed);
    for (const leaf of leaves) assert.notEqual(JSON.stringify(bj.newRound({ seed: leaf, bet: 10 }).shoe.slice(0, 12)), real);
  }
  assert.ok(live > 30);
});

test('deactivate writes the bank back over a stale copy', () => {
  const mine = JSON.parse(JSON.stringify(bank()));
  assert.ok(Object.keys(mine).length === 1);
  gs.data[LEDGER] = { days: gs.data[LEDGER].days, backfilled: true, sweptAt: 1 }; // another window's copy without the bank
  ext.deactivate();
  assert.deepEqual(bank(), mine);
});

test('the reply echoes the request number (the webview tells its reply from a late one)', () => {
  assert.equal(send({ type: 'bj', op: 'open', n: 41 }).n, 41);
  assert.equal(send({ type: 'bj', op: 'hit', n: 42 }).n, 42);       // refused, still echoed
  assert.equal('n' in send({ type: 'bj', op: 'open', n: 'x' }), false); // not a number: nothing echoed
});

test('unknown ops are refused', () => {
  assert.equal(send({ type: 'bj', op: 'surrender' }).error, 'unknown action');
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
context.subscriptions.forEach((s) => { try { s.dispose(); } catch (e) { console.log('dispose: ' + e.message); } });
fs.rmSync(HOME, { recursive: true, force: true });
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
