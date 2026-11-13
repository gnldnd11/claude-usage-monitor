// Where Claude Code keeps its configuration on this machine, and every path this extension reads
// out of it. Knows nothing about vscode, so it can be tested headless (test/claudedir.test.js).
//
// Claude Code reads CLAUDE_CONFIG_DIR, and moving that directory is the usual way to keep two
// accounts side by side (a work login and a personal one). Until 1.29.0 this file did not exist and
// extension.js read ~/.claude unconditionally, which was not only "the panel shows the wrong
// folder": team.js DID read the variable, so on such a PC the account id came out of the moved
// directory while the tokens came out of the default one, and weekly sharing posted one account's
// usage into the other account's group. That is why there is one resolver and both callers take the
// path from it. Nothing else in the extension is allowed to work out where the directory is.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENV_NAME = 'CLAUDE_CONFIG_DIR';

// For the log: how a resolved directory was chosen
const SOURCE_LABEL = {
  setting: 'the claudeUsage.configDir setting',
  claudeCode: ENV_NAME + ' in claudeCode.environmentVariables',
  env: 'the ' + ENV_NAME + ' environment variable',
  default: 'the default location'
};

function isDirSync(p) {
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } // missing, or not ours to read
}

// A leading ~ means the person's home directory. People type it into settings, and path.join does
// not expand it, so '~/.claude-work' would otherwise be looked for under the extension host's own
// working directory. Both separators, because the setting travels between machines.
// Anything that is not a string is nothing at all, not a path spelled oddly: a hand-edited
// settings.json can hold a number there, and `0` is no more a directory than an empty line is
function expandHome(raw, home) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  if (s === '~') return home;
  if (s[0] === '~' && (s[1] === '/' || s[1] === '\\')) return path.join(home, s.slice(2));
  return s;
}

// CLAUDE_CONFIG_DIR out of the Claude Code extension's own setting, which is an array of
// { name, value }. That setting belongs to another extension, so nothing about its shape is
// assumed: anything that is not an array, an item that is not an object, a name that is not this
// one and a value that is not a non-empty string all simply yield nothing
function fromEnvVarSetting(list) {
  if (!Array.isArray(list)) return '';
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    if (e.name !== ENV_NAME) continue;
    if (typeof e.value !== 'string' || !e.value.trim()) continue;
    return e.value;
  }
  return '';
}

// .claude.json is NOT inside the directory in the default layout: Claude Code keeps ~/.claude.json
// next to ~/.claude, and a moved directory holds its own copy inside itself. The second line is
// also what covers someone who writes the default path into the setting by hand
function configJsonFor(dir, home) {
  return dir === path.normalize(path.join(home, '.claude'))
    ? path.join(home, '.claude.json')
    : path.join(dir, '.claude.json');
}

function paths(dir, home, source, notes) {
  return {
    dir,
    projects: path.join(dir, 'projects'),      // session transcripts
    agents: path.join(dir, 'agents'),          // user-level agent definitions
    credentials: path.join(dir, '.credentials.json'),
    usageBar: path.join(dir, 'usage-bar.json'),
    configJson: configJsonFor(dir, home),      // the signed-in account and its plan tier
    source, notes
  };
}

// Where every version before 1.29.0 read, whatever the environment said. The ledger uses this to
// tell an upgraded install from one whose directory has actually moved
function defaultPaths(homedir) {
  const home = homedir || os.homedir();
  return paths(path.normalize(path.join(home, '.claude')), home, 'default', []);
}

// In order: our own setting, CLAUDE_CONFIG_DIR as the Claude Code extension's setting holds it,
// CLAUDE_CONFIG_DIR in the environment, then ~/.claude.
//
// Our own setting is first although the reporter of issue #2 asked for it second, because the
// claudeCode one is another extension's property: if it is renamed there, a person who set it here
// still has a working extension. The environment is third rather than second because a variable
// set in a VS Code profile reaches the Claude Code process and NOT the extension host, so
// process.env is the one place a profile's choice does not show up.
//
// A candidate that is relative, or names something that is not an existing directory, is passed
// over for the next one and the reason is put in `notes` for the log: falling back quietly is how
// a typo in a path looks exactly like the setting being ignored.
//
// input: { setting, claudeCodeEnv, env, homedir, isDir } — all optional.
function resolveConfigDir(input) {
  const o = input || {};
  const home = o.homedir || os.homedir();
  const isDir = o.isDir || isDirSync;
  const env = o.env || process.env;
  const notes = [];
  const candidates = [
    ['setting', o.setting],
    ['claudeCode', fromEnvVarSetting(o.claudeCodeEnv)],
    ['env', env ? env[ENV_NAME] : '']
  ];
  for (const [source, raw] of candidates) {
    const p = expandHome(raw, home);
    if (!p) continue;
    if (!path.isAbsolute(p)) { notes.push(SOURCE_LABEL[source] + ' is not an absolute path (' + p + '); passed over'); continue; }
    const dir = path.normalize(p);
    if (!isDir(dir)) { notes.push(SOURCE_LABEL[source] + ' is not an existing directory (' + dir + '); passed over'); continue; }
    return paths(dir, home, source, notes);
  }
  const def = defaultPaths(home);
  def.notes = notes;
  return def;
}

module.exports = { ENV_NAME, SOURCE_LABEL, resolveConfigDir, defaultPaths, expandHome, fromEnvVarSetting };
