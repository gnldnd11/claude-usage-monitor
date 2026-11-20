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
const round1 = (x) => Math.round(x * 10) / 10;

const summary = (acct, costs) => ({
  window: '1', account_pct: acct,
  pcs: costs.map((c, i) => ({ pc_id: 'pc' + i, name: 'P' + i, cost: c, tokens: c * 1e6, updated_at: 0, stale: false }))
});

// The 1.30.0 report: the same account, the same window and the same two PCs read 27% / 14% on one
// of them and 19% / 9.6% on the other, because the split was computed from the percent-per-$ the PC
// doing the looking had measured. Whatever any PC measures, the rows have to come out the same
test('the rows do not depend on which PC computed them', () => {
  const s = summary(41, [586.21, 300.56]);
  const base = team.split(s, 'pc0', 0.03195, 41).rows.map((p) => p.pct);   // one PC's measurement
  const others = [
    team.split(s, 'pc0', 0.04624, 41),   // the other's, which happened to equal account% / team $
    team.split(s, 'pc0', 0.0364, 41),    // the Max 20x reference rate
    team.split(s, 'pc0', 999, 41),       // absurd
    team.split(s, 'pc0', null, 41)       // nothing measured yet
  ];
  for (const o of others) assert.deepEqual(o.rows.map((p) => p.pct), base);
  // and looking from the other PC only moves which row is marked `me`
  assert.deepEqual(team.split(s, 'pc1', 0.03195, 41).rows.map((p) => p.pct), base);
});

test('the account total is divided by what each PC spent', () => {
  // The reported week: $586.21 + $300.56 of the account's 41%
  const s = team.split(summary(41, [586.21, 300.56]), 'pc1', 0.03195, 41);
  assert.equal(round1(s.rows[0].pct), 27.1);
  assert.equal(round1(s.rows[1].pct), 13.9);
  assert.equal(s.rows[1].me, true);
  assert.ok(near(s.rows[0].pct + s.rows[1].pct, 41));  // the whole account total, nothing left over
  assert.equal(s.byAccount, true);
  // nothing for a screen to draw as a PC that is not on the account
  assert.ok(!('unrecorded' in s));
});

test('without a reading of the account %, the rows are this PC rate on each PC spend', () => {
  // 0.05 %/$ : 140$ -> 7%, 35$ -> 1.75%. Uncapped, because there is no account total to cap at
  const s = team.split(summary(null, [140, 35]), 'pc1', 0.05, null);
  assert.ok(near(s.rows[0].pct, 7));
  assert.ok(near(s.rows[1].pct, 1.75));
  assert.equal(s.rows[1].me, true);
  assert.equal(s.accountPct, null);
  assert.equal(s.byAccount, false);
});

test('the account % on the summary stands in when this PC has not read one', () => {
  const s = team.split(summary(41, [586.21, 300.56]), 'pc0', 0.05, null);
  assert.equal(s.accountPct, 41);
  assert.equal(round1(s.rows[0].pct), 27.1);
});

test('share of the team is exact whatever the rate', () => {
  const s = team.split(summary(99, [1900, 35, 65]), 'pc1', 0.05, 99);
  assert.ok(near(s.rows.reduce((a, x) => a + x.ofTeam, 0), 1));
  assert.ok(near(s.rows.filter((x) => x.me)[0].ofTeam, 35 / 2000));
});

test('no rate and no account %: zero shares, nothing invented', () => {
  const s = team.split(summary(null, [10]), 'pc0', null, null);
  assert.equal(s.rows[0].pct, 0);
  assert.equal(s.accountPct, null);
  assert.equal(s.byAccount, false);
});

test('codes and names', () => {
  assert.equal(team.validCode('short'), false);
  assert.equal(team.validCode('  long-enough  '), true);
  assert.equal(team.displayName('  이성빈\u0007 '), '이성빈');
  assert.ok(team.displayName('').length > 0);
});

test('the account id comes from the .claude.json it is handed; only a hash of it is sent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-acct-'));
  const file = path.join(dir, '.claude.json');
  assert.equal(team.readAccountId(file), null);                       // no file: not signed in
  assert.equal(team.readAccountId(null), null);                       // nowhere to read: the same answer
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: { accountUuid: 'u-1234', emailAddress: 'a@example.com' } }));
  assert.equal(team.readAccountId(file), 'u-1234');
  const k = team.accountKey('u-1234');
  assert.match(k, /^acct-[0-9a-f]{40}$/);
  assert.ok(!k.includes('u-1234'));
  assert.equal(k, team.accountKey('u-1234'));                         // same account, same group
  assert.notEqual(k, team.accountKey('u-5678'));
  assert.equal(team.accountKey(null), null);
});

