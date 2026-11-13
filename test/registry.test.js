// The register and the round driver: games/registry.js and games/tables.js.
//
// Two things are being proved here, and both of them are about what happens when something is
// WRONG, because that is where the structure earns its keep:
//
//  - the register reads a directory instead of a shared array, so a game that cannot be listed has
//    to cost its own row and nothing else. A throw at require time is a sidebar that never draws
//  - the driver answers every message exactly once, an engine that throws included. A message with
//    no reply is a panel sitting out its four-second no-reply timeout, which reads as a hang
//
// The register is tested against a COPY of games/ in a temp directory, because the thing under test
// is what it does with the directory it is given, and the real one has nothing broken in it.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const real = require(path.join(ROOT, 'games', 'registry.js'));
const { createTable, whyNotSpec } = require(path.join(ROOT, 'games', 'tables.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- a sandbox copy of games/ ---------------------------------------------------------------
// Every .js at the repository root (the engines, credits.js, usage.js) plus games/ itself. The
// copied metas require '../../<engine>', so the engines have to be beside the copied directory or
// nothing loads. The .vsix files at the root are hundreds of megabytes and are not copied
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-registry-'));
for (const name of fs.readdirSync(ROOT)) {
  if (name.endsWith('.js')) fs.copyFileSync(path.join(ROOT, name), path.join(TMP, name));
}
fs.cpSync(path.join(ROOT, 'games'), path.join(TMP, 'games'), { recursive: true });

// A meta with no engine behind it: enough shape to be listed, and a handler that answers nothing.
// Used for the ordering and duplicate cases, where what the game DOES is beside the point
function fakeMeta(opts) {
  const extra = Object.keys(opts).filter((k) => ['order'].indexOf(k) >= 0)
    .map((k) => '  ' + k + ': ' + JSON.stringify(opts[k]) + ',\n').join('');
  return "'use strict';\nmodule.exports = {\n"
    + '  id: ' + JSON.stringify(opts.id) + ',\n'
    + '  key: ' + JSON.stringify(opts.key) + ',\n'
    + "  name: 'Fake',\n"
    + '  panel: ' + JSON.stringify('games/' + opts.dir + '/panel.js') + ',\n'
    + extra
    + '  createHandler() { return { key: ' + JSON.stringify(opts.key) + ', handle() {}, held() { return 0; } }; }\n'
    + '};\n';
}

function putGame(dir, metaSource, withPanel) {
  const d = path.join(TMP, 'games', dir);
  fs.mkdirSync(d, { recursive: true });
  if (metaSource != null) fs.writeFileSync(path.join(d, 'meta.js'), metaSource);
  if (withPanel !== false) fs.writeFileSync(path.join(d, 'panel.js'), '// a panel that does nothing\n');
}

// three games that sort around the real ones, and one that sorts by its id because it has no
// order of its own
putGame('zzsecond', fakeMeta({ id: 'zzsecond', key: 'z2', dir: 'zzsecond', order: 15 }));
putGame('aathird', fakeMeta({ id: 'aathird', key: 'a3', dir: 'aathird', order: 15 }));
putGame('noorder', fakeMeta({ id: 'noorder', key: 'no', dir: 'noorder' }));
// and the four shapes of broken
putGame('throws', "'use strict';\nthrow new Error('this meta is broken on purpose');\n");
putGame('noid', "'use strict';\nmodule.exports = { key: 'ni', name: 'No Id', panel: 'games/noid/panel.js', createHandler() { return {}; } };\n");
putGame('nopanel', fakeMeta({ id: 'nopanel', key: 'np', dir: 'nopanel' }), false);
// two games that both answer on 'xx'. The one that sorts first keeps it
putGame('dupfirst', fakeMeta({ id: 'dupfirst', key: 'xx', dir: 'dupfirst', order: 50 }));
putGame('dupsecond', fakeMeta({ id: 'dupsecond', key: 'xx', dir: 'dupsecond', order: 60 }));
// a directory that is not a game at all, and says nothing about itself
fs.mkdirSync(path.join(TMP, 'games', 'leftover-probe'), { recursive: true });
fs.writeFileSync(path.join(TMP, 'games', 'leftover-probe', 'notes.txt'), 'a branch left this here\n');
// a born-done game whose spec names 'done' as its live phase: the trap the driver refuses
putGame('borndone', "'use strict';\nconst engine = { OPS: [], act: (s) => s, whyNot: () => null, view: (s) => s || {} };\n"
  + "module.exports = { id: 'borndone', key: 'bd', name: 'Born Done', panel: 'games/borndone/panel.js', order: 99,\n"
  + "  table: { key: 'bd', id: 'borndone', engine, minBet: 10, livePhase: 'done', noun: 'spin',\n"
  + '    start: (a) => ({ phase: "done", bet: a.bet, net: 0 }), stakeOf: () => 0 } };\n');

// The register logs what it drops as it reads the directory, so the five lines that follow are the
// broken games above being refused. They are the test, not a failure
console.log('  (the next few "games:" lines are the sandbox\'s broken games being dropped on purpose)');
const sandbox = require(path.join(TMP, 'games', 'registry.js'));
const ids = sandbox.GAMES.map((g) => g.id);
const problemFor = (id) => sandbox.PROBLEMS.filter((p) => p.indexOf('games: ' + id + ' ') === 0)[0] || '';

// --- the real register ------------------------------------------------------------------------

// Nothing below writes the list of games out. A test that names them is a shared line every new
// game has to edit, which is the thing games/registry.js was built to get rid of: these check the
// RULES the list obeys, so adding a directory adds no edit here
test('the real register lists every game and has nothing to complain about', () => {
  assert.deepEqual(real.PROBLEMS, [], 'a game dropped out of the real register:\n  ' + real.PROBLEMS.join('\n  '));
  // the five the casino was cut down to on 2026-11-13: a game may be added, none of these may
  // quietly vanish. Nine games were removed that day on purpose, so this list is the decision
  // rather than a historical accident, and a tenth going without anyone meaning it should fail here
  for (const id of ['blackjack', 'hilo', 'slots', 'wheel', 'market']) {
    assert.ok(real.BY_ID[id], id + ' is no longer listed');
  }
  assert.equal(real.GAMES.length, 5, 'the casino is five games: ' + real.GAMES.map((g) => g.id).join(','));
});

// The nine games removed on 2026-11-13 were NOT renumbered out of the sequence: the five left are
// 10, 30, 50, 70 and 140, and the gaps are the rows that are gone. Renumbering them to 10..50 would
// read tidier and buy nothing, and the gaps are worth more than the tidiness: a game put back where
// one was takes the number it had, and the only thing this test is defending is that there is still
// room between any two rows
test('order is spaced by ten, so a game can be put between two of them', () => {
  for (const g of real.GAMES) {
    assert.notEqual(g.order, real.NO_ORDER, g.id + ' declares no order, so its row moves with the file system');
  }
  const orders = real.GAMES.map((g) => g.order);
  for (let i = 1; i < orders.length; i++) {
    assert.ok(orders[i] - orders[i - 1] >= 10,
      'no room left between ' + real.GAMES[i - 1].id + ' (' + orders[i - 1] + ') and '
      + real.GAMES[i].id + ' (' + orders[i] + ')');
  }
});

test('every panel the register names is a file that is published', () => {
  const ignore = fs.readFileSync(path.join(ROOT, '.vscodeignore'), 'utf8').split('\n').map((s) => s.trim());
  assert.ok(ignore.indexOf('games/**') < 0, 'games/** is excluded from the .vsix: the panels would 404');
  for (const g of real.GAMES) {
    assert.ok(fs.existsSync(path.join(ROOT, g.panel)), g.id + ': ' + g.panel + ' is not there');
  }
});

// There used to be a test here that every game declared a `group` and that each group was one
// unbroken run of `order`, because html.js drew a heading wherever the group changed and a group
// that came back printed its heading twice. THE LIST IS FLAT AS OF 1.28.0 (docs/game-panels.md,
// section 7-2): there are no headings, so there is no mistake of that shape left to name and the
// test went with the thing it was testing. What `order` still has to do is below, and the page
// having no headings on it is checked where the page is (test/webview/games/blackjack.js).

test('a list row carries a picture exactly one way: painted art or a drawn tile', () => {
  for (const row of real.view((f) => 'uri:' + f, () => '<svg/>')) {
    assert.equal(typeof row.tile, 'string', row.id + ': tile is not a string');
    assert.equal(typeof row.thumb, 'string', row.id + ': thumb is not a string');
    // both would stack two pictures in one 48px square, neither leaves the glyph alone in it
    assert.ok(!!row.tile !== !!row.thumb, row.id + ' has ' + (row.tile ? 'both a tile and a thumb' : 'neither a tile nor a thumb'));
  }
});

test('the directory is read once per activation, not once per reader', () => {
  // The scan is at the top of games/registry.js, so the module cache is what makes it once: every
  // later require hands back the same array rather than reading the directory again
  const again = require(path.join(ROOT, 'games', 'registry.js'));
  assert.equal(again.GAMES, real.GAMES, 'two readers got two lists, so the directory was read twice');
});

test('reading the directory costs a fraction of a millisecond', () => {
  // The figure is printed rather than asserted: a wall-clock bound in a test is a test that fails
  // on a busy machine. What matters is the shape, which is one readdirSync plus one stat per
  // directory, and that is what this measures
  const dir = path.join(ROOT, 'games');
  const scan = () => {
    let n = 0;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile() && fs.existsSync(path.join(dir, e.name, 'meta.js'))) n += 1;
    }
    return n;
  };
  assert.equal(scan(), real.GAMES.length);
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) scan();
  const each = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  console.log('  games/ scan: ' + each.toFixed(4) + ' ms for ' + real.GAMES.length + ' games (warm)');
  assert.ok(each < 5, 'the scan took ' + each.toFixed(2) + ' ms, which is not a fraction of a millisecond');
});

