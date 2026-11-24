const CSS = require('./styles');
const games = require('./games/registry');
const IC = require('./icons');
// The ten sea symbols, once. The slot machine shows nine squares and the markup for one symbol is
// not small, so the drawings go into the page as one hidden <symbol> sheet and each square is a
// <use>. A panel cannot require() this (it runs in the webview), which is fine: the <use> markup is
// a string either side of the wall
const symbols = require('./games/symbols');

// WHAT THE DARK THEMES DO TO THE MASCOT, and the one thing CSS can do about it.
//
// The six drawings are the user's own pixel art and are not touched by this repository. Three of
// them carry ink that is all but black: mascot-coding's keystrokes (rgb(15..25) at full alpha, and
// the laptop under them), mascot-despair's stress puffs and speed lines, mascot-float's bubbles.
// On the light card (#ffffff) that ink measures 18.6:1 and reads. On the dark card (#232326) it
// measures 1.21:1, on --inner 1.08:1 and on the high-contrast black 1.18:1, which is not "hard to
// see": it is the same colour as the floor. The crab itself is bright and was never the problem,
// so what is needed is a light edge around the DARK ink and nothing else, on the drawings that
// need it and no others (INK_LIFT below).
//
// mascot-stunned is NOT one of them, although a count of dim marks says it is. Its two specks are
// drawn at alpha 33..61, and a mark that measures 1.97:1 on WHITE was drawn to be faint rather
// than hidden by the theme. test/apng.js's `marks` leaves marks like it out for that reason.
//
// WHY A FILTER AND NOT A COLOUR. Nothing in CSS recolours part of an image. brightness() is a
// multiply, so rgb(20) goes to rgb(36) and stays invisible; a lighter plate behind the mascot would
// have to reach about rgb(96) before near-black cleared 3:1 on it, which is a grey rectangle in the
// middle of a dark panel. A drop-shadow glow does work, but it haloes the whole silhouette: the
// crab, which already reads at 11-17:1, gets the same treatment as the keystrokes.
//
// WHAT THIS DOES, in six primitives: take the luminance, keep only the part of it that is nearly
// black AND inside the drawing, grow that by a pixel, fill it with the stylesheet's grey, and put
// it UNDER the drawing. Under is what makes it selective without any per-drawing tuning: a dark
// mark surrounded by transparency shows its new edge, and a dark mark surrounded by opaque crab
// (the eyes) has that edge covered by the crab. Measured against the unfiltered render: every
// pixel that changes is a background pixel and not one pixel of the art is altered, so this is not
// the smearing the stylesheet warns about on .sparkle.beat.
//
// The colour is NOT here. styles.js sets flood-color on #cucInkFlood from --muted, because it is a
// theme colour and every other one in this product lives in that file. That same file also hides
// this element, and NOT with display:none: a filter inside a display:none subtree still resolves,
// but its flood-color comes out as the initial black and the edge disappears into the floor.
//
// AND IT IS AIMED, which it was not at first. The first version put this on .sparkle, .sh-pic and
// #shArt, so all six drawings got it. Three of them did not need it and were made worse by it: an
// edge grows wherever near-black ink meets transparency, and five of the six are drawn with a black
// outline, so a drawing that read perfectly well came back as a sticker. In the shop's 36px cells
// mascot-idle was the clearest case. The rule now follows the MEASUREMENT and not the element: at
// or above 3:1 on the dark card, a drawing is left alone. Full stop, no exceptions.
//
// BELOW 3:1 THE ANSWER IS USUALLY YES AND SOMETIMES NO, so the ones that measure badly are listed
// either way and never by silence. The filter cannot aim itself: it edges every near-black mark,
// and the marks that are BROKEN are only some of them. Measured, as a share of the pixels the edge
// actually adds to the 88x74 drawing:
//
//   coding   57% of the new edge lands on the marks that were under 3:1 (the keystrokes and the
//            laptop). They are also what the picture is OF, and the coral body is not outlined at
//            all because its own silhouette edge is coral and not black. Lifted.
//   despair  32%. The other two thirds outline a desk that reads fine, and at 62.3x74 (the
//            smallest-drawn of the six) that perimeter becomes the brightest continuous shape in
//            the picture, over the white paper stacks that are its subject. What is bought for it
//            is the stress puffs, a mood accent on a scene that already reads from its fills.
//   float    12%. Seven eighths of the edge outlines an astronaut that reads at 15.4:1, to rescue
//            two bubbles 2.75px across, on the one drawing the shop SELLS and shows at 88x74.
//
// So a drawing is lifted when the lift is mostly spent on what is broken. Both figures are from
// tools the repository keeps: test/apng.js measures the marks, and the share was measured off the
// rendered page. Reverting either decision is one word in the lists below.
//
// 2026-11-20, two more drawings, measured the same way and landing on opposite sides of it:
//
//   sleep      5.79:1 at its dimmest mark, 15.62:1 over the bed and the crab. It clears the floor
//              and so it is left alone, full stop, by the rule above.
//   blackhole  1.49:1 at its dimmest, and 5.4% of its ink is under 3:1. Declined, below.
const INK_LIFT = ['coding'];
// ...and the ones that measure under 3:1 and are deliberately left alone, with the reason, so that
// test/panel-css.test.js can tell a decision from an oversight. A drawing under 3:1 that is in
// neither list fails there.
const INK_LIFT_DECLINED = {
  // 2026-11-24, both desk drawings replaced by the user. Measured again rather than carried over,
  // because the figures in here are only worth having if they came off the files that shipped.
  // Both are the same construction as the six before them: pixel art with a black line round it,
  // on a desk, so what the dark card swallows is outline rather than anything the picture says.
  // working is the least dim of the eight: 4 of its 12 marks fall under 3:1 and they carry 0.2% of
  // its ink, against coding's 1.8%, which is the one that is lifted. The rest of it reads to
  // 15.66:1. Rimming the whole crab, the desk, the lamp and the chair to rescue a fiftieth of a
  // percent is the sticker the paragraph above is about.
  working: '4 of 12 marks and 0.2% of the ink, the least of the eight; the rest reads to 15.66:1',
  despair: '18 of 27 marks but 1.0% of the ink; the crab and the desk under them read to 15.52:1',
  float: 'only 12%; the rest outlines an astronaut at 15.4:1 to rescue two 2.75px bubbles',
  // 39% of the edge, which is between despair's 32% and coding's 57%, so the share alone does not
  // settle it and the drawing does. This is the only one of the eight that is LIT rather than
  // outlined: the other seven are pixel art with a black line round them, and this is a purple
  // glow on darkness, which is what a dark theme is. The 61% would put a grey rim around the
  // spiral and around all 154 sparks, which is the sticker the paragraph above is about, at its
  // worst. What it would buy is the 5.4% of the ink that is under 3:1, and that is the dimmest of
  // the sparks: the crab reads at 15.26:1 and the spiral at 3.43 to 4.42, so the picture's whole
  // sentence survives without them. The hole itself measures about 1:1 on the dark card, which is
  // the drawing working rather than failing: a black hole that is a hole in the panel.
  blackhole: '39% of the edge, and the 61% would rim a glow that is 3.4-15:1 already; what it saves is 5.4% of spark'
};
const inkEdgeFilter = `<svg class="cuc-fx" aria-hidden="true" width="0" height="0"><filter id="cucInkEdge" color-interpolation-filters="sRGB" x="-20%" y="-20%" width="140%" height="140%"><feColorMatrix type="luminanceToAlpha" result="lum"/><feComponentTransfer in="lum" result="darkness"><feFuncA type="table" tableValues="1 1 1 0 0 0 0 0 0"/></feComponentTransfer><feComposite in="darkness" in2="SourceGraphic" operator="in" result="darkInk"/><feMorphology in="darkInk" operator="dilate" radius="1" result="grown"/><feFlood id="cucInkFlood" result="tint"/><feComposite in="tint" in2="grown" operator="in" result="edge"/><feMerge><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge></filter></svg>`;

