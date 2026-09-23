// Credit ledger and sweep. Knows nothing about vscode, so it can be tested headless.
//
// The ledger is a record of what has been seen, not a value recomputed from the transcripts
// every time: depending on Claude Code's settings, transcripts are deleted after 30 days.
const fs = require('fs');
const path = require('path');
const U = require('./usage');

// Credits are weighted like API list prices: input 1, output 5, cache write 1.25, cache read 0.1.
// Every current model prices output at 5x input; a cache write is 1.25x at the 5-minute TTL (the
// 1-hour TTL's 2x is ignored, the ledger cannot tell them apart), and Fable 5.1's 0.025x cache read
// is ignored too. Credits are a game currency, not a bill, so one fixed set of weights for every model.
// Weights are kept as integers over WEIGHT_DEN so the sum is exact (0.1 has no float representation)
const WEIGHT_DEN = 20;
const WEIGHT_NUM = { input: 20, output: 100, cache_creation: 25, cache_read: 2 };
// every counted field needs a weight, or the sum silently turns into NaN
for (const [k] of U.USAGE_FIELDS) if (!Number.isInteger(WEIGHT_NUM[k])) throw new Error('credits: no weight for ' + k);
// 1 credit = CREDIT_UNIT weighted tokens
const CREDIT_UNIT = 100_000;

const LEDGER_KEY = 'creditLedgerV1';

// Bytes read per chunk. Transcripts over 60MB exist (largest measured: 122MB), so none is read whole.
// Slices stop between chunks, so one chunk's processing time is how far a slice can overrun its
// 40ms budget. Measured 2026-09-22, full 1.4GB sweep: slice max 53ms at 8MB, 44ms at 4MB,
// 42ms at 2MB, with total work 1.3-1.4s for all three
const SWEEP_CHUNK_BYTES = 4 * 1024 * 1024;
const USAGE_NEEDLE = Buffer.from('"usage"');
const NEWLINE = 0x0a;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// --- ledger --------------------------------------------------------------------
// Shape: { days: { 'YYYY-MM-DD': {input, output, cache_creation, cache_read} }, backfilled, sweptAt,
//          bank: { [replicaId]: { won, lost, hands } } }
// Raw tokens per day are stored, not credits, so a changed rate or weighting also re-prices the past.
// `bank` holds game results. They can go down as well as up, which a per-day max merge cannot
// express, so each window (replica) keeps its own won/lost/hands counters that only grow and only
// that window raises: a grow-only counter per replica, merged field by field with max like days.
// One key per activation that played at least one hand; keys are never removed (no path deletes them).
// Replica ids are 16 hex characters (extension.js makes them): anything else, "__proto__" included, is dropped.
// Other future keys go next to these; the merge below keeps unknown keys.
const REPLICA_RE = /^[0-9a-f]{16}$/;
const BANK_FIELDS = ['won', 'lost', 'hands'];

function cleanTokens(t) {
  const out = U.zeroTokens();
  if (!t || typeof t !== 'object') return out;
  for (const [k] of U.USAGE_FIELDS) {
    const n = t[k];
    out[k] = (typeof n === 'number' && isFinite(n) && n > 0) ? n : 0;
  }
  return out;
}

function cleanCounter(c) {
  const out = { won: 0, lost: 0, hands: 0 };
  if (!c || typeof c !== 'object') return out;
  for (const k of BANK_FIELDS) out[k] = (Number.isInteger(c[k]) && c[k] > 0) ? c[k] : 0;
  return out;
}

function cleanBank(b) {
  const out = {};
  if (!b || typeof b !== 'object') return out;
  for (const id in b) if (REPLICA_RE.test(id)) out[id] = cleanCounter(b[id]);
  return out;
}

