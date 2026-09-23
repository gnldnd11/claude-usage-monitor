// Credit ledger, sweep and de-duplication tests. No dependencies: node's assert only.
// Run: node test/credits.test.js
// Fixtures are synthetic transcripts written to a temp directory; nothing under ~/.claude is read.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const credits = require(path.join(ROOT, 'credits.js'));
const U = require(path.join(ROOT, 'usage.js'));

// --- tiny runner ------------------------------------------------------------------
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// --- fixture ----------------------------------------------------------------------
// Two local days. Dates are built in local time because day keys are local
const D1 = [2026, 8, 20];
const D2 = [2026, 8, 21];
const at = (d, h, m, s) => new Date(d[0], d[1], d[2], h, m || 0, s || 0).toISOString();
const dayStart = (d) => new Date(d[0], d[1], d[2]).getTime();
const KO = '크레딧 적립 확인, 한글 멀티바이트가 조각 경계에 걸리는지 본다. ';

function usageObj(v) {
  return { input_tokens: v[0], output_tokens: v[1], cache_creation_input_tokens: v[2], cache_read_input_tokens: v[3], service_tier: 'standard' };
}
function asst(id, req, t, v, text) {
  return JSON.stringify({ type: 'assistant', timestamp: t, requestId: req,
    message: { id, role: 'assistant', content: [{ type: 'text', text: text || 'ok' }], usage: usageObj(v) } });
}

