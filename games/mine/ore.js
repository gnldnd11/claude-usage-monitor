// What is standing in the rock: three markers, drawn here and nowhere else.
//
// WHY THIS FILE EXISTS AT ALL. The seams are pictures with no state: a gem is a gem whatever the
// depth, nothing hovers them, nothing presses them, and the one thing that moves is WHERE they sit
// (games/mine/panel.js places them in per cent of the lookahead). A picture like that is a
// background, not markup, so these three go into the mine's own stylesheet as data URIs and the
// panel draws `<i class="mn-ore gem">`.
//
// THAT IS A DIFFERENT ROUTE FROM THE DICE AND THE SEA SYMBOLS, on purpose. Those are an SVG sprite
// in the page plus a `<use>` helper on the floor (games/symbols.js, and window.CUC.die), which
// needs html.js to emit the sprite -- and html.js emitting the mine's sprite is a shared file
// learning a game's name, which is the one thing games/README.md section 1 does not allow. A data
// URI needs nothing shared: games/registry.js already concatenates every game's `css` into the
// page, so the art travels the road the register already built. The page's own CSP allows it
// (`img-src ${csp} data:`, html.js).
//
// THE PALETTE IS games/tiles.js's, and there is not one new colour here (docs/game-panels.md,
// 5-15): steel and cream for a gem, the coin's gold and copper for a relic, the felt's red and
// cream for a fever. Contrast against the rock (#2a2f36) is measured in that same table.
//
// THE GRID IS 24 UNITS, the one every drawn thing in this extension is built on (games/tiles.js).
// A gem and a fever render at 24px, so a unit is a pixel; a relic renders at 48, so a unit is two.
// Keep forms on whole or half units.
//
// NO SEMICOLON AND NO BRACE may appear in these strings. They are spliced into a stylesheet, and
// test/panel-css.test.js parses that stylesheet by splitting on exactly those two characters: a
// `style="..."` attribute in here would quietly cut a declaration in half. Everything below is
// presentation attributes for that reason.
//
// --- 1.41.0: THE MARKERS ARE IN THE ROCK AND NOT ON IT ---------------------------------------
//
// The reader's words were "the gems do not feel stuck in that ore at all". They were right, and
// the whole of why is that every condition for reading as a STICKER was present at once: a closed
// convex shape, one even ink keyline all the way round it, nothing in front of it, no shadow cast
// on it, and a place on the band (dead centre) that has nothing to do with the structure behind
// it. The locked ones had something in front of them, so the OPEN ones -- the ones the reader
// wants to look at -- floated the most.
//
// WHAT IS DRAWN INSTEAD is a pocket cut into the rock with the find sitting down inside it
// (docs/mine-mockup/spec-ore.md). Four pieces, the same four for all three markers, all of them
// inside the 24-unit box that was already there: no extra layer, no mask and no new element.
//
//   POCKET  an angular ink hollow at .92. It is INK AND NOT ROCK-COLOURED on purpose: the wall
//           runs 14x from its darkest face to its brightest, so anything painted in the wall's own
//           tones is a different picture on every boulder, while what is in FRONT in a drift is in
//           shadow and shadow is ink. The contrast then closes inside the drawing (section 8)
//   RIM     one `stone` line along the inside of the pocket's floor, deliberately weak (2.3:1).
//           It is a bounce light, not an outline, and no information hangs on it: what it buys is
//           that the pocket reads as a HOLE rather than as a shadow dropped behind the marker
//   BODY    the same silhouette as before. A gem is a gem, a relic is an ingot, a fever is a bolt
//   THE BROKEN BOTTOM EDGE  the body is cut off underneath by a jagged line. This is the one that
//           does the work: an unbroken outline is a sticker, and a silhouette that stops in the
//           middle of a ragged line is a thing with more of itself below the surface
//
// AND THE LOCK IS A COLOUR NOW RATHER THAN A SHELF (section 5). It used to be a slab of rock drawn
// over the marker, which cannot survive on this wall: slab runs 1.20:1 to 3.28:1 against it, so the
// shelf vanished on dark boulders and was a black rectangle on bright ones. Every marker has rock
// in front of it now, so "rock is over it" has stopped being available as a signal at all. What
// says locked is THE COLOUR OF THE LIT FACE -- cream when the seam is open and `stone` when it is
// not -- plus how much of the body is above the broken edge (about 75% against 45%). The lit face
// is painted on the body inside the pocket, so that signal does not depend on the wall either.
// What it MEANS is unchanged: the pick in hand is not the key to this one, so no light has reached
// it yet. And which find is being missed is still legible, which is the line this file has always
// held: the body keeps its colour and its top, so a reader can still see what the next step buys.
'use strict';

