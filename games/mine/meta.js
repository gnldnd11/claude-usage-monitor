// The credit mine's host side: the one screen behind the crossroads' third door, and the only one
// in the extension the reader does not play. The tokens they spend working ARE the digging, so the
// drift goes deeper while nobody is looking and what comes out of the wall is credits. All of the
// judging is mine.js; this file is the wiring.
//
// LIKE THE MARKET, NOT ON THE ROUND DRIVER (games/tables.js), and for the market's own reason: a
// depth and a pick are the reader's property rather than a round, so the record is in the credit
// ledger, every window shares one copy, and a message answered off the copy in memory would be a
// claim the merge then throws away. The seven rules that come with that are games/README.md
// section 3, and this file differs from the market's in three places worth naming here:
//
//  - THE INPUT IS THE LEDGER, NOT THE CLOCK. `deps.tokens()` is credits.weightedTotal of the same
//    merged ledger a reply's balance is read from (extension.js), and it is taken ONCE per message.
//    Nothing off the wire can name it, the way nothing off the wire can name the market's clock.
//  - EVERY MESSAGE SWEEPS FIRST. The ground the work broke since the last message yields into the
//    bag before anything else is answered, so a press and a crossed cell that land together are
//    answered off one record rather than two. NO CREDITS MOVE IN A SWEEP: the wall yields gems and
//    the selling pays, which is claim (b) in two halves (mine.js's header).
//  - THE CLAIM AND THE PURCHASE TRAVEL IN ONE WRITE. A press can land on a message that also
//    crossed a cell, and two writes would be two records for one message, which is the one thing
//    `kept()` cannot answer about (games/README.md section 3 point 5: a window writes exactly one
//    record per move count, so the pair (moves, by) is that record's name).
//
// WHAT THE SCREEN IS NOT TOLD is the layout beyond the lookahead. mine.view() sends the seams
// inside the window and nothing further out, which is this game's version of not handing the
// webview a live round's seed (games/README.md section 2, docs/game-panels.md 5-15).
'use strict';
const engine = require('../../mine');
const ore = require('./ore');
const tools = require('./tools');

// How much more work bare hands take, for the heading's one-line tooltip. Read off the engine
// rather than written down: a hint that disagrees with what the wall actually gives up is worse
// than no hint
const FIST_SPEED = engine.FIST_DIV;

