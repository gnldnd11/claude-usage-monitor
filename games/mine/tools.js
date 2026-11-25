// WHAT THE CRAB IS HOLDING, what the blow knocks loose, and how five hundred steps show on a tool
// there are only four drawings of.
//
// WHY THIS IS NOT games/mine/ore.js. That file is what stands IN the rock and this is what hits
// it, which is a different question with a different answer: a seam is placed by the host and
// never moves, and everything here is pinned to the crab and swings with it. They travel the same
// road (an SVG data URI in the mine's own stylesheet, because games/registry.js already
// concatenates every game's `css` into the page and a panel cannot ask the host for a URI), and
// the palette, the 24-unit habit and the `uri()` escape are ore.js's so there is one copy of each.
//
// THE PICK IS NOT IN mine-dig.png. The 16 frames the user drew are a crab, a white arc and gold
// sparks, and there is no pick in any of them, so the tool is a second element laid over the strip
// and turned about the crab's claw. That is also what makes a step VISIBLE: the strip is one
// drawing for every step, and the thing that changes when 12,500 credits are spent has to be
// something the reader can point at.
//
// THE FOUR DRAWINGS ARE A COUNT AND NOT A BRIGHTNESS. A reader sees one pick at a time, so four
// shades of one shape cannot be told apart -- brightness ranks only when the four are side by
// side. Each band therefore adds a part that can be counted:
//
//   1 -> 2   one blade becomes two        (the shape itself)
//   2 -> 3   a collar appears on the haft (a part that was not there)
//   3 -> 4   gold, and a glint            (a colour and a part that was not there)
//
// ...AND ABOVE THE FOUR BANDS THE LADDER IS A LIGHT (docs/mine-mockup/spec-dig.md, section 5).
// Five hundred steps cannot be five hundred drawings and they cannot be five hundred counts, so the
// four shapes keep their job (which rows the wall gives up) and the five GLOW bands carry how far
// up the ladder the tool is. See GLOW below for why it is a drop-shadow and why it is gold.
//
// NO SEMICOLON AND NO BRACE may appear in the SVG strings, for ore.js's reason: they are spliced
// into a stylesheet, and test/panel-css.test.js parses the root one by splitting on exactly those
// two characters. Everything inside an svg() call below is presentation attributes for that reason.
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
// The collar, bands 3 and 4 only: the part that was not there at band 2
function collar(fill) {
  return "<path d='M15.2 15.0 L13.6 17.5 L7.9 13.8 L9.6 11.3 Z' fill='" + fill
    + "' stroke='" + C.ink + "' stroke-width='1.1' stroke-linejoin='round'/>";
}

const D1 = 'M7.0 4.0 L16.2 8.2 L14.8 11.4 L8.4 8.4 Z';                                  // one blade
const D2 = 'M5.8 2.6 L16.8 7.5 L20.2 12.8 L17.3 14.4 L14.5 9.6 L7.4 6.2 Z';             // two
const D3 = 'M4.4 1.4 L17.0 7.3 L22.6 15.4 L19.0 14.4 L14.4 9.4 L6.4 5.4 Z';             // two, longer

// The first band is drawn in copper and the second in iron, which is left as it stands: the
// palette's only warm dark metal is emberLo, and the bands have no names any more (five hundred
// steps cannot have five hundred names, so nothing on the screen says one)
const PICKS = [
  pickSvg(HAFT + head(D1, C.emberLo)),
  pickSvg(HAFT + head(D2, C.stone)),
  pickSvg(HAFT + collar(C.steel) + head(D3, C.steel)),
  pickSvg(HAFT + collar(C.gold) + head(D3, C.gold)
    + "<path d='M6.0 3.2 L16.2 8.0 L15.0 9.9 L5.4 5.0 Z' fill='" + C.cream + "'/>")
];

// --- the light on the tool, five bands ------------------------------------------------------------
//
// THE RADII, 0 FIRST. Band 0 sets no filter at all, because an unlit tool is the baseline and a
// baseline that is itself a value has nothing to be read against. The ladder is x1.6 and stops at
// 6px because 6px is the last radius at which 28px of pick is still a pick: 8px was rendered and
// the tool is inside the lump rather than holding it (spec-dig.md, 5-4).
//
// WHY A drop-shadow AND NOT A box-shadow OR A SECOND ELEMENT. It follows the ALPHA and not the
// box, so what glows is the tool and not a 28px square; two of them are one declaration; and it
// is drawn OUTSIDE the silhouette, so the blade's own fill does not change by a single pixel at
// any band. That last one is the whole answer to "does the white not eat the band's colour".
//
// WHY gold WITH A cream KEYLINE AND NOT ember OR WHITE. ember was used exactly once in this band
// and it was the reach line (gone with the durability in 1.41.0, so the colour is now unused in
// the drift and stays that way); cream alone would outshine the relic it is lighting the way to;
// the band colours themselves do not work because band 2's grey glow is a smudge rather than a
// light.
// gold is already what value means in this panel (the header coin, .bj-chip.bj, the relic). The
// 1px cream keyline is what makes the gold stand on the brightest rock there is: gold bloom alone
// is 1.60:1 on #7f7c86 and the keyline holds the blade's outline over any floor (spec-dig.md, 5-2).
//
// IT NEVER BLINKS. This is a filter and not an animation, so it is the same at every frame and
// under prefers-reduced-motion: the light moving is the tool moving (spec-dig.md, 5-6).
const GLOW = [0, 1.5, 2.5, 4, 6];

