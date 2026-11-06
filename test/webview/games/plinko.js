// The plinko board, end to end. The drops are found by searching the engine for a seed, so the walk
// the screen is checked against is the walk the host will really deal.
//
// The claim this file exists for: THE BEAD GOES WHERE THE HOST SAYS IT WENT. Every one of the twelve
// bounces is checked against `path`, and the place it comes to rest is checked against `bin`, because
// a screen that animates a fall and then prints a cup it did not fall into is the one bug a board
// like this can have.
'use strict';

module.exports = {
  id: 'plinko',
  modes: ['plinko', 'plinko-reduce', 'plinko-poor'],
  start: { 'plinko-poor': 5 },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openGame, bodyTabs, ledgerBalance, hdrBal,
      active, activeName, mouseClick, toWebview, errors, ext, EXT, path } = h;

    const engine = require(path.join(EXT, 'plinko.js'));
    const R = MODE === 'plinko-reduce';
    const BET = 10;
    const sent = h.sent('pl');
    const STEP = 10, HALF = 5, ROWH = 7, DROP = 105;   // the board's geometry (games/plinko/panel.js)
    // The bead's timetable, written out here rather than imported: a panel is webview-side. Row k
    // waits 140 - 6k, so bounce k lands on the sum of the k+1 waits before it. The claim this file
    // makes about it is that the WAITS CLOSE UP, which is what acceleration looks like on a board
    // drawn in gaps rather than in pixels (docs/game-panels.md, 5-6)
    const ROW0 = 140, SLOPE = 6;
    const bounceAt = (k) => (k + 1) * ROW0 - SLOPE * k * (k + 1) / 2;
    const CHIP = 1584;   // 1,284 of pins, 180 to settle into the cup, 120 for the figure

    function plSeed(want, risk, tag) {
      for (let i = 0; i < 40000; i++) {
        const seed = tag + i;
        const st = engine.newRound({ seed, id: 't', bet: BET, risk });
        if (want(st)) { ext._test.setSeeds('pl', () => seed); return st; }
      }
      throw new Error('no plinko seed for ' + tag);
    }
    const bead = () => $('plBead');
    const at = () => bead().style.transform || '';
    const cups = () => doc.querySelectorAll('#plCups .pl-cup');
    const ringed = () => [...cups()].findIndex((c) => c.classList.contains('hit'));
    const flag = () => { const c = doc.querySelector('#plFlag .bj-chip'); return c ? c.textContent : null; };
    const flagCol = () => { const c = doc.querySelector('#plFlag .bj-chip'); return c ? (c.getAttribute('style') || '') : ''; };
    const line = () => $('plLine').textContent;
    const chip = () => { const c = doc.querySelector('#plLine .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const risks = () => doc.querySelectorAll('#plRiskBox button').map((b) => b.getAttribute('data-risk') + (b.classList.contains('on') ? '-on' : '')).join(' ');
    const shades = () => [...cups()].map((c) => (c.getAttribute('style') || '').replace(/[^0-9.,]/g, '')).join('|');
    const said = () => $('plLive').textContent;
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const settle = () => advance(1200);
    const xOf = (mult) => { const r = Math.round(mult * 100) / 100; return '×' + (r === Math.floor(r) ? money(r) : String(r)); };
    const tr = (x, y) => 'translate(' + x + 'px,' + y + 'px)';

    openGame('plinko');
    ok('the Plinko row opens the board and asks the host for its state',
      doc.body.classList.contains('game-pl') && $('panel-plinko').style.display === '' && sent.map((m) => m.op).join() === 'open',
      bodyTabs() + ' ' + sent.map((m) => m.op).join());
    ok('a Galton board: twelve rows of pins leaving thirteen cups, and one bead at the apex',
      doc.querySelectorAll('#panel-plinko .pl-pin').length === 78 && cups().length === engine.BINS && at() === tr(0, 0),
      doc.querySelectorAll('#panel-plinko .pl-pin').length + ' pins, ' + cups().length + ' cups, bead ' + at());
    ok('THE CUPS CARRY NO NUMBERS: not one of the thirteen holds any text',
      [...cups()].every((c) => c.textContent === '') && flag() === null, [...cups()].map((c) => c.textContent).join('|'));

    if (MODE === 'plinko-poor') {
      ok('not enough credits: chips off, Drop off, and the note says why',
        doc.querySelectorAll('#plStakes button').every((b) => b.disabled) && $('plDeal').disabled
        && !$('plNote').hidden && $('plNote').textContent === 'You need 10 credits to play.', $('plNote').textContent);
      return;
    }

    ok('the three boards are the host’s own list, with the first one chosen',
      risks() === engine.RISK_KEYS.map((k, i) => k + (i === 0 ? '-on' : '')).join(' '), risks());
    ok('betting: a dim pot preview, Drop ready and focused',
      doc.querySelector('#plLine .hl-pot.preview b').textContent === '10' && !$('plDeal').disabled && active() === $('plDeal'),
      line() + ' focus ' + activeName());

    // --- the chosen board is what the cups are drawn from, and the choice is the host's ---
    const mildShades = shades();
    mouseClick(doc.querySelector('#plRiskBox [data-risk="spicy"]')); advance(5);
    ok('choosing a board redraws the cups under it and remembers the choice',
      risks() === 'mild medium spicy-on' && shades() !== mildShades, risks());
    ok('a deeper cup is the one that pays more, on the host’s own figures',
      deepeningMatches('spicy'), shades());
    function deepeningMatches(key) {
      const nums = engine.RISKS[key].nums;
      const a = [...cups()].map((c) => parseFloat((c.getAttribute('style') || '').match(/,([0-9.]+)\)/)[1]));
      for (let i = 0; i < nums.length; i++) {
        for (let j = 0; j < nums.length; j++) {
          if (nums[i] > nums[j] && !(a[i] > a[j])) return false;
          if (nums[i] === nums[j] && a[i] !== a[j]) return false;
        }
      }
      return true;
    }
    mouseClick(doc.querySelector('#plRiskBox [data-risk="medium"]')); advance(5);

    // --- the paytable is the chosen board, from the middle out, folded away ---
    $('plWhy').click(); advance(2);
    ok('the paytable is behind the ? toggle: seven cups from the middle out, with the host’s counts',
      !$('plPays').hidden && doc.querySelectorAll('#plPays .pl-pay').length === 8
      && doc.querySelectorAll('#plPays .pl-pay')[7].textContent === 'edge' + xOf(engine.RISKS.medium.mults[12]) + money(engine.WAYS[12]),
      doc.querySelectorAll('#plPays .pl-pay')[7].textContent);
    $('plWhy').click(); advance(2);

    // --- a drop: twelve bounces, the host's own ---
    // A walk that ends off-centre, so a bead drawn down the middle would be caught
    const drop = plSeed((st) => Math.abs(st.bin - 6) >= 3, 'medium', 'pl-off-');
    ok('the drop is sent with the chosen board', true, 'risk medium, bin ' + drop.bin);
    doc.pressKey('Enter'); advance(2);
    const moves = [];
    let flagAt = null, chipAt = null, balAt = null;
    for (let t = 0; t <= CHIP + 200; t++) {
      const now = at();
      if (!moves.length || moves[moves.length - 1].at !== now) moves.push({ at: now, t });
      if (flagAt == null && flag() !== null) flagAt = t;
      // the header balance at the moment the figure landed. The ledger is live in this harness and
      // keeps moving, so what the read-out said has to be judged against the figure it said it at
      if (chipAt == null && doc.querySelector('#plLine .bj-chip')) { chipAt = t; balAt = hdrBal(); }
      advance(1);
    }
    ok('the deal carried the chosen board to the host',
      sent.filter((m) => m.op === 'deal').pop().risk === 'medium', JSON.stringify(sent.filter((m) => m.op === 'deal').pop()));
    // the twelve positions the host's own path puts the bead in
    const want = [];
    let off = 0;
    for (let k = 0; k < drop.path.length; k++) {
      off += drop.path[k] ? 1 : -1;
      want.push({ at: tr(off * HALF, k === drop.path.length - 1 ? DROP : (k + 1) * ROWH), t: bounceAt(k) });
    }
    ok('the bead takes the host’s own twelve bounces, on the board’s own timetable',
      R ? at() === tr(off * HALF, DROP) : moves.slice(1).map((m) => m.at + '@' + m.t).join() === want.map((m) => m.at + '@' + m.t).join(),
      R ? at() : moves.slice(1).map((m) => m.at + '@' + m.t).join());
    // THE GAP BETWEEN TWO BOUNCES IS SHORTER THAN THE ONE BEFORE IT. Equal gaps were the old board
    // and were the whole of "it ends too fast": a bead that covers one row of pins in the same time
    // at the top and at the bottom is not falling, it is sliding
    const gaps = moves.slice(1).map((m, i, a) => m.t - (i ? a[i - 1].t : 0));
    ok('the gaps close up as it falls, and not one of them is under the 70ms a bounce needs',
      R ? moves.length <= 2 : (gaps.length === 12 && gaps[0] === 140 && gaps[11] === 74
        && gaps.every((g, i) => g >= 70 && (i === 0 || g < gaps[i - 1]))),
      gaps.join(' '));
    ok('it comes to rest over the cup the host says it fell into',
      at() === tr((drop.bin - 6) * STEP, DROP) && off * HALF === (drop.bin - 6) * STEP,
      at() + ' bin ' + drop.bin);
    ok('the figure follows the bead into the cup at ' + CHIP + ', not before',
      R ? (flagAt <= 2 && chipAt <= 2) : (flagAt === CHIP && chipAt === CHIP), 'flag ' + flagAt + ' chip ' + chipAt);
    const mult = xOf(drop.pay / drop.bet);
    ok('exactly one cup is ringed, and one figure sits over that cup',
      ringed() === drop.bin && doc.querySelectorAll('#plFlag .bj-chip').length === 1
      && flag() === mult && flagCol().indexOf('grid-column:' + (drop.bin + 1)) >= 0,
      'ringed ' + ringed() + ' flag ' + flag() + ' style ' + flagCol() + ' bin ' + drop.bin);
    ok('the line is what was paid and the multiple the balance really moved by',
      line().indexOf(money(drop.pay)) >= 0 && chip().indexOf(mult) >= 0, line() + ' | ' + chip());
    const wantSaid = 'Cup ' + (drop.bin + 1) + ' of ' + engine.BINS + '. ' + mult + ', pays '
      + money(drop.pay) + '. ' + (drop.net > 0 ? '+' : drop.net < 0 ? '−' : '') + money(Math.abs(drop.net)) + '. Balance ' + balAt + '.';
    ok('the drop is read out with its cup and its net', said() === wantSaid,
      JSON.stringify(said()) + ' want ' + JSON.stringify(wantSaid));

    // --- a risk the board does not have is refused before anything is staked ---
    const purse = ledgerBalance();
    h.hostSend({ type: 'pl', op: 'deal', bet: BET, risk: 'nuclear', n: 981 });
    advance(10);
    ok('an unknown board is refused in the engine’s own words, and nothing is staked for it',
      !$('plErr').hidden && /pick a risk: mild, medium, spicy/.test($('plErr').textContent) && ledgerBalance() === purse,
      $('plErr').textContent + ' purse ' + purse + ' -> ' + ledgerBalance());
    ok('and the board did not move', at() === tr((drop.bin - 6) * STEP, DROP) && ringed() === drop.bin, at());

    // --- a reply with no state is a reason, not an empty board ---
    h.intercept = (m) => {
      if (m.op !== 'deal') return false;
      h.intercept = null;
      later(1, () => toWebview({ type: 'pl', n: m.n, error: 'the board jammed', balance: ledgerBalance(), free: ledgerBalance() }));
      return true;
    };
    doc.pressKey('Enter'); advance(10);
    ok('a reply with no state: the reason shows and the board is left exactly as it was',
      !$('plErr').hidden && $('plErr').textContent.indexOf('the board jammed') >= 0
      && at() === tr((drop.bin - 6) * STEP, DROP) && ringed() === drop.bin, $('plErr').textContent + ' bead ' + at());
    advance(5000);
    ok('a reply with no state hands Drop back and starts no four-second timeout',
      !$('plDeal').disabled && $('plErr').textContent.indexOf('didn’t respond') < 0, $('plErr').textContent);

    // --- a broadcast is drawn where it stands ---
    const cast = engine.newRound({ seed: 'pl-cast', id: 'c', bet: BET, risk: 'mild' });
    toWebview({ type: 'pl', state: engine.view(cast, 1e9), balance: ledgerBalance(), free: ledgerBalance() }); // no n
    advance(5);
    ok('a broadcast is drawn at once: the bead in its cup, no fall animated',
      at() === tr((cast.bin - 6) * STEP, DROP) && ringed() === cast.bin && h.pending(50) === 0,
      at() + ' bin ' + cast.bin + ' pending ' + h.pending(50));
    ok('no webview exception anywhere in this mode', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
  }
};
