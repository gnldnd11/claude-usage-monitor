// The minefield, end to end. The situations (a board whose first dig is safe, a board whose first
// dig is a mine, a board that can be cleared) are made by searching the engine for a seed, never by
// faking a reply: the host deals the round the search found, so the figures below are exact.
'use strict';

module.exports = {
  id: 'mines',
  modes: ['mines', 'mines-reduce', 'mines-poor'],
  // 50 credits is under this table's 100, and under it in a way the shared chips do not know about:
  // the 10 chip would otherwise be lit on a table that refuses 10
  start: { 'mines-poor': 50 },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openGame, openList, hdrBal, ledgerBalance, toWebview, ext, EXT, path } = h;
    const mines = require(path.join(EXT, 'mines.js'));
    const R = MODE === 'mines-reduce';
    const BET = 100;
    const sent = h.sent('mn');
    const money = (n) => Math.round(n).toLocaleString('en-US');
    // the same integer formatting the panel uses: the engine's hundredths, decimal point moved
    const mult = (m) => m >= 1000 ? '×' + Math.floor(m / 100) : '×' + Math.floor(m / 100) + '.' + ('0' + (m % 100)).slice(-2);
    const cell = (i) => $('mnC' + i);
    const cls = (i) => cell(i).className;
    const line = () => $('mnLine').textContent;
    const chip = () => { const c = doc.querySelector('#mnLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const said = () => $('mnLive').textContent;
    const chips = () => doc.querySelectorAll('#mnStakes button').map((b) => b.getAttribute('data-v') + (b.disabled ? '-off' : '-on')).join(' ');
    // WHY a chip is closed, which is not one question but three: this table does not take that
    // bet at all, the credits are riding on another table, or there are none. The first of the
    // three is this table's own (CUC.stakeUi's `min`, from the engine's MIN_BET) and the other
    // two are the purse's, so a run of closed chips that all said the same thing would be the
    // screen blaming the player for the table's price
    const whys = () => doc.querySelectorAll('#mnStakes button').map((b) => b.title || '-').join(' | ');
    const settle = () => advance(1200);
    // every cell that is drawn as untouched, which is what the end-of-round reveal opens
    const covered = () => { let n = 0; for (let i = 0; i < 25; i++) if (cls(i) === 'mn-c') n++; return n; };
    const open25 = () => doc.querySelectorAll('#mnBoard .mn-c').filter((c) => !c.disabled).length;
    // The lids are CSS on the cell itself (.mn-c::before), so what is read here is the screen's own
    // stylesheet and not a rendered pixel: minidom lays nothing out. What the board does with them
    // is checked below, on the classes the rules key off
    const css = require(path.join(EXT, 'games', 'mines', 'meta.js')).css;
    // The seed the host will deal, found by playing the real engine. `want` is asked of the round
    // and its view, exactly as the High-Low modes do it
    function seed(want, tag, count) {
      for (let i = 0; i < 20000; i++) {
        const s = tag + i;
        const r = mines.newRound({ seed: s, id: 't', bet: BET, mines: count });
        if (want(r, mines.view(r, 1e9))) { ext._test.setSeeds('mn', () => s); return r; }
      }
      throw new Error('no minefield seed for ' + tag);
    }

    openGame('mines');
    ok('the Minefield row opens its screen and asks the host for its state',
      doc.body.classList.contains('game-mn') && $('panel-mines').style.display === '' && sent.map((m) => m.op).join() === 'open',
      h.bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('the board is 25 cells and four hairlines each way, drawn on the felt',
      doc.querySelectorAll('#mnBoard .mn-c').length === 25 && doc.querySelectorAll('#mnBoard .gm-rule.mn-rv').length === 4
      && doc.querySelectorAll('#mnBoard .gm-rule.mn-rh').length === 4,
      doc.querySelectorAll('#mnBoard .mn-c').length + ' cells, ' + doc.querySelectorAll('#mnBoard .gm-rule').length + ' rules');
    ok('the paytable is folded away', $('mnPays').hidden && $('mnWhy').getAttribute('aria-expanded') === 'false');

    if (MODE === 'mines-poor') {
      // 50 credits: the 10 chip is affordable and still closed, because this table starts at 100
      ok('under the table minimum: every chip is off, Deal is off and the note says how much',
        chips() === '10-off 100-off 1000-off' && $('mnDeal').disabled
        && !$('mnNote').hidden && $('mnNote').textContent === 'You need 100 credits to play.',
        chips() + ' note ' + JSON.stringify($('mnNote').textContent));
      ok('with a short purse the three closed chips still give the two separate reasons',
        whys() === 'This table starts at 100 | Not enough credits | Not enough credits', whys());
      ok('and no cell can be pressed with no round in play',
        doc.querySelectorAll('#mnBoard .mn-c').every((c) => c.disabled));
      return;
    }

    ok('betting: the 10 chip is closed on a 100-credit table and 100 is the pick',
      chips() === '10-off 100-on 1000-on' && $('mnDeal').getAttribute('data-bet') === '100', chips());
    // a fresh install opens on a bet the host will take: the whole point of the floor. And the
    // one closed chip says the table's price rather than accusing the purse, which has 1,000 in it
    ok('and the closed chip gives the table’s own reason, not the purse’s',
      whys() === 'This table starts at 100 | - | -', whys());
    ok('betting: a dim pot preview of the stake and Deal ready',
      doc.querySelector('#mnLine .hl-pot.preview b').textContent === '100' && !$('mnDeal').disabled, line());
    // --- THE BET SCREEN IS A BOARD AND NOT AN EMPTY RECTANGLE -----------------------------------
    // Twenty-five lids ARE this board. With none of them drawn the felt held nothing at all, the
    // deal changed nothing on screen and there was no first move to find: 25 cells, 0 of them
    // drawing anything (docs/game-panels.md, section 2). The lid is a frame and never a filled
    // face, or the board reads as tiles laid on the table instead of a board drawn on it
    ok('betting: all 25 cells are covered, and a covered cell draws a lid',
      covered() === 25 && doc.querySelectorAll('#mnBoard .mn-c').every((c) => c.disabled)
      && /\.mn-c::before\{content:"";[^}]*box-shadow:inset 0 0 0 1px var\(--felt-dim\);opacity:\.7;\}/.test(css)
      && /\.mn-c::before\{(?![^}]*background)[^}]*\}/.test(css)
      && /\.mn-c:disabled::before\{opacity:\.34;\}/.test(css)
      && /\.mn-c\.safe::before[^{]*\{opacity:0;\}/.test(css)
      && /\.mn-c:hover:not\(:disabled\)::before\{[^}]*#e8895a/.test(css),
      covered() + ' covered, ' + open25() + ' open');
    // the two rules tie on specificity, so a dug cell keeps the lid of whichever is written last
    ok('a cell that has been turned over has no lid, which is the rule written after the bet screen’s',
      css.indexOf('.mn-c:disabled::before') < css.indexOf('.mn-c.safe::before'),
      'disabled at ' + css.indexOf('.mn-c:disabled::before') + ', turned over at ' + css.indexOf('.mn-c.safe::before'));
    ok('betting: the mine counts are the engine’s, with one picked',
      doc.querySelectorAll('#mnMines button').map((b) => b.getAttribute('data-m')).join() === mines.MINE_COUNTS.join()
      && doc.querySelectorAll('#mnMines button.on').length === 1,
      doc.querySelectorAll('#mnMines button').map((b) => b.getAttribute('data-m') + (b.classList.contains('on') ? '*' : '')).join());

    // --- a safe dig, then a cash-out -------------------------------------------------------------
    // cell 0 safe and cell 1 safe too, so the dig below lands and the ladder has a next rung
    let round = seed((r) => !r.layout[0], 'mn-safe-', 5);
    const afterDig = mines.act(round, { op: 'dig', cell: 0 });
    const vDig = mines.view(afterDig, 1e9);
    const cashed = mines.act(afterDig, 'cashout');
    doc.pressKey('Enter'); settle();
    ok('the deal sends the bet and the mine count the screen had picked',
      sent[sent.length - 1].op === 'deal' && sent[sent.length - 1].bet === BET && sent[sent.length - 1].mines === 5,
      JSON.stringify(sent[sent.length - 1]));
    ok('the deal: an empty board, every cell open, the bet riding on the line',
      covered() === 25 && open25() === 25 && line().indexOf('100') >= 0,
      covered() + ' covered, line ' + line());
    // AND THE DEAL CHANGED THE FELT. The same 25 lids, every one of them now on a cell that can be
    // pressed: the :disabled band is what the two screens differ by, so the board goes from .34 to
    // .7 on all 25 at once. A bet screen and a live board that drew alike was the whole complaint
    ok('the deal: the board became the player’s, which is 25 lids changing band at once',
      doc.querySelectorAll('#mnBoard .mn-c').every((c) => !c.disabled) && covered() === 25,
      open25() + ' of 25 pressable');
    ok('the deal: the cash-out row is up with one button and it is closed before the first dig',
      !$('mnPlay').hidden && $('mnBet').hidden && doc.querySelectorAll('#mnPlay .bj-btn').length === 1 && $('mnCash').disabled,
      doc.querySelectorAll('#mnPlay .bj-btn').length + ' buttons');

    // the cell turns over first and the numbers follow it, at MN_T.safe
    const lineBefore = line();
    cell(0).click(); advance(2);
    const seen = { mark: null, num: null };
    for (let t = 0; t <= 400; t++) {
      if (seen.mark == null && cls(0).indexOf('safe') >= 0) seen.mark = t;
      if (seen.num == null && line() !== lineBefore) seen.num = t;
      advance(1);
    }
    ok('a dig sends the cell it was',
      sent[sent.length - 1].op === 'dig' && sent[sent.length - 1].cell === 0, JSON.stringify(sent[sent.length - 1]));
    ok('a safe dig: the gem lands at once and the numbers wait for it',
      seen.mark <= 2 && (R ? seen.num <= 1 : seen.num === 240), 'gem at ' + seen.mark + 'ms, numbers at ' + seen.num + 'ms');
    ok('a safe dig: the cash-out figure and the next rung are the engine’s',
      line().indexOf(money(vDig.cash)) >= 0 && line().indexOf(mult(vDig.next.mult100)) >= 0
      && line().indexOf(vDig.next.chance.num + '/' + vDig.next.chance.den) >= 0,
      line() + ' engine cash ' + vDig.cash + ' next ' + vDig.next.mult100 + ' ' + JSON.stringify(vDig.next.chance));
    ok('a safe dig: nothing else on the board was turned over', covered() === 24, covered() + ' covered');
    ok('a safe dig is read out, and the cell carries its own name',
      said() === 'Row 1 column 1 is clear. Cash out ' + money(vDig.cash) + '. Next ' + mult(vDig.next.mult100) + '.'
      && cell(0).getAttribute('aria-label') === 'row 1 column 1, a gem',
      JSON.stringify(said()) + ' label ' + JSON.stringify(cell(0).getAttribute('aria-label')));
    ok('a dug cell cannot be dug again', cell(0).disabled);
    ok('the right slot counts what is left', $('mnSide').textContent === vDig.left + ' left', $('mnSide').textContent);

    doc.pressKey('c'); settle();
    ok('cash out: a win chip carrying the engine’s net',
      chip() === 'bj-chip win Cashed out +' + money(cashed.net), chip() + ' engine net ' + cashed.net);
    ok('cash out: the whole board is open, so the player can see where they were',
      covered() === 0 && doc.querySelectorAll('#mnBoard .mn-c.mine').length === 5,
      covered() + ' covered, ' + doc.querySelectorAll('#mnBoard .mn-c.mine').length + ' mines shown');
    ok('cash out: back to the bet controls', !$('mnBet').hidden && $('mnPlay').hidden && !$('mnDeal').disabled);

    // --- a mine ----------------------------------------------------------------------------------
    round = seed((r) => r.layout[12], 'mn-boom-', 5);
    const boomed = mines.act(round, { op: 'dig', cell: 12 });
    doc.pressKey('Enter'); settle();
    const t0 = h.now;
    cell(12).click(); advance(2);
    const marks = { boom: null, open: null };
    for (let t = 0; t <= 900; t++) {
      if (marks.boom == null && cls(12).indexOf('boom') >= 0) marks.boom = t;
      if (marks.open == null && covered() === 0) marks.open = t;
      advance(1);
    }
    ok('a mine: the cell that ended it turns over first and the rest of the board follows',
      marks.boom <= 2 && (R ? marks.open <= 1 : (marks.open >= 500 && marks.open <= 620)),
      'boom at ' + marks.boom + 'ms, board open at ' + marks.open + 'ms (started ' + t0 + ')');
    ok('a mine: exactly one cell is the one that went off',
      doc.querySelectorAll('#mnBoard .mn-c.boom').length === 1 && doc.querySelectorAll('#mnBoard .mn-c.mine').length === 4,
      doc.querySelectorAll('#mnBoard .mn-c.boom').length + ' boom, ' + doc.querySelectorAll('#mnBoard .mn-c.mine').length + ' mines');
    ok('a mine: a lose chip carrying the engine’s net, which is the bet and never the ladder',
      chip() === 'bj-chip lose Boom −' + money(BET) && boomed.net === -BET, chip() + ' engine net ' + boomed.net);
    settle();   // the header counts down to the settled balance, and that is the figure read out
    ok('a mine is read out with the balance',
      said() === 'Boom −' + money(BET) + '. Balance ' + hdrBal() + '.',
      JSON.stringify(said()) + ' header ' + hdrBal());

    // --- the paytable toggle ---------------------------------------------------------------------
    $('mnWhy').click(); advance(2);
    ok('the toggle opens the ladder, one row a rung, and nothing of it was on the felt before',
      !$('mnPays').hidden && $('mnWhy').getAttribute('aria-expanded') === 'true'
      && doc.querySelectorAll('#mnPays .mn-pr').length === 21,
      doc.querySelectorAll('#mnPays .mn-pr').length + ' rows');
    $('mnWhy').click(); advance(2);

    // --- a refused move draws nothing: nothing happened, so nothing moves ------------------------
    round = seed((r) => !r.layout[0] && !r.layout[1], 'mn-refuse-', 5);
    const held = mines.view(mines.act(round, { op: 'dig', cell: 0 }), 1e9);
    doc.pressKey('Enter'); settle();
    cell(0).click(); settle();
    const snapshot = { line: line(), board: Array.from({ length: 25 }, (_, i) => cls(i)).join('|'), left: $('mnSide').textContent };
    h.intercept = (m) => {
      if (m.op !== 'dig') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'mn', n: m.n, state: held, error: 'that cell is already dug', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    cell(1).click(); advance(5);
    ok('a refused dig: the reason shows and no cell turned over',
      !$('mnErr').hidden && Array.from({ length: 25 }, (_, i) => cls(i)).join('|') === snapshot.board
      && doc.querySelectorAll('#mnBoard .mn-c.flip').length === 0,
      JSON.stringify($('mnErr').textContent) + ' sent ' + JSON.stringify(sent[sent.length - 1]));
    advance(1200);
    ok('a refused dig: the figures are untouched and the board comes back',
      line() === snapshot.line && $('mnSide').textContent === snapshot.left && !$('mnCash').disabled,
      line() + ' vs ' + snapshot.line);

    // --- a reply with no state keeps what is drawn (games/README.md, section 5) ------------------
    h.intercept = (m) => {
      if (m.op !== 'dig') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'mn', n: m.n, error: 'the table could not deal', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    cell(1).click(); advance(5);
    ok('a reply with no state: the reason shows and the gems stay on the felt',
      !$('mnErr').hidden && Array.from({ length: 25 }, (_, i) => cls(i)).join('|') === snapshot.board && line() === snapshot.line,
      $('mnErr').textContent + ' | ' + line());
    advance(5000);
    ok('a reply with no state releases the wait: no "didn’t respond" five seconds later',
      $('mnErr').textContent.indexOf('respond') < 0 && !$('mnCash').disabled, $('mnErr').textContent);
    doc.pressKey('c'); settle();

    // --- a round survives walking out of it and back in -----------------------------------------
    round = seed((r) => !r.layout[0], 'mn-back-', 3);
    // the mine count travels on the deal, so the chip is pressed before Enter
    doc.querySelectorAll('#mnMines button').find((b) => b.getAttribute('data-m') === '3').click(); advance(2);
    doc.pressKey('Enter'); settle();
    ok('the mine count the screen picked is the one the host dealt',
      sent[sent.length - 1].mines === 3, JSON.stringify(sent[sent.length - 1]));
    cell(0).click(); settle();
    const mid = { line: line(), board: Array.from({ length: 25 }, (_, i) => cls(i)).join('|') };
    openList(); advance(5); openGame('mines');
    ok('back from the list mid-round: the same board and the same figures, the cash-out live',
      Array.from({ length: 25 }, (_, i) => cls(i)).join('|') === mid.board && line() === mid.line
      && !$('mnPlay').hidden && $('mnBet').hidden && !$('mnCash').disabled,
      line() + ' vs ' + mid.line + ' | play ' + !$('mnPlay').hidden + ' bet ' + $('mnBet').hidden
      + ' cash ' + !$('mnCash').disabled + ' board ' + (Array.from({ length: 25 }, (_, i) => cls(i)).join('|') === mid.board));
    ok('back from the list mid-round: no cell dealt itself again',
      doc.querySelectorAll('#mnBoard .mn-c.flip, #mnBoard .mn-c.blast').length === 0);
    doc.pressKey('c'); settle();

    // --- this game's keys belong to this game only ----------------------------------------------
    const before = sent.length;
    openList(); doc.pressKey('c'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: the Minefield keys do nothing on the list', sent.length === before, sent.slice(before).map((m) => m.op).join());

    // --- a late reply is drawn as it stands, with no pacing --------------------------------------
    openGame('mines');
    const sweep = mines.newRound({ seed: 'mn-sweep', id: 'x', bet: BET, mines: 10, stack: [20, 21, 22, 23, 24, 15, 16, 17, 18, 19] });
    const walked = mines.act(mines.act(sweep, { op: 'dig', cell: 0 }), { op: 'dig', cell: 1 });
    toWebview({ type: 'mn', state: mines.view(walked, 1e9) }); // no n: a reply nobody is waiting for
    advance(5);
    ok('a reply nobody asked for is drawn as it stands, with no animation',
      cls(0).indexOf('safe') >= 0 && cls(1).indexOf('safe') >= 0
      && doc.querySelectorAll('#mnBoard .mn-c.flip, #mnBoard .mn-c.blast').length === 0 && covered() === 23,
      cls(0) + ' / ' + cls(1) + ' / ' + covered() + ' covered');
  }
};
