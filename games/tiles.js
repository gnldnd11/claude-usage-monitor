// The list tiles for the ten games that have no painted art.
//
// WHY SVG AND NOT A PNG. The first four games were cut from a sheet the player drew
// (game-blackjack.png and friends, 96x96, shown at 48). There is no sheet for the other ten and the
// only sprites in the repository are agents and monsters, so these are drawn here instead. They are
// strings, not files, because an inline SVG costs the webview no request and needs no
// `max-width:none` correction: the thing the stylesheet caps at 100% is `img`, and there is no img.
//
// THE PLAQUE IS NOT A FAMILY MARK. Every one of the four painted tiles sits on the same dark green
// plaque, the forge included, whose own screen is brown. So the list is one shelf: the plaque is
// constant and the OBJECT on it is what tells two games apart. A tile that changed colour by family
// would turn the list into five coloured bands and lose the one thing a column of fourteen rows
// needs, which is one scan. The plaque below is sampled off the painted four: a near-black rim, a
// fall from about #0c4726 under the top edge to #022813 in the corners, and the same woven texture
// the felt is made of in games/casino.js (1px lines on a 2px period, which is half a unit here).
//
// BRIGHT OBJECT ON A DARK PLAQUE. This is the rule the first draft of this file broke and the
// screenshot caught: the painted tiles are white cards, red and blue chips and a steel blade, all
// outlined in near-black. Ten flat grey props on dark green read as ten empty tiles at 48 pixels.
// Every object here therefore carries a light mass (cream, steel or ember) and a dark outline.
//
// THE GRID IS 24 UNITS, RENDERED AT 48. Two device pixels per unit, the same cell the pixel cards
// (16x22 at 2px) and the pixel coin (8x8 at 2px) are built on. Keep forms on whole units. Rendering
// one of these at a size that is not a multiple of 24 puts every edge on a half pixel.
//
// NO ROUNDED CORNER IN HERE. `.gm-ic` is 48x48 with `border-radius:8px` and `overflow:hidden`, so
// the corner is the frame's to cut, which is the same reason games/casino.js says a border fights
// the painted art. The rim below is a square inset and the frame clips it, exactly as it clips the
// painted tiles' own baked rim.
//
// THE PALETTE IS FIXED, NOT THEMED, for the same reason --felt and --forge have no light-theme
// value in styles.js: a table is a table in both themes. Every colour already exists in the
// extension (the ember of .bj-btn.primary, the coin's gold and copper, the card cream and card red,
// the forge's steel, the felt's win green and lose red).
'use strict';

// --- the fixed palette. Nothing here is a UI token and nothing here means a state ---
const C = {
  ink: '#0b1310',     // the outline every object carries, and the darkest hole
  slab: '#2a2f36',    // iron and shadowed stone
  stone: '#7e828c',   // the forge tile's metal, in shadow
  steel: '#bbbdc7',   // and lit
  cream: '#fcecdc',   // the painted cards' face
  creamLo: '#cbb9a4',
  ember: '#e8895a',   // .bj-btn.primary
  emberLo: '#c25a34', // the coin's rim
  gold: '#e8b23a',    // the coin's face
  red: '#d4453a',     // the painted chips' red
  win: '#7ee6a4',     // .bj-chip.win on the felt
  lose: '#f6836e'     // .bj-chip.lose on the felt
};

// The plaque, and nothing else. Both ids have to be unique inside the page because ten of these end
// up in one document, so they carry the game's key
function plaque(key) {
  const g = 'cuc-tg-' + key, w = 'cuc-tw-' + key;
  return '<defs>'
    + '<radialGradient id="' + g + '" cx="50%" cy="0%" r="124%">'
    + '<stop offset="0" stop-color="#0e4c29"/><stop offset=".5" stop-color="#073a1f"/>'
    + '<stop offset="1" stop-color="#022813"/></radialGradient>'
    // the weave: the felt's own, at half a unit so it lands on single pixels at 48
    + '<pattern id="' + w + '" width="1" height="1" patternUnits="userSpaceOnUse">'
    + '<rect width="1" height=".5" fill="#fff" opacity=".035"/>'
    + '<rect width=".5" height="1" fill="#000" opacity=".06"/></pattern></defs>'
    + '<rect width="24" height="24" fill="url(#' + g + ')"/>'
    + '<rect width="24" height="24" fill="url(#' + w + ')"/>'
    + '<rect x=".5" y=".5" width="23" height="23" fill="none" stroke="#010f07" stroke-width="1"/>';
}