// --- what the blow knocks loose -------------------------------------------------------------------
//
// FIVE PIECES AND ONE OF THEM IS THE STONE. Until 1.41.0 the only thing this screen drew at the
// moment of a blow was a star that stood 15px diagonally away from where the pick actually lands,
// and nothing on the whole screen ever CHANGED PLACE: the crab, the arc and the sparks all appear
// and vanish where they are. "I cannot tell it is digging" was a true reading of that. So the
// star is gone (meta.js) and these take its job, which is to be the one thing here that moves.
//
//   lump   5x5    the stone that just broke. There has to be a subject, or "a stone broke" has
//                 nothing in the picture that is the stone
//   chip   3x3    its grit, four of them
//
// steel CORE WITH A 1px ink RING, measured against the rock rather than chosen: the palette's own
// `stone` colour is 1.06:1 on the brightest boulder (invisible), and cream would outshine the
// relic. steel on ink is 10.06:1 and ink on the brightest rock is 4.60:1, so the RING is
// what holds the piece together over any floor. .mn-hit's halo and ore.js's socket are the same
// prescription twice already (spec-dig.md, 2-1).
//
// NO GRADE IS CARRIED HERE. Size, colour and count are fixed at every step, for tools.js's own
// reason: a reader sees one pick at a time and cannot count three pieces against four. The ladder
// is carried by GLOW above and by nothing else.
//
// THE DIRECTION IS OUT OF THE WALL AND TOWARDS THE CRAB -- up, left and down. Thrown right they
// would fly INTO the rock, which is where the information is. One piece goes right and low so the
// burst is not a fan.
//
// THE FRAMES ARE THE SWING'S OWN, 7 to 10 of the sixteen, and 11 is where they are gone. This is
// why there is no millisecond in this file: the burst is part of one swing, and one swing is
// MN_DIG[rung] (games/mine/panel.js), which is the same number the crab, the pick and the step all
// ride. step-end and not an ease, because the strip is steps(16) and smooth grit beside a stepped
// crab is grit from another screen.
const CHIP_F = [43.75, 50, 56.25, 62.5];     // frames 7, 8, 9, 10 of 16, in per cent
const CHIP_END = 68.75;                      // frame 11: gone
// Offsets from the strike point, in pixels, one row per piece and one pair per frame above
const CHIPS = [
  { px: 5, at: [[-1, 0], [-5, -1], [-10, 2], [-15, 9]] },
  { px: 3, at: [[-2, -2], [-7, -3], [-13, -2], [-19, 3]] },
  { px: 3, at: [[0, -3], [-3, -6], [-6, -6], [-9, -2]] },
  { px: 3, at: [[2, -1], [5, -2], [9, 1], [12, 7]] },
  // ...and this one is off the bottom of the band by frame 10 (band y61, 17px behind the face),
  // where it is CLIPPED. That is the piece that fell on the floor
  { px: 3, at: [[-3, 1], [-9, 4], [-16, 9], [-23, 17]] }
];

