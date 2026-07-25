const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { AuthManager } = require('./auth');
const { buildNpcCatalog } = require('./sprites');
const spriteData = require('./sprite-data'); // character sprites as base64 (not shipped as raw png)

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const RATE_FILE = path.join(CLAUDE_DIR, 'usage-bar.json');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

let statusItem;
let lastStatusData = null;
let provider;
let timer;
let usageTimer;
let usageLoaded = false;
let usageFails = 0;
let lastFetch = 0;
let lastUsageAt = 0;
let lastSeenT = 0; // burn-rate: requests newer than this are "unseen"; the peak survives other sessions' replies until dismissed
let log; // debug OutputChannel — every fetch logs its status/values here
let auth; // our own OAuth token (own rate-limit budget) when signed in
let lastTapAt = 0; // last time we read Claude Code's own usage response via diagnostics_channel
const pendingUsageRequests = new WeakSet(); // in-flight Claude Code requests to /api/oauth/usage
const pendingMessageRequests = new WeakSet(); // in-flight Claude Code /v1/messages turns
let turnRefreshTimer; // debounced refresh fired after a turn completes
let extContext; // for persisting the last-good usage value across reloads
let agentNicknames = {}; // agentName -> user nickname (persisted, editable in the panel)
let agentRoles = {};     // agentName -> user role/title alias (persisted, editable)
let agentAppearance = {}; // agentName -> chosen NPC sprite key (persisted, overrides auto-assignment)
let debounceTimer;
let usageCache = null; // { five_hour:{used_percentage,resets_at}, seven_day:{...} } — from oauth/usage endpoint
const watchers = [];

