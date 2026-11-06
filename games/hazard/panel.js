// Hazard's screen: one more roll, or take it now?
//
// The host owns the faces and what the tray is worth (hazard.js). This screen draws two things and
// they are the whole game: THE FACE THAT JUST CAME UP, and THE TRAY THE PIPS PILE UP IN. A pip in
// the tray is a pip on the die, so the pile is in the same unit as the roll and a 1 empties it in
// one beat. That emptying is the game, which is why there is no sentence anywhere explaining it.
//
// The one number on the felt is `view().payout`, which is what banking RIGHT NOW pays. It is the
// host's arithmetic, and the pot in pips is never printed as a figure beside it: the tray IS that
// figure. `bankAt`, the pot the best play banks at, is on the wire and is deliberately nowhere on
// this screen: writing the answer down leaves nothing to decide (docs/game-panels.md, 5-14).
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // A roll that survived is a PRESS and has to be short: a round is as many of them as the player
  // dares, so 250ms is the ceiling (docs/game-panels.md, section 6, class 2). The roll that comes up
  // a 1 is not a press, it is the answer arriving, so the emptying and the chip get the slower
  // class-1 beats.
  // `face` is the .12s on `.hz-die.in .dc` and on `.hz-pip.in`, `empty` the .22s on
  // `.hz-tray.empty .hz-pip`, all in games/hazard/meta.js
  var HZ_T = { face: 120, pot: 180, empty: 220, chip: 420, cash: 200, noReply: 4000 };

  var hz = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false,
    phase: null, shown: 0 };
  // the table's floor. 100 closes the 10 chip, opens the screen on 100 and asks for 100 in the
  // short-purse note (webview.js, stakeUi)
  var SU = CUC.stakeUi('hz', { min: 100 });

  // Both dice are CUC.die(face, px): one <use> into the sprite html.js puts in the page. THE BODY
  // FOLLOWS THE CELL'S OWN color, which is this screen's doing: the warning die is the same drawing
  // in #f6836e, and a second set of six baked in the losing colour would be six drawings to keep in
  // step with the first six (games/dice-faces.js's header says so). 24 for the warning die and 48
  // for the rolled one are the two whole multiples of its 24-unit grid that are used.

  // --- markup ---------------------------------------------------------------------------------

  function markup() {
    return CUC.frame('hazard')
      + '<div class="bj-felt">'
      +   '<div class="hz-top">'
      +     '<div class="hz-die" id="hzDie" role="img" aria-label="No roll yet"></div>'
      +     '<div class="hz-pay" id="hzPay"></div>'
      +     '<div class="hz-bust" id="hzBust" role="img" aria-label="A 1 takes the tray"></div>'
      +   '</div>'
      +   '<div class="hz-tray" id="hzTray" role="img" aria-label="The tray is empty"></div>'
      +   '<div class="hl-line" id="hzLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="hzWhy" aria-expanded="false" aria-controls="hzPays">How it pays</button>'
      + '<div class="bj-pays" id="hzPays" hidden></div>'
      + '<div class="bj-sr" id="hzLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="hzNote" hidden></div>'
      + '<div class="warnbar" id="hzErr" hidden></div>'
      + '<div class="bj-ctl" id="hzBet">' + CUC.stakesHtml('hz')
      +   '<button type="button" class="bj-btn primary" id="hzDeal" title="Deal (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="hzPlay" hidden>'
      +   '<button type="button" class="bj-btn primary" data-op="roll" title="Roll (R)">Roll</button>'
      +   '<button type="button" class="bj-btn" data-op="bank" title="Cash out (C)">Cash out</button></div>';
  }

  // --- the felt ------------------------------------------------------------------------------

  function live(st) { return !!(st && st.phase === 'play'); }
  function lastFace(st) {
    var faces = (st && st.faces) || [];
    return faces.length ? faces[faces.length - 1] : 0;
  }
  // The face that just came up, or the unrolled die before the first roll. A blank die on the bet
  // screen is what makes the deal change the felt (docs/game-panels.md, 5-12 to 5-15)
  function drawDie(st, anim) {
    var e = el('hzDie'); if (!e) return;
    var f = lastFace(st);
    e.classList.remove('in');
    e.innerHTML = CUC.die(f, 48);
    if (anim && f) { void e.getBoundingClientRect(); e.classList.add('in'); }
    // the art is aria-hidden, so the cell carries the number
    e.setAttribute('aria-label', f ? 'Rolled ' + f : 'No roll yet');
  }
  // The warning die, in the losing colour. Drawn on the bet screen too, because the point of it is
  // to say which face ends a round BEFORE the first roll (section 3's named exception)
  function drawBust(st) {
    var e = el('hzBust'); if (!e) return;
    var f = (st && st.bust) || 1;
    e.innerHTML = CUC.die(f, 24);
    e.setAttribute('aria-label', 'A ' + f + ' takes the tray');
  }
  // One pip for each pip in the tray, which is `view().pot`: the host's own count, drawn rather than
  // printed. `grown` is how many were already there, so only the new ones are animated in
  function drawTray(st, grown) {
    var box = el('hzTray'); if (!box) return;
    var pot = (st && st.pot) || 0, out = '';
    for (var i = 0; i < pot; i++) out += '<i class="hz-pip' + (grown != null && i >= grown ? ' in' : '') + '"></i>';
    box.classList.remove('empty');
    box.innerHTML = out;
    box.setAttribute('aria-label', pot ? pot + ' in the tray' : 'The tray is empty');
    hz.shown = pot;
  }
  // What banking right now pays, or what it paid. The bet screen leaves the slot EMPTY rather than
  // showing a 0: nothing is riding yet, and a 0 there is a figure that means nothing (5-14)
  function drawPay(st) {
    var e = el('hzPay'); if (!e) return;
    var v = !st || st.phase === 'bet' ? null : (st.phase === 'done' ? st.paid : st.payout);
    var text = v ? fmtInt(v) : '';
    e.textContent = text;
    // THE ONE PLACE THIS SCREEN STEPS DOWN A SIZE, and it is measured rather than chosen. At sidebar
    // 250 the felt gives 152px and this slot gets 64 of it (48 of die, 24 of warning die, two 8px
    // gaps). Tabular digits at 22px run about 12.5px each, so '9,999' is 57px and fits while
    // '10,000' is 69 and does not. 16px is the next size section 2 allows and takes six digits to
    // 59. The figure only gets that long on a bet of 1,000 rolled past 85 pips
    e.classList.toggle('long', text.length >= 6);
  }

  // --- the line, the folded table and what is read out ----------------------------------------

  // The chip does NOT repeat what was banked: that figure is the 22px one above it, and at 10.5px
  // 'Tray full, banked 11,900 +10,900' is 165px against the felt's 152 at sidebar 250. A .bj-chip
  // is nowrap, so a chip that long overflows the line instead of folding onto it
  function verdict(st) {
    var net = st.net || 0;
    if (st.result === 'bust') return 'Rolled a 1 ' + signed(net);
    return (st.capped ? 'Tray full ' : 'Banked ') + signed(net);
  }
  function hzLine(st, pop) {
    var line = el('hzLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase !== 'done') { line.innerHTML = CUC.pot(st.bet, false); return; }
    var net = st.net || 0, cls = net > 0 ? ' win' : net < 0 ? ' lose' : '';
    line.innerHTML = '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + CUC.esc(verdict(st)) + '</span>';
  }
  // The rate, the floor, the cap and what the tray stands at as a multiple of the bet, all four the
  // host's own figures. `mult100` is folded rather than dropped: the 22px figure above is the money,
  // which is what the decision is made against, and the multiple is the same fact read the other
  // way (section 5: folded is where a figure goes when the next move can be made without it).
  //
  // `bankAt` is on the wire and is NOT here, folded or otherwise. It is the answer to the only
  // question this game asks, and writing it down anywhere leaves nothing to choose (5-14)
  function hzPays(st) {
    var box = el('hzPays'); if (!box) return;
    if (!st || !st.rate) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="hz-pay-row">A pip in the tray is worth ' + fmtInt(st.rate.num)
      + ' of every ' + fmtInt(st.rate.den) + ' staked.</div>'
      + '<div class="hz-pay-row">Banking pays more than the bet from ' + fmtInt(st.breakEven)
      + ' pips up, and the tray banks itself at ' + fmtInt(st.potCap) + '.</div>'
      + (st.mult100 ? '<div class="hz-pay-row">The tray stands at '
        + CUC.esc(CUC.xMult100(st.mult100)) + ' of the bet.</div>' : '');
  }
  function hzAnnounce(st, op) {
    if (!st) return;
    var said = [];
    if (st.phase === 'done') {
      if (st.result === 'bust') said.push('Rolled a 1. The tray is empty');
      else if (op === 'bank') said.push('Banked ' + fmtInt(st.paid || 0));
      else said.push('The tray is full and banked itself at ' + fmtInt(st.paid || 0));
      said.push(signed(st.net || 0));
      said.push('Balance ' + fmtInt(CUC.balance() || 0));
    } else {
      said.push('Rolled ' + lastFace(st));
      said.push(fmtInt(st.pot) + ' in the tray, worth ' + fmtInt(st.payout));
    }
    CUC.live('hzLive', said.join('. ') + '.');
  }

  // --- controls -------------------------------------------------------------------------------

  function hzControls(st, locked) {
    var playing = live(st), can = (st && st.can) || {};
    var bet = el('hzBet'), play = el('hzPlay');
    if (bet) bet.hidden = playing;
    if (play) play.hidden = !playing;
    var ops = document.querySelectorAll('#hzPlay [data-op]');
    for (var i = 0; i < ops.length; i++) {
      ops[i].disabled = locked || !can[ops[i].getAttribute('data-op')];
    }
    hzPays(st);
    if (!playing) CUC.renderStakes(SU, locked);
  }
  function hzFocusAfter() {
    if (CUC.current() !== 'hazard') return;
    var playing = live(hz.st);
    var swapped = hz.phase != null && playing !== (hz.phase === 'play');
    hz.phase = hz.st ? hz.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-hazard');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!hz.wantFocus && !swapped && !lost) return;
    hz.wantFocus = false;
    var target = playing ? document.querySelector('#hzPlay [data-op="roll"]') : el('hzDeal');
    if (target && !target.disabled) target.focus();
  }

  function hzSend(op, extra) {
    if (hz.busy) return;
    hz.busy = true; hz.op = op;
    if (op !== 'open') hzControls(hz.st, true);
    hz.n = CUC.post('hz', op, extra);
    clearTimeout(hz.to);
    hz.to = setTimeout(function () {
      hz.busy = false; hz.op = null;
      CUC.err('hzErr', 'The table didn’t respond. Try again.');
      hzControls(hz.st, false);
    }, HZ_T.noReply);
  }

  // The face comes up first, then what it did to the tray: a figure that moved before the die did
  // would be the roll arriving after its own result
  function hzReceive(m) {
    var current = hz.op != null && m.n === hz.n;
    if (!current && hz.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('hz', m);
    if (!m.state) { var awaited = current; hz.op = null; return hzFault(m, awaited); }
    var op = current ? hz.op : null;
    clearTimeout(hz.to); hz.timers.clear();
    hz.op = null;
    var was = hz.shown;              // the pips already in the tray, so only the new ones animate
    hz.st = m.state;
    // played: the reply to a press the player just made. A refused move changed nothing, and a
    // reply nobody asked for is a round this screen is being told about rather than one it rolled,
    // so both are drawn where they stand
    var played = current && op !== 'open' && !m.error;
    var fresh = played && !CUC.reduceMotion();
    var busted = hz.st.phase === 'done' && hz.st.result === 'bust';
    var rolled = op === 'deal' || op === 'roll';
    try {
      CUC.err('hzErr', m.error || '');
      drawBust(hz.st);
      if (!fresh) {
        drawDie(hz.st, false); drawTray(hz.st, null); drawPay(hz.st); hzLine(hz.st, played);
      } else if (rolled) {
        // the die and the tray are left as they were: the face lands at HZ_T.face
        if (busted) el('hzTray').classList.add('empty');
      } else {
        drawDie(hz.st, false);   // banking does not roll, so the face stays where it is
      }
      hzControls(hz.st, true);
    } finally {
      CUC.hold();   // the header waits for the die
      if (fresh && rolled) {
        hz.timers.at(HZ_T.face, function () { drawDie(hz.st, true); });
        if (busted) {
          hz.timers.at(HZ_T.empty, function () { drawTray(hz.st, null); drawPay(hz.st); });
          hz.timers.at(HZ_T.chip, function () { hzLine(hz.st, true); });
        } else {
          hz.timers.at(HZ_T.pot, function () { drawTray(hz.st, was); drawPay(hz.st); hzLine(hz.st, false); });
        }
      } else if (fresh) {
        hz.timers.at(HZ_T.cash, function () { drawTray(hz.st, null); drawPay(hz.st); hzLine(hz.st, true); });
      }
      hz.timers.at(fresh ? (rolled ? (busted ? HZ_T.chip : HZ_T.pot) : HZ_T.cash) : 0,
        function () { hzSettle(m, played, op); });
    }
  }
  // A reply with no state: the host could not describe the round (games/README.md, section 5). The
  // reason shows and the tray stays exactly as full as it was, because it is the describing that
  // failed and not the roll. AN EMPTIED TRAY IS THE ONE READING the player cannot tell from the 1
  // that empties it for real. hz.st is kept, so the next press is measured against the host's round
  function hzFault(m, awaited) {
    CUC.err('hzErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    hz.busy = false;
    clearTimeout(hz.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    hzControls(hz.st, false);
    hzFocusAfter();
  }
  function hzSettle(m, played, op) {
    hz.busy = false;
    try {
      CUC.settle(m);
      if (played) hzAnnounce(hz.st, op);   // after the balance, so it can say what it came to
    } finally {
      hzControls(hz.st, false);
      hzFocusAfter();
    }
  }

  CUC.game('hazard', {
    key: 'hz',
    cls: 'hz',
    markup: markup,
    init: function () {
      drawDie(null, false);    // an unrolled die and an empty tray from the first paint, so the
      drawBust(null);          // deal has something to change and the losing face is named first
      drawTray(null, null);
      drawPay(null);
      hzLine(null);
      // Picking a stake does not redraw the line: renderStakes writes the figure straight into the
      // preview (ui.preview), and when the line is holding a result that is the last thing that
      // happened
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, hz.busy); });
      el('hzDeal').addEventListener('click', function () {
        var v = Number(this.getAttribute('data-bet')); if (!v) return;
        hzSend('deal', { bet: v });
      });
      el('hzPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
        hzSend(b.getAttribute('data-op'));
      });
      CUC.why('hzWhy', 'hzPays');
    },
    enter: function () { hz.wantFocus = true; hzControls(hz.st, true); hzSend('open'); },
    leave: function () {
      hz.timers.clear();
      clearTimeout(hz.to);
      hz.busy = false; hz.op = null;
    },
    receive: hzReceive,
    credits: function () { if (!hz.busy) hzControls(hz.st, false); },
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#hzPlay', { r: 'roll', c: 'bank' }[k] || null, 'hzDeal', 'hzBet');
    }
  });
})();
