const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const RATE_FILE = path.join(CLAUDE_DIR, 'usage-bar.json');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

let statusItem;
let provider;
let timer;
let usageTimer;
let usageLoaded = false;
let usageFails = 0;
let lastFetch = 0;
let log; // debug OutputChannel — every fetch logs its status/values here
let lastTapAt = 0; // last time we read Claude Code's own usage response via diagnostics_channel
const pendingUsageRequests = new WeakSet(); // in-flight Claude Code requests to /api/oauth/usage
const pendingMessageRequests = new WeakSet(); // in-flight Claude Code /v1/messages turns
let turnRefreshTimer; // debounced refresh fired after a turn completes
let extContext; // for persisting the last-good usage value across reloads
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

// From transcript JSONL: today's tokens + latest message + today's request count
function readTokens() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  let last = null;
  let count = 0;

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
    for (const line of content.split('\n')) {
      if (!line) continue;
      let o;
      try { o = JSON.parse(line); } catch (e) { continue; }
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
      if (!last || t > last.t) {
        last = {
          t,
          input: u.input_tokens || 0,
          output: u.output_tokens || 0,
          cache_creation: u.cache_creation_input_tokens || 0,
          cache_read: u.cache_read_input_tokens || 0
        };
      }
    }
  }
  return { today, last, count };
}

// Live session/weekly limits from Claude's own usage endpoint (same source as the built-in dialog).
// The stored OAuth token is sent ONLY to api.anthropic.com and nowhere else.
function fetchUsage() {
  return new Promise((resolve) => {
    // Fallback path only (used when the tap has not seen a Claude Code usage response
    // in a while). Reads Claude Code's token; shares its budget, so it can 429 during
    // active use — that is fine, the tap covers active use and we keep the last value.
    let token;
    try {
      const cred = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, '.credentials.json'), 'utf8'));
      token = (cred.claudeAiOauth || {}).accessToken;
    } catch (e) { resolve({ status: 0, data: null }); return; }
    if (!token) { resolve({ status: 0, data: null }); return; }
    // Match Claude Code's own request to this endpoint exactly.
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/api/oauth/usage', method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'anthropic-beta': 'oauth-2025-04-20'
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
  try { if (extContext && usageCache) extContext.globalState.update('usageCacheV1', { at: Date.now(), value: usageCache }); } catch (e) { /* ignore */ }
}

