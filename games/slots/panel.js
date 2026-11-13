// The slot machine's screen: did three cells match?
//
// The host owns the rings, the stops and the paytable (slots.js). This screen does two things with
// what it is sent: it rolls the REAL ring to the REAL stop, and it lights the cells the host says
// matched. `strips` is the three rings and `reels[i].above/.sym/.below` is where each one came to
// rest, so the symbols that go past the window are the ring's own order and the frame it lands on
// is the host's rather than one worked out here.
//
// A spin settles on the press, so there is no live phase: the bet row is the only control row this
// screen has, and `phase` is 'bet' before the first spin and 'done' after every one.
//
// THE RINGS ARE ROLLED BY ONE TRANSITION EACH, not by swapping the three cells in the window on a
// timer. The timer version replaced the window's symbols every 70ms while a 5px CSS keyframe
// shivered the reel: a cell is 48px and the ring's pitch is 52px, so 5px is not scrolling, and six
// swaps in 420ms is not a ring going past either. A reel now holds the run of the ring it is about
// to cross and is slid to its stop in one composited transition, which is the same mechanism the
// wheel uses, and it costs one innerHTML and no timers instead of twelve and thirty-six.
//
// AND NOTHING IS LIT UNTIL ALL THREE HAVE STOPPED. Each reel used to carry its own `hit` into its
// own stop, so a three-alike spin ringed reel one at 520 while reel three was still rolling: the
// answer, 820ms early. The rings go on with the chip, which is what makes the third reel's own
// moment the first moment this screen says anything.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The reels stop 520, 880 and 1,340 in, and the chip follows the last of them
  // (docs/game-panels.md, section 6). The gaps WIDEN (520 / 360 / 460): at the old 420 / 200 / 220
  // the last two were so nearly the same that all three landed as one event.
  // `near` is the same three with the third held back, used when the first two cells already match
  // (slNear below). 1,760 is the longest this screen ever runs, and the cap is 2,000.
  var SL_T = {
    reels: [520, 880, 1340], chip: 1460,
    nearReels: [520, 880, 1640], nearChip: 1760,
    noReply: 4000
  };
  // THE PLATE'S GEOMETRY, which the roll is solved from rather than guessing at.
  // A cell is 48px and the ring's pitch is 52 (48 + the 4px gap). The window is 112: the pay line's
  // own 48 with 28 of the ring showing above and below it (28 + 4 + 48 + 4 + 28), which is a crop
  // and not a resize, so the symbol grid is still two whole pixels a unit (docs 8-3).
  var SL_CELL = 48, SL_PITCH = 52, SL_WIN = 112;
  // The wheel's curve, on the reels (games/wheel/meta.js says what it does). Its peak speed is
  // 2.573x its own average, so holding the PEAK fixed makes the distance travelled proportional to
  // the time: 70 symbols a second, 3,640px/s, 1.17 cells a frame at 60fps. That is what puts 14
  // cells behind reel one, exactly one whole ring behind reel two and one and a half behind reel
  // three: a jackpot symbol is one cell in twenty-four, so reel three is the first that was ever
  // certain to show the player the crab going past.
  var SL_EASE = 'cubic-bezier(.12,.01,.2,1)', SL_PEAK = 3640, SL_PEAK_AVG = 2.573;

  var sl = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false };
  var SU = CUC.stakeUi('sl');

  // How many cells of ring a reel crosses on its way to a stop `ms` away, and where the strip has
  // to sit for cell `i` of it to be the one on the pay line
  function cellsIn(ms) { return Math.max(1, Math.round(SL_PEAK / SL_PEAK_AVG * (ms / 1000) / SL_PITCH)); }
  function offsetFor(i) { return (SL_WIN - SL_CELL) / 2 - i * SL_PITCH; }

  // The names this machine pays in. The drawings are aria-hidden (games/symbols.js), so whatever
  // shows a symbol has to carry its name, which is CUC.cardWord's rule for the pixel cards and is
  // kept here by the floor's CUC.symWord: this machine uses six of the ten names and the scratch
  // card uses all ten, so the list of them is not either screen's to hold
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function one(sym) { return CUC.symWord(sym, 1); }
  function many(sym) { return CUC.symWord(sym, 2); }

  // --- the plate ---------------------------------------------------------------------------

  function sy(sym) {
    return '<svg class="sy" viewBox="0 0 24 24" aria-hidden="true"><use href="#sy-' + sym + '"/></svg>';
  }
  // The middle row is the pay line and the state of this game, so those three cells carry their
  // names. The two rows either side are the ring going past, which is art
  function face(sym, hit) {
    return '<span class="sy-cell' + (hit ? ' hit' : '') + '" role="img" aria-label="' + CUC.esc(one(sym)) + '">' + sy(sym) + '</span>';
  }
  function art(sym) { return '<span class="sy-cell dim" aria-hidden="true">' + sy(sym) + '</span>'; }

  function markup() {
    var reels = '';
    // the reel is the WINDOW and the strip inside it is what moves: a run of the ring, slid
    for (var r = 0; r < 3; r++) reels += '<div class="sl-reel" id="slR' + r + '"><div class="sl-strip" id="slS' + r + '"></div></div>';
    return CUC.frame('slots')
      + '<div class="bj-felt">'
      +   '<div class="sl-plate gm-plate tight">' + reels
      +     '<i class="sl-caret l" aria-hidden="true"></i><i class="sl-caret r" aria-hidden="true"></i>'
      +   '</div>'
      +   '<div class="hl-line" id="slLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="slWhy" aria-expanded="false" aria-controls="slPays">How it pays</button>'
      + '<div class="bj-pays" id="slPays" hidden></div>'
      + '<div class="bj-sr" id="slLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="slNote" hidden></div>'
      + '<div class="warnbar" id="slErr" hidden></div>'
      + '<div class="bj-ctl" id="slBet">' + CUC.stakesHtml('sl')
      +   '<button type="button" class="bj-btn primary" id="slDeal" title="Spin (Enter)">Spin</button></div>';
  }

  // The symbol `pos` round a ring. The ring is `strips[r]`, which the host sent, so this scrolls
  // the machine rather than inventing one
  function ringAt(strip, pos) {
    var n = strip.length;
    return strip[((pos % n) + n) % n];
  }
  // A strip of cells, top to bottom, with cell `centre` carrying the pay line's own name and its
  // ring if it has one. The rows either side of the line are the ring going past, which is art
  function stripHtml(syms, centre, hit) {
    var out = '';
    for (var i = 0; i < syms.length; i++) out += i === centre ? face(syms[i], !!hit) : art(syms[i]);
    return out;
  }
  function placeStrip(r, html, i) {
    var e = el('slS' + r); if (!e) return null;
    e.style.transition = 'none';
    e.style.transform = 'translateY(' + offsetFor(i) + 'px)';
    e.innerHTML = html;
    return e;
  }
  // Where a reel came to rest, taken from the host's own three symbols rather than read off the
  // ring again: the two have to agree, and the one that is allowed to be right is the host's
  function drawStopped(r, rv, hit) {
    if (!rv) return;
    placeStrip(r, stripHtml([rv.above, rv.sym, rv.below], 1, hit), 1);
  }
  // The machine standing still, which is what the player is about to press: the ring at its own
  // position 0, in the window, nothing claimed
  function drawIdle(r, strip) {
    placeStrip(r, stripHtml([ringAt(strip, -1), ringAt(strip, 0), ringAt(strip, 1)], 1), 1);
  }
  function hitAt(st, r) {
    var w = st && st.win;
    return !!(w && w.reels && w.reels.indexOf(r) >= 0);
  }
  // The whole plate, at rest. `lit` is what puts the rings on, and it is false for every drawing of
  // the plate except the one at the chip: see the header
  function drawPlate(st, lit) {
    var strips = (st && st.strips) || null; if (!strips) return;
    var reels = (st && st.reels) || [];
    for (var r = 0; r < strips.length; r++) {
      if (reels[r]) drawStopped(r, reels[r], !!lit && hitAt(st, r));
      else drawIdle(r, strips[r]);
    }
  }
  // One reel, rolled to its stop in one transition. The strip holds the whole run of ring the reel
  // is about to cross, laid out so the cell that ends up on the pay line IS the host's own frame:
  // the reel lands right by arriving there, not by being redrawn when it does.
  //
  // THE RING RUNS DOWNWARD through the window, which is the way a drum turns towards the player,
  // and it is also what makes the arithmetic honest: the cell about to come in over the top is the
  // one before the stop on the ring, which is the host's own `above`
  function rollReel(r, strip, rv, stopMs) {
    var n = cellsIn(stopMs), syms = [rv.above, rv.sym, rv.below], i;
    for (i = 3; i <= n + 2; i++) syms.push(ringAt(strip, rv.at - 1 + i));
    var e = placeStrip(r, stripHtml(syms, 1), n + 1);
    if (!e) return;
    // the start has to be committed before the end is set, or both land in one frame and the
    // transition has nothing to run over. Reading a layout property is what commits it
    void e.offsetHeight;
    e.style.transition = 'transform ' + stopMs + 'ms ' + SL_EASE;
    e.style.transform = 'translateY(' + offsetFor(1) + 'px)';
  }
  // THE THIRD REEL IS HELD BACK WHEN THE FIRST TWO ALREADY MATCH, and the two it reads are the two
  // that are already on the screen by the time the delay can be seen (reel two stops at 880, reel
  // three would have stopped at 1,340). So the pacing is following the player rather than telling
  // them something: it says nothing whatever about the third cell.
  // NOT `st.win`: that is the third cell read early, and it would also miss a kelp pair, which
  // winOf() returns as NO_WIN
  function slNear(st) {
    var rs = (st && st.reels) || [];
    return !!(rs.length >= 2 && rs[0] && rs[1] && rs[0].sym === rs[1].sym);
  }
  function slStops(st) { return slNear(st) ? SL_T.nearReels : SL_T.reels; }
  function slChip(st) { return slNear(st) ? SL_T.nearChip : SL_T.chip; }
  function rollAll(st) {
    var strips = st.strips || [], reels = st.reels || [], stops = slStops(st);
    for (var r = 0; r < strips.length && r < reels.length; r++) {
      rollReel(r, strips[r], reels[r], stops[r] != null ? stops[r] : stops[stops.length - 1]);
    }
  }

  // --- the line, the paytable and what is read out -------------------------------------------

  // What the result says, in words. Read off `win.kind` and `net` and nothing else: a paid pair is
  // a multiplier of 1, so the bet comes back and the net is zero, and calling that a win would be
  // the screen deciding something the host did not say
  function verdict(st) {
    var w = st.win || {}, net = st.net || 0;
    if (w.kind === 'three') return 'Three ' + many(w.sym) + ' ' + signed(net);
    if (w.kind === 'pair') return 'Two ' + many(w.sym) + (net === 0 ? ', the bet comes back' : ' ' + signed(net));
    return 'Nothing ' + signed(net);
  }
  // The line under the plate: the stake about to go on before a spin, and the result after one.
  // A spin that missed shows no chip (docs/game-panels.md, section 5-4) and the line goes back to
  // the stake, which is the next thing the player is deciding
  // `pop` is true only on the chip's own moment. Every other redraw (a credit minted, a stake
  // picked, a walk back into the screen) is a result already shown, and `.still` is what stops it
  // being animated in a second time
  function slLine(st, pop) {
    var line = el('slLine'); if (!line) return;
    var won = st && st.phase === 'done' && st.win && st.win.kind !== 'none';
    if (!won) { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    line.innerHTML = '<span class="bj-chip' + (st.win.kind === 'three' ? ' bj' : '') + (pop ? '' : ' still') + '">'
      + CUC.esc(verdict(st)) + '</span>';
  }
  function slPays(st) {
    var rows = (st && st.pays) || [], box = el('slPays'); if (!box) return;
    var out = '<div class="sl-pay head"><span>per bet</span><b>three</b><b>two</b></div>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      out += '<div class="sl-pay"><span>' + CUC.esc(cap(many(r.sym))) + '</span>'
        // a kelp pair pays nothing, and `0×` says that where a dash would only say "not applicable"
        + '<b>' + fmtInt(r.three) + '×</b><b>' + fmtInt(r.pair) + '×</b></div>';
    }
    box.innerHTML = out;
  }
  // One line per spin, at the settle: the three symbols, then what they came to. Nothing above this
  // reaches a screen reader on its own, because the rows either side of the pay line are art
  function slAnnounce(st) {
    if (!st || st.phase !== 'done') return;
    var reels = st.reels || [], names = [];
    for (var i = 0; i < reels.length; i++) names.push(one(reels[i].sym));
    CUC.live('slLive', names.join(', ') + '. ' + verdict(st) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }

  // --- controls ------------------------------------------------------------------------------

  function slControls(st, locked) {
    CUC.renderStakes(SU, locked);
    slPays(st);
  }
  function slFocusAfter() {
    if (CUC.current() !== 'slots') return;
    var a = document.activeElement, panel = el('panel-slots');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!sl.wantFocus && !lost) return;
    sl.wantFocus = false;
    var d = el('slDeal'); if (d && !d.disabled) d.focus();
  }

  function slSend(op, extra) {
    if (sl.busy) return;
    sl.busy = true; sl.op = op;
    if (op !== 'open') slControls(sl.st, true);
    sl.n = CUC.post('sl', op, extra);
    clearTimeout(sl.to);
    sl.to = setTimeout(function () {
      sl.busy = false; sl.op = null;
      CUC.err('slErr', 'The machine didn’t respond. Try again.');
      slControls(sl.st, false);
    }, SL_T.noReply);
  }

  // The rings roll first and the chip follows the last of them: a result that landed before the
  // reels did would give the spin away
  function slReceive(m) {
    var current = sl.op != null && m.n === sl.n;
    if (!current && sl.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('sl', m);
    if (!m.state) { var awaited = current; sl.op = null; return slFault(m, awaited); }
    var op = current ? sl.op : null;
    clearTimeout(sl.to); sl.timers.clear();
    sl.op = null; sl.st = m.state;
    // spun: the reply to a press the player just made. A refused spin changed nothing, and a reply
    // nobody asked for is a state this screen is being told about rather than one it caused, so
    // both are drawn where they stand: rolling either would spin the same rings a second time
    var spun = current && op === 'deal' && !m.error && m.state.phase === 'done';
    var fresh = spun && !CUC.reduceMotion();
    var chipAt = fresh ? slChip(sl.st) : 0;
    try {
      CUC.err('slErr', m.error || '');
      if (fresh) rollAll(sl.st);
      // `spun` and not `fresh`: reduced motion. The spin is still this player's own, so the chip is
      // its own moment and not a redraw of one, which is what `.still` is for
      else { drawPlate(sl.st, true); slLine(sl.st, spun); }
      slControls(sl.st, true);
    } finally {
      CUC.hold();   // the header waits for the reels
      // the rings and the chip at once, after the LAST reel: the plate is redrawn at rest here, so
      // the three long strips go with it and the rings go on all three in the same frame
      if (fresh) sl.timers.at(chipAt, function () { drawPlate(sl.st, true); slLine(sl.st, true); });
      sl.timers.at(chipAt, function () { slSettle(m, spun); });
    }
  }
  // A reply with no state: the host could not describe the spin (games/README.md, section 5). The
  // reason shows and the plate stays exactly as it is, because it is the describing that failed and
  // not the machine. sl.st is kept, so the next redraw is still drawn against the host's own round
  function slFault(m, awaited) {
    CUC.err('slErr', m.error || 'The machine could not be shown. Try again.');
    if (!awaited) return;
    sl.busy = false;
    clearTimeout(sl.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    slControls(sl.st, false);
    slFocusAfter();
  }
  function slSettle(m, spun) {
    sl.busy = false;
    try {
      CUC.settle(m);
      if (spun) slAnnounce(sl.st);   // after the balance, so the line can say where it landed
    } finally {
      slControls(sl.st, false);
      slFocusAfter();
    }
  }

  CUC.game('slots', {
    key: 'sl',
    cls: 'sl',
    markup: markup,
    init: function () {
      slLine(null);
      // Picking a stake does NOT redraw the line. When the line is the stake preview, renderStakes
      // writes the figure straight into it (ui.preview), and when it is holding a result chip that
      // chip is the last thing that happened and a stake click did not change it. Redrawing it
      // would also replace the chip mid-animation, one millisecond after it popped
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, sl.busy); });
      el('slDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        slSend('deal', { bet: bet });
      });
      CUC.why('slWhy', 'slPays');
    },
    enter: function () { sl.wantFocus = true; slControls(sl.st, true); slSend('open'); },
    leave: function () {
      sl.timers.clear();
      clearTimeout(sl.to);
      sl.busy = false; sl.op = null;
    },
    receive: slReceive,
    // a credit minted while the bet row is up lights the chips at once. The line is left alone for
    // the reason above: the data push lands a millisecond after a settle, and a redraw there would
    // cut the result chip's own moment short
    credits: function () { if (!sl.busy) slControls(sl.st, false); },
    // There is nothing to play inside a spin, so Enter on the bet row is the whole keyboard
    keys: function (e) { CUC.press(e, '#slBet', null, 'slDeal', 'slBet'); }
  });
})();
