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
process.env.HOME = HOME; // extension.js reads os.homedir() when it loads
process.env.CUC_TEST = '1'; // exposes _test.setBjSeeds / setHlSeeds / setPkSeeds, used to pick the cards

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
const hl = require(path.join(ROOT, 'highlow.js'));
const pkmod = require(path.join(ROOT, 'poker.js'));
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

// --- draw poker --------------------------------------------------------------------------
// A hand is one deck and one draw, and nothing carries, so a seed names a hand on its own: unlike
// pinHl above, this does not have to search against a deck the host is holding
const PAT = [true, true, true, true, true];
function pinPk(tag, want) {
  for (let i = 0; i < 5000; i++) {
    const seed = tag + i;
    if (want(pkmod.newHand({ seed, bet: 100 }))) { ext._test.setPkSeeds(() => seed); return seed; }
  }
  throw new Error('no seed for ' + tag);
}
// A seed whose five dealt cards already pay the given row, so holding all five settles there and
// the test knows the net before it deals
const pinRow = (tag, row) => pinPk(tag, (st) => pkmod.rankOf(st.cards) === row);

test('pk open with no hand: phase bet, the paytable, nothing on the table', () => {
  const r = send({ type: 'pk', op: 'open' });
  assert.equal(r.state.phase, 'bet');
  assert.deepEqual(r.state.cards, []);
  assert.equal(r.state.hand, null);
  assert.equal(r.error, undefined);
  assert.equal(r.balance, send({ type: 'bj', op: 'open' }).balance, 'one purse, one number');
  // the screen takes its nine rows off every reply, bet screen included
  assert.deepEqual(r.state.pays, pkmod.PAYS);
  assert.equal('seq' in r.state, false, 'one draw a hand: there is nothing to pace');
});

test('pk bad bets are refused and change nothing', () => {
  const hands = bankSum('hands');
  const balance = send({ type: 'pk', op: 'open' }).balance;
  for (const bet of [9, 10.5, '10', null, undefined, NaN, -10, Infinity, balance + 1]) {
    const r = send({ type: 'pk', op: 'deal', bet });
    assert.ok(r.error, 'bet ' + JSON.stringify(bet));
    assert.equal(r.state.phase, 'bet');
  }
  assert.equal(bankSum('hands'), hands);
  assert.equal(send({ type: 'pk', op: 'open' }).balance, balance);
});

test('pk hands settle once into the bank, the balance and the header', () => {
  let expected = send({ type: 'pk', op: 'open' }).balance;
  try {
    for (let i = 0; i < 20; i++) {
      // a payer and a loser in turn, so the bank is checked moving both ways and the purse ends
      // where it started
      const row = i % 2 === 0 ? pkmod.ROW.twoPair : pkmod.ROW.none;
      pinRow('bank-' + i + '-', row);
      const hands = bankSum('hands');
      let r = send({ type: 'pk', op: 'deal', bet: 10 });
      assert.equal(r.error, undefined);
      assert.equal(r.state.phase, 'draw');
      assert.equal(r.state.hand, null, 'nothing is paid before the draw');
      assert.equal(r.balance, expected, 'the deal moves no credits');
      assert.equal(bankSum('hands'), hands, 'a live hand has settled nothing');
      r = send({ type: 'pk', op: 'draw', hold: PAT });
      assert.equal(r.state.phase, 'done');
      assert.equal(r.state.hand.name, row.name);
      assert.equal(r.state.net, 10 * row.mult - 10);
      expected += r.state.net;
      assert.equal(r.balance, expected);
      assert.equal(lastHeaderBalance(), expected);
      assert.equal(bankSum('hands'), hands + 1);
      // anything after settlement is refused and does not settle again
      const again = send({ type: 'pk', op: 'draw', hold: PAT });
      assert.equal(again.error, 'no hand in progress');
      assert.equal(bankSum('hands'), hands + 1);
    }
  } finally { ext._test.setPkSeeds(null); }
  assert.equal(Object.keys(bank()).length, 1, 'all three games share this activation\'s one bank key');
  assert.equal(send({ type: 'pk', op: 'open' }).balance, expected);
});

