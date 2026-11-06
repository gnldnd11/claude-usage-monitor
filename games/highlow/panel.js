// High-Low's screen: guess whether the next card beats this one. The host judges and prices it;
// this draws one hero card, keeps the card just played as a pile, and paces the two.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // inLead is the gap before the new card arrives; settle/unlock are when the numbers follow it and
  // when the buttons come back, with deal/dealUnlock the shorter pair a fresh card needs
  var HL_T = { inLead: 40, settle: 220, unlock: 240, deal: 180, dealUnlock: 200, noReply: 4000 };
  var hl = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, phase: null };
  var SU = CUC.stakeUi('hl');

  function markup() {
    return CUC.frame('hilo')
      + '<div class="bj-felt">'
      +   '<div class="hl-stage">'
      +     '<div class="bj-crab"><img src="' + CUC.crab() + '" alt=""/></div>'
      +     '<div class="hl-cards"><div class="hl-prev" id="hlPrev" aria-hidden="true"></div><div class="hl-card" id="hlCard" role="img" aria-label="No card"></div></div>'
      +   '</div>'
      +   '<div class="hl-line" id="hlLine"></div>'
      + '</div>'
      + '<div class="bj-sr" id="hlLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="hlNote" hidden></div>'
      + '<div class="warnbar" id="hlErr" hidden></div>'
      + '<div class="bj-ctl" id="hlBet">' + CUC.stakesHtml('hl')
      +   '<button type="button" class="bj-btn primary" id="hlDeal" title="Deal (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="hlPlay" hidden>'
      +   '<button type="button" class="bj-btn hl-guess" data-op="higher" title="Higher (up arrow)"><span>Higher</span><b id="hlUp">—</b></button>'
      +   '<button type="button" class="bj-btn hl-guess" data-op="lower" title="Lower (down arrow)"><span>Lower</span><b id="hlDn">—</b></button>'
      +   '<button type="button" class="bj-btn hl-cash" data-op="cashout" title="Cash out (C)">Cash out <b id="hlCashAmt">0</b></button></div>';
  }

  // The price on a guess button is read back from the pot the host says a correct call pays, never
  // worked out here from the odds: pots are whole credits, so a pot of 10 priced at 1.06x comes back
  // unchanged and a printed x1.1 would be a promise the table does not keep. Floored for the same
  // reason, so the button never asks for more than it gives
  function hlPrice(pays, pot) {
    if (pays == null || !(pot > 0)) return '—';
    var m = pays / pot;
    return '×' + (m >= 10 ? Math.floor(m) : (Math.floor(m * 10) / 10).toFixed(1));
  }

  // The cards: the one just played slides down to the pile on the left, the new one comes in
  function hlCards(st, animate) {
    var prevEl = el('hlPrev'), cardEl = el('hlCard'); if (!prevEl || !cardEl) return;
    var hist = (st && st.history) || [];
    var last = hist.length ? hist[hist.length - 1].card : null; // only the latest: the pot and the streak say how far this run went
    prevEl.innerHTML = last ? CUC.cardFace(last, 2) : '';
    cardEl.innerHTML = (st && st.card) ? CUC.cardFace(st.card, 4) : '';
    prevEl.classList.remove('drop'); cardEl.classList.remove('in');
    if (!animate) return;
    // the played card drops onto the pile first, the new one arrives just behind it
    if (last) { void prevEl.getBoundingClientRect(); prevEl.classList.add('drop'); }
    cardEl.style.visibility = 'hidden';
    hl.timers.at(HL_T.inLead, function () {
      cardEl.style.visibility = '';
      void cardEl.getBoundingClientRect(); cardEl.classList.add('in');
    });
  }
  // What a screen reader is told. The hero card is the whole state of this game, so it carries its
  // own name; the pile beside it is aria-hidden in the markup and the line below names the card
  // that was played instead
  function hlLabel(st) {
    var c = el('hlCard'); if (!c) return;
    c.setAttribute('aria-label', (st && st.card) ? 'Face up: ' + CUC.cardWord(st.card) : 'No card');
  }
  // One line per move, read out at the settle: a call turns a card over and moves the pot, and
  // neither the label on the card nor the line under it is announced on its own
  var HL_SAID = { win: 'right', lose: 'wrong', push: 'a tie, the pot rides' };
  function hlAnnounce(st) {
    if (!st) return;
    var hist = st.history || [], last = hist.length ? hist[hist.length - 1] : null, said = [];
    if (st.phase === 'done') {
      said.push((st.ended === 'cashout' ? 'Cashed out ' : 'Wrong call, ') + signed(st.net || 0));
      said.push('Balance ' + fmtInt(CUC.balance() || 0));
    } else {
      if (last) said.push((last.guess === 'higher' ? 'Higher' : 'Lower') + ': ' + HL_SAID[last.result]);
      said.push(CUC.cardWord(st.card));
      said.push('Pot ' + fmtInt(st.pot));
    }
    CUC.live('hlLive', said.join('. ') + '.');
  }
  // The line under the cards: the pot while playing, the result once the round is over
  function hlLine(st) {
    hlLabel(st); // the card's name moves with the line, so it follows the card rather than leading it
    var line = el('hlLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase === 'done') {
      var won = st.ended === 'cashout';
      line.innerHTML = '<span class="bj-chip ' + (won ? 'win' : 'lose') + '">' + (won ? 'Cashed out ' : 'Wrong ') + signed(st.net || 0) + '</span>';
      return;
    }
    line.innerHTML = CUC.pot(st.pot, false) + (st.streak > 1 ? '<span class="bj-chip">' + st.streak + ' in a row</span>' : '');
  }
  // Locks what is on screen without touching the numbers or swapping the rows: during a guess the
  // old prices and pot must stay put until the card has landed
  function hlLock() {
    var all = document.querySelectorAll('#hlPlay [data-op], #hlStakes button');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('hlDeal'); if (d) d.disabled = true;
  }
  // the prices and the pot on the buttons: they change with the line, one step before the buttons
  function hlNumbers(st) {
    var pays = (st && st.pays) || {}, pot = (st && st.pot) || 0;
    var up = el('hlUp'), dn = el('hlDn'), amt = el('hlCashAmt');
    if (up) up.textContent = hlPrice(pays.higher, pot);
    if (dn) dn.textContent = hlPrice(pays.lower, pot);
    if (amt) amt.textContent = fmtInt(pot);
  }
  function hlControls(st, locked) {
    var play = !!(st && st.phase === 'play'), can = (st && st.can) || {};
    var bet = el('hlBet'), pl = el('hlPlay');
    if (bet) bet.hidden = play; if (pl) pl.hidden = !play;
    hlNumbers(st);
    var ops = document.querySelectorAll('#hlPlay [data-op]');
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i].getAttribute('data-op');
      ops[i].disabled = locked || !can[op];
    }
    if (!play) CUC.renderStakes(SU, locked);
  }
  function hlFocusAfter() {
    if (CUC.current() !== 'hilo') return;
    var play = hl.st && hl.st.phase === 'play';
    var swapped = hl.phase != null && play !== (hl.phase === 'play');
    hl.phase = hl.st ? hl.st.phase : 'bet';
    var a = document.activeElement, panel = el('panelHiLo');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!hl.wantFocus && !swapped && !lost) return;
    hl.wantFocus = false;
    var target = play ? document.querySelector('#hlPlay [data-op="higher"]') : el('hlDeal');
    if (target && !target.disabled) target.focus();
  }

  function hlSend(op, extra) {
    if (hl.busy) return;
    hl.busy = true; hl.op = op;
    if (op !== 'open') hlControls(hl.st, true);
    hl.n = CUC.post('hl', op, extra);
    clearTimeout(hl.to);
    hl.to = setTimeout(function () { hl.busy = false; hl.op = null; CUC.err('hlErr', 'The table didn’t respond. Try again.'); hlControls(hl.st, false); }, HL_T.noReply);
  }
  // The cards move first and the numbers follow: a pot or a payout that changed early would give
  // the result away before the card is on the felt
  function hlReceive(m) {
    var current = hl.op != null && m.n === hl.n;
    if (!current && hl.op != null) return; // an older reply while a newer request waits
    CUC.setHeld('hl', m);
    if (!m.state) { var awaited = current; hl.op = null; return hlFault(m, awaited); }
    var op = current ? hl.op : null;
    clearTimeout(hl.to); hl.timers.clear();
    hl.op = null; hl.st = m.state;
    // acted: the reply to a move the player just made. A refused move changed nothing, so there is
    // nothing to pace and nothing to read out: the host answers it with the run exactly as it
    // stands, and pacing that would drop the same card onto the felt a second time
    var acted = current && op !== 'open' && !m.error;
    var fresh = acted && !CUC.reduceMotion();
    var settleAt = 0, unlockAt = 0;
    if (fresh && op === 'deal') { settleAt = HL_T.deal; unlockAt = HL_T.dealUnlock; }
    else if (fresh) { settleAt = HL_T.settle; unlockAt = HL_T.unlock; }
    try {
      hlCards(hl.st, fresh);
      CUC.err('hlErr', m.error || '');
      if (settleAt) hlLock();          // the numbers and the rows follow the card, at settle
      else { hlControls(hl.st, true); hlLine(hl.st); }
    } finally {
      CUC.hold(); // the header waits for this reply's settle, like the blackjack table
      if (settleAt) hl.timers.at(settleAt, function () { hlLine(hl.st); hlNumbers(hl.st); });
      hl.timers.at(unlockAt, function () { hlSettle(m, acted); });
    }
  }
  // A reply with no state: the host could not describe the run (games/README.md, section 5). The
  // reason shows and the run stays on the felt, hero card, pile, pot and prices as they were: the
  // run is still the host's and nothing about it has been decided here. hl.st is therefore kept,
  // so the pot and the prices the next reply is drawn against are still the run's own.
  //
  // awaited is false for a reply nobody asked for, and then the card already dropping is left to
  // finish: it belongs to a state this reply says nothing about
  function hlFault(m, awaited) {
    CUC.err('hlErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    hl.busy = false;
    clearTimeout(hl.to);  // or the four-second timeout fires over the reason just shown
    CUC.settle(m);        // nothing is paced here, so the header must not be left frozen
    hlControls(hl.st, false);
    hlFocusAfter();
  }
  // acted: the reply to a move the player just made (not an open, not a refusal, not a late reply)
  function hlSettle(m, acted) {
    hl.busy = false;
    try {
      CUC.settle(m);
      hlLine(hl.st);
      if (acted) hlAnnounce(hl.st); // after the balance, so the line can say where it landed
    } finally {
      hlControls(hl.st, false);
      hlFocusAfter();
    }
  }

  CUC.game('hilo', {
    key: 'hl',
    panelId: 'panelHiLo',
    cls: 'hl',
    markup: markup,
    init: function () {
      hlLine(null);
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, hl.busy); });
      el('hlDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        hlSend('deal', { bet: bet });
      });
      el('hlPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
        hlSend(b.getAttribute('data-op'));
      });
    },
    enter: function () { hl.wantFocus = true; hlControls(hl.st, true); hlSend('open'); },
    leave: function () {
      hl.timers.clear();
      clearTimeout(hl.to);
      hl.busy = false; hl.op = null;
    },
    receive: hlReceive,
    credits: function () { if (!hl.busy) { CUC.renderStakes(SU, false); hlControls(hl.st, false); } },
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#hlPlay', { arrowup: 'higher', arrowdown: 'lower', c: 'cashout' }[k] || null, 'hlDeal', 'hlBet');
    }
  });
})();
