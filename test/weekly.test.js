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
  assert.equal(r.plan.share, null);
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