// --- the sandbox: ordering -------------------------------------------------------------------

test('a tie on order is settled by the id, so the list is the same in every window', () => {
  const i15a = ids.indexOf('aathird'), i15z = ids.indexOf('zzsecond');
  assert.ok(i15a >= 0 && i15z >= 0, 'both games with order 15 should be listed: ' + ids.join(','));
  assert.ok(i15a < i15z, 'the tie went to the directory order instead of the id: ' + ids.join(','));
  assert.ok(ids.indexOf('blackjack') < i15a, '15 should sit after blackjack (10)');
  assert.ok(i15z < ids.indexOf('hilo'), '15 should sit before hilo (30)');
});

test('a game with no order of its own goes last', () => {
  assert.equal(ids[ids.length - 1], 'noorder', ids.join(','));
  assert.equal(sandbox.BY_ID.noorder.order, sandbox.NO_ORDER);
});

// --- the sandbox: one broken game does not take the rest ------------------------------------

test('a meta.js that throws costs its own game and nothing else', () => {
  assert.ok(ids.indexOf('throws') < 0, 'a broken game was listed');
  assert.match(problemFor('throws'), /threw on load: this meta is broken on purpose/);
  assert.ok(ids.indexOf('blackjack') >= 0 && ids.indexOf('market') >= 0, 'the real games went with it');
});

