// Hazard, end to end. The faces are found by searching the engine for a seed, so the die the screen
// is checked against is the die the host will really roll.
//
// The claim this file exists for: THE TRAY IS THE POT, AND THE 1 EMPTIES IT. A pip arrives in the
// tray for every pip on the die, the count is checked against `view().pot` after every roll, and the
// roll that comes up a 1 is checked for leaving the tray with nothing in it. The second claim is the
// one the games that left the floor could not make: the deal changes the felt, from a blank die and
// an empty tray to a face and a pile.
//
// And one negative claim: `bankAt`, the pot the best play banks at, is on the wire and must not be
// anywhere on this screen (docs/game-panels.md, 5-14: 정답을 쓰면 고를 것이 없어진다).
'use strict';

module.exports = {
  id: 'hazard',
  modes: ['hazard', 'hazard-reduce', 'hazard-poor'],
  start: { 'hazard-poor': 60 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openGame, bodyTabs, ledgerBalance, hdrBal,
      active, activeName, mouseClick, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'hazard.js'));
    const R = MODE === 'hazard-reduce';
    const BET = engine.MIN_BET;             // 100: this table's floor
    const sent = h.sent('hz');
    const FACE = 120, POT = 180, EMPTY = 220, CHIP = 420, CASH = 200;   // games/hazard/panel.js, HZ_T

    // which drawing a cell is pointing at, out of the sprite html.js put in the page. `#dc-0` is the
    // unrolled die and `#dc-1` is the one that empties the tray (webview.js, CUC.die)
    const faceIn = (id) => {
      const u = doc.querySelector('#' + id + ' use');
      const href = u ? String(u.getAttribute('href')) : '';
      return /^#dc-\d$/.test(href) ? Number(href.slice(4)) : -1;
    };
    const trayPips = () => doc.querySelectorAll('#hzTray .hz-pip').length;
    const pay = () => $('hzPay').textContent;
    const line = () => $('hzLine').textContent;
    const chip = () => { const c = doc.querySelector('#hzLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const said = () => $('hzLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const xOf = (m100) => m100 >= 1000 ? '×' + Math.floor(m100 / 100) : '×' + Math.floor(m100 / 100) + '.' + ('0' + (m100 % 100)).slice(-2);
    const rollBtn = () => doc.querySelector('#hzPlay [data-op="roll"]');
    const bankBtn = () => doc.querySelector('#hzPlay [data-op="bank"]');

    // A seed whose faces satisfy `want`, pinned as the round the host deals next
    function hzSeed(want, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const faces = engine.rollsOf(seed);
        if (want(faces)) { ext._test.setSeeds('hz', () => seed); return faces; }
      }
      throw new Error('no hazard seed for ' + tag);
    }

    openGame('hazard');
    ok('the Hazard row opens the table and asks the host for its state',
      doc.body.classList.contains('game-hz') && $('panel-hazard').style.display === ''
      && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());

    // --- THE BET SCREEN IS NOT AN EMPTY FELT ---------------------------------------------------
    ok('an unrolled die stands on the bet screen and the tray is drawn and empty',
      faceIn('hzDie') === 0 && trayPips() === 0 && $('hzDie').getAttribute('aria-label') === 'No roll yet'
      && $('hzTray').getAttribute('aria-label') === 'The tray is empty',
      faceIn('hzDie') + ' on the die, ' + trayPips() + ' in the tray');
    ok('THE FACE THAT ENDS A ROUND IS NAMED BEFORE THE FIRST ROLL: one pip, in the losing colour',
      faceIn('hzBust') === 1 && $('hzBust').getAttribute('aria-label') === 'A ' + engine.BUST + ' takes the tray',
      faceIn('hzBust') + ' on the warning die, ' + $('hzBust').getAttribute('aria-label'));
    // AND IT IS THE SAME DRAWING, recoloured by its own cell. CUC.die() carries no colour of its
    // own, which is the whole reason games/dice-faces.js draws the body in currentColor: a second
    // set of six baked in the losing colour would be six drawings to keep in step with the first six
    ok('the warning die is the same drawing at 24: CUC.die bakes no colour and no size of its own',
      $('hzBust').innerHTML.indexOf('fill') < 0 && $('hzBust').innerHTML.indexOf('color') < 0
      && /width="24" height="24"/.test($('hzBust').innerHTML)
      && /width="48" height="48"/.test($('hzDie').innerHTML),
      $('hzBust').innerHTML + ' | ' + $('hzDie').innerHTML);
    ok('the money slot is empty rather than showing a 0 nothing is riding on', pay() === '', JSON.stringify(pay()));
    ok('the tray never prints a number: it IS the number', $('hzTray').textContent === '', JSON.stringify($('hzTray').textContent));

    if (MODE === 'hazard-poor') {
      ok('this table starts at 100: the 10 chip is shut and says so',
        doc.querySelector('#hzStakes button[data-v="10"]').disabled
        && doc.querySelector('#hzStakes button[data-v="10"]').title === 'This table starts at 100',
        doc.querySelector('#hzStakes button[data-v="10"]').title);
      ok('sixty credits is not enough: Deal is off and the note asks for 100',
        $('hzDeal').disabled && !$('hzNote').hidden && $('hzNote').textContent === 'You need 100 credits to play.',
        $('hzNote').textContent);
      return;
    }

    ok('the chips open on 100, Deal is ready and focused',
      doc.querySelector('#hzLine .hl-pot.preview b').textContent === '100'
      && !$('hzDeal').disabled && active() === $('hzDeal'), line() + ' focus ' + activeName());

    // --- the folded table, and the answer that is NOT on it ------------------------------------
    $('hzWhy').click(); advance(2);
    const box = () => $('hzPays').textContent;
    ok('the rate, the floor and the cap are behind the ? toggle, in the host’s own figures',
      !$('hzPays').hidden
      && box().indexOf(money(engine.PER_PIP) + ' of every ' + money(engine.PER_DEN)) >= 0
      && box().indexOf('from ' + money(engine.breakEvenOf(BET)) + ' pips up') >= 0
      && box().indexOf('banks itself at ' + money(engine.POT_CAP)) >= 0,
      JSON.stringify(box()));
    ok('and bankAt, the pot the best play banks at, is nowhere in it: the answer is not written down',
      engine.SOLVED.bankAt === 20 && box().indexOf('20') < 0 && box().indexOf('best') < 0,
      'bankAt ' + engine.SOLVED.bankAt + ' in ' + JSON.stringify(box()));
    ok('nothing is said about what the tray stands at before there is a tray',
      box().indexOf('stands at') < 0, JSON.stringify(box()));
    $('hzWhy').click(); advance(2);

    // --- the deal: a face that pays, so the round is live --------------------------------------
    // a run that survives three rolls and then comes up a 1, which is both halves of this game in
    // one round
    const faces = hzSeed((f) => f[0] !== 1 && f[1] !== 1 && f[2] !== 1 && f[3] === 1, 'hz-run-');
    doc.pressKey('Enter'); advance(2);
    const at = {};
    for (let t = 0; t <= POT + 100; t++) {
      if (at.face == null && faceIn('hzDie') > 0) at.face = t;
      if (at.pot == null && trayPips() > 0) at.pot = t;
      advance(1);
    }
    let st = engine.newRound({ seed: 'x', id: 't', bet: BET, stack: faces.slice() });
    ok('the face lands first and the tray follows it',
      R ? (at.face <= 2 && at.pot <= 2) : (at.face === FACE && at.pot === POT),
      'face at ' + at.face + ' tray at ' + at.pot);
    ok('THE DEAL CHANGED THE FELT: the die carries the host’s own face and the tray its own pips',
      faceIn('hzDie') === faces[0] && trayPips() === st.pot && st.pot === faces[0],
      faceIn('hzDie') + ' on the die, ' + trayPips() + ' in the tray, host says ' + st.pot);
    ok('the money is what banking right now pays, and it is the host’s own figure',
      pay() === money(engine.payoutOf(BET, st.pot)), pay() + ' want ' + money(engine.payoutOf(BET, st.pot)));
    ok('both moves are open and Roll has the focus',
      !$('hzPlay').hidden && !rollBtn().disabled && !bankBtn().disabled && active() === rollBtn(),
      activeName());
    ok('the roll is read out with its face and what the tray is worth',
      said() === 'Rolled ' + faces[0] + '. ' + money(st.pot) + ' in the tray, worth '
        + money(engine.payoutOf(BET, st.pot)) + '.', JSON.stringify(said()));

    // --- rolling again: the pile grows, one pip a pip -------------------------------------------
    doc.dispatchKey('r'); advance(POT + 100);
    st = engine.act(st, 'roll');
    ok('a second roll adds exactly as many pips as the face it rolled',
      trayPips() === st.pot && st.pot === faces[0] + faces[1] && faceIn('hzDie') === faces[1],
      trayPips() + ' in the tray, host says ' + st.pot);
    ok('and the money moved with it, still the host’s figure',
      pay() === money(engine.payoutOf(BET, st.pot)), pay());
    ok('the line is the bet that is riding, not the pot',
      line().indexOf(money(BET)) >= 0 && chip() === 'none', line() + ' | ' + chip());
    // the multiple is FOLDED, not dropped: the money above is what the decision is made against and
    // this is the same fact read the other way (docs/game-panels.md, section 5)
    $('hzWhy').click(); advance(2);
    ok('what the tray stands at as a multiple of the bet is behind the ?, on the host’s own figure',
      box().indexOf('stands at ' + xOf(engine.mult100Of(BET, st.pot))) >= 0
      && box().indexOf(money(engine.SOLVED.bankAt)) < 0,
      JSON.stringify(box()) + ' pot ' + st.pot);
    $('hzWhy').click(); advance(2);

    // --- the 1: the tray empties, and that is the whole game ------------------------------------
    doc.dispatchKey('r'); advance(POT + 100);   // third roll, still alive
    st = engine.act(st, 'roll');
    const before = trayPips();
    doc.dispatchKey('r'); advance(2);
    const end = {};
    for (let t = 0; t <= CHIP + 200; t++) {
      if (end.face == null && faceIn('hzDie') === 1) end.face = t;
      if (end.empty == null && trayPips() === 0) end.empty = t;
      if (end.chip == null && doc.querySelector('#hzLine .bj-chip')) { end.chip = t; end.bal = hdrBal(); }
      advance(1);
    }
    st = engine.act(st, 'roll');
    ok('the tray was full before the 1 came up', before === faces[0] + faces[1] + faces[2], before + ' pips');
    ok('the 1 lands, then the tray empties, then the figure: three beats and not one',
      R ? (end.empty <= 2 && end.chip <= 2) : (end.face === FACE && end.empty === EMPTY && end.chip === CHIP),
      JSON.stringify(end));
    ok('A 1 TAKES THE LOT: the tray has nothing in it and the money slot is empty',
      trayPips() === 0 && pay() === '' && st.pot === 0 && st.paid === 0,
      trayPips() + ' pips, pay ' + JSON.stringify(pay()));
    ok('the chip says what happened and the bet row is back',
      chip().indexOf('lose') >= 0 && chip().indexOf('Rolled a 1') >= 0
      && chip().indexOf('−' + money(BET)) >= 0 && !$('hzBet').hidden, chip());
    ok('the bust is read out', said() === 'Rolled a 1. The tray is empty. −' + money(BET) + '. Balance ' + end.bal + '.',
      JSON.stringify(said()));

    // --- cashing out ----------------------------------------------------------------------------
    const safe = hzSeed((f) => f[0] !== 1 && f[1] !== 1, 'hz-safe-');
    $('hzDeal').click(); advance(POT + 100);
    doc.dispatchKey('r'); advance(POT + 100);
    const held = trayPips(), owed = pay();
    doc.dispatchKey('c'); advance(2);
    const cash = {};
    for (let t = 0; t <= CASH + 100; t++) {
      if (cash.chip == null && doc.querySelector('#hzLine .bj-chip')) { cash.chip = t; cash.bal = hdrBal(); }
      advance(1);
    }
    ok('cashing out settles on its own beat', R ? cash.chip <= 2 : cash.chip === CASH, 'chip at ' + cash.chip);
    // THE TWO ENDINGS DO NOT LOOK ALIKE, and that is the point of drawing the pot rather than
    // printing it: a round that banked keeps its pile and its figure (this is what you took for
    // these), and a round that busted has neither. The host says so too, since settling by banking
    // leaves `pot` where it stands and busting sets it to 0
    ok('what was banked is what the slot said was owed, and the pile it was paid for is still there',
      held === safe[0] + safe[1] && chip().indexOf('Banked +') >= 0
      && trayPips() === held && pay() === owed,
      held + ' pips, owed ' + owed + ', ' + trayPips() + ' still in the tray, ' + chip());
    // the banked figure is the 22px one and the chip is the net: printing it twice would not fit the
    // 152px line, and the line already has the figure above it
    ok('the chip carries the net and does not repeat the figure above it',
      chip().indexOf('win') >= 0 && chip().indexOf(owed) < 0
      && chip().indexOf(money(engine.payoutOf(BET, held) - BET)) >= 0, chip() + ' owed ' + owed);

    // --- a move the round does not have is refused, and nothing moves ---------------------------
    h.hostSend({ type: 'hz', op: 'roll', n: 951 });
    advance(10);
    ok('rolling with no round is refused in the engine’s own words',
      !$('hzErr').hidden && /no round in progress/.test($('hzErr').textContent), $('hzErr').textContent);

    // --- a broadcast is drawn where it stands ---------------------------------------------------
    const cast = engine.newRound({ seed: 'c', id: 'c', bet: BET, stack: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
      6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
      6, 6, 6, 6, 6, 6, 6, 6] });
    toWebview({ type: 'hz', state: engine.view(cast, 1e9), balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once: the face and the pile as they stand, nothing paced',
      faceIn('hzDie') === 6 && trayPips() === cast.pot && h.pending(50) === 0,
      trayPips() + ' pips, host says ' + cast.pot + ', pending ' + h.pending(50));
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
