// This PC's last seven days, read from local transcripts, and an estimate of how much of the
// account's weekly limit this PC accounts for.
//
// Why this exists: several people sharing one account all draw on one weekly limit, and the usage
// endpoint only reports the account total. Each PC can see its own transcripts and nothing else,
// so each PC answers for itself: what it used, on what, and roughly what share of the week.
//
// Reading: up to a gigabyte of transcripts over seven days, so the first pass is asynchronous and
// chunked (the extension host must not stall), and after that only appended bytes are read, the
// same rule extension.js follows for "today".
//
// The share estimate: the account's weekly % (P) is spent by every PC. Between two readings of P,
// dP = rate x (this PC's weighted use + everyone else's), so dP / (this PC's use) is never below the
// true rate, and it equals it when nobody else was busy. A low quantile of those ratios over many
// intervals is therefore an upper estimate of the rate, and (this PC's use this week) x rate an
// upper estimate of this PC's share. It starts empty and improves as readings arrive.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const U = require('./usage');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const KEEP_MS = 8 * DAY;          // a weekly window starts at most 7 days back; one more day of margin
const CHUNK = 8 * 1024 * 1024;    // read size per await; keeps each slice of work short
const MIN_DP = 3;                 // percent points between two readings before a ratio is trusted
const MIN_RATIOS = 3;
const MAX_SAMPLES = 800;

// Percent of the weekly limit per API-equivalent dollar, before this PC has measured its own.
// Max 20x: 2026-11-12 on a one-person account used from two PCs, both counted over the same weekly
// window: $212.17 + $117.32 = $329.49 of use = 12% (so about $27.5 per point; the 12 is rounded, so
// 11.5..12.5). The 2026-11-11 figure ($140 = 7%) counted one of the two PCs only and came out high.
// The other tiers scale by their limit relative to Max 20x. Rough on purpose, and labelled as such
// on screen; a measured rate replaces it as soon as one exists
const REFERENCE_RATE = { max_20x: 0.0364, max_5x: 0.1456, pro: 0.728 };
function tierKey(tier) {
  const t = String(tier || '').toLowerCase();
  if (/20x/.test(t)) return 'max_20x';
  if (/5x/.test(t)) return 'max_5x';
  if (/pro/.test(t)) return 'pro';
  if (/max/.test(t)) return 'max_20x';
  return '';
}

// $ per million tokens [input, output, cache read]; cache write is 1.25 x input.
// Used as relative weights only: the weekly limit tracks compute, and a cache read costs a small
// fraction of an input token, so raw token counts would rank a cache-heavy session far too high
const PRICES = [
  [/fable-5-2|mythos-5-2/, 8, 40, 0.2],
  [/fable|mythos/, 10, 50, 1],
  [/opus-5-5/, 4, 20, 0.2],
  [/opus/, 5, 25, 0.5],
  [/sonnet-5-5/, 2, 10, 0.1],
  [/sonnet-5/, 2, 10, 0.2],
  [/sonnet/, 3, 15, 0.3],
  [/haiku-5-5/, 0.1, 0.5, 0.01],
  [/haiku/, 1, 5, 0.1]
];
const DEFAULT_PRICE = [5, 25, 0.5];

function priceOf(model) {
  const m = String(model || '').toLowerCase();
  for (const row of PRICES) if (row[0].test(m)) return [row[1], row[2], row[3]];
  return DEFAULT_PRICE;
}

function costOf(model, v) {
  const p = priceOf(model);
  return (v.input * p[0] + v.cache_creation * p[0] * 1.25 + v.output * p[1] + v.cache_read * p[2]) / 1e6;
}

// Short display name: claude-opus-5-5 -> Opus 5.5
function modelLabel(model) {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i.exec(String(model || ''));
  if (!m) return String(model || 'unknown');
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] + (m[3] && m[3].length < 3 ? '.' + m[3] : '');
}

// --- per-file state ---------------------------------------------------------------
// path -> { size, carry: Buffer, seen: Map, session, kind, project, title, hours: Map(hourStart -> Map(model -> vec)) }
const files = new Map();
let projectsDir = path.join(os.homedir(), '.claude', 'projects');
let scanning = null;
let lastScanAt = 0;

function setProjectsDir(dir) { projectsDir = dir; files.clear(); }