test('a meta missing a field the list needs is refused, by name', () => {
  assert.ok(ids.indexOf('noid') < 0);
  assert.match(problemFor('noid'), /id must be a non-empty string/);
});

test('a panel that is not there is found at load, not on the first click', () => {
  assert.ok(ids.indexOf('nopanel') < 0);
  assert.match(problemFor('nopanel'), /panel games\/nopanel\/panel\.js does not exist/);
});

test('two games claiming one wire key: the first by order keeps it, and the clash is logged', () => {
  // The point is not which of the two wins but that it is decided by the sort and not by the file
  // system, and that the loser drops out whole: a listed game with no handler is a row that opens a
  // screen no message ever answers
  assert.equal(sandbox.BY_KEY.xx.id, 'dupfirst', 'order 50 did not come before order 60');
  assert.ok(ids.indexOf('dupfirst') >= 0, ids.join(','));
  assert.ok(ids.indexOf('dupsecond') < 0, 'the loser was listed with no key of its own');
  assert.match(problemFor('dupsecond'), /the key "xx" is already answered by dupfirst/);
});

test('a directory with no meta.js is not a game and says nothing', () => {
  assert.ok(ids.indexOf('leftover-probe') < 0);
  assert.equal(problemFor('leftover-probe'), '', 'a leftover directory was reported as a broken game');
});

