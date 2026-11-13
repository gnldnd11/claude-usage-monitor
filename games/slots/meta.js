// Slots: three rings, one line, and the press IS the round. The host owns the rings and the
// paytable (slots.js); this file is the list row, the host wiring and the screen's own CSS.
//
// WHY THERE IS NO `livePhase` HERE, and why slots.js's own header says there should be.
// That header predates the driver's spec check. games/tables.js's whyNotSpec() now reads the two
// halves of one fact against each other (`!!livePhase === (engine.OPS.length > 0)`): this engine's
// OPS is empty, so naming any live phase at all costs this game its row at load. The engine's
// reasoning still holds in full (the phase must never be 'done'), it is just that the answer the
// driver now wants is "leave it out", which is what games/README.md section 2 says too.
'use strict';
const engine = require('../../slots');
const tiles = require('../tiles');

module.exports = {
  id: 'slots',
  key: 'sl',
  name: 'Slots',
  // No slot-machine glyph exists in icons.js and four screens are being built at once, so this
  // borrows the nearest one rather than editing a shared register. The list row draws the tile;
  // this is only the glyph in the panel's heading (CUC.frame)
  icon: 'reel',
  tile: tiles.slots,
  title: 'Slots',
  hint: 'Three alike pays its row · two alike hands the bet back, kelp aside · returns 96.4%',
  panel: 'games/slots/panel.js',
  cls: 'sl',
  order: 50,

  table: {
    key: 'sl',
    id: 'slots',
    engine: engine,
    minBet: engine.MIN_BET,
    noun: 'spin',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    // A spin settles on the press, so a round is never live and nothing is ever held back from the
    // other games. The driver only asks this of a live round, so it is never actually reached
    stakeOf: () => 0
  },

  css: `
  /* --- Slots: three rings on the machines' slate plate (docs/game-panels.md, section 3) --- */
  /* THE PLATE IS EXACTLY THE FELT'S INNER WIDTH AT THE NARROWEST SIDEBAR. Three 48px reels are
     144px and the felt gives 152px at sidebar 250, so there are 8px to spend on the whole plate.
     The spec spends them as two 4px gaps BETWEEN the reels; they are spent here as the two 4px
     gutters the pay-line carets need, because a caret that marks the middle row has to sit outside
     the reels and 8px cannot be in both places. The reels are told apart by a 1px inset instead,
     which costs no width. The cell stays 48px, which is the figure that may not move: the symbol
     grid is 24 units and 48px is the only size that makes it two whole pixels a unit.
     The side padding is .gm-plate.tight's (games/casino.js) and the gutters are what centring 144
     inside 152 leaves over, which is the same two 4px the carets stand in */
  .sl-plate{position:relative;display:flex;justify-content:center;width:152px;max-width:100%;margin:0 auto;overflow:hidden;}
  /* THE WINDOW IS 112px, DOWN FROM 152, and it is a crop and not a resize: the pay line keeps its
     own 48px and the rows either side show 28 of theirs (28 + 4 + 48 + 4 + 28). The cell is still
     48, so the symbol grid is still two whole pixels a unit (docs/game-panels.md 8-3).
     What it buys: the winning row stops being a 48px band inside a 152px box and becomes the
     window itself, with the ring plainly passing above and below it. This screen was the fullest
     in the casino at 183% of the design height, so it is the one with the room to give back */
  .sl-reel{position:relative;flex:none;width:48px;height:112px;overflow:hidden;}
  .sl-reel+.sl-reel{box-shadow:inset 1px 0 0 rgba(0,0,0,.55);}
  /* the run of ring inside the window. The transition is set per reel in games/slots/panel.js,
     because its length is the reel's own stop time and the easing is the wheel's
     (games/wheel/meta.js). Reduced motion is handled there too, by CUC.reduceMotion() drawing the
     plate at rest instead of rolling it: there is no transition here for a media query to cancel */
  .sl-strip{display:flex;flex-direction:column;gap:4px;}
  .sl-reel .sy-cell{flex:none;}
  /* the pay line is the middle row, so the rows either side of it are the ring going past */
  .sl-reel .sy-cell.dim{opacity:.5;}
  /* ONE RING PER MATCHED REEL, never one box around the line: a box makes three cells into one
     thing and deletes "three of them matched", and a pair matches only two of the three */
  .sl-reel .sy-cell.hit{box-shadow:inset 0 0 0 2px #e8895a;}
  /* the drum. The reels are told apart by the 1px inset above, which costs no width; this is the
     other half of reading them as cylinders rather than as a grid, and it costs no width either
     because it is drawn inside the window the ring is already clipped to */
  .sl-reel:after{content:"";position:absolute;inset:0;pointer-events:none;
    box-shadow:inset 0 10px 10px -8px rgba(0,0,0,.9), inset 0 -10px 10px -8px rgba(0,0,0,.9);}
  /* the carets: the pay line, marked from outside the reels */
  .sl-caret{position:absolute;top:50%;width:0;height:0;margin-top:-5px;
    border-top:5px solid transparent;border-bottom:5px solid transparent;}
  .sl-caret.l{left:0;border-left:4px solid #e8895a;}
  .sl-caret.r{right:0;border-right:4px solid #e8895a;}
  /* the paytable, behind the shared ? toggle (docs/game-panels.md, section 5) */
  .sl-pay{display:flex;gap:6px;line-height:1.5;}
  .sl-pay span{flex:1 1 auto;min-width:0;}
  .sl-pay b{flex:none;width:48px;text-align:right;font-weight:700;}
  .sl-pay.head{color:var(--muted);opacity:.8;}
`
};
