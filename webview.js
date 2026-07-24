(function () {
  const vscode = acquireVsCodeApi();
  const C = 207.3; // ring circumference (2*pi*33)
  var prev = {};        // last numeric values (for tween + delta)
  var lastData = null;  // for the 1s live tick
  var refreshedAt = Date.now();

  function fmtTok(n) {
    n = Math.round(n || 0);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return String(n);
  }
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

  // --- agent roster (M1) -----------------------------------------------------
  // Deterministic: same name -> same species + colour, forever. Species from the
  // name hash, size/bob speed from the model, colour tint from a second hash byte.
  function hashStr(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }
  var PALETTE = ['#e8895a', '#3bbdb9', '#f0a83a', '#9b7ede', '#e57ca8', '#5fb87a', '#5a9ae8', '#e5686a'];
  // top-down silhouettes in a 0..100 box; bodies tint via currentColor, eyes are code-drawn
  var SPECIES = [
    { b: '<ellipse cx="50" cy="55" rx="30" ry="21"/><circle cx="15" cy="42" r="10"/><circle cx="85" cy="42" r="10"/><path d="M22 68 L9 80 M30 73 L20 88 M70 73 L80 88 M78 68 L91 80" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>', ey: 51, eg: 9, er: 7 },
    { b: '<circle cx="50" cy="43" r="27"/><path d="M27 58 q-7 24 -16 26 M41 65 q-4 25 -11 30 M59 65 q4 25 11 30 M73 58 q7 24 16 26" stroke="currentColor" stroke-width="7" fill="none" stroke-linecap="round"/>', ey: 41, eg: 9, er: 7 },
    { b: '<path d="M50 10 L61 39 L93 41 L67 61 L77 92 L50 73 L23 92 L33 61 L7 41 L39 39 Z"/>', ey: 52, eg: 9, er: 7 },
    { b: '<ellipse cx="55" cy="66" rx="34" ry="14"/><circle cx="44" cy="46" r="27"/><circle cx="44" cy="46" r="14" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="5"/><path d="M74 54 l6 -12 M80 58 l10 -8" stroke="currentColor" stroke-width="4" stroke-linecap="round" fill="none"/>', ey: 60, ex: 73, eg: 6, er: 5 },
    { b: '<path d="M60 22 q26 6 26 28 q0 22 -26 28 q-30 -4 -38 -28 q8 -24 38 -28 Z"/><path d="M22 34 L6 22 L11 50 L6 78 L22 66 Z"/>', ey: 44, ex: 56, eg: 9, er: 7 },
    { b: '<path d="M20 48 q0 -34 30 -34 q30 0 30 34 q-15 8 -30 8 q-15 0 -30 -8 Z"/><path d="M30 54 q-3 28 -6 34 M43 58 q-2 30 -4 36 M57 58 q2 30 4 36 M70 54 q3 28 6 34" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>', ey: 38, eg: 9, er: 7 },
    { b: '<path d="M80 30 q-46 -10 -54 24 q-6 27 21 31 q-23 -15 -6 -31 q17 -17 41 -9 Z"/><path d="M80 30 q10 -8 16 -4 M80 30 q12 -1 16 5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>', ey: 44, ex: 42, eg: 8, er: 6 },
    { b: '<g stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"><path d="M50 8 V26 M50 92 V74 M8 50 H26 M92 50 H74 M20 20 L32 32 M80 20 L68 32 M20 80 L32 68 M80 80 L68 68"/></g><circle cx="50" cy="50" r="26"/>', ey: 50, eg: 9, er: 7 }
  ];
  function eyesFor(sp) {
    var cx = sp.ex || 50, ey = sp.ey, g = sp.eg, r = sp.er, pr = r * 0.5;
    function eye(x) {
      return '<circle cx="' + x + '" cy="' + ey + '" r="' + r + '" fill="#fff" stroke="rgba(0,0,0,.22)" stroke-width="1"/>'
        + '<circle cx="' + x + '" cy="' + (ey + r * 0.32) + '" r="' + pr + '" fill="#1b1b1b"/>';
    }
    return eye(cx - g) + eye(cx + g);
  }
  function creatureSVG(name) {
    var h = hashStr(name);
    var sp = SPECIES[h % SPECIES.length];
    var color = PALETTE[(h >> 8) % PALETTE.length];
    return '<svg viewBox="0 0 100 100" style="color:' + color + '"><g fill="currentColor">' + sp.b + '</g>' + eyesFor(sp) + '</svg>';
  }
  // --- NPC sprite pool (Kenmi NPCs) — distinct character per agent, deterministic ---
  var CUC = { npcs: {} };
  try { var _ae = document.getElementById('cuc-assets'); if (_ae) CUC = JSON.parse(_ae.getAttribute('data-json')) || CUC; } catch (e) { /* assets missing → fall back to code-rendered creatures */ }
  var NPC_KEYS = Object.keys(CUC.npcs);
  // per-sprite metadata drives everything (packs differ in cell size & layout).
  // Rendering crops to the measured character bbox [x,y,w,h] (cell px) so every sprite
  // shows at a consistent size regardless of how much padding its sheet cell has.
  var ROSTER_T = 40, ROOM_T = 58, PICKER_T = 40; // target character height (px) per context
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

  function modelScale(m) { m = (m || '').toLowerCase(); if (m.indexOf('opus') >= 0) return 1.14; if (m.indexOf('haiku') >= 0) return 0.8; if (m.indexOf('sonnet') >= 0) return 0.9; return 1; }
  function modelBob(m) { m = (m || '').toLowerCase(); if (m.indexOf('opus') >= 0) return 3.6; if (m.indexOf('haiku') >= 0) return 1.9; if (m.indexOf('sonnet') >= 0) return 2.4; return 2.9; }
  function firstSentence(d) {
    if (!d) return '';
    d = String(d).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
    var m = d.match(/^.*?[.。]/);
    return (m ? m[0] : d).slice(0, 110);
  }
  function renderAgents(agents) {
    var pool = el('pool'); if (!pool) return;
    agents = agents || [];
    var cnt = el('agCount'); if (cnt) cnt.textContent = agents.length;
    buildSheetMap(agents); // collision-free NPC assignment for the whole roster
    var sig = agents.map(function (a) { return a.name + ':' + a.model + ':' + displayName(a.name) + ':' + displayRole(a.name) + ':' + SHEET_MAP[a.name]; }).join('|');
    if (pool._sig === sig) return; // roster unchanged — don't rebuild (keeps animations)
    pool._sig = sig;
    if (!agents.length) { pool.innerHTML = '<div class="pool-empty">No agent definitions found.<br>Add <b>.claude/agents/*.md</b> to see them here.</div>'; return; }
    var html = '';
    for (var i = 0; i < agents.length; i++) {
      var a = agents[i];
      var desc = firstSentence(a.description);
      var sheet = agentSheet(a.name);
      var inner = sheet ? '<div class="cr-sprite" style="' + cropStyle(sheet.meta, sheet.meta.idleRow || 0, sheet.meta.idleCol || 0, ROSTER_T) + '"></div>' : creatureSVG(a.name);
      var nick = displayName(a.name), role = displayRole(a.name);
      html += '<div class="cr-card" data-agent="' + esc(a.name) + '" title="' + esc(a.name) + ' · ' + esc(a.model) + (desc ? ' — ' + esc(desc) : '') + '">'
        + '<button class="cr-gear" title="설정">' + GEAR_SVG + '</button>'
        + '<div class="cr-badge"></div>'
        + '<div class="cr-body">' + inner + '</div>'
        + '<div class="cr-name">' + esc(nick) + '</div>'
        + '<div class="cr-role">' + esc(role) + '</div></div>';
    }
    pool.innerHTML = html;
    if (selectedAgent) { var sc = pool.querySelector('.cr-card[data-agent="' + selectedAgent + '"]'); if (sc) sc.classList.add('selected'); } // survive rebuilds
  }
  // Overlay live state onto the existing cards (no rebuild → animations survive).
  function applyAgentStates(activity) {
    var pool = el('pool'); if (!pool) return;
    activity = activity || {};
    var anyActive = false;
    var cards = pool.querySelectorAll('.cr-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i], name = card.getAttribute('data-agent');
      var st = activity[name];
      var state = st ? st.state : 'idle';
      card.classList.toggle('active', state === 'active');
      card.classList.toggle('done', state === 'done');
      if (state === 'active') anyActive = true;
      var badge = card.querySelector('.cr-badge');
      if (badge) badge.textContent = state === 'active' ? '호출됨' : (state === 'done' ? '완료' : '');
    }
    pool.classList.toggle('has-active', anyActive);
  }

  // --- room walker engine: only working agents enter the room, walk to the desk,
  // work, then leave. Sprite frames cycle in a steady loop independent of pushes. ---
  var SPOT_ENTRY = { x: 0.26, y: 0.80 };
  var SPOT_DESK = { x: 0.50, y: 0.735 };
  var TRAVEL_MS = 1650;
  var walkers = {}; // agentName -> { root, sprite, meta, mode, leaving, targetKey, _t }
  var selectedAgent = null; // roster: single selected agent (character-select style)

  function placeAt(wk, x, y) {
    wk.root.style.left = (x * 100) + '%';
    wk.root.style.top = (y * 100) + '%';
    wk.root.style.zIndex = String(Math.round(y * 100));
    wk.x = x; wk.y = y;
  }
  function ensureWalker(name, stage) {
    if (walkers[name]) return walkers[name];
    var sheet = agentSheet(name); if (!sheet) return null;
    var root = document.createElement('div'); root.className = 'walker'; root.style.opacity = '0';
    var sp = document.createElement('div'); sp.className = 'wk-sprite';
    var m = sheet.meta; sp.style.cssText = cropStyle(m, m.idleRow || 0, m.idleCol || 0, ROOM_T);
    var roleTag = document.createElement('div'); roleTag.className = 'wk-role'; roleTag.textContent = shortName(displayRole(name)); // job above
    var nameTag = document.createElement('div'); nameTag.className = 'wk-name'; nameTag.textContent = shortName(displayName(name)); // name below
    root.appendChild(roleTag); root.appendChild(sp); root.appendChild(nameTag); stage.appendChild(root);
    var wk = { root: root, sprite: sp, roleTag: roleTag, nameTag: nameTag, meta: sheet.meta, mode: 'walking', leaving: false, targetKey: '' };
    walkers[name] = wk;
    placeAt(wk, SPOT_ENTRY.x, SPOT_ENTRY.y); // spawn at the doorway
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
  function leaveWalker(name) {
    var wk = walkers[name]; if (!wk || wk.leaving) return;
    wk.leaving = true; wk.targetKey = 'exit'; wk.mode = 'walking';
    requestAnimationFrame(function () { placeAt(wk, SPOT_ENTRY.x, SPOT_ENTRY.y); });
    clearTimeout(wk._t);
    wk._t = setTimeout(function () {
      wk.root.style.opacity = '0';
      setTimeout(function () { if (wk.root.parentNode) wk.root.parentNode.removeChild(wk.root); delete walkers[name]; }, 450);
    }, TRAVEL_MS);
  }
  function updateRoom(activity) {
    var stage = el('wsStage'); if (!stage) return;
    activity = activity || {};
    var present = [];
    for (var nm in activity) { var s = activity[nm]; if (s && (s.state === 'active' || s.state === 'done')) present.push(nm); }
    for (var n in walkers) { if (present.indexOf(n) < 0) leaveWalker(n); }
    for (var i = 0; i < present.length; i++) {
      var name = present[i];
      var wk = ensureWalker(name, stage); if (!wk || wk.leaving) continue;
      if (wk.roleTag) wk.roleTag.textContent = shortName(displayRole(name)); // reflect live edits
      if (wk.nameTag) wk.nameTag.textContent = shortName(displayName(name));
      var off = (i - (present.length - 1) / 2) * 0.11; // fan out if several are working
      goTo(wk, SPOT_DESK.x + off, SPOT_DESK.y, 'desk' + off.toFixed(2), (function (w) { return function () { w.mode = 'working'; }; })(wk));
    }
  }
  // steady sprite-frame loop (idle slow, walking faster), independent of data pushes
  setInterval(function () {
    for (var name in walkers) {
      var wk = walkers[name], m = wk.meta;
      var fp = framePos(m, wk.mode !== 'working');
      wk.sprite.style.backgroundPosition = frameBg(m, fp.row, fp.col, spriteScale(m, ROOM_T));
    }
  }, 60);
  function switchTab(t) {
    var agents = t === 'agents';
    var u = el('panelUsage'), g = el('panelAgents');
    if (u) u.style.display = agents ? 'none' : '';
    if (g) g.style.display = agents ? '' : 'none';
    var au = el('tabUsage'), ag = el('tabAgents');
    if (au) au.classList.toggle('active', !agents);
    if (ag) ag.classList.toggle('active', agents);
    var s = vscode.getState() || {}; s.tab = t; vscode.setState(s);
    if (typeof updateToggleChevron === 'function') updateToggleChevron();
  }

  function el(id) { return document.getElementById(id); }
  function setVis(id, on) { var e = el(id); if (e) e.style.display = on ? '' : 'none'; }
  function agoText(ts) { var s = Math.floor((Date.now() - ts) / 1000); if (s < 45) return 'now'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago'; }
  var _burnMsg = '';
  var _burnPrompt = '';
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var HEART_SVG = '<svg viewBox="0 0 24 24" fill="#e8895a"><path d="M12 21s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z"/></svg>';
  var WARN_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#e5484d" stroke="#e5484d" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>';
  var WARN_MID_SVG ='<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#f5a623" stroke="#f5a623" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
  function applyPanelVis(hid) {
    setVis('pm_session', hid.indexOf('session') < 0);
    setVis('pm_weekly', hid.indexOf('weekly') < 0);
    setVis('pm_context', hid.indexOf('context') < 0);
    setVis('pm_ring', hid.indexOf('ring') < 0);
    setVis('pm_tiles', hid.indexOf('tiles') < 0);
    setVis('mascot', hid.indexOf('mascot') < 0);
  }
  function setBar(id, p) { var e = el(id); if (e) { e.style.width = Math.min(p, 100) + '%'; e.style.background = grad(p); } }

  // count-up tween: from → to over 500ms
  function tween(id, from, to, fmt) {
    var e = el(id); if (!e) return;
    if (from == null || from === to) { e.textContent = fmt(to); return; }
    var dur = 500, t0 = null;
    function step(ts) {
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
    updateRoom(d.agentActivity);
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
    if (prev.tok != null && out > prev.tok) { roll('st_tok'); flash('tok_delta', '+' + fmtTok(out - prev.tok)); }
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

    if (el('upd')) { var _ua = d.usageAt || 0; el('upd').textContent = _ua ? agoText(_ua) : (d.usageLoading ? 'loading' : '—'); }

    // burn-rate: only 2 levels shown — mid(amber) / high(red). calm = no bubble at all.
    var _mw = el('mwarn');
    if (_mw) {
      var _burnOn = !(d.cfg && d.cfg.burnRate === false); // default on
      var _peak = d.peak, _n = d.count || 0, _avg = d.avg || 0;
      var _pt = _peak ? _peak.total : 0;
      var _ratio = _avg > 0 ? (_pt / _avg) : 0;
      // peak = largest unseen request across all sessions, so a spike isn't buried by another session's reply
      var _level = (!_peak || _n < 4 || _avg <= 0) ? 'calm' : (_ratio >= 2.5 ? 'high' : (_ratio >= 1.5 ? 'mid' : 'calm'));
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

  window.addEventListener('message', function (e) {
    var m = e.data; if (!m) return;
    if (m.type === 'data') render(m.data);
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
  var _tu = el('tabUsage'), _ta = el('tabAgents');
  if (_tu) _tu.addEventListener('click', function () { switchTab('usage'); });
  if (_ta) _ta.addEventListener('click', function () { switchTab('agents'); });

  // room background follows the VS Code theme (light theme -> light room), updated live
  function applyRoom() {
    if (!CUC.rooms) return;
    var img = el('wsBg'); if (!img) return;
    var src = document.body.classList.contains('vscode-light') ? CUC.rooms.light : CUC.rooms.dark;
    if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
  }
  applyRoom();
  if (window.MutationObserver) new MutationObserver(applyRoom).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  // collapse / expand the roster — driven by the top-right chevron on the Agents tab
  function applyRoster(collapsed) {
    var p = el('pool'); if (p) p.style.display = collapsed ? 'none' : '';
  }
  applyRoster(!!(vscode.getState() || {}).rosterCollapsed);
  updateToggleChevron();

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
    if (el('amModel')) el('amModel').value = currentModel(name);
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
  }
  var _rzt;
  if (window.ResizeObserver) { new ResizeObserver(function () { clearTimeout(_rzt); _rzt = setTimeout(applyResponsive, 160); }).observe(document.body); }
  applyResponsive();

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
