// THE FOREST. Vines and leaves pouring in over the top left, a lantern at the top right,
// mushrooms and stones and grass along the floor, a leaf cap on the crab, and fireflies.
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
  id: 'forest',
  name: 'Forest',
  order: 30,
  layers: ['frame', 'floor', 'badge', 'motes'],
  art: {},
  accent: '#a3d94a',
  accentHi: '#c9ea82',

  css: `
  body.tab-usage[data-theme="forest"]{--card:#0f1a10;--inner:#0f1a10;--track:#24381f;--text:#e8f3df;--muted:#9bb48e;--shell:#070e08;--glow:0 0 0 1px #24411f, 0 0 24px -4px rgba(163,217,74,.38);--scene:repeating-linear-gradient(103deg,transparent 0 26px,rgba(190,240,130,.055) 26px 40px),radial-gradient(ellipse 80% 34% at 36% -4%,rgba(190,245,120,.20) 0%,transparent 66%),radial-gradient(ellipse 34% 16% at 16% 28%,rgba(0,0,0,.34),transparent 70%),radial-gradient(ellipse 30% 14% at 84% 52%,rgba(0,0,0,.30),transparent 72%),linear-gradient(180deg,transparent 56%,rgba(0,0,0,.40) 100%);--tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;--statsbg:transparent;--tilebg:transparent;--ringtrack:rgba(0,0,0,.46);--bartrack:rgba(0,0,0,.52);--border:#1e3020;--iborder:#1e3020;}
  body.tab-usage[data-theme="forest"] #panelUsage{background:transparent;border:1px solid rgba(190,240,130,.08);}

body.tab-usage[data-theme="forest"] .stats{gap:0;}
body.tab-usage[data-theme="forest"] .stat + .stat{box-shadow:inset 1px 0 0 rgba(255,255,255,.07);}
body.tab-usage[data-theme="forest"] .wk-more{background:rgba(255,255,255,.09);}
body.tab-usage[data-theme="forest"] .th-motes{background:
  radial-gradient(circle,rgba(226,255,140,.95) 0 1.4px,transparent 2.1px) 0 0/58px 46px,
  radial-gradient(circle,rgba(190,240,120,.75) 0 1.1px,transparent 1.8px) 23px 17px/71px 59px;
  opacity:.65;animation:th-forest-fireflyFloat 13s ease-in-out infinite alternate;}
@keyframes th-forest-fireflyFloat{from{background-position:0 0,23px 17px;opacity:.38}
  to{background-position:11px -24px,-14px 20px;opacity:.75}}
body.tab-usage[data-theme="forest"] .th-motes::after{content:'';position:absolute;left:18px;top:388px;width:11px;height:8px;
  background:radial-gradient(ellipse 5px 4px at 3px 4px,#f5c542 0 72%,transparent 76%),
    radial-gradient(ellipse 5px 4px at 8px 4px,#e8a92f 0 72%,transparent 76%);
  animation:th-forest-flit 11s ease-in-out infinite alternate;}
@keyframes th-forest-flit{from{transform:translate(0,0) rotate(-6deg)}
  to{transform:translate(46px,-28px) rotate(8deg)}}
/* 틀: 좌상에서 쏟아져 들어오는 덩굴과 잎, 우상에 매달린 랜턴, 좌우 줄기 */
body.tab-usage[data-theme="forest"] .th-frame{background:
  radial-gradient(circle 18px at 233px 32px,rgba(255,224,122,.46) 0 16%,rgba(255,210,100,.13) 54%,transparent 76%),
  radial-gradient(ellipse 5px 6px at 50% 46%,#fffbe2 0 30%,#ffe08a 58%,#c99a28 84%,transparent 90%) 228px 24px/12px 15px no-repeat,
  linear-gradient(180deg,#43642f,#24381a) 229px 20px/10px 4px no-repeat,
  linear-gradient(180deg,#24381a,#16240f) 230px 38px/8px 3px no-repeat,
  linear-gradient(180deg,#355024,#1e3014) 233px 10px/2px 10px no-repeat,
  radial-gradient(ellipse 20px 11px at 14px 12px,#4f8a3a 0 70%,transparent 74%),
  radial-gradient(ellipse 15px 9px at 38px 7px,#5c9c44 0 70%,transparent 74%),
  radial-gradient(ellipse 12px 20px at 7px 34px,#3f7030 0 70%,transparent 74%),
  radial-gradient(ellipse 17px 10px at 34px 26px,#4a8436 0 70%,transparent 74%),
  radial-gradient(ellipse 10px 17px at 13px 60px,#5c9c44 0 70%,transparent 74%),
  radial-gradient(ellipse 13px 8px at 30px 52px,#3f7030 0 70%,transparent 74%),
  radial-gradient(ellipse 8px 15px at 8px 92px,#4a8436 0 70%,transparent 74%),
  radial-gradient(ellipse 18px 10px at 206px 9px,#4f8a3a 0 70%,transparent 74%),
  radial-gradient(ellipse 12px 7px at 192px 4px,#5c9c44 0 70%,transparent 74%),
  linear-gradient(180deg,#2d5422,#16300f) 0 0/250px 11px no-repeat,
  linear-gradient(180deg,#2a4e1f,#12280c) 0 0/14px 100% no-repeat,
  linear-gradient(180deg,#2a4e1f,#12280c) 236px 0/14px 100% no-repeat;}
  /* THE LANDSCAPE, RE-LAID AGAINST THE SHIPPED PANEL (2026-11-26).
     The mushrooms and the stones were standing in the stat row.
     Three rules, and they are the same three for every theme in this directory:
       1. every object is anchored to the card's FLOOR and lives in the bottom 34px. Under the
          last line of the stat row there are 39px of padding that always stack up (the tile's 10,
          the inner's 13, the card's 14, the border), so that band is structural and does not have
          to be re-measured when the bars above change
       2. THE GROUND IS THE LAST LAYER. In CSS the first background layer is the topmost, and the
          mockup wrote the ground first: the cart, its wheels and its rails were all underneath an
          opaque ground and what reached the screen was a 4px lip of gold across a figure
       3. what will not read at 34px is taken out rather than cropped
     TAKEN OUT: the second grass bank, which at 34px was a stripe across the whole width. */
  body.tab-usage[data-theme="forest"] .th-floor{background:
  radial-gradient(ellipse 14px 8px at 50% 50%,#c7452f 0 70%,transparent 74%) left 22px bottom 18px/28px 16px no-repeat,
  radial-gradient(ellipse 4px 3px at 50% 50%,#f0d8c0 0 70%,transparent 74%) left 26px bottom 22px/8px 6px no-repeat,
  linear-gradient(180deg,#eadfc4,#c4b596) left 29px bottom 4px/7px 15px no-repeat,
  radial-gradient(ellipse 9px 6px at 50% 50%,#d4563c 0 70%,transparent 74%) left 48px bottom 11px/18px 12px no-repeat,
  linear-gradient(180deg,#eadfc4,#c4b596) left 53px bottom 2px/5px 10px no-repeat,
  radial-gradient(ellipse 20px 12px at 50% 50%,#56624f 0 68%,transparent 72%) left 182px bottom 1px/40px 24px no-repeat,
  radial-gradient(ellipse 10px 7px at 50% 50%,#45503f 0 68%,transparent 72%) left 164px bottom 0/20px 14px no-repeat,
  repeating-linear-gradient(86deg,transparent 0 4px,#3c6b2c 4px 7px) left 68px bottom 0/96px 22px no-repeat,
  linear-gradient(180deg,transparent 0 134px,#1a3014 134px) 0 0/230px 156px no-repeat;}
/* 악세: 잎 모자 */
body.tab-usage[data-theme="forest"] .th-badge{background:
  radial-gradient(ellipse 13px 7px at 38px 37px,#5c9c44 0 74%,transparent 78%),
  radial-gradient(ellipse 10px 6px at 50px 35px,#4a8436 0 74%,transparent 78%),
  linear-gradient(180deg,#3f7030,#2d5422) 43px 38px/2px 6px no-repeat;}

  .th-chip[data-th="forest"]{--card:#0f1a10;--th-scene:repeating-linear-gradient(103deg,transparent 0 26px,rgba(190,240,130,.055) 26px 40px),radial-gradient(ellipse 80% 34% at 36% -4%,rgba(190,245,120,.20) 0%,transparent 66%),radial-gradient(ellipse 34% 16% at 16% 28%,rgba(0,0,0,.34),transparent 70%),radial-gradient(ellipse 30% 14% at 84% 52%,rgba(0,0,0,.30),transparent 72%),linear-gradient(180deg,transparent 56%,rgba(0,0,0,.40) 100%);}
`
};