test('pk: a deal during a hand is refused; open resumes it', () => {
  pinRow('resume-', pkmod.ROW.jacks);
  try {
    const r = send({ type: 'pk', op: 'deal', bet: 10 });
    assert.equal(r.state.phase, 'draw');
    const refused = send({ type: 'pk', op: 'deal', bet: 10 });
    assert.equal(refused.error, 'a hand is already in progress');
    assert.deepEqual(refused.state.cards, r.state.cards);
    const reopened = send({ type: 'pk', op: 'open' });
    assert.deepEqual(reopened.state.cards, r.state.cards);
    assert.deepEqual(reopened.state.held, [false, false, false, false, false]);
    assert.deepEqual(reopened.state.can, { draw: true });
    const out = send({ type: 'pk', op: 'draw', hold: PAT });
    assert.equal(out.state.phase, 'done');
    assert.equal(out.state.net, 0, 'a paid pair hands the bet straight back');
  } finally { ext._test.setPkSeeds(null); }
});

test('pk: the hold flags are checked before a credit moves', () => {
  pinRow('hold-', pkmod.ROW.jacks);
  try {
    const before = send({ type: 'pk', op: 'open' }).balance;
    const hands = bankSum('hands');
    const dealt = send({ type: 'pk', op: 'deal', bet: 10 });
    assert.equal(dealt.state.phase, 'draw');
    for (const hold of [undefined, null, [], PAT.slice(0, 4), PAT.concat([true]), [1, 0, 1, 0, 1],
      [true, true, true, true, 'false'], 'hold', { 0: true }]) {
      const r = send({ type: 'pk', op: 'draw', hold });
      assert.equal(r.error, 'hold must be 5 true/false flags', JSON.stringify(hold));
      assert.equal(r.state.phase, 'draw', 'the hand is still live');
      assert.deepEqual(r.state.cards, dealt.state.cards, 'and no card moved');
      assert.equal(r.balance, before);
    }
    assert.equal(bankSum('hands'), hands, 'a refused draw settles nothing');
    // the flags the webview really sends come back as the mask the draw used
    const out = send({ type: 'pk', op: 'draw', hold: [true, false, true, false, true] });
    assert.equal(out.error, undefined);
    assert.deepEqual(out.state.held, [true, false, true, false, true]);
    assert.equal(bankSum('hands'), hands + 1);
  } finally { ext._test.setPkSeeds(null); }
});

test('pk: a miss costs the bet, and the reply comes before the push', () => {
  pinRow('miss-', pkmod.ROW.none);
  try {
    const before = send({ type: 'pk', op: 'open' }).balance;
    send({ type: 'pk', op: 'deal', bet: 100 });
    const from = posted.length;
    const lost = send({ type: 'pk', op: 'draw', hold: PAT });
    assert.equal(lost.state.phase, 'done');
    assert.equal(lost.state.hand.name, 'No win');
    assert.equal(lost.state.net, -100, 'only the bet goes');
    assert.equal(lost.balance, before - 100);
    const kinds = posted.slice(from).map((m) => m.type);
    assert.ok(kinds.indexOf('pk') >= 0 && kinds.indexOf('data') > kinds.indexOf('pk'), 'order ' + kinds.join(','));
  } finally { ext._test.setPkSeeds(null); }
});

// Ten hands, not more: these are real random hands at the minimum bet, held pat, which returns
// about a third of what it stakes (test/poker.test.js measures it), so every pass is money out of
// the one purse the tests below share. Ten is at worst 100 credits of the 1,000 START_CREDITS, and
// the three-games test further down needs 60 left to open with
test('pk: nothing a live reply carries re-deals the deck; the seed arrives at done', () => {
  let live = 0;
  for (let i = 0; i < 10; i++) {
    const r = send({ type: 'pk', op: 'deal', bet: 10 });
    assert.equal(r.error, undefined);
    assert.equal(r.state.phase, 'draw');
    live++;
    const leaves = [];
    (function walk(x) { if (x == null) return; if (typeof x !== 'object') { leaves.push(String(x)); return; } for (const k in x) { leaves.push(k); walk(x[k]); } })(r);
    assert.equal('seed' in r.state, false);
    const out = send({ type: 'pk', op: 'draw', hold: PAT });
    const real = JSON.stringify(pkmod.newHand({ seed: out.state.seed, bet: 10 }).deck.slice(0, 12));
    assert.notEqual(out.state.id, out.state.seed);
    for (const leaf of leaves) assert.notEqual(JSON.stringify(pkmod.newHand({ seed: leaf, bet: 10 }).deck.slice(0, 12)), real);
  }
  assert.equal(live, 10);
});

test('pk: the reply echoes the request number, and unknown ops are refused', () => {
  assert.equal(send({ type: 'pk', op: 'open', n: 81 }).n, 81);
  assert.equal(send({ type: 'pk', op: 'draw', hold: PAT, n: 82 }).n, 82);   // refused, still echoed
  assert.equal('n' in send({ type: 'pk', op: 'open', n: 'x' }), false);     // not a number: nothing echoed
  assert.equal(send({ type: 'pk', op: 'surrender' }).error, 'unknown action');
  assert.equal(send({ type: 'pk', op: 'hold', i: 1 }).error, 'unknown action', 'holding is the webview\'s own doing');
});