test('a spec naming "done" as its live phase is refused before the game is listed', () => {
  assert.ok(ids.indexOf('borndone') < 0, 'a game that would deal exactly one round was listed');
  assert.match(problemFor('borndone'), /livePhase cannot be "done"/);
});

// --- whyNotSpec -------------------------------------------------------------------------------

const roundEngine = {
  OPS: ['play'],
  act: (st) => Object.assign({}, st, { phase: 'done', net: 0 }),
  whyNot: () => null,
  view: (st) => st || {}
};
const doneEngine = { OPS: [], act: (st) => st, whyNot: () => 'nothing to play', view: (st) => st || {} };

const roundSpec = (over) => Object.assign({
  key: 'tt', id: 'ttest', engine: roundEngine, minBet: 10, livePhase: 'play', noun: 'round',
  start: (a) => ({ phase: 'play', bet: a.bet, net: null, picked: a.picked }),
  stakeOf: (st) => st.bet
}, over || {});

const doneSpec = (over) => Object.assign({
  key: 'dd', id: 'dtest', engine: doneEngine, minBet: 10, noun: 'spin',
  start: (a) => ({ phase: 'done', bet: a.bet, net: 0, picked: a.picked }),
  stakeOf: () => 0
}, over || {});

test('whyNotSpec: a good spec of either shape passes', () => {
  assert.equal(whyNotSpec(roundSpec()), null);
  assert.equal(whyNotSpec(doneSpec()), null);
});

test('whyNotSpec: a live phase and an op list are two halves of one fact', () => {
  assert.match(whyNotSpec(roundSpec({ engine: doneEngine })), /no OPS to leave it with/);
  assert.match(whyNotSpec(doneSpec({ engine: roundEngine })), /names no livePhase/);
});

test('whyNotSpec: the hooks have to be functions when they are given', () => {
  for (const k of ['carryOf', 'opArg', 'startArg', 'badStart']) {
    assert.match(whyNotSpec(roundSpec({ [k]: 7 })), new RegExp('table\\.' + k + ' must be a function'));
    assert.equal(whyNotSpec(roundSpec({ [k]: undefined })), null, k + ' should be optional');
  }
});

test('whyNotSpec: a minBet that is not a whole number of credits is refused', () => {
  for (const bad of [0, -1, 1.5, '10', NaN]) {
    assert.match(whyNotSpec(roundSpec({ minBet: bad })), /minBet must be a whole number/, 'minBet ' + bad);
  }
});

test('createTable throws on a spec the register would have dropped', () => {
  assert.throws(() => createTable(roundSpec({ livePhase: 'done' }), {}), /livePhase cannot be "done"/);
});

// --- the driver -------------------------------------------------------------------------------

