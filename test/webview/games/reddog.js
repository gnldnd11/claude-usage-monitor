// Red Dog, end to end. The openings (a spread, a pair, a consecutive pair) are made by searching
// the engine for the seed that deals them, never by faking a reply, so every figure expected below
// is read back out of the engine's own table. A fresh shoe every round means a seed names a round
// on its own, with nothing carried in from the last one.
'use strict';

module.exports = {
  id: 'reddog',
  modes: ['reddog', 'reddog-reduce', 'reddog-poor', 'reddog-thin'],
  // poor cannot deal at all; thin can deal exactly one hand and then has nothing left to raise
  // with, which is the one screen where the raise is refused before it is pressed
  start: { 'reddog-poor': 5, 'reddog-thin': require('../../../reddog.js').MIN_BET },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, notShown, bodyTabs, openList, openGame, gameRow, hdrBal,
      active, activeName, ledgerBalance, toWebview, errors, ext, EXT, path } = h;

    const reddog = require(path.join(EXT, 'reddog.js'));
    const R = MODE === 'reddog-reduce';
    const BET = reddog.MIN_BET;
    const sentRd = h.sent('rd');
    const ops = (from) => sentRd.slice(from == null ? 0 : from).map((m) => m.op).join();

    // docs/game-panels.md, section 6. The two openers go down at blackjack's own interval, the
    // figures in the space between them follow, and the third card is a beat after whatever starts
    // it: the move for a raise or a stand, the gap for a pair, which deals its own third card
    const T = { two: 170, spread: 300, third: 220, settle: 220, unlock: 40 };

    function rdSeed(want, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = reddog.newRound({ seed, id: 't', bet: BET });
        if (want(st, reddog.view(st, 1e9))) { ext._test.setSeeds('rd', () => seed); return st; }
      }
      throw new Error('no Red Dog seed for ' + tag);
    }

    const money = (n) => Math.round(n).toLocaleString('en-US');
    const sgn = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
    const word = (c) => (({ A: 'ace', J: 'jack', Q: 'queen', K: 'king' })[c.r] || c.r) + ' of '
      + ({ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' })[c.s];
    const card = (st, i) => word(reddog.view(st, 1e9).cards[i]);
    // what the chip on the line has to read, worked out from the engine's own settled round
    function verdictOf(st) {
      if (st.result === 'push') return st.kind === 'pair' ? 'No match, push' : 'Consecutive, push';
      if (st.kind === 'pair') return 'Matched ' + sgn(st.net);
      return (st.result === 'win' ? 'Inside ' : 'Outside ') + sgn(st.net);
    }

    const cardW = (id) => { const svg = $(id).querySelector('svg'); return svg ? svg.getAttribute('width') : null; };
    const label = (id) => $(id).getAttribute('aria-label');
    const spread = () => { const b = doc.querySelector('#rdGap .rd-spread'); return b ? b.textContent : null; };
    const gapChip = () => { const c = doc.querySelector('#rdGap .bj-chip'); return c ? c.textContent : null; };
    const gapShown = () => !$('rdGap').hidden;
    const thirdDown = () => !$('rdC').hidden && !!$('rdC').querySelector('svg');
    const chip = () => { const c = doc.querySelector('#rdLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const line = () => $('rdLine').textContent;
    const said = () => $('rdLive').textContent;
    const chips = () => doc.querySelectorAll('#rdStakes button').map((b) => b.getAttribute('data-v') + (b.disabled ? '-off' : '-on')).join(' ');
    const stand = () => doc.querySelector('#rdPlay [data-op="stand"]');
    const pot = () => { const p = doc.querySelector('#rdLine .hl-pot:not(.preview) b'); return p ? p.textContent : null; };
    const settle = () => advance(1200);

    // Every visible beat of one reply, 1ms at a time from the moment it landed
    function show(ms) {
      const t0 = h.now, m = {};
      const mark = (k) => { if (m[k] == null) m[k] = h.now - t0; };
      for (let i = 0; i <= ms; i++) {
        if ($('rdA').querySelector('svg')) mark('a');
        if ($('rdB').querySelector('svg')) mark('b');
        if (gapShown()) { mark('gap'); if (m.gapText == null) m.gapText = (spread() || '') + '|' + (gapChip() || ''); }
        if (thirdDown()) mark('c');
        if ($('rdCards').classList.contains('part')) mark('part');
        if (doc.querySelector('#rdLine .bj-chip')) mark('chip');
        if (!$('rdPlay').hidden) mark('play');
        if (!$('rdPlay').hidden && !stand().disabled) mark('unlock');
        advance(1);
      }
      return m;
    }

    openGame('reddog');
    ok('the Red Dog row opens it and asks the host for its state',
      doc.body.classList.contains('game-rd') && $('panel-reddog').style.display === ''
      && notShown('panelTable') && ops() === 'open', bodyTabs() + ' ' + ops());
    ok('it is a card table: the felt and the dealer, with no machine plate on it',
      !!doc.querySelector('#panel-reddog .bj-felt') && !!doc.querySelector('#panel-reddog .rd-stage .bj-crab img')
      && !doc.querySelector('#panel-reddog .gm-plate'), $('panel-reddog').className);
    ok('the table is folded away until it is asked for', $('rdPays').hidden && $('rdWhy').getAttribute('aria-expanded') === 'false');

    if (MODE === 'reddog-poor') {
      ok('not enough credits: chips off, Deal off, note shown',
        chips() === '10-off 100-off 1000-off' && $('rdDeal').disabled && !$('rdNote').hidden
        && $('rdNote').textContent === 'You need ' + BET + ' credits to play.', chips() + ' | ' + $('rdNote').textContent);
      ok('and an empty felt says so rather than showing cards nobody was dealt',
        !$('rdA').querySelector('svg') && !thirdDown() && !gapShown() && label('rdA') === 'No card', label('rdA'));
      return;
    }

    ok('betting: a dim pot preview of the stake, Deal ready and focused',
      doc.querySelector('#rdLine .hl-pot.preview b').textContent === String(BET)
      && !$('rdDeal').disabled && active() === $('rdDeal'), line() + ' focus ' + activeName());

    if (MODE === 'reddog-thin') {
      // the whole purse is riding on this hand, so the raise is the one move the table cannot take
      const thin = rdSeed((s) => s.kind === 'spread', 'rd-thin-');
      doc.pressKey('Enter'); settle();
      ok('a hand that took the whole purse: stand is open and the raise is not',
        !$('rdPlay').hidden && !stand().disabled && $('rdRaise').disabled
        && reddog.view(thin, BET).can.raise === false, 'raise disabled ' + $('rdRaise').disabled);
      ok('and the line says what the raise would take, rather than leaving a dead button unexplained',
        !$('rdNote').hidden && $('rdNote').textContent === 'You need ' + BET + ' more credits to raise.',
        JSON.stringify($('rdNote').textContent));
      ok('the focus goes to the move that IS open, so the keyboard is not left on a dead button',
        active() === stand(), activeName());
      doc.dispatchKey('s'); settle();
      ok('standing works with nothing left to raise with, and the hand settles',
        $('rdPlay').hidden && chip() !== 'none', chip());
      ok('no handler threw anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
      ext._test.setSeeds('rd', null);
      return;
    }

    // --- a spread that is stood on and loses -----------------------------------------------
    let st = rdSeed((s) => s.kind === 'spread' && reddog.act(s, 'stand').result === 'lose', 'rd-out-');
    let v = reddog.view(st, 1e9);
    let done = reddog.act(st, 'stand');
    doc.pressKey('Enter'); advance(2);
    let m = show(500);
    ok('deal: the two openers at 4px cells, nothing else on the felt yet',
      cardW('rdA') === '64' && cardW('rdB') === '64' && !thirdDown(), cardW('rdA') + '/' + cardW('rdB'));
    ok('deal: one card, then the other, then the space between them is priced',
      R ? (m.a === 0 && m.b === 0 && m.gap === 0)
        : (m.a === 0 && m.b === T.two && m.gap === T.spread), JSON.stringify(m));
    ok('deal: the gap is the engine’s spread and the engine’s odds, both as sent',
      spread() === String(v.spread) && gapChip() === v.row.odds + ' to 1'
      && $('rdGap').getAttribute('aria-label') === 'Spread ' + v.spread + ', paying ' + v.row.odds + ' to 1',
      spread() + ' | ' + gapChip() + ' | engine ' + v.spread + '/' + v.row.odds);
    ok('deal: the cards carry their own names, because the art is aria-hidden',
      label('rdA') === card(st, 0) && label('rdB') === card(st, 1), label('rdA') + ' | ' + label('rdB'));
    ok('deal: the wager on the line is the engine’s, and no verdict is claimed yet',
      pot() === money(v.wager) && chip() === 'none' && m.chip == null, line() + ' | ' + chip());
    ok('deal: two buttons and no more, both live, and they come back after the gap is priced',
      doc.querySelectorAll('#rdPlay [data-op]').length === 2 && !$('rdRaise').disabled && !stand().disabled
      && m.unlock === (R ? 0 : T.spread + T.unlock), 'unlock at ' + m.unlock);
    ok('deal: the raise is priced at the bet it adds, which is the host’s figure',
      $('rdRaise').textContent.replace(/\s+/g, ' ').trim() === 'Raise ' + money(v.bet), $('rdRaise').textContent);
    ok('deal: the opening is read out, with both cards and what the gap pays',
      said() === card(st, 0) + ' and ' + card(st, 1) + '. Spread ' + v.spread + ', paying ' + v.row.odds
      + ' to 1. Raise or stand.', JSON.stringify(said()));

    doc.dispatchKey('s'); advance(2);
    m = show(700);
    ok('stand: the two part, then the third card falls into the space they held',
      R ? (m.part === 0 && m.c === 0) : (m.part === 0 && m.c === T.third && m.part < m.c), JSON.stringify(m));
    ok('stand: and the gap closes behind it, because the question is answered',
      !gapShown() && thirdDown() && cardW('rdC') === '64' && label('rdC') === card(done, 2),
      'gap ' + gapShown() + ' | ' + label('rdC'));
    ok('stand: the verdict follows the card, carrying the engine’s own net',
      chip() === 'bj-chip lose ' + verdictOf(done) && m.chip === (R ? 0 : T.third + T.settle),
      chip() + ' | engine net ' + done.net + ' at ' + m.chip);
    ok('stand: the bet controls come back and the hand is over',
      !$('rdBet').hidden && $('rdPlay').hidden && !$('rdDeal').disabled);
    // a hand played at the opening bet leaves the chips saying what it was, so the line is the
    // verdict and nothing else: one piece, not two
    ok('stand: the line is the verdict alone, because the wager was never doubled',
      pot() === null && done.raised === false, JSON.stringify(line()));
    ok('stand: the third card and the verdict are read out with the balance',
      said() === 'Third card ' + card(done, 2) + '. ' + verdictOf(done) + '. Balance ' + money(ledgerBalance()) + '.',
      JSON.stringify(said()) + ' | purse ' + money(ledgerBalance()));

    // --- a spread that is raised and wins. The raise doubles the wager, so what was riding is
    // worth saying once the hand is over: the chips are still set to the bet
    st = rdSeed((s) => s.kind === 'spread' && reddog.act(s, 'raise').result === 'win', 'rd-in-');
    const raised = reddog.act(st, 'raise');
    doc.pressKey('Enter'); settle();
    const bal0 = ledgerBalance();
    doc.dispatchKey('r'); settle();
    ok('raise: the win chip is the engine’s net and the purse agrees with it',
      chip() === 'bj-chip win ' + verdictOf(raised) && ledgerBalance() === bal0 + raised.net,
      chip() + ' | engine net ' + raised.net + ' | purse ' + (ledgerBalance() - bal0));
    ok('raise: what was riding is on the line beside the verdict, doubled',
      pot() === money(raised.wager) && raised.wager === 2 * BET && raised.raised === true,
      pot() + ' | engine wager ' + raised.wager);

    // --- a pair: there is nothing to decide, so no choice is ever offered ------------------
    st = rdSeed((s) => s.kind === 'pair', 'rd-pair-');
    v = reddog.view(st, 1e9);
    doc.pressKey('Enter'); advance(2);
    m = show(900);
    ok('a pair: it deals its own third card, and no choice is offered at any point',
      m.play == null && $('rdPlay').hidden && st.phase === 'done' && thirdDown(),
      'play row at ' + m.play + ' | phase ' + st.phase);
    // a pair is not a narrow gap, it is the other branch, so there is no spread to print: what the
    // space holds is the price of the one thing that can happen next
    ok('a pair: the space between them shows the price and no spread, because there is none',
      v.spread === null && (R ? m.gap == null : (m.gap === T.spread && m.gapText === '|' + v.row.odds + ' to 1')),
      'gap at ' + m.gap + ' showing ' + JSON.stringify(m.gapText) + ' | engine spread ' + v.spread);
    // the longest reveal this table has, and it has to be over inside a second: a pair is two
    // openers, the price, the third card and the verdict, one after the other
    ok('a pair: the third card still falls into the gap, a beat after the price, and inside a second',
      (R ? (m.c === 0 && m.chip === 0) : (m.c === T.spread + T.third && m.part === T.spread
        && m.chip === T.spread + T.third + T.settle)) && m.chip < 1000, JSON.stringify(m));
    ok('a pair: the verdict is the engine’s, and it says a pair’s words',
      chip() === 'bj-chip ' + (st.result === 'win' ? 'win ' : '') + verdictOf(st), chip() + ' | engine ' + st.result);
    ok('a pair: three cards on the felt, each with its own name',
      label('rdA') === card(st, 0) && label('rdB') === card(st, 1) && label('rdC') === card(st, 2),
      [label('rdA'), label('rdB'), label('rdC')].join(' | '));

    // --- consecutive: no third card is dealt at all, and the bet comes back ----------------
    st = rdSeed((s) => s.kind === 'consecutive', 'rd-run-');
    doc.pressKey('Enter'); advance(2);
    m = show(900);
    ok('consecutive: no choice, no third card, and the 0 that is the reason why',
      m.play == null && !thirdDown() && (R ? m.gap === 0 : m.gap === T.spread)
      && spread() === '0' && m.gapText === '0|',
      'play at ' + m.play + ' | gap at ' + m.gap + ' showing ' + JSON.stringify(m.gapText));
    ok('consecutive: the push chip lands a beat after the gap, and the purse did not move',
      chip() === 'bj-chip Consecutive, push' && st.net === 0 && m.chip === (R ? 0 : T.spread + T.settle),
      chip() + ' at ' + m.chip);
    ok('consecutive: nothing is priced, because nothing can be won',
      gapChip() === null && reddog.view(st, 1e9).row.odds === null, gapChip());

    // --- the whole table, folded (docs/game-panels.md, section 5) --------------------------
    st = rdSeed((s) => s.kind === 'spread' && s.spread === 1, 'rd-s1-');
    doc.pressKey('Enter'); settle();
    $('rdWhy').click(); advance(2);
    const pays = doc.querySelectorAll('#rdPays .rd-pay');
    const bad = [];
    for (let i = 0; i < reddog.PAYS.length; i++) {
      const r = reddog.PAYS[i], row = pays[i];
      if (!row) { bad.push('row ' + i + ' is missing'); continue; }
      const want = r.name + (r.odds == null ? 'push' : r.odds + ' to 1')
        + (r.chance ? money(r.chance.num) + '/' + money(r.chance.den) : '');
      if (row.textContent !== want) bad.push(i + ': ' + row.textContent + ' should be ' + want);
    }
    ok('the toggle opens the engine’s whole table, a row a spread, priced as the engine prices it',
      !$('rdPays').hidden && pays.length === reddog.PAYS.length && bad.length === 0,
      pays.length + ' rows | ' + bad.slice(0, 3).join(' | '));
    ok('and the row in hand is the lit one, so the table says where this hand sits',
      doc.querySelectorAll('#rdPays .rd-pay.on').length === 1
      && doc.querySelector('#rdPays .rd-pay.on').textContent.indexOf('Spread 1') === 0,
      doc.querySelector('#rdPays .rd-pay.on') ? doc.querySelector('#rdPays .rd-pay.on').textContent : 'none');
    ok('the chances are the fractions the host counted: nothing here was divided',
      doc.querySelectorAll('#rdPays .rd-pay i').map((e) => e.textContent).join() ===
        reddog.PAYS.map((r) => (r.chance ? money(r.chance.num) + '/' + money(r.chance.den) : '')).join(),
      doc.querySelectorAll('#rdPays .rd-pay i').map((e) => e.textContent).slice(0, 3).join(' '));
    $('rdWhy').click(); advance(2);
    ok('and it folds away again', $('rdPays').hidden && $('rdWhy').getAttribute('aria-expanded') === 'false');
    doc.dispatchKey('s'); settle();   // that hand is still live: finish it before dealing another

    // --- a hand survives walking out of it and back in (the host keeps it; the screen asks again)
    st = rdSeed((s) => s.kind === 'spread', 'rd-back-');
    doc.pressKey('Enter'); settle();
    const midA = $('rdA').innerHTML, midGap = $('rdGap').innerHTML, midLine = line();
    openList(); advance(5);
    h.rowFor('reddog').click(); advance(20);
    ok('back from the list mid-hand: the same cards, the same gap, the choice still open',
      $('rdA').innerHTML === midA && $('rdGap').innerHTML === midGap && line() === midLine
      && !$('rdPlay').hidden && $('rdBet').hidden, line() + ' vs ' + midLine);
    ok('back from the list mid-hand: the cards did not deal themselves again',
      !$('rdA').classList.contains('in') && !$('rdB').classList.contains('in'), $('rdA').className);

    // --- a refused move draws nothing: nothing happened, so nothing moves -----------------
    const live = reddog.view(st, 1e9);
    h.intercept = (msg) => {
      if (msg.op !== 'raise') return false;
      h.intercept = null;
      later(1, () => toWebview({ type: 'rd', n: msg.n, state: live, error: 'not enough credits', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.dispatchKey('r'); advance(3);
    ok('a refused move: the reason shows and no card is dealt or moved',
      !$('rdErr').hidden && !thirdDown() && !$('rdCards').classList.contains('part')
      && !$('rdC').classList.contains('in'), $('rdErr').textContent);
    advance(900);
    ok('a refused move: the gap and the wager are untouched and the buttons come back',
      $('rdGap').innerHTML === midGap && line() === midLine && !stand().disabled, line() + ' | ' + $('rdGap').innerHTML);

    // --- a reply with no state ------------------------------------------------------------
    // That one is the FLOOR's rule and not this screen's, so the five things it asks of every panel
    // (the reason shows, what was drawn stays drawn, nothing is paced, the wait is released, the
    // next input is answered) are measured for all fourteen screens in one place:
    // test/webview/games/_fault.js, the `stateless` mode. A second copy here is a second place for
    // one rule to be loosened in, which is how the two copies of it came to differ in the first
    // place. What is still needed here is the SETTLE the next block depends on: a live hand refuses
    // the deal it is about to make
    doc.dispatchKey('s'); settle();
    ok('standing settles the hand, so the bet row is back for the next deal',
      !$('rdBet').hidden && thirdDown() && $('rdErr').hidden, line() + ' | ' + $('rdErr').textContent);

    // --- a reply nobody asked for is drawn as it stands, with no pacing --------------------
    const cast = reddog.view(reddog.act(rdSeed((s) => s.kind === 'spread', 'rd-cast-'), 'stand'), 1e9);
    toWebview({ type: 'rd', state: cast, balance: ledgerBalance(), free: ledgerBalance() });
    advance(5);
    ok('a broadcast: the whole hand is there at once, with no card walked in',
      thirdDown() && !$('rdC').classList.contains('in') && !$('rdA').classList.contains('in')
      && h.pending(0) === 0, 'pending ' + h.pending(0));
    ok('a broadcast: a verdict already settled is put back without popping',
      chip().indexOf('still') > 0, chip());

    // --- a hand nobody answers ------------------------------------------------------------
    rdSeed((s) => s.kind === 'spread', 'rd-quiet-');
    doc.pressKey('Enter'); settle();
    h.intercept = (msg) => { if (msg.op !== 'stand') return false; h.intercept = null; return true; };
    doc.dispatchKey('s'); advance(5);
    ok('an unanswered move keeps the buttons out and says nothing yet', stand().disabled && $('rdErr').hidden);
    advance(3900);
    ok('still nothing just short of four seconds', $('rdErr').hidden, $('rdErr').textContent);
    advance(200);
    ok('at four seconds the table admits it and hands the buttons back',
      !$('rdErr').hidden && $('rdErr').textContent.indexOf('respond') > 0 && !stand().disabled,
      $('rdErr').textContent);
    doc.dispatchKey('s'); settle();

    // --- the shortcuts belong to this game only -------------------------------------------
    let n0 = sentRd.length;
    openList(); doc.dispatchKey('r'); doc.dispatchKey('s'); doc.pressKey('Enter', { target: doc.body }); advance(20);
    ok('guard: Red Dog keys do nothing on the games list', sentRd.length === n0, ops(n0));
    gameRow().click(); advance(20);
    doc.dispatchKey('r'); advance(20);
    ok('guard: Red Dog keys do nothing at the blackjack table', sentRd.length === n0, ops(n0));
    $('bjBack').click(); advance(5);
    h.rowFor('reddog').click(); advance(20);
    rdSeed((s) => s.kind === 'spread', 'rd-keys-');
    n0 = sentRd.length;
    doc.pressKey('Enter'); settle();
    ok('Enter deals, R raises and S stands, so a hand is played on the keyboard alone',
      ops(n0) === 'open,deal' || ops(n0) === 'deal', ops(n0));
    doc.dispatchKey('r'); settle();
    ok('and the raise went out on the key alone', ops(n0).indexOf('raise') > 0, ops(n0));

    ok('no handler threw anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
    ext._test.setSeeds('rd', null);
  }
};
