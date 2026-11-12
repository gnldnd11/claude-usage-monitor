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
  function activeTime(r) {
    if (!r) return '–';
    var el2 = 5 * 3600 - (r - Date.now() / 1000);
    if (el2 < 0) el2 = 0; if (el2 > 5 * 3600) el2 = 5 * 3600;
    var h = Math.floor(el2 / 3600), m = Math.floor((el2 % 3600) / 60);
    return h + 'h ' + String(m).padStart(2, '0') + 'm';
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
      var inner = sheet ? '<div class="cr-sprite" style="' + cropStyle(sheet.meta, sheet.meta.idleRow || 0, sheet.meta.idleCol || 0, ROSTER_T) + '"></div>' : '';
      var nick = displayName(a.name), role = displayRole(a.name);
      // built-ins have no custom role — label them as what they are
      if (a.builtin && !((lastData && lastData.roles) || {})[a.name]) role = 'built-in';
      html += '<div class="cr-card' + (a.builtin ? ' builtin' : '') + '" data-agent="' + esc(a.name) + '">'
        + '<button class="cr-gear" title="Settings">' + GEAR_SVG + '</button>'
        + '<div class="cr-lv">Lv.' + lvOf(a.name) + '</div>'
        + '<div class="cr-badge"></div>'
        + '<div class="cr-body">' + inner + '</div>'
        + '<div class="cr-name">' + esc(nick) + '</div>'
        + '<div class="cr-role">' + esc(role) + '</div></div>';
    }
    if (hid.length) {
      // hidden agents stay reachable: an always-visible restore row, never a dead end
      html += '<div class="hid-row" id="hidRow"><span class="hid-chev' + (_hiddenOpen ? ' open' : '') + '">›</span>Hidden (' + hid.length + ')</div>';
      if (_hiddenOpen) {
        html += '<div class="hid-pool">';
        for (var h = 0; h < hid.length; h++) {
          var ha = hid[h], hs = agentSheet(ha.name);
          html += '<div class="hid-card" data-agent="' + esc(ha.name) + '" title="' + esc(ha.name) + ' — click to restore">'
            + (hs ? '<div class="cr-sprite" style="' + cropStyle(hs.meta, hs.meta.idleRow || 0, hs.meta.idleCol || 0, 26) + '"></div>' : '')
            + '<span class="hid-name">' + esc(displayName(ha.name)) + '</span>'
            + '<span class="hid-restore">show</span></div>';
        }
        html += '</div>';
      }
    }
    pool.innerHTML = html;
    if (selectedAgent) { var sc = pool.querySelector('.cr-card[data-agent="' + selectedAgent + '"]'); if (sc) sc.classList.add('selected'); } // survive rebuilds
  }
  // activity = { instances: [{key, agent, state, since, desc, tokens?, durMs?}], stats: {name: {runs, tokens, medMs}} }
  function actInstances(activity) { return (activity && activity.instances) || []; }
  function actStats(activity) { return (activity && activity.stats) || {}; }
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
    var stats = actStats(activity);
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
      if (st.state === 'stuck') desc = 'No result yet — stuck? ' + (st.desc || '');
      else if (st.state === 'done' && st.tokens) desc = (st.desc ? st.desc + ' · ' : '') + fmtTok(st.tokens) + ' tok';
      html += '<div class="cm-row' + (st.state === 'done' ? ' done' : '') + (st.state === 'stuck' ? ' stuck' : '') + '">'
        + '<div class="cm-sprite">' + spr + '</div>'
        + '<div class="cm-mid"><div class="cm-top"><span class="cm-name">' + esc(displayName(nm)) + '</span><span class="cm-model">' + esc(agentModel(nm)) + '</span></div>'
        + '<div class="cm-desc">' + esc(desc) + '</div><div class="cm-bar"></div></div>'
        + '<div class="cm-time">' + elapsedStr(st.since) + '</div></div>';
    }
    mini.innerHTML = html;
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
      setTimeout(function () { if (wk.root.parentNode) wk.root.parentNode.removeChild(wk.root); delete walkers[key]; }, 450);
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
  }
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
  // Inside games there is the list, or one game's screen; body.tab-* scopes compact mode to Usage
  // and hides the header crab in the games area. body.game-<key> says which game is open
  function curTab() { return (vscode.getState() || {}).tab || 'usage'; }
  function curGame() { return curTab() === 'games' ? ((vscode.getState() || {}).game || null) : null; }
  function creditsHidden() { return (((lastData && lastData.cfg && lastData.cfg.panelHidden) || []).indexOf('credits') >= 0); }
  function applyView() {
    var t = curTab(), g = curGame(), b = document.body, hdc = el('hdCredits'), id;
    b.classList.toggle('tab-usage', t === 'usage');
    b.classList.toggle('tab-agents', t === 'agents');
    b.classList.toggle('tab-games', t === 'games');
    setVis('panelUsage', t === 'usage');
    setVis('panelAgents', t === 'agents');
    setVis('panelGames', t === 'games' && !g);
    if (g) buildPanel(g); // the first time this game is opened, its markup is made here
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
    if (typeof updateToggleChevron === 'function') updateToggleChevron();
  }
  // Entering a game screen asks the host for its state; entering the list just takes the focus
  function enterGames() {
    var def = PANELS[curGame()];
    if (def) { if (def.node && def.enter) def.enter(); }
    else {
      // The row is a div now, and a div takes no focus: the button inside it is what opens a game.
      // It also has to be a row that can be SEEN — one inside a folded or emptied block is not —
      // and if every block is folded there are no rows at all, so a heading takes it instead
      var first = document.querySelector('#panelGames .gm-grp:not([hidden]):not(.folded) .gm-open')
        || document.querySelector('#panelGames .gm-fold');
      if (first) first.focus();
    }
  }
  function switchTab(t) {
    if (['usage', 'agents', 'games'].indexOf(t) < 0) t = 'usage'; // a stored tab this build does not know
    if (t === 'games' && creditsHidden()) t = 'usage'; // Credits hidden in settings: no games either
    var left = curTab() === 'games' && t !== 'games';
    var s = vscode.getState() || {}; s.tab = t; if (t !== 'games') { s.lastTab = t; s.game = null; } vscode.setState(s);
    if (left) gameLeave();
    applyView();
    if (t === 'games') enterGames();
  }
  // null goes back to the list
  function openGame(g) {
    var s = vscode.getState() || {}; s.game = g; vscode.setState(s);
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
  var _burnMsg = '';
  var _burnPrompt = '';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var WARN_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#e5484d" stroke="#e5484d" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  var WARN_MID_SVG ='<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#f5a623" stroke="#f5a623" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
  function applyPanelVis(hid) {
    setVis('pm_session', hid.indexOf('session') < 0);
    setVis('pm_weekly', hid.indexOf('weekly') < 0);
    setVis('pm_fable', hid.indexOf('fable') < 0);
    setVis('pm_context', hid.indexOf('context') < 0);
    setVis('pm_ring', hid.indexOf('ring') < 0);
    setVis('pm_tiles', hid.indexOf('tiles') < 0);
    setVis('mascot', hid.indexOf('mascot') < 0);
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
      + '1 credit per ' + fmtTok(c.perCredit || 1e5) + ' tokens, weighted by API price\n'
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
    // a credit minted while a bet screen is up lights its chips at once
    var open = PANELS[curGame()];
    if (open && open.node && open.credits) open.credits();
  }

  // ===========================================================================
  // The casino's shared floor: window.CUC.
  //
  // Everything a game's screen is built out of lives here, and nothing that belongs to one game.
  // The games themselves are games/<id>/panel.js, loaded after this file and registered with
  // window.CUC.game(). A panel's markup is built the first time that game is opened, so a register
  // of fourteen games costs fourteen list rows and one panel.
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

  // --- the ten sea symbols' names (the slots, the scratch card).
  //
  // Same rule as cardWord above, for the same reason: the drawings are aria-hidden art
  // (games/symbols.js), so whatever shows a symbol has to carry its name. `n` is how many of them
  // are being named, and it is NOT an 's' rule: four of the ten do not take one, which is why the
  // exceptions are a set here rather than a second table of ten strings
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

  // --- the die faces (Sic Bo, Shut the Box, Hazard).
  //
  // html.js puts ONE hidden sprite of the seven drawings in the page (games/dice-faces.js), beside
  // the sea symbols' and for the same reason, so a cell is a <use> and a new face is one href.
  // Three screens draw dice, which is what puts this here rather than in any one of them: the three
  // had a copy of the pip geometry each before this existed (games/README.md, section 4).
  //
  // THE BODY IS currentColor AND THE PIPS ARE NOT. The cell sets `color`, so the same seven
  // drawings are cream on the felt (9.30:1) and #f6836e for Hazard's warning die (4.29:1); a pip
  // that followed the body would vanish into it. That one exception is why dice-faces.js is built
  // this way at all, so do not bake a colour in here.
  //
  // 48 is the size the drawings are made for, and 24 is the one other whole multiple of their
  // 24-unit grid that is used (Hazard's warning die). FACE 0 IS THE UNROLLED DIE, which is what a
  // bet screen stands up: a felt that looks the same before and after the deal is the mistake four
  // games were taken off the floor for (docs/game-panels.md, 5-12 to 5-15).
  //
  // The art is aria-hidden, so whatever shows a die carries its number: cardFace's rule with
  // cardWord, and the sea symbols' with symWord
  function dieFace(n, px) {
    var size = px > 0 ? px : 48;
    var f = (n >= 1 && n <= 6) ? Math.floor(n) : 0;
    return '<svg class="dc" viewBox="0 0 24 24" width="' + size + '" height="' + size + '"'
      + ' aria-hidden="true"><use href="#dc-' + f + '"/></svg>';
  }

  // --- a multiplier, printed. The host's own figure (the payout over the bet) and never recomputed:
  // these two only choose the form.
  //
  // `xMult` takes the ratio as it arrives (the plinko cup, the wheel's wedge). Two decimals, because
  // an odd bet can leave a remainder with the house and the figure printed has to be the one the
  // balance moved by.
  // `xMult100` takes the same figure sent as HUNDREDTHS (the minefield's rung, the tower's floor):
  // those engines read it back out of the payout they will really pay (mines.js's mult100Of), so
  // this only moves the decimal point and no float touches it. The crash keeps its own copy of this
  // shape on purpose: its dial runs to 1000x and it drops the decimals above 100x to stay inside the
  // felt, which is a different rule rather than the same one with a number in it
  function xMult(m) {
    if (m == null) return '';
    var r = Math.round(m * 100) / 100;
    return '×' + (r === Math.floor(r) ? fmtInt(r) : String(r));
  }
  // No thousands separator here, and that is deliberate rather than an oversight: this one's
  // readers are the ladder columns, and the tower's is 39px wide because that is what its largest
  // rung (x57277, the hard tower's top floor) measures at 10.5px. Grouping it would push the widest
  // row out of the column it was sized for. xMult's readers are chips on a line that can wrap, so
  // it groups
  function xMult100(m100) {
    if (m100 == null) return '';
    if (m100 >= 1000) return '×' + Math.floor(m100 / 100);
    return '×' + Math.floor(m100 / 100) + '.' + ('0' + (m100 % 100)).slice(-2);
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
  // everyone, and a table that will not take 10 (the minefield and the tower, whose payouts are
  // floored to whole credits: at a bet of ten the flooring alone costs the player more than the
  // house's own 3%, so the return band breaks downwards. The figure is in mines.js's header) has to
  // close that chip rather than leave it lit. Without it the first Deal of a new install goes out at
  // 10 and the host refuses it: a live button, a dead round and a sentence underneath.
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

  // --- the one figure a list row may carry, on the right of the row.
  //
  // Only two games have one (the market's open profit, the forge's sword level) and the reason is
  // that the figure's whole job is to have MOVED while the panel was shut. Fourteen figures would
  // be fourteen numbers, and then the one that moved is invisible.
  //
  // This writes into the row, not into the panel, so it works for a game whose screen has never
  // been built: the rows exist from the first paint. `dir` is 'up', 'down' or nothing, and nothing
  // is the ordinary muted colour (the forge's level is not good or bad news, it is a level)
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
  function frameHtml(id) {
    var row = GAME_ROWS[id] || {}, key = row.key || id;
    return '<div class="ihead bj-head">'
      + '<button type="button" class="bj-back" id="' + key + 'Back" title="All games">' + (ASSET_UI.chevron || '') + '</button>'
      + '<div class="it" title="' + esc(row.hint || '') + '">' + (row.icon || '') + ' ' + esc(row.title || row.name || '') + '</div>'
      + '<div class="bj-side" id="' + key + 'Side"></div></div>';
  }

  // --- keyboard. Shortcuts belong to the OPEN game only: the list and every other game never
  // react. One body class per game told four games apart; fourteen cannot be read that way, so the
  // open game is asked for its own handler and nobody else is called
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
    var g = curGame(); if (!g) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    var t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (document.querySelector('.sheet:not([hidden])')) return;
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
  // Each game stops its own clock; the held header is let go once, here
  function gameLeave() {
    for (var id in PANELS) { var def = PANELS[id]; if (def.node && def.leave) def.leave(); }
    releaseHeldHeader();
  }
  // one listener for every game's back arrow: the panels are all inside the stage
  var _stage = el('gameStage');
  if (_stage) _stage.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.bj-back') : null;
    if (b) openGame(null);
  });

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

    // --- cards, dice, sea symbols and multiples: what a drawing is CALLED, and how a figure is printed
    cardFace: cardFace, cardBack: function () { return CARD_BACK; }, cardWord: cardWord,
    symWord: symWord, die: dieFace, xMult: xMult, xMult100: xMult100,
    npc: npcStyle,

    // --- bets
    stakeUi: stakeUi, stake: gameStake, renderStakes: renderStakes, wireStakes: wireStakes,
    setHeld: setHeld, heldElsewhere: HELD_ELSEWHERE,
    balance: function () { return prev.cr; },

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

    // --- the open game, and the panel's only door to the webview's own memory (a game with a
    // remembered choice of its own needs this, the way the stakes remember theirs)
    current: curGame,
    state: function () { return vscode.getState() || {}; },
    setState: function (s) { vscode.setState(s); }
  };

  // live tick every 1s: active time + countdowns + "Updated Ns ago"
  function tick() {
    if (lastData) {
      var d = lastData;
      if (d.fh) {
        var v = activeTime(d.fh.resets_at), te = el('st_time');
        if (te && te.textContent !== v) { te.textContent = v; roll('st_time'); }
        var r = cd(d.fh.resets_at); if (el('s_sub')) el('s_sub').textContent = r ? r + ' left' : '';
      }
      if (d.sd) { var r2 = cd(d.sd.resets_at); if (el('w_sub')) el('w_sub').textContent = r2 ? r2 + ' left' : ''; }
    }
    var age = Math.floor((Date.now() - refreshedAt) / 1000);
    if (el('upd')) el('upd').textContent = age < 60 ? 'now' : Math.floor(age / 60) + 'm ago';
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

  function render(d) {
    lastData = d; refreshedAt = Date.now();
    renderAgents(d.agents);
    applyAgentStates(d.agentActivity);
    applyXpEffects(d);
    updateRoom(d.agentActivity);
    if ((vscode.getState() || {}).rosterCollapsed) renderCrewMini(d.agentActivity); // keep collapsed strip live
    applyFavs(d.favGames); // the host owns the set, so every window hears about a star through here
    // compact usage HUD over the room (so session/weekly stay visible on the Agents tab)
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
      var _ph = (d.cfg && d.cfg.panelHidden) || [];
      applyPanelVis(_ph);
      var _pmc = document.querySelectorAll('.pmk');
      for (var _pi = 0; _pi < _pmc.length; _pi++) { _pmc[_pi].checked = _ph.indexOf(_pmc[_pi].getAttribute('data-k')) < 0; }
      var _cb0 = el('cfgBurn'); if (_cb0) _cb0.checked = !(d.cfg && d.cfg.burnRate === false);
    }
    var _m = el('mascot');
    if (_m) {
      // Mascot state by 5h session %: <50 idle, 50-69 working, 70-89 despair, >=90 stunned.
      // Weekly at 100% also stuns.
      var _sess = (d.fh && d.fh.used_percentage) || 0;
      var _wk = (d.sd && d.sd.used_percentage) || 0;
      var _state = (_sess >= 90 || _wk >= 100) ? 'stunned' : (_sess >= 70 ? 'despair' : (_sess >= 50 ? 'working' : 'idle'));
      var _want = _m.getAttribute('data-' + _state);
      if (_want && _m.getAttribute('src') !== _want) _m.setAttribute('src', _want);
      var _stunned = _state === 'stunned';
      _m.style.cursor = _stunned ? 'pointer' : 'default';
      _m.title = _stunned ? 'poke' : '';
    }

    meter('s', d.fh, true, d.usageLoading);
    meter('w', d.sd, true, d.usageLoading);
    meter('f', d.fable, true, d.usageLoading);
    meter('c', d.ctx, false, false);
    if (d.ctx && d.ctx.window && el('c_sub')) el('c_sub').textContent = '/ ' + (d.ctx.window >= 1e6 ? '1M' : '200K');

    // ring + active time (session)
    if (d.fh && d.fh.used_percentage != null) {
      var p = Math.round(d.fh.used_percentage);
      var arc = el('ringArc');
      if (arc) { arc.style.strokeDashoffset = (C * (1 - Math.min(p, 100) / 100)).toFixed(1); arc.style.stroke = col(p); }
      tween('ringPct', prev.ring, p, function (v) { return Math.round(v); });
      prev.ring = p;
      if (el('st_time')) el('st_time').textContent = activeTime(d.fh.resets_at);
    } else {
      var rpe = el('ringPct'); if (rpe) rpe.textContent = d.usageLoading ? '…' : '—';
      var arce = el('ringArc'); if (arce) arce.style.strokeDashoffset = String(C);
      var ste = el('st_time'); if (ste) ste.textContent = d.usageLoading ? 'loading' : '—';
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

    if (el('upd')) { var _ua = d.usageAt || 0; el('upd').textContent = _ua ? agoText(_ua) : (d.usageLoading ? 'loading' : '—'); }

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
  }

  // ===========================================================================
  // 이벤트 배선 & 초기화: 메시지 수신, 탭·컴팩트 토글, 로스터/모달/설정 상호작용
  // ===========================================================================
  window.addEventListener('message', function (e) {
    var m = e.data; if (!m) return;
    if (m.type === 'data') render(m.data);
    else if (m.type === 'openWeekly') openWeekly();
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
  // the top-right chevron is context-aware: Usage tab -> compact panel; Agents tab -> collapse roster
  function updateToggleChevron() {
    var s = vscode.getState() || {}, onAgents = (s.tab || 'usage') === 'agents';
    var flip = onAgents ? !!s.rosterCollapsed : document.body.classList.contains('compact');
    if (tbtn) {
      var svg = tbtn.querySelector('svg'); if (svg) svg.style.transform = flip ? 'rotate(180deg)' : '';
      tbtn.title = onAgents ? (s.rosterCollapsed ? 'Show roster' : 'Hide roster') : 'Compact / expand';
    }
  }
  if (tbtn) tbtn.addEventListener('click', function () {
    var s = vscode.getState() || {};
    if ((s.tab || 'usage') === 'agents') { s.rosterCollapsed = !s.rosterCollapsed; vscode.setState(s); applyRoster(s.rosterCollapsed); }
    else { var c = !document.body.classList.contains('compact'); applyCompact(c); s.compact = c; vscode.setState(s); }
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
  // the header credits line is the way into the table, and back out to the last tab
  var _hdcBtn = el('hdCredits');
  if (_hdcBtn) _hdcBtn.addEventListener('click', function () { switchTab(curTab() === 'games' ? ((vscode.getState() || {}).lastTab || 'usage') : 'games'); });
  // --- the games list: the favourites at the top, and the blocks that fold.
  //
  // TWO MEMORIES, ON PURPOSE, and they are not interchangeable.
  // The favourites are the HOST's (globalState, `gameFavoritesV1`): which games are mine is a fact
  // about me, not about this window, and a second window showing a different set of favourites
  // would be a second answer to the same question. So the star asks and the row moves when the host
  // answers, like every number on this page.
  // Which blocks are folded is this window's (`gamesFold` in getState), the way `rosterCollapsed`
  // already is: that IS a statement about what this window is looking at.
  //
  // A starred game LEAVES its family and goes to the Favourites block. In two places at once it
  // would be the reader's job to work out whether the two are the same game. Inside the block it
  // keeps the register's order rather than the order it was starred in, so the block is a short
  // copy of the same list and not a third order to learn.
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
    trimBlocks();
    if (act && act.focus && _gmList && _gmList.contains(act)) act.focus();
  }
  // A heading with nothing behind it is a heading for a family the favourites emptied, and the
  // Favourites block itself is the same rule: no stars, no block (no empty box, no dotted outline,
  // no "put your favourites here"). The top margin goes to the first block that SHOWS, which is
  // why it is a class and not :first-of-type
  function trimBlocks() {
    var grps = document.querySelectorAll('#panelGames .gm-grp'), top = null;
    for (var i = 0; i < grps.length; i++) {
      var box = grps[i].querySelector('.gm-rows');
      grps[i].hidden = !box || box.children.length === 0;
      grps[i].classList.remove('gm-top');
      if (!grps[i].hidden && !top) top = grps[i];
    }
    if (top) top.classList.add('gm-top');
  }
  function toggleFav(id) {
    var row = id && favRowOf(id); if (!row) return;
    vscode.postMessage({ type: 'favGame', id: id, on: !row.classList.contains('fav') });
  }
  function applyFolds() {
    var shut = (vscode.getState() || {}).gamesFold || {};
    var grps = document.querySelectorAll('#panelGames .gm-grp');
    for (var i = 0; i < grps.length; i++) {
      var head = grps[i].querySelector('.gm-fold'); if (!head) continue; // Favourites does not fold
      var f = !!shut[grps[i].getAttribute('data-grp')];
      grps[i].classList.toggle('folded', f);
      head.setAttribute('aria-expanded', f ? 'false' : 'true');
    }
  }
  // Keyed by the heading's own text, not by where the block sits: a game added later renumbers the
  // blocks, and a fold that then applies to somebody else's family is worse than one forgotten
  function toggleFold(head) {
    var grp = head.closest ? head.closest('.gm-grp') : null; if (!grp) return;
    var k = grp.getAttribute('data-grp'); if (!k) return;
    var s = vscode.getState() || {}, f = s.gamesFold || {};
    if (f[k]) delete f[k]; else f[k] = 1;
    s.gamesFold = f; vscode.setState(s);
    applyFolds();
  }
  var _gmList = el('panelGames');
  // The star first: it sits inside the row, so asking what was clicked in the other order opens
  // the game every time somebody keeps it
  if (_gmList) _gmList.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var star = t.closest('.gm-fav');
    if (star) { toggleFav(star.getAttribute('data-fav')); return; }
    var head = t.closest('.gm-fold');
    if (head) { toggleFold(head); return; }
    var open = t.closest('.gm-open');
    if (open) openGame(open.getAttribute('data-game'));
  });
  applyFolds();
  applyFavs(null);   // before boot(): the empty list is a state too, and boot takes the focus
  if (el('bjBack')) el('bjBack').addEventListener('click', function () { openGame(null); });

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
    n.textContent = (r && r.name) || 'Room';
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

  // collapse / expand the roster — driven by the top-right chevron on the Agents tab
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
    applyRoster(s.rosterCollapsed); applyCrewFold(s.rosterCollapsed); updateToggleChevron();
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
    if (c) { c.classList.remove('selected'); resetRosterSprite(c, selectedAgent); }
    selectedAgent = null;
  }
  if (_poolEl) _poolEl.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var hr = t.closest('.hid-row');
    if (hr) { _hiddenOpen = !_hiddenOpen; _poolEl._sig = null; renderAgents((lastData && lastData.agents) || []); return; }
    var hc = t.closest('.hid-card');
    if (hc) { vscode.postMessage({ type: 'setHidden', name: hc.getAttribute('data-agent'), hidden: false }); return; }
    var card = t.closest('.cr-card'); if (!card) { deselectRoster(); return; } // empty area -> deselect
    var name = card.getAttribute('data-agent');
    if (t.closest('.cr-gear')) { openAgentModal(name); return; } // gear opens the settings modal
    if (selectedAgent === name) { deselectRoster(); return; } // re-click same -> deselect
    if (selectedAgent) {
      var prev = _poolEl.querySelector('.cr-card[data-agent="' + selectedAgent + '"]');
      if (prev) { prev.classList.remove('selected'); resetRosterSprite(prev, selectedAgent); }
    }
    selectedAgent = name; card.classList.add('selected');
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
        + '<button type="button" id="wkTeamSave" title="Sends this PC\'s weekly totals and this name to the extension\'s server. Only PCs signed in to the same Claude account see them. Nothing from your work.">' + (c.on ? 'Save' : 'Share') + '</button>'
        + (c.on ? '<button type="button" id="wkTeamOff" class="ghost">Stop sharing</button>' : '')
        + '</div>';
    }
    if (!t) return h + '<div class="wk-wait"><span class="wk-spin"></span></div>';
    if (t.error) return h + '<div class="wk-note">Sharing server not reachable (' + esc(t.error) + ') <a href="#" id="wkTeamEdit">Change</a></div>';
    h += '<div class="wk-team">' + t.rows.map(function (x) {
      return '<div class="wk-trow' + (x.me ? ' me' : '') + (x.stale ? ' stale' : '') + '" title="' + esc(x.name) + ': ' + fmtBig(x.tokens) + ' tokens, $' + Math.round(x.cost) + ', ' + Math.round(x.ofTeam * 100) + '% of the team\'s recorded use' + (x.stale ? ' (no report for 6h+)' : '') + '">'
        + '<span class="nm">' + esc(x.name) + (x.me ? ' (you)' : '') + '</span>'
        + '<span class="pc">' + pctTxt(x.pct) + '%</span>'
        + '<span class="tr"><i style="width:' + Math.min(100, x.pct) + '%"></i></span></div>';
    }).join('');
    if (t.unrecorded != null && t.unrecorded >= 0.5) {
      h += '<div class="wk-trow other" title="Account total minus everyone above: PCs that do not share, claude.ai on the web, the apps">'
        + '<span class="nm">Other PCs</span><span class="pc">' + pctTxt(t.unrecorded) + '%</span>'
        + '<span class="tr"><i style="width:' + Math.min(100, t.unrecorded) + '%"></i></span></div>';
    }
    h += '</div><div class="wk-note wk-right"><a href="#" id="wkTeamEdit">Change</a></div>';
    return h;
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
    var how = pl.basis === 'reference' ? 'Reference rate for ' + (pl.tierKnown ? TIER[pl.tier] : 'Max 20x (assumed)') + ': about ' + per + ' per 1%'
      : (pl.basis === 'rough' ? 'Measured on this PC, rough (' + pl.readings + ' of ' + pl.needed + '): about ' : 'Measured on this PC: about ') + per + ' per 1%';
    h += '<div class="wk-share" title="' + esc(how) + '"><span class="wk-big">' + (me != null ? (pl.basis === 'measured' ? '≈ ' : '~') + pctTxt(me) + '<small>%</small>' : '–') + '</span>'
      + '<span class="wk-of">of this week\'s plan limit<br>account total (every PC) ' + (acc != null ? Math.round(acc) + '%' : '–') + '</span></div>';
    h += '<div class="wk-meter">' + (acc != null ? '<i class="acc" style="width:' + Math.min(100, acc) + '%"></i>' : '')
      + (me != null ? '<i class="me" style="width:' + Math.min(100, me) + '%"></i>' : '') + '</div>';
    h += '<div class="wk-legend"><span><b style="background:#e8895a"></b>this PC</span><span><b style="background:rgba(232,137,90,.35)"></b>other PCs</span></div>';
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

  // hide the stat tiles when the panel is too narrow for their values
  // Debounced so a momentary width blip (sidebar re-layout when a badge count appears)
  // doesn't flip the panel to its narrow layout and back.
  function applyResponsive() {
    var w = document.body.clientWidth;
    document.body.classList.toggle('narrow', w < 232);
    document.body.classList.toggle('wrapcols', w < 340);
    // keep the roster a 4-column grid at any width by scaling characters + labels down to fit
    // (derive from body width so it's correct even while the Agents tab is hidden)
    var contentW = w - 70; // wrap+card+inner paddings
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
  // keep "updated Xm ago" ticking between data pushes
  setInterval(function () { if (lastData && el('upd')) { var ua = lastData.usageAt || 0; if (ua) el('upd').textContent = agoText(ua); } }, 30000);

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
