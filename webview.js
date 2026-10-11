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
  var CUC = { npcs: {} };
  try { var _ae = document.getElementById('cuc-assets'); if (_ae) CUC = JSON.parse(_ae.getAttribute('data-json')) || CUC; } catch (e) { /* no assets → roster bodies render empty (assets are always bundled, so this is not a normal path) */ }
  var NPC_KEYS = Object.keys(CUC.npcs);
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
    var pool = NPC_ORDER.filter(function (k) { return CUC.npcs[k]; });
    if (!pool.length) pool = NPC_KEYS.slice();
    var used = {}, map = {};
    var overrides = (lastData && lastData.appearance) || {};
    var names = (agents || []).map(function (a) { return a.name; }).slice().sort(); // stable order → stable probing
    // pin user-chosen appearances first (these win, may repeat by choice)
    for (var p = 0; p < names.length; p++) { var ov = overrides[names[p]]; if (ov && CUC.npcs[ov]) { map[names[p]] = ov; used[ov] = true; } }
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
    return { key: k, meta: CUC.npcs[k] };
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
  function roomSpots() { var r = (CUC.rooms || {})[(vscode.getState() || {}).map || 'cave'] || (CUC.rooms || {}).cave || {}; return { entry: r.entry || [0.26, 0.80], desk: r.desk || [0.50, 0.735] }; }
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
  // Inside games there is the list, or one game's screen; body.tab-* scopes compact mode to Usage,
  // hides the header crab in the games area, and game-bj scopes the blackjack shortcuts
  function curTab() { return (vscode.getState() || {}).tab || 'usage'; }
  function curGame() { return curTab() === 'games' ? ((vscode.getState() || {}).game || null) : null; }
  function creditsHidden() { return (((lastData && lastData.cfg && lastData.cfg.panelHidden) || []).indexOf('credits') >= 0); }
  function applyView() {
    var t = curTab(), g = curGame(), b = document.body, hdc = el('hdCredits');
    b.classList.toggle('tab-usage', t === 'usage');
    b.classList.toggle('tab-agents', t === 'agents');
    b.classList.toggle('tab-games', t === 'games');
    b.classList.toggle('game-bj', g === 'blackjack');
    b.classList.toggle('game-hl', g === 'hilo');
    var shown = { panelUsage: t === 'usage', panelAgents: t === 'agents', panelGames: t === 'games' && !g,
      panelTable: g === 'blackjack', panelHiLo: g === 'hilo' };
    for (var id in shown) { var p = el(id); if (p) p.style.display = shown[id] ? '' : 'none'; }
    var au = el('tabUsage'), ag = el('tabAgents');
    if (au) au.classList.toggle('active', t === 'usage');
    if (ag) ag.classList.toggle('active', t === 'agents');
    if (hdc) hdc.setAttribute('aria-pressed', t === 'games' ? 'true' : 'false');
    if (typeof updateToggleChevron === 'function') updateToggleChevron();
  }
  // Entering a game screen asks the host for its state; entering the list just takes the focus
  function enterGames() {
    var g = curGame();
    if (g === 'blackjack') { bj.wantFocus = true; bjControls(bj.st, true); bjSend('open'); }
    else if (g === 'hilo') { hl.wantFocus = true; hlControls(hl.st, true); hlSend('open'); }
    else { var first = document.querySelector('#panelGames .gm-row'); if (first) first.focus(); }
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
    if (_bjHold) { _ccHeld = c; return; } // a hand is still being dealt: the header waits for the cards
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
    if (curGame() === 'blackjack' && !bj.busy) bjRenderStakes();
    if (curGame() === 'hilo' && !hl.busy) { renderStakes(STAKE_UI.hl, false); hlControls(hl.st, false); }
  }

  // ===========================================================================
  // Blackjack: third panel view, opened from the header credits line. The host judges;
  // this only draws, and paces the cards the host already dealt (state.seq).
  // ===========================================================================
  var BJ_STAKES = [10, 100, 1000];
  // cardIn and flip are the lengths of .bj-card.in and .bj-card.flip in styles.js: change them together
  var BJ_T = { cardIn: 200, dealGap: 250, holeFirst: 150, holeLead: 600, flip: 300, dealerGap: 550, settle: 300, unlock: 50, noReply: 4000 };
  // n: number of the request in flight (the host echoes it); wantFocus: move focus into the table at the next settle
  var bj = { st: null, busy: false, op: null, n: 0, timers: [], to: null, wantFocus: false, focusPhase: null };
  var _bjHold = false, _ccHeld = null;
  var COIN_FULL = (el('bjCoin') || {}).innerHTML || '';

  // --- cards: 16x22 cells, 2px each at the blackjack table and 4px for the High-Low hero card
  var BJ_INK = '#1d1d1f', BJ_RED = '#c25a34';
  var BJ_RANK = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
    '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '###', '#.#', '###'],
    '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
    '10': ['#.###', '#.#.#', '#.#.#', '#.#.#', '#.###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], K: ['#.#', '#.#', '##.', '#.#', '#.#']
  };
  var BJ_PIP5 = {
    S: ['..#..', '.###.', '#####', '..#..', '.###.'], H: ['##.##', '#####', '#####', '.###.', '..#..'],
    D: ['..#..', '.###.', '#####', '.###.', '..#..'], C: ['.###.', '.###.', '#####', '#.#.#', '.###.']
  };
  var BJ_PIP7 = {
    S: ['...#...', '..###..', '.#####.', '#######', '#######', '.#.#.#.', '..###..'],
    H: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
    D: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
    C: ['..###..', '..###..', '##.#.##', '#######', '##.#.##', '...#...', '..###..']
  };
  var BJ_FRAME = '<path fill="#1d1d1f" fill-rule="evenodd" d="M1 0h14v1h1v20h-1v1h-14v-1h-1v-20h1zM1 1v20h14v-20z"/>';
  function bmPath(bm, ox, oy) { var d = ''; for (var y = 0; y < bm.length; y++) for (var x = 0; x < bm[y].length; x++) if (bm[y][x] === '#') d += 'M' + (ox + x) + ' ' + (oy + y) + 'h1v1h-1z'; return d; }
  var CARD_CELL = 2; // px per cell; the grid stays integer at any whole multiple
  function cardSvg(inner, cell) {
    cell = cell || CARD_CELL;
    return '<svg viewBox="0 0 16 22" width="' + (16 * cell) + '" height="' + (22 * cell) + '" shape-rendering="crispEdges" aria-hidden="true">' + BJ_FRAME + inner + '</svg>';
  }
  function cardFace(c, cell) {
    if (!c || !BJ_RANK[c.r] || !BJ_PIP5[c.s]) return CARD_BACK; // a card this table cannot draw shows its back instead of breaking the table
    var col = (c.s === 'H' || c.s === 'D') ? BJ_RED : BJ_INK;
    return cardSvg('<rect x="1" y="1" width="14" height="20" fill="#fff"/><path fill="' + col + '" d="'
      + bmPath(BJ_RANK[c.r], 2, 2) + bmPath(BJ_PIP5[c.s], 2, 8) + bmPath(BJ_PIP7[c.s], 7, 12) + '"/>', cell);
  }
  var CARD_BACK = (function () {
    var d = ''; for (var y = 2; y < 20; y++) for (var x = 2; x < 14; x++) if ((x + y) % 4 === 0 || (x - y) % 4 === 0) d += 'M' + x + ' ' + y + 'h1v1h-1z';
    return cardSvg('<rect x="1" y="1" width="14" height="20" fill="#fff"/><rect x="2" y="2" width="12" height="18" fill="#e8895a"/><path fill="#c25a34" d="' + d + '"/>');
  })();
  function cardEl(svg, left, cls) { return '<div class="bj-card' + (cls ? ' ' + cls : '') + '" style="left:' + left + 'px">' + svg + '</div>'; }
  // max 16px (8 cells) so the rank index always shows; squeeze to fit, never below 10px, even px only
  function fanOffset(fan, n) { if (n < 2) return 0; var w = fan.clientWidth || 120; return Math.max(10, Math.min(16, Math.floor((w - 32) / (n - 1) / 2) * 2)); }

  // --- which cards the sequence still has to bring in
  // engine seq -> steps: {ev:'card',to:'player',hand} = a player card, {ev:'card',to:'dealer'} = a dealer card (card:null is the hole, drawn as a back), {ev:'reveal'} = the hole flip (face from the final dealer.cards[1]), {ev:'split'} = no step (the final state already has both hands)
  function bjPending(seq) {
    var p = { p: {}, d: 0, hole: false };
    (seq || []).forEach(function (it) {
      if (it.ev === 'card' && it.to === 'player') p.p[it.hand || 0] = (p.p[it.hand || 0] || 0) + 1;
      else if (it.ev === 'card' && it.to === 'dealer') p.d++;
      else if (it.ev === 'reveal') p.hole = true;
    });
    return p;
  }
  function bjDealer(st, pend) {
    var fan = el('bjDFan'); if (!fan) return;
    var d = (st && st.dealer) || { cards: [], hole: false };
    var n = d.hole ? Math.max(d.cards.length, 2) : d.cards.length; // hole:true draws a back whether or not the host sent its rank
    var off = fanOffset(fan, n), html = '';
    for (var i = 0; i < n; i++) {
      var down = i === 1 && (d.hole || pend.hole), c = d.cards[i];
      html += cardEl(down || !c ? CARD_BACK : cardFace(c), i * off, (i >= n - pend.d ? 'pending' : '') + (down ? ' down' : ''));
    }
    fan.innerHTML = html;
    if (pend.hole && d.cards[1] && fan.children[1]) fan.children[1]._face = cardFace(d.cards[1]);
  }
  // the player, sitting at the table: a still frame (idleRow/idleCol) of an agent sprite, never animated
  var BJ_HERO_T = 44;         // card height
  var BJ_HERO_KEY = 'player'; // hum-player: the "me" sprite, and outside NPC_ORDER so Crew never wears the same face
  function bjHeroHtml() {
    var m = (CUC.npcs || {})[BJ_HERO_KEY];
    return m ? '<div class="bj-hero" style="' + cropStyle(m, m.idleRow || 0, m.idleCol || 0, BJ_HERO_T) + '"></div>' : '';
  }
  // one player however many hands: the sprite sits on the first row only, the stake under it
  function bjRowHtml(hand, h) {
    return '<div class="bj-row bj-p" data-h="' + h + '"><div class="bj-who">'
      + (h === 0 ? bjHeroHtml() : '')
      + '<span class="bj-stake' + (hand ? '' : ' preview') + '">' + COIN_FULL + '<b>' + fmtInt(hand ? hand.bet : bjStake()) + '</b></span></div>'
      + '<div class="bj-hand"><div class="bj-fan" role="img"></div><div class="bj-line"></div></div></div>';
  }
  function bjHands(st, pend) {
    var box = el('bjHands'); if (!box) return;
    var hands = (st && st.hands) || [];
    if (!hands.length) { box.innerHTML = bjRowHtml(null, 0); return; } // empty seat, stake preview
    var html = ''; for (var h = 0; h < hands.length; h++) html += bjRowHtml(hands[h], h);
    box.innerHTML = html;
    for (h = 0; h < hands.length; h++) {
      var fan = box.querySelector('.bj-p[data-h="' + h + '"] .bj-fan'), cs = hands[h].cards, p = pend.p[h] || 0, off = fanOffset(fan, cs.length), f = '';
      for (var i = 0; i < cs.length; i++) f += cardEl(cardFace(cs[i]), i * off, i >= cs.length - p ? 'pending' : '');
      fan.innerHTML = f;
    }
  }
  // totals, chips and net change only at settle, never ahead of the cards
  var RES_WORD = { blackjack: 'Blackjack', win: 'Win', lose: 'Lose', bust: 'Bust', push: 'Push' };
  var RES_TINT = { blackjack: 'bj', win: 'win', lose: 'lose', bust: 'lose', push: '' };
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmtInt(Math.abs(n)); }
  // still: a redraw of the same result (after a resize), so the chips do not pop in a second time
  function bjLines(st, still) {
    var d = st && st.dealer, dl = el('bjDTot'), pop = still ? ' still' : '';
    if (dl) dl.innerHTML = (d && d.total != null) ? '<span class="bj-tot">' + d.total + '</span>' + (d.total > 21 ? '<span class="bj-chip' + pop + '">Bust</span>' : '') : '';
    var dfan = el('bjDFan'), ranks = function (cs) { return cs.map(function (c) { return c.r; }).join(' '); };
    if (dfan) dfan.setAttribute('aria-label', !(d && d.cards.length) ? 'Dealer' : d.hole ? 'Dealer: ' + ranks(d.cards) + ' and a card face down' : 'Dealer: ' + ranks(d.cards) + ', total ' + d.total);
    var hands = (st && st.hands) || [], one = hands.length === 1;
    for (var h = 0; h < hands.length; h++) {
      var H = hands[h], row = document.querySelector('#bjHands .bj-p[data-h="' + h + '"]'); if (!row) continue;
      var live = st.phase === 'player' && !H.done;
      var tot = (H.soft && live && H.total < 21) ? '<span class="soft">' + (H.total - 10) + '/</span>' + H.total : String(H.total);
      var chip = H.result ? '<span class="bj-chip ' + RES_TINT[H.result] + pop + '">' + RES_WORD[H.result] + (one && st.net ? ' ' + signed(st.net) : '') + '</span>' : '';
      row.querySelector('.bj-line').innerHTML = '<span class="bj-tot">' + tot + '</span>' + chip;
      row.querySelector('.bj-stake b').textContent = fmtInt(H.bet);
      row.classList.toggle('dim', st.phase === 'player' && hands.length > 1 && h !== st.active);
      row.querySelector('.bj-fan').setAttribute('aria-label', 'Hand ' + (h + 1) + ': ' + H.cards.map(function (c) { return c.r; }).join(' ') + ', total ' + H.total);
    }
    var net = el('bjNet');
    if (net) { net.hidden = !(st && st.phase === 'done' && hands.length > 1); net.textContent = 'Net ' + signed((st && st.net) || 0); }
  }

  // --- pacing
  function bjClearTimers() { bj.timers.forEach(clearTimeout); bj.timers = []; }
  function bjRevealer(it) {
    return function () {
      var fan = it.to === 'dealer' ? el('bjDFan') : document.querySelector('#bjHands .bj-p[data-h="' + (it.hand || 0) + '"] .bj-fan');
      var c = fan && fan.querySelector('.bj-card.pending'); if (!c) return;
      c.classList.remove('pending'); c.classList.add('in');
    };
  }
  function bjFlipHole() {
    var fan = el('bjDFan'), c = fan && fan.children[1]; if (!c || !c._face) return;
    c.classList.add('flip');
    bj.timers.push(setTimeout(function () { c.innerHTML = c._face; c.classList.remove('down'); }, BJ_T.flip / 2)); // edge-on: swap
  }
  // same mapping as bjPending: card events become card steps (dealer ones spaced wider once the hole is turned), reveal becomes the flip, split adds no step
  function bjSteps(seq) {
    var out = [], t = null, dealerTurn = false;
    (seq || []).forEach(function (it) {
      if (it.ev === 'split') return;
      if (it.ev === 'reveal') { t = t == null ? BJ_T.holeFirst : t + BJ_T.holeLead; out.push({ at: t, dur: BJ_T.flip, fn: bjFlipHole }); dealerTurn = true; return; }
      t = t == null ? 0 : t + (dealerTurn ? BJ_T.dealerGap : BJ_T.dealGap);
      out.push({ at: t, dur: BJ_T.cardIn, fn: bjRevealer(it) });
    });
    return out;
  }

  // Leaving the table (back to the list, or out of the games area): drop the pacing timers and let
  // any held header push through, or the header number stays frozen at what it showed mid-deal
  // Same order as a settle: the number moves quietly first, so winnings are not celebrated as
  // earned credits, and the push then fills in the title and the coin
  function releaseHeldHeader() {
    _bjHold = false;
    if (_ccHeld) { var h = _ccHeld; _ccHeld = null; if (typeof h.balance === 'number') setCreditsQuiet(h.balance); renderCredits(h); }
  }
  function bjLeave() {
    bjClearTimers();
    clearTimeout(bj.to);
    bj.busy = false; bj.op = null;
    releaseHeldHeader();
  }

  // --- messages
  function bjSend(op, extra) {
    if (bj.busy) return;
    bj.busy = true; bj.op = op; bj.n += 1;
    if (op !== 'open') bjControls(bj.st, true);
    vscode.postMessage(Object.assign({ type: 'bj', op: op, n: bj.n }, extra || {}));
    clearTimeout(bj.to);
    bj.to = setTimeout(function () { bj.busy = false; bj.op = null; bjError('The table didn’t respond. Try again.'); bjControls(bj.st, false); }, BJ_T.noReply);
  }
  // Draws a reply and returns its pacing steps. op is null for a reply that is not the one awaited
  function bjDraw(m, op, prevSt) {
    var st = bj.st;
    var seq = (op && op !== 'open' && !_reduceMotion && st && st.seq) || null; // open, late replies and reduced motion: final state at once
    var pend = bjPending(seq);
    if (op === 'deal' && !m.error) { var dl = el('bjDTot'); if (dl) dl.innerHTML = ''; }
    bjDealer(st, pend); bjHands(st, pend);
    if (seq && op !== 'deal' && prevSt) bjLines(prevSt); // keep the old totals up until the new cards land
    bjError(m.error || '');
    bjControls(st, true);
    return bjSteps(seq);
  }
  // A reply to the request in flight is paced. One that is not (a late reply after the no-reply
  // timeout) is drawn as it stands, with no pacing and no reactions; an older reply arriving while
  // a newer request waits is dropped, since the newer reply carries the latest state anyway
  function bjReceive(m) {
    var current = bj.op != null && m.n === bj.n;
    if (!current && bj.op != null) return;
    setHeld('bj', m);
    var op = current ? bj.op : null, prevSt = bj.st, steps = [], end = 0;
    clearTimeout(bj.to); bjClearTimers();
    bj.op = null; bj.st = m.state || null;
    try { steps = bjDraw(m, op, prevSt); }
    finally {
      // whatever the drawing did, the settle has to be scheduled: it is what unlocks the table.
      // The header waits for that settle even when nothing is paced: the host's data push sits right
      // behind this reply, and if it landed before the quiet balance update a game win would be
      // celebrated as an earning
      _bjHold = true;
      steps.forEach(function (s) { bj.timers.push(setTimeout(s.fn, s.at)); end = Math.max(end, s.at + s.dur); });
      var lead = steps.length ? (bj.st && bj.st.phase === 'done' ? BJ_T.settle : BJ_T.unlock) : 0;
      bj.timers.push(setTimeout(function () { bjSettle(m, current && op !== 'open'); }, end + lead));
    }
  }
  // a game result is not an earning: move the header number quietly, then judge any held push against it
  function setCreditsQuiet(bal) {
    var balEl = el('ccBal'); if (!balEl) return;
    bal = Math.max(0, Math.floor(bal));
    var was = prev.cr; prev.cr = bal;
    balEl.textContent = fmtInt(bal); fitCredits();
    if (was != null && was !== bal && !_reduceMotion) tween('ccBal', was, bal, fmtInt);
  }
  // fresh: the reply to a move the player just made (not an open, not a late reply)
  function bjSettle(m, fresh) {
    bj.busy = false; _bjHold = false;
    try {
      if (typeof m.balance === 'number') setCreditsQuiet(m.balance);
      if (_ccHeld) { var h = _ccHeld; _ccHeld = null; renderCredits(h); }
      bjLines(bj.st);
      if (fresh && bj.st && bj.st.phase === 'done') bjAnnounce(bj.st);
    } finally {
      bjControls(bj.st, false);
      bjFocusAfter();
    }
  }
  function bjAnnounce(st) {
    var live = el('bjLive'); if (!live) return;
    var one = st.hands.length === 1 ? st.hands[0] : null;
    live.textContent = (one ? RES_WORD[one.result] + (st.net ? ' ' + signed(st.net) : '') : 'Net ' + signed(st.net || 0)) + '. Balance ' + fmtInt(prev.cr || 0) + '.';
  }
  // Keyboard focus follows the table: in on entry, to the first action when a hand starts, back to
  // Deal when the bet controls return, and back in whenever it was left on something hidden or
  // disabled. Otherwise it stays where the player put it. Left on the header credits button, Enter
  // would press that button again and leave the table
  function bjFocusAfter() {
    if (curGame() !== 'blackjack') return;
    var phase = bj.st ? bj.st.phase : 'bet', play = phase === 'player';
    var swapped = bj.focusPhase != null && play !== (bj.focusPhase === 'player');
    bj.focusPhase = phase;
    var a = document.activeElement, table = el('panelTable');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(table && table.contains(a));
    if (!bj.wantFocus && !swapped && !lost) return;
    bj.wantFocus = false;
    var target = play ? document.querySelector('#bjPlay [data-op]:not([hidden]):not([disabled])') : el('bjDeal');
    if (target && !target.disabled) target.focus();
  }

  // --- controls
  // the chips, the Deal button and the "not enough credits" note: the same for every game,
  // each with its own remembered stake and its own elements
  var STAKE_UI = {
    bj: { g: 'bj', other: 'High-Low', key: 'bjStake', box: 'bjStakes', chips: '#bjStakes button', deal: 'bjDeal', note: 'bjNote', preview: '#bjHands .bj-stake.preview b' },
    hl: { g: 'hl', other: 'Blackjack', key: 'hlStake', box: 'hlStakes', chips: '#hlStakes button', deal: 'hlDeal', note: 'hlNote', preview: '#hlLine .hl-pot.preview b' }
  };
  // What the OTHER game still has riding, per game. Both games bet from one purse but a stake does
  // not leave the balance until its round settles, so the header number is not what this game may
  // bet: the host sends `free` with every reply and the difference from the balance is what is
  // spoken for. Kept as that difference rather than as `free` itself, so a credit minted while the
  // bet screen is up lights the chips at once instead of waiting for the next reply
  var gameHeld = { bj: 0, hl: 0 };
  function setHeld(g, m) {
    if (typeof m.free === 'number' && typeof m.balance === 'number') gameHeld[g] = Math.max(0, m.balance - m.free);
  }
  function gameStake(ui) { var v = (vscode.getState() || {})[ui.key]; return BJ_STAKES.indexOf(v) >= 0 ? v : BJ_STAKES[0]; }
  function renderStakes(ui, locked) {
    var held = gameHeld[ui.g] || 0;
    var known = prev.cr != null, bal = known ? Math.max(0, prev.cr - held) : 0, want = gameStake(ui), pick = 0;
    BJ_STAKES.forEach(function (v) { if (v <= bal && v <= want) pick = v; }); // largest affordable, not above the remembered stake
    var bs = document.querySelectorAll(ui.chips);
    for (var i = 0; i < bs.length; i++) {
      var v = Number(bs[i].getAttribute('data-v')), short = v > bal;
      bs[i].disabled = locked || short;
      // a chip the header's balance covers but this game's share does not is the other game's doing
      bs[i].title = !short ? '' : (known && v <= prev.cr ? ui.other + ' is holding these credits' : 'Not enough credits');
      bs[i].classList.toggle('on', v === pick);
      bs[i].setAttribute('aria-pressed', v === pick ? 'true' : 'false');
    }
    var deal = el(ui.deal); if (deal) { deal.disabled = locked || !pick; deal.setAttribute('data-bet', String(pick)); }
    var pv = document.querySelector(ui.preview); if (pv) pv.textContent = fmtInt(pick || want);
    // being broke and having the credits tied up in the other game are different problems, and a
    // header reading 1,000 over a row of dead chips has to say which one this is
    var note = el(ui.note);
    if (note) {
      note.hidden = !known || bal >= BJ_STAKES[0];
      note.textContent = known && prev.cr >= BJ_STAKES[0]
        ? ui.other + ' is holding these credits.'
        : 'You need ' + BJ_STAKES[0] + ' credits to play.';
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
  function bjStake() { return gameStake(STAKE_UI.bj); }
  function bjRenderStakes(locked) { renderStakes(STAKE_UI.bj, locked == null ? bj.busy : locked); }
  function bjControls(st, locked) {
    var play = !!(st && st.phase === 'player'), can = (st && st.can) || {};
    var bet = el('bjBet'), pl = el('bjPlay');
    if (bet) bet.hidden = play; if (pl) pl.hidden = !play;
    var ops = document.querySelectorAll('#bjPlay [data-op]');
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i].getAttribute('data-op');
      ops[i].hidden = (op === 'double' || op === 'split') && !can[op];
      ops[i].disabled = locked || !can[op];
    }
    if (!play) bjRenderStakes(locked);
  }
  function bjError(msg) {
    var e = el('bjErr'); if (!e) return;
    e.hidden = !msg;
    if (msg) e.innerHTML = WARN_SVG + '<span class="wbmsg">' + esc(msg) + '</span>';
  }

  // --- wiring
  bjHands(null, bjPending(null));
  wireStakes(STAKE_UI.bj, function () { bjRenderStakes(); });
  if (el('bjDeal')) el('bjDeal').addEventListener('click', function () {
    var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
    bjSend('deal', { bet: bet });
  });
  if (el('bjPlay')) el('bjPlay').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
    bjSend(b.getAttribute('data-op'));
  });
  // Shortcuts belong to the open game only: the list and the other game never react.
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
    var body = document.body, atBj = body.classList.contains('game-bj'), atHl = body.classList.contains('game-hl');
    if ((!atBj && !atHl) || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    var t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
    if (document.querySelector('.sheet:not([hidden])')) return;
    var k = String(e.key).toLowerCase();
    if (atBj) pressPanel(e, '#bjPlay', { h: 'hit', s: 'stand', d: 'double', p: 'split' }[k] || null, 'bjDeal', 'bjBet');
    else pressPanel(e, '#hlPlay', { arrowup: 'higher', arrowdown: 'lower', c: 'cashout' }[k] || null, 'hlDeal', 'hlBet');
  });

  // ===========================================================================
  // High-Low: guess whether the next card beats this one. The host judges and prices it;
  // this draws one hero card, keeps the card just played as a pile, and paces the two.
  // ===========================================================================
  // inLead is the gap before the new card arrives; settle/unlock are when the numbers follow it and
  // when the buttons come back, with deal/dealUnlock the shorter pair a fresh card needs
  var HL_T = { inLead: 40, settle: 220, unlock: 240, deal: 180, dealUnlock: 200, noReply: 4000 };
  var hl = { st: null, busy: false, op: null, n: 0, timers: [], to: null, wantFocus: false, phase: null };
  // The price on a guess button is read back from the pot the host says a correct call pays, never
  // worked out here from the odds: pots are whole credits, so a pot of 10 priced at 1.06x comes back
  // unchanged and a printed x1.1 would be a promise the table does not keep. Floored for the same
  // reason, so the button never asks for more than it gives
  function hlPrice(pays, pot) {
    if (pays == null || !(pot > 0)) return '—';
    var m = pays / pot;
    return '×' + (m >= 10 ? Math.floor(m) : (Math.floor(m * 10) / 10).toFixed(1));
  }
  function hlPot(v, preview) { return '<span class="hl-pot' + (preview ? ' preview' : '') + '">' + COIN_FULL + '<b>' + fmtInt(v) + '</b></span>'; }
  function hlClearTimers() { hl.timers.forEach(clearTimeout); hl.timers = []; }

  // The cards: the one just played slides down to the pile on the left, the new one comes in
  function hlCards(st, animate) {
    var prevEl = el('hlPrev'), cardEl = el('hlCard'); if (!prevEl || !cardEl) return;
    var hist = (st && st.history) || [];
    var last = hist.length ? hist[hist.length - 1].card : null; // only the latest: the pot and the streak say how far this run went
    prevEl.innerHTML = last ? cardFace(last, 2) : '';
    cardEl.innerHTML = (st && st.card) ? cardFace(st.card, 4) : '';
    prevEl.classList.remove('drop'); cardEl.classList.remove('in');
    if (!animate) return;
    // the played card drops onto the pile first, the new one arrives just behind it
    if (last) { void prevEl.getBoundingClientRect(); prevEl.classList.add('drop'); }
    cardEl.style.visibility = 'hidden';
    hl.timers.push(setTimeout(function () {
      cardEl.style.visibility = '';
      void cardEl.getBoundingClientRect(); cardEl.classList.add('in');
    }, HL_T.inLead));
  }
  // What a screen reader is told. The hero card is the whole state of this game, so it carries its
  // own name; the pile beside it is aria-hidden in the HTML and the line below names the card that
  // was played instead
  var HL_SUIT = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  var HL_RANK = { A: 'ace', J: 'jack', Q: 'queen', K: 'king' };
  function hlCardWord(c) { return c ? (HL_RANK[c.r] || c.r) + ' of ' + (HL_SUIT[c.s] || c.s) : 'no card'; }
  function hlLabel(st) {
    var c = el('hlCard'); if (!c) return;
    c.setAttribute('aria-label', (st && st.card) ? 'Face up: ' + hlCardWord(st.card) : 'No card');
  }
  // One line per move, read out at the settle: a call turns a card over and moves the pot, and
  // neither the label on the card nor the line under it is announced on its own
  var HL_SAID = { win: 'right', lose: 'wrong', push: 'a tie, the pot rides' };
  function hlAnnounce(st) {
    var live = el('hlLive'); if (!live || !st) return;
    var hist = st.history || [], last = hist.length ? hist[hist.length - 1] : null, said = [];
    if (st.phase === 'done') {
      said.push((st.ended === 'cashout' ? 'Cashed out ' : 'Wrong call, ') + signed(st.net || 0));
      said.push('Balance ' + fmtInt(prev.cr || 0));
    } else {
      if (last) said.push((last.guess === 'higher' ? 'Higher' : 'Lower') + ': ' + HL_SAID[last.result]);
      said.push(hlCardWord(st.card));
      said.push('Pot ' + fmtInt(st.pot));
    }
    live.textContent = said.join('. ') + '.';
  }
  // The line under the cards: the pot while playing, the result once the round is over
  function hlLine(st) {
    hlLabel(st); // the card's name moves with the line, so it follows the card rather than leading it
    var line = el('hlLine'); if (!line) return;
    if (!st || st.phase === 'bet') { line.innerHTML = hlPot(gameStake(STAKE_UI.hl), true); return; }
    if (st.phase === 'done') {
      var won = st.ended === 'cashout';
      line.innerHTML = '<span class="bj-chip ' + (won ? 'win' : 'lose') + '">' + (won ? 'Cashed out ' : 'Wrong ') + signed(st.net || 0) + '</span>';
      return;
    }
    line.innerHTML = hlPot(st.pot, false) + (st.streak > 1 ? '<span class="bj-chip">' + st.streak + ' in a row</span>' : '');
  }
  // Locks what is on screen without touching the numbers or swapping the rows: during a guess the
  // old prices and pot must stay put until the card has landed
  function hlLock() {
    var all = document.querySelectorAll('#hlPlay [data-op], #hlStakes button');
    for (var i = 0; i < all.length; i++) all[i].disabled = true;
    var d = el('hlDeal'); if (d) d.disabled = true;
  }
  // the prices and the pot on the buttons: they change with the line, one step before the buttons
  function hlNumbers(st) {
    var pays = (st && st.pays) || {}, pot = (st && st.pot) || 0;
    var up = el('hlUp'), dn = el('hlDn'), amt = el('hlCashAmt');
    if (up) up.textContent = hlPrice(pays.higher, pot);
    if (dn) dn.textContent = hlPrice(pays.lower, pot);
    if (amt) amt.textContent = fmtInt(pot);
  }
  function hlControls(st, locked) {
    var play = !!(st && st.phase === 'play'), can = (st && st.can) || {};
    var bet = el('hlBet'), pl = el('hlPlay');
    if (bet) bet.hidden = play; if (pl) pl.hidden = !play;
    hlNumbers(st);
    var ops = document.querySelectorAll('#hlPlay [data-op]');
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i].getAttribute('data-op');
      ops[i].disabled = locked || !can[op];
    }
    if (!play) renderStakes(STAKE_UI.hl, locked);
  }
  function hlError(msg) {
    var e = el('hlErr'); if (!e) return;
    e.hidden = !msg;
    if (msg) e.innerHTML = WARN_SVG + '<span class="wbmsg">' + esc(msg) + '</span>';
  }
  function hlFocusAfter() {
    if (curGame() !== 'hilo') return;
    var play = hl.st && hl.st.phase === 'play';
    var swapped = hl.phase != null && play !== (hl.phase === 'play');
    hl.phase = hl.st ? hl.st.phase : 'bet';
    var a = document.activeElement, panel = el('panelHiLo');
    var lost = !a || a === document.body || a.hidden || a.disabled || !(panel && panel.contains(a));
    if (!hl.wantFocus && !swapped && !lost) return;
    hl.wantFocus = false;
    var target = play ? document.querySelector('#hlPlay [data-op="higher"]') : el('hlDeal');
    if (target && !target.disabled) target.focus();
  }
  function hlLeave() {
    hlClearTimers();
    clearTimeout(hl.to);
    hl.busy = false; hl.op = null;
    releaseHeldHeader();
  }
  function gameLeave() { bjLeave(); hlLeave(); }

  function hlSend(op, extra) {
    if (hl.busy) return;
    hl.busy = true; hl.op = op; hl.n += 1;
    if (op !== 'open') hlControls(hl.st, true);
    vscode.postMessage(Object.assign({ type: 'hl', op: op, n: hl.n }, extra || {}));
    clearTimeout(hl.to);
    hl.to = setTimeout(function () { hl.busy = false; hl.op = null; hlError('The table didn’t respond. Try again.'); hlControls(hl.st, false); }, HL_T.noReply);
  }
  // The cards move first and the numbers follow: a pot or a payout that changed early would give
  // the result away before the card is on the felt
  function hlReceive(m) {
    var current = hl.op != null && m.n === hl.n;
    if (!current && hl.op != null) return; // an older reply while a newer request waits
    var op = current ? hl.op : null;
    clearTimeout(hl.to); hlClearTimers();
    setHeld('hl', m);
    hl.op = null; hl.st = m.state || null;
    // acted: the reply to a move the player just made. A refused move changed nothing, so there is
    // nothing to pace and nothing to read out: the host answers it with the run exactly as it
    // stands, and pacing that would drop the same card onto the felt a second time
    var acted = current && op !== 'open' && !m.error;
    var fresh = acted && !_reduceMotion;
    var settleAt = 0, unlockAt = 0;
    if (fresh && op === 'deal') { settleAt = HL_T.deal; unlockAt = HL_T.dealUnlock; }
    else if (fresh) { settleAt = HL_T.settle; unlockAt = HL_T.unlock; }
    try {
      hlCards(hl.st, fresh);
      hlError(m.error || '');
      if (settleAt) hlLock();          // the numbers and the rows follow the card, at settle
      else { hlControls(hl.st, true); hlLine(hl.st); }
    } finally {
      _bjHold = true; // the header waits for this reply's settle, like the blackjack table
      if (settleAt) hl.timers.push(setTimeout(function () { hlLine(hl.st); hlNumbers(hl.st); }, settleAt));
      hl.timers.push(setTimeout(function () { hlSettle(m, acted); }, unlockAt));
    }
  }
  // acted: the reply to a move the player just made (not an open, not a refusal, not a late reply)
  function hlSettle(m, acted) {
    hl.busy = false; _bjHold = false;
    try {
      if (typeof m.balance === 'number') setCreditsQuiet(m.balance);
      if (_ccHeld) { var h = _ccHeld; _ccHeld = null; renderCredits(h); }
      hlLine(hl.st);
      if (acted) hlAnnounce(hl.st); // after the balance, so the line can say where it landed
    } finally {
      hlControls(hl.st, false);
      hlFocusAfter();
    }
  }

  // --- wiring
  hlLine(null);
  wireStakes(STAKE_UI.hl, function () { renderStakes(STAKE_UI.hl, hl.busy); });
  if (el('hlDeal')) el('hlDeal').addEventListener('click', function () {
    var bet = Number(this.getAttribute('data-bet')); if (!bet) return;
    hlSend('deal', { bet: bet });
  });
  if (el('hlPlay')) el('hlPlay').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-op]') : null; if (!b || b.disabled) return;
    hlSend(b.getAttribute('data-op'));
  });
  if (el('hlBack')) el('hlBack').addEventListener('click', function () { openGame(null); });

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
    else if (m.type === 'bj') bjReceive(m);
    else if (m.type === 'hl') hlReceive(m);
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

  // tab switcher (Usage default; last choice remembered within the view)
  switchTab((st0 && st0.tab) || 'usage');
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
  var _gmList = el('panelGames');
  if (_gmList) _gmList.addEventListener('click', function (e) {
    var row = e.target.closest ? e.target.closest('.gm-row') : null;
    if (row) openGame(row.getAttribute('data-game'));
  });
  if (el('bjBack')) el('bjBack').addEventListener('click', function () { openGame(null); });

  // room theme: chosen via the map dropdown (persisted); light-theme variant used when it exists
  function currentRoom() { var rs = CUC.rooms || {}; return rs[(vscode.getState() || {}).map || 'cave'] || rs.cave; }
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
    var r = (CUC.rooms || {})[currentMap()];
    n.textContent = (r && r.name) || 'Room';
  }
  function buildRoomGrid() {
    var g = el('roomGrid'); if (!g) return;
    var rooms = CUC.rooms || {}, cur = currentMap(), html = '';
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
    for (var i = 0; i < NPC_KEYS.length; i++) { var k = NPC_KEYS[i], c = (CUC.npcs[k].cat || 'human'); (byCat[c] = byCat[c] || []).push(k); }
    var present = CAT_ORDER.filter(function (c) { return byCat[c] && byCat[c].length; });
    if (!present.length) { wrap.innerHTML = ''; return; }
    var curCat = null; for (var cc = 0; cc < present.length; cc++) { if (byCat[present[cc]].indexOf(cur) >= 0) curCat = present[cc]; }
    if (present.indexOf(amCat) < 0) amCat = curCat || present[0];
    var tabs = present.map(function (c) { return '<button class="am-tab' + (c === amCat ? ' on' : '') + '" data-cat="' + c + '">' + CAT_LABEL[c] + ' ' + byCat[c].length + '</button>'; }).join('');
    var grid = byCat[amCat].map(function (key) {
      var meta = CUC.npcs[key];
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
    if (typeof bj !== 'undefined' && bj.st && curGame() === 'blackjack' && !_bjHold) { var np = bjPending(null); bjDealer(bj.st, np); bjHands(bj.st, np); bjLines(bj.st, true); }
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

  vscode.postMessage({ type: 'ready' });
})();
