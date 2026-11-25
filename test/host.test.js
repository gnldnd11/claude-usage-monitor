// Host wiring for the crab's games: the real activate() and webview message handler under a fake vscode.
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
// A signed-in account, so sharing consent (which is per account) has an account to be about.
// Beside .claude, not inside it: that is where Claude Code keeps this file (claudedir.js)
fs.writeFileSync(path.join(HOME, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'u-host-test' } }));
process.env.HOME = HOME; // extension.js reads os.homedir() when it loads
// A real CLAUDE_CONFIG_DIR on the machine running the tests would outrank the temp HOME, which is
// the whole point of it (claudedir.js), so this lane states that it has none
delete process.env.CLAUDE_CONFIG_DIR;
process.env.CUC_TEST = '1'; // exposes _test.setBjSeeds / setHlSeeds / setSeeds, used to pick the cards

// --- fake vscode ------------------------------------------------------------------------
const noop = () => ({ dispose() {} });
let provider = null;
let statusBar = null;   // the status bar item activate() makes, so a test can read its text
// Settings, empty: every reader gets the declared default unless a test puts a key in here. A
// setting that is only ever its default cannot tell "this mode prints the week" from "every mode
// prints the week", which is what the no-window fallback is about
const config = {};
const logged = []; // the output channel, kept: a fault the player is not shown has to be findable here
const vscode = {
  window: {
    createOutputChannel: () => ({ appendLine: (l) => logged.push(l), show() {}, dispose() {} }),
    // kept, because what it PRINTS is a test: an account with no five-hour window used to leave
    // this saying "loading…" for ever (see the status-bar test at the end of this file)
    createStatusBarItem: () => (statusBar = { show() {}, hide() {}, dispose() {} }),
    registerWebviewViewProvider: (id, p) => { provider = p; return noop(); },
    onDidChangeWindowState: noop,
    setStatusBarMessage() {}, showInformationMessage() {}, showWarningMessage() {}
  },
  commands: { executeCommand: () => Promise.resolve(), registerCommand: noop },
  workspace: { onDidChangeConfiguration: noop, getConfiguration: () => ({ get: (k, d) => (k in config ? config[k] : d), update: () => Promise.resolve() }), workspaceFolders: undefined },
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
// three minutes ago: inside the seven days a stored stamp may claim, and past the five minutes the
// panel calls stale, so the one number this pins is the stamp itself and not a rounding of it
const RESTORED_AT = Date.now() - 3 * 60 * 1000;
const START_CREDITS = 1000; // 10M input tokens = 1,000 credits (10,000 weighted tokens a credit)
const gs = memento({
  agentXpV2: { agents: {}, seen: {}, backfilled: true },
  [LEDGER]: { days: { '2026-09-01': { input: 10000000, output: 0, cache_creation: 0, cache_read: 0 } }, backfilled: true, sweptAt: Date.now() },
  // what a PC upgrading from 1.28.0 holds: one answer, for no particular account
  teamShareV1: true,
  teamAskedV1: 1760000000000,
  // A last-good usage reading, as a window that has run before leaves behind. It is here rather
  // than in the test that reads it because the restore happens once, inside activate(), and the
  // thing being checked is that the stamp survives that path: a new window draws these figures
  // instantly and the panel's freshness row is the only thing that can say when they were read
  usageCacheV1: { at: RESTORED_AT, value: { five_hour: { used_percentage: 42, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 61, resets_at: Math.floor(Date.now() / 1000) + 3 * 86400 }, fable: null } }
});

const origLoad = Module._load;
Module._load = function (req) { return req === 'vscode' ? vscode : origLoad.apply(this, arguments); };
const ext = require(path.join(ROOT, 'extension.js'));
const bj = require(path.join(ROOT, 'blackjack.js'));
const hl = require(path.join(ROOT, 'highlow.js'));
const whmod = require(path.join(ROOT, 'wheel.js'));
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

// Sends one message, returns the game reply it produced
function send(msg) {
  const from = posted.length;
  onMessage(msg);
  const replies = posted.slice(from).filter((m) => m.type === msg.type);
  assert.equal(replies.length, 1, 'one reply per message');
  return replies[0];
}
const bank = () => (gs.data[LEDGER].bank || {});
const bankSum = (f) => Object.values(bank()).reduce((s, c) => s + c[f], 0);
const lastHeaderBalance = () => posted.filter((m) => m.type === 'data').pop().data.credits.balance;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// The settings really reach the readers: the fake vscode hands back every setting's default, so
// claudeUsage.configDir is empty, there is no CLAUDE_CONFIG_DIR, and the directory is this lane's
// temp HOME. A resolver nothing calls would leave this pointing at the real ~/.claude
test('the configuration directory is resolved, not hard-coded', () => {
  const cp = ext._test.claudePaths();
  assert.equal(cp.source, 'default');
  assert.equal(cp.dir, path.join(HOME, '.claude'));
  assert.equal(cp.projects, path.join(HOME, '.claude', 'projects'));
  assert.equal(cp.configJson, path.join(HOME, '.claude.json'));
  // and the ledger records which directory it was counted from, so a moved one is counted again
  assert.equal(gs.data.creditSweepDirV1, undefined); // not until a sweep finishes
});

// Sharing consent is about who will see the row, and that is the account, not this PC. These run
// against the real activate() that has just happened, so they also assert the upgrade path.
test('the one answer a PC upgrading from 1.28.0 held is now this account\'s answer', () => {
  const key = ext._test.teamCfg().key;
  assert.match(key, /^acct-[0-9a-f]{40}$/);      // a hash: the account id itself is never stored
  assert.ok(!JSON.stringify(gs.data).includes('u-host-test'));
  assert.equal(ext._test.shareConsent(key), true);
  assert.equal(ext._test.teamCfg().on, true);
  assert.equal(gs.data.teamShareMovedV1, true);
  // The older keys are KEPT. 1.30.0 deleted them here, which is tidy until the copy does not land:
  // a PC that had been sharing for weeks was asked to Share again with nothing left in storage to
  // say it ever had. They are the record of a choice already made, and teamAsk reads one as a last
  // resort before the question appears, so deleting them would remove that fallback too.
  assert.equal(gs.data.teamShareV1, true);
  assert.ok(gs.data.teamAskedV1);
});

test('a second account inherits nothing and starts off, answered or not', () => {
  const mine = ext._test.teamCfg().key;
  const other = 'acct-' + 'b'.repeat(40);
  assert.equal(ext._test.shareConsent(other), undefined); // never asked, which is not a no
  assert.equal(ext._test.setShareConsent(other, true), true);
  assert.equal(ext._test.shareConsent(other), true);
  assert.equal(ext._test.shareConsent(mine), true);       // and the first one is untouched
  ext._test.setShareConsent(other, false);
  assert.equal(ext._test.shareConsent(other), false);      // asked and declined, not "unasked"
  assert.equal(ext._test.shareConsent(mine), true);
  assert.equal(ext._test.teamCfg().on, true);             // `on` is only ever about this account
  ext._test.setShareConsent(mine, false);
  assert.equal(ext._test.teamCfg().on, false);
  ext._test.setShareConsent(mine, true);
});

test('a hand-edited consent store cannot put anything but an account\'s answer in', () => {
  const mine = ext._test.teamCfg().key;
  gs.update('teamShareByAccountV1', JSON.parse(
    '{"' + mine + '":true,"acct-short":true,"__proto__":true,"' + 'acct-' + 'c'.repeat(40) + '":"yes"}'));
  const m = ext._test.shareMap();
  assert.deepEqual(Object.keys(m), [mine]);
  assert.equal(ext._test.shareConsent('acct-short'), undefined);
  assert.equal(ext._test.shareConsent(null), undefined);
  assert.equal(({}).teamShareByAccountV1, undefined); // nothing reached Object.prototype
  assert.equal(ext._test.setShareConsent('nonsense', true), false);
});

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

// The mirror of the test above, and the only thing holding heldBy()'s "my own stake does not count
// against me": with nothing else live, half the purse is a bet that still leaves room to double.
// Counting the round's own stake as held would take it out of the budget twice and refuse the double
test('with no other game live, half the balance still leaves room to double', () => {
  const seed = findSeed('dbl-', (st) => st.phase === 'player' && bj.act(st, 'double').net >= 0);
  ext._test.setBjSeeds(() => seed);
  try {
    assert.equal(send({ type: 'hl', op: 'open' }).state.phase, 'bet', 'no high-low run is holding anything');
    const balance = send({ type: 'bj', op: 'open' }).balance;
    const bet = Math.floor(balance / 2);
    const r = send({ type: 'bj', op: 'deal', bet });
    assert.equal(r.error, undefined);
    assert.equal(r.state.phase, 'player');
    assert.equal(r.state.can.double, true, 'bet ' + bet + ' of ' + balance);
    const d = send({ type: 'bj', op: 'double' });
    assert.equal(d.error, undefined);
    assert.equal(d.state.hands[0].bet, bet * 2);
  } finally { ext._test.setBjSeeds(null); }
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

// --- high-low --------------------------------------------------------------------------
// The safest call the board offers: whichever side the shoe prices nearer to 1
const safest = (st) => (st.odds.lower == null || (st.odds.higher != null && st.odds.higher <= st.odds.lower) ? 'higher' : 'lower');

// Pins the seed of the NEXT high-low run to one whose deal matches `want`.
// A seed does not name a run by itself: the host carries the shoe from run to run, and the same
// seed shuffling a different deck deals different cards (seed 'won-0' opens on an ace off a fresh
// shoe and on a four off the 311 cards the next run gets). So the search has to run against the
// deck the host is about to use, which _test.hlDeck() hands over
function pinHl(tag, want) {
  const deck = ext._test.hlDeck();
  for (let i = 0; i < 4000; i++) {
    const seed = tag + i;
    if (want(hl.newRun({ seed, bet: 100, deck }))) { ext._test.setHlSeeds(() => seed); return seed; }
  }
  throw new Error('no seed for ' + tag);
}
// A run whose first call lands, so the test keeps its stake
const pinWinner = (tag) => pinHl(tag, (st) => hl.act(st, safest(hl.view(st))).streak === 1);

test('hl open with no run: phase bet, nothing on the table', () => {
  const r = send({ type: 'hl', op: 'open' });
  assert.equal(r.state.phase, 'bet');
  assert.equal(r.state.card, null);
  assert.equal(r.error, undefined);
  assert.equal(r.balance, send({ type: 'bj', op: 'open' }).balance, 'one purse, one number');
});

test('hl bad bets are refused and change nothing', () => {
  const hands = bankSum('hands');
  const balance = send({ type: 'hl', op: 'open' }).balance;
  for (const bet of [9, 10.5, '10', null, undefined, NaN, -10, Infinity, balance + 1]) {
    const r = send({ type: 'hl', op: 'deal', bet });
    assert.ok(r.error, 'bet ' + JSON.stringify(bet));
    assert.equal(r.state.phase, 'bet');
  }
  assert.equal(bankSum('hands'), hands);
  assert.equal(send({ type: 'hl', op: 'open' }).balance, balance);
});

test('hl runs settle once into the bank, the balance and the header', () => {
  let expected = send({ type: 'hl', op: 'open' }).balance;
  try {
    for (let i = 0; i < 25; i++) {
      pinHl('bank-' + i, () => true); // any run will do, it just has to be the same one every time
      const hands = bankSum('hands');
      let r = send({ type: 'hl', op: 'deal', bet: 10 });
      assert.equal(r.error, undefined);
      assert.equal(r.state.pot, 10, 'the pot opens at the bet');
      assert.equal(bankSum('hands'), hands, 'a live run has settled nothing');
      // one call, then take whatever is left
      r = send({ type: 'hl', op: safest(r.state) });
      if (r.state.phase === 'play') r = send({ type: 'hl', op: 'cashout' });
      assert.equal(r.state.phase, 'done');
      assert.equal(r.state.net, r.state.pot - 10);
      expected += r.state.net;
      assert.equal(r.balance, expected);
      assert.equal(lastHeaderBalance(), expected);
      assert.equal(bankSum('hands'), hands + 1);
      // anything after settlement is refused and does not settle again
      const again = send({ type: 'hl', op: 'higher' });
      assert.equal(again.error, 'no run in progress');
      assert.equal(bankSum('hands'), hands + 1);
    }
  } finally { ext._test.setHlSeeds(null); }
  assert.equal(Object.keys(bank()).length, 1, 'both games share this activation\'s one bank key');
});

test('hl: a deal during a run is refused; open resumes it with nothing to replay', () => {
  pinWinner('resume-');
  try {
    const r = send({ type: 'hl', op: 'deal', bet: 10 });
    assert.equal(r.state.phase, 'play');
    const refused = send({ type: 'hl', op: 'deal', bet: 10 });
    assert.equal(refused.error, 'a run is already in progress');
    assert.deepEqual(refused.state.card, r.state.card);
    const reopened = send({ type: 'hl', op: 'open' });
    assert.deepEqual(reopened.state.card, r.state.card);
    assert.equal('seq' in reopened.state, false, 'one card a move: a high-low state has no sequence to pace');
    assert.equal(reopened.state.can.cashout, false, 'nothing called yet, so there is nothing to take');
    assert.equal(send({ type: 'hl', op: 'cashout' }).error, 'call the card first');
    const won = send({ type: 'hl', op: safest(reopened.state) });
    assert.equal(won.state.streak, 1);
    assert.equal(send({ type: 'hl', op: 'cashout' }).state.phase, 'done');
  } finally { ext._test.setHlSeeds(null); }
});

test('hl: cashing out pays the pot and the reply comes before the push', () => {
  // a run whose first call lands on a side the shoe prices well above 1, so the pot really grows
  pinHl('rich-', (st) => {
    const v = hl.view(st);
    const dear = v.odds.higher > v.odds.lower ? 'higher' : 'lower';
    return v.odds[dear] > 2 && hl.act(st, dear).streak === 1;
  });
  try {
    const before = send({ type: 'hl', op: 'open' }).balance;
    const opened = send({ type: 'hl', op: 'deal', bet: 100 });
    const dear = opened.state.odds.higher > opened.state.odds.lower ? 'higher' : 'lower';
    const from = posted.length;
    const called = send({ type: 'hl', op: dear });
    assert.equal(called.state.phase, 'play');
    assert.ok(called.state.pot > 100, 'a dear call that lands pays more than the bet: ' + called.state.pot);
    assert.equal(called.balance, before, 'nothing settles until the run ends');
    const out = send({ type: 'hl', op: 'cashout' });
    assert.equal(out.state.ended, 'cashout');
    assert.equal(out.state.net, out.state.pot - 100);
    assert.equal(out.balance, before + out.state.net);
    const kinds = posted.slice(from).map((m) => m.type);
    assert.ok(kinds.indexOf('hl') >= 0 && kinds.indexOf('data') > kinds.indexOf('hl'), 'order ' + kinds.join(','));
  } finally { ext._test.setHlSeeds(null); }
});

test('hl: a wrong call costs the opening bet and nothing else', () => {
  // the first call misses, after the pot had already grown once
  pinHl('miss-', (st) => {
    const one = hl.act(st, safest(hl.view(st)));
    if (one.streak !== 1 || one.pot <= 100) return false; // a clamped or floored call leaves the pot flat
    const v = hl.view(one);
    const wrong = v.odds.higher > v.odds.lower ? 'higher' : 'lower'; // the dear side, the one that usually misses
    return v.odds[wrong] != null && hl.act(one, wrong).ended === 'wrong';
  });
  try {
    const before = send({ type: 'hl', op: 'open' }).balance;
    const opened = send({ type: 'hl', op: 'deal', bet: 100 });
    const grown = send({ type: 'hl', op: safest(opened.state) });
    assert.ok(grown.state.pot > 100, 'pot ' + grown.state.pot);
    const dear = grown.state.odds.higher > grown.state.odds.lower ? 'higher' : 'lower';
    const lost = send({ type: 'hl', op: dear });
    assert.equal(lost.state.phase, 'done');
    assert.equal(lost.state.ended, 'wrong');
    assert.equal(lost.state.pot, 0, 'the grown pot was never the player\'s');
    assert.equal(lost.state.net, -100, 'only the opening bet goes');
    assert.equal(lost.balance, before - 100);
    assert.equal(lost.state.history[lost.state.history.length - 1].result, 'lose');
  } finally { ext._test.setHlSeeds(null); }
});

test('hl: the shoe carries from one run into the next', () => {
  let left = ext._test.hlDeck().length;
  assert.ok(left > 0 && left < 312, 'earlier runs left a part-used shoe: ' + left);
  try {
    for (let i = 0; i < 5; i++) {
      const before = left;
      const deck = ext._test.hlDeck();
      const seed = pinWinner('carry-' + i);
      const r = send({ type: 'hl', op: 'deal', bet: 10 });
      assert.equal(r.error, undefined);
      // the run dealt off exactly the deck the host was holding, not a fresh shoe: the same seed
      // on a fresh 312 gives a different card
      assert.deepEqual(r.state.card, hl.view(hl.newRun({ seed, bet: 10, deck })).card, 'the carried deck is what got shuffled');
      const won = send({ type: 'hl', op: safest(r.state) });
      assert.equal(won.state.streak, 1);
      assert.equal(send({ type: 'hl', op: 'cashout' }).state.phase, 'done');
      left = ext._test.hlDeck().length;
      // the same shoe, two cards shorter, or a fresh one once it got short. The cut is judged on the
      // deck the run was handed (`before`), not on what it left: measured the other way, a deck of
      // 21 or 22 would accept a reshuffle the engine must not have made
      assert.ok(left === before - 2 || (before < hl.MIN_DECK && left === 310), 'shoe ' + before + ' -> ' + left);
    }
  } finally { ext._test.setHlSeeds(null); }
});

// Three live stakes against one purse. Each game takes every credit the other two have not
// reserved, which is the tightest the purse can be: with heldBy() blind to any one of them, two
// losing rounds would take the balance under zero.
//
// THREE AND NOT TWO, deliberately, and this is the one test that needs a third table. Two live
// stakes cannot tell "the balance minus what the OTHERS hold" from "the balance minus what the
// other one holds": both read the same with one other game on the floor. The third stake is what
// makes heldBy() a sum. The third used to be draw poker; it went on 2026-11-13 and the wheel took
// the seat, because what the test needs of it is only that a deal leaves a round LIVE (so its stake
// is held) and that the round can be settled for its bet back.
//
// All three are pinned to outcomes that give the bet back (a blackjack push, a high-low call that
// lands, a wheel that stops on a times-one slice), so the purse ends each pass where it began and
// twenty passes cannot dry it out.
//
// THE WHEEL TAKES BETS IN STEPS OF TWO (wheel.js, BET_STEP), so it is the stake that is rounded and
// blackjack is the one squeezed into exactly what is left. The other way round, the squeeze would
// have to ask for an odd number and be refused for its step rather than for the money, which is a
// different refusal and would quietly stop testing the purse
test('three games, one purse: each is bet against what the other two left', () => {
  const push = findSeed('push3-', (st) => {
    if (st.phase !== 'player') return false;
    const stood = bj.act(st, 'stand');
    return stood.phase === 'done' && stood.net === 0;
  });
  // A spin that stops on a times-one slice hands the bet straight back. `net` there is
  // (bet / BET_STEP) * halves - bet with halves = 2, so it is 0 for EVERY legal bet and one seed
  // found against a probe bet keeps the promise at whatever the loop stakes
  const pinWh = (tag) => {
    for (let i = 0; i < 5000; i++) {
      const seed = tag + i;
      const st = whmod.newRound({ seed, id: 't', bet: whmod.MIN_BET });
      if (whmod.act(st, { op: 'spin', risk: 'mild' }).net === 0) { ext._test.setSeeds('wh', () => seed); return seed; }
    }
    throw new Error('no wheel seed that stops on a times-one slice');
  };
  let low = Infinity, all3 = 0;
  const check = (r) => {
    assert.ok(r.balance >= 0, 'the purse went to ' + r.balance);
    assert.equal(r.balance, START_CREDITS + bankSum('won') - bankSum('lost'), 'balance is the bank');
    low = Math.min(low, r.balance);
    return r;
  };
  ext._test.setBjSeeds(() => push);
  try {
    for (let i = 0; i < 20; i++) {
      const balance = check(send({ type: 'wh', op: 'open' })).balance;
      assert.ok(balance >= 60, 'three stakes of at least ten need this much: ' + balance);
      const third = Math.floor(balance / 3);
      const whBet = third - (third % whmod.BET_STEP);   // the wheel's step, taken off the top
      assert.ok(whBet >= whmod.MIN_BET, 'the wheel needs this much: ' + whBet);
      // the wheel holds a third open
      pinWh('three-wh-' + i + '-');
      let w = check(send({ type: 'wh', op: 'deal', bet: whBet }));
      assert.equal(w.error, undefined);
      assert.equal(w.state.phase, 'spin', 'the placed wheel is live, so its stake stays held');
      // high-low holds another third
      pinWinner('three-hl-' + i);
      let h = check(send({ type: 'hl', op: 'deal', bet: third }));
      assert.equal(h.error, undefined);
      assert.equal(h.state.phase, 'play');
      // and blackjack may have exactly what the two of them left, not a credit more
      const room = balance - whBet - third;
      assert.ok(room >= 10, 'room left for blackjack: ' + room);
      assert.equal(check(send({ type: 'bj', op: 'deal', bet: room + 1 })).error, 'not enough credits');
      const b0 = check(send({ type: 'bj', op: 'deal', bet: room }));
      assert.equal(b0.error, undefined);
      let b = b0;
      assert.equal(b.state.phase, 'player', 'the pinned hand is live, so its stake stays held');
      if (w.state.phase === 'spin' && h.state.phase === 'play') all3++;
      // nothing at all is free now: blackjack cannot double into what the other two are holding
      assert.equal(send({ type: 'bj', op: 'double' }).error, 'not enough credits');
      assert.equal(send({ type: 'bj', op: 'open' }).state.can.double, false);
      // what each one sees free is exactly its own stake, which is the whole purse accounted for
      // three ways. Counting a game's own stake as held would take it out twice (see the double
      // test above), and not counting the other two would offer credits the host is about to refuse
      assert.equal(check(send({ type: 'hl', op: 'open' })).free, third);
      assert.equal(send({ type: 'wh', op: 'open' }).free, whBet);
      assert.equal(send({ type: 'bj', op: 'open' }).free, room);
      // settle all three; none of them took credits another was holding
      const spun = check(send({ type: 'wh', op: 'spin', risk: 'mild' }));
      assert.equal(spun.state.phase, 'done');
      assert.equal(spun.state.net, 0, 'the pinned spin returns the bet');
      h = check(send({ type: 'hl', op: safest(h.state) }));
      if (h.state.phase === 'play') h = check(send({ type: 'hl', op: 'cashout' }));
      while (b.state.phase === 'player') b = check(send({ type: 'bj', op: 'stand' }));
    }
  } finally { ext._test.setBjSeeds(null); ext._test.setHlSeeds(null); ext._test.setSeeds('wh', null); }
  assert.ok(all3 >= 15, 'the three ran at the same time only ' + all3 + ' times');
  console.log('  purse: three games live at once ' + all3 + ' times, lowest balance seen ' + low);
});

test('the two games share one purse: a live round holds its stake back from the other', () => {
  let round;
  for (let i = 0; i < 50; i++) {
    round = send({ type: 'bj', op: 'deal', bet: 10 });
    if (round.state.phase === 'player') break;
  }
  assert.equal(round.state.phase, 'player');
  const balance = round.balance;
  assert.ok(balance >= 40, 'enough left to tell the two apart: ' + balance);
  pinWinner('purse-');
  try {
    // stakes do not leave the balance until a round settles, so high-low must not see blackjack's
    assert.equal(send({ type: 'hl', op: 'deal', bet: balance - 9 }).error, 'not enough credits');
    const ok = send({ type: 'hl', op: 'deal', bet: balance - 10 });
    assert.equal(ok.error, undefined);
    assert.equal(ok.state.phase, 'play');
    // and the same the other way: blackjack can no longer double into credits high-low is holding
    assert.equal(send({ type: 'bj', op: 'double' }).error, 'not enough credits');
    assert.equal(send({ type: 'bj', op: 'open' }).state.can.double, false);
    // both settle, and neither took credits the other was holding
    const won = send({ type: 'hl', op: safest(ok.state) });
    assert.equal(won.state.streak, 1);
    const out = send({ type: 'hl', op: 'cashout' });
    assert.equal(out.state.net, out.state.pot - (balance - 10));
    assert.equal(out.balance, balance + out.state.net);
    while (round.state.phase === 'player') round = send({ type: 'bj', op: 'stand' });
    assert.ok(send({ type: 'hl', op: 'open' }).balance >= 0);
  } finally { ext._test.setHlSeeds(null); }
});

// The reservation is the only thing standing between two live rounds and an overdrawn purse, so it
// is checked by playing against it rather than by reading it: both games bet everything they are
// allowed to, over and over, and the balance is asserted after EVERY reply. With heldBy() returning
// 0 this fails on the first pair of rounds that both lose.
//
// Both games are pinned, so the only thing still free to vary is the host code under test. Blackjack
// gets one hand that is live at the deal and a push when stood: its stake is held for the whole
// round and comes back whole, and a push is 0 whatever the stake, so forty greedy rounds cannot dry
// the purse out. Left unpinned, blackjack's own shuffle drained the purse instead, the loop broke out
// early, and the count below came in under ten about one run in ten
test('the purse never goes below zero, however greedily both games are played', () => {
  const push = findSeed('push-', (st) => {
    if (st.phase !== 'player') return false;
    const stood = bj.act(st, 'stand');
    return stood.phase === 'done' && stood.net === 0;
  });
  let low = Infinity, both = 0;
  const check = (r) => {
    assert.ok(r.balance >= 0, 'the purse went to ' + r.balance);
    assert.equal(r.balance, START_CREDITS + bankSum('won') - bankSum('lost'), 'balance is the bank');
    low = Math.min(low, r.balance);
    return r;
  };
  ext._test.setBjSeeds(() => push);
  try {
    for (let i = 0; i < 40; i++) {
      const balance = check(send({ type: 'bj', op: 'open' })).balance;
      assert.ok(balance >= 40, 'a pushing round and a winning run leave the purse full: ' + balance);
      // blackjack takes half the purse and holds it open
      const half = Math.floor(balance / 2);
      const b0 = check(send({ type: 'bj', op: 'deal', bet: half }));
      assert.equal(b0.error, undefined);
      let b = b0;
      assert.equal(b.state.phase, 'player', 'the pinned hand is live, so its stake stays held');
      const room = b.balance - half; // every credit blackjack has not reserved
      assert.ok(room >= 11, 'room left for high-low: ' + room);
      // high-low may not have a credit more than blackjack left it...
      assert.equal(check(send({ type: 'hl', op: 'deal', bet: room + 1 })).error, 'not enough credits');
      // ...but it may have every credit that is not spoken for, which is the tightest the purse gets:
      // if both rounds now lose, the balance lands on exactly zero and must not go past it
      pinWinner('greed-' + i);
      let h = check(send({ type: 'hl', op: 'deal', bet: room }));
      assert.equal(h.error, undefined);
      if (b.state.phase === 'player' && h.state.phase === 'play') both++;
      h = check(send({ type: 'hl', op: safest(h.state) }));
      if (h.state.phase === 'play') h = check(send({ type: 'hl', op: 'cashout' }));
      while (b.state.phase === 'player') b = check(send({ type: 'bj', op: 'stand' }));
    }
  } finally { ext._test.setBjSeeds(null); ext._test.setHlSeeds(null); }
  assert.ok(both >= 10, 'the two ran at the same time only ' + both + ' times');
  console.log('  purse: both games live at once ' + both + ' times, lowest balance seen ' + low);
});

test('hl: the reply echoes the request number, and unknown ops are refused', () => {
  assert.equal(send({ type: 'hl', op: 'open', n: 71 }).n, 71);
  assert.equal(send({ type: 'hl', op: 'higher', n: 72 }).n, 72);        // refused, still echoed
  assert.equal('n' in send({ type: 'hl', op: 'open', n: 'x' }), false); // not a number: nothing echoed
  assert.equal(send({ type: 'hl', op: 'surrender' }).error, 'unknown action');
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

// --- a view() that throws ------------------------------------------------------------------
// view() is the last engine call a reply makes, and it was the one left outside the driver's guard.
// An uncaught throw there leaves the message with NO reply, and the panel then sits out its
// four-second no-reply timeout, which the player reads as a screen that has stopped working.
// send() asserts exactly one reply per message, so every test here fails loudly if the reply stops
// going out at all: that, and not the wording, is what these are for
function withBrokenView(engine, thrown, fn) {
  const real = engine.view;
  engine.view = () => { throw thrown; };
  try { return fn(); } finally { engine.view = real; }
}
const loggedLike = (re) => logged.filter((l) => re.test(l));

test('a view() that throws still answers: no state, one plain sentence, the money and the number', () => {
  const before = send({ type: 'bj', op: 'open' }).balance;
  const mark = logged.length;
  const r = withBrokenView(bj, new TypeError('cannot read hole of undefined'), () => send({ type: 'bj', op: 'open', n: 73 }));
  assert.equal('state' in r, false, 'a reply that cannot describe the round carries no state');
  assert.equal(r.error, 'the table could not describe the round', 'a fault is one plain sentence, never its own message');
  assert.equal(r.n, 73, 'the request number is echoed, or the panel waits its timeout out anyway');
  assert.equal(r.balance, before, 'the money on the reply is still true');
  assert.equal(typeof r.free, 'number');
  // what the player is not shown is the log's, whole: the message AND the stack
  const lines = logged.slice(mark).filter((l) => /bj: could not describe the round/.test(l));
  assert.equal(lines.length, 1, 'one log line for the fault');
  assert.match(lines[0], /TypeError: cannot read hole of undefined/);
  assert.match(lines[0], /\n\s+at /, 'the stack is logged, not just the message');
  // and the host is intact: the next message is answered as if nothing had happened
  const after = send({ type: 'bj', op: 'open' });
  assert.ok(after.state, 'the message after a fault carries a table again');
  assert.equal(after.error, undefined);
});

test('a RangeError from view() is the engine\'s own ruling, so its sentence is passed through', () => {
  const r = withBrokenView(bj, new RangeError('the shoe is spent'), () => send({ type: 'bj', op: 'open' }));
  assert.equal(r.error, 'the shoe is spent');
  assert.equal('state' in r, false, 'a ruling the table cannot draw still carries no table');
});

test('a round survives a reply that could not describe it, and the ledger does not move twice', () => {
  const seed = findSeed('fault-live-', (st) => st.phase === 'player' && bj.act(st, 'hit').phase === 'player');
  ext._test.setBjSeeds(() => seed);
  try {
    const dealt = send({ type: 'bj', op: 'deal', bet: 10 });
    assert.equal(dealt.state.phase, 'player');
    const cards = dealt.state.hands[0].cards.length;
    const hands = bankSum('hands');
    const broke = withBrokenView(bj, new Error('boom'), () => send({ type: 'bj', op: 'hit' }));
    assert.equal('state' in broke, false);
    assert.equal(broke.error, 'the table could not describe the round');
    const back = send({ type: 'bj', op: 'open' });
    assert.equal(back.state.phase, 'player', 'the hand is still live: it was the describing that failed');
    assert.equal(back.state.hands[0].cards.length, cards + 1, 'and the hit that could not be drawn did happen');
    assert.equal(bankSum('hands'), hands, 'a live round settles nothing, broken view or not');
    send({ type: 'bj', op: 'stand' });
  } finally { ext._test.setBjSeeds(null); }
});

test('a refusal that cannot be drawn is sent as the fault, with the refusal it was carrying logged', () => {
  const mark = logged.length;
  const r = withBrokenView(bj, new Error('boom'), () => send({ type: 'bj', op: 'teleport' }));
  assert.equal(r.error, 'the table could not describe the round', 'one reason per reply, and this one is the fault');
  assert.equal('state' in r, false);
  assert.equal(logged.slice(mark).filter((l) => /the refusal it was carrying: unknown action/.test(l)).length, 1);
});

// The market keeps its own handler (createHandler) rather than running on the driver, so this is
// what says the state-less reply is the REPLY's rule and not the driver's. The forge was the game
// that proved it until 1.25.0; the market is the one stored game left
const mkmod = require(path.join(ROOT, 'market.js'));
test('mk: a view() that throws answers the same way (the reply is shared, not the driver)', () => {
  const r = withBrokenView(mkmod, new Error('no chart'), () => send({ type: 'mk', op: 'open', n: 55 }));
  assert.equal('state' in r, false, 'a game with its own handler still gets this for free');
  assert.equal(r.error, 'the table could not describe the round');
  assert.equal(r.n, 55);
  assert.equal(loggedLike(/mk: could not describe the round/).length, 1);
  assert.ok(send({ type: 'mk', op: 'open' }).state, 'and the wallet is still there');
});

// --- Agents tab: clearing a call that is waiting on a result ---------------------------------
// These run against the REAL message handler and a real transcript, because the rule worth pinning
// lives in the handler and nowhere else: a key is taken only while that invocation is showing as
// 'stuck' in what this window last pushed. That is what stands between a stray click and a healthy
// agent's row vanishing. The feature is a sweep of the LIST, never a stop: the extension has no
// hooks (CLAUDE.md), so there is deliberately nothing here that could reach an agent.
const AGENTS_PROJ = path.join(HOME, '.claude', 'projects', 'ws');
const MIN = 60000;
function agentCall(id, agent, atMs, desc) {
  return {
    type: 'assistant', timestamp: new Date(atMs).toISOString(),
    message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: agent, description: desc || '' } }] }
  };
}
function writeTranscript(records) {
  fs.mkdirSync(AGENTS_PROJ, { recursive: true });
  fs.writeFileSync(path.join(AGENTS_PROJ, 'agents.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
}
// the instances in the newest data push, by tool_use id
function instance(key) {
  const d = posted.filter((m) => m.type === 'data').pop();
  return ((d && d.data.agentActivity.instances) || []).find((s) => s.key === key);
}

test('one waiting call is swept by its tool_use id; its parallel sibling and a live run are not', () => {
  const NOW = Date.now();
  writeTranscript([
    // 40 and 30 minutes with nothing written back: both past STUCK_FLOOR, so both show "?"
    agentCall('toolu_wait1', 'code-reviewer', NOW - 40 * MIN, 'review the engine'),
    agentCall('toolu_wait2', 'code-reviewer', NOW - 30 * MIN, 'review the panel'),
    agentCall('toolu_live', 'test-runner', NOW - MIN, 'run the suite')      // a minute in: healthy
  ]);
  onMessage({ type: 'ready' }); // one push, so the host has fresh instances to judge a key against
  assert.equal(instance('toolu_wait1').state, 'stuck');
  assert.equal(instance('toolu_live').state, 'active');

  onMessage({ type: 'dismissAgentRun', key: 'toolu_wait1' });
  assert.equal(instance('toolu_wait1'), undefined, 'the swept row is gone from the list');
  assert.equal(instance('toolu_wait2').state, 'stuck', 'the other call of the same agent stays');
  assert.ok(gs.data.agentDismissedV1.toolu_wait1 > 0, 'and the sweep is stored with the call time');

  onMessage({ type: 'dismissAgentRun', key: 'toolu_live' });
  assert.equal(instance('toolu_live').state, 'active', 'a run that is going fine cannot be swept');
  assert.equal('toolu_live' in gs.data.agentDismissedV1, false, 'nothing stored for it either');

  onMessage({ type: 'dismissAgentRun', key: 'toolu_nothing' }); // a key from nowhere
  assert.equal('toolu_nothing' in gs.data.agentDismissedV1, false, 'an unknown key is dropped');
});

test('a result arriving after the sweep brings the run back as done, not as hidden', () => {
  const NOW = Date.now();
  const r = { 'toolu_wait2': { t: NOW - 2000, tokens: 4000, durMs: 30 * MIN } };
  const calls = [{ agent: 'code-reviewer', id: 'toolu_wait2', t: NOW - 30 * MIN, today: true, inProj: true, desc: 'review the panel' }];
  const out = ext._test.computeAgentActivity(calls, r, { 'toolu_wait2': NOW - 30 * MIN });
  assert.equal(out.instances.length, 1, 'it is shown, not swallowed');
  assert.equal(out.instances[0].state, 'done', 'as the done flash: it was alive after all');
  assert.equal(out.instances[0].swept, true, 'and marked as one that had been swept');
});

test('a sweep expires exactly when the row it hides would leave the list anyway', () => {
  const FOUR_H = 4 * 60 * 60 * 1000; // AGENT_RUN_WINDOW_MS: the list keeps a call this long
  const NOW = Date.now();
  const set = ext._test.dismissedRuns();
  for (const k in set) delete set[k];
  set.toolu_fresh = NOW - 30 * MIN;     // its call is 30 min old: the row would still be there
  set.toolu_aged = NOW - FOUR_H - 1000; // its call has aged out: the row is gone with or without us
  set.toolu_junk = 0;                   // a value a bad write could leave behind
  ext._test.pruneAgentDismissed(NOW);
  assert.deepEqual(Object.keys(set), ['toolu_fresh'], 'only the sweep that still hides something');
  assert.deepEqual(Object.keys(gs.data.agentDismissedV1), ['toolu_fresh'], 'and storage was rewritten');
});

// --- Agents tab: what an empty room is allowed to leave unsaid --------------------------------
// The reported fault was "XP rises, nobody walks in", and it held for seven weeks because the
// screen could not tell three situations apart: nobody invoked, still running, and ran but matched
// no open folder. XP is awarded over every call with no scoping; the room is scoped. This pins the
// counts the room needs to say which one it is, and the opt-out for the people it is wrong for.
function lastPush() { const d = posted.filter((m) => m.type === 'data').pop(); return d && d.data; }
function withWorkspace(fsPath, scope, fn) {
  const ws = vscode.workspace.workspaceFolders, cfg = vscode.workspace.getConfiguration;
  vscode.workspace.workspaceFolders = [{ uri: { fsPath } }];
  if (scope) vscode.workspace.getConfiguration = () => ({ get: (k, d) => (k === 'agents.scope' ? scope : d), update: () => Promise.resolve() });
  try { return fn(); } finally { vscode.workspace.workspaceFolders = ws; vscode.workspace.getConfiguration = cfg; }
}

test('a run from a folder this window has not opened is counted but not shown', () => {
  const NOW = Date.now();
  fs.mkdirSync(AGENTS_PROJ, { recursive: true });
  fs.writeFileSync(path.join(AGENTS_PROJ, 'scope.jsonl'),
    JSON.stringify(agentCall('toolu_scope', 'code-reviewer', NOW - 5 * MIN, 'review')) + '\n');
  // the window is open on /elsewhere, the transcript sits under projects/ws: the encoded names
  // cannot line up, which is the whole failure mode
  withWorkspace('/elsewhere', null, () => { onMessage({ type: 'ready' }); });
  const sc = lastPush().agentActivity.scope;
  assert.equal(instance('toolu_scope'), undefined, 'nobody walks in');
  assert.equal(sc.matched, 0, 'and nothing matched this window');
  assert.ok(sc.calls >= 1, 'but the room is told runs happened, which is what it must say out loud');
  assert.equal(sc.all, false);
});

test('agents.scope=all puts that same run in the room, and says so', () => {
  const NOW = Date.now();
  // a file of its own: the transcript cache reads appends, so rewriting one in place would
  // hand the parser a partial line rather than a new record
  fs.writeFileSync(path.join(AGENTS_PROJ, 'scope2.jsonl'),
    JSON.stringify(agentCall('toolu_scope2', 'code-reviewer', NOW - 5 * MIN, 'review again')) + '\n');
  withWorkspace('/elsewhere', 'all', () => { onMessage({ type: 'ready' }); });
  const sc = lastPush().agentActivity.scope;
  assert.equal(instance('toolu_scope2').state, 'active', 'the run is in the room now');
  assert.equal(sc.all, true, 'and the note can tell the user that is why');
  assert.equal(sc.matched, 0, 'matched still reports the truth about the folder, not the setting');
});

// --- the folder name Claude Code actually writes --------------------------------------------
// Issue #1 was not the scope test being too strict, it was the encoding being wrong. Claude Code
// replaces every character outside [A-Za-z0-9-], and this encoded only the separators, so a
// workspace with a dot or an underscore in it could never equal the folder its own transcripts
// sat in. The reporter's path had both: /home/vale/_GITHUB/.../valentinherrmann.github.io.
// Measured against the real CLI in three directories, including Hangul, which is 1:1 like the
// rest (the ancestor test indexes the raw path by the encoded length, so that has to hold).
const ENCODINGS = [
  ['/ws/_GITHUB/Valentin/site.github.io', '-ws--GITHUB-Valentin-site-github-io', 'dots and an underscore'],
  ['/ws/my project (old)', '-ws-my-project--old-', 'spaces and brackets'],
  ['/ws/한글폴더-테스트', '-ws---------', 'Hangul, one dash a syllable'],
  ['/ws/plain', '-ws-plain', 'a path that needed no replacing at all']
];
for (const [wsPath, folder, what] of ENCODINGS) {
  test('a run is matched to a workspace with ' + what, () => {
    const dir = path.join(HOME, '.claude', 'projects', folder);
    fs.mkdirSync(dir, { recursive: true });
    const id = 'toolu_enc' + folder.replace(/[^a-z0-9]/gi, '');
    fs.writeFileSync(path.join(dir, 'enc.jsonl'),
      JSON.stringify(agentCall(id, 'code-reviewer', Date.now() - 2 * MIN, 'review')) + '\n');
    withWorkspace(wsPath, null, () => { onMessage({ type: 'ready' }); });
    assert.ok(instance(id), 'nobody walked in from ' + folder + ' for a window open on ' + wsPath);
    assert.equal(lastPush().agentActivity.scope.verdict, 'matched');
  });
}

test('the counts the room quotes are today\'s, not the four hours of yesterday the list keeps', () => {
  // calls are collected from AGENT_RUN_WINDOW_MS BEFORE midnight so a run started last night and
  // still going can walk in. A sentence that says "today" may not count those, or the room reads
  // "3 runs today" at 00:05 on a day nothing has happened in yet.
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  let before;
  withWorkspace('/elsewhere', null, () => { onMessage({ type: 'ready' }); });
  before = lastPush().agentActivity.scope.calls;
  fs.writeFileSync(path.join(AGENTS_PROJ, 'midnight.jsonl'), [
    agentCall('toolu_lastnight', 'code-reviewer', midnight.getTime() - 60 * MIN, 'started last night'),
    agentCall('toolu_today', 'code-reviewer', Date.now() - 3 * MIN, 'started today')
  ].map((r) => JSON.stringify(r)).join('\n') + '\n');
  withWorkspace('/elsewhere', null, () => { onMessage({ type: 'ready' }); });
  const sc = lastPush().agentActivity.scope;
  assert.equal(sc.calls, before + 1, 'only the one from today is counted');
  assert.ok(instance('toolu_lastnight') === undefined, 'and neither of them is in the room, being out of scope');
});

test('the scope log prints the folder the calls came from, not only the ones on disk', () => {
  logged.length = 0;
  ext._test.resetScopeLog();
  const NOW = Date.now();
  fs.writeFileSync(path.join(AGENTS_PROJ, 'scope3.jsonl'),
    JSON.stringify(agentCall('toolu_scope3', 'code-reviewer', NOW - 5 * MIN, 'review once more')) + '\n');
  withWorkspace('/elsewhere', null, () => { onMessage({ type: 'ready' }); });
  const lines = logged.filter((l) => l.indexOf('[scope]') === 0);
  const verdict = lines.filter((l) => l.indexOf('[scope] none-matched') === 0).pop();
  assert.ok(verdict, 'the verdict line is printed: ' + JSON.stringify(lines));
  // encoded vs from is the comparison the report needed and the old log never printed
  assert.ok(lines.some((l) => l.indexOf('encoded=["-elsewhere"]') >= 0), 'the encoded workspace: ' + JSON.stringify(lines));
  assert.ok(verdict.indexOf('from=["ws x') >= 0, 'and the folder the calls came from: ' + verdict);
});

test('the scope log is quiet while the verdict holds, and speaks again when it changes', () => {
  logged.length = 0;
  ext._test.resetScopeLog();
  // a transcript that WILL match /ws once the window is opened there. Claude Code encodes the
  // leading separator too, so the folder for /ws is "-ws"
  const match = path.join(HOME, '.claude', 'projects', '-ws');
  fs.mkdirSync(match, { recursive: true });
  fs.writeFileSync(path.join(match, 'here.jsonl'),
    JSON.stringify(agentCall('toolu_here', 'test-runner', Date.now() - 4 * MIN, 'run the suite')) + '\n');
  withWorkspace('/elsewhere', null, () => {
    onMessage({ type: 'ready' });
    const after1 = logged.filter((l) => l.indexOf('[scope]') === 0).length;
    onMessage({ type: 'ready' });
    assert.equal(logged.filter((l) => l.indexOf('[scope]') === 0).length, after1, 'an unchanged verdict says nothing');
    // the same window, now opened on the folder the transcript belongs to
    vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' } }];
    onMessage({ type: 'ready' });
    const lines = logged.filter((l) => l.indexOf('[scope]') === 0);
    assert.ok(lines.some((l) => l.indexOf('[scope] matched') === 0), 'the change is printed: ' + JSON.stringify(lines));
  });
});

// A test that throws mid-round leaves that round live, and every test after it then fails on
// 'a round is already in progress'. Closing what is open keeps one fault from being reported as four
// ---------------------------------------------------------------------------------------------
// the account with no five-hour window (an authenticated Ultra, 2026-10-30)
// ---------------------------------------------------------------------------------------------
// The host was already right about the reading itself: it keeps only the limits an account has and
// leaves the rest null. What it was not right about is what it then PRINTED.
test('the status bar of an account with no 5h window says the week, not "loading…" for ever', () => {
  const ULTRA = { fh: null, sd: { used_percentage: 61, resets_at: Math.floor(Date.now() / 1000) + 3 * 86400 } };
  const PRO = { fh: { used_percentage: 42, resets_at: Math.floor(Date.now() / 1000) + 2 * 3600 }, sd: ULTRA.sd };
  try {
    config['statusBar.show'] = 'session';
    ext._test.renderStatusBar(ULTRA);
    assert.equal(statusBar.text, 'wk 61%', 'session-only on an account with no session: the week');
    // and the account that HAS one is untouched by that fallback: session-only still means session
    ext._test.renderStatusBar(PRO);
    assert.equal(statusBar.text, '5h 42%');
    config['statusBar.show'] = 'session+weekly';
    ext._test.renderStatusBar(ULTRA);
    assert.equal(statusBar.text, 'wk 61%', 'both modes: the one reading there is');
    ext._test.renderStatusBar(PRO);
    assert.equal(statusBar.text, '5h 42% · wk 61%');
    // a call that came back with NEITHER limit is a failure and still says so: the fallback may
    // not turn "we could not read it" into a confident blank
    config['statusBar.show'] = 'session';
    ext._test.renderStatusBar({ fh: null, sd: null });
    assert.equal(statusBar.text, 'Claude usage: loading…');
  } finally { delete config['statusBar.show']; }
});

test('a window that restores a reading pushes the age it was READ at, not the age of the push', () => {
  // The whole path, not the rule: globalState held a stamped reading before activate() ran (see
  // the memento at the top of this file), and what the panel is handed has to carry that stamp.
  // It was read and dropped, so every new window drew restored figures with no reading time at
  // all, which is the dash a reader saw where the age belonged.
  withWorkspace('/elsewhere', null, () => { onMessage({ type: 'ready' }); });
  const d = lastPush();
  assert.equal(d.usageAt, RESTORED_AT, 'the stored stamp, to the millisecond');
  assert.ok(d.refreshedAt > d.usageAt, 'and it is older than this push, which is the point of having both');
  assert.equal(Math.round(d.sd.used_percentage), 61, 'the restored figures are what is being stamped');
});

test('a restored reading keeps its own age, and a stamp this window cannot place keeps none', () => {
  // A new window draws the stored figures instantly, and the panel's freshness row is the only
  // thing that can say they were read an hour ago. The restore path read the stamp and dropped it,
  // so every new window drew a dash where the age belonged.
  const NOW = Date.UTC(2026, 10, 19, 12, 0, 0);
  const at = (t) => ext._test.restoredUsageAt({ at: t }, NOW);
  assert.equal(at(NOW - 90 * 1000), NOW - 90 * 1000, 'a stamp from 90 seconds ago is the age');
  assert.equal(at(NOW), NOW, 'and one from this instant is too');
  // the two that really happen, and both would be read as "fresh for ever" if they were believed:
  // globalState is synced between machines and survives a clock change
  assert.equal(at(NOW + 60 * 1000), 0, 'a stamp from the future cannot be placed');
  assert.equal(at(NOW - 8 * 86400 * 1000), 0, 'nor one older than the longest window the data describes');
  assert.equal(at(NOW - 6.9 * 86400 * 1000), NOW - 6.9 * 86400 * 1000, 'just inside seven days is still a reading');
  assert.equal(at(0), 0);
  assert.equal(at(undefined), 0);
  assert.equal(at('not a time'), 0);
  assert.equal(ext._test.restoredUsageAt(null, NOW), 0, 'and nothing stored at all is no age');
});

test('the host pushes today\'s first message, which is the only span of activity it can read', () => {
  // The panel's Active tile reads the five-hour window's elapsed part. An account with no window
  // has no such number, and there is nothing to subtract it from, so the tile falls back to the
  // transcripts: today's first message to today's last.
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const FIRST = startOfToday.getTime() + 5 * 60 * 1000;   // 00:05, earlier than any other lane here
  const line = (id, t) => JSON.stringify({
    type: 'assistant', requestId: id, timestamp: new Date(t).toISOString(), cwd: '/elsewhere',
    message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }
  });
  fs.writeFileSync(path.join(AGENTS_PROJ, 'span.jsonl'),
    [line('req-first', FIRST), line('req-last', FIRST + 90 * 60 * 1000)].join('\n') + '\n');
  withWorkspace('/elsewhere', null, () => { onMessage({ type: 'ready' }); });
  const d = lastPush();
  assert.equal(d.firstT, FIRST, 'the earliest of today, not the latest and not yesterday');
  assert.ok(d.last && d.last.t >= d.firstT, 'and the span it is one end of is not negative');
});

// --- the shop: the one screen that spends -------------------------------------------------------
// It is not a game, so it is not in the register and it is not on the budget list: what it rides is
// gameReply (one balance read per reply, `free` measured against the live rounds) and
// recordGameResult (one forced write carrying the purchase and the money together).
const shop = require(path.join(ROOT, 'shop.js'));
const shopRec = () => (gs.data[LEDGER].shop || null);
const priceOf = (key) => shop.itemOf(key).price;
// Raise the stored day so there is something to spend. A day's cell is merged with max, so the
// store adopts this on its next read and the balance is this figure in credits
function fundTo(credits0) {
  gs.data[LEDGER].days['2026-09-01'].input = credits0 * 10000;
  return credits0;
}

test('shop: open answers with the catalog, nothing owned and nothing held', () => {
  const r = send({ type: 'shop', op: 'open', n: 11 });
  assert.equal(r.n, 11, 'the reply echoes the request number');
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.owned, [], 'a fresh install owns nothing');
  // the shelf is the scenes, each with what may go in it and what that costs. The screen is
  // handed those figures and prices nothing itself
  assert.deepEqual(r.state.slots.map((s) => s.id), shop.SLOTS.map((s) => s.id));
  assert.deepEqual(r.state.slots.map((s) => s.opts.map((o) => o.price)),
    shop.SLOTS.map((s) => s.opts.map((k) => shop.itemOf(k).price)), 'the screen is not pricing anything');
  // everything free is had from the first launch and nothing priced is
  const row = (slot, key) => r.state.slots.filter((s) => s.id === slot)[0].opts.filter((o) => o.key === key)[0];
  assert.equal(row('quiet', 'idle').owned, true);
  assert.equal(row('typing', 'working').owned, true);
  assert.equal(row('work', 'coding').owned, true, 'the shared free drawing is not had in both scenes');
  assert.equal(row('burn', 'despair').owned, true);
  assert.equal(row('burn', 'float').owned, false);
  assert.equal(row('quiet', 'sleep').owned, false, 'a priced drawing was had for nothing');
  // EVERY SCENE FALLS BACK TO SOMETHING FREE, which is what stops a fresh install having a scene
  // it cannot fill. Read off the catalog rather than listed here, so a drawing moving rung cannot
  // leave a scene unfillable without this failing
  for (const s of r.state.slots) {
    assert.equal(shop.itemOf(s.free).price, 0, s.id + ' falls back to something priced');
    assert.ok(s.opts.some((o) => o.owned), s.id + ' has nothing in it a fresh install may wear');
  }
  // ...and a press can only change a scene that holds more than one drawing THE READER HAS. A
  // priced drawing beside a free one does not make the scene choosable until it is bought, which
  // is why quiet is settled here and not after the purchase a few tests down
  assert.deepEqual(r.state.slots.map((s) => s.pick),
    shop.SLOTS.map((s) => s.opts.filter((k) => !shop.itemOf(k).price).length > 1));
  assert.deepEqual(r.state.slots.map((s) => s.pick), [false, true, true, false, false]);
  assert.equal(r.free, r.balance, 'nothing is riding, so the whole balance may be spent');
  assert.equal(shopRec(), null, 'opening the shop wrote a record');
});

// The last row of the shelf, which is not one of the scenes and is not the next one either: a set
// of drawings that belong to no moment at all. The reply carries what the cells ARE and not which of them are in play, exactly
// as it carries the scenes' drawings and not which one is worn: that half rides the data push, and
// a second copy here could disagree with it between two messages.
//
// IT IS SOLD LIKE ANY OTHER ROW. That is the part worth pinning, because it reads oddly at first:
// nobody can summon one of these to look at what they bought. What makes the bargain the same as a
// scene's is that an UNBOUGHT pool drawing is not in play at all, so buying it is what puts it in
// play. The cell therefore has two lives, and the second one is the switch (the test below).
test('shop: the shelf carries the row that has no scene, and it is sold like the rest', () => {
  const r = send({ type: 'shop', op: 'open', n: 12 });
  assert.equal(r.state.pool.id, shop.POOL_ID);
  assert.ok(r.state.pool.cells >= r.state.pool.opts.length, 'the row shows at least what is in it');
  assert.deepEqual(r.state.pool.opts.map((o) => o.key), shop.POOL.slice());
  // ITS PRICES COME OFF THE SAME LADDER as every other row's, and the screen is handed them rather
  // than working one out. Read against the catalog, so a drawing moving rung moves both at once
  assert.deepEqual(r.state.pool.opts.map((o) => o.price), shop.POOL.map((k) => shop.itemOf(k).price));
  for (const o of r.state.pool.opts) {
    assert.ok(o.price === 0 || shop.PRICES.indexOf(o.price) >= 0, o.key + ' is priced off the ladder');
  }
  // NOTHING PRICED IS HAD FOR NOTHING, here as everywhere: `owns` is the one place that answers it
  assert.deepEqual(r.state.pool.opts.map((o) => o.owned), shop.POOL.map((k) => !shop.itemOf(k).price));
  assert.equal('on' in r.state.pool.opts[0], false, 'which ones are in play is not in the reply');
  assert.equal(shopRec(), null, 'reading the shelf wrote a record');
});

test('shop: credits riding on a live round cannot be spent, and a refusal writes nothing', () => {
  // THE BUDGET IS NOT THE HEADER BALANCE. A stake does not leave the balance until its round
  // settles, so the shop is measured against what the tables left, like every other screen
  // (docs/shop-spec.md, section 3-4). A bet of everything but one credit is the cheapest way to
  // say so through the real host.
  // The ROUND HAS TO STILL BE LIVE for anything to be held, and a deal can settle on the spot (a
  // natural, or the dealer's peek): three runs in twenty-five dealt one, and then the stake was
  // back in the purse and the purchase went through. So the seed is chosen, the way every other
  // test in this file that needs a particular hand chooses one
  const seed = findSeed('shop-held-', (st) => st.phase === 'player');
  ext._test.setBjSeeds(() => seed);
  try {
    const bal = send({ type: 'shop', op: 'open' }).balance;
    const live = send({ type: 'bj', op: 'deal', bet: bal - 1 });
    assert.equal(live.error, undefined, 'the test needs a live round to hold the stake');
    assert.equal(live.state.phase, 'player', 'the round settled at once, so nothing is held');
    const r = send({ type: 'shop', op: 'buy', key: 'float', n: 12 });
    assert.equal(r.error, 'not enough credits', 'a stake in progress was spent twice');
    assert.equal(r.balance, bal, 'the header balance alone would have allowed it');
    assert.equal(r.free, 1, 'the stake is what is held back');
    assert.equal(shopRec(), null, 'a refusal wrote a record');
    // the other refusals, which do not need a purse at all. AN EMPTY SHELF SLOT HAS NO NAME to be
    // bought under, and a name that is not in the catalog is where that is enforced
    assert.equal(send({ type: 'shop', op: 'buy', key: 'soon' }).error, 'nothing is sold under that name');
    assert.equal(send({ type: 'shop', op: 'buy', key: '' }).error, 'nothing is sold under that name');
    assert.equal(send({ type: 'shop', op: 'buy', key: 'mascot:float' }).error, 'nothing is sold under that name');
    assert.equal(send({ type: 'shop', op: 'buy' }).error, 'nothing is sold under that name');
    assert.equal(send({ type: 'shop', op: 'melt', key: 'float' }).error, 'unknown action');
    assert.equal(shopRec(), null, 'a refusal wrote a record');
    let st = live.state;
    while (st.phase === 'player') st = send({ type: 'bj', op: 'stand' }).state;  // give the stake back
  } finally { ext._test.setBjSeeds(null); }
});

test('shop: a purchase is charged once, lands in the ledger, and the reply comes before the push', () => {
  fundTo(5000);                                         // enough for the one thing on the shelf
  // ...AND THE MINE IS LET DIG FIRST. Funding this test raised the ledger's token count, which is
  // the mine's depth (mine.js), so the next push after it claims the ground those tokens dug and
  // that claim is a ledger write of its own. One push here leaves no backlog, so the counters below
  // are about the purchase and nothing else; without it this test measures two writes and blames
  // the shop for one of them
  onMessage({ type: 'ready' });
  const before = send({ type: 'shop', op: 'open' }).balance;
  const bankBefore = { won: bankSum('won'), lost: bankSum('lost'), hands: bankSum('hands') };
  const from = posted.length;
  onMessage({ type: 'shop', op: 'buy', key: 'float', n: 13 });
  const after = posted.slice(from);
  const reply = after.filter((m) => m.type === 'shop');
  assert.equal(reply.length, 1, 'one reply per message');
  assert.equal(reply[0].error, undefined);
  // THE REPLY FIRST, THE PUSH AFTER: the other way round and the header says the credits are gone
  // before the screen has said what they bought
  assert.ok(after.indexOf(reply[0]) < after.findIndex((m) => m.type === 'data'), 'the push arrived first');
  // the money: exactly the price, in the record, once
  const rec = shopRec();
  assert.equal(rec.spent, priceOf('float'));
  assert.equal(rec.moves, 1);
  assert.deepEqual(Object.keys(rec.owned), [shop.slotOf('float')]);
  const burn = reply[0].state.slots.filter((s) => s.id === 'burn')[0];
  assert.equal(burn.opts.filter((o) => o.key === 'float')[0].owned, true, 'the reply does not say it is theirs');
  assert.equal(burn.pick, true, 'the scene it went into is still settled');
  assert.equal(reply[0].balance, before - priceOf('float'), 'the balance moved by something other than the price');
  assert.equal(lastHeaderBalance(), before - priceOf('float'), 'the header and the reply disagree');
  // and NONE OF IT IS IN THE BANK. The bank is the grow-only counters a window keeps for hands it
  // won and lost, and a purchase banked there is the bug that mints money: two windows buying one
  // thing would each bank the price of it. What the bank sees is one more move and no money at all
  assert.equal(bankSum('won'), bankBefore.won, 'a purchase was banked as winnings');
  assert.equal(bankSum('lost'), bankBefore.lost, 'a purchase was banked as a loss');
  assert.equal(bankSum('hands'), bankBefore.hands + 1, 'the write that carried it is one write');
});

test('shop: it cannot be bought twice, and the second press costs nothing', () => {
  const before = shopRec().spent;
  const r = send({ type: 'shop', op: 'buy', key: 'float', n: 14 });
  assert.equal(r.error, 'you already have the Floating crab');
  assert.equal(shopRec().spent, before, 'a second purchase was charged for');
  assert.equal(shopRec().moves, 1, 'a refused purchase raised the clock');
});

test('shop: there is one op, and a move that spends nothing cannot be asked for', () => {
  // `use` was a second op while the shop sold a seat that could be swapped. With one thing and no
  // way back, owning it is using it, so the op is gone and a message naming it is an unknown
  // action: a move that spent nothing would still raise `moves`, and two windows writing records
  // called (moves, by) without either of them having paid is how a merge settles on a lie
  const spent = shopRec().spent, moves = shopRec().moves;
  assert.deepEqual(shop.OPS, ['buy']);
  assert.equal(send({ type: 'shop', op: 'use', key: 'float', n: 15 }).error, 'unknown action');
  assert.equal(send({ type: 'shop', op: 'sell', key: 'float' }).error, 'unknown action', 'a refund arrived');
  assert.equal(shopRec().spent, spent, 'a refused move moved money');
  assert.equal(shopRec().moves, moves, 'a refused move raised the clock');
});

test('shop: a full purse buys nothing that is not on the shelf', () => {
  // the empty slots again, this time with the money to buy something: what refuses them is the
  // catalog and not the budget
  fundTo(200000);
  const before = send({ type: 'shop', op: 'open' }).balance;
  const spent = shopRec().spent, moves = shopRec().moves;
  assert.ok(before > 100000, 'the test needs a purse this cannot be blamed on');
  for (const key of ['soon', 'witch', 'coming_soon', '__proto__']) {
    assert.equal(send({ type: 'shop', op: 'buy', key }).error, 'nothing is sold under that name', key);
  }
  assert.equal(shopRec().spent, spent, 'something not on the shelf was charged for');
  assert.equal(shopRec().moves, moves);
  assert.equal(send({ type: 'shop', op: 'open' }).balance, before, 'the balance moved');
});

test('shop: a purchase that loses the merge is neither taken nor paid for', () => {
  // The handler on its own, because what is being checked is what it does when the ledger comes
  // back holding ANOTHER window's record: it adopts that record, says so, and the purchase it just
  // made is gone, money and item together. Through the real host this would need two windows.
  // The foreign record below owns nothing at nine moves, which one shelf row cannot produce; it is
  // the shape of a record from a build with more on sale, and it is here because what is being read
  // is that NOTHING is lifted out of the loser (shop.js, merge)
  const other = { by: 'ffffffffffffffff', owned: {}, moves: 9, spent: priceOf('float') * 9 };
  const sent = [];
  let stored = null;
  const h = shop.createHandler({
    reply: (key, viewer, rec, n, error) => sent.push({ key, n, error, state: viewer.view(rec, 1e9) }),
    budget: () => 1e9,
    replica: () => 'aaaaaaaaaaaaaaaa',
    ensureReplica() {},
    // the write lands on a store another window has already moved past, so the merge keeps theirs
    record: (net, extra) => {
      assert.equal(net, 0, 'the bank was handed part of a purchase');
      stored = shop.merge(other, extra.shop);
      return { shop: stored };
    },
    storedShop: () => stored,
    push() {}, log() {}
  });
  h.handle({ type: 'shop', op: 'buy', key: 'float', n: 21 });
  const last = sent[sent.length - 1];
  assert.equal(last.error, 'another window spent these credits first');
  assert.equal(stored.by, other.by, 'the two windows did not settle on one record');
  assert.equal(stored.spent, other.spent, 'the dropped purchase was charged for');
  assert.equal(shop.owns(stored, 'float'), false, 'the dropped purchase left its item behind');
  // and what the screen is shown is the record that won, not the one it asked for
  assert.deepEqual(last.state.owned, []);
  assert.equal(last.state.slots.filter((s) => s.id === 'burn')[0].opts.filter((o) => o.key === 'float')[0].owned, false);
  // the next move this window makes is made on the record that won, so it is offered again
  h.handle({ type: 'shop', op: 'buy', key: 'float', n: 22 });
  // (this stub stores the handler's own argument, which is null for "nothing went wrong")
  assert.equal(sent[sent.length - 1].error, null, 'the window could not buy on the record that won');
  assert.equal(shop.owns(stored, 'float'), true);
  assert.equal(stored.spent, other.spent + priceOf('float'), 'the second purchase was not charged for');
});

test('shop: what every push carries is what was bought and what is worn', () => {
  const d = lastPush();
  assert.ok(d.shop, 'nothing about the shop on the push');
  assert.deepEqual(d.shop.owned, shop.view(shopRec()).owned);
  assert.deepEqual(d.shop.owned, [shop.slotOf('float')], 'the purchase above is not on the push');
  assert.equal('spent' in d.shop, false, 'the push carries money it has no use for');
  // and the scenes, worked out by shop.js out of the record and the stored choice. The one
  // just bought is worn without a second press: a purchase that showed nothing would read as
  // nothing having happened
  assert.deepEqual(d.shop.slots,
    { quiet: 'idle', typing: 'coding', work: 'working', burn: 'float', spent: 'stunned' });
  // ...and what is in play with no scene at all. EVERYTHING OWNED, which for a reader who has
  // bought only the floating crab is nothing: the pool's default is "everything owned", and
  // ownership is the same question `owns` answers everywhere else. A priced drawing showing up
  // unbought would be a teaser for something nobody can summon
  assert.deepEqual(d.shop.pool, []);
  assert.deepEqual(d.shop.pool, shop.randomPool(d.shop.owned, {}),
    'the push worked the pool out differently from shop.js');
});

test('shop: a scene takes only a drawing that goes in it and has been bought', () => {
  const spent = shopRec().spent, owned = JSON.stringify(shopRec().owned);
  const worn = () => lastPush().shop.slots;
  // no reply to a choice, by design: the data push is what says which drawing is in which scene,
  // here as for the panel's own crab, so there is nothing for `send` to wait for
  const wear = (slot, key) => onMessage({ type: 'mascotSlot', slot, key });
  // the free alternative in the typing scene, which needs no purchase
  wear('typing', 'working');
  assert.equal(worn().typing, 'working');
  assert.equal(gs.data.mascotSlotsV1.typing, 'working', 'the choice is not in globalState');
  // ...and the same in the scene that governs the working step's busy cell, which is the press the
  // reader did not have (docs/shop-spec.md, 3-1b). ONE PRESS MOVES ONE CELL: the typing scene keeps
  // what it was just given, so the two cells that both mean "a reply is landing" answer separately
  wear('work', 'coding');
  assert.equal(worn().work, 'coding');
  assert.equal(worn().typing, 'working', 'one scene\'s choice reached another scene');
  assert.equal(gs.data.mascotSlotsV1.work, 'coding');
  wear('work', 'working');
  assert.equal(worn().work, 'working', 'the drawing that cell always had could not be put back');
  // and back again, by name, which is what keeps an explicit choice of the free drawing
  wear('burn', 'despair');
  assert.equal(worn().burn, 'despair', 'the bought drawing could not be taken back out');
  assert.equal(gs.data.mascotSlotsV1.burn, 'despair');
  wear('burn', 'float');
  assert.equal(worn().burn, 'float');
  // REFUSED BY THE HOST, every one of them, and nothing moves
  const before = JSON.stringify(worn());
  for (const [slot, key] of [['quiet', 'float'], ['typing', 'float'], ['burn', 'coding'],
    ['spent', 'float'], ['nope', 'idle'], ['burn', 'nothing'], ['burn', ''], ['quiet', 'mascot:idle']]) {
    wear(slot, key);
    assert.equal(JSON.stringify(worn()), before, slot + ' <- ' + key + ' was allowed');
  }
  // THE MONEY RECORD DID NOT MOVE for any of it: a preference is not a purchase
  assert.equal(shopRec().spent, spent, 'choosing a drawing cost credits');
  assert.equal(JSON.stringify(shopRec().owned), owned, 'choosing a drawing changed what is owned');
  assert.equal(shopRec().moves, 1, 'choosing a drawing moved the record\'s clock');
});

test('shop: a drawing nobody bought cannot be worn, whatever is stored', () => {
  // the stored choice is read against what the reader owns on EVERY push, so a record that loses a
  // merge in another window (or a store edited by hand) cannot leave a drawing on screen that was
  // never paid for
  const FREE = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
  assert.deepEqual(shop.wornSlots([], { burn: 'float' }), FREE);
  assert.deepEqual(shop.wornSlots([], { burn: 'nothing', typing: 'idle', quiet: 'float', bogus: 'x' }),
    FREE, 'a stored choice was believed');
  assert.equal(shop.whyNotWear([], 'burn', 'float'), 'that has not been bought');
  assert.equal(shop.whyNotWear([shop.slotOf('float')], 'burn', 'float'), null);
  assert.equal(shop.whyNotWear([], 'burn', 'coding'), 'that does not go there');
  assert.equal(shop.whyNotWear([], 'nope', 'idle'), 'no such scene');
});

// A POOL CELL HAS TWO LIVES and this is the join between them: unbought it is a price like any
// other, and bought it is a switch. The switch is the only thing a reader can do about a drawing
// that turns up on its own, it is on the drawing itself rather than in a settings sheet, and
// emptying the row is how the whole thing is turned off, so off has to be a state the model holds.
test('shop: a drawing in that row is bought first and is a switch after', () => {
  const only = shop.POOL[0];
  const pool = () => lastPush().shop.pool;
  const set = (key, on) => onMessage({ type: 'mascotPool', key, on });
  // UNBOUGHT IT IS NOT IN PLAY, and it cannot be switched into play either: the switch is for
  // something that was paid for, and the host says so rather than the screen
  assert.deepEqual(pool(), [], 'something nobody bought was in play');
  set(only, true);
  assert.deepEqual(pool(), [], 'an unbought drawing was switched on');
  assert.equal(shop.whyNotPool([], only), 'that has not been bought');
  // ...so it is bought, off the same message and the same ladder as every other priced drawing
  const paid = shopRec() ? shopRec().spent : 0;
  const bought = send({ type: 'shop', op: 'buy', key: only, n: 61 });
  assert.equal(bought.error, undefined, 'the pool drawing could not be bought');
  assert.equal(shopRec().spent, paid + shop.itemOf(only).price, 'it was not charged its own price');
  assert.equal(shop.whyNotPool([shop.slotOf(only)], only), null);
  // AND BUYING IT PUTS IT IN PLAY, with no second press. A purchase that showed nothing would
  // read as nothing having happened, which is the scenes' rule too (wornSlots)
  assert.deepEqual(pool(), [only], 'buying it did not put it in play');

  const spent = shopRec().spent, owned = JSON.stringify(shopRec().owned);
  set(only, false);
  assert.deepEqual(pool(), [], 'the last one could not be switched off');
  assert.deepEqual(gs.data.mascotSlotsV1[shop.POOL_ID], [], 'the switch is not in globalState');
  // AN EMPTY LIST IS NOT "NOTHING STORED". The default is everything OWNED, so a reader who
  // turned it off must not get it back on the next launch, however much they own
  assert.deepEqual(shop.randomPool([shop.slotOf(only)], gs.data.mascotSlotsV1), []);
  assert.deepEqual(shop.randomPool([shop.slotOf(only)], {}), [only], 'nothing stored is not everything off');
  set(only, true);
  assert.deepEqual(pool(), [only], 'it could not be switched back on');
  // REFUSED BY THE HOST, and nothing moves: a key that is not in the row, a scene's drawing, junk
  const before2 = JSON.stringify(pool());
  for (const key of ['idle', 'float', 'nothing', '', 'mascot:blackhole', '__proto__']) {
    set(key, false);
    assert.equal(JSON.stringify(pool()), before2, key + ' was allowed into the row');
  }
  assert.equal(shop.whyNotPool([shop.slotOf(only)], 'idle'), 'that is not one of the random drawings');
  // a press that asks for the state it is already in writes nothing
  assert.equal(shop.poolAfter([shop.slotOf(only)], gs.data.mascotSlotsV1, only, true), null);
  // and no money moved for any of it
  assert.equal(shopRec().spent, spent, 'switching a drawing cost credits');
  assert.equal(JSON.stringify(shopRec().owned), owned, 'switching a drawing changed what is owned');
});

// --- the mine: the one game that is played by working --------------------------------------------
//
// The judging and the record's own rules are test/mine.test.js's, and the five claims it proves are
// listed in mine.js's header. What is pinned HERE is the WIRING, which is the half that can mint
// money: the ground is swept off the ledger's own token count and not off a clock, the claim and
// the purchase travel in one write, the money lands in the record rather than in the bank, and the
// reply goes out before the push.
//
// Every figure below is the engine's own answer rather than a number typed twice: the layout is a
// pure function of the depth, so `mine.sweep` can be asked what this ledger is about to pay and the
// test then checks that the handler wired exactly that into the record and the reply.
const mine = require(path.join(ROOT, 'mine.js'));
const credits = require(path.join(ROOT, 'credits.js'));
const mineRec = () => (gs.data[LEDGER].mine || null);
const tokNow = () => credits.weightedTotal(credits.normalizeLedger(gs.data[LEDGER]));
// Another day in the ledger, in millions of weighted tokens. Input tokens weigh 1, so a million of
// them is a million weighted and ten metres of drift at full speed (mine.js, TOK_PER_M)
function digMt(day, mt) {
  gs.data[LEDGER].days[day] = { input: mt * 1000000, output: 0, cache_creation: 0, cache_read: 0 };
}

test('mine: open answers with the drift, and with nothing beyond the lookahead', () => {
  onMessage({ type: 'ready' });                 // no backlog left over from the shop's funding
  const r = send({ type: 'mn', op: 'open', n: 31 });
  assert.equal(r.n, 31, 'the reply echoes the request number');
  assert.equal(r.error, undefined);
  const v = r.state;
  assert.equal(v.unit, mine.UNIT, 'the screen would have to invent the word');
  assert.deepEqual(v.window, { behind: mine.BEHIND_M, ahead: mine.AHEAD_M });
  // THE ONE THING THIS HOST KEEPS BACK. A webview holding the seam positions ten thousand metres
  // out is holding the rest of the deck (games/README.md, section 2)
  assert.ok(v.seam.every((s) => s.at > v.depth && s.at <= v.depth + v.window.ahead),
    'a seam outside the lookahead reached the webview: ' + JSON.stringify(v.seam));
  // THE KEY IN HAND IS PART OF THE ANSWER since 1.40.0: a seam carries whether this pick opens it
  // (mine.js, the seam table's `gate`), and this reader has bought nothing, so the window is the
  // one bare hands are shown
  assert.equal(v.tier, mine.FIST, 'a reader who has bought nothing was sent a rung');
  assert.deepEqual(v.seam, mine.seamsAhead(v.depth, mine.FIST), 'the window the screen is shown is not the engine\'s');
  // ...and the fold's pay table says what things are worth and not how dense the rock is
  assert.ok(v.pays.every((p) => p.odds === undefined), 'the odds travelled with the pay table');
  assert.equal(v.offer.price, mine.PICKS[0].price, 'the screen is being offered a price of its own');
});

test('mine: a pick is charged in the record, and the reply comes before the push', () => {
  const price = mine.PICKS[0].price;
  const before = send({ type: 'mn', op: 'open' }).balance;
  const bank0 = { won: bankSum('won'), lost: bankSum('lost'), hands: bankSum('hands') };
  const from = posted.length;
  onMessage({ type: 'mn', op: 'buy', n: 32 });
  const after = posted.slice(from);
  const reply = after.filter((m) => m.type === 'mn');
  assert.equal(reply.length, 1, 'one reply per message');
  assert.equal(reply[0].error, undefined);
  // THE REPLY FIRST, THE PUSH AFTER, like every table: the other way round and the header says the
  // credits are gone before the screen has said what they bought
  assert.ok(after.indexOf(reply[0]) < after.findIndex((m) => m.type === 'data'), 'the push arrived first');
  assert.equal(mineRec().pick, 1, 'the pick is not in the ledger');
  assert.equal(mineRec().spent, price, 'what it cost is not in the record');
  assert.equal(reply[0].balance, before - price, 'the balance moved by something other than the price');
  assert.equal(lastHeaderBalance(), before - price, 'the header and the reply disagree');
  // and none of it is in the bank, which is the grow-only counter per window: a purchase banked
  // there is the shape of the bug that minted 372,000 credits out of one sword
  assert.equal(bankSum('won'), bank0.won, 'a purchase was banked as winnings');
  assert.equal(bankSum('lost'), bank0.lost, 'a purchase was banked as a loss');
  assert.equal(bankSum('hands'), bank0.hands + 1, 'the write that carried it is one write');
});

test('mine: the ground the tokens dug is claimed once, in the record, and nothing is banked', () => {
  const rec0 = mineRec();
  const bank0 = { won: bankSum('won'), lost: bankSum('lost'), hands: bankSum('hands') };
  // 4 MT of work: 40 m with the pick just fitted, which is two cells of the drift
  digMt('2026-09-03', 4);
  const want = mine.sweep(mine.load(rec0, 0), tokNow());
  assert.ok(want.claim && want.claim.pay > 0, 'this ledger digs no ground that pays: pick another figure');
  const from = posted.length;
  onMessage({ type: 'ready' });                 // the host's own push, which is what digs
  const sent = posted.slice(from).filter((m) => m.type === 'mn');
  assert.equal(sent.length, 1, 'one push, one redraw');
  const v = sent[0].state;
  assert.equal(v.depth, want.claim.depth, 'the depth the screen was shown is not the ground that was dug');
  assert.equal(v.found.pay, want.claim.pay, 'the find the screen was shown is not the one that was paid');
  const rec = mineRec();
  assert.equal(rec.earned, rec0.earned + want.claim.pay, 'what the wall paid is not in the record');
  assert.equal(rec.claimedTo, want.rec.claimedTo, 'the boundary did not move with the money');
  // THE DATA PUSH THAT RAN THIS CLAIM WAS BUILT BEFORE IT, so the figure on it is the balance from
  // before and the REPLY is what carries the new one. That is deliberate rather than a lag nobody
  // noticed: this hook runs INSIDE push() (extension.js, gamesAfterPush), so asking for another
  // push from inside it would re-enter the thing that called it, and the panel settles its header
  // off the reply exactly as every table does (CUC.settle)
  assert.equal(sent[0].balance, lastHeaderBalance() + want.claim.pay,
    'the reply does not carry the balance this claim just made');
  assert.equal(bankSum('won'), bank0.won, 'the wall paid into the bank instead of into the record');
  assert.equal(bankSum('hands'), bank0.hands + 1, 'one claim is one write');

  // ...AND THE SAME GROUND IS NOT PAID FOR TWICE. `claimedTo` is a boundary, so a second push over
  // the same tokens has nothing to claim and nothing to say (mine.js, claim (b))
  const from2 = posted.length;
  onMessage({ type: 'ready' });
  assert.equal(posted.slice(from2).filter((m) => m.type === 'mn').length, 0,
    'a push with nothing new to say said something anyway');
  assert.equal(mineRec().earned, rec.earned, 'the same ground was paid for twice');
  assert.equal(bankSum('hands'), bank0.hands + 1, 'a push with nothing to claim still wrote to the ledger');
});

test('mine: a message is answered on the record another window left, not on the copy in memory', () => {
  // Another window digs: a later record in storage, which this window has to adopt before it
  // answers anything (games/README.md, section 3 point 4)
  const other = Object.assign({}, mineRec(), {
    by: 'ffffffffffffffff', moves: mineRec().moves + 5, earned: mineRec().earned + 777
  });
  gs.data[LEDGER].mine = other;
  const r = send({ type: 'mn', op: 'open', n: 33 });
  assert.equal(r.error, undefined);
  assert.equal(mineRec().by, other.by, 'the stored record was overwritten by the copy in memory');
  assert.equal(mineRec().earned, other.earned, 'the other window\'s money was dropped');
  // and the balance the reply carries has that window's earnings in it, because there is one purse
  assert.equal(r.balance, credits.creditSummary(credits.normalizeLedger(gs.data[LEDGER]), 'x', false).balance);
});

// --- the drive ring: what the crab is measured by -----------------------------------------------
//
// The arithmetic is test/drive.test.js's. What is pinned HERE is the plumbing between a transcript
// on disk and the `drive` field on a push, which is where every expensive mistake in this file's
// history has been:
//   1. the field on the push is the kernel over the ring, at the plan's own allowance.
//   2. ONE RESPONSE IS COUNTED ONCE. Claude Code writes one line per content block and only output
//      grows between them, so counting each line would read about twice the work.
//   3. ...INCLUDING ACROSS AN INCREMENTAL READ. Only appended bytes are parsed and a response's
//      later snapshot lands in a different read than its first, so the de-duplication has to
//      survive the boundary. This is the repository's core regression point (CLAUDE.md).
//   4. A FULL RE-READ MAY NOT POUR A WHOLE TRANSCRIPT IN. A file that shrank, or a day that rolled,
//      re-reads from byte zero, and the real transcripts run to hundreds of MB.
//   5. the ring is the MACHINE's, not this window's: the drive is how hard the machine is working.
const driveMod = require(path.join(ROOT, 'drive.js'));
const DRIVE_PROJ = path.join(HOME, '.claude', 'projects', 'drive-lane');
const MINUTE = 60000;
// Prices are weekly.js's (PRICES there), used here through round numbers: a million input tokens of
// Sonnet 5.5 is $2 and of Opus 5.5 is $4, so every figure below can be checked by hand
const SONNET = 'claude-sonnet-5-5-20260101';
const OPUS = 'claude-opus-5-5-20260101';
function usageLine(id, t, model, u) {
  return JSON.stringify({
    type: 'assistant', requestId: id + '-req', timestamp: new Date(t).toISOString(), cwd: '/drive-lane',
    message: {
      id, model,
      usage: Object.assign({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, u)
    }
  });
}
// EVERY OTHER TRANSCRIPT IS TAKEN AWAY FIRST, because the ring is the machine's: the lanes above
// this one leave their own files behind and a sum over all of them is not a figure anyone can check
// by hand. Deleting them also drops their cache entries on the next pass (readTokens, `live`).
//
// THIS BLOCK HAS TO STAY LAST IN THE FILE. Every lane above writes the transcript it reads, so none
// of them is hurt by this, but a lane added AFTER this one that reads a file an earlier lane wrote
// would be emptied without being told. The guard is the temp HOME: this cannot reach a real ~/.claude
function onlyTranscript(name, lines) {
  assert.match(HOME, /cuc-host-/, 'this only ever empties the lane’s own temp HOME');
  const stack = [path.join(HOME, '.claude', 'projects')];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.endsWith('.jsonl')) fs.unlinkSync(p);
    }
  }
  fs.mkdirSync(DRIVE_PROJ, { recursive: true });
  const p = path.join(DRIVE_PROJ, name);
  fs.writeFileSync(p, lines.join('\n') + '\n');
  return p;
}
const ringOf = () => ext._test.readTokens([]).recent;
const cells = (ring) => Object.keys(ring).map(Number).sort((a, b) => a - b);
function near(a, b, eps, why) {
  assert.ok(Math.abs(a - b) <= eps, (why || '') + ' got ' + a + ', wanted ' + b);
}

