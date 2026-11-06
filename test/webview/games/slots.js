// The slot machine, end to end. Every situation (a jackpot, a paid pair, a miss) is made by
// searching the engine for a seed, never by faking a reply: what the screen is checked against is
// what the host will really deal.
'use strict';

module.exports = {
  id: 'slots',
  modes: ['slots', 'slots-reduce', 'slots-poor'],
  start: { 'slots-poor': 5 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openList, openGame, bodyTabs, ledgerBalance,
      hdrBal, active, activeName, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'slots.js'));
    const R = MODE === 'slots-reduce';
    const BET = 10;
    const sent = h.sent('sl');

    // The host's own spin, found by walking seeds. `want` is asked of the round the host will build
    function slSeed(want, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = engine.newRound({ seed, id: 't', bet: BET });
        if (want(st)) { ext._test.setSeeds('sl', () => seed); return st; }
      }
      throw new Error('no slots seed for ' + tag);
    }
    const reel = (r) => $('slR' + r);
    const cells = (r) => reel(r).querySelectorAll('.sy-cell');
    // what a cell is showing, read off the <use> the way a reader of the page would
    const symOf = (c) => { const u = c.querySelector('use'); const href = u ? u.getAttribute('href') : ''; return href.replace('#sy-', ''); };
    const row = (r) => [...cells(r)].map(symOf);
    const mid = (r) => symOf(cells(r)[1]);
    const label = (r) => cells(r)[1].getAttribute('aria-label');
    const spinning = (r) => reel(r).classList.contains('spin');
    const chip = () => { const c = doc.querySelector('#slLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const line = () => $('slLine').textContent;
    const lit = () => [0, 1, 2].filter((r) => cells(r)[1].classList.contains('hit')).join(',');
    const said = () => $('slLive').textContent;
    const chips = () => doc.querySelectorAll('#slStakes button').map((b) => b.getAttribute('data-v') + (b.disabled ? '-off' : '-on')).join(' ');
    const money = (n) => Math.round(n).toLocaleString('en-US');
    // the two symbols that do not take an 's' (games/slots/panel.js keeps the same pair)
    const plural = (sym) => ({ starfish: 'starfish', kelp: 'kelp' }[sym] || sym + 's');
    const settle = () => advance(1200);
    // the stop times, and the symbols each reel's window showed on the way there
    function spinAndWatch(ms) {
      const stops = [null, null, null], walk = [[], [], []];
      let chipAt = null, bal = null;
      for (let r = 0; r < 3; r++) walk[r].push(mid(r));
      for (let t = 0; t <= ms; t++) {
        for (let r = 0; r < 3; r++) {
          const s = mid(r);
          if (walk[r][walk[r].length - 1] !== s) walk[r].push(s);
          if (stops[r] == null && !spinning(r) && t > 0) stops[r] = t;
        }
        // the header balance at the moment the chip landed. The ledger is live in this harness and
        // keeps moving, so what the read-out said has to be judged against the figure it said it at
        if (chipAt == null && doc.querySelector('#slLine .bj-chip')) { chipAt = t; bal = hdrBal(); }
        advance(1);
      }
      return { stops, chip: chipAt, bal, walk };
    }

    openGame('slots');
    ok('the Slots row opens the machine and asks the host for its state',
      doc.body.classList.contains('game-sl') && $('panel-slots').style.display === '' && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('the plate is three reels of three 48px slate cells, and nothing else',
      [0, 1, 2].every((r) => cells(r).length === 3) && doc.querySelectorAll('#panel-slots .sy-cell').length === 9,
      doc.querySelectorAll('#panel-slots .sy-cell').length + ' cells');
    ok('the machine stands still before the first spin: the rings at rest, no result claimed',
      [0, 1, 2].every((r) => row(r).every((s) => engine.STRIPS[r].indexOf(s) >= 0)) && chip() === 'none',
      row(0).join('/') + ' | ' + row(1).join('/') + ' | ' + row(2).join('/') + ' chip ' + chip());

    if (MODE === 'slots-poor') {
      ok('not enough credits: chips off, Spin off, and the note says why',
        doc.querySelectorAll('#slStakes button').every((b) => b.disabled) && $('slDeal').disabled
        && !$('slNote').hidden && $('slNote').textContent === 'You need 10 credits to play.', $('slNote').textContent);
      return;
    }

    ok('betting: a dim pot preview of the stake, Spin ready and focused',
      doc.querySelector('#slLine .hl-pot.preview b').textContent === '10' && !$('slDeal').disabled && active() === $('slDeal'),
      line() + ' focus ' + activeName());

    // --- the paytable is folded away, and it is the host's six rows ---
    ok('the paytable is behind the ? toggle, closed', $('slPays').hidden && $('slWhy').getAttribute('aria-expanded') === 'false');
    $('slWhy').click(); advance(2);
    ok('opened, it is the host’s six rows and the kelp pair pays nothing',
      doc.querySelectorAll('#slPays .sl-pay').length === engine.PAYS.length + 1
      && doc.querySelectorAll('#slPays .sl-pay')[engine.PAYS.length].textContent.indexOf('0×') >= 0
      && !$('slPays').hidden && $('slWhy').getAttribute('aria-expanded') === 'true',
      doc.querySelectorAll('#slPays .sl-pay').length + ' rows, last ' + JSON.stringify(doc.querySelectorAll('#slPays .sl-pay')[engine.PAYS.length].textContent));
    $('slWhy').click(); advance(2);

    // --- three alike: the rings roll to the host's stop and the chip follows the last of them ---
    const jack = slSeed((st) => st.win.kind === 'three', 'sl-three-');
    doc.pressKey('Enter'); advance(2);
    const w = spinAndWatch(1100);
    ok('the reels stop 420, 620 and 840 in, and the chip lands at 940',
      R ? (w.stops.every((s) => s <= 2) && w.chip <= 2) : (w.stops.join() === '420,620,840' && w.chip === 940),
      'stops ' + w.stops.join() + ' chip ' + w.chip);
    ok('every reel came to rest on the host’s own three symbols',
      [0, 1, 2].every((r) => row(r).join() === [jack.win && engine.symAt(r, jack.stops[r] - 1), jack.syms[r], engine.symAt(r, jack.stops[r] + 1)].join()),
      [0, 1, 2].map((r) => row(r).join('/')).join(' | ') + ' engine ' + jack.syms.join('/'));
    ok('the pay line carries its own name, and the rows either side are art',
      [0, 1, 2].every((r) => label(r) === jack.syms[r])
      && [0, 1, 2].every((r) => cells(r)[0].getAttribute('aria-hidden') === 'true' && cells(r)[2].getAttribute('aria-hidden') === 'true'),
      [0, 1, 2].map(label).join('/'));
    ok('three alike: the jackpot chip carries the host’s net, and all three cells are ringed',
      chip() === 'bj-chip bj Three ' + plural(jack.win.sym) + ' +' + money(jack.net)
      && lit() === '0,1,2', chip() + ' lit ' + lit() + ' engine net ' + jack.net);
    ok('no box is drawn around the pay line: the carets mark it from outside the reels',
      doc.querySelectorAll('#panel-slots .sl-caret').length === 2 && doc.querySelectorAll('#panel-slots .sl-line-box').length === 0);
    const wantSaid = jack.syms.join(', ') + '. Three ' + plural(jack.win.sym) + ' +' + money(jack.net) + '. Balance ' + w.bal + '.';
    ok('the spin is read out: the three symbols, the verdict, the balance', said() === wantSaid,
      JSON.stringify(said()) + ' want ' + JSON.stringify(wantSaid));
    if (!R) {
      // the window walked the ring itself, rather than cutting to the answer: the symbols it showed
      // are the ring's own run up to the stop
      const n = Math.max(1, Math.round(420 / 70));
      const want = [];
      for (let k = 0; k <= n; k++) { const s = engine.symAt(0, jack.stops[0] - (n - k)); if (want[want.length - 1] !== s) want.push(s); }
      ok('reel 1 rolled the real ring to the real stop', w.walk[0].slice(-want.length).join() === want.join(),
        'showed ' + w.walk[0].join('>') + ' want ' + want.join('>'));
    }

    // --- a miss claims nothing: no chip, and the line goes back to the stake ---
    slSeed((st) => st.win.kind === 'none', 'sl-miss-');
    doc.pressKey('Enter'); settle();
    ok('a miss: no chip at all, the line is the next stake, and nothing is ringed',
      chip() === 'none' && !!doc.querySelector('#slLine .hl-pot.preview') && lit() === '', line() + ' lit ' + JSON.stringify(lit()));
    ok('a miss is still read out', /Nothing −/.test(said()), JSON.stringify(said()));

    // --- a paid pair is not a win: the bet comes back and the chip says so ---
    const pair = slSeed((st) => st.win.kind === 'pair', 'sl-pair-');
    doc.pressKey('Enter'); settle();
    ok('a paid pair: a plain chip saying the bet comes back, and only the two matched cells ringed',
      chip() === 'bj-chip Two ' + plural(pair.win.sym) + ', the bet comes back'
      && lit() === pair.win.reels.join(',') && pair.net === 0, chip() + ' lit ' + lit() + ' engine ' + pair.win.reels.join(','));

    // --- a reply with no state is a reason, not an empty machine ---
    const drawn = [0, 1, 2].map(row).map((x) => x.join()).join('|');
    h.intercept = (m) => {
      if (m.op !== 'deal') return false;
      h.intercept = null;
      later(1, () => toWebview({ type: 'sl', n: m.n, error: 'the machine jammed', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('Enter'); advance(10);
    ok('a reply with no state: the reason shows and the plate is left exactly as it was',
      !$('slErr').hidden && $('slErr').textContent.indexOf('the machine jammed') >= 0
      && [0, 1, 2].map(row).map((x) => x.join()).join('|') === drawn, $('slErr').textContent);
    advance(5000);
    ok('a reply with no state hands the buttons back and starts no four-second timeout',
      !$('slDeal').disabled && $('slErr').textContent.indexOf('didn’t respond') < 0, $('slErr').textContent);

    // --- the bet is refused on its own terms, and the plate does not move ---
    // The refusal comes back WITH the host's round attached, so this also pins down that a refused
    // spin is drawn where it stands: the pair is still on the plate and nothing rolled
    const before = [0, 1, 2].map(row).map((x) => x.join()).join('|');
    h.hostSend({ type: 'sl', op: 'deal', bet: 1, n: 999 });
    advance(10);
    ok('a bet under the minimum is refused and nothing on the plate moves',
      !$('slErr').hidden && /at least 10/.test($('slErr').textContent)
      && [0, 1, 2].map(row).map((x) => x.join()).join('|') === before
      && [0, 1, 2].every((r) => !spinning(r)), $('slErr').textContent + ' plate ' + [0, 1, 2].map((r) => row(r).join('/')).join('|'));

    // --- a reply nobody asked for is drawn where it stands ---
    // Pacing a broadcast would roll the same rings a second time, and the state it is pacing is one
    // this screen never asked about
    const broadcast = engine.view(engine.newRound({ seed: 'sl-cast', id: 'c', bet: BET }), 1e9);
    toWebview({ type: 'sl', state: broadcast, balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once, with no reels rolling',
      [0, 1, 2].every((r) => !spinning(r) && mid(r) === broadcast.reels[r].sym),
      [0, 1, 2].map(mid).join('/') + ' engine ' + broadcast.reels.map((x) => x.sym).join('/'));

    // --- the spin settles once, and the keys belong to this screen only ---
    const spins = sent.filter((m) => m.op === 'deal').length;
    openList(); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: Enter on the list does not spin', sent.filter((m) => m.op === 'deal').length === spins,
      spins + ' -> ' + sent.filter((m) => m.op === 'deal').length);
    openGame('slots');
    ok('back from the list: the host’s last spin is still what is drawn, and it is not re-rolled',
      [0, 1, 2].every((r) => !spinning(r)) && chip().indexOf('still') >= 0, chip());
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
