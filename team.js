// Team sharing: PCs on one Claude account put their weekly use side by side.
//
// Off until the person agrees (claudeUsage.team.share). The PCs are grouped by the Claude account they
// are signed in to, so nobody types a code: Claude Code keeps the account's id in .claude.json, and
// only a hash of it leaves this PC (the server hashes it again before storing). The id is a random
// UUID, so only PCs signed in to that account can name the group or read it.
//
// The usage endpoint only knows the account total, and each PC only knows itself; pooled, the rows
// add up to that total. What is sent is the weekly window, the account's weekly %, this PC's use in
// that window (tokens and API-equivalent $, per model) and a display name. Nothing from a prompt, a
// file, a project or a session title.
//
// The server stores and returns rows; the split is computed here, because the rate (percent per $)
// is this PC's own knowledge (measured, or the plan's reference).
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

// CUC_TEAM_SERVER points a test run at a local server; nobody sets it in normal use
const SERVER = new URL(process.env.CUC_TEAM_SERVER || 'https://saegimai.up.railway.app/api/v1/usage-share');
const TIMEOUT_MS = 8000;

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

// The signed-in Claude account's id, from where Claude Code keeps it (CLAUDE_CONFIG_DIR moves it)
function readAccountId(home) {
  const files = [];
  if (process.env.CLAUDE_CONFIG_DIR) files.push(path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json'));
  files.push(path.join(home || os.homedir(), '.claude.json'));
  for (const f of files) {
    try {
      const a = JSON.parse(fs.readFileSync(f, 'utf8')).oauthAccount;
      if (a && typeof a.accountUuid === 'string' && a.accountUuid) return a.accountUuid;
    } catch (e) { /* missing or unreadable: try the next */ }
  }
  return null;
}

// What the server sees instead of the id
function accountKey(id) {
  return id ? 'acct-' + crypto.createHash('sha256').update('cuc-account:' + id).digest('hex').slice(0, 40) : null;
}

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
    cost: Math.round(totals.cost * 100) / 100, tokens: Math.round(totals.tokens), by_model: byModel, version: String(version || '').slice(0, 16)
  });
  if (post.status !== 200) return { ok: false, error: post.status ? 'http ' + post.status : 'offline' };
  const get = await request('GET', '/summary?team=' + encodeURIComponent(team) + '&window_reset=' + sevenDay.resets_at);
  if (get.status !== 200 || !get.data) return { ok: false, error: get.status ? 'http ' + get.status : 'offline' };
  return { ok: true, summary: get.data };
}

// The split. rate is this PC's percent per $ (measured or the plan reference). Capped at
// account% / team $ so the rows never add up to more than the account; what the rows leave of the
// account total is use nobody on the team recorded (claude.ai on the web, the apps, PCs without
// sharing on)
function split(summary, myPcId, rate, accountPct) {
  const pcs = (summary && summary.pcs) || [];
  const acct = accountPct != null ? accountPct : (summary ? summary.account_pct : null);
  const total = pcs.reduce((a, p) => a + (p.cost || 0), 0);
  let r = rate || 0;
  if (acct != null && total > 0) r = Math.min(r || Infinity, acct / total);
  const rows = pcs.map((p) => ({
    name: p.name, me: p.pc_id === myPcId, stale: !!p.stale, cost: p.cost || 0, tokens: p.tokens || 0,
    pct: (p.cost || 0) * r, ofTeam: total > 0 ? (p.cost || 0) / total : 0
  })).sort((a, b) => b.cost - a.cost);
  const recorded = rows.reduce((a, x) => a + x.pct, 0);
  return {
    rows, accountPct: acct, recorded,
    unrecorded: acct != null ? Math.max(0, acct - recorded) : null,
    capped: !!(acct != null && total > 0 && rate && acct / total < rate)
  };
}

module.exports = { sync, split, validCode, displayName, readAccountId, accountKey, SERVER };
