// The scratch card, end to end. The cards are found by searching the engine for a seed, so what the
// screen is checked against is the card the host will really deal.
//
// The claim this file exists for is the negative one: WHILE A CARD IS LIVE THE SCREEN HOLDS NO
// SYMBOL THE PLAYER HAS NOT TURNED OVER AND SHOWS NO FIGURE. It is checked on every square of a
// whole card rather than once, because a leak would be one `cells[i]` read in one branch.
'use strict';

module.exports = {
  id: 'scratch',
  modes: ['scratch', 'scratch-reduce', 'scratch-poor'],
  start: { 'scratch-poor': 5 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openList, openGame, bodyTabs, ledgerBalance, hdrBal,
      active, activeName, mouseClick, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'scratch.js'));
    const R = MODE === 'scratch-reduce';
    const BET = 10;
    const sent = h.sent('sc');

    function scSeed(want, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = engine.newRound({ seed, id: 't', bet: BET });
        if (want(st, engine.winOf(st.cells))) { ext._test.setSeeds('sc', () => seed); return st; }
      }
      throw new Error('no scratch seed for ' + tag);
    }
    const cell = (i) => $('scC' + i);
    const symOf = (i) => { const u = cell(i).querySelector('use'); return u ? u.getAttribute('href').replace('#sy-', '') : null; };
    const shown = () => [...Array(9).keys()].filter((i) => cell(i).classList.contains('on'));
    // the squares the host says made the prize, ringed in ember. Read off the SCREEN, so what is
    // compared below is what a player can see and not what the panel was handed
    const ringed = () => [...Array(9).keys()].filter((i) => cell(i).classList.contains('hit'));
    const drawn = () => [...Array(9).keys()].filter((i) => symOf(i) !== null);
    const line = () => $('scLine').textContent;
    const chip = () => { const c = doc.querySelector('#scLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const tally = () => doc.querySelectorAll('#scTally .bj-chip').map((c) => c.textContent).join(' | ');
    const side = () => $('scSide').textContent;
    const said = () => $('scLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const settle = () => advance(1200);
    const plural = (sym) => ({ starfish: 'starfish', jellyfish: 'jellyfish', kelp: 'kelp', coral: 'coral' }[sym] || sym + 's');
    const COUNT = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

    openGame('scratch');
    ok('the Scratch Card row opens the card and asks the host for its state',
      doc.body.classList.contains('game-sc') && $('panel-scratch').style.display === '' && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('nine covered squares, every one of them a button, and not one symbol among them',
      doc.querySelectorAll('#scGrid .sc-cell').length === 9 && shown().length === 0 && drawn().length === 0
      && [...Array(9).keys()].every((i) => cell(i).getAttribute('aria-label') === 'Square ' + (i + 1) + ', covered'),
      shown().length + ' off, ' + drawn().length + ' drawn');

    if (MODE === 'scratch-poor') {
      ok('not enough credits: chips off, Deal off, and the note says why',
        doc.querySelectorAll('#scStakes button').every((b) => b.disabled) && $('scDeal').disabled
        && !$('scNote').hidden && $('scNote').textContent === 'You need 10 credits to play.', $('scNote').textContent);
      return;
    }

    ok('betting: a dim pot preview of the stake, Deal ready and focused, no squares to press',
      doc.querySelector('#scLine .hl-pot.preview b').textContent === '10' && !$('scDeal').disabled
      && active() === $('scDeal') && [...Array(9).keys()].every((i) => cell(i).disabled),
      line() + ' focus ' + activeName());

    // --- the paytable is ten symbols in five rows, folded away ---
    $('scWhy').click(); advance(2);
    const groups = new Set(engine.PAYS.map((r) => r.mult.join('/')));
    ok('the paytable is behind the ? toggle and groups the ten symbols into their rows',
      !$('scPays').hidden && doc.querySelectorAll('#scPays .sc-grp').length === groups.size
      && doc.querySelectorAll('#scPays .sc-pay').length === groups.size + 1,
      doc.querySelectorAll('#scPays .sc-grp').length + ' groups for ' + groups.size + ' rows');
    ok('the top row is the crab’s own, as the host sent it',
      doc.querySelectorAll('#scPays .sc-pay')[1].textContent === engine.PAYS[0].mult.map((m) => m.toLocaleString('en-US') + '×').join(''),
      doc.querySelectorAll('#scPays .sc-pay')[1].textContent);
    $('scWhy').click(); advance(2);

    // --- a whole card, one square at a time ---
    // The card is a prize-paying one, so the last square matters and the figure before it would be
    // worth guessing at. Every step is checked for a leak rather than only the end
    const card = scSeed((st, w) => w.mult > 1, 'sc-prize-');
    const prize = engine.winOf(card.cells);
    doc.pressKey('Enter'); settle();
    ok('a card is bought: nine squares still covered, the corner counts them, and the line is EMPTY',
      shown().length === 0 && side() === '9 left' && line() === '' && !$('scBet').hidden === false && $('scBet').hidden,
      'off ' + shown().length + ' side ' + JSON.stringify(side()) + ' line ' + JSON.stringify(line()));
    ok('and the only button is the one that takes the rest off',
      doc.querySelectorAll('#scPlay .bj-btn').length === 1 && !$('scPlay').hidden
      && doc.querySelector('#scPlay [data-op="reveal"]').textContent === 'Rub the rest',
      doc.querySelectorAll('#scPlay .bj-btn').length + ' buttons');

    const leaks = [];
    for (let k = 0; k < 8; k++) {
      mouseClick(cell(k));
      advance(2);
      // the square answers the press at once, and nothing else on the card does
      if (symOf(k) !== card.cells[k]) leaks.push('square ' + k + ' shows ' + symOf(k) + ', the host dealt ' + card.cells[k]);
      if (drawn().length !== k + 1) leaks.push('after ' + (k + 1) + ' presses the screen is holding ' + drawn().length + ' symbols');
      if (line() !== '') leaks.push('after ' + (k + 1) + ' presses the line reads ' + JSON.stringify(line()));
      advance(400);
      if (line() !== '') leaks.push('400ms after press ' + (k + 1) + ' the line reads ' + JSON.stringify(line()));
      if (side() !== (8 - k) + ' left') leaks.push('after ' + (k + 1) + ' presses the corner reads ' + JSON.stringify(side()));
      // a ring would name the winning squares before the ninth is off, which is the same leak the
      // empty line is guarding: the prize is not decided until all nine are showing
      if (ringed().length) leaks.push('after ' + (k + 1) + ' presses squares ' + ringed().join() + ' are ringed');
    }
    ok('eight squares off: every one is the host’s own symbol, nothing else is drawn, no figure anywhere',
      leaks.length === 0, leaks.slice(0, 3).join(' | '));
    ok('the tally counts only what is showing, two or more, three chips at most',
      doc.querySelectorAll('#scTally .bj-chip').length <= 3 && tallyAgrees(), tally() + ' vs host ' + JSON.stringify(hostCounts()));

    function hostCounts() {
      const c = {};
      for (const i of drawn()) c[card.cells[i]] = (c[card.cells[i]] || 0) + 1;
      return c;
    }
    function tallyAgrees() {
      const c = hostCounts();
      const want = Object.keys(c).filter((s) => c[s] >= 2).sort((a, b) => c[b] - c[a]).slice(0, 3);
      const got = doc.querySelectorAll('#scTally .bj-chip').map((e) => e.textContent);
      if (got.length !== want.length) return false;
      return got.every((t, i) => t === c[want[i]] + ' ' + plural(want[i]));
    }

    // --- the ninth square settles it, and only then is there a figure ---
    const preBal = hdrBal();
    mouseClick(cell(8));
    advance(2);   // the message's own round trip, so what is timed below is the screen's pacing
    let chipAt = null, ringAt = null;
    for (let t = 0; t <= 700; t++) {
      if (chipAt == null && doc.querySelector('#scLine .bj-chip')) chipAt = t;
      if (ringAt == null && ringed().length) ringAt = t;
      advance(1);
    }
    ok('the ninth square settles the card 180ms after it comes off, and not before',
      R ? chipAt <= 2 : chipAt === 350, 'chip at ' + chipAt + 'ms, balance was ' + preBal);
    // "it was these ones" is this screen's reward, so it arrives WITH the figure and not a beat
    // either side of it: earlier would name the prize before the card admits to having one
    ok('the ember ring lands on the same beat the prize does', ringAt === chipAt,
      'ring at ' + ringAt + 'ms, prize at ' + chipAt + 'ms');
    ok('the ringed squares are the host’s own list, and no others',
      ringed().join() === prize.cells.join(), ringed().join() + ' engine ' + prize.cells.join());
    ok('the prize is the host’s own row and its net',
      chip() === 'bj-chip win ' + COUNT[prize.count] + ' ' + plural(prize.sym) + ' +' + money(card.bet * prize.mult - card.bet),
      chip() + ' engine ' + prize.count + ' ' + prize.sym + ' x' + prize.mult);
    ok('all nine are showing, the corner is empty, and every square is finished',
      drawn().length === 9 && side() === '' && [...Array(9).keys()].every((i) => cell(i).disabled),
      drawn().length + ' drawn, side ' + JSON.stringify(side()));
    ok('the card is read out with its prize and the balance',
      said().indexOf(COUNT[prize.count] + ' ' + plural(prize.sym)) >= 0 && /Balance /.test(said()), JSON.stringify(said()));

    // --- "rub the rest off" is paced, and it is the same card either way ---
    const rest = scSeed((st, w) => w.sym === null, 'sc-none-');
    doc.pressKey('Enter'); settle();
    mouseClick(cell(0)); advance(400);
    const left = 8;
    doc.pressKey('r');
    advance(2);   // the round trip again: the pacing starts when the reply lands
    const off = [];
    let restChip = null;
    for (let t = 0; t <= 900; t++) {
      const n = drawn().length;
      if (off[off.length - 1] !== n) off.push(n);
      if (restChip == null && doc.querySelector('#scLine .bj-chip')) restChip = t;
      advance(1);
    }
    ok('the rest come off one every 55ms and the card settles 180 after the last',
      R ? restChip <= 2 : restChip === left * 55 + 180, 'chip at ' + restChip + 'ms for ' + left + ' squares');
    ok('they came off one at a time rather than all at once',
      R ? off.join() === '9' : off.join() === '1,2,3,4,5,6,7,8,9', off.join());
    ok('a card that misses says so, and says the stake is gone',
      chip() === 'bj-chip lose Nothing −' + money(BET) && drawn().length === 9, chip());
    ok('and a card that paid nothing rings nothing', ringed().length === 0, ringed().join());

    // --- a square already off is refused, and nothing on the card moves ---
    const board = scSeed(() => true, 'sc-refuse-');
    doc.pressKey('Enter'); settle();
    mouseClick(cell(3)); advance(400);
    const before = drawn().join();
    ok('a square that is off cannot be pressed again', cell(3).disabled);
    h.hostSend({ type: 'sc', op: 'scratch', cell: 3, n: 991 });
    advance(10);
    ok('and the host refusing it moves nothing: the reason shows, the squares stand',
      !$('scErr').hidden && /already scratched/.test($('scErr').textContent) && drawn().join() === before,
      $('scErr').textContent + ' drawn ' + drawn().join());
    h.hostSend({ type: 'sc', op: 'scratch', cell: 99, n: 992 });
    advance(10);
    ok('a square that is not on the card is refused in the engine’s own words',
      /names a square from 0 to 8/.test($('scErr').textContent), $('scErr').textContent);

    // --- the focus does not die on the square it just rubbed off ---
    cell(4).focus();
    cell(4).click();
    advance(400);
    ok('rubbing the focused square off hands the focus to another one',
      active() && active().classList.contains('sc-cell') && !active().disabled && active() !== cell(4),
      'focus ' + activeName() + ' disabled ' + (active() && active().disabled));

    // --- a reply with no state is a reason, not a blank card ---
    const held = drawn().join();
    h.intercept = (m) => {
      if (m.op !== 'scratch') return false;
      h.intercept = null;
      later(1, () => toWebview({ type: 'sc', n: m.n, error: 'the card could not be read', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    mouseClick(doc.querySelector('#scGrid .sc-cell:not([disabled])'));
    advance(10);
    ok('a reply with no state: the reason shows and the card is left exactly as it was',
      !$('scErr').hidden && $('scErr').textContent.indexOf('the card could not be read') >= 0 && drawn().join() === held,
      $('scErr').textContent);
    advance(5000);
    ok('a reply with no state hands the squares back and starts no four-second timeout',
      $('scErr').textContent.indexOf('didn’t respond') < 0 && !doc.querySelector('#scPlay [data-op="reveal"]').disabled,
      $('scErr').textContent);
    doc.pressKey('r'); settle();

    // --- a broadcast is drawn where it stands ---
    const cast = engine.newRound({ seed: 'sc-cast', id: 'c', bet: BET });
    const castView = engine.view(engine.act(cast, { op: 'scratch', cell: 2 }), 1e9);
    toWebview({ type: 'sc', state: castView, balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once: the one square it says is off, and no others',
      drawn().join() === '2' && symOf(2) === cast.cells[2] && line() === '',
      'drawn ' + drawn().join() + ' line ' + JSON.stringify(line()));
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
