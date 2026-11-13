// The ten sea symbols the slot machine is paid in.
//
// RARITY IS DRAWN, NOT ONLY PRINTED. The paytable already sorts these by weight (slots.js, rarest
// first) and the point of a machine like this is that the rare symbol is the one
// the eye finds. So the ladder below is a ladder of MASS and WARMTH, not just of hue: the crab is
// the biggest and the warmest thing on the reel, the pearl is the brightest, and the kelp is small,
// cool and quiet because it turns up once in three squares and a loud kelp would make every losing
// card look like a win.
//
//   tier  weight  symbol                    drawn as
//   1     3       crab                      20 units wide, ember, the only symbol with a face
//   2     4       pearl, anchor             bright cream / bright steel, compact
//   3     5       starfish, urchin, jelly   gold / violet / pale cyan, mid mass
//   4     6       bottle, coral             bottle green / dusty rose, mid mass, low chroma
//   5     7       shell, kelp               sand / sea green, smallest and dimmest
//
// The weights are the slot machine's. The scratch card was paid in these too, at its own weights,
// until it left the floor on 2026-11-13; nothing in the drawings was its, so nothing came out.
//
// THE THREE RADIAL ONES ARE NOT THREE RADIAL ONES. Urchin, starfish and coral would all be a blob
// with arms at this size, so only two of them are: the starfish is a five-armed star lying flat and
// the urchin is a round body with short bristles, which is a disc and not a star. The coral is taken
// off that axis entirely and drawn as an upright branch growing from a foot, so its silhouette is
// tall and one-sided where the other two are wide and symmetric.
//
// GRID AND SIZE. 24 units, meant to be rendered at 48 device pixels, which is two pixels a unit:
// the same cell as games/tiles.js, the pixel cards and the pixel coin. Render at 24, 48 or 72 and
// the forms stay on whole pixels. Anything else (44, 60) puts every edge on a half pixel, which is
// why the panel spec gives the reel window 48.
//
// ONE BACKGROUND. These are drawn for the dark slate cell the spec calls `.sy-cell` and they are
// toned for it. They carry no outline of their own: a black outline would vanish on that slate, so
// each form is modelled in two or three tones of its own colour instead, the way the painted tiles
// are.
'use strict';

// Every symbol's drawing is kept as well as its finished <svg>, because the game that uses these
// needs nine cells at once: a reel shows three rows on three reels. Pasting the full markup nine
// times is nine copies of the crab's legs in the document, so html.js publishes one hidden <defs>
// (`sprite()`) and a cell is a four-attribute <use> (`use()`).
const BODY = {};
const KEYS = Object.freeze(['crab', 'pearl', 'anchor', 'starfish', 'shell', 'kelp',
  'urchin', 'jellyfish', 'bottle', 'coral']);

function sym(key, body) {
  BODY[key] = body;
  return '<svg class="sy" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
}

// One hidden sprite for the whole page. It is display:none in the stylesheet, which does NOT stop a
// <use> of it rendering: a <symbol> is never drawn where it stands
function sprite() {
  return '<svg class="sy-sprite" aria-hidden="true" width="0" height="0">'
    + KEYS.map((k) => '<symbol id="sy-' + k + '" viewBox="0 0 24 24">' + BODY[k] + '</symbol>').join('')
    + '</svg>';
}

// One cell's worth. `label` is not optional in practice: the art is aria-hidden, so whatever shows a
// symbol has to name it, the same rule the pixel cards keep (CUC.cardWord)
function use(key) {
  return '<svg class="sy" viewBox="0 0 24 24" aria-hidden="true"><use href="#sy-' + key + '"/></svg>';
}

