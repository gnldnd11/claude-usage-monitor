// The minefield: 25 cells, a few of them mined, and the only decision is when to stop. The host
// buries the mines and prices every rung of the ladder; the screen digs where it is told to.
//
// Both hooks are here, and that is the easy one to miss: `startArg` carries the mine count the
// DEAL chose and `opArg` carries the cell a dig names. The default opArg hands the engine the bare
// string 'dig', which drops the cell with it, and the refusal that comes back is "pick a cell on
// the board" (games/README.md, section 3).
'use strict';
const engine = require('../../mines');
const tiles = require('../tiles');

// 'pick 3, 5 or 10 mines', built from the engine's own board so a retune carries into the sentence
const COUNTS = engine.MINE_COUNTS.slice();
const COUNT_WORDS = COUNTS.length > 1
  ? COUNTS.slice(0, -1).join(', ') + ' or ' + COUNTS[COUNTS.length - 1]
  : String(COUNTS[0]);

module.exports = {
  id: 'mines',
  key: 'mn',
  name: 'Minefield',
  // The only row that carries a second line, together with the tower. Twelve rows reading
  // "Min bet 10" is wallpaper; the same line on two rows out of fourteen reads "this one is dear"
  sub: 'Min bet ' + engine.MIN_BET,
  icon: 'bomb',
  tile: tiles.mines,
  title: 'Minefield',
  hint: 'Dig for gems and cash out before you hit a mine · 96 to 97% back · Min bet ' + engine.MIN_BET,
  panel: 'games/mines/panel.js',
  cls: 'mn',
  order: 90,
  group: 'Boards',

  table: {
    key: 'mn',
    id: 'mines',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'play',
    noun: 'round',
    // read off the deal message, and only this one field: the driver writes seed, id and bet over
    // whatever this returns, so nothing off the wire can reach them
    startArg: (m) => ({ mines: m.mines }),
    badStart: (a) => (COUNTS.indexOf(a.mines) >= 0 ? null : 'pick ' + COUNT_WORDS + ' mines'),
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet, mines: a.mines }),
    stakeOf: (st) => st.bet,
    // the cell travels WITH the move, so it rides on opArg and not on the deal
    opArg: (m) => ({ op: m.op, cell: m.cell })
  },

  css: `
  /* --- the minefield: a board DRAWN on the felt (docs/game-panels.md, section 3) --- */
  .inner.mn{padding:13px 13px 14px;}
  /* 216px is five 40px cells plus the four 4px gaps. The cap is on the BOARD rather than on the
     cell, so the board stays square and one offset formula places both sets of hairlines; a cap on
     the cell would leave the grid wider than the cells it holds and the rules would drift */
  .mn-board{position:relative;display:grid;grid-template-columns:repeat(5,1fr);gap:4px;max-width:216px;margin:0 auto;}
  /* the grid is hairlines in the gaps, not 25 outlined tiles: a tile reads as something laid on the
     table, and this board is drawn on it. .gm-rule carries the colour (games/casino.js) */
  .mn-board .gm-rule{position:absolute;pointer-events:none;}
  .mn-rv{top:0;bottom:0;width:1px;}
  .mn-rh{left:0;right:0;height:1px;}
  .mn-c{position:relative;display:flex;align-items:center;justify-content:center;aspect-ratio:1;
    padding:0;border:0;border-radius:6px;background:transparent;font:inherit;cursor:pointer;}
  .mn-c:disabled{cursor:default;}
  /* A COVERED CELL. Twenty-five of these ARE the board: without them the felt is empty, the deal
     changes nothing on screen and there is no first move to find (docs/game-panels.md, section 2).
     The lid is DRAWN and not laid down: a filled face would read as a tile on the table and this
     board is drawn on it. --felt-dim at .7 is 3.33:1 on the felt and 1.0 is 5.11:1 */
  .mn-c::before{content:"";position:absolute;inset:3px;border-radius:5px;
    box-shadow:inset 0 0 0 1px var(--felt-dim);opacity:.7;}
  /* the bet screen, and the end of a round: the lids are there, but the board is not the player's */
  .mn-c:disabled::before{opacity:.34;}
  /* a cell that has been turned over has no lid left on it. After the :disabled rule, which it ties
     with on specificity: a dug cell is both */
  .mn-c.safe::before,.mn-c.boom::before,.mn-c.mine::before,.mn-c.free::before{opacity:0;}
  /* the hover was 1.22:1 against the felt, which is no hover at all. The fill stays and the lid
     takes the ember edge, so the cell under the pointer is the one thing at 4.18:1 */
  .mn-c:hover:not(:disabled){background:rgba(232,137,90,.16);}
  .mn-c:hover:not(:disabled)::before{box-shadow:inset 0 0 0 1px #e8895a;opacity:1;}
  .mn-c:focus-visible{outline:2px solid #e8895a;outline-offset:-1px;}
  .mn-mk{width:9px;height:9px;border-radius:50%;background:transparent;}
  /* a gem: the cell paid. win green, the same verdict colour every felt uses */
  .mn-c.safe .mn-mk{background:#7ee6a4;}
  /* the mine that ended it. The only filled cell on the board, so it is found at a glance */
  .mn-c.boom{background:rgba(246,131,110,.3);}
  .mn-c.boom .mn-mk{background:#f6836e;}
  /* a mine nobody stepped on: a ring, so "it was there too" reads apart from "nothing was here" */
  .mn-c.mine .mn-mk{background:transparent;box-shadow:inset 0 0 0 2px var(--felt-dim);}
  .mn-c.free .mn-mk{width:4px;height:4px;background:var(--felt-dim);opacity:.4;}
  /* paired with MN_T.flip (150) and MN_T.boom (180). The mark moves, not the cell: a grid that
     jumps is a grid that was never drawn on the felt */
  .mn-c.flip .mn-mk{animation:mnFlip .15s ease-out both;}
  .mn-c.blast .mn-mk{animation:mnBlast .18s ease-out both;}
  @keyframes mnFlip{from{transform:scale(.4);opacity:0;}to{transform:none;opacity:1;}}
  @keyframes mnBlast{0%{transform:scale(.3);}60%{transform:scale(1.5);}100%{transform:none;}}
  @media (prefers-reduced-motion:reduce){.mn-c.flip .mn-mk,.mn-c.blast .mn-mk{animation:none;}}
  /* the cash-out figure and the next rung wrap at 152px rather than scrolling sideways. That is
     .hl-line's own rule now (games/casino.js), because the tower needed it for the same reason */
  /* its own line inside the control row: the counts plus the stakes plus Deal is four controls, and
     three on one line already folds at 280px. It wraps again at 152px rather than scrolling */
  .mn-pick{flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
  .mn-lbl{flex:none;font-size:10.5px;font-weight:700;color:var(--muted);}
  .mn-pr{display:flex;justify-content:space-between;gap:8px;}
  .mn-pr b{font-weight:700;color:var(--text);}
`
};
