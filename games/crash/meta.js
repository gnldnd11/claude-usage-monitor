// Crash: a multiplier climbs from 1.00x and bursts somewhere. The target is named BEFORE the
// launch, the host settles the whole round in one move and the screen only replays it. crash.js's
// header says at length why there is no clock in this game, and the screen keeps that promise by
// having no mid-round control at all: a cash-out button here would be the screen lying about what
// the game is.
//
// The target travels twice, which is the engine's own design: `startArg` opens the round on the
// target the player had already set ("the screen hands back the last one used") and `opArg` moves
// it with 'aim' before the launch. Re-aiming is free because it changes nothing already decided.
'use strict';
const engine = require('../../crash');
const tiles = require('../tiles');

// The engine exports no check of its own for the dial, so the host rules on the range with the
// engine's own constants (games/README.md, section 3). A deal that names no target is left to
// newRound's default rather than refused
function badTicks(t) {
  if (t == null) return null;
  if (Number.isInteger(t) && t >= engine.MIN_TICKS && t <= engine.MAX_TICKS) return null;
  return 'the target must be between ' + engine.MIN_TICKS + ' and ' + engine.MAX_TICKS + ' tenths';
}

module.exports = {
  id: 'crash',
  key: 'cr',
  name: 'Crash',
  // no `sub`: the minimum is the house's usual 10, and twelve rows saying so is wallpaper
  icon: 'rocket',
  tile: tiles.crash,
  title: 'Crash',
  hint: 'Name the multiple to get out at before the launch · Reaching it is 0.97 / x, so no target '
    + 'is a better bet than another · 96 to 97% back',
  panel: 'games/crash/panel.js',
  cls: 'cr',
  order: 120,
  group: 'Boards',

  table: {
    key: 'cr',
    id: 'crash',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'arm',
    noun: 'round',
    // read off the deal message, and only this one field: the driver writes seed, id and bet over
    // whatever this returns, so nothing off the wire can reach them
    startArg: (m) => ({ ticks: m.ticks }),
    badStart: (a) => badTicks(a.ticks),
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet, ticks: a.ticks }),
    stakeOf: (st) => st.bet,
    // the target travels WITH the aim as well, so moving the dial is a move and not a new deal
    opArg: (m) => ({ op: m.op, ticks: m.ticks })
  },

  css: `
  /* --- crash: ONE number. The target before the launch and the climb during the replay are the
     same figure in the same place, because two numbers is nobody knowing which to watch.
     34px is the one size above section 2's six, and it is written into the spec as the exception
     (docs/game-panels.md, 5-3) --- */
  .inner.cr{padding:13px 13px 14px;}
  /* the one line this screen spends on a sentence, and it is the price of putting two meanings in
     one place: "Cash out at" before the launch, "Burst at" after it. 11px is section 2's size for a
     line of explanation, and the negative margin keeps it reading as the number's label rather than
     as a line of its own (docs/game-panels.md, 5-3) */
  .cr-cap{margin-bottom:-2px;text-align:center;font-size:11px;font-weight:700;color:var(--felt-dim);}
  .cr-num{text-align:center;font-size:34px;font-weight:800;line-height:1.1;color:var(--felt-ink);
    font-variant-numeric:tabular-nums;}
  /* without tabular figures the number shakes as it climbs, which is the whole reason it is here */
  .cr-num.won{color:#7ee6a4;}
  .cr-num.lost{color:#f6836e;}
  /* paired with CR_T.burst (220) */
  .cr-num.burst{animation:crBurst .22s ease-out both;}
  @keyframes crBurst{0%{transform:scale(1.14);}100%{transform:none;}}
  /* the dial, drawn on the felt: where the climb has reached, and a notch where the order sits.
     Linear in tenths, the same as the slider, so the notch lines up with the thumb */
  .cr-bar{position:relative;height:8px;margin-top:10px;border-radius:4px;background:rgba(0,0,0,.34);
    overflow:hidden;}
  .cr-fill{position:absolute;left:0;top:0;bottom:0;width:0;background:#e8895a;}
  .cr-mark{position:absolute;top:0;bottom:0;width:2px;background:var(--felt-ink);opacity:.75;}
  .cr-pays{margin-top:8px;text-align:center;font-size:11px;color:var(--felt-dim);
    font-variant-numeric:tabular-nums;min-height:14px;}
  /* while the dial is being dragged the price is the host's to say, so the old one goes quiet
     rather than being replaced by one worked out here */
  .cr-pays.stale{opacity:.4;}
  .cr .hl-line{justify-content:center;}
  /* the dial itself: one slider, because 1.1x to 50.0x in tenths is 490 targets and there is no
     width for 490 buttons. It sits directly above the control row */
  .cr-dial{margin-top:12px;display:flex;}
  .cr-slide{flex:1 1 auto;width:100%;min-width:0;height:20px;margin:0;accent-color:#e8895a;cursor:pointer;}
  .cr-slide:disabled{opacity:.4;cursor:default;}
  .cr-slide:focus-visible{outline:2px solid #e8895a;outline-offset:2px;}
  @media (prefers-reduced-motion:reduce){.cr-num.burst{animation:none;}}
`
};
