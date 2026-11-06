// Crash's screen: two questions in one number. Before the launch it answers "where am I getting
// out", and after it, "where did it burst". It is the same figure in the same place on purpose.
//
// This screen is a REPLAY and not a live game (crash.js's header says why), so it has no mid-round
// control: a cash-out button would be the screen lying about what the game is. The target is named
// with the slider before the launch, and the price of that target is the host's to say. While the
// slider is being dragged the old price goes quiet rather than being recomputed here.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // rise is FIXED at 1,400ms whatever the burst point is: a climb that takes longer for a bigger
  // multiple gives the answer away before it arrives. steps is how many frames that climb is cut
  // into, burst/instant are the two ways a round ends, and chip is the beat the money lands on
  // after either of them (docs/game-panels.md, section 6).
  //
  // 1,400 rather than 720: the climb is the third kind of pacing, the kind that NARROWS, and 720ms
  // spent the player's own tension to obey a rule written for pacing that reveals in one go. The
  // round still settles at 1,740, inside the 2,000ms a round may take. The 70ms-a-step floor does
  // not apply to the climb: it is one number changing continuously, not a sequence of events, so
  // 36 frames at 39ms is smooth rather than mushy. `instant` reveals in one go and keeps its 220
  var CR_T = { rise: 1400, steps: 36, burst: 220, instant: 220, chip: 120, aim: 120, noReply: 4000 };

  var cr = { st: null, set: false, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, aimTo: null, wantFocus: false, phase: null };
  var SU = CUC.stakeUi('cr');

  // --- numbers, as the host sent them -----------------------------------------------------------

  // Hundredths to a printed multiple, in integer arithmetic. The engine reads the figure it judges
  // the round against back OUT of the payout it will really pay (crash.js's barFor), so this only
  // moves the decimal point. Above 100x the decimals go: the hero number has to stay inside the
  // 152px felt, and the cap is 1000.00x
  function mult(m100) {
    if (m100 == null) return '';
    if (m100 >= 10000) return '×' + Math.floor(m100 / 100);
    return '×' + Math.floor(m100 / 100) + '.' + ('0' + (m100 % 100)).slice(-2);
  }
  // The one place this screen divides, and it is a change of unit rather than a price: the ratio is
  // the host's (`chance`, two whole numbers out of a million draws) and only its form is chosen
  // here. Printed as it arrives it would read "79000/1000000", which is a figure nobody can use
  function pct(c) {
    if (!c || !(c.den > 0)) return '';
    var t = Math.round(1000 * c.num / c.den);
    return Math.floor(t / 10) + '.' + (t % 10) + '%';
  }
  // Where a multiple sits on the dial, 0 to 1. The slider is linear in tenths, so the bar is too
  // and the notch lands under the thumb
  function frac(st, v100) {
    var r = st && st.range;
    if (!r || !(r.maxTicks > r.minTicks)) return 0;
    return Math.max(0, Math.min(1, (v100 / r.per - r.minTicks) / (r.maxTicks - r.minTicks)));
  }

  // --- the dial ---------------------------------------------------------------------------------

  function range(st) { return (st && st.range) || { minTicks: 11, maxTicks: 500, step: 1, per: 10 }; }
  function ticks() {
    var s = el('crSlide');
    var v = s ? Number(s.value) : NaN;
    return Number.isFinite(v) ? Math.round(v) : range(cr.st).minTicks;
  }
  // The slider's own bounds come from the host, and the value it opens on is the one the webview
  // remembered, the way the stakes remember theirs
  function slider(st, locked) {
    var s = el('crSlide'); if (!s) return;
    var r = range(st);
    s.setAttribute('min', String(r.minTicks));
    s.setAttribute('max', String(r.maxTicks));
    s.setAttribute('step', String(r.step || 1));
    var now = Number(s.value);
    var ok = function (v) { return Number.isFinite(v) && v >= r.minTicks && v <= r.maxTicks; };
    if (!cr.set) {
      // the remembered target wins once, when the screen is first drawn, and after that the thumb
      // is the player's: a reply must never drag it back under their hand
      var want = Number(CUC.state().crTicks);
      now = ok(want) ? want : ((st && st.ticks) || (ok(now) ? now : r.minTicks));
      s.value = String(now);
      if (st) cr.set = true;      // only once the host has said what the dial's bounds are
    } else if (!ok(now)) {
      now = Math.max(r.minTicks, Math.min(r.maxTicks, Number.isFinite(now) ? now : r.minTicks));
      s.value = String(now);
    }
    s.disabled = !!locked;
    s.setAttribute('aria-valuetext', mult(now * r.per));
  }
  // WHAT THE BIG NUMBER IS. One figure in one place means the target before the launch and where it
  // burst after it, and until this line was written nothing on the screen said which one was up: the
  // bet screen was a 34px number, an empty bar and an unlabelled slider. The decision to spend one
  // place on two meanings is the reason this line exists, not an extra sentence beside it
  // (docs/game-panels.md, 5-3)
  function cap(st) {
    var e = el('crCap'); if (!e) return;
    e.textContent = (st && st.phase === 'done') ? 'Burst at' : 'Cash out at';
  }
  // The hero number and the bar under it. `k` is '', 'won' or 'lost', and `burst` flashes it
  function dial(st, v100, k, burst) {
    var n = el('crNum'), f = el('crFill');
    if (n) n.className = 'cr-num' + (k ? ' ' + k : '') + (burst ? ' burst' : '');
    if (n) n.textContent = mult(v100);
    if (f) f.style.width = (frac(st, v100) * 100).toFixed(2) + '%';
  }
  // The notch: the order the player has standing, which the climb either passes or does not
  function notch(st, v100) {
    var m = el('crMark'); if (!m) return;
    m.style.left = 'calc(' + (frac(st, v100) * 100).toFixed(2) + '% - 1px)';
  }
  // What a win pays and how often it comes in, both the host's. `stale` is a drag in progress: the
  // figures on screen are the price of a target that is no longer the one selected
  function pays(st, stale, show) {
    var e = el('crPays'); if (!e) return;
    e.classList.toggle('stale', !!stale);
    if (!show || !st || st.payout == null) { e.textContent = ''; return; }
    e.textContent = 'Pays ' + fmtInt(st.payout) + ' · ' + pct(st.chance);
  }

  // --- the line and the read-out ----------------------------------------------------------------

  var CR_END = { cashed: ['win', 'Cashed'], busted: ['lose', 'Busted'] };
  function line(st) {
    var e = el('crLine'); if (!e) return;
    if (!st || st.phase === 'bet') { e.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase === 'done') {
      var v = CR_END[st.ended] || ['', 'Round over'];
      e.innerHTML = '<span class="bj-chip ' + v[0] + '">' + v[1] + ' ' + signed(st.net || 0) + '</span>';
      return;
    }
    e.innerHTML = CUC.pot(st.bet, false);
  }
  function announce(st) {
    if (!st) return;
    var said = [];
    if (st.phase === 'done') {
      said.push(st.instant ? 'Burst before 1.00' : 'Burst at ' + mult(st.at));
      said.push((CR_END[st.ended] || ['', 'Round over'])[1] + ' ' + signed(st.net || 0));
      said.push('Balance ' + fmtInt(CUC.balance() || 0));
    } else if (st.phase === 'arm') {
      said.push('Target ' + mult(st.bar100));
      said.push('Pays ' + fmtInt(st.payout));
      said.push(pct(st.chance));
    }
    CUC.live('crLive', said.join('. ') + '.');
  }

  // --- controls ---------------------------------------------------------------------------------

  function controls(st, locked) {
    var armed = !!(st && st.phase === 'arm'), can = (st && st.can) || {};
    var bet = el('crBet'), pl = el('crPlay');
    if (bet) bet.hidden = armed;
    if (pl) pl.hidden = !armed;
    var go = el('crLaunch');
    if (go) go.disabled = locked || !can.launch;
    slider(st, locked);
    if (!armed) CUC.renderStakes(SU, locked);
  }
  function lock() {
    var all = document.querySelectorAll('#crPlay [data-op], #crStakes button, #crSlide');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('crDeal'); if (d) d.disabled = true;
  }
  function focusAfter() {
    if (CUC.current() !== 'crash') return;
    var armed = cr.st && cr.st.phase === 'arm';
    var swapped = cr.phase != null && armed !== (cr.phase === 'arm');
    cr.phase = cr.st ? cr.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-crash');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!cr.wantFocus && !swapped && !lost) return;
    cr.wantFocus = false;
    var target = armed ? el('crLaunch') : el('crDeal');
    if (target && !target.disabled) target.focus();
  }

  // --- drawing a state that is not being paced --------------------------------------------------

  // Which figure the hero number carries, by phase:
  //  bet  the target the player has set, which is their own input and not a price
  //  arm  `bar100`, the multiple the payout really is and the one the burst is judged against
  //  done `at`, where it burst
  function draw(st) {
    var armed = !!(st && st.phase === 'arm'), done = !!(st && st.phase === 'done');
    cap(st);
    if (done) dial(st, st.instant ? 100 : st.at, st.won ? 'won' : 'lost', false);
    else dial(st, armed ? st.bar100 : ticks() * range(st).per, '', false);
    notch(st, armed || done ? st.bar100 : ticks() * range(st).per);
    pays(st, false, armed || done);
    line(st);
  }

  // --- the host ---------------------------------------------------------------------------------

  function send(op, extra) {
    if (cr.busy) return;
    cr.busy = true; cr.op = op;
    if (op !== 'open') lock();
    cr.n = CUC.post('cr', op, extra);
    clearTimeout(cr.to);
    cr.to = setTimeout(function () {
      cr.busy = false; cr.op = null;
      CUC.err('crErr', 'The table didn’t respond. Try again.');
      controls(cr.st, false);
    }, CR_T.noReply);
  }
  // One aim per drag rather than one per tenth: a slider dragged across the dial would otherwise
  // post four hundred messages. If a reply is still in flight the aim waits for it instead of
  // being dropped, or the host would be left holding a target the screen is not showing
  function aimSoon() {
    clearTimeout(cr.aimTo);
    cr.aimTo = setTimeout(function () {
      if (!cr.st || cr.st.phase !== 'arm') return;
      if (cr.busy) return aimSoon();
      if (cr.st.ticks === ticks()) return;
      send('aim', { ticks: ticks() });
    }, CR_T.aim);
  }

  function receive(m) {
    var current = cr.op != null && m.n === cr.n;
    if (!current && cr.op != null) return;     // an older reply while a newer request waits
    CUC.setHeld('cr', m);
    if (!m.state) { var awaited = current; cr.op = null; return fault(m, awaited); }
    var op = current ? cr.op : null;
    clearTimeout(cr.to); cr.timers.clear();
    cr.op = null; cr.st = m.state;
    // acted: the reply to the launch the player just asked for. Nothing else in this game has
    // anything to pace, and a refused launch changed nothing, so nothing moves for it either
    var acted = current && op === 'launch' && !m.error;
    var fresh = acted && !CUC.reduceMotion();
    var settleAt = 0;
    try {
      CUC.err('crErr', m.error || '');
      if (!fresh) { draw(cr.st); controls(cr.st, true); }
      else settleAt = paceLaunch(cr.st);
    } finally {
      CUC.hold();
      if (settleAt) cr.timers.at(settleAt, function () { line(cr.st); });
      cr.timers.at(settleAt, function () { settle(m, acted, op); });
    }
  }

  // The replay. The number climbs from 1.00 to where it burst over CR_T.rise, whatever that burst
  // point is, and the path between the two ends is geometric because that is the shape of the curve
  // the engine prices: 100 * (at/100)^(s/N). Both ends are the host's; only the way between them is
  // drawn here. The last step is set to `at` outright rather than left to the exponent's rounding.
  //
  // `instant` is the 3 in 100 that burst before 1.00x, which is the house's cut shown rather than
  // skimmed: the number never moves and goes red where it stands
  function paceLaunch(st) {
    cap(st);           // the round is settled before the replay starts, so this already reads "Burst at"
    notch(st, st.bar100);
    pays(st, false, true);
    if (st.instant) {
      dial(st, 100, '', false);
      cr.timers.at(CR_T.instant, function () { dial(st, 100, 'lost', true); });
      return CR_T.instant + CR_T.chip;
    }
    var at = st.at, N = CR_T.steps, step = CR_T.rise / N;
    dial(st, 100, '', false);
    for (var s = 1; s <= N; s++) {
      (function (i) {
        cr.timers.at(Math.round(i * step), function () {
          var v = i === N ? at : Math.max(100, Math.round(100 * Math.pow(at / 100, i / N)));
          // the order fills the moment the climb passes it, which is the one event in the replay
          // that is the player's rather than the table's
          dial(st, v, st.won && v >= st.bar100 ? 'won' : '', false);
        });
      })(s);
    }
    cr.timers.at(CR_T.rise, function () { dial(st, at, st.won ? 'won' : 'lost', true); });
    return CR_T.rise + CR_T.burst + CR_T.chip;
  }

  // A reply with no state: the host could not describe the round (games/README.md, section 5). The
  // reason shows and the number, the dial and the price stay exactly as they are, because the round
  // is still the host's and nothing about it was decided here. cr.st is therefore kept, so every
  // redraw after this one is still drawn against the round the host holds.
  //
  // awaited is false for a reply nobody asked for, and then any pacing already running is left to
  // finish: it belongs to a state this reply says nothing about
  function fault(m, awaited) {
    CUC.err('crErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    cr.busy = false;
    clearTimeout(cr.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    controls(cr.st, false);
    focusAfter();
  }
  function settle(m, acted, op) {
    cr.busy = false;
    try {
      CUC.settle(m);
      line(cr.st);
      // a deal or an aim has a new price to read out; a launch has a result
      if (acted || ((op === 'deal' || op === 'aim') && !m.error)) announce(cr.st);
    } finally {
      controls(cr.st, false);
      focusAfter();
    }
  }

  CUC.game('crash', {
    key: 'cr',
    cls: 'cr',
    markup: function () {
      return CUC.frame('crash')
        + '<div class="bj-felt">'
        // the number's own name, directly above it. aria-hidden with the number: the read-out
        // already says "Target x12.40" and "Burst at x12.40" in words (announce)
        +   '<div class="cr-cap" id="crCap" aria-hidden="true">Cash out at</div>'
        +   '<div class="cr-num" id="crNum" aria-hidden="true">×0.00</div>'
        +   '<div class="cr-bar" aria-hidden="true"><i class="cr-fill" id="crFill"></i><i class="cr-mark" id="crMark"></i></div>'
        +   '<div class="cr-pays" id="crPays"></div>'
        +   '<div class="hl-line" id="crLine"></div>'
        + '</div>'
        + '<div class="bj-sr" id="crLive" aria-live="polite"></div>'
        + '<div class="bj-note" id="crNote" hidden></div>'
        + '<div class="warnbar" id="crErr" hidden></div>'
        // 1.1x to 50.0x in tenths is 490 targets, so one slider and not a row of buttons
        + '<div class="cr-dial"><input type="range" class="cr-slide" id="crSlide" min="11" max="500" step="1" value="200"'
        +   ' aria-label="Target multiple" aria-valuetext="×2.00"></div>'
        + '<div class="bj-ctl" id="crBet">' + CUC.stakesHtml('cr')
        +   '<button type="button" class="bj-btn primary" id="crDeal" title="Deal (Enter)">Deal</button></div>'
        // one button, and never a cash-out: this is a replay, and a button to get out mid-round
        // would be the screen lying about the game (crash.js's header)
        + '<div class="bj-ctl" id="crPlay" hidden>'
        +   '<button type="button" class="bj-btn primary" data-op="launch" id="crLaunch" title="Launch (L)">Launch</button></div>';
    },
    init: function () {
      slider(null, false); draw(null);
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, cr.busy); });
      el('crDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        send('deal', { bet: bet, ticks: ticks() });
      });
      el('crPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null;
        if (!b || b.disabled) return;
        send(b.getAttribute('data-op'));
      });
      var s = el('crSlide');
      function moved() {
        var t = ticks(), r = range(cr.st);
        var st = CUC.state(); st.crTicks = t; CUC.setState(st);
        s.setAttribute('aria-valuetext', mult(t * r.per));
        // the target is the player's own input, so it shows at once. Its PRICE is the host's, so
        // the price on screen goes quiet until the aim comes back
        dial(cr.st, t * r.per, '', false);
        notch(cr.st, t * r.per);
        var armed = cr.st && cr.st.phase === 'arm';
        pays(cr.st, armed, armed);
        if (armed) aimSoon();
      }
      s.addEventListener('input', moved);
      s.addEventListener('change', moved);
    },
    enter: function () { cr.wantFocus = true; controls(cr.st, true); send('open'); },
    leave: function () { cr.timers.clear(); clearTimeout(cr.to); clearTimeout(cr.aimTo); cr.busy = false; cr.op = null; },
    receive: receive,
    credits: function () { if (!cr.busy) { CUC.renderStakes(SU, false); controls(cr.st, false); } },
    // A round can be finished on the keyboard alone: the slider takes the arrow keys natively,
    // L launches and Enter on the bet screen deals
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#crPlay', k === 'l' ? 'launch' : null, 'crDeal', 'crBet');
    }
  });
})();