// games/tiles.js's palette, by the names it uses there. Not imported, because that module is the
// list tiles' own plaque and gradients and nothing here wants either
const C = {
  ink: '#0b1310',
  slab: '#2a2f36',
  stone: '#7e828c',
  steel: '#bbbdc7',
  cream: '#fcecdc',
  gold: '#e8b23a',
  emberLo: '#c25a34',
  red: '#d4453a'
};

// One marker, as a standalone SVG. 24-unit viewBox whatever the rendered size, so the three are
// drawn to one grid and only the CSS box differs
function svg(body) {
  return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>" + body + '</svg>';
}

// THE POCKET, which is the same hollow for all three and for both states.
//
// TEN VERTICES, ASYMMETRIC, AND NO EDGE PARALLEL TO THE BOX. All three are deliberate and all
// three were rendered before they were chosen (spec-ore.md, 3-1 and 9):
//   - it does not touch x0, x24 or y24. Anything that fills to the edge of this box reads as a
//     RECTANGLE whatever colour it is, which is exactly what the old shelf came out as
//   - a symmetric lens with two points on it read as an EYE, and with gold inside it as an eye
//     with an iris. A hollow in rock is not regular, so this one is not
//   - .92 and not less: red against ink tops out at 4.22:1, and .92 holds the fever's body at
//     3.92 to 4.19 of it. At .86 it is 3.63 and the bolt starts to sink into its own hole
const POCKET = "<path d='M11.4 1.6 18.6 4.0 21.6 8.8 20.4 12.2 23.2 16.0 19.6 21.0 12.0 23.0 5.0 20.4 2.0 14.6 2.6 7.6Z' fill='"
  + C.ink + "' opacity='.92'/>";

// ...AND THE BOUNCE OFF ITS FLOOR. 2.3:1 against the pocket, which is as weak as it looks: this is
// the difference between "a shadow behind it" and "a hole it is sitting in", and it carries no
// information at all, so a reader who cannot see it has lost nothing
const RIM = "<path d='M2.4 15.6 5.4 19.8 12.0 21.6 18.8 20.0 22.6 16.6' fill='none' stroke='"
  + C.stone + "' stroke-width='1.2' stroke-opacity='.55' stroke-linejoin='round'/>";

// THE THREE STATES EVERY MARKER HAS, and they are one function each rather than six strings. A
// 600-byte path written out twice is two copies to keep in step, which is the rule this file has
// kept since the bag borrowed the same drawings.
//   open    standing in the wall, the pick in hand is the key to it
//   locked  standing in the wall, it is not
//   bare    out of the wall: what the pop and the bag draw (section 6). NO POCKET ON THIS ONE --
//           what comes out of a wall is a stone, not a hole -- and it is a drawing of its own
//           rather than the seam picture with the pocket deleted, because the body it uses has an
//           unbroken bottom edge
const MODES = ['open', 'locked', 'bare'];
function inWall(mode) { return mode !== 'bare'; }
// the lit face, which is the one thing that says whether the seam is open (section 5-1). cream is
// 1.62:1 BRIGHTER than the body it sits on and stone is 2.05:1 darker, so the sign of the step
// flips rather than its size: that is what makes two 7x8px facets tell each other apart
function lit(mode) { return mode === 'locked' ? C.stone : C.cream; }

// --- a gem: a cut stone, steel, with one lit facet and one in shadow ------------------------------
//
// THE SHADED FACET IS NEW AND IT COSTS NO COLOUR. Until 1.41.0 the gem had a single cream facet on
// a flat steel field, which is a lozenge with a highlight rather than a stone with faces. The right
// half is ink at .3 now, so the same vertices carry TWO faces and the thing has a ridge down it.
//
// THE BOTTOM EDGE IS WHERE THE STATE IS. Open, the stone is broken off at y14.0..16.6 and about
// three quarters of it is clear of the rock; locked, the break is at y11.2..13.2 and under half of
// it is. Bare, there is no break at all: a diamond with a point on the bottom
const GEM_BODY = {
  open: 'M12 2.4 21.2 10.0 18.6 14.6 15.2 16.4 12.0 14.8 8.6 16.6 5.4 14.0 2.8 10.0Z',
  locked: 'M12 2.4 21.2 10.0 18.0 11.6 14.8 13.2 11.6 11.4 8.2 13.0 5.2 11.2 2.8 10.0Z',
  bare: 'M12 2.4 21.2 10.0 12 21.6 2.8 10.0Z'
};
// how far down the ridge between the two facets runs, which follows the break
const GEM_TIP = { open: '11.9', locked: '10.8', bare: '11.9' };
function gem(mode) {
  const tip = GEM_TIP[mode];
  return (inWall(mode) ? POCKET + RIM : '')
    + "<path d='" + GEM_BODY[mode] + "' fill='" + C.steel + "' stroke='" + C.ink
    + "' stroke-width='1.4' stroke-linejoin='round'/>"
    + "<path d='M12 3.8 4.8 10.0 12 " + tip + "Z' fill='" + lit(mode) + "'/>"
    + "<path d='M12 3.8 19.2 10.0 12 " + tip + "Z' fill='" + C.ink + "' opacity='.3'/>";
}

