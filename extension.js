const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { AuthManager } = require('./auth');

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

function dotbar(pct, width = 10) {
  const p = Math.min(Math.max(pct || 0, 0), 100);
  const fill = Math.round((p / 100) * width);
  return '●'.repeat(fill) + '○'.repeat(width - fill);
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
            agentCalls.push({ agent: b.input.subagent_type, id: b.id, t: _ts, inProj });
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
  function set(name, state, since) {
    const cur = out[name];
    if (!cur || rank[state] > rank[cur.state] || (rank[state] === rank[cur.state] && since > cur.since)) {
      out[name] = { state, since };
    }
  }
  for (const c of calls) {
    if (!c.inProj || !c.t) continue; // scope to this workspace
    const res = results[c.id];
    if (res) {
      const end = Math.max(res, c.t + MIN_ACTIVE);
      if (NOW < end) set(c.agent, 'active', c.t);
      else if (NOW - end <= DONE_MS) set(c.agent, 'done', end);
    } else if (NOW - c.t <= RUN_WINDOW) {
      set(c.agent, 'active', c.t);
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

const CSS = `
  *{box-sizing:border-box;}
  body{margin:0;padding:0;background:transparent;color:var(--text);font-size:12px;
    font-family:var(--vscode-font-family),-apple-system,"SF Pro",sans-serif;
    --card:#232326;--inner:#191919;--track:#3a3a3d;--text:#ececec;--muted:#8b8b90;
    --border:#303034;--iborder:#2c2c30;--ringtrack:#333;--bubble:#fff;--bubblebd:rgba(0,0,0,.06);}
  body.vscode-light{--card:#ffffff;--inner:#f6f6f7;--track:#e4e4e7;--text:#1d1d1f;--muted:#78787f;
    --border:#e7e7ea;--iborder:#ededf0;--ringtrack:#e2e2e6;--bubble:#ffffff;--bubblebd:rgba(0,0,0,.14);}
  body.vscode-high-contrast{--card:#000;--inner:#000;--border:#6fc3df;--iborder:#6fc3df;--text:#fff;--track:#555;}
  .wrap{padding:10px;}
  .card{position:relative;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;}
  .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:13px;}
  .brand{display:flex;align-items:center;gap:10px;min-width:0;}
  .logo{width:28px;height:28px;flex:none;}
  .ttl{min-width:0;flex:1 1 auto;overflow:hidden;}
  .ttl .t1{font-size:16px;font-weight:700;line-height:1.1;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .ttl .t2{color:var(--muted);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mascot{position:relative;flex:none;}
  .mascot img{width:44px;height:auto;image-rendering:pixelated;display:block;}
  .bubble{position:absolute;top:-10px;right:-13px;background:var(--bubble);border:1px solid var(--bubblebd);
    border-radius:8px;padding:3px 4px;line-height:0;box-shadow:0 2px 5px rgba(0,0,0,.2);}
  .bubble svg{width:12px;height:12px;display:block;}
  .bubble.warn{border-color:#e5484d;background:rgba(229,72,77,.18);cursor:pointer;animation:pulse 1.3s ease-in-out infinite;}
  .warnbar{display:flex;align-items:flex-start;gap:8px;padding:9px 11px;margin-bottom:11px;border-radius:9px;background:rgba(229,72,77,.13);border:1px solid rgba(229,72,77,.55);color:var(--text);font-size:11.5px;line-height:1.35;}
  .warnbar[hidden]{display:none;}
  .warnbar svg{width:15px;height:15px;flex:none;}
  .warnbar .wbmsg{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;}
  .warnbar .wbq{display:block;margin-top:4px;color:var(--muted);font-style:italic;font-size:11px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .warnbar .wbx{flex:none;background:transparent;border:0;color:var(--muted);cursor:pointer;font-size:16px;line-height:1;padding:1px 5px;border-radius:5px;align-self:flex-start;}
  .warnbar .wbx:hover{background:rgba(255,255,255,.12);color:var(--text);}
  .mascot-wrap{position:relative;display:inline-flex;}
  .mwarn{position:absolute;top:-15px;left:50%;transform:translateX(-50%);background:#fff;border-radius:10px;padding:3px 5px 4px;box-shadow:0 3px 9px rgba(0,0,0,.25);cursor:pointer;z-index:6;}
  .mwarn.calm{animation:none;cursor:default;}
  .mwarn.mid{animation:pulse 1.9s ease-in-out infinite;}
  .mwarn.high{animation:pulse 1.2s ease-in-out infinite;}
  .warnbar.mid{border-color:rgba(245,166,35,.6);}
  .mwarn[hidden]{display:none;}
  .mwarn svg{width:17px;height:17px;display:block;}
  .mwarn::after{content:'';position:absolute;bottom:-6px;left:50%;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid #fff;}
  .inner{position:relative;background:var(--inner);border:1px solid var(--iborder);border-radius:13px;padding:13px;}
  .ihead{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-right:5px;}
  .ihead .it{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--text);white-space:nowrap;min-width:0;overflow:hidden;flex:0 1 auto;}
  .ihead .it svg{width:15px;height:15px;color:#e8895a;}
  .upd{color:var(--muted);font-size:10.5px;display:flex;align-items:center;gap:5px;white-space:nowrap;flex:none;}
  .upd .d{width:6px;height:6px;border-radius:50%;background:#e8895a;box-shadow:0 0 3px #e8895a;flex:none;}
  .body{display:flex;gap:14px;align-items:center;flex-wrap:nowrap;}
  .meters{flex:1 1 auto;min-width:0;}
  .meter{margin-bottom:10px;}
  .meter:last-child{margin-bottom:0;}
  .mtop{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;}
  .mlabel{color:var(--muted);font-size:11.5px;}
  .mval{font-weight:700;font-size:13px;color:var(--text);}
  .mbar{position:relative;height:7px;border-radius:4px;background:var(--track);overflow:hidden;}
  .mfill{position:absolute;left:0;top:0;height:100%;border-radius:4px;
    background:linear-gradient(90deg,#e8895a,#f0a882);transition:width .5s ease;width:0;}
  .msub{color:var(--muted);font-size:10px;margin-top:3px;text-align:right;opacity:.85;}
  .ringbox{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;}
  .ringwrap{position:relative;width:88px;height:88px;}
  .ringwrap svg{transform:rotate(-90deg);}
  .rtrack{stroke:var(--ringtrack);}
  .rcenter{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}
  .rpct{font-size:22px;font-weight:800;color:#e8895a;line-height:1;}
  .rpct span:last-child{font-size:12px;}
  .rtext{font-size:9.5px;color:var(--muted);margin-top:2px;}
  .sparkle{width:88px;height:auto;margin-top:2px;image-rendering:pixelated;}
  .stats{display:flex;gap:1px;margin-top:13px;background:var(--iborder);border-radius:11px;overflow:hidden;}
  .stat{flex:1;background:var(--inner);padding:10px 8px;min-width:0;position:relative;}
  .stat .stop{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
  .stat svg{width:14px;height:14px;color:#e8895a;flex:none;}
  .stat .sval{font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .stat .slabel{color:var(--muted);font-size:10px;white-space:nowrap;}
  /* narrow panel: hide the stat tiles so values never truncate */
  body.narrow .stats{display:none;}
  .mgrp{display:flex;align-items:baseline;gap:6px;}
  .srow{display:flex;align-items:baseline;gap:5px;}
  .delta,.sdelta{color:#e8895a;font-weight:700;opacity:0;}
  .delta{font-size:11px;}
  .sdelta{font-size:10px;position:absolute;top:7px;right:8px;}
  .delta.show,.sdelta.show{animation:flash 1.9s ease forwards;}
  #ringArc{transition:stroke-dashoffset .6s ease, stroke .3s ease;}
  .roll{display:inline-block;animation:roll .45s ease;}
  .upd .d{animation:pulse 2.2s ease-in-out infinite;}
  .notrans *{transition:none !important;}
  .hactions{display:flex;align-items:center;gap:6px;flex:none;}
  .toggle{background:transparent;border:0;color:var(--muted);cursor:pointer;padding:4px;border-radius:6px;display:flex;line-height:0;}
  .toggle:hover{background:var(--track);color:var(--text);}
  .toggle svg{width:16px;height:16px;transition:transform .4s cubic-bezier(.34,1.56,.64,1);}
  .compact .toggle svg{transform:rotate(180deg);}
  .sheet{position:fixed;inset:0;background:rgba(0,0,0,.28);display:flex;align-items:flex-start;justify-content:center;padding:14px;z-index:20;animation:fade .16s ease;}
  .sheet[hidden]{display:none;}
  .sheet-card{background:var(--inner);border:1px solid var(--iborder);border-radius:12px;width:100%;max-width:280px;padding:13px 15px;box-shadow:0 8px 28px rgba(0,0,0,.32);max-height:100%;overflow-y:auto;box-sizing:border-box;}
  .sheet-head{display:flex;align-items:center;justify-content:space-between;font-weight:700;font-size:13px;color:var(--text);margin-bottom:12px;}
  .sheet-x{background:transparent;border:0;color:var(--muted);cursor:pointer;padding:3px;border-radius:6px;display:flex;line-height:0;}
  .sheet-x:hover{background:var(--track);color:var(--text);}
  .sheet-x svg{width:15px;height:15px;transform:rotate(180deg);}
  .sheet-row{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;color:var(--text);}
  .sheet-row + .sheet-row{margin-top:11px;}
  .sheet-row label{color:var(--muted);}
  .sheet-row select{background:var(--track);color:var(--text);border:1px solid var(--iborder);border-radius:7px;padding:5px 8px;font-size:12px;cursor:pointer;}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  .sheet-sec{font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:15px 0 7px;font-weight:700;}
  .sheet-check{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--text);cursor:pointer;padding:4px 0;}
  .sheet-check input{accent-color:#e8895a;cursor:pointer;width:14px;height:14px;flex:none;}
  .sparkle-hd{width:0;opacity:0;flex:none;object-fit:contain;transition:width .4s cubic-bezier(.34,1.56,.64,1),opacity .35s ease;}
  .compact .sparkle-hd{width:32px;opacity:1;}
  .card,.inner{transition:padding .4s cubic-bezier(.4,0,.2,1);}
  .body{transition:gap .4s cubic-bezier(.4,0,.2,1);}
  .ttl .t2,.ihead,.stats{overflow:hidden;transition:max-height .4s cubic-bezier(.4,0,.2,1),opacity .3s ease,margin .4s cubic-bezier(.4,0,.2,1);}
  .ringbox{max-width:150px;overflow:visible;transition:max-width .45s cubic-bezier(.4,0,.2,1),opacity .35s ease;}
  .ttl .t2{max-height:20px;}
  .ihead{max-height:34px;}
  .stats{max-height:90px;}
  .compact .mascot{display:none;}
  .compact .ttl .t2{max-height:0;opacity:0;}
  .compact .ihead{max-height:0;opacity:0;margin-bottom:0;}
  .compact .stats{max-height:0;opacity:0;margin-top:0;}
  .compact .ttl{display:none;}
  .compact .ringbox{max-width:0;opacity:0;overflow:hidden;}
  .compact .body{gap:0;}
  .compact .card{padding:12px;}
  .compact .inner{padding:11px;}
  .compact .head{margin-bottom:10px;}
  .compact .meter{margin-bottom:9px;}
  @keyframes flash{0%{opacity:0;transform:translateY(5px);}12%{opacity:1;transform:translateY(0);}70%{opacity:1;}100%{opacity:0;transform:translateY(-3px);}}
  @keyframes roll{0%{opacity:.25;transform:translateY(6px);}100%{opacity:1;transform:translateY(0);}}
  @keyframes pulse{0%,100%{opacity:.4;}50%{opacity:1;}}
  body.wrapcols .body{flex-wrap:wrap;}
  body.wrapcols .ringbox{margin:6px auto 0;}
  @media (max-width:270px){.stat .slabel{display:none;}.stat .sval{font-size:11px;text-overflow:clip;}.stat .sdelta{display:none;}.stat{padding:8px 6px;}.munit{display:none;}}
  /* --- tab switcher + agent roster (tide pool) --- */
  .tabs{display:flex;gap:3px;margin-bottom:11px;background:var(--inner);border:1px solid var(--iborder);border-radius:10px;padding:3px;}
  .tab{flex:1;background:transparent;border:0;color:var(--muted);font-size:12px;font-weight:600;padding:6px 8px;border-radius:7px;cursor:pointer;font-family:inherit;transition:color .15s ease,background .15s ease;}
  .tab.active{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18);}
  .tab:hover:not(.active){color:var(--text);}
  .inner.agents{padding:11px 11px 14px;}
  .ws-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
  .ws-head .it{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--text);}
  .ws-head .it svg{width:15px;height:15px;color:#e8895a;}
  .ws-live{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:600;color:#4fae74;}
  .ws-dot{width:6px;height:6px;border-radius:50%;background:#4fae74;box-shadow:0 0 4px #4fae74;animation:pulse 2.2s ease-in-out infinite;}
  .ws-room{position:relative;width:100%;aspect-ratio:1/1;border-radius:11px;overflow:hidden;background:#0c0c0d;border:1px solid var(--iborder);}
  body.vscode-light .ws-room{background:#ececef;}
  .ws-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;}
  .ws-stage{position:absolute;inset:0;overflow:hidden;}
  .walker{position:absolute;transform:translate(-50%,-100%);transition:left 1.6s ease-in-out,top 1.6s ease-in-out,opacity .45s ease;pointer-events:none;}
  .wk-sprite{image-rendering:pixelated;}
  .wk-tag{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:-16px;font-size:8px;font-weight:700;color:#fff;background:rgba(0,0,0,.62);padding:1px 5px;border-radius:6px;white-space:nowrap;letter-spacing:.2px;}
  .cr-sprite{image-rendering:pixelated;cursor:pointer;}
  .pool{display:flex;flex-wrap:wrap;gap:8px 2px;justify-content:center;padding:8px 2px 2px;}
  .cr-card{position:relative;display:flex;flex-direction:column;align-items:center;width:94px;padding:5px 2px 8px;border-radius:10px;cursor:pointer;transition:opacity .3s ease,box-shadow .18s ease,background .18s ease;}
  .cr-card:hover:not(.selected){background:rgba(127,127,127,.09);}
  .cr-card:hover .cr-sprite{filter:brightness(1.1);}
  .cr-card.selected{background:rgba(232,137,90,.13);box-shadow:0 0 0 1.5px #e8895a;}
  .cr-gear{position:absolute;top:2px;left:3px;display:none;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;background:rgba(232,137,90,.92);color:#fff;cursor:pointer;line-height:0;box-shadow:0 1px 4px rgba(0,0,0,.3);z-index:5;}
  .cr-card.selected .cr-gear{display:inline-flex;}
  .cr-gear:hover{background:#e8895a;}
  .cr-gear svg{width:12px;height:12px;}
  /* agent settings modal */
  .sheet-row input[type=text]{background:var(--track);color:var(--text);border:1px solid var(--iborder);border-radius:7px;padding:5px 8px;font-size:12px;font-family:inherit;width:130px;}
  .am-appearance{display:block;}
  .am-tabs{display:flex;gap:4px;margin-bottom:10px;}
  .am-tab{flex:1;background:var(--track);border:0;color:var(--muted);font-size:11px;font-weight:600;padding:6px 4px;border-radius:7px;cursor:pointer;font-family:inherit;white-space:nowrap;}
  .am-tab.on{background:#e8895a;color:#fff;}
  .am-tab:hover:not(.on){color:var(--text);}
  .am-row{display:flex;flex-wrap:wrap;gap:6px;}
  .am-npc{width:50px;height:50px;border-radius:9px;border:2px solid transparent;background:var(--track);display:flex;align-items:flex-end;justify-content:center;overflow:hidden;cursor:pointer;}
  .am-npc:hover{border-color:var(--muted);}
  .am-npc.on{border-color:#e8895a;background:rgba(232,137,90,.18);}
  .am-npc .cr-sprite{image-rendering:pixelated;}
  .cr-modelsel.m-opus{background:rgba(232,137,90,.95);}
  .cr-modelsel.m-sonnet{background:rgba(90,154,232,.95);}
  .cr-modelsel.m-haiku{background:rgba(95,184,122,.95);}
  .cr-modelsel.m-other{background:rgba(127,127,127,.8);}
  .cr-badge{position:absolute;top:-3px;left:50%;transform:translateX(-50%) translateY(-4px);background:#e5484d;color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:8px;white-space:nowrap;opacity:0;transition:opacity .2s ease,transform .2s ease;pointer-events:none;box-shadow:0 2px 7px rgba(0,0,0,.3);z-index:4;letter-spacing:.2px;}
  .cr-card.active .cr-badge,.cr-card.done .cr-badge{opacity:1;transform:translateX(-50%) translateY(0);}
  .cr-card.done .cr-badge{background:#4fae74;}
  .cr-card.active .cr-sprite{filter:drop-shadow(0 0 5px rgba(229,72,77,.55));}
  /* when any agent is active, dim the resting ones so the caller stands out */
  .pool.has-active .cr-card:not(.active):not(.done){opacity:.42;}
  .cr-body{display:flex;align-items:flex-end;justify-content:center;height:52px;overflow:hidden;line-height:0;}
  .cr-body svg{width:100%;height:100%;overflow:visible;display:block;}
  .cr-shadow{height:6px;border-radius:50%;background:rgba(0,0,0,.24);margin-top:-1px;filter:blur(1px);animation:crshadow 2.6s ease-in-out infinite;will-change:transform;}
  body.vscode-light .cr-shadow{background:rgba(0,0,0,.14);}
  .cr-name{font-size:10.5px;font-weight:600;color:var(--text);margin-top:3px;text-align:center;line-height:1.2;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .cr-role{font-size:9.5px;font-weight:600;color:#e8895a;margin-top:2px;text-align:center;line-height:1.2;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .rost-head{cursor:pointer;user-select:none;}
  .rost-head:hover .it{color:#e8895a;}
  .rost-chev{display:inline-flex;vertical-align:middle;transition:transform .3s ease;margin-left:3px;color:var(--muted);}
  .rost-chev svg{width:12px;height:12px;}
  .rost-head.collapsed .rost-chev{transform:rotate(180deg);}
  .pool-empty{color:var(--muted);font-size:11.5px;text-align:center;padding:26px 12px;line-height:1.55;}
  @keyframes crbob{0%,100%{transform:translateY(0);}50%{transform:translateY(-5px);}}
  @keyframes crshadow{0%,100%{transform:scaleX(1);opacity:.55;}50%{transform:scaleX(.8);opacity:.32;}}
`;

const IC = {
  bars: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="12" width="4" height="8" rx="1.2"/><rect x="10" y="6" width="4" height="14" rx="1.2"/><rect x="17" y="3" width="4" height="17" rx="1.2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 1.8"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="#e8895a"><path d="M12 21s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#e5484d" stroke="#e5484d" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>'
};

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
    const roomMinecraftLightUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'room-minecraft-light.png'));
    const spriteUri = (n) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, n)).toString();
    // per-sprite metadata: cell size, columns, which rows/frames are front-facing idle vs walk,
    // and a category. Each pack has its own grid, so these are hand-verified per sheet.
    // ch = character height / cell (size normalize); by = bottom gap / cell (feet alignment). measured per sheet.
    const D = (o) => Object.assign({ cell: 64, cols: 6, idleRow: 0, idleCol: 0, idleFrames: 6, walkRow: 1, walkFrames: 6, ch: 0.7, by: 0.2, cat: 'human' }, o);
    // Kenmi front-facing character sheets: row0 = front idle/walk. Cell size & frames verified per sheet.
    const FRONT = { idleRow: 0, idleCol: 0, idleFrames: 1, walkRow: 0 };
    const npcs = {};
    // --- human ---
    [['bartender', 384, 448, 0.28], ['bartender2', 384, 448, 0.34], ['chef', 384, 448, 0.43], ['farmer', 384, 832, 0.34], ['farmer2', 384, 832, 0.34], ['fisherman', 576, 832, 0.29], ['lumberjack', 384, 640, 0.31], ['miner', 384, 640, 0.31]]
      .forEach(([k, w, h, ch]) => { npcs[k] = D({ u: spriteUri('npc-' + k + '.png'), w, h, ch, by: 0.36 }); }); // NPCs: row0 idle / row1 walk
    npcs.witch = D(Object.assign({ u: spriteUri('hum-witch.png'), w: 192, h: 288, cell: 32, cols: 6, walkFrames: 6, ch: 0.81, by: 0.09 }, FRONT));
    npcs.angel1 = D(Object.assign({ u: spriteUri('hum-angel1.png'), w: 512, h: 832, cell: 64, cols: 8, walkFrames: 6, ch: 0.43, by: 0.36 }, FRONT));
    npcs.angel2 = D(Object.assign({ u: spriteUri('hum-angel2.png'), w: 512, h: 832, cell: 64, cols: 8, walkFrames: 6, ch: 0.42, by: 0.36 }, FRONT));
    [['archer', 0.43, 0.15], ['spearman', 0.50, 0.33], ['swordman', 0.47, 0.15], ['templar', 0.45, 0.33]].forEach(([k, ch, by]) => { npcs['knight_' + k] = D(Object.assign({ u: spriteUri('hum-knight-' + k + '.png'), w: 288, h: 624, cell: 48, cols: 6, walkFrames: 6, ch, by }, FRONT)); });
    // 32px front-facing humanoids (Santa, Desert NPCs, Player) — verified 32px, row0 front
    [['santa', 'hum-santa', 192, 320, 6, 0.72, 0.22], ['santa_helper', 'hum-santa-helper', 256, 320, 8, 0.66, 0.25], ['desert1', 'hum-desert1', 192, 320, 6, 0.66, 0.22], ['desert2', 'hum-desert2', 192, 320, 6, 0.66, 0.22], ['desert3', 'hum-desert3', 192, 320, 6, 0.66, 0.22], ['desert4', 'hum-desert4', 192, 320, 6, 0.66, 0.22], ['player', 'hum-player', 192, 320, 6, 0.62, 0.22], ['pharaoh', 'hum-pharaoh', 256, 320, 8, 0.66, 0.22]]
      .forEach(([k, file, w, h, cols, ch, by]) => { npcs[k] = D(Object.assign({ u: spriteUri(file + '.png'), w, h, cell: 32, cols, walkFrames: 6, ch, by }, FRONT)); });
    // --- monster ---
    npcs.slime = D({ u: spriteUri('mon-slime.png'), w: 512, h: 192, cell: 64, cols: 8, idleFrames: 4, walkRow: 1, walkFrames: 8, ch: 0.28, by: 0.34, cat: 'monster' });
    npcs.skeleton = D(Object.assign({ u: spriteUri('mon-skeleton.png'), w: 192, h: 320, cell: 32, cols: 6, walkFrames: 6, ch: 0.62, by: 0.22, cat: 'monster' }, FRONT));
    npcs.goblin_thief = D(Object.assign({ u: spriteUri('mon-goblin-thief.png'), w: 192, h: 416, cell: 32, cols: 6, walkFrames: 4, ch: 0.50, by: 0.25, cat: 'monster' }, FRONT));
    npcs.goblin_maceman = D(Object.assign({ u: spriteUri('mon-goblin-maceman.png'), w: 192, h: 416, cell: 32, cols: 6, walkFrames: 4, ch: 0.53, by: 0.25, cat: 'monster' }, FRONT));
    npcs.goblin_archer = D(Object.assign({ u: spriteUri('mon-goblin-archer.png'), w: 288, h: 624, cell: 48, cols: 6, walkFrames: 4, ch: 0.33, by: 0.17, cat: 'monster' }, FRONT));
    npcs.goblin_spearman = D(Object.assign({ u: spriteUri('mon-goblin-spearman.png'), w: 288, h: 624, cell: 48, cols: 6, walkFrames: 4, ch: 0.43, by: 0.29, cat: 'monster' }, FRONT));
    // 32px front-facing undead (skeleton variants, mummy)
    [['skel_bowman', 'mon-skel-bowman', 192, 416, 6, 0.62, 0.22], ['skel_mage', 'mon-skel-mage', 256, 416, 8, 0.69, 0.22], ['skel_swordman', 'mon-skel-swordman', 256, 512, 8, 0.66, 0.22], ['mummy', 'mon-mummy', 192, 416, 6, 0.66, 0.22]]
      .forEach(([k, file, w, h, cols, ch, by]) => { npcs[k] = D(Object.assign({ u: spriteUri(file + '.png'), w, h, cell: 32, cols, walkFrames: 6, ch, by, cat: 'monster' }, FRONT)); });
    // big slimes (directionless: idle row0 / move row1), 5 colours
    ['blue', 'green', 'pink', 'red', 'yellow'].forEach((c) => { npcs['slime_big_' + c] = D({ u: spriteUri('mon-slime-big-' + c + '.png'), w: 512, h: 256, cell: 64, cols: 8, idleFrames: 4, walkRow: 1, walkFrames: 8, ch: 0.28, by: 0.34, cat: 'monster' }); });
    // frog folded into monsters for now (animal category held back)
    npcs.frog = D({ u: spriteUri('ani-frog.png'), w: 320, h: 128, cell: 32, cols: 10, idleFrames: 2, walkRow: 1, walkFrames: 8, ch: 0.31, by: 0.34, cat: 'monster' });
    // attach measured character bounding boxes ([x,y,w,h] in cell px) so the webview can crop to the character
    try {
      const bbox = JSON.parse(fs.readFileSync(path.join(this.extensionUri.fsPath, 'sprite-bbox.json'), 'utf8'));
      Object.keys(npcs).forEach((k) => { const fn = npcs[k].u.split('/').pop().split('?')[0]; if (bbox[fn]) npcs[k].bb = bbox[fn]; });
    } catch (e) { /* no bbox file → renderer falls back to full cell */ }
    const assetsJson = JSON.stringify({ rooms: { dark: roomMinecraftUri.toString(), light: roomMinecraftLightUri.toString() }, npcs })
      .replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
    const csp = webview.cspSource;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src ${csp} 'unsafe-inline'; script-src ${csp};">
