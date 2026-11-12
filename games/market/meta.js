// The crab's coin market: four coins, bought with credits and sold for credits, and the only screen
// in the casino whose numbers move while nobody is looking. That is the whole point of it, and it is
// also the only reason a panel that was closed is worth opening again.
//
// Like the forge, this game is NOT on the round driver (games/tables.js) and keeps its own handler,
// for the same reason: a position is the player's property rather than a round, so it is stored in
// the credit ledger, every window shares one wallet, and a message that acted on the copy in memory
// would be a trade the merge then throws away. The rules that come with that are games/README.md
// section 3, and the two places this differs from the forge are worth naming here:
//
//  - THE MONEY IS IN THE RECORD, so the bank's own net on a trade is 0. The forge banks its fee per
//    window because a window that paid for an attempt paid for it, whichever copy the merge keeps.
//    Both halves of a trade travel inside the wallet instead (`staked` and `earned`, market.js
//    section 7): a dropped sale banked per window pays twice, and a dropped buy would charge a
//    stake that can be the whole purse and hand back nothing.
//  - THE HOST OWNS THE CLOCK. priceAt(code, now + 60000) is next minute's price, so a screen that
//    could name the time of a trade could buy a result (market.js section 5). The time is taken
//    here, once per message, from Date.now(), and `nowMs` is never read off the wire. The engine
//    refuses a time that is not the clock's anyway (its badTime); this is the side of that rule
//    that makes the refusal unreachable rather than merely correct.
'use strict';
const engine = require('../../market');
const tiles = require('../tiles');

// The round trip, as a percent and as what it leaves. Read off the engine rather than written down:
// the fee has moved once already (3% to 0.5%), and a hint that disagrees with the Buy button is
// worse than no hint at all. The same two figures reach the screen as `feeBp` on the view
const FEE_PCT = ((engine.FEE_DEN - engine.FEE_NUM) * 100) / engine.FEE_DEN;
const KEEP_PCT = (engine.FEE_NUM * 100) / engine.FEE_DEN;

// The candle shapes, one per chip on the screen's period row (games/market/panel.js's MK_SPANS).
// THE PANEL SENDS THE KEY AND NOTHING ELSE, and this table is the only place a key becomes candles.
// That is not tidiness: engine.candles() takes a count up to 240, so a {stepMs, count} off the wire
// would let one `open` ask for four coins x 240 candles x WICK_SAMPLES prices, which is 7,680 walks
// of the lattice for one keypress. Chosen here, that input does not exist.
//
// Every row is stepMs x count = the window its chip claims (3h, 24h, 7d, 30d) and every step is a
// unit a person can name: five minutes, an hour, six hours, a day. Holding the count at thirty-six
// instead would make 1W a 280-minute candle and 1M a 20-hour one, which is a chart nobody can read
// an axis off. The counts are what move instead, 24 to 36 (docs/game-panels.md, section 5-10)
const SHAPES = {
  '3H': { stepMs: 5 * engine.MS_PER_MIN, count: 36 },
  '1D': { stepMs: 60 * engine.MS_PER_MIN, count: 24 },
  '1W': { stepMs: 6 * 60 * engine.MS_PER_MIN, count: 28 },
  '1M': { stepMs: 24 * 60 * engine.MS_PER_MIN, count: 30 }
};
// A day. The coin introduces itself in days (`moves about 4% a day`, and `grade` is that axis), and
// three hours is too quiet to tell the four coins apart: over 3H the median absolute move is 0.4%
// to 1.5% on all four of them, and over 1D it is 0.8% to 2.8%
const SPAN_DEF = '1D';

