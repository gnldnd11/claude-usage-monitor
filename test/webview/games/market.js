// The coin market, end to end, with nothing faked that the host owns.
//
// It is checked in two halves on purpose, because the thing that makes this game different from the
// other four is also what makes it hard to test: its numbers move while nobody is looking.
//
//  - THE DRAWN HALF is handed a state the test priced ITSELF, with market.view() at one minute it
//    chose once. Every figure, every candle and every percentage below is then read back out of that
//    state, so the geometry is checked against numbers that cannot move while the test runs.
//  - THE LIVE HALF trades through the real host at the real clock, and reads what happened out of
//    the PURSE rather than out of a price: the stake the ledger lost and the payout it gained are
//    the two facts a trade is made of, and the screen has to agree with both of them. Nothing here
//    asserts what a price will be, because that is the one thing a test cannot know in advance.
'use strict';

module.exports = {
  id: 'market',
  // Under the smallest stake there is, so the short-purse screen is the one that shows. Read off the
  // engine rather than written down: the minimum has one home and it has moved before
  start: { 'market-poor': require('../../../market.js').MIN_BUY - 5 },
  modes: ['market', 'market-reduce', 'market-poor'],

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, openList, hdrBal, activeName, ledgerBalance,
      toWebview, errors, EXT, path } = h;
    const market = require(path.join(EXT, 'market.js'));
    const sentMk = h.sent('mk');
    const R = MODE === 'market-reduce';
    const TRADE = R ? 0 : 200;            // the beat between the state landing and the verdict chip
    // The four windows the chips offer, written here as well as in games/market/meta.js on purpose:
    // a literal in both places means a change to a shape has to be made twice, and the second time
    // is this file failing until someone looks at the geometry below.
    // `mins` is what the chip's own name claims, and `head` what the list says over its change
    // column. The counts are what the screen can be read for: no two of the four are the same
    // number, so the candles drawn name the window the host built
    const SPANS = {
      '3H': { stepMs: 5 * market.MS_PER_MIN, count: 36, mins: 180, head: 'last 3h' },
      '1D': { stepMs: 60 * market.MS_PER_MIN, count: 24, mins: 1440, head: 'last 24h' },
      '1W': { stepMs: 360 * market.MS_PER_MIN, count: 28, mins: 10080, head: 'last 7d' },
      '1M': { stepMs: 1440 * market.MS_PER_MIN, count: 30, mins: 43200, head: 'last 30d' }
    };
    const KEYS = Object.keys(SPANS);
    const DEF = '1D';                     // the window the screen opens on
    const SHAPE = { stepMs: SPANS[DEF].stepMs, count: SPANS[DEF].count };
    const CANDLES = SPANS[DEF].count;

    // the change as the panel prints it: the host's own basis points over a hundred, and no other
    // arithmetic anywhere near it
    const pctAbs = (bp) => { const v = Math.abs(bp) / 100; return (v === Math.round(v) ? v : v.toFixed(1)) + '%'; };
    const pctOf = (bp) => (bp > 0 ? '+' : bp < 0 ? '−' : '') + pctAbs(bp);
    // the same figure in words, which is what an aria-label carries: a reader announcing '−' is
    // announcing a dash, and the sign is the whole of what this figure says
    const saidOf = (bp) => (bp === 0 ? 'unchanged' : (bp > 0 ? 'up ' : 'down ') + pctAbs(bp));
    const money = (n) => Math.round(n).toLocaleString('en-US');
    const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
    // Ticks to credits, the way the panel does it: the coin says its own unit (base is baseTicks).
    // TWO RESOLUTIONS, and which one is used where is a decision rather than a detail. The list
    // rounds to whole credits, because at a sidebar of 250 a price slot is 38.62px and `1,434.13` is
    // 56.69px, which eats the coin's name; the coin depth prints the TICK, because that is the
    // resolution the price actually moves at and rounding it off throws away the news
    const cred = (ticks) => money(Math.round(ticks / market.TICKS_PER_CREDIT));
    const credFix = (ticks) => {
      const whole = Math.floor(ticks / market.TICKS_PER_CREDIT);
      const cents = ticks - whole * market.TICKS_PER_CREDIT;
      return money(whole) + '.' + (cents < 10 ? '0' + cents : String(cents));
    };
    // two significant figures, floored, which is what the box opens with (a tenth of the purse)
    const sig2 = (n) => {
      if (!(n > 0)) return 0;
      if (n < 100) return Math.floor(n);
      const p = Math.pow(10, Math.floor(Math.log10(n)) - 1);
      return Math.floor(n / p) * p;
    };
    const txt = (id) => { const e = $(id); return e ? e.textContent : null; };
    const rows = () => doc.querySelectorAll('#mkList .mk-row');
    const codes = () => rows().map((r) => r.getAttribute('data-code')).join(',');
    const figOf = (code) => { const c = doc.querySelector('#mkFig-' + code + ' .bj-chip'); return c ? c.textContent : 'none'; };
    // The verdict of a trade, which is on the line under the amount box. There is no .hl-line on this
    // screen: that line belongs to the felt, and every other game has it INSIDE one, where an empty
    // one cannot be seen. Here it was a visible 22px of nothing (30px with its margin) whenever a
    // position was open, so what it carried moved to the line that was already there
    const chip = () => { const c = doc.querySelector('#mkConv .bj-chip'); return c ? c.className + ' ' + c.textContent : 'none'; };
    const bodies = () => doc.querySelectorAll('#mkChart .mk-body');
    const wicks = () => doc.querySelectorAll('#mkChart .mk-wick');
    const marks = () => doc.querySelectorAll('#mkChart .mk-mark');
    const ops = (from) => sentMk.slice(from == null ? 0 : from).map((m) => m.op).join();
    // The same list with the beat's own asks taken out. The panel asks the host every second now
    // (its MK_T.tick), so `open` is no longer evidence of anything a player did, and what these
    // checks are about is the moves: a trade is a buy or a sale and nothing else goes out
    const trades = (from) => sentMk.slice(from == null ? 0 : from)
      .map((m) => m.op).filter((o) => o !== 'open').join();
    const rowFig = () => { const e = $('fig-market'); return e ? e.className + '|' + e.textContent : 'none'; };
    const chgOf = (code) => { const e = $('mkChg-' + code); return e ? e.className + '|' + e.textContent : 'none'; };
    const chipOf = (key) => doc.querySelector('#mkSpan button[data-span="' + key + '"]');
    const onChip = () => doc.querySelectorAll('#mkSpan button.on').map((b) => b.getAttribute('data-span')).join();
    const pressed = () => doc.querySelectorAll('#mkSpan button[aria-pressed="true"]').map((b) => b.getAttribute('data-span')).join();
    const sty = (e, k) => Number(new RegExp(k + ':([\\d.]+)%').exec(e.getAttribute('style'))[1]);
    const live = () => txt('mkLive');
    // the one control the screen is offering, which must never be two (docs/game-panels.md, 5-10)
    const offered = () => ['mkDeal', 'mkSell'].filter((id) => !$(id).hidden).join();
    const dirOf = (s) => (s.charAt(0) === '+' ? 'u' : s.charAt(0) === '−' ? 'd' : '');
    // what the list row should read for a figure: the room's own two directions, or neither
    const figWant = (s) => 'gm-fig' + (dirOf(s) === 'u' ? ' gm-up' : dirOf(s) === 'd' ? ' gm-dn' : '') + '|' + s;
    // Every visible step of one trade, 1ms at a time from the moment the reply landed
    function show(ms) {
      const t0 = h.now, m = {};
      const mark = (k) => { if (m[k] == null) m[k] = h.now - t0; };
      for (let i = 0; i <= ms; i++) {
        if (!$('mkPlBox').hidden) mark('pl');
        if (doc.querySelector('#mkConv .bj-chip')) mark('chip');
        if (!$('mkSell').hidden) mark('sell');
        if (live()) mark('said');
        const prim = $('mkSell').hidden ? $('mkDeal') : $('mkSell');
        if (!prim.disabled && !prim.hidden) mark('unlock');
        advance(1);
      }
      return m;
    }

    openList();
    ok('the market has no screen at all until it is opened', !$('panelMarket') && !$('mkList'));
    ok('and its row carries no figure before anything is held', rowFig() === 'gm-fig|', rowFig());

    // the row builds the panel and asks the host, both at once: this is the state before the answer
    h.rowFor('market').click();
    ok('before the host answers, the market lists nothing and offers nothing',
      rows().length === 0 && $('mkCtl').hidden && $('mkAmtRow').hidden && $('mkWhy').hidden,
      rows().length + ' rows | ctl hidden ' + $('mkCtl').hidden + ' | fold hidden ' + $('mkWhy').hidden);
    advance(20);
    ok('the list row opens the market and asks the host for the prices',
      doc.body.classList.contains('game-mk') && $('panelMarket').style.display === '' && ops() === 'open',
      ops() + ' | ' + h.bodyTabs());
    ok('the market has no felt: there is no round on a table here, so the chart gets the well instead',
      !doc.querySelector('#panelMarket .bj-felt') && !!doc.querySelector('#panelMarket .mk-well'),
      $('panelMarket').className);
    ok('four coins, a row each, in the engine’s own order', codes() === market.CODES.join(','), codes());
    ok('nothing is held, so no row carries a figure and the heading’s corner is empty',
      market.CODES.every((c) => figOf(c) === 'none') && txt('mkSide') === '' && rowFig() === 'gm-fig|',
      market.CODES.map(figOf).join() + ' | side ' + JSON.stringify(txt('mkSide')));

    // --- the drawn half: a state the test priced itself, at one minute, once ----------------------
    const T0 = Date.UTC(2026, 5, 1, 12, 34, 0);
    const PURSE = 410862;            // a purse the size a real one reaches, so the default stake shows
    const drawn = market.view(market.load(null), PURSE, T0, SHAPE);
    const c0 = drawn.coins[0];
    const hi = c0.candles.reduce((a, r) => (r.h > a ? r.h : a), c0.candles[0].h);
    const lo = c0.candles.reduce((a, r) => (r.l < a ? r.l : a), c0.candles[0].l);
    toWebview({ type: 'mk', state: drawn, balance: PURSE, free: PURSE });
    advance(20);
    ok('every row prints the host’s own price, in credits',
      market.CODES.every((code, i) => txt('mkPx-' + code) === cred(drawn.coins[i].ticks)),
      market.CODES.map((code) => txt('mkPx-' + code)).join() + ' | '
      + drawn.coins.map((c) => cred(c.ticks)).join());
    ok('and one sparkline a row, a point a candle',
      doc.querySelectorAll('#mkList .mk-spark polyline').length === 4
      && doc.querySelector('#mkSpark-' + c0.code + ' polyline').getAttribute('points').split(' ').length === c0.candles.length,
      doc.querySelectorAll('#mkList .mk-spark polyline').length + ' lines');
    // The figure that picks which row to open, PRINTED. It was in the aria-label and the title only,
    // which is a figure you have to hold a mouse still to read, and the four prices on their own
    // compare nothing: they are four different bases. Four rows, every one of them, because this is
    // the number the rows are read against each other with
    ok('every row prints its change, in the room’s own two colours',
      market.CODES.every((code, i) => chgOf(code)
        === 'mk-chg ' + (drawn.coins[i].chgBp > 0 ? 'mk-u' : drawn.coins[i].chgBp < 0 ? 'mk-d' : '')
        + '|' + pctOf(drawn.coins[i].chgBp)),
      market.CODES.map(chgOf).join(' / '));
    ok('and it sits on the first line beside the price, not next to the profit chip',
      market.CODES.every((code) => !!doc.querySelector('#mkRow-' + code + ' .mk-r1 #mkChg-' + code)
        && !doc.querySelector('#mkRow-' + code + ' .mk-r2 .mk-chg')),
      doc.querySelector('#mkRow-' + c0.code).innerHTML);
    // The list has no period control, so one word over the change column is what says against what
    // all four of those figures are measured. Without it the rows are four percentages of nothing
    ok('the list heads its change column with the name of the window',
      txt('mkLHead') === SPANS[DEF].head && !$('mkLHead').hidden, txt('mkLHead'));
    // and a row says the same thing in words, because the sparkline beside it is a picture
    ok('the row reads out the change and the window it is measured over',
      $('mkRow-' + c0.code).getAttribute('aria-label')
      === c0.name + ', ' + cred(c0.ticks) + ', ' + saidOf(c0.chgBp)
      + ' over the last 24 hours, nothing held',
      $('mkRow-' + c0.code).getAttribute('aria-label'));

    const listTitle = txt('mkTtl');
    ok('on the list of coins the heading is the game’s own title', listTitle === 'Coin Market', listTitle);
    $('mkRow-' + c0.code).click();
    ok('a row opens that coin: the list goes, the chart comes',
      $('mkList').hidden && !$('mkCoin').hidden && txt('mkTtl') === c0.code, txt('mkTtl'));
    // THE CRUMB IS GONE AND WITH IT THE SECOND BACK BUTTON. What it carried had a place in the
    // heading already: the code is the TITLE, so the one arrow plainly closes this coin, and the
    // price is the corner figure. A row of its own to say that cost 25px and an arrow that two
    // screens' worth of reading had to tell apart
    ok('the coin’s own depth is named by the heading: no crumb, no second way back up',
      !doc.querySelector('#panelMarket .mk-crumb') && !$('mkUp')
      && doc.querySelectorAll('#panelMarket .bj-back').length === 1,
      doc.querySelectorAll('#panelMarket .bj-back').length + ' back buttons');
    // the arrow is one button taking two different steps, so it has to say which one it is on
    ok('and the arrow says what it closes at this depth',
      $('mkBack').title === 'All coins (Esc)', $('mkBack').title);
    ok('and the heading’s corner carries the host’s price for it, to the tick',
      txt('mkSide') === credFix(c0.ticks) && $('mkSide').className === 'bj-side'
      && /\.\d\d$/.test(txt('mkSide')),
      txt('mkSide') + ' | want ' + credFix(c0.ticks) + ' | ' + $('mkSide').className);
    // ...and the LIST does not, which is the other half of that decision: the four rows are read
    // against each other and what is compared there is the change, not the price
    ok('the list keeps whole credits, so a name is not pushed out by two decimals',
      market.CODES.every((code, i) => txt('mkPx-' + code) === cred(drawn.coins[i].ticks))
      && market.CODES.every((code) => !/\./.test(txt('mkPx-' + code))),
      market.CODES.map((code) => txt('mkPx-' + code)).join());
    // The felt's line is not on a screen with no felt (see `chip` above)
    ok('and there is no .hl-line here at all, empty or otherwise',
      !doc.querySelector('#panelMarket .hl-line'),
      (doc.querySelector('#panelMarket .hl-line') || {}).outerHTML);
    // The change moved to the end of the period line, and that is what says what it is measured
    // against: `1D ····· +0.9%` is one reading, and nothing else on this screen names a base
    ok('the change sits at the far end of the period line instead, in the room’s own colours',
      txt('mkChg') === pctOf(c0.chgBp)
      && $('mkChg').className === 'mk-chg ' + (c0.chgBp > 0 ? 'mk-u' : c0.chgBp < 0 ? 'mk-d' : '')
      && !!doc.querySelector('.mk-spanrow #mkChg'),
      txt('mkChg') + ' | ' + $('mkChg').className);
    ok('four chips over the chart, never five, and the one the screen opened on is lit',
      doc.querySelectorAll('#mkSpan button').length === 4 && onChip() === DEF && pressed() === DEF
      && !doc.querySelector('#mkCtl #mkSpan'),
      onChip() + ' | pressed ' + pressed() + ' | '
      + doc.querySelectorAll('#mkSpan button').map((b) => b.textContent).join());
    // The chips are over the well, not under it: below the chart they would be the second segmented
    // row within 40px, the stake chips being the first (docs/game-panels.md, section 5-10)
    ok('and they are above the well, not stacked on the stake chips',
      doc.querySelector('#mkCoin').innerHTML.indexOf('mk-spanrow')
      < doc.querySelector('#mkCoin').innerHTML.indexOf('mk-well'));
    ok('the chart is one body a candle, thirty-six of them, every one placed in per cent',
      bodies().length === c0.candles.length && c0.candles.length === CANDLES
      && /^left:[\d.]+%;width:[\d.]+%;top:[\d.]+%;height:[\d.]+%$/.test(bodies()[0].getAttribute('style')),
      bodies().length + ' bodies | ' + bodies()[0].getAttribute('style'));
    // Per cent and not pixels, which is what lets the window grow without a resize hook. On the
    // default window at the design width (a 186px chart, this screen having no felt to come off the
    // sidebar) a slot is 7.75px and a body 4.80px; at a sidebar dragged in to 250 (156px) 6.50px and
    // 4.03px. The narrowest it gets is 3H's 36 candles at 156px: a 4.33px slot and a 2.69px body.
    // Checked as the arithmetic rather than by rendering, because this harness has no layout: a slot
    // is 100/count per cent and a body 62% of it
    ok('and the slot is the well divided by the candle count, the body 62% of the slot',
      Math.abs(sty(bodies()[1], 'left') - sty(bodies()[0], 'left') - 100 / CANDLES) < 0.02
      && Math.abs(sty(bodies()[0], 'width') - (100 / CANDLES) * 0.62) < 0.02,
      'slot ' + (sty(bodies()[1], 'left') - sty(bodies()[0], 'left')) + '% | body '
      + sty(bodies()[0], 'width') + '%');
    ok('green up and red down, candle by candle, and nothing else said',
      bodies().map((e) => /mk-(rise|fall)/.exec(e.className)[0]).join()
      === c0.candles.map((r) => (r.c >= r.o ? 'mk-rise' : 'mk-fall')).join(),
      bodies().map((e) => /mk-(rise|fall)/.exec(e.className)[0]).join());
    const topIdx = c0.candles.reduce((b, r, i) => (r.h > c0.candles[b].h ? i : b), 0);
    const botIdx = c0.candles.reduce((b, r, i) => (r.l < c0.candles[b].l ? i : b), 0);
    // Each candle's wick is centred in its own slot, so the one belonging to candle k is found by
    // where it sits rather than by counting: wicks are drawn only where there is one to see, so the
    // nth wick is not the nth candle
    const slotPc = 100 / c0.candles.length;
    const wickAt = (k) => wicks().filter((e) => sty(e, 'left') === Math.round((k * slotPc + slotPc / 2) * 100) / 100)[0];
    const withWick = c0.candles.filter((r) => r.h > Math.max(r.o, r.c) || r.l < Math.min(r.o, r.c)).length;
    // An hour-wide candle has an inside, and market.js samples it (WICK_SAMPLES), so the high and
    // the low are no longer the open and the close and the chart has wicks.
    // The count is measured, not inherited: 19 of 24 is what this coin's own 1D window holds at the
    // minute above. It was 18 on the minute grid, and it moved because the eight samples inside a
    // candle now land on eight distinct instants instead of colliding on whole minutes
    ok('an hour-wide candle has an inside, so most of them carry a wick',
      wicks().length === withWick && withWick === 19 && withWick < c0.candles.length,
      wicks().length + ' wicks drawn | ' + withWick + ' candles whose high or low is outside the body');
    // The extremes of the WINDOW are wick ends now, not body ends: the body of the highest candle
    // stops at its close. The body is the fallback rather than the subject, so a panel that stopped
    // drawing wicks fails this with a reading instead of throwing on a missing element
    const edgeOf = (k) => wickAt(k) || bodies()[k];
    const top = sty(edgeOf(topIdx), 'top');
    const bot = sty(edgeOf(botIdx), 'top') + sty(edgeOf(botIdx), 'height');
    ok('the window’s high is drawn at the top of the well and its low at its floor',
      top === 0 && Math.round(bot) === 100,
      'high at ' + top + '% | low ends at ' + bot + '%');
    ok('and every body sits inside its own wick',
      c0.candles.every(function (r, k) {
        const w = wickAt(k);
        if (!w) return r.h === Math.max(r.o, r.c) && r.l === Math.min(r.o, r.c);
        const b = bodies()[k];
        return sty(w, 'top') <= sty(b, 'top') + 0.02
          && sty(w, 'top') + sty(w, 'height') + 0.02 >= sty(b, 'top') + sty(b, 'height');
      }), withWick + ' wicks against ' + bodies().length + ' bodies');
    ok('the axis is the window the host sent and nothing the screen worked out',
      txt('mkAx') === 'low ' + credFix(lo) + 'high ' + credFix(hi), txt('mkAx'));
    // the WORD is the label and the FIGURE is the reading, which is the step of hierarchy this
    // depth was missing: twelve of its twenty-one pieces of type were muted
    ok('and its figures are lit while its words stay muted',
      doc.querySelectorAll('#mkAx b').map((b) => b.textContent).join('') === credFix(lo) + credFix(hi),
      $('mkAx').innerHTML);
    ok('with nothing held the chart is the biggest block: the profit place is empty, not zero',
      $('mkPlBox').hidden && txt('mkPl') === '' && marks().length === 0,
      'plbox hidden ' + $('mkPlBox').hidden + ' | ' + JSON.stringify(txt('mkPl')));
    ok('one control is offered, never two', offered() === 'mkDeal', offered());
    ok('a minute the host would refuse is a button the screen does not offer',
      $('mkDeal').disabled && $('mkDeal').title === c0.why.buy && /clock/.test(c0.why.buy),
      $('mkDeal').title);
    const feePct = (market.FEE_DEN - market.FEE_NUM) * 100 / market.FEE_DEN;
    ok('the rest of the table is folded away behind one toggle, and the toggle is BELOW the controls',
      $('mkPays').hidden && !$('mkWhy').hidden && $('mkWhy').getAttribute('aria-expanded') === 'false'
      && $('panelMarket').innerHTML.indexOf('mkCtl') < $('panelMarket').innerHTML.indexOf('mkWhy'),
      'pays hidden ' + $('mkPays').hidden);
    $('mkWhy').click();
    ok('and the toggle opens the coin’s own facts, all of them off the reply',
      !$('mkPays').hidden && $('mkWhy').getAttribute('aria-expanded') === 'true'
      && $('mkPays').innerHTML.indexOf(c0.grade) >= 0
      && $('mkPays').innerHTML.indexOf(market.BAND_X + '×') >= 0,
      $('mkPays').innerHTML);
    // THE FEE IS INSIDE THAT FOLD, not a sentence under the button. It is the same fact at every
    // depth and in every state, so on screen it was a permanent line of self-explanation: 19px at the
    // design width and 32px at a sidebar of 250, where it takes two lines. The figure is still the
    // host's (`feeBp`), which is why it is read off the engine here too
    ok('the fee is said once, inside the fold, and the screen did not write the figure',
      $('mkPays').innerHTML.indexOf('Round trip ' + feePct + '%, taken when you sell') >= 0
      && !doc.querySelector('#panelMarket .mk-fee') && !$('mkFee'),
      $('mkPays').innerHTML);
    $('mkWhy').click();

    // --- the live half: the real host, the real clock, the real purse -----------------------------
    // back out and in, so the state on the screen is the host's own and not the one above
    openList();
    h.rowFor('market').click(); advance(20);
    const code = market.CODES[0];
    const name = drawn.coins[0].name;
    $('mkRow-' + code).click();
    // The window the HOST built, which is the one thing above that the drawn half cannot check: it
    // priced its own state with this file's SHAPE, and what games/market/meta.js hands view() is a
    // second literal. They have to agree, so it is checked where the host drew it.
    // What is read is the COUNT, because no two of the four windows share one (SPANS): a host that
    // used another row of its table draws another number of candles. The step is not countable off
    // a page with no layout, and the screen cannot be asked for it either, because the name it says
    // out loud now comes from its own chip table rather than from the candles' timestamps
    ok('the host draws the window the panel was built for, not one of its own',
      bodies().length === SPANS[DEF].count
      && / over the last 24 hours, /.test($('mkChart').getAttribute('aria-label')),
      bodies().length + ' bodies | ' + $('mkChart').getAttribute('aria-label'));

    // --- the period: the screen picks a window and the host builds it -----------------------------
    // Four counts, four windows, no two counts the same: that is what makes the chart readable as
    // the answer. And every row's step x count is the window its own name claims, which is the
    // thing a table of magic pairs can quietly stop being
    ok('each chip names a window its own shape adds up to, in a unit a person can name',
      KEYS.every((k) => SPANS[k].stepMs * SPANS[k].count === SPANS[k].mins * market.MS_PER_MIN)
      && new Set(KEYS.map((k) => SPANS[k].count)).size === KEYS.length,
      KEYS.map((k) => k + ' ' + (SPANS[k].stepMs / market.MS_PER_MIN) + 'm x ' + SPANS[k].count).join(' | '));
    const spanFails = [];
    for (const k of KEYS) {
      const before = sentMk.length;
      chipOf(k).click(); advance(20);
      const msg = sentMk[before] || {};
      const bad = [];
      if (bodies().length !== SPANS[k].count) bad.push('drew ' + bodies().length + ' candles, wanted ' + SPANS[k].count);
      if (onChip() !== k || pressed() !== k) bad.push('lit ' + onChip() + '/' + pressed());
      if (msg.op !== 'open' || msg.span !== k) bad.push('sent ' + JSON.stringify(msg));
      // the one thing the webview may say about a window is its name. A {stepMs, count} off the
      // wire would let one keypress ask for 4 coins x 240 candles x 8 sampled prices
      if (msg.stepMs !== undefined || msg.count !== undefined) bad.push('sent a shape: ' + JSON.stringify(msg));
      if (bad.length) spanFails.push(k + ': ' + bad.join('; '));
    }
    ok('every chip changes the window: the key goes out, the host sends back that many candles',
      spanFails.length === 0, spanFails.join(' | '));
    // the window is one set and both depths follow it: the list compares four coins, and a base that
    // differed from row to row would be four figures that cannot be compared
    // The heading's arrow, which is the only one there is. It takes ONE step: from a coin it closes
    // the coin, and only from the list does it leave the game (the panel's `up`, games/README.md
    // section 4). The test for the second step is below, with the keys
    $('mkBack').click();
    ok('the heading’s arrow closes the coin and stays in the market',
      !$('mkList').hidden && $('mkCoin').hidden && doc.body.classList.contains('game-mk')
      && txt('mkTtl') === listTitle && $('mkBack').title === 'All games',
      txt('mkTtl') + ' | ' + $('mkBack').title + ' | ' + h.bodyTabs());
    ok('and the list follows the same window, named over its change column',
      !$('mkList').hidden && !$('mkLHead').hidden && txt('mkLHead') === SPANS['1M'].head
      && market.CODES.every((c) => /%$/.test(txt('mkChg-' + c))),
      txt('mkLHead') + ' | ' + market.CODES.map((c) => txt('mkChg-' + c)).join());
    // A key from a panel that is not this one. It is not refused, because a refusal would leave the
    // screen with no prices at all; it falls to the default window
    $('mkRow-' + code).click();
    h.hostSend({ type: 'mk', op: 'open', span: 'ALL' });
    advance(20);
    ok('a window the host does not know falls to the default instead of being invented',
      bodies().length === SPANS[DEF].count, bodies().length + ' candles');
    chipOf(DEF).click(); advance(20);     // back to the default, so what follows starts where it did
    ok('and the screen can put itself back on it', onChip() === DEF && bodies().length === CANDLES,
      onChip() + ' | ' + bodies().length + ' candles');

    if (MODE === 'market-poor') {
      ok('not enough credits: the buy is off and the note says which problem this is',
        $('mkDeal').disabled && !$('mkNote').hidden
        && $('mkNote').textContent === 'You need ' + market.MIN_BUY + ' credits to play.',
        $('mkNote').textContent + ' | buy disabled ' + $('mkDeal').disabled);
      ok('a price you cannot buy is not a secret: the chart is drawn in full',
        bodies().length === CANDLES && txt('mkPx-' + code) !== '', bodies().length + ' bodies');
      ok('and a coin you do not hold has nothing to sell', $('mkSell').hidden && offered() === 'mkDeal', offered());
    } else {
      // THE AMOUNT AND ITS UNIT ARE ONE BOX. Three identical rounded boxes in a row became three
      // STACKED identical rounded boxes at a sidebar of 250, and the only thing saying what `cr`
      // meant was the conversion line 44px below it in 4.06:1 muted text
      ok('the amount and its unit are one field, with the ratio chips on their own line',
        !!doc.querySelector('#mkAmtRow .mk-field #mkAmt')
        && !!doc.querySelector('#mkAmtRow .mk-field #mkUnit')
        && !doc.querySelector('#mkAmtRow .mk-field #mkPick')
        && !!doc.querySelector('#mkAmtRow #mkPick'),
        $('mkAmtRow').innerHTML);
      // and the second button is the COIN rather than the word `coins`: at 0px from the number it
      // says which of the two things that number is
      const unitBtn = (u) => doc.querySelector('#mkUnit button[data-u="' + u + '"]');
      ok('the unit buttons are credits and this coin’s own code, not a category',
        unitBtn('cr').textContent === 'cr' && unitBtn('sh').textContent === code
        && unitBtn('cr').className === 'on',
        unitBtn('cr').textContent + ' | ' + unitBtn('sh').textContent);
      // THE BOX OPENS ON A TENTH OF THE PURSE. It opened on a flat 100 for every purse, which is the
      // other games' minimum bet and was 0.024% of the balance above: not a stake, a rounding error
      // with a Buy button on it. Seeded once, off the purse the panel was told about
      ok('the box opens on a tenth of the purse, cut to two figures',
        $('mkAmt').value === String(sig2(Math.min(PURSE, market.MAX_BUY) / 10))
        && Number($('mkAmt').value) === 41000,
        $('mkAmt').value + ' | want ' + sig2(Math.min(PURSE, market.MAX_BUY) / 10));
      const typeAmt = (v) => { $('mkAmt').value = v; $('mkAmt').dispatchEvent({ type: 'input', preventDefault() {} }); advance(2); };
      // the box takes any whole number of credits, and the line says how much of a coin that is
      typeAmt('567');
      ok('the box takes any stake, not only a chip, and says what it buys in coins',
        $('mkDeal').getAttribute('data-bet') === '567' && /^≈ [\d.]+ /.test(txt('mkConv')),
        $('mkDeal').getAttribute('data-bet') + ' | ' + txt('mkConv'));
      // in coins, a fraction of one is a stake of that fraction of the price
      doc.querySelector('#mkUnit button[data-u="sh"]').click(); advance(2);
      typeAmt('0.5');
      const want07 = Math.round(0.5 * Number(txt('mkSide').replace(/,/g, '')));
      ok('half a coin is a stake of half its price',
        Math.abs(Number($('mkDeal').getAttribute('data-bet')) - want07) <= 1 && /^= [\d,]+ credits$/.test(txt('mkConv')),
        $('mkDeal').getAttribute('data-bet') + ' | want ' + want07 + ' | ' + txt('mkConv'));
      doc.querySelector('#mkUnit button[data-u="cr"]').click(); advance(2);
      // Max is the whole purse this table may use
      doc.querySelector('#mkPick button[data-f="100"]').click(); advance(2);
      ok('Max puts in everything the purse can stake here',
        Number($('mkDeal').getAttribute('data-bet')) === Math.min(ledgerBalance(), market.MAX_BUY),
        $('mkDeal').getAttribute('data-bet') + ' | purse ' + ledgerBalance());
      typeAmt(String(ledgerBalance() + 1));
      ok('more than the purse holds is refused on the screen before it is sent',
        $('mkDeal').disabled && txt('mkConv') === 'Not enough credits', txt('mkConv'));
      typeAmt('100');
      // The stake about to go in is said by the box and by the button, and nowhere else. The pot
      // preview that used to sit under the well went with the .hl-line: a third copy of the number
      // that is already typed into the box it is read out of
      ok('the stake typed is the stake on the button, and the line says what it buys',
        $('mkDeal').getAttribute('data-bet') === '100' && txt('mkDeal') === 'Buy 100'
        && /^≈ [\d.]+ /.test(txt('mkConv')) && !doc.querySelector('#panelMarket .hl-pot'),
        $('mkDeal').getAttribute('data-bet') + ' | ' + txt('mkDeal') + ' | ' + txt('mkConv'));

      // --- a buy
      const bal0 = ledgerBalance();
      const n0 = sentMk.length;
      $('mkDeal').click();
      ok('the button goes out the moment the buy leaves, not when the reply lands', $('mkDeal').disabled);
      // and so does the period, which cannot change while a trade is settling: a chip that took the
      // press and dropped it would be the one reading nobody can tell from a dead screen
      ok('and the period chips go out with it',
        doc.querySelectorAll('#mkSpan button').every((b) => b.disabled),
        doc.querySelectorAll('#mkSpan button').map((b) => b.disabled).join());
      advance(2);
      const buyT = show(400);
      ok('the buy: one message, naming the coin and the stake and no time at all',
        trades(n0) === 'buy' && sentMk[n0].ticker === code && sentMk[n0].amount === 100
        && sentMk[n0].nowMs === undefined, JSON.stringify(sentMk[n0]));
      ok('the purse paid exactly the stake the chips offered', ledgerBalance() === bal0 - 100,
        'paid ' + (bal0 - ledgerBalance()));
      ok('the position lands at once and the verdict a beat after it',
        buyT.pl === 0 && buyT.sell === 0 && buyT.chip === TRADE && buyT.unlock === TRADE
        && buyT.said === TRADE, JSON.stringify(buyT));
      // the reply is drawn at the very minute the trade settled at, so the price in the corner IS the
      // price the position was opened at: the chip and the line under the profit have to say it
      ok('the chip names what went in and the price it went in at',
        chip() === 'bj-chip Bought 100 at ' + txt('mkSide'), chip() + ' | now ' + txt('mkSide'));
      // and the percentage is NOT in that line. 29px under it the period row carries the market's
      // own change in the same colours and the same sign, so the two read as one figure and neither
      // says which it is. What is left is what the big number cannot say
      // HOW MUCH OF THE COIN IS MINE, ON ITS OWN LINE. It was the first clause of the muted line
      // under the profit, which is where a holder's own question went to be read last, and that line
      // then ran to 208.22px at a sidebar of 250, which is two lines of 11px muted text
      ok('the holding is a line of its own, in this coin’s own code',
        new RegExp('^[\\d.,]+ ' + code + '$').test(txt('mkPlQty'))
        && $('mkPlQty').className === 'mk-plqty',
        txt('mkPlQty'));
      // and the line under it is the stake, the entry price and the age. No percentage: 29px below
      // it the period row carries the market's own change in the same colours and the same sign
      // One buy, so the price is not called an average: an average of one price is that price.
      // The word comes back with the second buy, which the lots case below holds
      ok('and under it the stake, the price it went in at and the age, with no percentage',
        !$('mkPlBox').hidden && /^100 in · [\d,]+\.\d\d · \d+s$/.test(txt('mkPlSub'))
        && txt('mkPlSub').indexOf(txt('mkSide')) > 0 && txt('mkPlSub').indexOf('%') < 0,
        txt('mkPlSub') + ' | corner ' + txt('mkSide'));
      // TWO places, not three. With one position open the corner's sum and the block are the same
      // number 44px apart and the same colour, so at this depth the corner carries the price instead
      // and the sum is read on the list of coins (below)
      ok('one figure, two places: the block says it and the list row says it',
        figOf(code) === txt('mkPl')
        && $('mkPl').className === 'mk-pl ' + (dirOf(txt('mkPl')) ? 'mk-' + dirOf(txt('mkPl')) : ''),
        txt('mkPl') + ' | ' + figOf(code) + ' | ' + $('mkPl').className);
      ok('and the corner is this coin’s price, not the same profit a second time',
        /^[\d,]+\.\d\d$/.test(txt('mkSide')) && txt('mkSide') !== txt('mkPl')
        && $('mkSide').className === 'bj-side',
        txt('mkSide') + ' | ' + txt('mkPl'));
      ok('the chart marks where this position was opened', marks().length === 1, marks().length + ' marks');
      // `Add` and not `Buy more`: at a sidebar of 250 the two buttons are 83px each, which is 71px of
      // text, and `Buy more 100` wanted two lines of a 34px button (docs/game-panels.md, section 1)
      ok('holding it, the screen offers the sale and more of the same coin',
        offered() === 'mkDeal,mkSell' && /^Add /.test(txt('mkDeal')), offered() + ' | ' + txt('mkDeal'));
      // The price on the button is what the purse will be paid, fee and all. Only its SHAPE is
      // asserted: the figure is the price of the minute the reply was drawn at, and a test that
      // compared it with what the sale fetches would be a test of whether the clock turned over
      // between two lines of itself
      const asking = txt('mkSell');
      ok('and the sale carries its own price, already net of the fee',
        /^Sell [\d,]+$/.test(asking), asking);
      ok('the coins nobody holds carry nothing at all',
        market.CODES.slice(1).every((x) => figOf(x) === 'none'), market.CODES.map(figOf).join());
      ok('and with the trade settled the period is pressable again',
        doc.querySelectorAll('#mkSpan button').every((b) => !b.disabled) && onChip() === DEF,
        onChip() + ' | ' + doc.querySelectorAll('#mkSpan button').map((b) => b.disabled).join());

      // --- the figure is the reason to come back, so the list has it with the panel shut
      const plTxt = txt('mkPl');
      // the sum of every open position, which is what the corner carries at the LIST depth: one
      // position open makes it the same figure as the block, and four would not
      $('mkBack').click();
      ok('back on the list of coins, the corner carries every open position together',
        txt('mkSide') === plTxt && $('mkSide').className === 'bj-side mk-' + dirOf(plTxt),
        txt('mkSide') + ' | ' + $('mkSide').className);
      $('mkRow-' + code).click();     // and back into the coin, which is where this leg left off
      // Shut by the TAB and not by the arrow, and the two are different on purpose. The arrow is a
      // step the player took, so walking out of a coin leaves them standing on the list of coins;
      // the tab puts the whole panel away, and the screen keeps the depth it was on for next time
      $('tabUsage').click(); advance(5);
      ok('the games list carries the open profit while the market is shut',
        rowFig() === figWant(plTxt) && h.notShown('panelMarket'), rowFig());
      $('hdCredits').click(); advance(5);
      h.rowFor('market').click(); advance(20);
      ok('coming back in lands on the coin that was open, with no verdict on it',
        txt('mkTtl') === code && chip() === 'none' && !$('mkPlBox').hidden,
        txt('mkTtl') + ' | ' + chip());

      // --- the sale. What it paid is read out of the purse, because that is the only figure a test
      // can know in advance: a price is not
      const bal1 = ledgerBalance();
      const n1 = sentMk.length;
      $('mkSell').click(); advance(2);
      const sellT = show(400);
      const paid = ledgerBalance() - bal1;
      ok('the sale: one message naming the coin, and no time on it either',
        trades(n1) === 'sell' && sentMk[n1].ticker === code && sentMk[n1].nowMs === undefined,
        JSON.stringify(sentMk[n1]));
      ok('the chip says exactly what the purse was paid and what the trip made',
        chip() === 'bj-chip ' + (paid > 100 ? 'win' : paid < 100 ? 'lose' : '') + ' Sold '
        + signed(paid - 100) + ' · paid ' + money(paid), chip() + ' | purse ' + paid);
      ok('the sale is read out with the same two figures',
        live().indexOf('Sold ' + name + ' for ' + money(paid) + ', ' + signed(paid - 100)) === 0, live());
      ok('and the verdict waits the same beat the buy did', sellT.chip === TRADE, JSON.stringify(sellT));
      ok('the position is gone: no profit block, no mark, no figure, and the buy is back',
        $('mkPlBox').hidden && marks().length === 0 && figOf(code) === 'none'
        && rowFig() === 'gm-fig|' && offered() === 'mkDeal' && /^Buy /.test(txt('mkDeal')),
        rowFig() + ' | ' + offered() + ' | ' + txt('mkDeal'));
      advance(600);   // past the header's own count-up, which is where the number is read from
      ok('the header balance landed on what the ledger says, not on what the chip says',
        hdrBal() === money(ledgerBalance()), hdrBal() + ' | ledger ' + money(ledgerBalance()));

      // --- the keys: a trip can be made without the mouse
      let n2 = sentMk.length;
      doc.dispatchKey('b'); advance(2);
      ok('B buys', trades(n2) === 'buy', ops(n2));
      advance(400);
      n2 = sentMk.length;
      doc.dispatchKey('s'); advance(2);
      ok('S sells', trades(n2) === 'sell', ops(n2));
      advance(400);
      n2 = sentMk.length;
      doc.pressKey('Enter', { target: doc.body }); advance(2);
      ok('Enter presses whichever of the two is offered', trades(n2) === 'buy', ops(n2));
      advance(400);
      doc.dispatchKey('s'); advance(420);    // and out again, so what follows starts from no position
      ok('the keys closed the trip they opened: nothing is held and the buy is back',
        $('mkPlBox').hidden && offered() === 'mkDeal', offered());
      doc.pressKey('Escape', { target: doc.body }); advance(2);
      ok('Escape goes back up to the coins, and the row it came from has the focus',
        !$('mkList').hidden && $('mkCoin').hidden && activeName() === 'mkRow-' + code,
        activeName());
      n2 = sentMk.length;
      doc.dispatchKey('b'); doc.dispatchKey('s'); advance(20);
      ok('guard: on the list of coins no key trades', trades(n2) === '', ops(n2));
      // THE ARROW'S SECOND STEP. One arrow, one step: from a coin it closed the coin (above), and
      // from the list of coins it leaves the game the way every other screen's arrow does. That is
      // the whole of why this screen needs no back button of its own (the panel's `up`)
      $('mkBack').click();
      ok('and from the list of coins the same arrow leaves the market altogether',
        !doc.body.classList.contains('game-mk') && $('panelMarket').style.display === 'none',
        h.bodyTabs() + ' | ' + $('panelMarket').style.display);
      n2 = sentMk.length;
      doc.dispatchKey('b'); doc.dispatchKey('s'); doc.pressKey('Enter', { target: doc.body }); advance(20);
      ok('guard: on the games list no market key trades', trades(n2) === '', ops(n2));
      h.rowFor('market').click(); advance(20);
      $('mkRow-' + code).click();

      // --- the beat. THE PRICE MOVES ON A 64TH OF A MINUTE, SO THE SCREEN ASKS EVERY SECOND.
      // It used to wait for the minute it had drawn to be over, which was right while the price only
      // moved on the minute and is a 59-second-stale screen now: a coin's printed price changes on
      // 94% to 96% of the seconds it exists for, against 1.7% on the minute grid (market.js,
      // section 1). One engine.view() is 0.21ms to 0.31ms, so this is 13ms to 19ms of a minute's CPU
      const n3 = sentMk.length;
      advance(1000);
      advance(20);     // the ask leaves on the beat; this is the reply landing
      ok('the market asks the host again every beat, not once a minute',
        sentMk.length === n3 + 1 && ops(n3) === 'open', ops(n3));
      ok('an unasked redraw takes no button away and reads nothing out again',
        !$('mkDeal').disabled && chip() === 'none', 'disabled ' + $('mkDeal').disabled + ' | ' + chip());
      advance(10000); advance(20);
      ok('ten seconds is ten more asks, one a beat and never two',
        sentMk.length === n3 + 11 && trades(n3) === '', sentMk.length - n3 + ' asks');

      openList();
      const n4 = sentMk.length;
      advance(180000);
      ok('leaving the market stops its clock', sentMk.length === n4, ops(n4));
      h.rowFor('market').click(); advance(20);

      // --- a buy nobody answers
      h.intercept = (m) => { if (m.op !== 'buy') return false; h.intercept = null; return true; };
      $('mkRow-' + code).click();
      $('mkDeal').click(); advance(5);
      ok('an unanswered buy keeps the button out and says nothing yet',
        $('mkDeal').disabled && $('mkErr').hidden);
      advance(3900);
      ok('still nothing just short of four seconds', $('mkErr').hidden, $('mkErr').textContent);
      advance(200);
      ok('at four seconds the market admits it and hands the button back',
        !$('mkErr').hidden && $('mkErr').textContent.indexOf('respond') > 0 && !$('mkDeal').disabled,
        $('mkErr').textContent + ' | disabled ' + $('mkDeal').disabled);

      // --- a reply the host could not describe (games/README.md, section 5)
      const chartBefore = $('mkChart').innerHTML;
      const saidBefore = live();
      h.intercept = (m) => {
        if (m.op !== 'buy') return false;
        h.intercept = null;
        later(1, () => toWebview({
          type: 'mk', n: m.n, error: 'the market could not be priced',
          balance: ledgerBalance(), free: ledgerBalance()
        }));
        return true;
      };
      $('mkDeal').click(); advance(10);
      ok('a reply with no state shows the reason, keeps the chart drawn and gives the button back',
        !$('mkErr').hidden && $('mkErr').textContent.indexOf('could not be priced') > 0
        && $('mkChart').innerHTML === chartBefore && !$('mkDeal').disabled && chip() === 'none'
        && live() === saidBefore,
        $('mkErr').textContent + ' | chart same ' + ($('mkChart').innerHTML === chartBefore));
      advance(5000);
      ok('and the four-second timer was let go: nothing fires over the reason',
        $('mkErr').textContent.indexOf('respond') < 0, $('mkErr').textContent);

      // --- another window's trade: a broadcast with no request number of ours
      const other = market.CODES[1];
      const T1 = Date.UTC(2026, 5, 1, 13, 0, 0);
      const cast = market.view(market.load({
        pos: { [other]: { amount: 500, entryTicks: market.priceAt(other, T1), at: T1 } },
        moves: 3, trades: 0, staked: 500, earned: 0, best: 0, at: T1, by: 'ffffffffffffffff'
      }), 1e9, T1, SHAPE);
      const said2 = live();
      toWebview({ type: 'mk', state: cast, balance: ledgerBalance(), free: ledgerBalance() });
      advance(20);
      ok('a broadcast is nobody’s trade: it is drawn as it stands, with no chip and nothing read out',
        chip() === 'none' && live() === said2, chip());
      // The games list row and the other coin's own row take it. The heading's corner does NOT,
      // because a coin is open and at that depth the corner is this coin's price: the sum is on the
      // list of coins, one step up, where it is not standing beside the same figure twice
      ok('the games list and the other coin’s row take the figure it brought',
        rowFig().indexOf('|' + signed(cast.heldPl)) > 0
        && figOf(other) === signed(cast.coins[1].position.pl) && figOf(code) === 'none',
        rowFig() + ' | ' + figOf(other));
      ok('and the open coin’s heading still carries its price, not another coin’s profit',
        txt('mkSide') === credFix(cast.coins[0].ticks) && $('mkSide').className === 'bj-side',
        txt('mkSide') + ' | ' + credFix(cast.coins[0].ticks));
      $('mkBack').click();
      ok('one step up, the corner is that sum',
        txt('mkSide') === signed(cast.heldPl), txt('mkSide') + ' | ' + signed(cast.heldPl));
      $('mkRow-' + code).click();

      // --- a redraw nobody asked for keeps the window the screen chose
      // The host sends these on its own (games/market/meta.js's onPush) when another window has
      // written the wallet, and they carry no key, so the window has to be REMEMBERED there. If it
      // were not, a screen left on the thirty-day chart would snap back to the default once a
      // minute with nobody having pressed anything.
      // The push is provoked the way the real one is: the stored record is made the later one
      // (market.newer counts moves, which only ever go up) and the host is told the webview is
      // ready, which is what runs every game's push hook
      chipOf('1M').click(); advance(20);
      ok('the thirty-day window is on screen before the push',
        bodies().length === SPANS['1M'].count && onChip() === '1M', bodies().length + ' candles');
      // The beat's own asks are stopped for the length of this check. They carry the key as well
      // (every open this panel sends does), so with them running a chart still on 1M would prove
      // only that the panel asked again, and what is being measured is the HOST's own memory of the
      // window: a push carries no key, and a reply built on the default would pull a screen off the
      // thirty-day chart with nobody having pressed anything
      h.intercept = (m) => m.op === 'open';
      const n5 = sentMk.length;
      const mkPosts = () => h.hostLog.filter((e) => e.type === 'mk').length;
      const posts0 = mkPosts();
      const stored = h.gs.data.creditLedgerV1.market;
      ok('guard: the trades above left a stored wallet for another window to be ahead of',
        !!stored && Number.isSafeInteger(stored.moves), JSON.stringify(stored));
      stored.moves += 5;
      h.hostSend({ type: 'ready' });
      advance(20);
      // The push HAS to have happened, or this reads as a pass over a chart nobody redrew: one
      // market reply more than before, and not one of ours
      ok('a redraw nobody asked for comes back on the chosen window, not on the default',
        mkPosts() === posts0 + 1 && bodies().length === SPANS['1M'].count,
        bodies().length + ' candles | ' + (mkPosts() - posts0) + ' pushed | '
        + (sentMk.length - n5) + ' asked and swallowed');
      h.intercept = null;
    }

    // The whole safety of this game is that the screen cannot name a minute (market.js, section 5),
    // so this is every field it sent all run, not only the ones a trade was checked with
    // `span` is on the list because a window has to be asked for by NAME: it is one of four keys the
    // host holds a shape for, which is a different thing from a shape, and a different thing again
    // from a time
    const allowed = ['type', 'op', 'n', 'ticker', 'amount', 'span'];
    const stray = Array.from(new Set(sentMk.reduce((a, m) => a.concat(Object.keys(m)), [])))
      .filter((k) => allowed.indexOf(k) < 0);
    ok('nothing the market sends, all run, names a time: the clock is the host’s alone',
      stray.length === 0 && sentMk.length > 0, stray.join() + ' | ' + sentMk.length + ' messages');
    const badSpan = sentMk.filter((m) => m.span !== undefined && KEYS.indexOf(m.span) < 0);
    ok('and every window it asked for was one of the four by name, never a shape of its own',
      badSpan.length === 0 && sentMk.some((m) => m.span !== undefined),
      JSON.stringify(badSpan));

    ok('no handler and no timer threw while any of that happened', errors.length === 0,
      errors.map((e) => e && e.message).join(' | '));
  }
};
