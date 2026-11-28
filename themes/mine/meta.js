// THE COAL FACE. Timber posts down both sides, a rock arch spilling in from the top left, a
// lantern hung at the top right, a gold-laden ore cart behind the stat row, a lamped helmet on
// the crab, and embers rising.
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
  id: 'mine',
  name: 'Coal Face',
  order: 20,
  // NOT YET SOLD AT ALL, 2026-11-28, which is the other reason this flag is here. The five before
  // it were withdrawn after being on sale; this one is withdrawn BEFORE: the drawing is unfinished
  // (the live mockup, docs/panel-themes/live/two-themes.html, carries its next pass) and a half-
  // drawn theme on the shelf reads as a defect rather than as a work in progress. One line comes
  // out again when it is finished, and nothing else about this file has to change.
  // The rest is the same as for the five: the row stays, the price stays, the CSS stays in the
  // page, and anybody who bought it goes on wearing it (themes/README.md, section 7).
  retired: true,
  layers: ['frame', 'floor', 'badge', 'motes'],
  art: {},
  accent: '#e08b3c',
  accentHi: '#f3b165',

  css: `
  body.tab-usage[data-theme="mine"]{--card:#17120e;--inner:#17120e;--track:#2e241a;--text:#f0e5d6;--muted:#ad9a82;--shell:#0c0907;--glow:0 0 0 1px #3a2a1a, 0 0 22px -4px rgba(224,139,60,.40);--scene:radial-gradient(ellipse 66% 30% at 78% -3%,rgba(240,170,80,.26) 0%,rgba(240,170,80,.08) 44%,transparent 72%),repeating-linear-gradient(177.5deg,transparent 0 13px,rgba(255,228,188,.040) 13px 15px,transparent 15px 29px,rgba(0,0,0,.36) 29px 31px),radial-gradient(ellipse 38% 13% at 14% 34%,rgba(0,0,0,.34),transparent 72%),radial-gradient(ellipse 30% 10% at 86% 58%,rgba(0,0,0,.30),transparent 74%),radial-gradient(ellipse 26% 9% at 42% 72%,rgba(0,0,0,.28),transparent 76%),linear-gradient(180deg,transparent 58%,rgba(0,0,0,.42) 100%);--tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;--statsbg:transparent;--tilebg:transparent;--ringtrack:rgba(0,0,0,.46);--bartrack:rgba(0,0,0,.52);--border:#2b2119;--iborder:#2b2119;}
  body.tab-usage[data-theme="mine"] #panelUsage{background:transparent;border:1px solid rgba(255,220,170,.07);}

body.tab-usage[data-theme="mine"] .stats{gap:0;}
body.tab-usage[data-theme="mine"] .stat + .stat{box-shadow:inset 1px 0 0 rgba(255,255,255,.07);}
body.tab-usage[data-theme="mine"] .wk-more{background:rgba(255,255,255,.09);}
body.tab-usage[data-theme="mine"] .th-motes{background:
  radial-gradient(circle,rgba(255,186,96,.95) 0 1.1px,transparent 1.8px) 0 0/41px 53px,
  radial-gradient(circle,rgba(255,150,60,.8) 0 .9px,transparent 1.5px) 19px 27px/59px 71px;
  opacity:.85;animation:th-mine-emberRise 11s linear infinite;}
@keyframes th-mine-emberRise{from{background-position:0 0,19px 27px}
  to{background-position:-9px -159px,13px -213px}}
/* 틀: 갱목 기둥 둘 + 좌상 암반 아치 + 우상에 매달린 램프 */
body.tab-usage[data-theme="mine"] .th-frame{background:
  radial-gradient(circle 19px at 233px 31px,rgba(255,186,96,.50) 0 16%,rgba(255,170,70,.14) 54%,transparent 76%),
  radial-gradient(ellipse 5px 6px at 50% 46%,#fff3cf 0 30%,#f6bd68 58%,#c8822c 84%,transparent 90%) 228px 23px/12px 15px no-repeat,
  linear-gradient(180deg,#6b5231,#3a2a14) 229px 19px/10px 4px no-repeat,
  linear-gradient(180deg,#3a2a14,#241a0c) 230px 37px/8px 3px no-repeat,
  linear-gradient(180deg,#4a3620,#2a1e12) 233px 10px/2px 10px no-repeat,
  radial-gradient(ellipse 32px 19px at 6px 9px,#40301e 0 74%,transparent 78%),
  radial-gradient(ellipse 23px 15px at 38px 5px,#342719 0 74%,transparent 78%),
  radial-gradient(ellipse 19px 24px at 9px 40px,#3b2c1c 0 74%,transparent 78%),
  radial-gradient(ellipse 15px 19px at 34px 37px,#2d2116 0 74%,transparent 78%),
  radial-gradient(ellipse 13px 28px at 7px 78px,#36291a 0 74%,transparent 78%),
  linear-gradient(180deg,#4e3824,#241a10) 0 0/22px 100% no-repeat,
  linear-gradient(180deg,#4e3824,#241a10) 228px 0/22px 100% no-repeat,
  repeating-linear-gradient(180deg,transparent 0 13px,rgba(0,0,0,.46) 13px 14px) 0 0/22px 100% no-repeat,
  repeating-linear-gradient(180deg,transparent 0 13px,rgba(0,0,0,.46) 13px 14px) 228px 0/22px 100% no-repeat,
  linear-gradient(180deg,#4e3824,#2a1e12) 0 0/250px 20px no-repeat;}
  /* THE LANDSCAPE, RE-LAID AGAINST THE SHIPPED PANEL (2026-11-26).
     The ore cart was crossing the request count as a single orange line.
     Three rules, and they are the same three for every theme in this directory:
       1. every object is anchored to the card's FLOOR and lives in the bottom 34px. Under the
          last line of the stat row there are 39px of padding that always stack up (the tile's 10,
          the inner's 13, the card's 14, the border), so that band is structural and does not have
          to be re-measured when the bars above change
       2. THE GROUND IS THE LAST LAYER. In CSS the first background layer is the topmost, and the
          mockup wrote the ground first: the cart, its wheels and its rails were all underneath an
          opaque ground and what reached the screen was a 4px lip of gold across a figure
       3. what will not read at 34px is taken out rather than cropped
     TAKEN OUT: the timber prop, which is 50px of leg and 7px of beam and has nowhere to stand. */
  body.tab-usage[data-theme="mine"] .th-floor{background:
  radial-gradient(ellipse 11px 6px at 50% 50%,#ffd98a 0 68%,transparent 72%) left 150px bottom 25px/22px 12px no-repeat,
  radial-gradient(ellipse 21px 8px at 50% 50%,#e8b23a 0 66%,transparent 70%) left 148px bottom 21px/42px 16px no-repeat,
  linear-gradient(180deg,#523d29,#241a12) left 150px bottom 8px/44px 17px no-repeat,
  repeating-linear-gradient(90deg,rgba(0,0,0,.4) 0 2px,transparent 2px 9px) left 150px bottom 11px/44px 12px no-repeat,
  radial-gradient(circle 5px at 50% 50%,#19110b 0 74%,transparent 78%) left 152px bottom 2px/10px 10px no-repeat,
  radial-gradient(circle 5px at 50% 50%,#19110b 0 74%,transparent 78%) left 180px bottom 2px/10px 10px no-repeat,
  linear-gradient(90deg,#5e4c36,#3a2e20) left 0 bottom 7px/230px 2px no-repeat,
  repeating-linear-gradient(90deg,#3d2f1f 0 6px,transparent 6px 20px) left 0 bottom 2px/230px 4px no-repeat,
  linear-gradient(180deg,transparent 0 122px,#241a12 122px) 0 0/230px 156px no-repeat;}
/* 악세: 헤드램프 달린 안전모 */
body.tab-usage[data-theme="mine"] .th-badge{background:
  radial-gradient(circle 7px at 34px 37px,rgba(255,200,110,.45) 0 26%,transparent 72%),
  radial-gradient(circle 3px at 34px 37px,#ffe0a0 0 70%,transparent 76%),
  linear-gradient(180deg,#e8a33c,#b87518) 29px 35px/10px 5px no-repeat,
  radial-gradient(ellipse 15px 9px at 45px 40px,#e8a33c 0 76%,transparent 80%),
  linear-gradient(180deg,#c98a28,#a06c14) 30px 40px/30px 3px no-repeat;}

  .th-chip[data-th="mine"]{--card:#17120e;--th-scene:radial-gradient(ellipse 66% 30% at 78% -3%,rgba(240,170,80,.26) 0%,rgba(240,170,80,.08) 44%,transparent 72%),repeating-linear-gradient(177.5deg,transparent 0 13px,rgba(255,228,188,.040) 13px 15px,transparent 15px 29px,rgba(0,0,0,.36) 29px 31px),radial-gradient(ellipse 38% 13% at 14% 34%,rgba(0,0,0,.34),transparent 72%),radial-gradient(ellipse 30% 10% at 86% 58%,rgba(0,0,0,.30),transparent 74%),radial-gradient(ellipse 26% 9% at 42% 72%,rgba(0,0,0,.28),transparent 76%),linear-gradient(180deg,transparent 58%,rgba(0,0,0,.42) 100%);}
`
};
