// The plinko board: a bead through twelve rows of pins into one of thirteen cups. The host owns the
// walk, the cups and all three risk tables (plinko.js); this file is the list row, the host wiring
// and the screen's own CSS.
//
// The risk is chosen BEFORE the round exists, so it travels on the deal: `startArg` reads it off the
// message and `badStart` rules on it before anything is staked. Without that second hook an unknown
// risk would reach newRound, which throws a RangeError, and the player would read a programmer's
// error instead of "pick a risk" (games/README.md, section 3).
//
// WHY THERE IS NO `livePhase` HERE, although plinko.js's header asks for one: that header predates
// the driver's spec check. games/tables.js's whyNotSpec() reads `!!livePhase === (OPS.length > 0)`,
// and this engine's OPS is empty, so naming a phase at all costs this game its row at load. See
// games/slots/meta.js, which says the same thing.
'use strict';
const engine = require('../../plinko');
const tiles = require('../tiles');

module.exports = {
  id: 'plinko',
  key: 'pl',
  name: 'Plinko',
  // No bead-and-pins glyph exists in icons.js and four screens are being built at once, so this
  // borrows the nearest one rather than editing a shared register: a zigzag is what a drop draws.
  // The list row draws the tile; this is only the glyph in the panel's heading (CUC.frame)
  icon: 'pins',
  tile: tiles.plinko,
  title: 'Plinko',
  hint: 'Twelve bounces, thirteen cups · the middle is where the bead goes and where the risk is priced · returns 96.3%',
  panel: 'games/plinko/panel.js',
  cls: 'pl',
  order: 60,
  group: 'Machines',

  table: {
    key: 'pl',
    id: 'plinko',
    engine: engine,
    minBet: engine.MIN_BET,
    noun: 'drop',
    startArg: (m) => ({ risk: m.risk }),
    badStart: (a) => engine.badRisk(a.risk),
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet, risk: a.risk }),
    // A drop settles on the press, so a round is never live and nothing is ever held back from the
    // other games. The driver only asks this of a live round, so it is never actually reached
    stakeOf: () => 0
  },

  css: `
  /* --- Plinko: a bead, twelve rows of pins and thirteen cups, on the machines' slate plate --- */
  /* THE BOARD IS A FIXED 130px AND DOES NOT STRETCH. Thirteen cups over the felt's 152px would put
     every cup, every pin and every bounce of the bead on a fraction of a pixel, and the bead's
     landing place is arithmetic the screen cannot be allowed to be approximate about: it has to
     come to rest over the cup the host says it fell into. At a step of 10px the apex, all 78 pins,
     all thirteen cup centres and all thirteen possible landings are whole pixels, which is the same
     reason the symbols are drawn at 48 and the pixel cards at 2px a cell. So the board keeps its
     size and sits centred, the way the wheel keeps its 150px diameter */
  .pl-board{position:relative;width:130px;height:114px;margin:0 auto;}
  .pl-field{position:absolute;left:0;top:0;width:130px;height:84px;}
  .pl-pin{position:absolute;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;
    background:rgba(255,255,255,.22);}
  /* the bead. One element, moved by transform, which is the only thing here that animates */
  .pl-bead{position:absolute;left:65px;top:0;width:6px;height:6px;margin:-3px 0 0 -3px;
    border-radius:50%;background:#e8895a;box-shadow:0 0 0 1px rgba(0,0,0,.45);
    transition:transform .07s linear;}           /* pairs with PL_T.hop */
  .pl-bead.landing{transition:transform .18s cubic-bezier(.3,.9,.4,1);}  /* pairs with PL_T.land */
  /* THE CUPS CARRY NO NUMBERS. A cup is 10px wide and a multiple printed in one is a table nobody
     reads, so a cup is a band of ember whose depth IS its multiple, and only the cup the bead fell
     into says a figure (docs/game-panels.md, section 5-6) */
  .pl-cups{position:absolute;left:0;top:100px;display:flex;width:130px;height:14px;gap:0;}
  .pl-cup{width:10px;height:14px;border-radius:0 0 2px 2px;}
  .pl-cup.hit{box-shadow:inset 0 0 0 1px #e8895a;}
  /* the one figure: a chip over the cup it belongs to, in a row of the same thirteen columns so it
     lands on the right one. At the two ends it is anchored to the edge instead of centred, or it
     would hang off the board */
  .pl-flag{position:absolute;left:0;top:84px;display:grid;grid-template-columns:repeat(13,10px);
    align-items:center;width:130px;height:16px;}
  .pl-flag .bj-chip{grid-row:1;}
  /* the risk chooser: the same segmented control the stakes use, on its own row above them, which
     is how the minefield's mine count sits too (docs/game-panels.md, section 5-1) */
  .pl-risks{margin-top:10px;}
  /* the folded paytable: thirteen cups by three boards is a table, so it lives behind the ? */
  .pl-pay{display:flex;gap:6px;line-height:1.5;}
  .pl-pay span{flex:none;width:52px;}
  .pl-pay b{flex:1 1 0;text-align:right;font-weight:700;}
  .pl-pay.head{color:var(--muted);opacity:.8;}
  .pl-pay.on b{color:var(--text);}
  @media (prefers-reduced-motion:reduce){.pl-bead,.pl-bead.landing{transition:none;}}
`
};