function fmtCountdown(resetsAt) {
  if (!resetsAt) return '';
  let rem = Math.floor(resetsAt - Date.now() / 1000);
  if (rem <= 0) return 'now';
  const d = Math.floor(rem / 86400); rem %= 86400;
  const h = Math.floor(rem / 3600); rem %= 3600;
  const m = Math.floor(rem / 60);
  if (d) return `${d}d${h}h`;
  if (h) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

function readRate() {
  try { return JSON.parse(fs.readFileSync(RATE_FILE, 'utf8')); }
  catch (e) { return null; }
}

// Extract the first text block from a transcript user message (skips tool_result turns).
function userText(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return c.trim();
  if (Array.isArray(c)) { for (const b of c) { if (b && b.type === 'text' && b.text) return String(b.text).trim(); } }
  return '';
}

// Claude Code stores each launch dir's transcripts under projects/<path-with-slashes-as-dashes>/.
// The active VS Code workspace(s) encode the same way, so we can tell which transcript folders
// belong to this window — used to scope the Context gauge to this workspace, not every session.
function activeProjectPrefixes() {
  const folders = vscode.workspace.workspaceFolders || [];
  return folders.map((f) => f.uri.fsPath.replace(/\//g, '-')).filter(Boolean);
}
function fileInProject(p, prefixes) {
  const rel = path.relative(PROJECTS_DIR, p);
  const folder = rel.split(path.sep)[0]; // top-level project folder under projects/
  for (const pre of prefixes) { if (folder === pre || folder.startsWith(pre + '-')) return true; }
  return false;
}

// From transcript JSONL: today's tokens + latest message + today's request count.
// projPrefixes scopes which transcripts count as "this workspace" for the context window.
function readTokens(projPrefixes) {
  projPrefixes = projPrefixes || [];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  let last = null;      // globally latest message (today), any session
  let lastProj = null;  // latest message from this workspace's transcripts — drives Context %
  let count = 0;
  const agentCalls = [];      // {agent, id, t, inProj} — Agent/Task tool_use invocations
  const agentResults = {};    // tool_use_id -> result timestamp (ms)
  let peak = null; // largest request newer than lastSeenT (survives other sessions' replies)

  const files = [];
  const stack = [PROJECTS_DIR];
  while (stack.length) {
    const dir = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.name.endsWith('.jsonl')) continue;
      try {
        const st = fs.statSync(p);
        if (st.mtimeMs >= startOfToday) files.push(p);
      } catch (e2) { /* skip */ }
    }
  }

  for (const p of files) {
    let content;
    try { content = fs.readFileSync(p, 'utf8'); } catch (e) { continue; }
    const inProj = projPrefixes.length ? fileInProject(p, projPrefixes) : false;
    let lastUserText = ''; // latest real user prompt in this session file
    for (const line of content.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch (e) { continue; }
      if (o.type === 'user' && o.message) { const _ut = userText(o.message); if (_ut) lastUserText = _ut; }
      // agent activity: subagent invocations (tool_use name Agent/Task) and their results
      const _content = o.message && o.message.content;
      if (Array.isArray(_content)) {
        const _ts = o.timestamp ? Date.parse(o.timestamp) : 0;
        for (const b of _content) {
          if (b && b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task') && b.input && b.input.subagent_type) {
            agentCalls.push({ agent: b.input.subagent_type, id: b.id, t: _ts, inProj, desc: (b.input.description || '').slice(0, 60) });
          } else if (b && b.type === 'tool_result' && b.tool_use_id) {
            agentResults[b.tool_use_id] = _ts;
          }
        }
      }
      const u = (o.message && o.message.usage) || o.usage;
      if (!u) continue;
      const t = o.timestamp ? Date.parse(o.timestamp) : NaN;
      if (isNaN(t)) continue;
      if (t >= startOfToday) {
        today.input += u.input_tokens || 0;
        today.output += u.output_tokens || 0;
        today.cache_creation += u.cache_creation_input_tokens || 0;
        today.cache_read += u.cache_read_input_tokens || 0;
        count += 1;
      }
      if (!last || t > last.t || (inProj && (!lastProj || t > lastProj.t))) {
        const msg = {
          t,
          input: u.input_tokens || 0,
          output: u.output_tokens || 0,
          cache_creation: u.cache_creation_input_tokens || 0,
          cache_read: u.cache_read_input_tokens || 0
        };
        if (!last || t > last.t) last = msg;
        if (inProj && (!lastProj || t > lastProj.t)) lastProj = msg;
      }
      if (t > lastSeenT) {
        const tot = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
        if (!peak || tot > peak.total) peak = { t: t, total: tot, prompt: lastUserText };
      }
    }
  }
  return { today, last, lastProj, count, peak, agentCalls, agentResults };
}

// Derive each agent's live state from its invocations (M2 MVP, hook-free — read
// straight from the transcript the extension already watches).
// This harness runs subagents in the background, so a tool_result can land ~2s
// after the call while real work continues; MIN_ACTIVE keeps the "active" state
// visible long enough to actually see.
function computeAgentActivity(calls, results) {
  const NOW = Date.now();
  const RUN_WINDOW = 15 * 60 * 1000; // a call with no result older than this is stale, ignore
  const MIN_ACTIVE = 6000;           // show "active" at least this long even on a fast result
  const DONE_MS = 6000;              // then flash "done" for this long
  const out = {};
  const rank = { active: 2, done: 1 };
  function set(name, state, since, desc) {
    const cur = out[name];
    if (!cur || rank[state] > rank[cur.state] || (rank[state] === rank[cur.state] && since > cur.since)) {
      out[name] = { state, since, desc: desc || '' };
    }
  }
  for (const c of calls) {
    if (!c.inProj || !c.t) continue; // scope to this workspace
    const res = results[c.id];
    if (res) {
      const end = Math.max(res, c.t + MIN_ACTIVE);
      if (NOW < end) set(c.agent, 'active', c.t, c.desc);
      else if (NOW - end <= DONE_MS) set(c.agent, 'done', end, c.desc);
    } else if (NOW - c.t <= RUN_WINDOW) {
      set(c.agent, 'active', c.t, c.desc);
    }
  }
  return out;
}

// --- agent roster (M1) -------------------------------------------------------
// Scan .claude/agents/*.md definitions (workspace first, then user-level) and
// parse their frontmatter. Deterministic species/colour assignment happens in
// the webview from the name hash, so here we only surface the raw facts.
function parseAgentFrontmatter(text) {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = m[1];
  const get = (k) => {
    const r = fm.match(new RegExp('^' + k + ':\\s*(.*)$', 'm'));
    return r ? r[1].trim().replace(/^["']|["']$/g, '') : '';
  };
  const name = get('name');
  if (!name) return null;
  // description is a single quoted line with literal \n examples — keep the lead only
  const desc = get('description').split('\\n')[0].slice(0, 200);
  return { name, model: get('model') || 'inherit', description: desc };
}

function readAgentsFrom(dir, into, seen) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of ents) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    let text;
    try { text = fs.readFileSync(path.join(dir, e.name), 'utf8'); } catch (e2) { continue; }
    const a = parseAgentFrontmatter(text);
    if (a && !seen.has(a.name)) { a.file = path.join(dir, e.name); seen.add(a.name); into.push(a); }
  }
}

