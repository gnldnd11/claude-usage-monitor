// The register of webview modes, read off test/webview/games/.
//
// A mode is one run of test/webview/table.test.js: one fresh process, one page, one script. The
// modes used to be an array in run.js and a branch in table.test.js, which made both of those files
// a queue every new game had to stand in. They are a directory now: a game puts its own file in
// games/ and nothing else is touched, which is the same promise games/README.md already makes about
// games/registry.js.
//
// A file in there exports:
//   id      what it is (the game's id, or 'chrome' for the page around them)
//   modes   the mode names it answers to. Unique across every file; a clash throws here
//   start   optional: credits the ledger starts that mode with, by mode name. 1,000 if left out
//   state   optional: the webview's STORED state for that mode, by mode name (a reload resuming)
//   html    optional: (html, mode) -> html, to break the page before it is parsed
//   run     (h, mode) -> void. `h` is the harness handle table.test.js builds; see its header
//
// It must be requirable on its own: the engines and the host come from `h`, so loading this register
// to list the modes costs nothing and starts no extension.
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'games');

function load() {
  const files = fs.readdirSync(DIR).filter((f) => /\.js$/.test(f)).sort();
  const out = [], seen = new Map();
  for (const f of files) {
    const mod = require(path.join(DIR, f));
    if (!mod || typeof mod.run !== 'function') throw new Error('webview mode file ' + f + ' has no run()');
    if (!Array.isArray(mod.modes) || !mod.modes.length) throw new Error('webview mode file ' + f + ' names no modes');
    for (const m of mod.modes) {
      if (typeof m !== 'string' || !m) throw new Error(f + ' has a mode that is not a name');
      // two files answering to one name is the kind of thing that passes locally and fails in CI on
      // whichever one the directory listing happened to hand over second
      if (seen.has(m)) throw new Error('two webview mode files claim "' + m + '": ' + seen.get(m) + ' and ' + f);
      seen.set(m, f);
    }
    out.push(Object.assign({ file: f }, mod));
  }
  return out;
}

// Every mode name, in the order the files are read and the order each file lists them
function all() {
  return load().reduce((acc, m) => acc.concat(m.modes), []);
}

// The file that owns a mode name. An unknown name is a typo, not an empty run
function forMode(name) {
  const mod = load().find((m) => m.modes.indexOf(name) >= 0);
  if (!mod) throw new Error('no webview mode "' + name + '". There are: ' + all().join(', '));
  return mod;
}

module.exports = { all, forMode, load, DIR };
