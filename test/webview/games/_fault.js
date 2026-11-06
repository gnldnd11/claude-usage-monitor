// A reply with no `state`: the host could not describe the table (games/README.md, section 5).
//
// ONE PAGE FOR ALL FOURTEEN SCREENS, because the rule is the floor's and not any one game's. The
// fourteen receive() bodies are fourteen copies of one sentence, and a mode per game would be
// fourteen pages proving the same thing fourteen times. A fifteenth game is a row in GAMES below and
// nothing else. What is asked of every screen is the same five things:
//
//   1. the reason shows
//   2. what was drawn is still drawn, to the character, marks and held cards included
//   3. nothing is paced: a reply with no state has no cards to walk in
//   4. the wait is released, and the four-second no-reply timeout never lands on top of the reason
//   5. the next input is answered, so the screen is not left dead
//
// This is the rule that cost a four-second freeze, which is why it is measured on every screen
// rather than on the ones that happened to be written when it was found. Red Dog measured its own
// five inside its own mode file for a while; the second copy of a rule is where the two copies start
// to differ, so it is a row here now and test/webview/games/reddog.js keeps none of them.
//
// (The count above read "ten" while the minefield, the tower, keno and the crash were off the floor
// and the dice family had not replaced them. It is in the prose and nowhere in the code: the rows in
// GAMES are the register.)
//
// The fault is delivered by answering the message in the page (h.intercept) rather than by breaking
// the host, so the host never sees the move and still holds the round the panel kept. That is what
// makes step 5 worth anything: if the panel had thrown its state away, the move it sends next would
// be measured against a round it no longer knows.
'use strict';

