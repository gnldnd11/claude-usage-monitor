// Draw poker, jacks or better. A hand is one deck, and the deck is thrown away with the hand, so
// there is nothing to carry the way High-Low carries a shoe.
//
// A hand is two messages: the deal, and one draw carrying the five hold flags. The marks are the
// webview's own doing and never reach the host, so there is no round trip per card and no order to
// get wrong between the marks and the draw they belong to. What the host does check is that the
// array it is handed is really five flags (the engine's whyNot), because that array IS the move.
'use strict';
const engine = require('../../poker');

const MIN_BET = 10;

module.exports = {
  id: 'poker',
  key: 'pk',
  name: 'Draw Poker',
  icon: 'spade',
  thumb: 'game-poker.png',
  title: 'Draw Poker',
  hint: 'One deck, shuffled each hand · Hold what you want, draw once · A pair pays only from jacks up',
  panel: 'games/poker/panel.js',
  cls: 'pk',
  order: 40,   // the list's order and its heading, spaced by ten: see games/blackjack/meta.js
  group: 'Card tables',

  table: {
    key: 'pk',
    id: 'poker',
    engine: engine,
    minBet: MIN_BET,
    livePhase: 'draw',
    noun: 'hand',
    start: (a) => engine.newHand({ seed: a.seed, id: a.id, bet: a.bet }),
    // the bet from the deal to the draw, which is the whole hand
    stakeOf: (st) => st.bet,
    // the hold flags travel with the draw, so the message is rebuilt here rather than passed on:
    // nothing else off the wire belongs in an engine op
    opArg: (m) => ({ op: m.op, hold: m.hold })
  },

  css: `
  /* --- Draw Poker: the pay table is the first thing on the felt, the five cards under it.
     Cards overlap by 4px: the felt is 152px wide inside a 250px sidebar, so they cannot be spread --- */
  .pk-pays{display:grid;grid-template-columns:1fr 1fr;column-gap:10px;row-gap:0;}
  .pk-pay{display:flex;align-items:center;justify-content:space-between;gap:6px;height:13px;padding:0 4px;border-radius:4px;font-size:10px;line-height:13px;}
  .pk-pay span{color:var(--felt-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .pk-pay b{color:var(--felt-ink);font-weight:700;font-variant-numeric:tabular-nums;}
  .pk-pay.on{background:rgba(255,255,255,.12);}
  .pk-pay.on span{color:var(--felt-ink);}
  .pk-hand{position:relative;width:144px;height:60px;margin:10px auto 0;}
  .pk-slot{position:absolute;top:0;width:32px;height:60px;padding:0;border:0;background:transparent;cursor:pointer;line-height:0;}
  .pk-slot:nth-child(1){z-index:1}.pk-slot:nth-child(2){z-index:2}.pk-slot:nth-child(3){z-index:3}.pk-slot:nth-child(4){z-index:4}.pk-slot:nth-child(5){z-index:5}
  .pk-card{display:block;transition:transform .12s ease;}
  .pk-slot.held .pk-card{transform:translateY(-6px);}   /* a kept card is the one that does not move */
  .pk-hold{display:none;position:absolute;left:0;bottom:0;width:28px;padding:1px 0;border-radius:4px;background:rgba(0,0,0,.42);color:var(--felt-ink);font-size:7.5px;font-weight:800;letter-spacing:.5px;line-height:1.3;text-align:center;}
  .pk-slot.held .pk-hold{display:block;}
  .pk-slot:focus-visible{outline:2px solid var(--focus);outline-offset:1px;border-radius:4px;}
  .pk-slot:disabled{cursor:default;}   /* disabled through the deal's pacing and once the hand is over */
  /* these two lengths are PK_T.cardIn and PK_T.cardOut in panel.js: change them together */
  .pk-card.in{animation:pkIn .16s ease-out both;}
  .pk-card.out{animation:pkOut .12s ease-in both;}
  @keyframes pkIn{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:none;}}
  @keyframes pkOut{from{opacity:1;}to{opacity:0;transform:translateY(10px);}}
  @media (prefers-reduced-motion:reduce){.pk-card.in,.pk-card.out{animation:none;}.pk-card{transition:none;}}
`
};