// A table on fake deps, with every reply and every log line recorded. `budget` is read through a
// counter so a test can prove the purse was NOT touched before a refusal
function harness(spec, over) {
  const seen = { replies: [], logs: [], budgets: 0, replicas: 0, settled: [] };
  const deps = Object.assign({
    reply(key, engine, state, reqN, error, withSeq) {
      seen.replies.push({ key, state, n: reqN, error: error || null, withSeq });
    },
    afterMove(settled, net, reply, tag) { seen.settled.push({ settled, net, tag }); reply(null, true); },
    budget() { seen.budgets += 1; return 10000; },
    random: () => 'r' + seen.replies.length,
    ensureReplica() { seen.replicas += 1; },
    log(line) { seen.logs.push(line); }
  }, over || {});
  return { t: createTable(spec, deps), seen, last: () => seen.replies[seen.replies.length - 1] };
}

test('the deal hands the engine the selection, and nothing off the wire can reach seed, id or bet', () => {
  const h = harness(roundSpec({ startArg: (m) => ({ picked: m.mines, bet: 1e9, seed: 'theirs', id: 'theirs' }) }));
  h.t.handle({ type: 'tt', op: 'deal', bet: 50, mines: 5 });
  const st = h.last().state;
  assert.equal(h.last().error, null);
  assert.equal(st.picked, 5, 'the selection did not reach start()');
  assert.equal(st.bet, 50, 'the webview overwrote the bet the host had already cleared');
});

test('badStart refuses before the purse is read or a bank key is minted', () => {
  const h = harness(roundSpec({
    startArg: (m) => ({ picked: m.risk }),
    badStart: (a) => (a.picked === 'spicy' ? null : 'pick a risk: spicy')
  }));
  h.t.handle({ type: 'tt', op: 'deal', bet: 50, risk: 'nope' });
  assert.equal(h.last().error, 'pick a risk: spicy');
  assert.equal(h.seen.budgets, 0, 'the balance was read for a message that was never going to deal');
  assert.equal(h.seen.replicas, 0, 'a bank key was minted for a refused deal');
  assert.equal(h.seen.settled.length, 0, 'a refused deal settled something');
  // and the good one goes through
  h.t.handle({ type: 'tt', op: 'deal', bet: 50, risk: 'spicy' });
  assert.equal(h.last().error, null);
  assert.equal(h.last().state.picked, 'spicy');
});

test('an engine that throws on the deal becomes a refusal, and the round is untouched', () => {
  const h = harness(roundSpec({
    startArg: (m) => ({ mines: m.mines }),
    start: (a) => {
      if (a.mines !== 3) throw new RangeError('mines must be one of 3, 5, 10');
      return { phase: 'play', bet: a.bet, net: null, mines: a.mines };
    }
  }));
  h.t.handle({ type: 'tt', op: 'deal', bet: 50, mines: 3 });
  assert.equal(h.last().state.mines, 3);
  const live = h.last().state;
  // a second deal is refused for being live, so the throw is reached from a fresh table instead
  const h2 = harness(roundSpec({
    startArg: (m) => ({ mines: m.mines }),
    start: (a) => { throw new RangeError('mines must be one of 3, 5, 10'); }
  }));
  h2.t.handle({ type: 'tt', op: 'deal', bet: 50, mines: 4 });
  assert.equal(h2.seen.replies.length, 1, 'exactly one reply per message, a throw included');
  assert.equal(h2.last().error, 'mines must be one of 3, 5, 10', 'the engine\'s own sentence is what the player reads');
  assert.equal(h2.last().state, null, 'a round appeared out of a throw');
  assert.equal(h2.seen.settled.length, 0);
  assert.equal(h2.seen.logs.length, 1);
  assert.match(h2.seen.logs[0], /ttest: could not deal: mines must be one of 3, 5, 10/);
  assert.equal(live.mines, 3, 'the live round was changed by another table\'s throw');
});