// What comes out of globalState may have been written by another version. Fix the shape at the boundary
function normalizeLedger(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const srcDays = (src.days && typeof src.days === 'object') ? src.days : {};
  const days = {};
  for (const k in srcDays) if (DAY_RE.test(k)) days[k] = cleanTokens(srcDays[k]);
  const sweptAt = (typeof src.sweptAt === 'number' && isFinite(src.sweptAt)) ? src.sweptAt : 0;
  return Object.assign({}, src, { days, backfilled: src.backfilled === true, sweptAt, bank: cleanBank(src.bank) });
}

// Field-wise max of `inc` over `cur` (both clean). Returns the merged copy, or null if nothing grew
function maxFields(cur, inc, fields) {
  let next = null;
  for (const k of fields) {
    if (inc[k] > cur[k]) { next = next || Object.assign({}, cur); next[k] = inc[k]; }
  }
  return next;
}

// Per-day, per-field max merge. Several VS Code windows read the same transcripts and compute the
// same value for the same day; adding would credit it once per window, max gives the same result
// however many times it is applied (idempotent).
// Returns { ledger, changed }; changed === false means there is nothing to write
function mergeLedger(stored, patch) {
  const base = normalizeLedger(stored);
  const out = Object.assign({}, base, { days: Object.assign({}, base.days), bank: Object.assign({}, base.bank) });
  let changed = false;
  const pDays = (patch && patch.days) || {};
  const tokenFields = U.USAGE_FIELDS.map((f) => f[0]);
  for (const day in pDays) {
    if (!DAY_RE.test(day)) continue;
    const next = maxFields(out.days[day] || U.zeroTokens(), cleanTokens(pDays[day]), tokenFields);
    if (next) { out.days[day] = next; changed = true; }
  }
  const pBank = cleanBank(patch && patch.bank);
  for (const id in pBank) {
    const next = maxFields(out.bank[id] || cleanCounter(null), pBank[id], BANK_FIELDS);
    if (next) { out.bank[id] = next; changed = true; }
  }
  if (patch && patch.backfilled === true && !out.backfilled) { out.backfilled = true; changed = true; }
  if (patch && typeof patch.sweptAt === 'number' && patch.sweptAt > out.sweptAt) { out.sweptAt = patch.sweptAt; changed = true; }
  return { ledger: out, changed };
}

// Weighted tokens of one day, times WEIGHT_DEN (an exact integer)
function weightedScaled(t) {
  let w = 0;
  for (const [k] of U.USAGE_FIELDS) w += t[k] * WEIGHT_NUM[k];
  return w;
}

// Net game result over every replica: sum of won minus sum of lost
function bankNet(bank) {
  let net = 0;
  for (const id in bank) net += bank[id].won - bank[id].lost;
  return net;
}

// Summary for the webview. `ledger` has been through normalizeLedger.
// balance = credits earned from tokens + game net. today and frac are about earning only
function creditSummary(ledger, todayKey, counting) {
  const unit = CREDIT_UNIT * WEIGHT_DEN;
  let total = 0;
  for (const d in ledger.days) total += weightedScaled(ledger.days[d]);
  const todayW = ledger.days[todayKey] ? weightedScaled(ledger.days[todayKey]) : 0;
  const earned = Math.floor(total / unit);
  return {
    balance: earned + bankNet(ledger.bank || {}),
    today: earned - Math.floor((total - todayW) / unit),
    frac: (total % unit) / unit,
    perCredit: CREDIT_UNIT,
    counting: !!counting
  };
}

// Where a catch-up sweep starts: local midnight of the day the last sweep started, minus one day.
// Cut by whole days because every file holding a line from some day has an mtime after that day's
// midnight, so reading from midnight makes that day's sum complete. The extra day covers records
// straddling midnight and clock error. A sweptAt in the future (clock jumped forward, then back)
// is clamped to now, otherwise the catch-up would start after the days it has to cover
function catchUpSince(sweptAt, now) {
  if (!sweptAt) return 0;
  const d = new Date(Math.min(sweptAt, now == null ? Date.now() : now));
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1).getTime();
}