test('drive: the push carries the kernel over the last hour, at this plan’s own allowance', () => {
  const NOW = Date.now();
  const T_NEW = NOW - 2000;            // a reply that has just landed
  const T_OLD = NOW - 20 * MINUTE;     // ...and one two taus back
  onlyTranscript('drive.jsonl', [
    usageLine('m-old', T_OLD, OPUS, { input_tokens: 1000000 }),      // $4.00
    usageLine('m-new', T_NEW, SONNET, { input_tokens: 1000000 })     // $2.00
  ]);
  // THE RING, BY HAND: two cells, one cost each, nothing else on the machine
  const want = driveMod.emptyRing();
  driveMod.add(want, T_OLD, 4, NOW);
  driveMod.add(want, T_NEW, 2, NOW);
  assert.deepEqual(cells(ringOf()), cells(want), 'the cells the two replies fall in');
  for (const b of cells(want)) near(ringOf()[b], want[b], 1e-9, 'cell ' + b);

  // ...and the figure on the push. The kernel decays with the clock, so it is bracketed between the
  // same arithmetic a moment before the push and a moment after: a decaying figure can only be
  // inside that pair, and that is exact where comparing to one instant would be a race
  const before = driveMod.of(want, Date.now(), 'max_20x');
  onMessage({ type: 'ready' });
  const got = lastPush().drive;
  const after = driveMod.of(want, Date.now(), 'max_20x');
  assert.equal(typeof got, 'number');
  assert.ok(got <= before + 1e-12 && got >= after - 1e-12,
    'the push is not the kernel: ' + got + ' outside [' + after + ', ' + before + ']');
  // and the figure itself, written down: (2 + 4*e^-2)/10 dollars a minute over an even week's rate
  near(got, 0.9326, 0.02, 'the two replies');
  // THE TIER THIS LANE HAS IS NONE (no credentials file, and a .claude.json with no tier), so the
  // allowance above is the fallback. It is the largest one on purpose, which is the calm answer
  assert.equal(ext._test.teamCfg().plan, null, 'this lane reads no tier');
});

