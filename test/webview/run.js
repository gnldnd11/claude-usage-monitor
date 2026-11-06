// Runs the webview end-to-end check once per mode, each in a fresh process
// (the check loads webview.js into a single vm context per run). A mode that hangs is killed after
// 60 seconds and counts as a failure, so npm test always finishes. Each run gets its own temp
// parent directory, removed here: a killed run cannot clean up after itself.
//
// The modes are not listed here. They are read off test/webview/games/ (see modes.js), so a game
// adds its own file and is run by this without the file being touched: with ten more games coming,
// a list here would be a queue.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MODES = require('./modes').all();
const TIMEOUT_MS = 60000;
if (MODES.length < 1) { console.log('no webview modes found in test/webview/games'); process.exit(1); }
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