const FILE_A = [
  // "usage" inside a string is escaped (\"usage\") so the byte search must not pick it up
  JSON.stringify({ type: 'user', timestamp: at(D1, 9, 59), message: { role: 'user', content: 'show me "usage" ' + KO } }),
  // r1: streaming snapshots, only output grows
  asst('msg_r1', 'req_r1', at(D1, 10, 0, 0), [2, 1, 100, 1000]),
  asst('msg_r1', 'req_r1', at(D1, 10, 0, 1), [2, 50, 100, 1000], KO),
  asst('msg_r1', 'req_r1', at(D1, 10, 0, 2), [2, 120, 100, 1000]),
  // r2: rewritten later with all-zero usage (seen in real transcripts); max keeps the real value
  asst('msg_r2', 'req_r2', at(D1, 11, 0, 0), [3, 10, 0, 2000]),
  asst('msg_r2', 'req_r2', at(D1, 11, 0, 1), [3, 40, 0, 2000]),
  asst('msg_r2', 'req_r2', at(D1, 11, 0, 2), [0, 0, 0, 0]),
  // a tool result carrying a nested usage object: not message.usage, must not count
  JSON.stringify({ type: 'user', timestamp: at(D2, 8, 0), toolUseResult: { usage: usageObj([999999, 0, 0, 0]) },
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_x', content: 'done' }] } }),
  // r3: one line far longer than the small chunks, full of multi-byte text
  asst('msg_r3', 'req_r3', at(D2, 9, 0), [5, 300, 400, 5000], KO.repeat(400)),
  // keyless usage lines (no message.id): added as is, twice
  JSON.stringify({ type: 'system', timestamp: at(D2, 9, 30), usage: usageObj([7, 1, 0, 0]) }),
  JSON.stringify({ type: 'system', timestamp: at(D2, 9, 31), usage: usageObj([7, 1, 0, 0]) }),
  // r4 and r5 interleaved
  asst('msg_r4', 'req_r4', at(D2, 10, 0, 0), [1, 5, 0, 100]),
  asst('msg_r5', 'req_r5', at(D2, 10, 0, 1), [1, 7, 0, 200]),
  asst('msg_r4', 'req_r4', at(D2, 10, 0, 2), [1, 9, 0, 100]),
  asst('msg_r5', 'req_r5', at(D2, 10, 0, 3), [1, 11, 0, 200])
].join('\n') + '\n'
  // a last line still being written (no newline, cut mid-JSON): never counted
  + '{"type":"assistant","timestamp":"' + at(D2, 11, 0) + '","message":{"id":"msg_partial","usage":{"input_tokens":1000';

const FILE_B = [
  asst('msg_r6', 'req_r6', at(D2, 12, 0, 0), [4, 20, 30, 40]),
  asst('msg_r6', 'req_r6', at(D2, 12, 0, 1), [4, 25, 30, 40])
].join('\n') + '\n';

const EXPECT = {
  '2026-09-20': { input: 5, output: 160, cache_creation: 100, cache_read: 3000 },
  '2026-09-21': { input: 25, output: 347, cache_creation: 430, cache_read: 5340 }
};
const EXPECT_D2_REQUESTS = 6; // r3, two keyless lines, r4, r5, r6

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-credits-'));
const PROJ = path.join(TMP, 'projects');
const PATH_A = path.join(PROJ, '-repo', 'session-a.jsonl');
const PATH_B = path.join(PROJ, '-repo', 'session-a', 'subagents', 'agent-b.jsonl');
fs.mkdirSync(path.dirname(PATH_B), { recursive: true });
fs.writeFileSync(PATH_A, FILE_A);
fs.writeFileSync(PATH_B, FILE_B);
fs.writeFileSync(path.join(PROJ, '-repo', 'notes.txt'), asst('msg_txt', 'req_txt', at(D2, 9, 0), [1e6, 0, 0, 0]) + '\n');
// fixed mtimes (the day after D2) so the since filter does not depend on today's date
const MTIME = new Date(2026, 8, 22, 12, 0, 0);
for (const p of [PATH_A, PATH_B]) fs.utimesSync(p, MTIME, MTIME);

function sweepSync(root, since, chunk) {
  const sw = credits.createSweep(root, since, chunk);
  while (!sw.step(1e9)) { /* synchronous to the end */ }
  sw.close();
  return sw;
}

// --- ledger merge -------------------------------------------------------------------
test('max merge is idempotent', () => {
  const patch = { days: { '2026-09-20': { input: 1, output: 2, cache_creation: 3, cache_read: 4 } }, backfilled: true, sweptAt: 10 };
  const a = credits.mergeLedger(null, patch);
  const b = credits.mergeLedger(a.ledger, patch);
  assert.equal(a.changed, true);
  assert.equal(b.changed, false);
  assert.deepEqual(b.ledger, a.ledger);
});

test('two windows merge field by field, never adding', () => {
  const w1 = { days: { '2026-09-21': { input: 10, output: 100, cache_creation: 0, cache_read: 5 } } };
  const w2 = { days: { '2026-09-21': { input: 20, output: 80, cache_creation: 0, cache_read: 5 } } };
  const ab = credits.mergeLedger(credits.mergeLedger(null, w1).ledger, w2).ledger;
  const ba = credits.mergeLedger(credits.mergeLedger(null, w2).ledger, w1).ledger;
  assert.deepEqual(ab.days['2026-09-21'], { input: 20, output: 100, cache_creation: 0, cache_read: 5 });
  assert.deepEqual(ab, ba);
});

test('unknown keys (a future spent) survive a merge', () => {
  const stored = { days: {}, backfilled: true, sweptAt: 5, spent: { total: 3 } };
  const r = credits.mergeLedger(stored, { days: { '2026-09-21': { input: 1, output: 0, cache_creation: 0, cache_read: 0 } } });
  assert.deepEqual(r.ledger.spent, { total: 3 });
});

test('malformed stored values are normalized at the boundary', () => {
  const n = credits.normalizeLedger({ days: { '2026-09-01': { input: -5, output: 'x', cache_creation: NaN, cache_read: 7 }, junk: {} }, backfilled: 'yes', sweptAt: 'z' });
  assert.deepEqual(n.days, { '2026-09-01': { input: 0, output: 0, cache_creation: 0, cache_read: 7 } });
  assert.equal(n.backfilled, false);
  assert.equal(n.sweptAt, 0);
  assert.deepEqual(credits.normalizeLedger('garbage').days, {});
});

test('weights: one credit each from 100k input, 20k output, 80k cache write, 1M cache read', () => {
  const one = (t) => credits.creditSummary(credits.normalizeLedger({ days: { '2026-09-21': Object.assign({ input: 0, output: 0, cache_creation: 0, cache_read: 0 }, t) } }), '2026-09-21', false);
  assert.equal(one({ input: 100000 }).balance, 1);
  assert.equal(one({ output: 20000 }).balance, 1);
  assert.equal(one({ cache_creation: 80000 }).balance, 1);
  assert.equal(one({ cache_read: 1000000 }).balance, 1);
  assert.equal(one({ cache_read: 999999 }).balance, 0); // exact: no float drift from the 0.1 weight
  assert.equal(one({ input: 1, output: 1, cache_creation: 1, cache_read: 1 }).frac, 7.35 / 100000);
  assert.equal(credits.CREDIT_UNIT, 100000);
});

test('summary: balance, today, frac (weighted)', () => {
  const L = credits.mergeLedger(null, { days: {
    '2026-09-20': { input: 0, output: 0, cache_creation: 0, cache_read: 1300000 },  // 130,000 weighted
    '2026-09-21': { input: 0, output: 200000, cache_creation: 0, cache_read: 1000000 } } }).ledger; // 1,100,000
  const s = credits.creditSummary(L, '2026-09-21', false);
  assert.equal(s.balance, 12);  // 1,230,000 / 100,000
  assert.equal(s.today, 11);    // 12 - floor(130,000 / 100,000)
  assert.ok(Math.abs(s.frac - 0.3) < 1e-12);
  assert.equal(s.perCredit, 100000);
});

// --- bank: per-replica grow-only counters ---------------------------------------------------
const W = (won, lost, hands) => ({ won, lost, hands });
// replica ids are 16 hex characters, as extension.js makes them
const RA = 'aaaaaaaaaaaaaaaa', RB = 'bbbbbbbbbbbbbbbb', RC = '0123456789abcdef', RD = 'fedcba9876543210';

test('bank: balance adds every replica\'s won minus lost', () => {
  const L = credits.normalizeLedger({
    days: { '2026-09-21': { input: 1000000, output: 0, cache_creation: 0, cache_read: 0 } }, // 10 credits
    bank: { [RA]: W(30, 5, 4), [RB]: W(0, 12, 2) }
  });
  const s = credits.creditSummary(L, '2026-09-21', false);
  assert.equal(s.balance, 10 + 30 - 5 - 12);
  assert.equal(s.today, 10); // earning only
});

test('bank: two windows merge as a G-counter, idempotent', () => {
  const a = { bank: { [RA]: W(10, 0, 1) } };
  const b = { bank: { [RB]: W(0, 20, 2) } };
  const ab = credits.mergeLedger(credits.mergeLedger(null, a).ledger, b).ledger;
  const ba = credits.mergeLedger(credits.mergeLedger(null, b).ledger, a).ledger;
  assert.deepEqual(ab.bank, { [RA]: W(10, 0, 1), [RB]: W(0, 20, 2) });
  assert.deepEqual(ab, ba);
  const again = credits.mergeLedger(ab, a);
  assert.equal(again.changed, false);
  // a later count from the same window replaces the earlier one field by field
  const later = credits.mergeLedger(ab, { bank: { [RA]: W(10, 15, 3) } }).ledger;
  assert.deepEqual(later.bank[RA], W(10, 15, 3));
  // an older copy never pulls a counter back
  assert.equal(credits.mergeLedger(later, { bank: { [RA]: W(10, 0, 1) } }).changed, false);
});

test('bank: malformed entries are dropped or zeroed at the boundary', () => {
  const n = credits.normalizeLedger({ bank: { 'bad id!': W(5, 0, 1), winA: W(5, 0, 1), [RC]: { won: -3, lost: 2.5, hands: 'x' }, [RD]: 7 } });
  assert.deepEqual(n.bank, { [RC]: W(0, 0, 0), [RD]: W(0, 0, 0) });
  assert.deepEqual(credits.normalizeLedger({ bank: 'nope' }).bank, {});
  // a "__proto__" key (JSON.parse makes it an own property) must not reach the bank and poison the balance
  const poisoned = credits.normalizeLedger(JSON.parse('{"bank":{"__proto__":{"won":5,"lost":0,"hands":1}}}'));
  assert.deepEqual(Object.keys(poisoned.bank), []);
  assert.equal(credits.creditSummary(poisoned, 'x', false).balance, 0);
});

// --- de-duplication -------------------------------------------------------------------
function permutations(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => { for (const p of permutations(a.slice(0, i).concat(a.slice(i + 1)))) out.push([x].concat(p)); });
  return out;
}

test('addUsageOnce gives the same sum whatever the line order', () => {
  const lines = [
    ['k1', [2, 1, 100, 1000]], ['k1', [2, 50, 100, 1000]], ['k1', [2, 120, 100, 1000]], ['k1', [0, 0, 0, 0]],
    ['k2', [3, 10, 0, 2000]], ['k2', [3, 40, 0, 2000]]
  ];
  const expect = { input: 5, output: 160, cache_creation: 100, cache_read: 3000 };
  const perms = permutations(lines);
  assert.equal(perms.length, 720);
  for (const p of perms) {
    const sum = U.zeroTokens();
    const seen = new Map();
    let reqs = 0;
    for (const [k, v] of p) if (U.addUsageOnce(sum, seen, k, { input: v[0], output: v[1], cache_creation: v[2], cache_read: v[3] })) reqs++;
    assert.deepEqual(sum, expect);
    assert.equal(reqs, 2);
  }
});

// --- sweep ----------------------------------------------------------------------------
test('sweep matches the hand-computed totals', () => {
  const sw = sweepSync(PROJ, 0);
  assert.deepEqual(sw.days, EXPECT);
  assert.equal(sw.stats.files, 2); // notes.txt is not a transcript
  assert.equal(sw.stats.errors, 0);
});

test('chunk boundaries: tiny chunks, multi-byte splits, lines longer than a chunk', () => {
  const buf = fs.readFileSync(PATH_A);
  const longest = Math.max(...FILE_A.split('\n').map((l) => Buffer.byteLength(l)));
  for (const chunk of [5, 17, 1000, 4096]) {
    assert.ok(longest > chunk, 'fixture has a line longer than ' + chunk);
    // at least one boundary lands inside a multi-byte character (a UTF-8 continuation byte)
    let splits = 0;
    for (let p = chunk; p < buf.length; p += chunk) if ((buf[p] & 0xc0) === 0x80) splits++;
    assert.ok(splits > 0, 'chunk ' + chunk + ' splits a multi-byte character');
    assert.deepEqual(sweepSync(PROJ, 0, chunk).days, EXPECT, 'chunk ' + chunk);
  }
});

test('since: only files and lines from that local midnight on', () => {
  const sw = sweepSync(PROJ, dayStart(D2));
  assert.deepEqual(sw.days, { '2026-09-21': EXPECT['2026-09-21'] });
  const none = sweepSync(PROJ, MTIME.getTime() + 1); // every file is older than this
  assert.equal(none.stats.files, 0);
});

test('sweep steps respect the budget between chunks and can be closed midway', () => {
  const sw = credits.createSweep(PROJ, 0, 5);
  let steps = 0;
  while (!sw.step(0)) steps++; // zero budget: one chunk per step
  assert.ok(steps > 100);
  assert.deepEqual(sw.days, EXPECT);
  const half = credits.createSweep(PROJ, 0, 5);
  half.step(0); half.step(0);
  half.close();
  assert.equal(half.stats.errors, 0);
});

test('live path (parseLinesInto) agrees with the sweep for today, across random appends', () => {
  const origLoad = Module._load;
  Module._load = function (req) { return req === 'vscode' ? {} : origLoad.apply(this, arguments); };
  process.env.CUC_TEST = '1';
  let T;
  try { T = require(path.join(ROOT, 'extension.js'))._test; } finally { Module._load = origLoad; }
  const start = dayStart(D2);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let run = 0; run < 20; run++) {
    const today = U.zeroTokens();
    let count = 0;
    for (const p of [PATH_A, PATH_B]) {
      const bytes = fs.readFileSync(p);
      const acc = T.freshAcc();
      let carry = '';
      // same as readTokens: decode the appended bytes, keep the unfinished last line for later
      for (let pos = 0; pos < bytes.length;) {
        const n = 1 + Math.floor(rnd() * 3000);
        const lines = (carry + bytes.subarray(pos, pos + n).toString('utf8')).split('\n');
        carry = lines.pop() || '';
        T.parseLinesInto(acc, lines, start, start);
        pos += n;
      }
      for (const [k] of U.USAGE_FIELDS) today[k] += acc.today[k];
      count += acc.count;
    }
    assert.deepEqual(today, EXPECT['2026-09-21'], 'run ' + run);
    assert.equal(count, EXPECT_D2_REQUESTS, 'run ' + run);
  }
});