function readAgents() {
  const out = [], seen = new Set();
  // workspace agents win over user-level ones with the same name
  const folders = vscode.workspace.workspaceFolders || [];
  for (const f of folders) readAgentsFrom(path.join(f.uri.fsPath, '.claude', 'agents'), out, seen);
  readAgentsFrom(path.join(CLAUDE_DIR, 'agents'), out, seen);
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// Rewrite the `model:` field in an agent's .md frontmatter (adds it if missing).
// This is what makes the roster's model dropdown actually change the agent's model.
function writeAgentModel(file, model) {
  let text = fs.readFileSync(file, 'utf8');
  const fm = text.match(/^(---\s*\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fm) return false;
  let body = fm[2];
  if (/^model:\s*.*$/m.test(body)) body = body.replace(/^model:\s*.*$/m, 'model: ' + model);
  else body = body + '\nmodel: ' + model;
  fs.writeFileSync(file, fm[1] + body + fm[3] + text.slice(fm[0].length));
  return true;
}

// Live session/weekly limits from Claude's own usage endpoint (same source as the built-in dialog).
// The stored OAuth token is sent ONLY to api.anthropic.com and nowhere else.
function fetchUsage() {
  return new Promise((resolve) => {
    // Prefer our own signed-in token — its own budget, so polls succeed during active use
    // and session % updates live. Fall back to Claude Code's shared token when not signed in.
    let token = auth && auth.getAccessToken();
    if (!token) {
      try {
        const cred = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, '.credentials.json'), 'utf8'));
        token = (cred.claudeAiOauth || {}).accessToken;
      } catch (e) { resolve({ status: 0, data: null }); return; }
    }
    if (!token) { resolve({ status: 0, data: null }); return; }
    // Match Claude Code's own request to this endpoint exactly.
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/api/oauth/usage', method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'anthropic-beta': 'oauth-2025-04-20',
        'x-cuc-self': '1'
      }
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(body); } catch (e) { /* non-JSON */ }
        resolve({ status: res.statusCode, data: data });
      });
    });
    req.on('error', () => resolve({ status: 0, data: null }));
    req.setTimeout(12000, () => { req.destroy(); resolve({ status: 0, data: null }); });
    req.end();
  });
}

function isoToEpoch(s) { const t = Date.parse(s); return isNaN(t) ? null : Math.floor(t / 1000); }
function resetsToEpoch(v) {
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : v; // ms vs s
  return isoToEpoch(v);
}

// Persist the last-good usage so a reload shows it instantly instead of "loading".
function saveUsage() {
  lastUsageAt = Date.now();
  try { if (extContext && usageCache) extContext.globalState.update('usageCacheV1', { at: lastUsageAt, value: usageCache }); } catch (e) { /* ignore */ }
}

// After a Claude Code turn finishes, the usage token is briefly free, so a direct
// fetch usually succeeds. Debounced so a turn with many tool-use round trips fires once.
function scheduleTurnRefresh() {
  clearTimeout(turnRefreshTimer);
  // Fire ~7s after the turn's last transcript write. By then generation is done and the
  // user is reading (a lull), so the usage window is free and our fetch gets through —
  // exactly like clicking refresh, but automatic after every turn.
  turnRefreshTimer = setTimeout(() => {
    if (Date.now() - lastFetch < 15000) return; // fetched very recently, skip
    if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] turn done — refreshing usage');
    refreshUsage();
  }, 7000);
}

// Normalize undici raw headers (Buffer[] of [name,value,name,value,...]) to a lowercase map.
function undiciHeaders(h) {
  const out = {};
  try {
    if (Array.isArray(h)) {
      for (let i = 0; i + 1 < h.length; i += 2) out[String(h[i]).toLowerCase()] = String(h[i + 1]);
    } else if (h && typeof h === 'object') {
      for (const k in h) out[String(k).toLowerCase()] = String(h[k]);
    }
  } catch (e) {}
  return out;
}

// DIAGNOSTIC: log any anthropic rate-limit response headers so we can see whether
// per-message usage is available in message responses (and in what format).
function applyRateLimitHeaders(hdrs, path, source) {
  const rl = {};
  for (const k in hdrs) {
    if (k.indexOf('ratelimit') !== -1 || k.indexOf('unified') !== -1) rl[k] = hdrs[k];
  }
  if (!Object.keys(rl).length) return;
  if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] [' + source + '] ' + String(path).slice(0, 24) + ' rate-limit headers: ' + JSON.stringify(rl));
}

