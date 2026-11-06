// Keno's screen: one question, "how many did I catch". The board of 40 is the biggest block and the
// draw lands on it a ball at a time. The marks are this screen's own until the draw carries them
// over (keno.js's header says why), and every figure printed afterwards is one view() sent: the
// multiple is `row.mult`, the catch is `hit`, the payout is `pay`. Nothing is priced here.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed, esc = CUC.esc;
  // The shared one, not a local '×' + n: a ten-catch pays 200,000 times the bet and the bare number
  // is the only figure on this screen without its thousands separated
  var xMult = CUC.xMult;

  // The board, which the markup is built out of before any reply has arrived. The host sends `pool`
  // and `draws` too, and they are the figures every sentence is written from
  var POOL = 40, COLS = 8, ROWS = 5, GAP = 2;

  // ball is one number coming out, mark is the beat the ticket settles on after the last of them
  // (10 balls at 90 is 900, plus 140) and chip is when the money lands
  // (docs/game-panels.md, section 6).
  //
  // 90 rather than 70: the draw is the third kind of pacing, the kind that NARROWS, and the floor
  // there is 70ms (four frames at 60fps) a step so that one ball reads as one event. 10 x 90 = 900
  // and the whole draw settles at 1,160, inside the 2,000ms a round may take. That budget is only
  // earned because a catch is now painted as its ball lands (board()): a stretch of 900ms in which
  // nothing is learned is not a narrowing, it is just a slow screen
  var KN_T = { ball: 90, mark: 1040, chip: 1160, noReply: 4000 };

  // The ticket. It is the webview's because marking costs no round trip, and it rides over to the
  // host as one array on the draw
  var kn = { st: null, marks: [], busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, phase: null, paid: false };
  var SU = CUC.stakeUi('kn');

  // --- the board --------------------------------------------------------------------------------

  // The k-th hairline sits in the k-th gap: k cells of (100% - gaps)/count, k gaps, less half a gap
  // and half a line to centre it. The cells are square, so the rows use the same unit
  function rules() {
    var s = '', k;
    for (k = 1; k < COLS; k++) {
      s += '<i class="gm-rule kn-rv" style="left:calc((100% - ' + ((COLS - 1) * GAP) + 'px)/' + COLS
        + '*' + k + ' + ' + (GAP * k - 1) + 'px)"></i>';
    }
    for (k = 1; k < ROWS; k++) {
      s += '<i class="gm-rule kn-rh" style="top:calc((100% - ' + ((ROWS - 1) * GAP) + 'px)/' + ROWS
        + '*' + k + ' + ' + (GAP * k - 1) + 'px)"></i>';
    }
    return s;
  }
  function numbers() {
    var s = '';
    for (var n = 1; n <= POOL; n++) {
      s += '<button type="button" class="kn-n" id="knN' + n + '" data-n="' + n + '"'
        + ' aria-pressed="false" aria-label="number ' + n + '">' + n + '</button>';
    }
    return s;
  }
  function markup() {
    return CUC.frame('keno')
      + '<div class="bj-felt">'
      +   '<div class="kn-board" id="knBoard" role="group" aria-label="Keno board, 1 to ' + POOL + '">'
      +     numbers() + rules() + '</div>'
      // HOW MANY TO MARK, BESIDE THE THING THAT MARKS THEM. This line used to be drawn inside
      // .kn-near, which measures 71px below the board with Quick pick, the stakes and the felt's
      // own edge in between: the eye on the board never met it (docs/game-panels.md, 5-8)
      +   '<div class="kn-acts">'
      +     '<span class="kn-hint" id="knHint"></span>'
      +     '<button type="button" class="kn-act" id="knQuick">Quick pick</button></div>'
      +   '<div class="hl-line" id="knLine"></div>'
      + '</div>'
      + '<div class="kn-near" id="knNear"></div>'
      + '<button type="button" class="bj-why" id="knWhy" aria-expanded="false" aria-controls="knPays">How it pays</button>'
      + '<div class="bj-pays" id="knPays" hidden></div>'
      + '<div class="bj-sr" id="knLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="knNote" hidden></div>'
      + '<div class="warnbar" id="knErr" hidden></div>'
      + '<div class="bj-ctl" id="knBet">' + CUC.stakesHtml('kn')
      +   '<button type="button" class="bj-btn primary" id="knDeal" title="Deal (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="knPlay" hidden>'
      +   '<button type="button" class="bj-btn" data-op="clear" id="knClear" title="Clear the ticket (C)">Clear</button>'
      +   '<button type="button" class="bj-btn primary" data-op="draw" id="knDraw" title="Draw (D)">Draw</button></div>';
  }

  function counts(st) { return (st && st.counts && st.counts.length) ? st.counts : []; }
  function legal(st) { return counts(st).indexOf(kn.marks.length) >= 0; }
  // The ticket the board is drawn from: the host's record once the round is settled, this screen's
  // own marks before that. The two are the same ticket; only one of them is a fact yet
  function ticket(st) { return (st && st.phase === 'done' && st.picks) ? st.picks : kn.marks; }

  // `balls` is how many of the draw are out, for the pacing. null means the final picture
  function board(st, balls, locked) {
    var done = !!(st && st.phase === 'done');
    var mine = ticket(st), all = (done && st.drawn) ? st.drawn : [];
    var out = balls == null ? all : all.slice(0, balls);
    var markable = !locked && !done;
    for (var n = 1; n <= POOL; n++) {
      var b = el('knN' + n); if (!b) continue;
      var on = mine.indexOf(n) >= 0, hit = out.indexOf(n) >= 0, k = [];
      // A BALL IS PAINTED AS A CATCH OR A MISS THE MOMENT IT LANDS. The draw used to hold that back
      // until every ball had stopped, which left the ten balls as 700ms in which the player learned
      // nothing and put the whole round in one beat at the end. Caught numbers now pile up while the
      // balls come out, which is what makes this a replay that narrows rather than a wait
      // (docs/game-panels.md, 5-8 and section 6)
      if (hit) k.push(on ? 'hit' : 'miss');
      else if (on) k.push('on');
      // only the newest ball pops, or every repaint would restart all of them at once
      if (balls != null && hit && all[balls - 1] === n) k.push('ball');
      b.className = 'kn-n' + (k.length ? ' ' + k.join(' ') : '');
      b.disabled = !markable;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', 'number ' + n + (on ? ', marked' : '') + (hit ? ', drawn' : ''));
    }
    var side = el('knSide');
    if (side) side.textContent = mine.length + ' picked';
  }

  // --- the line, the near rows, the toggle and the read-out -------------------------------------

  function line(st) {
    var e = el('knLine'); if (!e) return;
    if (!st || st.phase !== 'done') {
      e.innerHTML = CUC.pot(st && st.bet ? st.bet : CUC.stake(SU), !st || st.phase === 'bet');
      return;
    }
    var won = (st.pay || 0) > 0;
    e.innerHTML = '<span class="bj-chip">' + st.hit + ' of ' + st.picks.length + '</span>'
      + '<span class="bj-chip ' + (won ? 'win' : 'lose') + '">'
      + (won ? xMult(st.mult) + ' · ' + signed(st.net || 0) : 'No win ' + signed(st.net || 0)) + '</span>';
  }
  // The two rows of the table that are about to matter, and only those two. Sixty rows on the felt
  // would be the screen, so the rest is behind the toggle.
  //  marking: the lowest row this board pays and the one above it, which is what a ticket of this
  //           size is bought for
  //  settled: the row it landed on and the one above it, which is the "one more number" row
  // How many numbers this board takes, on the felt beside Quick pick. IT IS A DESCRIPTION OF THE
  // STATE AND NOT A NOTICE: mark two and it goes away on its own, and the two paying rows take the
  // space over. That is why it needs no "the player has seen this once" flag; such a flag would
  // also mean two windows drawing two different boards
  function hint(st) {
    var e = el('knHint'); if (!e) return;
    var list = counts(st);
    var show = st && st.phase !== 'done' && list.length && !legal(st);
    e.textContent = show ? 'Mark ' + list[0] + ' to ' + list[list.length - 1] + ' numbers' : '';
  }
  function near(st) {
    hint(st);   // both are drawn from the one fact, which is how many of the ticket is marked
    var e = el('knNear'); if (!e) return;
    if (!st) { e.innerHTML = ''; return; }
    if (st.phase === 'done' && st.table) {
      e.innerHTML = row(st.table.rows[st.hit], 'now') + row(st.table.rows[st.hit + 1], 'up');
      return;
    }
    // the hint beside the board carries the "mark 2 to 10" case now, so this box holds the paying
    // rows and nothing else (docs/game-panels.md, 5-8)
    if (!legal(st)) { e.innerHTML = ''; return; }
    var t = byPicks(st, kn.marks.length);
    if (!t) { e.innerHTML = ''; return; }
    e.innerHTML = row(t.rows[t.from], 'now') + row(t.rows[t.from + 1], 'up');
  }
  function row(r, cls) {
    if (!r || !r.mult) return '';
    return '<div class="kn-' + cls + '"><span>Catch ' + r.hit + '</span><span>×' + r.mult + '</span></div>';
  }
  function byPicks(st, k) {
    var list = (st && st.tables) || [];
    for (var i = 0; i < list.length; i++) if (list[i].picks === k) return list[i];
    return null;
  }
  // Every table, folded away, one line a ticket size with only the rows that pay. The engine hands
  // over the unpaid rows too and they are the game, but they are also four fifths of sixty lines
  function pays(st) {
    var box = el('knPays'); if (!box) return;
    var list = (st && st.tables) || [];
    if (!list.length || kn.paid) return;
    box.innerHTML = list.map(function (t) {
      var bits = t.rows.filter(function (r) { return r.mult > 0; })
        .map(function (r) { return r.hit + ' ×' + r.mult; }).join(' · ');
      return '<div class="kn-pr"><b>' + t.picks + '-spot</b><span>' + esc(bits) + '</span></div>';
    }).join('');
    kn.paid = true;   // the tables never change, so they are built once
  }
  function announce(st) {
    if (!st || st.phase !== 'done') return;
    var said = ['Caught ' + st.hit + ' of ' + st.picks.length];
    said.push((st.pay || 0) > 0 ? xMult(st.mult) + ', ' + signed(st.net || 0) : 'no win, ' + signed(st.net || 0));
    said.push('Balance ' + fmtInt(CUC.balance() || 0));
    CUC.live('knLive', said.join('. ') + '.');
  }

  // --- the ticket -------------------------------------------------------------------------------

  function toggle(n) {
    var i = kn.marks.indexOf(n);
    if (i >= 0) kn.marks.splice(i, 1);
    else if (kn.marks.length < (counts(kn.st)[counts(kn.st).length - 1] || 0)) kn.marks.push(n);
    else return false;
    return true;
  }
  // A quick pick is the player's own input and not an outcome, so an unseeded shuffle is right
  // here: nothing about what the board PAYS is decided in this file. It fills the ticket to the
  // size already marked when that is a size the game offers, and otherwise to the middle one
  function quick(st) {
    var list = counts(st);
    if (!list.length) return;
    var want = list.indexOf(kn.marks.length) >= 0 ? kn.marks.length : list[Math.floor(list.length / 2)];
    var bag = [];
    for (var n = 1; n <= POOL; n++) bag.push(n);
    for (var i = bag.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = bag[i]; bag[i] = bag[j]; bag[j] = t;
    }
    kn.marks = bag.slice(0, want).sort(function (a, b) { return a - b; });
  }

  // --- controls ---------------------------------------------------------------------------------

  function controls(st, locked) {
    var play = !!(st && st.phase === 'draw'), can = (st && st.can) || {};
    var bet = el('knBet'), pl = el('knPlay');
    if (bet) bet.hidden = play;
    if (pl) pl.hidden = !play;
    var draw = el('knDraw');
    if (draw) draw.disabled = locked || !can.draw || !legal(st);
    var clear = el('knClear');
    if (clear) clear.disabled = locked || !kn.marks.length;
    var q = el('knQuick');
    if (q) q.disabled = locked || !!(st && st.phase === 'done');
    if (!play) CUC.renderStakes(SU, locked);
  }
  function lock() {
    var all = document.querySelectorAll('#panel-keno .kn-n, #knPlay [data-op], #knStakes button, #knQuick');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('knDeal'); if (d) d.disabled = true;
  }
  function focusAfter() {
    if (CUC.current() !== 'keno') return;
    var play = kn.st && kn.st.phase === 'draw';
    var swapped = kn.phase != null && play !== (kn.phase === 'draw');
    kn.phase = kn.st ? kn.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-keno');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!kn.wantFocus && !swapped && !lost) return;
    kn.wantFocus = false;
    var target = play ? (legal(kn.st) ? el('knDraw') : el('knN1')) : el('knDeal');
    if (target && !target.disabled) target.focus();
  }

  // --- the host ---------------------------------------------------------------------------------

  function send(op, extra) {
    if (kn.busy) return;
    kn.busy = true; kn.op = op;
    if (op !== 'open') lock();
    kn.n = CUC.post('kn', op, extra);
    clearTimeout(kn.to);
    kn.to = setTimeout(function () {
      kn.busy = false; kn.op = null;
      CUC.err('knErr', 'The table didn’t respond. Try again.');
      board(kn.st, null, false); controls(kn.st, false);
    }, KN_T.noReply);
  }

  function receive(m) {
    var current = kn.op != null && m.n === kn.n;
    if (!current && kn.op != null) return;     // an older reply while a newer request waits
    CUC.setHeld('kn', m);
    if (!m.state) { var awaited = current; kn.op = null; return fault(m, awaited); }
    var op = current ? kn.op : null;
    clearTimeout(kn.to); kn.timers.clear();
    kn.op = null; kn.st = m.state;
    // acted: the reply to the draw the player just asked for. A refused draw changed nothing, so
    // there is nothing to pace: the ticket is drawn as it stands and no ball comes out
    var acted = current && op === 'draw' && !m.error;
    var fresh = acted && !CUC.reduceMotion();
    var settleAt = 0;
    try {
      CUC.err('knErr', m.error || '');
      pays(kn.st);
      if (!fresh) { board(kn.st, null, true); controls(kn.st, true); line(kn.st); near(kn.st); }
      else settleAt = paceDraw(kn.st);
    } finally {
      CUC.hold();
      if (settleAt) kn.timers.at(settleAt, function () { line(kn.st); near(kn.st); });
      kn.timers.at(settleAt, function () { settle(m, acted); });
    }
  }

  // The draw: ten numbers come out one at a time, then the marks settle onto the ticket, then the
  // money lands. The two beats are the point. Which of yours matched is only readable once the
  // balls have stopped, so the ticket is not recoloured while they are still coming
  function paceDraw(st) {
    board(st, 0, true);
    for (var i = 1; i <= (st.drawn || []).length; i++) {
      (function (k) { kn.timers.at(k * KN_T.ball, function () { board(st, k, true); }); })(i);
    }
    kn.timers.at(KN_T.mark, function () { board(st, null, true); });
    return KN_T.chip;
  }

  // A reply with no state: the host could not describe the round (games/README.md, section 5). The
  // reason shows and the ticket stays exactly as it is, because the round is still the host's and
  // nothing about it was decided here. kn.st is therefore kept, so every redraw after this one is
  // still drawn against the round the host holds.
  //
  // awaited is false for a reply nobody asked for, and then any pacing already running is left to
  // finish: it belongs to a state this reply says nothing about
  function fault(m, awaited) {
    CUC.err('knErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    kn.busy = false;
    clearTimeout(kn.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    board(kn.st, null, false);
    controls(kn.st, false);
    focusAfter();
  }
  function settle(m, acted) {
    kn.busy = false;
    try {
      CUC.settle(m);
      // the board is drawn again rather than only unlocked: paceDraw() closed every number while
      // the draw was in flight
      board(kn.st, null, false);
      line(kn.st); near(kn.st);
      if (acted) announce(kn.st);   // after the balance, so the line can say where it landed
    } finally {
      controls(kn.st, false);
      focusAfter();
    }
  }
  // Marking is local, so the whole screen that depends on it is redrawn here and nowhere else
  function redraw() {
    board(kn.st, null, kn.busy);
    controls(kn.st, kn.busy);
    near(kn.st);
  }

  CUC.game('keno', {
    key: 'kn',
    cls: 'kn',
    markup: markup,
    init: function () {
      board(null, null, false); line(null); near(null);
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, kn.busy); });
      el('knDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        send('deal', { bet: bet });
      });
      el('knBoard').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.kn-n') : null;
        if (!b || b.disabled) return;
        if (toggle(Number(b.getAttribute('data-n')))) redraw();
      });
      el('knQuick').addEventListener('click', function () {
        if (this.disabled) return;
        quick(kn.st); redraw();
      });
      el('knPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null;
        if (!b || b.disabled) return;
        var op = b.getAttribute('data-op');
        if (op === 'clear') { kn.marks = []; redraw(); return; }   // the ticket is this screen's
        send('draw', { picks: kn.marks.slice() });
      });
      CUC.why('knWhy', 'knPays');
    },
    enter: function () { kn.wantFocus = true; board(kn.st, null, true); controls(kn.st, true); send('open'); },
    leave: function () { kn.timers.clear(); clearTimeout(kn.to); kn.busy = false; kn.op = null; },
    receive: receive,
    credits: function () { if (!kn.busy) { CUC.renderStakes(SU, false); controls(kn.st, false); } },
    // A round can be finished on the keyboard alone, which is what makes a 21px cell a decision
    // rather than an oversight: Tab walks the board, Space or Enter marks the number in focus,
    // Q fills the ticket, C clears it, D draws, Enter on the bet screen deals
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      if (k === 'q') {
        var q = el('knQuick');
        if (q && !q.disabled) { e.preventDefault(); q.click(); }
        return;
      }
      CUC.press(e, '#knPlay', { c: 'clear', d: 'draw' }[k] || null, 'knDeal', 'knBet');
    }
  });
})();