test('drive: one response written as several lines is one response', () => {
  const T = Date.now() - 5000;
  // three streaming snapshots of ONE response: the same id and requestId, only output growing
  onlyTranscript('stream.jsonl', [
    usageLine('m-s', T, SONNET, { input_tokens: 1000000, output_tokens: 10000 }),
    usageLine('m-s', T, SONNET, { input_tokens: 1000000, output_tokens: 50000 }),
    usageLine('m-s', T, SONNET, { input_tokens: 1000000, output_tokens: 100000 })
  ]);
  const ring = ringOf();
  assert.equal(cells(ring).length, 1);
  // $2 of input plus 100k of output at $10/M = $1. The maximum, not the sum of the three
  near(ring[cells(ring)[0]], 3, 1e-9, 'the response');
});

test('drive: ...and it is still one response when the snapshots land in different reads', () => {
  const T = Date.now() - 5000;
  // THE CORE REGRESSION POINT. Only appended bytes are parsed (CLAUDE.md), so the second snapshot
  // of a response is read in a later pass than the first, with nothing of the first left to compare
  // it against except the accumulator's own memory
  const p = onlyTranscript('incr.jsonl', [usageLine('m-i', T, SONNET, { input_tokens: 1000000, output_tokens: 10000 })]);
  const first = ringOf();
  near(first[cells(first)[0]], 2.1, 1e-9, 'the first snapshot alone');
  // append the rest of that response, and then a second response
  fs.appendFileSync(p, [
    usageLine('m-i', T, SONNET, { input_tokens: 1000000, output_tokens: 100000 }),
    usageLine('m-j', T, SONNET, { input_tokens: 500000 })
  ].join('\n') + '\n');
  const ring = ringOf();
  assert.equal(cells(ring).length, 1, 'all three lines are in the same ten seconds');
  // $3 for the first response at its maximum, $1 for the second. 5.1 would be the first one counted
  // twice, which is exactly what reading the appended line with no memory of the earlier one does
  near(ring[cells(ring)[0]], 4, 1e-9, 'the two responses');
  // and a partial trailing line waits for its own append rather than being parsed in half
  fs.appendFileSync(p, usageLine('m-k', T, SONNET, { input_tokens: 1000000 }).slice(0, 40));
  near(ringOf()[cells(ring)[0]], 4, 1e-9, 'half a line counted as a reply');
});