// --- tier 1 -----------------------------------------------------------------------------------
// The jackpot, once in 13,824 spins. It is the mascot, so it is the extension's own orange
// (crab.png, .bj-btn.primary) and it is the only symbol that looks back at the player
const crab = sym('crab',
  // legs first, so the shell sits on top of their roots
  '<g stroke="#c25a34" stroke-width="1.5" stroke-linecap="round" fill="none">'
  + '<path d="M6.4 14.6L3 16.4M6.2 16.6L3.4 19.2M7.4 18.2L6 21"/>'
  + '<path d="M17.6 14.6L21 16.4M17.8 16.6L20.6 19.2M16.6 18.2L18 21"/></g>'
  // claws
  + '<g fill="#e8895a"><path d="M4.4 7.6a2.6 2.6 0 0 1 2.6 2.6v1.3H4.9l-1.6-1.6z"/>'
  + '<path d="M19.6 7.6a2.6 2.6 0 0 0-2.6 2.6v1.3h2.1l1.6-1.6z"/></g>'
  + '<g fill="#c25a34"><path d="M3.3 9.9l1.6 1.6H3.1l-.9-1z"/><path d="M20.7 9.9l-1.6 1.6h1.8l.9-1z"/></g>'
  // the shell
  + '<path fill="#e8895a" d="M12 8.2c4.2 0 6.9 2.6 6.9 5.7S16 19.4 12 19.4s-6.9-2.4-6.9-5.5S7.8 8.2 12 8.2z"/>'
  + '<path fill="#f2a780" d="M12 8.2c2.2 0 4 .7 5.2 1.8-1.3-.7-3.1-1.1-5.2-1.1s-3.9.4-5.2 1.1C8 8.9 9.8 8.2 12 8.2z"/>'
  + '<path fill="#c25a34" d="M5.3 15.2c1.2 2.4 3.6 4.2 6.7 4.2s5.5-1.8 6.7-4.2c-.9 3-3.4 4.9-6.7 4.9s-5.8-1.9-6.7-4.9z"/>'
  // eyes on stalks
  + '<g fill="#c25a34"><rect x="8.5" y="5.4" width="1.4" height="3.6" rx=".7"/>'
  + '<rect x="14.1" y="5.4" width="1.4" height="3.6" rx=".7"/></g>'
  + '<circle cx="9.2" cy="5" r="1.9" fill="#fcecdc"/><circle cx="14.8" cy="5" r="1.9" fill="#fcecdc"/>'
  + '<circle cx="9.4" cy="5.2" r=".9" fill="#1d1d1f"/><circle cx="15" cy="5.2" r=".9" fill="#1d1d1f"/>'
  // the mouth, so the shell is read as a face and not as a stone
  + '<path fill="#c25a34" d="M9.8 14.4h4.4v1.3H9.8z" opacity=".75"/>');

// --- tier 2 -----------------------------------------------------------------------------------
// The brightest thing on the reel and the smallest of the top three: luminance carries it, not size
const pearl = sym('pearl',
  '<ellipse cx="12" cy="20.1" rx="5.4" ry="1.5" fill="#000" opacity=".3"/>'
  + '<circle cx="12" cy="12.4" r="6.6" fill="#e3d6c8"/>'
  + '<path fill="#fcecdc" d="M12 5.8a6.6 6.6 0 0 1 5.9 3.6A6.6 6.6 0 0 0 7 16.9 6.6 6.6 0 0 1 12 5.8z"/>'
  + '<circle cx="9.6" cy="9.8" r="2.1" fill="#fff"/>'
  + '<path fill="#bbbdc7" d="M17.6 14.6a6.6 6.6 0 0 1-9.9 3.5 6.6 6.6 0 0 0 9.1-5z"/>'
  + '<g fill="#fff"><path d="M19.4 4.6l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6z"/>'
  + '<path d="M4.6 15.4l.4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4z"/></g>');

