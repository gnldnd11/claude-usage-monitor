// Keno, end to end. The draws (a ticket that catches several, a ticket that catches none) are made
// by searching the engine for a seed, never by faking a reply: the host deals the round the search
// found, so the figures below are exact.
'use strict';

module.exports = {
  id: 'keno',
  modes: ['keno', 'keno-reduce', 'keno-poor'],
  start: { 'keno-poor': 5 },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openGame, openList, hdrBal, ledgerBalance, toWebview, ext, EXT, path } = h;
    const keno = require(path.join(EXT, 'keno.js'));
    const R = MODE === 'keno-reduce';
    const BET = 10;
    const sent = h.sent('kn');
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const num = (n) => $('knN' + n);
    const line = () => $('knLine').textContent;
    const chips = () => doc.querySelectorAll('#knLine .bj-chip').map((c) => c.className + '=' + c.textContent).join(' ');
    const said = () => $('knLive').textContent;
    const marked = () => doc.querySelectorAll('#knBoard .kn-n.on, #knBoard .kn-n.hit').map((b) => Number(b.getAttribute('data-n')));
    const rings = () => doc.querySelectorAll('#knBoard .kn-n.miss').map((b) => Number(b.getAttribute('data-n')));
    // the draw: ten balls 90ms apart, the ticket settling 140 after the last of them, the money 120
    // after that. A settle shorter than the round would measure the next situation against this one
    const BALL = 90, MARK = 1040, CHIP = 1160;
    const settle = () => advance(CHIP + 440);
    const hint = () => $('knHint').textContent;
    const catches = () => doc.querySelectorAll('#knBoard .kn-n.hit').length;
    const mark = (list) => { for (const n of list) { num(n).click(); advance(1); } };
    // The seed the host will draw, found by playing the real engine
    function seed(want, tag, picks) {
      for (let i = 0; i < 20000; i++) {
        const s = tag + i;
        const r = keno.newRound({ seed: s, id: 't', bet: BET });
        const after = keno.act(r, { op: 'draw', picks: picks });
        if (want(after, keno.view(after, 1e9))) { ext._test.setSeeds('kn', () => s); return after; }
      }
      throw new Error('no keno seed for ' + tag);
    }

    openGame('keno');
    ok('the Keno row opens its screen and asks the host for its state',
      doc.body.classList.contains('game-kn') && $('panel-keno').style.display === '' && sent.map((m) => m.op).join() === 'open',
      h.bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('the board is 40 numbers with seven hairlines across and four down',
      doc.querySelectorAll('#knBoard .kn-n').length === 40
      && doc.querySelectorAll('#knBoard .gm-rule.kn-rv').length === 7
      && doc.querySelectorAll('#knBoard .gm-rule.kn-rh').length === 4,
      doc.querySelectorAll('#knBoard .kn-n').length + ' numbers, ' + doc.querySelectorAll('#knBoard .gm-rule').length + ' rules');
    ok('the paytable is folded away', $('knPays').hidden && $('knWhy').getAttribute('aria-expanded') === 'false');

    if (MODE === 'keno-poor') {
      ok('not enough credits: chips off, Deal off, note shown',
        doc.querySelectorAll('#knStakes button').every((b) => b.disabled) && $('knDeal').disabled
        && !$('knNote').hidden && $('knNote').textContent === 'You need 10 credits to play.',
        $('knNote').textContent);
      return;
    }

    // --- how many to mark, BESIDE the board rather than 71px under it ---------------------------
    // The one sentence this screen is allowed, because a count is not a shape and no number on the
    // board can say "two to ten of us" (docs/game-panels.md, section 2). It sits in .kn-acts, one
    // line under the board and on the same line as Quick pick, so the eye on the board meets it
    ok('an empty ticket: what to mark is on the felt under the board, and the paytable box is empty',
      hint() === 'Mark ' + keno.MIN_PICK + ' to ' + keno.MAX_PICK + ' numbers'
      && doc.querySelectorAll('.bj-felt .kn-acts .kn-hint').length === 1
      && doc.querySelectorAll('.kn-acts #knQuick').length === 1
      && $('knNear').textContent === '',
      JSON.stringify(hint()) + ' | near ' + JSON.stringify($('knNear').textContent));

    // --- the ticket is this screen's own, and marking costs no round trip -----------------------
    const before = sent.length;
    mark([3, 11, 27]);
    // it is a description of the state and not a notice, so it goes away by itself: no "seen once"
    // flag, which would also mean two windows drawing two different boards
    ok('marking enough numbers takes the line away and the two paying rows take the space',
      hint() === '' && doc.querySelectorAll('#knNear div').length === 2, JSON.stringify(hint()));
    num(3).click(); num(11).click(); num(27).click(); advance(2);
    ok('and unmarking brings it back, because it is the state and not an announcement',
      hint() === 'Mark ' + keno.MIN_PICK + ' to ' + keno.MAX_PICK + ' numbers' && marked().length === 0,
      JSON.stringify(hint()) + ' marked ' + marked().length);
    mark([3, 11, 27]);
    ok('marking three numbers sends the host nothing at all',
      sent.length === before && marked().join() === '3,11,27' && $('knSide').textContent === '3 picked',
      sent.length - before + ' messages, marked ' + marked().join() + ', side ' + $('knSide').textContent);
    ok('the two rows a 3-spot ticket is bought for are under the felt, and nothing else of the table',
      doc.querySelectorAll('#knNear div').length === 2
      && $('knNear').textContent.indexOf('Catch ' + keno.BY_PICKS[3].from) >= 0,
      JSON.stringify($('knNear').textContent));
    num(11).click(); advance(1);
    ok('pressing a marked number unmarks it', marked().join() === '3,27', marked().join());
    $('knQuick').click(); advance(2);
    ok('Quick pick fills the ticket to a size the game offers',
      keno.PICKS.indexOf(marked().length) >= 0, marked().length + ' marked: ' + marked().join());
    doc.pressKey('q'); advance(2);
    ok('and the keyboard can do it too, which is what makes a 21px cell a decision',
      keno.PICKS.indexOf(marked().length) >= 0, marked().length + ' marked');

    // --- a draw that catches ---------------------------------------------------------------------
    const TICKET = [1, 2, 3, 4, 5];
    const hitRound = seed((st) => st.hit >= 3, 'kn-hit-', TICKET);
    const vHit = keno.view(hitRound, 1e9);
    $('knClear').click(); advance(2);
    ok('Clear empties the ticket', marked().length === 0 && $('knClear').disabled, marked().length + ' marked');
    mark(TICKET);
    ok('the right slot counts the ticket', $('knSide').textContent === '5 picked', $('knSide').textContent);
    doc.pressKey('Enter'); settle();
    ok('the deal places the bet and nothing else: the ticket did not travel with it',
      sent[sent.length - 1].op === 'deal' && sent[sent.length - 1].picks === undefined,
      JSON.stringify(sent[sent.length - 1]));
    ok('the deal: the ticket is still on the board and Draw is up with two buttons',
      marked().join() === TICKET.join() && !$('knPlay').hidden && $('knBet').hidden
      && doc.querySelectorAll('#knPlay .bj-btn').length === 2,
      marked().join() + ' / ' + doc.querySelectorAll('#knPlay .bj-btn').length + ' buttons');

    doc.pressKey('d'); advance(2);
    ok('the draw carries the whole ticket over as one array',
      sent[sent.length - 1].op === 'draw' && sent[sent.length - 1].picks.join() === TICKET.join(),
      JSON.stringify(sent[sent.length - 1]));
    // the n-th ball is watched on its OWN cell: a count of what is showing cannot see a ball that
    // landed on a number the ticket had already marked
    const outAt = (n) => /\b(ball|miss|hit)\b/.test(num(n).className);
    const marks = { first: null, last: null, green: null, chip: null };
    // every time the catch on the board goes up, and when. THE COUNT RISING WHILE THE BALLS ARE
    // STILL COMING IS THE POINT: the draw used to hold the matches back until the tenth ball had
    // landed, so the ten balls were 700ms in which the player learned nothing at all
    const steps = [];
    for (let t = 0; t <= CHIP + 240; t++) {
      if (marks.first == null && outAt(vHit.drawn[0])) marks.first = t;
      if (marks.last == null && outAt(vHit.drawn[9])) marks.last = t;
      if (!steps.length || steps[steps.length - 1].n !== catches()) steps.push({ n: catches(), t: t });
      if (marks.green == null && catches() === vHit.matched.length) marks.green = t;
      if (marks.chip == null && doc.querySelectorAll('#knLine .bj-chip').length === 2) marks.chip = t;
      advance(1);
    }
    ok('the balls come out one at a time, ' + BALL + 'ms apart',
      R ? (marks.first <= 1 && marks.last <= 1) : (marks.first === BALL && marks.last === 10 * BALL),
      'first at ' + marks.first + 'ms, tenth at ' + marks.last + 'ms');
    // the number the catch has to be at after each ball: one more for every ball of the draw that
    // the ticket had marked, in the order the host drew them
    const wantSteps = [{ n: 0, t: 0 }];
    vHit.drawn.forEach((n, i) => {
      if (TICKET.indexOf(n) < 0) return;
      wantSteps.push({ n: wantSteps[wantSteps.length - 1].n + 1, t: (i + 1) * BALL });
    });
    ok('a catch is painted as its own ball lands, so the count climbs while they are still coming',
      R ? (steps.length === 1 && steps[0].n === vHit.matched.length)
        : steps.map((s) => s.n + '@' + s.t).join() === wantSteps.map((s) => s.n + '@' + s.t).join(),
      steps.map((s) => s.n + '@' + s.t).join() + ' want ' + wantSteps.map((s) => s.n + '@' + s.t).join());
    ok('the ticket settles after the last ball, and the money after that',
      R ? (marks.green <= 1 && marks.chip <= 1) : (marks.green <= 10 * BALL && marks.chip === CHIP),
      'full catch at ' + marks.green + 'ms, settled at ' + MARK + ', chip at ' + marks.chip + 'ms');
    ok('a number that came out and was NOT marked keeps a ring and nothing else',
      rings().length === 10 - vHit.matched.length
      && rings().every((n) => TICKET.indexOf(n) < 0 && vHit.drawn.indexOf(n) >= 0),
      rings().join() + ' drawn ' + vHit.drawn.join());
    ok('the catch and the multiple are the engine’s',
      chips() === 'bj-chip=' + vHit.hit + ' of 5 bj-chip win=×' + vHit.mult + ' · +' + money(vHit.net),
      chips() + ' engine hit ' + vHit.hit + ' mult ' + vHit.mult + ' net ' + vHit.net);
    ok('the two rows under the felt are where it landed and the one above it',
      doc.querySelectorAll('#knNear div').length === 2
      && $('knNear').textContent.indexOf('Catch ' + vHit.hit) >= 0
      && $('knNear').textContent.indexOf('Catch ' + (vHit.hit + 1)) >= 0,
      JSON.stringify($('knNear').textContent));
    settle();
    ok('the draw is read out with the balance',
      said() === 'Caught ' + vHit.hit + ' of 5. ×' + vHit.mult + ', +' + money(vHit.net) + '. Balance ' + hdrBal() + '.',
      JSON.stringify(said()));
    ok('and the board cannot be marked while a result is showing',
      doc.querySelectorAll('#knBoard .kn-n').every((b) => b.disabled) && $('knQuick').disabled);

    // --- a draw that catches nothing paid --------------------------------------------------------
    const coldRound = seed((st) => st.mult === 0, 'kn-cold-', TICKET);
    const vCold = keno.view(coldRound, 1e9);
    doc.pressKey('Enter'); settle();
    doc.pressKey('d'); settle();
    ok('a losing draw says so and carries the engine’s net',
      chips() === 'bj-chip=' + vCold.hit + ' of 5 bj-chip lose=No win −' + money(Math.abs(vCold.net)),
      chips() + ' engine hit ' + vCold.hit + ' net ' + vCold.net);

    // --- the paytable toggle ---------------------------------------------------------------------
    $('knWhy').click(); advance(2);
    ok('the toggle opens every board, one line a ticket size',
      !$('knPays').hidden && doc.querySelectorAll('#knPays .kn-pr').length === keno.PICKS.length,
      doc.querySelectorAll('#knPays .kn-pr').length + ' lines for ' + keno.PICKS.length + ' boards');
    $('knWhy').click(); advance(2);

    // --- a refused draw draws nothing: nothing happened, so nothing moves -----------------------
    doc.pressKey('Enter'); settle();
    const shot = { board: doc.querySelectorAll('#knBoard .kn-n').map((b) => b.className).join('|'), line: line() };
    const liveView = (function () {
      const r = keno.newRound({ seed: 'kn-live', id: 't', bet: BET });
      return keno.view(r, 1e9);
    })();
    h.intercept = (m) => {
      if (m.op !== 'draw') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'kn', n: m.n, state: liveView, error: 'mark 2 to 10 numbers', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('d'); advance(5);
    ok('a refused draw: the reason shows and no ball came out',
      !$('knErr').hidden && doc.querySelectorAll('#knBoard .kn-n.ball, #knBoard .kn-n.out, #knBoard .kn-n.miss').length === 0,
      JSON.stringify($('knErr').textContent));
    advance(1500);
    ok('a refused draw: the ticket is untouched and Draw comes back',
      doc.querySelectorAll('#knBoard .kn-n').map((b) => b.className).join('|') === shot.board && !$('knDraw').disabled,
      marked().join());

    // --- a reply with no state keeps what is drawn (games/README.md, section 5) ------------------
    h.intercept = (m) => {
      if (m.op !== 'draw') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'kn', n: m.n, error: 'the table could not be shown', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('d'); advance(5);
    ok('a reply with no state: the reason shows and the ticket stays on the felt',
      !$('knErr').hidden && marked().join() === TICKET.join() && line() === shot.line,
      JSON.stringify($('knErr').textContent) + ' | ' + marked().join());
    advance(5000);
    ok('a reply with no state releases the wait: no "didn’t respond" five seconds later',
      $('knErr').textContent.indexOf('respond') < 0 && !$('knDraw').disabled, $('knErr').textContent);

    // --- a round survives walking out of it and back in -----------------------------------------
    openList(); advance(5); openGame('keno');
    ok('back from the list mid-round: the same ticket, Draw live, the bet row still away',
      marked().join() === TICKET.join() && !$('knPlay').hidden && $('knBet').hidden && !$('knDraw').disabled,
      marked().join());
    ok('back from the list mid-round: no ball came out on the way', rings().length === 0, rings().join());

    // --- this game's keys belong to this game only ----------------------------------------------
    const quiet = sent.length;
    openList(); doc.pressKey('d'); doc.pressKey('q'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: the Keno keys do nothing on the list', sent.length === quiet, sent.slice(quiet).map((m) => m.op).join());

    // --- a late reply is drawn as it stands, with no pacing --------------------------------------
    openGame('keno');
    const late = keno.act(keno.newRound({ seed: 'kn-late', id: 'x', bet: BET }), { op: 'draw', picks: [7, 8, 9] });
    toWebview({ type: 'kn', state: keno.view(late, 1e9) }); // no n: a reply nobody is waiting for
    advance(5);
    ok('a reply nobody asked for is drawn as it stands, with no ball coming out',
      doc.querySelectorAll('#knBoard .kn-n.ball').length === 0
      && doc.querySelectorAll('#knBoard .kn-n.miss, #knBoard .kn-n.hit').length === 10
      && doc.querySelectorAll('#knLine .bj-chip').length === 2,
      doc.querySelectorAll('#knBoard .kn-n.miss, #knBoard .kn-n.hit').length + ' out, ' + chips());
  }
};
