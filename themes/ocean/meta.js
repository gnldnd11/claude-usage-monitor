// THE OCEAN. A wave crest over the top, a hanging jellyfish, coral and a treasure chest on the
// sea floor, a snorkel on the crab, and bubbles going up.
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
  id: 'ocean',
  name: 'Ocean',
  order: 70,
  // NO LONGER SOLD, 2026-11-26. The shelf keeps this row, this file keeps its price and its CSS,
  // and a reader who bought it goes on wearing it exactly as before: what the flag takes away is
  // the purchase, which the shop refuses on the message rather than on the screen (shop.js,
  // whyNot). A theme declares this itself because no shared file may know a theme's name
  // (themes/README.md, section 7)
  retired: true,
  layers: ['frame', 'floor', 'badge', 'motes'],
  art: {},
  accent: '#38bdf8',
  accentHi: '#8bd9fb',

  css: `
  body.tab-usage[data-theme="ocean"]{--card:#0a1b2e;--inner:#0a1b2e;--track:#1d3853;--text:#e4f1fb;--muted:#92b0c9;--shell:#050f1b;--glow:0 0 0 1px #1b3c5a, 0 0 24px -4px rgba(56,189,248,.40);--scene:repeating-linear-gradient(96deg,transparent 0 24px,rgba(140,220,255,.070) 24px 36px),radial-gradient(ellipse 86% 32% at 44% -6%,rgba(120,215,255,.26) 0%,transparent 68%),linear-gradient(180deg,rgba(60,150,210,.16) 0%,transparent 44%,rgba(0,0,0,.46) 100%);--tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;--statsbg:transparent;--tilebg:transparent;--ringtrack:rgba(0,0,0,.46);--bartrack:rgba(0,0,0,.52);--border:#163049;--iborder:#163049;}
  body.tab-usage[data-theme="ocean"] #panelUsage{background:transparent;border:1px solid rgba(140,220,255,.09);}

body.tab-usage[data-theme="ocean"] .stats{gap:0;}
body.tab-usage[data-theme="ocean"] .stat + .stat{box-shadow:inset 1px 0 0 rgba(255,255,255,.07);}
body.tab-usage[data-theme="ocean"] .wk-more{background:rgba(255,255,255,.09);}
body.tab-usage[data-theme="ocean"] .th-motes{background:
  radial-gradient(circle,transparent 0 2.1px,rgba(190,235,255,.55) 2.1px 3px,transparent 3.1px) 0 0/63px 97px,
  radial-gradient(circle,transparent 0 1.3px,rgba(190,235,255,.45) 1.3px 2px,transparent 2.1px) 29px 41px/81px 123px;
  opacity:.8;animation:th-ocean-bubbleUp 17s linear infinite;}
@keyframes th-ocean-bubbleUp{from{background-position:0 0,29px 41px}
  to{background-position:9px -291px,-12px -369px}}
/* 틀: 위를 가로지르는 파도 마루와 거품, 좌우 물기둥 */
body.tab-usage[data-theme="ocean"] .th-frame{background:
  radial-gradient(circle 2px at 30px 26px,rgba(220,245,255,.8) 0 60%,transparent 68%),
  radial-gradient(circle 1.5px at 44px 34px,rgba(220,245,255,.7) 0 60%,transparent 68%),
  radial-gradient(circle 2.5px at 212px 30px,rgba(220,245,255,.75) 0 60%,transparent 68%),
  radial-gradient(ellipse 36px 15px at 20px 8px,#b8ecff 0 62%,transparent 66%),
  radial-gradient(ellipse 30px 13px at 50px 3px,#86d4f5 0 60%,transparent 64%),
  radial-gradient(ellipse 34px 14px at 206px 6px,#b8ecff 0 62%,transparent 66%),
  radial-gradient(ellipse 26px 11px at 236px 2px,#86d4f5 0 60%,transparent 64%),
  radial-gradient(ellipse 30px 20px at 8px 30px,rgba(90,180,225,.55) 0 62%,transparent 70%),
  linear-gradient(180deg,#4b9cc9,#0e2c44) 0 0/250px 14px no-repeat,
  linear-gradient(180deg,#000,#000) 0 0/0 0 no-repeat,
  linear-gradient(180deg,#25678f,#081d2e) 0 0/16px 100% no-repeat,
  linear-gradient(180deg,#25678f,#081d2e) 234px 0/16px 100% no-repeat,
  linear-gradient(180deg,rgba(150,225,255,.35),transparent) 3px 22px/5px 100% no-repeat,
  linear-gradient(180deg,rgba(150,225,255,.35),transparent) 243px 22px/5px 100% no-repeat;}
  /* THE LANDSCAPE, RE-LAID AGAINST THE SHIPPED PANEL (2026-11-26).
     The coral came out as purple diagonal stripes across the active-time figure.
     Three rules, and they are the same three for every theme in this directory:
       1. every object is anchored to the card's FLOOR and lives in the bottom 34px. Under the
          last line of the stat row there are 39px of padding that always stack up (the tile's 10,
          the inner's 13, the card's 14, the border), so that band is structural and does not have
          to be re-measured when the bars above change
       2. THE GROUND IS THE LAST LAYER. In CSS the first background layer is the topmost, and the
          mockup wrote the ground first: the cart, its wheels and its rails were all underneath an
          opaque ground and what reached the screen was a 4px lip of gold across a figure
       3. what will not read at 34px is taken out rather than cropped
     SHRUNK: the three coral fans, from 58px tall to 22, and the chest from 20px to 15. The chest was invisible before this: the sea floor was the first layer and buried it whole. */
  body.tab-usage[data-theme="ocean"] .th-floor{background:
  radial-gradient(ellipse 3px 11px at 50% 100%,#8a4ab4 0 72%,transparent 76%) left 12px bottom 1px/8px 22px no-repeat,
  radial-gradient(ellipse 3px 8px at 50% 100%,#6a3c92 0 72%,transparent 76%) left 19px bottom 1px/8px 17px no-repeat,
  radial-gradient(ellipse 3px 10px at 50% 100%,#a05bc8 0 72%,transparent 76%) left 25px bottom 1px/8px 20px no-repeat,
  radial-gradient(ellipse 12px 4px at 50% 100%,#4a2a68 0 72%,transparent 76%) left 11px bottom 0/26px 8px no-repeat,
  radial-gradient(ellipse 2px 7px at 50% 100%,#2f8f72 0 72%,transparent 76%) left 44px bottom 0/6px 14px no-repeat,
  radial-gradient(ellipse 2px 9px at 50% 100%,#2f6b5a 0 72%,transparent 76%) left 49px bottom 0/6px 18px no-repeat,
  radial-gradient(circle 2.5px at 50% 50%,#ffdf96 0 58%,transparent 64%) left 180px bottom 6px/7px 7px no-repeat,
  linear-gradient(90deg,#2a2012 0 4px,transparent 4px 36px,#2a2012 36px) left 162px bottom 0/40px 3px no-repeat,
  linear-gradient(180deg,#2a2012,#2a2012) left 162px bottom 9px/40px 2px no-repeat,
  linear-gradient(180deg,#8a6c30,#4e3a18) left 162px bottom 2px/40px 9px no-repeat,
  radial-gradient(ellipse 20px 8px at 50% 100%,#bf9642 0 74%,transparent 78%) left 162px bottom 10px/40px 14px no-repeat,
  radial-gradient(ellipse 150% 34px at 50% 156px,#0e2b44 0 70%,transparent 74%) 0 0/230px 156px no-repeat;}
/* 악세: 스노클 마스크 */
body.tab-usage[data-theme="ocean"] .th-badge{background:
  radial-gradient(ellipse 13px 8px at 43px 42px,rgba(180,235,255,.5) 0 66%,transparent 72%),
  linear-gradient(180deg,#38bdf8,#1a6f98) 30px 38px/27px 3px no-repeat,
  linear-gradient(180deg,#38bdf8,#1a6f98) 56px 34px/3px 14px no-repeat,
  radial-gradient(circle 2px at 58px 34px,#8bd9fb 0 70%,transparent 76%);}

  .th-chip[data-th="ocean"]{--card:#0a1b2e;--th-scene:repeating-linear-gradient(96deg,transparent 0 24px,rgba(140,220,255,.070) 24px 36px),radial-gradient(ellipse 86% 32% at 44% -6%,rgba(120,215,255,.26) 0%,transparent 68%),linear-gradient(180deg,rgba(60,150,210,.16) 0%,transparent 44%,rgba(0,0,0,.46) 100%);}
`
};
