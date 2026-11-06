// The minefield's screen: one question, "dig another cell or take the money". The board is the
// biggest block and the cash-out figure is the biggest number under it, because that is where the
// tension sits. Everything printed here is something view() sent: the next rung's multiple is
// `next.mult100` and its odds are `next.chance`, both as they arrived. Nothing is divided here.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The board's geometry, which the hairline offsets are built out of. The engine sends `size` and
  // `cells` too, but the markup is made once, before any reply has arrived
  var SIDE = 5, CELLS = SIDE * SIDE, GAP = 4, GAPS = (SIDE - 1) * GAP;
  var CENTRE = Math.floor(CELLS / 2);

  // flip/boom are the two cell animations and are paired with the CSS in meta.js (.mn-c.flip is
  // .15s, .mn-c.blast is .18s). safe is the beat the numbers follow a safe dig on (flip + 90).
  // revealStep/revealCap open the board at the end of a round: 40ms a cell, and the whole wave
  // inside 420ms (docs/game-panels.md, section 6)
  var MN_T = { flip: 150, safe: 240, boom: 180, revealStep: 40, revealCap: 420, noReply: 4000 };

  // This table's floor, which is mines.js's MIN_BET. A panel is webview-side and cannot require the
  // engine, so the figure is written here and handed to the shared chips, which close every chip
  // under it and ask for this amount in the short-purse note. Without a floor the first Deal on an
  // untouched install sends 10 and the host refuses it: a dead button with a sentence under it.
  // meta.js prints the same figure in `sub` and in the heading's title=
  var MN_MIN = 100;

  var mn = { st: null, busy: false, op: null, cell: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, phase: null };
  var SU = CUC.stakeUi('mn', { min: MN_MIN });

  // --- numbers, as the host sent them -----------------------------------------------------------

  // Hundredths to a printed multiple, which is the floor's (CUC.xMult100): the engine already read
  // this figure back OUT of the payout it will really pay (mines.js's mult100Of), so printing it
  // only moves the decimal point. The tower prints its floors the same way
  var mult = CUC.xMult100;
  function where(i) { return 'row ' + (Math.floor(i / SIDE) + 1) + ' column ' + ((i % SIDE) + 1); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var MN_WORD = { safe: 'a gem', boom: 'the mine', mine: 'a mine', free: 'empty' };
  function label(i, s) { return where(i) + (MN_WORD[s] ? ', ' + MN_WORD[s] : ''); }

  // --- markup -----------------------------------------------------------------------------------

  // The k-th hairline sits in the k-th gap: k cells of (100% - GAPS)/SIDE, k gaps, less half a gap
  // and half a line to centre it
  function rules() {
    var s = '';
    for (var k = 1; k < SIDE; k++) {
      var off = 'calc((100% - ' + GAPS + 'px)/' + SIDE + '*' + k + ' + ' + (GAP * k - 2) + 'px)';
      s += '<i class="gm-rule mn-rv" style="left:' + off + '"></i>'
        + '<i class="gm-rule mn-rh" style="top:' + off + '"></i>';
    }
    return s;
  }
  function cells() {
    var s = '';
    for (var i = 0; i < CELLS; i++) {
      s += '<button type="button" class="mn-c" id="mnC' + i + '" data-c="' + i + '" disabled'
        + ' aria-label="' + label(i, null) + '"><i class="mn-mk" aria-hidden="true"></i></button>';
    }
    return s;
  }
  function markup() {
    return CUC.frame('mines')
      + '<div class="bj-felt">'
      +   '<div class="mn-board" id="mnBoard">' + cells() + rules() + '</div>'
      +   '<div class="hl-line" id="mnLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="mnWhy" aria-expanded="false" aria-controls="mnPays">How it pays</button>'
      + '<div class="bj-pays" id="mnPays" hidden></div>'
      + '<div class="bj-sr" id="mnLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="mnNote" hidden></div>'
      + '<div class="warnbar" id="mnErr" hidden></div>'
      + '<div class="bj-ctl" id="mnBet">'
      +   '<div class="mn-pick"><span class="mn-lbl" id="mnLbl">Mines</span>'
      +     '<div class="bj-stakes" id="mnMines" role="group" aria-label="Mines"></div></div>'
      +   CUC.stakesHtml('mn')
      +   '<button type="button" class="bj-btn primary" id="mnDeal" title="Deal (Enter)">Deal</button></div>'
      // one button, because digging is pressing a cell and not pressing a button
      + '<div class="bj-ctl" id="mnPlay" hidden>'
      +   '<button type="button" class="bj-btn primary" data-op="cashout" id="mnCash" title="Cash out (C)">Cash out <b id="mnCashAmt">0</b></button></div>';
  }

  // --- the board --------------------------------------------------------------------------------

  // One cell. `anim` plays its mark's animation, `hidden` draws it as untouched although the state
  // says otherwise, which is how the end-of-round reveal opens the board a step at a time
  function cell(st, i, anim, hidden) {
    var c = el('mnC' + i); if (!c) return;
    var s = (hidden || !st || !st.grid) ? null : st.grid[i];
    var live = !!(st && st.phase === 'play');
    c.className = 'mn-c' + (s ? ' ' + s : '') + (anim ? (s === 'boom' ? ' blast' : ' flip') : '');
    c.disabled = !(live && s == null);
    c.setAttribute('aria-label', label(i, s));
  }
  function board(st, hide, anim) {
    for (var i = 0; i < CELLS; i++) cell(st, i, anim === i, !!(hide && hide[i]));
  }
  // Every cell the reveal still has to open, nearest to `from` first (Chebyshev rings, so the wave
  // goes outward rather than along the rows). A cell already dug is on screen and stays put
  function order(st, from) {
    var out = [], fx = from % SIDE, fy = Math.floor(from / SIDE);
    for (var i = 0; i < CELLS; i++) {
      if (i === from || st.grid[i] === 'safe') continue;
      out.push({ i: i, d: Math.max(Math.abs((i % SIDE) - fx), Math.abs(Math.floor(i / SIDE) - fy)) });
    }
    out.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
    return out.map(function (o) { return o.i; });
  }
  // Opens the board, and answers how long that takes. MN_T.revealStep a cell, except that 24 cells
  // at 40ms would run to 960: the step is SQUEEZED to fit MN_T.revealCap rather than the tail being
  // dropped, because a board that stops opening halfway reads as a board that broke. The tower's
  // ten floors never reach the cap and keep their own figure
  function open(st, from, lead) {
    var list = order(st, from);
    if (!list.length) return 0;
    var step = Math.min(MN_T.revealStep, MN_T.revealCap / Math.max(1, list.length - 1));
    for (var j = 0; j < list.length; j++) {
      (function (i, at) { mn.timers.at(lead + at, function () { cell(st, i, true); }); })(list[j], Math.round(j * step));
    }
    return Math.round((list.length - 1) * step);
  }

  // --- the line, the toggle and the read-out ----------------------------------------------------

  var MN_END = { boom: ['lose', 'Boom'], cashout: ['win', 'Cashed out'], cleared: ['bj', 'Cleared'] };
  function verdict(st) {
    var v = MN_END[st.ended] || ['', 'Round over'];
    return '<span class="bj-chip ' + v[0] + '">' + v[1] + ' ' + signed(st.net || 0) + '</span>';
  }
  function line(st) {
    var e = el('mnLine'); if (!e) return;
    if (!st || st.phase === 'bet') { e.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase === 'done') { e.innerHTML = verdict(st); return; }
    // before the first dig there is nothing to cash out, so the pot is the bet that is riding
    var html = CUC.pot(st.cash == null ? st.bet : st.cash, false);
    if (st.next) {
      html += '<span class="bj-chip" title="what one more safe cell pays, and the odds it is safe">'
        + mult(st.next.mult100) + ' · ' + st.next.chance.num + '/' + st.next.chance.den + '</span>';
    }
    e.innerHTML = html;
  }
  function side(st) {
    var e = el('mnSide'); if (!e) return;
    e.textContent = (st && st.phase !== 'bet' && st.left != null) ? st.left + ' left' : '';
  }
  // The ladder, folded. Twenty-five rows laid out on the felt would be the screen, so this is
  // behind the toggle and the one-line version is in the heading's title=
  function pays(st) {
    var box = el('mnPays'); if (!box) return;
    var rows = (st && st.ladder && st.ladder.length) ? st.ladder : null;
    var out = ['<div class="mn-pr"><b>Dug</b><b>Pays</b></div>'];
    if (rows) {
      for (var i = 0; i < rows.length; i++) {
        out.push('<div class="mn-pr"><span>' + rows[i].k + '</span><span>' + mult(rows[i].mult100)
          + ' · ' + fmtInt(rows[i].payout) + '</span></div>');
      }
    } else {
      // no bet yet, so there is no payout anybody is owed: the board's own geometry instead, which
      // the engine keeps apart from mult100 for exactly that reason
      var col = (st && st.fair && st.fair[pick(st)]) || [];
      for (var k = 0; k < col.length; k++) {
        out.push('<div class="mn-pr"><span>' + (k + 1) + '</span><span>' + mult(col[k]) + '</span></div>');
      }
    }
    box.innerHTML = out.join('');
  }
  function announce(st, c) {
    var said = [];
    if (st.phase === 'done') {
      said.push((MN_END[st.ended] || ['', 'Round over'])[1] + ' ' + signed(st.net || 0));
      said.push('Balance ' + fmtInt(CUC.balance() || 0));
    } else {
      said.push(cap(where(c)) + ' is clear');
      if (st.cash != null) said.push('Cash out ' + fmtInt(st.cash));
      if (st.next) said.push('Next ' + mult(st.next.mult100));
    }
    CUC.live('mnLive', said.join('. ') + '.');
  }

  // --- the mine count, which the deal chooses ---------------------------------------------------

  // The counts are the host's (`choices`) and so is the default (`mines`). The webview only
  // remembers which of them was picked last, the way the stakes remember theirs
  function choices(st) { return (st && st.choices && st.choices.length) ? st.choices : []; }
  function pick(st) {
    var list = choices(st), want = CUC.state().mnMines;
    if (list.indexOf(want) >= 0) return want;
    return (st && list.indexOf(st.mines) >= 0) ? st.mines : list[0];
  }
  function mines(st, locked) {
    var box = el('mnMines'); if (!box) return;
    var list = choices(st), now = pick(st);
    if (box.children.length !== list.length) {
      box.innerHTML = list.map(function (v) {
        return '<button type="button" data-m="' + v + '" aria-label="' + v + ' mines">' + v + '</button>';
      }).join('');
    }
    for (var i = 0; i < box.children.length; i++) {
      var b = box.children[i], on = Number(b.getAttribute('data-m')) === now;
      b.disabled = !!locked;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // --- controls ---------------------------------------------------------------------------------

  function controls(st, locked) {
    var play = !!(st && st.phase === 'play'), can = (st && st.can) || {};
    var bet = el('mnBet'), pl = el('mnPlay');
    if (bet) bet.hidden = play;
    if (pl) pl.hidden = !play;
    var amt = el('mnCashAmt');
    if (amt) amt.textContent = fmtInt((st && st.cash) || 0);
    var cash = el('mnCash');
    if (cash) cash.disabled = locked || !can.cashout;
    if (!play) { mines(st, locked); CUC.renderStakes(SU, locked); }
    side(st);
  }
  function lock() {
    var all = document.querySelectorAll('#panel-mines .mn-c, #mnPlay [data-op], #mnStakes button, #mnMines button');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('mnDeal'); if (d) d.disabled = true;
  }
  // Focus follows the screen that is up, and goes nowhere while the player is on a cell: taking the
  // focus off a half-dug board would cost the keyboard its place in the grid
  function focusAfter() {
    if (CUC.current() !== 'mines') return;
    var play = mn.st && mn.st.phase === 'play';
    var swapped = mn.phase != null && play !== (mn.phase === 'play');
    mn.phase = mn.st ? mn.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-mines');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!mn.wantFocus && !swapped && !lost) return;
    mn.wantFocus = false;
    var target = play ? el('mnC' + firstFree()) : el('mnDeal');
    if (target && !target.disabled) target.focus();
  }
  function firstFree() {
    for (var i = 0; i < CELLS; i++) { var c = el('mnC' + i); if (c && !c.disabled) return i; }
    return CENTRE;
  }

  // --- the host ---------------------------------------------------------------------------------

  function send(op, extra) {
    if (mn.busy) return;
    mn.busy = true; mn.op = op; mn.cell = (extra && extra.cell != null) ? extra.cell : null;
    if (op !== 'open') lock();
    mn.n = CUC.post('mn', op, extra);
    clearTimeout(mn.to);
    mn.to = setTimeout(function () {
      mn.busy = false; mn.op = null;
      CUC.err('mnErr', 'The table didn’t respond. Try again.');
      controls(mn.st, false);
    }, MN_T.noReply);
  }

  function receive(m) {
    var current = mn.op != null && m.n === mn.n;
    if (!current && mn.op != null) return;     // an older reply while a newer request waits
    CUC.setHeld('mn', m);
    if (!m.state) { var awaited = current; mn.op = null; return fault(m, awaited); }
    var op = current ? mn.op : null, dug = current ? mn.cell : null;
    clearTimeout(mn.to); mn.timers.clear();
    mn.op = null; mn.cell = null; mn.st = m.state;
    // acted: the reply to a move the player just made. A refused move changed nothing, so there is
    // nothing to pace: the board is drawn exactly as the host still holds it and nothing moves
    var acted = current && op !== 'open' && op !== 'deal' && !m.error;
    var fresh = acted && !CUC.reduceMotion();
    var settleAt = 0;
    try {
      CUC.err('mnErr', m.error || '');
      pays(mn.st);
      if (!fresh) { board(mn.st); controls(mn.st, true); line(mn.st); }
      else settleAt = paceMove(mn.st, op, dug);
    } finally {
      CUC.hold();
      if (settleAt) mn.timers.at(settleAt, function () { line(mn.st); });
      mn.timers.at(settleAt, function () { settle(m, acted, dug); });
    }
  }

  // Draws the move and answers when the money lands.
  //  a safe dig: that one cell turns over, and the numbers follow it at MN_T.safe
  //  a mine: the mine turns over first, then the whole board opens outward from it
  //  a cash-out or a cleared board: there is nothing to turn over first, so the board just opens
  function paceMove(st, op, dug) {
    if (st.phase !== 'done') {
      board(st, null, dug);
      lock();
      return MN_T.safe;
    }
    var boom = st.ended === 'boom';
    var from = boom ? st.hit : (st.dug.length ? st.dug[st.dug.length - 1] : CENTRE);
    var lead = boom ? MN_T.boom : (op === 'dig' ? MN_T.flip : 0);
    var hide = {};
    for (var i = 0; i < CELLS; i++) if (i !== from && st.grid[i] !== 'safe') hide[i] = 1;
    board(st, hide, op === 'dig' ? from : -1);
    lock();
    return lead + open(st, from, lead);
  }

  // A reply with no state: the host could not describe the board (games/README.md, section 5). The
  // reason shows and the board stays exactly as it is, gems, pot, next rung and all, because the
  // round is still the host's and nothing about it was decided here. mn.st is therefore kept, so
  // every redraw after this one is still drawn against the round the host holds.
  //
  // awaited is false for a reply nobody asked for, and then any pacing already running is left to
  // finish: it belongs to a state this reply says nothing about
  function fault(m, awaited) {
    CUC.err('mnErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    mn.busy = false;
    clearTimeout(mn.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    board(mn.st);
    controls(mn.st, false);
    focusAfter();
  }
  function settle(m, acted, dug) {
    mn.busy = false;
    try {
      CUC.settle(m);
      // the board is drawn again rather than only unlocked: paceMove() closed every cell while the
      // move was in flight, and a board left closed is a round that cannot be played on
      board(mn.st);
      line(mn.st);
      if (acted) announce(mn.st, dug);   // after the balance, so the line can say where it landed
    } finally {
      controls(mn.st, false);
      focusAfter();
    }
  }

  CUC.game('mines', {
    key: 'mn',
    cls: 'mn',
    markup: markup,
    init: function () {
      CUC.renderStakes(SU, false); line(null); mines(null, false); pays(null);
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, mn.busy); });
      el('mnMines').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b || b.disabled) return;
        var s = CUC.state(); s.mnMines = Number(b.getAttribute('data-m')); CUC.setState(s);
        mines(mn.st, false); pays(mn.st);
      });
      el('mnDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        send('deal', { bet: bet, mines: pick(mn.st) });
      });
      el('mnBoard').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.mn-c') : null;
        if (!b || b.disabled) return;
        send('dig', { cell: Number(b.getAttribute('data-c')) });
      });
      el('mnPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null;
        if (!b || b.disabled) return;
        send(b.getAttribute('data-op'));
      });
      CUC.why('mnWhy', 'mnPays');
    },
    enter: function () { mn.wantFocus = true; controls(mn.st, true); send('open'); },
    leave: function () { mn.timers.clear(); clearTimeout(mn.to); mn.busy = false; mn.op = null; mn.cell = null; },
    receive: receive,
    credits: function () { if (!mn.busy) { CUC.renderStakes(SU, false); controls(mn.st, false); } },
    // A round can be finished on the keyboard alone: Tab walks the board, Space or Enter digs the
    // cell the focus is on, C cashes out, Enter on the bet screen deals
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#mnPlay', k === 'c' ? 'cashout' : null, 'mnDeal', 'mnBet');
    }
  });
})();