// The object stands on a shadow rather than being glued to the plaque, the way the dealer does in
// games/casino.js (.bj-crab::after)
function shadow(cx, cy, rx) {
  return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="1.5" fill="#000" opacity=".36"/>';
}

function tile(key, body) {
  return '<svg class="gm-tile" viewBox="0 0 24 24" aria-hidden="true">' + plaque(key) + body + '</svg>';
}

// --- Mines. Not a grid: the grid is Keno's silhouette and two grids in one column read as one row
// drawn twice. What Mines is, is the thing under the tile, so that is what the tile shows, standing
// on the one row of board it came out of
const mines = tile('mines',
  '<g stroke="' + C.ink + '" stroke-width=".9">'
  + '<rect x="2" y="17.2" width="6.6" height="3.8" rx=".6" fill="' + C.stone + '"/>'
  + '<rect x="15.4" y="17.2" width="6.6" height="3.8" rx=".6" fill="' + C.stone + '"/></g>'
  + '<g fill="' + C.steel + '"><rect x="2.6" y="17.8" width="5.4" height=".9"/>'
  + '<rect x="16" y="17.8" width="5.4" height=".9"/></g>'
  + shadow(11.6, 19.4, 5.4)
  // the bomb
  + '<path fill="' + C.slab + '" stroke="' + C.ink + '" stroke-width=".9" d="M10 5.8h3.4v3.4H10z"/>'
  + '<circle cx="11.4" cy="13.6" r="6.4" fill="' + C.slab + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<path fill="#4b525c" d="M11.4 7.8a5.8 5.8 0 0 1 4.3 1.9A5.8 5.8 0 0 0 7 17.3a5.8 5.8 0 0 1 4.4-9.5z"/>'
  + '<circle cx="8.9" cy="11.1" r="1.5" fill="#6a727d"/>'
  // the fuse, lit. The spark is the only warm thing on the tile and it sits clear of the body
  + '<path fill="none" stroke="' + C.creamLo + '" stroke-width="1.3" stroke-linecap="round" d="M13.4 6.6c2.4-.5 3.6-2 3.4-3.6"/>'
  + '<circle cx="17.9" cy="3.4" r="2.5" fill="' + C.ember + '"/>'
  + '<circle cx="17.9" cy="3.4" r="1.2" fill="' + C.gold + '"/>');

// --- Tower. Three stone steps of rising height were drawn here first and the squint test read them
// as a bar chart, which is what three rising rectangles are. So the tile is the tower itself: the
// one tall narrow silhouette in the set, floors stacked up it, and the lit window is the floor the
// player is standing on with eight more above it
const tower = tile('tower',
  shadow(12, 21, 8)
  // the pennant, which is also what keeps the silhouette from being a column
  + '<rect x="11.6" y="1.4" width=".9" height="4" fill="' + C.stone + '"/>'
  + '<path fill="' + C.ember + '" d="M12.5 1.6l4.4 1.5-4.4 1.5z"/>'
  + '<rect x="4.4" y="18.4" width="15.2" height="2.8" rx=".5" fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<rect x="6.2" y="5" width="11.6" height="14" fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  // the battlements
  + '<g fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".9">'
  + '<rect x="5.6" y="3.6" width="2.8" height="2.2"/><rect x="10.6" y="3.6" width="2.8" height="2.2"/>'
  + '<rect x="15.6" y="3.6" width="2.8" height="2.2"/></g>'
  + '<rect x="5.6" y="5.6" width="12.8" height="1.4" fill="' + C.steel + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  // the floors, and the one window that is lit
  + '<g fill="' + C.ink + '" opacity=".55"><rect x="6.2" y="11.2" width="11.6" height=".8"/>'
  + '<rect x="6.2" y="15" width="11.6" height=".8"/></g>'
  + '<g fill="' + C.ink + '"><path d="M8.4 8.4a1.3 1.3 0 0 1 2.6 0v2.2H8.4z"/>'
  + '<path d="M13 8.4a1.3 1.3 0 0 1 2.6 0v2.2H13z"/>'
  + '<path d="M13 16.2a1.3 1.3 0 0 1 2.6 0v2.2H13z"/></g>'
  + '<path fill="' + C.ember + '" d="M8.4 12.9a1.3 1.3 0 0 1 2.6 0v2.2H8.4z"/>'
  + '<path fill="' + C.gold + '" d="M9 13.4a.7.7 0 0 1 1.4 0v1.7H9z"/>');

