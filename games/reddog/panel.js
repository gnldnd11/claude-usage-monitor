// Red Dog's screen: two cards, and the space between them is the question. The host deals, prices
// the gap and rules on the third card; this lays the two down, puts the spread and what it pays in
// the space they leave, and drops the third card into it.
//
// Nothing here is worked out: the spread, the odds, the chance, the wager and the net all come off
// view(), and the only arithmetic in the file is the clock.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, esc = CUC.esc, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // The deal lays the two openers down at blackjack's own interval and the gap's figures follow
  // them. `third` is counted from the start of the beat that drops the third card, and that beat
  // starts at the move for a raise or a stand, and at `spread` for a pair, which deals its third
  // card at the table with nothing to decide (docs/game-panels.md, section 6).
  // `card` is the length of .rd-card.in in meta.js: the same fact written twice, so retime both
  var RD_T = {
    one: 0, two: 170, spread: 300,
    third: 220, settle: 220, unlock: 40,
    card: 160,
    noReply: 4000
  };
  var rd = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, phase: null };
  var SU = CUC.stakeUi('rd');

  function markup() {
    return CUC.frame('reddog')
      + '<div class="bj-felt">'
      +   '<div class="rd-stage">'
      +     '<div class="bj-crab"><img src="' + CUC.crab() + '" alt=""/></div>'
      +     '<div class="rd-cards" id="rdCards">'
      +       '<div class="rd-card rd-a" id="rdA" role="img" aria-label="No card"></div>'
      +       '<div class="rd-card rd-b" id="rdB" role="img" aria-label="No card"></div>'
      +       '<div class="rd-gap" id="rdGap" role="img" aria-label="No hand" hidden></div>'
      +       '<div class="rd-card rd-c" id="rdC" role="img" aria-label="No card" hidden></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="hl-line" id="rdLine"></div>'
      + '</div>'
      + '<div class="bj-sr" id="rdLive" aria-live="polite"></div>'
      + '<button type="button" class="bj-why" id="rdWhy" aria-expanded="false">How it pays</button>'
      + '<div class="bj-pays" id="rdPays" hidden></div>'
      + '<div class="bj-note" id="rdNote" hidden></div>'
      + '<div class="warnbar" id="rdErr" hidden></div>'
      + '<div class="bj-ctl" id="rdBet">' + CUC.stakesHtml('rd')
      +   '<button type="button" class="bj-btn primary" id="rdDeal" title="Deal (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="rdPlay" hidden>'
      +   '<button type="button" class="bj-btn primary" id="rdRaise" data-op="raise" title="Raise (R)">Raise</button>'
      +   '<button type="button" class="bj-btn" data-op="stand" title="Stand (S)">Stand</button></div>';
  }

  // --- the cards. They are drawn as aria-hidden art, so each one carries its own name
  function rdCard(id, c, animate) {
    var e = el(id); if (!e) return;
    e.classList.remove('in');
    e.innerHTML = c ? CUC.cardFace(c, 4) : '';
    e.setAttribute('aria-label', c ? CUC.cardWord(c) : 'No card');
    if (animate && c) { void e.getBoundingClientRect(); e.classList.add('in'); }
  }
  function rdThird(c, animate) {
    var e = el('rdC'); if (!e) return;
    e.hidden = !c;
    rdCard('rdC', c, animate);
  }
  function rdPart(on) {
    var box = el('rdCards'); if (box) box.classList.toggle('part', !!on);
  }

  // The space between the two cards, which is the whole question: how many ranks it covers and
  // what the house pays for a third card landing in it. `shown` is how many cards are on the felt,
  // so the gap closes the moment the third one is in it rather than when the reply arrived.
  //
  // A pair has no spread at all (it is the other branch, not a narrow gap), so it shows its price
  // and no number; a consecutive pair shows the 0 that IS the reason it pushes
  function rdGap(st, shown) {
    var g = el('rdGap'); if (!g) return;
    var show = !!st && st.kind != null && shown === 2;
    g.hidden = !show;
    if (!show) { g.innerHTML = ''; g.setAttribute('aria-label', 'No hand'); return; }
    var row = st.row || {};
    g.innerHTML = (st.spread == null ? '' : '<b class="rd-spread">' + esc(String(st.spread)) + '</b>')
      + (row.odds == null ? '' : '<span class="bj-chip">' + esc(row.odds + ' to 1') + '</span>');
    g.setAttribute('aria-label', rdGapWord(st));
  }
  function rdGapWord(st) {
    var row = (st && st.row) || {};
    var paying = row.odds == null ? '' : ', paying ' + row.odds + ' to 1';
    if (st.kind === 'pair') return 'A pair' + (paying ? paying + ' on a third of its rank' : '');
    if (st.kind === 'consecutive') return 'Consecutive, no gap to hit';
    return 'Spread ' + st.spread + paying;
  }

  // --- the line under the felt: the wager while the hand is live, the verdict once it is settled
  function rdVerdict(st) {
    if (!st || st.phase !== 'done') return null;
    if (st.result === 'push') {
      return { text: st.kind === 'pair' ? 'No match, push' : st.kind === 'consecutive' ? 'Consecutive, push' : 'Push', tint: '' };
    }
    if (st.kind === 'pair') return { text: 'Matched ' + signed(st.net || 0), tint: 'win' };
    var won = st.result === 'win';
    return { text: (won ? 'Inside ' : 'Outside ') + signed(st.net || 0), tint: won ? 'win' : 'lose' };
  }
  // `still` is a redraw of a verdict that was already on screen (an open, a late reply, another
  // window's broadcast): the chip is put back without popping, because nothing just happened
  function rdLine(st, still) {
    var line = el('rdLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    var v = rdVerdict(st);
    // The wager while the hand is live, and after it only when the raise doubled it: the chips are
    // still set to the opening bet, so a hand that went in at twice that has to say so somewhere.
    // A raise deals the third card with it, which is why a LIVE hand is never a raised one
    var pot = (!v || st.raised) ? CUC.pot(st.wager, false) : '';
    line.innerHTML = pot + (v ? '<span class="bj-chip' + (v.tint ? ' ' + v.tint : '')
      + (still ? ' still' : '') + '">' + esc(v.text) + '</span>' : '');
  }

  // --- the folded table (docs/game-panels.md, section 5). Both chances are printed as the
  // fractions the host sent: the screen never divides, so what is on the row is what was counted.
  // The deal chance goes in the row's title because it is the second reading of the same row and
  // its denominator is five digits wide
  function rdPays(st) {
    var box = el('rdPays'); if (!box) return;
    var rows = (st && st.pays) || [], here = (st && st.row) || null, html = '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var on = !!here && here.kind === r.kind && here.spread === r.spread;
      html += '<div class="rd-pay' + (on ? ' on' : '') + '" title="' + esc(rdPayWord(r)) + '">'
        + '<span>' + esc(r.name) + '</span>'
        + '<b>' + esc(r.odds == null ? 'push' : r.odds + ' to 1') + '</b>'
        + '<i>' + esc(r.chance ? fmtInt(r.chance.num) + '/' + fmtInt(r.chance.den) : '') + '</i></div>';
    }
    box.innerHTML = html;
  }
  function rdPayWord(r) {
    var dealt = r.deal ? 'dealt ' + fmtInt(r.deal.num) + ' of ' + fmtInt(r.deal.den) + ' openings' : '';
    return (r.note ? r.note + ' · ' : '') + dealt;
  }

  // --- the controls. Two buttons, which is the limit a 280px sidebar keeps on one row
  function rdControls(st, locked) {
    var play = !!(st && st.phase === 'play'), can = (st && st.can) || {};
    var bet = el('rdBet'), pl = el('rdPlay');
    // A pair and a consecutive pair settle at the deal, so this row is never drawn for them at
    // all: the phase is already 'done' when the reply lands, and a row that appeared for one beat
    // and went again would be an offer the table never made
    if (bet) bet.hidden = play;
    if (pl) pl.hidden = !play;
    var raise = el('rdRaise');
    // what a raise costs is the opening bet over again, and that figure is the host's
    if (raise) raise.innerHTML = 'Raise' + (play && st.bet ? ' <b class="rd-amt">' + fmtInt(st.bet) + '</b>' : '');
    var ops = document.querySelectorAll('#rdPlay [data-op]');
    for (var i = 0; i < ops.length; i++) {
      ops[i].disabled = !!locked || !can[ops[i].getAttribute('data-op')];
    }
    if (!play) CUC.renderStakes(SU, locked);
    rdNote(st);
  }
  // Being broke and having the credits riding at another table are different problems, and a raise
  // can hit either: the wager already on this hand is held back from the other games, so the
  // figure that decides it is the `free` the reply carried and not the header's number
  function rdNote(st) {
    // On the bet screen this line belongs to the chips (CUC.renderStakes writes their own "not
    // enough credits" into it), so it is not touched here: two writers on one line is the one
    // whose turn came second winning, and that was this one, hiding the note the chips had just put
    // up. A live hand has no chips on screen, so the raise has the line to itself
    if (!st || st.phase !== 'play') return;
    var can = st.can || {};
    var short = !can.raise && !!can.stand;
    var bal = CUC.balance();
    CUC.note('rdNote', !short ? '' : (bal != null && bal >= st.wager + st.bet
      ? CUC.heldElsewhere + '.'
      : 'You need ' + fmtInt(st.bet) + ' more credits to raise.'));
  }
  // Locks what is on screen without touching the figures or swapping the rows: while the third
  // card is on its way the spread, its price and the wager all have to stay where they are
  function rdLock() {
    var all = document.querySelectorAll('#rdPlay [data-op], #rdStakes button');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('rdDeal'); if (d) d.disabled = true;
  }

  // --- what a screen reader is told, one sentence a reply
  function rdAnnounce(st, op) {
    if (!st) return;
    var cards = st.cards || [], said = [];
    if (op === 'deal' && cards[0] && cards[1]) {
      said.push(CUC.cardWord(cards[0]) + ' and ' + CUC.cardWord(cards[1]));
      said.push(rdGapWord(st));
    }
    if (st.phase === 'done') {
      if (cards.length > 2) said.push('Third card ' + CUC.cardWord(cards[2]));
      var v = rdVerdict(st);
      if (v) said.push(v.text);
      said.push('Balance ' + fmtInt(CUC.balance() || 0));
    } else {
      said.push('Raise or stand');
    }
    CUC.live('rdLive', said.join('. ') + '.');
  }

  // --- drawing a reply nobody paced: an open, a refusal, a late reply, a broadcast
  function rdDraw(st) {
    var cards = (st && st.cards) || [];
    rdCard('rdA', cards[0]);
    rdCard('rdB', cards[1]);
    rdThird(cards[2]);
    rdPart(cards.length > 2);
    rdGap(st, cards.length);
  }
  // A deal clears the felt, and the line goes with it: the hand before this one is over, and
  // leaving its verdict up while the new cards come down would put a chip from one hand under the
  // cards of the next. What this hand is worth lands with its own figures, at the settle
  function rdClear() {
    rdCard('rdA', null);
    rdCard('rdB', null);
    rdThird(null);
    rdPart(false);
    rdGap(null, 0);
    var line = el('rdLine'); if (line) line.innerHTML = '';
  }
  // The third card falling into the gap, and the gap closing behind it
  function rdFall(st) {
    var cards = (st && st.cards) || [];
    rdThird(cards[2], !CUC.reduceMotion());
    rdGap(st, cards.length);
  }

  // What a reply makes happen, and when. A deal lays the two openers down and then prices the
  // space between them; a move parts them and drops the third card in
  function rdPlan(op, st) {
    var cards = (st && st.cards) || [];
    if (op !== 'deal') {
      return {
        steps: [{ at: 0, fn: function () { rdPart(true); } },
          { at: RD_T.third, fn: function () { rdFall(st); } }],
        settleAt: RD_T.third + RD_T.settle,
        unlockAt: RD_T.third + RD_T.settle + RD_T.unlock
      };
    }
    var steps = [
      { at: RD_T.one, fn: function () { rdCard('rdA', cards[0], true); } },
      { at: RD_T.two, fn: function () { rdCard('rdB', cards[1], true); } },
      { at: RD_T.spread, fn: function () { rdGap(st, 2); } }
    ];
    // a pair deals its own third card, so that fall belongs to the deal
    if (cards.length > 2) {
      steps.push({ at: RD_T.spread, fn: function () { rdPart(true); } });
      steps.push({ at: RD_T.spread + RD_T.third, fn: function () { rdFall(st); } });
      var at = RD_T.spread + RD_T.third + RD_T.settle;
      return { steps: steps, settleAt: at, unlockAt: at + RD_T.unlock };
    }
    // a live spread waits on the player; a consecutive pair is already settled and its verdict
    // follows the gap by the same beat a third card's would
    var done = st && st.phase === 'done';
    var settleAt = RD_T.spread + (done ? RD_T.settle : 0);
    return { steps: steps, settleAt: settleAt, unlockAt: settleAt + RD_T.unlock };
  }

  // --- messages
  function rdSend(op, extra) {
    if (rd.busy) return;
    rd.busy = true; rd.op = op;
    if (op !== 'open') rdControls(rd.st, true);
    rd.n = CUC.post('rd', op, extra);
    clearTimeout(rd.to);
    rd.to = setTimeout(function () {
      rd.busy = false; rd.op = null;
      CUC.err('rdErr', 'The table didn’t respond. Try again.');
      rdControls(rd.st, false);
    }, RD_T.noReply);
  }
  // A reply with no state: the host could not describe the hand (games/README.md, section 5). The
  // reason shows and the hand stays on the felt, both cards, the gap and the wager as they were:
  // the hand is still the host's and nothing about it has been decided here. rd.st is therefore
  // kept, so the next reply is drawn against the hand the host holds.
  //
  // awaited is false for a reply nobody asked for, and then a card already falling is left to
  // finish: it belongs to a state this reply says nothing about
  function rdFault(m, awaited) {
    CUC.err('rdErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    rd.busy = false;
    clearTimeout(rd.to);  // or the four-second timeout fires over the reason just shown
    CUC.settle(m);        // nothing is paced here, so the header must not be left frozen
    rdControls(rd.st, false);
    rdFocusAfter();
  }
  function rdReceive(m) {
    var current = rd.op != null && m.n === rd.n;
    if (!current && rd.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('rd', m);
    if (!m.state) { var awaited = current; rd.op = null; return rdFault(m, awaited); }
    var op = current ? rd.op : null;
    clearTimeout(rd.to); rd.timers.clear();
    rd.op = null; rd.st = m.state;
    // acted: the reply to a move the player just made. A refused move changed nothing, so there is
    // nothing to pace: the host answers it with the hand exactly as it stands, and pacing that
    // would drop the same card onto the felt a second time
    var acted = current && op !== 'open' && !m.error;
    var plan = (acted && !CUC.reduceMotion()) ? rdPlan(op, rd.st) : null;
    try {
      CUC.err('rdErr', m.error || '');
      rdPays(rd.st);
      if (plan) {
        if (op === 'deal') rdClear();   // the felt is cleared and dealt again
        rdLock();                       // the figures and the rows follow the cards, at settle
      } else {
        rdDraw(rd.st);
        rdControls(rd.st, true);
        rdLine(rd.st, !acted);
      }
    } finally {
      CUC.hold();   // the header waits for this reply's settle, like the other card tables
      var sc = plan || { steps: [], settleAt: 0, unlockAt: 0 };
      sc.steps.forEach(function (s) { rd.timers.at(s.at, s.fn); });
      if (plan) rd.timers.at(sc.settleAt, function () { rdLine(rd.st, false); });
      rd.timers.at(sc.unlockAt, function () { rdSettle(m, acted, op); });
    }
  }
  function rdSettle(m, acted, op) {
    rd.busy = false;
    try {
      CUC.settle(m);
      rdLine(rd.st, !acted);
      if (acted) rdAnnounce(rd.st, op);   // after the balance, so the line can say where it landed
    } finally {
      rdControls(rd.st, false);
      rdFocusAfter();
    }
  }
  function rdFocusAfter() {
    if (CUC.current() !== 'reddog') return;
    var play = rd.st && rd.st.phase === 'play';
    var swapped = rd.phase != null && play !== (rd.phase === 'play');
    rd.phase = rd.st ? rd.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-reddog');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!rd.wantFocus && !swapped && !lost) return;
    rd.wantFocus = false;
    var raise = el('rdRaise'), stand = document.querySelector('#rdPlay [data-op="stand"]');
    var target = play ? ((raise && !raise.disabled) ? raise : stand) : el('rdDeal');
    if (target && !target.disabled) target.focus();
  }

  CUC.game('reddog', {
    key: 'rd',
    cls: 'rd',
    markup: markup,
    init: function () {
      rdLine(null);
      rdPays(null);
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, rd.busy); });
      el('rdDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        rdSend('deal', { bet: bet });
      });
      el('rdPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
        rdSend(b.getAttribute('data-op'));
      });
      CUC.why('rdWhy', 'rdPays');
    },
    enter: function () { rd.wantFocus = true; rdControls(rd.st, true); rdSend('open'); },
    leave: function () {
      rd.timers.clear();
      clearTimeout(rd.to);
      rd.busy = false; rd.op = null;
    },
    receive: rdReceive,
    credits: function () { if (!rd.busy) { CUC.renderStakes(SU, false); rdControls(rd.st, false); } },
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#rdPlay', { r: 'raise', s: 'stand' }[k] || null, 'rdDeal', 'rdBet');
    }
  });
})();
