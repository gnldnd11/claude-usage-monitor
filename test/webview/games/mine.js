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
  // `mine-tiers` is the fifth thing this file holds and it arrived with 1.40.1: WHICH pick is in
  // hand became something the band draws, so there is a picture that has four values and a fifth
  // for none, and four of those five cannot be reached without spending 14,240 credits in order
  modes: ['mine', 'mine-reduce', 'mine-tiers'],
  // Deep enough that no pick on the ladder is refused for money: what is being measured is a
  // screen, and a refused purchase is a different reply with a different rule
  start: { mine: 20000, 'mine-reduce': 20000, 'mine-tiers': 40000 },

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
    // THE THREE THAT SWING TOGETHER. The crab is a strip, the pick is a rotation and the mark is
    // an opacity, and they are one movement: a duration that was written in three places would
    // eventually be three durations and the pick would lag the arm holding it
    const SWING = ['mnCrab', 'mnPick', 'mnHit'];
    const swingMs = () => SWING.map((id) => (($(id) || {}).style || {}).animationDuration || '-');
    const swinging = () => SWING.map((id) => !!($(id) && $(id).classList.contains('dig')));
    // which rung the band is drawing, read off the class rather than off anything this file knows
    const rungOf = (id) => {
      const m = /\bt([1-9])\b/.exec(($(id) || { className: '' }).className || '');
      return m ? Number(m[1]) : 0;
    };
    const css = () => doc.querySelector('style').textContent;
    // a position in per cent of the lookahead, the way the panel works it out: a depth the host
    // declared over a window the host declared
    const pct = (m) => (Math.round(m / engine.AHEAD_M * 100 * 100) / 100) + '%';
    const mnSent = () => h.sent('mn');
    const mnGot = () => h.hostLog.filter((e) => e.type === 'mn').length;

    // --- 0. the rungs, which need their own page -----------------------------------------------
    //
    // WHICH PICK IS IN HAND IS A PICTURE NOW, so it has five values and four of them cost money.
    // This block climbs the ladder, watches the drawing change on each rung, puts a seam the pick
    // cannot take in the window, and then digs the top pick to nothing to see the band go back to
    // bare hands (docs/mine-mockup/spec.md, sections 8 to 10).
    if (MODE === 'mine-tiers') {
    openDoor('mine');
    // the swing is off until the window says the machine is working, and the rung's speed is
    // where the three elements can start to disagree, so the drive goes in first
    skipAhead(61000);
    toWebview({
      type: 'data',
      data: {
        agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
        credits: { balance: h.ledgerBalance(), today: 0, frac: 0, perCredit: 10000, counting: false },
        fh: { used_percentage: 42, resets_at: Math.floor(pageNow() / 1000) + 3600 },
        sd: { used_percentage: 40, resets_at: Math.floor(pageNow() / 1000) + 3600 },
        last: { t: pageNow() }, drive: 2.5
      }
    });
    advance(20);
    ok('with no pick there is nothing in the crab\'s claw and no mark on the rock',
      $('mnPick').hidden && $('mnHit').hidden, [$('mnPick').hidden, $('mnHit').hidden].join(' / '));
    ok('...and the crab swings anyway, because bad news is not told by switching it off',
      swinging()[0] === true, swinging().join());

    // ONE RUNG AT A TIME, and the drawing on each is a different one. The engine's ladder is read
    // rather than listed: a fifth pick added there would be a fifth pass of this loop
    for (let t = 1; t <= engine.TOP_TIER; t++) {
      $('mnBuy').click(); advance(400);
      ok('rung ' + t + ' is in the claw and marks the rock with its own star',
        rungOf('mnPick') === t && rungOf('mnHit') === t
        && !$('mnPick').hidden && !$('mnHit').hidden,
        'pick t' + rungOf('mnPick') + ', hit t' + rungOf('mnHit'));
      // THE PICK IS CHOSEN BY `tier` AND NOT BY THE RECEIPT. Both agree while the pick is whole,
      // so this only bites at the end of the block, where they do not
      const want = engine.view(
        engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0),
        1e9, credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1)), null);
      ok('and it is the rung the host says is in hand', rungOf('mnPick') === want.tier,
        't' + rungOf('mnPick') + ' vs tier ' + want.tier);
      ok('the crab, the pick and the mark are one movement at one speed',
        new Set(swingMs()).size === 1 && swinging().every(Boolean),
        swingMs().join() + ' / ' + swinging().join());
      // a seam the pick in hand cannot take, while there is still a rung above the one fitted.
      // The Old coin at 180 m is gate 3, so at rungs 1 and 2 it is drawn with rock over it
      if (t === 2) {
        gs.data.creditLedgerV1.days['2026-09-04'] =
          { input: 13000000, output: 0, cache_creation: 0, cache_read: 0 };
        hostSend({ type: 'ready' }); advance(400);
        const st = engine.view(
          engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0),
          1e9, credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1)), null);
        const shut = st.seam.filter((s) => s.locked).length;
        ok('the window holds a seam this rung cannot take, which is what the next one is for',
          shut > 0, JSON.stringify(st.seam));
        ok('and it is drawn with rock still over it, one marker at a time',
          ores().filter((e) => /\blocked\b/.test(e.className)).length === shut
          && ores().map((e) => /\blocked\b/.test(e.className)).join()
            === st.seam.map((s) => !!s.locked).join(),
          ores().map((e) => e.className).join(' | '));
        ok('the fold says the same thing in words, with the rung that opens it named',
          /\bmn-shut\b/.test($('mnPays').innerHTML)
          && st.pays.filter((r) => r.locked).every((r) => $('mnPays').textContent.indexOf(r.needs) >= 0),
          $('mnPays').textContent);
      }
    }
    ok('the top rung is the last one the ladder draws', rungOf('mnPick') === engine.TOP_TIER,
      't' + rungOf('mnPick') + ' of ' + engine.TOP_TIER);
    ok('nothing in the rock is locked to the top pick any more',
      ores().every((e) => !/\blocked\b/.test(e.className)),
      ores().map((e) => e.className).join(' | '));

    // ...AND THE PICK WEARS OUT. This is the one state where the record and the hand disagree: the
    // ledger still says a tier-4 pick was bought, and there is nothing in the claw
    gs.data.creditLedgerV1.days['2026-09-05'] =
      { input: 4000 * 1000000, output: 0, cache_creation: 0, cache_read: 0 };
    hostSend({ type: 'ready' }); advance(1600);
    const worn = engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0);
    const tok = credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1));
    ok('the record still shows the pick that was bought, and the hand is empty',
      worn.pick === engine.TOP_TIER && engine.tierOf(worn, tok) === 0,
      'pick ' + worn.pick + ', tier ' + engine.tierOf(worn, tok));
    ok('so the band draws no pick and no mark, off the hand and not off the receipt',
      $('mnPick').hidden && $('mnHit').hidden && rungOf('mnPick') === 0,
      [$('mnPick').hidden, $('mnHit').hidden, 't' + rungOf('mnPick')].join(' / '));
    ok('and the crab is still swinging, at the same speed as before',
      swinging()[0] === true && new Set(swingMs()).size === 1,
      swingMs().join() + ' / ' + swinging().join());

    // THE MARK IS TWO FRAMES OF SIXTEEN AND NOT A LAMP. A star that was up for the whole loop
    // would say the crab is striking continuously, which is what the arc in the strip already
    // says it is not doing: the keyframe has to go back to nothing before the loop ends
    const hitKf = (/@keyframes mnHit\{((?:[^{}]|\{[^{}]*\})*)\}/.exec(css()) || ['', ''])[1];
    ok('the blow is marked on two frames of the sixteen, not on all of them',
      /0%\{opacity:0;?\}/.test(hitKf) && /37\.5%\{opacity:1;?\}/.test(hitKf)
      && /50%\{opacity:0;?\}/.test(hitKf),
      JSON.stringify(hitKf));
    ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
    return;
    }

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
    // THE HOLE HAS AN INSIDE. Two rectangles of different greys were what shipped in 1.39.0 and
    // what came back was that it is two rectangles: the pair cannot be told apart by tone at any
    // wash (every value from .45 to .30 lands inside 1.35 and 1.41 against the rock, measured),
    // so what says "somebody dug this" is the furniture. All of it is built once and none of it
    // moves, which is why it is checked here and never again
    ok('the dug hole is a place and not a dark rectangle: a floor, its lip, sleepers and timber',
      !!doc.querySelector('#mnDrift .mn-cut .mn-floor')
      && !!doc.querySelector('#mnDrift .mn-cut .mn-brow')
      && doc.querySelectorAll('#mnDrift .mn-sill').length === 7
      && doc.querySelectorAll('#mnDrift .mn-beam').length
        === doc.querySelectorAll('#mnDrift .mn-post').length / 2,
      doc.querySelectorAll('#mnDrift .mn-sill').length + ' sleepers, '
      + doc.querySelectorAll('#mnDrift .mn-beam').length + ' caps, '
      + doc.querySelectorAll('#mnDrift .mn-post').length + ' posts');
    // UNEVENLY SPACED, both of them. Seven sleepers at one pitch is a ladder and four frames at
    // one pitch would be a fence, so the sleepers are the ones that have to be irregular
    const sillX = [].slice.call(doc.querySelectorAll('#mnDrift .mn-sill'))
      .map((e) => parseFloat((e.style || {}).left || '0'));
    const gaps = sillX.slice(1).map((x, i) => x - sillX[i]);
    ok('and the sleepers are not evenly spaced, or they would be the rungs of a ladder',
      gaps.length === 6 && new Set(gaps).size > 1, gaps.join(','));
    // FIVE PICTURES, ONE ELEMENT. The crab's strip and the four pieces the drift is cut from are
    // the host's URIs, and they arrive on the band as custom properties because three of them are
    // worn by nineteen boxes: one inline image per box is nineteen chances to set the wrong one
    // read off the ATTRIBUTE and not off `style`, which is where a custom property actually is:
    // the DOM only exposes them through getPropertyValue, so the attribute is the honest reading
    // in a browser and the only reading at all in this harness
    const bandStyle = $('mnDrift').getAttribute('style') || '';
    const hasArt = (f) => new RegExp('--mn-[a-z]+:url\\("[^"]*' + f + '"\\)').test(bandStyle);
    ok('the crab is drawn from the 16-frame strip the register handed over',
      hasArt('mine-dig\\.png'), bandStyle);
    ok('and the rock, the cap, the post and the sleeper are cut from the door\'s own picture',
      ['mine-rock', 'mine-beam', 'mine-post', 'mine-sill'].every((f) => hasArt(f + '\\.png')),
      bandStyle);
    // NOT PIXELATED, and this one is a standing condition rather than a line of the fix:
    // hero-mine.png is pixel art that was already smooth-scaled up before it reached this repo
    // (21,204 colours), so nearest-neighbour breaks it into blocks
    ok('the pieces are scaled smoothly, like the heroes they are cut out of',
      !/\.mn-(drift|cut|floor|beam|post|sill)\{[^}]*image-rendering/.test(css()),
      (/\.mn-drift\{[^}]*\}/.exec(css()) || [''])[0].slice(0, 90));
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
      text('mnLast') === 'No finds yet', JSON.stringify(text('mnLast')));
    ok('and bare hands carry no pick and leave no mark, while the crab keeps swinging',
      $('mnPick').hidden && $('mnHit').hidden && rungOf('mnPick') === 0,
      [$('mnPick').hidden, $('mnHit').hidden, 't' + rungOf('mnPick')].join(' / '));

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
    // THE BUTTON NAMES WHAT IT FITS. It read "New pick 12,500" until 1.40.1, which made the four
    // rungs four identical presses at rising prices with the thing being bought named nowhere on
    // the screen. Both halves are the host's (mine.offerFor) and neither is written out here
    const offer = engine.offerFor(engine.fresh('', 1), 1);
    ok('and it carries the name and the price the host set',
      text('mnBuy') === offer.name + ' ' + offer.price, JSON.stringify(text('mnBuy')));

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
    // the next rung's own price, off the engine: the ladder is priced against what each rung can
    // take out of the wall (mine.js, the picks), so a literal here would be a figure typed twice
    ok('the button now offers the next rung up',
      text('mnBuy').indexOf(String(engine.PICKS[1].price)) >= 0, JSON.stringify(text('mnBuy')));

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
    // THE THREE STOP AND START TOGETHER, which is the same rule as the one duration: a pick that
    // kept swinging beside a crab that had stopped would be worse than either one moving alone,
    // and a reader who asked for less motion asked for all of it
    ok(reduce ? 'and the pick and the mark stop with it, not just the crab'
      : 'and the pick and the mark swing with it, on one duration',
      swinging().every((v) => v === !reduce) && (reduce || new Set(swingMs()).size === 1),
      swinging().join() + ' / ' + swingMs().join());
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
