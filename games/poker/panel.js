// Draw Poker's screen (jacks or better): the pay table is always on the felt, five cards under it.
// Holds are the webview's own: they travel with the draw, so there is no round trip per card.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, esc = CUC.esc, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // cardIn and cardOut are the lengths of .pk-card.in and .pk-card.out in meta.js
  var PK_T = { dealGap: 90, cardIn: 160, cardOut: 120, pressGap: 40, drawGap: 80, settle: 250, noReply: 4000 };
  // A discard has to be gone before its replacement drops into the same slot, so the first card of
  // a draw comes in just past the fade. Built on cardOut rather than written out, because the two
  // are one length: retiming .pk-card.out alone would drop a card onto one still fading
  PK_T.drawLead = PK_T.cardOut + 20;
  var pk = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, phase: null, hold: [false, false, false, false, false], locked: false };
  var SU = CUC.stakeUi('pk');

  function markup() {
    return CUC.frame('poker')
      + '<div class="bj-felt">'
      +   '<div class="pk-pays" id="pkPays"></div>'
      +   '<div class="pk-hand" id="pkHand"></div>'
      +   '<div class="hl-line" id="pkLine"></div>'
      + '</div>'
      + '<div class="bj-sr" id="pkLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="pkNote" hidden></div>'
      + '<div class="warnbar" id="pkErr" hidden></div>'
      + '<div class="bj-ctl" id="pkBet">' + CUC.stakesHtml('pk')
      +   '<button type="button" class="bj-btn primary" id="pkDeal" title="Deal (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="pkPlay" hidden>'
      +   '<button type="button" class="bj-btn primary" id="pkDraw" style="flex:1 1 100%" title="Draw (Enter)">Draw</button></div>';
  }

  // The pay table is the state's own: nine rows, five in the left column and four in the right,
  // so the DOM order interleaves them (row 1 is Royal flush and Straight, and so on).
  // The loop runs the longer column, so retuning the table in poker.js cannot quietly lose the
  // bottom of one side: a tenth row would be left[5], which only the longer count reaches
  function pkPays(st) {
    var box = el('pkPays'); if (!box) return;
    var pays = (st && st.pays) || [], half = Math.ceil(pays.length / 2);
    var left = pays.slice(0, half), right = pays.slice(half), won = st && st.hand && st.hand.mult > 0 ? st.hand.name : null;
    var row = function (p) { return !p ? '' : '<div class="pk-pay' + (p.name === won ? ' on' : '') + '"><span>' + esc(p.name) + '</span><b>' + p.mult + '</b></div>'; };
    var html = '', rows = Math.max(left.length, right.length);
    for (var i = 0; i < rows; i++) html += row(left[i]) + row(right[i]);
    box.innerHTML = html;
  }
  // Slots are buttons: the card itself is the target, 32x60 including the HOLD label's place.
  // The title carries the number key that marks it, which is the only place the shortcut is
  // written down: the deal puts the focus on Draw, so there is nothing to tab past and find it on
  function pkCards(st, plan, prevSt) {
    var box = el('pkHand'); if (!box) return;
    var cards = (st && st.cards) || [];
    if (!cards.length) { box.innerHTML = ''; return; }
    var out = (plan && plan.out) || [], hidden = (plan && plan.hidden) || [];
    var html = '';
    for (var i = 0; i < cards.length; i++) {
      var shown = (out.indexOf(i) >= 0 && prevSt && prevSt.cards[i]) ? prevSt.cards[i] : cards[i];
      var held = pkHeldAt(st, i);
      html += '<button type="button" class="pk-slot' + (held ? ' held' : '') + '" data-i="' + i + '" aria-pressed="' + (held ? 'true' : 'false')
        + '" title="Hold (' + (i + 1) + ')" aria-label="' + esc(CUC.cardWord(shown)) + (held ? ', held' : '') + '" style="left:' + (i * 28) + 'px">'
        + '<span class="pk-card"' + (hidden.indexOf(i) >= 0 ? ' style="visibility:hidden"' : '') + '>' + CUC.cardFace(shown, 2) + '</span>'
        + '<span class="pk-hold">HOLD</span></button>';
    }
    box.innerHTML = html;
  }
  function pkHeldAt(st, i) { return st && st.phase === 'done' ? !!(st.held && st.held[i]) : !!pk.hold[i]; }
  function pkSlot(i) { return document.querySelector('#pkHand .pk-slot[data-i="' + i + '"]'); }
  // Reveals one card: swaps in the real face if the old one was still showing, then drops it in
  function pkReveal(i, st) {
    var slot = pkSlot(i); if (!slot) return;
    var card = slot.querySelector('.pk-card'); if (!card) return;
    card.classList.remove('out');
    card.innerHTML = CUC.cardFace(st.cards[i], 2);
    card.style.visibility = '';
    slot.setAttribute('aria-label', CUC.cardWord(st.cards[i]));
    void card.getBoundingClientRect(); card.classList.add('in');
  }
  // What moves and when: a deal walks all five in, a draw drops the discards and brings those back
  function pkPlan(prevSt, st, op) {
    if (op === 'deal') return { hidden: [0, 1, 2, 3, 4], out: [], steps: [0, 1, 2, 3, 4].map(function (i, k) { return { i: i, at: k * PK_T.dealGap }; }), last: 4 * PK_T.dealGap + PK_T.cardIn, wait: PK_T.pressGap };
    var changed = [];
    for (var i = 0; i < 5; i++) if (st.held && !st.held[i]) changed.push(i);
    return {
      hidden: [], out: changed.slice(),
      steps: changed.map(function (i, k) { return { i: i, at: PK_T.drawLead + k * PK_T.drawGap }; }),
      last: changed.length ? PK_T.drawLead + (changed.length - 1) * PK_T.drawGap + PK_T.cardIn : 0, wait: PK_T.settle
    };
  }
  function pkLine(st) {
    var line = el('pkLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase === 'done') {
      var hand = st.hand || { name: 'No win', mult: 0 };
      var top = st.pays && st.pays[0] && hand.name === st.pays[0].name; // the house's best row gets the gold chip
      var tint = hand.mult > 0 ? (top ? 'bj' : 'win') : 'lose';
      line.innerHTML = '<span class="bj-chip ' + tint + '">' + esc(hand.name) + ' ' + signed(st.net || 0) + '</span>';
      return;
    }
    line.innerHTML = CUC.pot(st.bet, false);
  }
  function pkDrawLabel(st) {
    var b = el('pkDraw'); if (!b) return;
    var n = 0;
    for (var i = 0; i < 5; i++) if (!pk.hold[i]) n++;
    b.textContent = n ? 'Draw ' + n : 'Keep all';
  }
  // The cards are the only control here that pkToggle turns away on its own, so they have to be
  // disabled while it would: through the deal's pacing and once the hand is over. A button that
  // takes a press and answers nothing is a button a keyboard and a screen reader are told to try
  function pkSlotsLive(on) {
    var slots = document.querySelectorAll('#pkHand .pk-slot');
    for (var i = 0; i < slots.length; i++) slots[i].disabled = !on;
  }
  function pkLock() {
    var all = document.querySelectorAll('#pkStakes button, #pkPlay .bj-btn');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('pkDeal'); if (d) d.disabled = true;
    pkSlotsLive(false);
    pk.locked = true;
  }
  function pkControls(st, locked) {
    var play = !!(st && st.phase === 'draw'), can = (st && st.can) || {};
    var bet = el('pkBet'), pl = el('pkPlay');
    if (bet) bet.hidden = play; if (pl) pl.hidden = !play;
    var draw = el('pkDraw'); if (draw) draw.disabled = locked || !can.draw;
    pkSlotsLive(play && !locked);
    pkDrawLabel(st);
    pk.locked = !!locked;
    if (!play) CUC.renderStakes(SU, locked);
  }
  function pkAnnounce(st) {
    if (!st) return;
    var hand = st.hand || { name: 'No win' };
    CUC.live('pkLive', hand.name + ' ' + signed(st.net || 0) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }
  function pkFocusAfter() {
    if (CUC.current() !== 'poker') return;
    var play = pk.st && pk.st.phase === 'draw';
    var swapped = pk.phase != null && play !== (pk.phase === 'draw');
    pk.phase = pk.st ? pk.st.phase : 'bet';
    var a = document.activeElement, panel = el('panelPoker');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!pk.wantFocus && !swapped && !lost) return;
    pk.wantFocus = false;
    var target = play ? el('pkDraw') : el('pkDeal');
    if (target && !target.disabled) target.focus();
  }
  // Marking a card to keep is local: nothing goes to the host until the draw
  function pkToggle(i) {
    if (!pk.st || pk.st.phase !== 'draw' || pk.locked || pk.busy) return;
    pk.hold[i] = !pk.hold[i];
    var slot = pkSlot(i);
    if (slot) {
      slot.classList.toggle('held', pk.hold[i]);
      slot.setAttribute('aria-pressed', pk.hold[i] ? 'true' : 'false');
      slot.setAttribute('aria-label', CUC.cardWord(pk.st.cards[i]) + (pk.hold[i] ? ', held' : ''));
    }
    pkDrawLabel(pk.st);
  }

  function pkSend(op, extra) {
    if (pk.busy) return;
    pk.busy = true; pk.op = op;
    if (op !== 'open') pkLock();
    pk.n = CUC.post('pk', op, extra);
    clearTimeout(pk.to);
    pk.to = setTimeout(function () { pk.busy = false; pk.op = null; CUC.err('pkErr', 'The table didn’t respond. Try again.'); pkControls(pk.st, false); }, PK_T.noReply);
  }
  // The cards land first and the verdict follows: a lit pay row or a result chip that moved early
  // would say what the hand is before the last card is face up
  function pkReceive(m) {
    var current = pk.op != null && m.n === pk.n;
    if (!current && pk.op != null) return;
    CUC.setHeld('pk', m);
    if (!m.state) { var awaited = current; pk.op = null; return pkFault(m, awaited); }
    var op = current ? pk.op : null;
    clearTimeout(pk.to); pk.timers.clear();
    pk.op = null;
    var prevSt = pk.st;
    pk.st = m.state;
    if (op === 'deal' && !m.error) pk.hold = [false, false, false, false, false];
    if (pk.st && pk.st.phase === 'bet') pk.hold = [false, false, false, false, false];
    var fresh = current && op !== 'open' && !m.error && !CUC.reduceMotion() && pk.st && pk.st.cards.length === 5;
    var plan = fresh ? pkPlan(prevSt, pk.st, op) : null;
    try {
      // A deal drops the last hand's verdict before anything else: the chip and the lit pay row
      // judged the cards being replaced, and the verdict of these five is 560ms of pacing away.
      // Blackjack clears its dealer total at the deal for the same reason
      if (op === 'deal' && !m.error) { pkPays(pk.st); pkLine(pk.st); }
      pkCards(pk.st, plan, prevSt);
      CUC.err('pkErr', m.error || '');
      if (plan) {
        pkLock();
        plan.out.forEach(function (i) { var c = pkSlot(i) && pkSlot(i).querySelector('.pk-card'); if (c) c.classList.add('out'); });
        plan.steps.forEach(function (st2) { pk.timers.at(st2.at, function () { pkReveal(st2.i, pk.st); }); });
      } else {
        pkPays(pk.st); pkLine(pk.st); pkControls(pk.st, true);
      }
    } finally {
      CUC.hold(); // the header waits for this reply's settle, like the other tables
      var at = plan ? plan.last + plan.wait : 0; // the verdict and the controls land together, after the last card
      pk.timers.at(at, function () { pkSettle(m, current && op !== 'open'); });
    }
  }
  // A reply with no state: the host could not describe the hand (games/README.md, section 5). The
  // reason shows and the five cards, the lit pay row and the marks on the cards all stay: a hand
  // redrawn as an empty slot row would read as a hand that has been taken away. pk.st and pk.hold
  // are both kept, so the cards the player marked to keep are still marked when the next draw goes.
  //
  // awaited is false for a reply nobody asked for, and then the cards already coming in are left
  // to land: they belong to a state this reply says nothing about
  function pkFault(m, awaited) {
    CUC.err('pkErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    pk.busy = false;
    clearTimeout(pk.to);        // or the four-second timeout fires over the reason just shown
    CUC.settle(m);              // nothing is paced here, so the header must not be left frozen
    pkControls(pk.st, false);   // which is also what lifts pk.locked
    pkFocusAfter();
  }
  function pkSettle(m, acted) {
    pk.busy = false;
    try {
      CUC.settle(m);
      pkPays(pk.st); pkLine(pk.st);
      if (acted && pk.st && pk.st.phase === 'done') pkAnnounce(pk.st);
    } finally {
      pkControls(pk.st, false);
      pkFocusAfter();
    }
  }

  CUC.game('poker', {
    key: 'pk',
    panelId: 'panelPoker',
    cls: 'pk',
    markup: markup,
    init: function () {
      pkLine(null);
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, pk.busy); });
      el('pkDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        pkSend('deal', { bet: bet });
      });
      // the five flags go with the draw, in one message
      el('pkDraw').addEventListener('click', function () {
        if (this.disabled) return;
        pkSend('draw', { hold: pk.hold.map(function (h) { return !!h; }) });
      });
      el('pkHand').addEventListener('click', function (e) {
        var slot = e.target.closest ? e.target.closest('.pk-slot') : null; if (!slot) return;
        pkToggle(Number(slot.getAttribute('data-i')));
      });
    },
    enter: function () { pk.wantFocus = true; pkControls(pk.st, true); pkSend('open'); },
    leave: function () {
      pk.timers.clear();
      clearTimeout(pk.to);
      pk.busy = false; pk.op = null;
    },
    receive: pkReceive,
    credits: function () { if (!pk.busy) { CUC.renderStakes(SU, false); pkControls(pk.st, false); } },
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      // 1 to 5 mark a card to keep, Enter deals or draws. The key is only taken while there are
      // cards to mark: on the bet screen nothing would happen, and a swallowed digit is one the
      // rest of the page never sees
      if (k >= '1' && k <= '5') {
        if (pk.st && pk.st.phase === 'draw') { e.preventDefault(); pkToggle(Number(k) - 1); }
        return;
      }
      CUC.press(e, '#pkPlay', null, 'pkDeal', 'pkBet');
    }
  });
})();
