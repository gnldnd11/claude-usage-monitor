// The casino's register. A game is a DIRECTORY: games/<id>/meta.js plus games/<id>/panel.js.
//
// There is no list in this file, and that is the whole point of it. There used to be an array with
// one line per game, which is fine while one person adds one game and wrong the moment four
// screens are built at once: four writers editing one line is a line that loses one of them, and a
// lost line is a game that is simply not there with nothing to show why. So the register READS the
// directory. Adding a game creates its own directory and touches nothing shared.
//
// Where a game sits on the list is therefore its own business too, and it says so with `order`
// (a number, spaced by ten). Nothing in extension.js, webview.js, html.js or styles.js has to be
// touched either; see games/README.md.
'use strict';
const fs = require('fs');
const path = require('path');
const casino = require('./casino');
const { createTable, whyNotSpec } = require('./tables');

const ROOT = path.join(__dirname, '..');

// What a meta has to carry before the register will list it. Without one of these the list row,
// the panel's script tag or the message dispatch is broken, and broken in a way that shows up as a
// blank screen rather than as an error
const NEEDED = ['id', 'key', 'name', 'panel'];

// Where a game with no `order` of its own goes: after every game that has one, by id. Not an error,
// because a game can reasonably not care, and a thrown error would cost it its row
const NO_ORDER = Number.MAX_SAFE_INTEGER;

// Every game that was found but could not be listed, as sentences.
//
// Collected rather than thrown. This file is loaded by 569 installs at activation, and a throw here
// is a sidebar that never draws: one half-copied directory, one meta.js with a typo in it, and the
// usage monitor the extension is actually for is gone too. So a game that cannot be listed costs
// its own row and nothing else.
//
// The record is kept in three places on purpose, because each one is read by someone different:
// console.error reaches the extension host log at once, extension.js copies these into the output
// channel the user can open, and test/registry.test.js asserts the list is EMPTY, which is what
// keeps "it drops quietly" from meaning "nobody finds out"
const PROBLEMS = [];

function drop(what, why) {
  const line = 'games: ' + what + ' was not listed: ' + why;
  PROBLEMS.push(line);
  try { console.error(line); } catch (e) { /* a host with no console: PROBLEMS is still the record */ }
}

// Why this meta cannot be listed, or null. Shape only: what a game DOES is its engine's business
function whyNotMeta(g) {
  if (!g || typeof g !== 'object') return 'meta.js exports no object';
  for (const k of NEEDED) {
    if (typeof g[k] !== 'string' || g[k] === '') return k + ' must be a non-empty string';
  }
  // the panel is loaded as a script tag off this path, and a path that resolves to nothing is a
  // row that opens an empty screen. Cheaper to find out here than on the player's first click
  if (!fs.existsSync(path.join(ROOT, g.panel))) return 'panel ' + g.panel + ' does not exist';
  if (g.order != null && !Number.isFinite(g.order)) return 'order must be a number when it is given';
  if (g.group != null && typeof g.group !== 'string') return 'group must be a string when it is given';
  // the tile is markup, written straight into the list row. A non-string here is "[object Object]"
  // sitting in the icon square, which is a row that looks broken with nothing saying why
  if (g.tile != null && typeof g.tile !== 'string') return 'tile must be a string when it is given';
  if (g.table) return whyNotSpec(g.table);
  if (typeof g.createHandler !== 'function') return 'a game needs either a table spec or createHandler()';
  return null;
}

// `order` and `group` filled in, so every reader downstream sees the same shape whether the meta
// bothered with them or not
function normalize(g) {
  return Object.assign({}, g, {
    order: Number.isFinite(g.order) ? g.order : NO_ORDER,
    group: typeof g.group === 'string' ? g.group : ''
  });
}

