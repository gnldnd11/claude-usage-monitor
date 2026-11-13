// Blackjack: six decks, dealer stands on soft 17, blackjack pays 3:2.
// The engine stays at the repository root (blackjack.js) because the tests address it there.
'use strict';
const engine = require('../../blackjack');

const MIN_BET = 10;

module.exports = {
  id: 'blackjack',          // the list row, the stored view, the webview panel
  key: 'bj',                // the message type on the wire, and the CSS/element prefix
  name: 'Blackjack',
  icon: 'cards',            // a key in icons.js
  thumb: 'game-blackjack.png',
  title: 'Blackjack',
  hint: '6 decks · Dealer stands on soft 17 · Blackjack pays 3:2',
  panel: 'games/blackjack/panel.js',
  cls: 'bj',                // goes on the panel element next to .inner
  // Where this game sits on the list. The register sorts on it (games/registry.js) and there is no
  // array anywhere that an order could be read off instead, which is what lets four games be added
  // at once without four writers editing one line.
  // Spaced by ten on purpose: a game that belongs between two of these takes 15 and nothing is
  // renumbered. A tie, or no order at all, falls back to the id alphabetically.
  //
  // There is no `group` any more: the list is flat (docs/game-panels.md, section 7-2), so `order`
  // is the whole of where a row goes and nothing has to keep a family contiguous
  order: 10,

  table: {
    key: 'bj',
    id: 'blackjack',
    engine: engine,
    minBet: MIN_BET,
    livePhase: 'player',
    noun: 'round',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    // a double or a split grows the stake, so it is the engine that knows what is riding
    stakeOf: (st) => engine.stake(st)
  },

  css: `
  /* --- blackjack: the dealer, the hands and the pixel cards --- */
  .inner.bj{padding:13px 13px 14px;}
  .bj-row{display:grid;grid-template-columns:64px minmax(0,1fr);column-gap:8px;}
  .bj-dealer{align-items:end;}
  .bj-p{align-items:start;}
  .bj-p + .bj-p{margin-top:10px;}
  .bj-p.dim{opacity:.45;transition:opacity .2s ease;}
  .bj-who{position:relative;height:48px;}
  .bj-p .bj-who{height:auto;min-width:0;display:flex;flex-direction:column;align-items:center;gap:3px;}
  .bj-hand{min-width:0;}
  .bj-fan{position:relative;height:44px;}
  .bj-line{display:flex;align-items:center;gap:6px;min-height:20px;}
  .bj-dealer .bj-line{margin-bottom:4px;}
  .bj-p .bj-line{margin-top:4px;}
  .bj-tot{font-size:16px;font-weight:700;line-height:20px;color:var(--text);font-variant-numeric:tabular-nums;}
  .bj-tot .soft{color:var(--muted);font-weight:600;}
  .bj-rule{height:1px;background:var(--iborder);margin:12px 0;}
  .bj-net{margin:8px 0 0 72px;font-size:12px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;} /* column 72 + gap 8 */
  #bjErr{margin:12px 0 0;}
  .bj-hero{flex:none;} /* the player, sitting: a still frame of an agent sprite */
  .bj-stake{display:flex;flex-direction:row;align-items:center;gap:4px;white-space:nowrap;font-size:11px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;}
  .bj-stake.preview{opacity:.5;}
  .bj-stake .cc-r{opacity:1;}
  .bj-card{position:absolute;top:0;width:32px;height:44px;line-height:0;}
  .bj-card svg{display:block;width:32px;height:44px;}
  .bj-card.pending{visibility:hidden;}
  /* these two lengths are BJ_T.cardIn and BJ_T.flip in panel.js: change them together */
  .bj-card.in{animation:bjIn .2s ease-out both;}
  .bj-card.flip{animation:bjFlip .3s ease-in-out;}
  @keyframes bjIn{from{opacity:0;transform:translate(10px,-8px);}to{opacity:1;transform:none;}}
  @keyframes bjFlip{0%,100%{transform:scaleX(1);}50%{transform:scaleX(.06);}}
  .bj-felt .bj-tot{color:var(--felt-ink);}
  .bj-felt .bj-tot .soft{color:var(--felt-dim);}
  .bj-felt .bj-stake{color:var(--felt-ink);}
  .bj-felt .bj-net{color:var(--felt-ink);}
  .bj-felt .bj-rule{background:rgba(255,255,255,.10);}
  @media (prefers-reduced-motion:reduce){.bj-card.in,.bj-card.flip{animation:none;}.bj-p.dim{transition:none;}}
`
};
