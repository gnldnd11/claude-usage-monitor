// The scratch card: nine squares, dealt at the buy, rubbed off one at a time. The host owns the
// card, the bag and the paytable (scratch.js); this file is the list row, the host wiring and the
// screen's own CSS.
//
// The square a scratch names travels WITH the move, so `opArg` has to hand the engine both halves.
// The default is `(m) => m.op`, which drops the square and comes back as "a scratch names a square
// from 0 to 8" for a message that named one (games/README.md, section 3).
'use strict';
const engine = require('../../scratch');
const tiles = require('../tiles');

module.exports = {
  id: 'scratch',
  key: 'sc',
  name: 'Scratch Card',
  // No ticket glyph exists in icons.js and four screens are being built at once, so this borrows
  // the nearest one rather than editing a shared register. The list row draws the tile; this is
  // only the glyph in the panel's heading (CUC.frame)
  icon: 'doc',
  tile: tiles.scratch,
  title: 'Scratch Card',
  hint: 'Three alike hands the bet back · four and up is the prize, rarer symbol pays more · returns 96.6%',
  panel: 'games/scratch/panel.js',
  cls: 'sc',
  order: 80,
  group: 'Machines',

  table: {
    key: 'sc',
    id: 'scratch',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'scratch',
    noun: 'card',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    // A card is live across several messages, so unlike a spin its bet is a real claim on the purse
    // until the ninth square turns over
    stakeOf: (st) => st.bet,
    // the square rides with the move. badCell() is inside the engine's own whyNot, so there is no
    // badStart here: nothing is chosen before the card exists
    opArg: (m) => ({ op: m.op, cell: m.cell })
  },

  css: `
  /* --- Scratch card: 3x3 on the machines' slate plate (docs/game-panels.md, section 3) --- */
  /* THE PLATE IS EXACTLY THE FELT'S INNER WIDTH AT THE NARROWEST SIDEBAR, like the slot machine's,
     and it spends its 8px differently for a reason. Nine 48px squares are 144px and the felt gives
     152px at sidebar 250: here the 8px goes between the columns, because nine covered squares have
     to read as nine things to press. (The slots spend theirs on the pay-line carets instead, which
     have to sit outside the reels; both keep the 48px cell, which is the figure that may not move.)
     The squares are 48px for the same reason the reels are: the symbol grid is 24 units.
     The side padding is .gm-plate.tight's (games/casino.js): 144 of squares and 8 of gaps is the
     whole 152, so there is nothing left for a side to take */
  .sc-plate{display:grid;grid-template-columns:repeat(3,48px);gap:4px;justify-content:center;
    width:152px;max-width:100%;margin:0 auto;}
  /* A COVERED SQUARE IS FOIL AND A RUBBED ONE IS SLATE. The symbols are drawn for slate
     (games/symbols.js), so a rubbed square is the same surface a reel window is */
  .sc-cell{position:relative;width:48px;height:48px;padding:0;border:0;border-radius:6px;
    background:#7e828c;box-shadow:inset 0 1px 0 #bbbdc7;cursor:pointer;display:block;
    font-family:inherit;overflow:hidden;}
  .sc-cell:hover:not(:disabled){background:#8d919b;}
  .sc-cell:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
  .sc-cell[disabled]{cursor:default;}
  /* the foil's own grain, so nine covered squares are not nine grey rectangles */
  .sc-cell::after{content:'';position:absolute;inset:0;
    background:repeating-linear-gradient(135deg, rgba(255,255,255,.14) 0 2px, rgba(0,0,0,.06) 2px 4px);}
  .sc-cell.on{background:#15181c;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6);}
  .sc-cell.on::after{display:none;}
  /* THE SQUARES THAT MADE THE PRIZE. One ring per square and never a box around the group: the
     squares that paid are not next to each other, and a box would claim the ones between them.
     Same recipe and same 2px as a matched reel on the slot machine (games/slots/meta.js), because
     it is the same sentence in both places: "it was these ones" */
  .sc-cell.on.hit{box-shadow:inset 0 0 0 2px #e8895a;}
  .sc-cell .sy{position:absolute;inset:0;width:100%;height:100%;}
  /* the rub itself. The .17s is the same fact as SC_T.tap in games/scratch/panel.js: one press,
     one square off, and it has to be short because a card is nine presses */
  .sc-cell.rub .sy{animation:scRub .17s ease-out both;}
  @keyframes scRub{from{opacity:0;transform:scale(.82);}to{opacity:1;transform:none;}}
  /* what is showing so far, and never what it might pay: the card has no figure until the ninth
     square is off (docs/game-panels.md, section 5-5) */
  .sc-tally{display:flex;align-items:center;gap:6px;min-height:18px;margin-top:8px;}
  /* the paytable, behind the shared ? toggle. Ten symbols share five rows, which is the table the
     engine's own header says a player can read: the names first, then that row's four counts */
  .sc-grp{margin-top:6px;color:var(--text);opacity:.75;}
  .sc-pay{display:flex;gap:6px;line-height:1.5;}
  .sc-pay b{flex:1 1 0;text-align:right;font-weight:700;}
  .sc-pay.head{color:var(--muted);opacity:.8;}
  @media (prefers-reduced-motion:reduce){.sc-cell.rub .sy{animation:none;}}
`
};