// Three live stakes against one purse. Each game takes every credit the other two have not
// reserved, which is the tightest the purse can be: with heldBy() blind to any one of them, two
// losing rounds would take the balance under zero.
// All three are pinned to outcomes that give the bet back (a blackjack push, a high-low call that
// lands, a poker hand dealt a paid pair and held pat), so the purse ends each pass where it began
// and twenty passes cannot dry it out
test('three games, one purse: each is bet against what the other two left', () => {
  const push = findSeed('push3-', (st) => {
    if (st.phase !== 'player') return false;
    const stood = bj.act(st, 'stand');
    return stood.phase === 'done' && stood.net === 0;
  });
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
      const balance = check(send({ type: 'pk', op: 'open' })).balance;
      assert.ok(balance >= 60, 'three stakes of at least ten need this much: ' + balance);
      const third = Math.floor(balance / 3);
      // blackjack holds a third open
      let b = check(send({ type: 'bj', op: 'deal', bet: third }));
      assert.equal(b.error, undefined);
      assert.equal(b.state.phase, 'player', 'the pinned hand is live, so its stake stays held');
      // high-low holds another third
      pinWinner('three-hl-' + i);
      let h = check(send({ type: 'hl', op: 'deal', bet: third }));
      assert.equal(h.error, undefined);
      assert.equal(h.state.phase, 'play');
      // and poker may have exactly what the two of them left, not a credit more
      const room = balance - third * 2;
      assert.ok(room >= 10, 'room left for poker: ' + room);
      assert.equal(check(send({ type: 'pk', op: 'deal', bet: room + 1 })).error, 'not enough credits');
      pinRow('three-pk-' + i + '-', pkmod.ROW.jacks);
      const p = check(send({ type: 'pk', op: 'deal', bet: room }));
      assert.equal(p.error, undefined);
      assert.equal(p.state.phase, 'draw');
      if (b.state.phase === 'player' && h.state.phase === 'play') all3++;
      // nothing at all is free now: blackjack cannot double into what the other two are holding
      assert.equal(send({ type: 'bj', op: 'double' }).error, 'not enough credits');
      assert.equal(send({ type: 'bj', op: 'open' }).state.can.double, false);
      // what each one sees free is exactly its own stake, which is the whole purse accounted for
      // three ways. Counting a game's own stake as held would take it out twice (see the double
      // test above), and not counting the other two would offer credits the host is about to refuse
      assert.equal(check(send({ type: 'hl', op: 'open' })).free, third);
      assert.equal(send({ type: 'pk', op: 'open' }).free, room);
      assert.equal(send({ type: 'bj', op: 'open' }).free, third);
      // settle all three; none of them took credits another was holding
      const out = check(send({ type: 'pk', op: 'draw', hold: PAT }));
      assert.equal(out.state.net, 0, 'the pinned poker hand returns its bet');
      h = check(send({ type: 'hl', op: safest(h.state) }));
      if (h.state.phase === 'play') h = check(send({ type: 'hl', op: 'cashout' }));
      while (b.state.phase === 'player') b = check(send({ type: 'bj', op: 'stand' }));
    }
  } finally { ext._test.setBjSeeds(null); ext._test.setHlSeeds(null); ext._test.setPkSeeds(null); }
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

// A test that throws mid-round leaves that round live, and every test after it then fails on
// 'a round is already in progress'. Closing what is open keeps one fault from being reported as four
function closeRounds() {
  try {
    ext._test.setHlSeeds(null);
    ext._test.setPkSeeds(null);
    for (let i = 0; i < 20 && send({ type: 'bj', op: 'open' }).state.phase === 'player'; i++) send({ type: 'bj', op: 'stand' });
    if (send({ type: 'pk', op: 'open' }).state.phase === 'draw') send({ type: 'pk', op: 'draw', hold: [true, true, true, true, true] });
    for (let i = 0; i < 400; i++) {
      const st = send({ type: 'hl', op: 'open' }).state;
      if (st.phase !== 'play') break;
      send({ type: 'hl', op: st.can.cashout ? 'cashout' : (st.can.higher ? 'higher' : 'lower') });
    }
  } catch (e) { console.log('  cleanup: ' + (e && e.message)); }
}

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
  closeRounds();
}
context.subscriptions.forEach((s) => { try { s.dispose(); } catch (e) { console.log('dispose: ' + e.message); } });
fs.rmSync(HOME, { recursive: true, force: true });
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
