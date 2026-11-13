// The slot machine, end to end. Every situation (a jackpot, a paid pair, a miss) is made by
// searching the engine for a seed, never by faking a reply: what the screen is checked against is
// what the host will really deal.
//
// Two claims this file exists for, and they are the two the screen got wrong until 1.28.0:
//  - NOTHING IS RINGED UNTIL EVERY REEL HAS STOPPED. Each reel used to carry its own `hit` into its
//    own stop, so a three-alike spin ringed reel one 820ms before reel three stopped: the answer,
//    with two reels still turning. The first ring and the chip now land in the same millisecond
//  - A REEL CROSSES A REAL RUN OF ITS RING, in one transition, and the cell it lands on is the
//    host's own. The strip is checked symbol for symbol against engine.symAt(), and its length
//    against the stop time, because a reel that crossed six cells in 420ms never showed the player
//    the one crab on the ring at all
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
    // the plate's geometry, written here as the independent copy of games/slots/panel.js's: a cell
    // is 48 and the ring's pitch 52, the window is 112, and the strip sits so that cell `i` is on
    // the pay line at translateY(32 - 52i)
    const PITCH = 52, PARK = 32;
    // and the peak-speed rule the stop times are turned into distances by: 3,640px/s at the peak
    // over an easing whose peak is 2.573x its own average
    const cellsIn = (ms) => Math.round(3640 / 2.573 * (ms / 1000) / PITCH);

    // The host's own spin, found by walking seeds. `want` is asked of the round the host will build
    function slSeed(want, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = engine.newRound({ seed, id: 't', bet: BET });
        if (want(st)) { ext._test.setSeeds('sl', () => seed); return st; }
      }
      throw new Error('no slots seed for ' + tag);
    }
    const strip = (r) => $('slS' + r);
    const cells = (r) => strip(r).querySelectorAll('.sy-cell');
    // what a cell is showing, read off the <use> the way a reader of the page would
    const symOf = (c) => { const u = c.querySelector('use'); const href = u ? u.getAttribute('href') : ''; return href.replace('#sy-', ''); };
    const syms = (r) => cells(r).map(symOf);
    const offset = (r) => { const m = /translateY\((-?[0-9.]+)px\)/.exec(strip(r).style.transform || ''); return m ? parseFloat(m[1]) : null; };
    // which cell of the strip the window is over, which is the whole of where a reel is
    const centre = (r) => (PARK - offset(r)) / PITCH;
    const mid = (r) => symOf(cells(r)[centre(r)]);
    const label = (r) => cells(r)[centre(r)].getAttribute('aria-label');
    // the reel's own transition: its length is the reel's stop time, and no transition at all is a
    // reel standing still (games/slots/panel.js parks the strip with transition:none)
    const dur = (r) => { const m = /^transform (\d+)ms /.exec(strip(r).style.transition || ''); return m ? Number(m[1]) : null; };
    const rolling = (r) => dur(r) != null;
    const ease = (r) => strip(r).style.transition || '';
    const chip = () => { const c = doc.querySelector('#slLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const line = () => $('slLine').textContent;
    const lit = () => [0, 1, 2].filter((r) => cells(r)[centre(r)].classList.contains('hit')).join(',');
    const anyHit = () => doc.querySelectorAll('#panel-slots .sy-cell.hit').length;
    const said = () => $('slLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    // the two symbols that do not take an 's' (games/slots/panel.js keeps the same pair)
    const plural = (sym) => ({ starfish: 'starfish', kelp: 'kelp' }[sym] || sym + 's');
    const settle = () => advance(2000);
    // when the first ring went on, when the chip landed, and the balance it said it at
    function watch(ms) {
      let chipAt = null, litAt = null, bal = null;
      for (let t = 0; t <= ms; t++) {
        if (litAt == null && anyHit() > 0) litAt = t;
        // the header balance at the moment the chip landed. The ledger is live in this harness and
        // keeps moving, so what the read-out said has to be judged against the figure it said it at
        if (chipAt == null && doc.querySelector('#slLine .bj-chip')) { chipAt = t; bal = hdrBal(); }
        advance(1);
      }
      return { chip: chipAt, lit: litAt, bal };
    }
    // the run of ring a reel of this stop time crosses, as the engine would write it
    function ringRun(r, at, n) {
      const out = [];
      for (let i = 0; i <= n + 2; i++) out.push(engine.symAt(r, at - 1 + i));
      return out;
    }

    openGame('slots');
    ok('the Slots row opens the machine and asks the host for its state',
      doc.body.classList.contains('game-sl') && $('panel-slots').style.display === '' && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('the plate is three reels of three 48px slate cells, and nothing else',
      [0, 1, 2].every((r) => cells(r).length === 3) && doc.querySelectorAll('#panel-slots .sy-cell').length === 9,
      doc.querySelectorAll('#panel-slots .sy-cell').length + ' cells');
    // THE WINDOW IS A CROP, NOT A RESIZE (docs/game-panels.md, 5-4): 112px of the reel shows, the
    // pay line keeps its whole 48 and the rows either side show 28 each. The cell may not move off
    // 48, because that is the only size that makes the 24-unit symbol grid two whole pixels a unit
    ok('the reel window is 112px with the cell still 48, and the strip is parked on the pay line',
      /\.sl-reel\{[^}]*height:112px/.test(doc.querySelector('style').textContent)
      && /\.sy-cell\{[^}]*width:48px;height:48px/.test(doc.querySelector('style').textContent)
      && [0, 1, 2].every((r) => offset(r) === PARK - PITCH && centre(r) === 1),
      [0, 1, 2].map(offset).join('/'));
    ok('the machine stands still before the first spin: the rings at rest, no result claimed',
      [0, 1, 2].every((r) => !rolling(r) && syms(r).every((s) => engine.STRIPS[r].indexOf(s) >= 0)) && chip() === 'none',
      syms(0).join('/') + ' | ' + syms(1).join('/') + ' | ' + syms(2).join('/') + ' chip ' + chip());

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

    // --- a spin whose first two cells differ: the plain pacing, 520 / 880 / 1,340, chip at 1,460 ---
    // the gaps WIDEN (520 / 360 / 460). At the old 420 / 200 / 220 the last two were so nearly the
    // same length that all three reels landed as one event.
    // A paid pair that is NOT on the first two reels is the case that has both halves: the first
    // two cells differ, so the pacing is the plain one, and something is ringed at the end, so the
    // moment the rings go on can be measured at all
    const plain = slSeed((st) => st.win.kind === 'pair' && st.syms[0] !== st.syms[1], 'sl-plain-');
    doc.pressKey('Enter'); advance(2);
    if (!R) {
      ok('the three reels get one transition each, 520, 880 and 1,340 long, on the wheel’s own curve',
        [0, 1, 2].map(dur).join() === '520,880,1340'
        && [0, 1, 2].every((r) => ease(r).indexOf('cubic-bezier(.12,.01,.2,1)') > 0),
        [0, 1, 2].map(dur).join() + ' | ' + ease(0));
      // 14, 24 and 36 cells: one peak speed for all three, so the distance is proportional to the
      // time. Reel two crosses exactly one whole ring and reel three one and a half, which is what
      // makes the one crab on the ring something the player is shown rather than told about
      ok('and each crosses a run of its own ring as long as its time: 14, 24 and 36 cells',
        [0, 1, 2].map((r) => cells(r).length - 3).join() === '14,24,36'
        && [0, 1, 2].map((r) => cellsIn([520, 880, 1340][r])).join() === '14,24,36'
        && cells(1).length - 3 === engine.STRIP_LEN && cells(2).length - 3 === engine.STRIP_LEN * 1.5,
        [0, 1, 2].map((r) => cells(r).length - 3).join() + ' cells, ring ' + engine.STRIP_LEN);
      ok('the run is the ring’s own order, symbol for symbol, from the host’s own stop',
        [0, 1, 2].every((r) => syms(r).join() === ringRun(r, plain.stops[r], cells(r).length - 3).join()),
        syms(0).join('/') + ' want ' + ringRun(0, plain.stops[0], cells(0).length - 3).join('/'));
      ok('every reel is sliding to the one cell that is the host’s own frame, and lands parked on it',
        [0, 1, 2].every((r) => offset(r) === PARK - PITCH && mid(r) === plain.syms[r]),
        [0, 1, 2].map(mid).join('/') + ' engine ' + plain.syms.join('/'));
    }
    const wPlain = watch(1600);
    ok('the chip and the rings both land at 1,460, after the last reel and not with the first',
      R ? (wPlain.chip <= 2 && wPlain.lit <= 2) : (wPlain.chip === 1460 && wPlain.lit === 1460),
      'chip ' + wPlain.chip + ' first ring ' + wPlain.lit);
    ok('and the plate is back to its three cells a reel, parked, with only the matched ones ringed',
      [0, 1, 2].every((r) => !rolling(r) && cells(r).length === 3 && offset(r) === PARK - PITCH)
      && lit() === plain.win.reels.join(','), lit() + ' engine ' + plain.win.reels.join(','));

    // --- a miss claims nothing: no chip, and the line goes back to the stake ---
    slSeed((st) => st.win.kind === 'none', 'sl-miss-');
    doc.pressKey('Enter'); settle();
    ok('a miss: no chip at all, the line is the next stake, nothing is ringed and nothing is rolling',
      chip() === 'none' && !!doc.querySelector('#slLine .hl-pot.preview') && lit() === ''
      && [0, 1, 2].every((r) => !rolling(r) && cells(r).length === 3), line() + ' lit ' + JSON.stringify(lit()));
    ok('a miss is still read out', /Nothing −/.test(said()), JSON.stringify(said()));

    // --- three alike. Two cells matching holds the third reel back, so this is the long pacing ---
    const jack = slSeed((st) => st.win.kind === 'three', 'sl-three-');
    doc.pressKey('Enter'); advance(2);
    if (!R) {
      ok('two cells alike hold the third reel to 1,640: the first two are unchanged',
        [0, 1, 2].map(dur).join() === '520,880,1640' && cells(2).length - 3 === cellsIn(1640),
        [0, 1, 2].map(dur).join() + ' | ' + (cells(2).length - 3) + ' cells');
    }
    const w = watch(1900);
    // THE CLAIM THIS FILE EXISTS FOR. Reel one stops at 520 and used to be ringed there, which is
    // the answer 1,120ms before the third reel stops. The first ring is the chip's own moment
    ok('nothing is ringed while a reel is still rolling: the first ring is the chip’s own moment',
      R ? (w.lit <= 2 && w.chip <= 2) : (w.lit === 1760 && w.chip === 1760), 'first ring ' + w.lit + ' chip ' + w.chip);
    ok('every reel came to rest on the host’s own three symbols',
      [0, 1, 2].every((r) => syms(r).join() === [engine.symAt(r, jack.stops[r] - 1), jack.syms[r], engine.symAt(r, jack.stops[r] + 1)].join()),
      [0, 1, 2].map((r) => syms(r).join('/')).join(' | ') + ' engine ' + jack.syms.join('/'));
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

    // --- the third reel is held back by the two cells on the SCREEN, not by st.win ---
    // A kelp pair is the case that separates the two: two kelp on the line is plainly a pair to
    // look at, and winOf() returns it as NO_WIN because kelp pays nothing for two. Reading st.win
    // would both miss this and be the third cell read early
    const kelp = slSeed((st) => st.syms[0] === 'kelp' && st.syms[1] === 'kelp' && st.syms[2] !== 'kelp', 'sl-kelp-');
    doc.pressKey('Enter'); advance(2);
    if (!R) {
      ok('a kelp pair holds the third reel too, though the host calls it no win at all',
        dur(2) === 1640 && kelp.win.kind === 'none' && kelp.net === -BET,
        dur(2) + 'ms, host says ' + kelp.win.kind);
    }
    settle();
    ok('and it still ends as a miss: no chip, nothing ringed',
      chip() === 'none' && lit() === '', chip() + ' lit ' + JSON.stringify(lit()));

    // --- a paid pair is not a win: the bet comes back and the chip says so ---
    const pair = slSeed((st) => st.win.kind === 'pair', 'sl-pair-');
    doc.pressKey('Enter'); settle();
    ok('a paid pair: a plain chip saying the bet comes back, and only the two matched cells ringed',
      chip() === 'bj-chip Two ' + plural(pair.win.sym) + ', the bet comes back'
      && lit() === pair.win.reels.join(',') && pair.net === 0, chip() + ' lit ' + lit() + ' engine ' + pair.win.reels.join(','));

    // --- a reply with no state is a reason, not an empty machine ---
    const drawn = [0, 1, 2].map(syms).map((x) => x.join()).join('|');
    h.intercept = (m) => {
      if (m.op !== 'deal') return false;
      h.intercept = null;
      later(1, () => toWebview({ type: 'sl', n: m.n, error: 'the machine jammed', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('Enter'); advance(10);
    ok('a reply with no state: the reason shows and the plate is left exactly as it was',
      !$('slErr').hidden && $('slErr').textContent.indexOf('the machine jammed') >= 0
      && [0, 1, 2].map(syms).map((x) => x.join()).join('|') === drawn, $('slErr').textContent);
    advance(5000);
    ok('a reply with no state hands the buttons back and starts no four-second timeout',
      !$('slDeal').disabled && $('slErr').textContent.indexOf('didn’t respond') < 0, $('slErr').textContent);

    // --- the bet is refused on its own terms, and the plate does not move ---
    // The refusal comes back WITH the host's round attached, so this also pins down that a refused
    // spin is drawn where it stands: the pair is still on the plate and nothing rolled
    const before = [0, 1, 2].map(syms).map((x) => x.join()).join('|');
    h.hostSend({ type: 'sl', op: 'deal', bet: 1, n: 999 });
    advance(10);
    ok('a bet under the minimum is refused and nothing on the plate moves',
      !$('slErr').hidden && /at least 10/.test($('slErr').textContent)
      && [0, 1, 2].map(syms).map((x) => x.join()).join('|') === before
      && [0, 1, 2].every((r) => !rolling(r)), $('slErr').textContent + ' plate ' + [0, 1, 2].map((r) => syms(r).join('/')).join('|'));

    // --- a reply nobody asked for is drawn where it stands ---
    // Pacing a broadcast would roll the same rings a second time, and the state it is pacing is one
    // this screen never asked about
    const broadcast = engine.view(engine.newRound({ seed: 'sl-cast', id: 'c', bet: BET }), 1e9);
    toWebview({ type: 'sl', state: broadcast, balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once, with no reels rolling',
      [0, 1, 2].every((r) => !rolling(r) && cells(r).length === 3 && mid(r) === broadcast.reels[r].sym),
      [0, 1, 2].map(mid).join('/') + ' engine ' + broadcast.reels.map((x) => x.sym).join('/'));

    // --- the spin settles once, and the keys belong to this screen only ---
    const spins = sent.filter((m) => m.op === 'deal').length;
    openList(); doc.pressKey('Enter', { target: doc.body }); advance(5);
    ok('guard: Enter on the list does not spin', sent.filter((m) => m.op === 'deal').length === spins,
      spins + ' -> ' + sent.filter((m) => m.op === 'deal').length);
    openGame('slots');
    ok('back from the list: the host’s last spin is still what is drawn, and it is not re-rolled',
      [0, 1, 2].every((r) => !rolling(r)) && chip().indexOf('still') >= 0, chip());
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
