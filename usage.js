// Reading usage lines out of transcripts, with de-duplication.
// Shared by the panel's "today" sums (extension.js parseLinesInto) and the credit sweep
// (credits.js). Both have to count by the same rule, or the ledger's today cell and the
// panel tiles drift apart.
//
// Why de-duplicate: Claude Code writes one line per content block of a single response.
// Measured 2026-09-22 over 874 files: 42,527 of 93,543 usage lines repeated an earlier
// message.id + requestId. Those lines share input and cache values, and only output grows
// (streaming snapshots). Adding every line inflates tokens and requests by about 2x.

// internal field name -> usage object field. The panel Tokens tile and credits use these four
const USAGE_FIELDS = [
  ['input', 'input_tokens'],
  ['output', 'output_tokens'],
  ['cache_creation', 'cache_creation_input_tokens'],
  ['cache_read', 'cache_read_input_tokens']
];

function zeroTokens() {
  return { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
}

// The usage object of a parsed line, or null
function lineUsage(o) {
  return (o && ((o.message && o.message.usage) || o.usage)) || null;
}

// Key that identifies one response. Empty when message.id is missing; such lines are added as is
function usageKey(o) {
  const id = o && o.message && o.message.id;
  return id ? id + ':' + (o.requestId || '') : '';
}

// usage object -> the four counts. Anything that is not a positive number counts as 0 (boundary check)
function usageVec(u) {
  const v = zeroTokens();
  for (const [k, src] of USAGE_FIELDS) {
    const n = u[src];
    v[k] = (typeof n === 'number' && n > 0) ? n : 0;
  }
  return v;
}

// De-duplicated add. `seen` maps key -> per-field maximum counted so far (a Map).
// A repeated key only adds the per-field increase (new - prev, never negative), so the sum ends
// up holding each field's maximum. Streaming snapshots only grow output, so "last" and "max"
// usually agree, but max is the rule: measured 2026-09-22, 4 of 51,086 responses were later
// rewritten with an all-zero usage line, and counting the last value would drop those
// (about 1M tokens each). Max also gives the same result whatever the line order and wherever
// incremental parsing splits the file.
// Returns true when the line counted as a new request (drives the request count)
function addUsageOnce(sum, seen, key, v) {
  const prev = key ? seen.get(key) : undefined;
  if (!prev) {
    for (const [k] of USAGE_FIELDS) sum[k] += v[k];
    if (key) seen.set(key, Object.assign({}, v));
    return true;
  }
  for (const [k] of USAGE_FIELDS) {
    const d = v[k] - prev[k];
    if (d > 0) { sum[k] += d; prev[k] = v[k]; }
  }
  return false;
}

function tokenTotal(t) {
  return t.input + t.output + t.cache_creation + t.cache_read;
}

// Local date key YYYY-MM-DD. The panel's "today" starts at local midnight, so the ledger does too
function localDayKey(ms) {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

module.exports = { USAGE_FIELDS, zeroTokens, lineUsage, usageKey, usageVec, addUsageOnce, tokenTotal, localDayKey };
