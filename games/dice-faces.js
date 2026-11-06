// The six die faces. Sic Bo shows three of them, Shut the Box two, Hazard one.
//
// ONE SIZE, AND IT IS 48. The grid is 24 units rendered at 48 device pixels, two pixels a unit: the
// same cell as games/symbols.js, games/tiles.js, the pixel cards (16x22 at 2px) and the pixel coin
// (8x8 at 2px). Render at 24, 48 or 72 and every edge stays on a whole pixel; 36 or 40 puts the pip
// centres on half pixels. Three games draw these and they all draw them at 48, because a symbol that
// is one size in one game and another size in the next is two symbols (docs/game-panels.md, 5-5).
//
// THE BODY IS `currentColor`. A die is cream on the felt (9.30:1), but Hazard needs ONE die drawn in
// the losing colour, as the mark on its pot tray that says which face empties it, and a second set
// of six baked drawings for that would be six drawings that have to be kept in step with these. So
// the cell sets `color` and the body follows: cream for a die that was rolled, `#f6836e` for the
// warning. The pips and the shade do not follow, and must not: ink pips are 16.30:1 on cream and
// 11.4:1 on the warning colour, and a pip drawn in currentColor would vanish into its own body.
//
// WHY A SPRITE. Sic Bo draws three cells and Shut the Box two, and the faces change every roll, so a
// cell is swapped by rewriting one `<use href>` rather than by pasting a face. Six <symbol> in one
// hidden sprite, the same wiring games/symbols.js already has in html.js (docs/game-panels.md, 8-2).
//
// NO ROUNDED-CORNER TRICK AND NO OUTER FRAME. Unlike a list tile, a die is not clipped by a frame:
// it stands on the felt, so the corner is drawn here (rx 3 units = 6px at 48) and the outline is
// drawn here too. The outline is ink, which is 1.75:1 on the felt and so does nothing against it;
// what separates a die from the felt is its own cream mass. The outline's job is the pip-side edge,
// where it is 16.30:1, and giving the cream a boundary so two dice side by side do not fuse.
'use strict';

const INK = '#0b1310';     // the pips and the outline: games/tiles.js's own ink
const PIP_R = 2.4;         // 4.8px across at 48. Over the 2.5-unit floor a 15px glyph has, with room
const LO = 7, MID = 12, HI = 17;   // the three pip columns and rows, on whole units

// Where the pips are, face by face. Written out rather than derived from a bit pattern: six short
// lists are read at a glance and a derivation is a place for a 5 to come out as a 4
const SPOTS = Object.freeze({
  1: [[MID, MID]],
  2: [[LO, LO], [HI, HI]],
  3: [[LO, LO], [MID, MID], [HI, HI]],
  4: [[LO, LO], [HI, LO], [LO, HI], [HI, HI]],
  5: [[LO, LO], [HI, LO], [MID, MID], [LO, HI], [HI, HI]],
  6: [[LO, LO], [LO, MID], [LO, HI], [HI, LO], [HI, MID], [HI, HI]]
});

const FACES = Object.freeze([1, 2, 3, 4, 5, 6]);

// The body, the shade that gives it mass, and the pips. The shade is black at .12 rather than a
// named colour so it works over whatever `color` the cell set
function body(n) {
  const pips = (SPOTS[n] || []).map((p) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + PIP_R + '"/>').join('');
  return '<rect x="1" y="1" width="22" height="22" rx="3" fill="currentColor"'
    + ' stroke="' + INK + '" stroke-width="1"/>'
    // the lower and right inside edges, so the face reads as a cube resting rather than as a flat
    // card. An L band and not a 45-degree wedge: the wedge was drawn first and its diagonal cut
    // across the pips of the 5 and the 6, which read as a crease in the face rather than as light
    + '<path fill="#000" opacity=".1" d="M20.5 1.5h2v21h-21v-2h19z"/>'
    + '<g fill="' + INK + '">' + pips + '</g>';
}

const BODY = {};
FACES.forEach((n) => { BODY[n] = body(n); });
// A die that has not been rolled yet, and the reason this file has a seventh drawing. Sic Bo, Shut
// the Box and Hazard all show their dice on the BET screen, before there is a roll to show, and a
// cell left empty there is the minefield's twenty-five blank squares again: the deal would then
// change nothing on the felt. A blank die is the cover and the pips are the reveal
// (docs/game-panels.md, section 2). It is drawn here rather than faked with a CSS box so it is the
// same body, the same corner and the same shade as the six
BODY[0] = body(0);

// One hidden sprite for the page. display:none does not stop a <use> of it rendering: a <symbol> is
// never drawn where it stands
function sprite() {
  return '<svg class="dc-sprite" aria-hidden="true" width="0" height="0">'
    + [0].concat(FACES).map((n) => '<symbol id="dc-' + n + '" viewBox="0 0 24 24">' + BODY[n] + '</symbol>').join('')
    + '</svg>';
}

// One cell's worth of markup. The art is aria-hidden, so whatever shows a die carries the number,
// the same rule the pixel cards keep (CUC.cardWord) and the sea symbols keep (CUC.symWord)
function use(n) {
  return '<svg class="dc" viewBox="0 0 24 24" aria-hidden="true"><use href="#dc-' + n + '"/></svg>';
}

// A face on its own, for anything that cannot reach the sprite. `0` is the unrolled die
function face(n) {
  return '<svg class="dc" viewBox="0 0 24 24" aria-hidden="true">' + BODY[n] + '</svg>';
}

module.exports = { FACES, SPOTS, BODY, sprite, use, face, INK, PIP_R };
