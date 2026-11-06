// The wheel: one spin, one slice of a dial whose slices differ in width. The host owns the three
// wheels, every angle on them and where the spin stops (wheel.js); this file is the list row, the
// host wiring and the screen's own CSS.
//
// THE WHEEL IS CHOSEN WITH THE SPIN, NOT WITH THE BET, and that is the engine's decision rather
// than a style choice: `act(st, { op: 'spin', risk })` is where the risk is read, the way poker's
// hold flags ride along with the draw. So `opArg` carries both halves of the move and there is no
// `startArg`/`badStart` pair here: nothing is chosen before the round exists, and badRisk() is
// asked inside the engine's own whyNot. (The screen spec, docs/game-panels.md 5-7, was written as
// if the choice travelled with the deal; where the two disagree the engine is what is true.)
//
// THE SPEC ALSO SAYS THE FIGURES CANNOT GO ON THE DIAL, and that is now out of date rather than
// disagreed with. Section 5-7 reasons from 28 EQUAL segments and an 18px arc. The wheel is no
// longer 28 equal segments: it is 30 units of 12deg cut into slices of two units or more, so the
// narrowest arc at the label's radius is 31px against a widest label of 17.98px. The rest of 5-7
// still holds, the 150px dial, the 1px side padding, the num/den chances and the pointer rule
// included.
'use strict';
const engine = require('../../wheel');
const tiles = require('../tiles');

module.exports = {
  id: 'wheel',
  key: 'wh',
  name: 'Wheel',
  // No wheel glyph exists in icons.js and four screens are being built at once, so this borrows the
  // nearest one rather than editing a shared register: a dial with a hand on it. The list row draws
  // the tile; this is only the glyph in the panel's heading (CUC.frame)
  icon: 'wheel',
  tile: tiles.wheel,
  title: 'Wheel',
  hint: 'Every slice is in plain sight and a slice is as likely as it is wide · all three wheels return 96.7%',
  panel: 'games/wheel/panel.js',
  cls: 'wh',
  order: 70,
  group: 'Machines',

  table: {
    key: 'wh',
    id: 'wheel',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'spin',
    noun: 'round',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    // the bet is at risk from the deal until the wheel turns
    stakeOf: (st) => st.bet,
    // the wheel the player picked rides with the move. Without this the engine would be handed the
    // bare string 'spin' and answer "pick a wheel: mild, medium, wild" for a message that named one
    opArg: (m) => ({ op: m.op, risk: m.risk })
  },

  css: `
  /* --- The wheel: a circle, because a wheel is a circle (docs/game-panels.md, section 5-7) --- */
  /* 150px across, fixed, so it fits the felt at the narrowest sidebar (152px) and does not grow
     into a dinner plate on a wide one. The wedges are ONE conic-gradient whose stops are the host's
     own slice angles: SVG wedges would be a dozen hand-written paths for the same picture */
  /* the plate gives up its side padding (.gm-plate.tight, games/casino.js): a 150px dial inside the
     shared 8px would be 166px, and the felt is 152px at sidebar 250. The dial centres itself, so
     the 1px either side is what 152 less 150 leaves, which is why the dial is 150 */
  .wh-dial{position:relative;width:150px;height:150px;margin:0 auto;}
  .wh-face{position:absolute;inset:0;border-radius:50%;
    box-shadow:inset 0 0 0 1px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.06);}
  /* the slowdown is on a CLASS and not on the element, because a redraw, a broadcast and a walk
     back into the screen all set the same transform and none of them may turn the wheel */
  .wh-face.turning{transition:transform .86s cubic-bezier(.17,.67,.2,1);}   /* pairs with WH_T.stop */
  /* the hub, so the wedges read as a wheel rather than as a pie chart */
  .wh-hub{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;
    border-radius:50%;background:#15181c;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);}
  /* the pointer, at twelve o'clock, standing ON the wheel's edge. A big multiplier may not be
     parked under it: pointer and wedge then read as one arrow, which is what the wheel tile in
     games/tiles.js actually did */
  .wh-pin{position:absolute;left:50%;top:-1px;width:0;height:0;margin-left:-5px;
    border-left:5px solid transparent;border-right:5px solid transparent;border-top:10px solid #e8895a;}
  /* THE FIGURES ARE ON THE DIAL, laid along the arc of their own slice and centred 56px out.
     The old screen put them in a legend instead, and the reason given was that one of 28 EQUAL
     segments is an 18px arc at this size. Once the slices stopped being equal that reason went
     with them: the narrowest slice the engine will build is 24deg, which is a 31px arc here, and
     the widest label is 17.98px of ink. Measured in this panel at 10.5px/700, not guessed.
     10.5px is the smallest size the panel spec has, and these are at it (docs/game-panels.md 2) */
  .wh-nums{position:absolute;inset:0;pointer-events:none;}
  .wh-num{position:absolute;left:50%;top:50%;width:40px;height:12px;margin:-6px 0 0 -20px;
    line-height:12px;text-align:center;font-size:10.5px;font-weight:700;font-style:normal;
    font-variant-numeric:tabular-nums;color:var(--felt-ink);text-shadow:0 1px 1px rgba(0,0,0,.55);}
  /* a dead slice says ×0 rather than nothing at all: on the wild wheel four fifths of the dial is
     dead, and an unlabelled dial reads as one that has not finished drawing */
  .wh-num.dead{color:var(--felt-dim);font-weight:600;}
  /* the slice that just came up is solid ember, so its figure has to go dark or it disappears */
  .wh-num.on{color:#15181c;text-shadow:none;}
  /* the legend is now the OTHER half of the question: not what each slice pays, which the dial
     says, but how much of the wheel pays it */
  .wh-key{margin-top:10px;display:flex;flex-direction:column;gap:2px;font-size:10.5px;
    font-variant-numeric:tabular-nums;color:var(--felt-dim);}
  .wh-row{display:flex;align-items:center;gap:6px;}
  .wh-row b{flex:none;width:38px;font-weight:700;color:var(--felt-ink);}
  .wh-row i{flex:none;width:10px;height:10px;border-radius:2px;}
  .wh-row span{flex:1 1 auto;min-width:0;}
  .wh-row.dead b{color:var(--felt-dim);}
  .wh-row.on b,.wh-row.on span{color:#e8895a;}
  /* the wheel chooser: the same segmented control the stakes use, on its own row above them */
  .wh-risks{margin-top:10px;}
  @media (prefers-reduced-motion:reduce){.wh-face.turning{transition:none;}}
`
};
