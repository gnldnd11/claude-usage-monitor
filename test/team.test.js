// Team sharing: the split of the account's weekly % between the PCs that report. node's assert only.
// Run: node test/team.test.js
// No network: the split is pure, and sync is only called where it must stop before sending.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const team = require(path.join(__dirname, '..', 'team.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b) => Math.abs(a - b) < 1e-9;

const summary = (acct, costs) => ({
  window: '1', account_pct: acct,
  pcs: costs.map((c, i) => ({ pc_id: 'pc' + i, name: 'P' + i, cost: c, tokens: c * 1e6, updated_at: 0, stale: false }))
});

test('reference rate fits under the total: the rest is unrecorded use', () => {
  // 0.05 %/$ : 140$ -> 7%, 35$ -> 1.75%, account 20% -> 11.25% nobody recorded
  const s = team.split(summary(20, [140, 35]), 'pc1', 0.05, null);
  assert.ok(near(s.rows[0].pct, 7));
  assert.ok(near(s.rows[1].pct, 1.75));
  assert.equal(s.rows[1].me, true);
  assert.ok(near(s.unrecorded, 11.25));
  assert.equal(s.capped, false);
});

test('a rate that would overshoot the account is capped: rows add up to the total', () => {
  // account 5% but the team spent 175$: 0.05 %/$ would make 8.75%. Cap at 5/175
  const s = team.split(summary(5, [140, 35]), 'pc0', 0.05, null);
  assert.ok(near(s.rows[0].pct + s.rows[1].pct, 5));
  assert.ok(near(s.rows[0].pct / s.rows[1].pct, 4)); // who used how much more is untouched by the cap
  assert.ok(near(s.unrecorded, 0));
  assert.equal(s.capped, true);
});

test('share of the team is exact whatever the rate', () => {
  const s = team.split(summary(99, [1900, 35, 65]), 'pc1', 0.05, 99);
  assert.ok(near(s.rows.reduce((a, x) => a + x.ofTeam, 0), 1));
  assert.ok(near(s.rows.filter((x) => x.me)[0].ofTeam, 35 / 2000));
});

test('no rate and no account %: zero shares, nothing invented', () => {
  const s = team.split(summary(null, [10]), 'pc0', null, null);
  assert.equal(s.rows[0].pct, 0);
  assert.equal(s.unrecorded, null);
});

test('codes and names', () => {
  assert.equal(team.validCode('short'), false);
  assert.equal(team.validCode('  long-enough  '), true);
  assert.equal(team.displayName('  이성빈\u0007 '), '이성빈');
  assert.ok(team.displayName('').length > 0);
});

test('the account id comes from .claude.json; only a hash of it is sent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-acct-'));
  const saved = process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CLAUDE_CONFIG_DIR;
  try {
    assert.equal(team.readAccountId(dir), null);                       // no file: not signed in
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'u-1234', emailAddress: 'a@example.com' } }));
    assert.equal(team.readAccountId(dir), 'u-1234');
    const k = team.accountKey('u-1234');
    assert.match(k, /^acct-[0-9a-f]{40}$/);
    assert.ok(!k.includes('u-1234'));
    assert.equal(k, team.accountKey('u-1234'));                         // same account, same group
    assert.notEqual(k, team.accountKey('u-5678'));
    assert.equal(team.accountKey(null), null);
    const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-acct-'));  // CLAUDE_CONFIG_DIR wins
    fs.writeFileSync(path.join(alt, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'u-alt' } }));
    process.env.CLAUDE_CONFIG_DIR = alt;
    assert.equal(team.readAccountId(dir), 'u-alt');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
  }
});

test('sync sends nothing without consent or an account', async () => {
  assert.deepEqual(await team.sync({ on: false, key: 'acct-x', pcId: 'p' }, {}, { resets_at: 1 }), { ok: false, error: 'off' });
  assert.deepEqual(await team.sync({ on: true, key: null, pcId: 'p' }, {}, { resets_at: 1 }), { ok: false, error: 'account' });
});

let failed = 0;
(async () => {
  for (const t of tests) {
    try { await t.fn(); console.log('PASS ' + t.name); }
    catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
  }
  console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
  process.exit(failed ? 1 : 0);
})();
