// WHAT THE CRAB IS HOLDING, and the mark it leaves. Two drawings, four rungs each.
//
// WHY THIS IS NOT games/mine/ore.js. That file is what stands IN the rock and this is what hits
// it, which is a different question with a different answer: a seam is placed by the host and
// never moves, and these two are pinned to the crab and swing with it. They travel the same road
// (an SVG data URI in the mine's own stylesheet, because games/registry.js already concatenates
// every game's `css` into the page and a panel cannot ask the host for a URI), and the palette,
// the 24-unit habit and the `uri()` escape are ore.js's so there is one copy of each.
//
// THE PICK IS NOT IN mine-dig.png. The 16 frames the user drew are a crab, a white arc and gold
// sparks, and there is no pick in any of them, so the tool is a second element laid over the strip
// and turned about the crab's claw. That is also what makes a rung VISIBLE: the strip is one
// drawing for every tier, and the thing that changes when 12,500 credits are spent has to be
// something the reader can point at.
//
// THE LADDER IS A COUNT AND NOT A BRIGHTNESS. A reader sees one pick at a time, so four shades of
// one shape cannot be told apart -- brightness ranks only when the four are side by side. Each
// rung therefore adds a part that can be counted:
//
//   1 -> 2   one blade becomes two        (the shape itself)
//   2 -> 3   a collar appears on the haft (a part that was not there)
//   3 -> 4   gold, and a glint            (a colour and a part that was not there)
//
// NO SEMICOLON AND NO BRACE may appear in these strings, for ore.js's reason: they are spliced
// into a stylesheet that test/panel-css.test.js splits on exactly those two characters.
// Everything below is presentation attributes.
'use strict';
const { C, uri } = require('./ore');

// The pick's own box. 28 units at 28px, so a unit is a pixel and the transform-origin the
// stylesheet turns it about (7.5px 25.9px, the crab's claw) is in the same numbers as these paths
function pickSvg(body) {
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'>" + body + '</svg>';
}

// THE HAFT IS THE SAME LINE ON ALL FOUR, and it is a diagonal. A vertical haft with a horizontal
// head was rendered at 24px three ways and read as a hammer, an arrow and a mushroom: the diagonal
// is what says "swung" rather than "struck down with"
const HAFT = "<path d='M6.4 22.2 L15.8 8.0' stroke='" + C.ink + "' stroke-width='3.6' stroke-linecap='round' fill='none'/>";

// THE HEAD IS ONE PATH, always. Cut into a blade, an eye and a blade, each piece gets an outline
// of its own and the three read as a box with wings on it rather than as a tool
function head(d, fill) {
  return "<path d='" + d + "' fill='" + fill + "' stroke='" + C.ink + "' stroke-width='1.2' stroke-linejoin='round'/>";
}
// The collar, rungs 3 and 4 only: the part that was not there at rung 2
function collar(fill) {
  return "<path d='M15.2 15.0 L13.6 17.5 L7.9 13.8 L9.6 11.3 Z' fill='" + fill
    + "' stroke='" + C.ink + "' stroke-width='1.1' stroke-linejoin='round'/>";
}

const D1 = 'M7.0 4.0 L16.2 8.2 L14.8 11.4 L8.4 8.4 Z';                                  // one blade
const D2 = 'M5.8 2.6 L16.8 7.5 L20.2 12.8 L17.3 14.4 L14.5 9.6 L7.4 6.2 Z';             // two
const D3 = 'M4.4 1.4 L17.0 7.3 L22.6 15.4 L19.0 14.4 L14.4 9.4 L6.4 5.4 Z';             // two, longer

// `Tin pick` is drawn in copper and the engine's name for it is tin, which is left as it stands:
// the palette's only warm dark metal is emberLo, and renaming a rung is the engine's call and not
// a drawing's (docs/mine-mockup/spec.md, section 9)
const PICKS = [
  pickSvg(HAFT + head(D1, C.emberLo)),
  pickSvg(HAFT + head(D2, C.stone)),
  pickSvg(HAFT + collar(C.steel) + head(D3, C.steel)),
  pickSvg(HAFT + collar(C.gold) + head(D3, C.gold)
    + "<path d='M6.0 3.2 L16.2 8.0 L15.0 9.9 L5.4 5.0 Z' fill='" + C.cream + "'/>")
];

// THE MARK, on frames 6 and 7 only (games/mine/meta.js's mnHit). It stands in the rock just past
// the face, 8px clear of where the strip's own arc ends, so the two never overlap.
//
// THE INK HALO IS NOT DECORATION. The rock has a grain now, so what is under the star changes from
// one metre to the next: on the brightest boulder a copper star is 1.65:1 and an iron one 1.87:1,
// which is a smudge. The same star drawn once underneath at 1.18 in ink holds the mark's edge at
// 3.77:1 against the lightest rock there is (docs/mine-mockup/spec.md, section 14).
//
// THE VIEWBOX IS WIDER THAN 24 FOR THAT HALO. At 1.18 about the centre the star's top point
// reaches -1.45 of a 0..24 box, and a 24 box would cut 11% off it and leave the halo flat on top
// where the star is sharp. -1.6 .. 25.6 holds the whole of it, and the CSS box is still the size
// in the table: what the reader sees is the mark, halo and all
const STAR = 'M12 0.6 14.6 8.4 22.4 11.4 14.6 14.4 12 22.2 9.4 14.4 1.6 11.4 9.4 8.4Z';
const CORE = 'M12 6.2 13.3 10.6 17.4 11.4 13.3 12.4 12 16.6 10.7 12.4 6.6 11.4 10.7 10.6Z';

function hitSvg(fill, core) {
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='-1.6 -1.6 27.2 27.2'>"
    + "<path d='" + STAR + "' fill='" + C.ink + "' transform='translate(12 12) scale(1.18) translate(-12 -12)'/>"
    + "<path d='" + STAR + "' fill='" + fill + "'/>"
    + (core ? "<path d='" + CORE + "' fill='" + C.cream + "'/>" : '')
    + '</svg>';
}

// Rung, size of the mark, its colour, and whether it has a core. The two top rungs get the core
// because that is the same "one more countable part" the picks are built on
const HITS = [
  { px: 13, svg: hitSvg(C.emberLo, false) },
  { px: 15, svg: hitSvg(C.stone, false) },
  { px: 17, svg: hitSvg(C.steel, true) },
  { px: 19, svg: hitSvg(C.gold, true) }
];

// The rules, one per rung. `t0` is not here and is not a drawing: bare hands hide both elements
// (games/mine/panel.js), because there is no pick to draw and no blow to mark
const CSS = PICKS.map((s, i) => `  .mn-pick.t${i + 1}{background-image:url("${uri(s)}");}`)
  .concat(HITS.map((h, i) =>
    `  .mn-hit.t${i + 1}{width:${h.px}px;height:${h.px}px;background-image:url("${uri(h.svg)}");}`))
  .join('\n') + '\n';

module.exports = { CSS, PICKS, HITS };
