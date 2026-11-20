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
    // kinds travels only where the second consent was given (`cfg.stats`). It is the figure the
    // aggregate is built from, and `cost` has already folded the four kinds together with a price
    // list the weekly limit does not follow, so without it a PC is in the table and out of the
    // sample. Where consent is absent the field is simply not sent and the server defaults it
    const kinds = Array.isArray(v.kinds) ? v.kinds.map((n) => Math.round(n)) : null;
    byModel[k.slice(0, 32)] = Object.assign(
      { tokens: Math.round(v.tokens), cost: Math.round(v.cost * 100) / 100 },
      cfg.stats && kinds && kinds.length === 4 ? { kinds } : null
    );
  }
  const post = await request('POST', '/report', {
    team, pc_id: cfg.pcId, name: displayName(cfg.name), window_reset: sevenDay.resets_at,
    // A SECOND, SEPARATE ANSWER (extension.js). The first one puts this PC in its own account's
    // table; this one says these figures may also be counted into aggregate statistics that get
    // published. The first does not imply the second: it names one purpose, and a reader who
    // agreed to it agreed to that purpose. Absent or refused, the row is still stored and still
    // shown to that account's own PCs, and simply is not in the aggregate
    stats: cfg.stats === true,
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
// THE SPLIT, AND THE ONE FACT IT RESTS ON.
//
// Dividing the account's % by what each PC spent is exact, needs no rate, and reads the same on
// every screen. It is also only true when the PCs in the table are everyone who draws on the
// account. Where somebody is not in it, the right divisor is larger than the table's and every
// row comes out too big; with a single PC in the table the fraction is 1, the division does
// nothing at all, and that one person is handed the entire account. Reported 2026-11-20: 1.4B
// tokens and $474 of API-equivalent use drawn as 75% of an Ultra week.
//
// WHETHER THE TABLE IS EVERYONE CANNOT BE MEASURED HERE, so it is asked (claudeUsage.team.all).
// Nothing else in this file is a question to the person, and this one is, because the usage
// endpoint reports a total and a PC can only ever see itself. The person knows the answer in a
// second.
//
// AND WHY IT IS NOT GUESSED AT WITH A RATE. The tempting answer is row = spend x percent-per-$,
// with whatever is left over being other people. That is what 1.30.0 removed, and it cannot be
// brought back by fixing the rate's source, which was the first thing tried here: on three
// accounts whose own rate CAN be measured cleanly (each account's % over that whole account's
// spend) it came out 0.0319, 0.0364 and 0.0462 %/$, a spread of 1.45x. A constant drawn from that
// is wrong by a third on a real account, so on the 1.30.0 account, which had nobody outside the
// table, the reference rate would have drawn 8.7% as people who do not exist. That is the bug
// that was reported. A per-PC measurement is worse again: between two readings the account's %
// moves for everyone while only this PC's spend is known here.
//
// So where the table is not everyone, a row's percentage is not computed at all. The sheet shows
// what each PC spent, which IS separated to the person and needs nothing, and says why there is
// no percentage. `others` carries what was witnessed rather than inferred (weekly.js,
// othersFloor), for the one thing that can still be said: at least this much was not the table's.
function split(summary, myPcId, rate, accountPct, sharePct) {
  const pcs = (summary && summary.pcs) || [];
  const acct = accountPct != null ? accountPct : (summary ? summary.account_pct : null);
  const total = pcs.reduce((a, p) => a + (p.cost || 0), 0);
  const byAccount = acct != null && total > 0;
  const r = rate || 0;
  // WITNESSED USE BY SOMEBODY NOT IN THE TABLE, and only where that is what it measures.
  //
  // othersPct (weekly.js, othersFloor) is percentage that moved while THIS PC was spending
  // nothing. With one PC in the table that is everybody else on the account, which is exactly the
  // quantity missing from the divisor. With two, a teammate working while this PC is idle lands
  // in it too, so it would subtract a PC that IS in the table and draw it as one that is not:
  // phantom rows, which is 1.30.0 over again. The server keeps every PC's hourly spend and could
  // answer it for a team; it is not read here, so for a team this stays zero and the division is
  // what it has always been.
  //
  // On a table of one the row is the plan's own estimate (weekly.js), which is the tighter of two
  // bounds that are tight in opposite conditions: the week minus what was witnessed (good where
  // this PC is rarely alone, so idle stretches are plentiful) and this PC's spend times the
  // lowest percent-per-$ any interval showed (good where it often is, so an interval close to
  // alone exists). Turning sharing on or off then shows the same number, which it must: sharing
  // adds PCs to a table, it does not change what this PC did.
  const lone = pcs.length === 1;
  const est = sharePct == null ? null : Math.max(0, Math.min(sharePct, acct));
  const others = byAccount && lone && est != null ? Math.max(0, acct - est) : 0;
  const divisible = Math.max(0, acct - others);
  const rows = pcs.map((p) => {
    const ofTeam = total > 0 ? (p.cost || 0) / total : 0;
    return {
      name: p.name, me: p.pc_id === myPcId, stale: !!p.stale, cost: p.cost || 0, tokens: p.tokens || 0,
      pct: byAccount ? divisible * ofTeam : (p.cost || 0) * r, ofTeam
    };
  }).sort((a, b) => b.cost - a.cost);
  return { rows, accountPct: acct, byAccount, others, lone };
}

module.exports = { sync, split, validCode, displayName, readAccountId, readAccountTier, accountKey, validAccountKey, SERVER };
