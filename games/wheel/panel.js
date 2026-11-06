// The wheel's screen: where did it stop? And before it turns, how many segments are worth hoping
// for?
//
// A WHEEL IS DRAWN AS A CIRCLE because the whole point of this game is that it can be read before
// the bet: 28 segments, all public, and the only secret is where it stops. Flattened into a bar it
// would be a lie about the object. The host sends every wheel's segments and its legend, so this
// screen colours wedges and prints rows and holds no multiplier or chance of its own.
//
// `stop` is null while the round is live, which is the one thing the host keeps back: a screen that
// knew the segment before it animated getting there would be animating a result it already had.
//
// Two presses, and that is the engine's shape rather than a stutter: Deal puts the bet on the table
// (it is held from the other games from that moment) and Spin turns the wheel WITH the chosen
// wheel, because that choice is part of the move (see games/wheel/meta.js).
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The wheel slows to a stop in 860 and the figure follows it (docs/game-panels.md, section 6).
  // `stop` is also the .86s on `.wh-face` in games/wheel/meta.js
  var WH_T = { stop: 860, chip: 960, noReply: 4000 };
  var TURNS = 3;   // whole turns before it settles, so a short hop and a long one look the same

  var wh = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, risk: null, phase: null, spins: 0 };
  var SU = CUC.stakeUi('wh');
  var RISK_KEY = 'whRisk';   // the chosen wheel, remembered the way the stakes remember theirs

  // --- the wheel -----------------------------------------------------------------------------

  function markup() {
    return CUC.frame('wheel')
      + '<div class="bj-felt">'
      +   '<div class="gm-plate tight">'
      +     '<div class="wh-dial">'
      +       '<div class="wh-face" id="whFace" role="img" aria-label="Wheel"></div>'
      +       '<div class="wh-hub" aria-hidden="true"></div>'
      +       '<i class="wh-pin" aria-hidden="true"></i>'
      +     '</div>'
      +     '<div class="wh-key" id="whKey"></div>'
      +   '</div>'
      +   '<div class="hl-line" id="whLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="whWhy" aria-expanded="false" aria-controls="whPays">How it pays</button>'
      + '<div class="bj-pays" id="whPays" hidden></div>'
      + '<div class="bj-sr" id="whLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="whNote" hidden></div>'
      + '<div class="warnbar" id="whErr" hidden></div>'
      + '<div class="bj-ctl wh-risks" id="whRisks"><div class="bj-stakes" id="whRiskBox" role="group" aria-label="Wheel"></div></div>'
      + '<div class="bj-ctl" id="whBet">' + CUC.stakesHtml('wh')
      +   '<button type="button" class="bj-btn primary" id="whDeal" title="Place the bet (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="whPlay" hidden>'
      +   '<button type="button" class="bj-btn primary" data-op="spin" title="Spin (S)">Spin</button></div>';
  }

  function wheels(st) { return (st && st.wheels) || []; }
  // Which wheel the player has chosen. The host's own list is what makes a choice valid, so a
  // remembered key that is no longer a wheel falls back to the first one rather than being sent
  function risk(st) {
    var all = wheels(st);
    if (!all.length) return wh.risk;
    var want = wh.risk != null ? wh.risk : (CUC.state() || {})[RISK_KEY];
    for (var i = 0; i < all.length; i++) if (all[i].risk === want) return want;
    return all[0].risk;
  }
  function wheelOf(st) {
    var all = wheels(st), now = risk(st);
    for (var i = 0; i < all.length; i++) if (all[i].risk === now) return all[i];
    return null;
  }
  function drawRisks(st, locked) {
    var box = el('whRiskBox'); if (!box) return;
    var all = wheels(st), now = risk(st), out = '';
    for (var i = 0; i < all.length; i++) {
      out += '<button type="button" data-risk="' + all[i].risk + '"' + (locked ? ' disabled' : '')
        + ' aria-pressed="' + (all[i].risk === now ? 'true' : 'false') + '"'
        + ' class="' + (all[i].risk === now ? 'on' : '') + '">' + CUC.esc(all[i].name) + '</button>';
    }
    box.innerHTML = out;
  }

  // ONE COLOUR, IN DEPTHS. Ember is the only accent this casino has, so a live segment is ember at
  // a depth set by its rank among that wheel's own multipliers: proportion would make the wild
  // wheel's 20x the only visible thing on it. A dead segment is two near-identical darks,
  // alternating, which is what keeps 25 dead segments in a row from reading as one solid ring
  function wedgeColours(segments) {
    var live = [];
    for (var i = 0; i < segments.length; i++) {
      if (segments[i] > 0 && live.indexOf(segments[i]) < 0) live.push(segments[i]);
    }
    live.sort(function (a, b) { return a - b; });
    var span = Math.max(1, live.length - 1);
    return segments.map(function (m, i) {
      if (!m) return 'rgba(255,255,255,' + (i % 2 ? '.05' : '.09') + ')';
      return 'rgba(232,137,90,' + (0.28 + 0.62 * (live.indexOf(m) / span)).toFixed(2) + ')';
    });
  }
  function segAngle(st) { return 360 / ((st && st.slots) || 28); }
  // The wedges, plus (once the wheel has stopped) one more layer that lights the segment it stopped
  // on. The lit layer goes first, so it paints over the wedge underneath it
  function faceCss(st, w, stop) {
    var seg = segAngle(st), cols = wedgeColours(w.segments), from = (-seg / 2).toFixed(4), parts = [];
    for (var i = 0; i < w.segments.length; i++) {
      parts.push(cols[i] + ' ' + (i * seg).toFixed(4) + 'deg ' + ((i + 1) * seg).toFixed(4) + 'deg');
    }
    var base = 'conic-gradient(from ' + from + 'deg,' + parts.join(',') + ')';
    if (stop == null) return base;
    var a = (stop * seg).toFixed(4), b = ((stop + 1) * seg).toFixed(4);
    return 'conic-gradient(from ' + from + 'deg,rgba(0,0,0,0) 0deg ' + a + 'deg,#e8895a ' + a
      + 'deg ' + b + 'deg,rgba(0,0,0,0) ' + b + 'deg 360deg),' + base;
  }
  // WHERE THE WHEEL RESTS WHEN NOTHING HAS HAPPENED: with its QUIETEST segment under the pointer.
  // Parking a big multiplier at twelve o'clock makes the pointer and the wedge read as one arrow,
  // and the wild wheel's own first segment is its 20x, so this is not a hypothetical
  function homeStop(w) {
    var best = 0;
    for (var i = 1; i < w.segments.length; i++) if (w.segments[i] < w.segments[best]) best = i;
    return best;
  }
  function spinWord(st, w, stop) {
    if (stop == null) return w ? w.name + ' wheel, ' + w.segments.length + ' segments' : 'Wheel';
    return 'Stopped on segment ' + (stop + 1) + ' of ' + w.segments.length
      + ', ' + (w.segments[stop] ? xText(st.mult) : 'nothing');
  }
  // The wheel at rest. `turn` is false when nothing should be animated: a redraw, a broadcast, or a
  // walk back into the screen must not spin a wheel that has already stopped
  function drawFace(st, stop, turn) {
    var face = el('whFace'), w = wheelOf(st); if (!face || !w) return;
    var at = stop == null ? homeStop(w) : stop;
    face.style.background = faceCss(st, w, stop);
    face.setAttribute('aria-label', spinWord(st, w, stop));
    face.classList.toggle('turning', !!turn);   // no class, no transition, so this lands at once
    if (turn) wh.spins += 1; else wh.spins = 0;
    face.style.transform = 'rotate(' + (-(wh.spins * TURNS * 360 + at * segAngle(st))).toFixed(4) + 'deg)';
  }
  // The legend: every live multiplier the host listed, then the dead segments. The chances are
  // num/den exactly as sent, NEVER divided into a percentage: wheel.js hands them over that way on
  // purpose, because a rounded percent beside an exact table is a table nobody trusts
  // `stop` is the segment to light the row of, or null for none: the row lights WITH the chip, not
  // when the state arrives, so it is passed in rather than read off the phase
  function drawKey(st, stop) {
    var box = el('whKey'), w = wheelOf(st); if (!box) return;
    if (!w) { box.innerHTML = ''; return; }
    var cols = wedgeColours(w.segments), out = '';
    var hitMult = stop != null ? w.segments[stop] : null;
    for (var i = 0; i < w.legend.length; i++) {
      var row = w.legend[i];
      if (!row.mult) continue;
      var swatch = cols[w.segments.indexOf(row.mult)];
      out += '<div class="wh-row' + (hitMult === row.mult ? ' on' : '') + '">'
        + '<i style="background:' + swatch + '"></i><b>' + CUC.esc(xText(row.mult)) + '</b>'
        + '<span>' + fmtInt(row.chance.num) + ' of ' + fmtInt(row.chance.den) + '</span></div>';
    }
    if (w.dead.num) {
      out += '<div class="wh-row dead' + (hitMult === 0 ? ' on' : '') + '">'
        + '<i style="background:' + cols[w.segments.indexOf(0)] + '"></i><b>nothing</b>'
        + '<span>' + fmtInt(w.dead.num) + ' of ' + fmtInt(w.dead.den) + '</span></div>';
    }
    box.innerHTML = out;
  }

  // --- the line, the folded table and what is read out ----------------------------------------

  // The host's own `mult` (the payout over the bet), formatted and never recomputed, which is the
  // floor's CUC.xMult: the plinko board prints its cups the same way
  var xText = CUC.xMult;
  function whLine(st, pop) {
    var line = el('whLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase !== 'done') { line.innerHTML = CUC.pot(st.bet, false); return; }
    var net = st.net || 0;
    var cls = net > 0 ? ' win' : net < 0 ? ' lose' : '';
    line.innerHTML = CUC.pot(st.pay, false)
      + '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + CUC.esc(xText(st.mult)) + '</span>';
  }
  // What the house keeps, exactly, and the fact that picking a wheel cannot improve it. Folded,
  // because it is the same on all three and a constant on the felt is self-commentary
  function whPays(st) {
    var box = el('whPays'), w = wheelOf(st); if (!box) return;
    if (!w) { box.innerHTML = ''; return; }
    box.innerHTML = 'Every wheel pays back ' + fmtInt(w.rtp.num) + ' of every ' + fmtInt(w.rtp.den)
      + ' staked, so which one you pick changes the shape and not the edge.';
  }
  function whAnnounce(st) {
    if (!st) return;
    var w = wheelOf(st);
    if (st.phase === 'done') {
      CUC.live('whLive', spinWord(st, w, st.stop) + '. Pays ' + fmtInt(st.pay || 0) + '. '
        + signed(st.net || 0) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
      return;
    }
    CUC.live('whLive', 'Bet ' + fmtInt(st.bet) + ' placed on the ' + (w ? w.name : '') + ' wheel. Spin it.');
  }

  // --- controls ------------------------------------------------------------------------------

  function whControls(st, locked) {
    var live = !!(st && st.phase === 'spin');
    var bet = el('whBet'), play = el('whPlay');
    if (bet) bet.hidden = live;
    if (play) play.hidden = !live;
    var spin = document.querySelector('#whPlay [data-op="spin"]');
    if (spin) spin.disabled = locked || !(st && st.can && st.can.spin);
    // the wheel can still be swapped while the bet is on the table, because the engine takes the
    // choice at the spin and not at the deal
    drawRisks(st, locked);
    whPays(st);
    if (!live) CUC.renderStakes(SU, locked);
  }
  function whFocusAfter() {
    if (CUC.current() !== 'wheel') return;
    var live = wh.st && wh.st.phase === 'spin';
    var swapped = wh.phase != null && live !== (wh.phase === 'spin');
    wh.phase = wh.st ? wh.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-wheel');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!wh.wantFocus && !swapped && !lost) return;
    wh.wantFocus = false;
    var target = live ? document.querySelector('#whPlay [data-op="spin"]') : el('whDeal');
    if (target && !target.disabled) target.focus();
  }

  function whSend(op, extra) {
    if (wh.busy) return;
    wh.busy = true; wh.op = op;
    if (op !== 'open') whControls(wh.st, true);
    wh.n = CUC.post('wh', op, extra);
    clearTimeout(wh.to);
    wh.to = setTimeout(function () {
      wh.busy = false; wh.op = null;
      CUC.err('whErr', 'The wheel didn’t respond. Try again.');
      whControls(wh.st, false);
    }, WH_T.noReply);
  }

  // The wheel turns first and the figure follows it: a multiple that landed before the wheel did
  // would be the answer arriving ahead of the spin
  function whReceive(m) {
    var current = wh.op != null && m.n === wh.n;
    if (!current && wh.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('wh', m);
    if (!m.state) { var awaited = current; wh.op = null; return whFault(m, awaited); }
    var op = current ? wh.op : null;
    clearTimeout(wh.to); wh.timers.clear();
    wh.op = null; wh.st = m.state;
    if (wh.st.risk) wh.risk = wh.st.risk;   // the wheel the host really spun
    // spun: the reply to a press the player just made. A refused spin changed nothing, and a reply
    // nobody asked for is a spin this screen is being told about rather than one it turned, so both
    // are drawn where they stand: turning either would spin the same wheel a second time
    var spun = current && op === 'spin' && !m.error && wh.st.phase === 'done';
    var fresh = spun && !CUC.reduceMotion();
    try {
      CUC.err('whErr', m.error || '');
      var stop = wh.st.phase === 'done' ? wh.st.stop : null;
      drawFace(wh.st, stop, fresh);
      drawKey(wh.st, fresh ? null : stop);   // while it is turning, no row is lit yet
      if (!fresh) whLine(wh.st, spun);
      whControls(wh.st, true);
    } finally {
      CUC.hold();   // the header waits for the wheel
      if (fresh) wh.timers.at(WH_T.chip, function () { drawKey(wh.st, wh.st.stop); whLine(wh.st, true); });
      wh.timers.at(fresh ? WH_T.chip : 0, function () { whSettle(m, current && !m.error && op !== 'open'); });
    }
  }
  // A reply with no state: the host could not describe the round (games/README.md, section 5). The
  // reason shows and the wheel stays exactly where it is, because it is the describing that failed
  // and not the spin. wh.st is kept, so the next redraw is still drawn against the host's own round
  function whFault(m, awaited) {
    CUC.err('whErr', m.error || 'The wheel could not be shown. Try again.');
    if (!awaited) return;
    wh.busy = false;
    clearTimeout(wh.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    whControls(wh.st, false);
    whFocusAfter();
  }
  function whSettle(m, acted) {
    wh.busy = false;
    try {
      CUC.settle(m);
      if (acted) whAnnounce(wh.st);   // after the balance, so it can say where it landed
    } finally {
      whControls(wh.st, false);
      whFocusAfter();
    }
  }

  CUC.game('wheel', {
    key: 'wh',
    cls: 'wh',
    markup: markup,
    init: function () {
      whLine(null);
      // Picking a stake does not redraw the line: renderStakes writes the figure straight into the
      // preview (ui.preview), and when the line is holding a result that is the last thing that
      // happened. Redrawing it would also replace the chip a millisecond after it popped
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, wh.busy); });
      el('whRiskBox').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-risk]') : null; if (!b || b.disabled) return;
        wh.risk = b.getAttribute('data-risk');
        var s = CUC.state() || {}; s[RISK_KEY] = wh.risk; CUC.setState(s);
        // the wheel the player is about to spin, at rest. A finished spin belongs to the wheel it
        // was spun ON, so a different wheel shows no stopped segment and no lit row: the figure in
        // the line stays, because that is what the balance did
        drawFace(wh.st, null, false);
        drawKey(wh.st, null);
        drawRisks(wh.st, wh.busy);
        whPays(wh.st);
        var d = document.querySelector('#whPlay [data-op="spin"]');
        var next = (d && !d.hidden && !d.disabled) ? d : el('whDeal');
        if (next && !next.disabled) next.focus();
      });
      el('whDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        whSend('deal', { bet: bet });
      });
      el('whPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
        whSend('spin', { risk: risk(wh.st) });
      });
      CUC.why('whWhy', 'whPays');
    },
    enter: function () { wh.wantFocus = true; whControls(wh.st, true); whSend('open'); },
    leave: function () {
      wh.timers.clear();
      clearTimeout(wh.to);
      wh.busy = false; wh.op = null;
    },
    receive: whReceive,
    // a credit minted while the bet row is up lights the chips at once. The line is left alone for
    // the reason in init()
    credits: function () { if (!wh.busy) whControls(wh.st, false); },
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#whPlay', k === 's' ? 'spin' : null, 'whDeal', 'whBet');
    }
  });
})();
