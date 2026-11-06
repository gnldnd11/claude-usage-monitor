// The Sword Forge's screen: one sword, a level at a time. The sword outlives the window, so this
// screen owns nothing about it: it draws the state the host sends back and paces what just happened.
(function () {
  var CUC = window.CUC;
  var el = CUC.el, esc = CUC.esc, fmtInt = CUC.fmtInt, signed = CUC.signed;

  // No bet and no round here: a press settles at once, and what is paced is only the verdict.
  // The one outcome with a story is the break, and its figures are counted from the END OF THE BEAT
  // (the shards fly, the anvil stands empty, and only then does the shop's replacement arrive).
  // Everything else is verdict + unlock.
  //
  // The length of the beat is the SIZE OF THE PRESS, which is the whole reason there are four of
  // them. A 95% attempt that can only cost its fee does not deserve a second of hammering, and a
  // +9 that can take the week's climb away deserves more than the same second: a ritual that is the
  // same for both spends the player's attention where there is nothing to feel and gives them
  // nothing to feel where there is.
  //   calm   +0..+2, the levels that cannot drop or break. One tap, out of the way
  //   mid    the levels that can drop but not break
  //   risk   from the level a break is possible. The heat ring on the blade pulses through it
  //   brink  the last two levels. Five taps and then a stop, because the stop is the tension
  // Each name is also the keyframes it runs in meta.js (beat1/beat3/beat4/beat5), and the two have
  // to be retimed together or the sword stands still for the rest of a beat that is still counting.
  // arriveIn is the length of .fg-sword.arrive there, for the same reason
  var FG_T = {
    tap: { calm: 120, mid: 270, risk: 360, brink: 450 },
    brace: 220,           // the brink's held breath, between the last tap and the verdict
    unlock: 150,          // the buttons come back this long after the verdict lands
    brGone: 300, brCleared: 460, brArrive: 760, arriveIn: 200, brFlash: 160,  // a break, from the verdict
    // reduced motion drops the beat and the shards but keeps the empty anvil: the size of the
    // event is then left in time alone
    rmEmpty: 400,
    sellArm: 3000,        // how long the sale's second tap stays available
    noReply: 4000
  };
  // The buttons come back a beat after the replacement is fully there, so this is built on the
  // fade rather than written out: retiming .fg-sword.arrive alone would hand a press back mid-arrival
  FG_T.brUnlock = FG_T.brArrive + FG_T.arriveIn + 40;
  var FG_BEATS = ['beat1', 'beat3', 'beat4', 'beat5'];
  var fg = { st: null, busy: false, op: null, n: 0, timers: CUC.timers(), to: null, arm: null, armed: false, wantFocus: false, locked: false, chip: null, shown: null, heat: null };

  // How long a press from `level` takes and what it looks like. The level is the one the attempt was
  // made FROM, never the one it landed on: the ritual belongs to the risk that was taken
  function fgRite(level, st) {
    var row = (st && st.table && st.table[level]) || null;
    var max = st && typeof st.max === 'number' ? st.max : 10;
    var riskFrom = st && typeof st.riskFrom === 'number' ? st.riskFrom : Infinity;
    if (level >= max - 2) return { ms: FG_T.tap.brink, cls: 'beat5', brace: FG_T.brace, hot: true };
    if (level >= riskFrom) return { ms: FG_T.tap.risk, cls: 'beat4', brace: 0, hot: true };
    if (row && !row.down && !row['break']) return { ms: FG_T.tap.calm, cls: 'beat1', brace: 0, hot: false };
    return { ms: FG_T.tap.mid, cls: 'beat3', brace: 0, hot: false };
  }

  function markup() {
    return CUC.frame('forge')
      + '<div class="fg-anvil" id="fgAnvil">'
      +   '<div class="fg-stage">'
      +     '<div class="bj-crab"><img src="' + CUC.crab() + '" alt=""/></div>'
      +     '<div class="fg-sword" id="fgSword"></div>'
      +     '<div class="fg-lv"><b id="fgLv">0</b><span id="fgBest"></span></div>'
      +   '</div>'
      +   '<div class="fg-bar" id="fgBar"></div>'
      +   '<div class="fg-odds"><span id="fgSucc"></span><span class="fg-gain" id="fgGain"></span><span id="fgRisk"></span></div>'
      +   '<div class="fg-heat" id="fgHeat"></div>'
      +   '<div class="hl-line" id="fgLine"></div>'
      + '</div>'
      + '<div class="bj-sr" id="fgLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="fgNote" hidden></div>'
      + '<div class="warnbar" id="fgErr" hidden></div>'
      + '<div class="bj-ctl">'
      +   '<button type="button" class="bj-btn primary" id="fgEnhance" style="flex:1 1 100%" title="Enhance (E)">Enhance</button>'
      +   '<button type="button" class="bj-btn" id="fgSell" style="flex:1 1 100%" title="Sell (S, twice)">Sell</button></div>';
  }

  // --- the sword: one frame; level drives length, colour tier, guard, gem and heat glow
  var FG_TIER = [
    { core: '#8c94a0', edge: '#c3c9d2', shade: '#5f6670', gem: null },      // Lv 0-2 iron
    { core: '#c6d0dd', edge: '#f2f7ff', shade: '#8f9aa8', gem: null },      // Lv 3-5 steel
    { core: '#e8895a', edge: '#ffd166', shade: '#c25a34', gem: '#e8b23a' }, // Lv 6-8 hot
    { core: '#ffe9b0', edge: '#ffffff', shade: '#e8b23a', gem: '#ffd166' }  // Lv 9-10 white hot
  ];
  // dx, dy, rot: where the eight pieces of a broken sword go
  var FG_SHARDS = [[-18, -10, -40], [-10, -16, -18], [-3, -20, 12], [6, -16, 28], [14, -9, 46], [-14, 2, -62], [12, 4, 58], [0, -4, 0]];
  function fgTier(level) { return FG_TIER[level <= 2 ? 0 : level <= 5 ? 1 : level <= 8 ? 2 : 3]; }
  function fgCells(cells, color, op) {
    var d = '';
    for (var i = 0; i < cells.length; i++) { var c = cells[i]; d += 'M' + c[0] + ' ' + c[1] + 'h' + c[2] + 'v' + c[3] + 'h-' + c[2] + 'z'; }
    return '<path fill="' + color + '"' + (op ? ' opacity="' + op + '"' : '') + ' d="' + d + '"/>';
  }
  function swordSvg(level, riskFrom, cell) {
    var t = fgTier(level);
    var bb = 26, bt = bb - (12 + level), o = '';
    function ring(p, op) {   // hugs the blade silhouette. A plain rectangle reads as a picture frame
      o += fgCells([[11 - p, bt - p, 2 + 2 * p, p], [10 - p, bt, p, 1], [13, bt, p, 1],
        [9 - p, bt + 1, p, 1], [14, bt + 1, p, 1], [9 - p, bt + 2, p, bb - bt - 2], [15, bt + 2, p, bb - bt - 2]], '#e8895a', op);
    }
    if (level >= riskFrom) { ring(1, .5); if (level >= 9) ring(2, .28); }
    if (level >= 10) {
      o += fgCells([[11, bt - 5, 2, 2], [10, bt - 4, 1, 1], [13, bt - 4, 1, 1]], '#ffd166');
      o += fgCells([[11, bt - 7, 2, 2], [10, bt - 6, 1, 1], [13, bt - 6, 1, 1]], '#e8895a');
    }
    o += fgCells([[9, bt + 2, 6, bb - bt - 2], [10, bt + 1, 4, 1], [11, bt, 2, 1]], t.core);   // blade, tapered point
    o += fgCells([[9, bt + 2, 1, bb - bt - 2], [10, bt + 1, 1, 1], [11, bt, 1, 1]], t.edge);   // lit edge
    o += fgCells([[13, bt + 2, 2, bb - bt - 2], [13, bt + 1, 1, 1]], t.shade);
    var gw = level >= 6 ? 14 : 12, gx = 12 - gw / 2;
    o += fgCells([[gx, 26, gw, 2], [gx + 1, 28, 1, 1], [gx + gw - 2, 28, 1, 1]], '#6b7078');
    o += fgCells([[gx, 26, gw, 1]], '#9aa0a8');
    o += fgCells([[11, 28, 2, 8]], '#5a3b28');
    o += fgCells([[11, 29, 2, 1], [11, 31, 2, 1], [11, 33, 2, 1]], '#7a523a');
    o += fgCells([[10, 36, 4, 3], [9, 37, 1, 1], [14, 37, 1, 1]], '#6b7078');
    if (t.gem) o += fgCells([[11, 37, 2, 1]], t.gem);
    // 4 rows of headroom: a +10 blade reaches y=4 and its flames are drawn above the grid's own top
    return '<svg viewBox="0 -4 24 44" width="' + (24 * cell) + '" height="' + (44 * cell) + '" shape-rendering="crispEdges" aria-hidden="true">' + o + '</svg>';
  }

  // --- drawing
  // The sword and the white flash that belongs to it. cls carries the one-shot animation, so the
  // redraw is also what clears the beat the press started
  function fgDrawSword(level, riskFrom, cls) {
    var box = el('fgSword'); if (!box) return;
    box.className = 'fg-sword';
    // the ember sits under the blade and only burns while a risky press is being hammered: the
    // heat ring is already on the blade from riskFrom up, and this is that ring breathing
    box.innerHTML = swordSvg(level, riskFrom == null ? Infinity : riskFrom, 2)
      + '<span class="fg-ember"></span><span class="fg-flash"></span>';
    if (cls) { void box.offsetWidth; box.classList.add(cls); }
    box.setAttribute('role', 'img');
    box.setAttribute('aria-label', 'Sword +' + level);
  }
  function fgEmptyAnvil() {
    var box = el('fgSword'); if (!box) return;
    box.className = 'fg-sword';
    box.innerHTML = '';
    box.setAttribute('aria-label', 'No sword');
  }
  function fgFlash() { var f = document.querySelector('#fgSword .fg-flash'); if (f) f.classList.add('on'); }
  function fgPct(v, den) { return Math.round(v * 100 / (den || 100)); }
  // The bar is the odds themselves, in the table's own order. A slice that cannot happen is not
  // drawn at all, so below the level the glow starts there is simply no red on it
  var FG_SLICE = [
    { k: 'up', c: '#7ee6a4', w: 'success' },
    { k: 'keep', c: 'var(--forge-dim)', o: '.45', w: 'no change' },
    { k: 'down', c: '#f7c46a', w: 'down a level' },
    { k: 'break', c: '#e5484d', w: 'destroyed' }
  ];
  function fgBar(st) {
    var box = el('fgBar'); if (!box) return;
    var odds = st && st.odds, den = (st && st.den) || 100, html = '', words = [];
    if (odds) {
      FG_SLICE.forEach(function (s) {
        var v = odds[s.k] || 0; if (!v) return;
        html += '<i data-k="' + s.k + '" style="width:' + (v * 100 / den) + '%;background:' + s.c + (s.o ? ';opacity:' + s.o : '') + '"></i>';
        words.push(fgPct(v, den) + '% ' + s.w);
      });
    }
    box.innerHTML = html;
    box.title = words.join(' · ');
  }
  // Only the figures that decide a press are spelled out: what it pays, what the gauge has added to
  // that, and what it costs. All three come off the reply (the host sends the heated row and the
  // points the heat is worth), because a screen that worked a probability out for itself would be
  // the one place in the casino where the house is not the judge
  function fgOdds(st) {
    var odds = st && st.odds, den = (st && st.den) || 100;
    var su = el('fgSucc'), gn = el('fgGain'), rk = el('fgRisk');
    var gain = (st && st.heatUp) || 0;
    if (su) su.textContent = odds ? fgPct(odds.up, den) + '% success' : '';
    // the gauge has to move a number or it is the old "no change" wearing a bar
    if (gn) { gn.textContent = odds && gain ? '+' + fgPct(gain, den) + ' from heat' : ''; gn.hidden = !(odds && gain); }
    if (rk) rk.textContent = odds && odds.break ? fgPct(odds.break, den) + '% destroy' : '';
  }
  // The gauge: one cell a bar, and what it is worth said next to it rather than left to be guessed.
  // `cls` is the one-shot that shows it MOVING, which is the whole point of it being a bar: 'lit'
  // when an attempt that went nowhere filled one, 'spent' when a success emptied it
  function fgHeat(st, cls) {
    var box = el('fgHeat'); if (!box) return;
    var max = (st && st.heatMax) || 0, on = (st && st.heat) || 0;
    var step = (st && st.heatStep) || 0, gain = (st && st.heatUp) || 0;
    var html = '';
    for (var i = 0; i < max; i++) html += '<i' + (i < on ? ' class="on' + (i === on - 1 ? ' tip' : '') + '"' : '') + '></i>';
    box.className = 'fg-heat';
    box.innerHTML = html;
    box.hidden = !max;
    if (max) {
      var what = on + ' of ' + max + ' heat';
      // what the gauge is worth now, and what one more failure would be worth. At the opening
      // levels the chance is already at its ceiling, so it is worth nothing and says so
      box.title = what + (gain ? ' · +' + gain + ' points on the next attempt'
        : on ? ' · no points here: the chance is already at its ceiling' : ' · ' + step + ' points a bar');
      box.setAttribute('role', 'img');
      box.setAttribute('aria-label', what + (gain ? ', worth ' + gain + ' points' : ''));
    }
    if (cls) { void box.offsetWidth; box.classList.add(cls); }
  }
  // The level is the 22px number and the record high goes under it, which is the one place the two
  // can be read against each other: where the sword is now, and how far it has ever got.
  //
  // The ceiling used to sit here as "/ 10" and it is gone. It is a constant, printed next to a
  // figure that moves on every press, which is the same wallpaper twelve list rows reading
  // "Min bet 10" were (docs/game-panels.md, section 7); the fact itself is in the heading's
  // tooltip (meta.hint, "Enhance to Lv 10") and the Enhance button also loses its price at the
  // top, so nothing about the ceiling was lost with it. `st.max` is still on the reply
  function fgLv(st) {
    var lv = el('fgLv'), bs = el('fgBest');
    if (lv) lv.textContent = String(st ? st.level : 0);
    if (bs) bs.textContent = st ? 'best +' + st.best : '';
  }
  // The heading's corner is ONE figure, and the rule for it is "the thing that is still there when
  // you come back" (docs/game-panels.md, section 3): the swords this forge has destroyed. The
  // record high moved under the sword itself, because a 250px sidebar leaves about 70px here and
  // "best +9 · 3 broken" does not fit in it. The attempts behind both stay in the title
  function fgSide(st) {
    var s = el('fgSide'); if (!s || !st) return;
    var broke = st.broke || 0;
    s.textContent = fmtInt(broke) + ' broken';
    s.title = st.best + ' best · ' + fmtInt(broke) + ' destroyed · ' + fmtInt(st.tries) + ' attempts';
  }
  function fgCoin(v) { return '<span class="fg-cost">' + CUC.coin() + '<b>' + fmtInt(v) + '</b></span>'; }
  function fgButtons(st, locked) {
    var can = (st && st.can) || {}, cost = st ? st.cost : null, price = st ? st.sell : 0;
    var enh = el('fgEnhance'), sl = el('fgSell');
    fg.shown = st ? st.level : null;   // the level these two figures belong to (see fgSend)
    if (enh) {
      enh.hidden = !st;        // before the first reply there is no sword and no fee to name
      enh.innerHTML = 'Enhance' + (cost == null ? '' : ' ' + fgCoin(cost)); // null at the top: nothing left to price
      enh.disabled = !!locked || !can.enhance;
    }
    if (sl) {
      sl.hidden = !can.sell;    // a +0 sword is the one the shop gives away, so there is no row
      sl.innerHTML = fg.armed ? 'Tap again to sell' : 'Sell' + (price ? ' ' + fgCoin(price) : '');
      sl.disabled = !!locked || !can.sell;
    }
    fgNote(st);
  }
  // Being broke and having the credits tied up at another table are different problems, and the
  // forge can hit either: its fee is measured against what the card games have left riding
  function fgNote(st) {
    var cost = st ? st.cost : null, can = (st && st.can) || {};
    var short = cost != null && !can.enhance;   // the only reason an attempt below the top is refused
    CUC.note('fgNote', !short ? '' : (CUC.balance() != null && CUC.balance() >= cost
      ? CUC.heldElsewhere + '.'
      : 'You need ' + fmtInt(cost) + ' credits to enhance.'));
  }
  function fgFace(st, heatCls) { fgLv(st); fgBar(st); fgOdds(st); fgHeat(st, heatCls); fgSide(st); fgButtons(st, fg.locked); }
  function fgPaint(st) {
    var anvil = el('fgAnvil'); if (anvil) anvil.classList.remove('broke');
    fgDrawSword(st ? st.level : 0, st ? st.riskFrom : null);
    fgFace(st);
  }
  // The chip is the move just made, so it is kept here rather than read back out of the state: an
  // open carries the last move too, and re-entering the forge is not that move happening again.
  //
  // Every line on it carries the figure that actually moved, because the level is already drawn in
  // 22px type above it and repeating that is how the chip came to say nothing:
  //   a success  what the sword was worth and what it is worth now. That is the event
  //   a stay     the bar it filled, so the one outcome that changes no level still changes something
  //   a drop     what the sword is worth now, which is the half of a drop that hurts
  //   a break    everything that was fed to it. A loss nobody counts is a loss nobody feels
  // All of those figures are in the reply (forge.js puts them on `last`); none is worked out here
  function fgChip(st) {
    var last = st && st.last; if (!last) { fg.chip = null; return; }
    var o = last.outcome;
    var jump = last.sellFrom ? fmtInt(last.sellFrom) + ' → ' + fmtInt(last.sellTo)
      : 'worth ' + fmtInt(last.sellTo);   // a +0 sword cannot be sold, so there is no figure to leave
    fg.chip = {
      text: o === 'up' ? 'Success · ' + jump
        : o === 'keep' ? 'No change · heat ' + st.heat + ' of ' + st.heatMax
          : o === 'down' ? 'Down to Lv ' + last.to + ' · ' + fmtInt(last.sellTo)
            : o === 'break' ? 'Destroyed · ' + fmtInt(last.fed) + ' fed'
              : 'Sold ' + signed(st.net || last.paid),
      tint: o === 'up' || o === 'sold' ? 'win' : (o === 'down' || o === 'break') ? 'lose' : ''
    };
  }
  // The gauge's one-shot classes belong to the verdict that put them there, so they go when that
  // verdict does. Left on, the last press's flash would still be sitting under the new one's beats
  function fgCool() {
    var box = el('fgHeat'); if (box) box.classList.remove('lit', 'spent');
  }
  function fgLine() {
    var line = el('fgLine'); if (!line) return;
    if (!fg.chip) { line.innerHTML = ''; return; }
    line.innerHTML = '<span class="bj-chip' + (fg.chip.tint ? ' ' + fg.chip.tint : '') + '">' + esc(fg.chip.text) + '</span>';
  }
  // The cards are drawn as aria-hidden art and the gauge is a row of bare cells, so whatever a
  // sighted player can see happen has to be said here too: the price the sword moved to, the bar
  // the stay bought, and what a broken sword had eaten
  function fgAnnounce(st) {
    if (!st) return;
    var last = st.last; if (!last) return;
    var o = last.outcome;
    var worth = last.sellTo ? ', worth ' + fmtInt(last.sellTo) : '';
    var what = o === 'break' ? 'Destroyed. ' + fmtInt(last.fed) + ' fed. A new +0 sword'
      : o === 'sold' ? 'Sold for ' + fmtInt(last.paid) + '. A new +0 sword'
        : o === 'keep' ? 'No change. Sword +' + last.to + '. Heat ' + st.heat + ' of ' + st.heatMax
          : (o === 'up' ? 'Success' : 'Down a level') + '. Sword +' + last.to + worth;
    CUC.live('fgLive', what + '. ' + signed(st.net || 0) + '. Balance ' + fmtInt(CUC.balance() || 0) + '.');
  }

  // --- the beats of one attempt
  function fgBeat(rite) {
    var box = el('fgSword'); if (!box) return;
    box.className = 'fg-sword';           // and the last verdict's one-shot class goes with it
    var f = box.querySelector('.fg-flash'); if (f) f.className = 'fg-flash';   // as does its flash
    var e = box.querySelector('.fg-ember'); if (e) e.className = 'fg-ember';
    void box.offsetWidth;
    box.classList.add(rite.cls);
    if (rite.hot) box.classList.add('ember');   // the blade's heat ring breathes while it is hit
  }
  // The brink's held breath: the hammering stops and the sword hangs there. Nothing else happens in
  // this step, which is the point of it
  function fgBrace() {
    var box = el('fgSword'); if (!box) return;
    box.classList.remove.apply(box.classList, FG_BEATS);
    void box.offsetWidth;
    box.classList.add('brace');
  }
  // The verdict for the three outcomes that leave a sword on the anvil. A success empties the gauge
  // and a failure fills it, and both of those have to be seen moving rather than just redrawn
  function fgLand(out, st) {
    fgDrawSword(st.level, st.riskFrom, CUC.reduceMotion() ? '' : (out === 'up' ? 'pop' : out === 'down' ? 'drop' : ''));
    if (out === 'up' && !CUC.reduceMotion()) fgFlash();
    fgFace(st, CUC.reduceMotion() ? '' : (out === 'up' ? 'spent' : 'lit'));
    fgLine();
  }
  // The break: the anvil flinches, the pieces fly, and the sword itself is still there to fade out.
  // The gauge goes with it here rather than when the replacement arrives, because the gauge was
  // that sword's and the anvil is about to be empty for most of a second
  function fgShatter(from, st) {
    var box = el('fgSword');
    fgLine();
    fgHeat(st, CUC.reduceMotion() ? '' : 'spent');
    if (CUC.reduceMotion()) { fgEmptyAnvil(); return; }
    if (box) {
      // whichever beat was running, and the brace and the ember with it: the sword is gone
      box.classList.remove.apply(box.classList, FG_BEATS.concat(['brace', 'ember']));
      var t = fgTier(from), html = '';
      FG_SHARDS.forEach(function (s, i) {
        html += '<span class="fg-shard" style="background:' + (i % 2 ? t.edge : t.core)
          + ';--dx:' + s[0] + 'px;--dy:' + s[1] + 'px;--rot:' + s[2] + 'deg"></span>';
      });
      box.innerHTML = box.innerHTML + html;
    }
    var anvil = el('fgAnvil');
    if (anvil) {
      anvil.classList.remove('broke'); void anvil.offsetWidth; anvil.classList.add('broke');
      fg.timers.at(FG_T.brFlash, function () { anvil.classList.remove('broke'); });
    }
  }
  function fgSwordGone() { var box = el('fgSword'); if (box) box.classList.add('gone'); }

  // What a reply makes happen, and when. An open, an error and a late reply land at once; an
  // attempt opens with the beat; a break then takes the long way round
  function fgSteps(m, op) {
    var st = fg.st, last = st && st.last;
    var moved = !m.error && last && op && op !== 'open' && last.op === op;
    if (!moved) return { steps: [{ at: 0, fn: function () { fgPaint(st); } }], unlock: 0 };
    fgChip(st);
    if (op === 'sell') return { steps: [{ at: 0, fn: function () { fgPaint(st); fgLine(); } }], unlock: FG_T.unlock };
    var rm = CUC.reduceMotion();
    var out = last.outcome, from = last.from;
    var rite = fgRite(from, st);
    // the verdict lands after the taps and, at the brink, after the stop that follows them
    var beat = rm ? 0 : rite.ms + rite.brace;
    var steps = [];
    if (!rm) {
      steps.push({ at: 0, fn: function () { fgBeat(rite); } });
      if (rite.brace) steps.push({ at: rite.ms, fn: fgBrace });
    }
    if (out !== 'break') return { steps: steps.concat([{ at: beat, fn: function () { fgLand(out, st); } }]), unlock: beat + FG_T.unlock };
    var arrive = function () { fgDrawSword(st.level, st.riskFrom, rm ? '' : 'arrive'); fgFace(st); };
    steps.push({ at: beat, fn: function () { fgShatter(from, st); } });
    if (rm) return { steps: steps.concat([{ at: FG_T.rmEmpty, fn: arrive }]), unlock: FG_T.rmEmpty + FG_T.unlock };
    return {
      steps: steps.concat([
        { at: beat + FG_T.brGone, fn: fgSwordGone },
        { at: beat + FG_T.brCleared, fn: fgEmptyAnvil },
        { at: beat + FG_T.brArrive, fn: arrive }
      ]),
      unlock: beat + FG_T.brUnlock
    };
  }

  // --- the two buttons
  function fgLock(locked) { fg.locked = !!locked; fgButtons(fg.st, fg.locked); }
  // Selling asks twice: the sword is the one thing the player owns here, and a stray tap on a +9
  // would be the whole climb. An attempt does not ask twice, because an attempt is the game
  function fgArmSell() {
    fg.armed = true;
    fgButtons(fg.st, fg.locked);
    clearTimeout(fg.arm);
    fg.arm = setTimeout(function () { fgDisarmSell(); }, FG_T.sellArm);
  }
  function fgDisarmSell(quiet) {
    clearTimeout(fg.arm);
    if (!fg.armed) return;
    fg.armed = false;
    if (!quiet) fgButtons(fg.st, fg.locked);
  }
  function fgFocusAfter() {
    if (CUC.current() !== 'forge') return;
    var a = document.activeElement, panel = el('panelForge');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!fg.wantFocus && !lost) return;
    fg.wantFocus = false;
    var enh = el('fgEnhance'), sl = el('fgSell');
    var target = enh && !enh.disabled ? enh : (sl && !sl.disabled && !sl.hidden ? sl : null);
    if (target) target.focus();
  }

  // --- messages
  function fgSend(op) {
    if (fg.busy) return;
    fg.busy = true; fg.op = op;
    if (op !== 'open') fgLock(true);
    // the level the screen was showing travels with a move, never with an open: an open asks for
    // the truth, and naming a level there would be this screen arguing with it
    var extra = (op !== 'open' && typeof fg.shown === 'number') ? { level: fg.shown } : null;
    fg.n = CUC.post('fg', op, extra);
    clearTimeout(fg.to);
    fg.to = setTimeout(function () {
      fg.busy = false; fg.op = null;
      CUC.err('fgErr', 'The forge didn’t respond. Try again.');
      fgLock(false);
    }, FG_T.noReply);
  }
  // A reply with no state: the host could not describe the sword (games/README.md, section 5). The
  // reason shows and the anvil is left exactly as it is. This one matters more here than at the
  // card tables: the sword is the player's property and it outlives the window, so an empty anvil
  // would read as a sword that has been lost rather than one the host could not describe. fg.st is
  // kept, which also keeps fg.shown (the level that travels with the next press) the level that is
  // actually drawn.
  //
  // awaited is false for a reply nobody asked for (a push from another window), and then the beat
  // already running is left to finish: it belongs to a state this reply says nothing about
  function fgFault(m, awaited) {
    CUC.err('fgErr', m.error || 'The forge could not be shown. Try again.');
    if (!awaited) return;
    fg.busy = false;
    clearTimeout(fg.to);  // or the four-second timeout fires over the reason just shown
    CUC.settle(m);        // nothing is paced here, so the header must not be left frozen
    fgLock(false);
    fgFocusAfter();
  }
  function fgReceive(m) {
    var current = fg.op != null && m.n === fg.n;
    if (!current && fg.op != null) return;   // an older reply while a newer request waits
    CUC.setHeld('fg', m);
    if (!m.state) { var awaited = current; fg.op = null; return fgFault(m, awaited); }
    var op = current ? fg.op : null;
    clearTimeout(fg.to); fg.timers.clear();
    fg.op = null;
    fgDisarmSell(true);                      // a reply closes the sell's second-tap window
    fg.st = m.state;
    fg.chip = null;
    fgLine();                                // the last verdict goes now; this one lands with its step
    fgCool();                                // and so does the mark it left on the gauge
    var plan = null;
    try {
      plan = fgSteps(m, op);                 // which sets the chip again when this reply is a move
      CUC.err('fgErr', m.error || '');
      fgLock(true);
    } finally {
      // the header waits for this reply's settle, like the other tables: the host's data push is
      // right behind it, and a fee paid or a sword sold is not a credit earned
      CUC.hold();
      var sc = plan || { steps: [{ at: 0, fn: function () { fgPaint(fg.st); } }], unlock: 0 };
      sc.steps.forEach(function (s) { fg.timers.at(s.at, s.fn); });
      fg.timers.at(sc.unlock, function () { fgSettle(m, current && op !== 'open' && !m.error); });
    }
  }
  function fgSettle(m, fresh) {
    fg.busy = false;
    try {
      CUC.settle(m);
      fgLine();
      if (fresh) fgAnnounce(fg.st);
    } finally {
      fgLock(false);
      fgFocusAfter();
    }
  }

  // nothing drawn and nothing promised until the host answers the first open
  function fgBlank() {
    fgEmptyAnvil();
    var lv = el('fgLv'), bs = el('fgBest');
    if (lv) lv.textContent = '';
    if (bs) bs.textContent = '';
    fgBar(null); fgOdds(null); fgHeat(null); fgLine();
  }

  CUC.game('forge', {
    key: 'fg',
    panelId: 'panelForge',
    cls: 'fg',
    markup: markup,
    init: function () {
      fgBlank();
      fgLock(true);
      el('fgEnhance').addEventListener('click', function () {
        if (this.disabled) return;
        fgDisarmSell();
        fgSend('enhance');
      });
      el('fgSell').addEventListener('click', function () {
        if (this.disabled || this.hidden) return;
        if (!fg.armed) { fgArmSell(); return; }
        fgDisarmSell(true);
        fgSend('sell');
      });
    },
    enter: function () { fg.wantFocus = true; fgLock(true); fgSend('open'); },
    leave: function () {
      fg.timers.clear();
      clearTimeout(fg.to);
      fgDisarmSell(true);
      fg.busy = false; fg.op = null;
    },
    receive: fgReceive,
    // The list row's figure, and the reason this panel has one at all: the sword is still there
    // when the screen is shut, so its level is what makes the row worth opening. webview.js calls
    // this whether the panel was ever built or not, which is the whole point of it being here and
    // not inside fgReceive, and the host sends a reply on its first data push for exactly that
    // (games/forge/meta.js, onPush).
    //
    // A reply with NO state says nothing about the sword (games/README.md, section 5), so the
    // figure already on the row is left where it is. The level is neither good news nor bad, so it
    // carries no direction and takes the row's ordinary muted colour.
    //
    // A SWORD NOBODY HAS TOUCHED CARRIES NO FIGURE AT ALL. The point of the figure is that it moved
    // while the panel was shut (docs/game-panels.md, section 7), and a shop sword is +0 on every
    // install that has never opened the forge: a `+0` there is a number on a row where nothing has
    // happened, which is the rule backwards. `tries` is the attempt count over the save's whole life
    // and it is what tells the two apart, not the level: a sword hammered back down to +0 has been
    // touched, so its row says +0 and means it
    fig: function (m) {
      var st = m && m.state;
      if (!st || typeof st.level !== 'number') return;
      CUC.rowFig('forge', st.tries > 0 ? '+' + st.level : null);
    },
    keys: function (e) {
      // E enhances, S twice sells, Enter enhances unless the focus is already on a button (then
      // that button has it). The forge has no panel of [data-op] actions, so it presses its own
      var k = String(e.key).toLowerCase();
      var hit = k === 'e' ? el('fgEnhance') : k === 's' ? el('fgSell') : null;
      if (hit) { e.preventDefault(); if (!hit.disabled && !hit.hidden) hit.click(); return; }
      var t = e.target, enh = el('fgEnhance');
      if (e.key === 'Enter' && (!t || t.tagName !== 'BUTTON') && enh && !enh.disabled) { e.preventDefault(); enh.click(); }
    }
  });
})();
