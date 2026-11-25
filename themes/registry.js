// The register of PANEL THEMES. A theme is a DIRECTORY: themes/<id>/meta.js, and nothing else.
//
// There is no list in this file and that is the whole point of it, exactly as it is in
// games/registry.js: an array with one line per theme is one line four writers edit in the same
// minute, and a lost line is a theme that is simply not there with nothing to show why. So the
// register READS the directory. Adding a theme creates its own directory and touches nothing
// shared: `styles.js`, `html.js`, `webview.js` and `extension.js` never learn a theme's name.
//
// WHAT A THEME IS, in four axes and one colour. It repaints what is BEHIND and AROUND the Usage
// card and changes nothing the card says: the bones, down to the last word, are the same panel.
//
//   frame   the card's border art. It comes in from the top corners and leaves the middle clear
//   floor   a landscape behind the bottom of the card, under the stat row
//   badge   something the mascot wears, drawn over the drawing and under the burn-rate bubble
//   motes   slow drifting specks. The stylesheet's, not a drawing's
//   accent  the one colour the bars, the ring, the glyphs and the active tab follow
//
// THE FIRST THREE ARE PICTURES AND THE LAST TWO ARE CSS, and that split is the price ladder (see
// `rungOf` below) as well as the division of labour: a drawing is something somebody has to draw.
//
// --- what this file is allowed to decide, and what it is not ------------------------------------
//
// THE PRICE IS NOT DECLARED, IT IS COUNTED. A meta carries no price at all: this file counts the
// pictures a theme ships and reads the rung off that count. A price nobody writes down is a price
// that cannot drift, and it is the same discipline the mascot shelf keeps (shop.js, PRICES: the
// rung there is the drawing's frame count, which is a measurement rather than an opinion).
//
// THE SCOPE IS CHECKED, NOT TRUSTED, AND IT IS THE USAGE TAB. Every selector a theme writes has
// to begin with its own `body.tab-usage[data-theme="<id>"]` (or with its own cell on the shelf),
// and every @keyframes it declares has to carry its own id in the name. A theme that reaches
// outside that is DROPPED with a line in PROBLEMS rather than being allowed to repaint somebody
// else's screen, and two themes cannot collide on one animation.
//
// THE TAB IS IN THE SCOPE BECAUSE THE TOKENS ARE INHERITED. A theme sets --card, --inner, --text,
// --muted, --track, --border, --iborder and --shell, and the casino's own CSS reads six of those
// (--text 25 times, --muted 21, --track 7, --iborder 6, --inner 5, --card 4). Scoped to the body
// alone, buying a theme would repaint the blackjack felt, the market and the mine, and the visual
// check this product needs would be multiplied by the length of the shelf. On any other tab the
// class is off, the tokens are gone, and every game draws in the palette it was drawn for.
//
// COLLECTED RATHER THAN THROWN, for the reason games/registry.js gives: this file is loaded at
// activation by every install, and a throw here is a sidebar that never draws. A theme that cannot
// be listed costs itself and nothing else.
'use strict';
const fs = require('fs');
const path = require('path');

// The second prefix of the shop's record (`theme:forest`). shop.js's header has said since the
// shop was written that a shop which one day sells something that is not a drawing of the crab
// needs a second prefix and not a migration; this is that day, and the mascot rows did not move
const PREFIX = 'theme';

// The ladder is the shop's and this file may not widen it: shop.js refuses to load a row priced
// off it. Imported as a literal rather than required, because shop.js requires THIS file and a
// cycle would hand it a half-built module
const PRICES = Object.freeze([1000, 10000, 100000, 1000000]);