test('drive: a transcript that is re-read from byte zero does not count twice', () => {
  const T = Date.now() - 5000;
  const lines = [
    usageLine('m-a', T, SONNET, { input_tokens: 1000000 }),
    usageLine('m-b', T, OPUS, { input_tokens: 1000000 })
  ];
  const p = onlyTranscript('reparse.jsonl', lines);
  const b = cells(ringOf())[0];
  near(ringOf()[b], 6, 1e-9, '$2 and $4');
  // A FILE THAT SHRANK is the full re-parse this can force (readTokens, `fullParse`); the day
  // rolling takes the same branch and cannot be forced without moving the clock. The accumulator is
  // thrown away with the ring inside it, so the re-read has to rebuild the same figure and not add
  // to the old one
  fs.writeFileSync(p, lines[0] + '\n');
  near(ringOf()[b], 2, 1e-9, 'the file after it shrank');
  fs.writeFileSync(p, lines.join('\n') + '\n');
  near(ringOf()[b], 6, 1e-9, 'and grown again');
});

test('drive: a full re-read of an old transcript puts none of it in the ring', () => {
  const NOW = Date.now();
  // THE FAULT THIS WINDOW EXISTS FOR, at the scale it really happens: a day of replies in one file,
  // re-read from byte zero. Without the cutoff the crab would read last night's shift, and the ring
  // would hold a day of cells instead of an hour's
  const lines = [];
  for (let i = 1; i <= 24; i++) lines.push(usageLine('m-h' + i, NOW - i * 60 * MINUTE, OPUS, { input_tokens: 1000000 }));
  lines.push(usageLine('m-now', NOW - 3000, SONNET, { input_tokens: 1000000 }));
  onlyTranscript('long.jsonl', lines);
  const ring = ringOf();
  // exactly one cell: every hourly reply is an hour or more back, and the hour is exclusive at 3600s
  assert.equal(cells(ring).length, 1, 'the ring holds ' + cells(ring).length + ' cells of the day');
  near(ring[cells(ring)[0]], 2, 1e-9, 'only the reply from this minute');
  // and the accumulator does not carry keys for what it refused, which is the other half of the cost
  assert.ok(driveMod.of(ring, Date.now(), 'max_20x') < 1, 'a day of work read as the last hour');
});

