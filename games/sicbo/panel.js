// Sic Bo's screen: did the three dice land in the square I bet on?
//
// The host owns the roll, the four bet shapes and every price (sicbo.js). This screen puts the
// host's own rows on the felt as squares, sends the one that is lit with the deal, and then shows
// WHERE THE ROLL LANDED by ringing that square in cream. That ring is the whole reason this screen
// needs no sentence: a bet on Small with the Triple square ringed has explained itself.
//
// A roll settles on the press, so there is no live phase: the bet row is the only control row, and
// `phase` is 'bet' before the first roll and 'done' after every one.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The three dice land 140 apart, which is what makes the third one feel like it was nearly the
  // one that made a triple. The ring follows the last of them and the chip follows the ring
  // (docs/game-panels.md, the dice family's timing table). Class 1: the answer arrives at once and
  // nothing is narrowed down on the way, so the whole thing is inside a second.
  // `in` is the .16s on `.sb-die.in .dc` in games/sicbo/meta.js
  var SB_T = { dice: [180, 320, 460], hit: 520, chip: 580, in: 160, noReply: 4000 };

  var sb = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false,
    kind: null, total: null };
  // the table's floor. 100 closes the 10 chip, opens the screen on 100 and asks for 100 in the
  // short-purse note (webview.js, stakeUi)
  var SU = CUC.stakeUi('sb', { min: 100 });
  var KIND_KEY = 'sbKind', TOTAL_KEY = 'sbTotal';   // the chosen bet, remembered as the stakes are

  // The dice are CUC.die(face, 48): one <use> into the sprite html.js puts in the page. Face 0 is
  // the unrolled die and the cell's own `color` is the body's, which is what this screen wants
  // cream (games/sicbo/meta.js, .sb-die)

  // --- markup ---------------------------------------------------------------------------------

  function markup() {
    return CUC.frame('sicbo')
      + '<div class="bj-felt">'
      +   '<div class="sb-dice" id="sbDice" role="img" aria-label="No roll yet"></div>'
      +   '<div class="sb-board" id="sbBoard">'
      +     '<div class="sb-row kinds" id="sbKinds"></div>'
      +     '<div class="sb-row totals" id="sbTotals"></div>'
      +   '</div>'
      +   '<div class="sb-read" id="sbRead"></div>'
      +   '<div class="hl-line" id="sbLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="sbWhy" aria-expanded="false" aria-controls="sbPays">How it pays</button>'
      + '<div class="bj-pays" id="sbPays" hidden></div>'
      + '<div class="bj-sr" id="sbLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="sbNote" hidden></div>'
      + '<div class="warnbar" id="sbErr" hidden></div>'
      + '<div class="bj-ctl" id="sbBet">' + CUC.stakesHtml('sb')
      +   '<button type="button" class="bj-btn primary" id="sbDeal" title="Roll (Enter)">Roll</button></div>';
  }

  // --- the bet, which is one of the host's own rows -------------------------------------------

  function rows(st) { return (st && st.pays) || []; }
  // The row a (kind, total) pair names, out of the host's list. A pair that is not on it is not a
  // bet, which is what makes the fallback below a fallback and not a guess
  function rowAt(st, kind, total) {
    var all = rows(st);
    for (var i = 0; i < all.length; i++) {
      if (all[i].kind !== kind) continue;
      if (kind !== 'total' || all[i].total === total) return all[i];
    }
    return null;
  }
  // Which square is lit. The host's own list is what makes a choice valid, so a remembered bet that
  // is no longer a row falls back to the first row on the list rather than being sent
  function bet(st) {
    var s = CUC.state() || {};
    var kind = sb.kind != null ? sb.kind : s[KIND_KEY];
    var total = sb.total != null ? sb.total : s[TOTAL_KEY];
    if (rowAt(st, kind, total)) return { kind: kind, total: total };
    var all = rows(st);
    if (all.length) return { kind: all[0].kind, total: all[0].total };
    return { kind: kind || null, total: total == null ? null : total };
  }
  // The word on a square. The host's `name` is the full 'Small 4-10', which is what the read-out
  // line says; a square 20px wide carries the bare word (docs/game-panels.md, 5-13: 이름만)
  var SHORT = { small: 'Small', big: 'Big', triple: 'Triple' };

  // --- the felt ------------------------------------------------------------------------------

  function buildDice(n) {
    var box = el('sbDice'); if (!box || box.children.length === n) return;
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="sb-die" id="sbD' + i + '"></div>';
    box.innerHTML = out;
  }
  function setDie(i, face, anim) {
    var e = el('sbD' + i); if (!e) return;
    e.classList.remove('in');
    e.innerHTML = CUC.die(face, 48);
    if (anim) { void e.getBoundingClientRect(); e.classList.add('in'); }
  }
  // The art is aria-hidden, so the row of dice carries their numbers, the rule the pixel cards keep
  // with CUC.cardWord and the sea symbols with CUC.symWord
  function diceLabel(st, shown) {
    var box = el('sbDice'); if (!box) return;
    var dice = (st && st.dice) || [];
    box.setAttribute('aria-label', (shown && dice.length >= shown) ? 'Rolled ' + dice.slice(0, shown).join(', ') : 'No roll yet');
  }
  // `shown` is how many of the three have landed. Before a roll that is none of them, and the cells
  // stand up the UNROLLED die: a felt that looks the same before and after the deal is the one
  // mistake this family was built to avoid (docs/game-panels.md, 5-12 to 5-15)
  function drawDice(st, shown) {
    var n = (st && st.diceCount) || 3;   // until the host has spoken, Sic Bo is three dice
    buildDice(n);
    var dice = (st && st.dice) || [];
    for (var i = 0; i < n; i++) setDie(i, (i < shown && dice[i] != null) ? dice[i] : 0, false);
    diceLabel(st, Math.min(shown, n));
  }
  // Which squares the roll actually landed in: the square of its total, and `Triple` when all three
  // were alike. A triple of ones totals 3, which no square carries, so the ring is then the Triple
  // square alone
  function landed(st, row) {
    if (!st || st.phase !== 'done') return false;
    if (row.kind === 'triple') return st.triple != null;
    if (row.kind === 'total') return row.total === st.sum;
    return false;
  }
  function drawBoard(st, ring) {
    var kinds = el('sbKinds'), totals = el('sbTotals'); if (!kinds || !totals) return;
    var all = rows(st), on = bet(st), a = '', b = '';
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      var lit = r.kind === on.kind && (r.kind !== 'total' || r.total === on.total);
      var hit = ring && landed(st, r);
      var cell = '<button type="button" class="sb-cell' + (lit ? ' on' : '') + (hit ? ' hit' : '') + '"'
        + ' data-kind="' + CUC.esc(r.kind) + '"' + (r.total != null ? ' data-total="' + r.total + '"' : '')
        + ' aria-pressed="' + (lit ? 'true' : 'false') + '"'
        + ' title="' + CUC.esc(r.name) + '">'
        + CUC.esc(r.kind === 'total' ? String(r.total) : (SHORT[r.kind] || r.name)) + '</button>';
      if (r.kind === 'total') b += cell; else a += cell;
    }
    kinds.innerHTML = a;
    totals.innerHTML = b;
  }
  // The one line under the board: the chosen row's own name and its own multiple, both the host's.
  // The chance is not on it, and that is width rather than taste: 'Small 4-10' plus '×1.99' is 82px
  // at 10.5px and the chance takes it to 148, which folds at the felt's 152
  function drawRead(st) {
    var box = el('sbRead'); if (!box) return;
    var on = bet(st);
    var row = (st && st.phase === 'done' && st.row) ? st.row : rowAt(st, on.kind, on.total);
    if (!row) { box.innerHTML = ''; return; }
    // `row.note` ("any triple loses") is NOT on this line. 'Small 4-10' and its multiple are 88px
    // at 10.5px and the note takes the line to 169, which folds at the felt's 152: the note is one
    // of the three things 5-13 sends behind the ? (with pays[17] and the chance)
    box.innerHTML = '<b>' + CUC.esc(row.name) + '</b><i>' + CUC.esc(CUC.xMult100(row.mult100)) + '</i>';
  }

  // --- the line, the folded table and what is read out ----------------------------------------

  function verdict(st) {
    var row = st.row || {}, net = st.net || 0;
    return (st.win ? CUC.esc(row.name || '') + ' ' + CUC.xMult100(st.mult100) : 'No') + ' ' + signed(net);
  }
  // `pop` is true only on the chip's own moment. Every other redraw (a credit minted, a square
  // picked, a walk back into the screen) is a result already shown, and `.still` is what stops it
  // being animated in a second time
  function sbLine(st, pop) {
    var line = el('sbLine'); if (!line) return;
    if (!st || st.phase !== 'done') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    var net = st.net || 0, cls = net > 0 ? ' win' : net < 0 ? ' lose' : '';
    line.innerHTML = (st.win ? CUC.pot(st.payout, false) : '')
      + '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + verdict(st) + '</span>';
  }
  // Seventeen rows is a table, so it lives behind the ? and the one-line version is in the heading's
  // title= (games/sicbo/meta.js, hint). The counts are the host's num/den exactly as they arrive,
  // never divided into a percentage
  function sbPays(st) {
    var box = el('sbPays'); if (!box) return;
    var all = rows(st), on = bet(st), out = '<div class="sb-pay head"><span>bet</span><b>pays</b><b>in ' + fmtInt(st && st.faces ? st.faces : 216) + '</b></div>';
    for (var i = 0; i < all.length; i++) {
      var r = all[i];
      var lit = r.kind === on.kind && (r.kind !== 'total' || r.total === on.total);
      out += '<div class="sb-pay' + (lit ? ' on' : '') + '"><span>' + CUC.esc(r.name) + '</span>'
        + '<b>' + CUC.esc(CUC.xMult100(r.mult100)) + '</b><b>' + fmtInt(r.chance.num) + '</b></div>';
    }
    // and the host's own note for the row that is lit, on a line of its own: it is a sentence, and
    // the only place on this screen with room for one
    var row = rowAt(st, on.kind, on.total);
    if (row && row.note) out += '<div class="sb-pay note">' + CUC.esc(row.note) + '</div>';
    box.innerHTML = out;
  }
  function sbAnnounce(st) {
    if (!st || st.phase !== 'done') return;
    var said = 'Rolled ' + (st.dice || []).join(', ') + '. Total ' + st.sum + '.';
    if (st.triple != null) said += ' Three ' + st.triple + 's.';
    said += ' ' + ((st.row && st.row.name) || '') + (st.win ? ' wins, pays ' + fmtInt(st.payout) : ' loses') + '. '
      + signed(st.net || 0) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.';
    CUC.live('sbLive', said);
  }

  // --- controls -------------------------------------------------------------------------------

  function sbControls(st, locked) {
    CUC.renderStakes(SU, locked);
    var cells = document.querySelectorAll('#sbBoard .sb-cell');
    for (var i = 0; i < cells.length; i++) cells[i].disabled = locked;
    sbPays(st);
  }
  function sbFocusAfter() {
    if (CUC.current() !== 'sicbo') return;
    var a = document.activeElement, panel = el('panel-sicbo');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!sb.wantFocus && !lost) return;
    sb.wantFocus = false;
    var d = el('sbDeal'); if (d && !d.disabled) d.focus();
  }

  function sbSend(op, extra) {
    if (sb.busy) return;
    sb.busy = true; sb.op = op;
    if (op !== 'open') sbControls(sb.st, true);
    sb.n = CUC.post('sb', op, extra);
    clearTimeout(sb.to);
    sb.to = setTimeout(function () {
      sb.busy = false; sb.op = null;
      CUC.err('sbErr', 'The table didn’t respond. Try again.');
      sbControls(sb.st, false);
    }, SB_T.noReply);
  }

  // The dice land first, then the ring, then the figure: a result that arrived before the third die
  // would give the roll away
  function sbReceive(m) {
    var current = sb.op != null && m.n === sb.n;
    if (!current && sb.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('sb', m);
    if (!m.state) { var awaited = current; sb.op = null; return sbFault(m, awaited); }
    var op = current ? sb.op : null;
    clearTimeout(sb.to); sb.timers.clear();
    sb.op = null; sb.st = m.state;
    if (sb.st.kind) { sb.kind = sb.st.kind; sb.total = sb.st.total; }   // the bet the host really took
    // rolled: the reply to a press the player just made. A refused roll changed nothing, and a
    // reply nobody asked for is a roll this screen is being told about rather than one it pressed,
    // so both are drawn where they stand: pacing either would roll the same dice a second time
    var rolled = current && op === 'deal' && !m.error && sb.st.phase === 'done';
    var fresh = rolled && !CUC.reduceMotion();
    try {
      CUC.err('sbErr', m.error || '');
      drawRead(sb.st);
      if (fresh) { drawDice(sb.st, 0); drawBoard(sb.st, false); }   // the dice go blank, then land
      else { drawDice(sb.st, (sb.st.dice || []).length); drawBoard(sb.st, true); sbLine(sb.st, rolled); }
      sbControls(sb.st, true);
    } finally {
      CUC.hold();   // the header waits for the dice
      if (fresh) {
        var dice = sb.st.dice || [];
        for (var i = 0; i < dice.length; i++) {
          (function (k) {
            sb.timers.at(SB_T.dice[k] != null ? SB_T.dice[k] : SB_T.dice[SB_T.dice.length - 1], function () {
              setDie(k, sb.st.dice[k], true);
              diceLabel(sb.st, k + 1);
            });
          })(i);
        }
        sb.timers.at(SB_T.hit, function () { drawBoard(sb.st, true); });
        sb.timers.at(SB_T.chip, function () { sbLine(sb.st, true); });
      }
      sb.timers.at(fresh ? SB_T.chip : 0, function () { sbSettle(m, rolled); });
    }
  }
  // A reply with no state: the host could not describe the roll (games/README.md, section 5). The
  // reason shows and the felt stays exactly as it is, dice, lit square and ring included, because
  // it is the describing that failed and not the dice. sb.st is kept, so the next redraw is still
  // drawn against the host's own round
  function sbFault(m, awaited) {
    CUC.err('sbErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    sb.busy = false;
    clearTimeout(sb.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    sbControls(sb.st, false);
    sbFocusAfter();
  }
  function sbSettle(m, rolled) {
    sb.busy = false;
    try {
      CUC.settle(m);
      if (rolled) sbAnnounce(sb.st);   // after the balance, so it can say where the dice landed
    } finally {
      sbControls(sb.st, false);
      sbFocusAfter();
    }
  }

  CUC.game('sicbo', {
    key: 'sb',
    cls: 'sb',
    markup: markup,
    init: function () {
      drawDice(null, 0);   // three unrolled dice from the first paint of this panel
      sbLine(null);
      // Picking a stake does not redraw the line: renderStakes writes the figure straight into the
      // preview (ui.preview), and when the line is holding a result that is the last thing that
      // happened. Redrawing it would also replace the chip a millisecond after it popped
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, sb.busy); });
      el('sbBoard').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.sb-cell') : null; if (!b || b.disabled) return;
        sb.kind = b.getAttribute('data-kind');
        var t = b.getAttribute('data-total');
        sb.total = t == null ? null : Number(t);
        var s = CUC.state() || {}; s[KIND_KEY] = sb.kind; s[TOTAL_KEY] = sb.total; CUC.setState(s);
        // the square the player is about to roll on, and what it pays. A finished roll keeps its
        // ring and its chip: that is what the balance did, and picking a square did not change it
        drawBoard(sb.st, true);
        drawRead(sb.st);
        sbPays(sb.st);
        var d = el('sbDeal'); if (d && !d.disabled) d.focus();
      });
      el('sbDeal').addEventListener('click', function () {
        var v = Number(this.getAttribute('data-bet')); if (!v) return;
        var on = bet(sb.st);
        sbSend('deal', { bet: v, kind: on.kind, total: on.total });
      });
      CUC.why('sbWhy', 'sbPays');
    },
    enter: function () { sb.wantFocus = true; sbControls(sb.st, true); sbSend('open'); },
    leave: function () {
      sb.timers.clear();
      clearTimeout(sb.to);
      sb.busy = false; sb.op = null;
    },
    receive: sbReceive,
    // a credit minted while the bet row is up lights the chips at once. The line is left alone for
    // the reason in init()
    credits: function () { if (!sb.busy) sbControls(sb.st, false); },
    // There is nothing to play inside a roll, so Enter on the bet row is the whole keyboard; the
    // seventeen squares are buttons and are reached by Tab
    keys: function (e) { CUC.press(e, '#sbBet', null, 'sbDeal', 'sbBet'); }
  });
})();
