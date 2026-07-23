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

  function el(id) { return document.getElementById(id); }
  function setVis(id, on) { var e = el(id); if (e) e.style.display = on ? '' : 'none'; }
  function agoText(ts) { var s = Math.floor((Date.now() - ts) / 1000); if (s < 45) return 'now'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago'; }
  var _burnMsg = '';
  var HEART_SVG = '<svg viewBox="0 0 24 24" fill="#e8895a"><path d="M12 21s-8-5-8-11a4 4 0 018-1 4 4 0 018 1c0 6-8 11-8 11z"/></svg>';
  var WARN_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#e5484d" stroke="#e5484d" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
  var WARN_MID_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.2 22 20H2z" fill="#f5a623" stroke="#f5a623" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 9.5v4.2" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="#fff"/></svg>';
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

    // burn-rate: 3 levels — calm(heart) / mid(amber) / high(red)
    var _mw = el('mwarn');
    if (_mw) {
      var _burnOn = !(d.cfg && d.cfg.burnRate === false); // default on
      var _peak = d.peak, _n = d.count || 0, _avg = d.avg || 0;
      var _pt = _peak ? _peak.total : 0;
      var _ratio = _avg > 0 ? (_pt / _avg) : 0;
      // peak = largest unseen request across all sessions, so a spike isn't buried by another session's reply
      var _level = (!_peak || _n < 4 || _avg <= 0) ? 'calm' : (_ratio >= 2.5 ? 'high' : (_ratio >= 1.5 ? 'mid' : 'calm'));
      if (!_burnOn) {
        _mw.hidden = true; _burnMsg = ''; var _wbx0 = el('warnbar'); if (_wbx0) _wbx0.hidden = true;
      } else {
        _mw.hidden = false;
        if (_level === 'high') { _mw.className = 'mwarn high'; _mw.innerHTML = WARN_SVG; }
        else if (_level === 'mid') { _mw.className = 'mwarn mid'; _mw.innerHTML = WARN_MID_SVG; }
        else { _mw.className = 'mwarn calm'; _mw.innerHTML = HEART_SVG; }
        if (_level === 'calm') { _burnMsg = ''; _mw.title = 'Usage looks normal'; var _wbc = el('warnbar'); if (_wbc) _wbc.hidden = true; }
        else {
          _burnMsg = 'A recent request burned ' + fmtTok(_pt) + ' tokens, ' + _ratio.toFixed(1) + '× your average (' + fmtTok(Math.round(_avg)) + ')' + (_peak && _peak.t ? ' · ' + agoText(_peak.t) : '') + '.';
          _mw.title = _burnMsg;
        }
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
  if (tbtn) tbtn.addEventListener('click', function () {
    var c = !document.body.classList.contains('compact');
    applyCompact(c);
    var s = vscode.getState() || {}; s.compact = c; vscode.setState(s);
  });

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
  function applyNarrow() { document.body.classList.toggle('narrow', document.body.clientWidth < 232); }
  if (window.ResizeObserver) { new ResizeObserver(applyNarrow).observe(document.body); }
  applyNarrow();

  // click the warning bubble to reveal / hide the burn-rate detail banner
  var _mwClick = el('mwarn');
  if (_mwClick) _mwClick.addEventListener('click', function () {
    if (_mwClick.hidden || !_burnMsg) return; // calm: nothing to show
    var wb = el('warnbar'); if (!wb) return;
    if (wb.hidden) {
      var mid = _mwClick.classList.contains('mid');
      wb.className = mid ? 'warnbar mid' : 'warnbar';
      wb.innerHTML = (mid ? WARN_MID_SVG : WARN_SVG) + '<span class="wbmsg">' + _burnMsg + '</span><button class="wbx" title="Dismiss">×</button>';
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
