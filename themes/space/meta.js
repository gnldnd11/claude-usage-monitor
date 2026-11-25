// DEEP FIELD. A ringed planet off the top right corner, a moon and its satellite at the top
// left, lunar ground with a dish antenna and a base dome, a bubble helmet, and stars.
// It is the one theme with something in the ring: the track becomes an orbit and a point of
// light runs round it (.th-orbit).
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
  id: 'space',
  name: 'Deep Field',
  order: 40,
  layers: ['frame', 'floor', 'badge', 'motes'],
  art: {},
  accent: '#a78bfa',
  accentHi: '#cbb8fd',

  css: `
  body.tab-usage[data-theme="space"]{--card:#10132c;--inner:#10132c;--track:#262c54;--text:#e9eaf8;--muted:#9ea3c6;--shell:#070914;--glow:0 0 0 1px #2a2f5e, 0 0 24px -4px rgba(167,139,250,.42);--scene:radial-gradient(ellipse 120% 44% at 22% 16%,rgba(92,66,180,.52) 0%,transparent 62%),radial-gradient(ellipse 92% 38% at 84% 60%,rgba(40,86,166,.44) 0%,transparent 66%),radial-gradient(ellipse 58% 24% at 54% 40%,rgba(126,84,200,.34) 0%,transparent 74%),linear-gradient(180deg,transparent 60%,rgba(0,0,0,.40) 100%);--tabsbg:rgba(0,0,0,.34);--tabon:var(--accent);--tabonink:#0d0d0f;--statsbg:transparent;--tilebg:transparent;--ringtrack:rgba(0,0,0,.46);--bartrack:rgba(0,0,0,.52);--border:#222747;--iborder:#222747;}
  body.tab-usage[data-theme="space"] #panelUsage{background:transparent;border:1px solid rgba(167,139,250,.10);}

body.tab-usage[data-theme="space"] .stats{gap:0;}
body.tab-usage[data-theme="space"] .stat + .stat{box-shadow:inset 1px 0 0 rgba(255,255,255,.07);}
body.tab-usage[data-theme="space"] .wk-more{background:rgba(255,255,255,.09);}
body.tab-usage[data-theme="space"] .th-motes{background:
  radial-gradient(circle,#fff 0 .9px,transparent 1.5px) 0 0/47px 39px,
  radial-gradient(circle,#c8cdf5 0 .7px,transparent 1.3px) 19px 23px/61px 53px,
  radial-gradient(circle,#9aa2d8 0 .6px,transparent 1.1px) 33px 11px/83px 71px;
  opacity:.9;animation:th-space-starDrift 150s linear infinite;}
@keyframes th-space-starDrift{from{background-position:0 0,19px 23px,33px 11px}
  to{background-position:0 390px,19px 553px,33px 721px}}
body.tab-usage[data-theme="space"] .rtrack{stroke-dasharray:2 5;stroke:rgba(190,196,245,.42);}
body.tab-usage[data-theme="space"] .th-orbit{display:block;position:absolute;inset:0;animation:th-space-orbit 16s linear infinite;}
body.tab-usage[data-theme="space"] .th-orbit::after{content:'';position:absolute;left:50%;top:5px;width:5px;height:5px;
  margin-left:-2.5px;border-radius:50%;background:#e4dcff;
  box-shadow:0 0 7px 2px rgba(190,160,255,.85);}
@keyframes th-space-orbit{to{transform:rotate(360deg)}}
/* 틀: 우상의 고리 행성, 좌상의 작은 위성과 성운, 좌우 빛기둥 */
body.tab-usage[data-theme="space"] .th-frame{background:
  radial-gradient(circle 9px at 20px 16px,#6f7fb8 0 62%,transparent 68%),
  radial-gradient(circle 3px at 17px 13px,#aab6e8 0 66%,transparent 72%),
  radial-gradient(ellipse 44px 26px at 10px 62px,rgba(110,80,200,.42) 0 58%,transparent 70%),
  radial-gradient(ellipse 30px 20px at 32px 96px,rgba(60,96,190,.34) 0 60%,transparent 72%),
  linear-gradient(180deg,rgba(72,62,140,.60),transparent) 0 0/13px 100% no-repeat,
  linear-gradient(180deg,rgba(72,62,140,.60),transparent) 237px 0/13px 100% no-repeat;}
body.tab-usage[data-theme="space"] .th-frame::after{content:'';position:absolute;right:4px;top:3px;width:34px;height:34px;
  border-radius:50%;background:radial-gradient(circle at 34% 30%,#9b86e8,#4a3a92 66%,#281f5e);
  box-shadow:0 0 18px -2px rgba(150,120,250,.70);}
body.tab-usage[data-theme="space"] .th-frame::before{content:'';position:absolute;right:-7px;top:12px;width:54px;height:17px;
  border-radius:50%;border:2.5px solid rgba(200,182,255,.85);transform:rotate(-20deg);
  box-shadow:0 0 11px -3px rgba(170,140,250,.9);}


  /* THE LANDSCAPE, RE-LAID AGAINST THE SHIPPED PANEL (2026-11-26).
     The dish antenna stood in the middle of the figures on its 30px mast.
     Three rules, and they are the same three for every theme in this directory:
       1. every object is anchored to the card's FLOOR and lives in the bottom 34px. Under the
          last line of the stat row there are 39px of padding that always stack up (the tile's 10,
          the inner's 13, the card's 14, the border), so that band is structural and does not have
          to be re-measured when the bars above change
       2. THE GROUND IS THE LAST LAYER. In CSS the first background layer is the topmost, and the
          mockup wrote the ground first: the cart, its wheels and its rails were all underneath an
          opaque ground and what reached the screen was a 4px lip of gold across a figure
       3. what will not read at 34px is taken out rather than cropped
     SHRUNK: the dish and its mast, from 51px tall to 24. The base dome keeps its size. */
  body.tab-usage[data-theme="space"] .th-floor{background:
  radial-gradient(ellipse 6px 4px at 50% 100%,#4a4f7e 0 68%,transparent 72%) left 188px bottom 16px/14px 9px no-repeat,
  radial-gradient(ellipse 11px 7px at 50% 100%,#a6abd8 0 66%,transparent 70%) left 184px bottom 14px/22px 14px no-repeat,
  linear-gradient(180deg,#767ba6,#3a3f68) left 193px bottom 3px/3px 12px no-repeat,
  linear-gradient(180deg,#2e3254,#1f2240) left 188px bottom 0/13px 4px no-repeat,
  radial-gradient(circle 2px at 50% 50%,#ffd48a 0 60%,transparent 66%) left 36px bottom 10px/6px 6px no-repeat,
  radial-gradient(circle 2px at 50% 50%,#ffd48a 0 60%,transparent 66%) left 48px bottom 10px/6px 6px no-repeat,
  radial-gradient(ellipse 22px 14px at 50% 100%,#3b4070 0 72%,transparent 76%) left 24px bottom 0/48px 28px no-repeat,
  radial-gradient(ellipse 12px 5px at 50% 50%,#1d1f3e 0 70%,transparent 74%) left 96px bottom 4px/24px 10px no-repeat,
  radial-gradient(ellipse 9px 4px at 50% 50%,#1d1f3e 0 70%,transparent 74%) left 140px bottom 9px/18px 8px no-repeat,
  radial-gradient(ellipse 150% 44px at 50% 156px,#2e3058 0 70%,transparent 74%) 0 0/230px 156px no-repeat;}
/* 악세: 우주 헬멧 */
body.tab-usage[data-theme="space"] .th-badge{background:
  radial-gradient(circle 13px at 43px 42px,transparent 0 58%,rgba(190,200,255,.42) 60% 72%,transparent 74%),
  radial-gradient(ellipse 11px 5px at 38px 35px,rgba(255,255,255,.55) 0 60%,transparent 66%),
  linear-gradient(180deg,#c8cdf0,#8a90c0) 30px 41px/3px 7px no-repeat,
  linear-gradient(180deg,#c8cdf0,#8a90c0) 53px 41px/3px 7px no-repeat;}

  .th-chip[data-th="space"]{--card:#10132c;--th-scene:radial-gradient(ellipse 120% 44% at 22% 16%,rgba(92,66,180,.52) 0%,transparent 62%),radial-gradient(ellipse 92% 38% at 84% 60%,rgba(40,86,166,.44) 0%,transparent 66%),radial-gradient(ellipse 58% 24% at 54% 40%,rgba(126,84,200,.34) 0%,transparent 74%),linear-gradient(180deg,transparent 60%,rgba(0,0,0,.40) 100%);}
`
};