test('catchUpSince: midnight before the last sweep day; future sweptAt clamped to now', () => {
  const swept = new Date(2026, 8, 22, 16, 30).getTime();
  assert.equal(credits.catchUpSince(swept, swept + 1000), new Date(2026, 8, 21).getTime());
  assert.equal(credits.catchUpSince(0), 0);
  const now = new Date(2026, 8, 22, 9, 0).getTime();
  const future = new Date(2026, 11, 1).getTime();
  assert.equal(credits.catchUpSince(future, now), new Date(2026, 8, 21).getTime());
});

// --- store: throttled writes, local ledger ---------------------------------------------------
function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
// One window's view of globalState. Writes reach other views only when delivered, like VS Code's
// cross-window broadcast
function sharedStorage() {
  const views = [];
  const queue = [];
  function view() {
    const v = {
      value: undefined, updates: 0,
      get: () => v.value,
      update: (k, x) => {
        assert.equal(k, credits.LEDGER_KEY);
        v.updates++;
        v.value = clone(x);
        for (const o of views) if (o !== v) queue.push({ to: o, value: clone(x) });
        return Promise.resolve();
      }
    };
    views.push(v);
    return v;
  }
  return { view, deliver() { while (queue.length) { const m = queue.shift(); m.to.value = m.value; } } };
}
const day = (n) => ({ input: 0, output: 0, cache_creation: 0, cache_read: n });

