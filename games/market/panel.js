// The coin market's screen. Two depths and one question: what is my position worth, and do I go in
// or come out.
//
// This screen prices nothing. It cannot: the function that turns a time into a price is the host's
// and stays there (market.js, section 5), because priceAt(code, now + 60000) is next minute's price
// and a screen that could work one out could buy a result. So every figure below is one the reply
// carried, and the two bits of arithmetic there are change a UNIT the host declared: ticks to
// credits (`base` is `baseTicks`) and basis points to a percent.
//
// It does not name a time either. The beat that keeps it fresh counts its own beats and compares
// them against the `nowMs` the host sent, and when the minute is over it ASKS. Nothing here ever
// sends a clock reading, so the one thing that must be out of reach stays out of reach.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, esc = CUC.esc, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // There is no round here and no deal, so there is nothing to pace except the result of a trade,
  // which is one chip and one balance. docs/game-panels.md section 6 gives the market two numbers:
  //   tick   the screen's own beat. The price moves on the MINUTE and only the host can price one,
  //          so what this does between minutes is keep the held time counting, and on the minute it
  //          asks. A held profit that sits frozen is the one thing this screen must not show
  //   trade  the pause between the state landing and the verdict chip that says what it did
  // The only animation on this screen is the shared .bj-chip's own pop (games/casino.js), which
  // nothing here counts, so there is no CSS length written twice and nothing to keep in step
  var MK_T = {
    tick: 1000,
    trade: 200,
    noReply: 4000
  };
  // how much of a candle's slot is body. The rest is the gap that keeps two dozen of them
  // countable: on the default window (1D, 24 candles) the slot is 7.75px at the design width and
  // the body 4.80px, and at a sidebar dragged in to 250 (a 156px chart) 6.50px and 4.03px. The
  // narrowest this gets is the busiest window at the narrowest panel: 3H's 36 candles at 156px is
  // a 4.33px slot and a 2.69px body (docs/game-panels.md, section 5-10)
  var MK_BODY = 0.62;
  // The minute, which is the grid the PRICE lives on and so the grid the beat lives on. It is not
  // the width of a candle: the host decides that, from the key this screen sends it (MK_SPANS)
  var MS_MIN = 60000;

  // The windows this screen can ask for, and the only four it can. What goes on the wire is the KEY
  // and nothing else: the {stepMs, count} behind it is the host's (games/market/meta.js), because
  // market.js's candles() takes a count up to 240 and one `open` prices four coins x count candles
  // x WICK_SAMPLES prices each. A shape off the webview would be 7,680 of them in one message.
  //
  // 1Y and ALL are not here, and that is not a width problem: the price function starts at
  // market.js's EPOCH_MS and answers the base price for every minute before it, so a year-wide
  // window would be drawn part dead flat.
  //
  // `head` is what the list says over its change column and `said` is what a screen reader is told.
  // Both are names for the window the host builds from the same key, so a host building a different
  // one would make them a lie: that is counted (as the candles drawn) in test/webview/games/market.js
  var MK_SPANS = [
    { key: '3H', head: 'last 3h', said: 'the last 3 hours' },
    { key: '1D', head: 'last 24h', said: 'the last 24 hours' },
    { key: '1W', head: 'last 7d', said: 'the last 7 days' },
    { key: '1M', head: 'last 30d', said: 'the last 30 days' }
  ];
  // A day, because the coin introduces itself in days (`moves about 4% a day`, and `grade` is that
  // axis), and because three hours is too quiet to tell the four coins apart: the median absolute
  // move over 3H is 0.4% to 1.5% on all four, and over 1D it is 0.8% to 2.8%
  var MK_SPAN_DEF = '1D';

  var mk = {
    st: null, coin: null, busy: false, op: null, n: 0, to: null, tick: null,
    timers: CUC.timers(), chip: null, conv: null, title: '', backTitle: '',
    codes: null, locked: false, wantFocus: false,
    since: 0,   // ms of this panel's own beats since the drawn state landed
    asked: 0,   // the minute an ask has already gone out for, so one boundary is one ask
    span: MK_SPAN_DEF   // the window on screen. The host remembers it too, for the pushes nobody asked for
  };
  // The amount box: what was typed and in which unit. 'cr' is credits, 'sh' is coins (shares)
  mk.unit = 'cr';
  mk.typed = '100';

  // --- units the host declared, and nothing else -------------------------------------------------

  // Ticks to credits. A price is a whole number of hundredths of a credit, and the coin itself says
  // so: `baseTicks` IS `base` credits (market.js, section 6). Changing the unit of a number is not
  // deciding what it is worth
  function credOf(c, ticks) {
    if (!c || !c.baseTicks) return 0;
    return Math.round(ticks * c.base / c.baseTicks);
  }
  // Ten-thousandths to a percent. The host sends every move, every fee and every volatility in basis
  // points (market.js's bpOf) because the calmest coin moves 0.1% in an hour and a percent of that
  // reads as zero
  function pct(bp) {
    var v = bp / 100;
    return (v === Math.round(v) ? v : v.toFixed(1)) + '%';
  }
  function pctSigned(bp) {
    return (bp > 0 ? '+' : bp < 0 ? '−' : '') + pct(Math.abs(bp));
  }
  // The same figure in words. The sign is the whole of what a change says and a reader announcing
  // '−' is announcing a dash, so what goes in an aria-label is the direction said out loud
  function pctSaid(bp) {
    return bp === 0 ? 'unchanged' : (bp > 0 ? 'up ' : 'down ') + pct(Math.abs(bp));
  }
  // The window on screen, as the row that names it. Never null: a key nothing here can produce
  // falls to the default, which is what the host does with one too
  function spanNow() {
    for (var i = 0; i < MK_SPANS.length; i++) if (MK_SPANS[i].key === mk.span) return MK_SPANS[i];
    for (var k = 0; k < MK_SPANS.length; k++) if (MK_SPANS[k].key === MK_SPAN_DEF) return MK_SPANS[k];
    return MK_SPANS[0];
  }
  function dirCls(v) { return v > 0 ? 'mk-u' : v < 0 ? 'mk-d' : ''; }
  function tint(v) { return v > 0 ? 'win' : v < 0 ? 'lose' : ''; }
  function minuteOf(ms) { return Math.floor(ms / MS_MIN); }
  // How long a position has been open. Seconds for the first minute, so the beat has something to
  // show; after that the number that moves is the profit
  function age(ms) {
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm';
    return Math.floor(s / 3600) + 'h';
  }
  function coinOf(st, code) {
    if (!st || !code) return null;
    for (var i = 0; i < st.coins.length; i++) if (st.coins[i].code === code) return st.coins[i];
    return null;
  }

  // --- markup ------------------------------------------------------------------------------------

  // The period control. Four chips, built once, because the set is the four windows the host knows
  // and nothing on this screen can add a fifth: at 11px with a 5px pad four of them are 120px of
  // the 172px line a sidebar dragged to 250 leaves, and five are 149.5px, which does not stand
  // beside a change figure (docs/game-panels.md, section 5-10).
  // It is NOT in .bj-ctl: that row takes two buttons (section 1) and already holds the stake chips
  // and Buy, and a period is a way of looking rather than a way of spending
  function spanHtml() {
    return '<div class="mk-span" id="mkSpan" role="group" aria-label="Period">'
      + MK_SPANS.map(function (s) {
        return '<button type="button" data-span="' + esc(s.key) + '" title="' + esc(s.said) + '">'
          + esc(s.key) + '</button>';
      }).join('')
      + '</div>';
  }

  // THERE IS ONE WAY BACK UP AND IT IS THE HEADING'S ARROW. The crumb this screen used to carry
  // (`← Coins · CODE · price`) is gone: the market is the only game with a depth inside itself, so
  // two arrows on one heading was an exception rather than a precedent, and the arrow now climbs one
  // level here before it leaves the game (the `up` hook at the foot of this file). What the crumb
  // held is in the heading instead: the code is the TITLE, so the arrow plainly closes this coin, and
  // the price is the corner figure (mkHead).
  //
  // THERE IS NO .hl-line HERE EITHER. That line is the felt's, and every other screen has it inside
  // one, where an empty one cannot be seen; on a screen with the felt taken off it was a visible 22px
  // of nothing whenever a position was open, 30px with the margin over it, measured. What it carried
  // has a home each: the verdict chip of a trade goes in the .mk-conv line under the amount box, and
  // the stake about to go in is what the amount box itself says.
  //
  // `How it pays` is BELOW the control row, not above it, so nothing stands between the chart and the
  // button that acts on it, and the fee sentence is inside that fold rather than always on screen
  function markup() {
    return CUC.frame('market')
      + '<div class="mk-lhead" id="mkLHead"></div>'
      + '<div class="mk-list" id="mkList"></div>'
      + '<div id="mkCoin" hidden>'
      +   '<div class="mk-plbox" id="mkPlBox" hidden>'
      +     '<b class="mk-pl" id="mkPl"></b><span class="mk-plsub" id="mkPlSub"></span></div>'
      +   '<div class="mk-spanrow">' + spanHtml()
      +     '<span class="mk-chg" id="mkChg"></span></div>'
      +   '<div class="mk-well">'
      +     '<div class="mk-chart" id="mkChart" role="img" aria-label=""></div>'
      +     '<div class="mk-ax" id="mkAx"></div>'
      +   '</div>'
      + '</div>'
      + '<div class="bj-sr" id="mkLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="mkNote" hidden></div>'
      + '<div class="warnbar" id="mkErr" hidden></div>'
      + '<div class="mk-amt" id="mkAmtRow" hidden>'
      +   '<input id="mkAmt" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="Amount" value="100">'
      +   '<div class="mk-seg" id="mkUnit" role="group" aria-label="Unit">'
      +     '<button type="button" data-u="cr" class="on" aria-pressed="true">cr</button>'
      +     '<button type="button" data-u="sh" aria-pressed="false">coins</button></div>'
      +   '<div class="mk-seg" id="mkPick" role="group" aria-label="Part of the purse">'
      +     '<button type="button" data-f="25">25%</button><button type="button" data-f="50">50%</button>'
      +     '<button type="button" data-f="100">Max</button></div>'
      + '</div>'
      + '<div class="mk-conv" id="mkConv"></div>'
      + '<div class="bj-ctl" id="mkCtl" hidden>'
      +   '<button type="button" class="bj-btn primary" id="mkDeal" title="Buy (B)">Buy</button>'
      +   '<button type="button" class="bj-btn" id="mkSell" title="Sell (S)">Sell</button></div>'
      + '<button type="button" class="bj-why" id="mkWhy" aria-expanded="false" hidden>How it pays</button>'
      + '<div class="bj-pays" id="mkPays" hidden></div>';
  }

  // --- the list of coins -------------------------------------------------------------------------

  // Built once and then only filled in. A row is a button and the list redraws every minute, so
  // rebuilding it would take the focus off whichever row the keyboard was on, once a minute
  function mkRows(st) {
    var box = el('mkList'); if (!box) return;
    var codes = st.coins.map(function (c) { return c.code; }).join(',');
    if (codes !== mk.codes) { box.innerHTML = st.coins.map(rowHtml).join(''); mk.codes = codes; }
    st.coins.forEach(rowFill);
    // one word over the change column, and the only thing on this screen that says what the four
    // figures under it are measured against. The list has no period control of its own: the window
    // is one set for both depths, because a list whose rows had different windows is four figures
    // that cannot be compared, which is the whole job of this list
    var head = el('mkLHead'); if (head) head.textContent = spanNow().head;
  }
  // Two lines, and the line is the split: the top one is the MARKET (what this coin is worth and
  // which way it has gone, on the same window for every row) and the bottom one is the picture and
  // what is MINE. Putting the change beside the profit chip instead was drawn and dropped: two
  // signed, coloured figures 6px apart read as one figure (docs/game-panels.md, section 5-10)
  function rowHtml(c) {
    var k = esc(c.code);
    return '<button type="button" class="mk-row" id="mkRow-' + k + '" data-code="' + k + '">'
      + '<span class="mk-r1"><span class="mk-nm">' + esc(c.name) + '</span>'
      + '<span class="mk-px" id="mkPx-' + k + '"></span>'
      + '<span class="mk-chg" id="mkChg-' + k + '"></span></span>'
      + '<span class="mk-r2"><span class="mk-spark" id="mkSpark-' + k + '"></span>'
      + '<span class="mk-fg" id="mkFig-' + k + '"></span></span></button>';
  }
  // A row's figure is the one thing on this list that moved while the panel was shut, so only a coin
  // that is HELD carries one. Four rows each reading 0 is four numbers and no news
  // (docs/game-panels.md, section 5-10). The chip is drawn `still`: a figure that pops once a minute
  // is a figure nobody can read
  function rowFill(c) {
    var px = el('mkPx-' + c.code), sp = el('mkSpark-' + c.code), fg = el('mkFig-' + c.code);
    var chg = el('mkChg-' + c.code);
    var p = c.position;
    if (px) px.textContent = fmtInt(credOf(c, c.ticks));
    // The figure that decides which row to open, printed. It used to be in the aria-label and the
    // title only, which is a figure you have to hold a mouse still to read, and without it the four
    // rows are four prices off four different bases: 1,507 beside 317 compares nothing
    if (chg) {
      chg.textContent = pctSigned(c.chgBp);
      chg.className = 'mk-chg ' + dirCls(c.chgBp);
    }
    if (sp) sp.innerHTML = sparkHtml(c);
    if (fg) {
      fg.innerHTML = p ? '<span class="bj-chip still ' + tint(p.pl) + '">' + esc(signed(p.pl)) + '</span>' : '';
    }
    var row = el('mkRow-' + c.code);
    if (row) {
      // the sparkline is a picture, so the row says in words what it shows
      row.setAttribute('aria-label', c.name + ', ' + fmtInt(credOf(c, c.ticks)) + ', '
        + pctSaid(c.chgBp) + ' over ' + spanNow().said
        + (p ? ', holding ' + fmtInt(p.amount) + ', profit ' + signed(p.pl) : ', nothing held'));
      row.title = c.name + ' · ' + c.grade + ' · about ' + pct(c.volBp) + ' a day';
    }
  }
  // 40x16, the window's closes as one line. An SVG and not one <i> a candle: thirty-six bars across
  // forty pixels is a bar every 1.1px, which is not a shape
  function sparkHtml(c) {
    var rows = c.candles || [];
    if (rows.length < 2) return '';
    var lo = rows[0].c, hi = rows[0].c;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].c > hi) hi = rows[i].c;
      if (rows[i].c < lo) lo = rows[i].c;
    }
    var span = hi - lo || 1, pts = [];
    for (var k = 0; k < rows.length; k++) {
      pts.push(fx(k * 40 / (rows.length - 1)) + ',' + fx(1 + (1 - (rows[k].c - lo) / span) * 14));
    }
    return '<svg viewBox="0 0 40 16" width="40" height="16" aria-hidden="true"><polyline fill="none"'
      + ' stroke-width="1.3" stroke="var(--mk-' + (c.chgBp < 0 ? 'dn' : 'up') + ')" points="'
      + pts.join(' ') + '"/></svg>';
  }

  // --- one coin ----------------------------------------------------------------------------------

  function fx(v) { return Math.round(v * 100) / 100; }
  // where a price sits in the well, top down, as a percentage of its height
  function yAt(p, lo, span) { return fx((1 - (p - lo) / span) * 100); }

  // The chart. One <i> a body, and a wick only where there is one to see. Every window here is
  // wider than a minute a candle, so market.js has WICK_SAMPLES prices to sample inside a step and
  // most candles carry one; at one minute a step there was never one, the high and low being the
  // open and close, and the chart was thirty bodies and nothing else. Either way the test is the
  // candle, not the shape
  function mkChart(c) {
    var box = el('mkChart'); if (!box) return;
    var rows = c.candles || [];
    if (!rows.length) { box.innerHTML = ''; return; }
    var lo = rows[0].l, hi = rows[0].h;
    for (var i = 1; i < rows.length; i++) {
      if (rows[i].h > hi) hi = rows[i].h;
      if (rows[i].l < lo) lo = rows[i].l;
    }
    var span = hi - lo || 1;          // a window that never moved still has to be drawn somewhere
    var slot = 100 / rows.length, html = '';
    for (var k = 0; k < rows.length; k++) html += candleHtml(rows[k], k, slot, lo, span);
    html += markHtml(c, lo, hi, span);
    box.innerHTML = html;
    box.setAttribute('aria-label', c.name + ' ' + fmtInt(credOf(c, c.ticks)) + ', '
      + pctSaid(c.chgBp) + ' over ' + spanNow().said + ', low ' + fmtInt(credOf(c, lo))
      + ', high ' + fmtInt(credOf(c, hi)));
    mkAxis(c, lo, hi);
  }
  function candleHtml(r, k, slot, lo, span) {
    var up = r.c >= r.o;
    var cls = up ? 'mk-rise' : 'mk-fall';
    var top = yAt(up ? r.c : r.o, lo, span), bot = yAt(up ? r.o : r.c, lo, span);
    var out = '<i class="mk-body ' + cls + '" style="left:' + fx(k * slot + slot * (1 - MK_BODY) / 2)
      + '%;width:' + fx(slot * MK_BODY) + '%;top:' + top + '%;height:' + fx(bot - top) + '%"></i>';
    if (r.h > Math.max(r.o, r.c) || r.l < Math.min(r.o, r.c)) {
      var wt = yAt(r.h, lo, span);
      out += '<i class="mk-wick ' + cls + '" style="left:' + fx(k * slot + slot / 2)
        + '%;top:' + wt + '%;height:' + fx(yAt(r.l, lo, span) - wt) + '%"></i>';
    }
    return out;
  }
  // Where this position was opened, when that price is inside the window being drawn. Outside it the
  // line would sit on an edge it does not belong to, which is a drawing that lies: the entry is in
  // the line under the profit either way
  function markHtml(c, lo, hi, span) {
    var p = c.position;
    if (!p || p.entryTicks < lo || p.entryTicks > hi) return '';
    return '<i class="mk-mark" style="top:' + yAt(p.entryTicks, lo, span) + '%"></i>';
  }
  function mkAxis(c, lo, hi) {
    var ax = el('mkAx'); if (!ax) return;
    ax.innerHTML = '<span>low ' + esc(fmtInt(credOf(c, lo))) + '</span>'
      + '<span>high ' + esc(fmtInt(credOf(c, hi))) + '</span>';
  }
  // The heading, which is this screen's only chrome and therefore says which of the two depths is
  // open. The title names it and the corner carries the one figure that outlives the panel at that
  // depth (docs/game-panels.md, section 2):
  //
  //   the list of coins   `Coin Market`   every open position's profit, together
  //   one coin            `CRAB`          that coin's price, which the crumb used to hold
  //
  // The sum is NOT repeated at the coin depth. With one position open it is the same number as the
  // block under it, 44px away and the same colour, and two places saying one figure is one of them
  // saying nothing. The price is what the crumb was for and it has nowhere else to be
  function mkHead(st, c) {
    var t = el('mkTtl');
    if (t) t.textContent = c ? c.code : mk.title;
    // and the arrow says which step it is about to take. The shared one says "All games", which is
    // the truth at one of the two depths only
    var b = el('mkBack');
    if (b) b.title = c ? 'All coins (Esc)' : mk.backTitle;
    var s = el('mkSide'); if (!s) return;
    if (c) {
      s.textContent = fmtInt(credOf(c, c.ticks));
      s.className = 'bj-side';
      s.title = c.name + ' · ' + pctSaid(c.chgBp) + ' over ' + spanNow().said;
      return;
    }
    s.textContent = st.holding ? signed(st.heldPl) : '';
    s.className = 'bj-side ' + (st.holding ? dirCls(st.heldPl) : '');
    s.title = st.holding ? st.holding + ' open · ' + fmtInt(st.held) + ' in · '
      + fmtInt(st.heldPayout) + ' if sold now' : '';
  }
  // The period row: which window is on screen, and the change that window is the base of, at the
  // other end of the same line. Nothing else says what the change is measured against, so the
  // answer is the place: `1M ····· +19.1%` is one reading
  function mkSpanRow(c) {
    var box = el('mkSpan');
    if (box) {
      var bs = box.children;
      for (var i = 0; i < bs.length; i++) {
        var on = bs[i].getAttribute('data-span') === mk.span;
        bs[i].classList.toggle('on', on);
        bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    mkSpanLock();
    var chg = el('mkChg'); if (!chg) return;
    chg.textContent = c ? pctSigned(c.chgBp) : '';
    chg.className = 'mk-chg ' + (c ? dirCls(c.chgBp) : '');
  }
  // While a trade is settling the window cannot change, and the chips say so rather than taking a
  // press and dropping it. The same rule the stake chips under them follow (CUC.renderStakes)
  function mkSpanLock() {
    var box = el('mkSpan'); if (!box) return;
    var bs = box.children;
    for (var i = 0; i < bs.length; i++) bs[i].disabled = !!mk.locked;
  }
  // A chip was pressed. The chip lights at once and the candles land with the reply, because the
  // window is the host's to build: what goes out is the KEY (see MK_SPANS). A press while a trade
  // is in flight is dropped rather than queued, so the screen never shows a window the host was
  // not asked for
  function mkSetSpan(key) {
    if (!key || key === mk.span || mk.busy || mk.locked) return;
    mk.span = key;
    mkSpanRow(coinOf(mk.st, mk.coin));
    mkSend('open', { span: key });
  }
  // The max block when there is one, and nothing at all when there is not. What is drawn here is the
  // figure that moved while the panel was shut, which is the reason to open it again
  function mkPl(c) {
    var box = el('mkPlBox'), big = el('mkPl'), sub = el('mkPlSub');
    if (!box || !big || !sub) return;
    var p = c && c.position;
    box.hidden = !p;
    if (!p) { big.textContent = ''; sub.textContent = ''; return; }
    big.textContent = signed(p.pl);
    big.className = 'mk-pl ' + dirCls(p.pl);
    // The profit is NOT also said as a percentage here. It was, and 29px under it the period line
    // carries the market's own change in the same colours and the same sign, so the two read as one
    // figure and neither says which it is (docs/game-panels.md, section 5-10 already held this for
    // the list rows and missed it here). What is left is what the big number cannot say: what went
    // in, at what price, and for how long
    sub.textContent = units(p.unitsMilli) + ' ' + c.code + ' · ' + fmtInt(p.amount) + ' in at '
      + (p.lots > 1 ? 'avg ' : '') + fmtInt(credOf(c, p.entryTicks))
      + (p.lots > 1 ? ' (' + p.lots + ' buys)' : '')
      + ' · held ' + age(p.heldMs + mk.since);
  }
  // Behind the one toggle every screen folds its table into (docs/game-panels.md, section 5). What
  // belongs here is what decides which coin to buy, and all of it is off the reply.
  // The FEE is one of those lines rather than a sentence under the Buy button: it is the same fact at
  // every depth and in every state, and a sentence that is always on screen is a screen explaining
  // itself. The figure is still the host's (`feeBp`), never a string written here
  function mkPays(c) {
    var box = el('mkPays'), st = mk.st;
    if (!box || !st) return;
    box.innerHTML = esc(c.name) + ' · ' + esc(c.grade) + ' · moves about ' + pct(c.volBp) + ' a day<br>'
      + 'Now ' + pctSigned(c.baseBp) + ' of its ' + fmtInt(c.base) + ' base, inside a band '
      + st.bandX + '× either way<br>'
      + 'Round trip ' + pct(st.feeBp) + ', taken when you sell · stake ' + fmtInt(st.minBuy)
      + ' to ' + fmtInt(st.maxBuy) + '<br>'
      + 'Up to ' + st.maxLots + ' buys a coin, sold together · ' + fmtInt(st.trades) + ' round trips closed, best ' + fmtInt(st.best);
  }

  // --- the line under the amount box, and the controls -------------------------------------------

  // One line and one owner. It carries the verdict of the trade that just landed, or, when there is
  // none, what the typed amount comes to in the other unit (or why it is refused). Never both: a
  // verdict is about the trade that happened and the conversion is about the one being typed, so the
  // newer fact is the one on screen. The figures are the host's either way (`last`, `ticks`)
  function mkConvLine() {
    var line = el('mkConv'); if (!line) return;
    if (mk.chip) {
      line.className = 'mk-conv';
      line.innerHTML = '<span class="bj-chip' + (mk.chip.tint ? ' ' + mk.chip.tint : '') + '">'
        + esc(mk.chip.text) + '</span>';
      return;
    }
    var cv = mk.conv;
    line.className = 'mk-conv' + (cv && cv.bad ? ' bad' : '');
    line.textContent = cv ? cv.text : '';
  }
  // Thousandths of a coin, as a reader writes them: 0.7, 12.345, 3
  function units(milli) {
    var v = (milli || 0) / 1000;
    return v.toFixed(3).replace(/\.?0+$/, '');
  }
  // A coin's price in credits as a fraction, for turning coins into credits and back. A unit change
  // the host declared (ticksPerCredit), not a price: the price is c.ticks, which the host sent
  function perCoin(c) { return c.ticks / (mk.st.ticksPerCredit || 100); }
  // What the purse lets this market stake now, capped at one buy's ceiling
  function room() {
    var f = CUC.free('mk');
    return f == null ? 0 : Math.min(f, mk.st.maxBuy);
  }
  // The box read as whole credits, or 0 when it does not read as a number. Coins are rounded to the
  // nearest credit, which is the stake that actually goes in
  function mkAmount(c) {
    var v = Number(String(mk.typed).replace(/,/g, '').trim());
    if (!isFinite(v) || v <= 0) return 0;
    return mk.unit === 'sh' ? Math.round(v * perCoin(c)) : Math.floor(v);
  }
  function mkSetAmount(c, credits) {
    if (mk.unit === 'sh') {
      var u = Math.floor(credits / perCoin(c) * 1000) / 1000;
      mk.typed = u.toFixed(3).replace(/\.?0+$/, '');
    } else mk.typed = String(credits);
    var box = el('mkAmt'); if (box) box.value = mk.typed;
  }
  // The chip is the trade just made, kept here rather than read back off the state: an open carries
  // the last trade too, and coming back into the market is not that trade happening again.
  // Each line carries the figure that actually moved, all of it off the reply (market.js puts them
  // on `last`): a buy names what went in and the price it went in at, a sale names the profit
  function mkChipOf(last) {
    if (!last) { mk.chip = null; return; }
    var c = coinOf(mk.st, last.ticker);
    mk.chip = last.op === 'buy'
      ? { text: 'Bought ' + fmtInt(last.amount) + ' at ' + fmtInt(credOf(c, last.entryTicks)), tint: '' }
      : { text: 'Sold ' + signed(last.pl) + ' · paid ' + fmtInt(last.payout), tint: tint(last.pl) };
  }
  // Two buttons at most, which is the control row's own limit (docs/game-panels.md, section 1), and
  // the third thing a market would need (which coin) is the list behind it rather than a button.
  // Both can be up at once: a coin already held can be bought again (1.23.0), so `Add` stands beside
  // `Sell`. The spec held "one at a time" until this was measured; the code was the newer of the two
  function mkButtons() {
    var st = mk.st, c = coinOf(st, mk.coin);
    var buy = el('mkDeal'), sell = el('mkSell'), row = el('mkAmtRow'), ctl = el('mkCtl');
    if (!buy || !sell || !ctl) return;
    var hold = !!(c && c.position);
    if (ctl) ctl.hidden = !c;
    if (row) row.hidden = !c;
    buy.hidden = !c;
    sell.hidden = !c || !hold;
    // the fold belongs to a coin, and below the control row it would otherwise stand under the list
    // with the last coin's facts still in it
    mkFold(!!c);
    if (!c) { CUC.note('mkNote', ''); mk.conv = null; mkConvLine(); return; }
    mkBuyBtn(buy, sell, st, c);
    if (hold) mkSellBtn(sell, c);
  }
  // The paytable toggle, which exists only at the coin depth. Closing it on the way out rather than
  // leaving it open keeps the button and the fold agreeing about each other
  function mkFold(on) {
    var why = el('mkWhy'), pays = el('mkPays');
    if (why) why.hidden = !on;
    if (!on && pays) { pays.hidden = true; if (why) why.setAttribute('aria-expanded', 'false'); }
  }
  // What the purse would be paid, which already has the fee in it (market.js's payoutOf). The price
  // rides on the button the way the forge's fee does, so the question the button asks is answered on
  // the button, and the fee is not said twice
  function mkSellBtn(sell, c) {
    sell.textContent = 'Sell ' + fmtInt(c.position.payout);
    sell.disabled = !!mk.locked || !c.can.sell;
    sell.title = c.can.sell ? 'Sell (S)' : (c.why.sell || 'Sell');
  }
  // The amount, the unit, the shortcuts and the Buy button, from what is typed and what the purse holds.
  // The host still checks all of it; this only keeps a button lit that the host would refuse dark
  function mkBuyBtn(buy, sell, st, c) {
    sell.textContent = 'Sell';
    var amt = mkAmount(c), max = room(), known = CUC.free('mk') != null;
    var us = document.querySelectorAll('#mkUnit button');
    for (var i = 0; i < us.length; i++) {
      var on = us[i].getAttribute('data-u') === mk.unit;
      us[i].classList.toggle('on', on); us[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      us[i].disabled = !!mk.locked;
    }
    var ps = document.querySelectorAll('#mkPick button');
    for (var j = 0; j < ps.length; j++) ps[j].disabled = !!mk.locked || max < st.minBuy;
    var box = el('mkAmt'); if (box) { box.disabled = !!mk.locked; if (document.activeElement !== box) box.value = mk.typed; }
    var why = !c.can.buy ? (c.why.buy || 'Buy')
      : !amt ? 'Type an amount'
        : amt < st.minBuy ? 'At least ' + fmtInt(st.minBuy) + ' credits'
          : amt > st.maxBuy ? 'At most ' + fmtInt(st.maxBuy) + ' credits a buy'
            : known && amt > max ? 'Not enough credits'
              : '';
    buy.disabled = !!mk.locked || !!why;
    buy.setAttribute('data-bet', why ? '0' : String(amt));
    // `Add` and not `Buy more`. At a sidebar dragged to 250 the two buttons are 83px each, which is
    // 71px of text, and `Buy more 100` wanted two lines of a 34px button, which section 1 does not
    // allow. Measured at 12px/700 in that 71px: `Add 100` is 44.8px and `Add 100,000` 70.1px, the
    // same range `Buy 100,000` (69.0px) already has, so the second button adds no width case the
    // first one did not have. The word that goes is the one the screen has already said: a position
    // is open, and its size and its entry are in the line under the profit
    buy.textContent = (c.position ? 'Add ' : 'Buy ') + (amt ? fmtInt(amt) : '');
    buy.title = why || (c.position ? 'Buy more of this coin (B)' : 'Buy (B)');
    mk.conv = { bad: !!(why && amt), text: why && amt ? why
      : !amt ? ''
        : mk.unit === 'sh' ? '= ' + fmtInt(amt) + ' credits'
          : '≈ ' + units(Math.round(amt / perCoin(c) * 1000)) + ' ' + c.code };
    mkConvLine();
    CUC.note('mkNote', known && max < st.minBuy && !c.position ? (CUC.balance() >= st.minBuy ? CUC.heldElsewhere + '.' : 'You need ' + fmtInt(st.minBuy) + ' credits to play.') : '');
  }
  function mkLock(locked) { mk.locked = !!locked; mkButtons(); mkSpanLock(); }

  // --- drawing one reply -------------------------------------------------------------------------

  function mkShow() {
    var list = el('mkList'), coin = el('mkCoin'), head = el('mkLHead');
    if (list) list.hidden = !!mk.coin;
    if (head) head.hidden = !!mk.coin;   // the window's name belongs to the list it heads
    if (coin) coin.hidden = !mk.coin;
  }
  function mkPaint() {
    var st = mk.st; if (!st) return;
    mkRows(st);
    if (mk.coin && !coinOf(st, mk.coin)) mk.coin = null;   // a coin that is no longer on the list
    mkShow();
    var c = coinOf(st, mk.coin);
    mkHead(st, c);            // the heading says which depth this is: see mkHead
    if (c) { mkSpanRow(c); mkPl(c); mkChart(c); mkPays(c); }
    mkButtons();              // which draws the conv line, the one owner of it
  }
  // Nothing is drawn and nothing is promised until the host answers the first open. The window's
  // name goes with the rows it heads: a heading over an empty list names a window nobody has been
  // shown yet
  function mkBlank() {
    var box = el('mkList'); if (box) box.innerHTML = '';
    var head = el('mkLHead'); if (head) head.textContent = '';
    mkShow();
    var ctl = el('mkCtl'); if (ctl) ctl.hidden = true;
    var row = el('mkAmtRow'); if (row) row.hidden = true;
    mkFold(false);
  }
  // The cards of this game are drawn as bare divs, and the figure that matters is a colour and a
  // sign, so whatever a sighted player sees happen is said here once a trade
  function mkAnnounce(last) {
    if (!last || !mk.st) return;
    var c = coinOf(mk.st, last.ticker), nm = c ? c.name : last.ticker;
    var what = last.op === 'buy'
      ? 'Bought ' + fmtInt(last.amount) + ' credits of ' + nm + ' at ' + fmtInt(credOf(c, last.entryTicks))
      : 'Sold ' + nm + ' for ' + fmtInt(last.payout) + ', ' + signed(last.pl) + ' on the trip';
    CUC.live('mkLive', what + '. ' + signed(mk.st.net || 0) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }

  // --- the beat ----------------------------------------------------------------------------------

  // Every MK_T.tick while the panel is open. Two jobs, and neither of them is pricing:
  //  - the held time keeps counting, so an open position is not a frozen picture
  //  - when the minute the drawn state belongs to is over, the host is ASKED for the next one
  // The beat is COUNTED, not read off a clock: `since` is this panel's own count of its own beats
  // and the minute it is compared against is the host's `nowMs`. So the screen never holds a time of
  // its own, which is what keeps the next minute's price out of its reach (market.js, section 5)
  function mkBeat() {
    mk.tick = setTimeout(mkBeat, MK_T.tick);
    var st = mk.st; if (!st) return;
    mk.since += MK_T.tick;
    var c = coinOf(st, mk.coin);
    if (c && c.position) mkPl(c);          // between minutes this is the only figure that can move
    // `asked` is a high-water mark and not the last value: a reply that came back still inside the
    // old minute leaves the beat counting from a minute that has already been asked about, and
    // asking again is the same question with a longer wait on it
    var next = minuteOf(st.nowMs + mk.since);
    if (next > minuteOf(st.nowMs) && next > mk.asked && !mk.busy) { mk.asked = next; mkAsk(); }
  }
  // An unasked redraw. It takes no button away and nothing is paced when it lands: the reply carries
  // a number this panel is not waiting on, so mkReceive draws it exactly as it stands.
  // It names the window it wants, like every other open this panel sends: the host remembers the
  // last key for the redraws nobody asked for (its onPush), and a panel that sent the key only when
  // it changed would be trusting that memory to have survived a webview reload
  function mkAsk() { CUC.post('mk', 'open', { span: mk.span }); }

  // --- messages ----------------------------------------------------------------------------------

  function mkSend(op, extra) {
    if (mk.busy) return;
    mk.busy = true; mk.op = op;
    if (op !== 'open') mkLock(true);
    mk.n = CUC.post('mk', op, extra);
    clearTimeout(mk.to);
    mk.to = setTimeout(function () {
      mk.busy = false; mk.op = null;
      CUC.err('mkErr', 'The market didn’t respond. Try again.');
      mkLock(false);
    }, MK_T.noReply);
  }
  // A reply with no state: the host could not describe the market (games/README.md, section 5). The
  // reason shows and everything drawn stays drawn, which matters more here than at a card table: a
  // position is the player's property, and a screen wiped back to an empty list is the one reading
  // they cannot tell from "my position is gone".
  //
  // awaited is false for a reply nobody asked for, and then the pacing already running is left to
  // finish: it belongs to a state this reply says nothing about
  function mkFault(m, awaited) {
    CUC.err('mkErr', m.error || 'The market could not be shown. Try again.');
    if (!awaited) return;
    mk.busy = false;
    clearTimeout(mk.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    mkLock(false);
    mkFocusAfter();
  }
  function mkReceive(m) {
    var current = mk.op != null && m.n === mk.n;
    if (!current && mk.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('mk', m);
    if (!m.state) { var awaited = current; mk.op = null; return mkFault(m, awaited); }
    var op = current ? mk.op : null;
    clearTimeout(mk.to); mk.timers.clear();
    mk.op = null;
    mk.st = m.state;
    // the beat starts again from this state's own minute. `asked` is NOT reset: it is the last
    // minute an ask went out for, and if the answer came back still inside the old minute (a host
    // whose clock has not turned over yet) a second ask would be the same question again
    mk.since = 0;
    mk.chip = null;                          // the last verdict goes now; this one lands with its step
    var last = mk.st.last;
    var moved = !m.error && !!op && op !== 'open' && !!last && last.op === op;
    try {
      CUC.err('mkErr', m.error || '');
      mkLock(true);
    } finally {
      mkRun(m, moved, last);
    }
  }
  // The state lands at once and the verdict a beat after it, which is the only pacing this screen
  // has (docs/game-panels.md, section 6: a trade settles in 200ms). A reply that is nobody's move,
  // and reduced motion, draw the whole thing in one step
  function mkRun(m, moved, last) {
    // the header waits for this reply's settle, like every other table: a payout is not a credit
    // earned, and a stake leaving is not a credit lost
    CUC.hold();
    var wait = (moved && !CUC.reduceMotion()) ? MK_T.trade : 0;
    mk.timers.at(0, mkPaint);
    mk.timers.at(wait, function () {
      if (moved) mkChipOf(last);
      mkSettle(m, moved);
    });
  }
  function mkSettle(m, fresh) {
    mk.busy = false;
    try {
      CUC.settle(m);
      mkConvLine();
      if (fresh) mkAnnounce(mk.st.last);
    } finally {
      mkLock(false);
      mkFocusAfter();
    }
  }

  // --- the two depths ----------------------------------------------------------------------------

  function mkOpenCoin(code) {
    mk.coin = code; mk.chip = null; mk.wantFocus = true;
    mkPaint();
    mkFocusAfter();
  }
  function mkOpenList() {
    var was = mk.coin;
    mk.coin = null; mk.chip = null;
    mkPaint();
    var row = was && el('mkRow-' + was);     // back to the row that was opened, not to nowhere
    if (row) row.focus();
  }
  function mkFocusAfter() {
    if (CUC.current() !== 'market' || !mk.coin) return;
    var a = document.activeElement, panel = el('panelMarket');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!mk.wantFocus && !lost) return;
    mk.wantFocus = false;
    var sell = el('mkSell'), buy = el('mkDeal');
    // the heading's own arrow is the fallback now that the crumb's button is gone: it is the one
    // control that is always there, and from it Tab reaches everything else
    var target = sell && !sell.hidden && !sell.disabled ? sell
      : (buy && !buy.hidden && !buy.disabled ? buy : el('mkBack'));
    if (target && !target.hidden && !target.disabled) target.focus();
  }

  CUC.game('market', {
    key: 'mk',
    panelId: 'panelMarket',
    cls: 'mk',
    markup: markup,
    init: function () {
      // the heading's own title, read once: it is what the title goes back to when the coin closes,
      // and the register owns the string (meta.title), not this file
      var t = el('mkTtl'); mk.title = t ? t.textContent : '';
      var b = el('mkBack'); mk.backTitle = b ? b.title : '';
      mkBlank();
      var amt = el('mkAmt');
      amt.addEventListener('input', function () { mk.typed = this.value; mkButtons(); });
      amt.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var d = el('mkDeal'); if (d && !d.disabled && !d.hidden) d.click();
      });
      el('mkUnit').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-u]') : null;
        var c = coinOf(mk.st, mk.coin);
        if (!b || b.disabled || !c) return;
        var u = b.getAttribute('data-u'); if (u === mk.unit) return;
        var credits = mkAmount(c);     // the same stake, said in the other unit
        mk.unit = u;
        if (credits) mkSetAmount(c, credits);
        mkButtons();
      });
      el('mkPick').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-f]') : null;
        var c = coinOf(mk.st, mk.coin);
        if (!b || b.disabled || !c) return;
        mkSetAmount(c, Math.floor(room() * Number(b.getAttribute('data-f')) / 100));
        mkButtons();
      });
      el('mkList').addEventListener('click', function (e) {
        var row = e.target.closest ? e.target.closest('.mk-row') : null;
        if (!row) return;
        mkOpenCoin(row.getAttribute('data-code'));
      });
      el('mkSpan').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button[data-span]') : null;
        if (!b) return;
        mkSetSpan(b.getAttribute('data-span'));
      });
      CUC.why('mkWhy', 'mkPays');
      el('mkDeal').addEventListener('click', function () {
        if (this.disabled || this.hidden || !mk.coin) return;
        var bet = Number(this.getAttribute('data-bet'));
        if (!bet) return;
        mkSend('buy', { ticker: mk.coin, amount: bet });
      });
      el('mkSell').addEventListener('click', function () {
        if (this.disabled || this.hidden || !mk.coin) return;
        mkSend('sell', { ticker: mk.coin });
      });
    },
    enter: function () {
      mkLock(true);
      mk.since = 0; mk.asked = 0;
      mkSpanRow(null);                 // the chip that is on, before there is a figure beside it
      clearTimeout(mk.tick);
      mk.tick = setTimeout(mkBeat, MK_T.tick);
      mkSend('open', { span: mk.span });
    },
    leave: function () {
      mk.timers.clear();
      clearTimeout(mk.to);
      clearTimeout(mk.tick); mk.tick = null;   // the beat is this panel's and it stops with it
      mk.busy = false; mk.op = null;
    },
    receive: mkReceive,
    // The heading's arrow, one step at a time (games/README.md, section 4). This game is two deep,
    // so from a coin the arrow closes the coin and from the list it leaves the market. It is the same
    // step Escape takes, which is why there is no second arrow on the screen any more
    up: function () { if (!mk.coin) return false; mkOpenList(); return true; },
    // The row's figure, drawn whether this panel was ever built or not: the lists rows are in the
    // page from the first paint, and a figure you have to open the panel to see cannot be the reason
    // you open it. A reply with no state says nothing about positions, so it leaves the row alone
    fig: function (m) {
      if (!m.state) return;
      var st = m.state;
      if (!st.holding) return CUC.rowFig('market', null);
      CUC.rowFig('market', signed(st.heldPl), st.heldPl > 0 ? 'up' : st.heldPl < 0 ? 'down' : null);
    },
    // a credit minted while the buy screen is up lights the chips at once
    credits: function () { if (mk.coin) mkButtons(); },
    keys: function (e) {
      if (!mk.coin) return;              // on the list the rows are buttons: Tab and Enter already work
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); mkOpenList(); return; }
      var k = String(e.key).toLowerCase();
      var hit = k === 'b' ? el('mkDeal') : k === 's' ? el('mkSell') : null;
      if (hit) { e.preventDefault(); if (!hit.disabled && !hit.hidden) hit.click(); return; }
      // Enter buys only when nothing is held: with a position open both buttons are up, and a key
      // that might sell is not a key to press by accident
      var t = e.target, sell = el('mkSell');
      var prim = sell && !sell.hidden ? null : el('mkDeal');
      if (e.key === 'Enter' && (!t || t.tagName !== 'BUTTON') && prim && !prim.disabled && !prim.hidden) {
        e.preventDefault();
        prim.click();
      }
    }
  });
})();