// The regression that made issue #2 worse than a wrong folder. This file used to read
// CLAUDE_CONFIG_DIR itself while extension.js read ~/.claude, so the group was named from one
// account and filled with the other account's tokens. Resolving a path is claudedir.js's job now,
// and this asserts that nothing here reaches for the environment again
test('the environment is not consulted here: the path handed in is the only answer', () => {
  const mine = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-acct-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-acct-'));
  fs.writeFileSync(path.join(mine, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'u-mine' } }));
  fs.writeFileSync(path.join(other, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: 'u-other' } }));
  const saved = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = other;
  try {
    assert.equal(team.readAccountId(path.join(mine, '.claude.json')), 'u-mine');
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
  }
});

test('the plan tier comes from .claude.json too (macOS keeps credentials in the keychain)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-tier-'));
  const file = path.join(dir, '.claude.json');
  assert.equal(team.readAccountTier(file), null);
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: { accountUuid: 'u-1', userRateLimitTier: null, organizationRateLimitTier: 'default_claude_max_20x' } }));
  assert.equal(team.readAccountTier(file), 'default_claude_max_20x');
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: { accountUuid: 'u-1', userRateLimitTier: 'default_claude_max_5x', organizationRateLimitTier: 'default_claude_max_20x' } }));
  assert.equal(team.readAccountTier(file), 'default_claude_max_5x');   // the person's own tier first
});

// Reported 2026-11-20. One PC sharing, other people on the account not running this at all: the
// row named after that PC read the whole account's week. 1.4B tokens and $474 of API-equivalent
// use drawn as 75% of an Ultra week, where the same work on an account whose PCs all share
// measured 15%. ofTeam is $mine / $the table's, which is 1 when the table holds one PC, so the
// division did nothing and handed over everything, other people's use included
test('a lone sharing PC does not take the whole account when others were seen spending', () => {
  const s = summary(75, [474]);
  // nothing proven: unchanged, which is the account with nobody outside it
  assert.equal(team.split(s, 'pc0', 0.05, 75, 0).rows[0].pct, 75);
  assert.equal(team.split(s, 'pc0', 0.05, 75, 0).others, 0);
  // 60 points moved while this PC spent nothing, so no row may claim them
  const seen = team.split(s, 'pc0', 0.05, 75, 60);
  assert.equal(seen.rows[0].pct, 15);
  assert.equal(seen.others, 60);
  assert.equal(round1(seen.rows[0].pct + seen.others), 75);   // still adds to the account
});

test('what others were seen spending is taken off the top, not out of one row', () => {
  const s = summary(40, [300, 100]);   // 75 / 25 of the table's spend
  const r = team.split(s, 'pc0', 0.05, 40, 12);
  assert.ok(near(r.rows[0].pct, 21) && near(r.rows[1].pct, 7));   // (40 - 12) split 75/25
  assert.ok(near(r.rows[0].pct + r.rows[1].pct + r.others, 40));
});

test('the others floor cannot exceed the week or go below zero', () => {
  const s = summary(30, [100]);
  assert.equal(team.split(s, 'pc0', 0.05, 30, 999).rows[0].pct, 0);
  assert.equal(team.split(s, 'pc0', 0.05, 30, 999).others, 30);
  assert.equal(team.split(s, 'pc0', 0.05, 30, -5).others, 0);
  assert.equal(team.split(s, 'pc0', 0.05, 30).others, 0);       // not passed at all
});

// 1.30.0 again, with the new argument in play: a floor is measured per PC, so if it could move the
// rows differently on two screens the old bug is back. It cannot, because it is subtracted before
// the division and the division is what the rows are
test('two PCs that measured different floors still draw the same rows from the same floor', () => {
  const s = summary(50, [200, 300]);
  assert.deepEqual(team.split(s, 'pc0', 0.03, 50, 10).rows.map((p) => p.pct),
    team.split(s, 'pc1', 0.09, 50, 10).rows.map((p) => p.pct));
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
