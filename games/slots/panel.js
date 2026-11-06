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
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The reels stop 200 then 220 apart, which is what makes the third one feel like it was nearly
  // the one, and the chip follows the last of them (docs/game-panels.md, section 6).
  // `tick` is how often a rolling reel swaps the symbols in its window, and it is the same fact as
  // the .07s on `.sl-reel.spin` in games/slots/meta.js
  var SL_T = { reels: [420, 620, 840], tick: 70, chip: 940, noReply: 4000 };

  var sl = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false };
  var SU = CUC.stakeUi('sl');

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
    for (var r = 0; r < 3; r++) reels += '<div class="sl-reel" id="slR' + r + '"></div>';
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

  // A window on a ring: the symbol at `pos` and the ring's own neighbours either side of it. The
  // ring is `strips[r]`, which the host sent, so this scrolls the machine rather than inventing one
  function window3(strip, pos) {
    var n = strip.length, i = ((pos % n) + n) % n;
    return [strip[(i + n - 1) % n], strip[i], strip[(i + 1) % n]];
  }
  function drawRolling(r, strip, pos) {
    var e = el('slR' + r); if (!e) return;
    var w = window3(strip, pos);
    e.innerHTML = art(w[0]) + face(w[1], false) + art(w[2]);
  }
  // Where a reel came to rest, taken from the host's own three symbols rather than read off the
  // ring again: the two have to agree, and the one that is allowed to be right is the host's
  function drawStopped(r, rv, hit) {
    var e = el('slR' + r); if (!e || !rv) return;
    e.innerHTML = art(rv.above) + face(rv.sym, hit) + art(rv.below);
  }
  function hitAt(st, r) {
    var w = st && st.win;
    return !!(w && w.reels && w.reels.indexOf(r) >= 0);
  }
  // The whole plate, at rest. Before the first spin there are no stops, so the rings are shown at
  // their own position 0: the machine standing still, which is what the player is about to press
  function drawPlate(st, lit) {
    var strips = (st && st.strips) || null; if (!strips) return;
    var reels = (st && st.reels) || [];
    for (var r = 0; r < strips.length; r++) {
      var e = el('slR' + r); if (e) e.classList.remove('spin');
      if (reels[r]) drawStopped(r, reels[r], lit && hitAt(st, r));
      else drawRolling(r, strips[r], 0);
    }
  }
  // One reel, rolled to its stop. `n` swaps of the window, evenly spread over the reel's own stop
  // time, walking the ring forwards so the last swap before the stop is the ring's real neighbour.
  // The final frame is the host's, which is what keeps the two from disagreeing
  function rollReel(r, strip, rv, stopMs, hit) {
    var e = el('slR' + r);
    var n = Math.max(1, Math.round(stopMs / SL_T.tick));
    if (e) e.classList.add('spin');
    // the first frame is drawn now rather than on a timer, or the last spin's stopped reels (rings
    // and all) would stay on the plate until the first swap fired
    drawRolling(r, strip, rv.at - n);
    for (var k = 1; k < n; k++) {
      (function (step) {
        sl.timers.at(Math.round(stopMs * step / n), function () { drawRolling(r, strip, rv.at - (n - step)); });
      })(k);
    }
    sl.timers.at(stopMs, function () {
      if (e) e.classList.remove('spin');
      drawStopped(r, rv, hit);
    });
  }
  function rollAll(st) {
    var strips = st.strips || [], reels = st.reels || [];
    for (var r = 0; r < strips.length && r < reels.length; r++) {
      rollReel(r, strips[r], reels[r], SL_T.reels[r] != null ? SL_T.reels[r] : SL_T.reels[SL_T.reels.length - 1], hitAt(st, r));
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
    try {
      CUC.err('slErr', m.error || '');
      if (fresh) rollAll(sl.st);
      // `spun` and not `fresh`: reduced motion. The spin is still this player's own, so the chip is
      // its own moment and not a redraw of one, which is what `.still` is for
      else { drawPlate(sl.st, true); slLine(sl.st, spun); }
      slControls(sl.st, true);
    } finally {
      CUC.hold();   // the header waits for the reels
      if (fresh) sl.timers.at(SL_T.chip, function () { slLine(sl.st, true); });
      sl.timers.at(fresh ? SL_T.chip : 0, function () { slSettle(m, spun); });
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
