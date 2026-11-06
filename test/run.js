// Every suite, found rather than listed.
//
// This used to be one long line in package.json naming each file. That is fine while one person
// adds one game and wrong the moment several screens are built at once: a list in a shared file is
// a line every new game has to edit, and four writers editing one line is a line that loses one of
// them. The same reasoning already moved the games list into games/registry.js and the webview
// modes into test/webview/modes.js, and this is the third place it applied.
//
// So: a suite is a file. Adding one adds a file and nothing else; removing one removes a file and
// leaves no dangling name behind to fail on the next run.
//
// Order is fixed rather than whatever the file system hands over, because a run that reports its
// failures in a different order every time is a run nobody can diff:
//   credits first   the ledger every game spends out of
//   the games       alphabetically, each one standing alone
//   registry        what the directory scan made of them
//   host            the dispatch they all answer through
//   webview last    the slowest, and the only one that starts processes of its own
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const FIRST = ['credits'];                 // run before the games
const LAST = ['registry', 'host'];         // run after them, in this order

function suites() {
  const found = fs.readdirSync(DIR)
    .filter((f) => /\.test\.js$/.test(f))
    .map((f) => f.replace(/\.test\.js$/, ''));
  const head = FIRST.filter((n) => found.indexOf(n) >= 0);
  const tail = LAST.filter((n) => found.indexOf(n) >= 0);
  const mid = found.filter((n) => head.indexOf(n) < 0 && tail.indexOf(n) < 0).sort();
  return head.concat(mid, tail);
}

const names = suites();
if (!names.length) { console.log('no suites found in test/'); process.exit(1); }

let failed = 0;
for (const name of names) {
  try {
    // inherit, so each suite prints as it runs: a suite that hangs should show what it reached
    execFileSync(process.execPath, [path.join(DIR, name + '.test.js')], { stdio: 'inherit' });
  } catch (e) {
    failed += 1;
    console.log('[' + name + '] FAILED');
  }
}
// The webview runner is a suite of its own shape: it starts one process per mode, so it reports its
// own tally and its exit code is what matters here
try {
  execFileSync(process.execPath, [path.join(DIR, 'webview', 'run.js')], { stdio: 'inherit' });
} catch (e) {
  failed += 1;
  console.log('[webview] FAILED');
}

if (failed) { console.log('\n' + failed + ' suite(s) failed'); process.exit(1); }
console.log('\nALL ' + names.length + ' SUITES + WEBVIEW PASSED');
