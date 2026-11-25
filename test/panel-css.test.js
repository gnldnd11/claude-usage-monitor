// The panel's own stylesheet and markup, read as rules rather than as a diff.
//
// WHY THIS SUITE EXISTS. Everything it checks is a property of the RENDERED page, and nothing in
// this repository renders a page in `npm test`: the webview harness runs the real scripts on the
// real markup but minidom has no layout and no cascade. So this reads the two files that decide
// those properties (styles.js and html.js) and derives the outcome from them, together with real
// inputs where there are any: the four mascot PNGs are measured out of their own headers, which is
// exactly why a height that depends on the picture cannot pass here.
//
// WHAT IT IS NOT. It is a gate, not the measurement. It reads declarations and matches selectors
// structurally (minidom knows no cascade and no pseudo-classes), so where it counts things it can
// only undercount: a rule it cannot read, or one that loses the cascade, is left out. The authority
// on what the page renders is the browser, through `tools/shoot-panels.mjs --probe`, and the one
// number here that cannot be fooled by any of that is the mascot's geometry, which is computed from
// the PNGs themselves.
//
// It is also not a copy of the fix. Each check is a rule that several implementations would satisfy
// and the shipped one before 1.32.0 would not:
//   1. the Usage tab renders six type sizes, the number docs/game-panels.md section 2 fixed
//   2. the six mascot drawings come out the same height, whatever each drawing's own ratio is
//   3. the cut between two states moves the sprite and nothing else
//   4. a narrow sidebar drops a section's extras, never the section's name
//   5. the session has one showing, and the time left in the window is still on the page
'use strict';
const fs = require('fs');
const path = require('path');
const { createDocument } = require('./webview/minidom');

const ROOT = path.join(__dirname, '..');
let fails = 0;
function ok(name, cond, extra) { console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  | ' + extra : '')); if (!cond) fails++; }

// ---------------------------------------------------------------------------------------------
// the two files, as data
// ---------------------------------------------------------------------------------------------

// Comments go first and they have to: a comment is carried into the served stylesheet, so a rule
// written about "the old 13px" would be found by any check that greps for a number
const CSS = require(path.join(ROOT, 'styles.js')).replace(/\/\*[\s\S]*?\*\//g, ' ');

// Every { selectors : declarations } pair, at-rules included: a rule nested in a @media or a
// @keyframes comes out as itself, without the wrapper, because the wrapper has a brace of its own
// and this only matches an innermost pair. Where the wrapper matters (reduced motion, the beat's
// frames) it is read with blocks() below instead.
// `at` says the rule sits inside an at-rule block, which makes it CONDITIONAL: the
// reduced-motion copy of .sparkle.beat says animation:none and applies only to a reader who asked
// for that, so it may not be merged with the unconditional rule of the same name (declOf below).
function atRanges(css) {
  const out = [];
  const re = /@[a-z-]+[^{]*\{/gi;
  let m;
  while ((m = re.exec(css))) {
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}' && --depth === 0) break; }
    out.push([m.index, j]);
    re.lastIndex = j;      // at-rules are not nested in this stylesheet
  }
  return out;
}
function rules(css) {
  const out = [];
  const ranges = atRanges(css);
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    out.push({ sel: m[1].trim(), body: m[2], at: ranges.some((r) => m.index > r[0] && m.index < r[1]) });
  }
  return out;
}
const RULES = rules(CSS);

// The inside of every at-rule block whose head starts with `needle`, by counting braces
function blocks(css, needle) {
  const out = [];
  let i = 0;
  for (;;) {
    const at = css.indexOf(needle, i);
    if (at < 0) break;
    const open = css.indexOf('{', at);
    if (open < 0) break;
    let depth = 0, j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}' && --depth === 0) break;
    }
    out.push(css.slice(open + 1, j));
    i = j + 1;
  }
  return out;
}

function decls(body) {
  const d = {};
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i > 0) d[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return d;
}
// The declarations written for exactly this selector: every UNCONDITIONAL rule with it, merged in
// source order with the later one winning, which is what the browser does. .ringbox is declared
// once for its layout and again where the fold's transitions are collected, and reading only the
// first of the two said the fold had no height to animate down from.
function declOf(sel) {
  const rs = RULES.filter((x) => x.sel === sel && !x.at);
  if (!rs.length) return null;
  return rs.reduce((acc, r) => Object.assign(acc, decls(r.body)), {});
}
const groups = (sel) => sel.split(',').map((g) => g.trim()).filter(Boolean);
const lastCompound = (group) => group.trim().split(/\s+/).pop();

// The page the host renders, with the asset URIs standing in for themselves
const PAGE = require(path.join(ROOT, 'html.js')).renderHtml({
  csp: '*', scriptUri: 'webview.js', crabUri: 'crab.png',
  mascotIdleUri: 'mascot-idle.png', mascotWorkingUri: 'mascot-working.png',
  mascotDespairUri: 'mascot-despair.png', mascotStunnedUri: 'mascot-stunned.png',
  mascotCodingUri: 'mascot-coding.png', mascotFloatUri: 'mascot-float.png',
  mascotSleepUri: 'mascot-sleep.png', mascotBlackholeUri: 'mascot-blackhole.png',
  // the crossroads' doors, as the host hands them over (games/registry.js's `doors`), with the
  // asset names standing in for themselves
  doors: require(path.join(ROOT, 'games/registry.js')).doors((f) => f),
  heroShopUri: 'hero-shop.png',
  roomMinecraftUri: 'room-minecraft.png',
  assetsJson: '{}', gameList: [], gameScripts: []
});
const DOC = createDocument(PAGE);

// ---------------------------------------------------------------------------------------------
// 1. the Usage tab's type sizes
// ---------------------------------------------------------------------------------------------
// docs/game-panels.md, section 2: six sizes and no more. 22 is the hero figure, 16 the brand,
// 12.5 a section heading, 12 a value, 11 a label, 10.5 the supporting line.
const SIZES = [22, 16, 12.5, 12, 11, 10.5];

// What the Usage tab is MADE of, taken off the page rather than listed here: the card header, the
// tab switcher and #panelUsage. Everything after it belongs to another tab or to an overlay.
//
// A rule counts if it MATCHES something in there, not if it merely mentions one of those class
// names: `.d` is the pulsing dot in this header and also a column in the weekly modal, and a name
// test put the modal's 10px on this tab's bill. So the selector is run against the page.
const ROOTS = [DOC.querySelector('.head'), DOC.querySelector('.tabs'), DOC.getElementById('panelUsage')].filter(Boolean);
const REGION = PAGE.slice(PAGE.indexOf('<div class="head">'), PAGE.indexOf('<div class="inner agents"'));

