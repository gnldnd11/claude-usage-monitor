// The tower, end to end. The situations (a floor whose first door is safe, a floor whose first door
// is the trap) are made by searching the engine for a seed, never by faking a reply: the host deals
// the round the search found, so the figures below are exact.
'use strict';

module.exports = {
  id: 'tower',
  modes: ['tower', 'tower-reduce', 'tower-poor'],
  // 50 credits is under this table's 100, and under it in a way the shared chips do not know about:
  // the 10 chip would otherwise be lit on a table that refuses 10
  start: { 'tower-poor': 50 },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openGame, openList, hdrBal, ledgerBalance, toWebview, ext, EXT, path } = h;
    const tower = require(path.join(EXT, 'tower.js'));
    const R = MODE === 'tower-reduce';
    const BET = 100;
    const sent = h.sent('tw');
    const money = (n) => Math.round(n).toLocaleString('en-US');
    // the same integer formatting the panel uses: the engine's hundredths, decimal point moved
    const mult = (m) => m >= 1000 ? '×' + Math.floor(m / 100) : '×' + Math.floor(m / 100) + '.' + ('0' + (m % 100)).slice(-2);
    const row = (f) => $('twR' + f);
    const doors = (f) => doc.querySelectorAll('#twD' + f + ' .tw-d');
    const line = () => $('twLine').textContent;
    const chip = () => { const c = doc.querySelector('#twLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const said = () => $('twLive').textContent;
    const chips = () => doc.querySelectorAll('#twStakes button').map((b) => b.getAttribute('data-v') + (b.disabled ? '-off' : '-on')).join(' ');
    // WHY a chip is closed, which is not one question but three: this table does not take that
    // bet at all, the credits are riding on another table, or there are none. The first of the
    // three is this table's own (CUC.stakeUi's `min`, from the engine's MIN_BET) and the other
    // two are the purse's, so a run of closed chips that all said the same thing would be the
    // screen blaming the player for the table's price
    const whys = () => doc.querySelectorAll('#twStakes button').map((b) => b.title || '-').join(' | ');
    const settle = () => advance(1200);
    const shownTraps = () => doc.querySelectorAll('#twTower .tw-d.trap, #twTower .tw-d.sprung').length;
    const openDoors = () => doc.querySelectorAll('#twTower .tw-d').filter((b) => !b.disabled).length;
    // The seed the host will deal, found by playing the real engine
    function seed(want, tag, diff) {
      for (let i = 0; i < 20000; i++) {
        const s = tag + i;
        const r = tower.newRound({ seed: s, id: 't', bet: BET, diff: diff });
        if (want(r, tower.view(r, 1e9))) { ext._test.setSeeds('tw', () => s); return r; }
      }
      throw new Error('no tower seed for ' + tag);
    }

    openGame('tower');
    ok('the Tower row opens its screen and asks the host for its state',
      doc.body.classList.contains('game-tw') && $('panel-tower').style.display === '' && sent.map((m) => m.op).join() === 'open',
      h.bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('ten floors are drawn, floor ten at the top, with a hairline between each pair',
      doc.querySelectorAll('#twTower .tw-row').length === 10
      && doc.querySelectorAll('#twTower .tw-row')[0].getAttribute('id') === 'twR9'
      && doc.querySelectorAll('#twTower .gm-rule.tw-rh').length === 9,
      doc.querySelectorAll('#twTower .tw-row').length + ' rows, first ' + doc.querySelectorAll('#twTower .tw-row')[0].getAttribute('id'));
    ok('the paytable is folded away', $('twPays').hidden && $('twWhy').getAttribute('aria-expanded') === 'false');

    if (MODE === 'tower-poor') {
      ok('under the table minimum: every chip is off, Deal is off and the note says how much',
        chips() === '10-off 100-off 1000-off' && $('twDeal').disabled
        && !$('twNote').hidden && $('twNote').textContent === 'You need 100 credits to play.',
        chips() + ' note ' + JSON.stringify($('twNote').textContent));
      ok('with a short purse the three closed chips still give the two separate reasons',
        whys() === 'This table starts at 100 | Not enough credits | Not enough credits', whys());
      ok('and no door can be pressed with no round in play', openDoors() === 0, openDoors() + ' open');
      return;
    }

    ok('betting: the 10 chip is closed on a 100-credit table and 100 is the pick',
      chips() === '10-off 100-on 1000-on' && $('twDeal').getAttribute('data-bet') === '100', chips());
    // a fresh install opens on a bet the host will take: the whole point of the floor. And the
    // one closed chip says the table's price rather than accusing the purse, which has 1,000 in it
    ok('and the closed chip gives the table’s own reason, not the purse’s',
      whys() === 'This table starts at 100 | - | -', whys());
    ok('betting: the difficulties are the engine’s, named by how many doors are safe',
      doc.querySelectorAll('#twDiffs button').map((b) => b.getAttribute('data-d')).join() === tower.DIFFS.map((d) => d.id).join()
      && doc.querySelectorAll('#twDiffs button').map((b) => b.textContent).join() === tower.DIFFS.map((d) => (d.cells - d.traps) + '/' + d.cells).join(),
      doc.querySelectorAll('#twDiffs button').map((b) => b.getAttribute('data-d') + '=' + b.textContent).join(' '));
    ok('betting: no trap is on screen anywhere', shownTraps() === 0, shownTraps() + ' traps shown');
    // the building follows the difficulty before a bet is placed, so the pick is visible as doors
    doc.querySelectorAll('#twDiffs button').find((b) => b.getAttribute('data-d') === 'easy').click(); advance(2);
    ok('picking the easy tower draws its four doors before any round exists', doors(0).length === 4, doors(0).length + ' doors');
    doc.querySelectorAll('#twDiffs button').find((b) => b.getAttribute('data-d') === 'normal').click(); advance(2);
    ok('and back to three for the normal tower', doors(0).length === 3, doors(0).length + ' doors');

    // --- THE LADDER IS STANDING BEFORE THE DEAL -------------------------------------------------
    // The price of each floor is what a difficulty IS. The ten rungs used to be ten empty strings
    // until a round existed, so pressing 2/3 moved the number of doors and nothing else; with them
    // filled, 3/4 reads x1.29 .. x17 and 2/3 reads x1.72 .. x57. The figures are the engine's own
    // fairOf(), the same array the host sends in `choices` and the ? toggle lays out, so the screen
    // is picking one of them and not working anything out (games/tower/panel.js, rung())
    const rungs = () => Array.from({ length: 10 }, (_, f) => $('twM' + f).textContent).join(' ');
    const ladderOf = (id) => tower.fairOf(id).map(mult).join(' ');
    ok('betting: every floor already carries its price, before any round exists',
      rungs() === ladderOf('normal') && ladderOf('normal') !== ladderOf('hard'),
      rungs() + ' want ' + ladderOf('normal'));
    doc.querySelectorAll('#twDiffs button').find((b) => b.getAttribute('data-d') === 'hard').click(); advance(2);
    ok('and pressing another difficulty moves every rung, which is what a difficulty is',
      rungs() === ladderOf('hard'), rungs() + ' want ' + ladderOf('hard'));
    doc.querySelectorAll('#twDiffs button').find((b) => b.getAttribute('data-d') === 'normal').click(); advance(2);
    ok('back on the first difficulty the rungs come back with it', rungs() === ladderOf('normal'), rungs());
    // the bet screen is not a round, so no floor is dimmed as "not yours this time": ten floors on
    // offer, which is why they are tw-offer and not tw-ahead (games/tower/meta.js)
    ok('betting: no floor is dimmed, because none of the ten is somebody else’s yet',
      doc.querySelectorAll('#twTower .tw-row.tw-offer').length === 10
      && doc.querySelectorAll('#twTower .tw-row.tw-ahead, #twTower .tw-row.tw-now').length === 0,
      doc.querySelectorAll('#twTower .tw-row').map((r) => r.className).join(' | '));

    // --- a safe climb, then a cash-out -----------------------------------------------------------
    let round = seed((r) => r.layout[0].indexOf(0) < 0, 'tw-safe-', 'normal');
    const climbed = tower.act(round, { op: 'climb', cell: 0 });
    const vUp = tower.view(climbed, 1e9);
    const cashed = tower.act(climbed, 'cashout');
    doc.pressKey('Enter'); settle();
    ok('the deal sends the bet and the difficulty the screen had picked',
      sent[sent.length - 1].op === 'deal' && sent[sent.length - 1].bet === BET && sent[sent.length - 1].diff === 'normal',
      JSON.stringify(sent[sent.length - 1]));
    ok('the deal: only the ground floor can be pressed, and it is the only full-height row',
      openDoors() === 3 && row(0).className.indexOf('tw-now') >= 0 && row(1).className.indexOf('tw-ahead') >= 0,
      openDoors() + ' open, floor 1 ' + row(0).className + ', floor 2 ' + row(1).className);
    ok('the deal: every floor already carries its own price, which is the ladder',
      doc.querySelectorAll('#twTower .tw-m').map((e) => e.textContent).filter((t) => t).length === 10
      && $('twM0').textContent === mult(tower.view(round, 1e9).rows[0].mult100),
      $('twM0').textContent + ' .. ' + $('twM9').textContent);
    ok('the deal: the cash-out row is up with one button, closed before the first floor',
      !$('twPlay').hidden && $('twBet').hidden && doc.querySelectorAll('#twPlay .bj-btn').length === 1 && $('twCash').disabled,
      doc.querySelectorAll('#twPlay .bj-btn').length + ' buttons');

    const lineBefore = line();
    doors(0)[0].click(); advance(2);
    const seen = { door: null, num: null };
    for (let t = 0; t <= 460; t++) {
      if (seen.door == null && doors(0)[0].className.indexOf('took') >= 0) seen.door = t;
      if (seen.num == null && line() !== lineBefore) seen.num = t;
      advance(1);
    }
    ok('a climb sends the door it was',
      sent[sent.length - 1].op === 'climb' && sent[sent.length - 1].cell === 0, JSON.stringify(sent[sent.length - 1]));
    ok('a safe climb: the door opens at once and the numbers wait for it',
      seen.door <= 2 && (R ? seen.num <= 1 : seen.num === 300), 'door at ' + seen.door + 'ms, numbers at ' + seen.num + 'ms');
    ok('a safe climb: the floor cleared stays behind you, and the climb moves up one',
      row(0).className.indexOf('tw-past') >= 0 && row(1).className.indexOf('tw-now') >= 0 && vUp.at === 1,
      'floor 1 ' + row(0).className + ', floor 2 ' + row(1).className);
    ok('a safe climb: the cash-out figure and the next floor are the engine’s',
      line().indexOf(money(vUp.cash)) >= 0 && line().indexOf(mult(vUp.next.mult100)) >= 0
      && line().indexOf(vUp.next.chance.num + '/' + vUp.next.chance.den) >= 0,
      line() + ' engine cash ' + vUp.cash + ' next ' + vUp.next.mult100 + ' ' + JSON.stringify(vUp.next.chance));
    ok('a safe climb: still no trap anywhere, not even on the floor being climbed',
      shownTraps() === 0, shownTraps() + ' traps shown');
    ok('a safe climb is read out, and the door carries its own name',
      said() === 'Floor 1 is clear. Cash out ' + money(vUp.cash) + '. Next ' + mult(vUp.next.mult100) + '.'
      && doors(0)[0].getAttribute('aria-label') === 'floor 1 door 1, taken',
      JSON.stringify(said()) + ' label ' + JSON.stringify(doors(0)[0].getAttribute('aria-label')));

    doc.pressKey('c'); settle();
    ok('cash out: a win chip carrying the engine’s net',
      chip() === 'bj-chip win Cashed out +' + money(cashed.net), chip() + ' engine net ' + cashed.net);
    ok('cash out: every floor opens, the nine never reached included',
      shownTraps() === 10, shownTraps() + ' traps shown');
    ok('cash out: back to the bet controls', !$('twBet').hidden && $('twPlay').hidden && !$('twDeal').disabled);

    // --- the trap, and the whole building opening on it -----------------------------------------
    round = seed((r) => r.layout[0].indexOf(0) >= 0, 'tw-fall-', 'normal');
    const fell = tower.act(round, { op: 'climb', cell: 0 });
    doc.pressKey('Enter'); settle();
    doors(0)[0].click(); advance(2);
    const marks = { sprung: null, all: null };
    for (let t = 0; t <= 900; t++) {
      if (marks.sprung == null && doors(0)[0].className.indexOf('sprung') >= 0) marks.sprung = t;
      if (marks.all == null && shownTraps() === 10) marks.all = t;
      advance(1);
    }
    ok('the trap springs first and then every floor opens, the ones never reached included',
      marks.sprung <= 2 && (R ? marks.all <= 1 : (marks.all >= 500 && marks.all <= 620)),
      'sprung at ' + marks.sprung + 'ms, whole tower at ' + marks.all + 'ms');
    ok('exactly one door is the one that was stepped on',
      doc.querySelectorAll('#twTower .tw-d.sprung').length === 1 && doc.querySelectorAll('#twTower .tw-d.trap').length === 9,
      doc.querySelectorAll('#twTower .tw-d.sprung').length + ' sprung, ' + doc.querySelectorAll('#twTower .tw-d.trap').length + ' traps');
    ok('a fall: a lose chip carrying the engine’s net, which is the bet and never the ladder',
      chip() === 'bj-chip lose Fell −' + money(BET) && fell.net === -BET, chip() + ' engine net ' + fell.net);
    settle();   // the header counts down to the settled balance, and that is the figure read out
    ok('a fall is read out, and it says which floor it was on',
      said() === 'Fell −' + money(BET) + '. The trap was on floor 1. Balance ' + hdrBal() + '.', JSON.stringify(said()));

    // --- the paytable toggle ---------------------------------------------------------------------
    $('twWhy').click(); advance(2);
    ok('the toggle opens the three towers, a row a floor, and nothing of it was on the felt before',
      !$('twPays').hidden && doc.querySelectorAll('#twPays .tw-pr').length === 11,
      doc.querySelectorAll('#twPays .tw-pr').length + ' rows');
    $('twWhy').click(); advance(2);

    // --- a refused move draws nothing: nothing happened, so nothing moves ------------------------
    round = seed((r) => r.layout[0].indexOf(0) < 0, 'tw-refuse-', 'normal');
    const held = tower.view(tower.act(round, { op: 'climb', cell: 0 }), 1e9);
    doc.pressKey('Enter'); settle();
    doors(0)[0].click(); settle();
    const snap = () => doc.querySelectorAll('#twTower .tw-d').map((b) => b.className).join('|');
    const shot = { line: line(), tower: snap() };
    h.intercept = (m) => {
      if (m.op !== 'climb') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'tw', n: m.n, state: held, error: 'pick a door on this floor', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doors(1)[0].click(); advance(5);
    ok('a refused climb: the reason shows and no door moved',
      !$('twErr').hidden && snap() === shot.tower && doc.querySelectorAll('#twTower .tw-d.swing, #twTower .tw-d.spring').length === 0,
      JSON.stringify($('twErr').textContent));
    advance(1200);
    ok('a refused climb: the figures are untouched and the climb comes back',
      line() === shot.line && !$('twCash').disabled, line() + ' vs ' + shot.line);

    // --- a reply with no state keeps what is drawn (games/README.md, section 5) ------------------
    h.intercept = (m) => {
      if (m.op !== 'climb') return false;
      h.intercept = null;
      h.later(1, () => toWebview({ type: 'tw', n: m.n, error: 'the table could not be shown', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doors(1)[0].click(); advance(5);
    ok('a reply with no state: the reason shows and the climb stays on the felt',
      !$('twErr').hidden && snap() === shot.tower && line() === shot.line,
      JSON.stringify($('twErr').textContent) + ' | ' + line());
    advance(5000);
    ok('a reply with no state releases the wait: no "didn’t respond" five seconds later',
      $('twErr').textContent.indexOf('respond') < 0 && !$('twCash').disabled, $('twErr').textContent);
    doc.pressKey('c'); settle();

    // --- a round survives walking out of it and back in -----------------------------------------
    round = seed((r) => r.layout[0].indexOf(0) < 0, 'tw-back-', 'hard');
    doc.querySelectorAll('#twDiffs button').find((b) => b.getAttribute('data-d') === 'hard').click(); advance(2);
    doc.pressKey('Enter'); settle();
    ok('the difficulty the screen picked is the one the host dealt',
      sent[sent.length - 1].diff === 'hard', JSON.stringify(sent[sent.length - 1]));
    doors(0)[0].click(); settle();
    const mid = { line: line(), tower: snap() };
    openList(); advance(5); openGame('tower');
    ok('back from the list mid-round: the same building and the same figures, the cash-out live',
      snap() === mid.tower && line() === mid.line && !$('twPlay').hidden && $('twBet').hidden && !$('twCash').disabled,
      line() + ' vs ' + mid.line);
    ok('back from the list mid-round: no door opened itself again',
      doc.querySelectorAll('#twTower .tw-d.swing, #twTower .tw-d.spring').length === 0);
    doc.pressKey('c'); settle();

    // --- this game's keys belong to this game only ----------------------------------------------
    const before = sent.length;
    openList(); doc.pressKey('c'); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: the Tower keys do nothing on the list', sent.length === before, sent.slice(before).map((m) => m.op).join());

    // --- a late reply is drawn as it stands, with no pacing --------------------------------------
    openGame('tower');
    const walk = tower.newRound({ seed: 'tw-sweep', id: 'x', bet: BET, diff: 'normal', stack: Array.from({ length: 10 }, () => [2]) });
    const two = tower.act(tower.act(walk, { op: 'climb', cell: 0 }), { op: 'climb', cell: 1 });
    toWebview({ type: 'tw', state: tower.view(two, 1e9) }); // no n: a reply nobody is waiting for
    advance(5);
    ok('a reply nobody asked for is drawn as it stands, with no animation',
      doors(0)[0].className === 'tw-d took' && doors(1)[1].className === 'tw-d took'
      && row(2).className.indexOf('tw-now') >= 0
      && doc.querySelectorAll('#twTower .tw-d.swing, #twTower .tw-d.spring').length === 0,
      doors(0)[0].className + ' / ' + doors(1)[1].className + ' / ' + row(2).className);
  }
};
