// Shut the Box: nine tiles, two dice, and the tiles that add up to the throw come down. The host
// owns the throws, what can be closed on each one and the table (shutbox.js); this file is the list
// row, the host wiring and the screen's own CSS.
//
// THE MOVE CARRIES THE TILES, so `opArg` has to be spelled out. The default is `(m) => m.op`, which
// hands the engine the bare string 'close' and drops the tile list with it, and the refusal that
// comes back is then "pick the tiles that add up to 7" for a message that named them
// (games/README.md, section 3: the minefield and the tower were both caught here).
//
// A round is live across several throws, so unlike a spin its bet is a real claim on the purse from
// the deal until the last tile goes down, and the seed is a genuine secret: every throw the player
// has not seen yet is drawn from it at the deal (shutbox.js's header).
'use strict';
const engine = require('../../shutbox');
const tiles = require('../tiles');

module.exports = {
  id: 'shutbox',
  key: 'sx',
  name: 'Shut the Box',
  icon: 'slats',
  tile: tiles.shutbox,
  title: 'Shut the Box',
  hint: 'Close the tiles that add up to the throw · the less left standing the more it pays · best play returns 96.8%',
  panel: 'games/shutbox/panel.js',
  cls: 'sx',
  order: 120,
  group: 'Dice',

  table: {
    key: 'sx',
    id: 'shutbox',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'play',
    noun: 'round',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    stakeOf: (st) => st.bet,
    // the tiles ride with the move, by their own numbers. Nothing is chosen before the round
    // exists, so there is no startArg/badStart pair here
    opArg: (m) => ({ op: m.op, tiles: m.tiles })
  },

  css: `
  /* --- Shut the Box: two dice over nine tiles, all of it drawn ON the felt --- */
  /* two 48px dice with 6px between them, centred: 102px, which fits the felt at every width */
  .sx-dice{display:flex;justify-content:center;gap:6px;}
  /* cream: 9.30:1 on the felt. The die's body follows this (CUC.die, webview.js) */
  .sx-die{flex:none;width:48px;height:48px;color:#fcecdc;}
  /* FIVE AND FOUR, and the width is one sum rather than two. Each tile takes a fifth of the felt
     less the four gaps, so five fill the first row exactly and the remaining four wrap and centre
     themselves: 28px at sidebar 250 and 34px at 280, which is what 5-15 measured */
  .sx-tiles{display:flex;flex-wrap:wrap;justify-content:center;gap:3px;margin-top:10px;}
  .sx-tile{flex:0 0 calc((100% - 12px) / 5);height:30px;padding:0;border:0;border-radius:6px;
    background:var(--felt-dim);color:#0b1310;
    font-family:inherit;font-size:16px;font-weight:700;
    font-variant-numeric:tabular-nums;cursor:pointer;
    display:flex;align-items:center;justify-content:center;}
  /* FOUR STATES OUT OF THREE MATERIALS (docs/game-panels.md, 5-15).
     open and playable: --felt-dim mass with ink on it, 5.11:1 */
  /* the tile in hand: ember, the one accent, with #1d1d1f on it at 4.18:1 */
  .sx-tile.on{background:#e8895a;color:#1d1d1f;}
  /* already down: the felt itself, with a hairline of --felt-dim at .7 round the hole it left.
     A FILL AND NOT A BRIGHTNESS STEP: dim 1.0 against dim .7 is 1.53:1, which is where the tower
     failed, so what separates a standing tile from a fallen one is mass against nothing */
  /* a down tile draws no number at all: its accessible name still says which tile it is */
  .sx-tile.down{background:transparent;box-shadow:inset 0 0 0 1px rgba(159,185,169,.7);cursor:default;}
  /* no set on THIS throw can use it. Deliberately faint, about 2:1: it is still a tile and it is
     still standing, it is just not one of this throw's answers */
  .sx-tile.off{opacity:.35;cursor:default;}
  .sx-tile:hover:not([disabled]){filter:brightness(1.12);}
  .sx-tile[disabled]{cursor:default;}
  .sx-tile:focus-visible{outline:2px solid var(--focus);outline-offset:1px;}
  /* the tile going down, 150ms, which is a PRESS and has to be short: a round is up to nine of them
     (docs/game-panels.md, section 6, class 2). Pairs with SX_T.close */
  .sx-tile.shut{animation:sxShut .15s ease-in both;}
  @keyframes sxShut{from{opacity:1;transform:none;}to{opacity:1;transform:scaleY(.82);}}
  /* the next throw arrives after it, 200ms (SX_T.roll) */
  .sx-die.in .dc{animation:sxIn .16s ease-out both;}
  @keyframes sxIn{from{opacity:0;transform:scale(.88);}to{opacity:1;transform:none;}}
  /* the folded paytable: three rows, and they are the whole game, so they are behind the ? with the
     one-line version in the heading's title= */
  .sx-pay{display:flex;gap:6px;line-height:1.5;}
  .sx-pay span{flex:1 1 0;min-width:0;}
  .sx-pay b{flex:none;width:46px;text-align:right;font-weight:700;}
  .sx-pay.head{color:var(--muted);opacity:.8;}
  .sx-pay.on span,.sx-pay.on b{color:var(--text);}
  /* the second block in the same box: how often each throw comes up */
  .sx-pay.sx-throws{margin-top:6px;}
  @media (prefers-reduced-motion:reduce){.sx-tile.shut,.sx-die.in .dc{animation:none;}}
`
};