// --- a relic: a tilted ingot, gold, with a cream top and a copper face ----------------------------
//
// IT WAS A STANDING IDOL UNTIL 2026-11-25, and the idol was withdrawn for what it read as rather
// than for how it was drawn: a head, two arms and a vertical axis at 24 units is a chess piece or
// a person, and the one thing a marker in this band may not be is a figure, because the band
// already has one and it is the crab. Every part that could make a person is gone from this: no
// circle, no symmetry about a vertical, no axis at all.
//
// THE INK SOCKET IT USED TO CARRY IS GONE WITH 1.41.0 and the POCKET does that job now: the socket
// hugged the ingot, which is a drop shadow, and the pocket is larger and more irregular, which is a
// hole. Gold against its own ink was 9.74:1 and against the pocket it is 9.05 to 9.65, so nothing
// was spent on the change.
// It renders at 48px, so every unit here is two pixels and the 1.2-unit outline is 2.4px
const RELIC_BODY = {
  open: 'M4.9 13.9 7.9 9.3l10.3 1.5 1.1 4.2-3.3 4-9.9-1.3Z',
  locked: 'M4.9 13.9 7.9 9.3l10.3 1.5 1.1 4.2-3.5 1.6-3.9-1.6-3.3 1.4Z',
  bare: 'M4.9 13.9 7.9 9.3l10.3 1.5 1.1 4.2-3.3 4-9.9-1.3Z'
};
function relic(mode) {
  return (inWall(mode) ? POCKET + RIM : '')
    + "<path d='" + RELIC_BODY[mode] + "' fill='" + C.gold + "' stroke='" + C.ink
    + "' stroke-width='1.2' stroke-linejoin='round'/>"
    // the lit face is the top LEFT THIRD and not the whole top: a cream top face reads brighter than
    // the marker itself, and the relic is the one thing in this band that may be the brightest (it
    // was the ember reach line until 1.41.0 took that out, and the ordering is what mattered)
    + "<path d='M7.9 9.3 12.6 10 10.4 12.5 6.4 12Z' fill='" + lit(mode) + "'/>"
    // ...and the two copper pieces are the ingot's FRONT, which is the part a locked one has buried
    + (mode === 'locked' ? ''
      : "<path d='M5 14 14.9 15.3 16 19.5 6.1 18.1Z' fill='" + C.emberLo + "' opacity='.6'/>"
      + "<path d='M15.9 15.4 19.3 15 16 19Z' fill='" + C.emberLo + "' stroke='" + C.ink
      + "' stroke-width='1' stroke-linejoin='round'/>");
}

// --- a fever: a bolt, red with a cream core -------------------------------------------------------
//
// It is the one marker that is not a thing to be dug out, so it is the one that is not a solid
// object: what it gives is ground (mine.js, FEVER_M).
//
// THE FOUR-UNIT INK SEAT IS GONE and the pocket replaces it. The seat was the same path drawn twice
// with a fat round-joined stroke under it, which bought red 4.22:1 wherever the marker landed; the
// pocket buys 3.92 to 4.19 of the same thing without a second copy of the path to keep in step. The
// tail was pulled back from y22 to y20.6 so the whole bolt is inside the hollow.
//
// THE LOCKED CORE IS A KNOWN WEAKNESS AND IT IS KEPT ON PURPOSE (spec-ore.md, 5-4): `stone` against
// `red` is 1.16:1, so a locked bolt reads as "the bright core is gone" rather than as "the core got
// darker". That is the same sentence the other two say and it still says it, but it says it by
// subtraction, and no colour in this palette would say it any other way
const FEVER_BODY = {
  open: 'M13.6 2 6 13.2h4.4L9 20.6l8.6-10h-4.8Z',
  locked: 'M13.6 2 6 13.2h4.4l-.8 3.8 5.4-6.4h-3.4Z',
  bare: 'M13.6 2 6 13.2h4.4L9 20.6l8.6-10h-4.8Z'
};
const FEVER_CORE = {
  open: 'M12.6 5.4 8.6 11.6h2.6l-.7 3.8 3.5-4.2h-2.2Z',
  locked: 'M12.6 5.4 8.6 11.6h2.6l-.4 1.8 3.0-3.4h-2.2Z',
  bare: 'M12.6 5.4 8.6 11.6h2.6l-.7 3.8 3.5-4.2h-2.2Z'
};
function fever(mode) {
  return (inWall(mode) ? POCKET + RIM : '')
    + "<path d='" + FEVER_BODY[mode] + "' fill='" + C.red + "' stroke='" + C.ink
    + "' stroke-width='1.5' stroke-linejoin='round'/>"
    + "<path d='" + FEVER_CORE[mode] + "' fill='" + lit(mode) + "'/>";
}