// --- Crash. The multiplier climbs and then it is gone, so the trail is what has already happened
// and the rocket is at the head of it, with nothing drawn above
const crash = tile('crash',
  '<g fill="' + C.ember + '">'
  + '<circle cx="3.4" cy="20.2" r="1"/><circle cx="6.4" cy="18.4" r="1.1" opacity=".85"/>'
  + '<circle cx="9.2" cy="16.2" r="1.2" opacity=".9"/><circle cx="11.7" cy="13.6" r="1.3"/>'
  + '<circle cx="13.8" cy="10.8" r="1.4"/></g>'
  + '<g transform="rotate(42 17 7)">'
  + '<path fill="' + C.ember + '" d="M15.2 9.6h3.6l-1.8 4.4z"/>'
  + '<path fill="' + C.gold + '" d="M16.2 9.6h1.6l-.8 2.6z"/>'
  + '<path fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".8" d="M17 1.8c1.8 1.5 2.7 3.6 2.7 6v2.2h-5.4V7.8c0-2.4.9-4.5 2.7-6z"/>'
  + '<path fill="' + C.creamLo + '" d="M17 1.8c1.8 1.5 2.7 3.6 2.7 6v2.2h-1.5V7.8c0-2.4-.4-4.5-1.2-6z"/>'
  + '<path fill="' + C.red + '" stroke="' + C.ink + '" stroke-width=".8" d="M14.3 7.4l-2 2.6h2zM19.7 7.4l2 2.6h-2z"/>'
  + '<circle cx="17" cy="5.8" r="1.5" fill="' + C.ink + '"/>'
  + '<circle cx="16.5" cy="5.3" r=".6" fill="#6ec0dd"/></g>');