test('throttle: ten records in a minute write once; after 60s once more; a sweep result writes at once', () => {
  const s = sharedStorage().view();
  let clock = 0;
  const store = credits.createLedgerStore(s, { minIntervalMs: 60000, now: () => clock });
  let shown;
  for (let i = 1; i <= 10; i++) { clock = i * 1000; shown = store.record({ days: { '2026-09-21': day(i * 100) } }); }
  assert.equal(s.updates, 1);
  assert.equal(s.value.days['2026-09-21'].cache_read, 100);  // what was written first
  assert.equal(shown.days['2026-09-21'].cache_read, 1000);   // what the panel shows: the latest
  clock = 61000;
  store.record(null);
  assert.equal(s.updates, 2);
  assert.equal(s.value.days['2026-09-21'].cache_read, 1000);
  clock = 62000;
  store.record({ days: { '2026-09-01': day(7) }, backfilled: true, sweptAt: 50 }, true);
  assert.equal(s.updates, 3);
  assert.equal(s.value.backfilled, true);
  clock = 200000;
  store.record({ days: { '2026-09-21': day(1000) } }); // nothing new: no write even when due
  assert.equal(s.updates, 3);
});

test('throttled writes never lose the local ledger when storage is overwritten', () => {
  const s = sharedStorage().view();
  let clock = 0;
  const store = credits.createLedgerStore(s, { minIntervalMs: 60000, now: () => clock });
  store.record({ days: { '2026-09-01': day(500) }, backfilled: true, sweptAt: 9 }, true);
  // another window's stale write replaces storage: today only, not backfilled
  s.value = { days: { '2026-09-21': day(3) }, backfilled: false, sweptAt: 0, spent: { total: 1 } };
  clock = 10000;
  const shown = store.record({ days: { '2026-09-21': day(5) } });
  assert.equal(shown.days['2026-09-01'].cache_read, 500);
  assert.equal(shown.backfilled, true);
  assert.equal(s.value.backfilled, false); // throttled: not written yet
  clock = 70000;
  store.record(null);
  assert.equal(s.value.backfilled, true);
  assert.equal(s.value.days['2026-09-01'].cache_read, 500);
  assert.equal(s.value.days['2026-09-21'].cache_read, 5);
  assert.deepEqual(s.value.spent, { total: 1 }); // storage's unknown key kept
});