// Per-window ledger store.
// Holds everything this window has seen (the local ledger) and merges it with storage on every call.
// Writes at most once per minIntervalMs unless forced.
//  - Why throttle: memento.update rewrites and broadcasts ALL of the extension's keys at once
//    (checked in the VS Code extension host bundle), so a write per push both costs thousands of
//    writes a day and widens the window where one window's stale copy overwrites another
//    window's fresh key (a nickname edit, say).
//  - Why keep a local ledger: if another window's stale write replaces storage, the values seen
//    here survive in memory and the next write restores them. Max is idempotent, so sending the
//    whole ledger every time is safe.
// The token tail a throttled write leaves unsaved is picked up by the next activation's catch-up
// sweep. The bank has no transcript to re-count from, so it is written at once when a hand settles,
// and deactivate() makes one last forced write.
function createLedgerStore(memento, opts) {
  const minMs = opts.minIntervalMs;
  const now = opts.now || Date.now;
  const onError = opts.onError || (() => {});
  let local = normalizeLedger(null);
  let writtenAt = -Infinity;
  function write(ledger) {
    writtenAt = now();
    try { Promise.resolve(memento.update(LEDGER_KEY, ledger)).then(undefined, onError); }
    catch (e) { onError(e); }
  }
  // Folds `patch` into the local ledger, merges with storage, writes if due (or forced).
  // Returns the merged ledger, which is what the panel shows
  function record(patch, force) {
    local = mergeLedger(local, patch).ledger;
    const r = mergeLedger(memento.get(LEDGER_KEY), local);
    local = r.ledger;
    if (r.changed && (force || now() - writtenAt >= minMs)) write(r.ledger);
    return local;
  }
  // Merged view of local and storage. Never writes
  function read() {
    local = mergeLedger(local, memento.get(LEDGER_KEY)).ledger;
    return local;
  }
  return { record, read };
}

// --- sweep ---------------------------------------------------------------------

function listTranscripts(root, since) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; } // missing or unreadable dir: skip
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { stack.push(p); continue; }
      if (!e.name.endsWith('.jsonl')) continue;
      let st;
      try { st = fs.statSync(p); } catch (e2) { continue; } // deleted while walking
      if (st.mtimeMs >= since) out.push({ p, size: st.size });
    }
  }
  return out;
}

// Adds one usage-bearing line to the file's per-day buckets, de-duplicated
function countLine(line, fileDays, since) {
  let o;
  try { o = JSON.parse(line); } catch (e) { return; } // broken lines, such as a last line still being written, are not counted
  const u = U.lineUsage(o);
  if (!u) return;
  const t = o.timestamp ? Date.parse(o.timestamp) : NaN;
  if (isNaN(t) || t < since) return;
  const day = U.localDayKey(t);
  const b = fileDays[day] || (fileDays[day] = { sum: U.zeroTokens(), seen: new Map() });
  U.addUsageOnce(b.sum, b.seen, U.usageKey(o), U.usageVec(u));
}

// Picks only the lines containing "usage" out of data[0, end) and decodes just those.
// Searching the bytes first avoids decoding the whole chunk into a string, and since the newline
// byte (0x0a) never occurs inside a UTF-8 multi-byte sequence, no character is split across chunks
function scanChunk(data, end, fileDays, since) {
  let from = 0;
  while (from < end) {
    const hit = data.indexOf(USAGE_NEEDLE, from);
    if (hit < 0 || hit >= end) return;
    const ls = data.lastIndexOf(NEWLINE, hit) + 1;
    let le = data.indexOf(NEWLINE, hit);
    if (le < 0 || le > end) le = end;
    countLine(data.toString('utf8', ls, le), fileDays, since);
    from = le + 1;
  }
}

