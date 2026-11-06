// Keno: mark numbers on a board of 40, ten are drawn, and the table pays by how many were caught.
//
// The marks are the WEBVIEW's until the draw carries them over, so the whole round is one message:
// `opArg` hands the engine the array that rode in with it, and the engine's own badPicks() is the
// check (games/README.md, section 3). There is nothing for `startArg` to carry, because nothing is
// chosen before the round exists: the deal is a bet and the ticket is filled after it.
'use strict';
const engine = require('../../keno');
const tiles = require('../tiles');

module.exports = {
  id: 'keno',
  key: 'kn',
  name: 'Keno',
  // no `sub`: the minimum is the house's usual 10, and twelve rows saying so is wallpaper
  icon: 'grid',
  tile: tiles.keno,
  title: 'Keno',
  hint: 'Mark ' + engine.MIN_PICK + ' to ' + engine.MAX_PICK + ' numbers, ' + engine.DRAWN + ' of '
    + engine.POOL + ' are drawn · How many you catch chooses the table · 96 to 97% back',
  panel: 'games/keno/panel.js',
  cls: 'kn',
  order: 110,
  group: 'Boards',

  table: {
    key: 'kn',
    id: 'keno',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'draw',
    noun: 'round',
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet }),
    stakeOf: (st) => st.bet,
    // the ticket travels WITH the draw, which is the one move this game has
    opArg: (m) => ({ op: m.op, picks: m.picks })
  },

  css: `
  /* --- keno: a 40-number board DRAWN on the felt. 8 by 5 and not 5 by 8: five columns would make
     the cells 34px but the board 293px tall, which is off the felt. So the cells are 21px at the
     182px design width, under the 44px touch figure, and that only holds because the board can be
     filled from the keyboard and by Quick pick (docs/game-panels.md, 5-8) --- */
  .inner.kn{padding:13px 13px 14px;}
  .kn-board{position:relative;display:grid;grid-template-columns:repeat(8,1fr);gap:2px;}
  .kn-board .gm-rule{position:absolute;pointer-events:none;}
  .kn-rv{top:0;bottom:0;width:1px;}
  .kn-rh{left:0;right:0;height:1px;}
  .kn-n{display:flex;align-items:center;justify-content:center;aspect-ratio:1;padding:0;border:0;
    border-radius:4px;background:transparent;font-family:inherit;font-size:10.5px;font-weight:700;
    color:var(--felt-dim);font-variant-numeric:tabular-nums;cursor:pointer;}
  .kn-n:disabled{cursor:default;}
  .kn-n:hover:not(:disabled){background:rgba(232,137,90,.2);color:var(--felt-ink);}
  .kn-n:focus-visible{outline:2px solid #e8895a;outline-offset:-1px;}
  /* a number the player marked: ember, the one accent this casino has */
  .kn-n.on{background:#e8895a;color:#1d1d1f;}
  /* one of yours that came out. Painted the moment that ball lands, not after the last of them:
     the catch piling up IS the draw (games/keno/panel.js, board()) */
  .kn-n.hit{background:rgba(126,230,164,.9);color:#10281c;}
  /* one that came out and was NOT marked: a faint ring and nothing else. This ring is the whole of
     "that was close", and a draw without it has no feeling at all */
  .kn-n.miss{box-shadow:inset 0 0 0 1px var(--felt-dim);color:var(--felt-dim);}
  /* and the one that just came out. Paired with KN_T.ball (90): the pop is shorter than the step */
  .kn-n.ball{box-shadow:inset 0 0 0 1px #e8895a;animation:knBall .06s ease-out both;}
  @keyframes knBall{from{transform:scale(.6);}to{transform:none;}}
  @media (prefers-reduced-motion:reduce){.kn-n.ball{animation:none;}}
  /* the ticket's own two actions, on the felt rather than in the control row: the control row is
     Clear and Draw and a third .bj-btn folds it onto two lines at 280px */
  .kn-acts{display:flex;justify-content:flex-start;gap:10px;margin-top:6px;}
  /* how many to mark, 6px under the board it is about rather than 71px under it. margin-right:auto
     keeps Quick pick at the right-hand end whether the line is showing or not */
  .kn-hint{margin-right:auto;font-size:11px;font-weight:700;color:var(--felt-dim);}
  /* the three properties and not the shorthand, for the reason in games/casino.js's .bj-why */
  .kn-act{padding:0;border:0;background:transparent;color:var(--felt-dim);
    font-family:inherit;font-size:10.5px;font-weight:700;
    cursor:pointer;text-decoration:underline;text-underline-offset:2px;}
  .kn-act:hover:not(:disabled){color:var(--felt-ink);}
  .kn-act:disabled{opacity:.4;cursor:default;}
  .kn-act:focus-visible{outline:2px solid #e8895a;outline-offset:2px;}
  /* the two rows of the table that matter right now, under the felt. The other sixty rows are
     behind the How it pays toggle */
  .kn-near{margin-top:8px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;}
  .kn-near div{display:flex;gap:6px;}
  .kn-near .kn-up{opacity:.55;}
  .kn-pr{display:flex;gap:6px;}
  .kn-pr b{flex:none;width:48px;font-weight:700;color:var(--text);}
  .kn-pr span{flex:1 1 auto;min-width:0;}
`
};
