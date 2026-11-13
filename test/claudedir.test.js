// Where the extension reads Claude Code's configuration from, and in what order it decides.
// node's assert only. Run: node test/claudedir.test.js
//
// The order is the whole point of the file under test, so it is asserted step by step: a resolver
// that gets the order wrong does not fail loudly, it reads the wrong account and reports its usage
// under the right account's name (issue #2).
// Real directories are made in a temp dir, because "does this exist" is half of what is decided.
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const claudedir = require(path.join(__dirname, '..', 'claudedir.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cuc-dir-'));
const HOME = path.join(TMP, 'home');
const DEFAULT = path.join(HOME, '.claude');
const SETTING_DIR = path.join(TMP, 'from-setting');
const CC_DIR = path.join(TMP, 'from-claude-code');
const ENV_DIR = path.join(TMP, 'from-env');
for (const d of [DEFAULT, SETTING_DIR, CC_DIR, ENV_DIR]) fs.mkdirSync(d, { recursive: true });
const MISSING = path.join(TMP, 'not-made');

// Every call fixes the home directory and the environment: a real HOME or a real CLAUDE_CONFIG_DIR
// on the machine running the tests must not be able to change an answer
const ccEnv = (value) => [{ name: 'OTHER', value: 'x' }, { name: 'CLAUDE_CONFIG_DIR', value }];
function resolve(o) {
  return claudedir.resolveConfigDir(Object.assign({ homedir: HOME, env: {} }, o));
}

test('nothing set: the default directory, and .claude.json beside it rather than inside it', () => {
  const r = resolve({});
  assert.equal(r.source, 'default');
  assert.equal(r.dir, DEFAULT);
  assert.equal(r.projects, path.join(DEFAULT, 'projects'));
  assert.equal(r.agents, path.join(DEFAULT, 'agents'));
  assert.equal(r.credentials, path.join(DEFAULT, '.credentials.json'));
  assert.equal(r.usageBar, path.join(DEFAULT, 'usage-bar.json'));
  assert.equal(r.configJson, path.join(HOME, '.claude.json')); // NOT DEFAULT/.claude.json
  assert.deepEqual(r.notes, []);
});

test('the environment is read when no setting names a directory', () => {
  const r = resolve({ env: { CLAUDE_CONFIG_DIR: ENV_DIR } });
  assert.equal(r.source, 'env');
  assert.equal(r.dir, ENV_DIR);
  assert.equal(r.configJson, path.join(ENV_DIR, '.claude.json')); // a moved directory holds its own
});

test('claudeCode.environmentVariables beats the environment', () => {
  // the case from issue #2: the variable is set in a VS Code profile, so it reaches the Claude Code
  // process and never the extension host
  const r = resolve({ claudeCodeEnv: ccEnv(CC_DIR), env: { CLAUDE_CONFIG_DIR: ENV_DIR } });
  assert.equal(r.source, 'claudeCode');
  assert.equal(r.dir, CC_DIR);
});

test('our own setting beats both', () => {
  const r = resolve({ setting: SETTING_DIR, claudeCodeEnv: ccEnv(CC_DIR), env: { CLAUDE_CONFIG_DIR: ENV_DIR } });
  assert.equal(r.source, 'setting');
  assert.equal(r.dir, SETTING_DIR);
});

test('all four steps in one call, each one taken away in turn', () => {
  const all = { setting: SETTING_DIR, claudeCodeEnv: ccEnv(CC_DIR), env: { CLAUDE_CONFIG_DIR: ENV_DIR } };
  const order = [
    [all, SETTING_DIR, 'setting'],
    [Object.assign({}, all, { setting: '' }), CC_DIR, 'claudeCode'],
    [Object.assign({}, all, { setting: '', claudeCodeEnv: null }), ENV_DIR, 'env'],
    [Object.assign({}, all, { setting: '', claudeCodeEnv: null, env: {} }), DEFAULT, 'default']
  ];
  for (const [input, dir, source] of order) {
    const r = resolve(input);
    assert.equal(r.dir, dir, source);
    assert.equal(r.source, source);
  }
});

test('a directory that is not there is passed over, and the reason is said', () => {
  const r = resolve({ setting: MISSING, claudeCodeEnv: ccEnv(CC_DIR) });
  assert.equal(r.dir, CC_DIR);                       // down to the next step, not to the default
  assert.equal(r.notes.length, 1);
  assert.ok(r.notes[0].indexOf(MISSING) >= 0, r.notes[0]);
  assert.ok(/claudeUsage\.configDir/.test(r.notes[0]), r.notes[0]);

  const all = resolve({ setting: MISSING, claudeCodeEnv: ccEnv(MISSING), env: { CLAUDE_CONFIG_DIR: MISSING } });
  assert.equal(all.dir, DEFAULT);                    // the default is the last thing standing
  assert.equal(all.source, 'default');
  assert.equal(all.notes.length, 3);                 // and every step that was passed over says so
});

