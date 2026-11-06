// The wheel, end to end. The spins are found by searching the engine for a seed, so the slice the
// screen is checked against is the one the host will really stop on.
//
// Four claims this file exists for:
//  - WHILE THE ROUND IS LIVE THE SCREEN KNOWS NO SLICE. The host sends `stop: null` until the wheel
//    has turned, so there is nothing lit, nothing in the legend and no figure anywhere
//  - THE FIGURES ON THE DIAL ARE THE HOST'S OWN, at the host's own angles. The panel is checked
//    against `WHEEL_VIEWS` label for label and degree for degree, because a screen that worked out
//    its own angles would be a second copy of the wheel
//  - THE STOPPED SLICE'S FIGURE IS UPRIGHT. That is the whole reason the labels lie along the arc,
//    so it is measured rather than described: the wheel's rotation and the slice's own angle must
//    cancel to zero
//  - A BIG MULTIPLIER IS NEVER PARKED AT TWELVE O'CLOCK. Checked on all three wheels
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
    const viewOf = (risk) => engine.WHEEL_VIEWS[engine.RISKS.indexOf(risk)];

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
    // which slice of `risk` the pointer is over: the wheel is turned by minus that slice's own
    // middle, so the angle left at twelve o'clock IS a middle, exactly (every angle is whole)
    const midAtTop = () => { const r = rot(); return r == null ? null : (((-r) % 360) + 360) % 360; };
    const atTop = (risk) => {
      const segs = viewOf(risk).segments, m = midAtTop();
      for (let i = 0; i < segs.length; i++) if (segs[i].mid === m) return i;
      return -1;
    };
    const wedges = () => (bg().match(/deg [0-9.]+deg/g) || []).length;
    const layers = () => (bg().match(/conic-gradient/g) || []).length;
    // Every gradient must start at zero. The host's angles are ABSOLUTE, and the figure on a slice
    // is laid at that slice's own `mid`, so a gradient that started anywhere else would slide every
    // wedge out from under its own figure while every other check still passed
    const origins = () => (bg().match(/conic-gradient\(from [^,]+,/g) || []);
    const zeroed = () => origins().length > 0 && origins().every((s) => s === 'conic-gradient(from 0deg,');
    const label = () => face().getAttribute('aria-label');
    const nums = () => doc.querySelectorAll('#whNums .wh-num').map((e) => e.textContent);
    const numAngles = () => doc.querySelectorAll('#whNums .wh-num').map((e) => {
      const m = /rotate\((-?[0-9.]+)deg\)/.exec(e.style.transform || ''); return m ? parseFloat(m[1]) : null;
    });
    const litNum = () => doc.querySelectorAll('#whNums .wh-num.on').map((e) => e.textContent).join(' | ');
    const rows = () => doc.querySelectorAll('#whKey .wh-row').map((e) => e.textContent);
    const onRow = () => doc.querySelectorAll('#whKey .wh-row.on').map((e) => e.textContent).join(' | ');
    const line = () => $('whLine').textContent;
    const chip = () => { const c = doc.querySelector('#whLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const picks = () => doc.querySelectorAll('#whRiskBox button').map((b) => b.getAttribute('data-risk') + (b.classList.contains('on') ? '-on' : '')).join(' ');
    const said = () => $('whLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const settle = () => advance(1400);

    openGame('wheel');
    ok('the Wheel row opens the wheel and asks the host for its state',
      doc.body.classList.contains('game-wh') && $('panel-wheel').style.display === '' && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());

    const mild = viewOf('mild');
    ok('the wheel is one circle of the host’s own slices, in one gradient, laid from zero',
      wedges() === mild.segments.length && layers() === 1 && zeroed(),
      wedges() + ' wedges in ' + layers() + ' layer(s) at ' + origins().join(' '));
    ok('nothing is lit before a spin, and the wheel says so',
      layers() === 1 && label() === 'Mild wheel, ' + mild.segments.length + ' slices' && onRow() === '' && litNum() === '',
      label() + ' lit ' + JSON.stringify(onRow() + litNum()));

    if (MODE === 'wheel-poor') {
      ok('not enough credits: chips off, Deal off, and the note says why',
        doc.querySelectorAll('#whStakes button').every((b) => b.disabled) && $('whDeal').disabled
        && !$('whNote').hidden && $('whNote').textContent === 'You need 10 credits to play.', $('whNote').textContent);
      return;
    }

    // --- the figures are on the dial, and they are the host's own, at the host's own angles ---
    ok('every slice carries the host’s own figure, in the host’s own order',
      nums().join('|') === mild.segments.map((s) => s.label).join('|'),
      nums().join('|') + ' want ' + mild.segments.map((s) => s.label).join('|'));
    ok('and each figure is laid at the middle of its own slice, an angle the screen never works out',
      numAngles().join('|') === mild.segments.map((s) => s.mid).join('|'),
      numAngles().join('|') + ' want ' + mild.segments.map((s) => s.mid).join('|'));
    ok('a dividing slice is on the dial, written as a divide and not as a decimal',
      nums().indexOf('÷2') >= 0 && nums().every((t) => t.indexOf('0.5') < 0), nums().join('|'));

    // --- a big multiplier is never under the pointer, on any of the three ---
    const parked = [];
    for (const w of engine.WHEEL_VIEWS) {
      mouseClick(doc.querySelector('#whRiskBox [data-risk="' + w.risk + '"]')); advance(5);
      const top = atTop(w.risk);
      let min = Infinity;
      for (const s of w.segments) if (s.halves < min) min = s.halves;
      if (top < 0) parked.push(w.risk + ': the pointer is not over any slice (' + midAtTop() + 'deg)');
      else if (w.segments[top].halves !== min) {
        parked.push(w.risk + ': slice ' + top + ' is ' + w.segments[top].label + ', the wheel\'s quietest is ' + engine.labelOf(min));
      }
    }
    ok('no wheel rests with anything but its quietest slice under the pointer', parked.length === 0, parked.join(' | '));
    ok('and the three wheels are the host’s own list', picks() === 'mild medium wild-on', picks());

    // --- the legend is now the other half of the question: how much of the dial pays what ---
    const wild = viewOf('wild');
    const wantRows = wild.legend.map((r) => (r.halves ? r.label : 'nothing') + r.chance.num + ' of ' + r.chance.den);
    ok('the legend is the host’s own rows, as units out of ' + engine.UNITS + ' and with no percentage anywhere',
      rows().join('|') === wantRows.join('|') && rows().every((t) => t.indexOf('%') < 0), rows().join('|'));
    ok('the dial and the legend carry the same figures, so neither invented one',
      wild.segments.every((s) => nums().indexOf(s.label) >= 0) && nums().length === wild.segments.length,
      nums().join('|') + ' vs ' + wantRows.join('|'));

    mouseClick(doc.querySelector('#whRiskBox [data-risk="medium"]')); advance(5);
    const medium = viewOf('medium');

    // --- the bet goes on the table, and only then does the wheel turn ---
    const spun = whSeed((st) => st.halves >= 4, 'medium', 'wh-win-');
    const spunLabel = engine.labelOf(spun.halves);
    doc.pressKey('Enter'); settle();
    ok('the bet is on the table: the pot shows it, Spin is the only button, the chips are gone',
      !$('whPlay').hidden && $('whBet').hidden && doc.querySelectorAll('#whPlay .bj-btn').length === 1
      && line().indexOf(String(BET)) >= 0 && active() === doc.querySelector('#whPlay [data-op="spin"]'),
      line() + ' focus ' + activeName());
    ok('a live round tells the screen NOTHING about where it will stop',
      layers() === 1 && label() === 'Medium wheel, ' + medium.segments.length + ' slices'
      && onRow() === '' && litNum() === '' && chip() === 'none',
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
    ok('the wheel turns whole turns and settles on the host’s own slice',
      atTop('medium') === spun.stop && (R ? true : rot() < before - 360),
      'top ' + atTop('medium') + ' engine ' + spun.stop + ', ' + before + ' -> ' + rot());
    const hit = medium.segments[spun.stop];
    ok('the slice lights as the wheel stops and the figure follows at 960',
      R ? (litAt <= 2 && chipAt <= 2) : (litAt === 0 && chipAt === 960), 'lit ' + litAt + ' chip ' + chipAt);
    ok('the lit slice is the one the host stopped on, over the host’s own arc, and the wheel names it',
      bg().indexOf('#e8895a ' + hit.from + 'deg ' + (hit.from + hit.span) + 'deg') >= 0 && zeroed()
      && label() === 'Stopped on slice ' + (spun.stop + 1) + ' of ' + medium.segments.length + ', ' + spunLabel,
      label() + ' at ' + origins().join(' '));
    // the claim the arc-laid labels exist for: the wheel is turned by -mid and the label is laid at
    // +mid, so the figure anyone is actually reading stands upright
    ok('the figure on the stopped slice is upright, because the two rotations cancel',
      (((rot() + hit.mid) % 360) + 360) % 360 === 0 && litNum() === spunLabel,
      'face ' + rot() + ' + slice ' + hit.mid + ', lit ' + JSON.stringify(litNum()));
    ok('the legend lights the row that just came up',
      onRow().indexOf(spunLabel) === 0, JSON.stringify(onRow()) + ' engine ' + spunLabel);
    ok('the line is what was paid and the figure the balance really moved by',
      line().indexOf(money(spun.pay)) >= 0 && chip() === 'bj-chip win ' + spunLabel, line() + ' | ' + chip());
    const wantSaid = 'Stopped on slice ' + (spun.stop + 1) + ' of ' + medium.segments.length + ', ' + spunLabel
      + '. Pays ' + money(spun.pay) + '. +' + money(spun.net) + '. Balance ' + balAt + '.';
    ok('the spin is read out with its slice and its net', said() === wantSaid,
      JSON.stringify(said()) + ' want ' + JSON.stringify(wantSaid));

    // --- switching wheels puts the lit slice away: a spin belongs to the wheel it was spun on ---
    const chipBefore = chip();
    mouseClick(doc.querySelector('#whRiskBox [data-risk="wild"]')); advance(5);
    ok('a different wheel shows no stopped slice, draws its own figures, and does not touch the line',
      layers() === 1 && onRow() === '' && litNum() === '' && chip() === chipBefore
      && nums().join('|') === wild.segments.map((s) => s.label).join('|'),
      label() + ' | ' + chip() + ' was ' + chipBefore + ' | ' + nums().join('|'));
    mouseClick(doc.querySelector('#whRiskBox [data-risk="medium"]')); advance(5);

    // --- a dead slice is a loss, and it says so ---
    const dud = whSeed((st) => st.halves === 0, 'medium', 'wh-dud-');
    doc.pressKey('Enter'); settle();
    doc.pressKey('s'); settle();
    ok('a dead slice: the lose chip, the bet gone, and the wheel says nothing came up',
      chip() === 'bj-chip lose ×0'
      && label() === 'Stopped on slice ' + (dud.stop + 1) + ' of ' + medium.segments.length + ', nothing'
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

    // --- a bet the halves do not divide never reaches the felt, but the host still answers it ---
    h.hostSend({ type: 'wh', op: 'deal', bet: 11, n: 973 });
    advance(10);
    ok('an odd bet is refused in the engine’s own words',
      /steps of 2/.test($('whErr').textContent), $('whErr').textContent);

    // --- a reply with no state is a reason, not a blank wheel ---
    const heldRot = rot(), heldLayers = layers(), heldNums = nums().join('|');
    h.intercept = (m) => {
      if (m.op !== 'deal') return false;
      h.intercept = null;
      later(1, () => toWebview({ type: 'wh', n: m.n, error: 'the wheel is stuck', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('Enter'); advance(10);
    ok('a reply with no state: the reason shows and the wheel does not move',
      !$('whErr').hidden && $('whErr').textContent.indexOf('the wheel is stuck') >= 0
      && rot() === heldRot && layers() === heldLayers && nums().join('|') === heldNums,
      $('whErr').textContent + ' rot ' + rot());
    advance(5000);
    ok('a reply with no state hands the buttons back and starts no four-second timeout',
      $('whErr').textContent.indexOf('didn’t respond') < 0, $('whErr').textContent);

    // --- a broadcast is drawn where it stands ---
    const cast = engine.act(engine.newRound({ seed: 'wh-cast', id: 'c', bet: BET }), { op: 'spin', risk: 'mild' });
    toWebview({ type: 'wh', state: engine.view(cast, 1e9), balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once, with no turn animated',
      atTop('mild') === cast.stop && !face().classList.contains('turning') && h.pending(50) === 0,
      'top ' + atTop('mild') + ' engine ' + cast.stop + ' pending ' + h.pending(50));
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
