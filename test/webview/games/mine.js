// The credit mine's screen (docs/game-panels.md, 5-15).
//
// WHAT IS WORTH MEASURING HERE IS NOT WHAT IS WORTH MEASURING AT A TABLE. Nothing is dealt and
// nothing is pressed except one button, so the four things this file holds are:
//
//   1. the way in is a DOOR and not a row. The mine is in the register (it has an engine, a record
//      and money) and off the list (docs/shop-spec.md, 2-7), and those two are easy to get right
//      one at a time and wrong together
//   2. the band says the three things it is supposed to say WITHOUT a number: where the face is,
//      what is standing in front of it, and whether the pick gets there. The reach is a line in
//      the rock, so a durability figure appearing anywhere on the screen is a defect
//   3. the ground moves on a push NOBODY ASKED FOR, which is this game's whole mechanism: the
//      reader presses nothing, so a screen that only drew its own replies would never move
//   4. the swing's speed is the window's own rung and not a count of this screen's own
//
// The layout is a pure function of the depth (mine.js, bucketOf), so every figure below is exact
// rather than approximate: at the surface one gem stands at 40 m, and 100 m of digging passes two
// of them and comes to 22 credits. If the seam table is retuned these numbers move, and they are
// read off the engine here wherever reading them off it does not make the assertion circular.
'use strict';

