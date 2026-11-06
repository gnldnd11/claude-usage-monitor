// Shut the Box's screen: which tiles do I close this throw with?
//
// The host owns the throws and the ruling on what can be closed (shutbox.js). `view().moves` is that
// ruling, as tile numbers, and THIS SCREEN NEVER ADDS ANYTHING UP. A tile is offered when some set
// in `moves` holds every tile already in hand plus that one, and the hand is sent the moment it IS
// one of those sets. So pressing anything the screen lets you press cannot be wrong, and the screen
// has no copy of the rule that could drift from the host's.
//
// There are no buttons on this screen at all once a round is live: the tiles take the whole move,
// which is why they are real buttons and why Tab and Enter finish a round on their own.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // A tile going down is a PRESS, so it is short: a round is up to nine of them and 250ms is the
  // ceiling for class 2 (docs/game-panels.md, section 6). The next throw follows it, and only the
  // end of a round gets the slower class-1 beat.
  // `close` is the .15s on `.sx-tile.shut` and `in` the .16s on `.sx-die.in .dc`, both in
  // games/shutbox/meta.js
  var SX_T = { close: 150, roll: 200, chip: 420, in: 160, noReply: 4000 };

  var sx = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, wantFocus: false,
    pick: [], phase: null };
  // the table's floor. 100 closes the 10 chip, opens the screen on 100 and asks for 100 in the
  // short-purse note (webview.js, stakeUi)
  var SU = CUC.stakeUi('sx', { min: 100 });

  // The dice are CUC.die(face, 48): one <use> into the sprite html.js puts in the page. Face 0 is
  // the unrolled die, which is what the bet screen stands up

  // --- markup ---------------------------------------------------------------------------------

  function markup() {
    return CUC.frame('shutbox')
      + '<div class="bj-felt">'
      +   '<div class="sx-dice" id="sxDice" role="img" aria-label="No throw yet"></div>'
      +   '<div class="sx-tiles" id="sxTiles"></div>'
      +   '<div class="hl-line" id="sxLine"></div>'
      + '</div>'
      + '<button type="button" class="bj-why" id="sxWhy" aria-expanded="false" aria-controls="sxPays">How it pays</button>'
      + '<div class="bj-pays" id="sxPays" hidden></div>'
      + '<div class="bj-sr" id="sxLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="sxNote" hidden></div>'
      + '<div class="warnbar" id="sxErr" hidden></div>'
      + '<div class="bj-ctl" id="sxBet">' + CUC.stakesHtml('sx')
      +   '<button type="button" class="bj-btn primary" id="sxDeal" title="Deal (Enter)">Deal</button></div>';
  }

  // --- the host's ruling, read rather than recomputed -----------------------------------------

  function live(st) { return !!(st && st.phase === 'play'); }
  function moves(st) { return (st && st.moves) || []; }
  function has(list, t) { return list.indexOf(t) >= 0; }
  // Can this tile be pressed, with what is already in hand? Yes when SOME set the host offered holds
  // every tile in hand and this one too. No sum is taken anywhere: the host counted, and a second
  // count here is a second answer
  function usable(st, pick, t) {
    var all = moves(st);
    for (var i = 0; i < all.length; i++) {
      var m = all[i], ok = has(m, t);
      for (var j = 0; ok && j < pick.length; j++) ok = has(m, pick[j]);
      if (ok) return true;
    }
    return false;
  }
  // Is the hand one of the host's own sets? Set equality against that list, which is the whole of
  // "these tiles add up to the throw" without adding anything up
  function complete(st, pick) {
    var all = moves(st);
    for (var i = 0; i < all.length; i++) {
      var m = all[i];
      if (m.length !== pick.length) continue;
      var ok = true;
      for (var j = 0; ok && j < pick.length; j++) ok = has(m, pick[j]);
      if (ok) return true;
    }
    return false;
  }

  // --- the felt ------------------------------------------------------------------------------

  function buildDice(n) {
    var box = el('sxDice'); if (!box || box.children.length === n) return;
    var out = '';
    for (var i = 0; i < n; i++) out += '<div class="sx-die" id="sxD' + i + '"></div>';
    box.innerHTML = out;
  }
  function setDie(i, face, anim) {
    var e = el('sxD' + i); if (!e) return;
    e.classList.remove('in');
    e.innerHTML = CUC.die(face, 48);
    if (anim) { void e.getBoundingClientRect(); e.classList.add('in'); }
  }
  // The art is aria-hidden, so the row carries the throw's numbers, the rule the pixel cards keep
  // with CUC.cardWord
  function drawDice(st, anim) {
    var n = (st && st.diceCount) || 2;   // until the host has spoken, this game is two dice
    buildDice(n);
    var dice = (st && st.dice) || [];
    for (var i = 0; i < n; i++) setDie(i, dice[i] != null ? dice[i] : 0, anim && dice[i] != null);
    var box = el('sxDice');
    if (box) box.setAttribute('aria-label', dice.length ? 'Threw ' + dice.join(' and ') + ', ' + st.roll : 'No throw yet');
  }
  // Nine tiles, four states, three materials (docs/game-panels.md, 5-15).
  // `shutting` is the set that has just been closed and is still being shown going down: for that
  // beat they are drawn as the hand they were, so the press the player made is what collapses
  function drawTiles(st, locked, shutting) {
    var box = el('sxTiles'); if (!box) return;
    var n = (st && st.tiles) || 9;       // until the host has spoken, this game is nine tiles
    var open = (st && st.open) || [], out = '';
    // THE FOURTH STATE ONLY EXISTS WHILE A ROUND DOES. "Not this throw" is a fact about a throw, so
    // off the bet screen there is no throw for it to be about: the box then shows its tiles
    // standing, at full mass, which is what says this is a box before anything has been pressed
    var playing = live(st) && !!(st.can && st.can.close);
    for (var t = 1; t <= n; t++) {
      var down = open.length ? !has(open, t) : false;
      var going = !!(shutting && has(shutting, t));
      var held = has(sx.pick, t);
      var cls = 'sx-tile', dead = false, label = 'Tile ' + t;
      if (going) { cls += ' on shut'; dead = true; label += ', closing'; }
      else if (down) { cls += ' down'; dead = true; label += ', down'; }
      else if (!playing) { dead = true; label += ', standing'; }
      else if (held) { cls += ' on'; label += ', in hand'; }
      else if (!usable(st, sx.pick, t)) { cls += ' off'; dead = true; label += ', not this throw'; }
      out += '<button type="button" class="' + cls + '" data-t="' + t + '"'
        + ' aria-label="' + label + '"' + ' aria-pressed="' + (held ? 'true' : 'false') + '"'
        + ((locked || dead) ? ' disabled' : '') + '>'
        + ((down || going) ? '' : t) + '</button>';
    }
    box.innerHTML = out;
  }

  // --- the line, the folded table and what is read out ----------------------------------------

  function verdict(st) {
    var row = st.row, net = st.net || 0;
    if (!row) return 'Nothing ' + signed(net);
    return row.name + ' ' + CUC.xMult100(row.mult100) + ' ' + signed(net);
  }
  // While a round is live the line is what is still standing, and what that would pay if the round
  // ended here: both the host's own figures (`rem` and `standing`). ONE CHIP, because the line takes
  // two pieces at most and the felt is 152px at sidebar 250
  function sxLine(st, pop) {
    var line = el('sxLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = CUC.pot(CUC.stake(SU), true); return; }
    if (st.phase === 'done') {
      var net = st.net || 0, cls = net > 0 ? ' win' : net < 0 ? ' lose' : '';
      line.innerHTML = (st.paid ? CUC.pot(st.paid, false) : '')
        + '<span class="bj-chip' + cls + (pop ? '' : ' still') + '">' + CUC.esc(verdict(st)) + '</span>';
      return;
    }
    var sd = st.standing || {};
    line.innerHTML = '<span class="bj-chip still">' + fmtInt(st.rem) + ' left'
      + (sd.row ? ' · ' + CUC.xMult100(sd.mult100) : '') + '</span>';
  }
  // The three rows, and under them how often each throw comes up: `view().ways` out of
  // `view().throws`, the host's own count, printed as the fraction it arrives as and never divided
  // into a percentage. Folded rather than dropped (section 5): a player can close tiles without it,
  // and it is what says why holding the 1 and the 2 back is worth anything. The row the round ENDED
  // on is lit, and the throw that is on the dice right now with it
  function sxPays(st) {
    var box = el('sxPays'); if (!box) return;
    var all = (st && st.pays) || [], here = st && st.row;
    var out = '<div class="sx-pay head"><span>left standing</span><b>pays</b></div>';
    for (var i = 0; i < all.length; i++) {
      var r = all[i], lit = !!(here && here.name === r.name);
      out += '<div class="sx-pay' + (lit ? ' on' : '') + '"><span>' + CUC.esc(r.name) + '</span>'
        + '<b>' + CUC.esc(CUC.xMult100(r.mult100)) + '</b></div>';
    }
    var ways = (st && st.ways) || [];
    if (ways.length) {
      out += '<div class="sx-pay head sx-throws"><span>throw</span><b>in ' + fmtInt(st.throws) + '</b></div>';
      // the array's own indices are the totals, so nothing here works out which totals exist
      for (var t = 0; t < ways.length; t++) {
        if (!ways[t]) continue;
        out += '<div class="sx-pay' + (st.roll === t ? ' on' : '') + '"><span>' + t + '</span>'
          + '<b>' + fmtInt(ways[t]) + '</b></div>';
      }
    }
    box.innerHTML = out;
  }
  function sxAnnounce(st, closed) {
    if (!st) return;
    var said = [];
    if (closed && closed.length) said.push('Closed ' + closed.join(' and '));
    if (st.phase === 'done') {
      said.push(st.result === 'shut' ? 'The box is shut' : fmtInt(st.rem) + ' left standing');
      said.push(verdict(st));
      said.push('Balance ' + fmtInt(CUC.balance() || 0));
    } else {
      said.push('Threw ' + (st.dice || []).join(' and ') + ', ' + st.roll);
      said.push(fmtInt(st.rem) + ' left');
    }
    CUC.live('sxLive', said.join('. ') + '.');
  }

  // --- controls -------------------------------------------------------------------------------

  // There is no play row: while a round is live the bet row is gone and the tiles are the controls
  function sxControls(st, locked) {
    var bet = el('sxBet'); if (bet) bet.hidden = live(st);
    drawTiles(st, locked, null);
    sxPays(st);
    if (!live(st)) CUC.renderStakes(SU, locked);
  }
  function firstTile() { return document.querySelector('#sxTiles .sx-tile:not([disabled])'); }
  function sxFocusAfter() {
    if (CUC.current() !== 'shutbox') return;
    var playing = live(sx.st);
    var swapped = sx.phase != null && playing !== (sx.phase === 'play');
    sx.phase = sx.st ? sx.st.phase : 'bet';
    var a = document.activeElement, panel = el('panel-shutbox');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!sx.wantFocus && !swapped && !lost) return;
    sx.wantFocus = false;
    var target = playing ? firstTile() : el('sxDeal');
    if (target && !target.disabled) target.focus();
  }

  function sxSend(op, extra) {
    if (sx.busy) return;
    sx.busy = true; sx.op = op;
    if (op !== 'open') sxControls(sx.st, true);
    sx.n = CUC.post('sx', op, extra);
    clearTimeout(sx.to);
    sx.to = setTimeout(function () {
      sx.busy = false; sx.op = null;
      CUC.err('sxErr', 'The box didn’t respond. Try again.');
      sxControls(sx.st, false);
    }, SX_T.noReply);
  }

  // A press closes the tiles and the next throw follows them: a throw that arrived first would be
  // the dice changing under a hand the player had not finished playing
  function sxReceive(m) {
    var current = sx.op != null && m.n === sx.n;
    if (!current && sx.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('sx', m);
    if (!m.state) { var awaited = current; sx.op = null; return sxFault(m, awaited); }
    var op = current ? sx.op : null;
    clearTimeout(sx.to); sx.timers.clear();
    sx.op = null;
    var before = sx.st;
    sx.st = m.state;
    sx.pick = [];   // the round moved, so nothing is in hand any more
    // played: the reply to a press the player just made. A refused close changed nothing, and a
    // reply nobody asked for is a round this screen is being told about rather than one it played,
    // so both are drawn where they stand
    var played = current && op !== 'open' && !m.error;
    var fresh = played && !CUC.reduceMotion();
    var closed = lastClose(before, sx.st);
    var done = sx.st.phase === 'done';
    try {
      CUC.err('sxErr', m.error || '');
      var bet = el('sxBet'); if (bet) bet.hidden = live(sx.st);
      sxPays(sx.st);
      if (fresh && op === 'close') {
        // the tiles pressed are still the hand that was pressed, collapsing
        drawTiles(sx.st, true, closed);
      } else if (fresh && op === 'deal') {
        drawTiles(sx.st, true, null);   // nine tiles standing; the dice arrive at SX_T.roll
      } else {
        drawTiles(sx.st, true, null);
        drawDice(sx.st, false);
        sxLine(sx.st, played);
      }
    } finally {
      CUC.hold();   // the header waits for the tiles and the throw
      if (fresh) {
        if (op === 'close') sx.timers.at(SX_T.close, function () { drawTiles(sx.st, true, null); });
        sx.timers.at(SX_T.roll, function () { drawDice(sx.st, true); if (!done) sxLine(sx.st, false); });
        if (done) sx.timers.at(SX_T.chip, function () { sxLine(sx.st, true); });
      }
      sx.timers.at(fresh ? (done ? SX_T.chip : SX_T.roll) : 0, function () { sxSettle(m, played, closed); });
    }
  }
  // The set the host says came down on this move: the last entry of its own `closed` list, and only
  // when the list actually grew. Read off the host rather than off what was clicked, so a redraw
  // and a broadcast cannot animate a close that is not in the round
  function lastClose(before, after) {
    var was = (before && before.closed) ? before.closed.length : 0;
    var now = (after.closed || []).length;
    return now > was ? after.closed[now - 1] : null;
  }
  // A reply with no state: the host could not describe the round (games/README.md, section 5). The
  // reason shows and the box stays exactly as it is, the tiles already down and the throw on the
  // dice included, because it is the describing that failed and not the box. sx.st is kept, so the
  // next press is still measured against the round the host holds
  function sxFault(m, awaited) {
    CUC.err('sxErr', m.error || 'The box could not be shown. Try again.');
    if (!awaited) return;
    sx.busy = false;
    clearTimeout(sx.to);   // or the four-second timeout fires over the reason just shown
    CUC.settle(m);         // nothing is paced here, so the header must not be left frozen
    sxControls(sx.st, false);
    sxFocusAfter();
  }
  function sxSettle(m, played, closed) {
    sx.busy = false;
    try {
      CUC.settle(m);
      if (played) sxAnnounce(sx.st, closed);   // after the balance, so it can say where it landed
    } finally {
      sxControls(sx.st, false);
      sxFocusAfter();
    }
  }

  // --- the one press this screen has ----------------------------------------------------------

  // Pressing a tile puts it in hand, and the hand goes to the host the moment it is one of the sets
  // the host offered. A completing press is NOT painted first: it would be replaced a millisecond
  // later by the close itself, and the felt would flicker through a state nobody chose
  function onTile(t) {
    if (sx.busy || !live(sx.st)) return;
    var i = sx.pick.indexOf(t);
    var next = i >= 0 ? sx.pick.slice(0, i).concat(sx.pick.slice(i + 1)) : sx.pick.concat(t);
    if (i < 0 && complete(sx.st, next)) { sxSend('close', { tiles: next }); return; }
    sx.pick = next;
    drawTiles(sx.st, false, null);
    var again = document.querySelector('#sxTiles .sx-tile[data-t="' + t + '"]');
    if (again && !again.disabled) again.focus();
    else { var n = firstTile(); if (n) n.focus(); }
  }

  CUC.game('shutbox', {
    key: 'sx',
    cls: 'sx',
    markup: markup,
    init: function () {
      drawDice(null, false);          // two unrolled dice from the first paint of this panel
      drawTiles(null, false, null);   // and nine tiles standing, so the box is a box before the deal
      sxLine(null);
      // Picking a stake does not redraw the line: renderStakes writes the figure straight into the
      // preview (ui.preview), and when the line is holding a result that is the last thing that
      // happened
      CUC.wireStakes(SU, function () { CUC.renderStakes(SU, sx.busy); });
      el('sxTiles').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.sx-tile') : null; if (!b || b.disabled) return;
        onTile(Number(b.getAttribute('data-t')));
      });
      el('sxDeal').addEventListener('click', function () {
        var v = Number(this.getAttribute('data-bet')); if (!v) return;
        sxSend('deal', { bet: v });
      });
      CUC.why('sxWhy', 'sxPays');
    },
    enter: function () { sx.wantFocus = true; sxControls(sx.st, true); sxSend('open'); },
    leave: function () {
      sx.timers.clear();
      clearTimeout(sx.to);
      sx.busy = false; sx.op = null;
    },
    receive: sxReceive,
    credits: function () { if (!sx.busy) sxControls(sx.st, false); },
    // The tiles take every move, so the keyboard is Tab and Enter on them; Enter on the bet row
    // deals, which is what CUC.press does with no action of its own to look up
    keys: function (e) { CUC.press(e, '#sxBet', null, 'sxDeal', 'sxBet'); }
  });
})();