test('bank: a window overwritten by a stale copy heals on its next write', () => {
  const shared = sharedStorage();
  const va = shared.view();
  const vb = shared.view();
  let clock = 0;
  const A = credits.createLedgerStore(va, { minIntervalMs: 60000, now: () => clock });
  const B = credits.createLedgerStore(vb, { minIntervalMs: 60000, now: () => clock });
  A.record({ bank: { [RA]: W(0, 10, 1) } }, true);  // A settles a hand
  B.record({ bank: { [RB]: W(25, 0, 1) } }, true);  // B settles before A's write reaches it
  shared.deliver();                                // each view now holds the other's copy only
  assert.equal(va.value.bank[RA], undefined);     // A's result is gone from A's view of storage
  clock = 1000;
  A.record({ bank: { [RA]: W(0, 10, 2) } }, true); // A's next hand: its local ledger still has [RB] too
  shared.deliver();
  for (const v of [va, vb]) {
    assert.deepEqual(v.value.bank[RA], W(0, 10, 2));
    assert.deepEqual(v.value.bank[RB], W(25, 0, 1));
  }
  assert.equal(credits.creditSummary(credits.normalizeLedger(vb.value), 'x', false).balance, 25 - 10);
});

test('two windows: a backfill clobbered by the other window heals on the next writes', () => {
  const shared = sharedStorage();
  const va = shared.view();
  const vb = shared.view();
  let clock = 0;
  const A = credits.createLedgerStore(va, { minIntervalMs: 60000, now: () => clock });
  const B = credits.createLedgerStore(vb, { minIntervalMs: 60000, now: () => clock });
  A.record({ days: { '2026-09-01': day(500) }, backfilled: true, sweptAt: 9 }, true); // A commits its backfill
  B.record({ days: { '2026-09-21': day(4) } });                                     // B writes before A's reaches it
  shared.deliver(); // A's view now holds B's write and B's view holds A's
  clock = 1000;
  assert.equal(A.record({ days: { '2026-09-21': day(4) } }).days['2026-09-01'].cache_read, 500); // A still shows it
  clock = 61000;
  A.record(null); B.record(null);
  shared.deliver();
  clock = 122000;
  A.record(null); B.record(null);
  shared.deliver();
  for (const v of [va, vb]) {
    assert.equal(v.value.backfilled, true);
    assert.equal(v.value.days['2026-09-01'].cache_read, 500);
    assert.equal(v.value.days['2026-09-21'].cache_read, 4);
  }
});

// --- run --------------------------------------------------------------------------------
let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
