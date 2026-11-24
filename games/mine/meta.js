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
  hint: 'Your tokens dig · gems and relics pay credits · a worn-out pick means bare hands, '
    + 'which dig an ' + (FIST_SPEED === 8 ? 'eighth' : '1/' + FIST_SPEED) + ' as fast',
  panel: 'games/mine/panel.js',
  cls: 'mn',
  // NOT A PLACE ON THE LIST, because there is no row: `order` is still here because it is what
  // every reader of the register sorts on, and a game with none sorts by the file system
  // (games/README.md). 200 leaves the whole gap after the market free
  order: 200,
  // The swinging crab, 16 frames in one strip. It is a PNG in the published root like a list row's
  // thumb, and the host turns it into a webview URI the same way (games/registry.js's `art`): a
  // panel cannot make one, and the strip is this game's and no shared file's
  art: { dig: 'mine-dig.png' },

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
  /* The drift. 72px tall whatever the sidebar is, because what scales is the DISTANCE across it:
     every marker is placed in per cent of the lookahead, so the same picture is 93.61px of rock at
     a sidebar dragged to 250 and 154.2px at 351 with no resize hook to get wrong */
  .mn-drift{position:relative;height:72px;border-radius:8px;overflow:hidden;background:#2a2f36;}
  /* THE GROUND ALREADY DUG, and the face is its right edge. 40% of the band, 48px of its 72, so
     the rock reads as a seam between a floor and a ceiling of the same stone. 1.40:1 against the
     rock is deliberate: section 3's 3:1 is owed by things that can be pressed and there is nothing
     to press in this band, so what says where the face is, is the crab standing at it */
  .mn-cut{position:absolute;left:0;top:12px;width:40%;height:48px;background:#0b1310;}
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
     veiled rather than recoloured, so what the reader sees is the same rock with the light off */
  .mn-reach{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#e8895a;}
  .mn-veil{position:absolute;top:0;bottom:0;right:0;background:rgba(0,0,0,.45);}
  /* both are plain absolute boxes, so the UA's hidden rule is what hides them. Said out loud
     because games/casino.js's own note is that a box which sets a display has to say so */
  .mn-reach[hidden],.mn-veil[hidden]{display:none;}
  /* THE CRAB AT THE FACE. 76x68 of the 72px band, standing so that its resting right edge is on
     the face at 40%: calc(40% - 59.5px) is that edge, and the swing crosses the face by 16px,
     which is the strip of rock the pick is hitting (5-15, "the crab covers 17% of the lookahead").
     Above the markers, so the seam being struck goes behind the thing striking it.
     THE STRIP IS 2x AND DRAWN AT HALF, so a DPR 2 screen resamples nothing. background-size is the
     whole strip at half size (1216x68) and NOT the shorthand: the panel sets the image itself
     (the URI is the host's) and a shorthand would wipe this line when it did */
  .mn-crab{position:absolute;left:calc(40% - 59.5px);top:0.9px;width:76px;height:68px;z-index:2;
    pointer-events:none;background-repeat:no-repeat;background-position:0 0;background-size:1216px 68px;}
  /* 16 frames, and the rest is in the strip: frames 0-1 and 12-15 are the crab standing, so one
     swing is followed by 660ms of nothing at the asset's own 1,760ms. The PANEL sets the duration,
     because how fast the machine is working is what it means (5-15, the mascot axis) */
  .mn-crab.dig{animation:mnDig 1760ms steps(16) infinite;}
  @keyframes mnDig{to{background-position:-1216px 0;}}
  /* Reduced motion stops the swing and leaves frame 0, which is the crab standing: this screen
     needs no still drawing of its own, which is most of why the strip is a PNG and not a GIF */
  @media (prefers-reduced-motion:reduce){.mn-crab.dig{animation:none;}}
  /* WHAT CAME OUT, under the well's own drift. It is never empty (it reads "nothing yet" until
     something is found), because a line that appears only on a find would move everything under
     it by 18px every time one landed.
     There is no .hl-line on this screen: that belongs to the felt, and with the felt off an empty
     22px box is 22px of nothing (docs/game-panels.md, 5-15) */
  .mn-last{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:18px;margin-top:8px;
    font-size:10.5px;color:var(--muted);}
`
};