// --- diagnostics_channel tap -------------------------------------------------
// Claude Code fetches /api/oauth/usage for its own display. Since its extension
// runs in the same host process, we can observe its request via diagnostics_channel
// and read the RESPONSE BODY as it streams — without making our own call. That means
// no rate limit competition (no 429) and no sign-in: we ride Claude Code's success.
function setupUsageTap(context) {
  let dc;
  try { dc = require('diagnostics_channel'); } catch (e) { return; }
  const reqHandler = (message) => {
    try {
      const req = message && message.request;
      if (!req) return;
      if (req.getHeader && req.getHeader('x-cuc-self')) return; // our own fetch, not Claude Code's
      const p = req.path;
      const host = req.getHeader && req.getHeader('host');
      if (!p || !host || String(host).indexOf('anthropic.com') === -1) return;
      if (p.indexOf('/api/oauth/usage') !== -1) {
        pendingUsageRequests.add(req);
        if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] tap: saw Claude Code request to /api/oauth/usage');
      } else if (p.indexOf('/v1/messages') !== -1 && p.indexOf('count_tokens') === -1) {
        pendingMessageRequests.add(req); // a real message turn (not token counting)
      }
    } catch (e) { /* never break other extensions */ }
  };
  const resHandler = (message) => {
    try {
      if (!message) return;
      const req = message.request;
      if (pendingUsageRequests.has(req)) {
        pendingUsageRequests.delete(req);
        const res = message.response;
        if (res && res.statusCode === 200) tapResponseBody(res);
        return;
      }
      if (pendingMessageRequests.has(req)) {
        pendingMessageRequests.delete(req);
        const mres = message.response;
        if (mres && mres.headers) applyRateLimitHeaders(mres.headers, req.path || '', 'http-msg');
        scheduleTurnRefresh(); // a Claude Code turn finished — pull fresh usage right after
      }
    } catch (e) { /* never break */ }
  };
  // undici (global fetch) path: Claude Code likely streams /v1/messages over fetch, which
  // does NOT publish http.client.* but publishes undici:request:headers with the response
  // headers. Read anthropic rate-limit headers there.
  const undiciHandler = (message) => {
    try {
      const req = message && message.request;
      const res = message && message.response;
      if (!req || !res) return;
      const origin = String(req.origin || '');
      const path = String(req.path || '');
      if (origin.indexOf('anthropic.com') === -1 && path.indexOf('/v1/') === -1 && path.indexOf('/api/') === -1) return;
      applyRateLimitHeaders(undiciHeaders(res.headers), path, 'undici');
    } catch (e) {}
  };
  try {
    dc.subscribe('http.client.request.start', reqHandler);
    dc.subscribe('http.client.response.finish', resHandler);
    let undiciOk = false;
    try { dc.subscribe('undici:request:headers', undiciHandler); undiciOk = true; } catch (e) {}
    if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] tap active — reading Claude Code\'s own usage responses' + (undiciOk ? ' (+ undici header tap)' : ''));
    context.subscriptions.push({ dispose: () => {
      try { dc.unsubscribe('http.client.request.start', reqHandler); dc.unsubscribe('http.client.response.finish', resHandler); } catch (e) {}
      try { dc.unsubscribe('undici:request:headers', undiciHandler); } catch (e) {}
    } });
  } catch (e) {
    if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] tap unavailable: ' + (e && e.message));
  }
}

// Pass response chunks through to Claude Code's own listeners while copying the
// body for ourselves. Monkey-patch res.on so we never consume the stream.
function tapResponseBody(res) {
  let body = '';
  const MAX = 200000;
  const origOn = res.on.bind(res);
  res.on = function (event, listener) {
    if (event === 'data') {
      return origOn('data', (chunk) => { if (body.length < MAX) body += chunk.toString(); listener(chunk); });
    }
    if (event === 'end') {
      return origOn('end', (...args) => { try { if (body) processTapped(body); } catch (e) {} listener(...args); });
    }
    return origOn(event, listener);
  };
}

