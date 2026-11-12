// This PC's week: transcript aggregation and the share-of-plan estimate. node's assert only.
// Run: node test/weekly.test.js
// Fixtures are synthetic transcripts in a temp directory; nothing under ~/.claude is read.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const weekly = require(path.join(ROOT, 'weekly.js'));
const W = weekly._internal;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-weekly-'));
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function line(id, req, t, model, v) {
  return JSON.stringify({
    type: 'assistant', requestId: req, timestamp: new Date(t).toISOString(), cwd: '/work/alpha',
    message: { id, model, usage: { input_tokens: v[0], output_tokens: v[1], cache_creation_input_tokens: v[2], cache_read_input_tokens: v[3] } }
  });
}

test('weights follow the model price, cache reads count for little', () => {
  const v = { input: 1e6, output: 0, cache_creation: 0, cache_read: 0 };
  assert.equal(W.costOf('claude-opus-5-5', v), 4);
  assert.equal(W.costOf('claude-sonnet-5-5', v), 2);
  assert.equal(W.costOf('claude-opus-5-5', { input: 0, output: 0, cache_creation: 0, cache_read: 1e6 }), 0.2);
  assert.equal(W.modelLabel('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(W.modelLabel('claude-sonnet-4-20250514'), 'Sonnet 4');
});

test('share is unknown until the account % has moved enough', () => {
  const r = Math.floor(Date.now() / 1000) + 86400;
  assert.equal(W.estimateRate([]).rate, null);
  assert.equal(W.estimateRate([{ t: 0, pct: 10, r, cost: 0 }, { t: HOUR, pct: 11, r, cost: 50 }]).rate, null);
});

test('the low ratio wins: intervals where others were busy only push the ratio up', () => {
  const r = 2e9;
  // true rate 0.1 %/$ : this PC alone spends 30$ -> +3%. Then others add 6% while this PC spends 30$
  const s = [
    { t: 0, pct: 10, r, cost: 0 },
    { t: HOUR, pct: 13, r, cost: 30 },        // alone: 3/30 = 0.1
    { t: 2 * HOUR, pct: 22, r, cost: 60 },    // shared: 9/30 = 0.3
    { t: 3 * HOUR, pct: 25, r, cost: 90 },    // alone: 0.1
    { t: 4 * HOUR, pct: 28, r, cost: 120 }    // alone: 0.1
  ];
  const e = W.estimateRate(s);
  assert.equal(e.n, 4);
  assert.equal(e.rough, false);
  assert.ok(Math.abs(e.rate - 0.1) < 1e-9);
});

test('readings from different weekly windows are never paired', () => {
  const e = W.estimateRate([{ t: 0, pct: 90, r: 1e9, cost: 500 }, { t: HOUR, pct: 3, r: 1e9 + 7 * 86400, cost: 10 },
    { t: 2 * HOUR, pct: 7, r: 1e9 + 7 * 86400, cost: 50 }]);
  assert.equal(e.n, 1);
  assert.ok(Math.abs(e.rate - 0.1) < 1e-9);
  assert.equal(e.rough, true);
});

test('report: duplicate content-block lines count once, subagents are labelled by type', async () => {
  const proj = path.join(TMP, '-work-alpha');
  const sess = path.join(proj, 'sess1');
  fs.mkdirSync(path.join(sess, 'subagents'), { recursive: true });
  const now = Date.now();
  const t = now - 2 * HOUR;
  fs.writeFileSync(path.join(proj, 'sess1.jsonl'), [
    JSON.stringify({ type: 'user', timestamp: new Date(t).toISOString(), cwd: '/work/alpha', message: { role: 'user', content: 'build the weekly page' } }),
    line('m1', 'r1', t, 'claude-opus-5-5', [100, 10, 0, 0]),
    line('m1', 'r1', t, 'claude-opus-5-5', [100, 50, 0, 0]), // same response, output grew
    ''
  ].join('\n'));
  fs.writeFileSync(path.join(sess, 'subagents', 'agent-x.jsonl'), line('m2', 'r2', t, 'claude-sonnet-5-5', [200, 20, 0, 1000]) + '\n');
  fs.writeFileSync(path.join(sess, 'subagents', 'agent-x.meta.json'), JSON.stringify({ agentType: 'implementer' }));
  weekly.setProjectsDir(TMP);
  const r = await weekly.report({ used_percentage: 20, resets_at: Math.floor(now / 1000) + 86400 }, now);
  assert.equal(r.total.req, 2);
  assert.equal(r.total.input + r.total.output + r.total.cache_creation + r.total.cache_read, 150 + 1220);
  assert.deepEqual(r.kinds.map((k) => k.name).sort(), ['Main sessions', 'implementer']);
  assert.equal(r.projects[0].name, 'alpha');
  assert.equal(r.sessions[0].name, 'build the weekly page');
  assert.equal(r.days.length, 7);
  assert.equal(r.days.reduce((a, d) => a + d.tokens, 0), 1370);
  // no measured rate yet: the reference for the plan applies, capped at the account total
  assert.equal(r.plan.basis, 'reference');
  assert.ok(Math.abs(r.plan.share - r.plan.windowCost * W.REFERENCE_RATE.max_20x) < 1e-12);
});

test('report covers the weekly window since the reset, not the last seven days', async () => {
  const proj = path.join(TMP, '-work-window');
  fs.mkdirSync(proj, { recursive: true });
  const now = Date.now();
  // the account reset two days ago: a request three days ago belongs to last week
  fs.writeFileSync(path.join(proj, 'w1.jsonl'), [
    JSON.stringify({ type: 'user', timestamp: new Date(now - 3 * DAY).toISOString(), cwd: '/work/window', message: { role: 'user', content: 'window check' } }),
    line('w-old', 'r-old', now - 3 * DAY, 'claude-opus-5-5', [7000, 777, 0, 0]),
    line('w-new', 'r-new', now - HOUR, 'claude-opus-5-5', [40, 4, 0, 0]),
    ''
  ].join('\n'));
  weekly.setProjectsDir(TMP);
  const r = await weekly.report({ used_percentage: 5, resets_at: Math.floor((now + 5 * DAY) / 1000) }, now);
  assert.equal(r.sinceReset, true);
  assert.equal(r.days.length, 3);                                 // reset day, yesterday, today
  const w = r.projects.find((p) => p.name === 'window');
  assert.equal(w.tokens, 44);                                     // last week's request left out
  assert.equal(r.days.reduce((a, d) => a + d.tokens, 0), r.total.input + r.total.output + r.total.cache_creation + r.total.cache_read);
  // no reset known: the last seven days
  const r7 = await weekly.report(null, now);
  assert.equal(r7.sinceReset, false);
  assert.equal(r7.days.length, 7);
  assert.equal(r7.projects.find((p) => p.name === 'window').tokens, 7777 + 44);
});

test('reference rate: one account, both PCs over one window, comes out as its plan percent', () => {
  // 2026-11-12: $212.17 + $117.32 over one weekly window on a Max 20x account at 12%
  assert.equal(W.tierKey('default_claude_max_20x'), 'max_20x');
  assert.equal(W.tierKey('default_claude_max_5x'), 'max_5x');
  assert.equal(W.tierKey(null), '');
  assert.ok(Math.abs((212.17 + 117.32) * W.REFERENCE_RATE.max_20x - 12) < 0.05);
  assert.ok(Math.abs(W.REFERENCE_RATE.max_5x / W.REFERENCE_RATE.max_20x - 4) < 1e-9);
});

test('project is named from the cwd, Windows paths included; injected text is no title', async () => {
  const proj = path.join(TMP, 'c--dev-hai');
  fs.mkdirSync(proj, { recursive: true });
  const now = Date.now(), t = now - HOUR;
  fs.writeFileSync(path.join(proj, 'sess2.jsonl'), [
    JSON.stringify({ type: 'user', timestamp: new Date(t).toISOString(), cwd: 'c:\\dev\\hai', message: { role: 'user', content: [{ type: 'text', text: 'Base directory for this skill: c:\\dev\\hai\\.claude\\skills\\onboard' }] } }),
    JSON.stringify({ type: 'user', timestamp: new Date(t).toISOString(), cwd: 'c:\\dev\\hai', message: { role: 'user', content: 'git checkout 개념' } }),
    JSON.stringify({ type: 'assistant', requestId: 'r9', timestamp: new Date(t).toISOString(), cwd: 'c:\\dev\\hai', message: { id: 'm9', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }),
    ''
  ].join('\n'));
  weekly.setProjectsDir(proj.replace(/c--dev-hai$/, ''));
  const r = await weekly.report(null, now);
  assert.ok(r.projects.some((e) => e.name === 'hai'));
  assert.ok(r.sessions.some((e) => e.name === 'git checkout 개념'));
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('PASS ' + t.name); }
    catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
  process.exit(failed ? 1 : 0);
})();
