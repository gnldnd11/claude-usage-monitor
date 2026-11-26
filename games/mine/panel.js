// The credit mine's screen. One band of drift and one question: is the pick in hand the key to the
// thing in front of it (docs/game-panels.md, 5-15).
//
// THE QUESTION USED TO BE TWO (1.41.0). A pick wore out, so the band also had to say how much
// further this one could cut, which it did with a line in the rock and a veil over the ground past
// it. Nothing wears out now, so there is no such distance to draw: what is left is the gate, which
// is drawn as rock still lying over a marker, and the line and the veil are gone with the figure
// they were a picture of.
//
// THIS SCREEN COMPUTES NOTHING. The depth, where every seam is, what is in the bag,
// what the bag is worth and what the next step costs all arrive on the reply (games/mine/meta.js).
// Three readings below turn a figure the host declared into a unit this file draws in -- a depth
// into per cent of the lookahead, a step into one of five lights, a depth into a background offset
// in pixels -- and every one of them is a change of unit rather than a decision. A screen that
// nudged a marker aside to stop it overlapping would be drawing a seam at a depth it is not at
// (the spacing is mine.js's job, seamAt), and a screen that multiplied a count by a price would be
// pricing the game (the total is `worth`, which arrives finished).
//
// IT PACES REPLIES NOBODY ASKED FOR, which is the one place it departs from the floor's rule that
// an unasked reply is drawn as it stands (games/README.md, section 5). It has to: the reader presses
// nothing here, so EVERY advance, find and fever arrives on a push rather than on a press, and a
// screen that only paced its own requests would never move at all. The rule it is bending exists to
// stop a late reply dealing the same cards a second time, and that cannot happen here: a find is an
// event the host sends exactly once (`found` and `fever` are the handler's claim, not the record's),
// so a redraw has nothing to replay.
//
// AND IT PRINTS NO SENTENCE AT ALL (1.41.0, docs/mine-mockup/spec-dig.md, section 3). What is left
// in words is the heading, the depth in the corner, two counts, a total on one button and a verb on
// the other. The three sentences that used to stand under the band are gone and their jobs went to
// pictures that were already there: "you need
// N credits" is a dark button with the figure on it, "No finds yet" is an empty shelf, and the pay
// table is what the bag's own total teaches as it grows. The only words that stayed are the ones
// nobody sees -- `aria-label`, `aria-live`, a button `title` -- plus the error bar, because a
// failure is not an explanation.
//
// WHAT IT STILL WILL NOT DRAW. `stone: {at, of}` arrives on every reply (how many swings into the
// current stone the work has got) and is deliberately not drawn, in any form. A bar for it is a
// durability gauge under another name, which 5-15 removed; the thing it would report changes no
// decision, because there is nothing here to press to make the next stone arrive; and it would be
// a fifth thing moving on a screen whose rule is that one thing moves at a time. What says a stone
// broke is the stone breaking.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, esc = CUC.esc, fmtInt = CUC.fmtInt;

  // The four moments this screen has, in milliseconds. docs/game-panels.md 5-15 is where each one
  // is argued; the names are its words.
  //   step      the ground, one push. LINEAR, so a run of pushes reads as one continuous drift
  //   find      a gem or a relic leaving the face, AND a pile leaving the bag when it is sold:
  //             the same event (ore going) keeps the same figure. Section 6's first band
  //   dash      a fever, or a backlog of broken stone: the ground runs
  //   dashChip  ...and what the run came to is read out after the running has stopped
  //   burstMin  the floor under the gap between two of those. Section 6's "press the gaps together,
  //             do not cut the tail off": a dash past nine seams is nine bursts, not six and a cut
  //
  // `pick` AND `dim` WENT WITH THE LINE (1.41.0). They were the line sliding outward when a pick
  // was fitted and the veil closing when one wore out, and neither event exists: nothing wears
  // out, and what a purchase changes is the tool in the claw, which is a drawing and not a distance
  var MN_T = {
    step: 300,
    find: 240,
    dash: 1200,
    dashChip: 1400,
    burstMin: 70,
    noReply: 4000
  };

  // HOW FAST THE CRAB SWINGS, BY THE RUNG THE MASCOT IS ON. The rungs are the window's one answer
  // about how hard the machine is working (webview.js, driveStep) and this screen reads it rather
  // than counting anything of its own: there are two crabs in this window and they may not disagree
  // about whether it is quiet (5-15, the mascot axis).
  //
  // 1,760ms IS THE ASSET'S OWN TIME, not a number chosen here: the strip's frame delay is 110ms and
  // there are 16 frames, six of which are the crab standing, so one swing is followed by 660ms of
  // rest. That is the bottom of the three working rungs and the ladder is 0.75 of the one below it.
  //
  // 0.75 AND NOT LESS, AND IT STOPS AT THREE VALUES. At 990ms a frame is 61.9ms, the swing is ten
  // frames (619ms) and the rest is six (371ms), which still reads as a swing and a pause. One more
  // rung down (742ms) makes the whole swing 464ms and the rest 278ms, and at that point the crab
  // has stopped swinging and started vibrating.
  //
  // SPENT IS BURNING'S FIGURE, and that is a decision rather than an omission: the spec left it
  // blank because anything faster would draw "out of it" as "trying harder than ever". Holding the
  // top speed says the thing itself, which is that there is nothing faster than this left.
  // Quiet is 0, which is no animation at all: frame 0 of the strip is the crab standing.
  //
  // FIVE THINGS RIDE THIS ONE NUMBER and that is the whole reason it is read in one place: the
  // crab's strip, the pick's angle, the step into the hole, the grit off the wall and the mark the
  // blow leaves in it are one movement cut into five layers (mnSwing).
  var MN_DIG = { quiet: 0, typing: 1760, work: 1320, burn: 990, spent: 990 };

  // The kinds the host can send. A kind this build does not know draws as a gem rather than as
  // nothing: a hole in the rock where a marker should be is a seam the reader cannot see coming
  var MN_KINDS = { gem: 'gem', relic: 'relic', fever: 'fever' };
  var MN_WORDS = { gem: 'a gem', relic: 'a relic', fever: 'a fever' };
  // ...and what a PILE of them is called, for the bag's read-out. The bag holds things, so a fever
  // is not in here: what one gives is ground (mine.js, SEAMS)
  var MN_PILE = { gem: 'gem', relic: 'relic' };

  // The five pictures the host resolved for this game (games/mine/meta.js's `art`). They are
  // handed to the stylesheet as custom properties on the band rather than written onto elements,
  // because three of them are worn by nineteen boxes between them and the rules that place those
  // boxes are all in one file already
  var MN_ART = ['dig', 'rock', 'beam', 'post', 'sill'];

  // HOW MANY LIGHTS THERE ARE ON THE LADDER, and HOW MANY PIECES COME OFF THE WALL. Both are drawn
  // by games/mine/tools.js and counted here, which is the one duplication on this screen: that
  // file is the host's (a stylesheet is built in node) and this one is the page's, so neither can
  // read the other. test/webview/games/mine.js holds the two pairs together.
  // FIVE LIGHTS is 5-4's: the ladder cannot be a drawing a step, the radius ladder runs out
  // of pick at the fourth lit band, and five is the number of rungs the mascot already uses
  var MN_GLOW = 5;
  var MN_CHIPS = 5;

  // THE CEILING ON HOW MANY TIMES THE STONE BREAKS ON SCREEN. See mnBreak for the two measurements
  var MN_BURST = 4;

  // THE SWING, IN FRAMES, and the frame the stone's breaking is over on. The strip is 16 frames
  // (the asset's own), the grit is frames 7 to 10 and the step is back at zero on frame 11, which
  // is what games/mine/tools.js draws and what @keyframes mnStep is written in. The panel needs
  // the figure to know when to take the one-shot classes off again, and it is written as frames
  // rather than as a percentage so it reads as the same fact the keyframes are built on
  var MN_FRAMES = 16;
  var MN_DONE = 11;

  // The horizontal period of mine-rock.png, in pixels. It is 420 wide and it is A beside flip(A),
  // so the tile is seamless at every multiple of this and the grain may be panned to any offset
  // (games/mine/meta.js, and docs/mine-mockup/spec-dig.md 2-8)
  var MN_TILE = 210;

  // WHERE THE FACE IS WHEN THE CAMERA HAS JUST MOVED, in per cent of the band. It is not a taste:
  // the host sends a window of `behind` dug metres and `ahead` of rock and the engine REFUSES to
  // start unless those are 2:3 (mine.js: "the window is not the screen's 2:3"), so 40% is
  // behind / (behind + ahead) and the stylesheet's own 40% marks are the same figure. It is
  // written here rather than read off the reply because the stylesheet cannot read a reply, and
  // two places that could be given different values would eventually be given different values
  var MN_F0 = 40;

  // WHERE THE TIMBER STANDS, in METRES OF DRIFT (docs/mine-mockup/spec-idle.md, section 6). It was
  // four frames at 32px and seven sleepers at 16/17/14/17/16/16px, nailed to the band, and that
  // was fine while nothing on the band ever moved. The camera moves now, and 4-4 is the whole
  // reason this changed: when the view shifts, EVERY layer has to shift by the same distance in
  // the same milliseconds or the one that stays behind reads as painted on the glass, and one
  // piece of furniture stuck to the screen is enough to turn the whole thing back into a conveyor
  // belt. So a frame is at a depth, for ever, and what moves it is the camera.
  //
  // THESE ARE PIXEL FIGURES WEARING METRES, and that is why they moved in 1.41.0 when the window
  // did. The beam is 21px whatever the drift is doing, so what the spacing has to keep is a PITCH
  // IN PIXELS: 37.8px at a 250px sidebar, which leaves a 16.8px gap between two beams and so does
  // not butt them into the continuous lintel spec.md section 5 rejects by name. The window is
  // 50 m across a 156px band now (3.12 px/m) where it was 165 m (0.945 px/m), so the same 37.8px
  // is 12 m where it used to be 40, and a figure left at 40 would have drawn the beams 125px apart
  // with bare rock between them.
  // IT IS STILL DELIBERATELY NOT THE CAMERA'S STRIDE (cell / 3 = 10 m): equal to it, every
  // catch-up would move the timber by exactly one pitch and the timber would look as though it had
  // not moved at all, which would undo the only thing the camera is for.
  // 6 METRES FOR THE SLEEPERS (18.7px, which was 17 m at 16.1px), with the jitter that keeps them
  // from being a ladder (spec.md, 6). The offsets are the same +-1px of unevenness said in metres.
  // SIX AND NOT FIVE FOR THE REASON THE BEAMS ARE NOT TEN: five divides the camera's 10 m stride,
  // so every catch-up would land each sleeper exactly where the one two places along had been and
  // the whole floor would read as having stood still. test/webview/games/mine.js catches it
  var MN_FRAME_M = 12;
  var MN_SILL_M = 6;
  var MN_SILL_J = [0, 0.32, -0.32, 0.32, 0, -0.32, 0];

  // HOW WIDE A MARKER IS, by kind, in pixels. It is games/mine/ore.js's figure and this is the
  // second place it is written, which is the same duplication MN_GLOW and MN_CHIPS already carry
  // and for the same reason: that file is built in node and this one runs in the page, so neither
  // can read the other. test/webview/games/mine.js holds the pair together.
  // WHAT IT IS FOR is the only arithmetic on this screen that needs a pixel: a seam is kept when
  // ANY PART of its drawing is inside the band, and how much of it there is to be inside is a
  // number of pixels rather than a number of metres (section 5-2)
  var MN_ORE_W = { gem: 24, relic: 48, fever: 24 };

  var mn = {
    st: null,            // the last state the host sent
    busy: false, op: null, n: 0, to: null,
    timers: CUC.timers(),
    depth: null,         // the depth the ground on screen is drawn at, for the slide
    // THE CAMERA, which is this panel's own and is not on any reply (section 9). The host knows
    // the depth and the layout; where the band is POINTED is a fact about a 72px box and belongs
    // to the box. `anchor` is the depth the band's 40% mark is at, `adv` is how far past it the
    // face has got (in per cent of the band) and `timberAt` is the furniture in the hole as it was
    // last written, so a draw that would write the same thing writes nothing
    anchor: null,
    adv: 0,
    timberAt: '',
    rest: false,         // the gap is open: the window is quiet and nothing is being cut
    bought: null,        // how far up the ladder the last draw was. null is "no draw yet"
    pan: null,           // the grain's offset on screen, so a dash can run to the next one
    art: '',             // the host's picture URIs, as declarations, kept to be rewritten with
    step: 'quiet',       // the rung, off the floor
    swingAt: null,       // when phase 0 of the swing loop last was, for lining a burst up with it
    swingMs: 0,
    sell: 0,             // rows of the bag still to be sold on this press (mnSell)
    popping: false,      // ...and the piles are in the air, so the row is not redrawn under them
    popAt: 0,
    locked: false,
    wantFocus: false
  };

  function fx(n) { return (Math.round(n * 100) / 100) + ''; }

  // --- the camera --------------------------------------------------------------------------------
  //
  // THE BAND IS A MAP OF THE GROUND AND THE SCALE IS ONE LINE (section 1-1). Band x 0 is the depth
  // `anchor - behind` and band x 100% is `anchor + ahead`, so one band holds `behind + ahead`
  // metres whatever the sidebar is doing, and a depth has ONE place on it. Everything below is a
  // change of unit off that: a metre into a per cent, and a per cent of the band into the pixel
  // the browser works it out as.
  //
  // THIS IS WHAT THE THIRD ATTEMPT GOT WRONG. The face used to be nailed to the 40% mark and the
  // ground was pulled towards it, which is the same arithmetic with the subject swapped, and the
  // reader's words for that were "the terrain comes at me like a conveyor belt". A map does not
  // move. What moves on it is the thing doing the digging.
  //
  // 165 IS NOT A NEW NUMBER. 66 + 99 is what the host already sends, and 66 / 165 is the 40% the
  // face has always stood at
  function spanOf(st) {
    var w = (st && st.window) || {};
    return ((w.behind | 0) + (w.ahead | 0)) || 1;
  }
  // Metres of ground into per cent of the band. The one conversion everything else is built on
  function pctOf(st, m) { return m / spanOf(st) * 100; }

  // HOW FAR THE CAMERA MOVES WHEN IT MOVES, in metres: a third of a cell (1-4).
  //
  // A THIRD OF A CELL AND NOT A GUESS AT ONE. `cell` arrives on the reply for exactly this
  // (section 9), and the figure matters because a cell is where a seam may stand: with the stride
  // at cell / 3 every cell boundary is one of the camera's own stops, so a find always happens at
  // the same place on the band and the drawing for it can be placed once. Guessed off the
  // lookahead (ahead / 3 = 33 m) the stops creep off the boundaries by a metre a cell and a find
  // happens somewhere different every time.
  // THE FALLBACK IS THE GUESS, because a band that draws nothing is worse than a band whose stops
  // wander: an old host that does not send `cell` still gets a camera, and only the place a find
  // lands stops being fixed
  function travelOf(st) {
    var w = (st && st.window) || {};
    var cell = w.cell > 0 ? w.cell : (w.ahead > 0 ? w.ahead : 1);
    return cell / 3;
  }
  // WHERE THE CAMERA IS PARKED for a given depth. The stops are the multiples of the stride, so
  // this is a pure function of the depth and two windows looking at one mine agree without being
  // told: what the panel remembers (mn.anchor) is only where it is DRAWN, for the catch-up
  function anchorOf(st) {
    var travel = travelOf(st);
    return Math.floor(st.depth / travel) * travel;
  }
  // The face, in per cent of the band: the 40% mark plus what the work has cut since the camera
  // last moved. It is under F0 + one stride (60.202%) by construction, and the push that takes it
  // over is the push that moves the camera
  function advOf(st, anchor) { return pctOf(st, st.depth - anchor); }
  // THE BAND'S OWN WIDTH, and it is the only pixel this file asks the browser for. Two things need
  // it: the grain (a background-position is a pixel) and the cull (a marker's drawing is a fixed
  // number of pixels wide). Nothing a reader reads a DISTANCE off goes through here -- a marker's
  // place is a per cent of the band -- so the worst a wrong width can do is pan the texture by the
  // wrong amount or keep a marker nobody can see.
  // Zero before the first layout, and in the test harness, which is handled where it is read
  function bandPx() { var b = el('mnRock'); return (b && b.clientWidth) || 0; }

  function kindOf(k) { return MN_KINDS[k] || 'gem'; }
  // Which picture leaves the face on a find. The ROW is the host's subscript and the pay table
  // carries the kind beside it, so this is a lookup on the same reply and not a guess (mine.paysFor)
  function kindForRow(row) {
    var rows = (mn.st && mn.st.pays) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].row === row) return kindOf(rows[i].kind);
    return 'gem';
  }

  // --- markup ------------------------------------------------------------------------------------

  // The well is the market's, not a copy of it: two screens use it, so it is the floor's
  // (.gm-well, games/casino.js). A screen with no round is a thing looked into rather than a table.
  //
  // THE `?` FOLD IS GONE WITH THE WORDS (spec-dig.md, section 3). What the table taught was which
  // row is worth what, and the bag's own total teaches that better: a gem arriving and the figure
  // on the Sell button going from 462 to 476 IS the pay table, read off the reader's own property.
  // `pays` still arrives and is still used -- it is where a row's kind comes from -- it is simply
  // not printed any more
  function markup() {
    return CUC.frame('mine')
      + '<div class="gm-well">'
      +   '<div class="mn-drift" id="mnDrift" role="img" aria-label=""></div>'
      + '</div>'
      // THE BAG, which keeps its 28px whether anything is in it or not: folding it would move the
      // button under it on the reader's first find, and that is a jump nobody pressed for (4-6)
      + '<div class="mn-sack">'
      +   '<div class="mn-heap" id="mnHeap"></div>'
      +   '<button type="button" class="mn-sell" id="mnSell" hidden></button>'
      + '</div>'
      + '<div class="bj-sr" id="mnLive" aria-live="polite"></div>'
      + '<div class="warnbar" id="mnErr" hidden></div>'
      // ONE BIG BUTTON AND IT IS NOT `primary`. At a sidebar of 250 it takes the whole row, and a
      // solid ember block there is the brightest thing on the screen: squint and the button arrives
      // before the drift does. `Deal` is primary at the other tables because pressing it IS the
      // game, and here it is not (docs/game-panels.md, 5-15)
      + '<div class="bj-ctl" id="mnCtl"><button type="button" class="bj-btn" id="mnBuy" hidden></button></div>';
  }

  // The band, built once: the dug hole with its floor, the rock still to be cut with the markers
  // standing in it, the crab swinging at the face and the grit its blows knock loose.
  //
  // THE HOLE'S FURNITURE IS MARKUP AND NOT A BACKGROUND, because there are a dozen pieces of it at
  // a dozen separate places and a background can carry one period, not a dozen. It is no longer
  // built once, though: every piece of it is at a DEPTH now (mnTimber), so the two boxes come out
  // of here empty and the camera fills them.
  //
  // THE ORDER IS THE PAINTING ORDER AND THREE OF THEM MATTER. The hole first, then the rock over
  // the top of it -- which is what draws the face, and what hides the timber and the sleepers that
  // are standing past it -- and then the crab's box over both, which is what lets the swing cross
  // the face by 12.6px (spec.md, section 5's drawing order)
  function driftHtml() {
    var chips = '', i;
    // The grit, built once and flown by a class: five elements that are reused for every stone
    // rather than five more made and thrown away on every blow
    for (i = 0; i < MN_CHIPS; i++) chips += '<i class="mn-chip c' + i + '"></i>';
    return '<div class="mn-cut">'
      +   '<div class="mn-floor"></div>'
      +   '<i class="mn-brow"></i>'
      +   '<div class="mn-sills" id="mnSills"></div>'
      +   '<div class="mn-frames" id="mnFrames"></div>'
      + '</div>'
      + '<div class="mn-rock" id="mnRock">'
      +   '<div class="mn-slide" id="mnSlide"></div>'
      + '</div>'
      // EVERYTHING THAT STANDS AT THE FACE, in one box that carries how far the crab has got
      // (section 1-2). Inside it nothing knows about the advance: the crab, the shadow, the tool
      // and the grit are all placed from the 40% mark exactly as they were
      + '<div class="mn-adv" id="mnAdv">'
      +   '<i class="mn-shade"></i>'
      // THE CRAB AND THE PICK IN ONE BOX, because the step into the hole is a transform and the
      // pick's own transform is its angle: two animations on one property is one animation
      // (games/mine/meta.js, .mn-dig). The shadow is outside it, since the earth does not step
      // ...AND WHAT IT DOES WHEN THERE IS NOTHING TO HIT, in the same box for the same reason:
      // both are pinned to the crab's head and both have to step back the 12.6px with it
      // (games/mine/idle.js). They are in the markup from the start and shown by a class, because
      // the state they draw can be true on the very first paint
      +   '<div class="mn-dig" id="mnDig">'
      +     '<div class="mn-crab" id="mnCrab"></div>'
      +     '<i class="mn-pick" id="mnPick" hidden></i>'
      +     '<i class="mn-sweat" id="mnSweat"></i>'
      +     '<div class="mn-wait" id="mnWait"><i></i><i></i><i></i></div>'
      +   '</div>'
      +   '<div class="mn-chips" id="mnChips">' + chips + '</div>'
      + '</div>';
  }

  // The host's URIs, onto the band, once. An empty one is left out rather than written as url(""),
  // which a browser resolves against the page and then fails to load. They are KEPT as a string
  // because the grain's offset lives on the same attribute and is rewritten on every draw
  function mnArt(band) {
    var out = [];
    for (var i = 0; i < MN_ART.length; i++) {
      var u = CUC.art('mine', MN_ART[i]);
      if (u) out.push('--mn-' + MN_ART[i] + ':url("' + u + '")');
    }
    mn.art = out.join(';');
    mnStyle(band, { pan: 0, adv: 0, slip: 0 }, 0);
  }
  // THE FOUR THINGS THAT MOVE, AND THEY ARE ONE WRITE. The grain's offset, the crab's advance, the
  // world's slip and the duration all three transitions read are custom properties on the band,
  // which is the only element every rule below it can see. Written separately they could be
  // written at different moments, and a catch-up in which one layer started 16ms after the others
  // is the thing 4-4 says must not happen.
  //   --mn-pan    the grain, in PIXELS, because a background-position is a pixel
  //   --mn-adv    the face and the crab, in per cent of the band
  //   --mn-slip   the markers, the sleepers and the frames: where the world was, going to 0
  //   --mn-panms  one duration for all of them
  function mnStyle(band, v, ms) {
    if (!band) return;
    var out = mn.art ? [mn.art] : [];
    out.push('--mn-pan:' + fx(v.pan) + 'px');
    out.push('--mn-adv:' + fx(v.adv) + '%');
    out.push('--mn-slip:' + fx(v.slip) + '%');
    out.push('--mn-panms:' + (ms | 0) + 'ms');
    band.setAttribute('style', out.join(';'));
  }

  // --- the band ----------------------------------------------------------------------------------

  // The seams, placed by the depth they stand at and NOT by how far they are from the face. That
  // is the difference the camera makes: a seam is at a place on the map, and it keeps that place
  // until the map is scrolled, so what changes between two pushes is the gap between the crab and
  // it. Every one of them is in the host's window because the host sends only those (mine.js,
  // seamsAhead): what is further out is this game's secret.
  //
  // THE clamp IS GONE, which is the third rejection (section 5-1). It held every seam between 0
  // and 100% of the lookahead, so a seam the window could not show was PARKED on the right edge
  // instead: the relic is centred on its own position and 48px wide, so what stood there was
  // exactly half a relic with a straight vertical cut down it. And it was not an edge case -- a
  // cell is 100m and the lookahead is 99, so the next seam after a find is always just out of
  // sight, which means that drawing was on the screen for a third of every cell. The reader read
  // it as a rendering fault, twice, and was right to.
  // SO A SEAM OUTSIDE THE BAND IS NOT DRAWN AT ALL. Not parked, not clipped to the edge: absent.
  // An empty lookahead is the honest picture of "there is nothing in reach yet" (1-5's first beat),
  // and the one that comes next is softened in by the mask on .mn-slide rather than snapped in.
  // KEPT WHEN ANY PART OF THE DRAWING IS INSIDE, which is where the marker's own width comes in:
  // half of it may hang over either end. With no layout to measure (the first paint, and the test
  // harness) nothing is culled, because nothing can be said about what is outside a box whose
  // width is not known yet -- and the band's own overflow hides it either way
  function mnOre(st, anchor) {
    var box = el('mnSlide'); if (!box) return;
    var face = MN_F0 + advOf(st, anchor), w = bandPx(), out = '';
    for (var i = 0; i < st.seam.length; i++) {
      var s = st.seam[i], kind = kindOf(s.kind);
      var x = MN_F0 + pctOf(st, s.at - anchor);
      var half = w ? (MN_ORE_W[kind] || 24) / 2 / w * 100 : 0;
      if (w && (x < face - half || x > 100 + half)) continue;
      // `locked` is the host's and not a sum done here (mine.js, `takes`): the rock still lying
      // over a seam is "the pick in hand is the wrong key", and since 1.41.0 it is the only thing
      // on this band that says a find cannot be had
      out += '<i class="mn-ore ' + kind + (s.locked ? ' locked' : '')
        + '" style="left:' + fx(x) + '%"></i>';
    }
    box.innerHTML = out;
  }

  // THE TIMBER AND THE SLEEPERS, each at the depth it was put in at (section 6). They are rebuilt
  // only when the camera has moved, because that is the only thing that changes where they are:
  // between two camera stops a frame is at the same per cent of the band for minutes at a time.
  //
  // THE RANGE IS METRES AND NEEDS NO PIXEL. The hole is the ground from the band's left edge
  // (`anchor - behind`) to the face (`depth`), so a piece belongs in it when its own depth is in
  // that range. One pitch of slack is drawn at each end and nothing is nudged inwards: what runs
  // off the left is clipped by the band, and what stands past the face is covered by the rock
  // lying over it, which is the same rule a frame has always kept.
  // A FRAME IS TWO POSTS 10px APART UNDER A CAP THAT OVERHANGS THEM BY 3px, and those three are
  // pixels of a drawing rather than metres of ground: a frame is a thing of a size, and only
  // WHERE it stands is a depth. So the base is a per cent and the parts are calc() off it
  function mnTimber(st, anchor) {
    var frames = el('mnFrames'), sills = el('mnSills');
    if (!frames || !sills) return;
    var from = anchor - ((st.window && st.window.behind) | 0), to = st.depth;
    var beams = '', bars = '', k, at, x;
    for (k = Math.ceil(from / MN_FRAME_M) - 1; k * MN_FRAME_M <= to + MN_FRAME_M; k++) {
      x = fx(MN_F0 + pctOf(st, k * MN_FRAME_M - anchor));
      beams += '<i class="mn-beam" style="left:calc(' + x + '% - 3px)"></i>'
        + '<i class="mn-bsh" style="left:calc(' + x + '% - 3px)"></i>'
        + '<i class="mn-post" style="left:' + x + '%"></i>'
        + '<i class="mn-post" style="left:calc(' + x + '% + 10px)"></i>';
    }
    for (k = Math.ceil(from / MN_SILL_M) - 1; k * MN_SILL_M <= to + MN_SILL_M; k++) {
      // the jitter rides the sleeper's own index, so a given sleeper is always the same distance
      // out of line: it is a property of that piece of timber and not of the moment
      at = k * MN_SILL_M + MN_SILL_J[((k % MN_SILL_J.length) + MN_SILL_J.length) % MN_SILL_J.length];
      bars += '<i class="mn-sill" style="left:' + fx(MN_F0 + pctOf(st, at - anchor)) + '%"></i>';
    }
    // WHAT IS COMPARED IS THE DRAWING AND NOT THE CAMERA. The obvious memo is "the camera has not
    // moved, so neither has the timber", and it is wrong by a sleeper: the hole GROWS between two
    // camera stops (it is `behind` metres long right after a stride and `behind + a stride` by the
    // end of one), so a piece falls due at the face end part way through. A sleeper's pitch is
    // 17m and a stride is 33.33, so memoised on the camera the last 16m of floor would lie bare
    // for half of every stride
    if (mn.timberAt === beams + bars) return;
    mn.timberAt = beams + bars;
    frames.innerHTML = beams;
    sills.innerHTML = bars;
  }

  // How far a run of ground is, in per cent of the BAND. CAPPED AT TWO LOOKAHEADS of ground: a
  // mine nobody has opened for a month comes back a thousand metres deeper, and a transform of
  // 160,000% is a picture of nothing. Two windows is long enough to read as "a long way" and short
  // enough to see, and it is the same cap and the same ground as before -- only the unit under it
  // changed, because the boxes that carry it are the band's width now rather than the lookahead's
  function pctRun(st, m) {
    var ahead = (st.window && st.window.ahead) || 1;
    return pctOf(st, Math.max(0, Math.min(m, ahead * 2)));
  }
  // A style change has to be seen before the next one or the two collapse into no transition at
  // all. Read a geometry property to force it; a document that has none (the test harness) needs
  // no forcing, because nothing there is animating
  function reflow(e) { if (e && e.getBoundingClientRect) e.getBoundingClientRect(); }

  // THE GRAIN IS A FUNCTION OF THE CAMERA, which is the whole of the second rejection. It used to
  // be a function of the DEPTH, so every push slid the rock texture a pixel or two to the left:
  // 1.49px a stone, 2.27px an ordinary reply, every ten seconds, for ever. That drift is what the
  // reader was looking at when they wrote "the terrain comes at me", and the answer is not to slow
  // it down but to stop it: between two camera stops the rock is a photograph of the same ground
  // and NOT ONE PIXEL OF IT MOVES. What moves it is the camera, by exactly the camera's stride.
  //
  // IT IS IN PIXELS BECAUSE A background-position IS A PIXEL, and that is the only reason. Nothing
  // a reader reads a distance off goes through here (mnOre and mnTimber are both per cents of the
  // band), so a width that is out by half a pixel pans the texture by 0.2% of a tile and can put
  // nothing anywhere it does not belong.
  // Zero before the first layout (and in the test harness) leaves the grain at 0, which is exactly
  // where a page that has not been laid out should have it
  function grainAt(st, anchor, w) { return w ? wrapTile(anchor * (w / spanOf(st))) : 0; }

  // ONE ARMED WRITE, and everything that moves goes through it.
  //
  // The transitions are all armed by one class (games/mine/meta.js, .mn-drift.pan), so the START
  // values have to be written with the class OFF and the END values with it ON: written the other
  // way round the browser only ever sees the end value and there is no transition at all. That is
  // the trick the grain has used since 1.41.0; what is new is that three other properties ride it,
  // which is what makes "every layer moves the same distance in the same milliseconds" (4-4) a
  // property of the code rather than a thing to remember.
  //
  // ms OF 0 WRITES THE END VALUES ONCE and arms nothing: the first draw, a redraw of a reply this
  // panel has already drawn, and every draw a reader who asked for less motion gets
  // `land` is where the world is once the run is over, which is not always where the run ENDS:
  // the grain runs the distance the world travelled and then wraps back inside one tile, and a
  // capped run (a month of ground in one push) is told to land where the CAMERA is rather than
  // where the cap stopped. THAT WRAP CANNOT BE SEEN: mine-rock.png is a mirror tile
  // (420 = A beside flip(A)), so an offset and that offset plus 210 are the same picture, pixel
  // for pixel
  function mnMove(from, to, land, ms) {
    var band = el('mnDrift'); if (!band) return;
    band.classList.remove('pan');
    if (!ms) return mnLand(band, land);
    mnStyle(band, from, ms);        // the duration is in place and the transition is not: no run
    reflow(band);
    band.classList.add('pan');
    mnStyle(band, to, ms);
    mn.pan = to.pan; mn.adv = to.adv;
    mn.timers.at(ms, function () { mnLand(band, land); });
  }
  function mnLand(band, v) {
    band.classList.remove('pan');
    mnStyle(band, v, 0);
    mn.pan = v.pan; mn.adv = v.adv;
  }
  function wrapTile(px) { return ((px % MN_TILE) + MN_TILE) % MN_TILE; }

  // THE SWING, AND FIVE LAYERS RIDE ONE NUMBER. The crab is a strip, the pick is a rotation, the
  // step is a translate on the box holding both, the grit is five little flights and the bite is a
  // hole in the wall, but they are ONE movement cut into five, so the duration is read ONCE here
  // and written to all of them in one
  // loop. Two places that could be given different values are two places that eventually will be,
  // and a pick a frame behind the arm holding it is the one defect on this screen with no innocent
  // reading.
  //
  // Reduced motion and a quiet window take the class off, which leaves frame 0 of the strip (the
  // crab standing), the pick at its resting -12 degrees, the step at 0 and no grit. That is why
  // this screen needs no still drawing of its own -- and since the camera a quiet window ALSO opens
  // the gap at the face, which is what tells those two apart (`rest` below).
  //
  // WHICH BAND IS IN HAND IS THE HOST'S (`tier`) AND SO IS WHICH LIGHT (`step`, `steps`). A reader
  // who has bought nothing arrives as step 0, which is bare hands: the crab keeps swinging and
  // there is simply no tool in the claw, because 5-15's rule is that the main character is never
  // switched off. The screen does NOT work the band out from the price.
  //
  // THE LIGHT IS NOT IN THE `dig` CLASS, deliberately. It is a filter, it never blinks, and it is
  // the whole of what the ladder bought: a reader who asked for less motion keeps all of it
  function mnSwing() {
    var ms = MN_DIG[mn.step] || 0;
    var on = !!ms && !CUC.reduceMotion();
    // TWO CAUSES, TWO BOOLEANS (section 7-7). There used to be one: `on` went false both
    // when the window was quiet and when the reader had asked for less motion, and both left the
    // very same still frame -- frame 0 of the strip with the pick at its resting angle. So "it has
    // stopped digging", "I turned the animations off" and "it is broken" were one picture, and the
    // reader read it as the third one twice ("there is a bug where the pick does not move").
    // `rest` IS ABOUT THE WORK AND NOT ABOUT MOTION, so reduceMotion is not in it: a reader who
    // asked for less motion while the machine is busy gets a crab standing ON the face, and a
    // quiet window gets one standing 12.6px back from it with rock showing in between. Different
    // pictures for different facts, which is all section 7 is asking for. The gap is still the
    // signal; what the tool does is no longer nothing (spec-idle.md 13, which reversed 7-4): it
    // goes down over 160ms while the window is quiet, and it comes up for one beat if a step is
    // bought in the meantime, which is when steps are bought
    var rest = !ms;
    var st = mn.st;
    var tier = (st && st.tier) | 0;
    var c = el('mnCrab'), p = el('mnPick'), wrap = el('mnDig'), chips = el('mnChips');
    var all = [c, p, wrap].concat(chips ? [].slice.call(chips.children) : []);
    var i;
    // WHEN PHASE 0 OF THE LOOP LAST WAS, which is what a one-shot burst has to line up with: the
    // grit belongs to frames 7 to 10 of a swing, so a burst dropped in at an arbitrary moment
    // would break the stone with the pick over the crab's head (spec-dig.md, 2-6).
    //
    // AND THE LOOP IS PUT BACK FROM THE START WHENEVER THAT NUMBER CHANGES. Writing a new
    // animation-duration onto a RUNNING animation does not restart it: the browser keeps the
    // start time and the progress jumps to (elapsed / the new duration). The stamp below would
    // then say phase 0 at a moment that is not phase 0, and every burst scheduled off it would
    // land on the wrong frame -- which is the rung changing while somebody types, not an edge
    // case. Taken off and put back (the trick mnBurst already uses), the two agree again
    var again = on && mn.swingMs !== ms;
    if (again) {
      if (c) c.className = 'mn-crab';
      if (p) p.className = 'mn-pick';
      reflow(c || p);
    }
    for (i = 0; i < all.length; i++) {
      if (all[i] && ms) all[i].style.animationDuration = ms + 'ms';
    }
    // ...AND A FIFTH LAYER THAT CANNOT BE WRITTEN TO DIRECTLY. The mark a blow leaves in the wall
    // is .mn-rock::after (games/mine/tools.js, BITE) and a pseudo-element has no style attribute,
    // so the one duration reaches it as a custom property on the element it hangs off.
    // IT GOES ON .mn-rock AND NOT ON THE BAND, which is the only subtlety here: the band's whole
    // style attribute is rewritten on every draw (mnStyle writes art, pan, adv, slip and panms as
    // one string), so a property set there separately would be wiped by the next push
    var rock = el('mnRock');
    if (rock && ms) rock.setAttribute('style', '--mn-digms:' + ms + 'ms');
    if (!on) { mn.swingAt = null; mn.swingMs = 0; }
    else if (again) { mn.swingAt = Date.now(); mn.swingMs = ms; }
    if (c) c.className = 'mn-crab' + (on ? ' dig' : '');
    // the band is written as the whole class, so a drop from band 3 to bare hands cannot leave
    // last reply's `t3` behind on an element nobody is looking at. Same for the light
    var rung = tier >= 1 ? ' t' + tier : '';
    var lit = mnGlow(st);
    if (p) {
      // THE LIFT IS CARRIED OVER, and it is the one class on this element the draw does not own.
      // The band is written as the WHOLE class on every draw so a drop from band 3 to bare hands
      // cannot leave last reply's `t3` behind, and that same sweep would cut a claw that is in
      // the middle of coming up for a purchase -- the tool would snap away mid-beat on whatever
      // reply happened to land next. Reading it back is what makes the sweep safe for the rest
      var up = p.classList.contains('lift') ? ' lift' : '';
      p.className = 'mn-pick' + rung + (lit ? ' g' + lit : '') + (on ? ' dig' : '') + up;
      // NO TOOL IS DRAWN WHEN NONE HAS BEEN BOUGHT, which is `hidden` and is about OWNERSHIP:
      // there is no pick, so there is no element. Resting is a different sentence said with a
      // different property (opacity, under .rest) and the two do not interfere -- bare hands and
      // the top step still rest alike, which is why the weakness 7-5 used to carry is gone.
      // THE ORDER MATTERS ON THE WAY UP: a step bought from bare hands turns `hidden` off and
      // raises the claw in the same draw, so the lift below is armed after this line
      p.hidden = tier < 1;
      // ...AND A STEP BOUGHT WHILE THE WINDOW IS QUIET IS SHOWN. With the tool down, a purchase
      // changes nothing a reader can see on the band, and the band is where the purchase lives
      // (games/mine/idle.js, .mn-pick.lift).
      // IT IS THE STEP AND NOT THE BAND. `tier` is one of four drawings over five hundred steps
      // and the light is one of five, so an ordinary purchase moves neither: triggering off the
      // band would raise the claw on four of the five hundred and the other 496 would still buy
      // a screen that does not move. What is shown is the tool as it stands, which is the true
      // answer to "what did I just get" even when the answer is the same drawing as before.
      // ON THE WAY UP ONLY. The step cannot fall, but a reply that arrived out of order could
      // say so, and a claw raised for a loss that did not happen is worse than a still band
      var sold = st ? st.step | 0 : 0;
      if (rest && mn.bought != null && sold > mn.bought) mnLift();
      mn.bought = sold;
    }
    // THE GAP, which is a class on the band because three boxes read it (the crab, its shadow and
    // the tool) and because the band is the only element all three can see.
    // GOING IN, THE GRIT IS CLEARED ONCE. A quiet window means no tokens are arriving, so there is
    // no stone left to break (spec-dig.md, 2-6); what can be in flight is the tail of the last
    // push's burst, and a piece of rock hanging in the air beside a crab that has stepped away
    // from the face is the "frozen mid-animation" reading all of this is meant to end
    var band = el('mnDrift');
    if (rest && !mn.rest) { mnCalm(); mnDrip(); }
    mn.rest = rest;
    if (band) band.classList.toggle('rest', rest);
  }

  // WHICH OF THE FIVE LIGHTS, off `step` and `steps`. A CHANGE OF UNIT AND NOT A DECISION: it is
  // "how far up the ladder is this, in fifths", which is the same arithmetic pctOf does to a depth.
  // The bands are spec-dig.md 5-4's (the five fifths of the ladder, which were 0-19 / 20-39 /
  // 40-59 / 60-79 / 80-100 when it was a hundred steps long and are 0-99 / 100-199 / 200-299 /
  // 300-399 / 400-500 at the five hundred it is now) and
  // they are written as a fraction of `steps` rather than as four literal thresholds, so a ladder
  // of a different length lights evenly without this line being found again.
  //
  // THE HOST DOES NOT SEND A BAND. 5-4 asked for `glow: 0..4` and the engine sends `step` and
  // `steps` (mine.view). Both are the host's figures and the reading is one division, so this is
  // not the screen deciding what a step is worth -- but if the price curve is ever meant to light
  // unevenly, the band belongs on the reply and this function becomes a read of it
  function mnGlow(st) {
    if (!st) return 0;
    var steps = st.steps > 0 ? st.steps : 0;
    var step = st.step | 0;
    if (!steps || step < 1) return 0;
    return Math.max(0, Math.min(MN_GLOW - 1, Math.floor(step / steps * MN_GLOW)));
  }

  // A STONE BREAKING: the grit flies off the wall and the crab steps into the hole, both inside one
  // swing. The two are one event and one class each, restarted from nothing every time, because an
  // animation that is already finished does not replay just because its class is set again
  function mnBurst() {
    // ...AND NOT WHILE THE CRAB IS RESTING. A burst is scheduled up to four swings ahead, and the
    // rung can go quiet in between (webview.js hands this panel the rung without a reply, so there
    // is no redraw to clear the queue): a stone breaking beside a crab that has put its tool down
    // is two states at once. The schedule is left alone rather than emptied, because mn.timers is
    // shared with the pacing of a sale and clearing it would abandon a walk the reader pressed for
    if (mn.rest) return mnCalm();
    var wrap = el('mnDig'), box = el('mnChips'), rock = el('mnRock');
    var kids = box ? [].slice.call(box.children) : [];
    mnCalm();
    reflow(box || wrap);
    for (var i = 0; i < kids.length; i++) kids[i].classList.add('burst');
    if (wrap) wrap.classList.add('step');
    // ...AND THE WALL, which is the one of the four that is not in the air (games/mine/tools.js,
    // BITE). The reader's second line was that the stone does not feel cut, and the measurement
    // behind it was that nothing in the ROCK ever changed: the step, the grit and the strip's own
    // arc all happen in front of it, and the face advances by about a pixel. This class is the
    // only thing on this band that marks the wall itself
    if (rock) rock.classList.add('burst');
  }
  // THE GRIT AND THE STEP, WHICH ARE OVER ON FRAME 11. They come off when the flight is over rather
  // than being left on: left on, nothing on the band says whether a stone is breaking RIGHT NOW,
  // and the next one would have to be told apart from the last one's leftovers
  function mnGritOff() {
    var wrap = el('mnDig'), box = el('mnChips');
    var kids = box ? [].slice.call(box.children) : [];
    for (var i = 0; i < kids.length; i++) kids[i].classList.remove('burst');
    if (wrap) wrap.classList.remove('step');
  }
  // ...and nothing breaking at all, the wall included. THE BITE OUTLIVES THE GRIT BY FOUR FRAMES
  // and that is the whole reason these are two functions: the mark's own keyframes are 7 (contact),
  // 12 (half gone) and 15 (gone), so taking its class off on frame 11 with the grit would cut it
  // away at full opacity and the one drawing that says the wall was cut would never be seen to
  // fade. mnBreak schedules this at the END of the swing for that reason
  function mnCalm() {
    mnGritOff();
    var rock = el('mnRock');
    if (rock) rock.classList.remove('burst');
  }

  // THE DROP, ONCE, AS THE WORK STOPS. The bubble that follows it is a state and needs no help
  // from here -- .rest is what stands it up (games/mine/idle.js) -- but a thing that happens at
  // the MOMENT of stopping has no class that is simply true afterwards, so it is armed by hand.
  //
  // IT CARRIES NO MILLISECOND AND NEEDS NO TIMER. The class is taken off and put back from
  // nothing (the trick mnBurst already uses, for the same reason: an animation that has finished
  // does not replay because its class was set again), and then it is LEFT ON. Its fill is `both`
  // and its last frame is opacity 0, so a drop that has fallen is already absent -- scheduling a
  // removal would be a second figure for the duration, kept in this file, able to disagree with
  // the one in the stylesheet.
  //
  // REDUCED MOTION IS CHECKED HERE AS WELL AS IN THE STYLESHEET, and the two are not the same
  // guard: the media query stops the drawing, and this stops the class going on at all, so a
  // reader who asked for less motion does not accumulate an animation name on an element every
  // time the window goes quiet
  function mnDrip() {
    if (CUC.reduceMotion()) return;
    var d = el('mnSweat'); if (!d) return;
    d.classList.remove('drip');
    reflow(d);
    d.classList.add('drip');
  }

  // THE CLAW COMES UP FOR ONE BEAT, when a step is bought and the window is quiet. Same shape as
  // the drop above and for the same two reasons: there is no class that stays true afterwards
  // (the purchase is a moment), and the keyframes have no fill, so the resting rule is back in
  // force the instant they are over and no timer has to be right about when that is.
  //
  // reduceMotion IS NOT CHECKED HERE and is checked in mnDrip, which is the one difference
  // between them. The drop is decoration and has nothing to say; this is the only drawing of a
  // thing the reader has just paid for, and a reader who asked for less motion did not ask to
  // stop being shown what they bought (games/mine/idle.js, .mn-pick.lift)
  function mnLift() {
    var p = el('mnPick'); if (!p || p.hidden) return;
    p.classList.remove('lift');
    reflow(p);
    p.classList.add('lift');
  }

  // How long until phase 0 of the `i`th swing from now. A burst runs for one whole swing and the
  // grit is frames 7 to 10 of it, so starting it on a boundary is what puts the stone's breaking at
  // the moment of contact. The wait is at most one swing (1,760ms at the slowest rung), and that
  // wait is itself honest: the work arrived, and the stone goes on the next blow
  function nextSwing(i) {
    var d = mn.swingMs;
    if (!d || mn.swingAt == null) return 0;
    var k = Math.ceil((Date.now() - mn.swingAt) / d);
    return Math.max(0, mn.swingAt + (k + i) * d - Date.now());
  }

  // HOW MANY TIMES THE STONE BREAKS ON SCREEN, which is `broke` with a ceiling on it. The host
  // sends the truth and the truth can be hundreds: a window nobody opened for a week comes back
  // with a week of stones in one figure, and the engine is right to send it rather than to guess
  // what a screen can draw.
  //
  //   0        nothing at all. The ground pans by the real distance and that is what happened
  //   1 .. 4   one burst a swing, in a row. Four at the slowest rung is 7.0s, which is inside
  //            extension.js's 10s push interval (setInterval(push, 10000)), so every one of them
  //            is shown before the next reply replaces the queue. Five would be 8.8s and six
  //            10.6s: a sixth burst is a burst promised to a reader who will never see it
  //   5 +      ONE burst, and the ground RUNS instead (1,200ms, the fever's own figure). Not five
  //            and not fifty, for two reasons. One to four is a number the eye reads; five is a
  //            number the eye has to count, and a quantity that has to be counted cannot be drawn
  //            as a count. And what carries "a great deal happened" is already there and is
  //            truthful: the DISTANCE, in metres, capped at two lookaheads by pctRun.
  //
  // THE FOUR IS NOW AN ENGINE CONDITION AND NOT ONLY A DRAWING RULE (1.41.0). mine.js carries it
  // as DASH_M and two of its load-time invariants are about it: an ordinary reply may not be big
  // enough to dash (or "a stone broke" stops being a countable event for ever) and the heaviest
  // push MUST be (which is what let the lookahead stop being sized for a month of backlog, see
  // that file's header). A stone is a metre, so this number is a distance as well as a count.
  // WHAT IT COMES OUT AS: a reply breaks 2 stones at the first step and 4 at the hundredth, both
  // inside the four, so nothing an ordinary reader does is ever drawn as a run. The heaviest push
  // is 32 stones, which is always one. test/webview/games/mine.js reads this constant out of the
  // source and holds it against the engine's DASH_M, the way the chips and the lights are held
  //
  // A NEW REPLY REPLACES THE QUEUE AND DOES NOT ADD TO IT (mnReceive clears the timers). That
  // push's stones are that push's; showing the backlog on top of them would count the same ground
  // twice, and the depth and the grain are drawn truthfully either way
  function mnBreak(n) {
    mnCalm();          // whatever the last reply left mid-flight: this push's stones are its own
    if (!(n > 0) || !mn.swingMs || CUC.reduceMotion()) return;
    var over = Math.ceil(mn.swingMs * MN_DONE / MN_FRAMES);
    for (var i = 0; i < n; i++) {
      var at = nextSwing(i);
      mn.timers.at(at, mnBurst);
      // ...and the grit off again on frame 11, which is where both keyframes have already put
      // everything back. Taking it off at the END of the swing instead would leave no instant
      // between two bursts in which nothing is flying, and then the band could not say which blow
      // broke what
      mn.timers.at(at + over, mnGritOff);
      // ...AND THE WALL AT THE END OF THE SWING, four frames later, because the mark the blow left
      // is still fading at frame 11 (tools.js's BITE is at .55 from frame 12 and gone at 15). The
      // order at the boundary is not luck: a run of stones schedules this burst's end before the
      // next burst's start, and setTimeout keeps two callbacks due at the same moment in the order
      // they were asked for, so the wall is cleared and then marked again rather than the other way
      // round. No new figure either -- it is the swing this panel is already pacing everything on
      mn.timers.at(at + mn.swingMs, mnCalm);
    }
  }
  function mnBroke(st) { var n = st && st.broke; return n > 0 ? n : 0; }

  // A seam leaving the face. The one that was found is BEHIND the face by the time the reply lands
  // (the depth is past it), so it is drawn as its own thing at the face rather than taken out of
  // the slide: what the reader saw get hit rises out of the hole and goes
  function mnPopFace(kind) {
    var rock = el('mnRock'); if (!rock || CUC.reduceMotion()) return;
    // ...and the last one, if a push arrived inside its 300ms and cleared the timer that was going
    // to take it away. It is invisible by then (the keyframe holds opacity 0) but it is a node,
    // and a node added on every find and never removed is a drift that grows all day
    var old = rock.querySelectorAll ? rock.querySelectorAll('.mn-ore.face') : [];
    for (var k = 0; k < old.length; k++) {
      if (old[k].parentNode) old[k].parentNode.removeChild(old[k]);
    }
    var i = document.createElement('i');
    i.className = 'mn-ore face pop ' + kind;
    rock.appendChild(i);
    mn.timers.at(MN_T.find + 60, function () { if (i.parentNode) i.parentNode.removeChild(i); });
  }
  // ...and during a fever, the seams the run goes past: the next one still standing, each time
  function mnPopNext() {
    var box = el('mnSlide'); if (!box) return;
    var kids = box.children;
    for (var i = 0; i < kids.length; i++) {
      if ((kids[i].className || '').indexOf('pop') < 0) { kids[i].className += ' pop'; return; }
    }
  }

  // --- the rest of the screen --------------------------------------------------------------------

  // The corner carries the depth, which is the one figure that never falls and that the reader
  // cannot change. It is not in the body as well: the same number in a heading and under it is two
  // places to read one thing (docs/game-panels.md, section 2)
  function mnHead(st) {
    var side = el('mnSide');
    if (side) side.textContent = fmtInt(st.depth) + ' ' + (st.unit || '');
  }

  // --- the bag ------------------------------------------------------------------------------------

  // THE TWO PILES, which are the table's five sellable rows GROUPED BY KIND. The kind is the host's
  // word, sent beside every row (mine.paysFor), so the grouping is a reading of the reply and not a
  // taxonomy invented here; adding two counts together is not pricing anything, and the screen
  // never multiplies a count by a pay (4-5: the total is `worth`).
  //
  // WHY TWO AND NOT FIVE (spec-dig.md, 4-3). Five rows do not fit one line at a sidebar of 250, and
  // there is nothing a reader could DO with the difference between three Quartz and three Amethyst:
  // one button sells the bag. A distinction that changes no decision is weight.
  // A FEVER IS NOT IN THE BAG. What it gives is ground, so there is nothing of it to hold
  function mnPiles(st) {
    var rows = (st && st.pays) || [], got = (st && st.got) || [], seen = {}, out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], k = kindOf(r.kind);
      if (k === 'fever') continue;
      var n = got[r.row] | 0;
      if (n <= 0) continue;
      if (seen[k] == null) { seen[k] = out.length; out.push({ kind: k, n: 0 }); }
      out[seen[k]].n += n;
    }
    return out;
  }
  // The rows a press has to walk, in the table's own order. `pay > 0` is the host's figure and the
  // one question asked of it is whether the row is a thing at all: the fever's row pays 0 and the
  // host refuses to sell it anyway (mine.whyNotSell)
  function mnSellRows(st) {
    var rows = (st && st.pays) || [], got = (st && st.got) || [], out = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].pay > 0 && (got[rows[i].row] | 0) > 0) out.push(rows[i].row);
    }
    return out;
  }

  // THE BAG AND ITS ONE BUTTON. The counts are drawn and the total is printed, and that is every
  // figure on this half of the screen.
  //
  // THE PILES ARE NOT REDRAWN WHILE A SALE IS RUNNING. One press is several messages (mnSell), and
  // a bag redrawn between two of them would show the gems gone and the relics still there, which
  // is a state the reader never asked to see. They are held through the pop and drawn once at the
  // end.
  //
  // AN EMPTY BAG IS AN EMPTY SHELF: no word, no placeholder, and the Sell button HIDDEN rather than
  // disabled, because a dark button with no figure on it is noise (4-6). The row keeps its height
  function mnSack() {
    var st = mn.st, heap = el('mnHeap'), sell = el('mnSell');
    if (!heap || !sell || !st) return;
    if (mn.sell) return;
    // ...AND NOT WHILE THE PILES ARE STILL IN THE AIR. The host answers a sale in about a
    // millisecond, so a row redrawn the moment the last reply lands would take the whole 240ms
    // away and the bag would blink rather than empty. The wait is cleared explicitly when the
    // flight is over, and ALSO by any draw that happens after it should have been: a timer this
    // panel lost (a push clears them all) must not leave the bag frozen
    if (mn.popping) {
      if (Date.now() - mn.popAt < MN_T.find) return;
      mn.popping = false;
    }
    heap.classList.remove('pop');
    var piles = mnPiles(st), worth = st.worth > 0 ? st.worth : 0, out = '', said = [];
    for (var i = 0; i < piles.length; i++) {
      var k = piles[i].kind, n = piles[i].n;
      var word = MN_PILE[k] || k;
      said.push(fmtInt(n) + ' ' + word + (n === 1 ? '' : 's'));
      out += '<span class="mn-stack"><i class="' + k + '"></i><b>' + fmtInt(n) + '</b></span>';
    }
    heap.innerHTML = out;
    // THE WHOLE ROW IS ONE PICTURE TO A SCREEN READER, labelled once. Said per pile instead, the
    // counts are read twice (the label and then the digits beside it); said on a bare div, most
    // readers do not announce the label at all, because a div with no role has nothing to hang it
    // on. role=img closes the subtree and the one label carries it
    heap.setAttribute('role', 'img');
    heap.setAttribute('aria-label', said.length ? 'In the bag: ' + said.join(', ') : 'The bag is empty');
    mnSellBtn(sell, piles.length, worth);
  }
  function mnSellBtn(sell, held, worth) {
    sell.hidden = !held || !worth;
    if (sell.hidden) return;
    sell.disabled = !!mn.locked;
    sell.textContent = 'Sell ' + fmtInt(worth);
    sell.setAttribute('aria-label', 'Sell the bag for ' + fmtInt(worth) + ' credits');
  }

  // SELLING IS ONE PRESS AND SEVERAL MESSAGES, which is the one place the screen's shape and the
  // engine's op do not line up. The button is one on purpose (4-4: there is no state in which
  // holding one kind back pays more, so a choice there is a choice with one answer, and 5-15 says
  // the only thing pressed on this screen is the tool). The op sells ONE ROW: `{op:'sell',
  // kind:<row>}`, checked against the table by the host. So a press walks the rows the bag
  // actually holds, one message each, and every one of them is priced by the host -- the figure the
  // reader pressed is `worth`, which is the whole bag, so the walk comes to exactly what it said.
  //
  // IF ONE IS REFUSED the walk stops there (mnSellOn reads the reply's `error`) and the bag is
  // drawn as the last reply that DID land left it. It has to stop rather than carry on: the host
  // can answer with a reason AND a state (another window sold that row between two of these
  // messages, which two windows sharing one record can do), and the next row's own reply would
  // then clear the warning off the screen before anybody had read it.
  //
  // WHAT WOULD MAKE THIS ONE MESSAGE is a `sell` with no row, meaning the bag. That is the engine's
  // to add, and this function plus this comment is what it would delete
  function mnSell() {
    var st = mn.st;
    if (!st || mn.busy || mn.locked) return;
    var rows = mnSellRows(st);
    if (!rows.length) return;
    mn.sell = rows.length;                       // bounded by the table: this cannot run away
    var heap = el('mnHeap');
    if (heap && !CUC.reduceMotion()) {
      heap.classList.add('pop');
      mn.popping = true;
      mn.popAt = Date.now();
    }
    var b = el('mnSell'); if (b) b.hidden = true;
    mnSend('sell', { kind: rows[0] });
  }
  // ...and the next row, once the host has answered for the last one. When the walk is over the
  // row waits out the rest of the 240ms before it is drawn empty, so the piles are seen to leave
  function mnSellOn(m) {
    if (!mn.sell) return;
    mn.sell -= 1;
    var rows = (mn.sell && !(m && m.error)) ? mnSellRows(mn.st) : [];
    if (rows.length) return mnSend('sell', { kind: rows[0] });
    mn.sell = 0;
    mn.timers.at(Math.max(0, MN_T.find - (Date.now() - mn.popAt)), function () {
      mn.popping = false;
      mnSack();
    });
  }

  // The big button. WHAT IT FITS AND WHAT IT COSTS ARE THE HOST'S (mine.offerFor), and since 1.41.0
  // the thing it fits has no name: a ladder this long cannot have a name a rung, so the ladder is a
  // number and the button is a verb and a price.
  //
  // `Upgrade 12,500` AND NOT `Upgrade 12,500 · 5 swings`, although `offer.swings` arrives and says
  // exactly how much faster the next step breaks a stone. Three reasons and the first is the
  // binding one. The screen's own rule is that it prints no number a picture answers and no rate at
  // all (5-15 drops mining speed, income per hour and today's haul by name), and "swings a stone"
  // is a rate. Second, spec-dig.md section 3 enumerates every glyph left on this screen and the
  // button is one verb and one figure; a second figure there is a figure with nothing on screen to
  // compare it against, since `stone.of` is deliberately not drawn either. Third, at a sidebar of
  // 250 the button is 172px and `Upgrade 12,500` is about 95px of 12px type, while the pair is
  // about 160px and clips at the narrowest the panel goes.
  //
  // SO `swings` GOES WHERE A COMPARISON IS POSSIBLE: the tooltip and the read-out, which can say
  // the step, the ladder's length and the rate in one breath without crowding anything.
  //
  // AND THE ONE SENTENCE THAT HAD NO PICTURE IS A TOOLTIP NOW. "The money is held at another
  // table" is a fact about a screen the reader is not looking at, so there is nothing here that
  // could draw it; a short purse is already said by a dark button with the price on it (section 3)
  function mnButton() {
    var b = el('mnBuy'), st = mn.st;
    if (!b) return;
    var o = st && st.offer;
    b.hidden = !o;
    if (!o) return;
    var free = CUC.free('mn');
    var poor = free != null && free < o.price;
    b.disabled = !!mn.locked || poor;
    b.textContent = 'Upgrade ' + fmtInt(o.price);
    var where = fmtInt(o.step) + ' of ' + fmtInt(st.steps || 0);
    var rate = fmtInt(o.swings) + ' swings a stone';
    b.title = (poor ? (CUC.balance() >= o.price ? CUC.heldElsewhere : 'Not enough credits') + ' · ' : '')
      + 'Step ' + where + ' · ' + fmtInt(o.price) + ' credits · ' + rate
      + (poor ? '' : ' (Enter)');
    b.setAttribute('aria-label', 'Upgrade to step ' + where + ' for ' + fmtInt(o.price)
      + ' credits: ' + rate);
  }

  // The band is a picture, so it says in words what it shows: where the face is, what is in the
  // claw and what is standing in front of it. No per cent and no rate, here either.
  // TWO THINGS ARE SAID THAT THE BAND SAYS WITH A SHAPE. The empty claw is "no pick", and the rock
  // lying over a marker is "wrong key", and a reader on a screen reader has neither shape.
  // `tool` IS THE HOST'S WORD for the first of them (mine.view), which is the same figure the claw
  // is drawn from: a label worked out some other way would eventually say the other thing
  function mnSaid(st) {
    var u = st.unit || '';
    var out = 'Depth ' + fmtInt(st.depth) + ' ' + u + '. ';
    if (st.tool !== 'pick') out += 'No pick: digging by hand. ';
    if (!st.seam.length) return out + 'Bare rock ahead.';
    return out + st.seam.map(function (s) {
      var d = s.at - st.depth;
      return (MN_WORDS[s.kind] || 'a seam') + ' ' + fmtInt(d) + ' ' + u + ' ahead'
        + (s.locked ? ', needs a better pick' : '');
    }).join(', ') + '.';
  }

  // --- drawing one reply -------------------------------------------------------------------------

  // ONE REPLY, DRAWN. The camera is worked out first, because everything on the band is placed
  // against it, and the one movement it may make is drawn last.
  //
  // WHAT MOVES ON AN ORDINARY PUSH IS THE FACE AND THE CRAB, and nothing else at all: the camera
  // is parked, so the markers, the grain, the frames and the sleepers are all at the same per cent
  // of the band they were at before and the write below hands them the values they already have
  // (1-3). That is the second rejection answered -- there is no drift, no creep and no conveyor.
  //
  // WHAT MOVES ON A CATCH-UP IS EVERYTHING, and that is deliberate (4-4). The face has reached the
  // camera's next stop, so the camera takes a stride and the whole world goes left by exactly one
  // stride while the crab goes left by the stride less what it dug. It cannot be hidden: in a band
  // of finite width a crab that keeps walking right needs the view to be pulled back eventually,
  // and the view being pulled back moves everything inside it. What makes it READ as the view and
  // not as the world is that every layer goes exactly the same distance in exactly the same
  // milliseconds, which is why there is one variable per layer and one duration for all of them.
  //
  // `from` IS THE DEPTH THIS PANEL LAST DREW, which is how it knows whether to pace anything at
  // all: null is the first draw and a redraw of what is already on screen
  function mnDraw(from, ms) {
    var st = mn.st; if (!st) return;
    var anchor = anchorOf(st);
    var w = bandPx();
    // how far the camera has moved since this panel last drew, in metres. The camera only ever
    // goes deeper, so a stale reply (another window behind this one) moves it nothing
    var went = (from == null || mn.anchor == null) ? 0 : Math.max(0, anchor - mn.anchor);
    var slip = pctRun(st, went);
    var adv = advOf(st, anchor);
    var pan = mn.pan == null ? grainAt(st, anchor, w) : mn.pan;
    var land = { pan: grainAt(st, anchor, w), adv: adv, slip: 0 };
    mnHead(st);
    mnOre(st, anchor);
    mnTimber(st, anchor);
    mnSwing();
    mnSack();
    mnButton();
    // the world starts where it WAS -- one stride to the right of where it has just been placed --
    // and walks home, which is the camera's own movement seen from inside the band
    mnMove({ pan: pan, adv: mn.adv, slip: slip }, { pan: pan + slip / 100 * w, adv: adv, slip: 0 },
      land, from == null ? 0 : ms);
    var d = el('mnDrift'); if (d) d.setAttribute('aria-label', mnSaid(st));
    mn.depth = st.depth;
    mn.anchor = anchor;
  }

  // THE EVENTS, and good news and bad news are not the same size (5-15).
  //
  // A push with nothing in it is the ground moving 300ms and nothing else. A stone breaking is the
  // grit and the step, once a swing, up to four of them. A find is that plus one seam leaving the
  // face. A fever is the ground running for 1,200ms with the seams in it going one at a time, and
  // the read-out after it has stopped. THERE IS NO BAD NEWS LEFT TO PACE (1.41.0): the one event
  // on this screen that was a loss was a pick wearing out, and nothing wears out
  function mnRun(m, news) {
    CUC.hold();
    var st = mn.st, from = mn.depth;
    var found = news ? st.found : null;
    var fever = news ? st.fever : null;
    var broke = mnBroke(st);
    if (CUC.reduceMotion()) {
      mnDraw(null, 0);
      if (found || fever) mnSay(st, found, fever);
      return mnSettle(m);
    }
    if (fever) return mnFever(m, st, from, found, fever, broke);
    var dash = broke > MN_BURST;
    mnDraw(from, dash ? MN_T.dash : MN_T.step);
    mnBreak(dash ? 1 : broke);
    if (!found) return mnSettle(m);
    mnPopFace(kindForRow(found.row));
    mn.timers.at(MN_T.find, function () {
      mnSay(st, found, null);
      mnSettle(m);
    });
  }

  // THE DASH. The camera runs for 1,200ms and the seams it goes past burst one at a time, and the
  // read-out lands after the running has stopped.
  // IT IS THE SAME MOVEMENT AS A CATCH-UP AND NOT A SECOND MECHANISM (4-5). A fever gives 400m of
  // ground, which is twelve of the camera's strides, so the camera is told to take them in one go
  // and the world runs the whole way left. The difference from an ordinary push is which ground is
  // drawn while it runs: the markers are left at the OLD camera so that what the reader sees go
  // past the face is the real seam at its real depth rather than a stand-in, and the new ground is
  // drawn at the end with nothing paced (the mnDraw(null, 0) below).
  // THE GAPS ARE PRESSED TOGETHER AND THE TAIL IS NOT CUT OFF: a run past nine seams is nine
  // bursts at 133ms, and one past twenty is twenty at the 70ms floor, which runs past the 1,200
  // rather than leaving seams unburst (docs/game-panels.md, section 6)
  function mnFever(m, st, from, found, fever, broke) {
    var n = Math.max(1, fever.hits | 0);
    var gap = Math.max(MN_T.burstMin, MN_T.dash / n);
    var anchor = anchorOf(st), w = bandPx();
    var went = mn.anchor == null ? 0 : Math.max(0, anchor - mn.anchor);
    var run = pctRun(st, went);
    var pan = mn.pan == null ? grainAt(st, anchor, w) : mn.pan;
    // ...and the world runs OUT rather than arriving: from where it is to one run's worth of left,
    // with the face moving to where the new depth puts it. The grain goes the same distance in
    // pixels, which is the same per cent of the same box
    mnMove({ pan: pan, adv: mn.adv, slip: 0 },
      { pan: pan + run / 100 * w, adv: advOf(st, anchor), slip: -run },
      { pan: grainAt(st, anchor, w), adv: advOf(st, anchor), slip: 0 }, MN_T.dash);
    mnBreak(broke ? 1 : 0);           // a dash is one event, however much ground it gave
    for (var i = 0; i < n; i++) mn.timers.at(Math.round(i * gap), mnPopNext);
    mn.timers.at(MN_T.dash, function () { mnDraw(null, 0); });
    mn.timers.at(MN_T.dashChip, function () {
      mnSay(st, found, fever);
      mnSettle(m);
    });
  }

  // The band is aria-hidden art and the bag is a picture, so what happened is read out once, when
  // it happens. THE NAME IS THE HOST'S and this is the one place it is used: `found.name` arrives
  // for the read-out rather than for a chip (games/README.md section 4 -- whatever draws a thing
  // carries its name), and nothing prints it
  function mnSay(st, found, fever) {
    var what = found ? found.name + ', ' + fmtInt(found.pay) + ' credits' : '';
    if (fever) what = 'Fever: ' + fmtInt(fever.hits) + ' seams, ' + fmtInt(fever.pay) + ' credits';
    if (!what) return;
    CUC.live('mnLive', what + '. Depth ' + fmtInt(st.depth) + ' ' + (st.unit || '')
      + '. In the bag: ' + fmtInt(st.worth || 0) + ' credits.');
  }

  function mnSettle(m) {
    mn.busy = false;
    try {
      CUC.settle(m);
    } finally {
      mnLock(false);
      mnFocusAfter();
      mnSellOn(m);         // the next row of a sale, if a press is still walking the bag
    }
  }
  function mnLock(locked) { mn.locked = !!locked; mnButton(); mnSack(); }

  // --- messages ----------------------------------------------------------------------------------

  function mnSend(op, extra) {
    if (mn.busy) return;
    mn.busy = true; mn.op = op;
    if (op !== 'open') mnLock(true);
    mn.n = CUC.post('mn', op, extra);
    clearTimeout(mn.to);
    mn.to = setTimeout(function () {
      mn.busy = false; mn.op = null;
      mn.sell = 0; mn.popping = false;
      CUC.err('mnErr', 'The mine didn’t respond. Try again.');
      mnLock(false);
    }, MN_T.noReply);
  }

  // A reply with no state: the host could not describe the drift (games/README.md, section 5). The
  // reason shows and everything drawn stays drawn, which matters here for the market's reason: a
  // depth is the reader's property, and a band wiped back to bare rock is the one reading they
  // cannot tell from "my mine is gone".
  // A SALE IN PROGRESS IS ABANDONED HERE, or the bag would stay held still for ever waiting for a
  // reply that never came
  function mnFault(m, awaited) {
    CUC.err('mnErr', m.error || 'The mine could not be shown. Try again.');
    // A WALK THAT WAS REFUSED STOPS WHERE IT IS, and the row is drawn from the last reply that DID
    // land: every sold row answered with a state, so what is left in the bag is already in `mn.st`
    mn.sell = 0; mn.popping = false; mnSack();
    if (!awaited) return;
    mn.busy = false;
    clearTimeout(mn.to);     // or the four-second timeout fires over the reason just shown
    CUC.settle(m);           // nothing is paced here, so the header must not be left frozen
    mnLock(false);
    mnFocusAfter();
  }

  function mnReceive(m) {
    var current = mn.op != null && m.n === mn.n;
    if (!current && mn.op != null) return;    // an older reply while a newer request waits
    CUC.setHeld('mn', m);
    if (!m.state) { var awaited = current; mn.op = null; return mnFault(m, awaited); }
    clearTimeout(mn.to); mn.timers.clear();
    var asked = mn.op;
    mn.op = null;
    mn.st = m.state;
    if (current || m.error) CUC.err('mnErr', m.error || '');
    // WHAT IS NEWS. A reply this panel has already drawn the events of would celebrate them twice,
    // so `found` and `fever` are only paced on a reply that has not been drawn yet. Every reply
    // here is one of those: the host clears the event after it is sent, so the next push carries
    // nothing to replay. The first open is excepted (`from` is null and nothing is paced anyway)
    var news = !m.error && (!!m.state.found || !!m.state.fever);
    mnLock(true);
    if (asked === 'buy' && !m.error) mn.wantFocus = true;
    mnRun(m, news);
  }

  // The keyboard, by the one rule every screen keeps (CUC.refocus): never take it while this
  // document does not hold the focus. This panel repaints on pushes nobody asked for, which is
  // exactly the situation that rule is protecting
  function mnFocusAfter() {
    if (CUC.current() !== 'mine') return;
    var want = mn.wantFocus;
    mn.wantFocus = false;
    var buy = el('mnBuy');
    var target = (buy && !buy.hidden && !buy.disabled) ? buy : el('mnBack');
    CUC.refocus(el('panel-mine'), target, want);
  }

  CUC.game('mine', {
    key: 'mn',
    cls: 'mn',
    markup: markup,
    init: function () {
      // The five pictures are the host's URIs (games/mine/meta.js's `art`), which is why they are
      // set here and not in the stylesheet. They go on the BAND as custom properties and every
      // rule that wants one reads it: a size, a position and a repeat belong with the rule that
      // places the box, and a panel writing nineteen inline background-images would be carrying
      // the stylesheet about in a loop
      var d = el('mnDrift');
      if (d) { d.innerHTML = driftHtml(); mnArt(d); }
      mn.step = CUC.step ? CUC.step() : 'quiet';
      mnSwing();
      el('mnBuy').addEventListener('click', function () {
        if (this.disabled || this.hidden) return;
        mnSend('buy');
      });
      el('mnSell').addEventListener('click', function () {
        if (this.disabled || this.hidden) return;
        mnSell();
      });
    },
    enter: function () {
      mn.wantFocus = true;
      mn.step = CUC.step ? CUC.step() : mn.step;
      mnSwing();
      mnLock(true);
      mnSend('open');
    },
    leave: function () {
      mn.timers.clear();
      clearTimeout(mn.to);
      mn.busy = false; mn.op = null; mn.sell = 0; mn.popping = false;
    },
    receive: mnReceive,
    // The rung changed, which is the only thing on this screen that is not about the mine: how hard
    // the machine is working is what the swing says, and the crab in the Usage tab says it too
    step: function (rung) { mn.step = rung; mnSwing(); },
    // A credit minted while this screen is up lights the button at once, which is the same question
    // asked about a price that every other screen asks
    credits: function () { mnButton(); },
    keys: function (e) {
      // Escape is the step the arrow takes, so it presses the arrow: one answer to "what does going
      // back do here" instead of two (webview.js, backStep). This game has no depth of its own
      if (e.key === 'Escape') { e.preventDefault(); var b = el('mnBack'); if (b) b.click(); return; }
      var t = e.target, buy = el('mnBuy');
      if (e.key === 'Enter' && (!t || t.tagName !== 'BUTTON') && buy && !buy.hidden && !buy.disabled) {
        e.preventDefault();
        buy.click();
      }
    }
  });
})();