module.exports = {
  id: 'mine',
  modes: ['mine', 'mine-reduce'],
  // Deep enough that no pick on the ladder is refused for money: what is being measured is a
  // screen, and a refused purchase is a different reply with a different rule
  start: { mine: 20000, 'mine-reduce': 20000 },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openDoor, rowFor, showing, toWebview, hostSend, skipAhead,
      pageNow, gs, credits, errors, EXT, path } = h;
    const engine = require(path.join(EXT, 'mine.js'));
    const reduce = MODE === 'mine-reduce';

    const panel = () => $('panel-mine');
    const ores = () => [].slice.call(doc.querySelectorAll('#mnSlide .mn-ore'));
    const leftOf = (e) => (e.style && e.style.left) || '';
    const text = (id) => { const e = $(id); return e ? e.textContent : ''; };
    const dig = () => $('mnCrab').classList.contains('dig');
    const digMs = () => ($('mnCrab').style || {}).animationDuration || '';
    // a position in per cent of the lookahead, the way the panel works it out: a depth the host
    // declared over a window the host declared
    const pct = (m) => (Math.round(m / engine.AHEAD_M * 100 * 100) / 100) + '%';
    const mnSent = () => h.sent('mn');
    const mnGot = () => h.hostLog.filter((e) => e.type === 'mn').length;

    // --- 1. the door ------------------------------------------------------------------------------
    ok('the mine has no row on the games list', !rowFor('mine'), 'there is a row for it');
    openDoor('mine');
    ok('its door opens the screen itself rather than a list of one',
      showing('panel-mine') && !showing('panelGames') && !showing('panelCross'), h.bodyTabs());
    ok('and the heading names what the screen does, not where the door went',
      text('mnTtl') === 'Credit mine', JSON.stringify(text('mnTtl')));

    // --- 2. the band at the surface ---------------------------------------------------------------
    //
    // A reader who has never dug: no pick, so the reach is 0, and 0 is the whole of what "bare
    // hands" is (mine.js sends no flag for it). The line sits on the face and the veil covers every
    // bit of rock, which is the third row of 5-15's table
    const first = engine.seamsAhead(0);
    ok('the drift is one band: dug ground, a lookahead, and the crab standing at the face',
      !!doc.querySelector('#mnDrift .mn-cut') && !!doc.querySelector('#mnDrift .mn-rock')
      && !!$('mnCrab'), $('mnDrift').innerHTML.slice(0, 80));
    ok('the crab is drawn from the 16-frame strip the register handed over',
      /mine-dig\.png/.test(($('mnCrab').style || {}).backgroundImage || ''),
      ($('mnCrab').style || {}).backgroundImage);
    ok('every seam inside the lookahead is drawn, and nothing else is',
      ores().length === first.length && ores().every((e) => /mn-ore (gem|relic|fever)/.test(e.className)),
      ores().length + ' marker(s) for ' + first.length + ' seam(s)');
    ok('and each one stands at its own depth, in per cent of the lookahead',
      ores().map(leftOf).join() === first.map((s) => pct(s.at - 0)).join(),
      ores().map(leftOf).join() + ' vs ' + first.map((s) => pct(s.at)).join());
    ok('with no pick, the line is on the face and the whole wall is out of reach',
      !$('mnReach').hidden && !$('mnVeil').hidden && leftOf($('mnReach')) === '0%',
      [$('mnReach').hidden, leftOf($('mnReach')), $('mnVeil').hidden].join(' / '));
    ok('and one line says why rather than the crab being dimmed',
      !$('mnNote').hidden && /bare hands/i.test(text('mnNote')), JSON.stringify(text('mnNote')));
    ok('nothing has come out yet, and the line that will say so is already there',
      text('mnLast') === 'nothing yet', JSON.stringify(text('mnLast')));

    // THE TWO THINGS THAT MAY NOT BE ON THIS SCREEN (5-15). The reach is a line and the drive is a
    // swing, so a figure for either one is the screen answering a question it was built not to ask
    const onScreen = () => panel().textContent;
    ok('there is not one per cent sign on the screen', onScreen().indexOf('%') < 0,
      JSON.stringify(onScreen()));
    ok('and the band itself carries no text at all', $('mnDrift').textContent === '',
      JSON.stringify($('mnDrift').textContent));

    // --- 3. one button, and it is not the primary one ---------------------------------------------
    const buy = () => $('mnBuy');
    ok('the one control is a button that is not primary',
      !buy().hidden && !buy().disabled && !buy().className.split(/\s+/).includes('primary'),
      buy().className + ' / ' + buy().textContent);
    const offer = engine.offerFor(engine.fresh('', 1), 1);
    ok('and it carries the price the host set', text('mnBuy') === 'New pick ' + offer.price,
      JSON.stringify(text('mnBuy')));

    const before = h.ledgerBalance();
    buy().click(); advance(60);
    ok('fitting a pick is charged once, by the host, out of the record',
      h.ledgerBalance() === before - offer.price, before + ' -> ' + h.ledgerBalance());
    ok('and the record is in the ledger rather than in this window',
      !!gs.data.creditLedgerV1.mine && gs.data.creditLedgerV1.mine.pick === 1,
      JSON.stringify(gs.data.creditLedgerV1.mine));
    // A fresh tier-1 pick reaches 150 m of a 63 m window, so there is nothing to warn about: the
    // line and its veil go, which is the first row of 5-15's table
    advance(400);
    ok('a pick that reaches past the window draws no line and no veil',
      $('mnReach').hidden && $('mnVeil').hidden,
      [$('mnReach').hidden, $('mnVeil').hidden].join(' / '));
    ok('and the note goes with it', $('mnNote').hidden || !text('mnNote'), JSON.stringify(text('mnNote')));
    ok('the button now offers the next rung up', /500/.test(text('mnBuy')), JSON.stringify(text('mnBuy')));

    // --- 4. the ground moves on a push nobody asked for -------------------------------------------
    //
    // The depth is a function of the ledger's whole weighted token count and of nothing else
    // (mine.js), so the way to dig in a test is to do the work: another day of input tokens, which
    // weigh 1 each. 10 MT of the tier-1 pick's 15 MT is 100 m dug and 50 m of reach left
    const DUG_TOK = 10000000;
    const asked = mnSent().length, got = mnGot();
    gs.data.creditLedgerV1.days['2026-09-02'] =
      { input: DUG_TOK, output: 0, cache_creation: 0, cache_read: 0 };
    hostSend({ type: 'ready' });          // the host's own push, which is what runs onPush
    advance(20);
    ok('the host redraws the drift on a push, with nobody having asked',
      mnGot() > got && mnSent().length === asked,
      (mnGot() - got) + ' reply(s), ' + (mnSent().length - asked) + ' request(s)');

    const tok = credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1));
    const rec = engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, tok);
    const want = engine.view(rec, 1e9, tok, null);
    ok('the depth the tokens dug is what the corner says',
      text('mnSide') === want.depth.toLocaleString('en-US') + ' ' + want.unit,
      JSON.stringify(text('mnSide')) + ' vs ' + want.depth);
    ok('the ground that was paid for is behind the face now',
      ores().length === want.seam.length
      && ores().map(leftOf).join() === want.seam.map((s) => pct(s.at - want.depth)).join(),
      ores().map(leftOf).join() + ' vs ' + want.seam.map((s) => pct(s.at - want.depth)).join());
    // ...AND THE LINE IS NOW INSIDE THE ROCK, which is the one state of the three that is a warning
    ok('a pick worn to less than the lookahead puts the line in the rock',
      !$('mnReach').hidden && !$('mnVeil').hidden && leftOf($('mnReach')) === pct(want.reach),
      leftOf($('mnReach')) + ' vs ' + pct(want.reach));

    // The find: a chip in the line under the well, and the pacing that gets it there. 240ms, and
    // the reduced-motion page has it at once (docs/game-panels.md, section 6)
    advance(reduce ? 5 : 300);
    ok('what came out of the wall is named and priced on one chip',
      /Garnet/.test(text('mnLast')) && /22/.test(text('mnLast')), JSON.stringify(text('mnLast')));
    ok('and it is read out once, since the band is a picture',
      /Garnet/.test(text('mnLive')), JSON.stringify(text('mnLive')));
    ok('the durability is still nowhere on the screen', onScreen().indexOf('%') < 0,
      JSON.stringify(onScreen()));

    // --- 5. a fever: the ground runs, and the seams in it go one at a time ------------------------
    //
    // The 1,200ms dash is the one event on this screen that is bigger than a chip, and it is the
    // first owner of section 6's "press the gaps together, do not cut the tail off". Reaching one
    // is arithmetic rather than luck: the layout is a pure function of the depth, so the first fever
    // in the drift stands at a known cell and digging past it is a number of tokens.
    // Two rungs of pick are fitted first, because the ground to it is further than a tier-1 pick
    // lasts and bare hands would make this a 6,560 m test
    $('mnBuy').click(); advance(400);     // the iron pick
    $('mnBuy').click(); advance(400);     // ...and the steel one, which lasts past the fever
    const DASH_MT = 82;
    gs.data.creditLedgerV1.days['2026-09-03'] =
      { input: DASH_MT * 1000000, output: 0, cache_creation: 0, cache_read: 0 };
    const deep = engine.sweep(engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0),
      credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1)));
    ok('the ledger digs past a fever, which is what the rest of this block is about',
      !!deep.claim && deep.claim.grant > 0 && deep.claim.dashHits > 0,
      JSON.stringify(deep.claim && { grant: deep.claim.grant, hits: deep.claim.dashHits }));
    const popped = () => doc.querySelectorAll('#mnSlide .mn-ore').filter((e) => /pop/.test(e.className)).length;
    const standing = () => ores().length;
    const was = standing();
    // what the band holds once the run has stopped: the seams ahead of the depth the fever reached
    const after = engine.seamsAhead(deep.claim.depth).length;
    const biggest = deep.claim.finds.reduce((a, f) => (a && a.pay >= f.pay ? a : f), null).name;
    hostSend({ type: 'ready' }); advance(20);
    if (reduce) {
      ok('reduced motion draws the whole run at once, with nothing bursting',
        popped() === 0 && standing() === after && text('mnLast').indexOf(biggest) === 0,
        popped() + ' popping, ' + standing() + ' standing, ' + JSON.stringify(text('mnLast')));
    } else {
      ok('the ground on screen runs past the face rather than being redrawn',
        /translateX\(-/.test(($('mnSlide').style || {}).transform || '')
        && /1200ms linear/.test(($('mnSlide').style || {}).transition || '')
        && standing() === was,
        [($('mnSlide').style || {}).transform, ($('mnSlide').style || {}).transition,
          standing() + ' standing'].join(' / '));
      // ONE AT A TIME, and the gap is the run divided by the seams it passes, floored at 70ms
      // (docs/game-panels.md, section 6). Four of them over 1,200ms is one every 300
      const gap = Math.max(70, 1200 / deep.claim.dashHits);
      ok('the first of them goes as the run starts', popped() === 1, popped() + ' popping');
      advance(Math.round(gap));
      ok('and the next one a gap later, not all of them together', popped() === 2, popped() + ' popping');
      advance(1300 - Math.round(gap));
      ok('when the running stops the new ground is drawn', standing() === after,
        standing() + ' marker(s) for ' + after);
      ok('and nothing has been said about the money yet',
        text('mnLast').indexOf(biggest) < 0, JSON.stringify(text('mnLast')));
      advance(200);
      ok('the run is then named and priced on one chip, after the ground has stopped',
        text('mnLast').indexOf(biggest) === 0, JSON.stringify(text('mnLast')));
    }
    ok('the fever\'s ground is in the depth the corner shows',
      text('mnSide') === deep.claim.depth.toLocaleString('en-US') + ' m',
      JSON.stringify(text('mnSide')) + ' vs ' + deep.claim.depth);

    // --- 6. the swing is the window's rung ---------------------------------------------------------
    //
    // Not a reading of this screen's own: the Usage tab draws a crab from the same rung, and two
    // crabs in one window that disagreed about whether it is quiet would be two answers to one
    // question (5-15, the mascot axis). So the drive is pushed the way the host pushes it and the
    // only thing checked here is that the swing followed.
    // THE DWELL FLOOR IS A MINUTE (webview.js, DWELL_MS), so the clock is stepped between rungs
    const DWELL = 61000;
    const push = (drive, quiet) => {
      toWebview({
        type: 'data',
        data: {
          agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
          credits: { balance: h.ledgerBalance(), today: 0, frac: 0, perCredit: 10000, counting: false },
          fh: { used_percentage: 42, resets_at: Math.floor(pageNow() / 1000) + 3600 },
          sd: { used_percentage: 40, resets_at: Math.floor(pageNow() / 1000) + 3600 },
          last: quiet ? null : { t: pageNow() },
          drive: drive
        }
      });
      advance(20);
    };
    ok('nothing is swinging before a push says anything about the machine', !dig(), digMs());
    skipAhead(DWELL); push(2.5, false);
    ok('a window being worked swings the strip' + (reduce ? ', unless the reader asked for less motion' : ''),
      dig() === !reduce, 'dig=' + dig() + ' ' + digMs());
    if (!reduce) {
      ok('and at the pace the rung says, off the asset\'s own 1,760ms', digMs() === '1320ms', digMs());
      skipAhead(DWELL); push(6, false);
      ok('a window flat out swings faster', digMs() === '990ms', digMs());
      // SPENT IS BURNING'S FIGURE, which is this panel's own decision: anything faster would draw
      // "out of it" as "trying harder than ever" (games/mine/panel.js, MN_DIG)
      skipAhead(DWELL); push(3.4, false);
      ok('and the top two rungs are the same speed, so the last one is not the keenest',
        digMs() === '990ms', digMs());
    }
    skipAhead(DWELL); push(0, true);
    ok('and a quiet window stops it on the frame where the crab is standing', !dig(), digMs());

    // --- 7. one arrow, one step -------------------------------------------------------------------
    $('mnBack').click(); advance(20);
    ok('the arrow goes to the crossroads, because there is no list behind this door',
      showing('panelCross') && !showing('panel-mine') && !showing('panelGames'), h.bodyTabs());

    ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