// Parse a tapped usage payload (either the /api/oauth/usage shape or the
// statusLine rate_limits shape) into usageCache and push to the panel.
function processTapped(body) {
  let u;
  try { u = JSON.parse(body); } catch (e) { return; }
  const fh = u.five_hour || (u.rate_limits && u.rate_limits.five_hour);
  const sd = u.seven_day || (u.rate_limits && u.rate_limits.seven_day);
  const pct = (o) => (o == null ? null : (o.utilization != null ? o.utilization : o.used_percentage));
  if (fh == null && sd == null) return;
  usageCache = {
    five_hour: fh ? { used_percentage: pct(fh), resets_at: resetsToEpoch(fh.resets_at) } : null,
    seven_day: sd ? { used_percentage: pct(sd), resets_at: resetsToEpoch(sd.resets_at) } : null
  };
  usageLoaded = true;
  lastTapAt = Date.now();
  lastFetch = Date.now();
  if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] tap (Claude Code) -> '
    + (usageCache.five_hour ? 'session=' + Math.round(usageCache.five_hour.used_percentage) + '%' : '')
    + (usageCache.seven_day ? '  weekly=' + Math.round(usageCache.seven_day.used_percentage) + '%' : ''));
  saveUsage();
  push();
}

// returns the HTTP status (200 ok, 429 rate-limited, 0 unreachable) so the
// manual-refresh command can tell the user what happened.
async function refreshUsage() {
  if (auth && auth.isLoggedIn()) await auth.ensureFresh(); // refresh our token before it expires
  const r = await fetchUsage();
  lastFetch = Date.now();
  const ts = new Date().toLocaleTimeString();
  if (r.status !== 200 || !r.data) {
    // 429 is expected while Claude Code is busy (shared token) and harmless (we keep the
    // last value and the tap covers active use), so don't spam the log with it.
    if (log && r.status !== 429) log.appendLine('[' + ts + '] fetch -> ' + (r.status ? 'HTTP ' + r.status : 'unreachable') + ' — keeping last values');
    return r.status;
  }
  const u = r.data;
  usageCache = {
    five_hour: u.five_hour ? { used_percentage: u.five_hour.utilization, resets_at: isoToEpoch(u.five_hour.resets_at) } : null,
    seven_day: u.seven_day ? { used_percentage: u.seven_day.utilization, resets_at: isoToEpoch(u.seven_day.resets_at) } : null
  };
  usageLoaded = true;
  if (log) log.appendLine('[' + ts + '] fetch -> 200  session=' + (u.five_hour ? u.five_hour.utilization + '%' : '–') + '  weekly=' + (u.seven_day ? u.seven_day.utilization + '%' : '–'));
  saveUsage();
  push();
  return 200;
}

// context window %: input + cache tokens of the latest message.
// Window auto-detects tier: 1M if it ever exceeds 200k, else 200k.
function contextPct(last) {
  if (!last) return null;
  const used = (last.input || 0) + (last.cache_read || 0) + (last.cache_creation || 0);
  const win = used > 200000 ? 1000000 : 200000;
  return { used_percentage: Math.min(100, Math.round(used / win * 100)), window: win };
}

function collect() {
  const tokens = readTokens(activeProjectPrefixes());
  // Context reflects THIS workspace's most recent turn; fall back to the global
  // latest only when no workspace transcript is found (e.g. no folder open).
  const cp = contextPct(tokens.lastProj || tokens.last);
  return {
    fh: usageCache ? usageCache.five_hour : null,
    sd: usageCache ? usageCache.seven_day : null,
    ctx: cp,
    usageLoading: !usageLoaded,
    today: tokens.today,
    last: tokens.last,
    count: tokens.count,
    refreshedAt: Date.now(),
    usageAt: (usageCache ? lastUsageAt : 0),
    avg: (tokens.count > 0) ? (((tokens.today.input || 0) + (tokens.today.output || 0) + (tokens.today.cache_creation || 0) + (tokens.today.cache_read || 0)) / tokens.count) : 0,
    peak: tokens.peak,
    agents: readAgents().map((a) => ({ name: a.name, model: a.model, description: a.description })),
    agentActivity: computeAgentActivity(tokens.agentCalls, tokens.agentResults),
    nicknames: agentNicknames,
    roles: agentRoles,
    appearance: agentAppearance
  };
}