function agentTypeOf(p) {
  try {
    const meta = JSON.parse(fs.readFileSync(p.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    if (meta && meta.agentType) return String(meta.agentType);
  } catch (e) { /* no meta: older layout */ }
  return 'subagent';
}

function newFile(p) {
  const parts = path.relative(projectsDir, p).split(path.sep);
  const isSub = parts.indexOf('subagents') >= 0;
  return {
    size: 0,
    carry: Buffer.alloc(0),
    seen: new Map(),
    session: isSub ? parts[parts.indexOf('subagents') - 1] : path.basename(p, '.jsonl'),
    kind: isSub ? agentTypeOf(p) : 'main',
    project: parts[0] || '',
    title: '',
    hours: new Map()
  };
}

function firstUserText(o) {
  const c = o.message && o.message.content;
  let s = '';
  if (typeof c === 'string') s = c;
  else if (Array.isArray(c)) { for (const b of c) { if (b && b.type === 'text' && b.text) { s = b.text; break; } } }
  s = String(s).trim();
  // Text the harness injects into a user turn is not what the person asked
  if (!s || s[0] === '<' || /^(Caveat:|Base directory for this skill|This session is being continued|\[Request interrupted)/.test(s)) return '';
  return s.replace(/\s+/g, ' ').slice(0, 80);
}

function parseText(c, text, cutoff) {
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line) continue;
    const hasUsage = line.indexOf('"usage"') !== -1;
    const wantTitle = !c.title && c.kind === 'main' && line.indexOf('"type":"user"') !== -1;
    if (!hasUsage && !wantTitle) continue;
    let o;
    try { o = JSON.parse(line); } catch (e) { continue; }
    if (o.cwd && !c.cwdSeen) { c.cwdSeen = true; c.project = String(o.cwd).split(/[\\/]/).filter(Boolean).pop() || c.project; }
    if (wantTitle && o.type === 'user') { const t = firstUserText(o); if (t) c.title = t; }
    if (!hasUsage) continue;
    const u = U.lineUsage(o);
    if (!u) continue;
    const t = Date.parse(o.timestamp);
    if (!(t >= cutoff)) continue;
    const model = (o.message && o.message.model) || 'unknown';
    if (model === '<synthetic>') continue;
    const add = U.zeroTokens();
    const isNew = U.addUsageOnce(add, c.seen, U.usageKey(o), U.usageVec(u));
    const h = t - (t % HOUR);
    let byModel = c.hours.get(h);
    if (!byModel) { byModel = new Map(); c.hours.set(h, byModel); }
    let v = byModel.get(model);
    if (!v) { v = Object.assign(U.zeroTokens(), { req: 0 }); byModel.set(model, v); }
    v.input += add.input; v.output += add.output; v.cache_creation += add.cache_creation; v.cache_read += add.cache_read;
    if (isNew) v.req += 1;
  }
}

const tick = () => new Promise((r) => setImmediate(r));

async function scanFile(p, size, cutoff) {
  let c = files.get(p);
  if (c && size < c.size) c = null; // rewritten or truncated: start over
  if (!c) { c = newFile(p); files.set(p, c); }
  if (size === c.size) return;
  const fh = await fs.promises.open(p, 'r');
  try {
    let pos = c.size;
    while (pos < size) {
      const len = Math.min(CHUNK, size - pos);
      const chunk = Buffer.allocUnsafe(len);
      const { bytesRead } = await fh.read(chunk, 0, len, pos);
      if (!bytesRead) break;
      pos += bytesRead;
      const buf = c.carry.length ? Buffer.concat([c.carry, chunk.subarray(0, bytesRead)]) : chunk.subarray(0, bytesRead);
      // Split on the newline byte, not on decoded text, so a multi-byte character cut by the chunk
      // edge waits whole in the carry instead of being decoded in two halves
      const nl = buf.lastIndexOf(10);
      if (nl < 0) { c.carry = Buffer.from(buf); continue; }
      c.carry = Buffer.from(buf.subarray(nl + 1));
      parseText(c, buf.toString('utf8', 0, nl), cutoff);
      await tick();
    }
    c.size = pos;
  } finally { await fh.close(); }
}

function listFiles(since) {
  const out = [];
  const stack = [projectsDir];
  while (stack.length) {
    const dir = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.name.endsWith('.jsonl')) continue;
      try { const st = fs.statSync(p); if (st.mtimeMs >= since) out.push({ p, size: st.size }); } catch (e2) { /* gone */ }
    }
  }
  return out;
}

