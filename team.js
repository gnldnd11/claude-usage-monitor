// Team sharing: PCs on one Claude account put their weekly use side by side.
//
// Off until the person agrees (claudeUsage.team.share). The PCs are grouped by the Claude account they
// are signed in to, so nobody types a code: Claude Code keeps the account's id in .claude.json, and
// only a hash of it leaves this PC (the server hashes it again before storing). The id is a random
// UUID, so only PCs signed in to that account can name the group or read it.
//
// The usage endpoint only knows the account total, and each PC only knows itself; pooled, the rows
// add up to that total. What is sent is the weekly window, the account's weekly %, this PC's use in
// that window (tokens and API-equivalent $, per model), the plan type (Max 20x, Max 5x or Pro) and a
// display name. Nothing from a prompt, a file, a project or a session title. The server keeps one
// snapshot per PC per hour as well, so the percent-per-$ rate can be checked over a week.
//
// The server stores and returns rows; the split is computed here, from the account's weekly % and
// what each PC spent, so every PC on the account arrives at the same figures.
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');

// CUC_TEAM_SERVER points a test run at a local server; nobody sets it in normal use
const SERVER = new URL(process.env.CUC_TEAM_SERVER || 'https://saegimai.up.railway.app/api/v1/usage-share');
const TIMEOUT_MS = 8000;
const PLANS = ['max_20x', 'max_5x', 'pro'];

function request(method, pathname, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = (SERVER.protocol === 'http:' ? http : https).request({
      hostname: SERVER.hostname, port: SERVER.port || undefined, path: SERVER.pathname.replace(/\/$/, '') + pathname, method,
      headers: Object.assign({ 'Accept': 'application/json' }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, (res) => {
      let text = '';
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
        resolve({ status: res.statusCode, data: json });
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ status: 0, data: null }); });
    if (data) req.write(data);
    req.end();
  });
}

function displayName(name) {
  const n = String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
  return n || os.hostname().slice(0, 24) || 'PC';
}

// 1.21.0 grouped by a typed team code; a PC with one set has already agreed to share
function validCode(code) { return typeof code === 'string' && code.trim().length >= 8 && code.trim().length <= 64; }

// The signed-in account as Claude Code keeps it in .claude.json. WHERE that file is belongs to
// claudedir.js, because CLAUDE_CONFIG_DIR moves it and a setting can move it again, so the path is
// handed in and nothing here reads the environment. Working it out here as well is how one PC came
// to read the account out of the moved directory and the usage out of the default one, which posted
// a personal account's tokens into a work account's group (issue #2)
function readOauthAccount(file) {
  if (!file) return null;
  try {
    const a = JSON.parse(fs.readFileSync(file, 'utf8')).oauthAccount;
    if (a && typeof a.accountUuid === 'string' && a.accountUuid) return a;
  } catch (e) { /* missing or unreadable: nobody is signed in there */ }
  return null;
}
function readAccountId(file) { const a = readOauthAccount(file); return a ? a.accountUuid : null; }
// The rate-limit tier name (such as default_claude_max_20x). Readable on every OS, unlike the
// credentials file, which macOS keeps in the keychain
function readAccountTier(file) {
  const a = readOauthAccount(file);
  const t = a && (a.userRateLimitTier || a.organizationRateLimitTier);
  return typeof t === 'string' && t ? t : null;
}

// What the server sees instead of the id
function accountKey(id) {
  return id ? 'acct-' + crypto.createHash('sha256').update('cuc-account:' + id).digest('hex').slice(0, 40) : null;
}
// The shape accountKey makes, asserted where it is made. extension.js stores one consent per
// account under these keys, so it has to be able to tell a real one from whatever a hand-edited
// store holds (a "__proto__" among them)
const ACCOUNT_KEY_RE = /^acct-[0-9a-f]{40}$/;
function validAccountKey(k) { return typeof k === 'string' && ACCOUNT_KEY_RE.test(k); }