// After a Claude Code turn finishes, the usage token is briefly free, so a direct
// fetch usually succeeds. Debounced so a turn with many tool-use round trips fires once.
function scheduleTurnRefresh() {
  clearTimeout(turnRefreshTimer);
  turnRefreshTimer = setTimeout(() => {
    if (Date.now() - lastTapAt < 8000) return; // a tap already refreshed us moments ago
    if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] turn finished — pulling fresh usage');
    refreshUsage();
  }, 2500);
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
        scheduleTurnRefresh(); // a Claude Code turn finished — pull fresh usage right after
      }
    } catch (e) { /* never break */ }
  };
  try {
    dc.subscribe('http.client.request.start', reqHandler);
    dc.subscribe('http.client.response.finish', resHandler);
    if (log) log.appendLine('[' + new Date().toLocaleTimeString() + '] tap active — reading Claude Code\'s own usage responses (no own calls while it is active)');
    context.subscriptions.push({ dispose: () => {
      try { dc.unsubscribe('http.client.request.start', reqHandler); dc.unsubscribe('http.client.response.finish', resHandler); } catch (e) {}
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
  const r = await fetchUsage();
  lastFetch = Date.now();
  const ts = new Date().toLocaleTimeString();
  if (r.status !== 200 || !r.data) {
    if (log) log.appendLine('[' + ts + '] fetch -> ' + (r.status === 429
      ? '429 (Claude Code busy) — retrying in 2 min; the tap covers active use, last value kept'
      : (r.status ? 'HTTP ' + r.status : 'unreachable') + ' — keeping last values'));
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
  const tokens = readTokens();
  const cp = contextPct(tokens.last);
  return {
    fh: usageCache ? usageCache.five_hour : null,
    sd: usageCache ? usageCache.seven_day : null,
    ctx: cp,
    usageLoading: !usageLoaded,
    today: tokens.today,
    last: tokens.last,
    count: tokens.count,
    refreshedAt: Date.now()
  };
}

function renderStatusBar(data) {
  const segs = [];
  const tip = [];
  let worst = 0;
  if (data.fh && data.fh.used_percentage != null) {
    const p = Math.round(data.fh.used_percentage);
    worst = Math.max(worst, p);
    segs.push(`5h ${p}%`);
    const cd = fmtCountdown(data.fh.resets_at);
    tip.push(`Session (5h): ${p}%${cd ? ' · resets ' + cd : ''}`);
  }
  if (data.sd && data.sd.used_percentage != null) {
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
  .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;}
  .head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:13px;}
  .brand{display:flex;align-items:center;gap:10px;min-width:0;}
  .logo{width:28px;height:28px;flex:none;}
  .ttl{min-width:0;}
  .ttl .t1{font-size:16px;font-weight:700;line-height:1.1;color:var(--text);}
  .ttl .t2{color:var(--muted);font-size:11px;margin-top:2px;}
  .mascot{position:relative;flex:none;}
  .mascot img{width:50px;height:auto;image-rendering:pixelated;display:block;}
  .bubble{position:absolute;top:-4px;right:-8px;background:var(--bubble);border:1px solid var(--bubblebd);
    border-radius:8px;padding:3px 4px;line-height:0;box-shadow:0 2px 5px rgba(0,0,0,.2);}
  .bubble svg{width:12px;height:12px;display:block;}
  .inner{background:var(--inner);border:1px solid var(--iborder);border-radius:13px;padding:13px;}
  .ihead{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-right:5px;}
  .ihead .it{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--text);}
  .ihead .it svg{width:15px;height:15px;color:#e8895a;}
  .upd{color:var(--muted);font-size:10.5px;display:flex;align-items:center;gap:5px;}
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
  .sparkle{width:30px;height:30px;margin-top:6px;}
  .stats{display:flex;gap:1px;margin-top:13px;background:var(--iborder);border-radius:11px;overflow:hidden;}
  .stat{flex:1;background:var(--inner);padding:10px 8px;min-width:0;position:relative;}
  .stat .stop{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
  .stat svg{width:14px;height:14px;color:#e8895a;flex:none;}
  .stat .sval{font-size:14px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .stat .slabel{color:var(--muted);font-size:10px;white-space:nowrap;}
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
  .sparkle-hd{width:0;opacity:0;flex:none;object-fit:contain;transition:width .4s cubic-bezier(.34,1.56,.64,1),opacity .35s ease;}
  .compact .sparkle-hd{width:32px;opacity:1;}
  .card,.inner{transition:padding .4s cubic-bezier(.4,0,.2,1);}
  .body{transition:gap .4s cubic-bezier(.4,0,.2,1);}
  .ttl .t2,.ihead,.stats{overflow:hidden;transition:max-height .4s cubic-bezier(.4,0,.2,1),opacity .3s ease,margin .4s cubic-bezier(.4,0,.2,1);}
  .ringbox{max-width:150px;overflow:hidden;transition:max-width .45s cubic-bezier(.4,0,.2,1),opacity .35s ease;}
  .ttl .t2{max-height:20px;}
  .ihead{max-height:34px;}
  .stats{max-height:90px;}
  .compact .mascot{display:none;}
  .compact .ttl .t2{max-height:0;opacity:0;}
  .compact .ihead{max-height:0;opacity:0;margin-bottom:0;}
  .compact .stats{max-height:0;opacity:0;margin-top:0;}
  .compact .ringbox{max-width:0;opacity:0;}
  .compact .body{gap:0;}
  .compact .card{padding:12px;}
  .compact .inner{padding:11px;}
  .compact .head{margin-bottom:10px;}
  .compact .meter{margin-bottom:9px;}
  @keyframes flash{0%{opacity:0;transform:translateY(5px);}12%{opacity:1;transform:translateY(0);}70%{opacity:1;}100%{opacity:0;transform:translateY(-3px);}}
  @keyframes roll{0%{opacity:.25;transform:translateY(6px);}100%{opacity:1;transform:translateY(0);}}
  @keyframes pulse{0%,100%{opacity:.4;}50%{opacity:1;}}
  @media (max-width:340px){.body{flex-wrap:wrap;}.ringbox{margin:6px auto 0;}}
`;

const IC = {
  bars: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="12" width="4" height="8" rx="1.2"/><rect x="10" y="6" width="4" height="14" rx="1.2"/><rect x="17" y="3" width="4" height="17" rx="1.2"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5l3 1.8"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="#e8895a"><path d="M12 21s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>'
};

class UsageViewProvider {
  constructor(extensionUri) { this.extensionUri = extensionUri; this.view = null; }
  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] };
    view.webview.html = this.html(view.webview);
    view.webview.onDidReceiveMessage((m) => { if (m && m.type === 'ready') push(); });
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
    const csp = webview.cspSource;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src ${csp} 'unsafe-inline'; script-src ${csp};">
<style>${CSS}</style></head><body><div class="wrap"><div class="card">
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
        <div class="bubble">${IC.heart}</div>
      </div>
      <img class="sparkle-hd" src="${sparkleUri}" alt=""/>
      <button class="toggle" id="toggle" title="Compact / expand">${IC.chevron}</button>
    </div>
  </div>
  <div class="inner">
    <div class="ihead">
      <div class="it">${IC.bars} Usage summary</div>
      <div class="upd">Updated <span id="upd">now</span> <span class="d"></span></div>
    </div>
    <div class="body">
      <div class="meters">
        <div class="meter">
          <div class="mtop"><span class="mlabel">Session (5h)</span><span class="mgrp"><span class="delta" id="s_delta"></span><span class="mval" id="s_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="s_fill"></div></div>
          <div class="msub" id="s_sub"></div>
        </div>
        <div class="meter">
          <div class="mtop"><span class="mlabel">Weekly (7d)</span><span class="mgrp"><span class="delta" id="w_delta"></span><span class="mval" id="w_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="w_fill"></div></div>
          <div class="msub" id="w_sub"></div>
        </div>
        <div class="meter">
          <div class="mtop"><span class="mlabel">Context</span><span class="mgrp"><span class="delta" id="c_delta"></span><span class="mval" id="c_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="c_fill"></div></div>
          <div class="msub" id="c_sub">/ 200K</div>
        </div>
      </div>
      <div class="ringbox">
        <div class="ringwrap">
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
        <img class="sparkle" src="${sparkleUri}" alt=""/>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="stop">${IC.clock}</div><div class="srow"><span class="sval" id="st_time">–</span></div><div class="slabel">Active time</div></div>
      <div class="stat" id="st_tok_tile"><div class="stop">${IC.bolt}</div><div class="srow"><span class="sval" id="st_tok">–</span><span class="sdelta" id="tok_delta"></span></div><div class="slabel">Tokens</div></div>
      <div class="stat"><div class="stop">${IC.doc}</div><div class="srow"><span class="sval" id="st_req">–</span><span class="sdelta" id="req_delta"></span></div><div class="slabel">Requests</div></div>
    </div>
  </div>
</div></div>
<script src="${scriptUri}"></script></body></html>`;
  }
}

function push() {
  const data = collect();
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

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.name = 'Claude Usage';
  statusItem.command = 'claudeUsage.view.focus';
  context.subscriptions.push(statusItem);

  provider = new UsageViewProvider(context.extensionUri);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('claudeUsage.view', provider));

  push();

  try {
    watchers.push(fs.watch(CLAUDE_DIR, (ev, fn) => { if (!fn || fn === 'usage-bar.json') scheduleRefresh(); }));
  } catch (e) { /* covered by timer */ }
  try {
    watchers.push(fs.watch(PROJECTS_DIR, { recursive: true }, () => scheduleRefresh()));
  } catch (e) { /* covered by timer */ }
  context.subscriptions.push({ dispose: () => watchers.forEach((w) => { try { w.close(); } catch (e) {} }) });

  timer = setInterval(push, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  // live session/weekly limits from the usage endpoint.
  // Poll gently (every 5 min once loaded) and back off on failure so we never hammer the
  // endpoint or trip its rate limit. Session/weekly windows change slowly, so 5 min is plenty.
  const usageLoop = () => {
    // Claude Code only calls /api/oauth/usage occasionally, so the tap alone can sit
    // still for minutes. Fill the gaps with our own gentle fetch. If a tapped value
    // arrived in the last ~2.5 min we're already fresh; otherwise fetch to catch a
    // quiet moment. During active streaming our call may 429 (harmless — last value is
    // kept and the tap covers it), so retry sooner then.
    if (Date.now() - lastTapAt < 150000) {
      usageTimer = setTimeout(usageLoop, 75000);
      return;
    }
    refreshUsage().then((status) => {
      const next = status === 200 ? 150000 : (usageLoaded ? 75000 : 30000);
      usageTimer = setTimeout(usageLoop, next);
    }, () => {
      usageTimer = setTimeout(usageLoop, usageLoaded ? 75000 : 30000);
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
}

function deactivate() {}

module.exports = { activate, deactivate };