test('a throw that is not a ruling is logged in full and shown as one plain sentence', () => {
  const h = harness(roundSpec({ start: () => { throw new TypeError("Cannot read properties of null (reading 'bet')"); } }));
  h.t.handle({ type: 'tt', op: 'deal', bet: 50 });
  assert.equal(h.last().error, 'the table could not deal');
  assert.match(h.seen.logs[0], /Cannot read properties of null/);
});

test('a throw out of whyNot or act is a refusal too, and settles nothing', () => {
  for (const broken of ['whyNot', 'act']) {
    const engine = Object.assign({}, roundEngine, { [broken]: () => { throw new Error('boom'); } });
    const h = harness(roundSpec({ engine }));
    h.t.handle({ type: 'tt', op: 'deal', bet: 50 });
    const before = h.last().state;
    h.t.handle({ type: 'tt', op: 'play' });
    assert.equal(h.last().error, 'the table could not ' + (broken === 'whyNot' ? 'judge the move' : 'play the move'), broken);
    assert.equal(h.last().state, before, broken + ': the round moved on a throw');
    assert.equal(h.seen.settled.length, 1, broken + ': the throw settled a round');
  }
});

test('a throw out of opArg is a refusal, not a message with no answer', () => {
  const h = harness(roundSpec({ opArg: () => { throw new Error('bad hold flags'); } }));
  h.t.handle({ type: 'tt', op: 'deal', bet: 50 });
  const n = h.seen.replies.length;
  h.t.handle({ type: 'tt', op: 'play' });
  assert.equal(h.seen.replies.length, n + 1, 'the message went unanswered');
  assert.equal(h.last().error, 'the table could not read the move');
});

test('a game born done deals again and again, and holds nothing back from the others', () => {
  const h = harness(doneSpec({ startArg: (m) => ({ picked: m.risk }) }));
  for (let i = 0; i < 3; i++) {
    h.t.handle({ type: 'dd', op: 'deal', bet: 10, risk: 'mild' });
    assert.equal(h.last().error, null, 'deal ' + i + ': ' + h.last().error);
    assert.equal(h.seen.settled[i].settled, true, 'deal ' + i + ' did not settle on the press');
  }
  assert.equal(h.t.held(), 0, 'a game with no live phase cannot be holding a stake');
  // and its ops, of which it has none, are refused rather than ignored
  h.t.handle({ type: 'dd', op: 'spin' });
  assert.equal(h.last().error, 'unknown action');
});

test('a live round still holds its stake back, and a second deal is refused', () => {
  const h = harness(roundSpec());
  h.t.handle({ type: 'tt', op: 'deal', bet: 70 });
  assert.equal(h.t.held(), 70);
  h.t.handle({ type: 'tt', op: 'deal', bet: 70 });
  assert.equal(h.last().error, 'a round is already in progress');
  h.t.handle({ type: 'tt', op: 'play' });
  assert.equal(h.t.held(), 0, 'a settled round is still holding credits');
});

test('every message gets exactly one reply, whatever it says', () => {
  const h = harness(roundSpec({ startArg: (m) => ({ picked: m.picked }), badStart: () => null }));
  const msgs = [
    { op: 'open' }, { op: 'deal', bet: 1 }, { op: 'deal', bet: 50 }, { op: 'deal', bet: 50 },
    { op: 'nonsense' }, { op: 'play' }, { op: 'play' }, { op: 'open' }
  ];
  for (let i = 0; i < msgs.length; i++) {
    const n = h.seen.replies.length;
    h.t.handle(Object.assign({ type: 'tt', n: i }, msgs[i]));
    assert.equal(h.seen.replies.length, n + 1, 'message ' + i + ' (' + msgs[i].op + ') got ' + (h.seen.replies.length - n) + ' replies');
    assert.equal(h.last().n, i, 'message ' + i + ' was answered with the wrong request number');
  }
});

// --- run --------------------------------------------------------------------------------------

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