// One readdirSync, at require time, and what it finds is the register for the life of the
// activation. It is on the activation path, so it is read ONCE and never again: nothing here is
// called a second time, and a game added to the directory needs a window reload to appear, which
// is also true of the panel scripts the page already carries.
//
// Cost, measured on this repository (8 entries, 4 of them games): see test/registry.test.js, which
// prints the figure rather than asserting a wall-clock number.
//
// Inside a .vsix this works for the same reason `require` does: VS Code unpacks the archive into
// the extensions directory at install time, so __dirname is a real directory on disk. games/** is
// published (.vscodeignore is a blocklist and does not list it), which the same test checks by
// resolving every panel path it finds
function discover() {
  let ents;
  try { ents = fs.readdirSync(__dirname, { withFileTypes: true }); }
  catch (e) {
    drop('games/', 'the directory could not be read: ' + (e && e.message));
    return [];
  }
  const found = [];
  for (const ent of ents) {
    if (ent.isFile()) continue;   // registry.js, casino.js, tables.js, README.md and the shared art
    const meta = path.join(__dirname, ent.name, 'meta.js');
    // A directory with no meta.js is not a game and says nothing about itself: a leftover from a
    // branch, a working copy, a game's own assets. Only a directory that CLAIMS to be a game can
    // fail to be one, which is what keeps the problem list down to real problems
    if (!fs.existsSync(meta)) continue;
    let g;
    try { g = require(meta); }
    catch (err) { drop(ent.name, 'meta.js threw on load: ' + (err && err.message)); continue; }
    const why = whyNotMeta(g);
    if (why) { drop(ent.name, why); continue; }
    found.push(normalize(g));
  }
  // `order` first, then the id. readdirSync's own order is the file system's, which differs between
  // APFS, ext4 and a .vsix unpacked by another version, and a games list that is in a different
  // order in every window is a list nobody can learn. A tie (two games given the same number, or
  // two with none) is settled alphabetically rather than left to the directory
  found.sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found;
}

// Two ids, and they are not interchangeable: `id` is what the list row, the stored view and the
// panel use, `key` is the message type on the wire and the element prefix. A new game may well use
// the same string for both.
// Null-prototype, because these are keyed by strings that came out of a directory: a game calling
// itself 'constructor' would otherwise look like a game that is already registered
const GAMES = [];
const BY_KEY = Object.create(null);
const BY_ID = Object.create(null);
for (const g of discover()) {
  // The sort above makes this deterministic: of two games that claim one key, the one that sorts
  // first keeps it, in every window and on every file system
  if (BY_KEY[g.key]) { drop(g.id, 'the key "' + g.key + '" is already answered by ' + BY_KEY[g.key].id); continue; }
  if (BY_ID[g.id]) { drop(g.id, 'the id is already taken'); continue; }
  BY_KEY[g.key] = g; BY_ID[g.id] = g; GAMES.push(g);
}

// The whole casino's stylesheet: the shared chrome first, each game's own after it, so a game can
// override the chrome but never has to repeat it
function css() {
  return casino.CSS + GAMES.map((g) => g.css || '').join('');
}

// What the webview needs to draw a list row and a panel heading. `uri` turns an asset filename
// into something the webview may load; `icon` looks a glyph up in icons.js. Both are the host's to
// resolve, so this stays free of vscode.
// `group` is the heading this row sits under; html.js draws one wherever it changes down the
// already-sorted list, which is why the `order` numbers have to keep a group contiguous.
//
// A game's list picture comes one of two ways and never both: `thumb` is a painted PNG the host
// has to turn into a webview URI, `tile` is an SVG string that needs no request and no URI. The
// four original games have art, the other ten are drawn in games/tiles.js
function view(uri, icon) {
  return GAMES.map((g) => ({
    id: g.id, key: g.key, name: g.name, sub: g.sub,
    title: g.title, hint: g.hint, cls: g.cls || g.key,
    rowTitle: g.rowTitle || '',
    group: g.group,
    icon: icon(g.icon) || '', thumb: g.thumb ? uri(g.thumb) : '', tile: g.tile || ''
  }));
}

// The webview scripts, in registration order. Each registers its panel with window.CUC.game()
function panels() {
  return GAMES.map((g) => g.panel);
}

// One handler per game: a round-based game gets the shared driver, a game with its own rules
// (the market) builds its own. The result is keyed by the wire type, which is what dispatch reads.
// A handler that cannot be built costs its game the ability to answer, and nothing else: the row is
// already on the list by now, so the alternative to catching here is the whole extension failing to
// load over one game. Null-prototype for the same reason BY_KEY is
function createHandlers(deps) {
  const out = Object.create(null);
  for (const g of GAMES) {
    try { out[g.key] = g.table ? createTable(g.table, deps) : g.createHandler(deps); }
    catch (err) { drop(g.id, 'its handler could not be built: ' + (err && err.message)); }
  }
  return out;
}

module.exports = { GAMES, BY_KEY, BY_ID, PROBLEMS, NO_ORDER, css, view, panels, createHandlers };
