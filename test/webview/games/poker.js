// Draw Poker, end to end: the pay table, the deal's pacing, marking cards by click and by key, the
// draw's five flags, a late reply, a refused draw, and the key guards.
'use strict';

module.exports = {
  id: 'poker',
  modes: ['poker', 'poker-reduce', 'poker-poor'],
  start: { 'poker-poor': 5 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, notShown, bodyTabs, inGames, atTable, gameRow,
        openList, openTable, reopenTable, dealerCards, allCards, isBack, lineText, hdrBal,
        latchIdle, active, activeName, mouseClick, ledgerBalance, useSeed, standOut, watch,
        noStaleTimer, toWebview, sentOps, sentHl, errors, hostLog, roCbs, ext, bj, credits,
        registry, gs, config, EXT, path } = h;
    const sentPk = h.sent('pk');   // the whole message: a draw carries the hold flags

    // The real host and the real engine. The hands are chosen by searching the engine for a seed,
    // exactly as the other two games do, so every expectation below is the engine's own number.
    const poker = require(path.join(EXT, 'poker.js'));
    const R = MODE === 'poker-reduce';
    const BET = 10;
    const HOLD_NONE = [false, false, false, false, false];
    function pkSeed(want, tag) {
      for (let i = 0; i < 20000; i++) {
        const seed = tag + i;
        const hand = poker.newHand({ seed, id: 't', bet: BET });
        if (want(hand, poker.view(hand, 1e9))) { ext._test.setPkSeeds(() => seed); return hand; }
      }
      throw new Error('no poker seed for ' + tag);
    }
    const drawn = (hand, hold) => poker.view(poker.act(hand, { op: 'draw', hold }), 1e9);
    const slots = () => doc.querySelectorAll('#pkHand .pk-slot');
    const slotAt = (i) => doc.querySelector('#pkHand .pk-slot[data-i="' + i + '"]');
    const cardOf = (i) => slotAt(i) && slotAt(i).querySelector('.pk-card');
    const payRows = () => doc.querySelectorAll('#pkPays .pk-pay');
    const litRow = () => { const r = doc.querySelector('#pkPays .pk-pay.on'); return r ? r.textContent : 'none'; };
    const chip = () => { const c = doc.querySelector('#pkLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const label = () => $('pkDraw').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
    const settleAll = () => advance(1500);
    openList(); h.rowFor('poker').click(); advance(20);
    ok('the Draw Poker row opens it and asks the host for its state',
      doc.body.classList.contains('game-pk') && $('panelPoker').style.display === '' && notShown('panelHiLo')
      && sentPk.map((m) => m.op).join() === 'open', bodyTabs() + ' ' + sentPk.map((m) => m.op).join());
    if (MODE === 'poker-poor') {
      ok('not enough credits: chips off, Deal off, note shown',
        doc.querySelectorAll('#pkStakes button').every((b) => b.disabled) && $('pkDeal').disabled && !$('pkNote').hidden
        && $('pkNote').textContent === 'You need 10 credits to play.', $('pkNote').textContent);
    } else {
      const pays = poker.view(poker.newHand({ seed: 'look', id: 't', bet: BET }), 1e9).pays;
      ok('the pay table is the state’s own nine rows, five left and four right',
        payRows().length === 9
        && payRows().map((r) => r.querySelector('span').textContent).join() === [0, 5, 1, 6, 2, 7, 3, 8, 4].filter((i) => pays[i]).map((i) => pays[i].name).join()
        && payRows().map((r) => r.querySelector('b').textContent).join() === [0, 5, 1, 6, 2, 7, 3, 8, 4].filter((i) => pays[i]).map((i) => String(pays[i].mult)).join(),
        payRows().length + ' rows, first ' + payRows()[0].textContent);
      ok('no pay row is lit before a result', litRow() === 'none');
      ok('betting: a dim pot preview of the stake, Deal ready and focused',
        doc.querySelector('#pkLine .hl-pot.preview b').textContent === '10' && !$('pkDeal').disabled && active() === $('pkDeal'), activeName());
      // 1 to 5 are this game's keys, but only while there are cards to mark. Taking the key on the
      // bet screen swallows it from whatever else wants a digit, for a press that does nothing
      const keyBefore = sentPk.length;
      const atBet = doc.pressKey('1'); advance(2);
      ok('a number key on the bet screen is left alone and marks nothing',
        atBet.defaultPrevented === false && sentPk.length === keyBefore, 'prevented ' + atBet.defaultPrevented);

      // --- the deal walks five cards in, and the cards cannot be pressed until they land ---
      let hand = pkSeed((h, v) => v.cards.length === 5, 'pk-deal-');
      const dealt = poker.view(hand, 1e9);
      doc.pressKey('Enter'); advance(2);
      const seen = {};
      for (let t = 0; t <= 700; t++) {
        for (let i = 0; i < 5; i++) {
          const c = cardOf(i);
          if (c && seen['c' + i] == null && c.style.visibility !== 'hidden') seen['c' + i] = t;
        }
        if (seen.open == null && slots().length === 5 && !slotAt(0).disabled) seen.open = t;
        if (seen.press == null && slots().length === 5) { slotAt(0).click(); if (slotAt(0).classList.contains('held')) { seen.press = t; slotAt(0).click(); } }
        advance(1);
      }
      ok('deal: five cards, the engine’s own, in at 90ms steps',
        slots().length === 5 && slots().map((s) => s.getAttribute('aria-label')).join().indexOf('of ') > 0
        && (R ? [0, 1, 2, 3, 4].every((i) => seen['c' + i] <= 1) : [0, 1, 2, 3, 4].every((i) => seen['c' + i] === i * 90)),
        [0, 1, 2, 3, 4].map((i) => seen['c' + i]).join(','));
      ok('deal: the cards take presses once they have landed', R ? seen.press <= 1 : seen.press === 560, 'pressable at ' + seen.press + 'ms');
      // and they say so: a slot that turns a press away has to be a disabled button, or a keyboard
      // and a screen reader are offered a control that answers nothing
      ok('deal: the cards are disabled buttons until they land', R ? seen.open <= 1 : seen.open === 560, 'enabled at ' + seen.open + 'ms');
      ok('deal: nothing is held yet, so the button offers to draw five', label() === 'Draw 5' && slots().every((s) => s.getAttribute('aria-pressed') === 'false'), label());
      ok('deal: each card names the key that marks it',
        slots().map((s) => s.getAttribute('title')).join() === 'Hold (1),Hold (2),Hold (3),Hold (4),Hold (5)',
        slots().map((s) => s.getAttribute('title')).join());

      // --- marking cards: click and the number keys, both local ---
      slotAt(0).click(); advance(2);
      ok('a card press holds it and the label counts down', slotAt(0).classList.contains('held') && slotAt(0).getAttribute('aria-pressed') === 'true' && label() === 'Draw 4', label());
      const atDraw = doc.pressKey('2'); advance(2);
      ok('the number keys hold too, and this one is the game’s to take',
        slotAt(1).classList.contains('held') && label() === 'Draw 3' && atDraw.defaultPrevented === true, label() + ' prevented ' + atDraw.defaultPrevented);
      doc.pressKey('2'); advance(2);
      ok('pressing again lets it go', !slotAt(1).classList.contains('held') && label() === 'Draw 4', label());
      ok('holding is local: nothing went to the host', sentPk.map((m) => m.op).join() === 'open,deal', sentPk.map((m) => m.op).join());
      slotAt(2).click(); advance(2);
      ok('all five held reads Keep all', (function () { slotAt(1).click(); slotAt(3).click(); slotAt(4).click(); advance(2); return label() === 'Keep all'; })(), label());
      slotAt(1).click(); slotAt(3).click(); slotAt(4).click(); advance(2); // back to holding 0 and 2

      // --- the draw sends the five flags in one message, and only the discards move ---
      const want = [true, false, true, false, false];
      const after = drawn(hand, want);
      const changed = [1, 3, 4];
      $('pkDraw').click(); advance(2);
      const sent = sentPk[sentPk.length - 1];
      ok('draw: one message carrying five booleans', sent.op === 'draw' && Array.isArray(sent.hold) && sent.hold.length === 5
        && sent.hold.every((h) => typeof h === 'boolean') && sent.hold.join() === want.join(), JSON.stringify(sent.hold));
      const moved = { held: false }, back = {};
      for (let t = 0; t <= 900; t++) {
        for (const i of [0, 2]) { const c = cardOf(i); if (c && (c.classList.contains('in') || c.classList.contains('out'))) moved.held = true; }
        for (const i of changed) { const c = cardOf(i); if (c && c.classList.contains('in') && back['c' + i] == null) back['c' + i] = t; }
        if (moved.chip == null && doc.querySelector('#pkLine .bj-chip')) moved.chip = t;
        if (moved.lit == null && doc.querySelector('#pkPays .pk-pay.on')) moved.lit = t;
        advance(1);
      }
      ok('draw: the kept cards never move', !moved.held);
      if (!R) ok('draw: the discards come back from 140ms, 80ms apart', changed.map((i) => back['c' + i]).join() === '140,220,300', changed.map((i) => back['c' + i]).join());
      const settleAt = R ? 0 : 140 + 2 * 80 + 160 + 250;
      ok('draw: the result chip waits for the last card', R ? moved.chip <= 1 : moved.chip === settleAt, 'chip at ' + moved.chip + 'ms, expected ' + settleAt);
      ok('draw: the result is the engine’s hand and net',
        chip() === 'bj-chip ' + (after.hand.mult > 0 ? (after.hand.name === after.pays[0].name ? 'bj' : 'win') : 'lose') + ' ' + after.hand.name + ' ' + sgn(after.net),
        chip() + ' engine ' + after.hand.name + ' ' + after.net);
      if (after.hand.mult > 0) ok('draw: the pay row that paid is lit', litRow().indexOf(after.hand.name) === 0 && (R ? moved.lit <= 1 : moved.lit === settleAt), litRow() + ' at ' + moved.lit + 'ms');
      else ok('draw: a losing hand lights no row', litRow() === 'none' && /lose/.test(chip()), chip());
      ok('draw: back to the bet controls', !$('pkBet').hidden && $('pkPlay').hidden && !$('pkDeal').disabled);
      ok('draw: the hand is over, so the cards stop being buttons to press', slots().every((s) => s.disabled), slots().map((s) => String(s.disabled)).join());

      // --- a hand that cannot win: the chip says No win and the loss is the bet ---
      hand = pkSeed((h) => drawn(h, HOLD_NONE).hand.mult === 0, 'pk-lose-');
      const lost = drawn(hand, HOLD_NONE);
      doc.pressKey('Enter'); settleAll();
      $('pkDraw').click(); settleAll();
      ok('a losing hand: No win and the opening bet gone',
        chip() === 'bj-chip lose ' + lost.hand.name + ' ' + sgn(-BET) && lost.net === -BET && litRow() === 'none', chip() + ' engine net ' + lost.net);

      // --- a paying hand lights its row ---
      hand = pkSeed((h) => drawn(h, HOLD_NONE).hand.mult >= 2, 'pk-win-'); // one that pays more than it took
      const won = drawn(hand, HOLD_NONE);
      doc.pressKey('Enter'); settleAll();
      $('pkDraw').click(); settleAll();
      ok('a paying hand lights exactly its own row and takes the plain win chip',
        doc.querySelectorAll('#pkPays .pk-pay.on').length === 1 && litRow().indexOf(won.hand.name) === 0
        && chip() === 'bj-chip ' + (won.hand.name === won.pays[0].name ? 'bj' : 'win') + ' ' + won.hand.name + ' ' + sgn(won.net) && won.net > 0,
        litRow() + ' | ' + chip() + ' | engine ' + won.hand.name + ' ' + won.net);
      ok('the result is read out', /−|\+/.test($('pkLive').textContent) && $('pkLive').textContent.indexOf(won.hand.name) === 0, JSON.stringify($('pkLive').textContent));

      // --- a fresh deal clears the last hand's verdict before the new cards land ---
      // The deal paces five cards over 560ms and the verdict is only redrawn at the end of that.
      // The chip and the lit row belong to the hand being replaced, so left up they read as the
      // judgement on cards that are still coming down. The hand above left a win on the felt
      hand = pkSeed(() => true, 'pk-clear-');
      doc.pressKey('Enter'); advance(2);
      const stale = {};
      for (let t = 0; t <= 100; t++) {
        if (stale.chip == null && doc.querySelector('#pkLine .bj-chip')) stale.chip = t;
        if (stale.lit == null && doc.querySelector('#pkPays .pk-pay.on')) stale.lit = t;
        advance(1);
      }
      ok('a fresh deal drops the last hand’s chip and lit row at once, leaving the new pot',
        stale.chip == null && stale.lit == null && !!doc.querySelector('#pkLine .hl-pot'),
        'chip at ' + stale.chip + 'ms, row at ' + stale.lit + 'ms, line ' + JSON.stringify($('pkLine').textContent));
      settleAll(); $('pkDraw').click(); settleAll();

      // --- a late reply (after the no-reply timeout) is drawn without pacing or reactions ---
      // The draw is the one message of this game that moves money. A reply the screen gave up
      // waiting for has to land as a plain redraw: paced again it would deal the hand a second
      // time, and announced again it would read out a balance that has already moved
      hand = pkSeed(() => true, 'pk-late-');
      doc.pressKey('Enter'); settleAll();
      const lateHand = drawn(hand, HOLD_NONE);
      const saidBefore = $('pkLive').textContent;
      h.hostDelay = 5000;
      $('pkDraw').click(); advance(2); h.hostDelay = 1;
      advance(3997);
      const quietBefore4s = $('pkErr').hidden;
      advance(1);
      ok('late: nothing at 3,999ms, the notice at 4s, and the draw live again',
        quietBefore4s && !$('pkErr').hidden && !$('pkDraw').disabled && $('pkBet').hidden,
        'hidden before ' + quietBefore4s + ', after ' + $('pkErr').hidden);
      const late = {};
      for (let t = 0; t <= 1100; t++) {
        if (late.chip == null && doc.querySelector('#pkLine .bj-chip')) late.chip = t;
        advance(1);
      }
      // the verdict landing with the reply instead of ~710ms behind it is what says it was not paced
      ok('late reply: drawn the moment it lands, not paced, notice cleared, table unlocked',
        late.chip === 1001 && $('pkErr').hidden && !$('pkBet').hidden && !$('pkDeal').disabled,
        'chip at ' + late.chip + 'ms');
      ok('late reply: the engine’s hand, and not read out a second time',
        chip() === 'bj-chip ' + (lateHand.hand.mult > 0 ? (lateHand.hand.name === lateHand.pays[0].name ? 'bj' : 'win') : 'lose') + ' ' + lateHand.hand.name + ' ' + sgn(lateHand.net)
        && $('pkLive').textContent === saidBefore, chip() + ' | said ' + JSON.stringify($('pkLive').textContent));

      // --- a refused draw moves no card: nothing happened, so nothing is paced ---
      // hold is this game's own message shape and the host refuses one that is not five booleans.
      // The reply carries the hand exactly as it stands, which paced would deal the same five
      // cards onto the felt again, and the marks the player made have to survive it
      hand = pkSeed(() => true, 'pk-refuse-');
      doc.pressKey('Enter'); settleAll();
      slotAt(0).click(); advance(2);
      const faces = [0, 1, 2, 3, 4].map((i) => cardOf(i).innerHTML);
      const lineBefore = $('pkLine').textContent, labelBefore = label(), balBefore = hdrBal();
      h.intercept = (m) => {
        if (m.op !== 'draw') return false;
        h.intercept = null;
        later(1, () => toWebview({ type: 'pk', n: m.n, state: poker.view(hand, 1e9), error: 'hold must be 5 true/false flags', balance: ledgerBalance(), free: ledgerBalance() }));
        return true;
      };
      $('pkDraw').click(); advance(3);
      let paced = 0;
      for (let t = 0; t <= 900; t++) {
        paced = Math.max(paced, [0, 1, 2, 3, 4].filter((i) => { const c = cardOf(i); return c && (c.classList.contains('in') || c.classList.contains('out')); }).length);
        advance(1);
      }
      ok('a refused draw: the notice shows and not one card is dealt again',
        !$('pkErr').hidden && paced === 0 && [0, 1, 2, 3, 4].every((i) => cardOf(i).innerHTML === faces[i]),
        $('pkErr').textContent + ' | cards moved ' + paced);
      ok('a refused draw: the pot, the marks and the balance are untouched and the draw comes back',
        $('pkLine').textContent === lineBefore && chip() === 'none' && label() === labelBefore
        && slotAt(0).classList.contains('held') && hdrBal() === balBefore && !$('pkDraw').disabled,
        JSON.stringify($('pkLine').textContent) + ' | ' + label() + ' | ' + hdrBal());
      $('pkDraw').click(); settleAll();   // the host still holds the hand: settle it for real

      // --- the pay table prints whatever the engine hands over, not five rows and a bit ---
      // A reply nobody is waiting for, so it is drawn as it stands. The table is nine rows today
      // and the screen holds no numbers of its own, so a retune here has to come out whole
      const wide = Object.assign(poker.idleView(), { pays: pays.concat([{ name: 'Row ten', mult: 9 }, { name: 'Row eleven', mult: 7 }]) });
      toWebview({ type: 'pk', state: wide }); advance(5);
      ok('a longer pay table prints every row, both columns',
        payRows().length === 11 && payRows().map((r) => r.querySelector('span').textContent).join().indexOf('Row ten') > 0
        && payRows().map((r) => r.querySelector('span').textContent).indexOf('Row eleven') >= 0,
        payRows().length + ' rows: ' + payRows().map((r) => r.querySelector('span').textContent).join());

      // --- the shortcuts belong to this game only ---
      let pkBefore = sentPk.length;
      openList();
      for (const k of ['1', '2', '3', '4', '5', 'Enter']) doc.pressKey(k, { target: doc.body });
      advance(20);
      ok('guard: on the games list no poker key deals or marks', sentPk.length === pkBefore, sentPk.slice(pkBefore).map((m) => m.op).join());

      h.rowFor('hilo').click(); advance(20);
      let hlBefore = sentHl.length;
      doc.pressKey('Enter', { target: doc.body }); settleAll();
      ok('guard: Enter at High-Low deals High-Low, not poker',
        sentHl.slice(hlBefore).join() === 'deal' && sentPk.length === pkBefore,
        sentHl.slice(hlBefore).join() + ' | pk ' + sentPk.slice(pkBefore).map((m) => m.op).join());
      $('hlBack').click(); advance(20);

      h.rowFor('poker').click(); advance(20);
      pkBefore = sentPk.length; hlBefore = sentHl.length;
      doc.pressKey('ArrowUp', { target: doc.body }); doc.dispatchKey('s'); advance(20);
      ok('guard: the other games’ keys do nothing at poker',
        sentPk.length === pkBefore && sentHl.length === hlBefore,
        sentPk.slice(pkBefore).map((m) => m.op).join() + ' | hl ' + sentHl.slice(hlBefore).join());
      doc.pressKey('Enter', { target: doc.body }); settleAll();
      ok('guard: Enter at poker deals poker',
        sentPk.slice(pkBefore).map((m) => m.op).join() === 'deal' && sentHl.length === hlBefore,
        sentPk.slice(pkBefore).map((m) => m.op).join());
      $('pkBack').click(); advance(20); h.rowFor('poker').click(); advance(20);

      // --- walking out mid-deal must not freeze the header ---
      pkSeed(() => true, 'pk-leave-');
      doc.pressKey('Enter'); advance(2);
      $('hdCredits').click(); advance(5);
      toWebview({ type: 'data', data: { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: 4321, today: 777, frac: 0.5, perCredit: 100000, counting: false } } });
      advance(5);
      ok('leaving mid-deal releases the header hold', /\+777 today/.test($('hdCredits').title) && hdrBal() === '4,321', JSON.stringify($('hdCredits').title) + ' ' + hdrBal());
    }
  }
};