test('drive: an empty machine reads zero rather than nothing', () => {
  onlyTranscript('quiet.jsonl', [JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), message: { content: 'hello' } })]);
  assert.deepEqual(ringOf(), {}, 'a transcript with no reply in it opens no cell');
  onMessage({ type: 'ready' });
  assert.equal(lastPush().drive, 0, 'and the push says zero, which the crab reads as quiet');
});

function closeRounds() {
  try {
    ext._test.setHlSeeds(null);
    ext._test.setSeeds('wh', null);
    for (let i = 0; i < 20 && send({ type: 'bj', op: 'open' }).state.phase === 'player'; i++) send({ type: 'bj', op: 'stand' });
    if (send({ type: 'wh', op: 'open' }).state.phase === 'spin') send({ type: 'wh', op: 'spin', risk: 'mild' });
    for (let i = 0; i < 400; i++) {
      const st = send({ type: 'hl', op: 'open' }).state;
      if (st.phase !== 'play') break;
      send({ type: 'hl', op: st.can.cashout ? 'cashout' : (st.can.higher ? 'higher' : 'lower') });
    }
  } catch (e) { console.log('  cleanup: ' + (e && e.message)); }
}

let failed = 0;
for (const t of tests) {
  // A sync runner drops a promise on the floor: an async test would stop at its first await
  // and still be counted as a pass. Refuse one instead of reporting a result nobody produced.
  try {
    const r = t.fn();
    if (r && typeof r.then === 'function') throw new Error('async test in a sync runner: use await t.fn()');
    console.log('PASS ' + t.name);
  }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
  closeRounds();
}
context.subscriptions.forEach((s) => { try { s.dispose(); } catch (e) { console.log('dispose: ' + e.message); } });
fs.rmSync(HOME, { recursive: true, force: true });
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
