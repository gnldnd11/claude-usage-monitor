// The wheel's screen: where did it stop? And before it turns, how wide is the slice worth hoping
// for?
//
// A WHEEL IS DRAWN AS A CIRCLE because the whole point of this game is that it can be read before
// the bet: every slice public, and the only secret is where it stops. Flattened into a bar it
// would be a lie about the object.
//
// THE FIGURES ARE ON THE DIAL. The host sends each slice its own `from`, `span`, `mid` and `label`,
// so this screen works out no angle and names no multiplier: it lays the label the host wrote along
// the arc the host measured. The labels live INSIDE `.wh-face`, which is the element the spin
// rotates, so they turn with the wheel instead of being re-placed frame by frame.
//
// They are laid along the arc rather than out along the radius, and that is the one piece of this
// screen worth defending. A wheel rests with the stopped slice at twelve o'clock, so a label laid
// along the arc is EXACTLY UPRIGHT at the moment anyone reads it, every time, on every wheel. Laid
// along the radius it would be side-on at that moment instead. The price is that the slices at the
// bottom of the dial are upside down, which is what a prize wheel looks like.
//
// `stop` is null while the round is live, which is the one thing the host keeps back: a screen that
// knew the segment before it animated getting there would be animating a result it already had.
//
// AND THE SCREEN DOES NOT PAINT THE STOP IT WAS SENT UNTIL THE WHEEL HAS GOT THERE. The host keeps
// the slice back until the spin is over, but once it arrives this panel held three copies of the
// answer from the first frame of the turn: the stopped wedge solid ember (the brightest thing on
// the dial, 6.06:1 against a dead one), that slice's own figure inverted, and an aria-label already
// reading "Stopped on slice N". All three went round with the wheel. The one question this game
// asks is where it will stop, so all three now land together at WH_T.stop and not before.
//
// Two presses, and that is the engine's shape rather than a stutter: Deal puts the bet on the table
// (it is held from the other games from that moment) and Spin turns the wheel WITH the chosen
// wheel, because that choice is part of the move (see games/wheel/meta.js).
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The wheel takes 1,800 to stop and the figure follows it (docs/game-panels.md, section 6).
  // `stop` is also the 1.8s on `.wh-face.turning` and on the labels' own keyframes in
  // games/wheel/meta.js, and the easing there is what makes these three numbers mean anything:
  // cubic-bezier(.12,.01,.2,1) ACCELERATES for the first 191ms (to 1,801 deg/s, five turns a
  // second) and spends the rest slowing down. The old curve, (.17,.67,.2,1), was at its fastest at
  // t=0, so the dial teleported out of a standstill instead of being set going.
  var WH_T = { stop: 1800, chip: 1900, noReply: 4000 };
  var TURNS = 3;   // whole turns before it settles, so a short hop and a long one look the same
  // How far out the figures sit, on a dial 150px across (radius 75). Measured rather than chosen:
  // the widest label on any wheel is ×12 at 17.98px of ink at 10.5px/700, and in a 12px line box
  // centred here its inner corners stand 10.2deg off the slice middle. The narrowest slice the
  // engine will build is 24deg (wheel.js, MIN_UNITS), so every label clears its own edges by 1.8deg
  var WH_R = 56;

  var wh = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, risk: null, phase: null, angle: 0 };
  var SU = CUC.stakeUi('wh');
  var RISK_KEY = 'whRisk';   // the chosen wheel, remembered the way the stakes remember theirs

  // --- the wheel -----------------------------------------------------------------------------

  function markup() {
    return CUC.frame('wheel')
      + '<div class="bj-felt">'
      +   '<div class="gm-plate tight">'
      +     '<div class="wh-dial">'
      +       '<div class="wh-face" id="whFace" role="img" aria-label="Wheel">'
      +         '<div class="wh-nums" id="whNums" aria-hidden="true"></div>'
      +       '</div>'
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

  // ONE COLOUR, IN DEPTHS. Ember is the only accent this casino has, so a live slice is ember at a
  // depth set by its rank among that wheel's own multipliers: proportion would make the wild
  // wheel's ×12 the only visible thing on it. A dead slice is two near-identical darks,
  // alternating, which is what keeps a run of dead slices from reading as one solid wedge.
  // Ranked on `halves`, the host's own whole number, so no float orders the palette
  function wedgeColours(segments) {
    var live = [];
    for (var i = 0; i < segments.length; i++) {
      if (segments[i].halves > 0 && live.indexOf(segments[i].halves) < 0) live.push(segments[i].halves);
    }
    live.sort(function (a, b) { return a - b; });
    var span = Math.max(1, live.length - 1);
    return segments.map(function (s, i) {
      if (!s.halves) return 'rgba(255,255,255,' + (i % 2 ? '.05' : '.09') + ')';
      return 'rgba(232,137,90,' + (0.28 + 0.62 * (live.indexOf(s.halves) / span)).toFixed(2) + ')';
    });
  }
  // The wedges, plus (once the wheel has stopped) one more layer that lights the slice it stopped
  // on. The lit layer goes first, so it paints over the wedge underneath it.
  // Every angle is the host's own `from`/`span`, in whole degrees
  function faceCss(w, stop) {
    var cols = wedgeColours(w.segments), parts = [];
    for (var i = 0; i < w.segments.length; i++) {
      var s = w.segments[i];
      parts.push(cols[i] + ' ' + s.from + 'deg ' + (s.from + s.span) + 'deg');
    }
    var base = 'conic-gradient(from 0deg,' + parts.join(',') + ')';
    if (stop == null) return base;
    var hit = w.segments[stop], a = hit.from, b = hit.from + hit.span;
    return 'conic-gradient(from 0deg,rgba(0,0,0,0) 0deg ' + a + 'deg,#e8895a ' + a
      + 'deg ' + b + 'deg,rgba(0,0,0,0) ' + b + 'deg 360deg),' + base;
  }
  // The figures, laid along the arc of their own slice. The label is the host's string and the
  // angle is the host's `mid`: this only turns the box.
  // `rotate(mid) translateY(-WH_R)` with nothing after it is what makes the stopped slice upright,
  // because the wheel is turned by -mid to bring that slice to the pointer and the two cancel
  function drawNums(w, stop) {
    var box = el('whNums'); if (!box) return;
    var out = '';
    for (var i = 0; i < w.segments.length; i++) {
      var s = w.segments[i];
      out += '<i class="wh-num' + (s.dead ? ' dead' : '') + (stop === i ? ' on' : '')
        + '" style="transform:rotate(' + s.mid + 'deg) translateY(-' + WH_R + 'px)">'
        + CUC.esc(s.label) + '</i>';
    }
    box.innerHTML = out;
  }
  // WHERE THE WHEEL RESTS WHEN NOTHING HAS HAPPENED: with its QUIETEST slice under the pointer.
  // Parking a big multiplier at twelve o'clock makes the pointer and the wedge read as one arrow,
  // and that is what the wheel tile in games/tiles.js actually did
  function homeStop(w) {
    var best = 0;
    for (var i = 1; i < w.segments.length; i++) if (w.segments[i].halves < w.segments[best].halves) best = i;
    return best;
  }
  function spinWord(st, w, stop, turning) {
    if (!w) return 'Wheel';
    if (stop == null) return w.name + ' wheel, ' + w.segments.length + ' slices' + (turning ? ', spinning' : '');
    return 'Stopped on slice ' + (stop + 1) + ' of ' + w.segments.length
      + ', ' + (w.segments[stop].dead ? 'nothing' : st.label);
  }
  // HOW FAR THE DIAL TURNS, which is not the same question as where it ends up. The slice under the
  // pointer is whichever one's own `mid` the angle cancels, so any angle congruent to -mid will do
  // and the one chosen decides how fast the wheel went. Taking -mid outright, the way this used to,
  // made the distance depend on the SIZE of the new slice's angle: 744deg to 1,416deg over the
  // three wheels, a 1.9x spread in peak speed for one duration. Always going FORWARDS by whole
  // turns plus the gap to the new slice narrows that to 1,080-1,428 (1.33x) and makes every spin a
  // forward spin, which is what a wheel does.
  function angleFor(w, at, turn) {
    var mid = w.segments[at].mid;
    if (!turn) return -mid;   // nothing is animating, so the angle may simply be set
    var from = (((-wh.angle) % 360) + 360) % 360;
    return wh.angle - (TURNS * 360 + ((((mid - from) % 360) + 360) % 360));
  }
  // The wheel at rest. `turn` is false when nothing should be animated: a redraw, a broadcast, or a
  // walk back into the screen must not spin a wheel that has already stopped.
  //
  // WHILE IT TURNS, `stop` IS WITHHELD FROM THE DIAL as well as from the host. The wedge, the
  // figure and the aria-label are the three places the answer can show, and lightStop() is the one
  // place any of them is allowed to show it
  function drawFace(st, stop, turn) {
    var face = el('whFace'), w = wheelOf(st); if (!face || !w) return;
    var at = stop == null ? homeStop(w) : stop;
    var show = turn ? null : stop;
    face.style.background = faceCss(w, show);
    face.setAttribute('aria-label', spinWord(st, w, show, turn));
    drawNums(w, show);   // the lit label goes dark WITH its wedge, or it vanishes into the ember
    // off and on again rather than toggled: re-adding a class that is already there restarts
    // nothing, so a second turn with no resting draw between would get no transition and no label
    // fade. The read is what commits the angle it is leaving from
    face.classList.remove('turning');
    if (turn) { void face.offsetHeight; face.classList.add('turning'); }
    wh.angle = angleFor(w, at, turn);
    face.style.transform = 'rotate(' + wh.angle + 'deg)';
  }
  // THE ANSWER, LANDED, and the only place it is painted. Called at WH_T.stop, which is where the
  // dial itself arrives, so the lit wedge, the darkened figure and the slice's name appear at the
  // moment the wheel settles rather than riding round on it. The angle and the transition are left
  // exactly as they are: this says what came up, it does not move anything
  function lightStop(st) {
    var face = el('whFace'), w = wheelOf(st);
    if (!face || !w || !st || st.phase !== 'done' || st.stop == null) return;
    face.style.background = faceCss(w, st.stop);
    face.setAttribute('aria-label', spinWord(st, w, st.stop, false));
    drawNums(w, st.stop);
  }
  // The legend. The dial already carries the figures, so this is the OTHER half of the question:
  // how much of the wheel each figure is. The chances are num/den exactly as sent, NEVER divided
  // into a percentage: wheel.js hands them over that way on purpose, because a rounded percent
  // beside an exact table is a table nobody trusts.
  // `stop` is the slice to light the row of, or null for none: the row lights WITH the chip, not
  // when the state arrives, so it is passed in rather than read off the phase
  function drawKey(st, stop) {
    var box = el('whKey'), w = wheelOf(st); if (!box) return;
    if (!w) { box.innerHTML = ''; return; }
    var cols = wedgeColours(w.segments), out = '';
    var hit = stop != null ? w.segments[stop].halves : null;
    function swatchOf(halves) {
      for (var j = 0; j < w.segments.length; j++) if (w.segments[j].halves === halves) return cols[j];
      return cols[0];
    }
    for (var i = 0; i < w.legend.length; i++) {
      var row = w.legend[i], dead = row.halves === 0;
      out += '<div class="wh-row' + (dead ? ' dead' : '') + (hit === row.halves ? ' on' : '') + '">'
        + '<i style="background:' + swatchOf(row.halves) + '"></i>'
        + '<b>' + CUC.esc(dead ? 'nothing' : row.label) + '</b>'
        + '<span>' + fmtInt(row.chance.num) + ' of ' + fmtInt(row.chance.den) + '</span></div>';
    }
    box.innerHTML = out;
  }

  // --- the line, the folded table and what is read out ----------------------------------------

  // The chip says what the slice said. The host writes that string once (wheel.js, labelOf) and
  // reads it back out of the payout, so the figure on the dial, the figure on the line and the
  // credits the balance moved by are one thing. CUC.xMult is not used here for that reason: it
  // would turn a ÷2 slice into ×0.5 and the felt would be printing two names for one outcome
  function whLine(st, pop) {
    var line = el('whLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase !== 'done') { line.innerHTML = CUC.pot(st.bet, false); return; }
    var net = st.net || 0;
    var cls = net > 0 ? ' win' : net < 0 ? ' lose' : '';
    line.innerHTML = CUC.pot(st.pay, false)
      + '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + CUC.esc(st.label || '') + '</span>';
  }
  // What the house keeps, exactly, and the fact that picking a wheel cannot improve it. Folded,
  // because it is the same on all three and a constant on the felt is self-commentary
  function whPays(st) {
    var box = el('whPays'), w = wheelOf(st); if (!box) return;
    if (!w) { box.innerHTML = ''; return; }
    box.innerHTML = 'A slice is as likely as it is wide. Every wheel pays back ' + fmtInt(w.rtp.num)
      + ' of every ' + fmtInt(w.rtp.den) + ' staked, so which one you pick changes the shape and not the edge.';
  }
  function whAnnounce(st) {
    if (!st) return;
    var w = wheelOf(st);
    if (st.phase === 'done') {
      CUC.live('whLive', spinWord(st, w, st.stop, false) + '. Pays ' + fmtInt(st.pay || 0) + '. '
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
      if (fresh) {
        // the dial arrives, and only then does the dial say where
        wh.timers.at(WH_T.stop, function () { lightStop(wh.st); });
        wh.timers.at(WH_T.chip, function () { drawKey(wh.st, wh.st.stop); whLine(wh.st, true); });
      }
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