module.exports = {
  id: 'market',
  key: 'mk',
  name: 'Market',
  icon: 'bars',                 // a chart glyph, which is what this screen is. icons.js's own key
  tile: tiles.market,           // games/tiles.js: the only chart in the casino, and no felt furniture
  title: 'Coin Market',
  hint: 'Four coins on one price walk · one position a coin · ' + FEE_PCT
    + '% on the round trip · no rule for selling beats ' + KEEP_PCT + '%',
  panel: 'games/market/panel.js',
  cls: 'mk',
  order: 140,                   // the list's order and its heading: see games/blackjack/meta.js
  // The same heading as the forge, and not a bag for leftovers: these two are the games that leave
  // something behind when the window closes (a sword, a position), which is also why these two rows
  // are the only ones allowed a figure on the right (docs/game-panels.md, section 7)
  group: 'What you keep',
  rowTitle: 'Coin Market',

  // deps: reply, afterMove, budget, random, ensureReplica, replica, record, storedForge,
  // storedMarket, push, log, live. The market reads storedMarket() and nothing else: `random` is
  // not here because there is no seed in this game, the price being a function of the clock
  createHandler(deps) {
    let wallet = null;   // rebuilt from the ledger whenever storage is ahead of it
    let reqN = null;
    let toldFor = -1;    // the minute an unasked redraw last went out for (onPush)
    // The window the screen last asked for. REMEMBERED, because the redraws this handler sends on
    // its own (onPush, and the panel's own beat) carry no key: a reply built on the default would
    // pull a screen showing 1M back to 1D once a minute, and the player never pressed anything
    let span = SPAN_DEF;

    // The key off a message, which is the only thing the webview may say about the window. A key
    // this table does not know falls to the default rather than being refused: nothing on the
    // screen can send one, so it means a panel from another build, and the default window is the
    // honest answer to that. Only an `open` names a window; a trade is about money
    function pickSpan(m) {
      if (m.op !== 'open' || m.span === undefined) return;
      span = (typeof m.span === 'string' && SHAPES[m.span]) ? m.span : SPAN_DEF;
    }
    // `span` is a key SHAPES has, because the line above is the only thing that ever sets it and it
    // only sets one of those. No second fallback here on purpose: a shape of undefined would be
    // engine.view falling back to its OWN default, which is the three-hour window and not this
    // file's, so the one answer to "what window is on screen" would have two places to come from
    function shape() { return SHAPES[span]; }

    // The wallet as it stands, carrying the id of whichever window last wrote it
    function saved() { return engine.save(wallet); }

    // ...and the record THIS window writes when it trades: its own id settles a merge tie
    // (market.newer), so a record without one loses every tie, which is the right way round
    function record() { return Object.assign(saved(), { by: deps.replica() || '' }); }

    function holding() {
      return !!wallet && engine.CODES.some((code) => wallet.pos[code]);
    }

    // Takes the stored wallet when it is the later one. Returns true when the wallet in memory
    // changed, which is what an unasked redraw hangs on
    function sync() {
      const stored = deps.storedMarket();
      if (!wallet || engine.newer(stored, saved())) {
        wallet = engine.load(stored);
        return true;
      }
      return false;
    }

    // gameReply calls engine.view(round, free) with two arguments and the market's view takes two
    // more: the clock and the candle shape. So the reply is handed this adapter rather than the
    // module, which is also what keeps the time on the host's side of the wire
    function reply(error, now) {
      const viewer = { view: (st, free) => engine.view(st, free, now, shape()) };
      deps.reply('mk', viewer, wallet, reqN, error, false);
    }

    // One forced write carries the trade and the money together, because here they are one thing:
    // `staked` and `earned` are fields of the record, so the bank is handed 0. What comes back is
    // the merged ledger, which is also how this window finds out whether its trade is the one every
    // window will see.
    //
    // A dropped trade is shown as what it is: the wallet another window left, with no chip on it and
    // a line saying why. Nothing was banked for it, so there is nothing to take back
    function settle(now) {
      const mine = record();
      const ledger = deps.record(0, { market: mine });
      const landed = ledger && ledger.market;
      const dropped = !engine.kept(mine, landed);
      if (dropped) wallet = engine.load(landed);
      // The merge lifts nothing out of the loser (market.MAX_FIELDS is empty, and that is the
      // market's own rule rather than an omission: every figure here is money or made of money and
      // has to travel with the record). So the only field to take back is `by`, which is this
      // window's now. Without it the next sync() would read storage's copy of this very trade as
      // the later one and adopt it, dropping the chip and the read-out with it
      else wallet = Object.assign({}, wallet, { by: landed.by });
      reply(dropped ? 'another window traded first' : null, now);
      try { deps.push(); } catch (e) { deps.log('market: push after settle failed: ' + (e && e.message)); }
    }

    return {
      key: 'mk',
      handle(m) {
        reqN = Number.isSafeInteger(m.n) ? m.n : null;
        sync();
        // The host's clock, taken once per message: the trade settles at it and the view is drawn at
        // it, so the two cannot disagree inside one reply, and nothing off the wire can name it
        const now = Date.now();
        toldFor = Math.floor(now / engine.MS_PER_MIN);
        pickSpan(m);
        if (m.op === 'open') return reply(null, now);
        if (engine.OPS.indexOf(m.op) < 0) return reply('unknown action', now);
        // Only the fields named here are read, and `nowMs` is not one of them. A buy carries the
        // coin and the stake; a sale carries the coin, and `amount` is ignored by the engine's own
        // check for it. The window's key is not here either: pickSpan took it above, and it is a
        // way of looking rather than part of a move
        const op = {
          op: m.op,
          ticker: typeof m.ticker === 'string' ? m.ticker : '',
          amount: Number.isSafeInteger(m.amount) ? m.amount : 0,
          nowMs: now
        };
        const reason = engine.whyNot(wallet, op, deps.budget('mk'));
        if (reason) return reply(reason, now);
        deps.ensureReplica();
        wallet = engine.act(wallet, op);
        settle(now); // every accepted trade settles, so this records exactly once per message
      },
      // A coin is paid for the instant it is bought, so the market has nothing riding and holds
      // nothing back from the other games. It is measured against what they have left like
      // everything else (deps.budget)
      held() { return 0; },
      // Two things can move without a message of ours: another window's trade, and the clock. Both
      // reach the panel here.
      //
      // The price only changes on the minute, so a reply a minute is the whole of it: the push runs
      // every ten seconds and six replies a minute would be five views of the same prices. A window
      // holding nothing is told nothing either, because then there is no figure to move, and the
      // panel asks for itself when it is open (its own beat, panel.js's MK_T.tick)
      onPush() {
        if (!deps.live()) return;          // no webview to draw into
        const first = !wallet;             // this window has not read the wallet yet
        const moved = sync();
        const now = Date.now();
        const minute = Math.floor(now / engine.MS_PER_MIN);
        if (!moved && (!holding() || minute === toldFor)) return;
        // Reading an empty wallet for the first time is not news. Without this, every window that
        // has never traded would price four coins and post thirty-six candles each at activation, to
        // tell a list row that it is still empty
        if (first && !holding()) return;
        toldFor = minute;
        reqN = null;                       // nobody asked for this one
        reply(null, now);
      }
    };
  },

  css: `
  /* --- The coin market. The one screen with no table on it: there is no round to lay down, so the
     felt comes off and the chart sits in the well games/casino.js already owns (.mk-well) on the
     panel's own surface (docs/game-panels.md, section 5-10).
     Everything here is therefore the ROOM's, not the table's (section 4), and that decides the two
     colours: the felt's #7ee6a4 is 1.53:1 on a white card, so the pair brought out for .gm-fig is
     the pair used here, light theme and all. No third colour, and the one accent is still ember --- */
  .mk{--mk-up:#4fae74;--mk-dn:#f6836e;}          /* 5.70:1 / 6.26:1 on --card dark */
  body.vscode-light .mk{--mk-up:#1f7a49;--mk-dn:#b32a2e;}   /* 5.33:1 / 6.39:1 */
  .mk .mk-u{color:var(--mk-up);}
  .mk .mk-d{color:var(--mk-dn);}
  /* --- depth one: the four coins, a row each. Two lines inside the 44px row, because a name, a
     price, a change, a sparkline and a chip in ONE line is over 200px of fixed width at a sidebar
     that can be dragged to a 172px panel (docs/game-panels.md, section 1).
     The split is not only room: the top line is the MARKET (the price and the change, on one window
     for every row) and the bottom one is the picture and what is mine --- */
  /* the hidden attribute is a UA rule and loses to a display of our own, so every box here that
     sets one says
     what hidden means for it. A list that goes on showing under the coin screen is the whole screen
     drawn twice */
  .mk-list{display:flex;flex-direction:column;}
  .mk-list[hidden],.mk-lhead[hidden],.mk .bj-stakes[hidden],.mk-crumb[hidden],.mk-ax[hidden]{display:none;}
  /* the window's name, over the change column it is the base of. The list has no period control of
     its own, so this one word is what says against what the four figures under it are measured */
  .mk-lhead{display:flex;justify-content:flex-end;margin:0 6px 4px;
    font-size:10.5px;font-weight:700;color:var(--muted);}
  .mk-row{display:flex;flex-direction:column;justify-content:center;gap:2px;width:100%;height:44px;
    padding:0 6px;border:0;border-radius:8px;background:transparent;font-family:inherit;text-align:left;cursor:pointer;}
  .mk-row:hover{background:var(--track);}
  .mk-row:focus-visible{outline:2px solid var(--focus);outline-offset:-2px;}
  .mk-r1,.mk-r2{display:flex;align-items:center;gap:6px;width:100%;min-width:0;}
  .mk-nm{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:700;color:var(--text);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mk-px{flex:none;margin-left:auto;font-size:12px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;}
  .mk-spark{flex:none;width:40px;height:16px;line-height:0;}
  .mk-fg{flex:none;margin-left:auto;line-height:1;}
  /* --- depth two: one coin. The crumb is the only way back up, because the heading's arrow belongs
     to the games list and a screen two deep needs its own --- */
  .mk-crumb{display:flex;align-items:center;gap:6px;margin-bottom:8px;}
  /* the three properties and not the shorthand, for the reason in games/casino.js's .bj-why */
  .mk-back{flex:none;padding:2px 5px;border:0;border-radius:6px;background:transparent;color:var(--muted);
    font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;}
  .mk-back:hover{background:var(--track);color:var(--text);}
  .mk-back:focus-visible{outline:2px solid var(--focus);outline-offset:1px;}
  /* the code gives way first when the crumb runs out of room: the price and the move are the two
     figures this line is for */
  .mk-code{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:700;color:var(--text);letter-spacing:.3px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mk-now{flex:none;font-size:12px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;}
  /* The change: on the row beside the price, and again at the far end of the period line. The
     min-width is what stops the price shifting 7.5px sideways every time a figure goes from one
     digit to two: ±X.X% measures 37.7px and ±XX.X% 45.2px */
  .mk-chg{flex:none;min-width:46px;text-align:right;font-size:11px;font-weight:700;
    color:var(--muted);font-variant-numeric:tabular-nums;}
  /* --- the period, directly over the chart. Not in .bj-ctl: that row takes two buttons (section 1)
     and already holds the stake chips and Buy, and below the chart this control would be the second
     segmented row in 40px, the stake chips being the first. Above it the reading is "what · over
     which window · so this shape".
     The stake chips' own control at 11px and a tighter pad: at .bj-stakes' 12px/9px four of these
     are 157.6px, and with a 45.2px change figure beside them the line a 250px sidebar leaves is
     172px. Four of these are 120px. Five would be 149.5px, which is why there are four windows --- */
  .mk-spanrow{display:flex;align-items:center;gap:6px;margin-bottom:8px;}
  .mk-spanrow .mk-chg{margin-left:auto;}
  /* flex:0 1 auto with min-width:0 so a three-digit change (±XXX.X% is 52.6px, and a 30-day window
     has reached 64%) presses the chips in rather than being cut off */
  .mk-span{display:flex;gap:2px;padding:2px;flex:0 1 auto;min-width:0;
    background:var(--inner);border:1px solid var(--iborder);border-radius:9px;}
  .mk-span button{height:28px;padding:0 5px;border:0;border-radius:7px;background:transparent;
    font-family:inherit;font-size:11px;font-weight:700;color:var(--muted);cursor:pointer;
    font-variant-numeric:tabular-nums;}
  /* the chosen chip is a --card ground, the same way the stake chips below it say "this one": ember
     stays the focus ring and the entry line, and nothing in this panel is picked by being ember */
  .mk-span button.on{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18);}
  .mk-span button:hover:not(.on){color:var(--text);}
  .mk-span button:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
  /* The max block, and the one size on this screen that is not in the scale of six: the profit of an
     open position at 26px, which docs/game-panels.md section 2 writes down as the one exception.
     It is HIDDEN when nothing is held rather than showing a zero: a zero in the biggest type on the
     screen reads as a position that is worth nothing */
  .mk-plbox{margin-bottom:10px;}
  .mk-plbox[hidden]{display:none;}
  .mk-pl{display:block;font-size:26px;font-weight:800;line-height:1.1;color:var(--muted);font-variant-numeric:tabular-nums;}
  .mk-plsub{display:block;margin-top:2px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;}
  /* --- the amount: any whole number of credits, typed in credits or in coins. A coin is bought in
     fractions (0.7 of one is a stake of 0.7 times its price), so the box takes decimals in coins */
  .mk-amt{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;}
  .mk-amt[hidden]{display:none;}
  .mk-amt input{flex:1 1 90px;min-width:0;height:28px;box-sizing:border-box;padding:0 8px;border-radius:7px;border:1px solid var(--iborder);background:var(--inner);color:var(--text);font-family:inherit;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;}
  .mk-amt input:focus{outline:2px solid var(--focus);outline-offset:0;}
  .mk-seg{display:flex;gap:2px;padding:2px;flex:none;background:var(--inner);border:1px solid var(--iborder);border-radius:9px;}
  .mk-seg button{height:24px;padding:0 8px;border:0;border-radius:7px;background:transparent;font-family:inherit;font-size:11.5px;font-weight:700;color:var(--muted);cursor:pointer;}
  .mk-seg button.on{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.18);}
  .mk-seg button:hover:not(.on):not(:disabled){color:var(--text);}
  .mk-seg button:disabled{opacity:.35;cursor:not-allowed;}
  .mk-seg button:focus-visible{outline:2px solid var(--focus);outline-offset:1px;}
  .mk-conv{min-height:14px;margin-top:4px;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums;}
  .mk-conv.bad{color:var(--mk-dn);}
  /* --- the chart: 24 to 36 candles, depending on the window, as absolutely placed <i>. There is no
     chart library in this extension and there is not going to be one (CLAUDE.md: no dependencies,
     no build step).
     Every candle is placed in PER CENT of the well, so the same chart is 186px wide at the design
     width and 156px at a sidebar dragged in to 250 with no resize hook to get wrong. (186 and not
     182: this screen has no felt, so the panel's own padding is all that comes off the sidebar) --- */
  .mk-chart{position:relative;height:110px;}
  .mk-chart i{position:absolute;display:block;}
  .mk-body{border-radius:1px;min-height:1px;}
  .mk-wick{width:1px;transform:translateX(-50%);opacity:.65;}
  .mk-rise{background:var(--mk-up);}
  .mk-fall{background:var(--mk-dn);}
  /* where this position was opened. Ember, because it is the one thing on the chart that is mine */
  .mk-mark{left:0;right:0;height:1px;background:#e8895a;opacity:.8;}
  .mk-ax{display:flex;justify-content:space-between;gap:8px;margin-top:6px;
    font-size:10.5px;font-weight:700;color:var(--muted);font-variant-numeric:tabular-nums;}
  /* the fee, under the button that charges it rather than over the whole screen: said once, on the
     buy screen only (docs/game-panels.md, section 5-10) */
  .mk-fee{margin-top:6px;}
`
};
