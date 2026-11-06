// High-Low: guess whether the next card beats this one. One shoe is carried from run to run, so
// the payouts are priced off what has actually come out; the engine reshuffles it at a new run once
// it gets short. The shoe is the driver's `carry`, which means it lives in memory for the same
// reason the rounds do: a reload starts a clean shoe and nobody is owed anything.
'use strict';
const engine = require('../../highlow');

const MIN_BET = 10;

module.exports = {
  id: 'hilo',
  key: 'hl',
  name: 'High-Low',
  icon: 'updown',
  thumb: 'game-hilo.png',
  title: 'High-Low',
  hint: 'Payouts follow the cards left in the shoe · Aces are high · A tie carries the pot',
  panel: 'games/highlow/panel.js',
  cls: 'hl',
  order: 30,   // the list's order and its heading, spaced by ten: see games/blackjack/meta.js
  group: 'Card tables',

  table: {
    key: 'hl',
    id: 'highlow',
    engine: engine,
    minBet: MIN_BET,
    livePhase: 'play',
    noun: 'run',
    start: (a, shoe) => engine.newRun({ seed: a.seed, id: a.id, bet: a.bet, deck: shoe }),
    // the opening bet, because the pot the run builds is the house's money until the player
    // cashes out
    stakeOf: (st) => st.bet,
    carryOf: (st) => engine.remaining(st)
  },

  css: `
  /* --- High-Low: one card is the hero. Felt, crab, cards and chips are the casino's --- */
  .inner.hl{padding:13px 13px 14px;}
  .hl-stage{display:flex;align-items:flex-end;gap:8px;}
  .hl-stage .bj-crab{position:relative;left:auto;bottom:auto;width:52px;height:56px;flex:none;}
  .hl-cards{position:relative;flex:none;width:82px;height:88px;}
  .hl-card,.hl-prev{position:absolute;bottom:0;line-height:0;}
  .hl-card{left:18px;width:64px;height:88px;}
  .hl-card svg{display:block;width:64px;height:88px;}     /* 16x22 cells at 4px, the grid stays integer */
  .hl-prev{left:0;width:32px;height:44px;opacity:.55;}
  .hl-prev svg{display:block;width:32px;height:44px;}
  .hl-card.in{animation:hlIn .14s ease-out both;}
  .hl-prev.drop{animation:hlDrop .14s ease-out both;}
  @keyframes hlIn{from{opacity:0;transform:translateX(22px);}to{opacity:1;transform:none;}}
  @keyframes hlDrop{from{opacity:.9;transform:translate(26px,-18px) scale(1.6);}to{opacity:.55;transform:none;}}
  .hl-guess{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;height:44px;}
  .hl-guess span{font-size:12px;font-weight:600;color:var(--text);}
  .hl-guess b{font-size:13px;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;}
  .hl-cash{flex:1 1 100%;height:34px;}      /* its own row: never under the thumb that is tapping Higher */
  .hl-cash b{font-variant-numeric:tabular-nums;}
  @media (prefers-reduced-motion:reduce){.hl-card.in,.hl-prev.drop{animation:none;}}
`
};
