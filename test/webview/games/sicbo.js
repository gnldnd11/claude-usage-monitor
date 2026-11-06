// Sic Bo, end to end. The rolls are found by searching the engine for a seed, so the dice the
// screen is checked against are the dice the host will really deal.
//
// The claim this file exists for: THE DEAL CHANGES THE FELT. Three unrolled dice stand on the bet
// screen and the roll puts pips on them, which is the one thing the four games that left the floor
// on 2026-11-06 could not do. The second claim is the cream ring: the square the roll LANDED in is
// marked, whether or not it is the square the bet was on, because that ring is this screen's answer
// to "why did Small lose" and there is no sentence anywhere that says it.
'use strict';

module.exports = {
  id: 'sicbo',
  modes: ['sicbo', 'sicbo-reduce', 'sicbo-poor'],
  start: { 'sicbo-poor': 60 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openGame, bodyTabs, ledgerBalance, hdrBal,
      active, activeName, mouseClick, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'sicbo.js'));
    const R = MODE === 'sicbo-reduce';
    const BET = engine.MIN_BET;             // 100: this table's floor
    const sent = h.sent('sb');
    // the dice land 140 apart and the ring and the chip follow the last of them
    // (games/sicbo/panel.js, SB_T)
    const DICE = [180, 320, 460], HIT = 520, CHIP = 580;

    const die = (i) => $('sbD' + i);
    // which drawing the cell is pointing at, out of the sprite html.js put in the page. `#dc-0` is
    // the unrolled die, `#dc-3` is a three (webview.js, CUC.die)
    const faceOf = (i) => {
      const u = doc.querySelector('#sbD' + i + ' use');
      const href = u ? String(u.getAttribute('href')) : '';
      return /^#dc-\d$/.test(href) ? Number(href.slice(4)) : -1;
    };
    const faces = () => [0, 1, 2].map(faceOf).join(',');
    const cell = (kind, total) => doc.querySelector('#sbBoard .sb-cell[data-kind="' + kind + '"]'
      + (total == null ? ':not([data-total])' : '[data-total="' + total + '"]'));
    const cells = () => doc.querySelectorAll('#sbBoard .sb-cell');
    const lit = () => [...cells()].filter((c) => c.classList.contains('on')).map((c) => c.textContent).join('|');
    const ringed = () => [...cells()].filter((c) => c.classList.contains('hit')).map((c) => c.textContent).join('|');
    const read = () => $('sbRead').textContent;
    const line = () => $('sbLine').textContent;
    const chip = () => { const c = doc.querySelector('#sbLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const said = () => $('sbLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const xOf = (m100) => m100 >= 1000 ? '×' + Math.floor(m100 / 100) : '×' + Math.floor(m100 / 100) + '.' + ('0' + (m100 % 100)).slice(-2);

    // A seed whose three dice satisfy `want`, pinned as the next roll the host deals
    function sbSeed(want, tag, kind, total) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = engine.newRound({ seed, id: 't', bet: BET, kind, total });
        if (want(st)) { ext._test.setSeeds('sb', () => seed); return st; }
      }
      throw new Error('no sicbo seed for ' + tag);
    }

    openGame('sicbo');
    ok('the Sic Bo row opens the table and asks the host for its state',
      doc.body.classList.contains('game-sb') && $('panel-sicbo').style.display === ''
      && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());

    // THE SPRITE IS IN THE PAGE. CUC.die() emits a <use> and nothing else, so the seven drawings
    // have to be published by html.js, beside the sea symbols' sheet and once. Checked here rather
    // than in three files: Hazard and Shut the Box draw off the same sheet, and a second copy of one
    // rule is where two copies start to differ. h.rawHtml is the page before any script ran
    ok('the seven die drawings are published once, into the first paint',
      (h.rawHtml.match(/class="dc-sprite"/g) || []).length === 1
      && [0, 1, 2, 3, 4, 5, 6].every((n) => h.rawHtml.indexOf('id="dc-' + n + '"') >= 0),
      (h.rawHtml.match(/id="dc-\d"/g) || []).join());

    // --- THE BET SCREEN IS NOT AN EMPTY FELT ---------------------------------------------------
    ok('three dice stand on the bet screen, and not one of them has a pip on it',
      faces() === '0,0,0' && doc.querySelectorAll('#sbDice .sb-die').length === 3
      && $('sbDice').getAttribute('aria-label') === 'No roll yet',
      faces() + ' label ' + $('sbDice').getAttribute('aria-label'));
    ok('the board is the host’s own seventeen rows: three names and fourteen totals',
      cells().length === engine.PAYS.length
      && doc.querySelectorAll('#sbKinds .sb-cell').length === 3
      && doc.querySelectorAll('#sbTotals .sb-cell').length === engine.MAX_TOTAL - engine.MIN_TOTAL + 1
      && doc.querySelectorAll('#sbTotals .sb-cell')[0].textContent === String(engine.MIN_TOTAL),
      cells().length + ' cells');
    ok('EVERY square is filled rather than outlined: each one carries its own number or name',
      [...cells()].every((c) => c.textContent !== '' && c.localName === 'button'),
      [...cells()].map((c) => c.textContent).join('|'));
    ok('one square is lit from the first paint, so the first press is on the felt',
      lit() === 'Small' && ringed() === '', 'lit ' + lit() + ' ringed ' + ringed());

    if (MODE === 'sicbo-poor') {
      ok('this table starts at 100: the 10 chip is shut and says so',
        doc.querySelector('#sbStakes button[data-v="10"]').disabled
        && doc.querySelector('#sbStakes button[data-v="10"]').title === 'This table starts at 100',
        doc.querySelector('#sbStakes button[data-v="10"]').title);
      ok('sixty credits is not enough for this table: Roll is off and the note asks for 100',
        $('sbDeal').disabled && !$('sbNote').hidden && $('sbNote').textContent === 'You need 100 credits to play.',
        $('sbNote').textContent);
      return;
    }

    ok('the chips open on 100, Roll is ready and focused',
      doc.querySelector('#sbLine .hl-pot.preview b').textContent === '100'
      && doc.querySelector('#sbStakes button[data-v="100"]').classList.contains('on')
      && !$('sbDeal').disabled && active() === $('sbDeal'),
      line() + ' focus ' + activeName());
    // name plus multiple is 88px at 10.5px; adding the row's note takes it to 169 and the line folds
    // at the felt's 152, so the note is behind the ? with the chance and the seventeen rows
    ok('the read-out line is the CHOSEN row only: its name and its multiple, and nothing else',
      read() === engine.FLAT.small.name + xOf(engine.FLAT.small.mult100)
      && read().indexOf(engine.FLAT.small.note) < 0
      && read().indexOf(String(engine.FACES)) < 0, JSON.stringify(read()));

    // --- picking a square -----------------------------------------------------------------------
    mouseClick(cell('total', 10)); advance(5);
    ok('pressing a square lights it, un-lights the last one and moves the read-out with it',
      lit() === '10' && read() === engine.BY_TOTAL[10].name + xOf(engine.BY_TOTAL[10].mult100)
      && cell('total', 10).getAttribute('aria-pressed') === 'true',
      'lit ' + lit() + ' read ' + JSON.stringify(read()));
    mouseClick(cell('small')); advance(5);
    ok('and back again, with one square lit at a time', lit() === 'Small', lit());

    // --- the folded paytable --------------------------------------------------------------------
    $('sbWhy').click(); advance(2);
    ok('the paytable is behind the ? toggle: seventeen rows with the host’s own counts',
      !$('sbPays').hidden && doc.querySelectorAll('#sbPays .sb-pay').length === engine.PAYS.length + 2
      && doc.querySelectorAll('#sbPays .sb-pay')[1].textContent
        === engine.FLAT.small.name + xOf(engine.FLAT.small.mult100) + money(engine.FLAT.small.ways),
      doc.querySelectorAll('#sbPays .sb-pay')[1].textContent);
    ok('and the lit row’s note is in there, on a line of its own',
      doc.querySelector('#sbPays .sb-pay.note').textContent === engine.FLAT.small.note,
      doc.querySelector('#sbPays .sb-pay.note').textContent);
    $('sbWhy').click(); advance(2);

    // --- the roll: a TRIPLE, so a bet on Small loses and the ring says why ----------------------
    const trip = sbSeed((st) => st.triple != null, 'sb-trip-', 'small');
    ok('the pinned roll is a triple, which is the one roll Small loses to', trip.triple != null && !trip.win,
      JSON.stringify(trip.dice) + ' win ' + trip.win);
    doc.pressKey('Enter'); advance(2);
    ok('the deal carried the lit square to the host',
      sent.filter((m) => m.op === 'deal').pop().kind === 'small', JSON.stringify(sent.filter((m) => m.op === 'deal').pop()));

    const at = {};
    for (let t = 0; t <= CHIP + 200; t++) {
      const f = faces();
      if (at.f0 == null && faceOf(0) > 0) at.f0 = t;
      if (at.f1 == null && faceOf(1) > 0) at.f1 = t;
      if (at.f2 == null && faceOf(2) > 0) at.f2 = t;
      if (at.ring == null && ringed() !== '') at.ring = t;
      if (at.chip == null && doc.querySelector('#sbLine .bj-chip')) { at.chip = t; at.bal = hdrBal(); }
      if (at.blank == null && f === '0,0,0' && t > 0) at.blank = t;
      advance(1);
    }
    ok('the dice land one at a time, on the screen’s own timetable',
      R ? (at.f0 <= 2 && at.f2 <= 2) : (at.f0 === DICE[0] && at.f1 === DICE[1] && at.f2 === DICE[2]),
      JSON.stringify(at));
    ok('the ring follows the last die and the figure follows the ring',
      R ? (at.ring <= 2 && at.chip <= 2) : (at.ring === HIT && at.chip === CHIP),
      'ring ' + at.ring + ' chip ' + at.chip);
    ok('THE DEAL CHANGED THE FELT: the three dice now carry the host’s own pips',
      faces() === trip.dice.join(',') && $('sbDice').getAttribute('aria-label') === 'Rolled ' + trip.dice.join(', '),
      faces() + ' want ' + trip.dice.join(','));
    // Which squares the roll landed in: the Triple square when all three were alike, and the square
    // of its total when a square carries that total. A triple of fours is both, and the spec asks
    // for both (docs/game-panels.md, 5-13: 둘 다면 둘 다)
    const wantRing = [trip.triple != null ? 'Triple' : null,
      (trip.sum >= engine.MIN_TOTAL && trip.sum <= engine.MAX_TOTAL) ? String(trip.sum) : null]
      .filter(Boolean).join('|');
    ok('the squares the roll LANDED in are ringed, and the square the bet was on is not among them',
      ringed() === wantRing && lit() === 'Small' && ringed().indexOf('Small') < 0,
      'ringed ' + ringed() + ' want ' + wantRing + ' lit ' + lit());
    ok('the line is the loss and nothing is claimed to have been paid',
      chip().indexOf('lose') >= 0 && chip().indexOf('No ') >= 0 && line().indexOf(money(BET)) >= 0,
      line() + ' | ' + chip());
    const wantSaid = 'Rolled ' + trip.dice.join(', ') + '. Total ' + trip.sum + '. Three ' + trip.triple
      + 's. ' + engine.FLAT.small.name + ' loses. −' + money(BET) + '. Balance ' + at.bal + '.';
    ok('the roll is read out with its dice, its total and its net', said() === wantSaid,
      JSON.stringify(said()) + ' want ' + JSON.stringify(wantSaid));

    // --- a win on a total: the ring is the square that was bet on, and it is ALSO lit ------------
    mouseClick(cell('total', 10)); advance(5);
    const won = sbSeed((st) => st.win && st.triple == null, 'sb-win10-', 'total', 10);
    doc.pressKey('Enter'); advance(CHIP + 200);
    ok('a win on a total: that square is both lit and ringed, and the chip is what was paid',
      lit() === '10' && ringed() === '10' && chip().indexOf('win') >= 0
      && chip().indexOf(xOf(won.mult100)) >= 0 && line().indexOf(money(won.payout)) >= 0,
      'lit ' + lit() + ' ringed ' + ringed() + ' ' + chip());
    ok('the multiple on the chip is the host’s own, read out of the payout it really paid',
      won.mult100 === engine.BY_TOTAL[10].mult100 && won.payout === Math.floor(BET * won.mult100 / 100),
      won.mult100 + ' ' + won.payout);

    // --- a bet this game does not take is refused before anything is staked ---------------------
    const purse = ledgerBalance();
    h.hostSend({ type: 'sb', op: 'deal', bet: BET, kind: 'total', total: 18, n: 971 });
    advance(10);
    ok('a total off the dial is refused in the engine’s own words, and nothing is staked for it',
      !$('sbErr').hidden && /a total runs from 4 to 17/.test($('sbErr').textContent) && ledgerBalance() === purse,
      $('sbErr').textContent + ' purse ' + purse + ' -> ' + ledgerBalance());
    ok('and the dice did not move', faces() === won.dice.join(','), faces());

    // --- a broadcast is drawn where it stands ---------------------------------------------------
    const cast = engine.newRound({ seed: 'sb-cast', id: 'c', bet: BET, kind: 'big' });
    toWebview({ type: 'sb', state: engine.view(cast, 1e9), balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once: the dice on their faces, nothing paced',
      faces() === cast.dice.join(',') && h.pending(50) === 0,
      faces() + ' want ' + cast.dice.join(',') + ' pending ' + h.pending(50));
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