// Walks the transcripts and builds de-duplicated sums per local day.
// Only files modified since `since`, and only lines stamped since `since`, are counted. Days before
// `since` would only see some of their files, so their sums come out short; a max merge could not
// over-credit with them, but they are useless, so they are not counted at all.
// Each file's size is fixed when the file list is built (first step); lines appended after that
// belong to the live path and the next sweep
function createSweep(root, since, chunkBytes) {
  const chunk = chunkBytes || SWEEP_CHUNK_BYTES;
  let files = null;
  let cur = null;
  const days = {};
  const stats = { files: 0, bytes: 0, errors: 0 };

  function open(f) {
    try { return { fd: fs.openSync(f.p, 'r'), size: f.size, pos: 0, carry: null, days: {} }; }
    catch (e) { stats.errors += 1; return null; }
  }
  // A finished file adds its per-day sums to the totals. Duplicates across files (63 measured) are not removed
  function finish(f) {
    try { fs.closeSync(f.fd); } catch (e) { stats.errors += 1; }
    for (const day in f.days) {
      const into = days[day] || (days[day] = U.zeroTokens());
      for (const [k] of U.USAGE_FIELDS) into[k] += f.days[day].sum[k];
    }
    stats.files += 1;
  }
  function readNext(f) {
    const want = Math.min(chunk, f.size - f.pos);
    const buf = Buffer.allocUnsafe(want);
    const n = want > 0 ? fs.readSync(f.fd, buf, 0, want, f.pos) : 0;
    if (n <= 0) { f.pos = f.size; } else { f.pos += n; stats.bytes += n; }
    const fresh = buf.subarray(0, Math.max(0, n));
    const data = f.carry ? Buffer.concat([f.carry, fresh]) : fresh;
    const atEnd = f.pos >= f.size;
    // Before the end, count only up to the last newline; the rest is carried into the next read
    const end = atEnd ? data.length : data.lastIndexOf(NEWLINE) + 1;
    scanChunk(data, end, f.days, since);
    f.carry = end < data.length ? data.subarray(end) : null;
  }

  return {
    stats,
    days,
    // Works for budgetMs, and always does at least one unit (open a file or read a chunk) so any
    // budget makes progress. A chunk is always finished, so a step can run up to one chunk past budget.
    // Returns true when done
    step(budgetMs) {
      const t0 = Date.now();
      if (!files) files = listTranscripts(root, since);
      do {
        if (!cur) {
          const f = files.pop();
          if (!f) return true;
          cur = open(f);
          continue;
        }
        try { readNext(cur); }
        catch (e) { stats.errors += 1; cur.pos = cur.size; } // deleted or truncated while reading: count what was read
        if (cur.pos >= cur.size) { finish(cur); cur = null; }
      } while (Date.now() - t0 < budgetMs);
      return !cur && files.length === 0;
    },
    // Closes the open file when stopped midway
    close() {
      if (cur) { try { fs.closeSync(cur.fd); } catch (e) { stats.errors += 1; } cur = null; }
    }
  };
}

// Runs a sweep in time slices: work sliceMs, rest gapMs (the backfillXp pattern), so the extension
// host is never blocked for long. onDone(err) is called once, on completion or failure.
// onSlice(ms) is for measurement (optional)
function runSweep(sweep, opts, onDone) {
  let timer = null;
  let stopped = false;
  const tick = () => {
    timer = null;
    if (stopped) return;
    const t0 = Date.now();
    let done = false;
    let err = null;
    try { done = sweep.step(opts.sliceMs); } catch (e) { done = true; err = e; }
    if (opts.onSlice) opts.onSlice(Date.now() - t0);
    if (done) { stopped = true; sweep.close(); onDone(err); }
    else timer = setTimeout(tick, opts.gapMs);
  };
  timer = setTimeout(tick, opts.startDelayMs || 0);
  return {
    cancel() { stopped = true; clearTimeout(timer); sweep.close(); }
  };
}

module.exports = {
  CREDIT_UNIT, WEIGHT_NUM, WEIGHT_DEN, LEDGER_KEY, SWEEP_CHUNK_BYTES,
  normalizeLedger, mergeLedger, creditSummary, catchUpSince, createLedgerStore,
  createSweep, runSweep
};
