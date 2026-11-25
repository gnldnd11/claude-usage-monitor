// PHOSPHOR. A terminal with a scanline over the whole of it, code running down both rails, a
// prompt and a cursor on the floor, a visor on the crab, and glyphs falling.
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
  id: 'matrix',
  name: 'Phosphor',
  order: 60,
  layers: ['frame', 'floor', 'badge', 'motes'],
  art: {},
  accent: '#3ef06a',
  accentHi: '#8ff7ad',

  css: `
  body.tab-usage[data-theme="matrix"]{--card:#040c06;--inner:#040c06;--track:#12281a;--text:#b6f5c8;--muted:#6aa87b;--shell:#030704;--glow:0 0 0 1px #16381f, 0 0 26px -4px rgba(62,240,106,.40);--scene:repeating-linear-gradient(0deg,transparent 0 2px,rgba(0,0,0,.40) 2px 3px),radial-gradient(ellipse 96% 80% at 50% 40%,rgba(30,170,80,.055) 0%,transparent 60%),radial-gradient(ellipse 120% 118% at 50% 50%,transparent 40%,rgba(0,0,0,.86) 100%);--tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;--statsbg:transparent;--tilebg:transparent;--ringtrack:rgba(0,0,0,.46);--bartrack:rgba(0,0,0,.52);--border:#0f2614;--iborder:#0f2614;}
  body.tab-usage[data-theme="matrix"] #panelUsage{background:transparent;border:1px solid rgba(62,240,106,.11);}

body.tab-usage[data-theme="matrix"] .stats{gap:0;}
body.tab-usage[data-theme="matrix"] .stat + .stat{box-shadow:inset 1px 0 0 rgba(255,255,255,.07);}
body.tab-usage[data-theme="matrix"] .wk-more{background:rgba(255,255,255,.09);}
body.tab-usage[data-theme="matrix"] .th-motes{background:
  repeating-linear-gradient(180deg,rgba(120,250,160,.85) 0 2.5px,transparent 2.5px 9px) 8px 0/2px 100% no-repeat,
  repeating-linear-gradient(180deg,rgba(120,250,160,.7) 0 2.5px,transparent 2.5px 12px) 19px 0/2px 100% no-repeat,
  repeating-linear-gradient(180deg,rgba(120,250,160,.7) 0 2.5px,transparent 2.5px 7px) 228px 0/2px 100% no-repeat,
  repeating-linear-gradient(180deg,rgba(120,250,160,.85) 0 2.5px,transparent 2.5px 11px) 239px 0/2px 100% no-repeat;
  opacity:.52;animation:th-matrix-bitFall 7s linear infinite;}
@keyframes th-matrix-bitFall{from{background-position:8px 0,19px 0,228px 0,239px 0}
  to{background-position:8px 108px,19px 144px,228px 84px,239px 132px}}
body.tab-usage[data-theme="matrix"] .mval,body.tab-usage[data-theme="matrix"] .rpct,body.tab-usage[data-theme="matrix"] .sval,body.tab-usage[data-theme="matrix"] .cc-bal{
  text-shadow:0 0 6px rgba(62,240,106,.42);}
body.tab-usage[data-theme="matrix"] .mfill::after{content:'';position:absolute;right:0;top:0;width:3px;height:100%;
  background:#c8ffd8;box-shadow:0 0 6px 1px rgba(62,240,106,.8);}
body.tab-usage[data-theme="matrix"] .rtrack{stroke-dasharray:2.6 2.6;stroke:rgba(62,240,106,.22);}
/* 틀: CRT 베젤. 좌상 모서리가 두껍고 전원 LED 와 통풍 슬롯이 있다 */
body.tab-usage[data-theme="matrix"] .th-frame{background:
  radial-gradient(circle 5px at 13px 96px,rgba(62,240,106,.75) 0 30%,transparent 70%),
  radial-gradient(circle 2.5px at 13px 96px,#6effa0 0 70%,transparent 76%),
  repeating-linear-gradient(0deg,#1d3a26 0 3px,#0a150e 3px 6px) 4px 30px/13px 54px no-repeat,
  radial-gradient(ellipse 46px 44px at 16px 18px,#2b4c35 0 62%,transparent 68%),
  radial-gradient(ellipse 40px 30px at 236px 14px,#2b4c35 0 62%,transparent 68%),
  repeating-linear-gradient(90deg,#20392a 0 3px,#0a150e 3px 6px) 200px 18px/40px 8px no-repeat,
  linear-gradient(180deg,#22392a,#08140d) 0 0/17px 100% no-repeat,
  linear-gradient(180deg,#22392a,#08140d) 233px 0/17px 100% no-repeat,
  linear-gradient(180deg,#1f3425,#08140d) 0 0/250px 18px no-repeat;}
  /* THE LANDSCAPE, RE-LAID AGAINST THE SHIPPED PANEL (2026-11-26).
     The prompt line and its scrollback were drawn over the stat row.
     Three rules, and they are the same three for every theme in this directory:
       1. every object is anchored to the card's FLOOR and lives in the bottom 34px. Under the
          last line of the stat row there are 39px of padding that always stack up (the tile's 10,
          the inner's 13, the card's 14, the border), so that band is structural and does not have
          to be re-measured when the bars above change
       2. THE GROUND IS THE LAST LAYER. In CSS the first background layer is the topmost, and the
          mockup wrote the ground first: the cart, its wheels and its rails were all underneath an
          opaque ground and what reached the screen was a 4px lip of gold across a figure
       3. what will not read at 34px is taken out rather than cropped
     KEPT WHOLE: this one is three rules and a block, and all four fit the band. */
  body.tab-usage[data-theme="matrix"] .th-floor{background:
  linear-gradient(90deg,#3ef06a 0 7px,transparent 7px) left 8px bottom 24px/60px 2px no-repeat,
  linear-gradient(90deg,rgba(62,240,106,.5) 0 46px,transparent 46px) left 8px bottom 17px/120px 2px no-repeat,
  linear-gradient(90deg,rgba(62,240,106,.38) 0 72px,transparent 72px) left 8px bottom 10px/150px 2px no-repeat,
  linear-gradient(180deg,#3ef06a,#3ef06a) left 86px bottom 1px/7px 11px no-repeat,
  linear-gradient(90deg,rgba(62,240,106,.22),transparent) left 0 bottom 0/230px 1px no-repeat,
  linear-gradient(180deg,transparent 0 126px,#050e09 126px) 0 0/230px 156px no-repeat;}
/* 악세: 인광 바이저 */
body.tab-usage[data-theme="matrix"] .th-badge{background:
  linear-gradient(180deg,rgba(62,240,106,.85),rgba(30,150,66,.7)) 31px 39px/26px 5px no-repeat,
  linear-gradient(180deg,#143018,#081a0c) 29px 37px/30px 3px no-repeat;
  filter:drop-shadow(0 0 4px rgba(62,240,106,.6));}

  .th-chip[data-th="matrix"]{--card:#040c06;--th-scene:repeating-linear-gradient(0deg,transparent 0 2px,rgba(0,0,0,.40) 2px 3px),radial-gradient(ellipse 96% 80% at 50% 40%,rgba(30,170,80,.055) 0%,transparent 60%),radial-gradient(ellipse 120% 118% at 50% 50%,transparent 40%,rgba(0,0,0,.86) 100%);}
`
};