// Render the panel webview HTML. All per-webview values (CSP source, asset URIs, the serialized
// asset catalog, and the script URIs) are injected via `vars` so this stays free of vscode
// specifics. The static stylesheet and icon set are required directly.
//
// The games area is TWO things here and no more: the list, built from the register, and one empty
// stage the open game's panel is built into. A game's own markup lives in games/<id>/panel.js and
// is created the first time that game is opened, so five games cost five list rows, not five
// panels. Nothing in this file names a game.
function renderHtml(vars) {
  // No logo and no second crab: the header is a row of controls now (see .head below), so the two
  // pictures it used to carry have no element to go in. logo.png and sparkle.png stay in the
  // package: the drawings are being redone and the header may want one of them again
  const {
    csp, scriptUri, crabUri,
    mascotIdleUri, mascotWorkingUri, mascotDespairUri, mascotStunnedUri,
    mascotCodingUri, mascotFloatUri, mascotSleepUri, mascotBlackholeUri,
    heroGamesUri, heroShopUri,
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
  // The picture is painted art (`thumb`, two games) or a drawn tile (`tile`, the other three), and
  // the glyph stays under both: an alt="" image that fails to load draws nothing, and the glyph
  // showing through is better than a blank square.
  // `sub` is a second line only where it says something. Five rows reading "Min bet 10" is not
  // information, and the same line on two rows out of five is "this one is expensive".
  // `.gm-fig` is left empty for the webview to fill (CUC.rowFig) and `:empty` hides it, so the
  // rows that have no figure also have no gap where one would be.
  // `data-home` is the rows box this game belongs in. The webview MOVES the row into the
  // Favourites box and back, and it has to put it back without reading anything off the screen
  const gameRow = (g, home) => `      <div class="gm-row" data-game="${g.id}" data-home="${home}">
        <button type="button" class="gm-open" data-game="${g.id}"${g.rowTitle ? ` title="${g.rowTitle}"` : ''}>
          <span class="gm-ic">${g.icon}${g.tile || ''}${g.thumb ? `<img src="${g.thumb}" alt=""/>` : ''}</span>
          <span class="gm-txt"><span class="gm-nm">${g.name}</span>${g.sub ? `<span class="gm-sub">${g.sub}</span>` : ''}</span>
          <span class="gm-fig" id="fig-${g.id}"></span>
        </button>
        <button type="button" class="gm-fav" data-fav="${g.id}" aria-pressed="false" aria-label="Favourite ${g.name}" title="Favourite ${g.name}">${IC.star}</button>
      </div>`;
  // ONE FLAT LIST, and the only reason there are two boxes is that a starred row moves to the top.
  //
  // The headings went in 1.28.0 (docs/game-panels.md, section 7-2). Five rows whose names and
  // pictures are all different do not need `Machines` to say that Slots is a machine, `What you
  // keep` was a heading over a single row and therefore a label rather than a family, and the one
  // figure on the right reads as a figure precisely because every other row is identically shaped:
  // with the headings there were eight blocks of text to scan, and without them there are five rows
  // the same and one thing that is not.
  // Folding went with them, since five rows are all on screen at once, and so did the stored state
  // that remembered which families were shut.
  const gameRows = (list) => list.map((g) => gameRow(g, 'gmRows')).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${csp} data:; style-src ${csp} 'unsafe-inline'; script-src ${csp};">
<style>${CSS}${games.css()}</style></head><body>${symbols.sprite()}${inkEdgeFilter}<div class="wrap"><div class="card">
  <div id="authbar" style="display:none;align-items:center;justify-content:space-between;gap:8px;padding:8px 11px;margin-bottom:9px;border-radius:8px;background:#e8895a;color:#fff;font-size:11px;font-weight:600;line-height:1.35">
    <span>Sign in for <b>live</b> session &amp; weekly %</span>
    <button id="signinBtn" style="background:#fff;color:#c25a34;border:0;border-radius:6px;padding:4px 12px;font-weight:700;cursor:pointer;font-size:11px;white-space:nowrap">Sign In</button>
  </div>
  <!-- THE HEADER IS A ROW OF CONTROLS, not a nameplate.
       It used to open with a logo and "Claude Usage" at 16px/700, the largest text on the screen,
       directly under the VS Code view header that already says Claude Usage: the same words twice,
       and the panel's copy was the first thing to be cut off at a 250px sidebar. What is left here
       is the three things that are not the product's name: the crab, the way into the games, and
       the fold. The product's name is the activity-bar icon's job and the view header's.
       The crab leads, and that is also the fix for its jumping: it used to sit on the right, where
       a chevron appears on one tab and not on another, so switching tabs moved it 30px. On the
       left nothing that comes and goes can push it (docs/header-fold-spec.md, 2-2 and 3-3). -->
  <div class="head">
    <div class="brand">
      <div class="mascot">
        <img src="${crabUri}" alt="claude"/>
        <div class="bubble" id="bubble">${IC.heart}</div>
      </div>
      <div class="ttl">
        <button type="button" class="t2 cc" id="hdCredits" aria-pressed="false" title="Credits">${IC.coin}<span class="cc-bal" id="ccBal">–</span><span class="cc-unit">credits</span></button>
      </div>
    </div>
    <div class="hactions">
      <button class="toggle" id="toggle" title="Compact / expand">${IC.chevron}</button>
    </div>
  </div>
  <div class="tabs">
    <button class="tab active" id="tabUsage" data-tab="usage">Usage</button>
    <button class="tab" id="tabAgents" data-tab="agents">Agents</button>
  </div>
  <div class="inner" id="panelUsage">
    <div class="warnbar" id="warnbar" hidden></div>
    <!-- EMPTY MOST OF THE TIME, and it takes no space while it is (styles.js, #uhead).
         The section title that used to be here said "Usage summary" directly under the tab called
         Usage: the name of the thing you are already looking at, with no judgement in it. What is
         left is the freshness line, and it has nothing to report while the usage endpoint is
         answering: it appears for the two states worth a row, the first call still out and an
         answer that has gone old. It said "Updated now" the rest of the time, which was not even
         true (webview.js, renderFreshness). The .ihead class stays, because the Agents tab's two
         headers and the casino's are the same class and are not part of this. -->
    <div class="ihead" id="uhead">
      <div class="upd"><span class="d"></span><span id="upd"></span></div>
    </div>
    <div class="body">
      <!-- THREE bars, not four. The session had one here AND the ring beside it, both fed by
           d.fh.used_percentage, so the biggest block on the screen was a second drawing of the bar
           above it. The ring is the session's one showing now; what the bar still owned, the time
           left in the window, moved under the ring (#s_sub). -->
      <div class="meters">
        <div class="meter" id="pm_weekly">
          <div class="mtop"><span class="mlabel">Weekly <span class="munit">(7d)</span> <button type="button" class="wk-more" id="wkMore" title="This PC's use this week">Details</button></span><span class="mgrp"><span class="delta" id="w_delta"></span><span class="mval" id="w_pct">–</span></span></div>
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
        <!-- #pm_ring is the ring AND the window's time left, because they are one reading: the
             settings checkbox that hides the session has to take both or it leaves a bare
             countdown with nothing to count against -->
        <div class="ringside" id="pm_ring">
          <div class="ringwrap">
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
          <div class="rleft" id="s_sub"></div>
        </div>
        <!-- The box is a FIXED height and the picture is bottom-aligned inside it. The APNGs are
             every ratio from 0.84 to 1.78, so a width with height:auto rendered them 49.5 to 104.5
             tall: every state change shoved the stat tiles below down or up, and a session reset
             (90%+ to single digits) did it in one 55px jump.
             EIGHT DRAWINGS, ONE AXIS OF FIVE RUNGS, AND ONE POOL. How hard the machine is being
             worked right now picks the rung (drive.js), the rungs are the shop's five scenes
             exactly, and the reader's own choice picks the picture a rung draws; with nothing
             chosen a rung draws its scene's free drawing (webview.js, MASCOT_ART).
             The eighth belongs to no rung at all: it is in the pool, and it covers whatever is
             there for four seconds now and then (webview.js, the cameo). All eight are named here
             so the script only ever swaps the source for one of them.
             data-lift is beside them because it is a fact ABOUT those files: which of them carry
             ink the dark floor swallows (see INK_LIFT at the top). It is read by whatever draws one
             of these pictures, in all three places they appear, so the stylesheet never learns a
             drawing's name and a redrawn mascot is one word here rather than nine selectors.
             test/panel-css.test.js recomputes this list from the PNGs and fails BOTH ways, so a
             drawing that stops needing the lift fails here just as loudly as one that starts. -->
        <div class="mascot-wrap" id="pm_mascot">
          <div class="mwarn" id="mwarn" hidden>${IC.warn}</div>
          <img id="mascot" class="sparkle" src="${mascotIdleUri}" data-idle="${mascotIdleUri}" data-working="${mascotWorkingUri}" data-despair="${mascotDespairUri}" data-stunned="${mascotStunnedUri}" data-coding="${mascotCodingUri}" data-float="${mascotFloatUri}" data-sleep="${mascotSleepUri}" data-blackhole="${mascotBlackholeUri}" data-lift="${INK_LIFT.join(' ')}" alt=""/>
        </div>
      </div>
    </div>
    <div class="stats" id="pm_tiles">
      <!-- The label has an id because the tile answers one of two questions: the five-hour
           window's elapsed part where there is a window, and today's first-to-last span where
           there is not. A tile that changed its number without changing its name would be the
           panel quietly relabelling itself (webview.js, activeToday) -->
      <div class="stat"><div class="stop">${IC.clock}</div><div class="srow"><span class="sval" id="st_time">–</span></div><div class="slabel" id="st_time_lab">Active time</div></div>
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
      <!-- Why an empty room is not allowed to be the whole message: three different situations
           drew the same nothing (nobody invoked, still running, ran but matched no open folder),
           and the third one is indistinguishable from a quiet afternoon. Built by webview.js
           (renderScopeNote) and hidden whenever there is nothing to say. -->
      <div class="ws-note" id="wsNote" hidden></div>
    </div>
    <!-- Calls sitting on "?" with nothing written back. Outside the Crew fold on purpose: it is
         the one thing on this tab a user may need to act on, and the fold would hide it. Built by
         webview.js (renderWaiting) and empty whenever nothing is waiting. -->
    <div class="wait-box" id="waitBox" hidden></div>
    <div class="ihead crew-head" style="margin-top:13px">
      <div class="it">${IC.users} Crew</div>
      <div class="upd"><span id="agCount">0</span> agents</div>
      <button class="ws-fold" id="crewFold" title="Collapse / expand crew">${IC.chevron}</button>
    </div>
    <div class="pool" id="pool"></div>
    <div class="crew-mini" id="crewMini"></div>
  </div>
  <!-- THE CROSSROADS: the coin button opens two doors, and this screen answers one question.
       Which way. So there is nothing on it but the two doors and their names: no heading (the way
       in is the button directly above it), no arrow (there is no step back from here that the coin
       does not already take) and NO NUMBERS AT ALL, because the balance is in that same button.
       The pictures are the point and the words under them are the caption: the shop's awning and
       the dealer's felt say which door is which before either label is read.
       Each drawing is fitted into a box of its own rather than stretched across its column, which
       is what stands them at one height with air around them instead of wall to wall
       (styles.js, .cr-art; docs/shop-spec.md, section 2-2).
       Neither picture is given image-rendering:pixelated, and that is measured rather than chosen:
       417 of hero-shop's 645 column boundaries are a single pixel apart, so nearest-neighbour at
       0.126x drops seven out of eight of them and the black outline goes with them
       (docs/shop-spec.md, section 2-4). -->
  <div class="inner cr" id="panelCross" style="display:none">
    <div class="cr-pair">
      <button type="button" class="cr-door" id="crDoorGames">
        <span class="cr-art"><img src="${heroGamesUri}" alt=""/></span>
        <span class="cr-cap">Games</span>
      </button>
      <button type="button" class="cr-door" id="crDoorShop">
        <span class="cr-art"><img src="${heroShopUri}" alt=""/></span>
        <span class="cr-cap">Shop</span>
      </button>
    </div>
  </div>
  <!-- The shop's own screen is drawn by webview.js (renderShop), because what is on it is DATA:
       what is on sale, what it costs and whether it has been bought. The shell is here for the same
       reason every other panel's is, and nothing else: a panel in the first paint is markup for a
       screen most readers never open. -->
  <div class="inner shop" id="panelShop" style="display:none"></div>
  <div class="inner bj-games" id="panelGames" style="display:none">
    <!-- The list is one step inside the crossroads now, so its heading carries the arrow back to
         it. One arrow, one step: the same contract every game's heading keeps. -->
    <div class="ihead bj-head">
      <button type="button" class="bj-back" id="gmBack" title="Games and shop">${IC.chevron}</button>
      <div class="it gm-it">${IC.coin} Games</div>
      <div class="bj-side"></div>
    </div>
    <div class="gm-rows" id="gmFavRows" hidden></div>
    <div class="gm-rows" id="gmRows">
${gameRows(gameList)}
    </div>
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
      <!-- The "session" key is the ring: the session's bar is gone and the ring is what is left of
           it, so the two checkboxes that used to mean "the bar" and "the ring" are one thing now.
           The one kept is the one named after the data (the "ring" key is dropped), because what a
           reader turns off here is a reading and not a shape. -->
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="session" checked> Session (5h)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="weekly" checked> Weekly (7d)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="fable" checked> Fable (7d)</label>
      <label class="sheet-check"><input type="checkbox" class="pmk" data-k="context" checked> Context</label>
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
  <div class="sheet wk-sheet" id="weeklyModal" hidden>
    <div class="sheet-card wk-card">
      <div class="sheet-head"><span id="wkTitle">This PC · this week</span><span class="wk-head-btns"><button class="sheet-x wk-refresh" id="wkRefresh" title="Refresh">${IC.refresh}</button><button class="sheet-x" id="wkClose" title="Close">${IC.chevron}</button></span></div>
      <div id="wkBody"><div class="wk-wait big"><span class="wk-spin"></span></div></div>
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

// INK_LIFT goes out on the page itself (#mascot's data-lift), so it is not exported here. The
// declined list has nowhere else to be read from, and test/panel-css.test.js has to be able to
// tell a drawing that was decided against from one that was forgotten.
module.exports = { renderHtml, INK_LIFT_DECLINED };