let skipped = 0;
function touchesRegion(sel) {
  // minidom matches structure, not state: a pseudo-class is dropped (`:not()` it does understand)
  // and a child or sibling combinator is widened to a descendant, which can only ever match MORE
  const clean = sel
    .replace(/::?(?!not\()[a-z-]+(\([^)]*\))?/gi, '')
    .replace(/[>+~]/g, ' ')
    .trim();
  if (!clean) return false;
  for (const g of clean.split(',')) {
    let found = [];
    try { found = DOC.querySelectorAll(g.trim()); } catch (e) { skipped += 1; continue; } // minidom cannot read it
    if (found.some((e) => ROOTS.some((r) => r === e || r.contains(e)))) return true;
  }
  return false;
}

const sizesSeen = new Map();   // px -> the selectors that ask for it
for (const r of RULES) {
  const fs2 = decls(r.body)['font-size'];
  if (!fs2 || !/px$/.test(fs2)) continue;
  if (!touchesRegion(r.sel)) continue;
  const px = parseFloat(fs2);
  (sizesSeen.get(px) || sizesSeen.set(px, []).get(px)).push(r.sel);
}
// html.js writes two sizes inline (the sign-in bar), which no stylesheet rule would catch
const inlineSizes = (REGION.match(/font-size:\s*[\d.]+px/g) || []).map((s) => parseFloat(s.replace(/[^\d.]/g, '')));
for (const px of inlineSizes) (sizesSeen.get(px) || sizesSeen.set(px, []).get(px)).push('(inline, html.js)');

const kinds = [...sizesSeen.keys()].sort((a, b) => b - a);
const strays = kinds.filter((px) => SIZES.indexOf(px) < 0);
// This count can only be LOW, never high: a rule the matcher cannot read is left out, and so is a
// rule that loses the cascade. A size it names is therefore really on the tab and a size it misses
// may not be, which is why the browser is the authority (see the header) and this is the gate.
if (skipped) console.log('note: ' + skipped + ' selector(s) the matcher could not read were left out');
ok('the Usage tab renders six type sizes or fewer', kinds.length <= SIZES.length, kinds.join(' / '));
ok('and every one of them is one of the six the panels agree on',
  strays.length === 0, strays.map((px) => px + 'px: ' + sizesSeen.get(px).join(', ')).join(' | '));