function renderStatusBar(data) {
  lastStatusData = data;
  const mode = vscode.workspace.getConfiguration('claudeUsage').get('statusBar.show', 'session+weekly');
  if (mode === 'off') { statusItem.hide(); return; }
  const showSession = mode === 'session' || mode === 'session+weekly';
  const showWeekly = mode === 'weekly' || mode === 'session+weekly';
  const segs = [];
  const tip = [];
  let worst = 0;
  if (showSession && data.fh && data.fh.used_percentage != null) {
    const p = Math.round(data.fh.used_percentage);
    worst = Math.max(worst, p);
    segs.push(`5h ${p}%`);
    const cd = fmtCountdown(data.fh.resets_at);
    tip.push(`Session (5h): ${p}%${cd ? ' · resets ' + cd : ''}`);
  }
  if (showWeekly && data.sd && data.sd.used_percentage != null) {
    const p = Math.round(data.sd.used_percentage);
    worst = Math.max(worst, p);
    segs.push(`wk ${p}%`);
    const cd = fmtCountdown(data.sd.resets_at);
    tip.push(`Weekly (7d): ${p}%${cd ? ' · resets ' + cd : ''}`);
  }
  statusItem.text = segs.length ? segs.join(' · ') : 'Claude usage: loading…';
  if (worst >= 90) statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  else if (worst >= 70) statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  else statusItem.backgroundColor = undefined;
  tip.push('Click to open the panel');
  statusItem.tooltip = tip.join('\n');
  statusItem.show();
}

const { renderHtml } = require('./html');

class UsageViewProvider {
  constructor(extensionUri) { this.extensionUri = extensionUri; this.view = null; }
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m) => {
      if (!m) return;
      if (m.type === 'ready') push();
      else if (m.type === 'login') vscode.commands.executeCommand('claudeUsage.login');
      else if (m.type === 'setConfig' && m.key) {
        vscode.workspace.getConfiguration('claudeUsage').update(m.key, m.value, vscode.ConfigurationTarget.Global).then(function () { push(); });
      }
      else if (m.type === 'dismissBurn') { lastSeenT = Date.now(); if (extContext) extContext.globalState.update('burnSeenT', lastSeenT); push(); }
      else if (m.type === 'setNickname' && m.name) {
        const nick = (m.nick || '').trim().slice(0, 24);
        if (nick && nick !== m.name) agentNicknames[m.name] = nick; else delete agentNicknames[m.name];
        if (extContext) extContext.globalState.update('agentNicknamesV1', agentNicknames);
        push();
      }
      else if (m.type === 'setRole' && m.name) {
        const role = (m.role || '').trim().slice(0, 24);
        if (role && role !== m.name) agentRoles[m.name] = role; else delete agentRoles[m.name];
        if (extContext) extContext.globalState.update('agentRolesV1', agentRoles);
        push();
      }
      else if (m.type === 'setAppearance' && m.name) {
        if (m.appearance) agentAppearance[m.name] = m.appearance; else delete agentAppearance[m.name];
        if (extContext) extContext.globalState.update('agentAppearanceV1', agentAppearance);
        push();
      }
      else if (m.type === 'setModel' && m.name && m.model) {
        const a = readAgents().find((x) => x.name === m.name);
        if (a && a.file) {
          try { writeAgentModel(a.file, m.model); }
          catch (e) { if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] setModel failed: ' + (e && e.message)); }
        }
        push();
      }
    });
    view.onDidChangeVisibility(() => {
      if (view.visible && Date.now() - lastFetch > 300000) refreshUsage();
    });
    push();
  }
  post(data) {
    if (this.view) { try { this.view.webview.postMessage({ type: 'data', data }); } catch (e) { /* ignore */ } }
  }
  html(webview) {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'webview.js'));
    const crabUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'crab.png'));
    const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'logo.png'));
    const sparkleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'sparkle.png'));
    const mascotIdleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'mascot-idle.png'));
    const mascotStunnedUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'mascot-stunned.png'));
    const mascotDespairUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'mascot-despair.png'));
    const mascotWorkingUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'mascot-working.png'));
    const roomMinecraftUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'room-minecraft.png'));
    const spriteUri = (n) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, n)).toString();
    // sprites resolve to embedded base64 (data URI); room images stay as file URIs (own assets)
    const spriteSrc = (n) => spriteData[n] || spriteUri(n);
    const npcs = buildNpcCatalog(spriteSrc, path.join(this.extensionUri.fsPath, 'sprite-bbox.json'));
    // each room theme: image(s) + walker entry/desk spots (normalized 0..1 of the square image)
    const rooms = {
      cave: { name: 'Blocky Cave', dark: spriteUri('room-minecraft.png'), light: spriteUri('room-minecraft-light.png'), entry: [0.26, 0.80], desk: [0.50, 0.735] },
      backrooms: { name: 'Backrooms', dark: spriteUri('room-backrooms.png'), entry: [0.28, 0.80], desk: [0.48, 0.72] },
      liminal: { name: 'Liminal Office', dark: spriteUri('room-liminal.png'), entry: [0.30, 0.78], desk: [0.57, 0.66] }
    };
    const assetsJson = JSON.stringify({ rooms, npcs })
      .replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
    return renderHtml({
      csp: webview.cspSource,
      scriptUri, logoUri, crabUri, sparkleUri,
      mascotIdleUri, mascotWorkingUri, mascotDespairUri, mascotStunnedUri,
      roomMinecraftUri, assetsJson
    });
  }
}