// --- Slots. A cabinet with three windows and a lever: the only machine in the set, and the two
// matching symbols with one odd one between them are the near miss this game is mostly made of
const slots = tile('slots',
  shadow(11, 21.4, 8)
  + '<rect x="1.8" y="3.8" width="16.4" height="17.2" rx="1.6" fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<rect x="2.6" y="4.6" width="14.8" height="1.6" rx=".8" fill="' + C.steel + '"/>'
  + '<rect x="3.2" y="7.6" width="13.6" height="8.6" rx=".6" fill="#10151a" stroke="' + C.ink + '" stroke-width=".8"/>'
  + '<g fill="#1d242b"><rect x="3.8" y="8.2" width="4" height="7.4"/>'
  + '<rect x="8" y="8.2" width="4" height="7.4"/><rect x="12.2" y="8.2" width="4" height="7.4"/></g>'
  + '<circle cx="5.8" cy="11.9" r="1.9" fill="' + C.ember + '"/>'
  + '<circle cx="14.2" cy="11.9" r="1.9" fill="' + C.ember + '"/>'
  + '<circle cx="10" cy="11.9" r="1.9" fill="' + C.cream + '"/>'
  + '<circle cx="9.4" cy="11.3" r=".8" fill="#fff"/>'
  + '<rect x="3.2" y="17.6" width="13.6" height="2.4" rx=".6" fill="' + C.slab + '"/>'
  + '<rect x="3.8" y="18.2" width="5.4" height="1.2" fill="' + C.gold + '"/>'
  // the lever
  + '<rect x="18.8" y="6.4" width="1.8" height="9.4" rx=".9" fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".8"/>'
  + '<circle cx="19.7" cy="4.8" r="2.6" fill="' + C.ember + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<circle cx="19" cy="4.1" r="1" fill="#f6b093"/>');

// --- Scratch card. The only pale mass in the set, which is what tells it from the dark boards at a
// glance: a cream ticket, silver foil over it, and the coin halfway down a cleared lane
const scratch = tile('scratch',
  shadow(11.5, 20.8, 7)
  + '<rect x="3" y="2.6" width="14.4" height="17.8" rx=".8" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<path fill="' + C.creamLo + '" d="M15.8 2.6h1.6v17.8h-1.6z"/>'
  + '<rect x="4.6" y="4" width="11.2" height="2" fill="' + C.ember + '"/>'
  + '<rect x="4.6" y="7" width="11.2" height="11.2" fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".7"/>'
  + '<rect x="5" y="7.4" width="10.4" height="1.2" fill="' + C.steel + '"/>'
  // the lane the coin has cleared, on the same slate the symbol cells use
  + '<rect x="4.6" y="11.6" width="11.2" height="4" fill="#15181c"/>'
  + '<circle cx="7.4" cy="13.6" r="1.4" fill="' + C.ember + '"/>'
  + '<circle cx="11.4" cy="13.6" r="1.4" fill="' + C.ember + '"/>'
  // the coin doing it, and the foil it threw off
  + '<circle cx="17.4" cy="14.6" r="4" fill="' + C.emberLo + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<circle cx="17.4" cy="14.6" r="2.8" fill="' + C.gold + '"/>'
  + '<circle cx="16.6" cy="13.8" r="1" fill="#f6d27a"/>'
  + '<g fill="' + C.steel + '"><rect x="18.2" y="9.4" width="1.4" height="1.4"/>'
  + '<rect x="20" y="11.4" width="1.1" height="1.1"/><rect x="19.4" y="19" width="1.1" height="1.1"/></g>');

// --- Plinko. Twelve rows of pins in the game, three here: enough that the shape is a triangle of
// dots, which nothing else in the set is. The edge bins pay and the middle does not, which is the
// whole of this game, so the bins are drawn in those two colours
const plinko = tile('plinko',
  '<circle cx="12" cy="3.6" r="2.3" fill="' + C.ember + '" stroke="' + C.ink + '" stroke-width=".8"/>'
  + '<circle cx="11.3" cy="2.9" r=".8" fill="#f6b093"/>'
  + '<g fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".6">'
  + '<circle cx="12" cy="8.4" r="1.25"/>'
  + '<circle cx="8.3" cy="12.2" r="1.25"/><circle cx="15.7" cy="12.2" r="1.25"/>'
  + '<circle cx="4.6" cy="16" r="1.25"/><circle cx="12" cy="16" r="1.25"/><circle cx="19.4" cy="16" r="1.25"/></g>'
  + '<g stroke="' + C.ink + '" stroke-width=".8">'
  + '<rect x="1.6" y="18.4" width="4.8" height="2.9" rx=".5" fill="' + C.ember + '"/>'
  + '<rect x="6.8" y="18.4" width="4.8" height="2.9" rx=".5" fill="' + C.slab + '"/>'
  + '<rect x="12" y="18.4" width="4.8" height="2.9" rx=".5" fill="' + C.slab + '"/>'
  + '<rect x="17.2" y="18.4" width="4.8" height="2.9" rx=".5" fill="' + C.ember + '"/></g>');

// --- Wheel. Twenty-eight slots in the game; eight here, because at 48 pixels a twenty-eighth of a
// circle is a quarter of a pixel wide. One of them is the one worth having
const wheel = (function () {
  const cx = 12, cy = 13, r = 8.2;
  let seg = '';
  for (let i = 0; i < 8; i++) {
    const a0 = (i * 45 - 112.5) * Math.PI / 180, a1 = ((i + 1) * 45 - 112.5) * Math.PI / 180;
    const x0 = (cx + r * Math.cos(a0)).toFixed(2), y0 = (cy + r * Math.sin(a0)).toFixed(2);
    const x1 = (cx + r * Math.cos(a1)).toFixed(2), y1 = (cy + r * Math.sin(a1)).toFixed(2);
    // the paying slot is kept off the top: under the pointer the two of them read as one arrow
    const fill = i === 2 ? C.ember : (i % 2 ? '#133a26' : '#0a2416');
    seg += '<path fill="' + fill + '" d="M' + cx + ' ' + cy + 'L' + x0 + ' ' + y0 + 'A' + r + ' ' + r + ' 0 0 1 ' + x1 + ' ' + y1 + 'z"/>';
  }
  return tile('wheel',
    shadow(12, 21.6, 7)
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + 1.3) + '" fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".9"/>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="#0a2416"/>'
    + seg
    + '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + C.ink + '" stroke-width=".7"/>'
    + '<circle cx="' + cx + '" cy="' + cy + '" r="2.4" fill="' + C.steel + '" stroke="' + C.ink + '" stroke-width=".8"/>'
    + '<circle cx="' + (cx - .7) + '" cy="' + (cy - .7) + '" r=".9" fill="' + C.cream + '"/>'
    + '<path fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".8" d="M12 7.2l-2.6-4.4h5.2z"/>');
})();

