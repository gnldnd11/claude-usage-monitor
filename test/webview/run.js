// Runs the webview end-to-end check once per mode, each in a fresh process
// (the check loads webview.js into a single vm context per run). A mode that hangs is killed after
// 60 seconds and counts as a failure, so npm test always finishes. Each run gets its own temp
// parent directory, removed here: a killed run cannot clean up after itself.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MODES = ['normal', 'reduce', 'poor50', 'poor5', 'compact', 'badtab', 'nohero', 'resume-list', 'resume-bj', 'header', 'header-reduce'];
const TIMEOUT_MS = 60000;
let failed = 0;
for (const m of MODES) {
  const t0 = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-run-'));
  try {
    const env = Object.assign({}, process.env, { CUC_TABLE_TMPDIR: tmp });
    const out = execFileSync(process.execPath, [path.join(__dirname, 'table.test.js'), m], { encoding: 'utf8', timeout: TIMEOUT_MS, killSignal: 'SIGKILL', env });
    const last = out.trim().split('\n').pop();
    console.log('[' + m + '] ' + last + ' (' + (Date.now() - t0) + 'ms)');
  } catch (e) {
    failed++;
    const why = e.signal === 'SIGKILL' ? ' (killed after ' + TIMEOUT_MS / 1000 + 's)' : '';
    console.log('[' + m + '] FAILED' + why + '\n' + (e.stdout || '') + (e.stderr || ''));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
if (failed) { console.log(failed + ' webview mode(s) failed'); process.exit(1); }
console.log('ALL ' + MODES.length + ' WEBVIEW MODES PASSED');
