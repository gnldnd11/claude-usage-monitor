(function () {
  const vscode = acquireVsCodeApi();
  const C = 207.3; // ring circumference (2*pi*33)
  var prev = {};        // last numeric values (for tween + delta)
  var lastData = null;  // for the 1s live tick
  var refreshedAt = Date.now();

  // ===========================================================================
  // 유틸리티: 숫자 포맷·카운트다운·색상·게이지 계산 헬퍼
  // ===========================================================================
  function cd(r) {
    if (!r) return '';
    var rem = Math.floor(r - Date.now() / 1000);
    if (rem <= 0) return 'now';
    var d = Math.floor(rem / 86400); rem %= 86400;
    var h = Math.floor(rem / 3600); rem %= 3600;
    var m = Math.floor(rem / 60);
    if (d) return d + 'd' + h + 'h';
    if (h) return h + 'h' + String(m).padStart(2, '0') + 'm';
    return m + 'm';
  }
  function col(p) { return p >= 90 ? '#f0553a' : p >= 70 ? '#f0a83a' : '#e8895a'; }
  function grad(p) {
    var c = col(p), c2 = p >= 90 ? '#f6836e' : p >= 70 ? '#f6c46e' : '#f0a882';
    return 'linear-gradient(90deg,' + c + ',' + c2 + ')';
  }
  function hm(sec) {
    if (!(sec > 0)) sec = 0;
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    return h + 'h ' + String(m).padStart(2, '0') + 'm';
  }
  function activeTime(r) {
    if (!r) return '–';
    var el2 = 5 * 3600 - (r - Date.now() / 1000);
    if (el2 < 0) el2 = 0; if (el2 > 5 * 3600) el2 = 5 * 3600;
    return hm(el2);
  }
  // Today's span, first message to last. The tile above it reads the five-hour window's elapsed
  // part, which an account WITHOUT a window does not have at all (there is no such number to fall
  // back on, see docs/header-fold-spec.md 1-3), so that account's tile answers this instead and the
  // label beside it says which of the two it answered. Both ends come out of the transcripts the
  // host already parses, so this is a reading and not an estimate.
  function activeToday(d) {
    var a = d && d.firstT, b = d && d.last && d.last.t;
    if (!a || !b || b < a) return '–';
    return hm((b - a) / 1000);
  }
  // THE ONE PLACE that asks whether this account has a five-hour window at all.
  //
  // 2026-10-30 turned Max 20x into Ultra and an authenticated Ultra account has no five-hour limit,
  // so the host pushes five_hour: null for ever while the week still fills (extension.js, the two
  // places that build usageCache). "Not loaded yet" and "this account has none" used to be the same
  // em dash, and six places in this file each drew half of that. They read `body.no-session` now and
  // this is its only writer: the next reader cannot satisfy five of the six and miss the sixth.
  //
  // `sd != null` is what separates the two: the host rebuilds the whole cache on every successful
  // response and leaves only the limits the account does not have as null, so a week with a reading
  // and no window is an answer, while nothing at all is a failure and still draws the dash.
  function noSessionWindow(d) {
    return !!d && d.usageLoading !== true && d.sd != null && d.fh == null;
  }

  // ===========================================================================
  // 로스터: 에이전트 NPC 스프라이트 배정 + 카드 렌더 + 활동 상태 오버레이 (M1)
  // Deterministic: same name -> same NPC sprite, forever. Sprite chosen from the name hash.
  // ===========================================================================
  function hashStr(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
  // --- NPC sprite pool (Kenmi NPCs) — distinct character per agent, deterministic ---
  var ASSETS = { npcs: {} };
  try { var _ae = document.getElementById('cuc-assets'); if (_ae) ASSETS = JSON.parse(_ae.getAttribute('data-json')) || ASSETS; } catch (e) { /* no assets → roster bodies render empty (assets are always bundled, so this is not a normal path) */ }
  var NPC_KEYS = Object.keys(ASSETS.npcs);
  // per-sprite metadata drives everything (packs differ in cell size & layout).
  // Rendering crops to the measured character bbox [x,y,w,h] (cell px) so every sprite
  // shows at a consistent size regardless of how much padding its sheet cell has.
  var ROSTER_T = 40, ROOM_T = 39, PICKER_T = 40; // target character height (px) per context
  function mCell(m) { return (m && m.cell) || 64; }
  function bbOf(m) { return (m && m.bb) || [0, 0, mCell(m), mCell(m)]; }
  function spriteScale(m, target) { return target / bbOf(m)[3]; }
  // background-position that places frame (row,col)'s character into the cropped viewport
  function frameBg(m, row, col, scale) {
    var bb = bbOf(m), cell = mCell(m);
    return (-((col * cell + bb[0]) * scale)) + 'px ' + (-((row * cell + bb[1]) * scale)) + 'px';
  }
  // full inline style for a character-cropped viewport at the given target height
  function cropStyle(m, row, col, target) {
    var bb = bbOf(m), scale = target / bb[3];
    return 'width:' + (bb[2] * scale) + 'px;height:' + (bb[3] * scale) + 'px;background-image:url(\'' + m.u + '\');'
      + 'background-repeat:no-repeat;background-size:' + (m.w * scale) + 'px ' + (m.h * scale) + 'px;'
      + 'background-position:' + frameBg(m, row, col, scale) + ';image-rendering:pixelated;';
  }
  // current animation frame {row,col} for a sprite given its state
  function framePos(m, walking) {
    var t = Date.now();
    if (walking) { var wf = m.walkFrames || 6; return { row: (m.walkRow != null ? m.walkRow : 1), col: Math.floor(t / (1000 / 7)) % wf }; }
    var iff = m.idleFrames || 1; return { row: m.idleRow || 0, col: (m.idleCol || 0) + (Math.floor(t / (1000 / 3)) % iff) };
  }
  // distinct-first order so unique agents look as different as possible (near-dupe pairs last)
  var NPC_ORDER = ['chef', 'farmer', 'fisherman', 'lumberjack', 'miner', 'bartender', 'bartender2', 'farmer2'];
  var SHEET_MAP = {};                // agentName -> npc key (built from the full roster, collision-free)
  function buildSheetMap(agents) {
    if (!NPC_KEYS.length) return;
    var pool = NPC_ORDER.filter(function (k) { return ASSETS.npcs[k]; });
    if (!pool.length) pool = NPC_KEYS.slice();
    var used = {}, map = {};
    var overrides = (lastData && lastData.appearance) || {};
    var names = (agents || []).map(function (a) { return a.name; }).slice().sort(); // stable order → stable probing
    // pin user-chosen appearances first (these win, may repeat by choice)
    for (var p = 0; p < names.length; p++) { var ov = overrides[names[p]]; if (ov && ASSETS.npcs[ov]) { map[names[p]] = ov; used[ov] = true; } }
    // auto-assign the rest collision-free
    for (var i = 0; i < names.length; i++) {
      var name = names[i]; if (map[name]) continue;
      var start = hashStr(name + '|npc') % pool.length, pick = null;
      for (var j = 0; j < pool.length; j++) { var idx = (start + j) % pool.length; if (!used[pool[idx]]) { pick = pool[idx]; break; } }
      if (pick == null) pick = pool[start]; // more agents than sprites → repeats allowed
      used[pick] = true; map[name] = pick;
    }
    SHEET_MAP = map;
  }
  function agentSheet(name) {
    if (!NPC_KEYS.length) return null;
    var k = SHEET_MAP[name] || NPC_KEYS[hashStr(name + '|npc') % NPC_KEYS.length];
    return { key: k, meta: ASSETS.npcs[k] };
  }
  function shortName(n) { n = String(n); return n.length > 13 ? n.slice(0, 12) + '…' : n; }
  function displayName(name) { var nn = (lastData && lastData.nicknames) || {}; return nn[name] || name; }
  function displayRole(name) { var rr = (lastData && lastData.roles) || {}; return rr[name] || name; }

  function firstSentence(d) {
    if (!d) return '';
    d = String(d).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    var m = d.match(/^.*?[.。]/);
    return (m ? m[0] : d).slice(0, 110);
  }
  function isHidden(name) { return !!(((lastData && lastData.hidden) || {})[name]); }
  var _hiddenOpen = false; // Hidden (N) section expanded?
  function renderAgents(agents) {
    var pool = el('pool'); if (!pool) return;
    agents = agents || [];
    buildSheetMap(agents); // collision-free NPC assignment for the whole roster (hidden included — assignments stay stable)
    var vis = agents.filter(function (a) { return !isHidden(a.name); });
    var hid = agents.filter(function (a) { return isHidden(a.name); });
    var cnt = el('agCount'); if (cnt) cnt.textContent = vis.length;
    var xpMap = (lastData && lastData.xp) || {};
    function lvOf(n) { var x = xpMap[n]; return x ? x.level : 1; }
    var sig = agents.map(function (a) { return a.name + ':' + a.model + ':' + (a.builtin ? 'b' : '') + ':' + (isHidden(a.name) ? 'h' : '') + ':' + lvOf(a.name) + ':' + displayName(a.name) + ':' + displayRole(a.name) + ':' + SHEET_MAP[a.name]; }).join('|') + (_hiddenOpen ? '+o' : '');
    if (pool._sig === sig) return; // roster unchanged — don't rebuild (keeps animations)
    pool._sig = sig;
    var html = '';
    // Hides are global to the editor, so a workspace with no agents of its own inherits the
    // hidden built-ins and the roster comes up blank. Say which of the two it is.
    if (!vis.length) {
      html += hid.length
        ? '<div class="pool-empty">Every agent is hidden.<br>Open <b>Hidden</b> below to bring one back.</div>'
        : '<div class="pool-empty">No agents yet.<br>Create one with <b>/agents</b> in Claude Code.</div>';
    }
    for (var i = 0; i < vis.length; i++) {
      var a = vis[i];
      var sheet = agentSheet(a.name);
      var inner = sheet ? '<span class="cr-sprite" style="' + cropStyle(sheet.meta, sheet.meta.idleRow || 0, sheet.meta.idleCol || 0, ROSTER_T) + '"></span>' : '';
      var nick = displayName(a.name), role = displayRole(a.name);
      // built-ins have no custom role — label them as what they are
      if (a.builtin && !((lastData && lastData.roles) || {})[a.name]) role = 'built-in';
      // TWO BUTTONS IN A WRAPPER, the same shape as a games list row (.gm-row / .gm-open /
      // .gm-fav): the card picks the agent and the gear opens its settings, and a button cannot be
      // nested in a button. The card used to be a bare <div> with a delegated click, which made the
      // whole roster mouse-only: nothing in it could be tabbed to, so neither the agent nor the
      // gear behind it was reachable without a pointer. The decorations (level, status badge) stay
      // OUTSIDE the button: they are told, not pressed, and a button's name is read from its text.
      html += '<div class="cr-card' + (a.builtin ? ' builtin' : '') + '" data-agent="' + esc(a.name) + '">'
        + '<button type="button" class="cr-gear" aria-label="Settings for ' + esc(nick) + '" title="Settings">' + GEAR_SVG + '</button>'
        + '<div class="cr-lv">Lv.' + lvOf(a.name) + '</div>'
        + '<div class="cr-badge"></div>'
        + '<button type="button" class="cr-pick" data-agent="' + esc(a.name) + '" aria-pressed="false">'
        + '<span class="cr-body">' + inner + '</span>'
        + '<span class="cr-name">' + esc(nick) + '</span>'
        + '<span class="cr-role">' + esc(role) + '</span></button></div>';
    }
    if (hid.length) {
      // Hidden agents stay reachable: an always-visible restore row, never a dead end. It discloses
      // the pool below it, so it carries aria-expanded, the same as a folded paytable, and
      // aria-controls only while that pool exists: an id pointing at nothing is worse than no
      // pointer at all, and the open/shut state is already on aria-expanded.
      html += '<button type="button" class="hid-row" id="hidRow" aria-expanded="' + (_hiddenOpen ? 'true' : 'false') + '"'
        + (_hiddenOpen ? ' aria-controls="hidPool"' : '') + '>'
        + '<span class="hid-chev' + (_hiddenOpen ? ' open' : '') + '">›</span>Hidden (' + hid.length + ')</button>';
      if (_hiddenOpen) {
        html += '<div class="hid-pool" id="hidPool">';
        for (var h = 0; h < hid.length; h++) {
          var ha = hid[h], hs = agentSheet(ha.name);
          html += '<button type="button" class="hid-card" data-agent="' + esc(ha.name) + '" title="' + esc(ha.name) + ': click to restore">'
            + (hs ? '<span class="cr-sprite" style="' + cropStyle(hs.meta, hs.meta.idleRow || 0, hs.meta.idleCol || 0, 26) + '"></span>' : '')
            + '<span class="hid-name">' + esc(displayName(ha.name)) + '</span>'
            + '<span class="hid-restore">show</span></button>';
        }
        html += '</div>';
      }
    }
    pool.innerHTML = html;
    if (selectedAgent) { var sc = pool.querySelector('.cr-card[data-agent="' + selectedAgent + '"]'); if (sc) setPicked(sc, true); } // survive rebuilds
  }
  // one card's selected state, on the wrapper (the ring) and on its button (what a screen reader
  // reads). Both or neither: a ring without aria-pressed is a selection only sighted users can see
  function setPicked(card, on) {
    if (!card) return;
    card.classList.toggle('selected', !!on);
    var b = card.querySelector('.cr-pick');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  // activity = { instances: [{key, agent, state, since, desc, tokens?, durMs?}],
  //              stats: {name: {runs, tokens, medMs}}, scope: {all, calls, matched} }
  // stats is host-side only (it sets the "stuck" threshold). The webview had an accessor and a
  // local for it that nothing read, which made the screen look scoped when every number on it
  // comes from the unscoped XP store. Removed rather than wired up: see renderScopeNote.
  function actInstances(activity) { return (activity && activity.instances) || []; }
  var STATE_RANK = { stuck: 3, active: 2, done: 1 };
  // Per-agent rollup of live instances: worst state wins, count concurrent runs.
  function activityByAgent(activity) {
    var by = {};
    var inst = actInstances(activity);
    for (var i = 0; i < inst.length; i++) {
      var s = inst[i], cur = by[s.agent];
      if (!cur) by[s.agent] = { state: s.state, since: s.since, desc: s.desc, n: 1 };
      else {
        cur.n += 1;
        if (STATE_RANK[s.state] > STATE_RANK[cur.state] || (STATE_RANK[s.state] === STATE_RANK[cur.state] && s.since > cur.since)) { cur.state = s.state; cur.since = s.since; cur.desc = s.desc; }
      }
    }
    return by;
  }
  // Round before picking the unit, so 999,500 reads "1M" rather than "1000k". Whole millions drop
  // the ".0". Tweens pass fractions, hence the rounding below 1k as well
  function fmtTok(n) {
    n = Math.round(n || 0);
    if (!n) return '0';
    var k = Math.round(n / 1000);
    if (k >= 1000) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return k + 'k';
    return String(n);
  }
  function fmtDur(ms) { var s = Math.round(ms / 1000); return s < 60 ? s + 's' : Math.round(s / 60) + 'm'; }
  // Overlay live state onto the existing cards (no rebuild → animations survive).
  function applyAgentStates(activity) {
    var pool = el('pool'); if (!pool) return;
    var by = activityByAgent(activity);
    var anyActive = false;
    var cards = pool.querySelectorAll('.cr-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i], name = card.getAttribute('data-agent');
      var st = by[name];
      var state = st ? st.state : 'idle';
      card.classList.toggle('active', state === 'active');
      card.classList.toggle('done', state === 'done');
      card.classList.toggle('stuck', state === 'stuck');
      if (state === 'active' || state === 'stuck') anyActive = true;
      // active = red pulsing outline; done = green check; stuck = amber "?"; ×N when running in parallel
      var badge = card.querySelector('.cr-badge');
      if (badge) {
        // done needs no sticker: the green ring pulse and the +XP pop already say it
        if (state === 'stuck') badge.textContent = '?';
        else if (state !== 'done' && st && st.n > 1) badge.textContent = '×' + st.n;
        else badge.innerHTML = '';
      }
    }
    pool.classList.toggle('has-active', anyActive);
  }

  // --- XP effects: "+N XP" float when a run completes, gold flash on level-up.
  var _xpPopped = {};   // instance keys already popped (a done flash lasts a few pushes)
  var _lastLv = null;   // previous level per agent — null until the first xp payload
  function xpForRunUi(tokens) { return 10 + Math.min(40, Math.round((tokens || 0) / 2000)); }
  function xpPop(card, text, cls) {
    if (!card) return;
    var p = document.createElement('div');
    p.className = 'xp-pop' + (cls ? ' ' + cls : '');
    p.textContent = text;
    card.appendChild(p);
    // the status badge sits on the same spot — hold it back until the pop has flown
    card.classList.add('xp-flash');
    setTimeout(function () {
      if (p.parentNode) p.parentNode.removeChild(p);
      card.classList.remove('xp-flash');
    }, 1600);
  }
  function applyXpEffects(d) {
    var pool = el('pool'); if (!pool) return;
    var inst = actInstances(d.agentActivity);
    for (var i = 0; i < inst.length; i++) {
      var s = inst[i];
      if (s.state !== 'done' || _xpPopped[s.key]) continue;
      _xpPopped[s.key] = 1;
      var gained = '+' + xpForRunUi(s.tokens) + ' XP';
      xpPop(pool.querySelector('.cr-card[data-agent="' + s.agent + '"]'), gained);
      var wk = walkers[s.key]; // and over the head of the character that earned it
      if (wk && wk.root) xpPop(wk.root, gained, 'wk');
    }
    var xp = d.xp || {};
    if (_lastLv) {
      var ups = [];
      for (var n in xp) { if (_lastLv[n] != null && xp[n].level > _lastLv[n]) ups.push(n); }
      // a burst of many level-ups at once is the backfill landing, not play — stay quiet
      if (ups.length <= 3) for (var j = 0; j < ups.length; j++) {
        var c2 = pool.querySelector('.cr-card[data-agent="' + ups[j] + '"]');
        if (c2) { c2.classList.add('levelup'); (function (cc) { setTimeout(function () { cc.classList.remove('levelup'); }, 1500); })(c2); }
        xpPop(c2, 'LV UP', 'lvup'); // short enough to sit on a narrow card
      }
    }
    _lastLv = _lastLv || {};
    for (var k in xp) _lastLv[k] = xp[k].level;
  }

  // --- hover profile card: level + lifetime record on ~0.3s hover, so the level
  // reads as the result of real activity, not decoration. Replaces the native
  // title tooltip (which would double up with this).
  var _profEl = null, _profT = null, _profFor = null;
  function fmtActive(ms) {
    var m = Math.round((ms || 0) / 60000);
    if (m < 1) return '<1m'; if (m < 60) return m + 'm';
    var h = Math.floor(m / 60); return h + 'h ' + (m % 60) + 'm';
  }
  function hideProf() {
    clearTimeout(_profT); _profT = null; _profFor = null;
    if (_profEl) _profEl.classList.remove('show');
  }
  function showProf(card, name) {
    var wrap = el('panelAgents'); if (!wrap) return;
    if (!_profEl) { _profEl = document.createElement('div'); _profEl.className = 'prof-card'; wrap.appendChild(_profEl); }
    var d = lastData || {};
    var ag = ((d.agents) || []).filter(function (a) { return a.name === name; })[0] || {};
    var x = (d.xp || {})[name] || { xp: 0, level: 1, runs: 0, tokens: 0, ms: 0 };
    var nick = displayName(name), role = displayRole(name);
    // XP progress within the current level: thresholds are 20·(L−1)² → 20·L²
    var base = 20 * (x.level - 1) * (x.level - 1), next = 20 * x.level * x.level;
    var into = Math.max(0, x.xp - base), span = next - base;
    var pct = Math.min(100, Math.round(into / span * 100));
    var sheet = agentSheet(name);
    var photo = sheet ? '<div class="cr-sprite" style="' + cropStyle(sheet.meta, sheet.meta.idleRow || 0, sheet.meta.idleCol || 0, 34) + '"></div>' : '';
    _profEl.innerHTML =
      '<div class="pf-hole"></div>'
      + '<div class="pf-band"><span>CREW CARD</span><span class="pf-lvl">Lv.' + x.level + '</span></div>'
      + '<div class="pf-main">'
      +   '<div class="pf-photo">' + photo + '</div>'
      +   '<div class="pf-id">'
      +     '<div class="pf-nm">' + esc(nick) + (ag.builtin ? '<span class="pf-tag">BUILT-IN</span>' : '') + '</div>'
      +     '<div class="pf-role">' + esc(role) + '</div>'
      // truncate long agent names hard so the model never gets pushed off the line
      +     '<div class="pf-orig">' + esc(nick !== name ? (name.length > 13 ? name.slice(0, 11) + '…' : name) + ' · ' : '') + esc(ag.model || '') + '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="pf-xpbar"><div class="pf-xpfill" style="width:' + pct + '%"></div></div>'
      + '<div class="pf-xptxt">' + into + ' / ' + span + ' XP</div>'
      + '<div class="pf-stats">'
      +   '<div><b>' + x.runs + '</b><span>Tasks</span></div>'
      +   '<div><b>' + fmtTok(x.tokens) + '</b><span>Tokens</span></div>'
      +   '<div><b>' + fmtActive(x.ms) + '</b><span>Active</span></div>'
      + '</div>';
    // position above the card, clamped inside the panel
    var wr = wrap.getBoundingClientRect(), cr = card.getBoundingClientRect();
    _profEl.style.visibility = 'hidden'; _profEl.classList.add('show');
    var pw = _profEl.offsetWidth, ph = _profEl.offsetHeight;
    var left = Math.max(4, Math.min(cr.left - wr.left + cr.width / 2 - pw / 2, wr.width - pw - 4));
    var top = cr.top - wr.top - ph - 6;
    if (top < 2) top = cr.bottom - wr.top + 6; // no room above -> flip below
    _profEl.style.left = left + 'px'; _profEl.style.top = top + 'px';
    _profEl.style.visibility = '';
  }
  var _profPool = el('pool'); // (declared before _poolEl below — grab our own ref)
  if (_profPool) {
    _profPool.addEventListener('mouseover', function (e) {
      var card = e.target.closest ? e.target.closest('.cr-card') : null;
      if (!card) { hideProf(); return; }
      var name = card.getAttribute('data-agent');
      if (_profFor === name) return;
      clearTimeout(_profT); _profFor = name;
      _profT = setTimeout(function () { showProf(card, name); }, 300);
    });
    _profPool.addEventListener('mouseleave', hideProf);
    _profPool.addEventListener('click', hideProf); // selection/gear: get out of the way
  }

  // collapsed Crew: a compact "now running" strip showing active/just-done agents.
  // No real progress % exists for background subagents, so we show the task text +
  // an indeterminate bar + elapsed time (honest) instead of a fabricated percentage.
  function agentModel(name) { var ag = ((lastData && lastData.agents) || []).filter(function (a) { return a.name === name; })[0]; return ag ? ag.model : ''; }
  function elapsedStr(since) { var s = Math.max(0, Math.floor((Date.now() - since) / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's'; }
  function renderCrewMini(activity) {
    var mini = el('crewMini'); if (!mini) return;
    var rows = actInstances(activity).filter(function (s) { return !isHidden(s.agent); }); // one row per invocation, parallel runs included
    if (!rows.length) { mini.innerHTML = '<div class="crew-idle">No agent running</div>'; return; }
    rows.sort(function (a, b) { if (a.state !== b.state) return (STATE_RANK[b.state] || 0) - (STATE_RANK[a.state] || 0); return b.since - a.since; });
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var st = rows[i], nm = st.agent, sheet = agentSheet(nm);
      var spr = sheet ? '<div class="cr-sprite" style="' + cropStyle(sheet.meta, sheet.meta.idleRow || 0, sheet.meta.idleCol || 0, 30) + '"></div>' : '';
      var desc = st.desc || (st.state === 'done' ? 'Done' : 'Running…');
      // "stuck?" claimed more than the data knows. All the transcript says is that no result line
      // has been written, and a reload, a cancel or a closed window looks exactly like an agent
      // that is still thinking. So the row states the fact and WaitingNote carries the rest
      if (st.state === 'stuck') desc = 'No result written yet. ' + (st.desc || '');
      else if (st.state === 'done' && st.tokens) desc = (st.desc ? st.desc + ' · ' : '') + fmtTok(st.tokens) + ' tok';
      html += '<div class="cm-row' + (st.state === 'done' ? ' done' : '') + (st.state === 'stuck' ? ' stuck' : '') + '"'
        + (st.state === 'stuck' ? ' title="' + esc(WAIT_NOTE) + '"' : '') + '>'
        + '<div class="cm-sprite">' + spr + '</div>'
        + '<div class="cm-mid"><div class="cm-top"><span class="cm-name">' + esc(displayName(nm)) + '</span><span class="cm-model">' + esc(agentModel(nm)) + '</span></div>'
        + '<div class="cm-desc">' + esc(desc) + '</div><div class="cm-bar"></div></div>'
        + '<div class="cm-time">' + elapsedStr(st.since) + '</div></div>';
    }
    mini.innerHTML = html;
  }

  // The one sentence the "?" badge cannot say. Why it is worded like this: the extension reads
  // transcripts and nothing else, so "still working" and "the session died without writing a
  // result" are the SAME record on disk: a call with no result line. Calling either one of them
  // "stuck" would be a claim the data does not support, and the four hours are worth saying
  // because they mean the row needs no action at all if the user would rather wait.
  // One per row (the tooltip in the crew strip) and one for the block heading. Written out twice
  // rather than pluralised by string surgery, so changing the wording changes the wording.
  var WAIT_NOTE = 'No result has been written back for this call. It may still be working, or its session may have ended without ever writing one. Either way the row drops off by itself 4 hours after the call.';
  var WAIT_NOTE_MANY = 'No result has been written back for these calls. Each one may still be working, or its session may have ended without ever writing one. Either way a row drops off by itself 4 hours after the call.';
  // Rows the user can clear. Kept out of the Crew fold (see html.js) so folding cannot hide the
  // only thing on this tab that asks anything of the user.
  //
  // The control CLEARS THE ROW and every word around it says so. This extension is read-only and
  // has no hooks: stopping an agent from here is not possible, and a user who read "cancel", hit
  // it, and believed the agent had stopped would be worse off than one who read nothing at all.
  // Only 'stuck' rows are listed, so there is no path from here to a healthy run.
  function renderWaiting(activity) {
    var box = el('waitBox'); if (!box) return;
    var rows = actInstances(activity).filter(function (s) { return s.state === 'stuck' && !isHidden(s.agent); });
    if (!rows.length) { box.hidden = true; box.innerHTML = ''; return; }
    rows.sort(function (a, b) { return a.since - b.since; }); // longest wait first
    var html = '<div class="wb-head">' + WARN_MID_SVG + '<span>Waiting on a result</span>'
      + '<span class="wb-n">' + rows.length + '</span></div>'
      + '<div class="wb-note">' + esc(rows.length > 1 ? WAIT_NOTE_MANY : WAIT_NOTE) + '</div>';
    for (var i = 0; i < rows.length; i++) {
      var st = rows[i];
      html += '<div class="wb-row">'
        + '<div class="wb-mid"><div class="wb-nm">' + esc(displayName(st.agent))
        + '<span class="wb-el">' + esc(fmtActive(Date.now() - st.since)) + '</span></div>'
        + (st.desc ? '<div class="wb-desc">' + esc(st.desc) + '</div>' : '') + '</div>'
        // data-key is the tool_use id: ONE invocation, so clearing one of three parallel calls of
        // the same agent leaves the other two alone
        + '<button class="wb-clear" data-key="' + esc(st.key) + '"'
        + ' title="Clear this row from the list. It does not stop the agent: this extension cannot.">Clear</button>'
        + '</div>';
    }
    box.innerHTML = html;
    box.hidden = false;
  }

  // ===========================================================================
  // 방 워커: 작업 중인 에이전트만 방에 입장해 책상으로 걸어가 일하고 나간다.
  // Sprite frames cycle in a steady loop independent of pushes.
  // ===========================================================================
  function roomSpots() { var r = (ASSETS.rooms || {})[(vscode.getState() || {}).map || 'cave'] || (ASSETS.rooms || {}).cave || {}; return { entry: r.entry || [0.26, 0.80], desk: r.desk || [0.50, 0.735] }; }
  function SPOT_ENTRY() { var e = roomSpots().entry; return { x: e[0], y: e[1] }; }
  function SPOT_DESK() { var d = roomSpots().desk; return { x: d[0], y: d[1] }; }
  var TRAVEL_MS = 1650;
  var walkers = {}; // instance key (tool_use id) -> { root, sprite, meta, mode, leaving, targetKey, _t }
  var selectedAgent = null; // roster: single selected agent (character-select style)

  function placeAt(wk, x, y) {
    wk.root.style.left = (x * 100) + '%';
    wk.root.style.top = (y * 100) + '%';
    wk.root.style.zIndex = String(Math.round(y * 100));
    wk.x = x; wk.y = y;
  }
  function ensureWalker(key, name, stage) {
    if (walkers[key]) return walkers[key];
    var sheet = agentSheet(name); if (!sheet) return null;
    var root = document.createElement('div'); root.className = 'walker'; root.style.opacity = '0';
    var sp = document.createElement('div'); sp.className = 'wk-sprite';
    var m = sheet.meta; sp.style.cssText = cropStyle(m, m.idleRow || 0, m.idleCol || 0, ROOM_T);
    var roleTag = document.createElement('div'); roleTag.className = 'wk-role'; roleTag.textContent = shortName(displayRole(name)); // job above
    var nameTag = document.createElement('div'); nameTag.className = 'wk-name'; nameTag.textContent = shortName(displayName(name)); // name below
    var dots = document.createElement('div'); dots.className = 'wk-dots'; dots.innerHTML = '<i></i><i></i><i></i>'; // working "typing" bubble
    root.appendChild(roleTag); root.appendChild(sp); root.appendChild(nameTag); root.appendChild(dots); stage.appendChild(root);
    var wk = { root: root, sprite: sp, roleTag: roleTag, nameTag: nameTag, meta: sheet.meta, mode: 'walking', leaving: false, targetKey: '' };
    walkers[key] = wk;
    var _se = SPOT_ENTRY(); placeAt(wk, _se.x, _se.y); // spawn at the doorway
    requestAnimationFrame(function () { root.style.opacity = '1'; });
    return wk;
  }
  function goTo(wk, x, y, key, onArrive) {
    if (wk.targetKey === key) return;
    wk.targetKey = key; wk.mode = 'walking';
    requestAnimationFrame(function () { placeAt(wk, x, y); });
    clearTimeout(wk._t);
    wk._t = setTimeout(function () { if (!wk.leaving && onArrive) onArrive(); }, TRAVEL_MS);
  }
  function leaveWalker(key) {
    var wk = walkers[key]; if (!wk || wk.leaving) return;
    wk.leaving = true; wk.targetKey = 'exit'; wk.mode = 'walking';
    requestAnimationFrame(function () { var _se = SPOT_ENTRY(); placeAt(wk, _se.x, _se.y); });
    clearTimeout(wk._t);
    wk._t = setTimeout(function () {
      wk.root.style.opacity = '0';
      // the note waits for the room to be genuinely empty, and the next data push can be 10s
      // away, so the walker that empties it says so on its way out
      setTimeout(function () {
        if (wk.root.parentNode) wk.root.parentNode.removeChild(wk.root);
        delete walkers[key];
        renderScopeNote(lastData && lastData.agentActivity);
      }, 450);
    }, TRAVEL_MS);
  }
  function updateRoom(activity) {
    var stage = el('wsStage'); if (!stage) return;
    // one walker per INVOCATION — parallel calls of the same agent stand side by side.
    // hidden agents are display-hidden everywhere, the room included.
    var present = actInstances(activity).filter(function (s) { return !isHidden(s.agent); });
    // header indicator while the room is folded: red dot (+ ×N) = still running in there
    var run = el('wsRun');
    if (run) { var live = present.filter(function (s) { return s.state !== 'done'; }).length; run.hidden = !live; run.textContent = live > 1 ? '×' + live : ''; }
    var keys = {};
    for (var i = 0; i < present.length; i++) keys[present[i].key] = true;
    for (var k in walkers) { if (!keys[k]) leaveWalker(k); }
    stage.classList.toggle('crowded', present.length > 2); // hide room labels when crowded (roster identifies)
    for (var j = 0; j < present.length; j++) {
      var st = present[j], name = st.agent;
      var wk = ensureWalker(st.key, name, stage); if (!wk || wk.leaving) continue;
      if (wk.roleTag) wk.roleTag.textContent = shortName(displayRole(name)); // reflect live edits
      if (wk.nameTag) wk.nameTag.textContent = shortName(displayName(name));
      wk.root.classList.toggle('stuck', st.state === 'stuck');
      wk.root.classList.toggle('done', st.state === 'done'); // stops the typing bob + dots
      var off = (j - (present.length - 1) / 2) * 0.11; // fan out if several are working
      // the room key has to be part of the target id: goTo() skips when the id is unchanged,
      // so without it a walker keeps the spot from whichever room it arrived in and stands
      // in mid-air (or on the tabletop) after a theme switch
      var _sd = SPOT_DESK(), _rk = (vscode.getState() || {}).map || 'cave';
      goTo(wk, _sd.x + off, _sd.y, _rk + ':desk' + off.toFixed(2), (function (w) { return function () { w.mode = 'working'; }; })(wk));
    }
    renderScopeNote(activity); // after the walkers, so "empty" means empty
  }
  // An empty room used to mean three different things and say none of them: nobody was invoked,
  // someone is still running, or someone ran and matched no folder open in this window. Only the
  // third is a fault, and it is the one that looks exactly like a quiet afternoon, which is why a
  // reporter sat with it for seven weeks while the crew cards' XP (awarded with no scoping at all)
  // rose beside it. The verdict is the host's: this reads scope.verdict rather than re-deriving it
  // from the counts, so the room and the diagnostic log can never answer differently.
  function renderScopeNote(activity) {
    var box = el('wsNote'); if (!box) return;
    var sc = (activity && activity.scope) || null;
    var empty = !Object.keys(walkers).length;
    var msg = '', act = '', all = false;
    if (sc && sc.all) { msg = 'Showing runs from every folder.'; act = 'This folder only'; }
    else if (sc && empty && sc.verdict === 'none-matched') {
      msg = sc.calls + (sc.calls > 1 ? ' runs today, none' : ' run today, none') + ' from this folder.';
      act = 'Show all folders'; all = true;
    }
    box.hidden = !msg;
    if (!msg) { box.innerHTML = ''; return; } // not just hidden: a stale sentence must not come back on a later show
    box.innerHTML = '<span>' + esc(msg) + '</span><button type="button" data-all="' + (all ? '1' : '0') + '">' + esc(act) + '</button>';
  }
  (function () {
    var box = el('wsNote'); if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b) return;
      vscode.postMessage({ type: 'setAgentScope', all: b.getAttribute('data-all') === '1' });
    });
  })();
  // steady sprite-frame loop (idle slow, walking faster), independent of data pushes
  setInterval(function () {
    for (var name in walkers) {
      var wk = walkers[name], m = wk.meta;
      var fp = framePos(m, wk.mode !== 'working');
      wk.sprite.style.backgroundPosition = frameBg(m, fp.row, fp.col, spriteScale(m, ROOM_T));
      wk.root.classList.toggle('working', wk.mode === 'working' && !wk.leaving); // typing bob + dots bubble
    }
  }, 60);
  // three views: usage, agents, and the games area (no tab button: the header credits line opens it).
  // Inside games there is the list, or one game's screen; body.tab-* scopes compact mode to Usage.
  // body.game-<key> says which game is open. The chevron is not touched here: it says one thing
  // (compact) and a tab switch does not change it
  function curTab() { return (vscode.getState() || {}).tab || 'usage'; }
  // WHICH DOOR OF THE CROSSROADS IS OPEN, and null is the crossroads itself. It only means
  // anything inside the games area, the same way `game` only means anything behind the Games door.
  //
  // A view STORED BEFORE THE CROSSROADS EXISTED knows a game but no door, and that is read as the
  // Games door rather than migrated: a reload has to come back where it was, and writing a key into
  // storage to say what the other key already implies is a second answer to one question
  function curDoor() {
    if (curTab() !== 'games') return null;
    var s = vscode.getState() || {};
    return s.door || (s.game ? 'games' : null);
  }
  function curGame() { return curDoor() === 'games' ? ((vscode.getState() || {}).game || null) : null; }
  function creditsHidden() { return (((lastData && lastData.cfg && lastData.cfg.panelHidden) || []).indexOf('credits') >= 0); }
  function applyView() {
    var t = curTab(), door = curDoor(), g = curGame(), b = document.body, hdc = el('hdCredits'), id;
    b.classList.toggle('tab-usage', t === 'usage');
    b.classList.toggle('tab-agents', t === 'agents');
    // ONE body class for all four screens of the games area, and no new one for the depth: what
    // compact means and what the chevron does are decided per TAB, and the crossroads, the list,
    // the shop and a table are all the same tab
    b.classList.toggle('tab-games', t === 'games');
    setVis('panelUsage', t === 'usage');
    setVis('panelAgents', t === 'agents');
    setVis('panelCross', t === 'games' && !door);
    setVis('panelShop', t === 'games' && door === 'shop');
    setVis('panelGames', t === 'games' && door === 'games' && !g);
    if (g) buildPanel(g);                          // the first time this game is opened, its markup is made here
    if (t === 'games' && door === 'shop') shopBuild(); // and the shop's, for the same reason
    // every registered game, not a list of four: the open one shows, the rest hide, and one that
    // has never been opened has nothing to hide
    for (id in PANELS) {
      b.classList.toggle('game-' + PANELS[id].key, id === g);
      if (PANELS[id].node) PANELS[id].node.style.display = (id === g) ? '' : 'none';
    }
    var au = el('tabUsage'), ag = el('tabAgents');
    if (au) au.classList.toggle('active', t === 'usage');
    if (ag) ag.classList.toggle('active', t === 'agents');
    if (hdc) hdc.setAttribute('aria-pressed', t === 'games' ? 'true' : 'false');
  }
  // THE EDITOR'S FOCUS IS NOT THIS WEBVIEW'S, and this is the one place that difference is written.
  //
  // Every screen wants the keyboard back after a repaint that moved the control it was sitting on,
  // and each one used to decide that by reading `document.activeElement`: body, hidden, disabled or
  // outside the panel meant "my focus was lost, hand it back". That reading cannot tell two
  // situations apart, because `document.body` is the answer in both of them:
  //
  //   1. the focus WAS in this panel and the repaint dropped it  -> handing it back is right
  //   2. the focus was never here. It is in the chat input, the editor, another view, and this
  //      document simply does not hold it -> taking it is theft
  //
  // The second one shipped, and it was reported as not being able to type: the market repaints once
  // a second, so every tick pulled the keyboard out of Claude Code's chat input and into this panel
  // while the user was in the middle of a sentence.
  //
  // `document.hasFocus()` is what separates the two: it is false whenever the editor's focus is
  // anywhere outside this webview's frame. So the rule, for every screen and in one function: WHILE
  // THIS DOCUMENT DOES NOT HOLD THE FOCUS, NOTHING HERE CALLS focus(). There is no situation in
  // which moving the keyboard away from what somebody is typing into is the right answer, and that
  // includes a panel that explicitly asked for it (`want`): entering a game also happens on the
  // stored tab at startup, where honouring the ask would take the keyboard off whatever the window
  // opened on.
  //
  // `want` is the panel's own ask (it entered, or the controls under the focus were swapped out).
  // Returns whether the focus was actually moved.
  function refocusIn(root, target, want) {
    if (!document.hasFocus()) return false;
    var a = document.activeElement;
    var lost = !a || a === document.body || a.hidden || a.disabled || !(root && root.contains(a));
    if (!want && !lost) return false;
    if (!target || target.hidden || target.disabled) return false;
    target.focus();
    return true;
  }

  // Whichever of the four screens in the games area is showing takes it from here: a game asks the
  // host for its round, the shop asks for what it sells, and the two screens that are only a choice
  // take the focus. All four through refocusIn, because every one of them can be the screen a
  // window OPENS on (a stored view), where taking the keyboard would take it off the editor
  function enterGames() {
    var door = curDoor();
    if (!door) {
      var first = el('crDoorGames');
      refocusIn(el('panelCross'), first, true);
      return;
    }
    if (door === 'shop') { enterShop(); return; }
    var def = PANELS[curGame()];
    if (def) { if (def.node && def.enter) def.enter(); }
    else {
      // The row is a div, and a div takes no focus: the button inside it is what opens a game.
      // The list is flat and nothing folds any more, so the first open button in the page is the
      // first row anybody can see, Favourites included (it comes first in the document)
      //
      // Through refocusIn like every screen, because this runs on the stored tab at startup too: a
      // window that opens on the games list would otherwise take the keyboard off the editor before
      // the user has looked at it
      var first = document.querySelector('#panelGames .gm-rows:not([hidden]) .gm-open');
      refocusIn(el('panelGames'), first, true);
    }
  }
  function switchTab(t) {
    if (['usage', 'agents', 'games'].indexOf(t) < 0) t = 'usage'; // a stored tab this build does not know
    if (t === 'games' && creditsHidden()) t = 'usage'; // Credits hidden in settings: no games either
    var left = curTab() === 'games' && t !== 'games';
    // LEAVING FORGETS THE DEPTH, doors included: coming back in through the coin shows the
    // crossroads, because what the coin was asked for is the two ways in. A door remembered and
    // reopened would be clever and would take that choice away again (docs/shop-spec.md, 4-3)
    var s = vscode.getState() || {}; s.tab = t;
    if (t !== 'games') { s.lastTab = t; s.game = null; s.door = null; }
    vscode.setState(s);
    if (left) gameLeave();
    applyView();
    if (t === 'games') enterGames();
  }
  // Out of the games area, to the tab that was showing when the coin was pressed. The coin is a
  // toggle and this is its other half, which is also what Escape on the crossroads does
  function leaveGames() { switchTab((vscode.getState() || {}).lastTab || 'usage'); }
  // null goes back to the crossroads
  function openDoor(d) {
    var s = vscode.getState() || {};
    s.door = d;
    if (d !== 'games') s.game = null;   // the open game lives behind the Games door only
    vscode.setState(s);
    gameLeave();
    applyView();
    enterGames();
  }
  // null goes back to the list
  function openGame(g) {
    var s = vscode.getState() || {}; s.game = g; if (g) s.door = 'games'; vscode.setState(s);
    gameLeave(); // whichever game we were in stops pacing and lets a held header push through
    applyView();
    enterGames();
  }

  // ===========================================================================
  // 미터 렌더: DOM 헬퍼 + 게이지/링/통계 타일/번레이트 배너 그리기 (render 진입점)
  // ===========================================================================
  function el(id) { return document.getElementById(id); }
  function setVis(id, on) { var e = el(id); if (e) e.style.display = on ? '' : 'none'; }
  function agoText(ts) { var s = Math.floor((Date.now() - ts) / 1000); if (s < 45) return 'now'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago'; }

  // HOW OLD THE USAGE ENDPOINT'S ANSWER IS, and it is the only thing this row talks about.
  //
  // Everything else on this tab is read from the transcripts on disk and is live by construction,
  // so a timestamp has nothing to say about it. The endpoint is the opposite: it goes quiet on a
  // 429, an expired token or a sign-out, and it does it silently. Since the ring may now be
  // drawing the WEEK (an account with no session window), a three-hour-old percentage presented as
  // the current one is the panel telling a lie, and this row is the only thing that can prevent it.
  //
  // THREE STATES, which is one more than the field used to manage:
  //   loading  the first call has not come back      -> "Checking usage", and the dot pulses
  //   fresh    it answered recently                  -> the row is not on the screen at all
  //   stale    it has not answered in STALE_AFTER_MS -> "Usage 12m ago", no dot
  // The fourth state was the defect: a dash, drawn in precisely the situation the field exists
  // for (a restored reading, or an endpoint that has stopped answering).
  //
  // THE THRESHOLD IS THE HOST'S OWN CADENCE, not a number chosen here:
  //   - extension.js's usage loop polls every 60s signed in, 120s on a shared token, and retries a
  //     refusal in 30s. It skips a cycle only while a tapped reading is under 110s old, and a tap
  //     is itself a reading. So while the pipe works at all, the newest answer is about two
  //     minutes old at worst.
  //   - 300000 is already this extension's own word for "too old to sit on": it is the throttle on
  //     both opportunistic refreshes (the window regaining focus, and the panel becoming visible),
  //     each of which goes and fetches when the last fetch was longer ago than that.
  // Five minutes is therefore two and a half times the worst healthy gap AND the point at which
  // the host itself stops expecting silence. Under it, saying anything would be noise.
  var STALE_AFTER_MS = 5 * 60 * 1000;
  // ONE writer. There used to be three: render() wrote the endpoint's age, a 30s interval wrote it
  // again, and the 1s tick wrote the age of the last PUSH over both of them. Since a push happens
  // every 10 seconds whatever the endpoint is doing, the field read "now" almost always, which is
  // how a reading that had not moved in an hour still called itself current.
  function renderFreshness(d) {
    var row = el('uhead'); if (!row) return;
    var loading = !!d && d.usageLoading === true;
    var at = (d && d.usageAt) || 0;
    // no stamp at all is not fresh: it is a reading whose age this window cannot state
    // (extension.js, restoredUsageAt), and an unstated age may not pass as a recent one
    var stale = !loading && (!at || Date.now() - at > STALE_AFTER_MS);
    row.classList.toggle('loading', loading);
    row.classList.toggle('stale', stale);
    var e = el('upd');
    if (e) e.textContent = loading ? 'Checking usage' : (stale ? (at ? 'Usage ' + agoText(at) : 'Usage limits not read yet') : '');
  }
  var _burnMsg = '';
  var _burnPrompt = '';
  // The double quote matters as much as the angle brackets: every caller here builds markup as a
  // string, and a nickname a user typed goes into attribute values (an agent's aria-label, its
  // title, its data-agent). One `"` in `Bob "B"` would close the attribute and the rest of the tag
  // would be parsed as whatever came next. In text content &quot; renders as the quote it was.
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var WARN_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#e5484d" stroke="#e5484d" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  var WARN_MID_SVG ='<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#f5a623" stroke="#f5a623" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
  // A hidden-list written before the bar and the ring became one control may still say `ring`. It
  // meant exactly what `session` means now, so it is READ as that rather than ignored: a reader who
  // had turned the ring off does not get it back on upgrade, the checkbox shows the state they
  // actually have, and the next write through the sheet (which lists only the live checkboxes)
  // replaces the old name on its own.
  function normalizeHidden(hid) {
    var out = (hid || []).slice(), r = out.indexOf('ring');
    if (r < 0) return out;
    out.splice(r, 1);
    if (out.indexOf('session') < 0) out.push('session');
    return out;
  }
  function applyPanelVis(hid) {
    hid = normalizeHidden(hid);
    setVis('pm_weekly', hid.indexOf('weekly') < 0);
    setVis('pm_fable', hid.indexOf('fable') < 0);
    setVis('pm_context', hid.indexOf('context') < 0);
    // `session` IS the ring now that the session's bar is gone: one reading, one switch. A list
    // that still says `ring` arrives here as `session` (normalizeHidden above)
    setVis('pm_ring', hid.indexOf('session') < 0);
    setVis('pm_tiles', hid.indexOf('tiles') < 0);
    // the wrap, not the image: the box has a fixed height of its own now, so hiding the picture
    // alone would leave 74px of nothing where the crab was
    setVis('pm_mascot', hid.indexOf('mascot') < 0);
    setVis('hdCredits', hid.indexOf('credits') < 0);
    if (hid.indexOf('credits') >= 0 && curTab() === 'games') switchTab((vscode.getState() || {}).lastTab || 'usage');
  }
  function setBar(id, p) { var e = el(id); if (e) { e.style.width = Math.min(p, 100) + '%'; e.style.background = grad(p); } }

  // count-up tween: from → to over 500ms
  function tween(id, from, to, fmt) {
    var e = el(id); if (!e) return;
    if (from == null || from === to) { e.textContent = fmt(to); return; }
    // the newest animation owns the element: an older loop still running stops instead of making
    // writes the newer loop overwrites in the same frame anyway (rAF runs in request order).
    // Taken only here, so a same-value push leaves a running count to finish on its own
    var tok = e._tw = (e._tw || 0) + 1;
    var dur = 500, t0 = null;
    function step(ts) {
      if (e._tw !== tok) return;
      if (t0 == null) t0 = ts;
      var k = Math.min((ts - t0) / dur, 1), ease = 1 - Math.pow(1 - k, 3);
      e.textContent = fmt(from + (to - from) * ease);
      if (k < 1) requestAnimationFrame(step); else e.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }
  function roll(id) { var e = el(id); if (e) { e.classList.remove('roll'); void e.offsetWidth; e.classList.add('roll'); } }
  function flash(id, txt) {
    var e = el(id); if (!e) return;
    e.textContent = txt; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
    clearTimeout(e._ft); e._ft = setTimeout(function () { e.textContent = ''; e.classList.remove('show'); }, 2000);
  }

  // --- credits: header second line. Balance + a coin that fills in 6 rows toward the next credit
  var CC_ROWS = 6;
  // pushes come at most every 10s (interval) or on a transcript write (200ms debounce), and even the heaviest stretch measured (118 lines/min) rarely earns 20 credits (20M tokens) between two, so a bigger jump is a sweep or another window's commit landing: count it up, don't celebrate it
  var CC_LANDING_JUMP = 20;
  var _ccRows = 0, _ccFlipT = null;
  var _reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
  function setCoinRows(n) {
    var rs = document.querySelectorAll('#hdCredits .cc-r');
    for (var i = 0; i < rs.length; i++) rs[i].classList.toggle('on', Number(rs[i].getAttribute('data-r')) <= n);
  }
  // never show a clipped number: drop the word first, then the number (the tooltip still has it)
  function fitCredits() {
    var box = el('hdCredits'); if (!box) return;
    box.classList.remove('fit1', 'fit2');
    if (box.scrollWidth > box.clientWidth) box.classList.add('fit1');
    if (box.scrollWidth > box.clientWidth) box.classList.add('fit2');
  }
  // drop the class once the flip has played: left on, it would replay the flip whenever the
  // counting pulse (which outranks it) ends
  var _ccCoinEl = document.querySelector('#hdCredits .cc-coin');
  if (_ccCoinEl) _ccCoinEl.addEventListener('animationend', function (e) { if (e.animationName === 'ccFlip') _ccCoinEl.classList.remove('flip'); });
  function flipCoin() {
    setCoinRows(CC_ROWS); // show it full
    _ccCoinEl.classList.remove('flip'); void _ccCoinEl.getBoundingClientRect(); _ccCoinEl.classList.add('flip');
    clearTimeout(_ccFlipT);
    _ccFlipT = setTimeout(function () { _ccFlipT = null; setCoinRows(_ccRows); }, 200); // edge-on at 200ms: fresh coin
  }
  function creditsTitle(c, bal, counting) {
    if (counting) return 'Counting past sessions…\n' + fmtInt(bal) + ' credits so far\nClick for games';
    return fmtInt(bal) + ' credits · +' + fmtInt(c.today || 0) + ' today\n'
      + '1 credit per ' + fmtTok(c.perCredit || 1e4) + ' tokens, weighted by API price\n'
      + 'Click for games';
  }
  function renderCredits(c) {
    if (_hold) { _ccHeld = c; return; } // a round is still being paced: the header waits for the cards
    var box = el('hdCredits'), balEl = el('ccBal'); if (!box || !balEl || !c) return;
    var bal = Math.max(0, Math.floor(c.balance || 0));
    var frac = Math.min(Math.max(c.frac || 0, 0), 0.999);
    var counting = !!c.counting;
    _ccRows = Math.floor(frac * CC_ROWS); // 0..5. All 6 rows only light up at the moment a credit mints
    box.classList.toggle('counting', counting);
    var was = prev.cr;
    balEl.textContent = fmtInt(bal); // set the final (widest) text first so the fit check measures it
    fitCredits();
    if (was != null && was !== bal && !_reduceMotion) tween('ccBal', was, bal, fmtInt);
    // a landing is not play: the first backfill (counting, or the push right after it) or a jump of CC_LANDING_JUMP or more gets no flip, no roll
    var minted = was != null && bal > was && bal - was < CC_LANDING_JUMP && !counting && !prev.crCounting;
    if (minted && !_reduceMotion && _ccCoinEl) { roll('ccBal'); flipCoin(); }
    else if (!_ccFlipT) setCoinRows(_ccRows);
    prev.cr = bal; prev.crCounting = counting;
    box.title = creditsTitle(c, bal, counting);
    // a credit minted while a bet screen is up lights its chips at once, and the shop's one button
    // is the same question asked about a price
    var open = PANELS[curGame()];
    if (open && open.node && open.credits) open.credits();
    if (curDoor() === 'shop') renderShop();
  }

  // ===========================================================================
  // The casino's shared floor: window.CUC.
  //
  // Everything a game's screen is built out of lives here, and nothing that belongs to one game.
  // The games themselves are games/<id>/panel.js, loaded after this file and registered with
  // window.CUC.game(). A panel's markup is built the first time that game is opened, so a register
  // of five games costs five list rows and one panel.
  //
  // The rules a panel may not break (they are the ones reviews check):
  //   - the host judges and prices. A panel draws the state it is sent and never works a result out
  //   - a panel never sees the seed of a round in progress, so it cannot know what is coming
  //   - the header balance waits for the cards: hold() before the pacing, settle() at the end
  // ===========================================================================
  var PANELS = {};        // game id -> the definition its panel.js registered
  var PANEL_BY_KEY = {};  // message type -> the same definition
  var ASSET_UI = ASSETS.ui || {};
  var GAME_ROWS = {};     // game id -> its row of the register (title, hint, glyph)
  (ASSET_UI.games || []).forEach(function (g) { GAME_ROWS[g.id] = g; });
  var COIN_FULL = (el('cucCoin') || {}).innerHTML || '';
  var STAKES = [10, 100, 1000];
  // With more than one other table open, which one is holding the credits is not something this
  // screen can say, so it does not name names
  var HELD_ELSEWHERE = 'Another table is holding these credits';
  var _hold = false, _ccHeld = null;  // the header waits for a reply's settle (see renderCredits)
  var _reqN = {};                     // per game: the number of the last request sent
  // What the OTHER games still have riding, per game. Every game bets from one purse but a stake
  // does not leave the balance until its round settles, so the header number is not what this game
  // may bet: the host sends `free` with every reply and the difference from the balance is what is
  // spoken for. Kept as that difference rather than as `free` itself, so a credit minted while the
  // bet screen is up lights the chips at once instead of waiting for the next reply
  var gameHeld = {};

  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmtInt(Math.abs(n)); }

  // --- the pixel cards: 16x22 cells, 2px each at a table and 4px for a hero card
  var CARD_INK = '#1d1d1f', CARD_RED = '#c25a34';
  var CARD_RANK = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
    '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '###', '#.#', '###'],
    '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
    '10': ['#.###', '#.#.#', '#.#.#', '#.#.#', '#.###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], K: ['#.#', '#.#', '##.', '#.#', '#.#']
  };
  var CARD_PIP5 = {
    S: ['..#..', '.###.', '#####', '..#..', '.###.'], H: ['##.##', '#####', '#####', '.###.', '..#..'],
    D: ['..#..', '.###.', '#####', '.###.', '..#..'], C: ['.###.', '.###.', '#####', '#.#.#', '.###.']
  };
  var CARD_PIP7 = {
    S: ['...#...', '..###..', '.#####.', '#######', '#######', '.#.#.#.', '..###..'],
    H: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    D: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
    C: ['..###..', '..###..', '##.#.##', '#######', '##.#.##', '...#...', '..###..']
  };
  var CARD_FRAME = '<path fill="#1d1d1f" fill-rule="evenodd" d="M1 0h14v1h1v20h-1v1h-14v-1h-1v-20h1zM1 1v20h14v-20z"/>';
  function bmPath(bm, ox, oy) { var d = ''; for (var y = 0; y < bm.length; y++) for (var x = 0; x < bm[y].length; x++) if (bm[y][x] === '#') d += 'M' + (ox + x) + ' ' + (oy + y) + 'h1v1h-1z'; return d; }
  var CARD_CELL = 2; // px per cell; the grid stays integer at any whole multiple
  function cardSvg(inner, cell) {
    cell = cell || CARD_CELL;
    return '<svg viewBox="0 0 16 22" width="' + (16 * cell) + '" height="' + (22 * cell) + '" shape-rendering="crispEdges" aria-hidden="true">' + CARD_FRAME + inner + '</svg>';
  }
  function cardFace(c, cell) {
    if (!c || !CARD_RANK[c.r] || !CARD_PIP5[c.s]) return CARD_BACK; // a card this table cannot draw shows its back instead of breaking the table
    var col = (c.s === 'H' || c.s === 'D') ? CARD_RED : CARD_INK;
    return cardSvg('<rect x="1" y="1" width="14" height="20" fill="#fff"/><path fill="' + col + '" d="'
      + bmPath(CARD_RANK[c.r], 2, 2) + bmPath(CARD_PIP5[c.s], 2, 8) + bmPath(CARD_PIP7[c.s], 7, 12) + '"/>', cell);
  }
  var CARD_BACK = (function () {
    var d = ''; for (var y = 2; y < 20; y++) for (var x = 2; x < 14; x++) if ((x + y) % 4 === 0 || (x - y) % 4 === 0) d += 'M' + x + ' ' + y + 'h1v1h-1z';
    return cardSvg('<rect x="1" y="1" width="14" height="20" fill="#fff"/><rect x="2" y="2" width="12" height="18" fill="#e8895a"/><path fill="#c25a34" d="' + d + '"/>');
  })();
  // What a screen reader is told. The cards are drawn as bare divs over aria-hidden art, so
  // whatever shows a card has to carry its name
  var SUIT_WORD = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  var RANK_WORD = { A: 'ace', J: 'jack', Q: 'queen', K: 'king' };
  function cardWord(c) { return c ? (RANK_WORD[c.r] || c.r) + ' of ' + (SUIT_WORD[c.s] || c.s) : 'no card'; }

  // --- the ten sea symbols' names (the slot machine).
  //
  // Same rule as cardWord above, for the same reason: the drawings are aria-hidden art
  // (games/symbols.js), so whatever shows a symbol has to carry its name. `n` is how many of them
  // are being named, and it is NOT an 's' rule: four of the ten do not take one, which is why the
  // exceptions are a set here rather than a second table of ten strings.
  // This sits in the floor rather than in the slot machine because it was written twice, in two
  // panels, before it was written once here. The second panel went on 2026-11-13 and this stayed:
  // the names are the symbol sheet's, not any one game's, and moving it back would be a third copy
  // waiting to happen the next time something is paid in these
  var SYM_WORD = {
    crab: 'crab', pearl: 'pearl', anchor: 'anchor', starfish: 'starfish', shell: 'shell',
    kelp: 'kelp', urchin: 'urchin', jellyfish: 'jellyfish', bottle: 'bottle', coral: 'coral'
  };
  var SYM_NO_S = { starfish: 1, jellyfish: 1, kelp: 1, coral: 1 };
  function symWord(sym, n) {
    var one = SYM_WORD[sym];
    if (!one) return String(sym);
    return (n === 1 || SYM_NO_S[sym]) ? one : one + 's';
  }

  // --- the pot line, and the pixel coin on it
  function potHtml(v, preview) { return '<span class="hl-pot' + (preview ? ' preview' : '') + '">' + COIN_FULL + '<b>' + fmtInt(v) + '</b></span>'; }

  // --- a still frame of an agent sprite, for whoever sits at a table
  function npcStyle(key, target) {
    var m = (ASSETS.npcs || {})[key];
    return m ? cropStyle(m, m.idleRow || 0, m.idleCol || 0, target) : null;
  }

  // --- the chips, the Deal button and the "not enough credits" note: the same for every game,
  // each with its own remembered stake and its own elements. A game describes its own with
  // CUC.stakeUi(key) and the rest is here.
  //
  // `min` is THIS TABLE'S FLOOR, which is the engine's MIN_BET. The chips are 10/100/1000 for
  // everyone, and a table that will not take 10 has to close that chip rather than leave it lit.
  // (Every table takes 10 today. The tables that did not were ones whose payouts are floored to
  // whole credits: at a bet of ten the flooring alone cost the player more than the house's own 3%,
  // so the return band broke downwards.) Without it the first Deal of a new install goes out at 10
  // and the host refuses it: a live button, a dead round and a sentence underneath.
  // A panel is webview-side and cannot require the engine, so the figure is passed in; what used to
  // be a layer per panel over the top of these controls is now this one field
  function stakeUi(key, extra) {
    return Object.assign({
      g: key, key: key + 'Stake', box: key + 'Stakes', chips: '#' + key + 'Stakes button',
      deal: key + 'Deal', note: key + 'Note', preview: '#' + key + 'Line .hl-pot.preview b'
    }, extra || {});
  }
  function stakeFloor(ui) { return (ui && ui.min > 0) ? ui.min : STAKES[0]; }
  // The lowest chip this table will take: a floor of 100 makes 100 the stake the screen opens on,
  // and the sentence under a purse too small to play says 100 rather than 10
  function stakeBase(ui) {
    var f = stakeFloor(ui);
    for (var i = 0; i < STAKES.length; i++) if (STAKES[i] >= f) return STAKES[i];
    return STAKES[STAKES.length - 1];
  }
  function stakesHtml(key) {
    return '<div class="bj-stakes" id="' + key + 'Stakes" role="group" aria-label="Bet">'
      + STAKES.map(function (v) {
        var label = v >= 1000 ? (v / 1000) + 'K' : String(v);
        return '<button type="button" data-v="' + v + '"' + (v >= 1000 ? ' aria-label="' + fmtInt(v) + '"' : '') + '>' + label + '</button>';
      }).join('')
      + '</div>';
  }
  // The remembered stake, clamped to the table's floor rather than written back to storage: a chip
  // under the floor is closed below, so nothing this screen can press ever stores one, and reading
  // it back through the floor also fixes a value some older build left behind
  function gameStake(ui) {
    var v = (vscode.getState() || {})[ui.key];
    return (STAKES.indexOf(v) >= 0 && v >= stakeFloor(ui)) ? v : stakeBase(ui);
  }
  function renderStakes(ui, locked) {
    var held = gameHeld[ui.g] || 0;
    var known = prev.cr != null, bal = known ? Math.max(0, prev.cr - held) : 0, want = gameStake(ui), pick = 0;
    var floor = stakeFloor(ui), base = stakeBase(ui);
    // largest affordable, not above the remembered stake and never below the table's floor
    STAKES.forEach(function (v) { if (v >= floor && v <= bal && v <= want) pick = v; });
    var bs = document.querySelectorAll(ui.chips);
    for (var i = 0; i < bs.length; i++) {
      var v = Number(bs[i].getAttribute('data-v')), under = v < floor, short = !under && v > bal;
      bs[i].disabled = locked || under || short;
      // THREE different reasons a chip is closed, and they are three different problems: this table
      // does not take that bet at all, the credits are riding on another table, or there are none.
      // A chip the header's balance covers but this game's share does not is another game's doing
      bs[i].title = under ? 'This table starts at ' + fmtInt(base)
        : !short ? ''
          : (known && v <= prev.cr ? HELD_ELSEWHERE : 'Not enough credits');
      bs[i].classList.toggle('on', v === pick);
      bs[i].setAttribute('aria-pressed', v === pick ? 'true' : 'false');
    }
    var deal = el(ui.deal); if (deal) { deal.disabled = locked || !pick; deal.setAttribute('data-bet', String(pick)); }
    var pv = document.querySelector(ui.preview); if (pv) pv.textContent = fmtInt(pick || want);
    // being broke and having the credits tied up in another game are different problems, and a
    // header reading 1,000 over a row of dead chips has to say which one this is. The figure is the
    // table's own lowest chip, so an expensive table asks for its own price and not for ten
    var note = el(ui.note);
    if (note) {
      note.hidden = !known || bal >= base;
      note.textContent = known && prev.cr >= base
        ? HELD_ELSEWHERE + '.'
        : 'You need ' + fmtInt(base) + ' credits to play.';
    }
  }
  // picking a chip hands the focus to Deal, so Enter right after it deals instead of picking again
  function wireStakes(ui, redraw) {
    var box = el(ui.box); if (!box) return;
    box.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null; if (!b || b.disabled) return;
      var s = vscode.getState() || {}; s[ui.key] = Number(b.getAttribute('data-v')); vscode.setState(s);
      redraw();
      var d = el(ui.deal); if (d && !d.disabled) d.focus();
    });
  }
  function setHeld(g, m) {
    if (typeof m.free === 'number' && typeof m.balance === 'number') gameHeld[g] = Math.max(0, m.balance - m.free);
  }
  // What `g` may spend now: the balance less what the OTHER screens are holding, or null before the
  // first balance has landed. One function, because the shop measures a price the same way a table
  // measures a bet and two rules would be two answers to "can I afford this"
  function freeFor(g) { return prev.cr == null ? null : Math.max(0, prev.cr - (gameHeld[g] || 0)); }

  // --- which crab is in which scene.
  //
  // Scene id -> drawing key, as the HOST worked it out: what the reader chose, read against what
  // they actually own, with every way of being wrong landing on the drawing the scene has always
  // had (shop.js, wornSlots). It rides every data push rather than the shop's own replies, because
  // the pictures it decides are on the Usage tab and most readers never open the shop at all.
  //
  // Nothing here decides anything: a window that works out its own answer is a second answer, and
  // the two would disagree the moment a purchase lost a merge in another window.
  function mascotWorn() {
    return (lastData && lastData.shop && lastData.shop.slots) || {};
  }
  // ...and which drawings belong to no scene at all but are in play (shop.js, POOL). Same source,
  // same reason: the host resolved it against what the reader owns, and a window working it out
  // for itself would be a second answer. Empty is a legal answer and means nothing ever appears
  function mascotPool() {
    return (lastData && lastData.shop && lastData.shop.pool) || [];
  }

  // --- the one figure a list row may carry, on the right of the row.
  //
  // One game has one (the market's open profit) and the reason is that the figure's whole job is to
  // have MOVED while the panel was shut. A figure on every row would be a column of numbers, and
  // then the one that moved is invisible.
  //
  // This writes into the row, not into the panel, so it works for a game whose screen has never
  // been built: the rows exist from the first paint. `dir` is 'up', 'down' or nothing, and nothing
  // is the ordinary muted colour: a figure that is neither good nor bad news takes no colour
  function rowFig(id, text, dir) {
    var e = el('fig-' + id); if (!e) return;
    e.textContent = text == null ? '' : String(text);
    e.classList.toggle('gm-up', dir === 'up');
    e.classList.toggle('gm-dn', dir === 'down');
  }

  // --- the small shared drawing jobs every panel has
  function setLive(id, text) { var e = el(id); if (e) e.textContent = text; }
  function setErr(id, msg) {
    var e = el(id); if (!e) return;
    e.hidden = !msg;
    if (msg) e.innerHTML = WARN_SVG + '<span class="wbmsg">' + esc(msg) + '</span>';
  }
  function setNote(id, text) {
    var e = el(id); if (!e) return;
    e.hidden = !text;
    if (text) e.textContent = text;
  }
  // --- the folded paytable's toggle (games/casino.js, .bj-why and .bj-pays).
  //
  // Nine screens had this same five-line body in their init(), which is nine places for one rule:
  // the button says whether the box is open and the box is hidden or it is not. The pair is wired
  // once, here, and a tenth screen with a table to fold is one call rather than another copy.
  // aria-controls is set from the box's own id, so the two cannot drift apart the way two of the
  // nine already had (the market's and Red Dog's buttons controlled nothing at all)
  function wireWhy(whyId, paysId) {
    var b = el(whyId), box = el(paysId); if (!b || !box) return;
    b.setAttribute('aria-controls', paysId);
    b.setAttribute('aria-expanded', box.hidden ? 'false' : 'true');
    b.addEventListener('click', function () {
      var open = box.hidden;
      box.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  // one bag of pacing timers per panel: a game drops its own clock when it is left
  function timers() {
    var a = [];
    return {
      at: function (ms, fn) { a.push(setTimeout(fn, ms)); },
      clear: function () { for (var i = 0; i < a.length; i++) clearTimeout(a[i]); a = []; }
    };
  }
  // a game result is not an earning: move the header number quietly, then judge any held push
  // against it
  function setCreditsQuiet(bal) {
    var balEl = el('ccBal'); if (!balEl) return;
    bal = Math.max(0, Math.floor(bal));
    var was = prev.cr; prev.cr = bal;
    balEl.textContent = fmtInt(bal); fitCredits();
    if (was != null && was !== bal && !_reduceMotion) tween('ccBal', was, bal, fmtInt);
  }
  // Leaving a game (back to the list, or out of the games area): let any held header push through,
  // or the header number stays frozen at what it showed mid-deal.
  // Same order as a settle: the number moves quietly first, so winnings are not celebrated as
  // earned credits, and the push then fills in the title and the coin
  function releaseHeldHeader() {
    _hold = false;
    if (_ccHeld) { var h = _ccHeld; _ccHeld = null; if (typeof h.balance === 'number') setCreditsQuiet(h.balance); renderCredits(h); }
  }
  // What every panel does at the end of a reply's pacing: take the balance that came with the
  // reply, then let through whatever data push was waiting behind it
  function settleHeader(m) {
    _hold = false;
    if (m && typeof m.balance === 'number') setCreditsQuiet(m.balance);
    if (_ccHeld) { var h = _ccHeld; _ccHeld = null; renderCredits(h); }
  }

  // --- messages to the host. The request number is this file's to keep: a panel only has to tell
  // its reply from a late one, and a game that numbered its own would be a game that can get it
  // wrong
  function postGame(key, op, extra) {
    var n = _reqN[key] = (_reqN[key] || 0) + 1;
    vscode.postMessage(Object.assign({ type: key, op: op, n: n }, extra || {}));
    return n;
  }

  // --- a game's heading: the back arrow, the title with its glyph, and a corner the game fills
  // with one figure of its own (best level, streak, whatever it has)
  //
  // The title sits in a span of its own (`<key>Ttl`) rather than being a bare text node, for the same
  // reason the corner has an id: a game with a depth inside itself has to be able to say which depth
  // is open, and the arrow then plainly closes the thing the heading names (see `up` below). The
  // literal space that used to sit between the glyph and the title is gone with it: `.it` is a flex
  // row with a 7px gap, and a space at the start of a flex item's first line is dropped anyway
  function frameHtml(id) {
    var row = GAME_ROWS[id] || {}, key = row.key || id;
    return '<div class="ihead bj-head">'
      + '<button type="button" class="bj-back" id="' + key + 'Back" title="All games">' + (ASSET_UI.chevron || '') + '</button>'
      + '<div class="it" title="' + esc(row.hint || '') + '">' + (row.icon || '')
      + '<span class="bj-ttl" id="' + key + 'Ttl">' + esc(row.title || row.name || '') + '</span></div>'
      + '<div class="bj-side" id="' + key + 'Side"></div></div>';
  }

  // --- keyboard. Shortcuts belong to the OPEN game only: the list and every other game never
  // react. One body class per game told four games apart, and that does not scale past a handful,
  // so the open game is asked for its own handler and nobody else is called
  // e.repeat: a held key must not keep playing hands that carry stakes
  function pressPanel(e, panel, sel, deal, bet) {
    var b = sel && document.querySelector(panel + ' [data-op="' + sel + '"]');
    if (b && !el(panel.slice(1)).hidden && !b.hidden && !b.disabled) { e.preventDefault(); b.click(); return true; }
    if (sel) return true; // a known key for this game, just not available now
    var t = e.target, d = el(deal);
    if (e.key === 'Enter' && (!t || t.tagName !== 'BUTTON') && d && !el(bet).hidden && !d.disabled) { e.preventDefault(); d.click(); }
    return true;
  }
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    var t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (document.querySelector('.sheet:not([hidden])')) return;
    var g = curGame();
    if (!g) {
      // The three screens of the games area that are not a game. Escape is the step the arrow
      // takes, and on the crossroads, which has no arrow, it is the coin button: one step out of
      // the area (docs/shop-spec.md, section 4-1)
      if (e.key === 'Escape' && curTab() === 'games') { e.preventDefault(); if (curDoor()) backStep(); else leaveGames(); }
      return;
    }
    var def = PANELS[g];
    if (def && def.node && def.keys) def.keys(e);
  });

  // --- the panels themselves. A game's markup is built once, the first time it is opened, and
  // kept: a panel that has never been opened has no elements at all, which is what lets the
  // register grow without the first paint growing with it
  function buildPanel(id) {
    var def = PANELS[id]; if (!def) return null;
    if (!def.node) {
      var host = el('gameStage'); if (!host) return null;
      var node = document.createElement('div');
      node.setAttribute('class', 'inner ' + (def.cls || def.key));
      node.setAttribute('id', def.panelId);
      node.style.display = 'none';
      node.innerHTML = def.markup();
      host.appendChild(node);
      def.node = node;
      if (def.init) def.init();
    }
    return def;
  }
  // Each game stops its own clock; the held header is let go once, here.
  // The shop keeps a clock of its own for the same reason a game does (a reply that never comes),
  // so leaving drops that too: without it a message in flight when the reader walks out leaves the
  // screen locked for four seconds, and a reader who comes straight back gets the stale shelf
  function gameLeave() {
    for (var id in PANELS) { var def = PANELS[id]; if (def.node && def.leave) def.leave(); }
    shopLeave();
    releaseHeldHeader();
  }
  // ONE ARROW MEANS ONE STEP, and this is the one place that says what a step is.
  //
  // Every back arrow on the page runs through here: each game's, the games list's and the shop's.
  // They are all the same control (.bj-back, games/casino.js) and they all climb one level, so a
  // second answer for one of them would be a reader having to know which arrow they are pressing.
  // The step depends only on where the reader is:
  //   inside a game with a depth of its own  ->  that depth closes (the panel's `up`, below)
  //   inside a game                          ->  the games list
  //   the list, or the shop                  ->  the crossroads
  // The crossroads has no arrow at all: the coin button above it is the way out, and a second
  // control for the same step is exactly what this rule exists to prevent (docs/shop-spec.md, 4-2).
  //
  // `up()` is the optional contract for a game with a depth INSIDE itself (games/README.md,
  // section 4): it returns true when it climbed one level of its own, and the arrow stops there.
  function backStep() {
    if (curGame()) {
      var def = PANELS[curGame()];
      if (def && def.node && def.up && def.up()) return;   // the game climbed one level inside itself
      openGame(null);
      return;
    }
    openDoor(null);
  }
  // Delegated on the card rather than on the games stage: the list's arrow and the shop's are in
  // panels of their own, and three listeners for one control is three places to keep in step
  var _cardEl = document.querySelector('.card');
  if (_cardEl) _cardEl.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.bj-back') : null;
    if (b) backStep();
  });
  var _crG = el('crDoorGames'), _crS = el('crDoorShop');
  if (_crG) _crG.addEventListener('click', function () { openDoor('games'); });
  if (_crS) _crS.addEventListener('click', function () { openDoor('shop'); });

  window.CUC = {
    // --- registration. id is the list row and the stored view; def.key is the message type
    game: function (id, def) {
      def.id = id;
      def.panelId = def.panelId || ('panel-' + id);
      PANELS[id] = def;
      PANEL_BY_KEY[def.key] = def;
    },
    crab: function () { return ASSET_UI.crab || ''; },
    frame: frameHtml,
    stakesHtml: stakesHtml,

    // --- elements, text and numbers
    el: el, esc: esc, fmtInt: fmtInt, signed: signed,
    coin: function () { return COIN_FULL; },
    pot: potHtml,

    // --- cards and sea symbols: what a drawing is CALLED, since the art itself is aria-hidden
    cardFace: cardFace, cardBack: function () { return CARD_BACK; }, cardWord: cardWord,
    symWord: symWord,
    npc: npcStyle,

    // --- bets
    stakeUi: stakeUi, stake: gameStake, renderStakes: renderStakes, wireStakes: wireStakes,
    setHeld: setHeld, heldElsewhere: HELD_ELSEWHERE,
    balance: function () { return prev.cr; },
    // what game `g` may stake now: the balance less what the other tables hold, or null before the
    // first balance has landed
    free: freeFor,

    // --- notices, and the one toggle every folded paytable shares
    live: setLive, err: setErr, note: setNote, rowFig: rowFig, why: wireWhy,

    // --- the host
    post: postGame,
    hold: function () { _hold = true; },
    settle: settleHeader,

    // --- pacing and keys
    timers: timers,
    reduceMotion: function () { return _reduceMotion; },
    press: pressPanel,
    // the one rule every screen keeps about the keyboard: never take it while this document does
    // not hold the focus. See refocusIn above for what that is protecting
    refocus: refocusIn,

    // --- the open game, and the panel's only door to the webview's own memory (a game with a
    // remembered choice of its own needs this, the way the stakes remember theirs)
    current: curGame,
    state: function () { return vscode.getState() || {}; },
    setState: function (s) { vscode.setState(s); }
  };

  // ===========================================================================
  // THE SHOP. Not a game, so it is not a panel: no round, no stake, no pacing, and nothing in
  // games/registry.js knows it exists (docs/shop-spec.md, section 4-5). It is drawn here for the
  // same reason the Agents tab is: what is on it is DATA (what the four scenes hold, what the rest
  // costs), and a screen built out of data cannot sit in html.js as markup.
  //
  // THE SHELF IS THE FOUR SCENES the reader named: quiet, typing, burning through the limit, out of
  // it (shop.js, SLOTS). Each one shows what is in it now and what else may go in it, and every
  // scene shows the same number of cells, so the shelf is a rectangle: the cells a scene has
  // nothing for yet are EMPTY SLOTS, which is also exactly where a new drawing would go. That is
  // what keeps a scene with one drawing from reading as a broken row.
  //
  // THREE KINDS OF CELL, and they have to be told apart at a glance:
  //   a drawing that is in use or can be chosen  a picture, a word about itself, and a RING when it
  //                                             is the one in use. A button only when choosing it
  //                                             could change anything
  //   a drawing that has not been bought         a picture and a price, and a BAR under that price
  //                                             when it is the one the button below would buy. A
  //                                             button always: a price a press does nothing to is
  //                                             what this screen was reported for
  //   an empty slot                              NO PICTURE, and the word `Soon`. Not a button and
  //                                             not in the tab order, because something that
  //                                             cannot be pressed should not be counted through by
  //                                             a reader on a keyboard
  // The picture is the separator that matters between the last two: an empty slot and a drawing in
  // a settled scene are both unpressable, so what tells them apart is that one has a crab in it.
  //
  // A RING AND A BAR ARE TWO SENTENCES IN ONE COLOUR. This screen has one accent and gains no
  // second one here, so what separates the two marks is their SHAPE and where they sit. A ring
  // encloses the cell and says WHAT IS: this drawing is in that scene now. A bar lies on the bottom
  // edge under the price and says WHAT THE ONE BUTTON IS AIMED AT: press Buy and that price is what
  // is paid. The two can never land on one cell, because nothing owned is for sale and nothing for
  // sale is worn; the one row that carries both carries them side by side, which is the only place
  // the difference has to hold up, and a box against an underline holds up there.
  //
  // WHAT IS ON SALE SITS NEXT TO THE BUTTON THAT BUYS IT, at the bottom, and it is drawn IN THE BOX
  // IT WILL ACTUALLY BE DRAWN IN (88 x 74, contain, stood on the bottom edge: the mascot's own
  // rules, styles.js), because a preview that is not the real geometry is a promise the panel then
  // breaks. THE BLOCK AND THE AIMED CELL NAME THE SAME DRAWING, which is what makes the two point
  // at each other: the same picture, the same name, the same figure, and a mark on the cell the
  // block was filled from. That block and the control row leave together: a shop with nothing left
  // to sell is a wardrobe, and a disabled button on it would be furniture.
  //
  // THE HOST JUDGES, here as everywhere. Every cell arrives with its price, whether it is owned and
  // whether choosing it could change anything, and which drawing is in which scene comes from the
  // data push (shop.js, wornSlots) rather than being worked out here: a window that worked it out
  // itself would be a second answer, and the two would disagree the moment a purchase lost a merge
  // in another window. The one comparison this file does make is the chips' own (freeFor against
  // the price), so that a credit minted while the screen is up lights the button at once instead of
  // waiting for the next reply.
  // ===========================================================================
  var SHOP_T = { noReply: 4000 };
  var SHOP_CELL = 36;          // the drawing inside a cell. The cell is 64 tall (styles.js)
  var SHOP_COL = 64;           // and 64 wide at most, which is what makes it square
  // st: the host's last view (the shelf). sig: the owned list and the worn scenes as the last push
  // reported them. pressed: the cell a press just rebuilt, so the keyboard lands back on it.
  // aim: WHICH DRAWING THE ONE BUTTON IS POINTED AT. It is a cursor and not a preference: nothing
  // is bought, worn or owed by moving it, and it is worked out again from the shelf on every
  // repaint (shopOnSale), so a key that was bought in another window heals itself rather than being
  // cleaned up. That is also why it is not stored: a saved cursor could name something already
  // bought, and the one thing it would buy back is a press the reader is standing in front of
  var sh = {
    st: null, busy: false, op: null, n: 0, to: null, wantFocus: false, pressed: null, aim: null,
    // what the last push said, in two halves (shopFromPush), and the worn map it said it with
    sigOwned: null, sigWorn: null, worn: null, pool: null, justBought: false, opKey: null
  };

  function shopMarkup() {
    return '<div class="ihead bj-head">'
      + '<button type="button" class="bj-back" id="shBack" title="Games and shop">' + (ASSET_UI.chevron || '') + '</button>'
      + '<div class="it" title="Which crab shows up when">' + (ASSET_UI.tag || '')
      + '<span class="bj-ttl">Mascot shop</span></div>'
      // the corner stays EMPTY: it is for the one figure a depth keeps reading, and this screen's
      // figures are all on the cells (docs/game-panels.md, section 2)
      + '<div class="bj-side"></div></div>'
      + '<div class="sh-slots" id="shSlots"></div>'
      // ...AND THE ROW THAT HAS NO SCENE, which is part of the shelf and sits with it. It was
      // below the button until 1.36.0, on the grounds that everything above that button is what
      // the button acts on and nothing in this row had a price. A drawing here can be bought now
      // (shop.js, PRICES), so an unbought cell takes the aim bar like any other, and a bar under
      // a price with its button ABOVE it points the wrong way. The whole shelf is above the
      // button again, which is the rule that was right in the first place
      + '<div class="sh-rand" id="shRand"></div>'
      // what is on sale, beside the button that buys it. The art is aria-hidden and the name
      // beside it is what a reader is told, the same rule the pixel cards keep (CUC.cardWord)
      + '<div class="sh-try" id="shTry" hidden>'
      + '<img id="shArt" src="" alt="" aria-hidden="true"/>'
      + '<span class="sh-what"><span class="sh-nm" id="shName"></span>'
      + '<span class="sh-price" id="shPrice"></span></span></div>'
      + '<div class="bj-sr" id="shLive" aria-live="polite"></div>'
      + '<div class="bj-note" id="shNote" hidden></div>'
      + '<div class="warnbar" id="shErr" hidden></div>'
      + '<div class="bj-ctl" id="shCtl" hidden><button type="button" class="bj-btn primary" id="shAct">Buy</button></div>';
  }
  // Built the first time the shop is opened, like a game's panel and for the same reason: a reader
  // who never opens it pays nothing for it in the first paint
  function shopBuild() {
    var node = el('panelShop');
    if (!node || node._built) return node;
    node.innerHTML = shopMarkup();
    node._built = true;
    // TWO KINDS OF PRESS ON ONE SHELF, told apart by the cell and not by the reader: a drawing that
    // is owned is put into its scene, and one that is not is what the button below will buy
    el('shSlots').addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('button.sh-cell') : null;
      if (!c) return;
      if (c.classList.contains('buy')) shopPick(c.getAttribute('data-key'));
      else shopWear(c.getAttribute('data-slot'), c.getAttribute('data-key'));
    });
    // AND A THIRD KIND OF PRESS, on its own row: not "which of these is in that moment" but
    // "is this in play at all". It is a SWITCH, and the state it asks for is the one the cell is
    // not in now, so two windows pressing at once settle rather than flip past each other
    el('shRand').addEventListener('click', function (e) {
      var c = e.target.closest ? e.target.closest('button.sh-cell') : null;
      if (!c) return;
      // ...unless it has not been bought yet, in which case it is the same press every priced
      // cell above takes: point the one button at it. A switch for something nobody owns would
      // be a switch with nothing behind it
      if (c.classList.contains('buy')) shopPick(c.getAttribute('data-pool'));
      else shopPoolSet(c.getAttribute('data-pool'), c.getAttribute('aria-pressed') !== 'true');
    });
    el('shAct').addEventListener('click', shopAct);
    return node;
  }
  // `10` and `1K` are what the stake chips already print, so a price says 1K and not 1,000: this is
  // formatting, and the figure itself is the host's
  function shopTag(p) { return p >= 1000 ? (p / 1000) + 'K' : String(p); }
  // A drawing's picture, taken from the ones THE PANEL ITSELF POINTS AT (#mascot's data-*, html.js)
  // rather than from a second list of paths: the shop sells those drawings, so a cell out of any
  // other source could show something the panel never draws. The catalog's keys are those
  // attributes' names, which is the whole of the wiring (shop.js). A key with no attribute draws
  // no picture rather than a broken one
  function shopArt(key) {
    var m = el('mascot');
    return (m && key && m.getAttribute('data-' + key)) || '';
  }
  // ...and whether THAT drawing needs its near-black ink lifted off a dark floor, read from the
  // same element and for the same reason: the list is a measured fact about the six files
  // (html.js, INK_LIFT), so it is stated once and every place that draws one of them asks here.
  // A drawing that does not need it must not get it: the edge grows around near-black ink, and on
  // a drawing whose own outline is black and which reads perfectly well already, that is a grey
  // rim around the whole crab for nothing. The stylesheet only knows the class.
  function inkLift(key) {
    var m = el('mascot');
    var list = (m && m.getAttribute('data-lift')) || '';
    return !!key && list.split(' ').indexOf(key) >= 0;
  }
  // Everything still for sale, in the shelf's own order, which is the order a reader is reading
  // ...and the last row is walked after them, in the order the shelf is read. A drawing in the
  // pool can carry a price like any other (shop.js, PRICES), and leaving it out here would draw a
  // price on a cell the one button could never be pointed at
  function shopForSale(slots) {
    var out = [], i, j;
    for (i = 0; i < slots.length; i++) {
      for (j = 0; j < slots[i].opts.length; j++) {
        if (slots[i].opts[j].price && !slots[i].opts[j].owned) out.push(slots[i].opts[j]);
      }
    }
    var p = sh.st && sh.st.pool;
    if (p && p.opts) {
      for (j = 0; j < p.opts.length; j++) {
        if (p.opts[j].price && !p.opts[j].owned) out.push(p.opts[j]);
      }
    }
    return out;
  }
  // WHAT THE ONE BUTTON BUYS: the drawing the reader aimed it at, while that drawing is still for
  // sale, and NOTHING OTHERWISE. The block and the button are not on the screen until a press
  // puts something here.
  //
  // THERE USED TO BE A FALLBACK to the first thing on the shelf, on the argument that a shelf
  // opening with nothing aimed never tells anybody a cell is pressable. That argument lost, and
  // the reason it lost is worth keeping: a live Buy button on a screen the reader has not touched
  // reads as a button that will spend something they did not choose, and what it was pointed at
  // was a mark somewhere further up. Nothing says "press me" better than a price, and every cell
  // that can be bought wears one.
  //
  // THE FALLBACK WAS ALSO THE CLEANING UP, and that job still gets done, by its absence: a
  // purchase here or in another window takes the aimed drawing off the sale list, this answers
  // with nothing, and renderShop writes that back as `sh.aim = null`. So the button leaves after
  // every purchase and the next one starts with a press, the same as the first.
  function shopOnSale(slots) {
    var sale = shopForSale(slots), i;
    for (i = 0; i < sale.length; i++) if (sale[i].key === sh.aim) return sale[i];
    return null;
  }
  function shopOptOf(key) {
    var slots = (sh.st && sh.st.slots) || [], i, j;
    for (i = 0; i < slots.length; i++) {
      for (j = 0; j < slots[i].opts.length; j++) if (slots[i].opts[j].key === key) return slots[i].opts[j];
    }
    var p = sh.st && sh.st.pool;
    if (p && p.opts) for (j = 0; j < p.opts.length; j++) if (p.opts[j].key === key) return p.opts[j];
    return null;
  }
  // One cell. `on` is whether this drawing is the one in that scene now, `pick` whether choosing in
  // this scene could change anything at all, and `aim` whether the button below is pointed here
  function shopCellHtml(slot, o, on, pick, aim) {
    var art = shopArt(o.key);
    var buy = !o.owned && !!o.price;
    var what = o.owned ? (on ? 'in use' : 'yours') : fmtInt(o.price) + ' credits';
    var tag = o.owned ? (o.price ? 'own' : 'free') : shopTag(o.price);
    var body = (art ? '<img class="sh-pic' + (inkLift(o.key) ? ' ink-lift' : '') + '" src="' + art + '" alt=""/>' : '')
      + '<span class="sh-tag">' + esc(tag) + '</span>';
    var cls = 'sh-cell' + (o.owned ? ' owned' : '') + (on ? ' on' : '');
    // BOTH KINDS CARRY WHICH SCENE AND WHICH DRAWING THEY ARE, because that is what the cell IS.
    // Only an empty slot has neither, since there is nothing there to name
    var at = ' data-slot="' + esc(slot.id) + '" data-key="' + esc(o.key) + '"';
    // A PRICE IS A BUTTON. Pressing it does not spend anything: it points the one control at this
    // drawing, and the block above that control fills with it. One vocabulary for both kinds of
    // press, `aria-pressed` on a button, and the LABEL says which sense this one is in: a word
    // about the scene when the drawing is owned, the price when it is not. Not a radio: the two
    // senses have different groups (one scene against the whole shelf), so they could not be one
    // radiogroup, and a radiogroup that does not answer the arrow keys is worse than a button
    if (buy) {
      return '<button type="button" class="' + cls + ' buy' + (aim ? ' aim' : '') + '"' + at
        + ' aria-pressed="' + (aim ? 'true' : 'false') + '"'
        + ' aria-label="' + esc(o.name + ', ' + what) + '">' + body + '</button>';
    }
    // ...and a scene with one drawing of its own is settled, so its cell is not pressable and may
    // not be in the tab order either
    if (!pick) {
      return '<span class="' + cls + '"' + at + ' role="img" aria-label="'
        + esc(o.name + ', ' + what) + '">' + body + '</span>';
    }
    return '<button type="button" class="' + cls + ' pick"' + at
      + ' aria-pressed="' + (on ? 'true' : 'false') + '"'
      + ' aria-label="' + esc(o.name + ', ' + what) + '">' + body + '</button>';
  }
  // A CELL ON THE LAST ROW, which asks a different question from every cell above it. Those say
  // which ONE drawing is in a moment; this says whether a drawing that belongs to no moment is in
  // play at all. So the ring is the same ring and means the same thing it always means (this one
  // is showing), and the word under it is `on` or `off` rather than what it cost.
  //
  // UNTIL IT HAS BEEN BOUGHT, and a drawing on this row can have a price (shop.js, PRICES: the
  // black hole is 10K). Then it is the same cell every priced cell above is: the price as its
  // word, the aim bar when the one button is pointed at it, and a press that moves that aim
  // rather than switching something nobody owns yet.
  //
  // IT IS ALWAYS PRESSABLE, unlike a scene with one drawing. A scene must always have something in
  // it, so one drawing settles it and the cell is not a button; a pool may be empty, and emptying
  // it is how a reader who does not want the panel changing under them turns the whole thing off.
  function shopPoolCellHtml(o, on, aim) {
    var art = shopArt(o.key);
    var buy = o.price && !o.owned;
    var pic = art ? '<img class="sh-pic' + (inkLift(o.key) ? ' ink-lift' : '') + '" src="' + art + '" alt=""/>' : '';
    if (buy) {
      // ONE GRAMMAR FOR BOTH LIVES AND FOR BOTH ROWS: aria-pressed on a button, and the LABEL says
      // which sense it is in. Here it is the priced sense the scenes' cells use, so the state it
      // carries is the one they carry, which is whether the button below is pointed at this cell.
      // Leaving it off would make this the only pressable cell on the shelf with no state at all
      return '<button type="button" class="sh-cell buy' + (aim ? ' aim' : '') + '"'
        + ' data-pool="' + esc(o.key) + '" aria-pressed="' + (aim ? 'true' : 'false') + '"'
        + ' aria-label="' + esc(o.name + ', ' + fmtInt(o.price) + ' credits') + '">'
        + pic + '<span class="sh-tag">' + esc(shopTag(o.price)) + '</span></button>';
    }
    return '<button type="button" class="sh-cell pick' + (on ? ' on' : '') + '"'
      + ' data-pool="' + esc(o.key) + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
      + ' aria-label="' + esc(o.name + ', ' + (on ? 'in play' : 'off')) + '">'
      + pic + '<span class="sh-tag">' + (on ? 'on' : 'off') + '</span></button>';
  }
  // The row itself: the same heading the scenes have, because it answers the same question with
  // the only answer it has, and then the cells. The empty ones are the scenes' empty ones exactly
  function shopPoolHtml() {
    var p = sh.st && sh.st.pool;
    if (!p || !p.opts) return '';
    var on = mascotPool(), j;
    var html = '<div class="sh-shead"><span class="sh-sn">' + esc(p.name) + '</span>'
      + '<span class="sh-sw">' + esc(p.when) + '</span></div>'
      // no inline column count here: this row is four across or two by two by its own rule
      // (styles.js, .sh-rand .sh-opts) rather than by the widest scene above it
      + '<div class="sh-opts" role="group" aria-label="' + esc(p.name) + '">';
    var sale = shopOnSale((sh.st && sh.st.slots) || []);
    for (j = 0; j < p.opts.length; j++) {
      html += shopPoolCellHtml(p.opts[j], on.indexOf(p.opts[j].key) >= 0,
        !!sale && sale.key === p.opts[j].key);
    }
    for (j = p.opts.length; j < p.cells; j++) html += shopSoonHtml();
    return html + '</div>';
  }
  // An empty slot: the frame, the word, and no picture. It says that more goes here without saying
  // what, because that has not been decided
  function shopSoonHtml() {
    return '<span class="sh-cell soon" role="img" aria-label="An empty slot, nothing in it yet">'
      + '<span class="sh-tag">Soon</span></span>';
  }
  function renderShop() {
    var node = el('panelShop');
    if (!node || !node._built) return;
    var slots = (sh.st && sh.st.slots) || [];
    if (!slots.length) return;        // nothing has been answered yet: draw nothing rather than a guess
    var worn = mascotWorn(), i, j;
    // which cell the keyboard is on, before this repaint takes it away (restored at the end)
    var was = document.activeElement;
    var onCell = (was && was.closest) ? was.closest('.sh-cell') : null;
    // a cell is named by its scene and its drawing, or, on the last row, by its drawing alone
    var keep = onCell && (onCell.getAttribute('data-pool')
      ? '[data-pool="' + onCell.getAttribute('data-pool') + '"]'
      : '[data-slot="' + onCell.getAttribute('data-slot') + '"][data-key="' + onCell.getAttribute('data-key') + '"]');
    // every scene shows the same number of cells, which is as many as the widest one has: the
    // shelf is a rectangle and the spare cells are where the next drawing goes
    var wide = 1;
    for (i = 0; i < slots.length; i++) wide = Math.max(wide, slots[i].opts.length);
    // WHAT THE BUTTON BUYS IS SETTLED BEFORE THE SHELF IS DRAWN, because the cell it points at
    // wears the mark. The answer is written back, so the cursor follows a purchase made here or in
    // another window instead of pointing at something nobody can buy any more
    var sale = shopOnSale(slots);
    sh.aim = sale ? sale.key : null;
    var html = '';
    for (i = 0; i < slots.length; i++) {
      var s = slots[i], on = worn[s.id] || s.free;
      html += '<div class="sh-slot">'
        + '<div class="sh-shead"><span class="sh-sn">' + esc(s.name) + '</span>'
        + '<span class="sh-sw">' + esc(s.when) + '</span></div>'
        // the column count is the DATA's, so a third drawing in any scene widens every row
        // without a stylesheet edit
        + '<div class="sh-opts" role="group" aria-label="' + esc(s.name) + '"'
        + ' style="grid-template-columns:repeat(' + wide + ',minmax(0,' + SHOP_COL + 'px))">';
      for (j = 0; j < s.opts.length; j++) {
        html += shopCellHtml(s, s.opts[j], s.opts[j].key === on, s.pick, !!sale && s.opts[j].key === sale.key);
      }
      for (j = s.opts.length; j < wide; j++) html += shopSoonHtml();
      html += '</div></div>';
    }
    el('shSlots').innerHTML = html;
    el('shRand').innerHTML = shopPoolHtml();
    // what is on sale, and the one control. Both leave together when there is nothing left to buy
    el('shTry').hidden = !sale;
    el('shCtl').hidden = !sale;
    var note = el('shNote');
    note.hidden = true;
    if (sale) {
      el('shArt').setAttribute('src', shopArt(sale.key));
      el('shArt').classList.toggle('ink-lift', inkLift(sale.key));
      el('shName').textContent = sale.name;
      el('shPrice').innerHTML = COIN_FULL + '<b>' + fmtInt(sale.price) + '</b>';
      // what the price is measured against is the credits this screen may spend, not the header's
      // balance: a round in progress elsewhere is holding some of that balance and the host would
      // refuse a purchase made against it
      var room = freeFor('shop'), known = prev.cr != null;
      var afford = room != null && sale.price <= room;
      var btn = el('shAct');
      btn.disabled = sh.busy || !afford;
      btn.title = 'Buy the ' + sale.name;
      // and why not, when the answer is no. The same two sentences the stake chips use, because
      // being broke and having the credits tied up at a table are different problems
      note.hidden = !known || afford;
      if (!note.hidden) {
        note.textContent = prev.cr >= sale.price
          ? HELD_ELSEWHERE + '.'
          : 'You need ' + fmtInt(sale.price) + ' credits.';
      }
    }
    // A REPAINT MAY NOT DROP THE KEYBOARD. The whole shelf is replaced, so whatever cell the
    // reader was on is detached by it, and the same repaint is run by more than one thing (a
    // choice, a credit landing, another window's push). So which cell it was is read off the page
    // BEFORE the replace rather than remembered from the press, and handed back after, through
    // refocusIn so that a document which does not hold the focus is handed nothing
    if (keep) {
      var again = node.querySelector('.sh-cell' + keep);
      if (again) refocusIn(node, again, false);
    }
  }
  // Choosing is NOT a shop message and not money: it is a preference, and the host keeps it beside
  // the nicknames and the agents' appearances (extension.js). Nothing is drawn here either: the
  // data push is what says which drawing is in a scene, the panel's own crab reads that same
  // field, and drawing it early would be a second answer for as long as the round trip takes
  function shopWear(slot, key) {
    if (!slot || !key) return;
    vscode.postMessage({ type: 'mascotSlot', slot: slot, key: key });
  }
  // ...and switching one that belongs to no scene in or out. Same rule, same silence: the host
  // refuses or stores it, and the data push is what says what the state now is
  function shopPoolSet(key, on) {
    if (!key) return;
    vscode.postMessage({ type: 'mascotPool', key: key, on: !!on });
  }
  // Pointing the one button at a price. NOTHING IS SENT AND NOTHING IS STORED: no money moves, the
  // host is not asked, and the next repaint would work the same answer out again. A cursor is the
  // one thing on this screen the window may decide by itself
  function shopPick(key) {
    if (!key || !shopOptOf(key)) return;
    var moved = sh.aim !== key;
    sh.aim = key;
    if (moved) renderShop();
    // EVERY PRESS IS ANSWERED, including the one that lands on the drawing already aimed at. With
    // one thing on the shelf that is the only press there is, and a press that changed nothing on
    // the screen is what this screen was reported for. The answer is the block the price went to
    shopPointAtSale();
    if (moved) {
      var o = shopOptOf(key);
      setLive('shLive', 'Buy: ' + o.name + ', ' + fmtInt(o.price) + ' credits.');
    }
  }
  // The block that holds what is on sale, told to say so again. The class is taken off and put back
  // with a read of the layout in between, because an animation that is already on an element does
  // not restart on its own and a second press would then be the silent one
  function shopPointAtSale() {
    var b = el('shTry');
    if (!b || b.hidden) return;
    b.classList.remove('ping');
    void b.offsetWidth;
    b.classList.add('ping');
  }
  function shopSend(op, key) {
    if (sh.busy) return;
    sh.busy = true; sh.op = op; sh.opKey = key || null;
    sh.n = postGame('shop', op, key ? { key: key } : null);
    renderShop();                       // the button locks while the message is out
    clearTimeout(sh.to);
    sh.to = setTimeout(function () {
      sh.busy = false; sh.op = null;
      setErr('shErr', 'The shop didn’t respond. Try again.');
      renderShop();
    }, SHOP_T.noReply);
  }
  function shopAct() {
    var sale = shopOnSale((sh.st && sh.st.slots) || []);
    if (!sale || sh.busy) return;
    shopSend('buy', sale.key);
  }
  // A REPLY WITH NO `state` IS A REASON AND NOT A SHELF (games/README.md, section 5): the sentence
  // goes up, what is drawn stays drawn, the wait is released and nothing else moves. The money on
  // such a reply is still true, so the header takes it as it would any other
  function shopReceive(m) {
    var current = sh.op != null && m.n === sh.n;
    if (!current && sh.op != null) return;   // an older reply while a newer request is still out
    var was = sh.op, wasKey = sh.opKey;
    clearTimeout(sh.to);
    sh.busy = false; sh.op = null; sh.opKey = null;
    setHeld('shop', m);
    // the reply moves the OWNED half of what is known and not the worn half, which it does not
    // carry (shopFromPush above)
    if (m.state) { sh.st = m.state; sh.sigOwned = shopOwnedSig(m.state); }
    settleHeader(m);                         // the balance moves quietly: a purchase is not an earning
    setErr('shErr', m.error || '');
    renderShop();
    if (current && was && was !== 'open' && !m.error && m.state) {
      shopAnnounce(was, wasKey);
      // ...and the push that follows a purchase carries the scene it went into, which is the same
      // event. One event is one announcement, so the scene is not read out on top of it
      if (was === 'buy') sh.justBought = true;
    }
    shopFocusAfter();
  }
  // What a drawing is CALLED, out of the shelf the host last sent: the names are not this file's
  function shopNameOf(key) {
    var o = shopOptOf(key);
    return o ? o.name : 'It';
  }
  function shopAnnounce(op, key) {
    if (op !== 'buy') return;
    // the key is the one that was SENT: by the time this reply has landed the thing bought is no
    // longer the thing on sale, so the screen cannot be asked what it was
    setLive('shLive', shopNameOf(key) + ' bought. Balance ' + fmtInt(prev.cr || 0) + '.');
  }
  // The keyboard, by the one rule every screen keeps: the panel asks, and CUC.refocus decides
  // whether the ask may be honoured at all (refocusIn above). What a reader presses takes it: the
  // button while there is something to buy, else the first cell a press would do something to, and
  // the arrow out when the shelf is settled and there is nothing in here to land on
  function shopFocusAfter() {
    if (curDoor() !== 'shop') return;
    var want = sh.wantFocus;
    sh.wantFocus = false;
    var btn = el('shAct');
    var target = (btn && !btn.disabled && !el('shCtl').hidden) ? btn
      : (el('shSlots') && el('shSlots').querySelector('button.sh-cell')) || el('shBack');
    refocusIn(el('panelShop'), target, want);
  }
  // WHAT THE PUSH LAST SAID, as TWO signatures rather than one, because the two halves come from
  // different places and a change in each needs a different thing done about it:
  //
  //   WHAT IS OWNED is on the shelf's own rows, and those come from a REPLY, so a purchase has to
  //   be asked for again. Only when it moved, or the screen would re-ask after every purchase it
  //   made itself, which is a round trip for an answer it already has: a reply moves this half on
  //   its own for exactly that reason.
  //   WHICH DRAWING IS WORN rides the push, so a choice is a repaint and not a round trip, here
  //   and in the window that did not make it. A reply does NOT carry it and so may not move this
  //   half: one that did would leave the next push looking like a change nobody made.
  function shopOwnedSig(s) { return (s.owned || []).join(','); }
  // the last row rides the same half: what is in play is a choice, it comes on the push, and a
  // press on it is a repaint rather than a round trip, here and in the window that did not press
  function shopWornSig(s) { return JSON.stringify(s.slots || {}) + '|' + (s.pool || []).join(','); }
  function shopFromPush(d) {
    var s = d && d.shop;
    if (!s) return;
    var ownedSig = shopOwnedSig(s), wornSig = shopWornSig(s);
    var first = sh.sigOwned == null;
    var ownedMoved = !first && ownedSig !== sh.sigOwned;
    var wornMoved = !first && wornSig !== sh.sigWorn;
    var was = sh.worn, wasPool = sh.pool;
    sh.sigOwned = ownedSig; sh.sigWorn = wornSig; sh.worn = s.slots || {}; sh.pool = s.pool || [];
    if (first || curDoor() !== 'shop') return;
    if (ownedMoved) { if (!sh.busy) shopSend('open'); return; }
    if (!wornMoved) return;
    renderShop();
    if (sh.justBought) sh.justBought = false;      // the purchase has already been read out
    else if (!shopPoolLive(wasPool, s.pool || [])) shopSceneLive(was, s.slots || {});
  }
  // A switch, read out, and whether there was one: the scene reader below is asked only when
  // there was not, since one press cannot be both
  function shopPoolLive(was, now) {
    var p = sh.st && sh.st.pool;
    if (!p || !p.opts || !was) return false;
    for (var i = 0; i < p.opts.length; i++) {
      var k = p.opts[i].key, on = now.indexOf(k) >= 0;
      if (on === (was.indexOf(k) >= 0)) continue;
      setLive('shLive', p.opts[i].name + (on ? ' is in play.' : ' is off.'));
      return true;
    }
    return false;
  }
  // A choice, read out: the scene that MOVED and what is in it now. The names are the shelf's own,
  // so this says nothing the screen is not also showing
  function shopSceneLive(was, now) {
    var slots = (sh.st && sh.st.slots) || [], i, j;
    for (i = 0; i < slots.length; i++) {
      var id = slots[i].id;
      if (!was || was[id] === now[id]) continue;
      for (j = 0; j < slots[i].opts.length; j++) {
        if (slots[i].opts[j].key !== now[id]) continue;
        setLive('shLive', slots[i].name + ': ' + slots[i].opts[j].name + '.');
        return;
      }
    }
  }
  // What a game's leave() does, for the screen that is not a game: drop the clock and the request
  // in flight. A late reply after this is drawn as it stands, which is the floor's rule for one
  function shopLeave() { clearTimeout(sh.to); sh.busy = false; sh.op = null; }
  function enterShop() {
    shopBuild();
    sh.wantFocus = true;
    renderShop();          // whatever was already known, so the screen is never blank on a reopen
    shopSend('open');
  }

  // live tick every 1s: active time + countdowns + "Updated Ns ago"
  function tick() {
    if (lastData) {
      var d = lastData;
      if (d.fh) {
        var v = activeTime(d.fh.resets_at), te = el('st_time');
        if (te && te.textContent !== v) { te.textContent = v; roll('st_time'); }
        var r = cd(d.fh.resets_at); if (el('s_sub')) el('s_sub').textContent = r ? r + ' left' : '';
      } else if (noSessionWindow(d) && d.sd) {
        // no window to count down, so the line under the ring counts the week down instead. The
        // tile above it is not ticked: today's span only moves when a message lands, and a message
        // landing is a push
        var rw = cd(d.sd.resets_at); if (el('s_sub')) el('s_sub').textContent = rw ? rw + ' left' : '';
      }
      if (d.sd) { var r2 = cd(d.sd.resets_at); if (el('w_sub')) el('w_sub').textContent = r2 ? r2 + ' left' : ''; }
    }
    // the freshness row has to be able to APPEAR without a push, since the thing it reports is
    // the absence of one. It is cheap: two class toggles and a string
    renderFreshness(lastData);
    // ...and the drawing with no scene, which is the other thing here that happens without a push
    cameoTick();
  }
  setInterval(tick, 1000);

  function meter(pfx, obj, showReset, loading) {
    if (!obj || obj.used_percentage == null) {
      var pe = el(pfx + '_pct'); if (pe) pe.textContent = loading ? 'loading' : '—';
      var fe = el(pfx + '_fill'); if (fe) fe.style.width = '0%';
      if (showReset) { var se = el(pfx + '_sub'); if (se) se.textContent = ''; }
      return;
    }
    var p = Math.round(obj.used_percentage);
    tween(pfx + '_pct', prev[pfx], p, function (v) { return Math.round(v) + '%'; });
    setBar(pfx + '_fill', p);
    if (prev[pfx] != null && p > prev[pfx]) flash(pfx + '_delta', '+' + (p - prev[pfx]) + '%');
    prev[pfx] = p;
    if (showReset && el(pfx + '_sub')) { var r = cd(obj.resets_at); el(pfx + '_sub').textContent = r ? r + ' left' : ''; }
  }

  // --- the mascot's four states, with a DEADBAND.
  // The steps used to be hard lines at 50 / 70 / 90 against the raw percentage the host pushes, so
  // a window sitting on 49.8 that ticked to 50.1 and back changed the drawing on every push. A step
  // is ENTERED at its line and LEFT three points below it, which is wider than any jitter in a
  // reading and narrower than any real move.
  var MASCOT_STEPS = [
    { name: 'working', up: 50, down: 47 },
    { name: 'despair', up: 70, down: 67 },
    { name: 'stunned', up: 90, down: 87 }
  ];
  var _mascotStep = 0;        // 0 = idle, otherwise the step's index plus one
  // The first reading is not a transition, it is the first drawing, and a panel that has only just
  // opened has no reading at all (the usage call is still out). So this turns true on the first
  // push that CARRIES a session percentage, not on the first push.
  var _mascotDrawn = false;
  function mascotState(sess, weekly) {
    var step = 0;
    for (var i = 0; i < MASCOT_STEPS.length; i++) {
      // standing on this step already? then the lower edge is what holds it here
      var edge = _mascotStep > i ? MASCOT_STEPS[i].down : MASCOT_STEPS[i].up;
      if (sess >= edge) step = i + 1; else break;
    }
    // What is REMEMBERED is where the session stands, and only that. A spent week stuns on top of
    // it, and writing that down as the session's own step would make the session leave the top
    // step at 87 without ever having reached 90: a window at 88% that was stunned by the week
    // would stay stunned after the week turned over.
    _mascotStep = step;
    if (weekly >= 100) step = MASCOT_STEPS.length;
    return step ? MASCOT_STEPS[step - 1].name : 'idle';
  }
  // WHAT THE STEPS ARE MEASURED AGAINST, as one number on the 0..100 scale they were drawn for.
  //
  // The steps and the deadband above are not touched by any of this, and that is the whole design:
  // an account with a five-hour window gets exactly the number it got before, so the picture a Pro
  // or Max reader sees cannot move. Only the input differs, and only for the account that has no
  // window to read (webview.js, noSessionWindow).
  //
  // For that account the weekly percentage may NOT go in raw. A week fills over seven days, so 50%
  // of it on day four is on course and 50% of a five-hour window is halfway through the afternoon:
  // feeding the raw figure in would leave the crab idle through almost every week. What a reader
  // actually wants to know is whether today's rate runs out before the reset does, which is a PACE:
  // 1.0 is spending the week exactly evenly, and the x50 puts 1.0 on the working line (50), 1.4 on
  // despair (70) and 1.8 on stunned (90) without moving a single threshold.
  //
  // THE SECOND AXIS ARRIVED, AND IT IS NOT IN HERE. "Is anyone working right now" picks WHICH
  // DRAWING is shown and this function still answers WHICH STEP, so the two sit side by side
  // (mascotQuiet and MASCOT_ART below) rather than one inside the other. Nothing about this
  // function's inputs or its output moved, which is what keeps a Pro or Max reader's picture
  // exactly where it was (docs/shop-spec.md, section 8).
  function mascotStrain(d, noSession) {
    if (!noSession) return (d.fh && d.fh.used_percentage) || 0;
    if (!d.sd || d.sd.used_percentage == null) return 0;
    var W = 7 * 86400;
    // how far INTO the weekly window we are, from its reset time. A null reset reads as a full
    // week elapsed, which makes the pace the raw percentage halved rather than a division by zero
    var e = Math.min(1, Math.max(0, 1 - (d.sd.resets_at - Date.now() / 1000) / W));
    // the percentage an even spender would have reached by now. The floor matters: for the first
    // 8.4 hours of a week `e * 100` is under 5 and any real use divided by it explodes
    var expected = Math.max(5, e * 100);
    return Math.min(100, Math.round(d.sd.used_percentage / expected * 50));
  }
  // --- WHICH DRAWING, the second axis: is anything being answered right now.
  //
  // The step above is how much of the limit is gone. This is whether the account is being used at
  // all, and it changes the picture without changing the step: the same idle step is a crab at a
  // laptop while the replies are landing and a crab floating in the water when they stop.
  //
  // THE THRESHOLD IS COUNTED, NOT CHOSEN. Three days of this reader's own transcripts, 4,309
  // assistant replies, put the gap between two replies at a median of 2.3s and a 99th percentile of
  // 67.5s. 180s is 2.7 times that p99, and it is what leaves the fewest gaps sitting ON it: 15 gaps
  // in three days cross it and 4 land within a quarter of it, against 55 and 62 at a minute
  // (docs/shop-spec.md, section 5-2). A threshold on the shoulder of the distribution is a drawing
  // that comes and goes during one piece of work.
  var QUIET_MS = 180000;
  // The two axes as one table: the step picks the row, `mascotQuiet` picks the column. Despair and
  // stunned read the same either way, and deliberately: there the LIMIT is the news, and whether a
  // reply landed ten seconds ago does not change it. Stunned also cannot really have two columns,
  // because a blocked limit stops the replies that would keep it busy.
  var MASCOT_ART = {
    idle: { busy: 'coding', quiet: 'idle' },
    working: { busy: 'working', quiet: 'idle' },
    despair: { busy: 'despair', quiet: 'despair' },
    stunned: { busy: 'stunned', quiet: 'stunned' }
  };
  // --- AND WHICH OF THE FOUR SCENES each of those cells is, where the reader has a say.
  //
  // The shop sells drawings into four scenes the reader named: quiet, typing, burning through the
  // limit, and out of it (shop.js, SLOTS). Those are not the same shape as the table above, which
  // is four steps by two columns, so this says which cell belongs to which scene and the table is
  // left exactly as it was: a cell with no entry here keeps the drawing above it whatever anybody
  // chooses, and a cell with one reads the scene's drawing out of the push and falls back to the
  // table when there is nothing to read (a window that has not had a push yet, or a host that is
  // older than this file).
  //
  // THE WORKING STEP'S BUSY CELL IS THE ONE WITH NO ENTRY, and that is a decision. It is the only
  // picture that says the limit is filling up WHILE you work, and putting the typing scene over it
  // would let one choice flatten 5% and 65% of the limit into the same drawing: the step axis would
  // then say nothing at all in the busy column until despair. `working` is still choosable, in the
  // typing scene, where it is an alternative rather than the only answer.
  var MASCOT_SLOT = {
    idle: { busy: 'typing', quiet: 'quiet' },
    working: { quiet: 'quiet' },
    despair: { busy: 'burn', quiet: 'burn' },
    stunned: { busy: 'spent', quiet: 'spent' }
  };
  // WHICH DRAWING: the step picks the row, the clock picks the column, and the reader's own choice
  // picks the picture wherever that cell is one of the four scenes
  function mascotArt(step, d) {
    var col = mascotQuiet(d) ? 'quiet' : 'busy';
    var scene = MASCOT_SLOT[step][col];
    return (scene && mascotWorn()[scene]) || MASCOT_ART[step][col];
  }
  // NO DEADBAND HERE, and that is not an oversight: the steps have one because they cut a noisy
  // scalar, and this cuts a clock. One side of it is an EVENT (a message landed, and the host's
  // fs.watch pushes within 200ms) and the other is TIME (the threshold passed, and the host's own
  // 10s loop is what notices), so there is no pair of edges to write. The asymmetry is the one the
  // product wants: typing shows at once, stopping is noticed slowly.
  function mascotQuiet(d) {
    var t = d && d.last && d.last.t;   // today's last assistant message. None at all is quiet
    return !t || (Date.now() - t) >= QUIET_MS;
  }

  // --- A DRAWING WITH NO SCENE ----------------------------------------------------------------
  //
  // Everything above answers a question about the account: how much of the limit is gone, and
  // whether anything is being answered. This answers none. It is a drawing that turns up now and
  // then for a few seconds and is then not there any more, and the whole of it is that there is no
  // rule to find.
  //
  // IT CANNOT BE SUMMONED AND NOTHING IS WON BY IT. No credit is earned, spent or held by its
  // appearing, nothing is recorded, no message is sent when it does, and spending more tokens does
  // not make it likelier: the clock below is the only input. Two windows run their own and will
  // disagree, which is right for a decoration, and neither takes the focus or moves anything: the
  // picture goes into the same fixed 88x74 box every state uses (styles.js, .mascot-wrap), so the
  // card is the same height during one as it is the rest of the time.
  //
  // IT IS COUNTED IN TICKS AND NOT IN WALL CLOCK, which is the one implementation choice here
  // worth writing down. The panel already has a one-second tick and that tick IS the unit the
  // rarity is stated in: a second of a panel somebody could have been looking at. A clock would
  // count a laptop that was shut for the afternoon and hand the reader three of these in a row on
  // waking, and it would count a sidebar that was closed all morning. So the counter below only
  // moves when the tick runs and the document is visible, and "twenty minutes" means twenty
  // minutes of that.
  //
  // HOW RARE, in two numbers, because one would not do it.
  //   CAMEO_FLOOR  Nothing twice inside five minutes. "No pattern" has to stop short of "it keeps
  //                doing it": two showings thirty seconds apart read as a beat and five minutes
  //                apart do not. It is also longer than the quiet threshold above (180s), so a
  //                cameo can never be the SECOND thing that changes the crab inside one quiet
  //                transition. It is counted from a panel OPENING too, so the first thing a reader
  //                sees is never this.
  //   CAMEO_ODDS   One in 900 ticks above that floor, which is memoryless, so there is no rhythm
  //                left to learn: every tick carries the same chance. Mean gap 20 minutes, median
  //                15.4, nine in ten under 40.
  // At four seconds a showing that is 0.33% of the time.
  //
  // HOW LONG. Four seconds is five whole loops of the drawing in the pool today (8 frames x 100ms,
  // measured). The file loops for ever, so the panel is what ends it: one loop would be a flicker
  // nobody could name, and much longer would start to compete with the state it borrowed.
  //
  // WHERE IT MAY NOT GO, and this is the part that is not taste. Not in despair and not in
  // stunned: there the drawing IS the message, and a vortex over "the limit is used up" replaces a
  // warning with a joke. And not while the burn-rate bubble is up, because that bubble's tail is
  // placed against the top of the INK of whatever is under it (styles.js, .mwarn), so swapping the
  // picture under a raised bubble moves the head out from under the tail. It also ENDS the instant
  // either becomes true, so a cameo can never be what delayed bad news.
  var CAMEO_SECS = 4;
  var CAMEO_FLOOR = 300;
  var CAMEO_ODDS = 900;
  // `left` is the ticks a showing has to run, `since` the ticks of visible panel since the last
  // one ended. `since` starts at zero, so the floor covers a panel that has just been opened.
  var cameo = { key: null, left: 0, since: 0 };
  var _mascotStepNow = 'idle';       // the step the last paint worked out, for the tick to read
  function cameoHolds(step) {
    if (step !== 'idle' && step !== 'working') return false;
    var w = el('mwarn');
    if (w && !w.hidden) return false;
    return !cameo.key || mascotPool().indexOf(cameo.key) >= 0;   // switched off in another window
  }
  function cameoEnd() { cameo.key = null; cameo.left = 0; cameo.since = 0; }
  // Once a second, off the panel's own tick. Two decisions and never both: end the one that is
  // running, or start one
  function cameoTick() {
    if (cameo.key) {
      if (--cameo.left <= 0 || !cameoHolds(_mascotStepNow)) { cameoEnd(); paintMascot(); }
      return;
    }
    if (document.hidden || !lastData) return;
    if (++cameo.since < CAMEO_FLOOR) return;
    if (!cameoHolds(_mascotStepNow)) return;
    var pool = mascotPool();
    if (!pool.length || Math.random() * CAMEO_ODDS >= 1) return;
    cameo.key = pool[Math.floor(Math.random() * pool.length)];
    cameo.left = CAMEO_SECS;
    paintMascot();
  }

  // THE ONE PLACE THE CRAB IS DRAWN, called by the push and by the tick. It decides nothing about
  // the account: the step is worked out once per push (render) and handed here, and which drawing
  // that step means is the table's and the reader's (mascotArt). The only thing it settles is
  // whether a cameo is covering the answer at this instant
  function paintMascot() {
    var d = lastData, m = el('mascot');
    if (!d || !m) return;
    if (cameo.key && !cameoHolds(_mascotStepNow)) cameoEnd();
    var state = cameo.key || mascotArt(_mascotStepNow, d);
    var want = m.getAttribute('data-' + state);
    if (want && m.getAttribute('src') !== want) {
      m.setAttribute('src', want);
      if (_mascotDrawn) beatMascot(m);
    }
    // the lift belongs to the DRAWING, not to the slot, so it is set beside the source and on
    // every push rather than only when the source changes: re-arming stunned puts the same
    // picture back, and a window that opens on a lifted state has to start lifted
    m.classList.toggle('ink-lift', inkLift(state));
    // the first push is the first DRAWING and not a transition, so this turns true on the first
    // push that carries a reading the steps can be measured against, which, for an account with
    // no window, is the weekly one and not the session's
    if (d.fh ? d.fh.used_percentage != null : noSessionWindow(d)) _mascotDrawn = true;
    // the box is one height and the drawing inside it is not, so the burn-rate bubble has to
    // know which picture it is pointing at (styles.js, .mascot-wrap[data-state])
    var box = el('pm_mascot');
    if (box && box.getAttribute('data-state') !== state) box.setAttribute('data-state', state);
    // POKING IS THE COLLAPSE'S, not the cameo's. A drawing that is only there for four seconds
    // must not grow something to press, or a reader loses the press by waiting
    var stunned = state === 'stunned';
    m.style.cursor = stunned ? 'pointer' : 'default';
    m.title = stunned ? 'poke' : '';
  }

  // The cut between two states, one beat long: the sprite is pressed two whole pixels down and let
  // back up in two frames (styles.js, .sparkle.beat). No crossfade and no filter: either one
  // smears pixel art. Re-arming needs the class gone for a frame.
  function beatMascot(img) {
    img.classList.remove('beat');
    void img.offsetWidth;
    img.classList.add('beat');
    clearTimeout(img._beat);
    img._beat = setTimeout(function () { img.classList.remove('beat'); }, 160);
  }

  // The room HUD's session piece, TAKEN OUT of the page rather than blanked.
  //
  // It used to read `5h –`, and the empty slot plus the separator beside it reads as a broken
  // gauge, not as a limit this account does not have. The separator has to go with it or the HUD
  // starts with a dot. Both nodes are kept rather than dropped, because the account that has a
  // window must get them back if a push ever carries one again.
  // DETAILS GOES WHERE THE WEEKLY READING IS, and it is MOVED rather than drawn twice.
  //
  // #wkMore is the only way into the weekly sheet: nothing else opens it except a one-off dialog
  // after sharing is switched on, and there is no command for it. It has always lived inside the
  // Weekly bar's label, which was fine while that bar was always on screen. It is not: the account
  // with no five-hour window hides the whole bar (styles.js, body.no-session #pm_weekly) because
  // the ring is drawing the week and the same figure may not be drawn twice, and the button went
  // with the bar. The reading moved and the control that details it did not, so that account had
  // no entrance to the sheet at all.
  //
  // So the rule is the reading's: the button sits in the bar while the bar is the week, and under
  // the ring when the RING is the week. It is not moved in state 1, where the ring is the session
  // and a weekly control under it would be pointing at the wrong number, and it is not duplicated,
  // because two buttons with one id is one listener and one of them dead.
  // Details used to move under the ring when the account had no five-hour window, because the
  // weekly BAR was hidden in that state and the button rode inside it. The bar is back (styles.js,
  // the no-session block), so the button is reachable where it has always been and there is one
  // seat again. Nothing calls for a second one: a control that changes address by account shape is
  // a control the reader has to find twice.

  var _hudKept = null;
  function hudSessionPiece(on) {
    var hud = document.querySelector('.ws-hud'); if (!hud) return;
    if (on) {
      if (!_hudKept) return;
      var w = el('wsHudW');
      hud.insertBefore(_hudKept[0], w);
      if (_hudKept[1]) hud.insertBefore(_hudKept[1], w);
      _hudKept = null;
      return;
    }
    if (_hudKept) return;
    var s = el('wsHudS'), sep = hud.querySelector('.ws-hud-sep');
    if (!s) return;
    _hudKept = [s, sep];
    hud.removeChild(s);
    if (sep) hud.removeChild(sep);
  }

  function render(d) {
    lastData = d; refreshedAt = Date.now();
    // this account has no five-hour window: one class, and every rule for that state hangs off it
    var noSession = noSessionWindow(d);
    document.body.classList.toggle('no-session', noSession);
    renderAgents(d.agents);
    applyAgentStates(d.agentActivity);
    applyXpEffects(d);
    updateRoom(d.agentActivity);
    if ((vscode.getState() || {}).rosterCollapsed) renderCrewMini(d.agentActivity); // keep collapsed strip live
    renderWaiting(d.agentActivity); // always: a fold must not hide a row the user may need to clear
    applyFavs(d.favGames); // the host owns the set, so every window hears about a star through here
    shopFromPush(d);       // ...and about a seat bought in another window the same way
    // compact usage HUD over the room (so session/weekly stay visible on the Agents tab)
    hudSessionPiece(!noSession);
    var _hs = el('wsHudS');
    if (_hs) { if (d.fh && d.fh.used_percentage != null) { var _sp = Math.round(d.fh.used_percentage); _hs.textContent = '5h ' + _sp + '%'; _hs.style.color = col(_sp); } else { _hs.textContent = '5h –'; _hs.style.color = ''; } }
    var _hw = el('wsHudW');
    if (_hw) { if (d.sd && d.sd.used_percentage != null) { var _wp = Math.round(d.sd.used_percentage); _hw.textContent = '7d ' + _wp + '%'; _hw.style.color = col(_wp); } else { _hw.textContent = '7d –'; _hw.style.color = ''; } }
    var _ab = el('authbar'); if (_ab) _ab.style.display = d.signedIn ? 'none' : 'flex';
    var _cfgSb0 = el('cfgStatusBar'); if (_cfgSb0 && d.cfg && d.cfg.statusBar) _cfgSb0.value = d.cfg.statusBar;
    // Only sync panel visibility/checkboxes from config when the settings sheet is
    // closed. While it's open the user is toggling, so the local DOM is the source of
    // truth — a late-arriving stale push must not overwrite their in-progress choices.
    var _sh = el('settingsSheet');
    if (!_sh || _sh.hidden) {
      var _ph = normalizeHidden((d.cfg && d.cfg.panelHidden) || []);
      applyPanelVis(_ph);
      var _pmc = document.querySelectorAll('.pmk');
      for (var _pi = 0; _pi < _pmc.length; _pi++) { _pmc[_pi].checked = _ph.indexOf(_pmc[_pi].getAttribute('data-k')) < 0; }
      var _cb0 = el('cfgBurn'); if (_cb0) _cb0.checked = !(d.cfg && d.cfg.burnRate === false);
    }
    // the step is worked out HERE, once per push, because mascotState carries the deadband and
    // that is a thing with a memory: feeding it on the 1s tick as well would be the same reading
    // written into it a hundred times between two pushes. The paint below is called by the tick
    // too (the cameo), so it reads the answer rather than asking again
    _mascotStepNow = mascotState(mascotStrain(d, noSession), (d.sd && d.sd.used_percentage) || 0);
    paintMascot();

    // the session has no bar: the ring below is its one showing, and meter() is called for the
    // three that still have one
    meter('w', d.sd, true, d.usageLoading);
    meter('f', d.fable, true, d.usageLoading);
    meter('c', d.ctx, false, false);
    if (d.ctx && d.ctx.window && el('c_sub')) el('c_sub').textContent = '/ ' + (d.ctx.window >= 1e6 ? '1M' : '200K');

    // the session, whole: the ring is the percentage and #s_sub under it is the time left in the
    // window. That line is what the removed Session bar still owned, and losing it would mean the
    // panel no longer says when the 5 hours turn over
    // The ring is the biggest thing on this panel, so what it draws is the limit that actually
    // binds the account: the window where there is one, the week where there is not. It says which
    // (.rtext) rather than leaving the reader to guess, and the two readings never show at once:
    // the weekly bar is hidden in that state (styles.js, body.no-session)
    var _rt = document.querySelector('.rtext');
    if (_rt) { var _rtw = noSession ? '7d used' : 'used'; if (_rt.textContent !== _rtw) _rt.textContent = _rtw; }
    var _stl = el('st_time_lab');
    if (_stl) { var _stw = noSession ? 'Active today' : 'Active time'; if (_stl.textContent !== _stw) _stl.textContent = _stw; }
    if (d.fh && d.fh.used_percentage != null) {
      var p = Math.round(d.fh.used_percentage);
      var arc = el('ringArc');
      if (arc) { arc.style.strokeDashoffset = (C * (1 - Math.min(p, 100) / 100)).toFixed(1); arc.style.stroke = col(p); }
      tween('ringPct', prev.ring, p, function (v) { return Math.round(v); });
      prev.ring = p;
      if (el('st_time')) el('st_time').textContent = activeTime(d.fh.resets_at);
    } else if (noSession && d.sd.used_percentage != null) {
      var pw = Math.round(d.sd.used_percentage);
      var arcw = el('ringArc');
      if (arcw) { arcw.style.strokeDashoffset = (C * (1 - Math.min(pw, 100) / 100)).toFixed(1); arcw.style.stroke = col(pw); }
      tween('ringPct', prev.ring, pw, function (v) { return Math.round(v); });
      prev.ring = pw;
      if (el('st_time')) el('st_time').textContent = activeToday(d);
    } else {
      var rpe = el('ringPct'); if (rpe) rpe.textContent = d.usageLoading ? '…' : '—';
      var arce = el('ringArc'); if (arce) arce.style.strokeDashoffset = String(C);
      var ste = el('st_time'); if (ste) ste.textContent = d.usageLoading ? 'loading' : '—';
    }
    if (el('s_sub')) {
      // under the ring: the time left on whichever limit the ring just drew
      var _rs = cd(d.fh ? d.fh.resets_at : (noSession ? d.sd.resets_at : 0)) || '';
      el('s_sub').textContent = _rs ? _rs + ' left' : '';
    }

    // tokens (today's output)
    var t = d.today || {}, out = t.output || 0;
    tween('st_tok', prev.tok, out, fmtTok);
    if (prev.tok != null && out > prev.tok) { var _dtxt = '+' + fmtTok(out - prev.tok); roll('st_tok'); flash('tok_delta', _dtxt); flash('wsHudDelta', _dtxt); }
    prev.tok = out;
    var tile = el('st_tok_tile');
    if (tile) {
      var total = (t.input || 0) + (t.output || 0) + (t.cache_creation || 0) + (t.cache_read || 0);
      tile.title = 'Today · output ' + fmtTok(t.output || 0)
        + ' · input ' + fmtTok(t.input || 0)
        + ' · cache ' + fmtTok((t.cache_read || 0) + (t.cache_creation || 0))
        + ' · total ' + fmtTok(total);
    }

    // requests
    var rq = d.count != null ? d.count : 0;
    tween('st_req', prev.req, rq, function (v) { return fmtTok(v); });
    if (prev.req != null && rq > prev.req) { roll('st_req'); flash('req_delta', '+' + (rq - prev.req)); }
    prev.req = rq;

    renderCredits(d.credits);

    renderFreshness(d);

    // burn-rate: only 2 levels shown — mid(amber) / high(red). calm = no bubble at all.
    var _mw = el('mwarn');
    if (_mw) {
      var _burnOn = !(d.cfg && d.cfg.burnRate === false); // default on
      var _peak = d.peak, _n = d.count || 0, _avg = d.avg || 0;
      var _pt = _peak ? _peak.total : 0;
      var _ratio = _avg > 0 ? (_pt / _avg) : 0;
      // peak = largest unseen request across all sessions, so a spike isn't buried by another session's reply
      var _level = (!_peak || _n < 4 || _avg <= 0) ? 'calm' : (_ratio >= 2.5 ? 'high' : 'calm'); // red only; amber(mid) suppressed
      if (!_burnOn || _level === 'calm') {
        _mw.hidden = true; _burnMsg = ''; _burnPrompt = ''; var _wbx0 = el('warnbar'); if (_wbx0) _wbx0.hidden = true;
      } else {
        _mw.hidden = false;
        if (_level === 'high') { _mw.className = 'mwarn high'; _mw.innerHTML = WARN_SVG; }
        else { _mw.className = 'mwarn mid'; _mw.innerHTML = WARN_MID_SVG; }
        _burnMsg = fmtTok(_pt) + ' tokens · ' + _ratio.toFixed(1) + '× avg (' + fmtTok(Math.round(_avg)) + ')' + (_peak && _peak.t ? ' · ' + agoText(_peak.t) : '');
        _burnPrompt = (_peak && _peak.prompt) ? _peak.prompt.replace(/\s+/g, ' ').slice(0, 70) : '';
        _mw.title = _burnMsg + (_burnPrompt ? '\n"' + _burnPrompt + '"' : '');
      }
    }
    // THE BUBBLE IS DECIDED AFTER THE CRAB IS DRAWN, so a push that raises it has to be allowed to
    // take a cameo away again: the tail is placed against the top of the ink of whatever is under
    // it, and a vortex under a raised bubble points the tail at nothing. One extra paint, and only
    // in the four seconds a year where both land on the same push
    if (cameo.key && !cameoHolds(_mascotStepNow)) { cameoEnd(); paintMascot(); }
  }

  // ===========================================================================
  // 이벤트 배선 & 초기화: 메시지 수신, 탭·컴팩트 토글, 로스터/모달/설정 상호작용
  // ===========================================================================
  window.addEventListener('message', function (e) {
    var m = e.data; if (!m) return;
    if (m.type === 'data') render(m.data);
    else if (m.type === 'openWeekly') openWeekly();
    // the shop is not a game, so it is not in the register the branch below dispatches through
    else if (m.type === 'shop') shopReceive(m);
    // A reply for a game whose screen was never opened is dropped: that screen asks for the truth
    // when it opens, so there is nothing to keep in sync meanwhile.
    // Its list row is the exception. The row is in the page from the first paint, and a figure
    // that only appears once you have opened the panel is a figure that cannot be the reason you
    // open it. So fig() is called whether the panel was ever built or not, and it is guarded
    // because it draws on the list that every other screen is reached through
    else if (PANEL_BY_KEY[m.type]) {
      var p = PANEL_BY_KEY[m.type];
      if (p.fig) { try { p.fig(m); } catch (e2) { /* one row's figure, not the whole list */ } }
      if (p.node) p.receive(m);
    }
    else if (m.type === 'weekly') renderWeekly(m.data);
    else if (m.type === 'openSettings') { var s = el('settingsSheet'); if (s) s.hidden = !s.hidden; }
  });

  // compact mode toggle (persisted per view)
  function applyCompact(c) { document.body.classList.toggle('compact', !!c); }
  document.body.classList.add('notrans');           // no animation on first paint
  var st0 = vscode.getState() || {};
  applyCompact(st0.compact);
  requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.remove('notrans'); }); });
  var tbtn = el('toggle');
  // THE HEADER CHEVRON KNOWS ONE THING: compact.
  //
  // It used to be "context-aware" and collapse the roster on the Agents tab, and that branch could
  // not be reached: styles.js hides this button on every tab but Usage, and the Agents tab's two
  // sections fold from their own headers (#wsFold, #crewFold), which is where a control that folds
  // a section belongs. The dead branch was also wrong where it stood: it skipped applyCrewFold,
  // so the roster and the chevron that claimed to own it disagreed.
  function updateToggleChevron() {
    if (!tbtn) return;
    var svg = tbtn.querySelector('svg');
    if (svg) svg.style.transform = document.body.classList.contains('compact') ? 'rotate(180deg)' : '';
  }
  if (tbtn) tbtn.addEventListener('click', function () {
    var s = vscode.getState() || {};
    var c = !document.body.classList.contains('compact');
    applyCompact(c); s.compact = c; vscode.setState(s);
    updateToggleChevron();
  });

  // tab switcher (Usage default; last choice remembered within the view). The stored view is
  // applied in boot() at the end of this file, once the games' panel scripts have registered
  // room fold: the room is the panel's biggest block — let it collapse to just the header (persisted)
  function applyRoomFold(c) {
    var pa = el('panelAgents'); if (pa) pa.classList.toggle('room-collapsed', !!c);
    var f = el('wsFold'); if (f) f.classList.toggle('folded', !!c);
  }
  applyRoomFold(st0.roomCollapsed);
  var _wf = el('wsFold');
  if (_wf) _wf.addEventListener('click', function () {
    var s = vscode.getState() || {}; s.roomCollapsed = !s.roomCollapsed; vscode.setState(s);
    applyRoomFold(s.roomCollapsed);
  });
  var _tu = el('tabUsage'), _ta = el('tabAgents');
  if (_tu) _tu.addEventListener('click', function () { switchTab('usage'); });
  if (_ta) _ta.addEventListener('click', function () { switchTab('agents'); });
  // the header credits line is the way into the games area, and back out to the last tab
  var _hdcBtn = el('hdCredits');
  if (_hdcBtn) _hdcBtn.addEventListener('click', function () { if (curTab() === 'games') leaveGames(); else switchTab('games'); });
  // --- the games list: the favourites at the top, and the blocks that fold.
  //
  // TWO MEMORIES, ON PURPOSE, and they are not interchangeable.
  // The favourites are the HOST's (globalState, `gameFavoritesV1`): which games are mine is a fact
  // about me, not about this window, and a second window showing a different set of favourites
  // would be a second answer to the same question. So the star asks and the row moves when the host
  // answers, like every number on this page.
  // There is no second memory any more: the headings that could be folded went in 1.28.0 and the
  // `gamesFold` they were remembered in went with them (docs/game-panels.md, section 7-2).
  //
  // A starred game LEAVES the list and goes to the box above it. In two places at once it would be
  // the reader's job to work out whether the two are the same game. Up there it keeps the register's
  // order rather than the order it was starred in, so the box is a short copy of the same list and
  // not a third order to learn, and the LIT STAR is what says it is kept: on a list with no
  // headings on it, a `Favourites` heading would be the one heading left.
  //
  // The rows are MOVED, never re-made. Each one holds the figure CUC.rowFig writes (#fig-<id>) and
  // a redraw would blank it until the next reply, which is a figure that cannot be the reason the
  // panel is opened. Moving a node blurs whatever it holds, so this runs only when the set really
  // changed, and puts the focus back afterwards: starring with the keyboard follows the row up
  var _favSig = null;
  function favRowOf(id) { return document.querySelector('#panelGames .gm-row[data-game="' + id + '"]'); }
  function applyFavs(fav) {
    var list = ASSET_UI.games || [], into = el('gmFavRows');
    if (!into) return;
    var i, on = {}, sig = [];
    for (i = 0; i < list.length; i++) if (fav && fav[list[i].id]) { on[list[i].id] = 1; sig.push(list[i].id); }
    sig = sig.join(',');
    if (sig === _favSig) return;   // nothing starred since the last push: leave the DOM alone
    _favSig = sig;
    var act = document.activeElement;
    for (i = 0; i < list.length; i++) {
      var g = list[i], row = favRowOf(g.id);
      if (!row) continue;
      var keep = !!on[g.id];
      row.classList.toggle('fav', keep);
      var star = row.querySelector('.gm-fav');
      if (star) star.setAttribute('aria-pressed', keep ? 'true' : 'false');
      // appendChild moves: walking the register in its own order rebuilds both orders at once
      var home = keep ? into : el(row.getAttribute('data-home'));
      if (home) home.appendChild(row);
    }
    trimBoxes();
    if (act && act.focus && _gmList && _gmList.contains(act)) act.focus();
  }
  // No stars, no box: no empty box, no dotted outline, no "put your favourites here". The same rule
  // covers the other end, where every game is starred and the list below is the empty one. The top
  // margin goes to the box that SHOWS, which is why it is a class and not :first-of-type
  function trimBoxes() {
    var boxes = document.querySelectorAll('#panelGames .gm-rows'), top = null;
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].hidden = boxes[i].children.length === 0;
      boxes[i].classList.remove('gm-top');
      if (!boxes[i].hidden && !top) top = boxes[i];
    }
    if (top) top.classList.add('gm-top');
  }
  function toggleFav(id) {
    var row = id && favRowOf(id); if (!row) return;
    vscode.postMessage({ type: 'favGame', id: id, on: !row.classList.contains('fav') });
  }
  var _gmList = el('panelGames');
  // The star first: it sits inside the row, so asking what was clicked in the other order opens
  // the game every time somebody keeps it
  if (_gmList) _gmList.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var star = t.closest('.gm-fav');
    if (star) { toggleFav(star.getAttribute('data-fav')); return; }
    var open = t.closest('.gm-open');
    if (open) openGame(open.getAttribute('data-game'));
  });
  applyFavs(null);   // before boot(): the empty list is a state too, and boot takes the focus
  // (no listener for a game's own arrow here: #bjBack does not exist at load, because a game's
  // markup is built the first time it is opened, and every .bj-back on the page is answered by the
  // one delegated handler above)

  // room theme: chosen via the map dropdown (persisted); light-theme variant used when it exists
  function currentRoom() { var rs = ASSETS.rooms || {}; return rs[(vscode.getState() || {}).map || 'cave'] || rs.cave; }
  function applyRoom() {
    var r = currentRoom(); if (!r) return;
    var img = el('wsBg'); if (!img) return;
    var src = (document.body.classList.contains('vscode-light') && r.light) ? r.light : r.dark;
    if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
  }
  applyRoom();
  if (window.MutationObserver) new MutationObserver(applyRoom).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // room picker: a dropdown showed one name at a time, which hid the fact that there are
  // twelve rooms at all. The grid shows them.
  function currentMap() { return (vscode.getState() || {}).map || 'cave'; }
  function syncMapName() {
    var n = el('wsMapName'); if (!n) return;
    var r = (ASSETS.rooms || {})[currentMap()];
    var name = (r && r.name) || 'Room';
    n.textContent = name;
    // the name is a label at most widths and a tooltip at the narrowest, where the button is a
    // glyph on its own (styles.js, body.narrow .ws-map span) and the section's own name has the row
    var b = el('wsMap'); if (b) b.title = 'Room: ' + name;
  }
  function buildRoomGrid() {
    var g = el('roomGrid'); if (!g) return;
    var rooms = ASSETS.rooms || {}, cur = currentMap(), html = '';
    for (var k in rooms) {
      var r = rooms[k];
      html += '<button class="room-opt' + (k === cur ? ' on' : '') + '" data-room="' + k + '">'
        + (r.thumb ? '<img src="' + r.thumb + '" alt="">' : '')
        + '<span>' + esc(r.name || k) + '</span></button>';
    }
    g.innerHTML = html;
  }
  function pickRoom(k) {
    var s = vscode.getState() || {}; s.map = k; vscode.setState(s);
    applyRoom(); syncMapName();
    updateRoom((lastData && lastData.agentActivity) || {}); // walk anyone present to the new room's spots now
  }
  syncMapName();
  var _wsMap = el('wsMap');
  if (_wsMap) _wsMap.addEventListener('click', function () { buildRoomGrid(); var sh = el('roomSheet'); if (sh) sh.hidden = false; });
  if (el('roomClose')) el('roomClose').addEventListener('click', function () { el('roomSheet').hidden = true; });
  if (el('roomSheet')) el('roomSheet').addEventListener('click', function (e) {
    if (e.target === this) { this.hidden = true; return; }
    var opt = e.target.closest ? e.target.closest('.room-opt') : null;
    if (!opt) return;
    pickRoom(opt.getAttribute('data-room'));
    this.hidden = true;
  });

  // collapse / expand the roster, driven by #crewFold in the Crew header
  function applyRoster(collapsed) {
    var pa = el('panelAgents'); if (pa) pa.classList.toggle('crew-collapsed', !!collapsed); // CSS animates pool <-> mini
    if (collapsed) renderCrewMini((lastData && lastData.agentActivity) || {});
  }
  applyRoster(!!(vscode.getState() || {}).rosterCollapsed);
  updateToggleChevron();
  // Crew folds from its own header, mirroring Room — driving it from the panel-level
  // chevron next to the mascot put the control nowhere near the thing it collapsed
  function applyCrewFold(c) { var f = el('crewFold'); if (f) f.classList.toggle('folded', !!c); }
  applyCrewFold((vscode.getState() || {}).rosterCollapsed);
  var _cf = el('crewFold');
  if (_cf) _cf.addEventListener('click', function () {
    var s = vscode.getState() || {}; s.rosterCollapsed = !s.rosterCollapsed; vscode.setState(s);
    applyRoster(s.rosterCollapsed); applyCrewFold(s.rosterCollapsed);
  });

  // click a roster character -> select (border) + walk south (front-facing walk cycle)
  function resetRosterSprite(card, name) {
    var sp = card.querySelector('.cr-sprite'), sheet = agentSheet(name);
    if (!sp || !sheet) return;
    var m = sheet.meta;
    sp.style.backgroundPosition = frameBg(m, m.idleRow || 0, m.idleCol || 0, spriteScale(m, ROSTER_T));
  }
  var _poolEl = el('pool');
  function deselectRoster() {
    if (!selectedAgent || !_poolEl) return;
    var c = _poolEl.querySelector('.cr-card[data-agent="' + selectedAgent + '"]');
    if (c) { setPicked(c, false); resetRosterSprite(c, selectedAgent); }
    selectedAgent = null;
  }
  if (_poolEl) _poolEl.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var hr = t.closest('.hid-row');
    // the row is rebuilt by renderAgents, so the focus a keyboard press came with would land on a
    // replaced element: put it back on the new row
    if (hr) {
      var wasFocused = document.activeElement === hr;
      _hiddenOpen = !_hiddenOpen; _poolEl._sig = null;
      renderAgents((lastData && lastData.agents) || []);
      if (wasFocused) { var again = el('hidRow'); if (again) again.focus(); }
      return;
    }
    var hc = t.closest('.hid-card');
    if (hc) { vscode.postMessage({ type: 'setHidden', name: hc.getAttribute('data-agent'), hidden: false }); return; }
    var card = t.closest('.cr-card'); if (!card) { deselectRoster(); return; } // empty area -> deselect
    var name = card.getAttribute('data-agent');
    if (t.closest('.cr-gear')) { openAgentModal(name); return; } // gear opens the settings modal
    if (selectedAgent === name) { deselectRoster(); return; } // re-click same -> deselect
    if (selectedAgent) {
      var prev = _poolEl.querySelector('.cr-card[data-agent="' + selectedAgent + '"]');
      if (prev) { setPicked(prev, false); resetRosterSprite(prev, selectedAgent); }
    }
    selectedAgent = name; setPicked(card, true);
  });
  // Clear one waiting row. The host decides whether the key is really waiting and owns the record,
  // so the row does not disappear until the next push comes back, the same contract as the game stars.
  var _wbEl = el('waitBox');
  if (_wbEl) _wbEl.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.wb-clear') : null;
    if (!b) return;
    vscode.postMessage({ type: 'dismissAgentRun', key: b.getAttribute('data-key') });
  });

  // clicking anywhere else in the Agents tab (room, header, empty space) also deselects
  var _paEl = el('panelAgents');
  if (_paEl) _paEl.addEventListener('click', function (e) {
    var t = e.target; if (t && t.closest && (t.closest('.cr-card') || t.closest('.cr-gear'))) return;
    deselectRoster();
  });

  // animate the selected roster sprite through the south-facing walk frames
  setInterval(function () {
    if (!selectedAgent || !_poolEl) return;
    var card = _poolEl.querySelector('.cr-card[data-agent="' + selectedAgent + '"]'); if (!card) return;
    var sp = card.querySelector('.cr-sprite'); if (!sp) return;
    var sheet = agentSheet(selectedAgent); if (!sheet) return;
    var m = sheet.meta, fp = framePos(m, true);
    sp.style.backgroundPosition = frameBg(m, fp.row, fp.col, spriteScale(m, ROSTER_T));
  }, 80);

  // agent settings modal (별명 / 직업 / 외형 / 모델)
  var amAgent = null;
  function currentModel(name) {
    var ag = ((lastData && lastData.agents) || []).filter(function (a) { return a.name === name; })[0];
    var mm = (ag && ag.model || '').toLowerCase();
    return mm.indexOf('opus') >= 0 ? 'opus' : mm.indexOf('sonnet') >= 0 ? 'sonnet' : mm.indexOf('haiku') >= 0 ? 'haiku' : 'inherit';
  }
  var CAT_LABEL = { human: 'Human', monster: 'Monster', animal: 'Animal' };
  var CAT_ORDER = ['human', 'monster', 'animal'];
  var amCat = null; // active appearance-picker tab
  function buildAppearancePicker(name) {
    var wrap = el('amAppear'); if (!wrap) return;
    var cur = SHEET_MAP[name], byCat = {};
    for (var i = 0; i < NPC_KEYS.length; i++) { var k = NPC_KEYS[i], c = (ASSETS.npcs[k].cat || 'human'); (byCat[c] = byCat[c] || []).push(k); }
    var present = CAT_ORDER.filter(function (c) { return byCat[c] && byCat[c].length; });
    if (!present.length) { wrap.innerHTML = ''; return; }
    var curCat = null; for (var cc = 0; cc < present.length; cc++) { if (byCat[present[cc]].indexOf(cur) >= 0) curCat = present[cc]; }
    if (present.indexOf(amCat) < 0) amCat = curCat || present[0];
    var tabs = present.map(function (c) { return '<button class="am-tab' + (c === amCat ? ' on' : '') + '" data-cat="' + c + '">' + CAT_LABEL[c] + ' ' + byCat[c].length + '</button>'; }).join('');
    var grid = byCat[amCat].map(function (key) {
      var meta = ASSETS.npcs[key];
      return '<div class="am-npc' + (key === cur ? ' on' : '') + '" data-npc="' + key + '"><div class="cr-sprite" style="' + cropStyle(meta, meta.idleRow || 0, meta.idleCol || 0, PICKER_T) + '"></div></div>';
    }).join('');
    wrap.innerHTML = '<div class="am-tabs">' + tabs + '</div><div class="am-row">' + grid + '</div>';
  }
  function openAgentModal(name) {
    amAgent = name;
    var t = el('amTitle'); if (t) t.textContent = name;
    var nn = (lastData && lastData.nicknames || {})[name] || ''; if (el('amNick')) el('amNick').value = nn;
    var rr = (lastData && lastData.roles || {})[name] || ''; if (el('amRole')) el('amRole').value = rr;
    var agDef = ((lastData && lastData.agents) || []).filter(function (a) { return a.name === name; })[0];
    var isBuiltin = !!(agDef && agDef.builtin);
    if (el('amModel')) {
      el('amModel').value = currentModel(name);
      // built-ins have no .md to write the model into
      el('amModel').disabled = isBuiltin;
      el('amModel').title = isBuiltin ? 'Built into Claude Code — model can’t be changed here' : '';
    }
    buildAppearancePicker(name);
    var m = el('agentModal'); if (m) m.hidden = false;
  }
  function closeAgentModal() { var m = el('agentModal'); if (m) m.hidden = true; amAgent = null; }
  if (el('amNick')) el('amNick').addEventListener('change', function () { if (amAgent) vscode.postMessage({ type: 'setNickname', name: amAgent, nick: this.value.trim() }); });
  if (el('amRole')) el('amRole').addEventListener('change', function () { if (amAgent) vscode.postMessage({ type: 'setRole', name: amAgent, role: this.value.trim() }); });
  if (el('amModel')) el('amModel').addEventListener('change', function () { if (amAgent) vscode.postMessage({ type: 'setModel', name: amAgent, model: this.value }); });
  if (el('amAppear')) el('amAppear').addEventListener('click', function (e) {
    var tab = e.target.closest ? e.target.closest('.am-tab') : null;
    if (tab) { amCat = tab.getAttribute('data-cat'); if (amAgent) buildAppearancePicker(amAgent); return; }
    var n = e.target.closest ? e.target.closest('.am-npc') : null; if (!n || !amAgent) return;
    vscode.postMessage({ type: 'setAppearance', name: amAgent, appearance: n.getAttribute('data-npc') });
    var kids = this.querySelectorAll('.am-npc'); for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('on', kids[i] === n);
  });
  if (el('amHide')) el('amHide').addEventListener('click', function () {
    if (!amAgent) return;
    var n = amAgent;
    closeAgentModal(); deselectRoster();
    vscode.postMessage({ type: 'setHidden', name: n, hidden: true });
  });
  if (el('amClose')) el('amClose').addEventListener('click', closeAgentModal);
  if (el('agentModal')) el('agentModal').addEventListener('click', function (e) { if (e.target === this) closeAgentModal(); });

  // This PC's week (Details on the Weekly meter). The host reads the transcripts and estimates the
  // share; this only draws what it is sent
  function fmtBig(n) {
    n = Math.round(n || 0);
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  }
  function pctTxt(x) { return x == null ? '–' : (x < 10 ? x.toFixed(1).replace(/\.0$/, '') : String(Math.round(x))); }
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var wkOpenFolds = {}; // which lists are unfolded, kept across re-renders while the page lives
  function wkRows(title, list, useTitle) {
    if (!list || !list.length) return '';
    return '<details class="wk-fold" data-fold="' + esc(title) + '"' + (wkOpenFolds[title] ? ' open' : '') + '><summary class="sheet-sec">' + title
      + '<span class="wk-fold-top">' + esc(list[0].name) + '</span></summary><div class="wk-rows">' + list.map(function (e) {
      var sh = Math.round((e.share || 0) * 100);
      return '<div class="wk-row"' + (useTitle ? ' title="' + esc(e.name) + '"' : '') + '><span class="nm">' + esc(e.name) + '</span>'
        + '<span class="val">' + fmtBig(e.tokens) + ' tok · ' + sh + '%</span>'
        + '<span class="tr"><i style="width:' + Math.max(1, sh) + '%"></i></span></div>';
    }).join('') + '</div></details>';
  }
  function teamBlock(r) {
    var c = r.teamCfg || {}, t = r.team, h = '<div class="sheet-sec">This account\'s PCs</div>';
    if (!c.account) return h + '<div class="wk-note">No Claude Code sign-in on this PC</div>';
    if (!c.on || wkEditTeam) {
      return h + '<div class="wk-team-form">'
        + '<input id="wkTeamName" type="text" maxlength="24" placeholder="Your name" value="' + esc(c.name || '') + '">'
        + '<button type="button" id="wkTeamSave" title="Sends this PC\'s weekly totals, the plan type and this name to the extension\'s server, with an hourly snapshot kept for the week. Only PCs signed in to the same Claude account see them. Nothing from your work. Counting those figures into published statistics is a separate question, asked once and off unless you agree.">' + (c.on ? 'Save' : 'Share') + '</button>'
        + (c.on ? '<button type="button" id="wkTeamOff" class="ghost">Stop sharing</button>' : '')
        + '</div>';
    }
    if (!t) return h + '<div class="wk-wait"><span class="wk-spin"></span></div>';
    if (t.error) return h + '<div class="wk-note">Sharing server not reachable (' + esc(t.error) + ') <a href="#" id="wkTeamEdit">Change</a></div>';
    var col = wkColors(t.rows);
    h += '<div class="wk-team">' + t.rows.map(function (x, k) {
      return '<div class="wk-trow' + (x.me ? ' me' : '') + (x.stale ? ' stale' : '') + '" title="' + esc(x.name) + ': ' + fmtBig(x.tokens) + ' tokens, $' + Math.round(x.cost) + ', ' + Math.round(x.ofTeam * 100) + '% of the team\'s recorded use' + (x.stale ? ' (no report for 6h+)' : '') + '">'
        + '<span class="nm">' + esc(x.name) + (x.me ? ' (you)' : '') + '</span>'
        + '<span class="pc">' + pctTxt(x.pct) + '%</span>'
        + '<span class="tr"><i style="width:' + Math.min(100, x.pct) + '%;background:' + col[k] + '"></i></span></div>';
    }).join('');
    // These rows divide the whole account total, so anything nobody here reported is inside them.
    // That was two sentences of small print under four numbers, which is a lot of reading to put
    // under a table that is already plain, so it lives in the README now. The line below is only
    // for the state that is genuinely puzzling: rows that are not a division of the account at all
    h += '</div>';
    if (!t.byAccount) {
      h += '<div class="wk-note">No reading of the account\'s weekly % yet, so each row is this PC\'s percent-per-$ on that PC\'s spend.</div>';
    } else if (t.others > 0) {
      // Somebody outside this table was seen spending, so the rows are the rest of the week and
      // this says whose the remainder is. It is a floor (weekly.js, othersFloor): only what this
      // PC was awake to watch, so the rows above it are still at most what they say
      h += '<div class="wk-note">' + pctTxt(t.others) + '% of the week was spent while this PC was not spending at all, so it belongs to somebody not on this list. The row above is the rest of the week, and it is at most that: nothing is watched while this PC is off.</div>';
    }
    h += '<div class="wk-note wk-right"><a href="#" id="wkTeamEdit">Change</a></div>';
    return h;
  }
  // this PC keeps the extension's orange; the others get their own colors, in row order
  var WK_PAL = ['#5b9bd5', '#6fbf73', '#b58ad8', '#d9b84f', '#4fbfb6', '#d9739a'];
  function wkColors(rows) {
    var n = 0;
    return rows.map(function (x) { return x.me ? '#e8895a' : WK_PAL[n++ % WK_PAL.length]; });
  }
  var wkEditTeam = false, wkLast = null;
  function renderWeekly(r) {
    wkLast = r;
    // the refresh turns until the last answer of this round is in (the account's rows, when sharing)
    var tt = el('wkTitle');
    if (tt && r.from) {
      var f = new Date(r.from);
      var hm = ('0' + f.getHours()).slice(-2) + ':' + ('0' + f.getMinutes()).slice(-2);
      tt.textContent = r.sinceReset ? 'This PC · since ' + WD[f.getDay()] + ' ' + hm : 'This PC · last 7 days';
    }
    var rb = el('wkRefresh');
    if (rb && (!r.teamCfg || !r.teamCfg.on || !r.teamCfg.account || r.team)) rb.classList.remove('busy');
    var body = el('wkBody'); if (!body || !r) return;
    var pl = r.plan || {}, t = r.total || {};
    var h = '<div class="wk-host">' + esc(r.host || '') + (r.user ? ' · ' + esc(r.user) : '') + ' · as of ' + new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</div>';
    // share of the plan
    var acc = pl.pct, me = pl.share;
    var tm = r.team && r.team.rows ? r.team : null;
    var mine = tm ? tm.rows.filter(function (x) { return x.me; })[0] : null;
    if (mine) me = mine.pct; // the team split is the better number when there is one
    var TIER = { max_20x: 'Max 20x', max_5x: 'Max 5x', pro: 'Pro' };
    var per = pl.perPoint ? '$' + Math.round(pl.perPoint) : '';
    // Where the figure on the left came from. A team split is the account's own % divided by spend
    // and no rate goes into it, so a rate is not quoted there at all. Elsewhere the rate does set
    // the figure, and it is not called measured: percent-per-$ varied threefold between intervals
    // on one account's hourly records over a week, so the word promised a precision it has not got
    var how;
    if (tm && tm.byAccount) how = 'The account\'s weekly % divided by what each PC spent';
    else if (pl.basis === 'reference') how = 'Rough guide for ' + (pl.tierKnown ? TIER[pl.tier] : 'Max 20x (assumed)') + ': around ' + per + ' per 1%';
    else how = 'Estimated from this PC\'s readings' + (pl.basis === 'rough' ? ' (' + pl.readings + ' of ' + pl.needed + ')' : '')
      + ': around ' + per + ' per 1%, and the real rate swings by severalfold with the models used';
    var shown = tm && tm.accountPct != null ? tm.accountPct : acc;
    h += '<div class="wk-share" title="' + esc('This PC / whole account, of this week\'s limit\n' + how) + '"><span class="wk-big">' + (me != null ? pctTxt(me) + '<small>%</small>' : '–') + '</span>'
      + '<span class="wk-tot">/ ' + (shown != null ? pctTxt(shown) + '%' : '–') + '</span></div>';
    // the account's bar, one piece per PC; hovering a piece names it
    var segs = [];
    if (tm) {
      var cs = wkColors(tm.rows);
      tm.rows.forEach(function (x, k) { segs.push({ n: x.name + (x.me ? ' (you)' : ''), p: x.pct, c: cs[k], me: x.me }); });
      segs.sort(function (a, b) { return (b.me ? 1 : 0) - (a.me ? 1 : 0); });
      // AND WHAT THE TABLE CANNOT ACCOUNT FOR. The rows divide the account minus this piece, so
      // this is not a leftover of their arithmetic: it is the part of the week that moved while
      // nobody in the table was spending (weekly.js, othersFloor), which no row may claim. It is
      // zero on an account whose PCs all share, and that screen is unchanged
      if (tm.others > 0) segs.push({ n: 'Not on this list', p: tm.others, c: 'var(--other)' });
    } else {
      if (me != null) segs.push({ n: 'This PC', p: me, c: '#e8895a', me: true });
      if (acc != null) segs.push({ n: 'Other PCs', p: Math.max(0, acc - (me || 0)), c: 'var(--other)' });
    }
    h += '<div class="wk-mwrap"><div class="wk-meter">' + segs.filter(function (g) { return g.p > 0; }).map(function (g) {
      return '<i style="width:' + Math.min(100, g.p) + '%;background:' + g.c + '" data-tip="' + esc(g.n + ' ' + pctTxt(g.p) + '%') + '"></i>';
    }).join('') + '</div><div class="wk-tip" hidden></div></div>';
    if (!tm) h += '<div class="wk-legend"><span><b style="background:#e8895a"></b>This PC</span><span><b style="background:var(--other)"></b>Other PCs</span></div>';
    h += teamBlock(r);
    // totals
    h += '<div class="wk-stats">'
      + '<div class="wk-stat"><div class="v">' + fmtBig((t.input || 0) + (t.output || 0) + (t.cache_creation || 0) + (t.cache_read || 0)) + '</div><div class="l">tokens</div></div>'
      + '<div class="wk-stat"><div class="v">' + fmtBig(t.req || 0) + '</div><div class="l">requests</div></div>'
      + '<div class="wk-stat" title="What the same tokens would cost at API prices. A plan is not billed this way; it is here to compare PCs."><div class="v">$' + Math.round(t.cost || 0).toLocaleString() + '</div><div class="l">API-equivalent</div></div>'
      + '</div>';
    // daily chart
    var days = r.days || [], max = 0;
    for (var i = 0; i < days.length; i++) if (days[i].tokens > max) max = days[i].tokens;
    h += '<div class="sheet-sec">Tokens per day</div><div class="wk-chart">' + days.map(function (d, k) {
      var p = d.day.split('-'), dt = new Date(+p[0], +p[1] - 1, +p[2]);
      var hh = max ? Math.round(d.tokens / max * 70) : 0;
      var hm = d.tokens ? Math.round(hh * d.main / d.tokens) : 0;
      return '<div class="wk-col' + (k === days.length - 1 ? ' today' : '') + '" title="' + d.day + ': ' + fmtBig(d.tokens) + ' tokens (main ' + fmtBig(d.main) + ', subagents ' + fmtBig(d.sub) + ')">'
        + '<span class="n">' + (d.tokens ? fmtBig(d.tokens) : '') + '</span>'
        + '<div class="wk-bar" style="height:' + Math.max(d.tokens ? 2 : 0, hh) + 'px"><div class="sub" style="height:' + (hh - hm) + 'px"></div><div class="main" style="height:' + hm + 'px"></div></div>'
        + '<span class="d">' + WD[dt.getDay()] + '</span></div>';
    }).join('') + '</div>';
    h += '<div class="wk-legend" style="margin-top:6px"><span><b style="background:#e8895a"></b>main sessions</span><span><b style="background:rgba(232,137,90,.45)"></b>subagents</span></div>';
    // what it went on (ranked by weighted share)
    h += wkRows('By project', r.projects);
    h += wkRows('By model', r.models);
    h += wkRows('By agent', r.kinds);
    h += wkRows('Top sessions', r.sessions, true);
    var first = !body.querySelector('.wk-share');
    body.innerHTML = first ? '<div class="wk-in">' + h + '</div>' : h;
  }
  // closing plays the card out before it is hidden
  var wkCloseT = null;
  function closeWeekly() {
    var m = el('weeklyModal'); if (!m || m.hidden || m.classList.contains('closing')) return;
    m.classList.add('closing');
    vscode.postMessage({ type: 'weeklyClose' });
    wkCloseT = setTimeout(function () { m.hidden = true; m.classList.remove('closing'); }, 180);
  }
  function openWeekly() {
    var m = el('weeklyModal'); if (!m) return;
    var b = el('wkBody'); if (b && !b.querySelector('.wk-share')) b.innerHTML = '<div class="wk-wait big"><span class="wk-spin"></span></div>';
    clearTimeout(wkCloseT); m.classList.remove('closing');
    m.hidden = false;
    vscode.postMessage({ type: 'weeklyOpen' });
  }
  if (el('wkMore')) el('wkMore').addEventListener('click', function (e) { e.stopPropagation(); openWeekly(); });
  if (el('wkBody')) {
    var wkTip = function (e) {
      var seg = e.target && e.target.closest ? e.target.closest('.wk-meter i[data-tip]') : null;
      var wrap = e.target && e.target.closest ? e.target.closest('.wk-mwrap') : null;
      var tipEl = wrap ? wrap.querySelector('.wk-tip') : el('wkBody').querySelector('.wk-tip');
      if (!tipEl) return;
      if (!seg || !wrap) { tipEl.hidden = true; return; }
      tipEl.textContent = seg.getAttribute('data-tip');
      tipEl.hidden = false;
      var wr = wrap.getBoundingClientRect(), sr = seg.getBoundingClientRect();
      var x = sr.left + sr.width / 2 - wr.left, w = tipEl.offsetWidth;
      tipEl.style.left = Math.max(0, Math.min(wr.width - w, x - w / 2)) + 'px';
    };
    el('wkBody').addEventListener('mouseover', wkTip);
    el('wkBody').addEventListener('mouseleave', wkTip);
  }
  if (el('wkBody')) el('wkBody').addEventListener('click', function (e) {
    var id = e.target && e.target.id;
    if (id === 'wkTeamEdit') { e.preventDefault(); wkEditTeam = true; if (wkLast) renderWeekly(wkLast); return; }
    if (id !== 'wkTeamSave' && id !== 'wkTeamOff') return;
    var name = (el('wkTeamName') ? el('wkTeamName').value : '').trim();
    // answer the click at once; the page is drawn again when the choice is saved
    var form = e.target.closest('.wk-team-form');
    if (form) form.outerHTML = '<div class="wk-wait"><span class="wk-spin"></span></div>';
    vscode.postMessage({ type: 'teamShare', on: id === 'wkTeamSave', name: name });
    wkEditTeam = false;
  });
  if (el('wkClose')) el('wkClose').addEventListener('click', closeWeekly);
  if (el('wkRefresh')) el('wkRefresh').addEventListener('click', function () {
    if (this.classList.contains('busy')) return;
    this.classList.add('busy');
    vscode.postMessage({ type: 'weeklyOpen' });
  });
  if (el('weeklyModal')) el('weeklyModal').addEventListener('click', function (e) { if (e.target === this) closeWeekly(); });
  if (el('wkBody')) el('wkBody').addEventListener('toggle', function (e) {
    var d = e.target; if (d && d.dataset && d.dataset.fold) wkOpenFolds[d.dataset.fold] = d.open;
  }, true);

  var _sb = el('signinBtn');
  if (_sb) _sb.addEventListener('click', function () { vscode.postMessage({ type: 'login' }); });

  // in-panel settings sheet
  var _setBtn = el('settingsBtn'), _sheet = el('settingsSheet'), _setClose = el('settingsClose'), _cfgSb = el('cfgStatusBar');
  function openSheet(o) { if (_sheet) _sheet.hidden = !o; }
  if (_setBtn) _setBtn.addEventListener('click', function () { openSheet(_sheet && _sheet.hidden); });
  if (_setClose) _setClose.addEventListener('click', function () { openSheet(false); });
  if (_sheet) _sheet.addEventListener('click', function (e) { if (e.target === _sheet) openSheet(false); });
  if (_cfgSb) _cfgSb.addEventListener('change', function () { vscode.postMessage({ type: 'setConfig', key: 'statusBar.show', value: _cfgSb.value }); });

  var _pmks = document.querySelectorAll('.pmk');
  for (var _pk = 0; _pk < _pmks.length; _pk++) {
    _pmks[_pk].addEventListener('change', function () {
      var hid = [], all = document.querySelectorAll('.pmk');
      for (var j = 0; j < all.length; j++) { if (!all[j].checked) hid.push(all[j].getAttribute('data-k')); }
      applyPanelVis(hid);
      vscode.postMessage({ type: 'setConfig', key: 'panel.hidden', value: hid });
    });
  }
  var _cbEl = el('cfgBurn');
  if (_cbEl) _cbEl.addEventListener('change', function () { vscode.postMessage({ type: 'setConfig', key: 'burnRate.enabled', value: _cbEl.checked }); });

  // poke the fallen crab to replay the collapse (only while stunned)
  var _mc = el('mascot');
  if (_mc) _mc.addEventListener('click', function () {
    if (_mc.getAttribute('src') !== _mc.getAttribute('data-stunned')) return;
    var s = _mc.getAttribute('data-stunned');
    _mc.removeAttribute('src');
    void _mc.offsetWidth; // force the browser to drop the frame so the APNG restarts
    _mc.setAttribute('src', s);
  });

  // --- how narrow the panel is, and why the question is asked in this particular way.
  //
  // Two classes hang off it: `narrow` drops the stat tiles so their values cannot truncate, and
  // `wrapcols` puts the ring and the crab UNDER the bars instead of beside them.
  //
  // 1. THE INPUT MAY NOT MOVE WITH THE OUTPUT. This read `document.body.clientWidth`, which is the
  //    viewport WITHOUT the scrollbar, so it got narrower by the gutter's width whenever the panel
  //    grew tall enough to scroll. The panel's height is the one thing these classes change:
  //    wrapping takes the card from 409 to 575 (measured, --probe at a 351px sidebar against 300),
  //    and the Usage tab's own figures grow it as the context fills. So a sidebar sitting within a
  //    gutter's width of the threshold had its layout decided by its own height: the context bar
  //    filled, a scrollbar appeared, the reading dropped 15px past the threshold and the crab fell
  //    166px to under the bars; the figure settled, the scrollbar went, and it came back. Reported
  //    from a real sidebar.
  //    `window.innerWidth` is the whole viewport, gutter included, so nothing this function does
  //    can move it. The two thresholds stay the numbers they were: measured against innerWidth
  //    they are the verdict the old reading gave whenever no scrollbar was showing, which is the
  //    state they were tuned in. While one IS showing the columns get the gutter less than the
  //    threshold intends, and that is the side to err on: the alternative is shifting both
  //    thresholds up by the gutter, which would wrap every scrollbar platform 15px early forever.
  //
  // 2. ONE THRESHOLD IS NOT A THRESHOLD. The value that turns a class on and the value that turns
  //    it off were the same number, so any jitter at all on the input flips the class back and
  //    forth; the crab's four steps have had a deadband for exactly this reason (MASCOT_STEPS
  //    above). The pair here is sticky in the direction the narrow layout is entered: the class
  //    goes on below the threshold and comes off only a band above it.
  //
  // 3. THE BAND IS MEASURED, NOT CHOSEN. The gutter is the widest the old reading could ever jump
  //    by on its own, so it is the widest flutter this page can be asked to absorb, and it is read
  //    off the window rather than written down here because it is 15 on one platform, 17 on
  //    another and 0 wherever the scrollbar is drawn over the content. The floor of 2 is for the
  //    platform that reports 0: the width arrives rounded and VS Code re-lays the sidebar out by a
  //    pixel when a badge appears, and the 160ms debounce below catches a blip but not a flutter.
  var _gutter = 0;              // the widest gutter this window's scrollbar has ever taken
  function respWidth() {
    var sb = window.innerWidth - document.documentElement.clientWidth;
    // past 40 it is not a scrollbar: a harness or a mid-layout read, and believing it would make
    // the band wider than the distance between the two thresholds
    if (sb > _gutter && sb <= 40) _gutter = sb;
    return window.innerWidth;
  }
  function respBand() { return Math.max(2, _gutter); }
  // `on` is the class as it stands, which is what makes the two edges a pair rather than two reads
  // of one number
  function respNarrower(w, t, on) { return on ? w < t + respBand() : w < t; }

  // Debounced so a momentary width blip (sidebar re-layout when a badge count appears)
  // doesn't flip the panel to its narrow layout and back.
  function applyResponsive() {
    var w = respWidth(), cls = document.body.classList;
    cls.toggle('narrow', respNarrower(w, 232, cls.contains('narrow')));
    cls.toggle('wrapcols', respNarrower(w, 340, cls.contains('wrapcols')));
    // keep the roster a 4-column grid at any width by scaling characters + labels down to fit
    // (derive from body width so it's correct even while the Agents tab is hidden).
    // The gutter comes off here and not above: this is a size and not a threshold, so it has no
    // edge to flutter across, and a card that assumes the gutter is taken is a card that fits
    // whether it is or not. It is the WIDEST gutter seen rather than the live one, so the roster
    // cannot resize itself by growing tall enough to scroll
    var contentW = w - _gutter - 70; // scrollbar gutter + wrap/card/inner paddings
    var colW = (contentW - 2 * 3) / 4; // 4 cols, ~2px gaps
    var scale = Math.max(0.5, Math.min(1, colW / 52)); // 52px = comfortable full-size card
    document.body.style.setProperty('--cr-scale', scale.toFixed(3));
    // a game whose layout depends on the width redraws itself, but never mid-pacing
    var live = PANELS[curGame()];
    if (live && live.node && live.resize && !_hold) live.resize();
  }
  var _rzt;
  if (window.ResizeObserver) { new ResizeObserver(function () { clearTimeout(_rzt); _rzt = setTimeout(applyResponsive, 160); }).observe(document.body); }
  applyResponsive();
  // watch the parent .ttl: the button is fit-content, so its own width follows its content and would never widen again
  var _hdc = el('hdCredits'); if (_hdc && _hdc.parentNode && window.ResizeObserver) new ResizeObserver(fitCredits).observe(_hdc.parentNode);

  // click the warning bubble to reveal / hide the burn-rate detail banner
  var _mwClick = el('mwarn');
  if (_mwClick) _mwClick.addEventListener('click', function () {
    if (_mwClick.hidden || !_burnMsg) return; // calm: nothing to show
    var wb = el('warnbar'); if (!wb) return;
    if (wb.hidden) {
      var mid = _mwClick.classList.contains('mid');
      wb.className = mid ? 'warnbar mid' : 'warnbar';
      wb.innerHTML = (mid ? WARN_MID_SVG : WARN_SVG) + '<span class="wbmsg">' + _burnMsg + (_burnPrompt ? '<span class="wbq">“' + esc(_burnPrompt) + '”</span>' : '') + '</span><button class="wbx" title="Dismiss">×</button>';
      wb.hidden = false;
    } else wb.hidden = true;
  });
  // x on the banner dismisses it
  var _wbEl = el('warnbar');
  if (_wbEl) _wbEl.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('.wbx')) { _wbEl.hidden = true; vscode.postMessage({ type: 'dismissBurn' }); } });
  // (the freshness row is kept current by the 1s tick, which is its only writer)

  // The games' panel scripts are loaded after this file, so the stored view can only be applied
  // once they have all registered: a reload straight into a game has to find that game's panel.
  // Everything above is wiring that does not care, and this is the one thing that does
  function boot() {
    switchTab((st0 && st0.tab) || 'usage');
    vscode.postMessage({ type: 'ready' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
