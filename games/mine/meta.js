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
//  - EVERY MESSAGE SWEEPS FIRST. The ground the tokens dug since the last message is paid for
//    before anything else is answered, because the offer on the one button is priced against the
//    record that sweep leaves behind (mine.offerFor reads the reach, and the reach is worn by
//    exactly the tokens the sweep just walked).
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

// How much slower bare hands are, for the heading's one-line tooltip. Read off the engine rather
// than written down: a hint that disagrees with what the wall actually pays is worse than no hint
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
  // The three things a reader has to know before the screen makes sense, and the middle one is
  // 1.40.0's: a pick is a key, so what the wall gives up depends on which one is fitted (mine.js,
  // the seam table's `gate`). The rows themselves are not listed here because the `?` fold has
  // them, with the rung each one needs against it (`paysFor`)
  hint: 'Your tokens dig · gems pay to any pick and the rarer finds need a better one · '
    + 'a worn-out pick means bare hands, which dig an '
    + (FIST_SPEED === 8 ? 'eighth' : '1/' + FIST_SPEED) + ' as fast and open the least',
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
      const viewer = { view: (st, free) => engine.view(st, free, tok, ev) };
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
            // live rounds at the other tables are holding (games/README.md section 6)
            const reason = engine.whyNot(next, { op: m.op }, deps.budget('mn'));
            if (reason) error = reason;
            else {
              deps.ensureReplica();
              next = engine.act(next, { op: m.op }, tok);
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
     IT DOES NOT MOVE. Only the seams do (.mn-slide): the heaviest push is under 5% of the
     lookahead, so 4.7px of a 210px tile would not be seen, and sliding it would want a seamless
     tile, which this drawing does not contain */
  .mn-drift{position:relative;height:72px;border-radius:8px;overflow:hidden;background-color:#2a2f36;
    background-image:var(--mn-rock,none),var(--mn-rock,none);
    background-size:210px 34px,210px 38px;background-position:0 0,-52px 34px;
    background-repeat:repeat-x,repeat-x;}
  /* ...and the scrim that brings the drawing into this panel's family. hero-mine's rock is a grey
     with purple in it and the panel is blue-grey, so 30% of the slab the band was a flat block of
     until now sits over the whole thing. NO NEW COLOUR: it is the same token at an alpha.
     ::before and not ::after, because every child of the band is positioned and would paint over
     an ::after whatever it said */
  .mn-drift::before{content:'';position:absolute;left:0;top:0;right:0;bottom:0;
    background:rgba(42,47,54,.30);pointer-events:none;}
  /* THE GROUND ALREADY DUG, and the face is its right edge. 40% of the band, 48px of its 72.
     IT IS NOT A BLACK RECTANGLE. The hole is the SAME ROCK with the light off -- the two courses
     again, 12px up so the strata line through the face, under an ink wash -- and that one change
     is what turns a cut-out square into a space with an inside. The pair cannot be told apart by
     tone whatever the wash is (every value from .45 to .30 lands within 1.35 and 1.41 against the
     rock, measured), so what says "dug" is the STRUCTURE in here: the timber, the floor, the
     sleepers and the bitten face (docs/mine-mockup/spec.md, 4).
     THE FACE IS BITTEN AND THE BITE IS A CONSTANT. A straight edge down the 40% mark was half of
     what made this read as two rectangles; the polygon is written out rather than generated
     because test/panel-css.test.js reads this stylesheet and a figure that changed per render
     would make it say something different every time */
  .mn-cut{position:absolute;left:0;top:12px;width:40%;height:48px;background-color:#0b1310;
    background-image:var(--mn-rock,none),var(--mn-rock,none);
    background-size:210px 34px,210px 38px;background-position:0 -12px,-52px 22px;
    background-repeat:repeat-x,repeat-x;
    clip-path:polygon(
      0 0,
      5% 3px, 10% 3px, 16% 0px, 22% 0px, 27% 3px, 33% 3px, 39% 1px, 45% 1px,
      50% 3px, 56% 3px, 62% 0px, 68% 0px, 73% 2px, 79% 2px, 85% 3px, 91% 3px,
      calc(100% - 0px) 0px,  calc(100% - 0px) 7px,
      calc(100% - 4px) 7px,  calc(100% - 4px) 15px,
      calc(100% - 1px) 15px, calc(100% - 1px) 23px,
      calc(100% - 5px) 23px, calc(100% - 5px) 31px,
      calc(100% - 2px) 31px, calc(100% - 2px) 40px,
      calc(100% - 4px) 40px, calc(100% - 4px) 48px,
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
    background-size:210px 34px,210px 38px;background-position:0 -12px,-52px 22px;
    background-repeat:repeat-x,repeat-x;}
  .mn-floor::before{content:'';position:absolute;left:0;top:0;right:0;bottom:0;
    background:rgba(11,19,16,.52);}
  /* the lip where the floor starts, which is what stops the earth reading as more wall */
  .mn-brow{position:absolute;left:0;right:0;top:41.6px;height:1px;background:rgba(187,189,199,.22);}
  /* SLEEPERS, NOT A FLOOR. Seven chunks of the same board at UNEVEN spacing (16/17/14/17/16/16),
     because evenly spaced rungs across a dark gap are a ladder. The panel places each one's left;
     the group is dimmed together so the timber sits in the hole rather than on top of it */
  .mn-sills,.mn-frames{position:absolute;left:0;top:0;right:0;bottom:0;opacity:.88;
    pointer-events:none;}
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
  /* THE LOOKAHEAD, which is the only part of this screen that holds information. It clips, and
     that is the point: a marker that has just come into the window is half drawn, which is what
     "there is more of this behind the edge" looks like */
  .mn-rock{position:absolute;left:40%;right:0;top:0;height:72px;overflow:hidden;}
  /* ...and the ground inside it, which is the one thing that MOVES. The panel slides this, never
     the markers, so a push is one transform and the markers keep the depths they were sent at */
  .mn-slide{position:absolute;left:0;top:0;right:0;bottom:0;}
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
  .mn-ore.face{left:0;}
  @keyframes mnPop{to{transform:translate(-50%,-150%);opacity:0;}}
  /* WHERE THE PICK STOPS. Two pixels of ember, and ember is used exactly once in this band: this
     is the line the whole screen is about (docs/game-panels.md, 5-15). The ground beyond it is
     veiled rather than recoloured, so what the reader sees is the same rock with the light off.
     ...AND A PIXEL OF INK DOWN ITS LEFT SIDE, which is new with the grain. Ember held 5.23:1
     against a band that was one flat colour; against a lit boulder it falls to 2.05:1 and the
     signature of this screen goes out on exactly the bright patches a reader looks at. The keyline
     is not a second colour and does not widen the mark: the line is 3px with the ink in the first
     one, pulled back 2px so the ember stands where the 2px line stood. Against its own ink it is
     7.32:1 wherever it lands, and the right-hand side is held by the veil */
  .mn-reach{position:absolute;top:0;bottom:0;width:3px;margin-left:-2px;
    background:linear-gradient(90deg,#0b1310 0 1px,#e8895a 1px 3px);}
  .mn-veil{position:absolute;top:0;bottom:0;right:0;background:rgba(0,0,0,.45);}
  /* both are plain absolute boxes, so the UA's hidden rule is what hides them. Said out loud
     because games/casino.js's own note is that a box which sets a display has to say so */
  .mn-reach[hidden],.mn-veil[hidden],.mn-pick[hidden],.mn-hit[hidden]{display:none;}
  /* THE EARTH UNDER THE CRAB. One ellipse of ink, which is what sits it on the floor rather than
     in front of it. It is not a drawing and not a filter: a shadow that followed the swing would
     be a second animation on a screen that is allowed one */
  .mn-shade{position:absolute;left:calc(40% - 42px);top:51px;width:40px;height:6px;
    border-radius:50%;background:rgba(11,19,16,.55);pointer-events:none;}
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
  /* AND THE MARK THE BLOW LEAVES, on frames 6 and 7 of the sixteen and nowhere else. It stands
     16.7px past the face, which is 8px clear of where frame 6's arc ends, so the star and the
     strip's own arc never sit on one another. Its size and colour are the rung's
     (games/mine/tools.js); bare hands have neither element at all */
  .mn-hit{position:absolute;left:calc(40% + 16.7px);top:37.9px;z-index:3;pointer-events:none;
    background-repeat:no-repeat;background-position:50% 50%;background-size:contain;
    transform:translate(-50%,-50%);opacity:0;}
  .mn-hit.dig{animation:mnHit 1760ms step-end infinite;}
  @keyframes mnHit{0%{opacity:0;}37.5%{opacity:1;}50%{opacity:0;}}
${tools.CSS}  /* Reduced motion stops the swing and leaves frame 0, which is the crab standing with the pick
     held up at its resting angle: this screen needs no still drawing of its own, which is most of
     why the strip is a PNG and not a GIF. All three stop together or the pick carries on swinging
     next to a crab that has stopped */
  @media (prefers-reduced-motion:reduce){
    .mn-crab.dig,.mn-pick.dig,.mn-hit.dig{animation:none;}
  }
  /* WHAT CAME OUT, under the well's own drift. It is never empty (it reads "nothing yet" until
     something is found), because a line that appears only on a find would move everything under
     it by 18px every time one landed.
     There is no .hl-line on this screen: that belongs to the felt, and with the felt off an empty
     22px box is 22px of nothing (docs/game-panels.md, 5-15) */
  .mn-last{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:18px;margin-top:8px;
    font-size:10.5px;color:var(--muted);}
  /* A ROW IN THE FOLD THE PICK IN HAND CANNOT TAKE, carrying the name of the rung that opens it
     (mine.paysFor's \`locked\` and \`needs\`). The fold is already 10.5px muted, so this is that at
     an alpha: no new size and no new colour. It is the same fact the rock draws as a shelf over a
     marker, said in words for the reader who opened the table to compare the four rungs */
  .mn-pays .mn-shut{opacity:.62;}
`
};
