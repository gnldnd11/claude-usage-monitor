// The tower: ten floors, one door a floor, and the only decision is which floor to stop on. The
// host draws the traps and prices every rung; the screen opens the door it is told to.
//
// Both hooks are here, and that is the easy one to miss: `startArg` carries the difficulty the DEAL
// chose and `opArg` carries the door a climb names. The default opArg hands the engine the bare
// string 'climb', which drops the door with it, and the refusal that comes back is "pick a door on
// this floor" (games/README.md, section 3).
'use strict';
const engine = require('../../tower');
const tiles = require('../tiles');

const IDS = engine.DIFFS.map((d) => d.id);

module.exports = {
  id: 'tower',
  key: 'tw',
  name: 'Tower',
  // The only row that carries a second line, together with the minefield. Twelve rows reading
  // "Min bet 10" is wallpaper; the same line on two rows out of fourteen reads "this one is dear"
  sub: 'Min bet ' + engine.MIN_BET,
  icon: 'tower',
  tile: tiles.tower,
  title: 'Tower',
  hint: 'One door a floor, ten floors up, cash out whenever · 96 to 97% back · Min bet ' + engine.MIN_BET,
  panel: 'games/tower/panel.js',
  cls: 'tw',
  order: 100,
  group: 'Boards',

  table: {
    key: 'tw',
    id: 'tower',
    engine: engine,
    minBet: engine.MIN_BET,
    livePhase: 'play',
    noun: 'round',
    // read off the deal message, and only this one field: the driver writes seed, id and bet over
    // whatever this returns, so nothing off the wire can reach them
    startArg: (m) => ({ diff: m.diff }),
    badStart: (a) => (engine.diffOf(a.diff) ? null : 'pick one of ' + IDS.join(', ')),
    start: (a) => engine.newRound({ seed: a.seed, id: a.id, bet: a.bet, diff: a.diff }),
    stakeOf: (st) => st.bet,
    // the door travels WITH the move, so it rides on opArg and not on the deal
    opArg: (m) => ({ op: m.op, cell: m.cell })
  },

  css: `
  /* --- the tower: ten floors DRAWN on the felt, floor ten at the top. What makes this game
     different from the minefield is that the climb stays on screen behind you, so the whole
     building is one block and the price of each floor is the column beside it: that column IS the
     ladder, which is why no ladder table is laid out anywhere (docs/game-panels.md, 5-2) --- */
  .inner.tw{padding:13px 13px 14px;}
  .tw-tower{position:relative;display:flex;flex-direction:column;gap:2px;}
  .tw-tower .gm-rule{position:absolute;pointer-events:none;}
  /* the floor line sits on the row's own top edge, and the one standing column separates the
     building from its prices */
  .tw-rh{left:0;right:0;top:-1px;height:1px;}
  .tw-rv{top:0;bottom:0;right:42px;width:1px;}
  .tw-row{position:relative;display:flex;align-items:stretch;gap:6px;height:14px;}
  /* the floor being climbed is the only one at full height. 28 + 9x14 + 9x2 is 172px, which fits
     the felt at every width this panel is drawn at */
  .tw-row.tw-now{height:28px;}
  /* .3 is for the floors that are not the player's THIS round. Before a deal there is no round and
     every floor is on offer, so the bet screen's rows are tw-offer and carry no dimming: at .3 its
     doors would be 1.5:1 and the ladder beside them unreadable, which is the hole this was drawn to
     fill. tw-offer needs no rule of its own; it is the row with nothing taken off it
     (games/tower/panel.js, floor()) */
  .tw-row.tw-ahead{opacity:.3;}
  .tw-doors{flex:1 1 auto;display:flex;gap:3px;min-width:0;}
  /* A DOOR IS A DOOR BEFORE IT OPENS, so it is drawn as a frame rather than as a hole in the felt.
     The three fills used to be rgba(0,0,0,.22) and .3, which measured 1.07:1 and 1.32:1 against the
     felt with 1.24:1 between them: one colour, three meanings, and a bet screen that was a plain
     green rectangle. --felt-dim is 5.11:1 at 1.0 and 3.33:1 at .7, so the floor being climbed, the
     floors already behind and the floors not reached read as three things
     (docs/game-panels.md, section 2) */
  .tw-d{flex:1 1 0;min-width:0;padding:0;border:0;border-radius:4px;background:transparent;
    box-shadow:inset 0 0 0 1px var(--felt-dim);opacity:.7;font:inherit;cursor:default;}
  .tw-row.tw-now .tw-d{opacity:1;}
  .tw-row.tw-now .tw-d:not(:disabled){cursor:pointer;}
  .tw-row.tw-now .tw-d:hover:not(:disabled){background:rgba(232,137,90,.26);
    box-shadow:inset 0 0 0 1px #e8895a;}
  .tw-d:focus-visible{outline:2px solid #e8895a;outline-offset:1px;}
  /* the door that was taken, on a floor already cleared. ember: the one accent this casino has.
     The three that carry a fill drop the frame, or the fill would be ringed by its own outline */
  .tw-d.took{background:#e8895a;box-shadow:none;opacity:1;}
  /* a trap, and the trap that ended it. Only shown once the round is over, every floor at once,
     the ones never reached included: "it was that one" is what this game is for */
  .tw-d.trap{background:rgba(0,0,0,.42);box-shadow:inset 0 0 0 1px var(--felt-dim);opacity:1;}
  .tw-d.sprung{background:#f6836e;box-shadow:none;opacity:1;}
  /* paired with TW_T.open (200) and TW_T.fall (180) */
  .tw-d.swing{animation:twSwing .2s ease-out both;}
  .tw-d.spring{animation:twSpring .18s ease-out both;}
  @keyframes twSwing{from{transform:scaleX(.2);opacity:.3;}to{transform:none;opacity:1;}}
  @keyframes twSpring{0%{transform:scaleY(.3);}60%{transform:scaleY(1.25);}100%{transform:none;}}
  @media (prefers-reduced-motion:reduce){.tw-d.swing,.tw-d.spring{animation:none;}}
  /* the price column. 10.5px rather than the 10px the spec drafted: section 2's six sizes are the
     rule the checklist is written against. 39px is what the widest rung on the table needs at that
     size (x57277: five digits at about 6.3px plus the sign), not the 12px the spec drafted */
  .tw-m{flex:none;width:39px;display:flex;align-items:center;justify-content:flex-end;
    font-size:10.5px;font-weight:700;color:var(--felt-dim);font-variant-numeric:tabular-nums;}
  .tw-row.tw-past .tw-m,.tw-row.tw-now .tw-m{color:var(--felt-ink);}
  /* the cash-out figure and the next floor wrap at 152px rather than scrolling sideways. That is
     .hl-line's own rule now (games/casino.js), because the minefield needed it for the same reason */
  /* its own line inside the control row: the difficulties plus the stakes plus Deal is four
     controls, and three on one line already folds at 280px */
  .tw-pick{flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:6px;}
  .tw-lbl{flex:none;font-size:10.5px;font-weight:700;color:var(--muted);}
  .tw-pr{display:flex;gap:6px;}
  .tw-pr span{flex:1 1 0;text-align:right;}
  .tw-pr span:first-child{flex:none;width:16px;text-align:left;}
  .tw-pr b{font-weight:700;color:var(--text);}
`
};