// The only metal object. Drawn as a shape with holes in it rather than as a mass, because an outline
// is what an anchor is: nothing else in the set is read by its gaps
const anchor = sym('anchor',
  '<g fill="#bbbdc7">'
  + '<path d="M11 7.4h2v12.2h-2z"/>'
  + '<path d="M5.6 9.6h12.8v1.9H5.6z"/>'
  + '<path d="M12 2.6a3.1 3.1 0 0 1 0 6.2 3.1 3.1 0 0 1 0-6.2zm0 1.9a1.2 1.2 0 0 0 0 2.4 1.2 1.2 0 0 0 0-2.4z"/>'
  + '<path d="M4.1 12.4c0 4.2 3.5 7.6 7.9 7.6v-2.1c-3.2 0-5.8-2.5-5.8-5.5zM19.9 12.4c0 4.2-3.5 7.6-7.9 7.6v-2.1c3.2 0 5.8-2.5 5.8-5.5z"/>'
  + '<path d="M2.4 11.1h3.5l-1.8 3.3zM21.6 11.1h-3.5l1.8 3.3z"/></g>'
  + '<g fill="#7e828c"><path d="M12 7.4h1v12.2h-1z"/><path d="M12 9.6h6.4v1.9H12z"/>'
  + '<path d="M19.9 12.4c0 4.2-3.5 7.6-7.9 7.6v-1.1c3.6 0 6.7-2.8 6.9-6.5z"/></g>');

// --- tier 3 -----------------------------------------------------------------------------------
// Five arms, lying flat, symmetric. The one deliberate star in the set
const starfish = (function () {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    // 8.6, not the 9.6 drawn first: a five-pointed gold star at full size outshouted the anchor,
    // which is a rarer symbol, and the ladder in this file's header is the thing being drawn
    const r = i % 2 ? 3.8 : 8.6, a = (i * 36 - 90) * Math.PI / 180;
    pts.push((12 + r * Math.cos(a)).toFixed(2) + ' ' + (12.4 + r * Math.sin(a)).toFixed(2));
  }
  return sym('starfish',
    '<path fill="#e8b23a" d="M' + pts.join('L') + 'z"/>'
    + '<path fill="#c08c22" d="M' + pts.slice(4, 9).join('L') + 'L12 12.4z" opacity=".55"/>'
    + '<g fill="#f6d27a"><circle cx="12" cy="12.4" r="1.5"/>'
    + '<circle cx="12" cy="7.4" r=".7"/><circle cx="8.4" cy="14.3" r=".7"/><circle cx="15.6" cy="14.3" r=".7"/></g>');
})();

// A disc with bristles, not a star: the body is solid and round at this size and the spines are
// short enough to read as a fuzz around it rather than as arms. Longer spines were drawn first and
// the check page read them as a sun, which is the same mistake as drawing a third radial symbol
const urchin = (function () {
  let spines = '';
  for (let i = 0; i < 16; i++) {
    const a = (i * 360 / 16 - 90) * Math.PI / 180;
    const x0 = (12 + 5.8 * Math.cos(a)).toFixed(2), y0 = (12.2 + 5.8 * Math.sin(a)).toFixed(2);
    const x1 = (12 + 8.6 * Math.cos(a)).toFixed(2), y1 = (12.2 + 8.6 * Math.sin(a)).toFixed(2);
    spines += 'M' + x0 + ' ' + y0 + 'L' + x1 + ' ' + y1;
  }
  return sym('urchin',
    '<path fill="none" stroke="#63507d" stroke-width="1.5" stroke-linecap="round" d="' + spines + '"/>'
    + '<circle cx="12" cy="12.2" r="6.4" fill="#8e6fa8"/>'
    + '<path fill="#a98cc0" d="M12 5.8a6.4 6.4 0 0 1 5.2 2.7A6.4 6.4 0 0 0 7.2 16.4 6.4 6.4 0 0 1 12 5.8z"/>'
    + '<path fill="#63507d" d="M18.2 14.2a6.4 6.4 0 0 1-9.9 3.9 6.4 6.4 0 0 0 9.1-5.1z"/>'
    + '<g fill="#4c3c61"><circle cx="12" cy="12.2" r="1.3"/>'
    + '<circle cx="9.3" cy="10" r=".8"/><circle cx="14.6" cy="14" r=".8"/></g>');
})();