// One scan at a time; callers that arrive mid-scan share it
function scan(now) {
  if (scanning) return scanning;
  const t = now || Date.now();
  const cutoff = t - KEEP_MS;
  scanning = (async () => {
    const list = listFiles(cutoff);
    const live = new Set();
    for (const f of list) {
      live.add(f.p);
      try { await scanFile(f.p, f.size, cutoff); } catch (e) { files.delete(f.p); }
    }
    for (const p of files.keys()) if (!live.has(p)) files.delete(p);
    for (const c of files.values()) for (const h of c.hours.keys()) if (h < cutoff - HOUR) c.hours.delete(h);
    lastScanAt = Date.now();
  })().finally(() => { scanning = null; });
  return scanning;
}

// Weighted use (API-equivalent dollars) of this PC since `since`
function costSince(since) {
  let sum = 0;
  for (const c of files.values()) {
    for (const [h, byModel] of c.hours) {
      if (h + HOUR <= since) continue;
      for (const [model, v] of byModel) sum += costOf(model, v);
    }
  }
  return sum;
}

// This PC's use inside one weekly window: what team sharing sends. Per model, so the server copy can
// be re-weighted later without asking every PC again
function windowTotals(resetsAt, now) {
  const since = windowStartOf(resetsAt, now || Date.now());
  const byModel = {};
  let cost = 0, tokens = 0;
  for (const c of files.values()) {
    for (const [h, models] of c.hours) {
      if (h + HOUR <= since) continue;
      for (const [model, v] of models) {
        const k = modelLabel(model);
        const cc = costOf(model, v), tk = U.tokenTotal(v);
        const e = byModel[k] || (byModel[k] = { tokens: 0, cost: 0 });
        e.tokens += tk; e.cost += cc; cost += cc; tokens += tk;
      }
    }
  }
  return { cost, tokens, byModel };
}

// --- share estimate -----------------------------------------------------------------
// samples: [{ t, pct, r (weekly reset, epoch s), cost (this PC's weighted use since the window opened) }]
let samples = [];
let store = null; // { load(): [], save(arr) }

function init(opts) {
  store = opts || null;
  try { samples = (store && store.load && store.load()) || []; } catch (e) { samples = []; }
  if (!Array.isArray(samples)) samples = [];
}

function sameWindow(a, b) { return Math.abs((a.r || 0) - (b.r || 0)) < 3600; }

function estimateRate(list) {
  const ratios = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!sameWindow(a, b) || b.t - a.t > 12 * HOUR) break;
      const dp = b.pct - a.pct;
      if (dp < MIN_DP) continue;
      const dc = b.cost - a.cost;
      if (dc > 0) ratios.push(dp / dc);
      break;
    }
  }
  if (!ratios.length) return { rate: null, n: 0, rough: true };
  ratios.sort((x, y) => x - y);
  // With one or two intervals the smallest ratio is the best bound there is; shown as rough
  return { rate: ratios[Math.floor((ratios.length - 1) * 0.25)], n: ratios.length, rough: ratios.length < MIN_RATIOS };
}

function windowStartOf(resetsAt, now) {
  return resetsAt ? resetsAt * 1000 - 7 * DAY : now - 7 * DAY;
}

// A new reading of the account's weekly % arrived (usage endpoint, tap, or response header)
function sample(pct, resetsAt) {
  if (pct == null || !resetsAt) return;
  scan().then(() => {
    const now = Date.now();
    const cost = costSince(windowStartOf(resetsAt, now));
    const last = samples[samples.length - 1];
    // Keep the series small: a reading that changed nothing within ten minutes adds nothing
    if (last && sameWindow(last, { r: resetsAt }) && last.pct === pct && now - last.t < 10 * 60 * 1000) return;
    samples.push({ t: now, pct, r: resetsAt, cost });
    samples = samples.filter((s) => now - s.t < KEEP_MS).slice(-MAX_SAMPLES);
    try { if (store && store.save) store.save(samples); } catch (e) { /* ignore */ }
  }).catch(() => {});
}

// --- report ------------------------------------------------------------------------
function bump(map, key, label, v, cost) {
  let e = map.get(key);
  if (!e) { e = { name: label, tokens: 0, cost: 0, req: 0 }; map.set(key, e); }
  e.tokens += U.tokenTotal(v); e.cost += cost; e.req += v.req || 0;
}
function ranked(map, total, limit) {
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost).slice(0, limit)
    .map((e) => Object.assign(e, { share: total > 0 ? e.cost / total : 0 }));
}

