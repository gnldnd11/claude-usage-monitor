// The credit mine's screen. One band of drift and one question: does the pick in hand reach the
// thing in front of it (docs/game-panels.md, 5-15).
//
// THIS SCREEN COMPUTES NOTHING. The depth, the reach, where every seam is, what the next pick costs
// and what fitting it throws away all arrive on the reply (games/mine/meta.js). The only arithmetic
// below turns a DEPTH the host declared into a position in per cent of the lookahead the host also
// declared, which is changing the unit of a number rather than deciding anything: a screen that
// nudged a marker aside to stop it overlapping would be drawing a seam at a depth it is not at, and
// the spacing is the engine's job (mine.js, seamAt).
//
// IT PACES REPLIES NOBODY ASKED FOR, which is the one place it departs from the floor's rule that
// an unasked reply is drawn as it stands (games/README.md, section 5). It has to: the reader presses
// nothing here, so EVERY advance, find and fever arrives on a push rather than on a press, and a
// screen that only paced its own requests would never move at all. The rule it is bending exists to
// stop a late reply dealing the same cards a second time, and that cannot happen here: a find is an
// event the host sends exactly once (`found` and `fever` are the handler's claim, not the record's),
// so a redraw has nothing to replay.
//
// AND IT NEVER PRINTS A NUMBER THE PICTURE ALREADY ANSWERS. No durability, no per cent, no rate:
// the reach is a line in the rock and the seams stand either side of it (5-15).
(function () {
  var CUC = window.CUC;
  var el = CUC.el, esc = CUC.esc, fmtInt = CUC.fmtInt;

  // The four moments this screen has, in milliseconds. docs/game-panels.md 5-15 is where each one
  // is argued; the names are its words.
  //   step      the ground, one push. LINEAR, so a run of pushes reads as one continuous drift
  //   find      a gem or a relic leaving the face. Section 6's first band
  //   dash      a fever: the ground runs and the seams in it go one at a time
  //   dashChip  ...and the chip that says what the run came to, after the running has stopped
  //   burstMin  the floor under the gap between two of those. Section 6's "press the gaps together,
  //             do not cut the tail off": a dash past nine seams is nine bursts, not six and a cut
  //   pick      a pick fitted: the line slides outward. A good thing, so it moves
  //   dim       a pick worn out: the veil closes to the face. NO POP (5-15: bad news does not pop)
  var MN_T = {
    step: 300,
    find: 240,
    dash: 1200,
    dashChip: 1400,
    burstMin: 70,
    pick: 320,
    dim: 240,
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
  var MN_DIG = { quiet: 0, typing: 1760, work: 1320, burn: 990, spent: 990 };

  // The kinds the host can send. A kind this build does not know draws as a gem rather than as
  // nothing: a hole in the rock where a marker should be is a seam the reader cannot see coming
  var MN_KINDS = { gem: 'gem', relic: 'relic', fever: 'fever' };
  var MN_WORDS = { gem: 'a gem', relic: 'a relic', fever: 'a fever' };

  var mn = {
    st: null,            // the last state the host sent
    busy: false, op: null, n: 0, to: null,
    timers: CUC.timers(),
    depth: null,         // the depth the ground on screen is drawn at, for the slide
    reach: null,         // ...and the reach the line is drawn at, for its own two movements
    chip: null,          // what came out, which is kept by the panel: a find is not in the record
    step: 'quiet',       // the rung, off the floor
    locked: false,
    wantFocus: false
  };

  function fx(n) { return (Math.round(n * 100) / 100) + ''; }
  function pctOf(st, m) { return Math.max(0, Math.min(100, m / (st.window.ahead || 1) * 100)); }
  function kindOf(k) { return MN_KINDS[k] || 'gem'; }
  // What a name is: the pay table carries the kind beside it, so the one thing the screen has to
  // look up (which picture leaves the face on a find) comes off the same reply
  function kindFor(name) {
    var rows = (mn.st && mn.st.pays) || [];
    for (var i = 0; i < rows.length; i++) if (rows[i].name === name) return kindOf(rows[i].kind);
    return 'gem';
  }

  // --- markup ------------------------------------------------------------------------------------

  // The well is the market's, not a copy of it: two screens use it, so it is the floor's
  // (.gm-well, games/casino.js). A screen with no round is a thing looked into rather than a table
  function markup() {
    return CUC.frame('mine')
      + '<div class="gm-well">'
      +   '<div class="mn-drift" id="mnDrift" role="img" aria-label=""></div>'
      +   '<div class="mn-last" id="mnLast"></div>'
      + '</div>'
      + '<div class="bj-sr" id="mnLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="mnNote" hidden></div>'
      + '<div class="warnbar" id="mnErr" hidden></div>'
      // ONE BUTTON AND IT IS NOT `primary`. At a sidebar of 250 it takes the whole row, and a solid
      // ember block there is the brightest thing on the screen: squint and the button arrives
      // before the drift does. `Deal` is primary at the other tables because pressing it IS the
      // game, and here it is not (docs/game-panels.md, 5-15)
      + '<div class="bj-ctl" id="mnCtl"><button type="button" class="bj-btn" id="mnBuy" hidden></button></div>'
      + '<button type="button" class="bj-why" id="mnWhy" aria-expanded="false" hidden>How it pays</button>'
      + '<div class="bj-pays" id="mnPays" hidden></div>';
  }

  // The band, built once: the dug ground, the lookahead with the sliding floor inside it, the line
  // and its veil, and the crab standing at the face. Only the slide's contents and three inline
  // positions ever change after this
  function driftHtml() {
    return '<div class="mn-cut"></div>'
      + '<div class="mn-rock" id="mnRock">'
      +   '<div class="mn-slide" id="mnSlide"></div>'
      +   '<i class="mn-veil" id="mnVeil" hidden></i>'
      +   '<i class="mn-reach" id="mnReach" hidden></i>'
      + '</div>'
      + '<div class="mn-crab" id="mnCrab" aria-hidden="true"></div>';
  }

  // --- the band ----------------------------------------------------------------------------------

  // The seams, placed by their depth. Every one of them is in the window because the host sends
  // only the ones that are (mine.js, seamsAhead): what is further out is this game's secret
  function mnOre(st) {
    var box = el('mnSlide'); if (!box) return;
    var out = '';
    for (var i = 0; i < st.seam.length; i++) {
      var s = st.seam[i];
      out += '<i class="mn-ore ' + kindOf(s.kind) + '" style="left:' + fx(pctOf(st, s.at - st.depth)) + '%"></i>';
    }
    box.innerHTML = out;
  }

  // THE GROUND ARRIVES WHERE IT WAS AND WALKS TO WHERE IT IS. The markers above are already placed
  // against the new depth, so starting the whole floor one push to the right puts them back where
  // the reader last saw them, and the slide home is the advance. One transform, no marker moved
  function mnSlideIn(from, ms) {
    var box = el('mnSlide'), st = mn.st;
    if (!box || !st) return;
    var shift = (from == null || !ms) ? 0 : pctRun(st.depth - from);
    box.style.transition = 'none';
    box.style.transform = shift ? 'translateX(' + fx(shift) + '%)' : 'translateX(0%)';
    if (!shift) return;
    reflow(box);
    box.style.transition = 'transform ' + ms + 'ms linear';
    box.style.transform = 'translateX(0%)';
  }
  // ...and the other direction, which is the fever: the ground ON SCREEN runs past the face while
  // the seams standing in it go one by one. The new state is drawn when the running stops, so what
  // bursts during the run is the real marker at the real depth and not a stand-in
  function mnRunOut(to, ms) {
    var box = el('mnSlide'), st = mn.st;
    if (!box || !st || mn.depth == null) return;
    var shift = pctRun(to - mn.depth);
    box.style.transition = 'none';
    box.style.transform = 'translateX(0%)';
    reflow(box);
    box.style.transition = 'transform ' + ms + 'ms linear';
    box.style.transform = 'translateX(-' + fx(shift) + '%)';
  }
  // How far a run of ground is, in per cent of the lookahead. CAPPED AT TWO WINDOWS: a mine nobody
  // has opened for a month comes back a thousand metres deeper, and a transform of 160,000% is a
  // picture of nothing. Two windows is long enough to read as "a long way" and short enough to see
  function pctRun(m) { return Math.max(0, Math.min(200, m / ((mn.st.window.ahead) || 1) * 100)); }
  // A style change has to be seen before the next one or the two collapse into no transition at
  // all. Read a geometry property to force it; a document that has none (the test harness) needs
  // no forcing, because nothing there is animating
  function reflow(e) { if (e.getBoundingClientRect) e.getBoundingClientRect(); }

  // THE LINE, WHICH IS THE WHOLE SCREEN. Three states of one rule (5-15):
  //   the reach is past the window   no line at all. Everything in sight is going to be dug
  //   the reach is inside it         2px of ember, and the rock beyond it is veiled
  //   there is no pick               the line is on the face and the veil covers all of it
  // The MOVEMENT is read off the previous reach rather than sent: outward is a pick being fitted
  // (320ms) and down to nothing is one wearing out (240ms, and nothing pops)
  function mnLine(st) {
    var line = el('mnReach'), veil = el('mnVeil');
    if (!line || !veil) return;
    var ahead = st.window.ahead || 1;
    var out = st.reach >= ahead;                 // past the edge: there is nothing to warn about
    var at = fx(pctOf(st, Math.min(st.reach, ahead))) + '%';
    var was = mn.reach;
    var ms = 0;
    if (was != null && st.reach > was) ms = MN_T.pick;
    else if (was != null && st.reach < was && st.reach === 0) ms = MN_T.dim;
    if (CUC.reduceMotion()) ms = 0;
    var move = ms ? 'left ' + ms + 'ms ease-out' : 'none';
    line.style.transition = move; veil.style.transition = move;
    // A line that is leaving goes out of the edge first and is taken off the screen after it: hidden
    // at once, it would vanish from the middle of the rock instead of sliding out of it
    if (out && ms) {
      line.hidden = false; veil.hidden = false;
      line.style.left = '100%'; veil.style.left = '100%';
      mn.timers.at(ms, function () { line.hidden = true; veil.hidden = true; });
    } else {
      line.hidden = out; veil.hidden = out;
      line.style.left = at; veil.style.left = at;
    }
    mn.reach = st.reach;
  }

  // The crab: one class, and the rung decides the speed. Reduced motion takes the class off, which
  // leaves frame 0 of the strip (the crab standing) and is why no still drawing was needed
  function mnCrab() {
    var c = el('mnCrab'); if (!c) return;
    var ms = MN_DIG[mn.step] || 0;
    var on = !!ms && !CUC.reduceMotion();
    if (ms) c.style.animationDuration = ms + 'ms';
    c.classList.toggle('dig', on);
  }

  // A seam leaving the face. The one that was found is BEHIND the face by the time the reply lands
  // (the depth is past it), so it is drawn as its own thing at the face rather than taken out of
  // the slide: what the reader saw get hit rises out of the hole and goes
  function mnPopFace(kind) {
    var rock = el('mnRock'); if (!rock || CUC.reduceMotion()) return;
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

  // WHAT CAME OUT. The line is always filled, because one that appeared on a find would move
  // everything under it every time something was found. The chip is redrawn `still` after its first
  // moment: a chip that pops on every push is a chip nobody can read
  function mnLast() {
    var box = el('mnLast'); if (!box) return;
    var c = mn.chip;
    if (!c) { box.textContent = 'nothing yet'; return; }
    box.innerHTML = '<span class="bj-chip ' + c.cls + (c.still ? ' still' : '') + '">'
      + esc(c.text) + '</span>';
    c.still = true;
  }
  function mnChip(found, dash) {
    if (!found) return;
    var more = found.n > 1 ? ' +' + (found.n - 1) + ' more' : '';
    mn.chip = {
      cls: dash ? 'win' : 'bj',
      text: found.name + ' ' + fmtInt(found.pay) + more,
      still: false
    };
    mnLast();
  }

  // The one button. What it fits and what it costs are the host's (mine.offerFor); what fitting it
  // throws away rides in the TITLE, because the one thing this screen must not grow is a sentence
  // apologising for the trade it is about to make (5-15)
  function mnButton() {
    var b = el('mnBuy'), st = mn.st;
    if (!b) return;
    var o = st && st.offer;
    b.hidden = !o;
    if (!o) return;
    var free = CUC.free('mn');
    var poor = free != null && free < o.price;
    b.disabled = !!mn.locked || poor;
    b.textContent = 'New pick ' + fmtInt(o.price);
    b.title = (poor ? 'Not enough credits · ' : '')
      + o.name + ' · ' + fmtInt(o.price) + ' credits'
      + (o.lose > 0 ? ' · the pick in hand has ' + fmtInt(o.lose) + ' ' + st.unit + ' left' : '')
      + (poor ? '' : ' (Enter)');
    b.setAttribute('aria-label', 'Fit ' + o.name + ' for ' + fmtInt(o.price) + ' credits');
    // Two things want this line and they cannot both have it, so the one that changes what the
    // reader should do wins: bare hands is why the drift has gone dark, and a short purse is
    // already on the button that is dark because of it
    CUC.note('mnNote', st.reach === 0
      ? 'The pick is gone. Bare hands dig, slowly, until the next one is fitted.'
      : (poor ? (CUC.balance() >= o.price ? CUC.heldElsewhere + '.'
        : 'You need ' + fmtInt(o.price) + ' credits for the next pick.') : ''));
  }

  // The pay table, folded. A fever's own pay is 0 and printing a 0 would read as a seam worth
  // nothing, so what it gives is named instead: ground (mine.js, SEAMS)
  function mnPays(st) {
    var w = el('mnWhy'), p = el('mnPays');
    if (!w || !p) return;
    var rows = st.pays || [];
    w.hidden = !rows.length;
    p.innerHTML = rows.map(function (r) {
      return '<div>' + esc(r.name) + ' <b>' + (r.pay ? fmtInt(r.pay) : 'ground') + '</b></div>';
    }).join('');
  }

  // The band is a picture, so it says in words what it shows: where the face is, what is standing
  // in front of it and whether the pick gets there. No per cent and no durability, here either
  function mnSaid(st) {
    var out = 'Depth ' + fmtInt(st.depth) + ' ' + st.unit + '. ';
    out += st.reach === 0 ? 'No pick: digging by hand. '
      : st.reach >= (st.window.ahead || 1) ? 'The pick reaches past everything in sight. '
        : 'The pick reaches ' + fmtInt(st.reach) + ' ' + st.unit + '. ';
    if (!st.seam.length) return out + 'Bare rock ahead.';
    return out + st.seam.map(function (s) {
      var d = s.at - st.depth;
      return (MN_WORDS[s.kind] || 'a seam') + ' ' + fmtInt(d) + ' ' + st.unit + ' ahead'
        + (st.reach < d ? ', out of reach' : '');
    }).join(', ') + '.';
  }

  // --- drawing one reply -------------------------------------------------------------------------

  // Everything but the ground's own movement, which the caller paces
  function mnDraw(from, ms) {
    var st = mn.st; if (!st) return;
    mnHead(st);
    mnOre(st);
    mnSlideIn(from, ms);
    mnLine(st);
    mnCrab();
    mnButton();
    mnPays(st);
    var d = el('mnDrift'); if (d) d.setAttribute('aria-label', mnSaid(st));
    mn.depth = st.depth;
  }

  // THE FOUR EVENTS, and good news and bad news are not the same size (5-15).
  //
  // A push with nothing in it is the ground moving 300ms and nothing else. A find is that plus one
  // seam leaving the face and a chip. A fever is the ground running for 1,200ms with the seams in it
  // going one at a time, and the chip after it has stopped. A pick wearing out is the veil closing
  // and one line of text: there is no pop, because turning a loss into a firework is what makes a
  // game with no good news in it
  function mnRun(m, news) {
    CUC.hold();
    var st = mn.st, from = mn.depth;
    var found = news ? st.found : null;
    var fever = news ? st.fever : null;
    if (CUC.reduceMotion()) {
      mnDraw(null, 0);
      mnChip(found, !!fever);
      if (found) mnSay(st, found, fever);
      return mnSettle(m);
    }
    if (fever) {
      // The gaps are pressed together and the tail is not cut off: a run past nine seams is nine
      // bursts at 133ms, and one past twenty is twenty at the 70ms floor, which runs past the
      // 1,200 rather than leaving seams unburst (docs/game-panels.md, section 6)
      var n = Math.max(1, fever.hits | 0);
      var gap = Math.max(MN_T.burstMin, MN_T.dash / n);
      mnRunOut(st.depth, MN_T.dash);
      for (var i = 0; i < n; i++) mn.timers.at(Math.round(i * gap), mnPopNext);
      mn.timers.at(MN_T.dash, function () { mnDraw(null, 0); });
      mn.timers.at(MN_T.dashChip, function () {
        mnChip(found, true);
        mnSay(st, found, fever);
        mnSettle(m);
      });
      return;
    }
    mnDraw(from, MN_T.step);
    if (!found) return mnSettle(m);
    mnPopFace(kindFor(found.name));
    mn.timers.at(MN_T.find, function () {
      mnChip(found, false);
      mnSay(st, found, null);
      mnSettle(m);
    });
  }

  // The band is aria-hidden art, so what happened is read out once, when it happens
  function mnSay(st, found, fever) {
    var what = found ? found.name + ', ' + fmtInt(found.pay) + ' credits' : '';
    if (fever) what = 'Fever: ' + fmtInt(fever.hits) + ' seams, ' + fmtInt(fever.pay) + ' credits';
    if (!what) return;
    CUC.live('mnLive', what + '. Depth ' + fmtInt(st.depth) + ' ' + st.unit
      + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }

  function mnSettle(m) {
    mn.busy = false;
    try {
      CUC.settle(m);
    } finally {
      mnLock(false);
      mnFocusAfter();
    }
  }
  function mnLock(locked) { mn.locked = !!locked; mnButton(); }

  // --- messages ----------------------------------------------------------------------------------

  function mnSend(op, extra) {
    if (mn.busy) return;
    mn.busy = true; mn.op = op;
    if (op !== 'open') mnLock(true);
    mn.n = CUC.post('mn', op, extra);
    clearTimeout(mn.to);
    mn.to = setTimeout(function () {
      mn.busy = false; mn.op = null;
      CUC.err('mnErr', 'The mine didn’t respond. Try again.');
      mnLock(false);
    }, MN_T.noReply);
  }

  // A reply with no state: the host could not describe the drift (games/README.md, section 5). The
  // reason shows and everything drawn stays drawn, which matters here for the market's reason: a
  // depth is the reader's property, and a band wiped back to bare rock is the one reading they
  // cannot tell from "my mine is gone"
  function mnFault(m, awaited) {
    CUC.err('mnErr', m.error || 'The mine could not be shown. Try again.');
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
      var d = el('mnDrift'); if (d) d.innerHTML = driftHtml();
      // The strip is the host's URI (games/mine/meta.js's `art`), and the image is set here rather
      // than in the stylesheet for that reason. The longhand, so the strip's size and position in
      // the CSS survive it
      var c = el('mnCrab');
      if (c) c.style.backgroundImage = 'url("' + CUC.art('mine', 'dig') + '")';
      mn.step = CUC.step ? CUC.step() : 'quiet';
      mnCrab();
      mnLast();
      CUC.why('mnWhy', 'mnPays');
      el('mnBuy').addEventListener('click', function () {
        if (this.disabled || this.hidden) return;
        mnSend('buy');
      });
    },
    enter: function () {
      mn.wantFocus = true;
      mn.step = CUC.step ? CUC.step() : mn.step;
      mnCrab();
      mnLock(true);
      mnSend('open');
    },
    leave: function () {
      mn.timers.clear();
      clearTimeout(mn.to);
      mn.busy = false; mn.op = null;
    },
    receive: mnReceive,
    // The rung changed, which is the only thing on this screen that is not about the mine: how hard
    // the machine is working is what the swing says, and the crab in the Usage tab says it too
    step: function (rung) { mn.step = rung; mnCrab(); },
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