// --- Keno. The grid belongs here: forty numbers, two to ten of them marked, and then the draw. The
// drawn ball hanging off the corner is what separates this from a card with squares on it
const keno = (function () {
  const on = { 1: 1, 4: 1, 6: 1, 11: 1 };   // the marks, placed so no two touch
  let cells = '';
  for (let i = 0; i < 12; i++) {
    const x = 4.3 + (i % 4) * 3.4, y = 5.9 + Math.floor(i / 4) * 3.4;
    cells += '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="2.6" height="2.6" rx=".5" fill="'
      + (on[i] ? C.ember : C.stone) + '"' + (on[i] ? '' : ' opacity=".55"') + '/>';
  }
  return tile('keno',
    shadow(10.5, 20.4, 7)
    + '<rect x="2.6" y="3.8" width="15" height="16" rx="1" fill="#1b2128" stroke="' + C.ink + '" stroke-width=".9"/>'
    + '<rect x="3.3" y="4.4" width="13.6" height="1.1" rx=".5" fill="' + C.stone + '"/>'
    + cells
    + '<circle cx="18.2" cy="17.4" r="4.1" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9"/>'
    + '<path fill="' + C.creamLo + '" d="M18.2 13.3a4.1 4.1 0 0 1 0 8.2 4.1 4.1 0 0 0 0-8.2z"/>'
    + '<circle cx="18.2" cy="17.4" r="1.7" fill="' + C.ember + '"/>');
})();

// --- Red Dog. Two cards apart, and the gap between them is the bet, so it is the thing the tile is
// built around: the dashed card is where the third one lands and whether it fits is the game
const reddog = tile('reddog',
  shadow(12, 20.6, 8)
  + '<rect x="1.6" y="5" width="7.4" height="11.8" rx=".9" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<path fill="' + C.red + '" d="M5.3 7.9c1.9 1.5 2.8 2.7 2.8 3.9 0 1.1-.9 1.8-1.8 1.8-.4 0-.7-.1-1-.4-.3.3-.6.4-1 .4-.9 0-1.8-.7-1.8-1.8 0-1.2.9-2.4 2.8-3.9z"/>'
  + '<rect x="15" y="5" width="7.4" height="11.8" rx=".9" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<path fill="#1d1d1f" d="M18.7 7.7l2.8 3.6c.6.9 0 2-1 2-.4 0-.8-.2-1.1-.5l.4 1.7h-2.2l.4-1.7c-.3.3-.7.5-1.1.5-1 0-1.6-1.1-1-2z"/>'
  // and the third card, face down between them, which is the bet. A dashed outline was drawn here
  // first and read as a striped post; the card back says the same thing and says it as a card
  + '<rect x="9.3" y="4.2" width="5.4" height="12.4" rx=".8" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<rect x="10.1" y="5" width="3.8" height="10.8" fill="' + C.ember + '"/>'
  + '<g stroke="' + C.emberLo + '" stroke-width=".9">'
  + '<path d="M10.1 7.2l3.8 3.8M10.1 11l3.8-3.8M10.1 11.6l3.8 3.8M10.1 15.4l3.8-3.8"/></g>');

// --- The four dice games. They share a family on the list (Dice · Sic Bo · Hazard · Shut the Box)
// and the thing that has to work here is that the four are told apart at 24 PIXELS, which is what
// `.gm-ic .gm-tile` renders at. At that size a die is a cream square and its pips are whatever is
// left, so the four are separated by SILHOUETTE first and only then by what is on the faces:
//
//   Dice        a horizontal two-tone lane with a readout standing over it. No die at all: this
//               game rolls 0.00 to 99.99 and shows a numeral, so a cube here would be a lie
//   Sic Bo      three cream squares, clustered
//   Hazard      one cream square and a tall tube filling up beside it
//   Shut the Box  one wide low box of slats, half of them fallen, with a die resting on it
//
// Counting pips is not asked of anyone: at 24px a pip on a 9-unit die is one pixel across. Each
// face below carries two or three OVERSIZED pips, the way the wheel tile carries eight slices
// instead of twenty-eight.

