// Roll Under: one roll of 0.00 to 99.99 against a line the player draws. The host owns the roll and
// every price (dice.js); this file is the list row, the host wiring and the screen's own CSS.
//
// THE NAME IS `Roll Under` AND THE ID IS `dice`. The id, the key and the engine's filename are the
// family's, but this is the one game in it with no die on the screen: the roll is a percentile, so
// drawing pips for it would be a lie about what came up. Three crib-cream dice stand on the other
// three screens and a name of "Dice" on the one without any would be the odd one out telling the
// truth backwards.
//
// THE TARGET IS CHOSEN BEFORE THE ROUND EXISTS, so it travels on the deal: `startArg` reads it off
// the message and `badStart` rules on it before anything is staked. Without that second hook a
// target off the dial would reach newRound, which throws a RangeError, and the player would read a
// programmer's error instead of "the target runs from 1 to 96" (games/README.md, section 3).
//
// WHY THERE IS NO `livePhase`: a roll settles on the press, so this engine's OPS is empty, and
// games/tables.js's whyNotSpec() reads `!!livePhase === (OPS.length > 0)`.
'use strict';
const engine = require('../../dice');
const tiles = require('../tiles');

module.exports = {
  id: 'dice',
  key: 'dc',
  name: 'Roll Under',
  icon: 'lane',
  tile: tiles.dice,
  title: 'Roll Under',
  hint: 'One roll of 0.00 to 99.99 under the line you draw · a lower line pays more and comes up less often · every target returns the same 97%',
  panel: 'games/dice/panel.js',
  cls: 'dc',
  order: 90,
  group: 'Dice',

  table: {
    key: 'dc',
    id: 'dice',
    engine: engine,
    minBet: engine.MIN_BET,
    noun: 'roll',
    // read off the deal message, and only this field. The driver writes `seed`, `id` and `bet` over
    // whatever this returns, so nothing off the wire can reach them
    startArg: (m) => ({ target: m.target }),
    badStart: (a) => engine.badTarget(a.target),
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet, target: a.target }),
    // A roll settles on the press, so a round is never live and nothing is ever held back from the
    // other games. The driver only asks this of a live round, so it is never actually reached
    stakeOf: () => 0
  },

  css: `
  /* --- Roll Under: a lane, a handle on it, and a shelf the roll lands on --- */
  /* the target, on a band of its own above the lane, travelling with the handle. 12.5px, which is
     the panel spec's title size, because this is the one figure the player is setting */
  .dc-head{position:relative;height:16px;margin-bottom:2px;}
  .dc-target{position:absolute;top:0;width:40px;height:16px;line-height:16px;text-align:center;
    font-size:12.5px;font-weight:700;color:var(--felt-ink);font-variant-numeric:tabular-nums;}
  /* THE LANE IS TWO ZONES, FILLED AND EMPTY, and not two brightnesses. --felt-dim at 1.0 against
     bare felt is 5.11:1; dim 1.0 against dim .7 is 1.53:1, which is where the tower failed. So the
     side that wins is MASS and the side that loses is the table itself */
  .dc-lane{position:relative;height:36px;border-radius:8px;
    box-shadow:inset 0 0 0 1px rgba(159,185,169,.7);}
  .dc-fill{position:absolute;left:0;top:0;bottom:0;border-radius:8px 0 0 8px;
    background:var(--felt-dim);}
  /* THE LANE IS THE CONTROL. A range input brings the cursor, the hover, the focus ring, the arrow
     keys, Home and End and aria-valuenow with it, and all of that would otherwise be hand-built on
     a div (docs/game-panels.md, 5-12) */
  .dc-range{position:absolute;left:0;top:0;width:100%;height:36px;margin:0;padding:0;
    -webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;}
  .dc-range::-webkit-slider-runnable-track{height:36px;background:transparent;border:0;}
  /* 22x36, ember with an ink hairline INSIDE it, and the pair is measured: ember on the filled side
     is 1.22:1, so on that side it is the ink edge (8.96:1 on dim) that shows the handle, and on the
     bare side it is the ember mass (4.18:1). One without the other loses half the handle */
  .dc-range::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:36px;border-radius:4px;
    background:#e8895a;box-shadow:inset 0 0 0 1px #0b1310;cursor:pointer;border:0;}
  .dc-range::-moz-range-thumb{width:22px;height:36px;border-radius:4px;background:#e8895a;
    box-shadow:inset 0 0 0 1px #0b1310;cursor:pointer;border:0;}
  .dc-range:hover::-webkit-slider-thumb{filter:brightness(1.1);}
  .dc-range:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:8px;}
  .dc-range:disabled{cursor:default;}
  /* THE SHELF IS LEFT EMPTY ON THE BET SCREEN. 54px of nothing is the plaque's own place, and the
     one thing that may not go in it is a figure: the crash put its multiple where its result would
     land and the same number then meant two things in one place (docs/game-panels.md, 5-12) */
  .dc-shelf{position:relative;height:54px;}
  /* where the roll really fell, which is not always where the plaque could fit */
  .dc-stem{position:absolute;top:0;width:2px;height:6px;background:#e8895a;}
  /* the plaque: cream at 9.30:1 on the felt with ink at 16.30:1 on it, and 22px, which is the one
     hero figure section 2 allows a screen */
  .dc-plaque{position:absolute;top:6px;width:72px;height:48px;border-radius:6px;
    background:#fcecdc;box-shadow:inset 0 0 0 1px #0b1310;
    display:flex;align-items:center;justify-content:center;
    font-size:22px;font-weight:700;color:#0b1310;font-variant-numeric:tabular-nums;}
  /* it comes down onto the shelf in 220ms (DC_T.drop), which is class 1: nothing is narrowed down
     on the way, the number is simply there */
  .dc-plaque.in{animation:dcDrop .22s cubic-bezier(.3,.9,.4,1) both;}
  @keyframes dcDrop{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:none;}}
  .dc-pay-row{line-height:1.5;}
  @media (prefers-reduced-motion:reduce){.dc-plaque.in{animation:none;}}
`
};
