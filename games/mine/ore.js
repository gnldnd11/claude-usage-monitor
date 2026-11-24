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

// A RELIC: a standing idol, gold with copper arms and base. Not a disc, although gold would allow
// one: the header's credits button is already a gold disc (icons.js, `coin`) and the same drawing
// in two places is two drawings a reader has to tell apart. A figure with a head and arms is the
// one shape in this screen that is plainly a made thing rather than a mineral.
// It renders at 48px, so every unit here is two pixels and the 1.2-unit outline is 2.4px
const RELIC = svg(
  "<path d='M6 12.4h12v2.4H6Z' fill='" + C.emberLo + "' stroke='" + C.ink + "' stroke-width='1.2' stroke-linejoin='round'/>"
  + "<path d='M8.4 21.6 9.6 11h4.8l1.2 10.6Z' fill='" + C.gold + "' stroke='" + C.ink + "' stroke-width='1.2' stroke-linejoin='round'/>"
  + "<path d='M6.6 21.6h10.8v1.8H6.6Z' fill='" + C.emberLo + "' stroke='" + C.ink + "' stroke-width='1.2' stroke-linejoin='round'/>"
  + "<circle cx='12' cy='6.4' r='3.4' fill='" + C.gold + "' stroke='" + C.ink + "' stroke-width='1.2'/>"
);

// A FEVER: a bolt, red with a cream core. It is the one marker that is not a thing to be dug out,
// so it is the one that is not a solid object: what it gives is ground (mine.js, FEVER_M)
const FEVER = svg(
  "<path d='M13.6 2 6 13.2h4.4L9 22l8.6-11.6h-4.8Z' fill='" + C.red + "' stroke='" + C.ink + "' stroke-width='1.5' stroke-linejoin='round'/>"
  + "<path d='M12.6 5.4 8.6 11.6h2.6l-.8 4.6 3.6-5h-2.2Z' fill='" + C.cream + "'/>"
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
`;

module.exports = { CSS, GEM, RELIC, FEVER, uri };
