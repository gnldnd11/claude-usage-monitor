// Shut the Box, end to end. The throws are found by searching the engine for a seed, so the board
// the screen is checked against is the board the host will really deal.
//
// The claim this file exists for: THE SCREEN NEVER COUNTS. Every tile this screen offers is checked
// against `view().moves`, the host's own ruling, tile by tile and after every press, which is the
// same claim as "you cannot press a wrong tile". The second claim is the one the four games that
// left the floor could not make: the deal changes the felt. Two blank dice and nine lit tiles before
// it, pips and a hole after it.
'use strict';

module.exports = {
  id: 'shutbox',
  modes: ['shutbox', 'shutbox-reduce', 'shutbox-poor'],
  start: { 'shutbox-poor': 60 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openGame, bodyTabs, ledgerBalance, hdrBal,
      active, activeName, mouseClick, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'shutbox.js'));
    const R = MODE === 'shutbox-reduce';
    const BET = engine.MIN_BET;             // 100: this table's floor
    const sent = h.sent('sx');
    const CLOSE = 150, ROLL = 200, CHIP = 420;   // games/shutbox/panel.js, SX_T

    const tile = (n) => doc.querySelector('#sxTiles .sx-tile[data-t="' + n + '"]');
    const tiles = () => doc.querySelectorAll('#sxTiles .sx-tile');
    // one letter a tile, so nine states read as one string: o open, h in hand, x not this throw,
    // . already down
    const board = () => [...tiles()].map((t) => t.classList.contains('down') ? '.'
      : t.classList.contains('on') ? 'h' : t.classList.contains('off') ? 'x' : 'o').join('');
    const shut = () => [...tiles()].filter((t) => t.classList.contains('shut')).map((t) => t.getAttribute('data-t')).join();
    // which drawing the cell is pointing at, out of the sprite html.js put in the page. `#dc-0` is
    // the unrolled die (webview.js, CUC.die)
    const faceOf = (i) => {
      const u = doc.querySelector('#sxD' + i + ' use');
      const href = u ? String(u.getAttribute('href')) : '';
      return /^#dc-\d$/.test(href) ? Number(href.slice(4)) : -1;
    };
    const dice = () => [faceOf(0), faceOf(1)].join(',');
    const line = () => $('sxLine').textContent;
    const chip = () => { const c = doc.querySelector('#sxLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const said = () => $('sxLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const xOf = (m100) => m100 >= 1000 ? '×' + Math.floor(m100 / 100) : '×' + Math.floor(m100 / 100) + '.' + ('0' + (m100 % 100)).slice(-2);
    // What the host would offer on this board and throw, which is what the screen must be showing.
    // `st` is an ENGINE round, so `open` is the bit mask and not the tile list view() hands over
    const wantBoard = (st) => {
      const mv = engine.movesFor(st.open, st.roll);
      let out = '';
      for (let t = 1; t <= engine.TILES; t++) {
        const up = (st.open & engine.bitOf(t)) !== 0;
        out += up ? (mv.some((m) => m.indexOf(t) >= 0) ? 'o' : 'x') : '.';
      }
      return out;
    };
    const remOf = (st) => engine.sumOfMask(st.open);

    function sxSeed(want, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = engine.newRound({ seed, id: 't', bet: BET });
        if (want(st)) { ext._test.setSeeds('sx', () => seed); return st; }
      }
      throw new Error('no shutbox seed for ' + tag);
    }

    openGame('shutbox');
    ok('the Shut the Box row opens the box and asks the host for its state',
      doc.body.classList.contains('game-sx') && $('panel-shutbox').style.display === ''
      && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());

    // --- THE BET SCREEN IS NOT AN EMPTY FELT ---------------------------------------------------
    ok('two dice stand on the bet screen with no pips on them, and nine tiles stand under them',
      dice() === '0,0' && tiles().length === engine.TILES && board() === 'ooooooooo'
      && $('sxDice').getAttribute('aria-label') === 'No throw yet',
      dice() + ' ' + board());
    ok('every tile is a real button carrying its own number',
      [...tiles()].every((t, i) => t.localName === 'button' && t.textContent === String(i + 1)),
      [...tiles()].map((t) => t.textContent).join());

    if (MODE === 'shutbox-poor') {
      ok('this table starts at 100: the 10 chip is shut and says so',
        doc.querySelector('#sxStakes button[data-v="10"]').disabled
        && doc.querySelector('#sxStakes button[data-v="10"]').title === 'This table starts at 100',
        doc.querySelector('#sxStakes button[data-v="10"]').title);
      ok('sixty credits is not enough: Deal is off and the note asks for 100',
        $('sxDeal').disabled && !$('sxNote').hidden && $('sxNote').textContent === 'You need 100 credits to play.',
        $('sxNote').textContent);
      return;
    }

    ok('the chips open on 100, Deal is ready and focused',
      doc.querySelector('#sxLine .hl-pot.preview b').textContent === '100'
      && !$('sxDeal').disabled && active() === $('sxDeal'), line() + ' focus ' + activeName());

    // three pay rows plus the eleven throws, each with a heading over it. The throws are folded and
    // not dropped: tiles can be closed without them, and they are what says why holding the 1 and
    // the 2 back is worth anything (docs/game-panels.md, section 5)
    const live = engine.WAYS.filter((w) => w > 0).length;
    $('sxWhy').click(); advance(2);
    ok('the table is behind the ? toggle: three rows, widest paying first',
      !$('sxPays').hidden
      && doc.querySelectorAll('#sxPays .sx-pay').length === engine.PAYS.length + live + 2
      && doc.querySelectorAll('#sxPays .sx-pay')[1].textContent === engine.PAYS[0].name + xOf(engine.PAYS[0].mult100),
      doc.querySelectorAll('#sxPays .sx-pay')[1].textContent);
    ok('and under them, how often each throw comes up: the host’s own count out of its own 36',
      doc.querySelector('#sxPays .sx-throws').textContent === 'throwin ' + money(engine.THROWS)
      && [...doc.querySelectorAll('#sxPays .sx-pay')].slice(engine.PAYS.length + 2)
        .map((r) => r.textContent).join('|')
        === engine.WAYS.map((w, t) => w ? t + money(w) : null).filter(Boolean).join('|'),
      [...doc.querySelectorAll('#sxPays .sx-pay')].slice(engine.PAYS.length + 2).map((r) => r.textContent).join('|'));
    $('sxWhy').click(); advance(2);

    // --- the deal: a throw that needs TWO tiles, so the hand has to be built -------------------
    // 12 can only come down as 3+9, 4+8, 5+7 on a full board: no single tile makes it, which is what
    // makes this the throw that proves a hand can be stacked
    const dealt = sxSeed((st) => st.roll === 12, 'sx-12-');
    doc.pressKey('Enter'); advance(2);
    ok('the deal is one message with the bet on it and nothing else',
      JSON.stringify(sent.filter((m) => m.op === 'deal').pop()) === JSON.stringify({ type: 'sx', op: 'deal', n: 2, bet: BET }),
      JSON.stringify(sent.filter((m) => m.op === 'deal').pop()));

    const at = {};
    for (let t = 0; t <= ROLL + 100; t++) {
      if (at.dice == null && dice() !== '0,0') at.dice = t;
      advance(1);
    }
    ok('the throw lands on the dice at ' + ROLL,
      R ? at.dice <= 2 : at.dice === ROLL, 'dice at ' + at.dice);
    ok('THE DEAL CHANGED THE FELT: the two dice now carry the host’s own throw',
      dice() === dealt.dice.join(',') && $('sxDice').getAttribute('aria-label')
        === 'Threw ' + dealt.dice.join(' and ') + ', ' + dealt.roll,
      dice() + ' want ' + dealt.dice.join(','));
    ok('the bet row is gone and NO control row is left: this screen has no buttons while it plays',
      $('sxBet').hidden && doc.querySelectorAll('#panel-shutbox .bj-ctl:not([hidden])').length === 0,
      doc.querySelectorAll('#panel-shutbox .bj-ctl:not([hidden])').length + ' control rows showing');
    ok('the line is what is still standing and what it would pay, both the host’s own figures',
      line() === fmtRem(dealt), JSON.stringify(line()) + ' want ' + JSON.stringify(fmtRem(dealt)));
    function fmtRem(st) {
      const rem = remOf(st), sd = engine.standingOf(st.bet, rem);
      return money(rem) + ' left' + (sd.row ? ' · ' + xOf(sd.mult100) : '');
    }

    // --- THE SCREEN NEVER COUNTS: what is offered is the host's own `moves` ---------------------
    ok('every tile the screen offers is one the host would take, and every tile it greys out is not',
      board() === wantBoard(dealt), board() + ' want ' + wantBoard(dealt));
    ok('a throw of 12 has no single-tile set, so a press builds a hand instead of closing at once',
      engine.movesFor(engine.ALL, 12).every((m) => m.length > 1),
      engine.movesFor(engine.ALL, 12).length + ' sets, shortest ' + engine.movesFor(engine.ALL, 12)[0].length);

    // a tile, then the tiles that can still join it
    const pair = engine.movesFor(engine.ALL, 12)[0];   // shortest set first: [3, 9]
    mouseClick(tile(pair[0])); advance(5);
    ok('a tile pressed goes into the hand in ember and no message is sent for it',
      tile(pair[0]).classList.contains('on') && tile(pair[0]).getAttribute('aria-pressed') === 'true'
      && sent.filter((m) => m.op === 'close').length === 0,
      board() + ' ' + sent.map((m) => m.op).join());
    const wantWith = (() => {
      const mv = engine.movesFor(engine.ALL, 12).filter((m) => m.indexOf(pair[0]) >= 0);
      let out = '';
      for (let t = 1; t <= engine.TILES; t++) {
        out += t === pair[0] ? 'h' : (mv.some((m) => m.indexOf(t) >= 0) ? 'o' : 'x');
      }
      return out;
    })();
    ok('with one tile in hand, only the tiles that can still finish THAT set stay pressable',
      board() === wantWith, board() + ' want ' + wantWith);
    ok('and with a full board every tile can still join SOME set that makes 12, so none is greyed',
      wantWith.indexOf('x') < 0, wantWith);
    mouseClick(tile(pair[0])); advance(5);
    ok('pressing it again takes it back out of the hand', board() === wantBoard(dealt), board());

    // --- completing the set closes it, and the next throw follows -------------------------------
    mouseClick(tile(pair[0])); advance(5);
    mouseClick(tile(pair[1])); advance(2);
    ok('the completing press sends the host the whole set, by tile number',
      JSON.stringify(sent.filter((m) => m.op === 'close').pop().tiles.slice().sort((a, b) => a - b))
        === JSON.stringify(pair.slice().sort((a, b) => a - b)),
      JSON.stringify(sent.filter((m) => m.op === 'close').pop()));

    const beat = {};
    for (let t = 0; t <= ROLL + 100; t++) {
      if (beat.shut == null && shut() !== '') beat.shut = t;
      if (beat.down == null && board().indexOf('.') >= 0) beat.down = t;
      advance(1);
    }
    const after = engine.act(dealt, { op: 'close', tiles: pair });
    ok('the tiles go down on the player’s own press, then the next throw arrives',
      R ? (beat.down <= 2) : (beat.shut === 0 && beat.down === CLOSE),
      'shut at ' + beat.shut + ' down at ' + beat.down);
    ok('the two tiles pressed are the two that are down, and the rest are the host’s own board',
      board() === wantBoard(after) && board().split('.').length - 1 === pair.length,
      board() + ' want ' + wantBoard(after));
    // greyed is not enough: a tile no set in `moves` can use is DISABLED, so anything the screen
    // still lets you press cannot come back refused. Measured on this board rather than on the full
    // one, because a full board can make every total two dice throw and greys nothing
    const want2 = wantBoard(after);
    ok('a tile no set on this throw can use is disabled and not merely dimmed',
      want2.indexOf('x') >= 0 && [...tiles()].every((t, i) => t.disabled === (want2[i] !== 'o')),
      [...tiles()].map((t) => t.disabled ? 'd' : '-').join('') + ' for ' + want2);
    ok('the dice carry the next throw and the line follows it down to what is left',
      dice() === after.dice.join(',') && line() === fmtRem(after),
      dice() + ' | ' + JSON.stringify(line()) + ' want ' + JSON.stringify(fmtRem(after)));
    ok('the close is read out with the tiles that came down and what is left',
      said().indexOf('Closed ' + pair.join(' and ')) === 0 && said().indexOf('left') > 0,
      JSON.stringify(said()));

    // --- a set the host would not take is refused, and nothing on the felt moves ---------------
    const standing = board();
    h.hostSend({ type: 'sx', op: 'close', tiles: [1, 2], n: 961 });
    advance(10);
    ok('a set that does not add up is refused in the engine’s own words',
      !$('sxErr').hidden && /add up to/.test($('sxErr').textContent), $('sxErr').textContent);
    ok('and the board did not move', board() === standing, board() + ' was ' + standing);

    // --- a round played out: the result chip is the host's row -----------------------------------
    let st = after, guard = 0;
    while (st.phase === 'play' && guard++ < 12) {
      const m = engine.movesFor(st.open, st.roll)[0];
      for (const t of m) { mouseClick(tile(t)); advance(5); }
      advance(CHIP + 200);
      st = engine.act(st, { op: 'close', tiles: m });
    }
    ok('a round can be played to the end with nothing but tiles', st.phase === 'done' && guard < 12,
      st.phase + ' after ' + guard + ' closes');
    const endRow = engine.rowFor(st.rem);
    ok('the result is the host’s own row, its own multiple and the credits it really paid',
      chip().indexOf(endRow ? endRow.name + ' ' + xOf(endRow.mult100) : 'Nothing') >= 0
      && chip().indexOf(st.net > 0 ? '+' : '−') >= 0
      && (!st.paid || line().indexOf(money(st.paid)) >= 0),
      chip() + ' | ' + line() + ' row ' + (endRow ? endRow.name : 'none') + ' paid ' + st.paid);
    ok('and the bet row is back, with the tiles standing again for the next round',
      !$('sxBet').hidden && !$('sxDeal').disabled, 'bet row hidden ' + $('sxBet').hidden);

    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