const DRAW = { gem: gem, relic: relic, fever: fever };
const KINDS = ['gem', 'relic', 'fever'];

// Every picture this file has, by kind and by state. Built rather than listed so a fourth kind is
// one entry in DRAW and nothing else, and so no state can be left out of one kind by accident
const ART = (function () {
  const out = {};
  for (let i = 0; i < KINDS.length; i++) {
    out[KINDS[i]] = {};
    for (let j = 0; j < MODES.length; j++) out[KINDS[i]][MODES[j]] = svg(DRAW[KINDS[i]](MODES[j]));
  }
  return out;
})();

// An SVG into something `url("...")` will take. Per cent first, or the escapes below are escaped
// again; quotes and angle brackets because the stylesheet and the attribute both have to survive;
// the hash because a colour is otherwise a fragment and the browser drops the rest of the picture
function uri(s) {
  return 'data:image/svg+xml,' + s
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/\s/g, '%20');
}
function art(kind, mode) { return 'url("' + uri(ART[kind][mode]) + '")'; }

// The rules. The BOX is what differs and the picture fits it (`background-size:contain` on
// .mn-ore): a gem and a fever stand 24px tall and a relic 48, which is docs/game-panels.md 8-3's
// "24 / 48 / 72 only" and the one place on this screen where size says what something is worth.
// There is no third size.
//
// EVERY RULE IS ONE BACKGROUND NOW. The locked ones used to stack a shelf over the marker, which is
// two URIs in one declaration and a comma between them; the state is a different DRAWING now, so
// each rule names one picture and there is nothing to layer.
//
// WHAT THE POP AND THE BAG DRAW IS THE BARE BODY. A find rising out of the face is ore leaving the
// wall, so it may not carry a hole in the wall with it, and what is in the bag is a washed stone.
// `.mn-ore.pop.<kind>` is (0,3,0) against `.mn-ore.<kind>.locked`'s (0,3,0) and comes later, so a
// locked marker caught by a fever's run pops as a bare one. games/mine/panel.js is not touched for
// this: it already writes `mn-ore face pop <kind>` with no `locked` on it.
//
// THE BAG'S RULES ARE IN THIS FILE AND NOT IN THE PANEL'S because the URI is: the same drawing
// written out twice is two copies of a 600-byte string to keep in step. The BOX is the sack's
// (games/mine/meta.js) and the picture fits it, which is the arrangement .mn-ore already uses
const CSS = `
  .mn-ore.gem{width:24px;height:24px;background-image:${art('gem', 'open')};}
  .mn-ore.relic{width:48px;height:48px;background-image:${art('relic', 'open')};}
  .mn-ore.fever{width:24px;height:24px;background-image:${art('fever', 'open')};}
  .mn-ore.gem.locked{background-image:${art('gem', 'locked')};}
  .mn-ore.relic.locked{background-image:${art('relic', 'locked')};}
  .mn-ore.fever.locked{background-image:${art('fever', 'locked')};}
  .mn-ore.pop.gem{background-image:${art('gem', 'bare')};}
  .mn-ore.pop.relic{background-image:${art('relic', 'bare')};}
  .mn-ore.pop.fever{background-image:${art('fever', 'bare')};}
  .mn-stack i.gem{background-image:${art('gem', 'bare')};}
  .mn-stack i.relic{background-image:${art('relic', 'bare')};}
`;

// BODY is exported for one reason and it is worth naming: the broken bottom edge is the single
// line this redraw turns on (spec-ore.md, 3-3), and "the silhouette is interrupted" is a fact about
// the body's own vertices rather than about anything a rendered page could be asked. A check that
// could only read the finished picture would pass on a body whose bottom had been straightened
const BODY = { gem: GEM_BODY, relic: RELIC_BODY, fever: FEVER_BODY };

module.exports = { C, CSS, ART, BODY, KINDS, MODES, POCKET, RIM, uri };
