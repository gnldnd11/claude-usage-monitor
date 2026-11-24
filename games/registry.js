// The register of the games AND OF THE DOORS THEY STAND BEHIND. A game is a DIRECTORY:
// games/<id>/meta.js plus games/<id>/panel.js.
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
//
// THE SECOND HALF OF THE TITLE ARRIVED ON 2026-11-24, with the credit mine. Until then every game
// stood behind one door (the crossroads' Games door) and the list was the only thing a game could
// be on, so this file could be described as a register of games and nothing else. The mine is not
// on the list: it is not a bet, it digs while nobody is looking, and "what shall I play" is not the
// question it answers (docs/shop-spec.md, 2-7). So a meta may now name a DOOR, the crossroads is
// built out of the doors that have something behind them, and a door with one game behind it opens
// that game's screen instead of a list of one.
//
// A DOOR IS A DISPLAY FACT, THE WAY `order` IS. `order` says where on the list a row goes; `door`
// says which door the row is behind. Neither is a rule about play, both are data, and the shared
// files learn only the door's own name from them: html.js builds a button per door and webview.js
// asks how many games are behind the one that was pressed. Neither of them learns a game's name,
// which is the property games/README.md section 1 is about.
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

// THE DOORS OF THE CROSSROADS, in the order they stand in a row (docs/shop-spec.md, 2-7). A door
// is a picture and a name and nothing else; what is behind it is whichever games claim it.
//
// The art is a filename in the published root, resolved by the host the way a list row's `thumb`
// is: this module never sees a URI. The crossroads' third door is the SHOP's and it is not in here,
// because the shop is not a game and has no entry in this register (docs/shop-spec.md, 4-5);
// html.js owns that one and puts it last.
const DOORS = Object.freeze([
  { id: 'mine', name: 'Mine', art: 'hero-mine.png' },
  { id: 'games', name: 'Games', art: 'hero-games.png' }
].map((d) => Object.freeze(d)));

// The door a meta that names none stands behind, which is every game that was here before the
// crossroads grew a third door. It is also the one door that opens a LIST rather than a screen:
// the register's other doors hold one game each, and a door holding one game is that game
const LIST_DOOR = 'games';
const DOOR_IDS = DOORS.map((d) => d.id);

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
  // A door this register does not know is a row nobody can reach: the crossroads is built out of
  // DOORS above, so a typo here would put a game behind a button that is never drawn. Costing it
  // its row says so at activation (PROBLEMS, and test/registry.test.js); falling back to the list
  // would put a game that is deliberately off the list quietly back on it
  if (g.door != null && DOOR_IDS.indexOf(g.door) < 0) return 'door "' + g.door + '" is not a door of the crossroads';
  // the tile is markup, written straight into the list row. A non-string here is "[object Object]"
  // sitting in the icon square, which is a row that looks broken with nothing saying why
  if (g.tile != null && typeof g.tile !== 'string') return 'tile must be a string when it is given';
  if (g.table) return whyNotSpec(g.table);
  if (typeof g.createHandler !== 'function') return 'a game needs either a table spec or createHandler()';
  return null;
}

// `order` filled in, so every reader downstream sees the same shape whether the meta bothered with
// it or not. There was a `group` beside it until 1.28.0 and the list is flat now
// (docs/game-panels.md, section 7-2)
function normalize(g) {
  return Object.assign({}, g, {
    order: Number.isFinite(g.order) ? g.order : NO_ORDER,
    door: g.door || LIST_DOOR
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
const BY_DOOR = Object.create(null);
for (const g of discover()) {
  // The sort above makes this deterministic: of two games that claim one key, the one that sorts
  // first keeps it, in every window and on every file system
  if (BY_KEY[g.key]) { drop(g.id, 'the key "' + g.key + '" is already answered by ' + BY_KEY[g.key].id); continue; }
  if (BY_ID[g.id]) { drop(g.id, 'the id is already taken'); continue; }
  // A SIDE DOOR HOLDS ONE GAME. The door opens that game's screen, so a second game behind it has
  // nowhere to be drawn: there is one list in the page and it belongs to LIST_DOOR. A door that
  // ought to hold two is a door that wants a list of its own, which is a screen somebody has to
  // build rather than something to be inferred from a second meta appearing
  if (g.door !== LIST_DOOR && BY_DOOR[g.door]) {
    drop(g.id, 'the "' + g.door + '" door is already answered by ' + BY_DOOR[g.door].id);
    continue;
  }
  BY_KEY[g.key] = g; BY_ID[g.id] = g; GAMES.push(g);
  if (!BY_DOOR[g.door]) BY_DOOR[g.door] = g;
}

// The games behind one door, in list order
function behind(door) { return GAMES.filter((g) => g.door === door); }

// The whole casino's stylesheet: the shared chrome first, each game's own after it, so a game can
// override the chrome but never has to repeat it
function css() {
  return casino.CSS + GAMES.map((g) => g.css || '').join('');
}

// What the webview needs to draw a list row and a panel heading. `uri` turns an asset filename
// into something the webview may load; `icon` looks a glyph up in icons.js. Both are the host's to
// resolve, so this stays free of vscode.
// A game's list picture comes one of two ways and never both: `thumb` is a painted PNG the host
// has to turn into a webview URI, `tile` is an SVG string that needs no request and no URI. The
// four original games have art, the other ten are drawn in games/tiles.js
// A game's own extra pictures, if it paints with any: a map of its own names to filenames in the
// published root, resolved here because a webview URI is the host's to make and a panel cannot ask
// for one. The mine's swinging crab is the first (games/mine/meta.js, and window.CUC.art)
function art(uri, map) {
  const out = {};
  for (const k in map) if (typeof map[k] === 'string') out[k] = uri(map[k]);
  return out;
}

function view(uri, icon) {
  return GAMES.map((g) => ({
    id: g.id, key: g.key, name: g.name, sub: g.sub,
    title: g.title, hint: g.hint, cls: g.cls || g.key,
    rowTitle: g.rowTitle || '', door: g.door,
    icon: icon(g.icon) || '', thumb: g.thumb ? uri(g.thumb) : '', tile: g.tile || '',
    art: art(uri, g.art || {})
  }));
}

// THE CROSSROADS' DOORS THAT THIS REGISTER OWNS: the ones with at least one game behind them, in
// the order DOORS declares. A door whose only game was dropped is not drawn, which is the right
// answer in both directions: a button into an empty area is worse than a missing button, and the
// game that failed to load is already named in PROBLEMS.
//
// `game` is the one game behind a side door, so the shared files never have to count: null means
// this door opens the list. The shop's door is html.js's and comes after these
function doors(uri) {
  const out = [];
  for (const d of DOORS) {
    const games = behind(d.id);
    if (!games.length) continue;
    out.push({ id: d.id, name: d.name, art: uri(d.art), game: d.id === LIST_DOOR ? null : games[0].id });
  }
  return out;
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

module.exports = {
  GAMES, BY_KEY, BY_ID, PROBLEMS, NO_ORDER,
  DOORS, LIST_DOOR, doors, behind,
  css, view, panels, createHandlers
};
