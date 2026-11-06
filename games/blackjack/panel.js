// Blackjack's screen. The host judges; this only draws, and paces the cards the host already
// dealt (state.seq). Everything shared with the other games comes from window.CUC.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // cardIn and flip are the lengths of .bj-card.in and .bj-card.flip in meta.js: change them together
  var BJ_T = { cardIn: 200, dealGap: 250, holeFirst: 150, holeLead: 600, flip: 300, dealerGap: 550, settle: 300, unlock: 50, noReply: 4000 };
  // n: number of the request in flight (the host echoes it); wantFocus: move focus into the table
  // at the next settle
  var bj = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, focusPhase: null };
  var SU = CUC.stakeUi('bj', { preview: '#bjHands .bj-stake.preview b' });

  // --- markup, built the first time the table is opened
  function markup() {
    return CUC.frame('blackjack')
      + '<div class="bj-felt">'
      +   '<div class="bj-row bj-dealer">'
      +     '<div class="bj-who"><div class="bj-crab"><img id="bjCrab" src="' + CUC.crab() + '" alt=""/></div></div>'
      +     '<div class="bj-hand"><div class="bj-line" id="bjDTot"></div><div class="bj-fan" id="bjDFan" role="img" aria-label="Dealer"></div></div>'
      +   '</div>'
      +   '<div class="bj-rule"></div>'
      +   '<div id="bjHands"></div>'
      +   '<div class="bj-net" id="bjNet" hidden></div>'
      + '</div>'
      + '<div class="bj-sr" id="bjLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="bjNote" hidden></div>'
      + '<div class="warnbar" id="bjErr" hidden></div>'
      + '<div class="bj-ctl" id="bjBet">' + CUC.stakesHtml('bj')
      +   '<button type="button" class="bj-btn primary" id="bjDeal" title="Deal (Enter)">Deal</button></div>'
      + '<div class="bj-ctl" id="bjPlay" hidden>'
      +   '<button type="button" class="bj-btn" data-op="hit" title="Hit (H)">Hit</button>'
      +   '<button type="button" class="bj-btn" data-op="stand" title="Stand (S)">Stand</button>'
      +   '<button type="button" class="bj-btn" data-op="double" title="Double (D)">Double</button>'
      +   '<button type="button" class="bj-btn" data-op="split" title="Split (P)">Split</button></div>';
  }

  // max 16px (8 cells) so the rank index always shows; squeeze to fit, never below 10px, even px only
  function fanOffset(fan, n) { if (n < 2) return 0; var w = fan.clientWidth || 120; return Math.max(10, Math.min(16, Math.floor((w - 32) / (n - 1) / 2) * 2)); }
  function cardEl(svg, left, cls) { return '<div class="bj-card' + (cls ? ' ' + cls : '') + '" style="left:' + left + 'px">' + svg + '</div>'; }

  // --- which cards the sequence still has to bring in
  // engine seq -> steps: {ev:'card',to:'player',hand} = a player card, {ev:'card',to:'dealer'} = a
  // dealer card (card:null is the hole, drawn as a back), {ev:'reveal'} = the hole flip (face from
  // the final dealer.cards[1]), {ev:'split'} = no step (the final state already has both hands)
  function bjPending(seq) {
    var p = { p: {}, d: 0, hole: false };
    (seq || []).forEach(function (it) {
      if (it.ev === 'card' && it.to === 'player') p.p[it.hand || 0] = (p.p[it.hand || 0] || 0) + 1;
      else if (it.ev === 'card' && it.to === 'dealer') p.d++;
      else if (it.ev === 'reveal') p.hole = true;
    });
    return p;
  }
  function bjDealer(st, pend) {
    var fan = el('bjDFan'); if (!fan) return;
    var d = (st && st.dealer) || { cards: [], hole: false };
    var n = d.hole ? Math.max(d.cards.length, 2) : d.cards.length; // hole:true draws a back whether or not the host sent its rank
    var off = fanOffset(fan, n), html = '';
    for (var i = 0; i < n; i++) {
      var down = i === 1 && (d.hole || pend.hole), c = d.cards[i];
      html += cardEl(down || !c ? CUC.cardBack() : CUC.cardFace(c), i * off, (i >= n - pend.d ? 'pending' : '') + (down ? ' down' : ''));
    }
    fan.innerHTML = html;
    if (pend.hole && d.cards[1] && fan.children[1]) fan.children[1]._face = CUC.cardFace(d.cards[1]);
  }
  // the player, sitting at the table: a still frame of an agent sprite, never animated
  var BJ_HERO_T = 44;         // card height
  var BJ_HERO_KEY = 'player'; // hum-player: the "me" sprite, and outside NPC_ORDER so Crew never wears the same face
  function bjHeroHtml() {
    var style = CUC.npc(BJ_HERO_KEY, BJ_HERO_T);
    return style ? '<div class="bj-hero" style="' + style + '"></div>' : '';
  }
  // one player however many hands: the sprite sits on the first row only, the stake under it
  function bjRowHtml(hand, h) {
    return '<div class="bj-row bj-p" data-h="' + h + '"><div class="bj-who">'
      + (h === 0 ? bjHeroHtml() : '')
      + '<span class="bj-stake' + (hand ? '' : ' preview') + '">' + CUC.coin() + '<b>' + fmtInt(hand ? hand.bet : CUC.stake(SU)) + '</b></span></div>'
      + '<div class="bj-hand"><div class="bj-fan" role="img"></div><div class="bj-line"></div></div></div>';
  }
  function bjHands(st, pend) {
    var box = el('bjHands'); if (!box) return;
    var hands = (st && st.hands) || [];
    if (!hands.length) { box.innerHTML = bjRowHtml(null, 0); return; } // empty seat, stake preview
    var html = ''; for (var h = 0; h < hands.length; h++) html += bjRowHtml(hands[h], h);
    box.innerHTML = html;
    for (h = 0; h < hands.length; h++) {
      var fan = box.querySelector('.bj-p[data-h="' + h + '"] .bj-fan'), cs = hands[h].cards, p = pend.p[h] || 0, off = fanOffset(fan, cs.length), f = '';
      for (var i = 0; i < cs.length; i++) f += cardEl(CUC.cardFace(cs[i]), i * off, i >= cs.length - p ? 'pending' : '');
      fan.innerHTML = f;
    }
  }
  // totals, chips and net change only at settle, never ahead of the cards
  var RES_WORD = { blackjack: 'Blackjack', win: 'Win', lose: 'Lose', bust: 'Bust', push: 'Push' };
  var RES_TINT = { blackjack: 'bj', win: 'win', lose: 'lose', bust: 'lose', push: '' };
  // still: a redraw of the same result (after a resize), so the chips do not pop in a second time
  function bjLines(st, still) {
    var d = st && st.dealer, dl = el('bjDTot'), pop = still ? ' still' : '';
    if (dl) dl.innerHTML = (d && d.total != null) ? '<span class="bj-tot">' + d.total + '</span>' + (d.total > 21 ? '<span class="bj-chip' + pop + '">Bust</span>' : '') : '';
    var dfan = el('bjDFan'), ranks = function (cs) { return cs.map(function (c) { return c.r; }).join(' '); };
    if (dfan) dfan.setAttribute('aria-label', !(d && d.cards.length) ? 'Dealer' : d.hole ? 'Dealer: ' + ranks(d.cards) + ' and a card face down' : 'Dealer: ' + ranks(d.cards) + ', total ' + d.total);
    var hands = (st && st.hands) || [], one = hands.length === 1;
    for (var h = 0; h < hands.length; h++) {
      var H = hands[h], row = document.querySelector('#bjHands .bj-p[data-h="' + h + '"]'); if (!row) continue;
      var live = st.phase === 'player' && !H.done;
      var tot = (H.soft && live && H.total < 21) ? '<span class="soft">' + (H.total - 10) + '/</span>' + H.total : String(H.total);
      var chip = H.result ? '<span class="bj-chip ' + RES_TINT[H.result] + pop + '">' + RES_WORD[H.result] + (one && st.net ? ' ' + signed(st.net) : '') + '</span>' : '';
      row.querySelector('.bj-line').innerHTML = '<span class="bj-tot">' + tot + '</span>' + chip;
      row.querySelector('.bj-stake b').textContent = fmtInt(H.bet);
      row.classList.toggle('dim', st.phase === 'player' && hands.length > 1 && h !== st.active);
      row.querySelector('.bj-fan').setAttribute('aria-label', 'Hand ' + (h + 1) + ': ' + H.cards.map(function (c) { return c.r; }).join(' ') + ', total ' + H.total);
    }
    var net = el('bjNet');
    if (net) { net.hidden = !(st && st.phase === 'done' && hands.length > 1); net.textContent = 'Net ' + signed((st && st.net) || 0); }
  }

  // --- pacing
  function bjRevealer(it) {
    return function () {
      var fan = it.to === 'dealer' ? el('bjDFan') : document.querySelector('#bjHands .bj-p[data-h="' + (it.hand || 0) + '"] .bj-fan');
      var c = fan && fan.querySelector('.bj-card.pending'); if (!c) return;
      c.classList.remove('pending'); c.classList.add('in');
    };
  }
  function bjFlipHole() {
    var fan = el('bjDFan'), c = fan && fan.children[1]; if (!c || !c._face) return;
    c.classList.add('flip');
    bj.timers.at(BJ_T.flip / 2, function () { c.innerHTML = c._face; c.classList.remove('down'); }); // edge-on: swap
  }
  // same mapping as bjPending: card events become card steps (dealer ones spaced wider once the
  // hole is turned), reveal becomes the flip, split adds no step
  function bjSteps(seq) {
    var out = [], t = null, dealerTurn = false;
    (seq || []).forEach(function (it) {
      if (it.ev === 'split') return;
      if (it.ev === 'reveal') { t = t == null ? BJ_T.holeFirst : t + BJ_T.holeLead; out.push({ at: t, dur: BJ_T.flip, fn: bjFlipHole }); dealerTurn = true; return; }
      t = t == null ? 0 : t + (dealerTurn ? BJ_T.dealerGap : BJ_T.dealGap);
      out.push({ at: t, dur: BJ_T.cardIn, fn: bjRevealer(it) });
    });
    return out;
  }

  // --- messages
  function bjSend(op, extra) {
    if (bj.busy) return;
    bj.busy = true; bj.op = op;
    if (op !== 'open') bjControls(bj.st, true);
    bj.n = CUC.post('bj', op, extra);
    clearTimeout(bj.to);
    bj.to = setTimeout(function () { bj.busy = false; bj.op = null; CUC.err('bjErr', 'The table didn’t respond. Try again.'); bjControls(bj.st, false); }, BJ_T.noReply);
  }
  // Draws a reply and returns its pacing steps. op is null for a reply that is not the one awaited
  function bjDraw(m, op, prevSt) {
    var st = bj.st;
    var seq = (op && op !== 'open' && !CUC.reduceMotion() && st && st.seq) || null; // open, late replies and reduced motion: final state at once
    var pend = bjPending(seq);
    if (op === 'deal' && !m.error) { var dl = el('bjDTot'); if (dl) dl.innerHTML = ''; }
    bjDealer(st, pend); bjHands(st, pend);
    if (seq && op !== 'deal' && prevSt) bjLines(prevSt); // keep the old totals up until the new cards land
    CUC.err('bjErr', m.error || '');
    bjControls(st, true);
    return bjSteps(seq);
  }
  // A reply to the request in flight is paced. One that is not (a late reply after the no-reply
  // timeout) is drawn as it stands, with no pacing and no reactions; an older reply arriving while
  // a newer request waits is dropped, since the newer reply carries the latest state anyway
  function bjReceive(m) {
    var current = bj.op != null && m.n === bj.n;
    if (!current && bj.op != null) return;
    CUC.setHeld('bj', m);
    if (!m.state) { var awaited = current; bj.op = null; return bjFault(m, awaited); }
    var op = current ? bj.op : null, prevSt = bj.st, steps = [], end = 0;
    clearTimeout(bj.to); bj.timers.clear();
    bj.op = null; bj.st = m.state;
    try { steps = bjDraw(m, op, prevSt); }
    finally {
      // whatever the drawing did, the settle has to be scheduled: it is what unlocks the table.
      // The header waits for that settle even when nothing is paced: the host's data push sits
      // right behind this reply, and if it landed before the quiet balance update a game win would
      // be celebrated as an earning
      CUC.hold();
      steps.forEach(function (s) { bj.timers.at(s.at, s.fn); end = Math.max(end, s.at + s.dur); });
      var lead = steps.length ? (bj.st && bj.st.phase === 'done' ? BJ_T.settle : BJ_T.unlock) : 0;
      bj.timers.at(end + lead, function () { bjSettle(m, current && op !== 'open'); });
    }
  }
  // A reply with no state: the host could not describe the round (games/README.md, section 5). The
  // reason goes up and NOTHING on the felt moves. The hand is still there, the host still has it,
  // and a table wiped to an empty seat is the one reading the player cannot tell from "my hand is
  // gone". So bj.st is left as it was, which also keeps every redraw after this one honest.
  //
  // awaited is false for a reply nobody asked for, and then this touches nothing else: the pacing
  // running at that moment is drawing a state this reply has nothing to say about
  function bjFault(m, awaited) {
    CUC.err('bjErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    bj.busy = false;
    clearTimeout(bj.to);  // or the four-second timeout fires over the reason just shown
    CUC.settle(m);        // nothing is paced here, so the header must not be left frozen
    bjControls(bj.st, false);
    bjFocusAfter();
  }
  // fresh: the reply to a move the player just made (not an open, not a late reply)
  function bjSettle(m, fresh) {
    bj.busy = false;
    try {
      CUC.settle(m);
      bjLines(bj.st);
      if (fresh && bj.st && bj.st.phase === 'done') bjAnnounce(bj.st);
    } finally {
      bjControls(bj.st, false);
      bjFocusAfter();
    }
  }
  function bjAnnounce(st) {
    var one = st.hands.length === 1 ? st.hands[0] : null;
    CUC.live('bjLive', (one ? RES_WORD[one.result] + (st.net ? ' ' + signed(st.net) : '') : 'Net ' + signed(st.net || 0)) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }
  // Keyboard focus follows the table: in on entry, to the first action when a hand starts, back to
  // Deal when the bet controls return, and back in whenever it was left on something hidden or
  // disabled. Otherwise it stays where the player put it. Left on the header credits button, Enter
  // would press that button again and leave the table
  function bjFocusAfter() {
    if (CUC.current() !== 'blackjack') return;
    var phase = bj.st ? bj.st.phase : 'bet', play = phase === 'player';
    var swapped = bj.focusPhase != null && play !== (bj.focusPhase === 'player');
    bj.focusPhase = phase;
    var a = document.activeElement, table = el('panelTable');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(table && table.contains(a));
    if (!bj.wantFocus && !swapped && !lost) return;
    bj.wantFocus = false;
    var target = play ? document.querySelector('#bjPlay [data-op]:not([hidden]):not([disabled])') : el('bjDeal');
    if (target && !target.disabled) target.focus();
  }

  // --- controls
  function bjRenderStakes(locked) { CUC.renderStakes(SU, locked == null ? bj.busy : locked); }
  function bjControls(st, locked) {
    var play = !!(st && st.phase === 'player'), can = (st && st.can) || {};
    var bet = el('bjBet'), pl = el('bjPlay');
    if (bet) bet.hidden = play; if (pl) pl.hidden = !play;
    var ops = document.querySelectorAll('#bjPlay [data-op]');
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i].getAttribute('data-op');
      ops[i].hidden = (op === 'double' || op === 'split') && !can[op];
      ops[i].disabled = locked || !can[op];
    }
    if (!play) bjRenderStakes(locked);
  }

  CUC.game('blackjack', {
    key: 'bj',
    panelId: 'panelTable',
    cls: 'bj',
    markup: markup,
    // wiring, once the markup is in the document
    init: function () {
      bjHands(null, bjPending(null));
      CUC.wireStakes(SU, function () { bjRenderStakes(); });
      el('bjDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        bjSend('deal', { bet: bet });
      });
      el('bjPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
        bjSend(b.getAttribute('data-op'));
      });
    },
    enter: function () { bj.wantFocus = true; bjControls(bj.st, true); bjSend('open'); },
    leave: function () {
      bj.timers.clear();
      clearTimeout(bj.to);
      bj.busy = false; bj.op = null;
    },
    receive: bjReceive,
    credits: function () { if (!bj.busy) bjRenderStakes(); },
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#bjPlay', { h: 'hit', s: 'stand', d: 'double', p: 'split' }[k] || null, 'bjDeal', 'bjBet');
    },
    // the fan squeezes to the panel's width, so a resize redraws the cards where they now fit
    resize: function () {
      if (!bj.st) return;
      var np = bjPending(null);
      bjDealer(bj.st, np); bjHands(bj.st, np); bjLines(bj.st, true);
    }
  });
})();