// Dice. The lane is the game: everything left of the marker wins and everything right of it loses,
// and the plaque standing on the marker is where the roll is printed
// A pale plaque with three dark windows in it was drawn here first, as the readout the roll is
// printed on. At 48 it was the slots cabinet: a light box with three dark slots in it. So the
// readout is gone and the lane is the whole tile, with one cream pointer standing where the line is
const dice = tile('dice',
  shadow(12, 21.6, 9.5)
  // the lane, and the part of it that pays. One continuous two-tone bar, which nothing else in the
  // set has: plinko's four cups are separate boxes with a field of pins over them
  + '<rect x="1.6" y="10.6" width="20.8" height="7" rx="2.6" fill="' + C.slab + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<path fill="' + C.ember + '" d="M4.2 11.1h8.2v6H4.2a2.5 2.5 0 0 1 0-6z"/>'
  + '<path fill="' + C.emberLo + '" d="M4.2 15.2h8.2v1.9H4.2a2.5 2.5 0 0 1-2.1-1.9z"/>'
  // the scale, so the bar is read as a run from one end to the other and not as a progress bar
  + '<g fill="' + C.steel + '" opacity=".5"><rect x="6.3" y="18.4" width=".9" height="2.2"/>'
  + '<rect x="11.6" y="18.4" width=".9" height="2.2"/><rect x="16.9" y="18.4" width=".9" height="2.2"/></g>'
  // the line itself: where the player put it, and which side of it the roll has to land on
  + '<path fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9" d="M12.4 10.2L8.3 3.2h8.2z"/>'
  + '<path fill="' + C.creamLo + '" d="M12.4 10.2l2.1-3.6h2z"/>'
  + '<rect x="11.7" y="10.4" width="1.4" height="7.4" fill="' + C.cream + '"/>');

// Sic Bo. Three dice and nothing else: the bet is a word and the roll is three cubes, so the cubes
// are the tile. Stacked two over one rather than laid in a row, because three in a row at 24px is a
// dashed line and this has to read as a handful
const sicbo = (function () {
  const die = (x, y, s, spots) => {
    const u = s / 24, r = 2.9 * u;
    return '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" rx="' + (3 * u)
      + '" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9"/>'
      + '<path fill="' + C.creamLo + '" d="M' + (x + s - 1.4 * u * 24 * u) + ' ' + y + 'h0z"/>'
      + '<g fill="' + C.ink + '">'
      + spots.map((p) => '<circle cx="' + (x + p[0] * s).toFixed(2) + '" cy="' + (y + p[1] * s).toFixed(2)
        + '" r="' + r.toFixed(2) + '"/>').join('') + '</g>';
  };
  const A = [[.3, .3], [.7, .7]];                       // two
  const B = [[.3, .3], [.5, .5], [.7, .7]];             // three
  const D = [[.5, .5]];                                 // one
  return tile('sicbo',
    shadow(12, 21.2, 9)
    + die(7.2, 1.8, 9.4, B)
    + die(1.8, 10.4, 9.4, A)
    + die(12.8, 10.4, 9.4, D));
})();

// Hazard. One die, and a tube beside it that the pips pile up in until a 1 empties it. The tube is
// what keeps this off Sic Bo's silhouette: one square and a tall column, not three squares
const hazard = tile('hazard',
  shadow(9, 21, 7)
  // the tube, filled a little over half way
  + '<rect x="16.4" y="2.4" width="5.8" height="18.6" rx="1.4" fill="' + C.ink + '" opacity=".45"/>'
  + '<rect x="16.4" y="2.4" width="5.8" height="18.6" rx="1.4" fill="none" stroke="' + C.stone + '" stroke-width="1"/>'
  // gold and not cream: at 24px a cream tube beside a cream die is two pale blobs, and so is Sic
  // Bo's three. The pile is the only warm mass in the four, which is what separates the two rows
  + '<g fill="' + C.gold + '"><circle cx="18.2" cy="19.2" r="1.3"/><circle cx="20.6" cy="19.2" r="1.3"/>'
  + '<circle cx="18.2" cy="16.4" r="1.3"/><circle cx="20.6" cy="16.4" r="1.3"/>'
  + '<circle cx="18.2" cy="13.6" r="1.3"/><circle cx="20.6" cy="13.6" r="1.3"/>'
  + '<circle cx="19.4" cy="10.8" r="1.3"/></g>'
  // the die, mid roll, showing a face that pays
  + '<rect x="1.6" y="6" width="13.2" height="13.2" rx="2" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width="1"/>'
  + '<path fill="' + C.creamLo + '" d="M12.8 6h2v13.2h-2z"/>'
  + '<g fill="' + C.ink + '"><circle cx="5" cy="9.4" r="1.5"/><circle cx="11.4" cy="9.4" r="1.5"/>'
  + '<circle cx="8.2" cy="12.6" r="1.5"/>'
  + '<circle cx="5" cy="15.8" r="1.5"/><circle cx="11.4" cy="15.8" r="1.5"/></g>');

