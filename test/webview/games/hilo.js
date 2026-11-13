// High-Low, end to end. The situations (a tie, a wrong call, a card with only one live side) are
// made by searching the engine for a seed, never by faking a reply.
'use strict';

module.exports = {
  id: 'hilo',
  modes: ['hilo', 'hilo-reduce', 'hilo-poor'],
  start: { 'hilo-poor': 5 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, notShown, bodyTabs, inGames, atTable, gameRow,
        openList, openTable, reopenTable, dealerCards, allCards, isBack, lineText, hdrBal,
        latchIdle, active, activeName, mouseClick, ledgerBalance, useSeed, standOut, watch,
        noStaleTimer, toWebview, sentOps, sentHl, errors, hostLog, roCbs, ext, bj, credits,
        registry, gs, config, EXT, path } = h;

    // The real host and the real engine. Situations (a tie, a wrong call, a card with only one live
    // side) are made by searching the engine for a seed, exactly as the blackjack modes do. A seed
    // does not name a run by itself, because the host carries the shoe from run to run, so the
    // search runs against the deck the host is holding (_test.hlDeck) and the run it finds is the
    // run the host will deal. That is what makes the expectations below exact.
    const highlow = require(path.join(EXT, 'highlow.js'));
    const R = MODE === 'hilo-reduce';
    const BET = 10;
    function hlSeed(want, tag) {
      const deck = ext._test.hlDeck();
      for (let i = 0; i < 20000; i++) {
        const seed = tag + i;
        const run = highlow.newRun({ seed, id: 't', bet: BET, deck });
        if (want(run, highlow.view(run, 1e9))) { ext._test.setHlSeeds(() => seed); return run; }
      }
      throw new Error('no High-Low seed for ' + tag);
    }
    const line = () => $('hlLine').textContent;
    const cardW = (id) => { const svg = $(id).querySelector('svg'); return svg ? svg.getAttribute('width') : null; };
    const chip = () => { const c = doc.querySelector('#hlLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const settle = () => advance(600);
    const money = (n) => Math.round(n).toLocaleString('en-US'); // the same formatting the header uses
    // What a guess button must read: the multiple is read back from the pot the host says a correct
    // call pays, floored, so the price on the button is never one the table cannot honour
    const xOf = (pays, pot) => { const m = pays / pot; return '×' + (m >= 10 ? Math.floor(m) : (Math.floor(m * 10) / 10).toFixed(1)); };
    // hidden mid-animation and empty (or never set, under reduced motion) the rest of the time
    const heroHidden = () => $('hlCard').style.visibility === 'hidden';
    const said = () => $('hlLive').textContent;
    const word = (c) => (({ A: 'ace', J: 'jack', Q: 'queen', K: 'king' })[c.r] || c.r) + ' of ' + ({ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' })[c.s];
    const chips = () => doc.querySelectorAll('#hlStakes button').map((b) => b.getAttribute('data-v') + (b.disabled ? '-off' : '-on')).join(' ');
    openList(); h.rowFor('hilo').click(); advance(20);
    ok('the High-Low row opens it and asks the host for its state',
      doc.body.classList.contains('game-hl') && $('panelHiLo').style.display === '' && notShown('panelTable') && sentHl.join() === 'open', bodyTabs() + ' ' + sentHl.join());
    if (MODE === 'hilo-poor') {
      ok('not enough credits: chips off, Deal off, note shown',
        doc.querySelectorAll('#hlStakes button').every((b) => b.disabled) && $('hlDeal').disabled && !$('hlNote').hidden && $('hlNote').textContent === 'You need 10 credits to play.', $('hlNote').textContent);
    } else {
      ok('betting: a dim pot preview of the stake, Deal ready and focused',
        doc.querySelector('#hlLine .hl-pot.preview b').textContent === '10' && !$('hlDeal').disabled && active() === $('hlDeal'), line() + ' focus ' + activeName());

      // --- a run that wins a call and is cashed out ---
      let run = hlSeed((r, v) => v.odds.higher != null && v.odds.lower != null && highlow.act(r, 'higher').history[0].result === 'win', 'hl-win-');
      const afterCall = highlow.act(run, 'higher');
      const cashed = highlow.act(afterCall, 'cashout');
      const v0 = highlow.view(run, 1e9);
      doc.pressKey('Enter'); advance(2);
      const w1 = watch(400, (marks, t) => { if (!$('hlPlay').hidden && !doc.querySelector('#hlPlay [data-op="higher"]').disabled && marks.unlock == null) marks.unlock = t; });
      ok('deal: one hero card at 4px cells, no pile yet', cardW('hlCard') === '64' && !$('hlPrev').querySelector('svg'), cardW('hlCard'));
      ok('deal: the pot shows and the guesses unlock', line().indexOf(String(BET)) >= 0 && w1.marks.unlock <= (R ? 1 : 200), 'unlock ' + w1.marks.unlock + ' line ' + line());
      ok('the buttons price what a correct call really pays', $('hlUp').textContent === xOf(v0.pays.higher, v0.pot) && $('hlDn').textContent === xOf(v0.pays.lower, v0.pot),
        $('hlUp').textContent + ' ' + $('hlDn').textContent + ' engine pays ' + v0.pays.higher + '/' + v0.pays.lower + ' on a pot of ' + v0.pot);
      ok('cash out is closed until the first call', doc.querySelector('#hlPlay [data-op="cashout"]').disabled && v0.can.cashout === false);
      const potBefore = line(), upBefore = $('hlUp').textContent;
      doc.pressKey('ArrowUp'); advance(2);
      const seen = { line: null, odds: null, prev: null };
      for (let i = 0; i <= 320; i++) {
        if (seen.prev == null && $('hlPrev').querySelector('svg')) seen.prev = i;
        if (seen.line == null && line() !== potBefore) seen.line = i;
        if (seen.odds == null && $('hlUp').textContent !== upBefore) seen.odds = i;
        advance(1);
      }
      ok('a call: the card called on drops to the pile at 32px', cardW('hlPrev') === '32' && seen.prev <= 2, 'pile at ' + seen.prev + 'ms, width ' + cardW('hlPrev'));
      ok('a call: the pot and the odds wait for the card', R ? (seen.line <= 1 && seen.odds <= 1) : (seen.line === 220 && seen.odds === 220), 'pot at ' + seen.line + 'ms, odds at ' + seen.odds + 'ms');
      ok('a call: the pot is the engine’s', line().indexOf(String(afterCall.pot)) >= 0, line() + ' engine pot ' + afterCall.pot);
      // nothing above this line reaches a screen reader: the cards are drawn as bare divs over
      // aria-hidden art, so the hero card has to carry its own name and the move has to be read out
      ok('a call is read out, and the hero card carries its own name',
        said() === 'Higher: right. ' + word(highlow.view(afterCall, 1e9).card) + '. Pot ' + money(afterCall.pot) + '.'
        && $('hlCard').getAttribute('aria-label') === 'Face up: ' + word(highlow.view(afterCall, 1e9).card),
        JSON.stringify(said()) + ' label ' + JSON.stringify($('hlCard').getAttribute('aria-label')));
      doc.pressKey('c'); settle();
      ok('cash out: a win chip carrying the engine’s net, and the cards stay',
        chip() === 'bj-chip win Cashed out +' + money(cashed.net) && !!$('hlCard').querySelector('svg'), chip() + ' engine net ' + cashed.net);
      ok('cash out: back to the bet controls', !$('hlBet').hidden && $('hlPlay').hidden && !$('hlDeal').disabled);
      ok('cash out is read out with the balance', said() === 'Cashed out +' + money(cashed.net) + '. Balance ' + hdrBal() + '.', JSON.stringify(said()));

      // --- a tie carries the pot ---
      run = hlSeed((r) => highlow.act(r, 'higher').history[0].result === 'push', 'hl-tie-');
      const tied = highlow.act(run, 'higher');
      doc.pressKey('Enter'); settle();
      const potAtDeal = line();
      doc.pressKey('ArrowUp'); settle();
      ok('a tie carries the pot and the run goes on', line() === potAtDeal && $('hlPlay').hidden === false && tied.phase === 'play' && tied.pot === run.pot, line() + ' vs ' + potAtDeal);
      ok('only the latest card is kept as the pile', doc.querySelectorAll('#hlPrev svg').length === 1, doc.querySelectorAll('#hlPrev svg').length + ' piles');
      const tiedOut = highlow.act(tied, 'cashout');
      doc.pressKey('c'); settle();

      // --- a wrong call loses the opening bet, never the pot ---
      run = hlSeed((r) => { const a = highlow.act(r, 'higher'); return a.phase === 'done' && a.ended === 'wrong'; }, 'hl-lose-');
      const lost = highlow.act(run, 'higher');
      doc.pressKey('Enter'); settle();
      doc.pressKey('ArrowUp'); settle();
      ok('a wrong call: a lose chip carrying the engine’s net, bet controls back',
        chip() === 'bj-chip lose Wrong −' + money(Math.abs(lost.net)) && lost.net === -BET && !$('hlBet').hidden, chip() + ' engine net ' + lost.net);

      // --- a card with only one live side shows a dash and disables it ---
      run = hlSeed((r, v) => v.odds.lower == null || v.odds.higher == null, 'hl-edge-');
      const vEdge = highlow.view(run, 1e9);
      const dead = vEdge.odds.lower == null ? 'lower' : 'higher';
      const live = dead === 'lower' ? 'higher' : 'lower';
      doc.pressKey('Enter'); settle();
      ok('a side that cannot happen shows a dash and is disabled',
        $(dead === 'lower' ? 'hlDn' : 'hlUp').textContent === '—' && doc.querySelector('#hlPlay [data-op="' + dead + '"]').disabled
        && !doc.querySelector('#hlPlay [data-op="' + live + '"]').disabled, $('hlUp').textContent + '/' + $('hlDn').textContent + ' dead ' + dead);
      doc.pressKey(dead === 'lower' ? 'ArrowUp' : 'ArrowDown'); settle();
      if (!$('hlPlay').hidden) { doc.pressKey('c'); settle(); }

      // --- the shortcuts belong to this game only ---
      const hlBefore = sentHl.length;
      openList(); doc.pressKey('ArrowUp'); doc.pressKey('c'); doc.pressKey('Enter', { target: doc.body }); advance(5);
      ok('guard: High-Low keys do nothing on the list', sentHl.length === hlBefore, sentHl.slice(hlBefore).join());
      gameRow().click(); advance(20); doc.pressKey('ArrowUp'); doc.pressKey('c'); advance(20); // Enter would legitimately deal blackjack here
      ok('guard: High-Low keys do nothing at the blackjack table', sentHl.length === hlBefore && sentOps.indexOf('higher') < 0, sentOps.slice(-3).join() + ' hl ' + sentHl.slice(hlBefore).join());
      $('bjBack').click(); advance(5); h.rowFor('hilo').click(); advance(20);
      const opsBefore = sentOps.length;
      doc.dispatchKey('s'); doc.dispatchKey('h'); advance(5);
      ok('guard: blackjack keys do nothing at High-Low', sentOps.length === opsBefore, sentOps.slice(opsBefore).join());

      // --- a run survives walking out of it and back in (the host keeps it; the screen asks again) ---
      const backRun = hlSeed((r, v) => v.odds.higher != null && highlow.act(r, 'higher').phase === 'play', 'hl-back-');
      const backState = highlow.view(highlow.act(backRun, 'higher'), 1e9); // what the host holds after the call below
      doc.pressKey('Enter'); settle();
      doc.pressKey('ArrowUp'); settle();
      const midCard = $('hlCard').innerHTML, midLine = line(), midUp = $('hlUp').textContent;
      openList(); advance(5);
      h.rowFor('hilo').click(); advance(20);
      ok('back from the list mid-run: the same card, pot and prices, the guesses live',
        $('hlCard').innerHTML === midCard && line() === midLine && $('hlUp').textContent === midUp && !$('hlPlay').hidden && $('hlBet').hidden,
        line() + ' vs ' + midLine + ', up ' + $('hlUp').textContent + ' vs ' + midUp);
      ok('back from the list mid-run: the card did not deal itself again', !heroHidden() && !$('hlCard').classList.contains('in'));

      // --- a refused move draws no cards: nothing happened, so nothing moves ---
      // The host answers a move it will not allow with the run exactly as it stands plus an error.
      // Replaying the pacing on that would drop the same card onto the felt a second time
      h.intercept = (m) => {
        if (m.op !== 'higher') return false;
        h.intercept = null;
        later(1, () => toWebview({ type: 'hl', n: m.n, state: backState, error: 'nothing beats this card', balance: ledgerBalance(), free: ledgerBalance() }));
        return true;
      };
      doc.pressKey('ArrowUp'); advance(3);
      ok('a refused move: the notice shows and the hero card is not re-dealt',
        !$('hlErr').hidden && !heroHidden() && !$('hlCard').classList.contains('in')
        && !$('hlPrev').classList.contains('drop'), $('hlErr').textContent + ' vis ' + JSON.stringify($('hlCard').style.visibility));
      advance(600);
      ok('a refused move: the pot and the prices are untouched and the buttons come back',
        line() === midLine && $('hlUp').textContent === midUp && !doc.querySelector('#hlPlay [data-op="cashout"]').disabled, line() + ' up ' + $('hlUp').textContent);
      doc.pressKey('c'); settle();

      // --- the other game's stake is not this one's to bet ---
      // Blackjack holds nearly the whole purse open, so High-Low has to count what is left, not the
      // header number. Crossing straight from a mid-deal table into High-Low must also let the
      // header move again: the table's hold on it goes when the table is left
      useSeed((st) => st.phase === 'player' && bj.act(st, 'stand').net >= 0, 'hl-cross-');
      openList(); gameRow().click(); advance(5);
      const purse = ledgerBalance();
      // the chips only offer 10/100/1000; the host takes any whole bet, and this one leaves 9 credits
      $('bjDeal').setAttribute('data-bet', String(purse - 9));
      $('bjDeal').click(); advance(2);
      const paced = () => h.pending(50); // pacing and settle timers still to fire
      const pacedBj = paced(); // the deal is still being paced
      openList(); h.rowFor('hilo').click(); advance(20);
      ok('blackjack holding the purse: every High-Low chip is off and the note says who has them',
        chips() === '10-off 100-off 1000-off' && !$('hlNote').hidden && $('hlDeal').disabled,
        chips() + ' note ' + JSON.stringify($('hlNote').textContent) + ' purse ' + purse);
      ok('crossing from a mid-deal table into High-Low drops the table\u2019s pacing',
        (R || pacedBj > 0) && paced() === 0, pacedBj + ' -> ' + paced());
      toWebview({ type: 'data', data: { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: purse, today: 111, frac: 0.5, perCredit: 10000, counting: false } } });
      advance(5);
      ok('crossing from a mid-deal table into High-Low releases the header hold',
        /\+111 today/.test($('hdCredits').title) && (R || pacedBj > 0), JSON.stringify($('hdCredits').title) + ' paced ' + pacedBj);
      openList(); gameRow().click(); advance(5);
      ok('and the blackjack hand is still live after the detour', !$('bjPlay').hidden, sentOps.slice(-2).join());
      standOut(4); advance(4000);
      openList(); h.rowFor('hilo').click(); advance(20);
      ok('with the table settled the chips come back', chips().indexOf('10-on') === 0 && $('hlNote').hidden && !$('hlDeal').disabled, chips());

      // --- walking out mid-run must not freeze the header ---
      hlSeed(() => true, 'hl-leave-');
      doc.pressKey('Enter'); settle(); doc.pressKey('ArrowUp'); advance(2);
      $('hdCredits').click(); advance(5);
      toWebview({ type: 'data', data: { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: 4321, today: 777, frac: 0.5, perCredit: 10000, counting: false } } });
      advance(5);
      ok('leaving mid-run releases the header hold', /\+777 today/.test($('hdCredits').title) && hdrBal() === '4,321', JSON.stringify($('hdCredits').title) + ' ' + hdrBal());

      // --- every rank, at the minimum bet: the button may only print a price the table can pay ---
      // Thirteen stacked shoes, each handed over the way the host hands a reply over, so the whole
      // board is walked without thirteen seed searches. Last in this mode: it leaves a state on
      // screen that the host never dealt
      const RANKS_UP = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const cardsLib = require(path.join(EXT, 'cards.js'));
      const stackOf = (head) => {
        const all = [];
        for (let d = 0; d < cardsLib.DECKS; d++) for (const s of cardsLib.SUITS) for (const r of cardsLib.RANKS) all.push(r + s);
        for (const c of head) all.splice(all.indexOf(c), 1);
        return head.concat(all);
      };
      const bad = [];
      for (const r of RANKS_UP) {
        const st = highlow.newRun({ seed: 'sweep', bet: BET, stack: stackOf([r + 'S']) });
        const v = highlow.view(st, 1e9);
        toWebview({ type: 'hl', state: v }); // no n: a reply nobody is waiting for, so it is drawn as it stands
        advance(5);
        for (const side of ['higher', 'lower']) {
          const txt = $(side === 'higher' ? 'hlUp' : 'hlDn').textContent;
          const want = v.pays[side] == null ? '—' : xOf(v.pays[side], v.pot);
          if (txt !== want) bad.push(r + ' ' + side + ': shows ' + txt + ', should show ' + want + ' (pays ' + v.pays[side] + ' on ' + v.pot + ')');
          // and the number on the button, taken at face value, never asks for more than it pays
          const promised = Math.floor(v.pot * parseFloat(txt.slice(1)));
          if (v.pays[side] != null && promised > v.pays[side]) bad.push(r + ' ' + side + ': ' + txt + ' promises ' + promised + ', pays ' + v.pays[side]);
        }
      }
      ok('every rank at the minimum bet: the price on the button is the pot that really lands', bad.length === 0, bad.slice(0, 4).join(' | '));
    }
  }
};
