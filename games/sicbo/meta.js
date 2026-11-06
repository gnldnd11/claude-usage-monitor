// Sic Bo: three dice, one bet, one roll. The host owns the roll, the four bet shapes and every
// price (sicbo.js); this file is the list row, the host wiring and the screen's own CSS.
//
// THE BET IS CHOSEN BEFORE THE ROUND EXISTS, so it travels on the deal: `startArg` reads it off the
// message and `badStart` rules on it before anything is staked. Without that second hook an unknown
// bet would reach newRound, which throws a RangeError, and the player would read a programmer's
// error instead of "bet on small, big, a total or any triple" (games/README.md, section 3).
//
// WHY THERE IS NO `livePhase`: a roll settles on the press, so this engine's OPS is empty, and
// games/tables.js's whyNotSpec() reads `!!livePhase === (OPS.length > 0)`. Naming a phase at all
// would cost this game its row at load. The same note is in games/slots/meta.js and
// games/plinko/meta.js, which are the other two games born 'done'.
'use strict';
const engine = require('../../sicbo');
const tiles = require('../tiles');

module.exports = {
  id: 'sicbo',
  key: 'sb',
  name: 'Sic Bo',
  icon: 'dice3',
  tile: tiles.sicbo,
  title: 'Sic Bo',
  hint: 'Three dice, one bet · small 4-10 and big 11-17 both lose to a triple · every row returns 96.7% or better',
  panel: 'games/sicbo/panel.js',
  cls: 'sb',
  order: 100,
  group: 'Dice',

  table: {
    key: 'sb',
    id: 'sicbo',
    engine: engine,
    minBet: engine.MIN_BET,
    noun: 'roll',
    // read off the deal message, and only these two fields. The driver writes `seed`, `id` and
    // `bet` over whatever this returns, so nothing off the wire can reach them
    startArg: (m) => ({ kind: m.kind, total: m.total }),
    // badBet() answers null for anything that is not a total before it looks at one, so handing it
    // the total unconditionally is safe and keeps the refusal the engine's own sentence
    badStart: (a) => engine.badBet(a.kind, a.total),
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet, kind: a.kind, total: a.total }),
    // A roll settles on the press, so a round is never live and nothing is ever held back from the
    // other games. The driver only asks this of a live round, so it is never actually reached
    stakeOf: () => 0
  },

  css: `
  /* --- Sic Bo: three dice over a board DRAWN on the felt (docs/game-panels.md, 5-12 to 5-15) --- */
  /* The dice are exactly the felt's inner width at the narrowest sidebar: 48 x 3 plus two 4px gaps
     is 152, which is what the felt gives at sidebar 250. They do not grow on a wider one, the way
     the wheel keeps its 150px dial and the reels keep their 48px cell */
  .sb-dice{display:flex;justify-content:center;gap:4px;}
  /* cream is 9.30:1 on the felt and the ink pips are 16.30:1 on cream, which is the only reason a
     die reads as an object standing on a table. The body follows the cell's own color property,
     which is what this one line is for (CUC.die, webview.js) */
  .sb-die{flex:none;width:48px;height:48px;color:#fcecdc;}
  /* THE SQUARES ARE FILLED, NOT OUTLINED, and that is measured rather than chosen: ink on the felt
     is 1.75:1 and .gm-rule is 1.35:1, so a board drawn in lines is a board nobody can see. A square
     is --felt-dim mass (5.11:1) with ink on it (8.96:1) */
  .sb-board{margin-top:10px;display:flex;flex-direction:column;gap:2px;}
  .sb-row{display:grid;gap:2px;}
  /* three names, then the fourteen totals as 7x2. At sidebar 250 a total square is 20px and at 280
     it is 24px, which is what 1fr columns over the felt's own width come to */
  .sb-row.kinds{grid-template-columns:repeat(3,1fr);}
  .sb-row.totals{grid-template-columns:repeat(7,1fr);}
  .sb-cell{position:relative;height:20px;padding:0;border:0;border-radius:6px;
    background:var(--felt-dim);color:#0b1310;
    font-family:inherit;font-size:12px;font-weight:700;
    font-variant-numeric:tabular-nums;cursor:pointer;
    display:flex;align-items:center;justify-content:center;}
  .sb-row.kinds .sb-cell{height:26px;font-size:11px;}
  /* the bet that is on. ember with #1d1d1f on it is 6.54:1, and ember is the one accent this
     casino has: the square the player chose is the same colour as every other "this one" */
  .sb-cell.on{background:#e8895a;color:#1d1d1f;}
  /* hover brightens the mass rather than recolouring it, which is what .bj-btn.primary already
     does: recolouring to ember would make a hovered square and the chosen square the same picture */
  .sb-cell:hover{filter:brightness(1.12);}
  .sb-cell:focus-visible{outline:2px solid var(--focus);outline-offset:1px;}
  /* WHERE THE ROLL ACTUALLY LANDED, in cream, so "why did Small lose" needs no sentence. A ring and
     not a fill: the chosen square is already a fill, and the two have to be legible at once when
     they are the same square. z-index because the squares are 2px apart and the ring is 2px wide */
  .sb-cell.hit{box-shadow:0 0 0 2px #fcecdc;z-index:1;}
  /* the one line under the board, and it says the CHOSEN row only. Small plus its multiple is 82px
     at this size; adding the chance (105 of 216) comes to 148 and the line folds at 152 */
  .sb-read{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;min-height:14px;margin-top:8px;
    font-size:10.5px;color:var(--felt-dim);font-variant-numeric:tabular-nums;}
  .sb-read b{font-weight:700;color:var(--felt-ink);}
  .sb-read i{font-style:normal;color:#e8895a;font-weight:700;}
  /* the folded paytable: seventeen rows is a table, so it lives behind the ? and the one-line
     version lives in the heading's title= (docs/game-panels.md, section 5) */
  .sb-pay{display:flex;gap:6px;line-height:1.5;}
  .sb-pay span{flex:1 1 0;min-width:0;}
  .sb-pay b{flex:none;width:46px;text-align:right;font-weight:700;}
  .sb-pay.head{color:var(--muted);opacity:.8;}
  .sb-pay.on span,.sb-pay.on b{color:var(--text);}
  /* the lit row's own note, which is the one sentence this screen has room for anywhere */
  .sb-pay.note{margin-top:4px;}
  /* the dice arrive one at a time (SB_T), so each one fades in on its own beat */
  .sb-die.in .dc{animation:sbIn .16s ease-out both;}   /* pairs with SB_T.in */
  @keyframes sbIn{from{opacity:0;transform:scale(.88);}to{opacity:1;transform:none;}}
  @media (prefers-reduced-motion:reduce){.sb-die.in .dc{animation:none;}}
`
};
