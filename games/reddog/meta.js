// Red Dog (acey-deucey): two cards come up, and the question is whether a third lands between
// them. The gap IS the game, so the screen's one big block is the two cards and the space they
// leave, and every figure in that space is one the host sent (reddog.js owns the table).
//
// Nothing carries from round to round. Blackjack and High-Low deal on through a shoe, and High-Low
// even prices its calls off what is left of one, but here the whole game is one posted number and
// that number is only exact while the shoe is full: the engine shuffles a fresh six decks every
// round and says so at length in its own header. So there is no `carryOf` to write, and that is a
// rule rather than an omission.
'use strict';
const engine = require('../../reddog');
const tiles = require('../tiles');

module.exports = {
  id: 'reddog',
  key: 'rd',
  name: 'Red Dog',
  // `cards` is blackjack's glyph too. The panel heading is the only place it shows (the list row
  // covers it with the drawn tile), and adding a key of its own means editing icons.js, which is
  // not this game's to touch
  icon: 'spread',
  tile: tiles.reddog,
  title: 'Red Dog',
  // the rules in one line, which is the one place they are spelled out: the felt shows the hand,
  // not the rulebook (docs/game-panels.md, section 5). The odds are read off the engine so a
  // retune there moves this line with it
  hint: 'Two cards, then a third: inside the gap pays that spread’s odds · a pair pays '
    + engine.PAIR_ODDS + ' to 1 on a third of its rank · consecutive cards push',
  panel: 'games/reddog/panel.js',
  cls: 'rd',
  order: 20,   // the list's order and its heading, spaced by ten: see games/blackjack/meta.js
  group: 'Card tables',

  table: {
    key: 'rd',
    id: 'reddog',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'play',
    noun: 'hand',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    // the WHOLE wager, which the raise has already doubled if it happened. The engine owns that
    // rule and exports it, so it is asked rather than restated here
    stakeOf: (st) => engine.stake(st)
  },

  css: `
  /* --- Red Dog: two hero cards and the gap between them. Felt, crab, cards and chips are the
     casino's; what is this game's own is the SPACE, so every rule below is about keeping it --- */
  .inner.rd{padding:13px 13px 14px;}
  /* The dealer stands UNDER the hand rather than beside it. Two hero cards are 128px of the 152px
     the felt has at a 250px sidebar (docs/game-panels.md, section 1), so a 52px crab in the same
     row would leave the gap nothing at all. This strip at the foot of the stage is what it stands
     in, and the crab keeps the absolute corner games/casino.js already gives it */
  .rd-stage{position:relative;padding-bottom:56px;}
  .rd-stage .bj-crab{width:52px;height:56px;}
  /* The gap gets every pixel there is: -6px of the felt's own 10px padding on each side turns the
     24px left over at a 250px sidebar into 36px, which is what lets the odds chip sit BETWEEN the
     cards there instead of across them. At the 280px design width the gap is 66px and the chip has
     room to spare */
  .rd-cards{position:relative;height:88px;margin:0 -6px;}
  .rd-card{position:absolute;top:0;line-height:0;}
  .rd-card svg{display:block;width:64px;height:88px;}   /* 16x22 cells at 4px: the grid stays integer */
  .rd-card[hidden]{display:none;}
  .rd-a{left:0;}
  .rd-b{right:0;}
  /* the third card falls into the middle of whatever gap the sidebar's width left, so the two it
     lands between are the only things that fix where it goes */
  .rd-c{left:50%;margin-left:-32px;z-index:2;}
  .rd-gap{position:absolute;left:64px;right:64px;top:0;bottom:0;z-index:1;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;}
  .rd-gap[hidden]{display:none;}
  .rd-spread{font-size:22px;font-weight:800;line-height:1;color:var(--felt-ink);font-variant-numeric:tabular-nums;}
  /* the two part before the third drops in, which is the only time the gap ever moves */
  .rd-cards.part .rd-a{transform:translateX(-4px);}
  .rd-cards.part .rd-b{transform:translateX(4px);}
  .rd-card.in{animation:rdIn .16s ease-out both;}   /* RD_T.card in panel.js: retime the two together */
  .rd-amt{font-weight:800;font-variant-numeric:tabular-nums;}
  /* the folded table: a row a spread, with the row in hand lit the way poker lights its own */
  .rd-pay{display:flex;align-items:baseline;gap:6px;}
  .rd-pay+.rd-pay{margin-top:2px;}
  .rd-pay span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .rd-pay b{flex:none;color:var(--text);}
  .rd-pay i{flex:none;font-style:normal;opacity:.7;}
  .rd-pay.on b{color:#e8895a;}
  @keyframes rdIn{from{opacity:0;transform:translateY(-14px);}to{opacity:1;transform:none;}}
  @media (prefers-reduced-motion:reduce){.rd-card.in{animation:none;}}
`
};
