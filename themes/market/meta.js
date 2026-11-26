// THE TRADING FLOOR. A terminal bezel, a board of lit tickers across the top, a candlestick
// skyline on the floor, a visor on the crab, and the tape running down both edges.
//
// THE BACKDROP IS A GRID AND NOT A CHART. It carried a second candlestick chart as an SVG, drawn
// across the whole card behind everything, and that is where this theme was weakest: the stat row
// sat on a picture rather than on a texture, and the floor's own candles -- which read perfectly
// -- had to compete with ghosts of themselves. What the theme is OF is already said twice, by the
// board at the top and by the skyline at the bottom, so the third telling came out. What is left
// is the grid, which is a texture, and it is damped across the band the readings sit in (the
// first layer of `--scene`). A scene may be a texture behind a figure and may not be a picture.
// NO RED-AGAINST-GREEN ANYWHERE THAT MATTERS. The one colour this panel may not take from a
// theme is the burn ramp, which is red, so this theme's own accent is a BLUE: a market drawn
// in red and green would put the warning colour on the decoration.
//
// THE CSS IS THE FINISHED ARTICLE AND A PNG IS AN UPGRADE. Every shape in here is drawn by the
// stylesheet, so this theme is complete with no asset at all; the three picture layers still carry
// their boxes (250x597.5 for the frame, 230x156 for the floor, 88x74 for the badge, which is the
// mascot's own), so a drawing can be laid over one later without anything else moving. See
// themes/README.md section 5 for the swap, which is one declaration and one line of `art`.
//
// AND THE PRICE DOES NOT MOVE WHEN IT HAPPENS, because the rung is counted off `layers` and not off
// `art`: what was designed is three pictures whether they are painted in CSS today or in a PNG next
// month. Counting the files instead would make every theme in this directory free.
//
// The figures in here are the mockup's, measured at a 250px sidebar. Section 5 of
// docs/panel-themes/spec.md holds the safe area the frame is masked to and the brightness ceiling
// the floor keeps over the stat row.
'use strict';

