// The tower's screen: one question, "one more floor or take the money". The whole building is the
// biggest block, because what makes this game different from the minefield is that the climb stays
// behind you. Every figure printed here is one view() sent: each floor's price is `rows[i].mult100`
// and the next floor's odds are `next.chance`, both as they arrived. Nothing is divided here.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // Ten floors and at most four doors, which the markup is built out of before any reply has
  // arrived. The host sends `floors` and `cells` too, and the doors are rebuilt from `cells` the
  // moment a difficulty with a different count is dealt
  var FLOORS = 10, MAX_DOORS = 4;

  // open/fall are the two door animations and are paired with the CSS in meta.js (.tw-d.swing is
  // .2s, .tw-d.spring is .18s). settle is the beat the numbers follow a safe climb on (open + 100).
  // revealStep/revealCap open every floor at the end of a round: 45ms a floor, the whole wave
  // inside 420ms, which nine floors fit exactly (docs/game-panels.md, section 6)
  var TW_T = { open: 200, settle: 300, fall: 180, revealStep: 45, revealCap: 420, noReply: 4000 };

  // This table's floor, which is tower.js's MIN_BET. A panel is webview-side and cannot require the
  // engine, so the figure is written here and handed to the shared chips, which close every chip
  // under it and ask for this amount in the short-purse note. Without a floor the first Deal on an
  // untouched install sends 10 and the host refuses it: a dead button with a sentence under it.
  // meta.js prints the same figure in `sub` and in the heading's title=
  var TW_MIN = 100;

  var tw = { st: null, busy: false, op: null, cell: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false, phase: null, doors: 0 };
  var SU = CUC.stakeUi('tw', { min: TW_MIN });

  // --- numbers, as the host sent them -----------------------------------------------------------

  // Hundredths to a printed multiple, which is the floor's (CUC.xMult100): the engine already read
  // this figure back OUT of the payout it will really pay (tower.js's mult100Of), so printing it
  // only moves the decimal point. The minefield prints its rungs the same way
  var mult = CUC.xMult100;
  // What a difficulty is called on its button: how many of its doors are safe. That is the game
  // itself rather than a word for it, and three fractions fit the 152px control row where
  // "Easy Normal Hard" does not
  function ratio(c) { return (c.cells - c.traps) + '/' + c.cells; }
  var TW_WORD = { took: 'taken', trap: 'a trap', sprung: 'the trap' };
  function doorLabel(f, c, k) {
    return 'floor ' + (f + 1) + ' door ' + (c + 1) + (TW_WORD[k] ? ', ' + TW_WORD[k] : '');
  }

  // --- markup -----------------------------------------------------------------------------------

  // Floor ten at the top, so the building is drawn the way it is climbed. The doors inside a row
  // are made when the first round says how many there are
  function floors() {
    var s = '';
    for (var f = FLOORS - 1; f >= 0; f--) {
      s += '<div class="tw-row tw-ahead" id="twR' + f + '">'
        + (f < FLOORS - 1 ? '<i class="gm-rule tw-rh"></i>' : '')
        + '<div class="tw-doors" id="twD' + f + '"></div>'
        + '<span class="tw-m" id="twM' + f + '"></span></div>';
    }
    return s + '<i class="gm-rule tw-rv"></i>';
  }
  function markup() {
    return CUC.frame('tower')
      + '<div class="bj-felt">'
      +   '<div class="tw-tower" id="twTower">' + floors() + '</div>'
      +   '<div class="hl-line" id="twLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="twWhy" aria-expanded="false" aria-controls="twPays">How it pays</button>'
      + '<div class="bj-pays" id="twPays" hidden></div>'
      + '<div class="bj-sr" id="twLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="twNote" hidden></div>'
      + '<div class="warnbar" id="twErr" hidden></div>'
      + '<div class="bj-ctl" id="twBet">'
      +   '<div class="tw-pick"><span class="tw-lbl">Safe doors</span>'
      +     '<div class="bj-stakes" id="twDiffs" role="group" aria-label="Difficulty"></div></div>'
      +   CUC.stakesHtml('tw')
      +   '<button type="button" class="bj-btn primary" id="twDeal" title="Deal (Enter)">Deal</button></div>'
      // one button, because climbing is pressing a door and not pressing a button
      + '<div class="bj-ctl" id="twPlay" hidden>'
      +   '<button type="button" class="bj-btn primary" data-op="cashout" id="twCash" title="Cash out (C)">Cash out <b id="twCashAmt">0</b></button></div>';
  }

  // --- the building -----------------------------------------------------------------------------

  // The doors are rebuilt only when their COUNT changes: a difficulty with the same number of doors
  // keeps the elements, so the focus the keyboard is holding survives a redraw
  function doors(n) {
    if (tw.doors === n) return;
    tw.doors = n;
    for (var f = 0; f < FLOORS; f++) {
      var box = el('twD' + f); if (!box) continue;
      var s = '';
      for (var c = 0; c < n; c++) {
        s += '<button type="button" class="tw-d" data-f="' + f + '" data-c="' + c + '" disabled'
          + ' aria-label="' + doorLabel(f, c, '') + '"></button>';
      }
      box.innerHTML = s;
    }
  }
  // The price of floor f on the bet screen, which is the chosen difficulty's `fair[f]`: the same
  // array pays() lays out, and the same one the engine will charge. THE SCREEN IS NOT WORKING IT
  // OUT, it is picking the host's own figure out of the list it was sent. Without it the ten rungs
  // are ten empty strings, and pressing a difficulty chip moves nothing but the number of doors;
  // with it, 3/4 reads x1.29 .. x17 and 2/3 reads x1.72 .. x57, which is what a difficulty IS
  function rung(st, f) {
    var list = choices(st), id = pick(st);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return (list[i].fair && list[i].fair[f] != null) ? mult(list[i].fair[f]) : '';
    }
    return '';
  }
  // One floor. `traps` reveals that floor's trapped doors, which is what the end-of-round wave
  // turns on a floor at a time; `anim` plays the door animation.
  //
  // A row with no `rows[f]` behind it is the bet screen and is `offer` rather than `ahead`: `ahead`
  // is dimmed to .3 because those floors are not the player's this round, and on the bet screen
  // every floor is (games/tower/meta.js)
  function floor(st, f, traps, anim) {
    var row = el('twR' + f), box = el('twD' + f), m = el('twM' + f);
    if (!row || !box || !m) return;
    var r = st && st.rows && st.rows[f];
    var live = !!(st && st.phase === 'play');
    row.className = 'tw-row tw-' + (r ? r.where : 'offer');
    m.textContent = r ? mult(r.mult100) : rung(st, f);
    for (var c = 0; c < box.children.length; c++) {
      var b = box.children[c], k = '';
      if (r && r.where === 'past' && r.pick === c) k = 'took';
      else if (r && traps && r.traps && r.traps.indexOf(c) >= 0) {
        k = (st.hit && st.hit.floor === f && st.hit.cell === c) ? 'sprung' : 'trap';
      }
      b.className = 'tw-d' + (k ? ' ' + k : '')
        + (anim === c ? (k === 'sprung' ? ' spring' : ' swing') : '');
      b.disabled = !(live && r && r.where === 'now');
      b.setAttribute('aria-label', doorLabel(f, c, k));
    }
  }
  // How many doors the bet screen draws: the difficulty the player has picked, not the host's
  // default, so the building changes under the chips as they are pressed
  function shownDoors(st) {
    var list = choices(st), id = pick(st);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].cells;
    return (st && st.cells) || MAX_DOORS - 1;
  }
  // The whole building. `traps` is the set of floors whose traps are open, or null for all of them
  function tower(st, traps, animFloor, animDoor) {
    doors(st && st.phase !== 'bet' ? st.cells : shownDoors(st));
    for (var f = 0; f < FLOORS; f++) {
      floor(st, f, !traps || traps[f], animFloor === f ? animDoor : -1);
    }
  }
  // Opens every floor's traps outward from the one the round ended on, and answers how long that
  // takes. Nine floors at TW_T.revealStep is 405ms and fits TW_T.revealCap exactly, so the step is
  // the figure the spec names rather than one squeezed to fit (the minefield's 25 cells cannot be)
  function reveal(st, from, lead) {
    var last = 0;
    for (var f = 0; f < FLOORS; f++) {
      if (f === from) continue;
      var at = Math.min(Math.abs(f - from) * TW_T.revealStep, TW_T.revealCap);
      if (at > last) last = at;
      (function (i, when) {
        tw.timers.at(lead + when, function () { floor(st, i, true, -1); });
      })(f, at);
    }
    return last;
  }

  // --- the line, the toggle and the read-out ----------------------------------------------------

  var TW_END = { fell: ['lose', 'Fell'], cashout: ['win', 'Cashed out'], topped: ['bj', 'Topped out'] };
  function verdict(st) {
    var v = TW_END[st.ended] || ['', 'Round over'];
    return '<span class="bj-chip ' + v[0] + '">' + v[1] + ' ' + signed(st.net || 0) + '</span>';
  }
  function line(st) {
    var e = el('twLine'); if (!e) return;
    if (!st || st.phase === 'bet') { e.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase === 'done') { e.innerHTML = verdict(st); return; }
    // before the first floor there is nothing to cash out, so the pot is the bet that is riding
    var html = CUC.pot(st.cash == null ? st.bet : st.cash, false);
    if (st.next) {
      html += '<span class="bj-chip" title="what one more floor pays, and the odds a door is safe">'
        + mult(st.next.mult100) + ' · ' + st.next.chance.num + '/' + st.next.chance.den + '</span>';
    }
    e.innerHTML = html;
  }
  // The three towers side by side, folded away. Every floor's price for every difficulty is thirty
  // numbers, and thirty numbers on the felt would be the screen
  function pays(st) {
    var box = el('twPays'); if (!box) return;
    var list = (st && st.choices) || [];
    if (!list.length) { box.innerHTML = ''; return; }
    var out = ['<div class="tw-pr"><b></b>' + list.map(function (c) { return '<b>' + ratio(c) + '</b>'; }).join('') + '</div>'];
    for (var n = 0; n < FLOORS; n++) {
      out.push('<div class="tw-pr"><span>' + (n + 1) + '</span>'
        + list.map(function (c) { return '<span>' + mult(c.fair[n]) + '</span>'; }).join('') + '</div>');
    }
    box.innerHTML = out.join('');
  }
  function announce(st, f) {
    var said = [];
    if (st.phase === 'done') {
      said.push((TW_END[st.ended] || ['', 'Round over'])[1] + ' ' + signed(st.net || 0));
      if (st.ended === 'fell' && st.hit) said.push('The trap was on floor ' + (st.hit.floor + 1));
      said.push('Balance ' + fmtInt(CUC.balance() || 0));
    } else {
      said.push('Floor ' + (f + 1) + ' is clear');
      if (st.cash != null) said.push('Cash out ' + fmtInt(st.cash));
      if (st.next) said.push('Next ' + mult(st.next.mult100));
    }
    CUC.live('twLive', said.join('. ') + '.');
  }

  // --- the difficulty, which the deal chooses ---------------------------------------------------

  // The difficulties are the host's (`choices`) and so is the default (`diff`). The webview only
  // remembers which of them was picked last, the way the stakes remember theirs
  function choices(st) { return (st && st.choices && st.choices.length) ? st.choices : []; }
  function pick(st) {
    var list = choices(st), want = CUC.state().twDiff, ids = list.map(function (c) { return c.id; });
    if (ids.indexOf(want) >= 0) return want;
    return (st && ids.indexOf(st.diff) >= 0) ? st.diff : ids[0];
  }
  function diffs(st, locked) {
    var box = el('twDiffs'); if (!box) return;
    var list = choices(st), now = pick(st);
    if (box.children.length !== list.length) {
      box.innerHTML = list.map(function (c) {
        return '<button type="button" data-d="' + c.id + '" aria-label="' + c.id + ', ' + (c.cells - c.traps)
          + ' of ' + c.cells + ' doors are safe">' + ratio(c) + '</button>';
      }).join('');
    }
    for (var i = 0; i < box.children.length; i++) {
      var b = box.children[i], on = b.getAttribute('data-d') === now;
      b.disabled = !!locked;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  // --- controls ---------------------------------------------------------------------------------

  function controls(st, locked) {
    var play = !!(st && st.phase === 'play'), can = (st && st.can) || {};
    var bet = el('twBet'), pl = el('twPlay');
    if (bet) bet.hidden = play;
    if (pl) pl.hidden = !play;
    var amt = el('twCashAmt');
    if (amt) amt.textContent = fmtInt((st && st.cash) || 0);
    var cash = el('twCash');
    if (cash) cash.disabled = locked || !can.cashout;
    if (!play) { diffs(st, locked); CUC.renderStakes(SU, locked); }
  }
  function lock() {
    var all = document.querySelectorAll('#panel-tower .tw-d, #twPlay [data-op], #twStakes button, #twDiffs button');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('twDeal'); if (d) d.disabled = true;
  }
  function focusAfter() {
    if (CUC.current() !== 'tower') return;
    var play = tw.st && tw.st.phase === 'play';
    var swapped = tw.phase != null && play !== (tw.phase === 'play');
    tw.phase = tw.st ? tw.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-tower');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!tw.wantFocus && !swapped && !lost) return;
    tw.wantFocus = false;
    var target = play ? firstDoor() : el('twDeal');
    if (target && !target.disabled) target.focus();
  }
  function firstDoor() {
    var all = document.querySelectorAll('#panel-tower .tw-d');
    for (var i = 0; i < all.length; i++) if (!all[i].disabled) return all[i];
    return null;
  }

  // --- the host ---------------------------------------------------------------------------------

  function send(op, extra) {
    if (tw.busy) return;
    tw.busy = true; tw.op = op; tw.cell = (extra && extra.cell != null) ? extra.cell : null;
    if (op !== 'open') lock();
    tw.n = CUC.post('tw', op, extra);
    clearTimeout(tw.to);
    tw.to = setTimeout(function () {
      tw.busy = false; tw.op = null;
      CUC.err('twErr', 'The table didn’t respond. Try again.');
      controls(tw.st, false);
    }, TW_T.noReply);
  }

  function receive(m) {
    var current = tw.op != null && m.n === tw.n;
    if (!current && tw.op != null) return;     // an older reply while a newer request waits
    CUC.setHeld('tw', m);
    if (!m.state) { var awaited = current; tw.op = null; return fault(m, awaited); }
    var op = current ? tw.op : null, door = current ? tw.cell : null;
    clearTimeout(tw.to); tw.timers.clear();
    tw.op = null; tw.cell = null; tw.st = m.state;
    // acted: the reply to a move the player just made. A refused move changed nothing, so there is
    // nothing to pace: the building is drawn exactly as the host still holds it and nothing moves
    var acted = current && op !== 'open' && op !== 'deal' && !m.error;
    var fresh = acted && !CUC.reduceMotion();
    var settleAt = 0, at = tw.st.at;
    try {
      CUC.err('twErr', m.error || '');
      pays(tw.st);
      if (!fresh) { tower(tw.st); controls(tw.st, true); line(tw.st); }
      else settleAt = paceMove(tw.st, op, door);
    } finally {
      CUC.hold();
      if (settleAt) tw.timers.at(settleAt, function () { line(tw.st); });
      tw.timers.at(settleAt, function () { settle(m, acted, at); });
    }
  }

  // Draws the move and answers when the money lands.
  //  a safe climb: that one door swings open, and the numbers follow it at TW_T.settle
  //  a trap: the trap springs first, then every floor opens outward from the one it was on
  //  a cash-out or the top: there is nothing to spring, so the building just opens
  function paceMove(st, op, door) {
    var fell = st.ended === 'fell';
    if (st.phase !== 'done') {
      // the floor just cleared is `at - 1`: `where` has already moved on to the next one
      tower(st, {}, st.at - 1, door);
      lock();
      return TW_T.settle;
    }
    var from = fell ? st.hit.floor : Math.max(0, st.at - 1);
    var lead = fell ? TW_T.fall : (op === 'climb' ? TW_T.open : 0);
    var open = {};
    open[from] = true;
    tower(st, open, from, fell ? st.hit.cell : (op === 'climb' ? door : -1));
    lock();
    return lead + reveal(st, from, lead);
  }

  // A reply with no state: the host could not describe the tower (games/README.md, section 5). The
  // reason shows and the climb stays exactly as it is, doors, pot and next floor and all, because
  // the round is still the host's and nothing about it was decided here. tw.st is therefore kept,
  // so every redraw after this one is still drawn against the round the host holds.
  //
  // awaited is false for a reply nobody asked for, and then any pacing already running is left to
  // finish: it belongs to a state this reply says nothing about
  function fault(m, awaited) {
    CUC.err('twErr', m.error || 'The table could not be shown. Try again.');
    if (!awaited) return;
    tw.busy = false;
    clearTimeout(tw.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    tower(tw.st);
    controls(tw.st, false);
    focusAfter();
  }
  function settle(m, acted, at) {
    tw.busy = false;
    try {
      CUC.settle(m);
      // the building is drawn again rather than only unlocked: paceMove() closed every door while
      // the move was in flight, and a tower left closed is a round that cannot be climbed
      tower(tw.st);
      line(tw.st);
      if (acted) announce(tw.st, at - 1);   // after the balance, so the line can say where it landed
    } finally {
      controls(tw.st, false);
      focusAfter();
    }
  }

  CUC.game('tower', {
    key: 'tw',
    cls: 'tw',
    markup: markup,
    init: function () {
      CUC.renderStakes(SU, false); tower(null); line(null); diffs(null, false); pays(null);
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, tw.busy); });
      el('twDiffs').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b || b.disabled) return;
        var s = CUC.state(); s.twDiff = b.getAttribute('data-d'); CUC.setState(s);
        diffs(tw.st, false); tower(tw.st);
      });
      el('twDeal').addEventListener('click', function () {
        var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
        send('deal', { bet: bet, diff: pick(tw.st) });
      });
      el('twTower').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.tw-d') : null;
        if (!b || b.disabled) return;
        send('climb', { cell: Number(b.getAttribute('data-c')) });
      });
      el('twPlay').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-op]') : null;
        if (!b || b.disabled) return;
        send(b.getAttribute('data-op'));
      });
      CUC.why('twWhy', 'twPays');
    },
    enter: function () { tw.wantFocus = true; controls(tw.st, true); send('open'); },
    leave: function () { tw.timers.clear(); clearTimeout(tw.to); tw.busy = false; tw.op = null; tw.cell = null; },
    receive: receive,
    credits: function () { if (!tw.busy) { CUC.renderStakes(SU, false); controls(tw.st, false); } },
    // A round can be finished on the keyboard alone: Tab walks the doors of the floor being climbed
    // (every other floor's doors are disabled and skipped), Space or Enter opens the one in focus,
    // C cashes out, Enter on the bet screen deals
    keys: function (e) {
      var k = String(e.key).toLowerCase();
      CUC.press(e, '#twPlay', k === 'c' ? 'cashout' : null, 'twDeal', 'twBet');
    }
  });
})();