// ---------------------------------------------------------------------------------------------
// 2. the mascot: four pictures, one height
// ---------------------------------------------------------------------------------------------
// A PNG says how big it is in its own header, and an APNG is a PNG: bytes 16..23 of the file are
// the IHDR's width and height. This is the real input, so a layout that reads it comes out
// different per state and a layout that does not comes out the same.
//
// THE HEADER IS THE CANVAS AND THE CANVAS IS NOT THE DRAWING, which this file learned the hard way:
// two of the six were padded out with transparency on 2026-11-19 to bring the crab down to the size
// of the other four, the padding kept each canvas's ratio, and so every number derived from a header
// came out unchanged and every check here passed while the bubble on the screen was left pointing
// at the new empty space. So the geometry below comes in two kinds and they are kept apart:
// `pngSize` for what the BOX does with a canvas, and test/apng.js, which decodes the frames, for
// where the ink inside it starts.
function pngSize(name) {
  const b = fs.readFileSync(path.join(ROOT, name)).subarray(0, 24);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
const apng = require('./apng');
const INK = {};   // per state: the canvas, the frame count, and the ink's union over the frames
// EIGHT, not four: the activity axis added `coding` and `float` beside the four steps, the quiet
// scene took a second drawing (`sleep`), and `blackhole` belongs to no step or scene at all and
// covers whatever is there for four seconds now and then (webview.js, the cameo). It is in here
// because it goes into the SAME BOX through the same attribute, so every geometry rule below
// applies to it exactly as it does to a scene's drawing. Eight ratios, 0.84 to 1.78, and every
// number is computed out of these files' own headers, so a ninth fails here rather than on screen.
const STATES = ['mascot-idle.png', 'mascot-working.png', 'mascot-despair.png', 'mascot-stunned.png',
  'mascot-coding.png', 'mascot-float.png', 'mascot-sleep.png', 'mascot-blackhole.png'];

const wrap = declOf('.mascot-wrap') || {};
const img = declOf('.sparkle') || {};
// What the browser lays the <img> out at. Only two cases exist here: a height that is a length (or
// the whole of a box that is one) is the same for every picture, and `auto` is the width divided by
// that picture's own ratio, which is not.
function renderedHeight(state) {
  const px = (v) => (v && /^[\d.]+px$/.test(v) ? parseFloat(v) : null);
  const boxH = px(wrap.height);
  if (img.height === '100%') return boxH;
  if (px(img.height) != null) return px(img.height);
  const w = px(img.width);
  const s = pngSize(state);
  return w == null ? null : w / (s.w / s.h);
}
const heights = STATES.map(renderedHeight);
ok('the eight mascot drawings lay out at one height',
  heights.every((v) => v != null) && new Set(heights).size === 1,
  STATES.map((s, i) => s.replace(/^mascot-|\.png$/g, '') + ' ' + heights[i]).join(', '));
ok('and that height is the box’s, so no state can move what is under it',
  parseFloat(wrap.height) > 0 && heights[0] === parseFloat(wrap.height), 'box ' + wrap.height);
// the floor: the drawing is fitted whole into the box and sat on its bottom edge, which is what
// makes every state stand on the same line instead of being centred at four different sizes
ok('the drawing is fitted into the box rather than cropped or stretched', img['object-fit'] === 'contain', img['object-fit']);
ok('and it stands on the bottom of it', /bottom/.test(img['object-position'] || ''), img['object-position']);

// ---------------------------------------------------------------------------------------------
// 2a. the burn-rate bubble: it points at the crab, which is not the same as pointing at the canvas
// ---------------------------------------------------------------------------------------------
// One box, six drawings, six different places the ink starts. `contain` scales each canvas until it
// fits and `bottom` puts the slack above it, and then the drawing starts wherever its own
// transparent padding ends. The bubble's tail points down, so it is placed against the ink, and
// every figure below is READ OUT OF THE FILE: the canvas from the header, the ink by decoding every
// frame (test/apng.js). A redrawn mascot, a padded canvas or a moved crab therefore fails here.
const boxW = parseFloat(img.width), boxH2 = parseFloat(wrap.height);
const scaleOf = (p) => Math.min(boxW / p.w, boxH2 / p.h);
const paintedH = (state) => { const p = pngSize(state); return p.h * scaleOf(p); };
const warnBase = parseFloat((declOf('.mwarn') || {}).top);
const warnFor = (state) => {
  const r = RULES.filter((x) => /\.mwarn/.test(x.sel) && x.sel.indexOf('[data-state="' + state + '"]') >= 0)[0];
  return r ? parseFloat(decls(r.body).top) : warnBase;
};
for (const file of STATES) {
  const state = file.replace(/^mascot-|\.png$/g, '');
  let r = null;
  try { r = apng.read(path.join(ROOT, file)); } catch (e) { r = null; ok('the frames of ' + state + ' can be read', false, e.message); }
  if (!r) continue;
  INK[state] = r;
  const k = scaleOf(r);
  // every frame decoded, because an ink box taken from some of them is a bound that holds for some
  // of them
  ok('every frame of ' + state + ' was decoded (' + r.frames + ')', r.drawn === r.frames,
    r.drawn + ' of ' + r.frames);
  // AND IT IS STILL AN ANIMATION. Two of these files were rebuilt once already, to pad their
  // canvases, and a rebuild is where a frame count, a delay or the loop quietly goes missing.
  //
  // STUNNED PLAYS ONCE, and that is the drawing's meaning rather than a defect: the crab falls over
  // and stays down. The panel knows it, which is why poking it re-arms the file by dropping the
  // frame and setting the source again (webview.js), and why that state is the only one with a
  // pointer cursor on it (test/webview/games/_usage.js). Every other state loops for ever, or the
  // mascot is a still picture a second after the panel opens.
  const forever = state !== 'stunned';
  ok('and ' + state + (forever ? ' loops for ever' : ' plays its collapse once, as it is meant to'),
    r.frames >= 2 && r.plays === (forever ? 0 : 1)
    && r.delays.length === r.frames && r.delays.every((ms) => ms > 0),
    r.frames + ' frames, plays ' + r.plays + ', ' + r.delays.join('/') + 'ms');
  // the canvas sits on the box's floor; the ink starts further down by its own padding
  const canvasTop = boxH2 - r.h * k;
  const inkTop = canvasTop + r.ink.top * k;
  const want = inkTop + warnBase;        // the drawing's top edge, plus the bubble's own lift
  ok('the warning bubble points at the crab’s head in ' + state,
    Math.abs(warnFor(state) - want) < 1,
    'rule ' + warnFor(state) + 'px, ink at ' + inkTop.toFixed(2) + 'px'
      + (r.ink.top ? ' (' + (r.ink.top * k).toFixed(2) + 'px of that is padding inside a canvas drawn at ' + canvasTop.toFixed(2) + ')' : '')
      + ', ink moves ' + (r.spread * k).toFixed(2) + 'px over the animation');
  // AND IT POINTS AT THE MIDDLE OF IT. The bubble is centred on the box (left:50%), so a drawing
  // sitting off-centre inside its own canvas would be pointed at beside the head rather than above
  const inkMidX = (boxW - r.w * k) / 2 + ((r.ink.left + r.ink.right + 1) / 2) * k;
  ok('and at the middle of it in ' + state, Math.abs(inkMidX - boxW / 2) <= 2,
    'ink centre ' + inkMidX.toFixed(2) + ', box centre ' + (boxW / 2));
}
// The whole point of reading the pixels: a canvas says nothing about this. Two of the six are
// mostly padding, and if the test ever stops being able to tell that, it is back to passing while
// the screen is wrong
const padded = Object.keys(INK).filter((s) => INK[s].ink.top > 0);
ok('the ink is found inside the canvas, not assumed to fill it', padded.length >= 2,
  Object.keys(INK).map((s) => s + ' +' + INK[s].ink.top).join(' '));

// The page NAMES all six, because the script only ever swaps `src` for one of the drawings it was
// handed: a state with no data-* of its own would leave the picture on whatever was there before
const mascotEl = DOC.getElementById('mascot');
const named = STATES.map((f) => f.replace(/^mascot-|\.png$/g, ''));
ok('the page hands the script all eight drawings by name, each pointing at its own file',
  named.every((s, i) => mascotEl.getAttribute('data-' + s) === STATES[i]),
  named.map((s) => s + '=' + mascotEl.getAttribute('data-' + s)).join(' '));

// ---------------------------------------------------------------------------------------------
// 2a-ii. the drawings against the floor they stand on
// ---------------------------------------------------------------------------------------------
// WHY THIS IS NOT COVERED BY ANYTHING ABOVE. Section 2a reads the pixels and every check it makes
// is about WHERE they are. None of them looks at what colour they are, so all of them passed
// while mascot-coding's keystrokes sat at 1.21:1 on the dark card: the same colour as the floor,
// at full alpha, in the one state the panel shows while the reader is working. A user reported it;
// no test could have.
//
// THE CONTRACT IS TWO-WAY, and it is two-way because of what happened next. The first fix put the
// edge on .sparkle, .sh-pic and #shArt, which is to say on all six drawings. Three of them measure
// 5:1 and up, needed nothing, and came back with a grey rim around the whole crab, worst in the
// shop's 36px cells. Testing only "the dim ones are lifted" would have passed that happily. So:
//
//   at or above 3:1 on the dark card   the drawing MUST NOT be lifted
//   below 3:1                          the drawing is lifted, OR html.js records why it is not
//
// Both halves are needed. The first stops the next person lifting everything again; the second
// stops a drawing being dropped by silence, and it is what makes a redrawn mascot fail here rather
// than on screen. The figures come out of the PNGs (test/apng.js), never out of this comment.
const DARK_CARD = [0x23, 0x23, 0x26];                                   // --card, dark themes
// 3:1 is the floor for a graphical object that has to be made out. The drawings sit either side of
// it by a mile, not by a hair: the three that fail measure 1.21 to 1.33 and the three that pass
// measure 4.97 to 15.67, so nothing here turns on where exactly the line is drawn.
const FLOOR = 3;
const dimmest = {};
for (const file of STATES) {
  const state = file.replace(/^mascot-|\.png$/g, '');
  let m = null;
  try { m = apng.marks(path.join(ROOT, file), DARK_CARD, 20); } catch (e) { m = null; }
  if (!m || !m.length) { ok('the marks of ' + state + ' can be measured', false); continue; }
  dimmest[state] = Math.min(...m.map((k) => k.peak));
}
const measured = Object.keys(dimmest);
ok('every drawing is measured against the dark card, not assumed to read on it',
  measured.length === STATES.length,
  measured.map((s) => s + ' ' + dimmest[s].toFixed(2) + ':1').join(', '));

// what the page says it does, read off the element that carries it rather than out of html.js's
// source: this is the value the webview will actually see
const lift = ((DOC.getElementById('mascot') || { getAttribute: () => '' }).getAttribute('data-lift') || '')
  .split(' ').filter(Boolean);
const declined = Object.keys(require(path.join(ROOT, 'html.js')).INK_LIFT_DECLINED || {});

const below = measured.filter((s) => dimmest[s] < FLOOR);
const above = measured.filter((s) => dimmest[s] >= FLOOR);
// ONE: nothing that reads may be lifted. This is the half that would have caught the sticker.
const wrongly = above.filter((s) => lift.indexOf(s) >= 0 || declined.indexOf(s) >= 0);
ok('a drawing that clears ' + FLOOR + ':1 on the dark card is left alone', wrongly.length === 0,
  above.map((s) => s + ' ' + dimmest[s].toFixed(2)).join(', ')
    + (wrongly.length ? '  | LIFTED ANYWAY: ' + wrongly.join(' ') : ''));
// TWO: nothing that fails may be passed over without saying so
const unanswered = below.filter((s) => lift.indexOf(s) < 0 && declined.indexOf(s) < 0);
ok('and one that does not is either lifted or written down as a decision not to',
  unanswered.length === 0,
  below.map((s) => s + ' ' + dimmest[s].toFixed(2) + ' -> '
    + (lift.indexOf(s) >= 0 ? 'lifted' : declined.indexOf(s) >= 0 ? 'declined' : 'unanswered')).join(', ')
    + (unanswered.length ? '  | NEITHER: ' + unanswered.join(' ') : ''));
ok('and the two lists do not both claim the same drawing',
  lift.every((s) => declined.indexOf(s) < 0), lift.join(' ') + ' vs ' + declined.join(' '));

// The stylesheet carries ONE rule and it names no drawing, because which pictures are lifted is a
// measurement and belongs where the measurement is written down (html.js, INK_LIFT). A selector
// naming .sparkle or a state would put the list in two places, which is how it came to be wrong.
const lifted = RULES.filter((r) => /filter\s*:\s*url\(#/.test(r.body) && !r.at);
const sels = lifted.map((r) => r.sel).join(' , ');
ok('the lift is one rule on one class, with no drawing named in the stylesheet',
  lifted.length === 1 && /\.ink-lift\s*$/.test(groups(lifted[0].sel)[0] || '')
    && !STATES.some((f) => sels.indexOf(f.replace(/^mascot-|\.png$/g, '')) >= 0),
  sels);
// ...AND IT ASKS ABOUT THE SURFACE RATHER THAN ABOUT THE EDITOR, which is the same question until
// a PANEL THEME carries its own card and a different one afterwards. It read
// body:not(.vscode-light) until 2026-11-26: a reader on a LIGHT editor wearing a dark theme kept
// that class, so the lift never ran and the ink that measures 18.6:1 on the light card measured
// 1.1:1 on the theme's dark one. ink-dark is written by whatever knows the surface (webview.js,
// which reads the card's own colour), so the light panel is still left exactly as it was AND a
// dark theme is covered wherever it is worn.
ok('and it is guarded by what the SURFACE is, not by what the editor is',
  groups(lifted[0] ? lifted[0].sel : '').every((g) => /^body\.ink-dark\b/.test(g.trim())),
  sels);
// ...and the same question, the same class, on the other rule that asked it
const roomPlate = RULES.filter((r) => /\.ws-room\s*$/.test(r.sel) && /background/.test(r.body)
  && /vscode-light|ink-dark/.test(r.sel));
ok('and the room plate follows the surface too, for the same reason',
  roomPlate.length === 1 && /ink-dark/.test(roomPlate[0].sel) && !/vscode-light/.test(roomPlate[0].sel),
  roomPlate.map((r) => r.sel).join(' , ') || '(no rule)');

// the rule names a filter; the page has to contain it, or the declaration is a no-op that no
// string check would notice
const ids = [...new Set(lifted.map((r) => (r.body.match(/filter\s*:\s*url\(#([A-Za-z0-9_-]+)\)/) || [])[1]).filter(Boolean))];
ok('the filter the stylesheet names is in the page', ids.length > 0 && ids.every((id) => DOC.getElementById(id)),
  ids.join(' '));

// MEASURED, NOT GUESSED, and the reason this check exists at all: a <filter> inside a
// display:none subtree still resolves, but Chrome computes its flood-color as the initial BLACK.
// The edge then comes out black on a black floor and the whole rule silently does nothing. The
// first version of this fix hid the holder with display:none, the same way games/casino.js hides
// the symbol sprite, and that is exactly what it did.
const fx = declOf('.cuc-fx') || {};
ok('the element holding it is out of the way without being display:none',
  !!DOC.querySelector('.cuc-fx') && fx.display !== 'none' && fx.position === 'absolute',
  JSON.stringify(fx));

// the edge is a theme colour and theme colours are tokens here, so a reader changing --muted
// changes this with it rather than leaving a second grey behind
const flood = declOf('#cucInkFlood') || {};
ok('and its colour is one of this file’s tokens rather than a new grey',
  /^var\(--[a-z-]+\)$/.test(flood['flood-color'] || ''), flood['flood-color']);

// ---------------------------------------------------------------------------------------------
// 2b. the crab's axis: one ladder, and no limit anywhere near it
// ---------------------------------------------------------------------------------------------
// A source-shape check, like the freshness writer below, and for the same reason: nothing here
// renders a page, and two of the three things below are properties of the SOURCE rather than of
// any one rendering.
//
// WHAT THIS IS FOR NOW (2026-11-24). The crab used to be measured against a limit, and the whole
// of the change is that it is measured against WORK instead: `drive`, which is the last hour of
// replies priced and decayed (drive.js), and nothing else. The limits all stayed exactly where
// they were, which means the only thing keeping the two apart is that nobody wires them back
// together. That is not a thing a rendering can check, so it is checked here, on the source: the
// functions that decide which crab is drawn may not mention a limit at all.
const CLIENT0 = fs.readFileSync(path.join(ROOT, 'webview.js'), 'utf8');
// the body of a top-level function in webview.js's one IIFE: two-space indent, so the closing
// brace is the first line that is exactly '  }'
const bodyOf = (name) => {
  const re = new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}');
  const m = re.exec(CLIENT0);
  return m && m[0];
};
// the threshold is counted off this reader's own transcripts (docs/shop-spec.md, section 5-2), so a
// second copy of it is a second answer to "is anything being answered at all"
ok('the quiet threshold is defined once and read once',
  (CLIENT0.match(/QUIET_MS/g) || []).length === 2, (CLIENT0.match(/QUIET_MS/g) || []).length + ' mention(s)');
// NO LIMIT REACHES THE CRAB. Every function on the path from a push to a drawing, each read whole:
// a limit named in any of them is the old two-axis product coming back. `paintMascot` is on the
// list because it is where the last one was found (it decided whether the crab had been drawn yet
// from whether a usage reading had arrived, which is what made the crab wait on the network)
const AXIS_FNS = ['mascotState', 'driveStep', 'mascotQuiet', 'mascotArt', 'paintMascot'];
for (const name of AXIS_FNS) {
  const body = bodyOf(name);
  const found = body && (body.match(/\bfh\b|\bsd\b|used_percentage/g) || []);
  ok(name + ' decides the crab without reading a limit',
    !!body && found.length === 0, body ? 'it reads ' + (found || []).join(' ') : name + ' not found');
}
// ...and the one place a rung is turned into a reading, for the same reason: `drive` and the clock
// are the only two inputs the crab has
const state = bodyOf('mascotState');
ok('and the rung is picked by the drive and the clock, which are the only two inputs it has',
  !!state && /\bdrive\b/.test(state) && /mascotQuiet/.test(state), state || 'mascotState not found');
// the ladder is FIVE RUNGS WITH ONE DRAWING EACH, not four steps with two columns. The second
// column was the activity axis, and it is the bottom rung now
const art = /var MASCOT_ART = \{[\s\S]*?\n  \};/.exec(CLIENT0);
const RUNGS = { quiet: 'idle', typing: 'coding', work: 'working', burn: 'despair', spent: 'stunned' };
ok('the fallback table is five rungs, each with one drawing',
  !!art && Object.keys(RUNGS).every((k) => new RegExp('\\b' + k + ": '" + RUNGS[k] + "'").test(art[0]))
  && !/busy:|quiet: \{/.test(art[0]), art ? art[0].replace(/\s+/g, ' ') : 'MASCOT_ART not found');
// AND THOSE FIVE NAMES ARE THE SHOP'S FIVE SCENES, which is what makes the map between them the
// identity and is the whole reason the second table could go. A sixth scene, or a renamed one,
// has to fail here rather than silently stop reaching a rung (webview.js, mascotArt)
const SHOP_SLOTS = require(path.join(ROOT, 'shop.js')).SLOTS;
ok('and they are the shop’s own scenes, in the same order, with the same free drawings',
  SHOP_SLOTS.map((s) => s.id).join(' ') === Object.keys(RUNGS).join(' ')
  && SHOP_SLOTS.every((s) => s.free === RUNGS[s.id]),
  SHOP_SLOTS.map((s) => s.id + '=' + s.free).join(' '));

// ---------------------------------------------------------------------------------------------
// 2c. the crossroads: one box, three drawings, one height
// ---------------------------------------------------------------------------------------------
// The doors used to give each picture the whole column and let its own ratio decide its height, so
// the shop stood 21.5px taller than the dealer and both ran wall to wall. Now the box is the column
// at a fixed ratio and each drawing is fitted into it, which makes the heights equal and turns the
// width each one does not need into air (docs/shop-spec.md, section 2-2).
//
// THAT ONLY HOLDS WHILE EVERY DRAWING IS NARROWER THAN THE BOX. A hero wider than the box ratio
// binds on width instead, comes out shorter than its neighbours and the set stops reading as a set.
// The user redraws these pictures, so the condition is checked against the files themselves rather
// than written down: a hero with a wider canvas fails here, not on screen. The box came down from
// 2/1 to 1.7/1 when the third door arrived (section 2-7), which tightened this by 11%: the widest
// drawing is 1.534 and the box is 1.7.
//
// THE LIST OF THEM IS THE PAGE'S OWN, so a fourth door is covered the day it is drawn rather than
// the day somebody remembers this file.
const crArt = declOf('.cr-art') || {};
const crImg = declOf('.cr-art img') || {};
const boxRatio = (() => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*$/.exec(crArt['aspect-ratio'] || '');
  return m ? parseFloat(m[1]) / (m[2] ? parseFloat(m[2]) : 1) : null;
})();
// Read off the page rather than listed: every door's drawing, in the order they stand in
const HEROES = [...PAGE.matchAll(/<span class="cr-art"><img src="([^"]+)"/g)].map((m) => m[1]);
const heroRatios = HEROES.map((f) => { const s = pngSize(f); return s.w / s.h; });
ok('the crossroads art sits in a box of its own with a fixed ratio',
  boxRatio > 0 && crArt.width === '100%', 'aspect-ratio ' + crArt['aspect-ratio'] + ', width ' + crArt.width);
ok('and the box has a ceiling, so a wider sidebar stops feeding the pictures',
  /^\d+(\.\d+)?px$/.test(crArt['max-height'] || ''), crArt['max-height']);
ok('the drawings fill that box rather than their column, fitted whole and stood on its floor',
  crImg.width === '100%' && crImg.height === '100%' && crImg['object-fit'] === 'contain'
  && /bottom/.test(crImg['object-position'] || ''),
  [crImg.width, crImg.height, crImg['object-fit'], crImg['object-position']].join(' / '));
ok('there is a drawing on every door the page draws',
  HEROES.length >= 3, HEROES.join(', '));
ok('every hero is narrower than the box, which is what makes them come out the same height',
  boxRatio > 0 && heroRatios.every((r) => r < boxRatio),
  HEROES.map((f, i) => f + ' ' + heroRatios[i].toFixed(3)).join(', ') + ' vs box ' + boxRatio);
// the heroes are smooth-scaled and the pixel art is not: these two carry 1px outlines and
// dithering rather than a pixel grid, and nearest-neighbour at this scale drops most of them
ok('and the crossroads art is scaled smoothly, unlike the mascot and the tiles',
  !crImg['image-rendering'] && img['image-rendering'] === 'pixelated',
  'hero ' + crImg['image-rendering'] + ', mascot ' + img['image-rendering']);

// ---------------------------------------------------------------------------------------------
// 3. the cut between two states
// ---------------------------------------------------------------------------------------------
const beat = declOf('.sparkle.beat') || {};
const kfBody = (blocks(CSS, '@keyframes mascotBeat')[0] || '');
ok('a state change has an animation to play', !!kfBody && /mascotBeat/.test(beat.animation || ''), beat.animation);
ok('it moves the sprite and nothing else',
  /transform\s*:/.test(kfBody) && !/(opacity|filter|blur)/.test(kfBody + (beat.animation || '')), kfBody.replace(/\s+/g, ' '));
ok('it only ever translates on one axis', !!kfBody && !/translate[XZ3]|scale|rotate/.test(kfBody), kfBody.replace(/\s+/g, ' '));
const offsets = (kfBody.match(/translateY\(\s*(-?[\d.]+)px/g) || []).map((s) => parseFloat(s.replace(/[^-\d.]/g, '')));
ok('and in whole pixels, because this is pixel art',
  offsets.length > 0 && offsets.every((v) => Number.isInteger(v)), offsets.join(','));
ok('the beat is one beat long, not a slide', /(^|\s)(\.16s|160ms)(\s|$)/.test(beat.animation || ''), beat.animation);
ok('it is stepped rather than eased', /steps\(/.test(beat.animation || ''), beat.animation);
ok('and a reader who asked for less motion gets none',
  blocks(CSS, '@media (prefers-reduced-motion').some((b) => /\.sparkle\.beat\s*\{[^}]*animation\s*:\s*none/.test(b)));

// ---------------------------------------------------------------------------------------------
// 4. a narrow sidebar: what goes and what stays
// ---------------------------------------------------------------------------------------------
// A section's NAME is how a reader knows which block they are looking at, so it is the last thing
// to drop. `.it` is the heading group (glyph plus name) in both headers, `.ws-title` the room's name.
const narrowHides = RULES
  .filter((r) => /body\.narrow/.test(r.sel) && /display\s*:\s*none/.test(r.body))
  .flatMap((r) => groups(r.sel))
  .filter((g) => /body\.narrow/.test(g));
const hidesAName = narrowHides.filter((g) => {
  const last = lastCompound(g);
  return last === '.ws-title' || (last === '.it' && /\.ws-head|\.crew-head|\.ihead/.test(g));
});
ok('a narrow panel keeps each section its name', hidesAName.length === 0, hidesAName.join(' | '));
ok('and drops the agent count instead, which the roster below it already is',
  narrowHides.some((g) => /\.crew-head/.test(g) && lastCompound(g) === '.upd'), narrowHides.join(' | '));
ok('and at the narrowest width the picker drops its label, not the heading',
  RULES.some((r) => /body\.narrow/.test(r.sel) && /\.ws-map span/.test(r.sel) && /display\s*:\s*none/.test(r.body)));
// The same rule one notch wider, where there is no body.narrow to help: at a 232px sidebar the
// room header's three children want 173px of 158, and whichever of them can shrink is the one that
// loses letters. The section's name may not be it.
const shrink = (v) => { const p = String(v || '').trim().split(/\s+/); return p.length >= 2 ? parseFloat(p[1]) : null; };
const mapDecl = declOf('.ws-map') || {};
for (const head of ['.ws-head .it', '.ihead.crew-head .it']) {
  const flex = (declOf(head) || {}).flex;
  ok('the section name cannot be squeezed in ' + head, shrink(flex) === 0, String(flex));
}
ok('and the room picker is the one that gives way',
  shrink(mapDecl.flex) >= 1 && mapDecl['min-width'] === '0', mapDecl.flex + ' / min-width ' + mapDecl['min-width']);

// ---------------------------------------------------------------------------------------------
// 5. the session has one showing
// ---------------------------------------------------------------------------------------------
const id = (s) => DOC.getElementById(s);
ok('the Session bar is not in the page', !id('pm_session') && !id('s_pct') && !id('s_fill'));
ok('three bars are left in the meters column', DOC.querySelectorAll('#panelUsage .mbar').length === 3,
  String(DOC.querySelectorAll('#panelUsage .mbar').length));
ok('the ring is still there', !!id('ringArc') && !!id('ringPct'));
ok('and the window’s time left went with it, not away', !!id('s_sub') && id('pm_ring').contains(id('s_sub')));
// one reading, one switch: a second checkbox for the same block is a question nobody can answer
const keys = [...DOC.querySelectorAll('.pmk')].map((c) => c.getAttribute('data-k'));
ok('the settings sheet offers one switch for the session', keys.filter((k) => k === 'session' || k === 'ring').join(',') === 'session', keys.join(','));
ok('and every switch it offers is a declared setting value',
  keys.every((k) => (require(path.join(ROOT, 'package.json')).contributes.configuration.properties['claudeUsage.panel.hidden'].items.enum).indexOf(k) >= 0),
  keys.join(','));

// ---------------------------------------------------------------------------------------------
// 5b. A STATE MAY HIDE A FIGURE. IT MAY NOT KEEP A CONTROL.
// ---------------------------------------------------------------------------------------------
// The account with no five-hour window hides the Weekly bar, because the ring draws the week and
// the same figure may not be on the screen twice. What was inside that bar is #wkMore, and #wkMore
// is the ONLY entrance to the weekly sheet: no command contributes it and nothing else opens it
// except a one-off dialog after sharing is turned on. So hiding the bar took the sheet off that
// account altogether, which is a function lost to a rule about a duplicate number.
//
// What is gated here is the shape that made it possible, because the fix itself is a move the
// script makes and the webview page is what proves it (test/webview/games/_usage.js): one hidden
// region, the controls that are in it, and a mover that puts them somewhere visible. A SECOND
// region joining that rule changes the count and brings whoever added it back to this comment.
const noSessionHides = RULES
  .filter((r) => !r.at && /body\.no-session/.test(r.sel) && /display\s*:\s*none/.test(r.body))
  .flatMap((r) => groups(r.sel));
ok('the no-session state hides no region at all',
  noSessionHides.length === 0, noSessionHides.join(' | '));
const FOCUSABLE = ['button', 'a', 'input', 'select', 'textarea'];
const buried = FOCUSABLE.flatMap((t) => DOC.getElementById('pm_weekly').querySelectorAll(t));
ok('the weekly bar holds the only opener of the weekly sheet, which is why it may not be hidden',
  buried.length === 1 && buried[0].id === 'wkMore' && DOC.querySelectorAll('.wk-more').length === 1,
  buried.map((e) => e.localName + '#' + e.id).join(' ') + ', ' + DOC.querySelectorAll('.wk-more').length + ' in the page');
// The button has ONE seat. It had two for a release: the bar was hidden on an account with no
// five-hour window and the script moved #wkMore under the ring to keep the sheet reachable. The
// bar came back (the owner read the missing row as a broken panel, twice), so the mover is gone
// and this is what keeps it gone: a control whose address depends on the account shape is a
// control the reader has to learn twice, and the id that carries the listener can only be in one
// place at a time.
ok('and the script does not move it: one control, one seat',
  !/wkMoreSeat/.test(CLIENT0) && !/_wkHome/.test(CLIENT0) && !/\.wk-more\.on-ring/.test(CSS),
  'a second seat came back');

// ---------------------------------------------------------------------------------------------
// 6. the header: a row of controls, and a crab that cannot move
// ---------------------------------------------------------------------------------------------
// It used to open with a logo and "Claude Usage" at 16px/700, the largest text on the panel,
// directly under the VS Code view header that already says Claude Usage, and the first thing to be
// cut off at the 250px sidebar the panels are specified to survive. What is left is the three
// things that are not the product's name (docs/header-fold-spec.md, 2-2).
// the comments are stripped first, for the same reason the stylesheet's are at the top of this
// file: a comment explaining what the panel no longer prints is carried into the served page
const MARKUP = PAGE.replace(/<!--[\s\S]*?-->/g, ' ');
ok('the panel does not print the product’s name under the view header that already does',
  !DOC.querySelector('.t1') && MARKUP.indexOf('Claude Usage') < 0);
const brand = DOC.querySelector('.brand');
const headKids = DOC.querySelector('.head').childNodes.filter((n) => n.nodeType === 1);
ok('the crab leads the header, where nothing that comes and goes can push it',
  !!brand && brand.childNodes.filter((n) => n.nodeType === 1)[0] === DOC.querySelector('.mascot')
  && headKids[0] === brand);
// WHY THAT IS THE FIX AND NOT A MEASUREMENT: the chevron exists on the Usage tab and not on the
// others, so while the crab sat after it in .hactions, switching tabs moved the crab by the
// chevron's width plus a gap. On the left of the row it cannot be reached by that at all.
ok('and it is not in the actions group, which is the half of the row that changes per tab',
  !DOC.querySelector('.hactions .mascot') && !!DOC.querySelector('.hactions .toggle'));
ok('the second header crab is gone, element and rules',
  !DOC.querySelector('.sparkle-hd') && !/sparkle-hd/.test(CSS));

// The header's height is the crab's now, so the drawing's own ratio would decide how tall the
// whole panel is: crab.png is 261x195 and a squarer redraw would push everything below it down,
// speech bubble included. Same derivation as the big mascot above: a box with a length for a
// height renders one height for every picture, and height:auto renders the picture's own.
const mas = declOf('.mascot') || {};
const masImg = declOf('.mascot img') || {};
function headCrabHeight(size) {
  const px = (v) => (v && /^[\d.]+px$/.test(v) ? parseFloat(v) : null);
  const boxH = px(mas.height);
  if (masImg.height === '100%') return boxH;
  if (px(masImg.height) != null) return px(masImg.height);
  const w = px(masImg.width);
  return w == null ? null : w / (size.w / size.h);
}
const crab = pngSize('crab.png');
const square = { w: 200, h: 200 };
ok('the header crab stands in a box, so its drawing cannot set the header’s height',
  headCrabHeight(crab) != null && headCrabHeight(crab) === headCrabHeight(square),
  'crab.png ' + headCrabHeight(crab) + ', a square drawing ' + headCrabHeight(square));
ok('and the box is tall enough that today’s drawing is not cropped in it',
  parseFloat(mas.height) >= parseFloat(masImg.width) / (crab.w / crab.h),
  'box ' + mas.height + ', drawing ' + (parseFloat(masImg.width) / (crab.w / crab.h)).toFixed(2) + 'px tall');
ok('it is fitted whole and stands on the box’s floor, like the big one',
  masImg['object-fit'] === 'contain' && /bottom/.test(masImg['object-position'] || ''),
  masImg['object-fit'] + ' / ' + masImg['object-position']);
// a mark that disappears on two tabs out of three is not a mark (header-fold-spec, 3-4)
const hides = (name) => RULES
  .filter((r) => /display\s*:\s*none/.test(r.body))
  .flatMap((r) => groups(r.sel))
  .filter((g) => lastCompound(g) === name);
ok('nothing hides the crab: not a tab, not compact', hides('.mascot').length === 0, hides('.mascot').join(' | '));

// ---------------------------------------------------------------------------------------------
// 7. folding: the frame goes, the content stays
// ---------------------------------------------------------------------------------------------
// Folded, this panel was more frame than content: 153px of bars inside 165px of card padding,
// section header, tabs, borders, and 27px of a box that was not on screen at all, because the
// ring column lost its WIDTH and kept its 180px of height (header-fold-spec, 4-2).
const ringbox = declOf('.ringbox') || {};
const ringboxC = declOf('.compact .ringbox') || {};
ok('folded, the ring column gives up its height and not just its width',
  parseFloat(ringboxC['max-height']) === 0 && parseFloat(ringboxC['max-width']) === 0,
  JSON.stringify(ringboxC));
ok('and it has a height to animate down from, so the fold is still one movement',
  parseFloat(ringbox['max-height']) > 0 && /max-height/.test(ringbox.transition || ''),
  ringbox['max-height'] + ' / ' + ringbox.transition);
const innerC = declOf('.compact .inner') || {};
ok('a box around one block is not a box: folded, the inner frame is gone',
  parseFloat(innerC.padding) === 0 && parseFloat(innerC['border-width']) === 0
  && innerC.background === 'transparent', JSON.stringify(innerC));
ok('and the border is animated rather than snapped away',
  (declOf('.card,.inner') || {}).transition && /border-width/.test(declOf('.card,.inner').transition),
  (declOf('.card,.inner') || {}).transition);
// 4, 6, 8, 10, 12, 14 (docs/game-panels.md, section 2). A fold may use a smaller one of those; it
// may not invent a number
const SPACING = [4, 6, 8, 10, 12, 14];
const cardC = declOf('.compact .card') || {};
// EACH SIDE OF IT, because the card's padding stopped being one number on 2026-11-26: the top is
// 30 and the other three are 14, and the 16px of difference is the band a panel theme's frame
// spills into from the two top corners (styles.js, and docs/panel-themes/spec.md 5-1). So the
// check is per side: every side is one of the panel's own spacings or one of them plus that band,
// and every side of the folded card is smaller than the same side of the open one.
const sides = (v) => {
  const n = String(v || '').trim().split(/\s+/).map(parseFloat);
  return n.length === 1 ? [n[0], n[0], n[0], n[0]]
    : n.length === 2 ? [n[0], n[1], n[0], n[1]]
    : n.length === 3 ? [n[0], n[1], n[2], n[1]] : n;
};
const BAND = 16;
const padOpen = sides((declOf('.card') || {}).padding), padFold = sides(cardC.padding);
const spaced = (x) => SPACING.indexOf(x) >= 0 || SPACING.indexOf(x - BAND) >= 0;
ok('the card padding is the panel own spacings, plus the frame band at the top',
  padOpen.length === 4 && padOpen.every(spaced) && padOpen[0] - padOpen[2] === BAND,
  padOpen.join(' '));
ok('the folded card padding is one of them too, and smaller on every side',
  padFold.length === 4 && padFold.every(spaced) && padFold.every((v, k) => v < padOpen[k]),
  padFold.join(' ') + ' vs ' + padOpen.join(' '));
// WHAT FOLDING MAY NOT TAKE: the way into the games. #hdCredits is the only door to five of them
// and one press of the chevron used to shut it (header-fold-spec, 2-4)
const compactHides = RULES
  .filter((r) => /\.compact/.test(r.sel) && (/display\s*:\s*none/.test(r.body) || /max-height\s*:\s*0/.test(r.body)))
  .flatMap((r) => groups(r.sel))
  .filter((g) => /\.compact/.test(g));
const shutsTheDoor = compactHides.filter((g) => ['.ttl', '.t2', '#hdCredits', '.cc'].indexOf(lastCompound(g)) >= 0);
ok('folding does not shut the only door into the games', shutsTheDoor.length === 0, shutsTheDoor.join(' | '));
// nor the one notice on this tab that the numbers it is drawing have gone old: a folded panel is
// drawing the same readings, so folding may not be a way to lose the warning about them
const hidesFreshness = compactHides.filter((g) => ['#uhead', '.upd', '#upd', '.ihead'].indexOf(lastCompound(g)) >= 0);
ok('and it does not hide the notice that the readings are old', hidesFreshness.length === 0, hidesFreshness.join(' | '));

// ---------------------------------------------------------------------------------------------
// 8. the freshness row: nothing to say, nothing on the screen
// ---------------------------------------------------------------------------------------------
// The Usage tab's section header said "Usage summary" over the tab called Usage, and beside it
// "Updated now", which was written by whichever of three writers ran last. What is left is one
// line about one thing (how old the usage endpoint's answer is), and it is on the screen only when
// that answer is old or has not arrived (docs/header-fold-spec.md, and webview.js renderFreshness).
ok('the Usage tab no longer heads itself with its own name',
  !DOC.querySelector('#panelUsage .it') && MARKUP.indexOf('Usage summary') < 0);
ok('and the class the other tabs head their sections with is left alone',
  !!DOC.querySelector('#panelAgents .ihead .it') && !!DOC.querySelector('#panelAgents .crew-head'));
const uhead = declOf('#uhead') || {};
ok('an empty freshness row takes no space, rather than holding its margin open',
  uhead.display === 'none', JSON.stringify(uhead));
// the two states that are worth a row, and no third selector: a rule that showed it unconditionally
// would be the old "Updated now" back again
const showsRow = RULES.filter((r) => !r.at && /#uhead/.test(r.sel) && /display\s*:\s*flex/.test(r.body))
  .flatMap((r) => groups(r.sel));
ok('and it appears for exactly two states, both of them conditions on the row itself',
  showsRow.length === 2 && showsRow.every((g) => /#uhead\.(loading|stale)$/.test(g)), showsRow.join(' | '));
// the pulsing dot means "live". It is true while the first call is out and the opposite of true
// when the row is there to say the reading has gone old, so it belongs to one of the two
const dotOn = RULES.filter((r) => !r.at && /#uhead.*\.d$/.test(r.sel) && !/display\s*:\s*none/.test(r.body))
  .flatMap((r) => groups(r.sel));
ok('the live dot shows in the loading state only',
  (declOf('#uhead .d') || {}).display === 'none' && dotOn.length === 1 && /loading/.test(dotOn[0]),
  dotOn.join(' | '));

// ONE WRITER, read off the client script.
//
// This is a source-shape check and it says so: the field had THREE writers (render(), a 30s
// interval, and the 1s tick), and the last of them wrote the age of the PANEL'S PUSH over the
// other two. Since a push happens every ten seconds whatever the endpoint is doing, the field
// read "now" almost always, so a reading that had not moved in an hour called itself current.
// It cannot be checked by driving the page, because the webview harness stubs setInterval and
// therefore never runs the tick at all. So what is checked is the shape that made it possible:
// one place that touches the element, and `refreshedAt` (the push's own clock) not being in it.
const CLIENT = fs.readFileSync(path.join(ROOT, 'webview.js'), 'utf8');
const updWriters = (CLIENT.match(/el\('upd'\)/g) || []).length;
ok('one function writes the freshness field, not three', updWriters === 1, updWriters + ' place(s) touch #upd');
const fresh = /function renderFreshness\(d\) \{[\s\S]*?\n  \}/.exec(CLIENT);
ok('and it reads the endpoint’s own stamp, never the age of the last push',
  !!fresh && /usageAt/.test(fresh[0]) && !/refreshedAt/.test(fresh[0]), fresh ? 'refreshedAt in it' : 'renderFreshness not found');

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASS');
process.exit(fails ? 1 : 0);