module.exports = {
  id: 'mine',
  key: 'mn',
  name: 'Mine',                 // the DOOR's caption, since this game has no list row
  // BEHIND ITS OWN DOOR, so it is not on the games list at all. The list asks "what shall I play"
  // and the answer to that is never the screen that digs whether or not anybody opens it
  // (docs/shop-spec.md, 2-7). games/registry.js is where a door becomes a button
  door: 'mine',
  icon: 'pick',                 // icons.js: the one thing on this screen there is to press
  title: 'Credit mine',         // the door says where it goes, the screen says what it does (1-1)
  // The four things a reader has to know before the screen makes sense. The tooltip is the one
  // place on this screen that still has words, and these are the four it spends them on: the work
  // is the digging, a stone is the unit, the bag is where finds go until they are sold, and a step
  // is both a speed and a key (mine.js, the seam table's `gate`), and it is kept for good. The
  // rows themselves are not listed here because the `?` fold has them
  hint: 'Your work breaks the rock, a stone at a time · what comes out goes in the bag until you '
    + 'sell it · each step breaks stones faster and opens more of the wall · bare hands take '
    + (FIST_SPEED === 8 ? 'eight' : String(FIST_SPEED)) + ' times the work and open the least',
  panel: 'games/mine/panel.js',
  cls: 'mn',
  // NOT A PLACE ON THE LIST, because there is no row: `order` is still here because it is what
  // every reader of the register sorts on, and a game with none sorts by the file system
  // (games/README.md). 200 leaves the whole gap after the market free
  order: 200,
  // The swinging crab, 16 frames in one strip. It is a PNG in the published root like a list row's
  // thumb, and the host turns it into a webview URI the same way (games/registry.js's `art`): a
  // panel cannot make one, and the strip is this game's and no shared file's
  // The swinging crab, 16 frames in one strip, and the four pieces the drift itself is built out
  // of. They are PNGs in the published root like a list row's thumb, and the host turns them into
  // webview URIs the same way (games/registry.js's `art`): a panel cannot make one, and these are
  // this game's and no shared file's.
  //
  // THE FOUR ARE CUT OUT OF hero-mine.png AND NOTHING IS DRAWN. The door's own picture is a mine,
  // so the rock, the timber and the sleepers in the band are the same rock, timber and sleepers
  // the reader pressed to get here, at 1:1 and with no new pixel invented (docs/mine-mockup/spec.md,
  // section 1). `rock` is the one that is mirrored onto itself, which doubles the horizontal period
  // to 210 so the repeat is invisible across the widest band there is
  art: {
    dig: 'mine-dig.png',
    rock: 'mine-rock.png',
    beam: 'mine-beam.png',
    post: 'mine-post.png',
    sill: 'mine-sill.png'
  },

  // deps: reply, budget, record, storedMine, tokens, replica, ensureReplica, push, log, live.
  // `random` is not here: there is no seed in this game, the layout being a pure function of the
  // depth (mine.js, bucketOf)
  createHandler(deps) {
    let rec = null;      // rebuilt from the ledger whenever storage is ahead of it
    let reqN = null;
    // The claim that just landed, which is what the screen celebrates. It belongs to the HANDLER
    // and not to the record: a find is an event, and a record that stored the last one would show
    // it again after a reload (mine.js, sweep)
    let ev = null;
    // The depth this window last told the webview about, so the pushes nobody asked for say
    // nothing when the ground has not moved
    let toldDepth = -1;

    function saved() { return engine.save(rec); }

    // Takes the stored record when it is the later one. Returns true when the record in memory
    // changed, which is what an unasked redraw hangs on.
    // `tok` is handed to load() because a reader whose mine has never been written ANCHORS HERE:
    // the mine is born at the token count it is first read at, so nothing is paid for work done
    // before the screen existed (mine.js, fresh)
    function sync(tok) {
      const stored = deps.storedMine();
      if (!rec || engine.newer(stored, saved())) { rec = engine.load(stored, tok); return true; }
      return false;
    }

    // ONE FORCED WRITE, carrying the ground and the money together: both halves of this game are
    // fields of the record (`earned` and `spent`), so the bank is handed 0. What comes back is the
    // merged ledger, which is also how this window finds out whether what it just did is what
    // every window will see.
    //
    // A dropped move is shown as what it is: the record another window left, with no chip on it.
    // Nothing was banked for it, so there is nothing to take back
    function commit(next, tok) {
      const mine = Object.assign(engine.save(next), { by: deps.replica() || '' });
      const ledger = deps.record(0, { mine });
      const landed = ledger && ledger.mine;
      if (!engine.kept(mine, landed)) { rec = engine.load(landed, tok); return false; }
      // The merge lifts nothing out of the loser (mine.MAX_FIELDS is empty, and its own comment
      // says what each field would cost if it did), so the only field to take back is `by`, which
      // is this window's now. Without it the next sync() would read storage's copy of this very
      // write as the later one and adopt it, dropping the claim and its read-out with it
      rec = Object.assign({}, next, { by: landed.by });
      return true;
    }

    // gameReply calls engine.view(record, free), and the mine's view takes two more: the token
    // count (the one input it has) and the event that just landed. So the reply is handed this
    // adapter rather than the module, which is also what keeps the ruler on the host's side
    function reply(error, tok) {
      // WHAT THIS WINDOW LAST DREW, which is how the screen knows how many stones broke since it
      // last looked (engine.view's `since`). It is the handler's and not the record's: two windows
      // have drawn different last frames, so a stone count kept in the ledger would tell one of
      // them to run the chip of rock for ground the other one had already shown
      const since = toldDepth;
      const viewer = { view: (st, free) => engine.view(st, free, tok, ev, since) };
      toldDepth = engine.depthOf(rec, tok);
      deps.reply('mn', viewer, rec, reqN, error, false);
    }

    return {
      key: 'mn',
      handle(m) {
        reqN = Number.isSafeInteger(m.n) ? m.n : null;
        // The ruler, read once per message: the depth is drawn off it and the claim is paid off it,
        // so the two cannot disagree inside one reply
        const tok = deps.tokens();
        sync(tok);
        ev = null;
        // THE GROUND FIRST, whatever this message is. A press and a crossed cell can land together
        const dug = engine.sweep(rec, tok);
        let next = dug.rec, claim = dug.claim, moved = !!claim;
        let error = null;
        if (m.op !== 'open') {
          if (engine.OPS.indexOf(m.op) < 0) error = 'unknown action';
          else {
            // The money rule is the host's: what this game may spend is the balance less what the
            // live rounds at the other tables are holding (games/README.md section 6).
            // NO TOKEN COUNT GOES IN, because nothing in a refusal reads one any more: the engine
            // still refuses a purchase that would change nothing (mine.js, `sealed`), and since
            // 1.41.0 that is a question about the ladder rather than about how worn the pick is.
            // THE ROW RIDES THE MESSAGE and it has to be spelled out here, which is the hook
            // games/README.md section 3 warns about: built as `{ op: m.op }` the field is dropped
            // and the engine answers "there is nothing of that kind" for a message that named one.
            // Only `op` and `kind` are read off the wire, and the engine checks the row against
            // its own table before anything is counted
            const move = { op: m.op, kind: m.kind };
            const reason = engine.whyNot(next, move, deps.budget('mn'));
            if (reason) error = reason;
            else {
              deps.ensureReplica();
              next = engine.act(next, move, tok);
              moved = true;
            }
          }
        }
        if (!moved) { rec = next; return reply(error, tok); }   // sweep hands back its own argument
        // One write for the claim and the purchase together, and the claim is only news if it
        // survived the merge
        const kept = commit(next, tok);
        ev = kept ? claim : null;
        reply(kept ? error : 'another window dug first', tok);
        // The reply goes out before the data push, or the header balance would say what was found
        // before the drift does (games/README.md section 6 point 3)
        try { deps.push(); } catch (e) { deps.log('mine: push after settle failed: ' + (e && e.message)); }
      },
      // Nothing is riding on anything here: a pick is paid for the instant it is fitted and the
      // wall pays into the balance. So the mine holds nothing back from the other games, and what
      // it may spend is measured against what they have left like everything else (deps.budget)
      held() { return 0; },
      // THIS HOOK IS THE GAME. Two things move without a message of ours and neither is a press:
      // the token count (which is the digging) and another window's write.
      //
      // IT DOES NOT CALL push() AFTER A CLAIM, which every other settlement does. This hook is
      // already inside push() (extension.js, gamesAfterPush), so asking for another one is
      // re-entering the thing that called us; and the reply carries the balance the claim just
      // made (gameReply reads it fresh), so the header lands through the reply exactly as it does
      // at every table. A window with no webview is told nothing at all and the next push settles
      // its header
      onPush() {
        if (!deps.live()) return;            // no webview to draw into
        const tok = deps.tokens();
        const first = !rec;                  // this window has not read the record yet
        const moved = sync(tok);
        const dug = engine.sweep(rec, tok);
        const depth = engine.depthOf(dug.rec, tok);
        reqN = null;                         // nobody asked for this one
        if (dug.claim) {
          const kept = commit(dug.rec, tok);
          ev = kept ? dug.claim : null;
          return reply(kept ? null : 'another window dug first', tok);
        }
        // Opening the record for the first time is not news. Without this, every window that has
        // never dug would describe a drift at activation to tell a screen nobody has opened that
        // it is still at the surface. The depth is remembered on the way out, or the NEXT push
        // would read this one as a change and send that same description one beat later
        if (first) { toldDepth = depth; return; }
        if (!moved && depth === toldDepth) return;
        ev = null;
        reply(null, tok);
      }
    };
  },

  css: `
  /* --- THE CREDIT MINE. One band of drift and one question: does the pick in hand reach the thing
     in front of it (docs/game-panels.md, 5-15).
     There is no felt and no machine plate, because there is no round to lay down: this screen is a
     place that is looked into, so it sits in the same well the market's chart does (.gm-well,
     games/casino.js). Nothing here is a new colour -- every value below is games/tiles.js's
     palette, and the contrast of each against the rock is in that section's table --- */
  /* WHERE THE HOST'S FIVE PICTURES ARRIVE. A webview URI is the host's to make and a panel cannot
     ask for one, so the panel writes them onto this one element as custom properties and every
     rule below reads one (games/mine/panel.js's init, and window.CUC.art). Three of the four
     pieces are used by nineteen elements between them, which is why they come in once here rather
     than being set on each element: nineteen inline background-images is nineteen chances for one
     of them to be the wrong picture.
     A page that never got them falls back to 'none', which is the bare slab: a band with no grain
     rather than a band that is not there */
  /* The drift. 72px tall whatever the sidebar is, because what scales is the DISTANCE across it:
     every marker is placed in per cent of the lookahead, so the same picture is 93.61px of rock at
     a sidebar dragged to 250 and 154.2px at 351 with no resize hook to get wrong.
     THE ROCK HAS A GRAIN NOW and it is two courses of the same tile at different heights (34 and
     38) with the lower one shifted 52px sideways. Equal courses in line read as brickwork, which
     is a wall somebody built rather than ground nobody has touched (docs/mine-mockup/spec.md, 3).
     AND IT MOVES WITH THE DEPTH NOW (docs/mine-mockup/spec-dig.md, 2-8). The note that stood here
     until 1.41.0 said sliding the grain would want a seamless tile and that this drawing has none.
     It was measured and it does: mine-rock.png is 420x92 and it is A beside flip(A), so column 0
     and column 419 are identical to the pixel and the horizontal period is 210. A MIRROR TILE HAS
     NO SEAM BY CONSTRUCTION, so --mn-pan (the panel's, modulo 210) may be any value at all.
     WHY IT IS WORTH MOVING. One stone is 1.49px of ground at a 250px sidebar and an ordinary reply
     is 2.27px, and they ACCUMULATE: twenty stones is 29.7px, which is what "I looked away and it
     had got on with it" is made of, and the old answer to that was zero moving pixels. The two
     moments it is a large figure are a fever (400 m, 594px) and a window catching up, and both are
     held to two lookaheads (187px) by the same cap the seams are (games/mine/panel.js, pctRun).
     ALL FOUR FACES READ THE SAME VARIABLE (here, .mn-cut, .mn-floor), or the strata break at the
     face. Each one keeps its own vertical offset and its own 52px stagger */
  .mn-drift{position:relative;height:72px;border-radius:8px;overflow:hidden;background-color:#2a2f36;
    background-image:var(--mn-rock,none),var(--mn-rock,none);
    background-size:210px 34px,210px 38px;
    background-position:calc(0px - var(--mn-pan,0px)) 0,calc(-52px - var(--mn-pan,0px)) 34px;
    background-repeat:repeat-x,repeat-x;}
  /* ...and the scrim that brings the drawing into this panel's family. hero-mine's rock is a grey
     with purple in it and the panel is blue-grey, so 30% of the slab the band was a flat block of
     until now sits over the whole thing. NO NEW COLOUR: it is the same token at an alpha.
     ::before and not ::after, because every child of the band is positioned and would paint over
     an ::after whatever it said */
  .mn-drift::before{content:'';position:absolute;left:0;top:0;right:0;bottom:0;
    background:rgba(42,47,54,.30);pointer-events:none;}
  /* THE GROUND ALREADY DUG, and it is the WHOLE BAND now (docs/mine-mockup/spec-idle.md, 3-1).
     Until 1.41.0 this box was 40% wide and the lookahead began where it ended, which made the face
     a box edge: the hole had to grow for the crab to go anywhere, and a hole that grows drags its
     own clip-path with it, so the ceiling's teeth are at a per cent of a box that is changing size
     and they crawl along the roof as the drift deepens. Laid across the whole band the teeth are
     at a per cent of the BAND, which nothing moves, and the face is drawn by the rock lying over
     this (.mn-rock) rather than by where this stops. 3-2 is the whole of the argument.
     IT IS NOT A BLACK RECTANGLE. The hole is the SAME ROCK with the light off -- the two courses
     again, 12px up so the strata line through the face, under an ink wash -- and that one change
     is what turns a cut-out square into a space with an inside. The pair cannot be told apart by
     tone whatever the wash is (every value from .45 to .30 lands within 1.35 and 1.41 against the
     rock, measured), so what says "dug" is the STRUCTURE in here: the timber, the floor, the
     sleepers and the bitten face (docs/mine-mockup/spec.md, 4).
     THE TEETH ARE A CONSTANT AND THE BITTEN FACE IS NOT IN HERE ANY MORE. What is left of this
     polygon is the roof and the floor; the bite went to .mn-rock's left edge, which is the one
     thing on the band that moves with the digging. The figures are written out rather than
     generated because test/panel-css.test.js reads this stylesheet and a figure that changed per
     render would make it say something different every time */
  .mn-cut{position:absolute;left:0;top:12px;right:0;height:48px;background-color:#0b1310;
    background-image:var(--mn-rock,none),var(--mn-rock,none);
    background-size:210px 34px,210px 38px;
    background-position:calc(0px - var(--mn-pan,0px)) -12px,calc(-52px - var(--mn-pan,0px)) 22px;
    background-repeat:repeat-x,repeat-x;
    clip-path:polygon(
      0 0,
      5% 3px, 10% 3px, 16% 0px, 22% 0px, 27% 3px, 33% 3px, 39% 1px, 45% 1px,
      50% 3px, 56% 3px, 62% 0px, 68% 0px, 73% 2px, 79% 2px, 85% 3px, 91% 3px,
      100% 0px, 100% 48px,
      88% 46px, 82% 46px, 76% 48px, 70% 48px, 64% 45px, 58% 45px, 52% 48px,
      46% 48px, 40% 46px, 34% 46px, 28% 48px, 22% 48px, 16% 45px, 10% 45px,
      0 48px
    );}
  /* The wash over the far wall, and the dark the roof throws down over the top of it. Both are ink
     at an alpha and neither is a colour this panel did not already have */
  .mn-cut::before{content:'';position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;
    background:linear-gradient(180deg,rgba(11,19,16,.92) 0%,rgba(11,19,16,0) 45%),
      linear-gradient(rgba(11,19,16,.74),rgba(11,19,16,.74));}
  /* THE FLOOR OF THE DRIFT IS EARTH, not boards. A continuous plank floor was drawn and read as a
     shelf in a cupboard. So the same three layers as the far wall are laid again in the bottom
     6px with the wash lifted from .74 to .52, which is the floor catching what light there is.
     CLIPPED RATHER THAN OFFSET, deliberately: the element covers the whole hole and shows only its
     last 6px, so the two courses keep the far wall's own background-position and the strata run
     straight from the wall into the floor. Give it a top of 42px instead and every position in
     here has to be re-derived, which is where a seam in the rock comes from */
  .mn-floor{position:absolute;left:0;top:0;right:0;bottom:0;clip-path:inset(42px 0 0 0);
    background-color:#0b1310;
    background-image:var(--mn-rock,none),var(--mn-rock,none);
    background-size:210px 34px,210px 38px;
    background-position:calc(0px - var(--mn-pan,0px)) -12px,calc(-52px - var(--mn-pan,0px)) 22px;
    background-repeat:repeat-x,repeat-x;}
  /* ...AND THE GRAIN IS RUN RATHER THAN STEPPED, for the duration the panel hands in (mnGrain).
     A background-position repaints rather than compositing, which is why this is a class the panel
     puts on and takes off again instead of a standing declaration: it is live for the 300ms of a
     push and the 1,200ms of a dash and at no other time.
     IT IS RUN ON AN ORDINARY PUSH TOO, which the ruler decided rather than taste: a stone is one
     metre now, so a stone is 1.49px at a 250px sidebar and an ordinary reply is 2.27px. Those are
     visible distances, and a visible distance that jumps while the seams beside it slide is two
     grounds moving two ways. On the old ruler (a stone was 0.26 m) the same push was 0.39px and
     this class would not have been worth its repaint.
     linear, BECAUSE IT IS THE SLIDE'S CURVE. The seams and the grain are one ground */
  .mn-drift.pan,.mn-drift.pan .mn-cut,.mn-drift.pan .mn-floor{
    transition:background-position var(--mn-panms,0ms) linear;}
  .mn-floor::before{content:'';position:absolute;left:0;top:0;right:0;bottom:0;
    background:rgba(11,19,16,.52);}
  /* the lip where the floor starts, which is what stops the earth reading as more wall */
  .mn-brow{position:absolute;left:0;right:0;top:41.6px;height:1px;background:rgba(187,189,199,.22);}
  /* SLEEPERS, NOT A FLOOR. Seven chunks of the same board at UNEVEN spacing (16/17/14/17/16/16),
     because evenly spaced rungs across a dark gap are a ladder. The panel places each one's left;
     the group is dimmed together so the timber sits in the hole rather than on top of it */
  /* ...AND THE TIMBER STANDS IN THE GROUND AND NOT ON THE GLASS (spec-idle.md, section 6). Each
     piece is placed from a world depth now rather than from a constant pixel, so a frame is at
     the same metre of drift for ever and the camera moving is what moves it. Nailed to the band
     instead, the one thing that did not move during a catch-up would be the timber, and a reader
     whose eye caught that would be back to a conveyor belt with a fence post stuck to the screen:
     4-4 is why every layer below reads ONE variable */
  .mn-sills,.mn-frames{position:absolute;left:0;top:0;right:0;bottom:0;opacity:.88;
    pointer-events:none;}
  /* EVERYTHING THAT IS AT A DEPTH, moving by exactly the same distance for exactly the same time.
     The markers, the sleepers and the frames are three boxes and one declaration: a catch-up that
     carried them at three durations, or that forgot one of them, is the defect 4-4 names, and the
     only way to be sure none of the three is forgotten is for there to be nothing to forget.
     --mn-slip is a per cent of the band, so there is no resize hook to get wrong: these boxes are
     the band's own width, and 20.202% of them is 20.202% of it */
  .mn-slide,.mn-sills,.mn-frames{transform:translateX(var(--mn-slip,0%));}
  .mn-sill{position:absolute;top:43px;width:11px;height:4px;
    background:var(--mn-sill,none) 0 0/11px 4px no-repeat;}
  /* THE TIMBER FRAMES, and there is no continuous lintel. One frame is one thing -- two posts and
     a cap -- and the ceiling between two of them is bare rock. A beam running the length of the
     drift with posts under it is a fence, which is the other half of what the first attempt drew.
     THE CAP OVERHANGS ITS POSTS BY 3px EACH SIDE AND IS THICKER THAN THEY ARE. That is the only
     thing making it read as holding the roof up: equal weights read as one rail and some uprights.
     A frame that runs off the end of the hole is CLIPPED AND NOT MOVED, the same rule the seams
     in the rock keep: at a 250px sidebar one frame stands and at 351 two do */
  .mn-post{position:absolute;top:10px;width:5px;height:33px;
    background:var(--mn-post,none) 0 0/5px 33px no-repeat;}
  .mn-beam{position:absolute;top:0;width:21px;height:11px;
    background:var(--mn-beam,none) 0 0/21px 11px no-repeat;}
  .mn-bsh{position:absolute;top:11px;width:21px;height:1.2px;background:rgba(11,19,16,.85);}
  /* THE ROCK STILL TO BE CUT, and its LEFT EDGE IS THE FACE. This is the camera (spec-idle.md,
     sections 1 and 3): the band is a map of 165 metres of ground, 40% of it dug and 60% of it
     ahead, and every metre of it is at the same place on the band from one push to the next. What
     a push moves is where the FACE is, which is this box's left edge sliding right as the work
     eats into the rock, and the crab standing on it.
     THE BAND HELD THE OTHER ARRANGEMENT TWICE AND IT CAME BACK TWICE. A face nailed to the 40%
     mark can only show digging by pulling the ground towards it, and what the reader said about
     that was "the terrain comes to me like a conveyor belt, what am I supposed to do with that".
     The ground is still now: a push moves ONE edge and ONE crab, and nothing else on the band
     changes by a pixel (1-3). What moves everything at once is the camera catching up, which is
     the one moment the reader is meant to read as the view moving rather than the world (4-4).
     IT IS OPAQUE, which it was not when it was 60% of the band and had the band's own rock showing
     through it. It has to be: it lies OVER the dug hole and the face is where it stops covering
     it. The grain is the band's own, at the band's own offsets, so the strata run straight through
     the face; the scrim is the band's own ::before at the same alpha, or the ceiling past the face
     would be 30% brighter than the ceiling before it and the join would be visible in a strip
     nobody is looking at. NO NEW COLOUR AND NO NEW ALPHA.
     THE BITE IS THE CONSTANT THAT USED TO BE .mn-cut's, left to right. Six steps of 0/4/1/5/2/4px
     down the face, at band y 19/27/35/43/52/60, and the top (y 0..12) and the bottom (y 60..72)
     are vertical: the roof and the floor are rock on both sides of the face, so there is nothing
     there for a bite to bite into.
     EVERY VERTEX RIDES --mn-adv AND THE COUNT NEVER CHANGES, which is what makes the face
     SLIDEABLE rather than jumpy: a polygon interpolates against another polygon of the same
     length, so the 300ms of a catch-up carries this edge as smoothly as it carries the crab. That
     the browser does interpolate a polygon whose coordinates are calc() over a custom property is
     measured and not assumed (spec-idle.md 12-1 doubted it; it holds, from a plain var() change on
     this element's parent, so --mn-adv needs no @property registration) */
  .mn-rock{position:absolute;left:0;right:0;top:0;height:72px;overflow:hidden;
    background-color:#2a2f36;
    background-image:var(--mn-rock,none),var(--mn-rock,none);
    background-size:210px 34px,210px 38px;
    background-position:calc(0px - var(--mn-pan,0px)) 0,calc(-52px - var(--mn-pan,0px)) 34px;
    background-repeat:repeat-x,repeat-x;
    clip-path:polygon(
      calc(40% + var(--mn-adv,0%) - 0px) 0px,  calc(40% + var(--mn-adv,0%) - 0px) 19px,
      calc(40% + var(--mn-adv,0%) - 4px) 19px, calc(40% + var(--mn-adv,0%) - 4px) 27px,
      calc(40% + var(--mn-adv,0%) - 1px) 27px, calc(40% + var(--mn-adv,0%) - 1px) 35px,
      calc(40% + var(--mn-adv,0%) - 5px) 35px, calc(40% + var(--mn-adv,0%) - 5px) 43px,
      calc(40% + var(--mn-adv,0%) - 2px) 43px, calc(40% + var(--mn-adv,0%) - 2px) 52px,
      calc(40% + var(--mn-adv,0%) - 4px) 52px, calc(40% + var(--mn-adv,0%) - 4px) 60px,
      calc(40% + var(--mn-adv,0%) - 0px) 60px, calc(40% + var(--mn-adv,0%) - 0px) 72px,
      100% 72px, 100% 0px
    );}
  .mn-rock::before{content:'';position:absolute;left:0;top:0;right:0;bottom:0;
    background:rgba(42,47,54,.30);pointer-events:none;}
  /* THE MARKERS, and they do not move on a push any more. A seam is at a depth and the band is a
     map, so a seam is at a PLACE on the band and it stays there until the camera moves: what the
     reader watches close is the gap between the crab and the thing in front of it (1-2).
     THE RIGHT END IS SOFT, 28px of it, and that is the whole of the third rejection. A seam one
     cell ahead is 100m away and the lookahead is 99, so the far marker's centre sits just past the
     band's right edge for a third of every cell; drawn hard it was a relic sawn vertically in half
     and standing there for minutes, which read as a rendering fault because nothing else on the
     screen has a straight vertical cut through a drawing. 28 = the relic's half width (24) plus 4.
     IT IS ON THIS BOX ONLY. The rock's grain is .mn-rock's background and is not masked, so the
     band's right edge is still a hard edge of rock; what fades is the thing standing in it.
     THE LEFT END STAYS HARD. That is the face, and a seam half eaten by it is "that is what is
     being cut right now", which is a drawing and not a defect (5-2) */
  .mn-slide{position:absolute;left:0;top:0;right:0;bottom:0;
    -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent 100%);
    mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent 100%);}
  /* A seam. Placed by its depth in per cent and centred on it; the pictures are games/mine/ore.js */
  .mn-ore{position:absolute;top:50%;transform:translate(-50%,-50%);
    background-repeat:no-repeat;background-position:50% 50%;background-size:contain;}
${ore.CSS}
  /* The one that is leaving: it rises out of the hole and goes. 240ms is section 6's first band
     (a find is a small good thing), and the keyframe writes the transform out in full because the
     base rule above is already using one.
     The .face class is the position a find is drawn AT: by the time the reply lands the depth is past the
     seam, so what the reader saw get hit is drawn at the face rather than lifted out of the slide.
     A marker already in the slide keeps its own inline left and only pops */
  .mn-ore.pop{animation:mnPop 240ms ease-out forwards;}
  /* ...AT THE FACE, which is a place on the band now and not the left edge of a box: .mn-rock
     starts at the band's own 0 since the camera, so "the face" has to be said rather than inherited
     (5-3). It is NOT in .mn-adv, because it is drawn inside the rock and clipped by it */
  .mn-ore.face{left:calc(40% + var(--mn-adv,0%));}
  @keyframes mnPop{to{transform:translate(-50%,-150%);opacity:0;}}
  /* WHERE THE PICK STOPPED. The 3px ember line and the wash over the rock past it are GONE with
     the durability they drew (1.41.0): a pick is bought once and never spent, so there is no
     distance from the face at which it stops cutting and nothing for a line to stand at. What is
     left of "you cannot have that one" is the marker whose lit face has gone grey and which is
     buried deeper in its own pocket (games/mine/ore.js, the locked drawings), which was always a
     different sentence and a different picture. It was a SHELF of slab over the marker until
     1.41.0, and the shelf went for a measured reason rather than a stylistic one: slab is 1.20:1
     on the darkest face of this wall and 3.28:1 on the brightest, so the one drawing that was
     supposed to say "not this one" disappeared on half the rock and was a black rectangle on the
     other half (docs/mine-mockup/spec-ore.md, 1-1).
     EMBER IS NOW UNUSED IN THIS BAND, which matters to two drawings that were measured against it:
     the relic's lit face is a third rather than the whole top and the grit is steel rather than
     cream, both so as not to outshine this line. Neither drawing changes -- the brightest thing in
     the band is the relic's own gold now, and holding the others under it is still what keeps the
     band readable (games/mine/ore.js, games/mine/tools.js) */
  /* a plain absolute box, so the UA's hidden rule is what hides it. Said out loud because
     games/casino.js's own note is that a box which sets a display has to say so */
  .mn-pick[hidden]{display:none;}
  /* WHERE THE CRAB HAS GOT TO, which is the whole of this release (spec-idle.md, 1-2). Everything
     pinned to the face is in here -- the crab, its shadow, the tool and the grit -- and every one
     of those is still placed from the 40% mark, so this box carrying the advance is the only
     place the distance is written. The crab's own coordinate is a REAL distance: a swing is 0.19px
     of ground, which cannot be seen, and a day of them is 1,900px, which can. What used to carry
     that figure was the ground sliding the other way.
     A PER CENT AND NOT A PIXEL, so there is no resize hook: this box is the band's width, and
     20.202% of it is 20.202% of the band at every sidebar there is.
     NOT z-index. It is after .mn-rock in the markup and that is what puts the crab in front of the
     face; a transform makes a stacking context, so the crab, the tool and the grit keep their own
     order inside it and the rock cannot come between two of them */
  .mn-adv{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;
    transform:translateX(var(--mn-adv,0%));}
  /* ...AND THE OTHER FOUR THINGS THE GRAIN'S OWN CLASS ARMS, at the same duration and the same
     curve. A push is ONE movement (4-2): the face slides right by what the work cut, the crab
     slides with it, and on the push that fills the camera's stop the whole world slides left by
     one stride. Five properties, one duration, one linear, one class -- and the class is put on
     and taken off by the panel, so none of this is live except for the 300ms of a push and the
     1,200ms of a dash. The alternative is a second animation loop beside the swing, which the
     band is not allowed (spec.md's "one thing turns at a time").
     THESE SIT BELOW THE BOXES THEY ARM, which is not only reading order: test/panel-css.test.js
     and the webview modes find a rule by the first opening brace after its selector, so a .pan
     rule above the real one is the rule those tests read instead of the one they meant */
  .mn-drift.pan .mn-adv{transition:transform var(--mn-panms,0ms) linear;}
  .mn-drift.pan .mn-rock{transition:clip-path var(--mn-panms,0ms) linear,
    background-position var(--mn-panms,0ms) linear;}
  .mn-drift.pan .mn-slide,.mn-drift.pan .mn-sills,.mn-drift.pan .mn-frames{
    transition:transform var(--mn-panms,0ms) linear;}
  /* RESTING, AND IT IS ONE DECLARATION (section 7-3). The crab's body is ON the face whenever
     there is work, so a gap between the two happens when there is none and at no other time: no
     word, no colour, nothing switched off and nothing drawn that was not already there.
     THE GAP IS THE WHOLE SIGNAL and the tool says nothing at all. The first attempt took the tool
     out of the claw and stood it on the floor, and that was REJECTED on the rendered screen: the
     standing tool is 20.71px wide and the resting crab's body ends 12.10px back from the face, so
     51% of it lies over the crab, and over the crab the head's fill is 1.77:1 at the first band
     and 1.27:1 at the fourth. The fill disappears and the ink outline does not, so what the eye
     gets is not a tool but a snout on the crab's face -- and the better the tool, the more of it
     is gone. On a screen whose job is to draw which tool is in hand, a drawing that fades as the
     tool improves is not a drawing. Moving it behind the crab closes too: the floor there is
     6.45px wide at a 250px sidebar while it rests (the crab backs away to the LEFT, so that floor
     shrinks rather than grows) and it needs 20.71, and pinning it to the crab instead clips 14px
     of it off the band's left edge near F0 -- the very defect section 5 removed from the right
     edge. The measurements are all in 7-4.
     12.6px IS NOT A NEW TOLERANCE: it is the distance the swing already crosses the face by
     (spec.md, 7), used the other way round. The resting pose and the furthest reach of a blow are
     25.2px apart, and no frame of any swing at any band puts the body left of the face, so rock
     showing in front of the crab means resting and means nothing else.
     WHAT MAKES IT LEGIBLE is the body against the hole it was cutting: 6.60:1 at the median and
     4.90:1 against the brightest wall there is, so the gap reads as a dark notch beside a bright
     crab (7-4).
     THE FACE DOES NOT MOVE WITH IT. The depth is what the work has cut and resting cuts nothing,
     so the face stays where the last stone left it and the crab backs away from it.
     NOTHING IS DONE TO THE CRAB ITSELF -- no fade, no grey, no filter. Bad news is not told by
     turning the main character down (docs/game-panels.md, 5-15), and resting is not even bad news.
     NO @media AROUND THIS, and that is the point of it: a quiet window and a reader who asked for
     less motion used to leave exactly the same still frame, so "it has stopped" and "I turned the
     animation off" were one picture and the reader read it as a bug twice. This is a STATE and not
     a movement, so reduced motion keeps it and the two pictures are different (section 8).
     AND NOTHING TRANSITIONS INTO IT. The frame the swing is removed on is whatever angle the
     browser happened to be on, which is not a value to start an animation from (7-6).
     THERE IS NO .mn-pick RULE UNDER .rest AND THERE MUST NOT BE. The tool hangs in the claw at
     its resting -12 degrees, which is what taking the dig class off already leaves; a rule here
     would have to out-rank .mn-pick.g1..g4, and anything it set would paint over the four lights
     the ladder bought. The rule that is not here is the reason those four are safe.
     WHICH IS WHY IT IS .mn-dig THAT STEPS BACK AND NOT .mn-crab. The two are 12.6px apart for as
     long as the state lasts, and the pick is pinned to the crab's claw by its own left/top and
     transform-origin: move the crab alone and the claw goes with it while the tool does not, so
     the haft comes off the body and hangs over the gap. That was rendered and looked at -- a pick
     floating in the air beside the crab. .mn-dig is the box that already holds the two together
     for exactly this reason (it is what the step into the hole moves, for the same reason), so
     moving it carries the tool in the claw and still touches no .mn-pick rule.
     THE SHADOW IS SEPARATE because it is outside that box: the earth does not step (.mn-dig),
     and it does not rest either -- it simply stays under the crab */
  .mn-drift.rest .mn-dig,
  .mn-drift.rest .mn-shade{transform:translateX(-12.6px);}
  /* THE EARTH UNDER THE CRAB. One ellipse of ink, which is what sits it on the floor rather than
     in front of it. It is not a drawing and not a filter: a shadow that followed the swing would
     be a second animation on a screen that is allowed one */
  .mn-shade{position:absolute;left:calc(40% - 42px);top:51px;width:40px;height:6px;
    border-radius:50%;background:rgba(11,19,16,.55);pointer-events:none;}
  /* THE ONE STEP INTO THE HOLE, and the reason there is a box around the crab and the pick at all.
     The reader's own words were "a stone breaks, grit flies and the character moves right", and the
     move is a STEP TAKEN AND GIVEN BACK inside one swing: net displacement 0, four pixels out at
     the contact frame. It does not carry distance, deliberately. At the slowest working rung the
     crab swings 2,045 times an hour and this reader digs 266 m an hour, so a swing is 0.130 m of
     ground, which is 0.19px. A 4px step is 2.69 m, so a step that claimed to be ground would be a
     picture lying by a factor of 21 (docs/mine-mockup/spec-dig.md 2-5, remeasured on the 1.41.0
     ruler: that section's 104 was worked out when a stone was 0.26 m).
     +4px AND NOT MORE because the resting pose's right edge is 12.7px past the face, so +4 puts it
     at 16.7px, which is the figure docs/game-panels.md 5-15 already measured and accepted as the
     strip of lookahead the crab is allowed to cover. No new tolerance.
     FRAMES 0 TO 5 ARE ZERO because the strip already leans the body in over those (the ink box's
     left edge walks from 10 to 5), and lifting twice reads as a bounce. 11 to 15 are zero as well,
     which is why reduced motion and a quiet window leave exactly the pose they left before.
     WHY A WRAPPER. The pick's own transform is its ANGLE, and two animations on one property is
     one animation: the later declaration wins outright and the pick would stop turning. So the
     step is one box holding both, and the shadow on the floor is OUTSIDE it, because the earth
     does not step. */
  .mn-dig{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;}
  /* ...and it only ever runs when a stone actually broke. An ordinary swing does not step, which
     is what makes the step mean "that one broke": the strip's own gold sparks fire on EVERY swing
     and cannot be turned off, so what tells the two apart is this box moving and the grit flying */
  .mn-dig.step{animation:mnStep 1760ms step-end 1 both;}
  @keyframes mnStep{
    0%{transform:translateX(0);}
    37.5%{transform:translateX(2px);}
    43.75%{transform:translateX(4px);}
    50%{transform:translateX(3px);}
    56.25%{transform:translateX(1.5px);}
    62.5%{transform:translateX(.5px);}
    68.75%{transform:translateX(0);}
  }
  /* THE CRAB AT THE FACE. 60x54 now and not 76x68: the hole has things in it, and a crab that
     filled the hole left no drift to stand in. Its resting feet are on the floor (band y54, which
     is the top of the earth) and the swing crosses the face by 12.6px, which is the strip of rock
     the pick is hitting. Above the markers, so the seam being struck goes behind the thing
     striking it.
     THE STRIP IS DRAWN SMALLER THAN ITS OWN PIXELS, so a DPR 2 screen resamples nothing. The size
     is the whole strip at the drawn frame width (16 x 60) and NOT the shorthand: a shorthand here
     would wipe the position and the repeat with it */
  .mn-crab{position:absolute;left:calc(40% - 47.3px);top:6.9px;width:60px;height:54px;z-index:2;
    pointer-events:none;background-image:var(--mn-dig,none);
    background-repeat:no-repeat;background-position:0 0;background-size:960px 54px;}
  /* 16 frames, and the rest is in the strip: frames 0-1 and 12-15 are the crab standing, so one
     swing is followed by 660ms of nothing at the asset's own 1,760ms. The PANEL sets the duration,
     because how fast the machine is working is what it means (5-15, the mascot axis) */
  .mn-crab.dig{animation:mnDig 1760ms steps(16) infinite;}
  @keyframes mnDig{to{background-position:-960px 0;}}
  /* THE PICK IN HAND, which is a second element because the strip has no pick in it: those 16
     frames are a crab, a white arc and sparks. It is also the only place a rung is VISIBLE, the
     strip being one drawing for all four (games/mine/tools.js).
     ONE PIVOT AND NOTHING BUT THE ANGLE. transform-origin is the crab's claw -- (38,27) of the
     60x54 box -- and left/top put the butt of the haft on it. Give the pick a position per frame
     instead and the haft leaves the claw and the tool floats.
     step-end, because the strip is steps(16) and a pick easing between angles would be ahead of
     the arm holding it for most of every frame. The sixteen angles are read off the strip: 5 to 8
     are the arc's own leading edge measured in pixels and the other twelve are the lift and the
     recovery that join them (docs/mine-mockup/spec.md, 8) */
  .mn-pick{position:absolute;left:calc(40% - 16.8px);top:8px;width:28px;height:28px;z-index:3;
    pointer-events:none;background-repeat:no-repeat;background-position:50% 50%;
    background-size:contain;transform-origin:7.5px 25.9px;transform:rotate(-12deg);}
  .mn-pick.dig{animation:mnPick 1760ms step-end infinite;}
  @keyframes mnPick{
    0%{transform:rotate(-12deg);}
    6.25%{transform:rotate(-18deg);}
    12.5%{transform:rotate(-28deg);}
    18.75%{transform:rotate(-38deg);}
    25%{transform:rotate(-33deg);}
    31.25%{transform:rotate(26deg);}
    37.5%{transform:rotate(67deg);}
    43.75%{transform:rotate(70deg);}
    50%{transform:rotate(119deg);}
    56.25%{transform:rotate(100deg);}
    62.5%{transform:rotate(70deg);}
    68.75%{transform:rotate(38deg);}
    75%{transform:rotate(8deg);}
    81.25%{transform:rotate(-4deg);}
    87.5%{transform:rotate(-10deg);}
    93.75%{transform:rotate(-12deg);}
  }
  /* WHERE THE GRIT COMES OUT OF. The strike point is (face + 6px, y 44) and it was measured twice
     over: frame 7's gold sparks have their centre of mass at face + 6.7px / y 48.8, and running the
     pick's own transform-origin and 70-degree angle forward puts the head's tip at face + 5.7px /
     y 44.5. THOSE ARE THE SAME PLACE, and the star that used to be drawn for the blow stood at
     face + 16.7px / y 37.9, which is 15px diagonally away from it: in the rock beside the blow
     rather than at it (docs/mine-mockup/spec-dig.md, 0 and 2-3). The star is gone and these stand
     where the blow lands.
     ZERO WIDTH ON THE ANCHOR, so the pieces are placed from a point and the 40% is resolved once.
     Above the crab, because grit comes off the wall in front of it */
  .mn-chips{position:absolute;left:40%;top:0;width:0;height:72px;z-index:4;pointer-events:none;}
  /* A PIECE: steel core, 1px ink ring, centred on the strike point. The sizes and the flight are
     games/mine/tools.js, which is also where the colour is argued against the rock. Nothing here
     is a new colour and nothing here carries the step */
  .mn-chip{position:absolute;left:6px;top:44px;background:#bbbdc7;box-shadow:0 0 0 1px #0b1310;
    transform:translate(-50%,-50%);opacity:0;animation-duration:1760ms;
    animation-timing-function:step-end;animation-iteration-count:1;animation-fill-mode:both;}
${tools.CSS}  /* Reduced motion stops the swing and leaves frame 0, which is the crab standing with the pick
     held up at its resting angle: this screen needs no still drawing of its own, which is most of
     why the strip is a PNG and not a GIF. ALL FIVE STOP TOGETHER -- the crab, the pick, the step,
     the grit and the bite in the wall -- or the pick carries on swinging next to a crab that has
     stopped. THE BITE IS IN HERE AND NOT ONLY IN THE PANEL'S GUARD: the mark's own rest state is
     opacity 0, so taking the animation away is what makes it absent rather than permanent, and a
     hole punched in the wall that never heals is the one way this drawing could outstay a reader
     who asked for less motion (games/mine/tools.js, BITE).
     THE LIGHT ON THE PICK IS NOT IN HERE AND MUST NOT BE. It is a filter and not an animation, so
     a reader who asked for less motion keeps every bit of what the ladder bought them
     (docs/mine-mockup/spec-dig.md, 5-6) */
  /* THE CAMERA STILL MOVES UNDER REDUCED MOTION, and only the TRANSITIONS are dropped (section 8).
     Where the crab is and where the face is are facts about how much ground the work has cut, and
     a reader who asked for less motion asked for less motion, not for a band that lies about the
     depth. So the panel hands in 0ms and these rules make sure of it: every property lands on its
     new value in one step, which is the same thing every other panel on the floor does.
     THE RESTING RULES ARE NOT IN HERE and must not be. They are a state, they are what tells a
     quiet window apart from this one, and putting them under this query would weld the two
     pictures back together -- which is the defect the whole of section 7 is about */
  @media (prefers-reduced-motion:reduce){
    .mn-crab.dig,.mn-pick.dig,.mn-dig.step,.mn-chip.burst,
    .mn-rock.burst::after{animation:none;}
    .mn-drift.pan,.mn-drift.pan .mn-cut,.mn-drift.pan .mn-floor,.mn-drift.pan .mn-adv,
    .mn-drift.pan .mn-rock,.mn-drift.pan .mn-slide,.mn-drift.pan .mn-sills,
    .mn-drift.pan .mn-frames{transition:none;}
  }
  /* THE BAG, which is what the sentence under the band turned into (docs/mine-mockup/spec-dig.md,
     section 4). It was a line of 10.5px muted text that read "No finds yet" until something was
     found and then named it; now it is the two piles and one button, and the only glyphs in it are
     counts and a total.
     ONE ROW, 28px, AND IT IS NEVER COLLAPSED. An empty bag keeps the height, because folding it
     would move the button under it by 28px on the reader's FIRST find, which is a jump nobody
     asked for; the row shrinking after a sale is different, since that one is the reader's own
     press. It is the same argument .mn-last was built on, with the answer in whitespace rather
     than in words. 28 is .bj-stakes button's height and there is no new one */
  .mn-sack{display:flex;align-items:center;gap:10px;min-height:28px;margin-top:8px;}
  /* ...and the piles. THREE OR MORE KINDS ARE CUT OFF RATHER THAN WRAPPED: a card whose height
     changes on an event is worse than a row that clips, and the total is on the button either way */
  .mn-heap{display:flex;align-items:center;gap:10px;flex:1 1 auto;min-width:0;overflow:hidden;}
  .mn-stack{display:flex;align-items:center;gap:3px;flex:none;}
  .mn-stack i{width:18px;height:18px;flex:none;background-repeat:no-repeat;
    background-position:50% 50%;background-size:contain;}
  /* THE COUNT IS --text AND NOT --muted. The light theme's muted is 4.06:1 on --inner, which is
     under the line for body text (measured, docs/game-panels.md 3): a count is data and not a
     caption. No new size either -- 10.5 is the one the line it replaced was already using, and
     there is no "x", because a number 3px to the right of a picture has nothing else it could mean */
  .mn-stack b{font-size:10.5px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;}
  /* SELL IS THE SMALL BUTTON AND UPGRADE IS THE BIG ONE, which is the whole of the hierarchy: 28px
     and as wide as its own text against 34px and the whole row. Neither one is primary (5-15) */
  .mn-sell{flex:none;height:28px;padding:0 11px;border:0;border-radius:8px;background:var(--track);
    color:var(--text);font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;
    font-variant-numeric:tabular-nums;}
  .mn-sell:focus-visible{outline:2px solid var(--focus);outline-offset:2px;}
  /* HIDDEN AND NOT DISABLED when there is nothing to sell: a dead button with no figure on it is
     noise, and the empty shelf beside it already says there is nothing there */
  .mn-sell[hidden]{display:none;}
  /* SOLD: the pile leaves upwards and goes, 240ms, which is the band's own mnPop in both value and
     direction. The same event (ore leaving) keeps the same word, and it goes UP because the balance
     it turns into is in the heading.
     ITS OWN KEYFRAME AND NOT mnPop, for one reason: mnPop's -50% horizontal is .mn-ore's centring
     and a flex row has none, so borrowing it would slide the piles sideways on the way out. Same
     240ms, same ease-out, same direction -- no new millisecond */
  .mn-heap.pop{animation:mnSold 240ms ease-out forwards;}
  @keyframes mnSold{to{transform:translate(0,-150%);opacity:0;}}
  @media (prefers-reduced-motion:reduce){.mn-heap.pop{animation:none;}}
`
};