module.exports = {
  id: 'market',
  name: 'Trading Floor',
  order: 50,
  // NO LONGER SOLD, 2026-11-26. The shelf keeps this row, this file keeps its price and its CSS,
  // and a reader who bought it goes on wearing it exactly as before: what the flag takes away is
  // the purchase, which the shop refuses on the message rather than on the screen (shop.js,
  // whyNot). A theme declares this itself because no shared file may know a theme's name
  // (themes/README.md, section 7)
  retired: true,
  layers: ['frame', 'floor', 'badge', 'motes'],
  art: {},
  accent: '#4fa3d8',
  accentHi: '#86c8ea',

  css: `
  body.tab-usage[data-theme="market"]{--card:#0e1319;--inner:#0e1319;--track:#28313b;--text:#e9eef3;--muted:#93a0ad;--shell:#080b0f;--glow:0 0 0 1px #233040, 0 0 22px -5px rgba(79,163,216,.36);--scene:linear-gradient(180deg,transparent 0 20px,rgba(8,11,15,.62) 34px,rgba(8,11,15,.62) calc(100% - 44px),transparent calc(100% - 28px)),repeating-linear-gradient(90deg,transparent 0 15px,rgba(128,172,208,.20) 15px 16px),repeating-linear-gradient(0deg,transparent 0 15px,rgba(128,172,208,.20) 15px 16px),radial-gradient(ellipse 90% 36% at 50% 0%,rgba(79,163,216,.13),transparent 70%),linear-gradient(180deg,rgba(0,0,0,.34) 0%,rgba(0,0,0,.10) 30%,rgba(0,0,0,.44) 100%);--tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;--statsbg:transparent;--tilebg:transparent;--ringtrack:rgba(0,0,0,.46);--bartrack:rgba(0,0,0,.52);--border:#1f2831;--iborder:#1f2831;}
  body.tab-usage[data-theme="market"] #panelUsage{background:transparent;border:1px solid rgba(120,150,176,.10);}

body.tab-usage[data-theme="market"] .stats{gap:0;}
body.tab-usage[data-theme="market"] .stat + .stat{box-shadow:inset 1px 0 0 rgba(255,255,255,.07);}
body.tab-usage[data-theme="market"] .wk-more{background:rgba(255,255,255,.09);}
body.tab-usage[data-theme="market"] .th-motes{background:
  repeating-linear-gradient(180deg,rgba(95,216,164,.85) 0 3px,transparent 3px 9px,
    rgba(229,115,107,.8) 9px 12px,transparent 12px 21px) 7px 0/3px 100% no-repeat,
  repeating-linear-gradient(180deg,rgba(229,115,107,.8) 0 3px,transparent 3px 11px,
    rgba(95,216,164,.85) 11px 14px,transparent 14px 25px) 240px 0/3px 100% no-repeat;
  opacity:.75;animation:th-market-tickRun 11s linear infinite;}
@keyframes th-market-tickRun{from{background-position:7px 0,240px 0}
  to{background-position:7px 168px,240px -200px}}
body.tab-usage[data-theme="market"] .mfill::after{content:'';position:absolute;right:0;top:0;width:7px;height:100%;
  background:linear-gradient(135deg,transparent 42%,#a8dcf5 42%);}
body.tab-usage[data-theme="market"] .rtrack{stroke-dasharray:1.5 4.2;stroke:rgba(140,172,196,.46);}
/* 틀: 좌상에 큰 시세 보드(LED 격자), 우상에 작은 보드, 좌우 레일 */
body.tab-usage[data-theme="market"] .th-frame{background:
  repeating-linear-gradient(0deg,rgba(95,216,164,.95) 0 2px,transparent 2px 6px) 16px 23px/15px 15px no-repeat,
  repeating-linear-gradient(0deg,rgba(79,163,216,.95) 0 2px,transparent 2px 5px) 34px 23px/11px 15px no-repeat,
  repeating-linear-gradient(0deg,rgba(229,115,107,.85) 0 2px,transparent 2px 7px) 48px 23px/9px 15px no-repeat,
  linear-gradient(180deg,#4a647e,#243040) 13px 16px/48px 5px no-repeat,
  linear-gradient(180deg,#32465a,#161f29) 13px 16px/48px 24px no-repeat,
  repeating-linear-gradient(0deg,rgba(79,163,216,.95) 0 2px,transparent 2px 5px) 193px 23px/13px 15px no-repeat,
  repeating-linear-gradient(0deg,rgba(95,216,164,.85) 0 2px,transparent 2px 7px) 209px 23px/12px 15px no-repeat,
  repeating-linear-gradient(0deg,rgba(229,115,107,.80) 0 2px,transparent 2px 6px) 224px 23px/12px 15px no-repeat,
  linear-gradient(180deg,#4a647e,#243040) 189px 16px/50px 5px no-repeat,
  linear-gradient(180deg,#32465a,#161f29) 189px 16px/50px 24px no-repeat,
  linear-gradient(180deg,#2b3b4a,#0d141b) 0 0/18px 100% no-repeat,
  linear-gradient(180deg,#2b3b4a,#0d141b) 232px 0/18px 100% no-repeat,
  linear-gradient(180deg,rgba(79,163,216,.45),transparent) 6px 86px/6px 100% no-repeat,
  linear-gradient(180deg,rgba(79,163,216,.45),transparent) 238px 42px/6px 100% no-repeat;}
  /* THE LANDSCAPE, RE-LAID AGAINST THE SHIPPED PANEL (2026-11-26).
     The candlestick skyline ran up through the figures.
     Three rules, and they are the same three for every theme in this directory:
       1. every object is anchored to the card's FLOOR and lives in the bottom 34px. Under the
          last line of the stat row there are 39px of padding that always stack up (the tile's 10,
          the inner's 13, the card's 14, the border), so that band is structural and does not have
          to be re-measured when the bars above change
       2. THE GROUND IS THE LAST LAYER. In CSS the first background layer is the topmost, and the
          mockup wrote the ground first: the cart, its wheels and its rails were all underneath an
          opaque ground and what reached the screen was a 4px lip of gold across a figure
       3. what will not read at 34px is taken out rather than cropped
     SHRUNK: the candles, from 42px to 26, and the wicks with them. */
  body.tab-usage[data-theme="market"] .th-floor{background:
  linear-gradient(180deg,#5fd8a4,#2f9a6e) left 14px bottom 6px/7px 15px no-repeat,
  linear-gradient(180deg,#5fd8a4,#5fd8a4) left 17px bottom 2px/1px 23px no-repeat,
  linear-gradient(180deg,#e5736b,#a8403a) left 30px bottom 10px/7px 11px no-repeat,
  linear-gradient(180deg,#e5736b,#e5736b) left 33px bottom 4px/1px 22px no-repeat,
  linear-gradient(180deg,#5fd8a4,#2f9a6e) left 46px bottom 4px/7px 20px no-repeat,
  linear-gradient(180deg,#5fd8a4,#5fd8a4) left 49px bottom 1px/1px 26px no-repeat,
  linear-gradient(180deg,#e5736b,#a8403a) left 62px bottom 8px/7px 9px no-repeat,
  linear-gradient(180deg,#5fd8a4,#2f9a6e) left 78px bottom 3px/7px 17px no-repeat,
  linear-gradient(180deg,#5fd8a4,#2f9a6e) left 170px bottom 7px/7px 14px no-repeat,
  linear-gradient(180deg,#e5736b,#a8403a) left 186px bottom 11px/7px 10px no-repeat,
  linear-gradient(180deg,#5fd8a4,#2f9a6e) left 202px bottom 5px/7px 18px no-repeat,
  linear-gradient(90deg,rgba(79,163,216,.45),rgba(79,163,216,.12)) left 0 bottom 0/230px 1px no-repeat,
  linear-gradient(180deg,transparent 0 134px,#0b1016 134px) 0 0/230px 156px no-repeat;}
/* 악세: 단말 바이저 */
body.tab-usage[data-theme="market"] .th-badge{background:
  linear-gradient(180deg,#9fd4ef,#3a7ca5) 32px 39px/24px 5px no-repeat,
  linear-gradient(180deg,#2b3b4a,#1b2630) 30px 37px/28px 3px no-repeat;}

  .th-chip[data-th="market"]{--card:#0e1319;--th-scene:repeating-linear-gradient(90deg,transparent 0 15px,rgba(128,172,208,.20) 15px 16px),repeating-linear-gradient(0deg,transparent 0 15px,rgba(128,172,208,.20) 15px 16px),radial-gradient(ellipse 90% 36% at 50% 0%,rgba(79,163,216,.13),transparent 70%),linear-gradient(180deg,rgba(0,0,0,.34) 0%,rgba(0,0,0,.10) 30%,rgba(0,0,0,.44) 100%);}
`
};
