// A reply with no `state`: the host could not describe the table (games/README.md, section 5).
//
// ONE PAGE FOR ALL FIVE SCREENS, because the rule is the floor's and not any one game's. The five
// receive() bodies are five copies of one sentence, and a mode per game would be five pages proving
// the same thing five times. A sixth game is a row in GAMES below and nothing else. What is asked of
// every screen is the same five things:
//
//   1. the reason shows
//   2. what was drawn is still drawn, to the character, marks and held cards included
//   3. nothing is paced: a reply with no state has no cards to walk in
//   4. the wait is released, and the four-second no-reply timeout never lands on top of the reason
//   5. the next input is answered, so the screen is not left dead
//
// This is the rule that cost a four-second freeze, which is why it is measured on every screen
// rather than on the ones that happened to be written when it was found.
//
// (The count above has read "ten", then "fourteen", then this. It is in the prose and nowhere in the
// code: the rows in GAMES are the register, and nine of them went on 2026-11-13.)
//
// The fault is delivered by answering the message in the page (h.intercept) rather than by breaking
// the host, so the host never sees the move and still holds the round the panel kept. That is what
// makes step 5 worth anything: if the panel had thrown its state away, the move it sends next would
// be measured against a round it no longer knows.
'use strict';

module.exports = {
  id: 'fault',
  modes: ['stateless'],
  // Five tables on one purse, and every one of them deals at 10. A round left live holds its stake
  // back from every other game (games/README.md, section 6), so this runs on a purse deep enough
  // that no table here is ever refused for money: what is being measured is a fault, and a refused
  // deal would be a different reply with a different rule
  start: { stateless: 20000 },

  run: function (h) {
    const { ok, advance, later, doc, $, openGame, useSeed, ledgerBalance, toWebview, errors,
      ext, EXT, path } = h;
    const pending = () => h.pending(0);
    const text = (id) => { const e = $(id); return e ? e.textContent : ''; };
    const engineOf = (file) => require(path.join(EXT, file));

    // Answers the next `op` of `key` with a reply carrying no state: a reason and the money, which
    // is exactly what extension.js's gameReply() sends when view() throws. `free` is the real one,
    // because the money on such a reply is still true and the purse takes it as usual
    const REASON = 'the table could not describe the round';
    function faultOn(key, ops, bal) {
      const money = bal == null ? ledgerBalance() : bal;
      h.intercept = (m) => {
        if (ops.indexOf(m.op) < 0) return false;
        h.intercept = null;
        later(1, () => toWebview({ type: key, n: m.n, error: REASON, balance: money, free: money }));
        return true;
      };
    }

    // High-Low's two guesses are not both live on every card (nothing beats an ace), and which one
    // is open is the host's ruling, so the side pressed here is read off the screen rather than
    // assumed. A press on the closed one would send nothing at all and the fault would never arrive
    const hlSide = () => (doc.querySelector('#hlPlay [data-op="higher"]').disabled ? 'lower' : 'higher');
    const hlPress = () => doc.dispatchKey(hlSide() === 'higher' ? 'ArrowUp' : 'ArrowDown');

    // --- the seeds the machine needs -----------------------------------------------------------
    //
    // The slot machine settles on the press, so what has to be arranged for it is that the two real
    // spins DIFFER, or "the table moved" in step 5 would pass on a coincidence one spin in thirteen
    // thousand and fail on the other.
    const slots = engineOf('slots.js');

    // Two seeds in a row, handed out in order, that land somewhere different from each other
    function pinTwo(key, tag, faceOf) {
      const picked = [];
      for (let i = 0; i < 40000 && picked.length < 2; i++) {
        const s = tag + i, f = faceOf(s);
        if (!picked.some((p) => p.f === f)) picked.push({ s, f });
      }
      if (picked.length < 2) throw new Error('no two different outcomes for ' + tag);
      let n = 0;
      ext._test.setSeeds(key, () => picked[Math.min(n++, 1)].s);
    }
    const slFace = (s) => slots.view(slots.newRound({ seed: s, id: 't', bet: 10 }), 1e9)
      .reels.map((r) => r.sym).join();

    // Each row is one screen. `shows` is what proves something is really on the table before the
    // fault, and it is not /svg/ for every game: the card games draw cards and the machines draw
    // their own symbols
    const GAMES = [
      {
        id: 'blackjack', err: 'bjErr', key: 'bj', moves: ['hit'],
        open: () => { useSeed((st) => st.phase === 'player', 'fault-bj-'); openGame('blackjack'); $('bjDeal').click(); advance(2000); },
        drawn: () => $('bjDFan').innerHTML + '|' + $('bjHands').innerHTML + '|' + text('bjDTot'),
        press: () => doc.dispatchKey('h'),
        ready: () => !$('bjPlay').hidden && !doc.querySelector('#bjPlay [data-op="hit"]').disabled,
        next: () => { doc.dispatchKey('s'); advance(4000); }
      },
      {
        // cash out is closed until the first call, so the move after the fault is another call
        id: 'hilo', err: 'hlErr', key: 'hl', moves: ['higher', 'lower'],
        open: () => { openGame('hilo'); $('hlDeal').click(); advance(1000); },
        drawn: () => $('hlCard').innerHTML + '|' + $('hlPrev').innerHTML + '|' + text('hlLine') + '|' + text('hlUp'),
        press: hlPress,
        ready: () => !$('hlPlay').hidden && !doc.querySelector('#hlPlay [data-op="' + hlSide() + '"]').disabled,
        next: () => { hlPress(); advance(1000); }
      },
      {
        // a spin settles on the press, so the thing a fault may not wipe is the LAST spin: three
        // reels showing nothing is a machine that looks broken rather than one that could not
        // describe the press just made
        id: 'slots', err: 'slErr', key: 'sl', moves: ['deal'], shows: /sy-cell/,
        open: () => {
          pinTwo('sl', 'fault-sl-', slFace);
          openGame('slots');
          $('slDeal').click(); advance(2000);
        },
        drawn: () => $('slR0').innerHTML + '|' + $('slR1').innerHTML + '|' + $('slR2').innerHTML + '|' + text('slLine'),
        press: () => $('slDeal').click(),
        ready: () => !$('slDeal').disabled,
        next: () => { $('slDeal').click(); advance(2000); }
      },
      {
        // the wheel is placed but not yet spun, so what is drawn is the wedge colours, the legend
        // and where the dial is resting. A wheel that jumped home would be a wheel that turned
        id: 'wheel', err: 'whErr', key: 'wh', moves: ['spin'], shows: /wh-row/,
        open: () => { openGame('wheel'); $('whDeal').click(); advance(1000); },
        drawn: () => $('whFace').style.background + '|' + $('whFace').style.transform + '|'
          + $('whFace').getAttribute('aria-label') + '|' + $('whKey').innerHTML + '|' + text('whLine'),
        press: () => doc.dispatchKey('s'),
        ready: () => !$('whPlay').hidden && !doc.querySelector('#whPlay [data-op="spin"]').disabled,
        next: () => { doc.dispatchKey('s'); advance(3000); }
      },
      {
        // a position is the player's PROPERTY and not a round, so a market wiped back to an empty
        // chart is the one reading they cannot tell from "my position is gone". The fault here is
        // taken on a buy with nothing held, so the minute beat has no held time to move under the
        // snapshot (games/market/panel.js, mkBeat)
        id: 'market', err: 'mkErr', key: 'mk', moves: ['buy'], shows: /mk-body/,
        open: () => {
          openGame('market');
          doc.querySelector('#mkList .mk-row').click();
          advance(50);
        },
        // the heading is what names the open depth on this screen (the title is the coin's code and
        // the corner its price), so it is part of what must still be drawn after a fault
        drawn: () => $('mkChart').innerHTML + '|' + $('mkAx').innerHTML + '|' + text('mkConv')
          + '|' + text('mkTtl') + '|' + text('mkSide'),
        press: () => doc.dispatchKey('b'),
        ready: () => !$('mkDeal').hidden && !$('mkDeal').disabled,
        next: () => { doc.dispatchKey('b'); advance(1000); }
      }
    ];

    for (const g of GAMES) {
      g.open();
      const before = g.drawn();
      const shows = g.shows || /svg/;
      ok(g.id + ': a table is drawn and live before the fault', shows.test(before) && g.ready(),
        g.ready() + ' ' + before.slice(0, 60));

      // Pacing is counted as a CHANGE and not as a total, because one screen has a clock of its
      // own: the market keeps a once-a-second beat the whole time its panel is open
      // (games/market/panel.js, MK_T.tick). The reading taken here is the table sitting idle, so
      // what the two checks below compare is the pacing this reply added, which must be none
      const idle = pending();
      faultOn(g.key, g.moves);
      g.press(); advance(10);
      ok(g.id + ': the reason shows', !$(g.err).hidden && text(g.err).indexOf(REASON) >= 0, JSON.stringify(text(g.err)));
      ok(g.id + ': what was drawn is still drawn', g.drawn() === before, 'it changed');
      ok(g.id + ': a reply with no state paces nothing', pending() === idle,
        pending() + ' timers still to fire, ' + idle + ' before the fault');
      ok(g.id + ': the buttons come back', g.ready(), 'still locked');

      // That same beat ASKS the host for the next minute when one turns over, and the wall clock
      // decides when that is, so about one run in twelve would redraw the market inside this wait
      // and fail the snapshot for a reason that has nothing to do with faults. The ask is left
      // unanswered for the length of the wait: mkAsk() is not a move and starts no timeout of its
      // own, and a message the host never sees cannot redraw anything. No other screen asks for
      // anything on a timer, so for the other four this swallows nothing
      h.intercept = (m) => m.op === 'open';
      advance(5000);
      h.intercept = null;
      ok(g.id + ': the four-second no-reply timeout never fires over the reason',
        text(g.err).indexOf(REASON) >= 0, JSON.stringify(text(g.err)));
      ok(g.id + ': and five seconds later the table is still the one that was drawn', g.drawn() === before, 'it changed');

      g.next();
      ok(g.id + ': the next input is answered on the round the screen kept',
        $(g.err).hidden && g.drawn() !== before, JSON.stringify(text(g.err)));
    }

    // The wheel's press carries the wheel the player picked, and a fault that lost the state would
    // send the next spin naming no wheel at all, which the host answers with "pick a wheel" for a
    // message that did name one. This is the check that the state a screen KEPT is still the state
    // its next message is built from, and the forge's level check was its twin until 1.25.0
    const whSpins = h.sent('wh').filter((m) => m.op === 'spin');
    ok('wheel: the press after a fault still names the wheel the screen is showing',
      whSpins.length === 2 && !!whSpins[1].risk && whSpins[1].risk === whSpins[0].risk,
      JSON.stringify(whSpins.map((m) => m.risk)));

    // The money on a state-less reply is the host's own figure, so the header takes it like any
    // other reply's: a panel that skipped the settle would leave the number where the fault found it
    const was = $('ccBal').textContent;
    faultOn('hl', ['open'], 777);
    openGame('hilo'); advance(1200);   // the header number is tweened, so it is read after it lands
    ok('the balance a state-less reply carries still lands in the header', $('ccBal').textContent === '777', was + ' -> ' + $('ccBal').textContent);

    ok('no handler threw on a reply with no state', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
