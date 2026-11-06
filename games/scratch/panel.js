// The scratch card's screen: what has come up, and how many squares are left.
//
// THIS SCREEN SHOWS NO FIGURE UNTIL THE NINTH SQUARE IS OFF, and that is the whole of it rather
// than a detail. The prize depends on how many copies are among ALL nine, so three crabs showing is
// not a prize yet: a fourth pays fifteen times as much and a rarer symbol reaching three outranks
// it. The host says as much by sending `win: null` and `net: null` while the card is live
// (scratch.js's header works through why, at length). So the line under the card stays empty, the
// tally above it counts only squares the player has already turned over, and anything else would be
// either a guess or a peek at what is still face down.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // `tap` is one square off under one press, so it is short: a card is nine of them and 400ms each
  // would make the game unusable. `each` is the stagger when the rest come off together, and `tail`
  // is the gap before the prize lands (docs/game-panels.md, section 6).
  // `tap` is also the .17s on `.sc-cell.rub .sy` in games/scratch/meta.js
  var SC_T = { tap: 170, each: 55, tail: 180, noReply: 4000 };

  var sc = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, phase: null };
  var SU = CUC.stakeUi('sc');

  // All ten names, from the floor's CUC.symWord. The drawings are aria-hidden (games/symbols.js),
  // so whatever shows a symbol has to carry its name, which is CUC.cardWord's rule for the pixel
  // cards: the slot machine keeps it over the same ten symbols, so the names live there and not here
  var COUNT = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function one(sym) { return CUC.symWord(sym, 1); }
  function many(sym) { return CUC.symWord(sym, 2); }

  // --- the card ------------------------------------------------------------------------------

  function markup() {
    var cells = '';
    for (var i = 0; i < 9; i++) {
      cells += '<button type="button" class="sc-cell" id="scC' + i + '" data-cell="' + i + '" disabled></button>';
    }
    return CUC.frame('scratch')
      + '<div class="bj-felt">'
      +   '<div class="sc-plate gm-plate tight" id="scGrid" role="group" aria-label="Scratch card">' + cells + '</div>'
      +   '<div class="sc-tally" id="scTally"></div>'
      +   '<div class="hl-line" id="scLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="scWhy" aria-expanded="false" aria-controls="scPays">How it pays</button>'
      + '<div class="bj-pays" id="scPays" hidden></div>'
      + '<div class="bj-sr" id="scLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="scNote" hidden></div>'
      + '<div class="warnbar" id="scErr" hidden></div>'
      + '<div class="bj-ctl" id="scBet">' + CUC.stakesHtml('sc')
      +   '<button type="button" class="bj-btn primary" id="scDeal" title="Buy a card (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="scPlay" hidden>'
      +   '<button type="button" class="bj-btn primary" data-op="reveal" title="Rub the rest off (R)">Rub the rest</button></div>';
  }

  // One square. A covered one is a thing to press and says so; a rubbed one is the symbol under it
  // and is finished, so it is disabled. The name is on the button either way, because the drawing
  // inside it is art
  function drawCell(i, sym, live, rub) {
    var e = el('scC' + i); if (!e) return;
    e.classList.toggle('on', !!sym);
    e.classList.toggle('rub', !!(sym && rub));
    e.disabled = !!sym || !live;
    e.setAttribute('aria-label', 'Square ' + (i + 1) + ', ' + (sym ? one(sym) : 'covered'));
    e.innerHTML = sym
      ? '<svg class="sy" viewBox="0 0 24 24" aria-hidden="true"><use href="#sy-' + sym + '"/></svg>'
      : '';
  }
  // The whole card. `hold` is the squares to leave covered although the host has turned them over:
  // that is how the rest coming off is paced without the screen holding a symbol of its own, since
  // the symbol it draws a moment later is still the host's
  function drawCard(st, live, hold) {
    var cells = (st && st.cells) || new Array(9).fill(null);
    for (var i = 0; i < cells.length; i++) {
      var keep = hold && hold.indexOf(i) >= 0;
      drawCell(i, keep ? null : cells[i], live && !keep, false);
    }
  }
  // WHICH SQUARES MADE THE PRIZE, ringed in ember. The chip under the card says what the card paid;
  // this says which of the nine it was paid for, and "it was these" is the whole reward of a screen
  // that has nine identical squares on it. `win.cells` is the host's own list (scratch.js's winOf)
  // and it is only ever read, never worked out: two symbols can both reach three and the one that
  // paid is the engine's ruling.
  //
  // A class on the button and not a redraw, so this can land a beat after the last square came off
  // without touching the rub it is still animating. `st` of null clears the ring, which is what a
  // new card wants: there is nothing to ring while one is live, because the host sends no win at all
  // until the ninth square is off
  function scLight(st) {
    var won = (st && st.phase === 'done' && st.win && st.win.cells) || null;
    for (var i = 0; i < 9; i++) {
      var e = el('scC' + i); if (!e) continue;
      e.classList.toggle('hit', !!(won && won.indexOf(i) >= 0));
    }
  }

  // --- the tally, the line and the paytable ---------------------------------------------------

  // Only symbols the player can already see two or more of, biggest pile first, three at most. A
  // row per symbol would be ten rows of mostly noughts and ones, which is wallpaper and not
  // information. `counts` is the host's tally of the SHOWN squares and it cannot say anything the
  // player has not already turned over (scratch.js's shownOf)
  function scTally(st) {
    var box = el('scTally'); if (!box) return;
    var counts = (st && st.counts) || {}, rank = {}, pays = (st && st.pays) || [], rows = [];
    for (var p = 0; p < pays.length; p++) rank[pays[p].sym] = p;
    for (var sym in counts) if (counts[sym] >= 2) rows.push({ sym: sym, n: counts[sym] });
    rows.sort(function (a, b) { return (b.n - a.n) || ((rank[a.sym] || 0) - (rank[b.sym] || 0)); });
    var out = '';
    for (var i = 0; i < rows.length && i < 3; i++) {
      out += '<span class="bj-chip still">' + fmtInt(rows[i].n) + ' ' + CUC.esc(many(rows[i].sym)) + '</span>';
    }
    box.innerHTML = out;
  }
  // What the finished card came to, in words. A three-of-a-kind row is a multiplier of 1, so the
  // bet comes back and the net is zero: calling that a win would be the screen deciding something
  // the host did not say
  function verdict(st) {
    var w = st.win || {}, net = st.net || 0;
    if (!w.sym) return 'Nothing ' + signed(net);
    if (net === 0) return (COUNT[w.count] || w.count) + ' ' + many(w.sym) + ', the bet comes back';
    return (COUNT[w.count] || w.count) + ' ' + many(w.sym) + ' ' + signed(net);
  }
  // The line: the stake before a card, NOTHING while one is being rubbed off, the prize once the
  // ninth square is off. The empty middle is the point (see the note at the top of this file)
  function scLine(st, pop) {
    var line = el('scLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase !== 'done') { line.innerHTML = ''; return; }
    var net = st.net || 0;
    var cls = net > 0 ? ' win' : (st.win && st.win.sym) ? '' : ' lose';
    line.innerHTML = '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + CUC.esc(verdict(st)) + '</span>';
  }
  // Ten symbols, five rows: symbols that share a row share a weight, which is the table the
  // engine's own header says a player can read. Grouped on the host's own figures, never recounted
  function scPays(st) {
    var rows = (st && st.pays) || [], box = el('scPays'); if (!box) return;
    if (!rows.length) { box.innerHTML = ''; return; }   // no state yet: the host has not sent a table
    var seen = {}, order = [];
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].mult.join('/');
      if (!seen[key]) { seen[key] = { mult: rows[i].mult, syms: [] }; order.push(key); }
      seen[key].syms.push(cap(one(rows[i].sym)));
    }
    // the column heads are the host's own counts (minMatch..topMatch), so retuning where the ladder
    // starts or stops moves the table's heading with it
    var head = '';
    for (var c = st.minMatch; c <= st.topMatch; c++) head += '<b>' + c + (c === st.topMatch ? '+' : '') + '</b>';
    var out = '<div class="sc-pay head">' + head + '</div>';
    for (var k = 0; k < order.length; k++) {
      var g = seen[order[k]], vals = '';
      for (var v = 0; v < g.mult.length; v++) vals += '<b>' + fmtInt(g.mult[v]) + '×</b>';
      out += '<div class="sc-grp">' + CUC.esc(g.syms.join(' · ')) + '</div><div class="sc-pay">' + vals + '</div>';
    }
    box.innerHTML = out;
  }
  // The corner of the heading: how many squares are still covered, which is the one thing about
  // this card that is still true when the panel is shut (docs/game-panels.md, section 3)
  function scSide(st) {
    var e = el('scSide'); if (!e) return;
    e.textContent = (st && st.phase === 'scratch' && st.left > 0) ? st.left + ' left' : '';
  }
  // One line per move: what came up and how many are left, and at the end the prize and the
  // balance. Nothing above this reaches a screen reader on its own
  function scAnnounce(st, newly) {
    if (!st) return;
    var said = [];
    if (newly && newly.length) {
      var names = [];
      for (var i = 0; i < newly.length && i < 3; i++) names.push(one(st.cells[newly[i]]));
      said.push(names.join(', ') + (newly.length > 3 ? ' and ' + (newly.length - 3) + ' more' : ''));
    }
    if (st.phase === 'done') said.push(verdict(st), 'Balance ' + fmtInt(CUC.balance() || 0));
    else said.push(st.left + ' left');
    CUC.live('scLive', said.join('. ') + '.');
  }

  // --- controls ------------------------------------------------------------------------------

  function scControls(st, locked) {
    var live = !!(st && st.phase === 'scratch');
    var bet = el('scBet'), play = el('scPlay');
    if (bet) bet.hidden = live;
    if (play) play.hidden = !live;
    var rub = document.querySelector('#scPlay [data-op="reveal"]');
    if (rub) rub.disabled = locked || !(st && st.can && st.can.reveal);
    var cells = document.querySelectorAll('#scGrid .sc-cell');
    for (var i = 0; i < cells.length; i++) {
      var shown = cells[i].classList.contains('on');
      cells[i].disabled = shown || locked || !(live && st.can && st.can.scratch);
    }
    scSide(st);
    scPays(st);
    if (!live) CUC.renderStakes(SU, locked);
  }
  // A square that has just been rubbed off is disabled, so the key that pressed it has nowhere to
  // go: the focus moves to the next covered square, or to the button that takes the rest off
  function scFocusAfter() {
    if (CUC.current() !== 'scratch') return;
    var live = sc.st && sc.st.phase === 'scratch';
    var swapped = sc.phase != null && live !== (sc.phase === 'scratch');
    sc.phase = sc.st ? sc.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-scratch');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!sc.wantFocus && !swapped && !lost) return;
    sc.wantFocus = false;
    var target = live
      ? (document.querySelector('#scGrid .sc-cell:not([disabled])') || document.querySelector('#scPlay [data-op="reveal"]'))
      : el('scDeal');
    if (target && !target.disabled) target.focus();
  }

  function scSend(op, extra) {
    if (sc.busy) return;
    sc.busy = true; sc.op = op;
    if (op !== 'open') scControls(sc.st, true);
    sc.n = CUC.post('sc', op, extra);
    clearTimeout(sc.to);
    sc.to = setTimeout(function () {
      sc.busy = false; sc.op = null;
      CUC.err('scErr', 'The table didn’t respond. Try again.');
      scControls(sc.st, false);
    }, SC_T.noReply);
  }

  // The squares come off first and the prize follows the last of them: a figure that landed before
  // the ninth square did would be a figure the player could read the card from
  function scReceive(m) {
    var current = sc.op != null && m.n === sc.n;
    if (!current && sc.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('sc', m);
    if (!m.state) { var awaited = current; sc.op = null; return scFault(m, awaited); }
    var op = current ? sc.op : null;
    var had = (sc.st && sc.st.cells) || null;
    clearTimeout(sc.to); sc.timers.clear();
    sc.op = null; sc.st = m.state;
    // acted: the reply to a press the player just made. A refused move changed nothing, and a reply
    // nobody asked for is a card this screen is being told about rather than one it rubbed, so both
    // are drawn where they stand: pacing either would take the same squares off twice
    var acted = current && (op === 'scratch' || op === 'reveal') && !m.error;
    var newly = [];
    if (acted) {
      for (var i = 0; i < sc.st.cells.length; i++) {
        if (sc.st.cells[i] != null && (!had || had[i] == null)) newly.push(i);
      }
    }
    var fresh = acted && newly.length > 0 && !CUC.reduceMotion();
    // the stagger: a press takes one square off at once, and the rest come off in a run
    var step = op === 'reveal' ? SC_T.each : 0;
    var lastAt = fresh ? (op === 'reveal' ? newly.length * step : SC_T.tap) : 0;
    var settleAt = fresh ? lastAt + (sc.st.phase === 'done' ? SC_T.tail : 0) : 0;
    try {
      CUC.err('scErr', m.error || '');
      drawCard(sc.st, sc.st.phase === 'scratch', fresh ? newly : null);
      // the ring goes on with the prize and not before it: while squares are still coming off, the
      // card being paced has no prize drawn on it yet
      scLight(fresh ? null : sc.st);
      scControls(sc.st, true);
      if (fresh) {
        for (var k = 0; k < newly.length; k++) {
          (function (idx, at) {
            sc.timers.at(at, function () {
              drawCell(idx, sc.st.cells[idx], false, true);
              scTally(sc.st);
            });
          })(newly[k], op === 'reveal' ? (k + 1) * step : 0);
        }
      } else { scTally(sc.st); scLine(sc.st, acted); }
    } finally {
      CUC.hold();   // the header waits for the squares
      if (fresh) sc.timers.at(settleAt, function () { scLight(sc.st); scLine(sc.st, true); });
      sc.timers.at(settleAt, function () { scSettle(m, acted, newly); });
    }
  }
  // A reply with no state: the host could not describe the card (games/README.md, section 5). The
  // reason shows and the card stays exactly as it is, squares, tally and all, because it is the
  // describing that failed and not the card. sc.st is kept, so the next redraw is still drawn
  // against the host's own card
  function scFault(m, awaited) {
    CUC.err('scErr', m.error || 'The card could not be shown. Try again.');
    if (!awaited) return;
    sc.busy = false;
    clearTimeout(sc.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    scControls(sc.st, false);
    scFocusAfter();
  }
  function scSettle(m, acted, newly) {
    sc.busy = false;
    try {
      CUC.settle(m);
      scTally(sc.st);
      if (acted) scAnnounce(sc.st, newly);   // after the balance, so it can say where it landed
    } finally {
      scControls(sc.st, false);
      scFocusAfter();
    }
  }

  CUC.game('scratch', {
    key: 'sc',
    cls: 'sc',
    markup: markup,
    init: function () {
      scLine(null);
      // Picking a stake does not redraw the line: renderStakes writes the figure straight into the
      // preview (ui.preview), and when the line is holding a prize that chip is the last thing that
      // happened. Redrawing it would also replace it a millisecond after it popped
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, sc.busy); });
      el('scDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        scSend('deal', { bet: bet });
      });
      el('scGrid').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.sc-cell') : null; if (!b || b.disabled) return;
        scSend('scratch', { cell: Number(b.getAttribute('data-cell')) });
      });
      el('scPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
        scSend('reveal');
      });
      CUC.why('scWhy', 'scPays');
    },
    enter: function () { sc.wantFocus = true; scControls(sc.st, true); scSend('open'); },
    leave: function () {
      sc.timers.clear();
      clearTimeout(sc.to);
      sc.busy = false; sc.op = null;
    },
    receive: scReceive,
    // a credit minted while the bet row is up lights the chips at once. The line is left alone for
    // the reason in init()
    credits: function () { if (!sc.busy) scControls(sc.st, false); },
    // R takes the rest off. A square is pressed rather than keyed, and every one of the nine is a
    // button, so Tab and Space finish a card without a mouse
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#scPlay', k === 'r' ? 'reveal' : null, 'scDeal', 'scBet');
    }
  });
})();