// WHICH RUNG A THEME STANDS ON IS THE NUMBER OF PICTURES IT SHIPS, and that is the one thing about
// a theme which is not an opinion: it is how much was drawn. The frame, the floor and the badge are
// paintings; the motes and the accent are drawn by the stylesheet and cost nobody a drawing, so
// they are not counted.
//
//     free    0 pictures    the panel as it has always looked
//     1K      1 picture
//     10K     2 or 3
//     100K    4 to 7        unclaimed
//     1000K   8 or more     unclaimed
//
// A THEME STANDS ON THE HIGHEST RUNG ITS COUNT REACHES, which is the mascot shelf's rule read the
// same way: four frames is a rung and five frames is still that rung. Three pictures and two are
// therefore the same price, and they should be: the two cost about the same to draw.
//
// THE COUNTS DOUBLE WHILE THE PRICE GOES UP TENFOLD, as they do on the mascot ladder and for the
// same reason, and they start one rung lower (1 picture rather than 4) because a LAYER IS A STILL
// and a frame is one of a loop. Four frames of a crab and one painted backdrop are not the same
// amount of drawing, and pricing them as if they were is what the two ladders exist to avoid.
function rungOf(pictures) {
  if (!pictures) return 0;
  const i = Math.min(PRICES.length - 1, Math.floor(Math.log2(pictures)));
  return PRICES[i];
}

// The axes a theme may name. The first three are pictures (`rungOf` counts them); the last is the
// stylesheet's and is free. The accent is not in here because it is a colour rather than a layer
const PAINTED = Object.freeze(['frame', 'floor', 'badge']);
const LAYERS = Object.freeze(PAINTED.concat(['motes']));

// An id goes into a CSS attribute selector, a DOM attribute and a record key, so it may hold
// nothing that needs escaping in any of the three
const ID_RE = /^[a-z][a-z0-9-]{0,23}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

// WHAT AN ACCENT HAS TO CLEAR, measured rather than eyeballed. The accent colours the deltas
// (10.5px, bold) as well as the ring and the bars, so the floor is the small-text floor and not the
// graphics one. 4.5:1 against both dark surfaces the Usage card is made of.
//
// The shipped ember (#e8895a) measures 6.09:1 on --card and 6.84:1 on --inner, so this gate is
// below what the panel already does and above what WCAG asks of 10.5px text. It is checked on the
// DARK surfaces only: the light theme keeps the shipped ember unless a theme says otherwise
// (`accentLight`), because ember itself measures 2.57:1 on the light card and a gate the shipped
// panel fails is a gate nobody can pass (styles.js, --focus, which is lowered for exactly this)
const CARD_DARK = '#232326';
const INNER_DARK = '#191919';
const CARD_LIGHT = '#ffffff';
const CONTRAST_FLOOR = 4.5;

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
// Relative luminance, WCAG 2.x. Six hex digits only: the shapes above are checked before this runs
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Every theme that was found but could not be listed, as sentences. Three readers, as in
// games/registry.js: the host log at once, the output channel the user can open, and
// test/themes.test.js, which asserts this list is EMPTY
const PROBLEMS = [];
function drop(what, why) {
  const line = 'themes: ' + what + ' was not listed: ' + why;
  PROBLEMS.push(line);
  try { console.error(line); } catch (e) { /* a host with no console: PROBLEMS is still the record */ }
}