function push() {
  const data = collect();
  data.signedIn = !!(auth && auth.isLoggedIn());
  const _cfg = vscode.workspace.getConfiguration('claudeUsage');
  data.cfg = { statusBar: _cfg.get('statusBar.show', 'session+weekly'), panelHidden: _cfg.get('panel.hidden', []), burnRate: _cfg.get('burnRate.enabled', true) };
  if (statusItem) renderStatusBar(data);
  if (provider) provider.post(data);
}

function scheduleRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(push, 200);
}

function activate(context) {
  log = vscode.window.createOutputChannel('Claude Usage');
  context.subscriptions.push(log);
  log.appendLine('[' + new Date().toLocaleTimeString() + '] Claude Usage activated — every usage fetch is logged below (open via View > Output > Claude Usage, or the refresh button).');

  // Restore last-good usage immediately so a reload never shows "loading" when we
  // have a prior value (this is what the other extensions do — show last, update later).
  extContext = context;
  lastSeenT = context.globalState.get('burnSeenT', 0); // restore burn-rate dismiss point across reloads
  agentNicknames = context.globalState.get('agentNicknamesV1', {}) || {}; // restore agent nicknames
  agentRoles = context.globalState.get('agentRolesV1', {}) || {}; // restore agent role/title aliases
  agentAppearance = context.globalState.get('agentAppearanceV1', {}) || {}; // restore appearance overrides
  try {
    const saved = context.globalState.get('usageCacheV1');
    if (saved && saved.value && (saved.value.five_hour || saved.value.seven_day)) {
      usageCache = saved.value;
      usageLoaded = true;
      log.appendLine('[' + new Date().toLocaleTimeString() + '] restored last-good usage: session=' + (saved.value.five_hour ? Math.round(saved.value.five_hour.used_percentage) + '%' : '–') + ' weekly=' + (saved.value.seven_day ? Math.round(saved.value.seven_day.used_percentage) + '%' : '–'));
    }
  } catch (e) { /* ignore */ }

  // Primary source: ride Claude Code's own usage responses (no own calls, no 429).
  // Our own fetch is only a fallback for when the tap has been quiet for a while.
  setupUsageTap(context);

  // Optional own-token sign-in (own rate-limit budget → live session %). Never forced.
  auth = new AuthManager(context.secrets, log);
  auth.initialize().then((ok) => {
    if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] auth: ' + (ok ? 'signed in (own token — session % updates live)' : 'not signed in (Claude Code token fallback; click the sign-in button for live session %)'));
    vscode.commands.executeCommand('setContext', 'claudeUsage.signedIn', ok);
    if (ok) refreshUsage();
  });

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.name = 'Claude Usage';
  statusItem.command = 'claudeUsage.view.focus';
  context.subscriptions.push(statusItem);

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('claudeUsage.statusBar') && lastStatusData) renderStatusBar(lastStatusData);
  }));

  provider = new UsageViewProvider(context.extensionUri);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('claudeUsage.view', provider));

  push();

  try {
    watchers.push(fs.watch(CLAUDE_DIR, (ev, fn) => { if (!fn || fn === 'usage-bar.json') scheduleRefresh(); }));
  } catch (e) { /* covered by timer */ }
  try {
    // A transcript write refreshes token/request counts (real-time) AND schedules a usage
    // refresh ~7s later, in the post-turn reading lull when the window is free.
    watchers.push(fs.watch(PROJECTS_DIR, { recursive: true }, () => { scheduleRefresh(); scheduleTurnRefresh(); }));
  } catch (e) { /* covered by timer */ }
  // watch .claude/agents/ dirs so newly created agents appear in the Crew immediately
  // (workspace-level first, then user-level). Cold start — before the dir exists — is
  // still covered by the 10s poll.
  const _agentDirs = (vscode.workspace.workspaceFolders || []).map((f) => path.join(f.uri.fsPath, '.claude', 'agents'));
  _agentDirs.push(path.join(CLAUDE_DIR, 'agents'));
  _agentDirs.forEach((dir) => { try { watchers.push(fs.watch(dir, () => scheduleRefresh())); } catch (e) { /* dir may not exist yet; timer covers it */ } });
  context.subscriptions.push({ dispose: () => watchers.forEach((w) => { try { w.close(); } catch (e) {} }) });

  timer = setInterval(push, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  // live session/weekly limits from the usage endpoint.
  // Poll gently (every 5 min once loaded) and back off on failure so we never hammer the
  // endpoint or trip its rate limit. Session/weekly windows change slowly, so 5 min is plenty.
  const usageLoop = () => {
    // The endpoint only lets a token through about once every few minutes, so polling
    // faster just wastes calls on silent 429s. Poll ~every 2 min; whichever get through keep
    // the panel current, the tap adds Claude Code's own checks, and /usage or the refresh
    // button pulls instantly. Skip a cycle if a tapped value just arrived.
    if (Date.now() - lastTapAt < 110000) {
      usageTimer = setTimeout(usageLoop, 110000);
      return;
    }
    refreshUsage().then((status) => {
      // Signed in (own budget) → poll every 60s, it succeeds. Shared token → 2 min on success,
      // 30s retry on 429 to grab the window when it frees.
      const signedIn = auth && auth.isLoggedIn();
      usageTimer = setTimeout(usageLoop, status === 200 ? (signedIn ? 60000 : 120000) : 30000);
    }, () => {
      usageTimer = setTimeout(usageLoop, 30000);
    });
  };
  usageLoop();
  context.subscriptions.push({ dispose: () => clearTimeout(usageTimer) });

  // refresh when the window regains focus (e.g. after sleep/wake), throttled to 5 min so
  // focus churn during active use can't burst the endpoint's short rate limit
  context.subscriptions.push(vscode.window.onDidChangeWindowState((e) => {
    if (e.focused && Date.now() - lastFetch > 300000) refreshUsage();
  }));

  // manual refresh (panel title button + command palette) — forces a fetch, ignores throttle
  context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.openSettings', () => {
    if (provider && provider.view) provider.view.webview.postMessage({ type: 'openSettings' });
  }));

  context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.refresh', async () => {
    if (log) log.show(true);
    const tapAge = Date.now() - lastTapAt;
    // Only short-circuit if Claude Code's own reading just arrived; otherwise the button
    // should actually try to pull a current value.
    if (usageLoaded && tapAge < 45000) {
      const secs = Math.round(tapAge / 1000);
      if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] refresh: already up to date (from Claude Code ' + secs + 's ago). Type /usage in the terminal to force a fresh reading.');
      push();
      vscode.window.setStatusBarMessage('$(crab) Claude usage up to date (' + secs + 's ago)', 3000);
      return;
    }
    if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] manual refresh — tap has been quiet, trying a direct fetch');
    const status = await refreshUsage();
    if (status === 200) {
      vscode.window.setStatusBarMessage('$(crab) Claude usage refreshed', 2500);
    } else if (status === 429) {
      vscode.window.showInformationMessage('Claude Code was busy, so the direct refresh was rate-limited. The panel keeps updating from Claude Code\'s own usage checks; last value kept.');
    } else {
      vscode.window.showWarningMessage('Could not reach the Claude usage endpoint. Showing the last known values.');
    }
  }));

  // sign in with our own token (own budget → live session %). Logs every step.
  context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.login', async () => {
    if (log) log.show(true);
    const ok = await auth.login();
    vscode.commands.executeCommand('setContext', 'claudeUsage.signedIn', ok);
    if (ok) {
      vscode.window.setStatusBarMessage('$(crab) Claude Usage: signed in — session % is now live', 4000);
      refreshUsage();
    } else {
      vscode.window.showWarningMessage('Claude Usage: sign-in did not complete. Open the Claude Usage output to see where it stopped.');
    }
  }));
  context.subscriptions.push(vscode.commands.registerCommand('claudeUsage.logout', async () => {
    await auth.logout();
    vscode.commands.executeCommand('setContext', 'claudeUsage.signedIn', false);
    vscode.window.setStatusBarMessage('Claude Usage: signed out', 3000);
  }));
}

function deactivate() {}

module.exports = { activate, deactivate };