async function report(sevenDay, now, tier) {
  await scan(now);
  now = now || Date.now();
  // The page covers the account's current weekly window (since its last reset), the span the
  // weekly % is about. Without a known reset it is the last seven days. A window that started
  // mid-morning spans eight calendar days, the first and last of them partly
  const resetsAt = sevenDay ? sevenDay.resets_at : null;
  const wStart = windowStartOf(resetsAt, now);
  const from = resetsAt ? wStart : (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6); return d.getTime(); })();
  const days = [], dayOf = new Map();
  for (let d = new Date(from); d.setHours(0, 0, 0, 0), d.getTime() <= now; d.setDate(d.getDate() + 1)) {
    const e = { day: U.localDayKey(d.getTime()), tokens: 0, cost: 0, main: 0, sub: 0 };
    if (dayOf.has(e.day)) continue;
    days.push(e); dayOf.set(e.day, e);
  }
  const total = Object.assign(U.zeroTokens(), { req: 0, cost: 0 });
  const projects = new Map(), models = new Map(), kinds = new Map(), sessions = new Map();
  const titles = new Map();
  for (const c of files.values()) if (c.title && !titles.has(c.session)) titles.set(c.session, c.title);
  for (const c of files.values()) {
    for (const [h, byModel] of c.hours) {
      if (h < from) continue;
      const day = dayOf.get(U.localDayKey(h));
      for (const [model, v] of byModel) {
        const cost = costOf(model, v);
        const tk = U.tokenTotal(v);
        total.input += v.input; total.output += v.output; total.cache_creation += v.cache_creation; total.cache_read += v.cache_read;
        total.req += v.req; total.cost += cost;
        if (day) { day.tokens += tk; day.cost += cost; if (c.kind === 'main') day.main += tk; else day.sub += tk; }
        bump(projects, c.project, c.project, v, cost);
        bump(models, modelLabel(model), modelLabel(model), v, cost);
        bump(kinds, c.kind, c.kind === 'main' ? 'Main sessions' : c.kind, v, cost);
        bump(sessions, c.session, '', v, cost);
      }
    }
  }
  const topSessions = ranked(sessions, total.cost, 5);
  for (const [id, e] of sessions) if (!e.name) e.name = titles.get(id) || id.slice(0, 8);

  const pct = sevenDay && sevenDay.used_percentage != null ? sevenDay.used_percentage : null;
  const windowCost = costSince(wStart);
  // The rate (percent per weighted dollar) does not depend on which week it was measured in, so
  // readings from earlier windows count too; estimateRate only pairs readings within one window
  const est = estimateRate(samples);
  // A measured rate when there is one; otherwise the reference for the plan (assumed Max 20x when the
  // plan cannot be read), so a full account, whose % can no longer rise, still gets a figure
  const tk = tierKey(tier);
  const basis = est.rate != null ? (est.rough ? 'rough' : 'measured') : 'reference';
  const rate = est.rate != null ? est.rate : REFERENCE_RATE[tk || 'max_20x'];
  let share = windowCost * rate;
  if (pct != null) share = Math.min(share, pct);

  return {
    host: os.hostname(),
    user: (() => { try { return os.userInfo().username; } catch (e) { return ''; } })(),
    at: now,
    from, sinceReset: !!resetsAt,
    days: days.map((d) => ({ day: d.day, tokens: d.tokens, cost: d.cost, main: d.main, sub: d.sub })),
    total,
    projects: ranked(projects, total.cost, 6),
    models: ranked(models, total.cost, 6),
    kinds: ranked(kinds, total.cost, 6),
    sessions: topSessions,
    plan: { pct, resetsAt, windowStart: wStart, windowCost, share, basis, rate, tier: tk, tierKnown: !!tk, perPoint: rate > 0 ? 1 / rate : null, rough: est.rough, readings: est.n, needed: MIN_RATIOS, minStep: MIN_DP, samples: samples.length },
    scannedAt: lastScanAt
  };
}

module.exports = {
  init, scan, sample, report, setProjectsDir, windowTotals,
  // exposed for tests
  _internal: { tierKey, REFERENCE_RATE, costOf, priceOf, modelLabel, estimateRate, costSince, files, getSamples: () => samples, setSamples: (s) => { samples = s; } }
};
