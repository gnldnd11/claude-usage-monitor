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
        <button type="button" class="t2 cc" id="hdCredits" aria-pressed="false" title="Credits">${IC.coin}<span class="cc-bal" id="ccBal">–</span><span class="cc-unit">credits</span></button>
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
      <button class="ws-map" id="wsMap" title="Pick a room"><span id="wsMapName">Blocky Cave</span>${IC.chevron}</button>
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
  <div class="inner bj-games" id="panelGames" style="display:none">
    <div class="ihead"><div class="it gm-it">${IC.coin} Games</div></div>
    <button type="button" class="gm-row" data-game="blackjack">
      <span class="gm-ic">${IC.cards}</span>
      <span class="gm-txt"><span class="gm-nm">Blackjack</span><span class="gm-sub">Min bet 10</span></span>
      <span class="gm-go">${IC.chevron}</span>
    </button>
    <button type="button" class="gm-row" data-game="hilo">
      <span class="gm-ic">${IC.updown}</span>
      <span class="gm-txt"><span class="gm-nm">High-Low</span><span class="gm-sub">Min bet 10</span></span>
      <span class="gm-go">${IC.chevron}</span>
    </button>
  </div>
  <div class="inner bj" id="panelTable" style="display:none">
    <div class="ihead bj-head">
      <button type="button" class="bj-back" id="bjBack" title="All games">${IC.chevron}</button>
      <div class="it" title="6 decks · Dealer stands on soft 17 · Blackjack pays 3:2">${IC.cards} Blackjack</div>
      <div class="bj-side" id="bjSide"></div><!-- stage 2: the Challenge button goes here -->
    </div>
    <div class="bj-felt">
      <div class="bj-row bj-dealer">
        <div class="bj-who">
          <div class="bj-crab"><img id="bjCrab" src="${crabUri}" alt=""/></div>
        </div>
        <div class="bj-hand"><div class="bj-line" id="bjDTot"></div><div class="bj-fan" id="bjDFan" role="img" aria-label="Dealer"></div></div>
      </div>
      <div class="bj-rule"></div>
      <div id="bjHands"></div>
      <div class="bj-net" id="bjNet" hidden></div>
    </div>
    <div class="bj-sr" id="bjLive" aria-live="polite"></div>
    <div class="bj-note" id="bjNote" hidden></div>
    <div class="warnbar" id="bjErr" hidden></div>
    <div class="bj-ctl" id="bjBet">
      <div class="bj-stakes" id="bjStakes" role="group" aria-label="Bet"><button type="button" data-v="10">10</button><button type="button" data-v="100">100</button><button type="button" data-v="1000" aria-label="1,000">1K</button></div>
      <button type="button" class="bj-btn primary" id="bjDeal" title="Deal (Enter)">Deal</button>
    </div>
    <div class="bj-ctl" id="bjPlay" hidden>
      <button type="button" class="bj-btn" data-op="hit" title="Hit (H)">Hit</button>
      <button type="button" class="bj-btn" data-op="stand" title="Stand (S)">Stand</button>
      <button type="button" class="bj-btn" data-op="double" title="Double (D)">Double</button>
      <button type="button" class="bj-btn" data-op="split" title="Split (P)">Split</button>
    </div>
    <template id="bjCoin">${IC.coin}</template>
  </div>
  <div class="inner hl" id="panelHiLo" style="display:none">
    <div class="ihead bj-head">
      <button type="button" class="bj-back" id="hlBack" title="All games">${IC.chevron}</button>
      <div class="it" title="Payouts follow the cards left in the shoe · Aces are high · A tie carries the pot">${IC.updown} High-Low</div>
      <div class="bj-side" id="hlSide"></div>
    </div>
    <div class="bj-felt">
      <div class="hl-stage">
        <div class="bj-crab"><img src="${crabUri}" alt=""/></div>
        <div class="hl-cards"><div class="hl-prev" id="hlPrev" aria-hidden="true"></div><div class="hl-card" id="hlCard" role="img" aria-label="No card"></div></div>
      </div>
      <div class="hl-line" id="hlLine"></div>
    </div>
    <div class="bj-sr" id="hlLive" aria-live="polite"></div>
    <div class="bj-note" id="hlNote" hidden></div>
    <div class="warnbar" id="hlErr" hidden></div>
    <div class="bj-ctl" id="hlBet">
      <div class="bj-stakes" id="hlStakes" role="group" aria-label="Bet"><button type="button" data-v="10">10</button><button type="button" data-v="100">100</button><button type="button" data-v="1000" aria-label="1,000">1K</button></div>
      <button type="button" class="bj-btn primary" id="hlDeal" title="Deal (Enter)">Deal</button>
    </div>
    <div class="bj-ctl" id="hlPlay" hidden>
      <button type="button" class="bj-btn hl-guess" data-op="higher" title="Higher (up arrow)"><span>Higher</span><b id="hlUp">—</b></button>
      <button type="button" class="bj-btn hl-guess" data-op="lower" title="Lower (down arrow)"><span>Lower</span><b id="hlDn">—</b></button>
      <button type="button" class="bj-btn hl-cash" data-op="cashout" title="Cash out (C)">Cash out <b id="hlCashAmt">0</b></button>
    </div>
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
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="credits" checked> Credits</label>
      <div class="sheet-sec">Alerts</div>
      <label class="sheet-check"><input type="checkbox" id="cfgBurn" checked> Burn-rate warning</label>
    </div>
  </div>
  <div class="sheet" id="roomSheet" hidden>
    <div class="sheet-card sheet-wide">
      <div class="sheet-head"><span>Room</span><button class="sheet-x" id="roomClose" title="Close">${IC.chevron}</button></div>
      <div class="room-grid" id="roomGrid"></div>
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
