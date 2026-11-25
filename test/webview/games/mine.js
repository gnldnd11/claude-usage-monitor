// The credit mine's screen (docs/game-panels.md, 5-15).
//
// WHAT IS WORTH MEASURING HERE IS NOT WHAT IS WORTH MEASURING AT A TABLE. Nothing is dealt and
// nothing is pressed except one button, so the four things this file holds are:
//
//   1. the way in is a DOOR and not a row. The mine is in the register (it has an engine, a record
//      and money) and off the list (docs/shop-spec.md, 2-7), and those two are easy to get right
//      one at a time and wrong together
//   2. the band says the two things it is supposed to say WITHOUT a number: where the face is and
//      what is standing in front of it. It used to say a third, which is how far the pick in hand
//      could still cut, drawn as a line in the rock with a veil over the ground past it; nothing
//      wears out since 1.41.0, so that distance does not exist and neither does its picture. A
//      durability figure, a line or a veil appearing anywhere on this screen is a defect
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
  // for none, and four of those five cannot be reached without spending 14,240 credits in order.
  //
  // THREE MORE ARRIVED WITH 1.41.0, and each one is a thing that was shipped twice without being
  // looked at (docs/mine-mockup/spec-dig.md):
  //   mine-break  A STONE BREAKING. The band had no pixel that ever changed place, which is why
  //               "I cannot tell it is digging" was a true reading of it. The grit, the step into
  //               the hole, and the three sizes of the event (nothing / one a swing / one dash)
  //   mine-bag    THE BAG AND ITS BUTTON, which replaced every sentence under the band. Empty,
  //               two kinds, and a sale -- a sale being one press and several messages
  //   mine-glow   THE LIGHT ON THE PICK, which is the only thing a hundred steps buy that can be
  //               seen. Five bands off `step`, and it has to survive reduced motion
  //
  // SIX MORE ARRIVED WITH THE CAMERA, which is what this release gave the band. Every one of
  // them is a state that was shipped twice without being looked at (docs/mine-mockup/spec-idle.md):
  //   mine-camera      THE CRAB WALKS AND THE WORLD STANDS STILL. One push moves the face and
  //                    nothing else; the push that fills the camera's stop moves every layer by
  //                    exactly one stride in one duration. Both rejections about the conveyor belt
  //   mine-edge        NO MARKER IS PARKED ON THE EDGE EVER AGAIN. The clamp that sawed a relic in
  //                    half, and the 28px the markers now fade out over
  //   mine-cull        THE HOST THAT SENDS NO `cell`: what the fallback stride costs, and the one
  //                    state in which a marker is outside the band rather than over its edge
  //   mine-rest        THE GAP AT THE FACE, which is the whole of "so it only works when I work?"
  //   mine-rest-bare   ...and the same with nothing bought, where the gap is all there is
  //   mine-work-reduce THE THIRD PICTURE: busy, with less motion asked for. The crab is ON the
  //                    face, which is what makes the quiet window's gap mean something
  //
  // TWO MORE ARRIVED WITH 1.41.0'S SECOND READING, which was two sentences: "the gems do not feel
  // stuck in that ore at all" and "it does not feel like the stone is being cut"
  // (docs/mine-mockup/spec-ore.md). Between them the pair covers four states:
  //   mine-seam  A MARKER IN THE WALL, open and locked. The pocket cut into the rock, the broken
  //              bottom edge that interrupts the silhouette, and the lock being the COLOUR OF THE
  //              LIT FACE rather than a shelf of rock laid over the drawing
  //   mine-bite  THE MARK A BLOW LEAVES, and the quiet wall that has none. Nothing in the rock
  //              ever changed when a stone broke, which is what the second sentence was about
  modes: ['mine', 'mine-reduce', 'mine-tiers', 'mine-break', 'mine-bag', 'mine-glow',
    'mine-camera', 'mine-edge', 'mine-cull', 'mine-rest', 'mine-rest-bare', 'mine-work-reduce',
    'mine-seam', 'mine-bite'],
  // Deep enough that no pick on the ladder is refused for money: what is being measured is a
  // screen, and a refused purchase is a different reply with a different rule. The glow page
  // climbs the WHOLE hundred steps, which is 410,383 credits
  start: {
    mine: 20000, 'mine-reduce': 20000, 'mine-tiers': 40000,
    'mine-break': 20000, 'mine-bag': 20000, 'mine-glow': 600000,
    // the camera pages buy one step and then dig, so they need a purse and nothing more.
    // `mine-rest-bare` is the exception: it buys NOTHING, which is the state it is about
    'mine-camera': 20000, 'mine-edge': 20000, 'mine-cull': 20000,
    'mine-rest': 20000, 'mine-rest-bare': 1000, 'mine-work-reduce': 20000,
    // the two drawing pages buy the first step and then dig, like the camera pages
    'mine-seam': 20000, 'mine-bite': 20000
  },

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
    // THE FOUR THAT SWING TOGETHER. The crab is a strip, the pick is a rotation, the step is a
    // translate on the box holding both, and the grit is five little flights, and they are ONE
    // movement: a duration written in four places would eventually be four durations and the pick
    // would lag the arm holding it. The mark that used to be the third of them is gone (1.41.0):
    // it stood 15px from where the pick actually lands and the strip already draws sparks there
    const SWING = ['mnCrab', 'mnPick', 'mnDig'];
    const chips = () => [].slice.call(($('mnChips') || { children: [] }).children);
    const swingMs = () => SWING.map((id) => (($(id) || {}).style || {}).animationDuration || '-')
      .concat(chips().map((e) => (e.style || {}).animationDuration || '-'));
    // ...and the two that carry the LOOP's own class. The step and the grit ride the same duration
    // but are one-shots: they are switched on when a stone actually breaks and not by the loop
    const swinging = () => ['mnCrab', 'mnPick'].map((id) => !!($(id) && $(id).classList.contains('dig')));
    // which band the drawing is, and which of the five lights, read off the class rather than off
    // anything this file knows
    const rungOf = (id) => {
      const m = /\bt([1-9])\b/.exec(($(id) || { className: '' }).className || '');
      return m ? Number(m[1]) : 0;
    };
    const glowOf = () => {
      const m = /\bg([0-9])\b/.exec(($('mnPick') || { className: '' }).className || '');
      return m ? Number(m[1]) : 0;
    };
    // the grit in flight, and the one step into the hole: both are one-shot classes the panel puts
    // on and the keyframes take off, so what is counted is how many pieces are flying at once
    const bursting = () => chips().filter((e) => /\bburst\b/.test(e.className)).length;
    const stepping = () => !!($('mnDig') && $('mnDig').classList.contains('step'));
    const sack = () => [].slice.call(($('mnHeap') || { children: [] }).children);
    const piles = () => sack().map((e) => (e.firstElementChild || { className: '?' }).className
      + ':' + (e.children[1] || { textContent: '?' }).textContent);
    const css = () => doc.querySelector('style').textContent;
    // ...AND THE SAME SHEET WITH THE COMMENTS TAKEN OUT. A rule that must NOT exist cannot be
    // read for in the raw text: every one of these rules is argued in a comment above it, so a
    // search for the selector finds the sentence explaining why it is absent and reports it
    // present. Checked against this instead, "there is no such rule" means what it says
    const decls = () => css().replace(/\/\*[\s\S]*?\*\//g, '');
    // WHERE A DEPTH IS ON THE BAND, the way the panel works it out (docs/mine-mockup/spec-idle.md,
    // 1-1): the band is a map of `behind + ahead` metres with the camera's own stop at 40% of it,
    // so an absolute depth has one place on the band and it does not depend on where the face is.
    // Every figure here is the host's -- the window, the stride, the depth -- so none of this is
    // the test working out what the panel ought to say from the same mistake
    const SPAN = engine.BEHIND_M + engine.AHEAD_M;
    const TRAVEL = engine.CELL_M / 3;
    const anchorAt = (depth) => Math.floor(depth / TRAVEL) * TRAVEL;
    const at = (depth, anchor) => Math.round((40 + (depth - anchor) / SPAN * 100) * 100) / 100;
    const pct = (depth, anchor) => at(depth, anchor) + '%';
    // the face, which is the one thing on the band a push moves
    const facePct = () => Math.round((Number((/--mn-adv:([-\d.]+)%/
      .exec($('mnDrift').getAttribute('style') || '') || [0, '0'])[1]) + 40) * 100) / 100;
    const slipNow = () => Number((/--mn-slip:([-\d.]+)%/.exec($('mnDrift').getAttribute('style') || '')
      || [0, '0'])[1]);
    const msNow = () => (/--mn-panms:(\d+)ms/.exec($('mnDrift').getAttribute('style') || '')
      || [0, '0'])[1];
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
    ok('with no pick there is nothing in the crab\'s claw and nothing lit',
      $('mnPick').hidden && glowOf() === 0, [$('mnPick').hidden, 'g' + glowOf()].join(' / '));
    ok('...and the crab swings anyway, because bad news is not told by switching it off',
      swinging()[0] === true, swinging().join());

    // ONE BAND AT A TIME, and the drawing on each is a different one. THE LADDER IS A HUNDRED STEPS
    // AND FOUR DRAWINGS (1.41.0): the four looks are the four gate steps, so this loop climbs to
    // each of those rather than pressing the button four times. The engine's own table is read
    // rather than listed, so a fifth band there would be a fifth pass of this loop
    const ledgerNow = () => credits.normalizeLedger(gs.data.creditLedgerV1);
    const stepNow = () => engine.load(ledgerNow().mine, 0).step;
    const viewNow = () => engine.view(engine.load(ledgerNow().mine, 0), 1e9,
      credits.weightedTotal(ledgerNow()), null, -1);
    for (let t = 1; t <= engine.BANDS.length; t++) {
      const target = engine.BANDS[t - 1];
      let presses = 0;
      while (stepNow() < target && presses < 200) { $('mnBuy').click(); advance(20); presses += 1; }
      advance(400);
      ok('band ' + t + ' is the drawing in the claw',
        rungOf('mnPick') === t && !$('mnPick').hidden,
        'pick t' + rungOf('mnPick') + ' at step ' + stepNow());
      // THE PICK IS CHOSEN BY `tier` AND NOT BY THE RECEIPT. Both agree while the pick is whole,
      // so this only bites at the end of the block, where they do not
      const want = viewNow();
      ok('and it is the band the host says is in hand', rungOf('mnPick') === want.tier,
        't' + rungOf('mnPick') + ' vs tier ' + want.tier);
      ok('the crab, the pick, the step and the grit are one movement at one speed',
        new Set(swingMs()).size === 1 && swinging().every(Boolean),
        swingMs().join() + ' / ' + swinging().join());
      // A SEAM THE PICK IN HAND CANNOT TAKE, while there is still a band above the one fitted. The
      // layout is a pure function of the metre, so the cell is LOOKED UP rather than guessed at:
      // the first one past the face holding a row this step has no key to, and then exactly enough
      // work to bring the face inside the lookahead of it
      if (t === 2) {
        const step = stepNow();
        const face = viewNow().depth;
        let want = 0;
        for (let c = Math.floor(face / engine.CELL_M) + 1; !want && c < 1e6; c++) {
          const seam = engine.seamAt(c);
          if (seam && seam.gate > step) want = c * engine.CELL_M - engine.AHEAD_M + 1;
        }
        ok('the layout holds a seam this band cannot take', want > face, want + ' vs face ' + face);
        gs.data.creditLedgerV1.days['2026-09-04'] =
          { input: (want - face) * engine.workOf(step), output: 0, cache_creation: 0, cache_read: 0 };
        hostSend({ type: 'ready' }); advance(400);
        const st = viewNow();
        const shut = st.seam.filter((s) => s.locked).length;
        ok('the window holds a seam this band cannot take, which is what the next one is for',
          shut > 0, JSON.stringify(st.seam) + ' at ' + st.depth);
        ok('and it is drawn with rock still over it, one marker at a time',
          ores().filter((e) => /\blocked\b/.test(e.className)).length === shut
          && ores().map((e) => /\blocked\b/.test(e.className)).join()
            === st.seam.map((s) => !!s.locked).join(),
          ores().map((e) => e.className).join(' | '));
        // ...AND THE FOLD THAT USED TO SAY IT IN WORDS IS GONE (1.41.0). The pay table went with
        // every other sentence on this screen: what a row is worth is taught by the bag's own
        // total, which is the reader's property rather than an abstract table. `pays` still
        // ARRIVES, because that is where a row's kind and price come from, and nothing prints it
        ok('and the fold that named the step it waits for is gone with the rest of the words',
          !$('mnPays') && !$('mnWhy') && st.pays.filter((r) => r.locked).length > 0
          && st.pays.every((r) => r.needs === undefined),
          [!!$('mnPays'), !!$('mnWhy'), JSON.stringify(st.pays[4])].join(' / '));
        // THE GATE IS STILL SAID WHERE IT COSTS NOTHING TO SAY IT: the band is aria-hidden art,
        // so a reader who has neither the veil nor the shelf is told in the label
        ok('but a reader who cannot see the shelf is still told about it',
          /needs a better pick/.test($('mnDrift').getAttribute('aria-label') || ''),
          $('mnDrift').getAttribute('aria-label'));
      }
    }
    ok('the top band is the last one the ladder draws', rungOf('mnPick') === engine.BANDS.length,
      't' + rungOf('mnPick') + ' of ' + engine.BANDS.length);
    ok('nothing in the rock is locked to the top pick any more',
      ores().every((e) => !/\blocked\b/.test(e.className)),
      ores().map((e) => e.className).join(' | '));

    // ...AND THE PICK DOES NOT WEAR OUT, WHATEVER ARRIVES. Until 1.41.0 this was the one state in
    // which the record and the hand disagreed: forty thousand million weighted tokens took the top
    // band's pick off the screen while the ledger still said it had been bought. That state is
    // gone, and this is where it would come back, so the same enormous day is pushed in and the
    // band has to be exactly where it was
    const bandBefore = rungOf('mnPick'), litBefore = glowOf();
    gs.data.creditLedgerV1.days['2026-09-05'] =
      { input: 40000 * 1000000, output: 0, cache_creation: 0, cache_read: 0 };
    hostSend({ type: 'ready' }); advance(1600);
    const worn = engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0);
    ok('a lifetime of work later the record still holds the top band, and so does the hand',
      worn.step === engine.BANDS[engine.BANDS.length - 1] && engine.bandIn(worn) === engine.BANDS.length,
      'step ' + worn.step + ', tier ' + engine.bandIn(worn));
    ok('so the band still draws that pick, lit the same, with nothing taken away',
      !$('mnPick').hidden && rungOf('mnPick') === bandBefore && bandBefore === engine.BANDS.length
      && glowOf() === litBefore,
      [$('mnPick').hidden, 't' + rungOf('mnPick') + ' was t' + bandBefore,
        'g' + glowOf() + ' was g' + litBefore].join(' / '));
    ok('and nothing in the rock went back to being locked',
      ores().every((e) => !/\blocked\b/.test(e.className)),
      ores().map((e) => e.className).join(' | '));
    ok('and the crab is still swinging, at the same speed as before',
      swinging()[0] === true && new Set(swingMs()).size === 1,
      swingMs().join() + ' / ' + swinging().join());
    // THE LINE AND THE VEIL ARE NOT ON THIS SCREEN AT ALL, which is the picture that went with the
    // distance: there are no such elements to hide, show or leave behind
    ok('and there is no reach line and no veil anywhere on the band',
      !$('mnReach') && !$('mnVeil') && !/mn-(reach|veil)/.test($('mnDrift').innerHTML),
      [!!$('mnReach'), !!$('mnVeil')].join(' / '));
    ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
    return;
    }

    // --- the three pages 1.41.0 added ------------------------------------------------------------
    //
    // A drive push, which is what turns the swing on: nothing on this screen bursts while the
    // window is quiet, because a stone breaking is part of a swing and there is no swing
    // ...and `quiet` says nothing has arrived for a while, which is the rung the gap at the face
    // hangs off (webview.js, QUIET_MS): no last reply and no drive
    const drivePush = (drive, quiet) => {
      toWebview({
        type: 'data',
        data: {
          agents: [], xp: {}, today: {}, count: 0, cfg: { panelHidden: [] },
          credits: { balance: h.ledgerBalance(), today: 0, frac: 0, perCredit: 10000, counting: false },
          fh: { used_percentage: 42, resets_at: Math.floor(pageNow() / 1000) + 3600 },
          sd: { used_percentage: 40, resets_at: Math.floor(pageNow() / 1000) + 3600 },
          last: quiet ? null : { t: pageNow() }, drive: drive
        }
      });
      advance(20);
    };
    const ledgerOf = () => credits.normalizeLedger(gs.data.creditLedgerV1);
    const tokOf = () => credits.weightedTotal(ledgerOf());
    const recOf = () => engine.load(ledgerOf().mine, 0);
    const seeNow = () => engine.view(recOf(), 1e9, tokOf(), null, -1);
    const stepOf = () => recOf().step;
    // DIGGING IS DOING THE WORK, so a number of stones is a number of tokens at the step in hand.
    // Input tokens weigh 1 (credits.js), and the day is REPLACED rather than added to, so the
    // figure handed in is the total this ledger has ever carried on that date
    let dug = 0;
    // ...and the same work said in TOKENS rather than in stones, which is the unit the one figure
    // that is not a count comes in: an ordinary reply is REPLY_TOK of work (mine.js) whatever step
    // is in hand, and how many stones that breaks is the thing being measured rather than the input
    const digTokens = (t) => {
      dug += t;
      gs.data.creditLedgerV1.days['2026-09-20'] =
        { input: dug, output: 0, cache_creation: 0, cache_read: 0 };
      hostSend({ type: 'ready' });
      advance(20);
    };
    const digStones = (n) => digTokens(n * engine.workOf(stepOf() || 1));
    // the keyframes of one animation, braces and all (the same reading the old mark's test used)
    const kf = (name) => (new RegExp('@keyframes ' + name + '\\{((?:[^{}]|\\{[^{}]*\\})*)\\}')
      .exec(css()) || ['', ''])[1];
    const rule = (sel) => (new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*\\}')
      .exec(css()) || [''])[0];
    // ...and the whole of one selector GROUP, commas and all, which is how "every layer moves" is
    // read: the mutation that breaks 4-4 is deleting one selector from a list, and a rule found by
    // its first selector alone would pass with the other two gone
    const group = (sel) => (new RegExp('[^{};*/]*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      + '[^{}]*\\{[^}]*\\}').exec(css()) || [''])[0];
    // THE DUG HOLE'S FURNITURE, by where it has been put on the band. Every piece is at a depth
    // now (spec-idle.md, section 6), so these are per cents and they all move together or the
    // whole point of the change is lost
    const sillsAt = () => [].slice.call(doc.querySelectorAll('#mnSills .mn-sill'))
      .map((e) => parseFloat((e.style || {}).left || '0'));
    // a post's own left is a calc() off its frame's base, so the base is what is read out of it
    const postsAt = () => [].slice.call(doc.querySelectorAll('#mnFrames .mn-post'))
      .map((e) => parseFloat((/(-?[\d.]+)%/.exec((e.style || {}).left || '') || [0, '0'])[1]));
    // HOW MANY OF A SET OF PLACES CAME BACK EXACTLY ONE STRIDE TO THE LEFT. The pieces are at
    // DEPTHS, so the camera moving changes which of them are in the hole as well as where they
    // are: the hole is shorter right after a stride (the face is back at its stop), so a count or
    // an element-by-element comparison would be comparing different pieces of timber. What is the
    // same for all of them is the DISTANCE each one travelled
    const slid = (now, was, by) => was.filter((p) =>
      now.some((x) => Math.abs(x - (p - by)) < 0.02)).length;
    // EVERY WRITE THE PANEL MAKES TO THE BAND, in order, with the class it was made under.
    // A catch-up is a TRANSITION, and a transition cannot be read off a DOM that never paints:
    // what can be read is the pair of writes that arms it -- the start value with the class off,
    // then the end value with it on -- which is the mechanism itself (panel.js, mnMove). Without
    // this a mode can only see where the world ended up, and "it arrived" is exactly what a panel
    // that teleported the world would also report
    const taps = [];
    const tapBand = () => {
      const b = $('mnDrift'), orig = b.setAttribute.bind(b);
      b.setAttribute = (k, v) => {
        orig(k, v);
        if (k === 'style') taps.push({ css: String(v), pan: b.classList.contains('pan') });
      };
    };
    const tapped = (t, name) => Number((new RegExp('--mn-' + name + ':([-\\d.]+)').exec(t.css)
      || [0, '0'])[1]);

    // --- a marker standing IN the wall ------------------------------------------------------------
    //
    // "the gems do not feel stuck in that ore at all". That reading was true and every condition
    // for it was present at once: a closed convex shape, one even ink keyline all the way round,
    // nothing in front of it, no shadow on it, and a place on the band that had nothing to do with
    // the rock behind it. This page is about the four pieces that answer it
    // (docs/mine-mockup/spec-ore.md) and about the one of them that does the work.
    //
    // THE LOCK IS A DIFFERENT PICTURE NOW AND NOT A LID. Every marker has rock in front of it, so
    // "there is rock over it" has stopped being available as a signal; what says locked is the
    // colour of the lit face and how much of the body is above the break
    if (MODE === 'mine-seam') {
      const ore = require(path.join(EXT, 'games', 'mine', 'ore.js'));
      const inWall = ore.KINDS.map((k) => ore.ART[k].open)
        .concat(ore.KINDS.map((k) => ore.ART[k].locked));
      const outOfWall = ore.KINDS.map((k) => ore.ART[k].bare);
      // THE POCKET IS THE PIECE A MUTATION WOULD TAKE OUT FIRST, because it is one string and the
      // markers still look like markers without it. It has to be on everything standing in the
      // wall and on nothing that has left it: a stone in the bag carrying a hole in the rock is
      // the same error the other way round
      ok('every marker standing in the wall is drawn down inside a pocket cut into it',
        inWall.every((s) => s.indexOf(ore.POCKET) >= 0),
        inWall.map((s) => s.indexOf(ore.POCKET) >= 0).join());
      ok('...and nothing that has left the wall carries one: what pops out is a stone, not a hole',
        outOfWall.every((s) => s.indexOf(ore.POCKET) < 0),
        outOfWall.map((s) => s.indexOf(ore.POCKET) < 0).join());
      ok('and the pocket has a lit floor, which is what reads as a hole rather than as a shadow',
        inWall.every((s) => s.indexOf(ore.RIM) >= 0)
        && outOfWall.every((s) => s.indexOf(ore.RIM) < 0),
        inWall.map((s) => s.indexOf(ore.RIM) >= 0).join());

      // THE BROKEN BOTTOM EDGE, which spec-ore.md calls the one line that kills the sticker. It is
      // read off the gem's own vertices because that is where the fact lives: a rendered page
      // cannot be asked whether an outline is interrupted, and a check that could only read the
      // finished picture would pass on a body whose bottom had been straightened out.
      // y10 IS THE GEM'S WAIST (its two side points are at y10), so "below the waist" is the lower
      // edge and nothing else.
      // THE WALKER IS WRITTEN OUT because the fact being checked is geometric and two of the three
      // bodies are drawn with RELATIVE commands: a check that only read the numbers in the string
      // would be reading offsets as positions. It covers the subset these six paths use
      const pts = (d) => {
        const t = d.match(/[MLlHhVvZz]|-?\d*\.?\d+/g) || [];
        const out = [];
        let cmd = '', x = 0, y = 0, i = 0;
        while (i < t.length) {
          if (/[A-Za-z]/.test(t[i])) { cmd = t[i]; i += 1; continue; }
          const n = Number(t[i]);
          if (cmd === 'M' || cmd === 'L') { x = n; y = Number(t[i + 1]); i += 2; cmd = 'L'; }
          else if (cmd === 'l') { x += n; y += Number(t[i + 1]); i += 2; }
          else if (cmd === 'h') { x += n; i += 1; }
          else if (cmd === 'H') { x = n; i += 1; }
          else if (cmd === 'v') { y += n; i += 1; }
          else if (cmd === 'V') { y = n; i += 1; }
          else { i += 1; }
          out.push([x, y]);
        }
        return out;
      };
      // ...and how many times that lower edge changes direction. A straight cut has none and a
      // single point has none either, so this is exactly the mutation it is here to catch
      const turns = (d) => {
        const low = pts(d).filter((p) => p[1] > 10).sort((a, b) => a[0] - b[0]);
        let n = 0;
        for (let i = 2; i < low.length; i++) {
          if ((low[i - 1][1] - low[i - 2][1]) * (low[i][1] - low[i - 1][1]) < 0) n += 1;
        }
        return n;
      };
      ok('a gem in the wall is broken off along the bottom rather than cut off straight',
        turns(ore.BODY.gem.open) >= 2 && turns(ore.BODY.gem.locked) >= 2,
        turns(ore.BODY.gem.open) + ' / ' + turns(ore.BODY.gem.locked) + ' turn(s) in the edge');
      ok('...and the one in the bag is whole, with one point under it and no break at all',
        turns(ore.BODY.gem.bare) === 0
        && pts(ore.BODY.gem.bare).filter((p) => p[1] > 10).length === 1,
        turns(ore.BODY.gem.bare) + ' turn(s), '
        + pts(ore.BODY.gem.bare).filter((p) => p[1] > 10).length + ' point(s) below the waist');
      // AND A LOCKED BODY KEEPS LESS OF ITSELF ABOVE THE BREAK, which is signal 2. It is read as
      // how far down the body goes, because that is what "more of it is still buried" means
      const deepest = (d) => Math.max.apply(null, pts(d).map((p) => p[1]));
      ok('and a locked one is buried deeper than an open one, in all three kinds',
        ore.KINDS.every((k) => deepest(ore.BODY[k].locked) < deepest(ore.BODY[k].open)),
        ore.KINDS.map((k) => k + ' ' + deepest(ore.BODY[k].locked)
          + ' vs ' + deepest(ore.BODY[k].open)).join(', '));

      // SIGNAL 1, WHICH IS THE ONE THAT IS A DICHOTOMY: the lit face is cream when the seam is
      // open and `stone` when it is not. cream is 1.62:1 brighter than the body and stone is
      // 2.05:1 darker, so what flips is the SIGN of the step and not its size -- and because the
      // face is painted on the body inside the pocket, the signal does not depend on which boulder
      // the marker happens to be standing on, which is what killed the shelf that used to do this
      ok('an open seam has a face brighter than its own body, in every kind',
        ore.KINDS.every((k) => ore.ART[k].open.indexOf("fill='" + ore.C.cream + "'") >= 0),
        ore.KINDS.map((k) => k + ':' + (ore.ART[k].open.indexOf(ore.C.cream) >= 0)).join(' '));
      ok('...and a locked one has a darker face instead, with no cream left anywhere on it',
        ore.KINDS.every((k) => ore.ART[k].locked.indexOf("fill='" + ore.C.stone + "'") >= 0
          && ore.ART[k].locked.indexOf(ore.C.cream) < 0),
        ore.KINDS.map((k) => k + ':' + ore.ART[k].locked.indexOf(ore.C.cream)).join(' '));
      // ...AND IT IS STILL LEGIBLE WHAT IS BEING MISSED, which is this file's oldest line: a
      // reader who cannot see which find the next step buys has nothing on the other side of the
      // purchase. The body keeps its own colour in both states
      const BODY_FILL = { gem: ore.C.steel, relic: ore.C.gold, fever: ore.C.red };
      ok('and a locked marker still says WHICH find is being missed, by keeping its own colour',
        ore.KINDS.every((k) => ore.ART[k].locked.indexOf("fill='" + BODY_FILL[k] + "'") >= 0),
        ore.KINDS.map((k) => k + ':' + BODY_FILL[k]).join(' '));

      // THE STYLESHEET SIDE. Two drawings and not one with a lid on it, which is what the comma
      // in the old rule was: `url(shelf),url(marker)` stacked a slab of rock over the picture
      const bg = (sel) => (/background-image:([^;]*)/.exec(rule(sel)) || ['', ''])[1];
      // ...counted as `url(`s and not as commas, because `data:image/svg+xml,` has a comma in it
      const layers = (s) => (s.match(/url\(/g) || []).length;
      ok('the open rule and the locked rule name two different single pictures',
        ore.KINDS.every((k) => {
          const open = bg('.mn-ore.' + k), shut = bg('.mn-ore.' + k + '.locked');
          return open && shut && open !== shut && layers(open) === 1 && layers(shut) === 1;
        }),
        ore.KINDS.map((k) => k + ':' + layers(bg('.mn-ore.' + k + '.locked'))).join(' '));
      ok('and nothing on this band lays one drawing over another any more',
        !/background-image:url\("[^"]*"\),url\(/.test(decls()),
        (decls().match(/background-image:url\([^;]*/g) || []).length + ' single-layer rule(s)');
      // WHAT POPS AND WHAT IS IN THE BAG IS THE BARE BODY, and the pop has to BEAT the locked rule
      // to say it: both are (0,3,0), so the only thing deciding it is which stands later
      ok('what leaves the wall and what is in the bag are both the bare drawing',
        bg('.mn-ore.pop.gem') === 'url("' + ore.uri(ore.ART.gem.bare) + '")'
        && bg('.mn-stack i.gem') === 'url("' + ore.uri(ore.ART.gem.bare) + '")',
        bg('.mn-ore.pop.gem').slice(0, 60));
      ok('...and the pop out-ranks the locked rule by standing after it, which is all that decides it',
        decls().indexOf('.mn-ore.pop.gem') > decls().indexOf('.mn-ore.gem.locked')
        && decls().indexOf('.mn-ore.gem.locked') > 0,
        decls().indexOf('.mn-ore.gem.locked') + ' then ' + decls().indexOf('.mn-ore.pop.gem'));

      // --- and now the band itself, in both states -------------------------------------------------
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      $('mnRock').clientWidth = 156;
      $('mnBuy').click(); advance(60);            // step 1, so a stone is one step's work
      // THE TWO STATES CANNOT BE IN ONE WINDOW and that is the layout rather than this page being
      // lazy: the lookahead is exactly one cell wide (mine.js, CELL_M === AHEAD_M), so at most one
      // marker stands in it. They are reached one after the other, and WHICH cell holds which is
      // looked up in the engine's own layout rather than typed here
      const cellWith = (from, open) => {
        for (let c = Math.floor(from / engine.CELL_M) + 1; c < 1e6; c++) {
          const s = engine.seamAt(c);
          if (s && engine.takes(stepOf(), s) === open) return c;
        }
        return 0;
      };
      // ...and dug to 20 m short of it, which puts the marker at 80% of the band: inside the 28px
      // the right end fades over, and well clear of the face
      const reach = (c) => {
        const need = c * engine.CELL_M - 20 - seeNow().depth;
        if (need > 0) digStones(need);
        advance(1600);
      };
      const classes = () => ores().map((e) => e.className);
      const wantLocked = () => seeNow().seam.map((s) => !!s.locked).join();
      const gotLocked = () => ores().map((e) => /\blocked\b/.test(e.className)).join();

      const shutCell = cellWith(seeNow().depth, false);
      ok('the layout holds a seam the step in hand is not the key to', shutCell > 0,
        'cell ' + shutCell + ' at ' + shutCell * engine.CELL_M);
      reach(shutCell);
      ok('and the window is holding it, which is the host\'s word and not this screen\'s',
        seeNow().seam.some((s) => s.locked) && ores().length === seeNow().seam.length,
        JSON.stringify(seeNow().seam) + ' at ' + seeNow().depth);
      ok('so it is drawn as the locked picture of its own kind, one marker at a time',
        gotLocked() === wantLocked() && /\blocked\b/.test(classes().join(' ')),
        classes().join(' | '));

      const openCell = cellWith(seeNow().depth, true);
      ok('and the layout holds one it IS the key to', openCell > 0,
        'cell ' + openCell + ' at ' + openCell * engine.CELL_M);
      reach(openCell);
      ok('that one is drawn open, with no lock class left behind on it',
        ores().length === seeNow().seam.length && gotLocked() === wantLocked()
        && !/\blocked\b/.test(classes().join(' ')),
        classes().join(' | '));
      // AND NEITHER STATE MOVES THE BOX. A pocket that grew the marker would move every seam on
      // the band, since a marker is centred on its own depth (docs/game-panels.md, 8-3)
      ok('and neither state changed the box: 24 for a gem and a fever, 48 for a relic, as before',
        /width:24px/.test(rule('.mn-ore.gem')) && /width:24px/.test(rule('.mn-ore.fever'))
        && /width:48px/.test(rule('.mn-ore.relic'))
        && !/width:/.test(rule('.mn-ore.gem.locked')),
        rule('.mn-ore.relic'));
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- what a blow leaves in the wall ------------------------------------------------------------
    //
    // "it does not feel like the stone is being cut at all". The measurement behind that reading is
    // blunt: when a stone broke, FOUR things moved and not one of them was rock. The crab stepped,
    // the grit flew, the strip's own arc and sparks fired, and the face advanced by about a pixel.
    // Three of those happen in the air and the fourth is invisible. This page is the mark that
    // answers it and the quiet wall that has none (docs/mine-mockup/spec-ore.md, section 7)
    if (MODE === 'mine-bite') {
      const ore = require(path.join(EXT, 'games', 'mine', 'ore.js'));
      const tools = require(path.join(EXT, 'games', 'mine', 'tools.js'));
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);                             // working: 1,320ms a swing
      const D = 1320;
      $('mnRock').clientWidth = 156;
      $('mnBuy').click(); advance(60);
      const bitten = () => $('mnRock').classList.contains('burst');
      const until = (want, within) => {
        for (let t = 0; t <= within; t += 10) {
          if (want()) return true;
          advance(10);
        }
        return false;
      };
      const WAIT = D + 200;

      // 1. A WALL NOBODY HAS HIT. The swing is running and nothing is marked: the mark belongs to
      // a stone BREAKING and not to the crab swinging, which is the same line the step and the
      // grit are already held to (the strip's own gold sparks fire on every swing and cannot be
      // switched off, so a mark that did too would say nothing)
      ok('the wall is unmarked before any work arrives, although the crab is swinging',
        !bitten() && dig() && !stepping(), 'bitten=' + bitten() + ', dig=' + dig());
      ok('and the loop the crab always runs does not carry it',
        !/mnBite/.test(rule('.mn-crab.dig')) && !/mnBite/.test(kf('mnDig')),
        rule('.mn-crab.dig'));

      // 2. IT IS DRAWN ON THE WALL AND NOT WITH THE GRIT. .mn-chips is z-index 4, which is above
      // the crab AND the tool: a mark drawn there covers the pick's head on the contact frame (the
      // head tip is face + 5.7px at y44.5 and the mark spans face -3 to +9 at y39..49). On the
      // rock it is UNDER the crab, so the tool is over it at frames 7 and 8 and lifts off it at 9
      const biteSel = (/([^{}]*)\{[^}]*animation:mnBite[^}]*\}/.exec(css()) || ['', ''])[1]
        .split('*/').pop().trim();
      ok('the mark is on the wall, under the crab, and not in the box that draws over the tool',
        biteSel === '.mn-rock.burst::after' && /z-index:4/.test(rule('.mn-chips'))
        && !/z-index/.test(rule('.mn-rock')),
        JSON.stringify(biteSel));
      ok('...and nothing in the grit\'s own boxes draws it',
        !/mn-chip[^{]*\{[^}]*mnBite/.test(decls()),
        (decls().match(/mn-chip[^{]*\{[^}]*mnBite/g) || []).join(' | '));
      // ...AND IT IS BITTEN INTO THE FACE rather than floating on the wall: it sits at the strike
      // point, which rides the advance, and the rock's own clip cuts its left 3px off at the face
      const biteBox = rule('.mn-rock::after');
      ok('it stands at the strike point and the face\'s own clip takes a bite out of it',
        /var\(--mn-adv/.test(biteBox) && /- 3px/.test(biteBox) && /opacity:0/.test(biteBox)
        && /clip-path/.test(rule('.mn-rock')) && /overflow:hidden/.test(rule('.mn-rock')),
        biteBox.slice(0, 140));
      // A HOLE AND NOT A LIGHT, which is the whole difference from the strike star 1.41.0 deleted.
      // It is the grit's own prescription inverted: ink body with a steel edge rather than a steel
      // core in an ink ring, because a chip is stone in the air and this is a hole in a wall
      ok('it is drawn dark with one bright edge, which is the grit\'s recipe the other way round',
        tools.BITE.indexOf("fill='" + ore.C.ink + "'") >= 0
        && tools.BITE.indexOf("stroke='" + ore.C.steel + "'") >= 0
        && tools.BITE.indexOf(ore.C.cream) < 0 && tools.BITE.indexOf(ore.C.gold) < 0,
        tools.BITE.slice(0, 80));

      // 3. NO NEW MILLISECOND. It rides --mn-digms, which is the rung the crab, the pick, the step
      // and the grit all ride, and its stops are frames 7, 12 and 15 of the same sixteen
      ok('it rides the swing the other four ride, handed down on the wall itself',
        /var\(--mn-digms/.test(rule('.mn-rock.burst::after'))
        && ($('mnRock').getAttribute('style') || '').indexOf('--mn-digms:' + D + 'ms') >= 0,
        $('mnRock').getAttribute('style'));
      const b = kf('mnBite');
      ok('and its stops are frames of that swing rather than a clock of its own',
        new RegExp('\\s' + String(tools.BITE_F.hit).replace('.', '\\.') + '%\\{opacity:1').test(b)
        && new RegExp('\\s' + tools.BITE_F.half + '%\\{opacity:\\.55').test(b)
        && new RegExp('\\s' + String(tools.BITE_F.gone).replace('.', '\\.') + '%\\{opacity:0').test(b)
        && !/\d+ms/.test(b),
        JSON.stringify(b));
      // ...AND IT OUTLIVES THE GRIT, which is the reason the panel has two ways of putting the
      // blow away rather than one: the grit is over on frame 11 and this is not
      ok('the mark is still fading after the grit has gone, which is what says the wall KEEPS it',
        tools.BITE_F.half > tools.CHIP_END && tools.BITE_F.gone > tools.CHIP_END,
        'bite ' + tools.BITE_F.half + '/' + tools.BITE_F.gone + ' vs grit ' + tools.CHIP_END);

      // 4. A PUSH THAT BREAKS A STONE
      digStones(1);
      ok('one stone broke, and the host said so rather than the screen counting it',
        seeNow().depth >= 1, 'depth ' + seeNow().depth);
      ok('so the blow bites the wall on the same swing the grit flies on',
        until(() => bitten() && bursting() === 5 && stepping(), WAIT),
        'bitten=' + bitten() + ', ' + bursting() + ' flying');
      ok('...and the grit is gone while the mark is still there',
        until(() => bitten() && bursting() === 0 && !stepping(), WAIT),
        'bitten=' + bitten() + ', ' + bursting() + ' flying');
      ok('...and the wall is clean again by the end of that swing',
        until(() => !bitten(), WAIT), 'bitten=' + bitten());
      ok('one stone is one mark and not a loop', !until(bitten, D * 2), 'bitten=' + bitten());

      // 5. A QUIET WALL AGAIN. A burst is scheduled up to four swings ahead and the rung can go
      // quiet in between, so this is the same leftover the grit is already held to: a fresh hole
      // in the wall beside a crab that has put its tool down is two states at once
      skipAhead(61000); drivePush(2.5);
      digStones(3);
      skipAhead(61000); drivePush(0, true);
      let marked = bitten();
      for (let i = 0; i < 200; i++) { advance(20); marked = marked || bitten(); }
      ok('and a quiet window leaves the wall alone, however many blows were still due',
        !marked && !bitten() && $('mnDrift').classList.contains('rest'),
        'marked=' + marked + ', ' + $('mnDrift').className);
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- the camera: the crab walks and the world stands still -----------------------------------
    //
    // THE BAND WAS SHIPPED TWICE WITH THE FACE NAILED TO THE 40% MARK, and both times the only way
    // it had to show digging was to pull the ground towards the crab. The reader's words were
    // "the character is supposed to move, and instead the terrain comes at me like a conveyor
    // belt". This page is the answer to that: the band is a map of 165 metres of drift, every
    // metre of it is at a fixed place on it, and what a push moves is the face and the crab
    // standing on it. The ground moves on exactly one occasion -- the face reaching the camera's
    // next stop -- and then ALL OF IT moves, by one stride, in one duration (spec-idle.md, 4-4)
    if (MODE === 'mine-camera') {
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      $('mnRock').clientWidth = 156;          // the measured band at a 250px sidebar
      $('mnBuy').click(); advance(60);        // step 1, so a stone is one step's work
      const F1 = at(TRAVEL, 0);               // the face one whole stride past its stop: 60.2%
      // A THIRD OF A CELL IS 33.333..., so every figure derived from it has to be compared the way
      // the panel's own arithmetic produces it rather than for exact equality
      const same = (a, b) => Math.abs(a - b) < 1e-9;
      // THE STRIDE IS A THIRD OF THE HOST'S CELL (section 9), and the point of it being the cell
      // rather than a guess off the lookahead is this: a cell is where a seam may stand, so with
      // the stride at a third of one every cell boundary is one of the camera's own stops, and a
      // find therefore always happens at the same place on the band
      ok('the host sends the cell the layout stands on, and three strides make one',
        seeNow().window.cell === engine.CELL_M && TRAVEL * 3 === engine.CELL_M,
        'cell ' + seeNow().window.cell + ', stride ' + TRAVEL.toFixed(3));
      // ...AND A WALKED PUSH CANNOT TAKE TWO STOPS AT ONCE, which is spec-idle.md 1-4's rule in
      // the form it has since 1.41.0: it used to read "a stride is longer than the HEAVIEST push"
      // and the heaviest push is now eight times a stride. What saves it is that the heaviest push
      // is RUN -- the ground sliding left is what a run is for -- so the figure that has to be
      // shorter than a stride is the biggest WALKED push, which is DASH_M
      ok('and no walked push can cross a whole stride, which is what the stride length is for',
        engine.DASH_M < TRAVEL && engine.PUSH_M > TRAVEL,
        'a walk is at most ' + engine.DASH_M + ' m, a stride is ' + TRAVEL
        + ' m, the heaviest push is ' + engine.PUSH_M + ' m and is run');
      // ...so the push that fills a stop is the one that brings a seam to exactly F1, which is
      // where the crab will meet it (1-5's third beat). The layout is a pure function of the metre,
      // so the depth to dig to is a lookup and not a wait
      let cell = Math.floor(seeNow().depth / engine.CELL_M) + 1;
      while (!(engine.seamAt(cell) && engine.takes(stepOf(), engine.seamAt(cell)))) cell += 1;
      const seamM = cell * engine.CELL_M;
      const stop = seamM - TRAVEL;            // the stop one stride short of the seam
      // THE LAST DEPTH BEFORE THE CAMERA TAKES THAT STRIDE, written so that it is the last one
      // whatever the stride is. `Math.floor` was right while a stride was 33.33 m and wrong the
      // moment it became a whole 10: floor(50) is 50, which is the stop itself rather than the
      // metre before it, and every figure below it would then be measuring the wrong beat
      const before = Math.ceil(stop) - 1;
      digStones(before - seeNow().depth); advance(1600);
      ok('the drift is one metre short of the camera\'s next stop',
        seeNow().depth === before && anchorAt(before) < stop,
        'depth ' + before + ' at anchor ' + anchorAt(before).toFixed(3) + ', stop ' + stop.toFixed(3));
      // THE FACE IS NEARLY A WHOLE STRIDE PAST ITS STOP, which is the crab having walked there:
      // no pixel of this is measured and no part of it is the ground having moved
      ok('the face has walked almost a whole stride from the 40% mark',
        facePct() === at(before, anchorAt(before)) && facePct() > 40 && facePct() < F1,
        'face ' + facePct() + '%, one stride is ' + F1 + '%');
      const sillsWas = sillsAt(), postsWas = postsAt();
      const oreWas = ores().map(leftOf), panWas = Number((/--mn-pan:([-\d.]+)px/
        .exec($('mnDrift').getAttribute('style') || '') || [0, '0'])[1]);
      // ONE MORE STONE, WHICH IS ONE METRE, and it fills the stop. Everything below is that one
      // push: the world goes left one stride and the crab goes left by the stride less the metre
      tapBand();
      digStones(1);
      ok('one more stone carries the face over the stop, so the camera takes a stride',
        seeNow().depth === before + 1 && same(anchorAt(before + 1), stop),
        'depth ' + seeNow().depth + ' at anchor ' + anchorAt(before + 1).toFixed(3));
      // THE TWO WRITES THAT ARM IT: the world is put back where it was (one stride to the right)
      // with the transition off, and then sent home with it on. That pair IS the camera moving
      const armed = taps.filter((t) => !t.pan), home = taps.filter((t) => t.pan);
      ok('the world is written back a stride with nothing armed, then sent home with it armed',
        armed.length >= 1 && home.length >= 1
        && Math.abs(tapped(armed[armed.length - 1], 'slip') - (F1 - 40)) < 0.02
        && tapped(home[home.length - 1], 'slip') === 0
        && tapped(home[home.length - 1], 'panms') === 300,
        armed.map((t) => 'slip ' + tapped(t, 'slip')).join() + ' -> '
        + home.map((t) => 'slip ' + tapped(t, 'slip') + ' in ' + tapped(t, 'panms') + 'ms').join());
      // ...AND EVERY LAYER WENT THE SAME WAY BY THE SAME AMOUNT. The markers, the sleepers and the
      // frames are three separate boxes, and 4-4 is that one of them staying put is enough to turn
      // the whole thing back into a conveyor belt with something stuck to the glass
      const STRIDE = F1 - 40;
      ok('the sleepers in the hole came back by exactly one stride, every one still in it',
        sillsWas.length > 2 && slid(sillsAt(), sillsWas, STRIDE) >= sillsAt().length - 1
        && slid(sillsAt(), sillsWas, 0) === 0,
        sillsWas.map((x) => x.toFixed(2)).join() + ' -> ' + sillsAt().map((x) => x.toFixed(2)).join());
      ok('and the timber came with them rather than staying nailed to the band',
        postsWas.length > 1 && slid(postsAt(), postsWas, STRIDE) >= postsAt().length - 2
        && slid(postsAt(), postsWas, 0) === 0,
        postsWas.map((x) => x.toFixed(2)).join() + ' -> ' + postsAt().map((x) => x.toFixed(2)).join());
      ok('and the rock\'s grain went the same distance',
        Math.abs((Number((/--mn-pan:([-\d.]+)px/.exec($('mnDrift').getAttribute('style') || '')
          || [0, '0'])[1]) - panWas) - (F1 - 40) / 100 * 156) < 0.02,
        panWas + 'px -> ' + (/--mn-pan:([-\d.]+)px/.exec($('mnDrift').getAttribute('style')) || [])[1]);
      // THE CRAB GOES LEFT TOO AND IT IS NOT HIDDEN (4-4). In a band of finite width a crab that
      // keeps walking right needs the view pulled back, and the view being pulled back moves
      // everything inside it. What makes it read as the view rather than as the world is that
      // every layer above went exactly this far in exactly these milliseconds
      ok('the crab is back near its stop, having gone left by the stride less what it dug',
        facePct() === at(before + 1, stop) && facePct() < 41,
        'face ' + facePct() + '% after the stride, was ' + at(before, anchorAt(before)) + '%');
      // ...AND THE SEAM IS NOW EXACTLY AT F1, which is the whole reason the stride is a third of a
      // cell: that is the place the crab's own walk ends, so this is the metre they meet at
      ok('and the seam the crab is walking at stands exactly one stride ahead of the stop',
        ores().length === 1 && leftOf(ores()[0]) === F1 + '%'
        && oreWas.join() !== ores().map(leftOf).join(),
        oreWas.join() + ' -> ' + ores().map(leftOf).join() + ', one stride is ' + F1 + '%');
      // AND WHEN IT HAS ARRIVED NOTHING IS ARMED. Between two pushes the band carries no
      // transition at all, which is what "one thing turns at a time" means here
      advance(400);
      ok('when the stride is over the band is still again, with nothing armed',
        !$('mnDrift').classList.contains('pan') && slipNow() === 0,
        $('mnDrift').className + ', slip ' + slipNow() + '%');
      // ...AND THE NEXT ORDINARY PUSH MOVES THE FACE AND NOTHING ELSE. This is the second
      // rejection, stated as an assertion: the ground does not come to the crab
      const stillSills = sillsAt(), stillOre = ores().map(leftOf);
      const stillPan = $('mnDrift').getAttribute('style').match(/--mn-pan:([-\d.]+)px/)[1];
      const faceWas = facePct();
      digStones(4); advance(400);
      ok('an ordinary push moves the face and leaves every other pixel where it was',
        facePct() > faceWas && slid(sillsAt(), stillSills, 0) === stillSills.length
        && ores().map(leftOf).join() === stillOre.join()
        && $('mnDrift').getAttribute('style').match(/--mn-pan:([-\d.]+)px/)[1] === stillPan,
        'face ' + faceWas + '% -> ' + facePct() + '%, sleepers and markers and grain unmoved: '
        + [slid(sillsAt(), stillSills, 0) === stillSills.length,
          ores().map(leftOf).join() === stillOre.join()].join());
      // ...BUT THE HOLE ITSELF GETS LONGER, and a piece of timber falls due at the face end while
      // the camera is still parked. This is the one thing a memo on the camera gets wrong: the
      // hole is `behind` metres long right after a stride and `behind` plus a stride by the end of
      // one, so a sleeper's pitch being shorter than a stride means timber falls due mid-stride.
      // Nothing MOVES here -- what was laid is still exactly where it was laid -- and the hole
      // simply holds more of it.
      // THE WALK IS THE WHOLE STRIDE LESS A METRE, measured from the stop (`stillSills` above was
      // read there), because that is the only length a sleeper is GUARANTEED to fall due in: the
      // pitch is shorter than a stride and longer than the four metres the block above dug
      digStones(stop + Math.floor(TRAVEL) - 1 - seeNow().depth); advance(1600);
      ok('and the hole grows as the face walks, so timber falls due at the face end',
        facePct() > faceWas && same(anchorAt(seeNow().depth), stop)
        && sillsAt().length > stillSills.length
        && slid(sillsAt(), stillSills, 0) === stillSills.length,
        stillSills.length + ' sleeper(s) at face ' + faceWas + '% -> ' + sillsAt().length
        + ' at ' + facePct() + '%, all of the old ones unmoved: '
        + (slid(sillsAt(), stillSills, 0) === stillSills.length));
      // THE LAYERS ARE READ OFF THE STYLESHEET AS WELL, and that is not belt and braces: a layer
      // dropped out of one of these two selector lists still ENDS UP in the right place, because
      // where it is drawn is its own depth, so it would teleport rather than travel and no
      // position this mode can read would be any different. The stylesheet is the only place that
      // mutation is visible, and a teleporting frame beside a sliding one is exactly 4-4's defect
      const slipRule = (/([^{};*/]*)\{[^}]*--mn-slip[^}]*\}/.exec(css()) || ['', ''])[1];
      const WORLD = ['.mn-slide', '.mn-sills', '.mn-frames'];
      ok('all three world layers take their place from the one variable, none left behind',
        WORLD.every((k) => slipRule.indexOf(k) >= 0)
        && /translateX\(var\(--mn-slip/.test(
          (/[^{};*/]*\{[^}]*--mn-slip[^}]*\}/.exec(css()) || [''])[0]),
        JSON.stringify(slipRule.trim()));
      ok('and one class arms those three, the face and the crab, at one duration',
        /clip-path/.test(group('.mn-drift.pan .mn-rock')) && !!group('.mn-drift.pan .mn-adv')
        && WORLD.every((k) => group('.mn-drift.pan .mn-sills').indexOf(k) >= 0)
        && (css().match(/--mn-panms,0ms\) linear/g) || []).length >= 4,
        group('.mn-drift.pan .mn-sills'));
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- the end of the band: no marker is ever parked on the edge again -------------------------
    //
    // THE THIRD REJECTION, which was the one with a picture attached: "the gold bar is cut in half
    // at a right angle like a rendering bug". It was. pctOf clamped every position between 0 and
    // 100% of the lookahead, so a seam the window could not reach yet was PARKED at 100%, and a
    // marker is centred on its own position, so what stood at the edge was exactly half of a 48px
    // relic with a straight vertical cut down it. A cell is 100m and the lookahead is 99, so the
    // seam after a find is ALWAYS out of reach for a third of a cell: that drawing was on screen
    // for minutes at a time, every cell, for two releases
    if (MODE === 'mine-edge') {
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      $('mnRock').clientWidth = 156;
      $('mnBuy').click(); advance(60);
      let cell = Math.floor(seeNow().depth / engine.CELL_M) + 1;
      while (!(engine.seamAt(cell) && engine.takes(stepOf(), engine.seamAt(cell)))) cell += 1;
      const seamM = cell * engine.CELL_M;
      // THE FIRST DEPTH AT WHICH THE HOST SENDS IT AT ALL, which is one lookahead short of it.
      // WHAT CHANGED IN 1.41.0 is where that puts the marker: the cell IS the lookahead now and
      // the camera's stride is a third of it, so this depth is exactly a camera stop and the
      // marker arrives at exactly 100% of the band rather than 0.95px past it. The relic that was
      // "cut in half at a right angle" is therefore not merely unclamped, it is structurally
      // impossible -- a marker's place is 40% plus the ground to it over the span, the ground to
      // it is at most AHEAD_M, and AHEAD_M over the span is exactly the 60% the rock is
      const out = seamM - engine.AHEAD_M;
      digStones(out - seeNow().depth); advance(1600);
      const x = at(seamM, anchorAt(out));
      ok('the host is sending a seam the band holds to its last pixel',
        seeNow().seam.length === 1 && seeNow().seam[0].at === seamM && x === 100,
        'seam at ' + seamM + ', band holds to 100%, it wants ' + x + '%');
      // ...AND THERE ARE ONLY THREE PLACES IT CAN EVER STAND. The stops are a third of a cell and
      // the cell is the lookahead, so a marker is at 100%, 80% or 60% of the band and nowhere
      // else, which is "a find always happens at the same place" stated exactly. A clamp, a
      // rounding or a camera guessed off the wrong figure all break this line
      const places = new Set();
      for (let d = out; d < seamM; d++) places.add(at(seamM, anchorAt(d)));
      ok('and a marker stands at one of three places on the band, never past the edge',
        [...places].every((p) => p <= 100) && places.size === 3,
        [...places].sort((a, b) => b - a).join('% / ') + '%');
      ok('it is drawn where the camera says and not parked by a clamp',
        ores().length === 1 && leftOf(ores()[0]) === x + '%',
        leftOf(ores()[0]) + ' wanted ' + x + '%');
      // ...AND THE EDGE IS SOFT, so what shows of it fades out instead of ending in a straight
      // cut. 28px is the relic's half width plus 4, and it is on the markers only: the rock's own
      // grain is .mn-rock's background and is not masked, so the band still ends in rock
      ok('the markers fade out over the last 28px rather than ending in a straight cut',
        /mask-image:linear-gradient\(90deg,#000 calc\(100% - 28px\),transparent 100%\)/
          .test(rule('.mn-slide'))
        && /-webkit-mask-image/.test(rule('.mn-slide')) && !/mask-image/.test(rule('.mn-rock')),
        rule('.mn-slide'));
      ok('and the face end of them is left hard, because that is a real boundary',
        !/mask/.test(rule('.mn-ore')) && /overflow:hidden/.test(rule('.mn-rock')),
        rule('.mn-ore'));
      // AND THE CAMERA BRINGS IT IN, one stride at a time, which is the three beats of 1-5: out of
      // reach, then in sight, then met. Each stride moves it by exactly one stride
      const seen = [];
      for (let i = 0; i < 3; i++) {
        const was = anchorAt(seeNow().depth);
        let n = 0;
        while (anchorAt(seeNow().depth) === was && n < 60) { digStones(1); n += 1; }
        advance(400);
        if (ores().length) seen.push(Number(leftOf(ores()[0]).replace('%', '')));
      }
      ok('each stride brings it one stride further in, and it is whole long before the face',
        seen.length >= 2
        && seen.every((v, i) => i === 0 || Math.abs(seen[i - 1] - v - (at(TRAVEL, 0) - 40)) < 0.02)
        && seen[seen.length - 1] < 100 - 7.69,
        seen.map((v) => v + '%').join(' -> '));
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- the host that does not send a cell ------------------------------------------------------
    //
    // `window.cell` IS NEW (section 9) and the fallback is `ahead / 3`, which draws a band that
    // stands up and whose stops are simply no longer the layout's. This page is what that costs,
    // and it is also the one state in which a marker is outside the band rather than merely over
    // its edge: with the stride off the cell boundaries a seam can want 119% of the band, and a
    // thing that is nowhere near the band is not drawn at all (5-2)
    if (MODE === 'mine-cull') {
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      $('mnRock').clientWidth = 156;
      $('mnBuy').click(); advance(60);
      // THE FALLBACK STOPPED COSTING ANYTHING IN 1.41.0, and that is the first thing to say here.
      // `cell / 3` and `ahead / 3` were 33.33 and 33 while a cell was 100 m and the lookahead 99,
      // and the whole point of sending `cell` was that one metre a cell of creep. The cell IS the
      // lookahead now, so the two figures are the SAME NUMBER and an old host gets the right
      // camera by accident. The assertion is kept the other way up: if they ever diverge again,
      // the drift below it comes back
      const guess = engine.AHEAD_M / 3;
      const guessAt = (d) => Math.floor(d / guess) * guess;
      ok('the fallback stride and the cell\'s own stride are the same figure now',
        guess === TRAVEL && engine.CELL_M === engine.AHEAD_M,
        'fallback ' + guess + ' m, cell\'s ' + TRAVEL + ' m');
      let cell = Math.floor(seeNow().depth / engine.CELL_M) + 1;
      while (!(engine.seamAt(cell) && engine.takes(stepOf(), engine.seamAt(cell)))) cell += 1;
      const want = cell * engine.CELL_M - engine.AHEAD_M;
      digStones(want - seeNow().depth); advance(1600);
      const seam = seeNow().seam[0];
      ok('a marker is standing at the far edge of the band',
        !!seam && ores().length === 1 && leftOf(ores()[0]) === at(seam.at, anchorAt(want)) + '%',
        (seam ? leftOf(ores()[0]) : 'nothing') + ' at anchor ' + anchorAt(want).toFixed(3));
      // ...AND A MARKER THE BAND CANNOT REACH IS ABSENT. Not parked on the edge, not clipped to
      // 100%, not there (5-2). The host cannot produce one any more -- seamsAhead stops at the
      // lookahead -- so the state is MADE here, which is what this page is for: the cull is the
      // panel's own rule and it has to hold against whatever arrives on the wire
      const blind = Object.assign({}, seeNow());
      blind.window = { behind: engine.BEHIND_M, ahead: engine.AHEAD_M };
      blind.seam = [{ at: want + engine.AHEAD_M * 3, row: seam.row, kind: seam.kind, locked: false }];
      blind.found = null; blind.fever = null; blind.broke = 0;
      toWebview({ type: 'mn', balance: h.ledgerBalance(), free: 1e9, state: blind });
      advance(600);
      ok('with no cell the camera still parks where the cell would have put it',
        facePct() === at(want, guessAt(want)) && facePct() === at(want, anchorAt(want)),
        'face ' + facePct() + '%, the cell would have said ' + at(want, anchorAt(want)) + '%');
      ok('and a marker far outside the band is absent rather than parked on the edge',
        ores().length === 0,
        ores().map(leftOf).join() + ' for a seam that wants '
        + at(blind.seam[0].at, guessAt(want)).toFixed(2) + '%');
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- resting: the gap at the face ------------------------------------------------------------
    //
    // "SO IT ONLY WORKS WHEN I WORK?" was the reader's third sentence about this screen, and the
    // two before it were both "there is a bug where the pick does not move". All three are the same
    // defect: a quiet window and a reader who had asked for less motion left the VERY SAME still
    // frame, so "it has stopped", "I turned that off" and "it is broken" were one picture.
    // The answer is a gap and nothing else (section 7). The crab's body is on the face whenever
    // there is work, so a gap between the two happens when there is none and at no other time: no
    // word, no colour, nothing switched off, and nothing that reduced motion can take away
    if (MODE === 'mine-rest' || MODE === 'mine-rest-bare') {
      const bare = MODE === 'mine-rest-bare';
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      if (!bare) { $('mnBuy').click(); advance(60); }
      ok(bare ? 'nothing has been bought, so the claw is empty' : 'a pick is in the claw',
        $('mnPick').hidden === bare && stepOf() === (bare ? 0 : 1),
        'step ' + stepOf() + ', pick hidden=' + $('mnPick').hidden);
      ok('while the window is being worked the crab swings and there is no gap',
        dig() && !$('mnDrift').classList.contains('rest'),
        'dig=' + dig() + ' ' + $('mnDrift').className);
      // AND THEN NOTHING ARRIVES. The rung is the window's own (webview.js) and not a count this
      // screen keeps: there are two crabs in this window and they may not disagree about whether
      // it is quiet
      skipAhead(61000);
      drivePush(0, true);
      ok('a quiet window stops the swing, which is where the two readings used to be identical',
        !dig() && digMs() !== '', 'dig=' + dig() + ' ' + digMs());
      ok('...and opens the gap at the face, which is the thing that tells them apart',
        $('mnDrift').classList.contains('rest'), $('mnDrift').className);
      // 12.6px IS NOT A NEW TOLERANCE. It is the distance the swing already crosses the face by
      // (spec.md, section 7), used the other way round, so the resting pose and the furthest reach
      // of a blow are 25.2px apart and no frame of the swing is anywhere near either
      const restRule = () => group('.mn-drift.rest .mn-dig');
      ok('the crab and its shadow step back by the swing\'s own overshoot, and together',
        /translateX\(-12\.6px\)/.test(restRule()) && /mn-shade/.test(restRule()),
        restRule());
      // IT IS THE BOX HOLDING THE CRAB AND THE TOOL THAT MOVES, not the crab on its own. The pick
      // is pinned to the claw by its own left and its transform-origin, so a rule that moved the
      // crab alone would take the claw away from under the tool and leave the haft hanging over
      // the gap -- which was rendered, looked at, and is why this reads .mn-dig. Checked as a
      // STRUCTURE too, because the harness lays nothing out: the two are in one box
      ok('and it is the box holding the crab AND the tool, so the tool stays in the claw',
        /\.mn-dig/.test(restRule()) && !/\.mn-crab/.test(restRule())
        && !!doc.querySelector('#mnDig #mnCrab') && !!doc.querySelector('#mnDig #mnPick'),
        restRule());
      ok('and the face does not step back with it, because the depth is still the truth',
        !/mn-rock|mn-slide|mn-adv/.test(restRule()), restRule());
      // NOTHING IS DONE TO THE CRAB ITSELF. 5-15's rule is that bad news is never told by turning
      // the main character down, and resting is not even bad news
      ok('the crab is not faded, greyed or filtered to say it',
        !/opacity|filter|grayscale/.test(restRule()), restRule());
      // THE TOOL STAYS IN THE CLAW AND SAYS NOTHING. The first attempt stood it on the floor and
      // that was rejected on the rendered screen: 51% of it lies over the crab, where the head's
      // fill is 1.77:1 at the first band and 1.27:1 at the fourth, so the fill vanishes and the
      // ink outline does not -- a snout on the crab's face rather than a tool, and worse the
      // better the tool is (7-4). THIS IS AN ASSERTION AND NOT A DELETION: the rule that is not
      // there is load-bearing, because anything set under `.rest` would also out-rank
      // .mn-pick.g1..g4 and paint over the four lights the ladder bought
      ok('the tool is left hanging in the claw: resting adds no rule to it at all',
        !rule('.mn-drift.rest .mn-pick') && !/mn-pick/.test(restRule())
        && !/\.rest[^{]*\.mn-pick/.test(decls()),
        JSON.stringify(rule('.mn-drift.rest .mn-pick')));
      ok('...so what it draws while resting is its own resting angle, the one `dig` coming off leaves',
        /transform:rotate\(-12deg\)/.test(rule('.mn-pick'))
        && !/dig/.test($('mnPick').className) && $('mnPick').hidden === bare,
        rule('.mn-pick') + ' | ' + $('mnPick').className);
      if (bare) {
        // ...AND BARE HANDS REST EXACTLY LIKE EVERY OTHER BAND, which is what the rejection bought:
        // the gap does not know which tool is in the claw, so there is no state here that is drawn
        // more weakly than another. What 7-5 used to call a known weakness is simply gone
        ok('bare hands rest the same way every other band does, with nothing invented for them',
          $('mnPick').hidden && !$('mnBuy').hidden && /^Upgrade /.test(text('mnBuy'))
          && /translateX\(-12\.6px\)/.test(restRule()),
          'pick hidden=' + $('mnPick').hidden + ', ' + JSON.stringify(text('mnBuy')));
      }
      // THE GAP IS A STATE AND NOT A MOVEMENT, so reduced motion keeps it. Welded under that query
      // the two pictures would be identical again, which is the whole defect
      const quiet = (css().match(/@media \(prefers-reduced-motion:reduce\)\{(?:[^{}]|\{[^{}]*\})*\}/g)
        || []).filter((b) => /\.mn-/.test(b)).join(' ');
      ok('and reduced motion does not touch it, or the two pictures would be one again',
        !/\.rest/.test(quiet), JSON.stringify(quiet).slice(0, 200));
      // NOTHING TRANSITIONS INTO IT EITHER (7-6): the frame the swing is removed on is whatever
      // angle the browser happened to be on, which is not a value to animate from
      ok('nothing eases into the gap: a state is entered, not animated',
        !/transition/.test(restRule()), restRule());
      // ...AND NOTHING IS LEFT IN THE AIR. A burst is scheduled up to four swings ahead, so the
      // rung can go quiet with grit still due: a piece of rock hanging beside a crab that has
      // stepped back off the face is the "frozen mid-animation" reading this is all meant to end
      skipAhead(61000); drivePush(2.5);
      digStones(3);
      skipAhead(61000); drivePush(0, true);
      let flying = bursting();
      for (let i = 0; i < 200; i++) { advance(20); flying = Math.max(flying, bursting()); }
      ok('and no grit flies while it rests, however much was still due',
        flying === 0 && bursting() === 0 && !stepping()
        && $('mnDrift').classList.contains('rest'),
        flying + ' flew, step=' + stepping() + ', ' + $('mnDrift').className);
      // AND THE WORK COMING BACK CLOSES IT, with no leftover class
      skipAhead(61000); drivePush(2.5);
      ok('work coming back puts the crab on the face again',
        dig() && !$('mnDrift').classList.contains('rest'),
        'dig=' + dig() + ' ' + $('mnDrift').className);
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- working, for a reader who asked for less motion -----------------------------------------
    //
    // THE THIRD OF THE THREE PICTURES (section 8). A busy window with reduced motion on is a crab
    // standing ON the face with its tool in the claw, which is not the quiet window's picture and
    // not a fault: what is dropped is the swinging and the sliding, and WHERE things are is kept,
    // because where the crab has got to is a fact about the depth rather than a flourish
    if (MODE === 'mine-work-reduce') {
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      $('mnRock').clientWidth = 156;
      $('mnBuy').click(); advance(60);
      ok('the reader asked for less motion, so nothing swings',
        !dig() && !/dig/.test($('mnPick').className), 'dig=' + dig() + ' ' + $('mnPick').className);
      // AND THE GAP IS NOT OPEN, which is the mutation this page exists to catch: tying the gap to
      // reduced motion instead of to the work would put this screen back exactly where it was,
      // with one still frame for three different facts
      ok('but the crab is ON the face, because the window is busy and resting is about the work',
        !$('mnDrift').classList.contains('rest'), $('mnDrift').className);
      // THE CAMERA STILL POINTS WHERE THE DIGGING IS. A band that refused to move the face under
      // this query would be lying about the depth to the reader who asked for less movement
      let cellN = Math.floor(seeNow().depth / engine.CELL_M) + 1;
      while (!(engine.seamAt(cellN) && engine.takes(stepOf(), engine.seamAt(cellN)))) cellN += 1;
      const to = cellN * engine.CELL_M - TRAVEL;
      digStones(Math.floor(to) - seeNow().depth); advance(400);
      ok('the face is still exactly where the camera says the work has got to',
        facePct() === at(seeNow().depth, anchorAt(seeNow().depth)),
        'face ' + facePct() + '% at depth ' + seeNow().depth);
      ok('and the markers are at their own depths on the band, as they always are',
        ores().length === seeNow().seam.length
        && ores().map(leftOf).join()
          === seeNow().seam.map((s) => pct(s.at, anchorAt(seeNow().depth))).join(),
        ores().map(leftOf).join());
      // ...WITH NOTHING ARMED AND NOTHING PACED. The panel hands in 0ms under this query, and the
      // stylesheet drops the transitions as well, so every property lands in one step
      ok('nothing is armed and no duration is left behind',
        !$('mnDrift').classList.contains('pan') && msNow() === '0' && slipNow() === 0,
        $('mnDrift').className + ', ' + msNow() + 'ms, slip ' + slipNow() + '%');
      const quiet = (css().match(/@media \(prefers-reduced-motion:reduce\)\{(?:[^{}]|\{[^{}]*\})*\}/g)
        || []).filter((b) => /\.mn-/.test(b)).join(' ');
      // AND NO BLOW MARKS THE WALL. The mark a stone breaking leaves is an ANIMATION whose rest
      // state is opacity 0 (games/mine/tools.js, BITE), so dropping the animation is what makes it
      // absent -- and a hole punched in the face that never heals is the one way this drawing
      // could outstay a reader who asked for less motion. Both halves are checked: the panel does
      // not put the class on, and the stylesheet would not draw it if it did
      let marked = $('mnRock').classList.contains('burst');
      for (let i = 0; i < 200; i++) {
        advance(20);
        marked = marked || $('mnRock').classList.contains('burst');
      }
      ok('no blow marks the wall, so there is no hole left standing in the face for ever',
        !marked && /\.mn-rock\.burst::after/.test(quiet) && /animation:none/.test(quiet),
        'marked=' + marked + ', ' + JSON.stringify(quiet).slice(0, 160));
      ok('and the stylesheet drops all five of the camera\'s transitions under the query',
        ['adv', 'rock', 'slide', 'sills', 'frames'].every((k) => new RegExp('mn-' + k).test(quiet))
        && /transition:none/.test(quiet),
        JSON.stringify(quiet).slice(0, 260));
      // THE LIGHT IS NOT MOTION AND NEITHER IS THE GAP: neither one is in there
      ok('...and touches neither the light on the tool nor the gap',
        !/mn-pick\.g/.test(quiet) && !/filter/.test(quiet) && !/\.rest/.test(quiet),
        JSON.stringify(quiet).slice(0, 200));
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- a stone breaking ------------------------------------------------------------------------
    //
    // 1.39.0 and 1.40.0 both shipped this band and both came back with "I cannot tell it is
    // digging". That reading was TRUE and it was measurable: the crab, its arc and its sparks all
    // appear and vanish where they are, the rock's grain was nailed down, and one reply moved the
    // seams 0.455px at a 250px sidebar. THERE WAS NO PIXEL ON THE SCREEN THAT EVER CHANGED PLACE.
    // So this page is about the two things that move now, and about the three sizes of the event
    if (MODE === 'mine-break') {
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);                      // working: 1,320ms a swing
      const D = 1320;
      ok('the swing is the window\'s rung and the grit rides the same number',
        digMs() === D + 'ms' && new Set(swingMs()).size === 1, swingMs().join());
      // THE GRIT AND THE STEP ARE NOT IN THE LOOP. The loop is what the crab does on every swing,
      // whether or not anything broke, so a step welded into it would say "a stone broke" 2,045
      // times an hour at a rate of 53 metres
      ok('nothing is flying and nothing has stepped before any work arrives',
        bursting() === 0 && !stepping(), bursting() + ' flying, step=' + stepping());
      ok('and the loop the crab always runs carries neither of them',
        !/mnStep|mnChip/.test(rule('.mn-crab.dig')) && !/transform/.test(kf('mnDig')),
        rule('.mn-crab.dig') + ' | ' + kf('mnDig'));
      // THE PIECES AND THE LIGHTS ARE DRAWN HOST-SIDE AND COUNTED PANEL-SIDE, which is the one
      // duplication on this screen (games/mine/panel.js, MN_CHIPS and MN_GLOW): a stylesheet is
      // built in node and a panel cannot read it, so the two counts are held together here
      const tools = require(path.join(EXT, 'games', 'mine', 'tools.js'));
      ok('the band holds exactly the pieces the stylesheet draws',
        chips().length === tools.CHIPS.length && chips().length === 5,
        chips().length + ' in the band for ' + tools.CHIPS.length + ' drawn');
      ok('and one of them is the stone itself, bigger than its own grit',
        /width:5px/.test(rule('.mn-chip.c0')) && /width:3px/.test(rule('.mn-chip.c1')),
        rule('.mn-chip.c0') + ' | ' + rule('.mn-chip.c1'));
      // THE PANEL AND THE STYLESHEET AGREE ABOUT WHEN THE FLIGHT IS OVER. The panel takes the
      // one-shot classes off on frame 11 of 16 (MN_DONE) and the keyframes clear everything at
      // 68.75%, which is the same frame. Two figures for one fact, so they are held together here
      ok('and the frame the flight is over on is the same one in both files',
        tools.CHIP_END === 11 / 16 * 100, tools.CHIP_END + '% vs frame 11 of 16');

      // THE FLIGHT IS FRAMES 7 TO 10 OF THE SIXTEEN AND NOTHING ELSE. A piece visible at frame 0
      // is a piece that is there before the pick is, and one still visible at frame 15 is a piece
      // that outlives the blow: the contact is frame 7 (43.75%) and frame 11 (68.75%) is clear
      // THE STOPS ARE READ WITH THE WHITESPACE IN FRONT OF THEM, which is not fussiness: `0%` is a
      // substring of `100%`, so an unanchored "the first stop is invisible" passes on a keyframe
      // whose first stop is opacity 1 (it matches the last one instead). That mutation escaped once
      const c0 = kf('mnChip0');
      const stop = (at, op) => new RegExp('\\s' + at.replace('.', '\\.') + '%\\{opacity:' + op)
        .test(c0);
      ok('the grit is there for frames 7 to 10 of the swing and for no others',
        stop('0', 0) && stop('43.75', 1) && stop('62.5', 1) && stop('68.75', 0)
        && !stop('37.5', 1) && !stop('100', 1) && !stop('0', 1),
        JSON.stringify(c0));
      // ...AND IT LEAVES THE FACE. Every stop is a different place, which is the whole difference
      // between this and the star it replaced
      const moves = (c0.match(/translate\(calc\(-50% [-+] \d/g) || []).length;
      ok('and every frame of it is somewhere else, which the mark it replaced never was',
        moves >= 4, moves + ' moved stop(s)');
      // THE STEP GOES OUT AND COMES BACK, net zero. A step that kept the ground would be a picture
      // claiming 2.69 m for a swing that is worth 0.0259 m, which is a lie by a factor of 104
      const st = kf('mnStep');
      ok('the step is four pixels out at the contact frame and nothing at either end',
        /0%\{transform:translateX\(0\)/.test(st) && /43\.75%\{transform:translateX\(4px\)/.test(st)
        && /68\.75%\{transform:translateX\(0\)/.test(st),
        JSON.stringify(st));
      ok('so the crab claims no ground: the net of the whole step is zero',
        (st.match(/translateX\(0\)/g) || []).length === 2, JSON.stringify(st));
      // ...AND IT IS BOUND TO THE CLASS THAT SAYS A STONE BROKE, ONCE. The selector itself is read,
      // because "every swing steps" is written by adding a second selector to this one rule, and
      // that leaves the class check above saying exactly what it said before. The strip's own gold
      // sparks already fire on every swing and cannot be switched off, so the step moving on a
      // swing that broke nothing would take away the only thing that tells the two apart
      const stepSel = (/([^{}]*)\{[^}]*animation:mnStep[^}]*\}/.exec(css()) || ['', ''])[1]
        .split('*/').pop().trim();
      ok('and the step runs once, on the class that says a stone broke, and on nothing else',
        stepSel === '.mn-dig.step' && /\b1 both/.test(rule('.mn-dig.step'))
        && !/animation/.test(rule('.mn-dig')),
        JSON.stringify(stepSel) + ' | ' + rule('.mn-dig.step'));

      // ONE STONE. Buy the first step so a stone is 20,000 tokens rather than eight times that
      $('mnBuy').click(); advance(60);
      ok('a pick is in hand, so a stone is one step\'s work rather than a fist\'s',
        stepOf() === 1, 'step ' + stepOf());
      // WHERE IN THE SWING A BURST LANDS IS THE SWING'S AND NOT THIS FILE'S. The panel waits for
      // phase 0 of the loop, because the grit is frames 7 to 10 of a swing and a burst dropped in
      // at an arbitrary moment would break the stone with the pick over the crab's head
      // (spec-dig.md, 2-6). The wait is up to one whole swing, so the clock is STEPPED UNTIL the
      // grit appears rather than sampled at an instant guessed here
      const until = (want, within) => {
        for (let t = 0; t <= within; t += 10) {
          if (want()) return true;
          advance(10);
        }
        return false;
      };
      const flying = () => bursting() === 5 && stepping();
      const still = () => bursting() === 0 && !stepping();
      const WAIT = D + 200;

      digStones(1);
      ok('one stone broke, and the host said so rather than the screen counting it',
        seeNow().depth >= 1 && mnGot() > 0, 'depth ' + seeNow().depth);
      ok('so the grit flies and the crab steps into the hole, on the next blow',
        until(flying, WAIT), bursting() + ' flying, step=' + stepping());
      ok('and when that swing is over there is nothing in the air again',
        until(still, WAIT), bursting() + ' flying, step=' + stepping());
      ok('one stone is one burst and not a loop', !until(flying, D * 2),
        bursting() + ' flying');

      // THREE STONES, ONE A SWING. Four is the ceiling and the reason is measured: four at the
      // slowest rung is 7.0s, inside extension.js's ten-second push interval, and five is 8.8s
      digStones(3);
      ok('three more stones broke on one push', seeNow().depth === 4, 'depth ' + seeNow().depth);
      let bursts = 0;
      for (let i = 0; i < 3; i++) {
        if (!until(flying, WAIT)) break;
        bursts += 1;
        if (!until(still, WAIT)) break;
      }
      ok('they break one to a swing, three times, rather than all at once',
        bursts === 3, bursts + ' burst(s) of 3');
      ok('...and then it stops: there is no fourth', !until(flying, D * 2),
        bursting() + ' flying');

      // ONE ORDINARY REPLY, WHICH IS THE WHOLE OF WHAT 1.41.0'S SECOND HALF WAS ASKED FOR. The
      // reading was "I cannot tell the ground is being dug", and the answer was not another
      // drawing: a reply is REPLY_TOK of work (mine.js's own measured 30,600) and the ruler was
      // halved, so the same reply breaks three stones where it used to break one. The figure is the
      // engine's and the count is the host's, so putting the ruler back fails this line.
      // THE BOUNDARY IS READ OUT OF THE PANEL rather than typed here, which is the same pairing
      // MN_GLOW and MN_CHIPS already have: a panel cannot be required from node, so the one number
      // that decides between bursts and a dash is lifted out of its source
      const BURST = Number((/MN_BURST = (\d+)/
        .exec(require('fs').readFileSync(path.join(EXT, 'games', 'mine', 'panel.js'), 'utf8'))
        || [0, 0])[1]);
      const replyStones = Math.floor(engine.REPLY_TOK / engine.workOf(stepOf()));
      // AND IT IS THE ENGINE'S FIGURE TOO since 1.41.0: two of mine.js's load-time invariants are
      // about this number, so the panel and the engine holding different fours would be a screen
      // that runs the ground on a reply the engine promised would be walked
      ok('the panel\'s own ceiling on countable bursts is the engine\'s DASH_M, and it is four',
        BURST === 4 && engine.DASH_M === BURST, 'MN_BURST ' + BURST + ', DASH_M ' + engine.DASH_M);
      ok('an ordinary reply breaks more than one stone at the first step',
        replyStones >= 2, replyStones + ' stone(s) for a ' + engine.REPLY_TOK + ' token reply');
      const wasDeep = seeNow().depth;
      digTokens(engine.REPLY_TOK);
      // the depth is the host's and the burst count below is the panel's reading of the `broke` it
      // was sent, so the two together say the work became ground and the ground became an event
      ok('and the depth the host sends moved by exactly that many metres',
        seeNow().depth - wasDeep === replyStones,
        (seeNow().depth - wasDeep) + ' m of ' + replyStones);
      // ...AND IT IS DRAWN AS COUNTABLE BURSTS AND NOT AS A DASH. An ordinary reply that came out
      // as a dash would be a reader who never sees a stone break, which is the reading this
      // release is about: a dash draws the breaking ONCE however much ground ran
      ok('an ordinary reply is bursts one to a swing, not a run of ground',
        msNow() !== '1200' && replyStones <= BURST,
        replyStones + ' stone(s) against a ceiling of ' + BURST + ', ' + msNow() + 'ms');
      let each = 0;
      for (let i = 0; i < replyStones; i++) {
        if (!until(flying, WAIT)) break;
        each += 1;
        if (!until(still, WAIT)) break;
      }
      ok('so the stone breaks once for every metre of it', each === replyStones,
        each + ' burst(s) of ' + replyStones);
      // NO STEP ON THE LADDER TURNS AN ORDINARY REPLY INTO A RUN, which is the window's own
      // condition seen from the panel's side (mine.js: REPLY_M <= DASH_M). The top of the ladder
      // is 2.44x the first step, so this is a real question about a hundred rungs and not about
      // one: a ruler one notch faster would put the top of the ladder past the line and that
      // reader would never see a stone break again, only the ground running
      let dashes = 0, worst = 0;
      for (let s = 1; s <= engine.STEPS; s++) {
        const n = Math.floor(engine.REPLY_TOK / engine.workOf(s));
        if (n > worst) worst = n;
        if (n > BURST) dashes += 1;
      }
      ok('no step on the ladder draws an ordinary reply as a run',
        dashes === 0 && worst <= BURST,
        dashes + ' step(s) past the line, the busiest reply is ' + worst + ' stone(s) of ' + BURST);
      // ...AND THE HEAVIEST PUSH ALWAYS IS ONE. The other half of the same contract: 20 credits of
      // work in one beat is drawn as the ground travelling rather than as a marker vanishing
      ok('and the heaviest push is always run, at the fastest step and at the first',
        engine.PUSH_M > BURST
        && Math.floor(20 * 10000 / engine.workOf(1)) > BURST,
        engine.PUSH_M + ' m at the top, '
        + Math.floor(20 * 10000 / engine.workOf(1)) + ' m at step 1, against ' + BURST);

      // MANY STONES. A window that was shut comes back with a backlog, and the host sends the
      // truth: this is the ceiling in spec-dig.md 2-7 drawn as ONE burst with the ground running
      const wasPan = msNow();
      digStones(40);
      ok('forty stones is one dash and not forty bursts',
        msNow() === '1200' && $('mnDrift').classList.contains('pan'),
        msNow() + 'ms was ' + wasPan + 'ms');
      let many = 0;
      for (let i = 0; i < 4; i++) {
        if (until(flying, WAIT)) { many += 1; until(still, WAIT); }
      }
      ok('and the stone breaks once in it, because a count nobody can count is not a count',
        many === 1, many + ' burst(s) for forty stones');

      // THE GRAIN, WHICH IS THE CAMERA'S AND NOT THE DEPTH'S ANY MORE. It was nailed down
      // until 1.41.0 and then panned by the depth, and panning it by the depth is what the second
      // rejection was about: every push slid the rock texture one or two pixels left, for ever,
      // which is the "conveyor belt" in its purest form. It is a function of the ANCHOR now, so
      // between two camera stops the rock is a photograph of the same ground.
      // The rock is a mirror tile (420 = A | flip(A)) so it can still be panned to any offset
      ok('the rock\'s grain is one variable on all four faces, the lookahead included',
        /--mn-pan/.test(rule('.mn-drift')) && /--mn-pan/.test(rule('.mn-cut'))
        && /--mn-pan/.test(rule('.mn-floor')) && /--mn-pan/.test(rule('.mn-rock'))
        && /--mn-pan:/.test($('mnDrift').getAttribute('style') || ''),
        $('mnDrift').getAttribute('style'));
      // ...and the offset is a reading of the camera. The harness lays nothing out, so the band's
      // width is handed to it: a page with no layout pans by 0, which is where a page with no
      // layout should have it
      const panNow = () => (/--mn-pan:([-\d.]+)px/.exec($('mnDrift').getAttribute('style') || '')
        || [0, '0'])[1];
      ok('with no layout it is zero rather than a guess', panNow() === '0', panNow());
      $('mnRock').clientWidth = 156;                // the measured 156 band at a 250px sidebar
      const fx = (n) => (Math.round(n * 100) / 100) + '';
      const px = (m) => m * (156 / SPAN);           // metres of ground into pixels of this band
      // THE PANEL WRITES TWO DECIMAL PLACES (games/mine/panel.js, fx), and the grain's offset is
      // carried forward from the last write, so a DISTANCE read as the difference of two of them
      // can be a hundredth out. The figures below are 31px and 300px, so a hundredth is not what
      // any of them is about: what is compared exactly is the figure the panel is given, and what
      // is compared to a hundredth is the figure it has written down
      const near = (a, b) => Math.abs(a - b) <= 0.02;
      // A HANDFUL OF STONES MOVES THE GRAIN NOT ONE PIXEL, which is the whole of the fix. HOW BIG
      // A HANDFUL IS COMES OFF THE STRIDE and is not typed: the camera's stop is every TRAVEL
      // metres, so what has to be dug to stay inside one is whatever is left of it, and a literal
      // four stopped being right the moment the window moved (the stride is 10 m, not 33.33)
      digStones(1);                                 // the first reply after the width is known
      advance(400);
      const nailed = Number(panNow());
      const sameAnchor = seeNow().depth;
      const room = Math.floor(anchorAt(sameAnchor) + TRAVEL - sameAnchor) - 1;
      ok('there is room inside this camera stop for a handful of stones', room >= 1, room + ' m');
      digStones(room);
      advance(400);
      ok('a handful more stones does not move the rock by a pixel: the camera has not moved',
        Number(panNow()) === nailed
        && anchorAt(seeNow().depth) === anchorAt(sameAnchor) && seeNow().depth > sameAnchor,
        panNow() + 'px at depth ' + seeNow().depth + ', was ' + nailed + 'px at ' + sameAnchor);
      // ...AND A CATCH-UP MOVES IT BY WHAT THE CAMERA MOVED, which is not the same as what the
      // face cut. THE DISTANCE IS DELIBERATELY NOT A WHOLE NUMBER OF STRIDES, or the two would
      // come out equal and the assertion would be proving nothing
      const was = Number(panNow());
      const anchorWas = anchorAt(seeNow().depth);
      const cutM = TRAVEL * 4 - 3;
      digStones(cutM);
      const moved = Number(panNow()) - was;
      const strode = anchorAt(seeNow().depth) - anchorWas;
      ok('and a catch-up pans it by the camera\'s own stride, not by the ground that was cut',
        strode > 0 && near(moved, px(strode)) && !near(moved, px(cutM)),
        moved + 'px for a ' + strode + 'm stride, ' + fx(px(cutM)) + 'px if it were the digging');
      advance(1400);        // forty stones is a dash, so the run is 1,200ms and not 300
      // ...AND IS WRAPPED BACK INSIDE ONE TILE WHEN IT STOPS, off the camera rather than off the
      // sum. The tile is a mirror, so an offset and that offset plus 210 are the same picture and
      // the wrap is not a thing anybody can see
      const want = fx(((px(anchorAt(seeNow().depth)) % 210) + 210) % 210);
      ok('and when it stops it is the camera across the band, inside one tile',
        panNow() === want && Number(panNow()) < 210, panNow() + ' vs ' + want);
      // A RUN LONGER THAN A TILE is where a panel that transitioned to the MODULO of its
      // destination would be caught: the grain would take the short way round (or backwards) while
      // the world took the whole distance. It needs a wide sidebar, because the run is capped at
      // two lookaheads and two lookaheads of a 250px band is 187px, which is inside one tile
      $('mnRock').clientWidth = 257;                // the measured 257 band at a 351px sidebar
      const wide = (m) => m * (257 / SPAN);
      const far = anchorAt(seeNow().depth);
      const before = Number(panNow());
      digStones(400);                               // capped at two lookaheads, which is 308px here
      const run = Number(panNow()) - before;
      const strideFar = anchorAt(seeNow().depth) - far;
      ok('a run longer than one tile goes the whole way rather than the short way round',
        run > 210 && near(run, wide(Math.min(strideFar, 2 * engine.AHEAD_M))),
        run + 'px of camera, ' + fx(((run % 210) + 210) % 210)
        + 'px if it had taken the modulo, over a ' + strideFar + 'm stride');
      advance(1400);
      ok('...and it is inside one tile again once it has arrived',
        Number(panNow()) < 210
        && panNow() === fx(((wide(anchorAt(seeNow().depth)) % 210) + 210) % 210),
        panNow());

      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- the bag and its one button ---------------------------------------------------------------
    //
    // Everything under the band used to be sentences: "No finds yet", a chip naming what came out,
    // a line saying the pick was gone, a line saying the purse was short, and a folded pay table.
    // All of it is this one 28px row now (docs/mine-mockup/spec-dig.md, section 4)
    if (MODE === 'mine-bag') {
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      // AN EMPTY BAG IS AN EMPTY SHELF. Not a word and not a placeholder, and the row KEEPS ITS
      // HEIGHT: folded, the button under it would jump 28px on the reader's first find, which is a
      // movement nobody pressed for (4-6)
      ok('an empty bag is a row with nothing in it and no word in it',
        !!doc.querySelector('.mn-sack') && sack().length === 0 && text('mnHeap') === '',
        JSON.stringify(text('mnHeap')));
      ok('and the row is 28px whether it is empty or not, so the button never jumps',
        /min-height:28px/.test(rule('.mn-sack')), rule('.mn-sack'));
      ok('the Sell button is hidden and not disabled: a dark button with no figure is noise',
        $('mnSell').hidden && /\[hidden\]\{display:none/.test(rule('.mn-sell[hidden]')),
        [$('mnSell').hidden, rule('.mn-sell[hidden]')].join(' / '));

      // ...AND THEN SOMETHING IS IN IT. The relic row is behind a gate, so the ladder is climbed
      // to the step that opens it and then the drift is dug until the bag holds both kinds
      const relic = engine.SEAMS.filter((r) => r.kind === 'relic')[0];
      let presses = 0;
      while (stepOf() < relic.gate && presses < 200) { $('mnBuy').click(); advance(20); presses += 1; }
      advance(200);
      ok('the ladder reaches the step that opens a relic', stepOf() >= relic.gate,
        'step ' + stepOf() + ' for gate ' + relic.gate);
      const kinds = () => {
        const v = seeNow(), out = {};
        v.pays.forEach((r) => { if (r.pay > 0 && v.got[r.row] > 0) out[r.kind] = 1; });
        return Object.keys(out);
      };
      // THE LAYOUT IS A PURE FUNCTION OF THE METRE, so the relic in front of the face is a lookup
      // and not a wait: dig exactly to it. Gems come out of the cells on the way
      const nextRelic = (from) => {
        for (let c = Math.floor(from / engine.CELL_M) + 1; c < 1e6; c++) {
          const s = engine.seamAt(c);
          if (s && s.kind === 'relic' && engine.takes(stepOf(), s)) return c * engine.CELL_M;
        }
        return 0;
      };
      for (let i = 0; i < 5 && kinds().length < 2; i++) {
        const face = seeNow().depth;
        const to = nextRelic(face);
        if (!to) break;
        digStones(to - face + 1);
        advance(2000);
      }
      ok('and the drift gives up both kinds of thing', kinds().length === 2,
        kinds().join() + ' at depth ' + seeNow().depth + ', step ' + stepOf());
      // TWO PILES AND NOT FIVE. Five rows do not fit one line at a 250px sidebar, and there is
      // nothing a reader could do with the difference between three Quartz and three Amethyst:
      // one button sells the bag
      ok('the bag groups the five rows into the two kinds the host sends',
        sack().length === 2 && piles().join(' ').indexOf('gem:') === 0
        && /relic:/.test(piles().join(' ')),
        piles().join(' '));
      ok('each pile is a picture and a count, with no name and no "x"',
        sack().every((e) => e.children.length === 2
          && /^(gem|relic)$/.test(e.firstElementChild.className))
        && !/[A-Za-z]/.test(text('mnHeap')),
        piles().join(' ') + ' / ' + JSON.stringify(text('mnHeap')));
      // THE COUNT IS THE SUM OF THAT KIND'S ROWS, which is the host's got[] added up and not a
      // price worked out: the screen may not multiply a count by a pay
      const sumOf = (kind) => {
        const v = seeNow();
        return v.pays.reduce((a, r) => a + (r.kind === kind ? (v.got[r.row] | 0) : 0), 0);
      };
      ok('and the count on a pile is every row of that kind in the host\'s own bag',
        piles().join(' ') === 'gem:' + sumOf('gem') + ' relic:' + sumOf('relic'),
        piles().join(' ') + ' vs gem:' + sumOf('gem') + ' relic:' + sumOf('relic'));
      ok('a fever is not in the bag, because what it gives is ground',
        !/fever/.test(piles().join(' ')), piles().join(' '));

      // THE TOTAL IS THE HOST'S. `worth` arrives finished (4-5) and the screen prints it: a panel
      // that multiplied got[] by pays[] would be pricing the game
      const worth = seeNow().worth;
      ok('the button carries the host\'s total for the whole bag',
        text('mnSell') === 'Sell ' + worth.toLocaleString('en-US') && worth > 0,
        JSON.stringify(text('mnSell')) + ' vs ' + worth);
      ok('and the money is on the button rather than on the piles, which is where the decision is',
        !/\d/.test(piles().join(' ').replace(/:\d+/g, '')), piles().join(' '));

      // SELLING. One press, and the engine's op sells ONE ROW, so the press walks the rows the bag
      // holds. What the reader was promised is `worth`, and what arrives is the sum of the walk
      const before = h.ledgerBalance();
      const sent = mnSent().length;
      // ...and how many rows the bag is actually holding, read before the press empties it
      const held = seeNow().pays.filter((r) => r.pay > 0 && seeNow().got[r.row] > 0).length;
      $('mnSell').click();
      ok('the pile leaves upwards at the find\'s own 240ms, and not downwards',
        /\bpop\b/.test($('mnHeap').className)
        && /mnSold 240ms ease-out/.test(rule('.mn-heap.pop'))
        && /translate\(0,-150%\)/.test(kf('mnSold')),
        $('mnHeap').className + ' | ' + kf('mnSold'));
      // THE HOST ANSWERS IN ABOUT A MILLISECOND, so the row has to be HELD for the rest of the
      // 240ms or the piles are redrawn out of existence before they have moved and the bag simply
      // blinks. Checked at 100ms, which is after every reply of the walk has landed
      advance(100);
      ok('the piles are still in the air while the host is answering, not redrawn under them',
        sack().length >= 2 && /\bpop\b/.test($('mnHeap').className),
        piles().join(' ') + ' | ' + $('mnHeap').className);
      advance(300);
      const sellOps = mnSent().filter((m) => m.op === 'sell');
      ok('one press asks the host once per row it holds, and names the row each time',
        sellOps.length === held && held >= 2 && sellOps.every((m) => Number.isInteger(m.kind)),
        sellOps.length + ' message(s): ' + JSON.stringify(sellOps.map((m) => m.kind))
        + ', ' + (mnSent().length - sent) + ' sent in all');
      ok('the balance rises by exactly what the button said, and the host did the pricing',
        h.ledgerBalance() === before + worth, before + ' + ' + worth + ' -> ' + h.ledgerBalance());
      ok('and the bag is an empty shelf again, with the button hidden and the row still there',
        sack().length === 0 && $('mnSell').hidden && !!doc.querySelector('.mn-sack')
        && seeNow().worth === 0,
        sack().length + ' pile(s), hidden=' + $('mnSell').hidden + ', worth ' + seeNow().worth);
      ok('nothing was sold twice: the host holds the counts and they are gone',
        seeNow().got.every((n) => n === 0), JSON.stringify(seeNow().got));

      // THE TOTAL IS PRINTED, NOT WORKED OUT, and the only way to see the difference is a reply
      // where the two disagree. The engine cannot send one -- `worth` IS the sum of got[] times
      // pays[] (mine.bagValue) -- so a panel that did the multiplication itself would agree with
      // every reply the host can make and the defect would ship. The figure is forced here instead:
      // one Quartz in the bag, which that panel would price at 2
      const forced = Object.assign({}, seeNow(), {
        got: [1, 0, 0, 0, 0, 0], worth: 4321, found: null, fever: null, broke: 0
      });
      toWebview({ type: 'mn', balance: h.ledgerBalance(), free: 1e9, state: forced });
      advance(600);
      ok('the total is the host\'s figure and not a product the screen worked out',
        text('mnSell') === 'Sell 4,321' && piles().join(' ') === 'gem:1',
        JSON.stringify(text('mnSell')) + ' for ' + piles().join(' '));

      // A REFUSAL STOPS THE WALK WHERE IT IS. Two windows share one record, so the other one can
      // sell a row between two messages of this walk, and the host then answers with a reason AND
      // a state. Carrying on would send the next row, and THAT reply clears the warning bar before
      // anybody has read it: the reader would be shown a bag half sold with nothing said about it
      const two = Object.assign({}, seeNow(), {
        got: [1, 1, 0, 0, 0, 0], worth: 8, found: null, fever: null, broke: 0
      });
      toWebview({ type: 'mn', balance: h.ledgerBalance(), free: 1e9, state: two });
      advance(600);
      ok('the bag is holding two rows again', !$('mnSell').hidden && piles().join(' ') === 'gem:2',
        text('mnSell') + ' for ' + piles().join(' '));
      const asked = mnSent().filter((m) => m.op === 'sell').length;
      h.intercept = (c) => {
        if (c.type !== 'mn' || c.op !== 'sell') return false;
        toWebview({
          type: 'mn', n: c.n, balance: h.ledgerBalance(), free: 1e9,
          error: 'nothing to sell', state: two
        });
        return true;
      };
      $('mnSell').click();
      advance(800);
      h.intercept = null;
      ok('a refused row stops the walk rather than sending the next one',
        mnSent().filter((m) => m.op === 'sell').length === asked + 1,
        (mnSent().filter((m) => m.op === 'sell').length - asked) + ' message(s) for 2 rows');
      ok('...and the reason is still on the screen when it stops',
        !$('mnErr').hidden && /nothing to sell/.test($('mnErr').textContent),
        [$('mnErr').hidden, JSON.stringify($('mnErr').textContent)].join(' / '));
      ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // --- the light on the pick --------------------------------------------------------------------
    //
    // A hundred steps and four drawings, so above the four bands the only thing a purchase can
    // show is a light (docs/mine-mockup/spec-dig.md, section 5). This page climbs the whole ladder
    if (MODE === 'mine-glow') {
      openDoor('mine');
      skipAhead(61000);
      drivePush(2.5);
      const tools = require(path.join(EXT, 'games', 'mine', 'tools.js'));
      // FIVE BANDS, AND THE FIRST ONE IS NOTHING. An unlit tool is the baseline, and a baseline
      // that is itself a value leaves the other four with nothing to be read against
      ok('the stylesheet draws four lights over an unlit baseline',
        tools.GLOW.length === 5 && tools.GLOW[0] === 0
        && tools.GLOW.slice(1).every((r) => r > 0),
        JSON.stringify(tools.GLOW));
      ok('and none of the four is a box: they follow the tool\'s own shape',
        [1, 2, 3, 4].every((i) => /drop-shadow/.test(rule('.mn-pick.g' + i))
          && !/box-shadow/.test(rule('.mn-pick.g' + i))),
        rule('.mn-pick.g4'));
      // gold WITH A cream KEYLINE, and cream alone would outshine the relic it is lighting the way
      // to. ember was this band's signature until 1.41.0 took the reach line out and is now unused
      // in the drift, which is why it is still checked for: the light is what the ladder buys, and
      // a light in the colour of a mark that has gone is a mark coming back by the side door
      ok('the light is gold over a cream keyline, and never ember',
        [1, 2, 3, 4].every((i) => /#fcecdc/.test(rule('.mn-pick.g' + i))
          && /#e8b23a/.test(rule('.mn-pick.g' + i)) && !/e8895a/.test(rule('.mn-pick.g' + i))),
        rule('.mn-pick.g1'));
      // 6px IS THE LAST RADIUS AT WHICH A 28px PICK IS STILL A PICK
      ok('the radii rise to six pixels and stop there',
        tools.GLOW[4] === 6 && /6px/.test(rule('.mn-pick.g4')),
        JSON.stringify(tools.GLOW));

      // THE BANDS ARE A READING OF `step`, in fifths of `steps`. 0-19 / 20-39 / 40-59 / 60-79 /
      // 80-100, which is spec-dig.md 5-4's table written as one division
      const climb = (to) => {
        let n = 0;
        while (stepOf() < to && n < 400) { $('mnBuy').click(); advance(20); n += 1; }
        advance(200);
      };
      const want = (step) => Math.min(4, Math.floor(step / engine.STEPS * 5));
      climb(1);
      ok('step 1 of a hundred is unlit, which is what the other four are read against',
        stepOf() === 1 && glowOf() === 0 && want(1) === 0, 'step ' + stepOf() + ' g' + glowOf());
      for (const edge of [19, 20, 39, 40, 59, 60, 79, 80, 100]) {
        climb(edge);
        if (stepOf() < edge) { ok('the ladder reaches step ' + edge, false, 'stopped at ' + stepOf()); break; }
        ok('step ' + edge + ' of ' + engine.STEPS + ' is light ' + want(edge),
          glowOf() === want(edge) && glowOf() === want(seeNow().step),
          'g' + glowOf() + ' at step ' + stepOf() + ', wanted g' + want(edge));
      }
      ok('the top of the ladder is the top light and the drawing is the fourth band',
        stepOf() === engine.STEPS && glowOf() === 4 && rungOf('mnPick') === 4,
        'step ' + stepOf() + ' t' + rungOf('mnPick') + ' g' + glowOf());
      // ...AND THE BUTTON GOES, because a purchase that changes nothing is not offered at all
      // (mine.js, `sealed`). That is the host's judgment and the screen only hides the button
      ok('and there is nothing left to buy, so the button is not there',
        $('mnBuy').hidden && seeNow().offer === null,
        [$('mnBuy').hidden, JSON.stringify(seeNow().offer)].join(' / '));

      // THE LIGHT IS NOT MOTION. It is a filter that never changes within a step, so a reader who
      // asked for less motion keeps every bit of what four hundred thousand credits bought them.
      // Checked in the stylesheet, because that is where it would be switched off
      // every page on the floor has one of these blocks, so what is read is the mine's own
      const quiet = (css().match(/@media \(prefers-reduced-motion:reduce\)\{(?:[^{}]|\{[^{}]*\})*\}/g)
        || []).filter((b) => /\.mn-/.test(b)).join(' ');
      ok('reduced motion stops the crab, the pick, the step and the grit',
        /\.mn-crab\.dig/.test(quiet) && /\.mn-pick\.dig/.test(quiet)
        && /\.mn-dig\.step/.test(quiet) && /\.mn-chip\.burst/.test(quiet),
        JSON.stringify(quiet));
      ok('...and does not touch the light, which is not a movement',
        !/mn-pick\.g/.test(quiet) && !/filter/.test(quiet), JSON.stringify(quiet));
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
    // A reader who has never dug: no pick, which is `tool: 'claw'` and an empty claw. There is no
    // line and no veil to draw, because a pick has no distance at which it stops cutting (1.41.0)
    const first = engine.seamsAhead(0);
    ok('the drift is one band: dug ground, a lookahead, and the crab standing at the face',
      !!doc.querySelector('#mnDrift .mn-cut') && !!doc.querySelector('#mnDrift .mn-rock')
      && !!$('mnCrab'), $('mnDrift').innerHTML.slice(0, 80));
    // THE HOLE HAS AN INSIDE. Two rectangles of different greys were what shipped in 1.39.0 and
    // what came back was that it is two rectangles: the pair cannot be told apart by tone at any
    // wash (every value from .45 to .30 lands inside 1.35 and 1.41 against the rock, measured),
    // so what says "somebody dug this" is the furniture. All of it is built once and none of it
    // moves, which is why it is checked here and never again
    // HOW MANY PIECES THERE ARE IS NOT A CONSTANT ANY MORE (spec-idle.md, section 6). Each one is
    // at a DEPTH, so what is in the hole is whatever ground the hole is holding: the hole is
    // 66 metres long right after the camera takes a stride and 99 when the face has walked the
    // whole way, and a pitch is 17 metres, so the count moves with the digging. What is still
    // fixed is that there is a floor, a lip, several sleepers and whole frames
    ok('the dug hole is a place and not a dark rectangle: a floor, its lip, sleepers and timber',
      !!doc.querySelector('#mnDrift .mn-cut .mn-floor')
      && !!doc.querySelector('#mnDrift .mn-cut .mn-brow')
      && doc.querySelectorAll('#mnDrift .mn-sill').length >= 4
      && doc.querySelectorAll('#mnDrift .mn-beam').length >= 1
      && doc.querySelectorAll('#mnDrift .mn-beam').length
        === doc.querySelectorAll('#mnDrift .mn-post').length / 2,
      doc.querySelectorAll('#mnDrift .mn-sill').length + ' sleepers, '
      + doc.querySelectorAll('#mnDrift .mn-beam').length + ' caps, '
      + doc.querySelectorAll('#mnDrift .mn-post').length + ' posts');
    // UNEVENLY SPACED, which survived the move to depths: the jitter is a property of each
    // sleeper's own index, so a given piece of timber is always the same distance out of line.
    // Evenly spaced rungs across a dark gap are a ladder rather than a drift (spec.md, 6)
    const sillX = sillsAt();
    const gaps = sillX.slice(1).map((x, i) => Math.round((x - sillX[i]) * 100) / 100);
    ok('and the sleepers are not evenly spaced, or they would be the rungs of a ladder',
      gaps.length >= 3 && new Set(gaps).size > 1, gaps.join(','));
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
    ok('and each one stands at its own depth on the band, measured off the camera',
      ores().map(leftOf).join() === first.map((s) => pct(s.at, anchorAt(0))).join(),
      ores().map(leftOf).join() + ' vs ' + first.map((s) => pct(s.at, anchorAt(0))).join());
    // THE BAND IS A MAP AND THE CAMERA IS PARKED AT 40% OF IT, which is where every figure above
    // is measured from. At the surface the camera is at 0 and nothing has been cut, so the face is
    // exactly on its stop
    ok('the camera starts on its stop, with the face at the 40% mark and nothing slipped',
      facePct() === 40 && slipNow() === 0, 'face ' + facePct() + '%, slip ' + slipNow() + '%');
    // THE LINE AND THE VEIL ARE NOT HERE, and not as hidden elements either: the whole of what they
    // drew was how much further the pick in hand could cut, and nothing wears out. A stylesheet
    // rule for either one is a dead rule and is read for here as well as the markup
    ok('there is no reach line and no veil on the band, in the markup or the stylesheet',
      !$('mnReach') && !$('mnVeil') && !/mn-(reach|veil)/.test($('mnDrift').innerHTML)
      && !/\.mn-(reach|veil)\{/.test(css()),
      [!!$('mnReach'), !!$('mnVeil'), /\.mn-(reach|veil)\{/.test(css())].join(' / '));
    // ...AND NOTHING SAYS IT IN WORDS ANY MORE (1.41.0). "The pick is gone. Bare hands dig,
    // slowly" was a sentence over a picture that already said it. What is left is the empty claw,
    // and the one place it is still in words is where there is no picture at all
    ok('and the empty claw says it, with no sentence under the band',
      !$('mnNote') && /No pick: digging by hand/.test($('mnDrift').getAttribute('aria-label')),
      [!!$('mnNote'), $('mnDrift').getAttribute('aria-label')].join(' / '));
    ok('nothing has come out yet, and the bag is an empty shelf rather than a sentence',
      !!$('mnHeap') && sack().length === 0 && text('mnHeap') === '' && $('mnSell').hidden,
      [sack().length + ' pile(s)', JSON.stringify(text('mnHeap')), $('mnSell').hidden].join(' / '));
    ok('and bare hands carry no pick, while the crab keeps swinging',
      $('mnPick').hidden && rungOf('mnPick') === 0,
      [$('mnPick').hidden, 't' + rungOf('mnPick')].join(' / '));

    // THE THINGS THAT MAY NOT BE ON THIS SCREEN (5-15, and spec-dig.md section 3). The drive is a
    // swing, so a figure for it is the screen answering a question it was built not to ask -- and
    // after 1.41.0 there is no SENTENCE either. The enumeration in
    // section 3 is the acceptance condition: a heading, a depth, counts, a total and a verb
    const onScreen = () => panel().textContent;
    ok('there is not one per cent sign on the screen', onScreen().indexOf('%') < 0,
      JSON.stringify(onScreen()));
    ok('and the band itself carries no text at all', $('mnDrift').textContent === '',
      JSON.stringify($('mnDrift').textContent));
    // ONE WORD PER CONTROL AND NOTHING WITH A VERB AND AN OBJECT IN IT. Measured as "no run of
    // three words outside the heading and the two buttons", which is what a sentence is made of
    const words = () => onScreen().replace(/\s+/g, ' ').trim();
    ok('and there is no sentence anywhere on it',
      !/(Bare hands|You need|No finds|How it pays|needs a)/i.test(words()),
      JSON.stringify(words()));

    // --- 3. one button, and it is not the primary one ---------------------------------------------
    const buy = () => $('mnBuy');
    ok('the one control is a button that is not primary',
      !buy().hidden && !buy().disabled && !buy().className.split(/\s+/).includes('primary'),
      buy().className + ' / ' + buy().textContent);
    // ONE VERB AND ONE FIGURE. It read "New pick 12,500" until 1.40.1 and then the pick's name
    // until 1.41.0, and a hundred steps have no names, so what is left is the verb and the price.
    // THE PRICE IS THE HOST'S and is not written out here.
    // `offer.name` DOES NOT EXIST ANY MORE, and the old assertion compared the button against
    // `offer.name + ' ' + offer.price`, which is "undefined 10" on both sides: it passed while the
    // screen printed the word undefined. Comparing against a figure cannot do that
    const offer = engine.offerFor(engine.fresh('', 1));
    ok('and it carries the verb and the price the host set, with no name and no undefined',
      text('mnBuy') === 'Upgrade ' + offer.price.toLocaleString('en-US')
      && offer.name === undefined && !/undefined/.test(panel().textContent),
      JSON.stringify(text('mnBuy')));
    // WHAT IT WOULD DO IS IN THE TOOLTIP, where there is room to say the step, the ladder's length
    // and the rate in one breath. `swings` is on the reply and may not be on the button's FACE:
    // it is a rate, and 5-15 takes every rate off this screen
    ok('how much faster it cuts is in the tooltip and not on the face',
      /\b\d+ swings a stone\b/.test($('mnBuy').title)
      && !/swing/i.test(text('mnBuy')) && offer.swings > 0,
      JSON.stringify($('mnBuy').title));

    const before = h.ledgerBalance();
    buy().click(); advance(60);
    ok('fitting a pick is charged once, by the host, out of the record',
      h.ledgerBalance() === before - offer.price, before + ' -> ' + h.ledgerBalance());
    ok('and the record is in the ledger rather than in this window',
      !!gs.data.creditLedgerV1.mine && gs.data.creditLedgerV1.mine.step === 1,
      JSON.stringify(gs.data.creditLedgerV1.mine));
    advance(400);
    ok('and the pick is in the claw the moment it is bought, with nothing to warn about',
      !$('mnPick').hidden && !$('mnReach') && !$('mnVeil'),
      [$('mnPick').hidden, !!$('mnReach'), !!$('mnVeil')].join(' / '));
    // the next step's own price, off the engine: the ladder is priced against what each step can
    // take out of the wall (mine.js), so a literal here would be a figure typed twice
    ok('the button now offers the next step up',
      text('mnBuy').indexOf(String(engine.priceOf(2))) >= 0, JSON.stringify(text('mnBuy')));
    // ...AND THE FIRST STEP IS NOT LIT. The light is the top four fifths of the ladder, so step 1
    // of 100 is the baseline an unlit tool has to be for any of the four to mean anything
    ok('and the first step of a hundred is the unlit baseline',
      rungOf('mnPick') === 1 && glowOf() === 0,
      't' + rungOf('mnPick') + ' g' + glowOf());

    // --- 4. the ground moves on a push nobody asked for -------------------------------------------
    //
    // The depth is a function of the ledger's whole weighted token count and of nothing else
    // (mine.js), so the way to dig in a test is to do the work: another day of input tokens, which
    // weigh 1 each. THE FIGURE IS DERIVED and not typed, because the ruler has moved once already
    // (1.41.0's stone is 20,000 tokens where a metre used to be 100,000) and because this depth has
    // two jobs: enough cells behind it to have passed several seams the fist's own gate opens, and a
    // seam still STANDING IN THE LOOKAHEAD, because the fever block below pops the markers that are
    // in the slide and an empty window has none to pop. The layout is a pure function of the metre,
    // so both are a lookup: the first standing seam from cell 8 on, with the face brought to one
    // metre inside its window.
    // NO FEVER CAN FIRE ON THE WAY, which is what makes the depth exactly this figure: the fever
    // row is gated at step 10 (mine.js, SEAMS) and the pick here is step 1, so there is no grant
    let mark = 8;
    while (!engine.seamAt(mark) && mark < 1e6) mark += 1;
    const DUG_M = mark * engine.CELL_M - engine.AHEAD_M + 1;
    const DUG_TOK = DUG_M * engine.workOf(1);
    const asked = mnSent().length, got = mnGot();
    gs.data.creditLedgerV1.days['2026-09-02'] =
      { input: DUG_TOK, output: 0, cache_creation: 0, cache_read: 0 };
    // WHAT THE NEXT PUSH IS ABOUT TO TAKE, read before it happens: afterwards the boundary has
    // moved and the claim is gone, so a sweep run after the push answers null
    const chip = engine.sweep(engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0),
      credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1)));
    hostSend({ type: 'ready' });          // the host's own push, which is what runs onPush
    advance(20);
    ok('the host redraws the drift on a push, with nobody having asked',
      mnGot() > got && mnSent().length === asked,
      (mnGot() - got) + ' reply(s), ' + (mnSent().length - asked) + ' request(s)');

    const tok = credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1));
    const rec = engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, tok);
    const want = engine.view(rec, 1e9, tok, null, -1);
    ok('the depth the tokens dug is what the corner says',
      text('mnSide') === want.depth.toLocaleString('en-US') + ' ' + want.unit,
      JSON.stringify(text('mnSide')) + ' vs ' + want.depth);
    ok('the ground that was paid for is behind the face now',
      ores().length === want.seam.length
      && ores().map(leftOf).join()
        === want.seam.map((s) => pct(s.at, anchorAt(want.depth))).join(),
      ores().map(leftOf).join() + ' vs '
      + want.seam.map((s) => pct(s.at, anchorAt(want.depth))).join());
    // ...AND THE CRAB HAS WALKED, which is the whole of the first rejection. The face is past its
    // own stop by exactly the ground the work cut since the camera last moved, which is a figure
    // the host declared (the depth) over a window the host declared: no pixel, no measurement and
    // nothing this file chose
    ok('and the face is where the camera says the digging has got to, not pinned at 40%',
      facePct() === at(want.depth, anchorAt(want.depth)) && facePct() > 40,
      'face ' + facePct() + '% for depth ' + want.depth + ' off anchor ' + anchorAt(want.depth));
    // ...and the window is not empty, which the fever block below needs: it pops the markers that
    // are standing in the slide, one at a time
    ok('and a seam is standing in the lookahead for the run below to pass',
      want.depth === DUG_M && want.seam.length > 0,
      'depth ' + want.depth + ' of ' + DUG_M + ', ' + want.seam.length + ' marker(s)');
    // ...AND THE TOOL IS UNTOUCHED BY THE DIGGING, which is the state that replaced the three the
    // line used to have: the pick that was bought seven hundred metres ago is the pick in the claw
    ok('the pick is the same pick after seven hundred metres of it',
      want.tool === 'pick' && want.step === 1 && !$('mnPick').hidden && rungOf('mnPick') === 1,
      [want.tool, 'step ' + want.step, 't' + rungOf('mnPick')].join(' / '));

    // The find: it goes into the BAG now (1.41.0) rather than onto a chip, and the pacing is the
    // same 240ms with the reduced-motion page having it at once (docs/game-panels.md, section 6)
    advance(reduce ? 5 : 300);
    const biggestIn = (c) => c.finds.reduce((a, f) => (a && a.pay >= f.pay ? a : f), null);
    const chipWant = chip.claim ? biggestIn(chip.claim) : null;
    // WHAT COMES OUT IS A PICTURE AND A COUNT, with no name and no price beside it. The chip that
    // used to print "Garnet 14" is gone with the rest of the words: what a row is worth is taught
    // by the total on the button moving
    ok('what came out of the wall is in the bag as a picture and a count, not as a name',
      !!chipWant && piles().length > 0 && !/[A-Za-z]/.test(text('mnHeap')),
      piles().join(' ') + ' / ' + JSON.stringify(text('mnHeap')));
    // THE TOTAL IS THE HOST'S `worth` AND THE SCREEN DOES NOT MULTIPLY. Read off the engine against
    // the record the push left behind, so a panel that worked the figure out from got[] and pays[]
    // would still have to agree with this -- and a panel that rounded or summed differently fails
    const bagNow = () => engine.view(
      engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0),
      1e9, credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1)), null, -1);
    ok('and the button carries the host\'s own total for the bag',
      text('mnSell') === 'Sell ' + bagNow().worth.toLocaleString('en-US') && bagNow().worth > 0,
      JSON.stringify(text('mnSell')) + ' vs worth ' + bagNow().worth);
    ok('it is read out once, since the band and the bag are both pictures',
      !!chipWant && text('mnLive').indexOf(engine.SEAMS[chipWant.row].name) >= 0,
      JSON.stringify(text('mnLive')));
    ok('and no figure about the tool came with it', onScreen().indexOf('%') < 0,
      JSON.stringify(onScreen()));

    // --- 5. a fever: the ground runs, and the seams in it go one at a time ------------------------
    //
    // The 1,200ms dash is the one event on this screen that is bigger than a chip, and it is the
    // first owner of section 6's "press the gaps together, do not cut the tail off". Reaching one
    // is arithmetic rather than luck: the layout is a pure function of the depth, so the first fever
    // in the drift stands at a known cell and digging past it is a number of tokens.
    // THE FEVER IS BEHIND A GATE (1.41.0), so the ladder is climbed to the step that opens it
    // before any of this can happen: below that step the row is in the rock and inert, which is
    // its own assertion in the `mine-tiers` page and not this one's business
    const feverRow = engine.SEAMS.filter((r) => r.kind === 'fever')[0];
    let presses = 0;
    const stepIs = () => engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0).step;
    while (stepIs() < feverRow.gate && presses < 200) { $('mnBuy').click(); advance(20); presses += 1; }
    advance(400);
    // ...and then exactly the work that carries the face past the first fever cell in front of it
    const atStep = stepIs();
    const faceNow = engine.depthOf(engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0),
      credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1)));
    // ...AND NOT JUST ANY FEVER. The dash's pacing is "one seam at a time, gaps pressed together"
    // (docs/game-panels.md section 6), so the fever this page needs is one whose own grant holds at
    // least two takeable seams. The layout is a pure function of the metre, so that is a lookup
    const span = engine.FEVER_M / engine.CELL_M;
    let feverAt = 0;
    for (let c = Math.floor(faceNow / engine.CELL_M) + 1; !feverAt && c < 1e6; c++) {
      const seam = engine.seamAt(c);
      if (!seam || seam.kind !== 'fever') continue;
      let inside = 0;
      for (let k = 1; k <= span; k++) {
        const t2 = engine.seamAt(c + k);
        if (t2 && t2.pay > 0 && engine.takes(atStep, t2)) inside += 1;
      }
      if (inside >= 2) feverAt = c * engine.CELL_M;
    }
    ok('the layout holds a fever with two takeable seams inside its own grant', feverAt > 0, feverAt);
    gs.data.creditLedgerV1.days['2026-09-03'] =
      { input: (feverAt - faceNow + 1) * engine.workOf(atStep), output: 0, cache_creation: 0, cache_read: 0 };
    const deep = engine.sweep(engine.load(credits.normalizeLedger(gs.data.creditLedgerV1).mine, 0),
      credits.weightedTotal(credits.normalizeLedger(gs.data.creditLedgerV1)));
    ok('the ledger digs past a fever, which is what the rest of this block is about',
      !!deep.claim && deep.claim.grant > 0 && deep.claim.dashHits >= 2,
      JSON.stringify(deep.claim && { grant: deep.claim.grant, hits: deep.claim.dashHits }));
    const popped = () => doc.querySelectorAll('#mnSlide .mn-ore').filter((e) => /pop/.test(e.className)).length;
    const standing = () => ores().length;
    const was = standing();
    // what the band holds once the run has stopped: the seams ahead of the depth the fever reached
    const after = engine.seamsAhead(deep.claim.depth, atStep).length;
    // the biggest thing in the run, by its ROW: the host sends no names on a find any more, so the
    // name the chip prints is looked up in the table the same way the panel looks up its picture
    const biggest = engine.SEAMS[biggestIn(deep.claim).row].name;
    hostSend({ type: 'ready' }); advance(20);
    if (reduce) {
      ok('reduced motion draws the whole run at once, with nothing bursting',
        popped() === 0 && standing() === after && text('mnLive').indexOf('Fever') === 0,
        popped() + ' popping, ' + standing() + ' standing, ' + JSON.stringify(text('mnLive')));
    } else {
      // THE WHOLE WORLD RUNS, and it is one variable rather than one box's inline transform now
      // (spec-idle.md, 4-3): a fever is twelve of the camera's strides taken at once, so the
      // markers, the sleepers and the frames all go left together while the ground that is drawn
      // is still the ground the run is passing
      ok('the ground on screen runs past the face rather than being redrawn',
        slipNow() < 0 && msNow() === '1200' && standing() === was
        && $('mnDrift').classList.contains('pan'),
        ['slip ' + slipNow() + '%', msNow() + 'ms', standing() + ' standing',
          $('mnDrift').className].join(' / '));
      // ONE AT A TIME, which is the half of section 6's rule the host can be held to: the first
      // marker goes as the run starts and the rest follow one by one. HOW LONG THE GAP IS is the
      // panel's own arithmetic (max(70, 1200/n), and it moved when the dash's pacing was rebuilt),
      // so what is asserted here is the shape and not the millisecond: one at the start, and every
      // one of them by the end, with nothing cut off the tail
      ok('the first of them goes as the run starts', popped() === 1, popped() + ' popping');
      // ...AND THEY DO NOT ALL BURST TOGETHER, which is the half of the rule that is the host's:
      // a marker that has finished its pop is off the screen, so what is counted over the run is
      // how many are popping AT ONCE. One at a time means that figure never reaches the number of
      // seams the run passed, whatever the gap works out to
      // the sampling adds up to the 1,300 ms the block used to step through in two jumps, so the
      // assertions after it still land where they did: the ground stops at 1,200 and the chip at
      // 1,400 (docs/game-panels.md, section 6)
      let most = 1;
      for (let i = 0; i < 18; i++) { advance(70); most = Math.max(most, popped()); }
      advance(40);
      ok('and the rest follow one at a time rather than all at once',
        most < deep.claim.dashHits, most + ' popping at once of ' + deep.claim.dashHits);
      ok('when the running stops the new ground is drawn', standing() === after,
        standing() + ' marker(s) for ' + after);
      ok('and nothing has been said about the money yet',
        text('mnLive').indexOf('Fever') < 0, JSON.stringify(text('mnLive')));
      advance(200);
      // THE READ-OUT WAITS FOR THE GROUND. 1,400ms against the dash's 1,200: a figure that landed
      // while the drift was still running would be a figure about ground nobody had seen yet
      ok('the run is then read out, after the ground has stopped',
        text('mnLive').indexOf('Fever') === 0
        && text('mnLive').indexOf(String(deep.claim.dashHits)) > 0,
        JSON.stringify(text('mnLive')));
      ok('and the biggest thing in it went into the bag with no name beside it',
        piles().length > 0 && !/[A-Za-z]/.test(text('mnHeap')) && !!biggest,
        piles().join(' ') + ' / ' + JSON.stringify(text('mnHeap')));
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
    ok(reduce ? 'and the pick and the step stop with it, not just the crab'
      : 'and the pick and the step swing with it, on one duration',
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
