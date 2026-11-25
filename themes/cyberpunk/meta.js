// CYBERPUNK. A neon sign at the top left and a lit tower at the top right, a street of signs
// along the floor, a visor on the crab, and rain.
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
  id: 'cyberpunk',
  name: 'Cyberpunk',
  order: 80,
  layers: ['frame', 'floor', 'badge', 'motes'],
  art: {},
  accent: '#f472b6',
  accentHi: '#fba7d2',

  css: `
  body.tab-usage[data-theme="cyberpunk"]{--card:#160c20;--inner:#160c20;--track:#331d42;--text:#f6e9fb;--muted:#b394c4;--shell:#0b0512;--glow:0 0 0 1px #3d1f4e, 0 0 26px -4px rgba(244,114,182,.44);--scene:radial-gradient(ellipse 62% 18% at 16% 4%,rgba(244,114,182,.26) 0%,transparent 70%),radial-gradient(ellipse 50% 11% at 86% 3%,rgba(56,210,235,.17) 0%,transparent 74%),repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.26) 3px 4px),linear-gradient(180deg,transparent 54%,rgba(0,0,0,.48) 100%);--tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;--statsbg:transparent;--tilebg:transparent;--ringtrack:rgba(0,0,0,.46);--bartrack:rgba(0,0,0,.52);--border:#2a1838;--iborder:#2a1838;}
  body.tab-usage[data-theme="cyberpunk"] #panelUsage{background:transparent;border:1px solid rgba(244,114,182,.12);}

body.tab-usage[data-theme="cyberpunk"] .stats{gap:0;}
body.tab-usage[data-theme="cyberpunk"] .stat + .stat{box-shadow:inset 1px 0 0 rgba(255,255,255,.07);}
body.tab-usage[data-theme="cyberpunk"] .wk-more{background:rgba(255,255,255,.09);}
body.tab-usage[data-theme="cyberpunk"] .th-motes{background:
  repeating-linear-gradient(74deg,transparent 0 17px,rgba(190,220,255,.13) 17px 18px);
  animation:th-cyberpunk-rainFall 1.9s linear infinite;}
@keyframes th-cyberpunk-rainFall{from{background-position:0 0}to{background-position:26px 92px}}
body.tab-usage[data-theme="cyberpunk"] .th-motes::after{content:'';position:absolute;inset:0;
  background:radial-gradient(ellipse 40% 10% at 22% 6%,rgba(244,114,182,.20),transparent 72%),
    radial-gradient(ellipse 30% 6% at 82% 4%,rgba(56,210,235,.16),transparent 76%);
  animation:th-cyberpunk-neonPulse 5.5s ease-in-out infinite alternate;}
@keyframes th-cyberpunk-neonPulse{from{opacity:.55}to{opacity:1}}
/* 틀: 좌상에서 솟은 네온 도시, 우상 간판, 좌우 네온 튜브 */
body.tab-usage[data-theme="cyberpunk"] .th-frame{background:
  repeating-linear-gradient(180deg,rgba(244,114,182,.95) 0 2px,transparent 2px 5px) 6px 16px/3px 22px no-repeat,
  repeating-linear-gradient(180deg,rgba(56,210,235,.9) 0 2px,transparent 2px 6px) 23px 8px/3px 30px no-repeat,
  repeating-linear-gradient(180deg,rgba(244,114,182,.9) 0 2px,transparent 2px 5px) 41px 19px/3px 19px no-repeat,
  repeating-linear-gradient(180deg,rgba(56,210,235,.85) 0 2px,transparent 2px 6px) 56px 12px/3px 26px no-repeat,
  linear-gradient(180deg,#3a1f4e,#160a20) 2px 12px/14px 28px no-repeat,
  linear-gradient(180deg,#4a2a60,#1b0d26) 19px 4px/12px 36px no-repeat,
  linear-gradient(180deg,#3a1f4e,#160a20) 36px 15px/14px 25px no-repeat,
  linear-gradient(180deg,#4a2a60,#1b0d26) 52px 8px/12px 32px no-repeat,
  linear-gradient(90deg,rgba(244,114,182,.95),rgba(56,210,235,.85)) 194px 14px/48px 4px no-repeat,
  linear-gradient(90deg,rgba(56,210,235,.85),rgba(244,114,182,.9)) 194px 24px/34px 3px no-repeat,
  linear-gradient(180deg,#4a2a60,#1b0d26) 190px 8px/54px 30px no-repeat,
  linear-gradient(90deg,rgba(244,114,182,.75),rgba(56,210,235,.6)) 0 40px/250px 2px no-repeat,
  linear-gradient(180deg,#2f1842,#120820) 0 0/14px 100% no-repeat,
  linear-gradient(180deg,#2f1842,#120820) 236px 0/14px 100% no-repeat,
  linear-gradient(180deg,rgba(244,114,182,.62),transparent) 11px 42px/2px 100% no-repeat,
  linear-gradient(180deg,rgba(56,210,235,.55),transparent) 237px 42px/2px 100% no-repeat;}
  /* THE LANDSCAPE, RE-LAID AGAINST THE SHIPPED PANEL (2026-11-26).
     The street signs and the two towers stood through the stat row.
     Three rules, and they are the same three for every theme in this directory:
       1. every object is anchored to the card's FLOOR and lives in the bottom 34px. Under the
          last line of the stat row there are 39px of padding that always stack up (the tile's 10,
          the inner's 13, the card's 14, the border), so that band is structural and does not have
          to be re-measured when the bars above change
       2. THE GROUND IS THE LAST LAYER. In CSS the first background layer is the topmost, and the
          mockup wrote the ground first: the cart, its wheels and its rails were all underneath an
          opaque ground and what reached the screen was a 4px lip of gold across a figure
       3. what will not read at 34px is taken out rather than cropped
     TAKEN OUT: the two lit towers, 42px each. The street keeps its two sign bands and its lamps. */
  body.tab-usage[data-theme="cyberpunk"] .th-floor{background:
  linear-gradient(180deg,#3f2356,#211230) left 0 bottom 20px/230px 9px no-repeat,
  linear-gradient(90deg,rgba(244,114,182,.9),rgba(56,210,235,.75)) left 0 bottom 18px/230px 2px no-repeat,
  linear-gradient(180deg,#3f2356,#211230) left 0 bottom 8px/230px 7px no-repeat,
  linear-gradient(90deg,rgba(56,210,235,.6),rgba(244,114,182,.55)) left 0 bottom 7px/230px 2px no-repeat,
  radial-gradient(circle 4px at 50% 50%,rgba(244,114,182,.8) 0 54%,transparent 62%) left 34px bottom 24px/8px 8px no-repeat,
  radial-gradient(circle 4px at 50% 50%,rgba(56,210,235,.75) 0 54%,transparent 62%) left 184px bottom 24px/8px 8px no-repeat,
  linear-gradient(90deg,#2f1842,#190d26) left 0 bottom 0/230px 7px no-repeat,
  linear-gradient(180deg,transparent 0 126px,#190d26 126px) 0 0/230px 156px no-repeat;}
/* 악세: 네온 바이저 */
body.tab-usage[data-theme="cyberpunk"] .th-badge{background:
  linear-gradient(180deg,#fba7d2,#c2488b) 31px 39px/26px 5px no-repeat,
  linear-gradient(180deg,#2f1842,#190d26) 29px 37px/30px 3px no-repeat;
  filter:drop-shadow(0 0 4px rgba(244,114,182,.65));}

  .th-chip[data-th="cyberpunk"]{--card:#160c20;--th-scene:radial-gradient(ellipse 62% 18% at 16% 4%,rgba(244,114,182,.26) 0%,transparent 70%),radial-gradient(ellipse 50% 11% at 86% 3%,rgba(56,210,235,.17) 0%,transparent 74%),repeating-linear-gradient(0deg,transparent 0 3px,rgba(0,0,0,.26) 3px 4px),linear-gradient(180deg,transparent 54%,rgba(0,0,0,.48) 100%);}
`
};