// Send this PC's week, then read the account's. cfg: { on, key, name, pcId }. Returns { ok, summary?, error? }
async function sync(cfg, totals, sevenDay, version) {
  if (!cfg.on) return { ok: false, error: 'off' };
  if (!cfg.key) return { ok: false, error: 'account' };
  if (!sevenDay || !sevenDay.resets_at) return { ok: false, error: 'window' };
  const team = cfg.key;
  const byModel = {};
  for (const k of Object.keys(totals.byModel || {}).slice(0, 12)) {
    const v = totals.byModel[k];
    byModel[k.slice(0, 32)] = { tokens: Math.round(v.tokens), cost: Math.round(v.cost * 100) / 100 };
  }
  const post = await request('POST', '/report', {
    team, pc_id: cfg.pcId, name: displayName(cfg.name), window_reset: sevenDay.resets_at,
    account_pct: sevenDay.used_percentage == null ? null : Math.max(0, Math.min(100, sevenDay.used_percentage)),
    cost: Math.round(totals.cost * 100) / 100, tokens: Math.round(totals.tokens), by_model: byModel, version: String(version || '').slice(0, 16),
    plan: PLANS.indexOf(cfg.plan) >= 0 ? cfg.plan : null
  });
  if (post.status !== 200) return { ok: false, error: post.status ? 'http ' + post.status : 'offline' };
  const get = await request('GET', '/summary?team=' + encodeURIComponent(team) + '&window_reset=' + sevenDay.resets_at);
  if (get.status !== 200 || !get.data) return { ok: false, error: get.status ? 'http ' + get.status : 'offline' };
  return { ok: true, summary: get.data };
}

// The split. With the account's weekly % in hand, the one answer that contradicts nothing is to
// divide it by what each PC spent: share = account% x this PC's $ / the team's $. byAccount says
// that is what happened, and the figures then do not depend on which PC is looking.
//
// They used to. The rows were this PC's percent-per-$ (rate, from weekly.js) times each PC's $,
// capped so the sum could not pass account%, and whatever the sum left of account% was handed to
// the screen as a separate row. A PC whose measured rate landed under the cap drew small rows and
// a large remainder; a PC whose rate hit the cap drew the full account total. The same PC's week
// therefore read 27% on one screen and 19% on another, and the 13% difference was drawn as PCs
// that were not there (reported 1.30.0).
//
// There is no fixing that by measuring better: percent-per-$ is not a constant. Pooled over one
// account's hourly snapshots for a week, the interval rates ran 0.027 to 0.083 %/$, threefold,
// because the weekly limit does not come off in proportion to an API-price equivalent. So the
// remainder a rate leaves is not evidence of anything and is no longer computed. Use nobody here
// recorded (claude.ai on the web, the apps, a PC without sharing) is inside these rows, because
// they divide the whole account total; the screen says so instead of drawing a row for it.
//
// rate still matters where the account % cannot be read (no reading has arrived yet): then a row's
// $ is all there is to turn into a percent, and that path is unchanged.
function split(summary, myPcId, rate, accountPct) {
  const pcs = (summary && summary.pcs) || [];
  const acct = accountPct != null ? accountPct : (summary ? summary.account_pct : null);
  const total = pcs.reduce((a, p) => a + (p.cost || 0), 0);
  const byAccount = acct != null && total > 0;
  const r = rate || 0;
  const rows = pcs.map((p) => {
    const ofTeam = total > 0 ? (p.cost || 0) / total : 0;
    return {
      name: p.name, me: p.pc_id === myPcId, stale: !!p.stale, cost: p.cost || 0, tokens: p.tokens || 0,
      pct: byAccount ? acct * ofTeam : (p.cost || 0) * r, ofTeam
    };
  }).sort((a, b) => b.cost - a.cost);
  return { rows, accountPct: acct, byAccount };
}

module.exports = { sync, split, validCode, displayName, readAccountId, readAccountTier, accountKey, validAccountKey, SERVER };