// Shut the Box. The box itself: nine slats, and the ones that are down are holes rather than tiles.
// The die on the lid is the family mark and it is also what makes this tile asymmetric, which is
// what tells it from a cabinet or a card at a glance
const shutbox = tile('shutbox',
  shadow(12, 21.4, 9)
  + '<rect x="1.4" y="8.6" width="21.2" height="12.4" rx="1.4" fill="' + C.stone + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<rect x="1.4" y="8.6" width="21.2" height="1.8" fill="' + C.steel + '"/>'
  // four up, three down. The holes are drawn first so a slat can overlap one
  + '<g fill="' + C.ink + '" opacity=".75"><rect x="3" y="11.6" width="2.4" height="7.8" rx=".4"/>'
  + '<rect x="9.2" y="11.6" width="2.4" height="7.8" rx=".4"/>'
  + '<rect x="18.5" y="11.6" width="2.4" height="7.8" rx=".4"/></g>'
  + '<g fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".8">'
  + '<rect x="6.1" y="11.6" width="2.4" height="7.8" rx=".4"/>'
  + '<rect x="12.3" y="11.6" width="2.4" height="7.8" rx=".4"/>'
  + '<rect x="15.4" y="11.6" width="2.4" height="7.8" rx=".4"/></g>'
  // the die, resting on the lid
  + '<rect x="4.2" y="1.6" width="8.6" height="8.6" rx="1.4" fill="' + C.cream + '" stroke="' + C.ink + '" stroke-width=".9"/>'
  + '<path fill="' + C.creamLo + '" d="M11.2 1.6h1.6v8.6h-1.6z"/>'
  + '<g fill="' + C.ink + '"><circle cx="6.6" cy="4" r="1.2"/><circle cx="10.4" cy="7.8" r="1.2"/>'
  + '<circle cx="8.5" cy="5.9" r="1.2"/></g>');

// --- The market. Not a game, and the tile says so: no felt furniture, no card, no coin, just the
// only chart in the casino. The two reds are there so the tile is not read as a win
const market = tile('market',
  '<rect x="1.8" y="19.6" width="20.4" height=".9" fill="' + C.stone + '" opacity=".5"/>'
  + '<g fill="' + C.lose + '" stroke="' + C.ink + '" stroke-width=".55">'
  + '<rect x="3.1" y="10.4" width="1.2" height="7.6"/><rect x="1.9" y="12" width="3.6" height="4.4" rx=".3"/>'
  + '<rect x="11.9" y="7.6" width="1.2" height="7.2"/><rect x="10.7" y="9" width="3.6" height="4.2" rx=".3"/></g>'
  + '<g fill="' + C.win + '" stroke="' + C.ink + '" stroke-width=".55">'
  + '<rect x="7.5" y="7.2" width="1.2" height="8.6"/><rect x="6.3" y="8.6" width="3.6" height="5.6" rx=".3"/>'
  + '<rect x="16.3" y="5.2" width="1.2" height="8.2"/><rect x="15.1" y="6.6" width="3.6" height="5.4" rx=".3"/>'
  + '<rect x="20.7" y="2.6" width="1.2" height="8.8"/><rect x="19.5" y="4" width="3.6" height="6.2" rx=".3"/></g>');

// `mines`, `tower`, `crash` and `keno` are drawn but not used: those four games left the floor on
// 2026-11-06 and no meta.js asks for their tile any more. They are kept because an export nobody
// reads costs nothing and the drawings are the expensive part.
module.exports = {
  mines, tower, crash, slots, scratch, plinko, wheel, keno, reddog, market,
  dice, sicbo, hazard, shutbox
};
