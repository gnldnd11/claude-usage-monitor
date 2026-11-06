// The plinko board's screen: which cup did the bead fall into?
//
// The host walks the bead and prices the cup (plinko.js). This screen is handed `path`, the twelve
// bounces the bead really took, so it drops the bead down the real pins and comes to rest over the
// cup the host says it landed in: nothing here decides, or guesses at, where it goes. `mult` is the
// payout read back out of the credits, so the figure on the chip is the one the balance moved by
// and not the one the table advertises.
//
// A drop settles on the press, so there is no live phase: the risk row and the bet row are the only
// controls, and `phase` is 'bet' before the first drop and 'done' after every one.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // THE BEAD ACCELERATES, AND IT DOES SO BY THE GAPS BETWEEN THE BOUNCES CLOSING UP. Row k waits
  // `row0 - slope * k` ms, which is 140 down to 74 over the twelve rows and never under the 70ms a
  // bounce needs to read as one event. The old board was a flat 48ms a row: 576ms for the whole
  // fall, under three frames a bounce, and a bead that slid rather than bounced
  // ("핑코는 너무 빨리 끝나서 긴장감이 없다"). Equal steps also tell a lie about a falling bead,
  // which covers the same 7px of pin spacing in less time the further down it is.
  //
  // The twelve waits add up to 1,284, the bead settles into the cup 180 after that and the figure
  // follows it 120 later: 1,584 for a drop, inside the 2,000ms a round may take
  // (docs/game-panels.md, section 6 and 5-6).
  //
  // `hop` is the .07s on `.pl-bead` and `land` the .18s on `.pl-bead.landing`, both in
  // games/plinko/meta.js. hop is four frames, the figure the floor is set by, so one bounce is still
  // a move and a rest at the bottom of the board where only 74ms is left for both
  var PL_T = { hop: 70, row0: 140, slope: 6, land: 180, chip: 1584, noReply: 4000 };
  // When bounce k lands, k counted from 0: the sum of the k+1 waits before it
  function bounceAt(k) { return (k + 1) * PL_T.row0 - PL_T.slope * k * (k + 1) / 2; }

  // The board's own geometry, which is fixed on purpose: see the CSS note in games/plinko/meta.js.
  // `step` is one cup, `half` is the sideways move one bounce makes, `rowH` is one row of pins
  var PL_G = { step: 10, half: 5, rowH: 7, mid: 65, drop: 105 };

  var pl = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, risk: null };
  var SU = CUC.stakeUi('pl');
  var RISK_KEY = 'plRisk';   // the chosen board, remembered the way the stakes remember theirs

  // --- the board -----------------------------------------------------------------------------

  // A Galton board: row r holds r pins and the bead passes one of them, so twelve rows leave
  // thirteen gaps at the bottom and those are the cups. Built once, because pins do not move
  function pinsHtml(rows) {
    var out = '';
    for (var r = 1; r <= rows; r++) {
      for (var j = 0; j < r; j++) {
        var x = PL_G.mid + (j - (r - 1) / 2) * PL_G.step;
        var y = (r - 1) * PL_G.rowH + 4;
        out += '<i class="pl-pin" style="left:' + x + 'px;top:' + y + 'px"></i>';
      }
    }
    return out;
  }

  function markup() {
    return CUC.frame('plinko')
      + '<div class="bj-felt">'
      +   '<div class="gm-plate">'
      +     '<div class="pl-board">'
      +       '<div class="pl-field" aria-hidden="true">' + pinsHtml(12) + '<i class="pl-bead" id="plBead"></i></div>'
      +       '<div class="pl-flag" id="plFlag" aria-hidden="true"></div>'
      +       '<div class="pl-cups" id="plCups" aria-hidden="true"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="hl-line" id="plLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="plWhy" aria-expanded="false" aria-controls="plPays">How it pays</button>'
      + '<div class="bj-pays" id="plPays" hidden></div>'
      + '<div class="bj-sr" id="plLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="plNote" hidden></div>'
      + '<div class="warnbar" id="plErr" hidden></div>'
      + '<div class="bj-ctl pl-risks" id="plRisks"><div class="bj-stakes" id="plRiskBox" role="group" aria-label="Risk"></div></div>'
      + '<div class="bj-ctl" id="plBet">' + CUC.stakesHtml('pl')
      +   '<button type="button" class="bj-btn primary" id="plDeal" title="Drop (Enter)">Drop</button></div>';
  }

  // Which board the player has chosen. The host's own list is what makes a choice valid, so a
  // remembered key that is no longer a board falls back to the first one rather than being sent
  function riskKeys(st) { return (st && st.riskKeys) || []; }
  function risk(st) {
    var keys = riskKeys(st);
    if (!keys.length) return pl.risk;
    var want = pl.risk != null ? pl.risk : (CUC.state() || {})[RISK_KEY];
    return keys.indexOf(want) >= 0 ? want : keys[0];
  }
  function drawRisks(st, locked) {
    var box = el('plRiskBox'); if (!box) return;
    var keys = riskKeys(st), now = risk(st), out = '';
    for (var i = 0; i < keys.length; i++) {
      var r = st.risks[keys[i]];
      out += '<button type="button" data-risk="' + keys[i] + '"' + (locked ? ' disabled' : '')
        + ' aria-pressed="' + (keys[i] === now ? 'true' : 'false') + '"'
        + ' class="' + (keys[i] === now ? 'on' : '') + '">' + CUC.esc(r.label) + '</button>';
    }
    box.innerHTML = out;
  }

  // THE DEPTH OF A CUP IS ITS MULTIPLE, by rank rather than in proportion. A board whose edge pays
  // 680 times the bet and whose middle pays nothing would, drawn in proportion, be two bright cups
  // and eleven invisible ones: the ranking keeps every step between two cups visible while staying
  // in the one order that matters, which is that a deeper cup pays more
  function cupShades(nums) {
    var sorted = nums.slice().sort(function (a, b) { return a - b; });
    var ranks = [];
    for (var i = 0; i < sorted.length; i++) if (ranks.indexOf(sorted[i]) < 0) ranks.push(sorted[i]);
    var span = Math.max(1, ranks.length - 1);
    return nums.map(function (n) { return 0.1 + 0.7 * (ranks.indexOf(n) / span); });
  }
  function drawCups(st, hit) {
    var box = el('plCups'); if (!box) return;
    var board = st && st.risks && st.risks[risk(st)];
    if (!board) { box.innerHTML = ''; return; }
    var shades = cupShades(board.nums), out = '';
    for (var k = 0; k < board.nums.length; k++) {
      out += '<i class="pl-cup' + (hit === k ? ' hit' : '') + '" style="background:rgba(232,137,90,'
        + shades[k].toFixed(2) + ')"></i>';
    }
    box.innerHTML = out;
  }
  // The one figure on the board, over the cup it belongs to. At the two ends it is anchored to the
  // edge rather than centred on a 10px cup, or it would hang off the board
  function drawFlag(st, show) {
    var box = el('plFlag'); if (!box) return;
    if (!show || !st || st.bin == null) { box.innerHTML = ''; return; }
    var n = st.bins || 13;
    var side = st.bin <= 1 ? 'start' : st.bin >= n - 2 ? 'end' : 'center';
    box.innerHTML = '<span class="bj-chip" style="grid-column:' + (st.bin + 1) + ';justify-self:' + side + '">'
      + CUC.esc(xText(st.mult)) + '</span>';
  }
  function setBead(dx, dy) {
    var b = el('plBead'); if (b) b.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  // The bead at rest: at the apex before a drop, in its cup after one
  function placeBead(st) {
    var b = el('plBead'); if (b) b.classList.remove('landing');
    if (st && st.bin != null) setBead((st.bin - 6) * PL_G.step, PL_G.drop);
    else setBead(0, 0);
  }
  // The real walk, bounce by bounce. `path` is the host's own twelve lefts and rights, so the bead
  // arrives over the cup the host says it fell into: the last bounce and the cup cannot disagree
  function dropBead(st) {
    var path = st.path || [], b = el('plBead'), off = 0;
    if (b) b.classList.remove('landing');
    setBead(0, 0);
    for (var k = 0; k < path.length; k++) {
      off += path[k] ? 1 : -1;
      // The LAST bounce is the one that puts the bead in the cup, so it goes all the way down and
      // takes `land` to do it rather than `row`. Giving it a row of its own and then a separate
      // drop would set two transforms in the same instant, and only the second would be seen
      (function (at, step, last) {
        pl.timers.at(bounceAt(step - 1), function () {
          if (last && b) b.classList.add('landing');
          setBead(at * PL_G.half, last ? PL_G.drop : step * PL_G.rowH);
        });
      })(off, k + 1, k === path.length - 1);
    }
  }

  // --- the line, the paytable and what is read out --------------------------------------------

  // The host's own `mult` (the payout over the bet), formatted and never recomputed, which is the
  // floor's CUC.xMult: the wheel prints its wedges with the same two decimals, for the same reason
  // (an odd bet can leave a remainder with the house, and the figure printed has to be the one the
  // balance moved by)
  var xText = CUC.xMult;
  function plLine(st, pop) {
    var line = el('plLine'); if (!line) return;
    if (!st || st.phase !== 'done') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    var net = st.net || 0;
    var cls = net > 0 ? ' win' : net < 0 ? ' lose' : '';
    line.innerHTML = CUC.pot(st.pay, false)
      + '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + CUC.esc(xText(st.mult)) + '</span>';
  }
  // The chosen board, from the middle outwards: what a cup pays and how many of the 4,096 walks end
  // in it. Both come from the host (`mults` is its own print-only copy, `ways` its own count), so
  // nothing here is divided or counted
  function plPays(st) {
    var box = el('plPays'); if (!box) return;
    var board = st && st.risks && st.risks[risk(st)];
    if (!board) { box.innerHTML = ''; return; }
    var mid = Math.floor((st.bins - 1) / 2);
    var out = '<div class="pl-pay head"><span>cup</span><b>pays</b><b>in ' + fmtInt(st.paths) + '</b></div>';
    for (var d = 0; d <= mid; d++) {
      var k = mid + d;
      var name = d === 0 ? 'middle' : d === mid ? 'edge' : d + ' out';
      out += '<div class="pl-pay' + (st.bin != null && Math.abs(st.bin - mid) === d ? ' on' : '') + '">'
        + '<span>' + name + '</span><b>' + CUC.esc(xText(board.mults[k])) + '</b><b>' + fmtInt(st.ways[k]) + '</b></div>';
    }
    box.innerHTML = out;
  }
  function plAnnounce(st) {
    if (!st || st.phase !== 'done') return;
    CUC.live('plLive', 'Cup ' + (st.bin + 1) + ' of ' + st.bins + '. ' + xText(st.mult) + ', pays '
      + fmtInt(st.pay) + '. ' + signed(st.net || 0) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }

  // --- controls ------------------------------------------------------------------------------

  function plControls(st, locked) {
    drawRisks(st, locked);
    CUC.renderStakes(SU, locked);
    plPays(st);
  }
  function plFocusAfter() {
    if (CUC.current() !== 'plinko') return;
    var a = document.activeElement, panel = el('panel-plinko');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!pl.wantFocus && !lost) return;
    pl.wantFocus = false;
    var d = el('plDeal'); if (d && !d.disabled) d.focus();
  }

  function plSend(op, extra) {
    if (pl.busy) return;
    pl.busy = true; pl.op = op;
    if (op !== 'open') plControls(pl.st, true);
    pl.n = CUC.post('pl', op, extra);
    clearTimeout(pl.to);
    pl.to = setTimeout(function () {
      pl.busy = false; pl.op = null;
      CUC.err('plErr', 'The board didn’t respond. Try again.');
      plControls(pl.st, false);
    }, PL_T.noReply);
  }

  // The bead falls first and the figure follows it into the cup: a multiple that landed before the
  // bead did would give the drop away
  function plReceive(m) {
    var current = pl.op != null && m.n === pl.n;
    if (!current && pl.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('pl', m);
    if (!m.state) { var awaited = current; pl.op = null; return plFault(m, awaited); }
    var op = current ? pl.op : null;
    clearTimeout(pl.to); pl.timers.clear();
    pl.op = null; pl.st = m.state;
    if (pl.st.risk) pl.risk = pl.st.risk;    // the board the host really dealt on
    // dropped: the reply to a press the player just made. A refused drop changed nothing, and a
    // reply nobody asked for is a drop this screen is being told about rather than one it pressed,
    // so both are drawn where they stand: pacing either would drop the same bead twice
    var dropped = current && op === 'deal' && !m.error && pl.st.phase === 'done';
    var fresh = dropped && !CUC.reduceMotion();
    try {
      CUC.err('plErr', m.error || '');
      drawCups(pl.st, fresh ? -1 : pl.st.bin);
      drawFlag(pl.st, !fresh);
      if (fresh) dropBead(pl.st);
      else { placeBead(pl.st); plLine(pl.st, dropped); }
      plControls(pl.st, true);
    } finally {
      CUC.hold();   // the header waits for the bead
      if (fresh) pl.timers.at(PL_T.chip, function () {
        drawCups(pl.st, pl.st.bin);
        drawFlag(pl.st, true);
        plLine(pl.st, true);
      });
      pl.timers.at(fresh ? PL_T.chip : 0, function () { plSettle(m, dropped); });
    }
  }
  // A reply with no state: the host could not describe the drop (games/README.md, section 5). The
  // reason shows and the board stays exactly as it is, bead, cups and figure, because it is the
  // describing that failed and not the board. pl.st is kept, so the next redraw is still drawn
  // against the host's own round
  function plFault(m, awaited) {
    CUC.err('plErr', m.error || 'The board could not be shown. Try again.');
    if (!awaited) return;
    pl.busy = false;
    clearTimeout(pl.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    plControls(pl.st, false);
    plFocusAfter();
  }
  function plSettle(m, dropped) {
    pl.busy = false;
    try {
      CUC.settle(m);
      if (dropped) plAnnounce(pl.st);   // after the balance, so it can say where it landed
    } finally {
      plControls(pl.st, false);
      plFocusAfter();
    }
  }

  CUC.game('plinko', {
    key: 'pl',
    cls: 'pl',
    markup: markup,
    init: function () {
      plLine(null);
      placeBead(null);
      // Picking a stake does not redraw the line: renderStakes writes the figure straight into the
      // preview (ui.preview), and when the line is holding a result that is the last thing that
      // happened. Redrawing it would also replace the chip a millisecond after it popped
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, pl.busy); });
      el('plRiskBox').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-risk]') : null; if (!b || b.disabled) return;
        pl.risk = b.getAttribute('data-risk');
        var s = CUC.state() || {}; s[RISK_KEY] = pl.risk; CUC.setState(s);
        // the board the player is about to drop onto, so the cups change under the choice
        drawCups(pl.st, null);
        drawFlag(pl.st, false);
        drawRisks(pl.st, pl.busy);
        plPays(pl.st);
        var d = el('plDeal'); if (d && !d.disabled) d.focus();
      });
      el('plDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        plSend('deal', { bet: bet, risk: risk(pl.st) });
      });
      CUC.why('plWhy', 'plPays');
    },
    enter: function () { pl.wantFocus = true; plControls(pl.st, true); plSend('open'); },
    leave: function () {
      pl.timers.clear();
      clearTimeout(pl.to);
      pl.busy = false; pl.op = null;
    },
    receive: plReceive,
    // a credit minted while the bet row is up lights the chips at once. The line is left alone for
    // the reason in init()
    credits: function () { if (!pl.busy) plControls(pl.st, false); },
    // There is nothing to play inside a drop, so Enter on the bet row is the whole keyboard; the
    // three boards are a segmented control and are reached by Tab
    keys: function (e) { CUC.press(e, '#plBet', null, 'plDeal', 'plBet'); }
  });
})();