<style>${CSS}</style></head><body><div class="wrap"><div class="card">
  <div id="authbar" style="display:none;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;margin-bottom:9px;border-radius:8px;background:#e8895a;color:#fff;font-size:11.5px;font-weight:600;line-height:1.35">
    <span>Sign in for <b>live</b> session &amp; weekly %</span>
    <button id="signinBtn" style="background:#fff;color:#c25a34;border:0;border-radius:6px;padding:4px 12px;font-weight:700;cursor:pointer;font-size:11.5px;white-space:nowrap">Sign In</button>
  </div>
  <div class="head">
    <div class="brand">
      <img class="logo" src="${logoUri}" alt=""/>
      <div class="ttl">
        <div class="t1">Claude Usage</div>
        <div class="t2">for Claude Code</div>
      </div>
    </div>
    <div class="hactions">
      <div class="mascot">
        <img src="${crabUri}" alt="claude"/>
        <div class="bubble" id="bubble">${IC.heart}</div>
      </div>
      <img class="sparkle-hd" src="${sparkleUri}" alt=""/>
      <button class="toggle" id="toggle" title="Compact / expand">${IC.chevron}</button>
    </div>
  </div>
  <div class="tabs">
    <button class="tab active" id="tabUsage" data-tab="usage">Usage</button>
    <button class="tab" id="tabAgents" data-tab="agents">Agents</button>
  </div>
  <div class="inner" id="panelUsage">
    <div class="warnbar" id="warnbar" hidden></div>
    <div class="ihead">
      <div class="it">${IC.bars} Usage summary</div>
      <div class="upd">Updated <span id="upd">now</span> <span class="d"></span></div>
    </div>
    <div class="body">
      <div class="meters">
        <div class="meter" id="pm_session">
          <div class="mtop"><span class="mlabel">Session <span class="munit">(5h)</span></span><span class="mgrp"><span class="delta" id="s_delta"></span><span class="mval" id="s_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="s_fill"></div></div>
          <div class="msub" id="s_sub"></div>
        </div>
        <div class="meter" id="pm_weekly">
          <div class="mtop"><span class="mlabel">Weekly <span class="munit">(7d)</span></span><span class="mgrp"><span class="delta" id="w_delta"></span><span class="mval" id="w_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="w_fill"></div></div>
          <div class="msub" id="w_sub"></div>
        </div>
        <div class="meter" id="pm_context">
          <div class="mtop"><span class="mlabel">Context</span><span class="mgrp"><span class="delta" id="c_delta"></span><span class="mval" id="c_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="c_fill"></div></div>
          <div class="msub" id="c_sub">/ 200K</div>
        </div>
      </div>
      <div class="ringbox">
        <div class="ringwrap" id="pm_ring">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle class="rtrack" cx="44" cy="44" r="33" fill="none" stroke-width="6"/>
            <circle id="ringArc" cx="44" cy="44" r="33" fill="none" stroke="#e8895a" stroke-width="6"
              stroke-linecap="round" stroke-dasharray="207.3" stroke-dashoffset="207.3"/>
          </svg>
          <div class="rcenter">
            <div class="rpct"><span id="ringPct">–</span><span>%</span></div>
            <div class="rtext">used</div>
          </div>
        </div>
        <div class="mascot-wrap">
          <div class="mwarn" id="mwarn" hidden>${IC.warn}</div>
          <img id="mascot" class="sparkle" src="${mascotIdleUri}" data-idle="${mascotIdleUri}" data-working="${mascotWorkingUri}" data-despair="${mascotDespairUri}" data-stunned="${mascotStunnedUri}" alt=""/>
        </div>
      </div>
    </div>
    <div class="stats" id="pm_tiles">
      <div class="stat"><div class="stop">${IC.clock}</div><div class="srow"><span class="sval" id="st_time">–</span></div><div class="slabel">Active time</div></div>
      <div class="stat" id="st_tok_tile"><div class="stop">${IC.bolt}</div><div class="srow"><span class="sval" id="st_tok">–</span><span class="sdelta" id="tok_delta"></span></div><div class="slabel">Tokens</div></div>
      <div class="stat"><div class="stop">${IC.doc}</div><div class="srow"><span class="sval" id="st_req">–</span><span class="sdelta" id="req_delta"></span></div><div class="slabel">Requests</div></div>
    </div>
  </div>
  <div class="inner agents" id="panelAgents" style="display:none">
    <div class="ws-head">
      <div class="it">${IC.bars} Agent Workspace</div>
      <div class="ws-live"><span class="ws-dot"></span>Live</div>
    </div>
    <div class="ws-room" id="wsRoom">
      <img class="ws-bg" id="wsBg" src="${roomMinecraftUri}" alt="Minecraft workspace"/>
      <div class="ws-stage" id="wsStage"></div>
    </div>
    <div class="ihead rost-head" id="rosterHead" style="margin-top:13px">
      <div class="it">${IC.bars} Agent roster</div>
      <div class="upd"><span id="agCount">0</span> agents <span class="rost-chev" id="rostChev">${IC.chevron}</span></div>
    </div>
    <div class="pool" id="pool"></div>
  </div>
