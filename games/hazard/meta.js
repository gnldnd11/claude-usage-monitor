// Hazard: one die, rolled as often as the player dares, and a 1 takes the lot. The host owns the
// faces, the tray and what it is worth (hazard.js); this file is the list row, the host wiring and
// the screen's own CSS.
//
// A round is live across as many rolls as the player wants, so its bet is a real claim on the purse
// from the deal until it banks or busts, and the seed is a genuine secret: every face the player has
// not seen yet is drawn from it at the deal (hazard.js's header). The engine takes both of its moves
// as a bare string, so the default `opArg` is right here and there is nothing to choose before the
// round exists.
'use strict';
const engine = require('../../hazard');
const tiles = require('../tiles');

module.exports = {
  id: 'hazard',
  key: 'hz',
  name: 'Hazard',
  icon: 'die1',
  tile: tiles.hazard,
  title: 'Hazard',
  hint: 'Every face but the 1 piles up in the tray and a 1 takes the lot · bank it or roll again · best play returns 96.9%',
  panel: 'games/hazard/panel.js',
  cls: 'hz',
  order: 110,
  group: 'Dice',

  table: {
    key: 'hz',
    id: 'hazard',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'play',
    noun: 'round',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    stakeOf: (st) => st.bet
  },

  css: `
  /* --- Hazard: one die, what it is worth, and the tray the pips pile up in --- */
  /* the top line is the whole question: this face, that much money, and the face that ends it */
  .hz-top{display:flex;align-items:center;gap:8px;}
  /* cream: 9.30:1 on the felt. The die's body follows this (CUC.die, webview.js) */
  .hz-die{flex:none;width:48px;height:48px;color:#fcecdc;}
  /* the 22px figure section 2 allows one of per screen, and this is this screen's: what banking
     right now pays. The slot keeps its height while it is empty, so the line does not jump */
  .hz-pay{flex:1 1 auto;min-width:0;min-height:26px;display:flex;align-items:center;
    font-size:22px;font-weight:700;line-height:26px;color:var(--felt-ink);
    font-variant-numeric:tabular-nums;overflow:hidden;}
  /* six digits or more. 22px tabular runs about 12.5px a digit and this slot is 64px wide at
     sidebar 250, so '10,000' is 69px and overflows; 16px takes it to 59. See drawPay in panel.js */
  .hz-pay.long{font-size:16px;}
  /* THE RED 1, AND IT IS SECTION 3'S NAMED EXCEPTION: a state colour used for something that is not
     a verdict. It is the only way to say "this face takes everything" BEFORE the first roll, and
     without it the rule is learned by losing. #f6836e is 4.29:1 on the felt and the ink pips are
     11.4:1 on it (games/dice-faces.js) */
  .hz-bust{flex:none;width:24px;height:24px;color:#f6836e;}
  /* THE TRAY IS THIS SCREEN. A pip in the tray is a pip on the die, so what is piling up is in the
     same unit as what is being rolled, and a 1 empties it in one beat. 56px tall and fixed: at
     sidebar 250 a row is 18 pips, so seven rows hold the host's own cap of 100 */
  .hz-tray{position:relative;height:56px;margin-top:10px;padding:3px;border-radius:6px;
    background:rgba(0,0,0,.3);box-shadow:inset 0 0 0 1px rgba(159,185,169,.7);
    display:flex;flex-wrap:wrap;align-content:flex-start;gap:2px;overflow:hidden;}
  .hz-pip{flex:none;width:6px;height:6px;border-radius:50%;background:#fcecdc;}
  /* a pip arriving, 120ms, which is a PRESS: a round is as many of them as the player dares
     (docs/game-panels.md, section 6, class 2). Pairs with HZ_T.face */
  .hz-pip.in{animation:hzIn .12s ease-out both;}
  @keyframes hzIn{from{opacity:0;transform:scale(.6);}to{opacity:1;transform:none;}}
  /* the tray going out, 220ms, and that beat is class 1: the round is over and this is the answer.
     The pips are still in the tray while it plays and are cleared when it ends, so what is seen is
     the pile leaving rather than a box that was already empty. Pairs with HZ_T.empty */
  .hz-tray.empty .hz-pip{animation:hzClear .22s ease-in both;}
  @keyframes hzClear{from{opacity:1;transform:none;}to{opacity:0;transform:scale(.4);}}
  .hz-die.in .dc{animation:hzFace .12s ease-out both;}
  @keyframes hzFace{from{opacity:0;transform:scale(.88);}to{opacity:1;transform:none;}}
  /* the folded table: a rate, a floor and a cap, all of them the host's own figures */
  .hz-pay-row{line-height:1.5;}
  @media (prefers-reduced-motion:reduce){
    .hz-pip.in,.hz-tray.empty .hz-pip,.hz-die.in .dc{animation:none;}
  }
`
};