// A dome with strands under it. The only symbol that hangs rather than sits, so it is the one shape
// in the set with nothing at the bottom edge
const jellyfish = sym('jellyfish',
  '<path fill="none" stroke="#5ba6bd" stroke-width="1.4" stroke-linecap="round"'
  + ' d="M8.2 13.4c-.7 2 .5 2.6-.2 4.6M10.7 13.8c-.5 2.3.7 3 0 5.3M13.3 13.8c.5 2.3-.7 3 0 5.3M15.8 13.4c.7 2-.5 2.6.2 4.6"/>'
  + '<path fill="#8fd6e8" d="M12 3.6c4.4 0 7.2 3.2 7.2 6.9 0 1.3-.5 2.4-1.3 3.1H6.1c-.8-.7-1.3-1.8-1.3-3.1 0-3.7 2.8-6.9 7.2-6.9z"/>'
  + '<path fill="#bdeaf5" d="M12 3.6c2 0 3.7.7 4.9 1.8-1.3-.7-3-1.1-4.9-1.1s-3.6.4-4.9 1.1C8.3 4.3 10 3.6 12 3.6z"/>'
  + '<path fill="#5ba6bd" d="M5.4 12.2h13.2c-.2.5-.5 1-.9 1.4H6.3c-.4-.4-.7-.9-.9-1.4z"/>'
  + '<g fill="#2e6d80"><circle cx="9.9" cy="9.1" r="1"/><circle cx="14.1" cy="9.1" r="1"/></g>');

// --- tier 4 -----------------------------------------------------------------------------------
// Glass, a cork and a rolled note. Tilted, because a bottle standing upright at this size is a tube
const bottle = sym('bottle',
  '<g transform="rotate(-24 12 12)">'
  + '<path fill="#7fae8e" d="M9.6 7.4h4.8v2.4c0 .9.5 1.4 1.1 2 .7.7 1.1 1.5 1.1 2.6v5.2c0 1-.8 1.8-1.8 1.8H9.2c-1 0-1.8-.8-1.8-1.8v-5.2c0-1.1.4-1.9 1.1-2.6.6-.6 1.1-1.1 1.1-2z"/>'
  + '<path fill="#a3cbb1" d="M10.6 8.4v1.4c0 1.3-.6 2-1.3 2.7-.5.5-.8 1-.8 1.9v5.2h1.2v-5.2c0-.9.3-1.4.8-1.9.7-.7 1.3-1.4 1.3-2.7V8.4z"/>'
  + '<path fill="#4f7a62" d="M16.6 14.4v5.2c0 1-.8 1.8-1.8 1.8h-1.6c1 0 1.8-.8 1.8-1.8v-5.2c0-1.1-.4-1.9-1.1-2.6-.6-.6-1.1-1.1-1.1-2V8.4h1.6v1.4c0 .9.5 1.4 1.1 2 .7.7 1.1 1.5 1.1 2.6z"/>'
  + '<rect x="9.4" y="3.2" width="5.2" height="4.4" rx=".9" fill="#c99a62"/>'
  + '<rect x="9.4" y="3.2" width="5.2" height="1.2" rx=".6" fill="#e0b57f"/>'
  // the letter: the only cream inside the glass, so the bottle is read as carrying something
  + '<rect x="9.9" y="13" width="4.2" height="6.2" rx="2.1" fill="#fcecdc"/>'
  + '<g fill="#b4595a"><rect x="10.8" y="14.4" width="2.4" height=".7"/>'
  + '<rect x="10.8" y="16" width="2.4" height=".7"/><rect x="10.8" y="17.6" width="1.6" height=".7"/></g>'
  + '</g>');