// --- what the blow leaves in the wall -------------------------------------------------------------
//
// THE BITE, AND IT IS THE ONLY THING ON THIS BAND THAT CHANGES THE WALL (docs/mine-mockup/
// spec-ore.md, section 7). The reader's second line was "it does not feel like the stone is being
// cut at all", and the measurement behind it is blunt: when a stone broke, FOUR things moved and
// not one of them was rock. The crab took a step, the grit flew, the strip's own arc and sparks
// fired, and the face advanced by between 0.95px and 1.56px. Three of those happen in the air and
// the fourth is a pixel. The wall itself was untouched.
//
// SO A PIECE OF THE FACE IS KNOCKED OUT AT THE STRIKE POINT. 12x10 units at 12x10 px, ink at .92
// with a `steel` top edge, and it is NOT a bright mark: a hole is darker than what is around it,
// which is the whole difference between this and the strike star 1.41.0 deleted (that one was the
// grade's colour with a cream heart, 15px diagonally away from where the pick actually lands).
//
// WHY IT IS ON .mn-rock::after AND NOT IN .mn-chips. The grit is z-index 4, which is above the crab
// AND the tool: a bite drawn there covers the pick's head on frame 7 (the head tip is face + 5.7px
// at y44.5 and the bite spans face -3 to +9 at y39..49). Drawn on the rock it is UNDER the crab, so
// frames 7 and 8 have the tool over it and frame 9 is where the tool lifts away and the hole comes
// out from behind it. "Strike, withdraw, and there is the dent" is that order, and it is free.
// The rock's own clip-path then cuts the bite's left 3px off at the face, so the mark is bitten
// into the edge of the wall rather than floating on it.
//
// AND THE TWO CONTRASTS ARE THE GRIT'S, INVERTED. A chip is a steel core in an ink ring because it
// is a piece of stone in the air; this is an ink body with a steel top edge because it is a hole.
// Whichever wall it lands on, one of the two clears 4.5:1 (ink is 4.58 on the brightest boulder and
// steel is 8.67 on the darkest), so neither face of the pair can be lost at once.
//
// NO NEW MILLISECOND. It rides --mn-digms, which is MN_DIG[rung] handed down by the panel -- the
// same number the crab, the pick, the step and the grit ride -- and its stops are frames of the
// same sixteen: 7 is contact, 12 it is half gone, 15 it is gone. It outlives the grit by four
// frames on purpose, because that is the part that says the wall KEEPS the mark for a moment
const BITE = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 10'>"
  + "<path d='M0.4 2.2 3.6 0.8 7.0 2.1 10.0 1.1 11.6 3.1 8.8 4.7 10.2 7.4 6.4 9.0 2.4 7.2 0.6 4.7Z' fill='"
  + C.ink + "' opacity='.92'/>"
  + "<path d='M0.4 2.2 3.6 0.8 7.0 2.1 10.0 1.1 11.6 3.1' fill='none' stroke='" + C.steel
  + "' stroke-width='.9' stroke-opacity='.8' stroke-linejoin='round'/>"
  + '</svg>';

// Frames 7 / 12 / 15 of the sixteen, as per cents, the way CHIP_F is written. The step-end curve is
// the strip's, so the mark does not dissolve smoothly beside a crab drawn in whole frames
const BITE_F = { hit: 43.75, half: 75, gone: 93.75 };
const BITE_CSS = `  .mn-rock::after{content:'';position:absolute;left:calc(40% + var(--mn-adv,0%) - 3px);
    top:39px;width:12px;height:10px;background-image:url("${uri(BITE)}");background-size:contain;
    background-repeat:no-repeat;background-position:50% 50%;opacity:0;pointer-events:none;}
  .mn-rock.burst::after{animation:mnBite var(--mn-digms,1760ms) step-end 1 both;}
  @keyframes mnBite{
    0%{opacity:0;}
    ${BITE_F.hit}%{opacity:1;}
    ${BITE_F.half}%{opacity:.55;}
    ${BITE_F.gone}%{opacity:0;}
  }`;

// A piece's own offset, as a transform. The element is centred on the strike point by a -50%
// translate, so each frame is that translate with the offset folded in: `calc(-50% - 5px)`, never
// a second transform function, because two translates on one property is the kind of thing that
// works until somebody reorders them
function nudge(dx, dy) {
  const ax = dx < 0 ? '- ' + -dx : '+ ' + dx;
  const ay = dy < 0 ? '- ' + -dy : '+ ' + dy;
  return 'translate(calc(-50% ' + ax + 'px),calc(-50% ' + ay + 'px))';
}

// One piece's keyframes. Both properties are written at every stop: a transform left out of the
// last one interpolates against the element's own, which is a piece that slides back to the face
function chipKf(i, c) {
  const last = nudge(c.at[3][0], c.at[3][1]);
  let out = '  @keyframes mnChip' + i + '{\n    0%{opacity:0;transform:translate(-50%,-50%);}\n';
  for (let f = 0; f < CHIP_F.length; f++) {
    out += '    ' + CHIP_F[f] + '%{opacity:1;transform:' + nudge(c.at[f][0], c.at[f][1]) + ';}\n';
  }
  return out + '    ' + CHIP_END + '%{opacity:0;transform:' + last + ';}\n'
    + '    100%{opacity:0;transform:' + last + ';}\n  }';
}

// The rules, in three groups. `t0` and `g0` are not here and are not drawings: bare hands hide the
// pick (games/mine/panel.js) and the bottom of the ladder sets no filter
const CSS = PICKS.map((s, i) => `  .mn-pick.t${i + 1}{background-image:url("${uri(s)}");}`)
  .concat(GLOW.slice(1).map((r, i) =>
    `  .mn-pick.g${i + 1}{filter:drop-shadow(0 0 1px ${C.cream}) drop-shadow(0 0 ${r}px ${C.gold});}`))
  .concat(CHIPS.map((c, i) => `  .mn-chip.c${i}{width:${c.px}px;height:${c.px}px;}`))
  .concat(CHIPS.map((c, i) => `  .mn-chip.c${i}.burst{animation-name:mnChip${i};}`))
  .concat(CHIPS.map((c, i) => chipKf(i, c)))
  .concat([BITE_CSS])
  .join('\n') + '\n';

module.exports = { CSS, PICKS, GLOW, CHIPS, CHIP_F, CHIP_END, BITE, BITE_F };