test('a file where a directory should be is not a directory', () => {
  const f = path.join(TMP, 'a-file');
  fs.writeFileSync(f, 'x');
  const r = resolve({ setting: f });
  assert.equal(r.dir, DEFAULT);
  assert.equal(r.notes.length, 1);
});

test('a leading ~ is the home directory', () => {
  assert.equal(resolve({ setting: '~/.claude' }).dir, DEFAULT);
  assert.equal(resolve({ setting: '  ~/.claude  ' }).dir, DEFAULT);       // typed with spaces
  assert.equal(claudedir.expandHome('~', '/h'), '/h');
  assert.equal(claudedir.expandHome('~/x', '/h'), path.join('/h', 'x'));
  assert.equal(claudedir.expandHome('~\\x', '/h'), path.join('/h', 'x')); // typed on Windows
  assert.equal(claudedir.expandHome('~notme/x', '/h'), '~notme/x');       // another user's home: not ours to expand
  assert.equal(claudedir.expandHome('', '/h'), '');
  assert.equal(claudedir.expandHome(null, '/h'), '');
});

test('writing the default path into the setting still finds .claude.json', () => {
  // the file is at ~/.claude.json whichever way the directory was named
  const r = resolve({ setting: '~/.claude' });
  assert.equal(r.source, 'setting');
  assert.equal(r.configJson, path.join(HOME, '.claude.json'));
  assert.equal(resolve({ setting: DEFAULT }).configJson, path.join(HOME, '.claude.json'));
});

test('a relative path is refused rather than resolved against whatever the cwd is', () => {
  const r = resolve({ setting: '.claude' });
  assert.equal(r.dir, DEFAULT);
  assert.ok(/not an absolute path/.test(r.notes[0]), r.notes[0]);
});

test('an empty or blank setting is not a choice at all', () => {
  for (const v of ['', '   ', null, undefined, 0, false]) {
    const r = resolve({ setting: v, env: { CLAUDE_CONFIG_DIR: ENV_DIR } });
    assert.equal(r.dir, ENV_DIR, JSON.stringify(v));
    assert.deepEqual(r.notes, []); // nothing was passed over, so there is nothing to report
  }
});

test('claudeCode.environmentVariables is another extension\'s setting, so no shape is assumed', () => {
  const junk = [
    null, undefined, 42, 'CLAUDE_CONFIG_DIR=' + CC_DIR, {}, { name: 'CLAUDE_CONFIG_DIR', value: CC_DIR },
    [], [null], [42], ['CLAUDE_CONFIG_DIR'], [{ name: 'CLAUDE_CONFIG_DIR' }], [{ name: 'CLAUDE_CONFIG_DIR', value: '' }],
    [{ name: 'CLAUDE_CONFIG_DIR', value: '  ' }], [{ name: 'CLAUDE_CONFIG_DIR', value: 7 }], [{ value: CC_DIR }],
    [{ name: 'claude_config_dir', value: CC_DIR }] // the name is a variable name: it is case-sensitive
  ];
  for (const v of junk) {
    const r = resolve({ claudeCodeEnv: v });
    assert.equal(r.dir, DEFAULT, JSON.stringify(v));
    assert.equal(r.source, 'default', JSON.stringify(v));
  }
  assert.equal(claudedir.fromEnvVarSetting(ccEnv(CC_DIR)), CC_DIR);
  assert.equal(claudedir.fromEnvVarSetting({ CLAUDE_CONFIG_DIR: CC_DIR }), ''); // a map, not the list
});

test('the default is the default whatever the environment says', () => {
  // what the ledger compares against to tell an upgraded install from a moved directory
  const d = claudedir.defaultPaths(HOME);
  assert.equal(d.dir, DEFAULT);
  assert.equal(d.projects, path.join(DEFAULT, 'projects'));
  assert.equal(d.source, 'default');
});

test('paths are joined, never spelled out, so Windows is not a special case', () => {
  const r = resolve({ setting: SETTING_DIR });
  for (const k of ['projects', 'agents', 'credentials', 'usageBar', 'configJson']) {
    assert.ok(r[k].indexOf(path.sep) >= 0, k);
    assert.ok(path.isAbsolute(r[k]), k);
    assert.equal(r[k], path.normalize(r[k]), k);
  }
});

let failed = 0;
for (const t of tests) {
  // A sync runner drops a promise on the floor: an async test would stop at its first await
  // and still be counted as a pass. Refuse one instead of reporting a result nobody produced.
  try {
    const r = t.fn();
    if (r && typeof r.then === 'function') throw new Error('async test in a sync runner: use await t.fn()');
    console.log('PASS ' + t.name);
  }
  catch (e) { failed++; console.log('FAIL ' + t.name + '\n  ' + (e && e.stack || e)); }
}
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* temp dir: leave it to the OS */ }
console.log(failed ? failed + ' of ' + tests.length + ' FAILED' : 'ALL ' + tests.length + ' PASSED');
process.exit(failed ? 1 : 0);
