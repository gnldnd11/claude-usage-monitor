// The wheel, end to end. The spins are found by searching the engine for a seed, so the segment the
// screen is checked against is the one the host will really stop on.
//
// Two claims this file exists for:
//  - WHILE THE ROUND IS LIVE THE SCREEN KNOWS NO SEGMENT. The host sends `stop: null` until the
//    wheel has turned, so there is nothing lit, nothing in the legend and no figure anywhere
//  - A BIG MULTIPLIER IS NEVER PARKED AT TWELVE O'CLOCK. Checked on all three wheels, because the
//    wild wheel's own first segment is its 20x and the pointer sits exactly there
'use strict';

module.exports = {
  id: 'wheel',
  modes: ['wheel', 'wheel-reduce', 'wheel-poor'],
  start: { 'wheel-poor': 5 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openGame, bodyTabs, ledgerBalance, hdrBal,
      active, activeName, mouseClick, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'wheel.js'));
    const R = MODE === 'wheel-reduce';
    const BET = 10;
    const sent = h.sent('wh');
    const SEG = 360 / engine.SLOTS;

    function whSeed(want, risk, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = engine.act(engine.newRound({ seed, id: 't', bet: BET }), { op: 'spin', risk });
        if (want(st)) { ext._test.setSeeds('wh', () => seed); return st; }
      }
      throw new Error('no wheel seed for ' + tag);
    }
    const face = () => $('whFace');
    const bg = () => face().style.background || '';
    const rot = () => { const m = /rotate\((-?[0-9.]+)deg\)/.exec(face().style.transform || ''); return m ? parseFloat(m[1]) : null; };
    const atTop = () => { const r = rot(); return r == null ? null : Math.round((((-r) % 360) + 360) % 360 / SEG) % engine.SLOTS; };
    const wedges = () => (bg().match(/deg [0-9.]+deg/g) || []).length;
    const layers = () => (bg().match(/conic-gradient/g) || []).length;
    const label = () => face().getAttribute('aria-label');
    const rows = () => doc.querySelectorAll('#whKey .wh-row').map((e) => e.textContent);
    const onRow = () => doc.querySelectorAll('#whKey .wh-row.on').map((e) => e.textContent).join(' | ');
    const line = () => $('whLine').textContent;
    const chip = () => { const c = doc.querySelector('#whLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const picks = () => doc.querySelectorAll('#whRiskBox button').map((b) => b.getAttribute('data-risk') + (b.classList.contains('on') ? '-on' : '')).join(' ');
    const said = () => $('whLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const settle = () => advance(1400);
    const xOf = (mult) => { const r = Math.round(mult * 100) / 100; return '×' + (r === Math.floor(r) ? money(r) : String(r)); };

    openGame('wheel');
    ok('the Wheel row opens the wheel and asks the host for its state',
      doc.body.classList.contains('game-wh') && $('panel-wheel').style.display === '' && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('the wheel is one circle of the host’s own twenty-eight segments, in one gradient',
      wedges() === engine.SLOTS && layers() === 1, wedges() + ' wedges in ' + layers() + ' layer(s)');
    ok('nothing is lit before a spin, and the wheel says so',
      layers() === 1 && label() === 'Mild wheel, 28 segments' && onRow() === '', label() + ' lit ' + JSON.stringify(onRow()));

    if (MODE === 'wheel-poor') {
      ok('not enough credits: chips off, Deal off, and the note says why',
        doc.querySelectorAll('#whStakes button').every((b) => b.disabled) && $('whDeal').disabled
        && !$('whNote').hidden && $('whNote').textContent === 'You need 10 credits to play.', $('whNote').textContent);
      return;
    }

    // --- a big multiplier is never under the pointer, on any of the three ---
    const parked = [];
    for (const w of engine.WHEEL_VIEWS) {
      mouseClick(doc.querySelector('#whRiskBox [data-risk="' + w.risk + '"]')); advance(5);
      const top = atTop();
      const min = Math.min.apply(null, w.segments);
      if (w.segments[top] !== min) parked.push(w.risk + ': segment ' + top + ' is ×' + w.segments[top] + ', the wheel\'s quietest is ×' + min);
    }
    ok('no wheel rests with anything but its quietest segment under the pointer', parked.length === 0, parked.join(' | '));
    ok('and the three wheels are the host’s own list', picks() === 'mild medium wild-on', picks());

    // --- the legend carries the figures, as exact counts and never as a percentage ---
    const wild = engine.WHEEL_VIEWS[2];
    const wantRows = wild.legend.filter((r) => r.mult).map((r) => '×' + money(r.mult) + r.chance.num + ' of ' + r.chance.den)
      .concat(['nothing' + wild.dead.num + ' of ' + wild.dead.den]);
    ok('the legend is the host’s own rows, as counts out of 28 and with no percentage anywhere',
      rows().join('|') === wantRows.join('|') && rows().every((t) => t.indexOf('%') < 0), rows().join('|'));

    mouseClick(doc.querySelector('#whRiskBox [data-risk="medium"]')); advance(5);

    // --- the bet goes on the table, and only then does the wheel turn ---
    const spun = whSeed((st) => st.mult >= 2, 'medium', 'wh-win-');
    doc.pressKey('Enter'); settle();
    ok('the bet is on the table: the pot shows it, Spin is the only button, the chips are gone',
      !$('whPlay').hidden && $('whBet').hidden && doc.querySelectorAll('#whPlay .bj-btn').length === 1
      && line().indexOf(String(BET)) >= 0 && active() === doc.querySelector('#whPlay [data-op="spin"]'),
      line() + ' focus ' + activeName());
    ok('a live round tells the screen NOTHING about where it will stop',
      layers() === 1 && label() === 'Medium wheel, 28 segments' && onRow() === '' && chip() === 'none',
      label() + ' layers ' + layers() + ' chip ' + chip());
    const before = rot();

    doc.pressKey('s'); advance(2);
    let chipAt = null, litAt = null, balAt = null;
    for (let t = 0; t <= 1200; t++) {
      if (litAt == null && layers() === 2) litAt = t;
      // the header balance at the moment the figure landed: the ledger is live in this harness
      if (chipAt == null && doc.querySelector('#whLine .bj-chip')) { chipAt = t; balAt = hdrBal(); }
      advance(1);
    }
    ok('the spin carried the chosen wheel to the host',
      sent.filter((m) => m.op === 'spin').pop().risk === 'medium', JSON.stringify(sent.filter((m) => m.op === 'spin').pop()));
    ok('the wheel turns whole turns and settles on the host’s own segment',
      atTop() === spun.stop && (R ? true : rot() < before - 360), 'top ' + atTop() + ' engine ' + spun.stop + ', ' + before + ' -> ' + rot());
    ok('the segment lights as the wheel stops and the figure follows at 960',
      R ? (litAt <= 2 && chipAt <= 2) : (litAt === 0 && chipAt === 960), 'lit ' + litAt + ' chip ' + chipAt);
    ok('the lit segment is the one the host stopped on, and the wheel names it',
      bg().indexOf('#e8895a ' + (spun.stop * SEG).toFixed(4) + 'deg') >= 0
      && label() === 'Stopped on segment ' + (spun.stop + 1) + ' of 28, ' + xOf(spun.mult), label());
    ok('the legend lights the row that just came up',
      onRow().indexOf('×' + money(spun.mult)) === 0, JSON.stringify(onRow()) + ' engine ×' + spun.mult);
    ok('the line is what was paid and the multiple the balance really moved by',
      line().indexOf(money(spun.pay)) >= 0 && chip() === 'bj-chip win ' + xOf(spun.mult), line() + ' | ' + chip());
    const wantSaid = 'Stopped on segment ' + (spun.stop + 1) + ' of 28, ' + xOf(spun.mult) + '. Pays '
      + money(spun.pay) + '. +' + money(spun.net) + '. Balance ' + balAt + '.';
    ok('the spin is read out with its segment and its net', said() === wantSaid,
      JSON.stringify(said()) + ' want ' + JSON.stringify(wantSaid));

    // --- switching wheels puts the lit segment away: a spin belongs to the wheel it was spun on ---
    const chipBefore = chip();
    mouseClick(doc.querySelector('#whRiskBox [data-risk="wild"]')); advance(5);
    ok('a different wheel shows no stopped segment, and the figure in the line is not touched',
      layers() === 1 && onRow() === '' && chip() === chipBefore, label() + ' | ' + chip() + ' was ' + chipBefore);
    mouseClick(doc.querySelector('#whRiskBox [data-risk="medium"]')); advance(5);

    // --- a dead segment is a loss, and it says so ---
    const dud = whSeed((st) => st.mult === 0, 'medium', 'wh-dud-');
    doc.pressKey('Enter'); settle();
    doc.pressKey('s'); settle();
    ok('a dead segment: the lose chip, the bet gone, and the wheel says nothing came up',
      chip() === 'bj-chip lose ×0' && label() === 'Stopped on segment ' + (dud.stop + 1) + ' of 28, nothing'
      && dud.net === -BET, chip() + ' | ' + label());

    // --- two rounds cannot be open at once, and a spin needs a round ---
    doc.pressKey('Enter'); advance(5);
    h.hostSend({ type: 'wh', op: 'deal', bet: BET, n: 971 });
    advance(10);
    ok('a second bet while one is on the table is refused',
      !$('whErr').hidden && /a round is already in progress/.test($('whErr').textContent), $('whErr').textContent);
    h.hostSend({ type: 'wh', op: 'spin', risk: 'nuclear', n: 972 });
    advance(10);
    ok('an unknown wheel is refused in the engine’s own words, and the round is untouched',
      /pick a wheel: mild, medium, wild/.test($('whErr').textContent) && layers() === 1 && !$('whPlay').hidden,
      $('whErr').textContent);
    doc.pressKey('s'); settle();

    // --- a reply with no state is a reason, not a blank wheel ---
    const heldRot = rot(), heldLayers = layers();
    h.intercept = (m) => {
      if (m.op !== 'deal') return false;
      h.intercept = null;
      later(1, () => toWebview({ type: 'wh', n: m.n, error: 'the wheel is stuck', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('Enter'); advance(10);
    ok('a reply with no state: the reason shows and the wheel does not move',
      !$('whErr').hidden && $('whErr').textContent.indexOf('the wheel is stuck') >= 0
      && rot() === heldRot && layers() === heldLayers, $('whErr').textContent + ' rot ' + rot());
    advance(5000);
    ok('a reply with no state hands the buttons back and starts no four-second timeout',
      $('whErr').textContent.indexOf('didn’t respond') < 0, $('whErr').textContent);

    // --- a broadcast is drawn where it stands ---
    const cast = engine.act(engine.newRound({ seed: 'wh-cast', id: 'c', bet: BET }), { op: 'spin', risk: 'mild' });
    toWebview({ type: 'wh', state: engine.view(cast, 1e9), balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once, with no turn animated',
      atTop() === cast.stop && !face().classList.contains('turning') && h.pending(50) === 0,
      'top ' + atTop() + ' engine ' + cast.stop + ' pending ' + h.pending(50));
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
