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

// A GEM: a cut stone, steel with one lit facet. The outline is ink at 1.5 units, which is the
// thinnest thing in here and still 1.5px at the rendered 24
const GEM = svg(
  "<path d='M12 2.5 21 10 12 21.5 3 10Z' fill='" + C.steel + "' stroke='" + C.ink + "' stroke-width='1.5' stroke-linejoin='round'/>"
  + "<path d='M12 3.6 5 10 12 11.6Z' fill='" + C.cream + "'/>"
);

// A RELIC: a tilted ingot sitting in a dark socket, gold with a cream top and a copper face.
//
// IT WAS A STANDING IDOL UNTIL 2026-11-25, and the idol was withdrawn for what it read as rather
// than for how it was drawn: a head, two arms and a vertical axis at 24 units is a chess piece or
// a person, and the one thing a marker in this band may not be is a figure, because the band
// already has one and it is the crab. Every part that could make a person is gone from this: no
// circle, no symmetry about a vertical, no axis at all.
//
// THE SOCKET IS INSIDE THE 24-UNIT BOX and the box did not grow. What it buys is a contrast that
// does not depend on which bit of rock the marker happens to be standing on: gold against its own
// ink is 9.74:1 wherever the seam lands (docs/mine-mockup/spec.md, section 14).
// It renders at 48px, so every unit here is two pixels and the 1.2-unit outline is 2.4px
const RELIC = svg(
  "<path d='M2.6 15.8 6.4 9.2l13.4 1.9 1.6 5.1-4.2 5.4-13-1.6Z' fill='" + C.ink + "' opacity='.9'/>"
  + "<path d='M4.9 13.9 7.9 9.3l10.3 1.5 1.1 4.2-3.3 4-9.9-1.3Z' fill='" + C.gold + "' stroke='" + C.ink + "' stroke-width='1.2' stroke-linejoin='round'/>"
  // the lit face is the top LEFT THIRD and not the whole top: a cream top face reads brighter than
  // the ember reach line, and ember is the one thing in this band that may be the brightest
  + "<path d='M7.9 9.3 12.6 10 10.4 12.5 6.4 12Z' fill='" + C.cream + "'/>"
  + "<path d='M5 14 14.9 15.3 16 19.5 6.1 18.1Z' fill='" + C.emberLo + "' opacity='.6'/>"
  + "<path d='M15.9 15.4 19.3 15 16 19Z' fill='" + C.emberLo + "' stroke='" + C.ink + "' stroke-width='1' stroke-linejoin='round'/>"
);

// A FEVER: a bolt, red with a cream core. It is the one marker that is not a thing to be dug out,
// so it is the one that is not a solid object: what it gives is ground (mine.js, FEVER_M)
//
// THE INK UNDER IT IS THE RELIC'S FIX APPLIED HERE. Red on the brightest face of the new rock is
// 1.15:1, which is not a marker, it is a stain; and the rock cannot be darkened without taking the
// gems and the reach line down with it. So the bolt is seated the way the ingot is -- the same
// outline again underneath at 4 units and round-joined, which is a two-unit ink seat that follows
// the shape instead of a box behind it. Red against that seat is 4.22:1 whatever is behind the
// marker (docs/mine-mockup/spec.md, section 14). The box did not grow: a stroke is drawn about the
// path it is on, so the seat costs the outer unit of the 24 the bolt was already inside
const FEVER = svg(
  "<path d='M13.6 2 6 13.2h4.4L9 22l8.6-11.6h-4.8Z' fill='" + C.ink + "' stroke='" + C.ink + "' stroke-width='4' stroke-linejoin='round' opacity='.9'/>"
  + "<path d='M13.6 2 6 13.2h4.4L9 22l8.6-11.6h-4.8Z' fill='" + C.red + "' stroke='" + C.ink + "' stroke-width='1.5' stroke-linejoin='round'/>"
  + "<path d='M12.6 5.4 8.6 11.6h2.6l-.8 4.6 3.6-5h-2.2Z' fill='" + C.cream + "'/>"
);

// WHAT A SEAM THE PICK IN HAND CANNOT TAKE LOOKS LIKE: rock still lying over it (mine.js's
// `gate`, and `seam[].locked` on the reply). One shelf, drawn over all three markers.
//
// IT COVERS THE BOTTOM AND NOT THE WHOLE THING, and that is the whole of what this picture has to
// say: the reader has to be able to see WHICH find is being missed, or the next rung up is a
// purchase with nothing on the other side of it. The top 45% is left alone and the jagged shelf
// takes the rest.
//
// IT IS NOT THE VEIL AND MUST NOT BE READ AS IT. The veil is a flat wash over a whole stretch of
// rock and means the pick does not reach that far; this is a shape stuck to one marker and means
// the pick is not the right key. Two different "you cannot have this" want two different pictures.
// Drawn from the LEFT edge across, because a shelf hung on the right read as a dark box parked
// beside the marker rather than as rock lying on it
const LOCK = svg(
  "<path d='M0 9.6 6.4 12.8 9.2 10.2 14.6 14.4 20.4 12 24 15.4 24 24 0 24Z' fill='" + C.slab + "' stroke='" + C.ink + "' stroke-width='1.1' stroke-linejoin='round'/>"
  + "<path d='M0 9.6 6.4 12.8 9.2 10.2 14.6 14.4 20.4 12 24 15.4' fill='none' stroke='" + C.stone + "' stroke-width='1' stroke-opacity='.45'/>"
);

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

// The three, as the mine's own stylesheet rules. The BOX is what differs and the picture fits it
// (`background-size:contain` on .mn-ore): a gem and a fever stand 24px tall and a relic 48, which
// is docs/game-panels.md 8-3's "24 / 48 / 72 only" and the one place on this screen where size
// says what something is worth. There is no third size.
const CSS = `
  .mn-ore.gem{width:24px;height:24px;background-image:url("${uri(GEM)}");}
  .mn-ore.relic{width:48px;height:48px;background-image:url("${uri(RELIC)}");}
  .mn-ore.fever{width:24px;height:24px;background-image:url("${uri(FEVER)}");}
  /* ...and the same three with the rock still over them. The shelf is the FIRST layer so it is
     drawn on top, and it is the same 24-unit picture for all three, so a 48px relic wears it at
     the same proportion a 24px gem does (background-size:contain on .mn-ore) */
  .mn-ore.gem.locked{background-image:url("${uri(LOCK)}"),url("${uri(GEM)}");}
  .mn-ore.relic.locked{background-image:url("${uri(LOCK)}"),url("${uri(RELIC)}");}
  .mn-ore.fever.locked{background-image:url("${uri(LOCK)}"),url("${uri(FEVER)}");}
`;

module.exports = { C, CSS, GEM, RELIC, FEVER, LOCK, uri };