// Upright and one-sided: the branch is what keeps this off the starfish and urchin axis
const coral = sym('coral',
  '<path fill="none" stroke="#b4595a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'
  + ' d="M11.4 20.4V13M11.4 16.2L7.4 12.6M7.4 12.6V8.8"/>'
  + '<path fill="none" stroke="#e0867f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'
  + ' d="M11.4 13.8l4.3-3.8M15.7 10V5.6M11.4 13V9.6M11.4 9.6L14 7"/>'
  + '<g fill="#e0867f"><circle cx="15.7" cy="4.8" r="1.7"/><circle cx="14.6" cy="6.4" r="1.4"/></g>'
  + '<g fill="#b4595a"><circle cx="7.4" cy="8" r="1.7"/><circle cx="11.4" cy="9" r="1.4"/></g>'
  + '<path fill="#8c4446" d="M6.6 19.2h10v1.8c0 .6-.5 1-1 1h-8c-.6 0-1-.4-1-1z"/>');

// --- tier 5 -----------------------------------------------------------------------------------
// Sand, low chroma: it is near the bottom of the ladder and should not look like it pays more.
// The hinge is at the BOTTOM and the scalloped edge opens upward, which is the way round a scallop
// actually is. Drawn dome-up first, it read as a sun hat on the check page
const shell = (function () {
  const hx = 12, hy = 20, A0 = -168, A1 = -12, N = 7;
  const pt = (i) => {
    const a = (A0 + (A1 - A0) * i / (N * 2)) * Math.PI / 180, r = i % 2 ? 11.6 : 10.2;
    return [hx + r * Math.cos(a), hy + r * Math.sin(a)];
  };
  let edge = '', ribs = '';
  for (let i = 0; i <= N * 2; i++) {
    const p = pt(i);
    edge += (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2);
    if (i % 2 === 0) ribs += 'M' + hx + ' ' + hy + 'L' + p[0].toFixed(2) + ' ' + p[1].toFixed(2);
  }
  return sym('shell',
    '<path fill="#cbb9a4" d="' + edge + 'L' + hx + ' ' + hy + 'z"/>'
    + '<path fill="none" stroke="#9a8974" stroke-width="1.1" d="' + ribs + '"/>'
    + '<path fill="#e0d2bf" d="M12 20L5 12.6a9.4 9.4 0 0 1 3.4-2.3z"/>'
    + '<path fill="#9a8974" d="M9.6 19.4h4.8v1.6a2.4 2.4 0 0 1-4.8 0z"/>');
})();

// The commonest symbol on the reel. Thin, cool and close to the felt on purpose: it is the
// background the rarer symbols have to stand out from
const kelp = sym('kelp',
  '<path fill="none" stroke="#3f6e50" stroke-width="2" stroke-linecap="round"'
  + ' d="M9.4 21c-2-4.4-1.6-8 .6-11.4 1.2-1.8 1.6-3.4 1.2-5.2"/>'
  + '<path fill="none" stroke="#5f9a72" stroke-width="2" stroke-linecap="round"'
  + ' d="M14.6 21c1.8-4 1.2-7.4-.8-10.4-1-1.6-1.3-3-1-4.4"/>'
  + '<g fill="#3f6e50"><ellipse cx="7.6" cy="15.4" rx="2.2" ry="1.3" transform="rotate(-28 7.6 15.4)"/>'
  + '<ellipse cx="9.3" cy="9.9" rx="2" ry="1.2" transform="rotate(-50 9.3 9.9)"/></g>'
  + '<g fill="#5f9a72"><ellipse cx="16.6" cy="16" rx="2.2" ry="1.3" transform="rotate(26 16.6 16)"/>'
  + '<ellipse cx="15" cy="10.4" rx="2" ry="1.2" transform="rotate(48 15 10.4)"/></g>');

// The ten are at the top level, the way games/tiles.js exports its ten. `KEYS` is there because
// `Object.keys` of this module is twelve things, not ten: enumerate with KEYS
module.exports = {
  crab, pearl, anchor, starfish, shell, kelp, urchin, jellyfish, bottle, coral,
  KEYS, sprite, use
};