</div></div>
  <div class="sheet" id="settingsSheet" hidden>
    <div class="sheet-card">
      <div class="sheet-head"><span>Settings</span><button class="sheet-x" id="settingsClose" title="Close">${IC.chevron}</button></div>
      <div class="sheet-row">
        <label for="cfgStatusBar">Status bar</label>
        <select id="cfgStatusBar">
          <option value="session+weekly">Session + Weekly</option>
          <option value="session">Session only</option>
          <option value="weekly">Weekly only</option>
          <option value="off">Hidden</option>
        </select>
      </div>
      <div class="sheet-sec">Show in panel</div>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="session" checked> Session (5h)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="weekly" checked> Weekly (7d)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="context" checked> Context</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="ring" checked> Usage ring</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="tiles" checked> Stat tiles</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="mascot" checked> Mascot</label>
      <div class="sheet-sec">Alerts</div>
      <label class="sheet-check"><input type="checkbox" id="cfgBurn" checked> Burn-rate warning</label>
    </div>
  </div>
  <div class="sheet" id="agentModal" hidden>
    <div class="sheet-card">
      <div class="sheet-head"><span id="amTitle">에이전트 설정</span><button class="sheet-x" id="amClose" title="닫기">${IC.chevron}</button></div>
      <div class="sheet-row"><label for="amNick">별명</label><input id="amNick" type="text" maxlength="24" placeholder="이름"></div>
      <div class="sheet-row"><label for="amRole">직업</label><input id="amRole" type="text" maxlength="24" placeholder="역할"></div>
      <div class="sheet-row"><label for="amModel">모델</label>
        <select id="amModel"><option value="opus">opus</option><option value="sonnet">sonnet</option><option value="haiku">haiku</option><option value="inherit">inherit</option></select>
      </div>
      <div class="sheet-sec">외형</div>
      <div class="am-appearance" id="amAppear"></div>
    </div>
  </div>
<div id="cuc-assets" data-json='${assetsJson}' style="display:none"></div>
<script src="${scriptUri}"></script></body></html>`;
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
