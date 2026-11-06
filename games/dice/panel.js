// Roll Under's screen: did the roll fall to the left of the line I drew?
//
// The host owns the roll and the price of every line (dice.js). This screen draws one lane, fills
// the side that wins, and drops the roll onto a shelf under it on the SAME scale, so the one
// question this game asks is answered by two things being next to each other rather than by a
// sentence. There is no die here: the roll is a percentile and pips would be a lie about it.
//
// ONE MAP, USED FOR EVERYTHING ON THE LANE. A range input's handle travels with its centre inside
// the track by half its own width, so the lane draws the targets 1..96 across (its width less 22px)
// with 11px of margin either side. The bright zone's edge, the target's own figure and the roll's
// stem are all placed by that same map, which is what keeps the only comparison that matters exact:
// the stem stands left of the edge exactly when roll < 100 * target, and that IS the engine's win
// test (dice.js, winsAt). A second map for the roll would be a picture that disagreed with the
// ledger at the edges.
//
// A roll settles on the press, so there is no live phase: the bet row is the only control row, and
// `phase` is 'bet' before the first roll and 'done' after every one.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The plaque comes down onto the shelf and the figure follows it (docs/game-panels.md, the dice
  // family's timing table). Class 1: nothing is narrowed down while it falls, so it is short.
  // `drop` is the .22s on `.dc-plaque.in` in games/dice/meta.js
  var DC_T = { drop: 220, chip: 340, noReply: 4000 };

  // The handle, and the only two numbers this file holds: the lane's own geometry
  var DC_G = { grip: 22, half: 11 };

  var dc = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false,
    target: null };
  // the table's floor. 100 closes the 10 chip, opens the screen on 100 and asks for 100 in the
  // short-purse note (webview.js, stakeUi)
  var SU = CUC.stakeUi('dc', { min: 100 });
  var TARGET_KEY = 'dcTarget';   // the line the player drew, remembered the way the stakes are

  // --- markup ---------------------------------------------------------------------------------

  function markup() {
    return CUC.frame('dice')
      + '<div class="bj-felt">'
      +   '<div class="dc-head"><div class="dc-target" id="dcTarget"></div></div>'
      +   '<div class="dc-lane">'
      +     '<div class="dc-fill" id="dcFill"></div>'
      +     '<input type="range" class="dc-range" id="dcLane" min="1" max="96" step="1" value="50"'
      +       ' aria-label="Roll under"/>'
      +   '</div>'
      +   '<div class="dc-shelf" id="dcShelf"></div>'
      +   '<div class="hl-line" id="dcLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="dcWhy" aria-expanded="false" aria-controls="dcPays">How it pays</button>'
      + '<div class="bj-pays" id="dcPays" hidden></div>'
      + '<div class="bj-sr" id="dcLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="dcNote" hidden></div>'
      + '<div class="warnbar" id="dcErr" hidden></div>'
      + '<div class="bj-ctl" id="dcBet">' + CUC.stakesHtml('dc')
      +   '<button type="button" class="bj-btn primary" id="dcDeal" title="Roll (Enter)">Roll</button></div>';
  }

  // --- the one map ----------------------------------------------------------------------------

  function lo(st) { return (st && st.minTarget) || 1; }
  function hi(st) { return (st && st.maxTarget) || 96; }
  // Where a value in TARGET UNITS (1 to 96, and the roll divided by its own 100) sits on the lane,
  // as a CSS length. Everything on the lane goes through this
  function atCss(st, v) {
    var span = hi(st) - lo(st);
    var f = span > 0 ? (v - lo(st)) / span : 0;
    return 'calc(' + DC_G.half + 'px + (100% - ' + DC_G.grip + 'px) * ' + f.toFixed(5) + ')';
  }
  // Clamped into the shelf, so a plaque at either end does not hang off the felt. The stem is not
  // clamped with it: that is the whole point of there being two of them
  function clampCss(mid, w) {
    return 'clamp(0px, calc(' + mid + ' - ' + (w / 2) + 'px), calc(100% - ' + w + 'px))';
  }
  // The line the player has drawn. The host's own bounds are what make a value valid, so a
  // remembered one outside them falls back to the dial's own opening target rather than being sent
  function target(st) {
    var s = CUC.state() || {};
    var want = dc.target != null ? dc.target : s[TARGET_KEY];
    if (Number.isSafeInteger ? Number.isSafeInteger(want) : typeof want === 'number') {
      if (want >= lo(st) && want <= hi(st)) return want;
    }
    return (st && st.defaultTarget) || 50;
  }
  // The roll, in target units: the wire carries whole hundredths and the screen puts the point in
  // (dice.js's header). Nothing is decided from this, only placed and printed
  function rollAt(st) { return st.roll / 100; }
  function rollText(st) { return (st.roll / 100).toFixed(2); }

  // --- the felt ------------------------------------------------------------------------------

  function drawLane(st) {
    var t = target(st);
    var fill = el('dcFill'), head = el('dcTarget'), lane = el('dcLane');
    if (fill) fill.style.width = atCss(st, t);
    if (head) {
      head.style.left = clampCss(atCss(st, t), 40);
      head.textContent = fmtInt(t);
    }
    if (lane) {
      lane.setAttribute('min', String(lo(st)));
      lane.setAttribute('max', String(hi(st)));
      lane.value = String(t);
      // the one sentence a screen reader needs out of this control, and the browser writes the rest
      lane.setAttribute('aria-valuetext', 'Under ' + t);
    }
  }
  // The shelf. Before the first roll it is EMPTY, and that empty 54px is what the deal fills: a
  // shelf with a figure already on it is the mistake 5-12 names by its old game's name
  function drawShelf(st, anim) {
    var box = el('dcShelf'); if (!box) return;
    if (!st || st.phase !== 'done' || st.roll == null) { box.innerHTML = ''; return; }
    var mid = atCss(st, rollAt(st));
    box.innerHTML = '<i class="dc-stem" style="left:' + clampCss(mid, 2) + '"></i>'
      + '<div class="dc-plaque' + (anim ? ' in' : '') + '" style="left:' + clampCss(mid, 72) + '"'
      + ' role="img" aria-label="Rolled ' + rollText(st) + '">' + rollText(st) + '</div>';
  }

  // --- the line, the folded table and what is read out ----------------------------------------

  function dcLine(st, pop) {
    var line = el('dcLine'); if (!line) return;
    if (!st || st.phase !== 'done') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    var net = st.net || 0, cls = net > 0 ? ' win' : net < 0 ? ' lose' : '';
    var text = st.win ? CUC.xMult100(st.mult100) + ' ' + signed(net) : 'Over ' + signed(net);
    line.innerHTML = (st.win ? CUC.pot(st.payout, false) : '')
      + '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + CUC.esc(text) + '</span>';
  }
  // Ninety-six rows is a table, so what is behind the ? is the ONE fact the table is made of plus
  // what this line pays. The chance is deliberately not here either: the bright zone is already its
  // picture, and the engine sends it as 5,800 of 10,000 (docs/game-panels.md, 5-12)
  function dcPays(st) {
    var box = el('dcPays'); if (!box) return;
    if (!st || !st.pays) { box.innerHTML = ''; return; }
    var t = target(st), row = null;
    for (var i = 0; i < st.pays.length; i++) if (st.pays[i].target === t) row = st.pays[i];
    box.innerHTML = '<div class="dc-pay-row">Every line returns the same ' + fmtInt(st.house)
      + ' of every 100 staked, so a lower one is a wilder bet and never a better one.</div>'
      + (row ? '<div class="dc-pay-row">Under ' + fmtInt(t) + ' pays ' + CUC.esc(CUC.xMult100(row.mult100))
        + ' on this table’s smallest bet.</div>' : '');
  }
  function dcAnnounce(st) {
    if (!st || st.phase !== 'done') return;
    CUC.live('dcLive', 'Rolled ' + rollText(st) + ', under ' + st.target + '. '
      + (st.win ? 'Under, ' + CUC.xMult100(st.mult100) + ', pays ' + fmtInt(st.payout) : 'Over')
      + '. ' + signed(st.net || 0) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }

  // --- controls -------------------------------------------------------------------------------

  function dcControls(st, locked) {
    CUC.renderStakes(SU, locked);
    var lane = el('dcLane'); if (lane) lane.disabled = locked;
    dcPays(st);
  }
  function dcFocusAfter() {
    if (CUC.current() !== 'dice') return;
    var a = document.activeElement, panel = el('panel-dice');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!dc.wantFocus && !lost) return;
    dc.wantFocus = false;
    var d = el('dcDeal'); if (d && !d.disabled) d.focus();
  }

  function dcSend(op, extra) {
    if (dc.busy) return;
    dc.busy = true; dc.op = op;
    if (op !== 'open') dcControls(dc.st, true);
    dc.n = CUC.post('dc', op, extra);
    clearTimeout(dc.to);
    dc.to = setTimeout(function () {
      dc.busy = false; dc.op = null;
      CUC.err('dcErr', 'The table didn’t respond. Try again.');
      dcControls(dc.st, false);
    }, DC_T.noReply);
  }

  // The plaque comes down first and the figure follows it: a multiple that landed before the roll
  // did would be the answer arriving ahead of it
  function dcReceive(m) {
    var current = dc.op != null && m.n === dc.n;
    if (!current && dc.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('dc', m);
    if (!m.state) { var awaited = current; dc.op = null; return dcFault(m, awaited); }
    var op = current ? dc.op : null;
    clearTimeout(dc.to); dc.timers.clear();
    dc.op = null; dc.st = m.state;
    if (dc.st.target != null) dc.target = dc.st.target;   // the line the host really rolled against
    // rolled: the reply to a press the player just made. A refused roll changed nothing, and a reply
    // nobody asked for is a roll this screen is being told about rather than one it pressed, so both
    // are drawn where they stand: pacing either would drop the same plaque twice
    var rolled = current && op === 'deal' && !m.error && dc.st.phase === 'done';
    var fresh = rolled && !CUC.reduceMotion();
    try {
      CUC.err('dcErr', m.error || '');
      drawLane(dc.st);
      drawShelf(dc.st, fresh);
      if (!fresh) dcLine(dc.st, rolled);
      dcControls(dc.st, true);
    } finally {
      CUC.hold();   // the header waits for the plaque
      if (fresh) dc.timers.at(DC_T.chip, function () { dcLine(dc.st, true); });
      dc.timers.at(fresh ? DC_T.chip : 0, function () { dcSettle(m, rolled); });
    }
  }
  // A reply with no state: the host could not describe the roll (games/README.md, section 5). The
  // reason shows and the lane and the shelf stay exactly as they are, because it is the describing
  // that failed and not the roll. dc.st is kept, so the next redraw is still drawn against the
  // host's own round
  function dcFault(m, awaited) {
    CUC.err('dcErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    dc.busy = false;
    clearTimeout(dc.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    dcControls(dc.st, false);
    dcFocusAfter();
  }
  function dcSettle(m, rolled) {
    dc.busy = false;
    try {
      CUC.settle(m);
      if (rolled) dcAnnounce(dc.st);   // after the balance, so it can say where the roll landed
    } finally {
      dcControls(dc.st, false);
      dcFocusAfter();
    }
  }

  CUC.game('dice', {
    key: 'dc',
    cls: 'dc',
    markup: markup,
    init: function () {
      drawLane(null);     // the lane, its bright side and the line's own figure, from the first paint
      drawShelf(null);    // and an empty shelf, which is what the deal fills
      dcLine(null);
      // Picking a stake does not redraw the line: renderStakes writes the figure straight into the
      // preview (ui.preview), and when the line is holding a result that is the last thing that
      // happened
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, dc.busy); });
      el('dcLane').addEventListener('input', function () {
        var v = Number(this.value);
        if (!(v >= lo(dc.st) && v <= hi(dc.st))) return;
        dc.target = v;
        var s = CUC.state() || {}; s[TARGET_KEY] = v; CUC.setState(s);
        // the bright zone and the figure move with the handle. A finished roll keeps its plaque and
        // its chip: that is what the balance did, and drawing a new line did not change it
        drawLane(dc.st);
        dcPays(dc.st);
      });
      el('dcDeal').addEventListener('click', function () {
        var v = Number(this.getAttribute('data-bet')); if (!v) return;
        dcSend('deal', { bet: v, target: target(dc.st) });
      });
      CUC.why('dcWhy', 'dcPays');
    },
    enter: function () { dc.wantFocus = true; dcControls(dc.st, true); dcSend('open'); },
    leave: function () {
      dc.timers.clear();
      clearTimeout(dc.to);
      dc.busy = false; dc.op = null;
    },
    receive: dcReceive,
    credits: function () { if (!dc.busy) dcControls(dc.st, false); },
    // There is nothing to play inside a roll, so Enter on the bet row is the whole keyboard. The
    // lane is an input and takes the arrow keys, Home and End itself, which is why it is one
    keys: function (e) { CUC.press(e, '#dcBet', null, 'dcDeal', 'dcBet'); }
  });
})();