// --- the scope check ----------------------------------------------------------------------------
//
// A theme's CSS is concatenated into the page's one stylesheet, beside every game's and beside the
// panel's own. So the only thing standing between a theme and the whole product is this function,
// and it is written to UNDERSTAND LESS than a browser rather than more: anything it cannot read is
// a refusal, because a rule it waves through is a rule nobody checked.
//
// Comments go first and they have to: a comment is carried into the served stylesheet, so a
// selector written inside one would be found by the scan and a rule hidden inside one would not.
function whyNotCss(id, css) {
  if (css == null || css === '') return null;
  if (typeof css !== 'string') return 'css must be a string when it is given';
  // STRINGS GO BEFORE COMMENTS, which is the order a CSS parser uses and the order this check got
  // wrong once: with comments stripped first, a rule could write `content:"/*"` and the stripper
  // would take everything up to the next `*/` out of the scan, leaving every rule in between
  // unchecked. The same trick worked on the brace count, with `content:"{"`.
  //
  // ONLY INSIDE AN INNERMOST BLOCK, though, which is the part a blanket pattern gets wrong twice:
  // the quotes in `[data-theme="mine"]` are a SELECTOR, and so are the ones in a theme's own
  // `@media` prelude, and blanking either leaves every theme failing its own scope check. A
  // declaration can only be between a `{` and a `}` with no `{` in between, so that is the only
  // place this blanks.
  // A STRING HOLDING A BRACE IS REFUSED RATHER THAN SCANNED, which falls out of the same pattern:
  // the block it sits in stops matching, the brace count below goes wrong, and the sheet is
  // rejected as unbalanced. That is the safe direction for a case nobody has a use for.
  const src = String(css)
    .replace(/\{([^{}]*)\}/g, (all, body) => '{' + body.replace(/"[^"\n]*"|'[^'\n]*'/g, '""') + '}')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Balanced braces. Everything below walks `{` and `}` pairs, so an unbalanced sheet would be
  // scanned as something other than what the browser will parse
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth < 0) return 'its css closes a block it never opened';
  }
  if (depth !== 0) return 'its css leaves ' + depth + ' block(s) open';
  // AN AT-RULE IS ALLOWED BY NAME AND NOT BY ITS FIRST CHARACTER. This used to skip anything
  // beginning with `@`, which was written for `@media` and let `@font-face`, `@property` and
  // `@page` through with it. All three are GLOBAL: a theme could replace the panel's typeface for
  // every screen, or give `--card` an initial value, from inside its own block.
  const AT_OK = ['media', 'supports', 'keyframes'];
  let at;
  const atRe = /@([a-z-]+)/gi;
  while ((at = atRe.exec(src))) {
    if (AT_OK.indexOf(at[1].toLowerCase()) < 0) return 'its css uses @' + at[1] + ', which is not scoped to a theme';
  }
  // An animation name is global to the document, so a theme that declared `pulse` would restyle
  // the whole panel from inside its own block. Its own id in the name settles it for every theme
  // at once, and makes a collision between two themes impossible rather than unlikely
  const frames = /@keyframes\s+([^\s{]+)/g;
  let k;
  while ((k = frames.exec(src))) {
    if (k[1].indexOf('th-' + id + '-') !== 0) return 'its @keyframes "' + k[1] + '" is not named th-' + id + '-...';
  }
  // TWO SCOPES AND NO MORE. The first is the panel while this theme is worn AND THE USAGE TAB IS
  // OPEN, which is the whole of what a panel theme may repaint: the surface tokens it sets
  // (--card, --inner, --text, --muted, --track, --border, --iborder, --shell) are read by every
  // game's own CSS as well, so a theme scoped to the body alone would repaint the blackjack felt,
  // the market and the mine, and the visual check for this product would be multiplied by the
  // number of themes on the shelf. On any other tab the class is off, the tokens are gone, and
  // the games draw in the palette they were drawn for.
  // The second is the theme's own cell ON THE SHELF, which is drawn for every theme at once and so
  // cannot be under the first: a reader browsing the shop is wearing one theme and looking at
  // eight, and the shop is not the Usage tab.
  const scopes = ['body.tab-usage[data-theme="' + id + '"]', '.th-chip[data-th="' + id + '"]'];
  // ...AND A LIST OF THINGS NO SCOPE MAKES ACCEPTABLE. Scoping to the Usage tab already means a
  // rule about a game cannot be seen, because that game's screen is not on that tab. This is the
  // difference between "cannot be seen" and "cannot be written", and it is worth the four lines:
  // a selector naming another area is a theme reaching somewhere it has no business, whether the
  // cascade happens to deliver it or not
  const NEVER = ['.bj-', '#gameStage', '#panelGames', '#panelCross', '#panelShop', '#panelAgents'];
  const flat = src.replace(/@keyframes\s+[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ');
  const re = /([^{}]+)\{[^{}]*\}/g;
  let m;
  while ((m = re.exec(flat))) {
    const sel = m[1].trim();
    if (sel.charAt(0) === '@') continue;                   // the wrapper of a block scanned below it
    for (const g of sel.split(',')) {
      const one = g.trim();
      if (!one) continue;
      for (const bad of NEVER) {
        if (one.indexOf(bad) >= 0) return 'its selector "' + one + '" names ' + bad + ', which is another area of this product';
      }
      // ...and the scope has to be the WHOLE of the first compound, or body[data-theme="forest-x"]
      // would pass the check of the theme called forest
      const under = scopes.some((s) => one.indexOf(s) === 0 && /^$|^[\s>+~:.#[]/.test(one.slice(s.length)));
      if (!under) return 'its selector "' + one + '" is outside ' + scopes.join(' and ');
    }
  }
  return null;
}

// One surface a theme sets on ITSELF, read out of its own CSS. Six hex digits only, and only in
// this theme's own token block: anything else (a gradient, an rgba, a value that came in through
// another var) is not a flat surface and there is nothing to measure a ratio against, so it reads
// as absent and the shipped value stands in. A theme that paints its card with a gradient has a
// contrast this file cannot answer for; the render measurement is what answers that
// (docs/panel-themes/spec.md, section 6-2, and tools/shoot-panels.mjs --plain)
function surfaceOf(t, name) {
  const scope = 'body.tab-usage[data-theme="' + t.id + '"]';
  const src = String(t.css || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const re = new RegExp(scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^{}]*)\\}', 'g');
  let m, out = null;
  while ((m = re.exec(src))) {
    const d = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*(#[0-9a-f]{6})\\s*(?:;|$)', 'i').exec(m[1]);
    if (d) out = d[1];
  }
  return out;
}

// Why this meta cannot be listed, or null. Shape only, plus the two measurements this file owns:
// what the price has to be, and what the accent has to clear
function whyNotMeta(t) {
  if (!t || typeof t !== 'object') return 'meta.js exports no object';
  if (!ID_RE.test(t.id || '')) return 'id must be lower-case letters, digits and dashes';
  if (typeof t.name !== 'string' || !t.name) return 'name must be a non-empty string';
  if (!Array.isArray(t.layers)) return 'layers must be an array, even an empty one';
  for (const l of t.layers) {
    if (LAYERS.indexOf(l) < 0) return '"' + l + '" is not one of ' + LAYERS.join(', ');
  }
  if (new Set(t.layers).size !== t.layers.length) return 'it names a layer twice';
  if (t.price != null) return 'a theme may not price itself: the rung is counted off its pictures';
  if (t.accent != null && !HEX_RE.test(t.accent)) return 'accent must be six hex digits';
  if (t.accentHi != null && !HEX_RE.test(t.accentHi)) return 'accentHi must be six hex digits';
  if (t.accentLight != null && !HEX_RE.test(t.accentLight)) return 'accentLight must be six hex digits';
  if (t.accent) {
    // AGAINST THIS THEME'S OWN SURFACES, not against the panel's. A theme carries its own --card
    // and --inner (docs/panel-themes/spec.md, section 1), so measuring the accent against the
    // shipped grey would answer a question about a card this reader will never see. The shipped
    // values are the fallback, which is what a theme that moves no surface is drawn on.
    const card = surfaceOf(t, '--card') || CARD_DARK;
    const inner = surfaceOf(t, '--inner') || INNER_DARK;
    const onCard = contrast(t.accent, card), onInner = contrast(t.accent, inner);
    if (onCard < CONTRAST_FLOOR || onInner < CONTRAST_FLOOR) {
      return 'its accent measures ' + onCard.toFixed(2) + ':1 on its card (' + card + ') and '
        + onInner.toFixed(2) + ':1 on its inner (' + inner + '), under the '
        + CONTRAST_FLOOR + ':1 floor';
    }
    // ...and the two text tokens on the same card, which is the pair a theme is most likely to
    // get wrong: a surface it chose for the picture, with the panel's own grey left on top of it.
    // The floors are WCAG's, and the shipped panel clears both by a long way (13.3 and 4.6)
    for (const pair of [['--text', 4.5], ['--muted', 3]]) {
      const ink = surfaceOf(t, pair[0]);
      if (!ink) continue;
      const r = contrast(ink, card);
      if (r < pair[1]) {
        return pair[0] + ' measures ' + r.toFixed(2) + ':1 on its own card, under ' + pair[1] + ':1';
      }
    }
  }
  if (t.accentLight && contrast(t.accentLight, CARD_LIGHT) < 3) {
    return 'its light accent measures ' + contrast(t.accentLight, CARD_LIGHT).toFixed(2) + ':1 on white';
  }
  // A picture is a filename in the published root, resolved by the host the way a game's `art` is:
  // this module never sees a URI. A name under a layer the theme does not claim is a picture
  // nothing would draw, which is the kind of thing that is cheap here and invisible on screen
  const art = t.art || {};
  if (typeof art !== 'object') return 'art must be an object when it is given';
  for (const k in art) {
    if (PAINTED.indexOf(k) < 0) return 'art names "' + k + '", which is not a painted layer';
    if (t.layers.indexOf(k) < 0) return 'art names "' + k + '", a layer this theme does not claim';
    if (typeof art[k] !== 'string' || !art[k]) return 'art.' + k + ' must be a filename';
  }
  if (t.order != null && !Number.isFinite(t.order)) return 'order must be a number when it is given';
  return whyNotCss(t.id, t.css);
}

// The count the price is read off. A claimed layer is a picture whether its file has arrived yet or
// not: the layer is what was DESIGNED, and the CSS that draws it is the finished article rather
// than a cheaper theme.
//
// THIS IS WHY A THEME DRAWN ENTIRELY IN CSS IS NOT FREE, and it is worth saying plainly because
// the opposite was written down once (docs/panel-themes/spec.md, 9-2, which says a CSS edition
// ships no pictures and therefore costs nothing). It does not follow. Counting `art` would price
// every theme in this directory at zero today and then reprice the whole shelf, upward, on the day
// the drawings landed -- under readers who had already bought one. The rung is a measurement of
// the work, and the work is the same work whichever file format it ends up in.
function picturesOf(t) {
  return t.layers.filter((l) => PAINTED.indexOf(l) >= 0).length;
}

function normalize(t) {
  const pictures = picturesOf(t);
  return Object.freeze({
    id: t.id,
    name: t.name,
    // the shop's row: `key` is what the wire and the catalog use, `slot` what the record holds
    key: t.id,
    slot: PREFIX + ':' + t.id,
    price: rungOf(pictures),
    pictures: pictures,
    layers: Object.freeze(t.layers.slice()),
    accent: t.accent || '',
    accentHi: t.accentHi || t.accent || '',
    accentLight: t.accentLight || '',
    art: Object.freeze(Object.assign({}, t.art)),
    css: t.css || '',
    order: Number.isFinite(t.order) ? t.order : Number.MAX_SAFE_INTEGER
  });
}

// One readdirSync, at require time, exactly as the games' register does it and for the same reasons
// (the activation path, a .vsix unpacked to a real directory, a window reload to pick up a new one)
function discover() {
  let ents;
  try { ents = fs.readdirSync(__dirname, { withFileTypes: true }); }
  catch (e) {
    drop('themes/', 'the directory could not be read: ' + (e && e.message));
    return [];
  }
  const found = [];
  for (const ent of ents) {
    if (ent.isFile()) continue;                 // registry.js and README.md
    const meta = path.join(__dirname, ent.name, 'meta.js');
    if (!fs.existsSync(meta)) continue;         // a directory that does not claim to be a theme
    let t;
    try { t = require(meta); }
    catch (err) { drop(ent.name, 'meta.js threw on load: ' + (err && err.message)); continue; }
    const why = whyNotMeta(t);
    if (why) { drop(ent.name, why); continue; }
    found.push(normalize(t));
  }
  // `order` first, then the id, for the reason the games' register sorts: readdirSync's order is
  // the file system's and differs between APFS, ext4 and a .vsix unpacked by another version, and a
  // shelf that is in a different order in every window is a shelf nobody can learn
  found.sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found;
}

const THEMES = [];
const BY_ID = Object.create(null);     // null-prototype: these are keyed by directory names
let FREE = '';
for (const t of discover()) {
  if (BY_ID[t.id]) { drop(t.id, 'the id is already taken'); continue; }
  // EXACTLY ONE THEME IS FREE, and it is the fallback every reader who has bought nothing is on.
  // A second free one is a theme somebody forgot to draw rather than a second default: it would
  // have no price, nothing to press and no way to tell it from the panel as it ships
  if (!t.price) {
    if (FREE) { drop(t.id, 'it ships no pictures, and ' + FREE + ' is already the free theme'); continue; }
    FREE = t.id;
  }
  BY_ID[t.id] = t; THEMES.push(t);
}
if (!FREE && THEMES.length) drop('themes/', 'no theme is free, so a reader who has bought nothing has nothing to be on');

function themeOf(id) { return (typeof id === 'string' && BY_ID[id]) || null; }

// --- what goes into the page ---------------------------------------------------------------------

// WHAT AN ACCENT TOUCHES IS WRITTEN HERE AND NOT IN FIVE METAS. A theme declares a colour; this
// turns it into the rules that colour reaches, so every theme reaches exactly the same places and
// a theme that wanted one more would have to say so in this file where it can be argued about.
//
// THE ACTIVE TAB IS NOT IN HERE and was, for one version. It is a plate with a word on it, so a
// theme that wanted an accent chip there needs TWO values (the plate and the ink on it) and the
// stylesheet carries both as tokens with the shipped panel's own values as defaults
// (styles.js, --tabon and --tabonink). A generated `color:var(--accent)` beside those would win
// the cascade over a theme's own ink and put the accent on the accent.
function accentCss(t) {
  if (!t.accent) return '';
  const s = 'body.tab-usage[data-theme="' + t.id + '"]';
  return s + '{--accent:' + t.accent + ';--accent-hi:' + t.accentHi + ';}'
    // ...and the shop cell that sells this theme, which is drawn whatever theme is being worn. The
    // cell cannot show a panel, so what it carries is the accent; the theme's own CSS adds its
    // card colour and its backdrop beside it (styles.js, .th-chip)
    + '.th-chip[data-th="' + t.id + '"]{--accent:' + t.accent + ';--accent-hi:' + t.accentHi + ';}'
    + (t.accentLight ? 'body.vscode-light' + s.slice('body'.length) + '{--accent:' + t.accentLight
      + ';--accent-hi:' + t.accentLight + ';}' : '');
}

// ...AND WHAT A FLOOR COSTS THE CHROME, for the same reason. A landscape behind the bottom of the
// card is behind an OPAQUE panel (styles.js, .inner and .stat both paint a background), so a theme
// with a floor has to make that chrome see-through or it has painted something nobody will see.
// Written once here, so five themes do not each carry the same four lines and drift apart.
//
// WHAT A THEME DOES TO THE PANEL'S OWN CHROME IS THE THEME'S, and it is not generated here. It
// was for one version, three lines per theme that made the Usage panel and the stat row
// see-through so a floor could be seen through them. That came out: the chrome a theme moves is
// seven or eight declarations rather than three (the stat row's separators have to move from the
// ROW to the TILES, or the row's background stops being a hairline and becomes a plate across the
// whole of it), and the stylesheet now carries every one of them as a token with the shipped
// panel's value as its default. A theme sets the tokens; nothing is written on its behalf.

// The whole shelf's stylesheet: what this file generates from each theme's data first, then each
// theme's own, so a theme can override what was generated for it and never has to repeat it
function css() {
  return THEMES.map((t) => accentCss(t) + t.css).join('');
}

// THE ONE SWAP POINT BETWEEN A PLACEHOLDER AND A DRAWING. A theme names its pictures in `art`, the
// host resolves each one into a webview URI (a URI is the host's to make and this module never sees
// one), and the layer reads it as a custom property: `--th-frame`, `--th-floor`, `--th-badge`.
//
// So a theme painted in CSS today becomes a theme painted in PNG by naming the file here and
// writing `background-image:var(--th-frame)` where the gradient was. Nothing else moves: not this
// file, not the stylesheet, not the markup, not the price (the rung was counted off the LAYER and
// not off the file, so it does not change the day the drawing lands).
//
// Empty while no theme ships a picture, which is today: zero bytes in the page until there is one
function artCss(uri) {
  let out = '';
  for (const t of THEMES) {
    const vars = Object.keys(t.art).map((k) => '--th-' + k + ':url(' + uri(t.art[k]) + ');').join('');
    if (vars) out += 'body[data-theme="' + t.id + '"]{' + vars + '}';
  }
  return out;
}

// The shelf, as the shop sells it: the catalog rows, in shelf order. shop.js concatenates these
// onto its own catalog under the second prefix and prices nothing itself
function items() {
  return THEMES.map((t) => ({ key: t.key, slot: t.slot, name: t.name, price: t.price }));
}

module.exports = {
  THEMES: Object.freeze(THEMES), BY_ID: Object.freeze(BY_ID), PROBLEMS, PREFIX, PRICES, LAYERS, PAINTED, FREE,
  CONTRAST_FLOOR, CARD_DARK, INNER_DARK, CARD_LIGHT,
  themeOf, items, css, artCss, rungOf, contrast, surfaceOf, whyNotCss, whyNotMeta
};
