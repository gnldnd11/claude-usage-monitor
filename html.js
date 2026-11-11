const CSS = require('./styles');
const games = require('./games/registry');
const IC = require('./icons');
// The ten sea symbols, once. The slot machine and the scratch card show eighteen squares between
// them and the markup for one symbol is not small, so the drawings go into the page as one hidden
// <symbol> sheet and each square is a <use>. A panel cannot require() this (it runs in the webview),
// which is fine: the <use> markup is a string either side of the wall
const symbols = require('./games/symbols');
// The six die faces plus the unrolled one, once, for the same reason and in the same way: Sic Bo
// shows three dice, Shut the Box two and Hazard two, the faces change every roll, and a cell is
// swapped by rewriting one <use href> rather than by pasting a face. The panels reach these through
// CUC.die() (webview.js), which is the <use> markup on the other side of the wall
const diceFaces = require('./games/dice-faces');

// Render the panel webview HTML. All per-webview values (CSP source, asset URIs, the serialized
// asset catalog, and the script URIs) are injected via `vars` so this stays free of vscode
// specifics. The static stylesheet and icon set are required directly.
//
// The games area is TWO things here and no more: the list, built from the register, and one empty
// stage the open game's panel is built into. A game's own markup lives in games/<id>/panel.js and
// is created the first time that game is opened, so fourteen games cost fourteen list rows, not
// fourteen panels. Nothing in this file names a game.
function renderHtml(vars) {
  const {
    csp, scriptUri, logoUri, crabUri, sparkleUri,
    mascotIdleUri, mascotWorkingUri, mascotDespairUri, mascotStunnedUri,
    roomMinecraftUri, assetsJson, gameList, gameScripts
  } = vars;
  // A row: the picture, the name, the figure's empty slot, and the star.
  //
  // TWO BUTTONS IN A WRAPPER, not one button. The row opens a game and the star keeps it, and a
  // button cannot be nested in a button, so `.gm-row` is the div both sit in: `.gm-open` is the
  // whole row minus the star, `.gm-fav` is the star. The chevron that used to close the row is
  // gone, because it was the same constant on every row and the hover plus the pointer cursor
  // already said it; the star stands in the width it leaves (docs/game-panels.md, section 7-3).
  //
  // The picture is painted art (`thumb`, four games) or a drawn tile (`tile`, the other ten), and
  // the glyph stays under both: an alt="" image that fails to load draws nothing, and the glyph
  // showing through is better than a blank square.
  // `sub` is a second line only where it says something. Twelve rows reading "Min bet 10" is not
  // information, and the same line on two rows out of fourteen is "this one is expensive".
  // `.gm-fig` is left empty for the webview to fill (CUC.rowFig) and `:empty` hides it, so the
  // twelve rows that have no figure also have no gap where one would be.
  // `data-home` is the rows box this game belongs in. The webview MOVES the row into the
  // Favourites block and back, and it has to put it back without guessing from the heading text
  const gameRow = (g, home) => `        <div class="gm-row" data-game="${g.id}" data-home="${home}">
          <button type="button" class="gm-open" data-game="${g.id}"${g.rowTitle ? ` title="${g.rowTitle}"` : ''}>
            <span class="gm-ic">${g.icon}${g.tile || ''}${g.thumb ? `<img src="${g.thumb}" alt=""/>` : ''}</span>
            <span class="gm-txt"><span class="gm-nm">${g.name}</span>${g.sub ? `<span class="gm-sub">${g.sub}</span>` : ''}</span>
            <span class="gm-fig" id="fig-${g.id}"></span>
          </button>
          <button type="button" class="gm-fav" data-fav="${g.id}" aria-pressed="false" aria-label="Favourite ${g.name}" title="Favourite ${g.name}">${IC.star}</button>
        </div>`;
  // The list in blocks, one per `group`, each with its own heading and its own rows box.
  //
  // A block rather than a loose heading because both things that move rows need a container: the
  // heading has to disappear when the favourites have emptied its family (an empty heading is a
  // heading for nothing), and folding it has to hide its rows and keep the heading.
  //
  // The register has already sorted the rows (games/registry.js), so this walks them once and never
  // re-groups: a group that is not contiguous in `order` is an ordering mistake in a meta.js, and it
  // shows up here as a heading printed twice rather than as rows quietly moving somewhere else.
  // The rows boxes are therefore numbered, not named: two blocks may legitimately carry one name
  const gameBlocks = (list) => {
    const blocks = [];
    for (const g of list) {
      const last = blocks[blocks.length - 1];
      if (last && last.group === (g.group || '')) last.rows.push(g);
      else blocks.push({ group: g.group || '', rows: [g] });
    }
    return blocks.map((b, i) => {
      const rid = 'gmRows' + i;
      // A group with no name is not a mistake (games/registry.js lets a game not care), and it has
      // no heading, so there is nothing to fold it by: it just shows its rows
      const head = b.group
        ? `      <button type="button" class="gm-sec gm-fold" aria-expanded="true" aria-controls="${rid}">${IC.chevron}<span>${b.group}</span></button>\n`
        : '';
      return `    <div class="gm-grp" data-grp="${b.group}">\n${head}      <div class="gm-rows" id="${rid}">\n${b.rows.map((g) => gameRow(g, rid)).join('\n')}\n      </div>\n    </div>`;
    }).join('\n');
  };
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src ${csp} 'unsafe-inline'; script-src ${csp};">
<style>${CSS}${games.css()}</style></head><body>${symbols.sprite()}${diceFaces.sprite()}<div class="wrap"><div class="card">
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
    <button class="tab" id="tabAgents" data-tab="agents">Agents</button>
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
          <div class="mtop"><span class="mlabel">Weekly <span class="munit">(7d)</span> <button type="button" class="wk-more" id="wkMore" title="This PC's last 7 days">Details</button></span><span class="mgrp"><span class="delta" id="w_delta"></span><span class="mval" id="w_pct">–</span></span></div>
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
    <div class="gm-grp gm-favs" id="gmFavs" data-grp="" hidden>
      <div class="gm-sec">Favourites</div>
      <div class="gm-rows" id="gmFavRows"></div>
    </div>
${gameBlocks(gameList)}
  </div>
  <div id="gameStage"></div>
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
  <div class="sheet" id="weeklyModal" hidden>
    <div class="sheet-card wk-card">
      <div class="sheet-head"><span>This PC · last 7 days</span><button class="sheet-x" id="wkClose" title="Close">${IC.chevron}</button></div>
      <div id="wkBody"><div class="wk-empty">Reading transcripts…</div></div>
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
<template id="cucCoin">${IC.coin}</template>
<script src="${scriptUri}"></script>
${gameScripts.map((u) => `<script src="${u}"></script>`).join('\n')}
</body></html>`;
}

module.exports = { renderHtml };