module.exports = {
  id: 'fault',
  modes: ['stateless'],
  // Fourteen tables on one purse: ten of them deal at 10, the four dice games and the market at
  // 100, and the forge charges a fee an attempt. A round left live holds its stake back from every
  // other game (games/README.md, section 6), and Hazard and Shut the Box are both left live by this
  // page, so this runs on a purse deep enough that no table here is ever refused for money: what is
  // being measured is a fault, and a refused deal would be a different reply with a different rule
  start: { stateless: 20000 },

  run: function (h) {
    const { ok, advance, later, doc, $, openGame, useSeed, ledgerBalance, toWebview, errors,
      ext, EXT, path } = h;
    const pending = () => h.pending(0);
    const text = (id) => { const e = $(id); return e ? e.textContent : ''; };
    const litRow = () => { const r = doc.querySelector('#pkPays .pk-pay.on'); return r ? r.textContent : 'none'; };
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

    // The forge is taken off +0 before the fault, with the roll pinned, because a +0 sword and a
    // sword nobody could describe are drawn alike: the blade's length is the level. A screen wiped
    // to level 0 would otherwise pass the snapshot below while telling the player a lie
    const forge = engineOf('forge.js');
    function pinFg(level, outcome) {
      for (let i = 0; i < 20000; i++) {
        const s = 'fault-fg-' + i;
        if (forge.outcomeAt(level, forge.rollOf(s)) === outcome) { ext._test.setFgSeeds(() => s); return s; }
      }
      throw new Error('no forge seed for ' + outcome + ' at ' + level);
    }

    // --- the seeds the machines need -----------------------------------------------------------
    //
    // The slot machine and the plinko board settle on the press, so what has to be arranged for
    // them is that the two real spins DIFFER, or "the table moved" in step 5 would pass on a
    // coincidence one spin in thirteen thousand and fail on the other.
    const slots = engineOf('slots.js');
    const plinko = engineOf('plinko.js');
    const reddog = engineOf('reddog.js');
    // The dice family. Two of the four settle on the press (Roll Under, Sic Bo) and need the same
    // arrangement the machines do: the two real rolls have to DIFFER, or "the table moved" in step 5
    // would pass on a coincidence. The other two (Hazard, Shut the Box) hold a live round, so what
    // they need instead is a first roll that leaves one
    const dice = engineOf('dice.js');
    const sicbo = engineOf('sicbo.js');
    const hazard = engineOf('hazard.js');
    const shutbox = engineOf('shutbox.js');

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
    const plFace = (s) => String(plinko.view(plinko.newRound({
      seed: s, id: 't', bet: 10, risk: plinko.RISK_KEYS[0]
    }), 1e9).bin);
    function rdSeed() {
      for (let i = 0; i < 40000; i++) {
        const s = 'fault-rd-' + i;
        // a spread opening is the one that leaves a choice: a pair and a consecutive pair settle on
        // the deal, so there would be no live hand to fault on
        if (reddog.newRound({ seed: s, id: 't', bet: reddog.MIN_BET }).kind === 'spread') {
          ext._test.setSeeds('rd', () => s);
          return s;
        }
      }
      throw new Error('no Red Dog seed that deals a spread');
    }

    const scFree = () => doc.querySelector('#scGrid .sc-cell:not([disabled])');

    // --- the dice family's own arrangements ----------------------------------------------------
    const dcFaceOf = (s) => String(dice.newRound({ seed: s, id: 't', bet: dice.MIN_BET, target: 50 }).roll);
    const sbFaceOf = (s) => sicbo.newRound({ seed: s, id: 't', bet: sicbo.MIN_BET, kind: 'small' }).dice.join();
    // One seed, pinned, whose FIRST roll leaves a live round. Hazard busts one time in six and Shut
    // the Box needs a throw a single tile can close, or there would be no live round to fault on
    function pinOne(key, tag, want) {
      for (let i = 0; i < 40000; i++) {
        const s = tag + i;
        if (want(s)) { ext._test.setSeeds(key, () => s); return s; }
      }
      throw new Error('no ' + key + ' seed for ' + tag);
    }
    const hzLive = (s) => hazard.newRound({ seed: s, id: 't', bet: hazard.MIN_BET }).phase === 'play';
    // a first throw of 9 or less: the tile of that number closes it on its own, so the press below
    // is one click and the screen sends the close without a pick to paint first
    let sxFirst = null;
    const sxEasy = (s) => {
      const st = shutbox.newRound({ seed: s, id: 't', bet: shutbox.MIN_BET });
      if (st.phase === 'play' && st.roll <= shutbox.TILES) { sxFirst = st; return true; }
      return false;
    };
    const sxTile = (n) => doc.querySelector('#sxTiles .sx-tile[data-t="' + n + '"]');

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
        // the card marked to keep is in #pkHand's own markup (.pk-slot.held), so the snapshot below
        // is also what says a fault did not forget which cards the player is keeping
        id: 'poker', err: 'pkErr', key: 'pk', moves: ['draw'],
        open: () => { openGame('poker'); $('pkDeal').click(); advance(1500); doc.querySelector('#pkHand .pk-slot[data-i="0"]').click(); },
        drawn: () => $('pkHand').innerHTML + '|' + text('pkLine') + '|' + litRow(),
        press: () => $('pkDraw').click(),
        ready: () => !$('pkPlay').hidden && !$('pkDraw').disabled,
        next: () => { $('pkDraw').click(); advance(2000); }
      },
      {
        // the forge's state is the player's property and it outlives the window, so an anvil wiped
        // by a fault would read as a sword that has been lost rather than one not described
        id: 'forge', err: 'fgErr', key: 'fg', moves: ['enhance'],
        open: () => { openGame('forge'); pinFg(0, 'up'); $('fgEnhance').click(); advance(3000); },
        drawn: () => $('fgSword').innerHTML + '|' + text('fgLv') + '|' + text('fgLine'),
        press: () => $('fgEnhance').click(),
        ready: () => !$('fgEnhance').disabled,
        next: () => { $('fgEnhance').click(); advance(3000); }
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
        // the squares already rubbed off, the tally over them and the prize ring. A card is the
        // player's own nine presses and a fault may not take any of them back
        id: 'scratch', err: 'scErr', key: 'sc', moves: ['scratch'], shows: /#sy-/,
        open: () => {
          openGame('scratch');
          $('scDeal').click(); advance(1000);
          $('scC0').click(); advance(1000);
        },
        drawn: () => $('scGrid').innerHTML + '|' + $('scTally').innerHTML + '|' + text('scLine'),
        press: () => $('scC1').click(),
        ready: () => !$('scPlay').hidden && !!scFree(),
        next: () => { scFree().click(); advance(1000); }
      },
      {
        // the bead in its cup, the flag over it and the cups themselves: the same rule as the slot
        // machine, drawn as a board instead of three rings
        id: 'plinko', err: 'plErr', key: 'pl', moves: ['deal'], shows: /pl-cup/,
        open: () => {
          pinTwo('pl', 'fault-pl-', plFace);
          openGame('plinko');
          $('plDeal').click(); advance(3000);
        },
        drawn: () => $('plCups').innerHTML + '|' + $('plFlag').innerHTML + '|'
          + $('plBead').style.transform + '|' + text('plLine'),
        press: () => $('plDeal').click(),
        ready: () => !$('plDeal').disabled,
        next: () => { $('plDeal').click(); advance(3000); }
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
        // a position is the player's PROPERTY, like the sword, so a market wiped back to an empty
        // chart is the one reading they cannot tell from "my position is gone". The fault here is
        // taken on a buy with nothing held, so the minute beat has no held time to move under the
        // snapshot (games/market/panel.js, mkBeat)
        id: 'market', err: 'mkErr', key: 'mk', moves: ['buy'], shows: /mk-body/,
        open: () => {
          openGame('market');
          doc.querySelector('#mkList .mk-row').click();
          advance(50);
        },
        drawn: () => $('mkChart').innerHTML + '|' + $('mkAx').innerHTML + '|' + text('mkLine')
          + '|' + text('mkCode') + '|' + text('mkNow'),
        press: () => doc.dispatchKey('b'),
        ready: () => !$('mkDeal').hidden && !$('mkDeal').disabled,
        next: () => { doc.dispatchKey('b'); advance(1000); }
      },
      {
        // the two openers and the spread between them, which is the whole of the decision this
        // screen is asking the player to make
        id: 'reddog', err: 'rdErr', key: 'rd', moves: ['stand', 'raise'],
        open: () => { rdSeed(); openGame('reddog'); $('rdDeal').click(); advance(1500); },
        drawn: () => $('rdA').innerHTML + '|' + $('rdB').innerHTML + '|' + $('rdGap').innerHTML + '|' + text('rdLine'),
        press: () => doc.dispatchKey('s'),
        ready: () => !$('rdPlay').hidden && !doc.querySelector('#rdPlay [data-op="stand"]').disabled,
        next: () => { doc.dispatchKey('s'); advance(1500); }
      },
      {
        // a roll settles on the press, so what a fault may not wipe is the LAST roll: an empty
        // shelf is a lane that has never been rolled on rather than one nobody could describe
        id: 'dice', err: 'dcErr', key: 'dc', moves: ['deal'], shows: /dc-plaque/,
        open: () => {
          pinTwo('dc', 'fault-dc-', dcFaceOf);
          openGame('dice');
          $('dcDeal').click(); advance(1000);
        },
        drawn: () => $('dcShelf').innerHTML + '|' + $('dcFill').style.width + '|' + text('dcLine'),
        press: () => $('dcDeal').click(),
        ready: () => !$('dcDeal').disabled,
        next: () => { $('dcDeal').click(); advance(1000); }
      },
      {
        // the same rule drawn as three dice: three blank faces is a table that was never played
        id: 'sicbo', err: 'sbErr', key: 'sb', moves: ['deal'], shows: /#dc-[1-6]/,
        open: () => {
          pinTwo('sb', 'fault-sb-', sbFaceOf);
          openGame('sicbo');
          $('sbDeal').click(); advance(1000);
        },
        drawn: () => $('sbDice').innerHTML + '|' + $('sbBoard').innerHTML + '|' + text('sbLine'),
        press: () => $('sbDeal').click(),
        ready: () => !$('sbDeal').disabled,
        next: () => { $('sbDeal').click(); advance(1000); }
      },
      {
        // the tray is the round: a fault that emptied it would be indistinguishable from the 1 that
        // empties it for real, which is the only thing this game can lose
        id: 'hazard', err: 'hzErr', key: 'hz', moves: ['roll'], shows: /hz-pip/,
        open: () => {
          pinOne('hz', 'fault-hz-', hzLive);
          openGame('hazard');
          $('hzDeal').click(); advance(1000);
        },
        drawn: () => $('hzDie').innerHTML + '|' + $('hzTray').innerHTML + '|' + text('hzPay') + '|' + text('hzLine'),
        press: () => doc.dispatchKey('r'),
        ready: () => !$('hzPlay').hidden && !doc.querySelector('#hzPlay [data-op="roll"]').disabled,
        next: () => { doc.dispatchKey('r'); advance(1000); }
      },
      {
        // nine tiles, and the ones already down are the player's own closes. This screen has no
        // buttons at all, so the press and the next input are both a tile
        id: 'shutbox', err: 'sxErr', key: 'sx', moves: ['close'], shows: /sx-tile/,
        open: () => {
          pinOne('sx', 'fault-sx-', sxEasy);
          openGame('shutbox');
          $('sxDeal').click(); advance(1000);
        },
        drawn: () => $('sxTiles').innerHTML + '|' + $('sxDice').innerHTML + '|' + text('sxLine'),
        press: () => sxTile(sxFirst.roll).click(),
        ready: () => $('sxBet').hidden && !!sxTile(sxFirst.roll) && !sxTile(sxFirst.roll).disabled,
        next: () => { sxTile(sxFirst.roll).click(); advance(1000); }
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
      // anything on a timer, so for the other nine this swallows nothing
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

    // The forge's press carries the level the anvil is showing, and the host refuses a press that
    // names any other one (games/forge/meta.js). A fault that lost the state would send the next
    // press with no level at all, which is the one shape the host cannot tell from a stale screen
    const fgPresses = h.sent('fg').filter((m) => m.op === 'enhance');
    ok('forge: the press after a fault still names the level the anvil shows',
      fgPresses.length === 3 && fgPresses[2].level === fgPresses[1].level && fgPresses[2].level > 0,
      JSON.stringify(fgPresses.map((m) => m.level)));

    // The money on a state-less reply is the host's own figure, so the header takes it like any
    // other reply's: a panel that skipped the settle would leave the number where the fault found it
    const was = $('ccBal').textContent;
    faultOn('hl', ['open'], 777);
    openGame('hilo'); advance(1200);   // the header number is tweened, so it is read after it lands
    ok('the balance a state-less reply carries still lands in the header', $('ccBal').textContent === '777', was + ' -> ' + $('ccBal').textContent);

    ok('no handler threw on a reply with no state', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
