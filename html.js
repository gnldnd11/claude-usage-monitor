const CSS = require('./styles');
const IC = require('./icons');

// Render the panel webview HTML. All per-webview values (CSP source, asset URIs,
// the serialized asset catalog, and the script URI) are injected via `vars` so this
// stays free of vscode specifics. The static stylesheet and icon set are required
// directly. Extracted from extension.js — markup unchanged.
function renderHtml(vars) {
  const {
    csp, scriptUri, logoUri, crabUri, sparkleUri,
    mascotIdleUri, mascotWorkingUri, mascotDespairUri, mascotStunnedUri,
    roomMinecraftUri, assetsJson
  } = vars;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src ${csp} 'unsafe-inline'; script-src ${csp};">
<style>${CSS}</style></head><body><div class="wrap"><div class="card">
  <div id="authbar" style="display:none;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;margin-bottom:9px;border-radius:8px;background:#e8895a;color:#fff;font-size:11.5px;font-weight:600;line-height:1.35">
    <span>Sign in for <b>live</b> session &amp; weekly %</span>
    <button id="signinBtn" style="background:#fff;color:#c25a34;border:0;border-radius:6px;padding:4px 12px;font-weight:700;cursor:pointer;font-size:11.5px;white-space:nowrap">Sign In</button>
  </div>
  <div class="head">
    <div class="brand">
      <img class="logo" src="${logoUri}" alt=""/>
      <div class="ttl">
        <div class="t1">Claude Usage</div>
        <div class="t2">for Claude Code</div>
      </div>
    </div>
    <div class="hactions">
      <div class="mascot">
        <img src="${crabUri}" alt="claude"/>
        <div class="bubble" id="bubble">${IC.heart}</div>
      </div>
      <img class="sparkle-hd" src="${sparkleUri}" alt=""/>
      <button class="toggle" id="toggle" title="Compact / expand">${IC.chevron}</button>
    </div>
  </div>
  <div class="tabs">
    <button class="tab active" id="tabUsage" data-tab="usage">Usage</button>
    <button class="tab" id="tabAgents" data-tab="agents">Agents<span class="tab-beta">BETA</span></button>
  </div>
  <div class="inner" id="panelUsage">
    <div class="warnbar" id="warnbar" hidden></div>
    <div class="ihead">
      <div class="it">${IC.bars} Usage summary</div>
      <div class="upd">Updated <span id="upd">now</span> <span class="d"></span></div>
    </div>
    <div class="body">
      <div class="meters">
        <div class="meter" id="pm_session">
          <div class="mtop"><span class="mlabel">Session <span class="munit">(5h)</span></span><span class="mgrp"><span class="delta" id="s_delta"></span><span class="mval" id="s_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="s_fill"></div></div>
          <div class="msub" id="s_sub"></div>
        </div>
        <div class="meter" id="pm_weekly">
          <div class="mtop"><span class="mlabel">Weekly <span class="munit">(7d)</span></span><span class="mgrp"><span class="delta" id="w_delta"></span><span class="mval" id="w_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="w_fill"></div></div>
          <div class="msub" id="w_sub"></div>
        </div>
        <div class="meter" id="pm_fable">
          <div class="mtop"><span class="mlabel">Fable <span class="munit">(7d)</span></span><span class="mgrp"><span class="delta" id="f_delta"></span><span class="mval" id="f_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="f_fill"></div></div>
          <div class="msub" id="f_sub"></div>
        </div>
        <div class="meter" id="pm_context">
          <div class="mtop"><span class="mlabel">Context</span><span class="mgrp"><span class="delta" id="c_delta"></span><span class="mval" id="c_pct">–</span></span></div>
          <div class="mbar"><div class="mfill" id="c_fill"></div></div>
          <div class="msub" id="c_sub">/ 200K</div>
        </div>
      </div>
      <div class="ringbox">
        <div class="ringwrap" id="pm_ring">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle class="rtrack" cx="44" cy="44" r="33" fill="none" stroke-width="6"/>
            <circle id="ringArc" cx="44" cy="44" r="33" fill="none" stroke="#e8895a" stroke-width="6"
              stroke-linecap="round" stroke-dasharray="207.3" stroke-dashoffset="207.3"/>
          </svg>
          <div class="rcenter">
            <div class="rpct"><span id="ringPct">–</span><span>%</span></div>
            <div class="rtext">used</div>
          </div>
        </div>
        <div class="mascot-wrap">
          <div class="mwarn" id="mwarn" hidden>${IC.warn}</div>
          <img id="mascot" class="sparkle" src="${mascotIdleUri}" data-idle="${mascotIdleUri}" data-working="${mascotWorkingUri}" data-despair="${mascotDespairUri}" data-stunned="${mascotStunnedUri}" alt=""/>
        </div>
      </div>
    </div>
    <div class="stats" id="pm_tiles">
      <div class="stat"><div class="stop">${IC.clock}</div><div class="srow"><span class="sval" id="st_time">–</span></div><div class="slabel">Active time</div></div>
      <div class="stat" id="st_tok_tile"><div class="stop">${IC.bolt}</div><div class="srow"><span class="sval" id="st_tok">–</span><span class="sdelta" id="tok_delta"></span></div><div class="slabel">Tokens</div></div>
      <div class="stat"><div class="stop">${IC.doc}</div><div class="srow"><span class="sval" id="st_req">–</span><span class="sdelta" id="req_delta"></span></div><div class="slabel">Requests</div></div>
    </div>
  </div>
  <div class="inner agents" id="panelAgents" style="display:none">
    <div class="ws-head">
      <div class="it">${IC.room} <span class="ws-title">Room</span><span class="ws-run" id="wsRun" hidden></span></div>
      <div class="ws-map"><select id="wsMap" title="Room theme"><option value="cave">Blocky Cave</option><option value="backrooms">Backrooms</option><option value="liminal">Liminal Office</option><option value="rootwood">Rootwood Cabin</option><option value="pocketden">Pocket Den</option><option value="office">Corner Office</option><option value="cell">Cell Block</option><option value="neon">Neon Loft</option><option value="coral">Coral Vault</option></select></div>
      <button class="ws-fold" id="wsFold" title="Collapse / expand room">${IC.chevron}</button>
    </div>
    <div class="ws-room" id="wsRoom">
      <img class="ws-bg" id="wsBg" src="${roomMinecraftUri}" alt="Minecraft workspace"/>
      <div class="ws-hud"><span id="wsHudS">5h –</span><span class="ws-hud-sep">·</span><span id="wsHudW">7d –</span></div>
      <div class="ws-hud-delta" id="wsHudDelta"></div>
      <div class="ws-stage" id="wsStage"></div>
    </div>
    <div class="ihead crew-head" style="margin-top:13px">
      <div class="it">${IC.users} Crew</div>
      <div class="upd"><span id="agCount">0</span> agents</div>
      <button class="ws-fold" id="crewFold" title="Collapse / expand crew">${IC.chevron}</button>
    </div>
    <div class="pool" id="pool"></div>
    <div class="crew-mini" id="crewMini"></div>
  </div>
</div></div>
  <div class="sheet" id="settingsSheet" hidden>
    <div class="sheet-card">
      <div class="sheet-head"><span>Settings</span><button class="sheet-x" id="settingsClose" title="Close">${IC.chevron}</button></div>
      <div class="sheet-row">
        <label for="cfgStatusBar">Status bar</label>
        <select id="cfgStatusBar">
          <option value="session+weekly">Session + Weekly</option>
          <option value="session">Session only</option>
          <option value="weekly">Weekly only</option>
          <option value="off">Hidden</option>
        </select>
      </div>
      <div class="sheet-sec">Show in panel</div>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="session" checked> Session (5h)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="weekly" checked> Weekly (7d)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="fable" checked> Fable (7d)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="context" checked> Context</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="ring" checked> Usage ring</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="tiles" checked> Stat tiles</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="mascot" checked> Mascot</label>
      <div class="sheet-sec">Alerts</div>
      <label class="sheet-check"><input type="checkbox" id="cfgBurn" checked> Burn-rate warning</label>
    </div>
  </div>
  <div class="sheet" id="agentModal" hidden>
    <div class="sheet-card">
      <div class="sheet-head"><span id="amTitle">Agent settings</span><button class="sheet-x" id="amClose" title="Close">${IC.chevron}</button></div>
      <div class="sheet-row"><label for="amNick">Nickname</label><input id="amNick" type="text" maxlength="24" placeholder="Name"></div>
      <div class="sheet-row"><label for="amRole">Role</label><input id="amRole" type="text" maxlength="24" placeholder="Role"></div>
      <div class="sheet-row"><label for="amModel">Model</label>
        <select id="amModel"><option value="opus">opus</option><option value="sonnet">sonnet</option><option value="haiku">haiku</option><option value="inherit">inherit</option></select>
      </div>
      <div class="sheet-sec">Appearance</div>
      <div class="am-appearance" id="amAppear"></div>
      <button class="am-hide" id="amHide">Hide</button>
    </div>
  </div>
<div id="cuc-assets" data-json='${assetsJson}' style="display:none"></div>
<script src="${scriptUri}"></script></body></html>`;
}

module.exports = { renderHtml };
