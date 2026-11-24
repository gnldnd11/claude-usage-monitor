// The page around the games: the header credits button, the compact Usage rules, an unknown stored
// tab, an asset catalog with no player sprite, and a reload coming back where it was.
//
// Not a game, which is why the file is named for what it is. It lives beside the games because the
// harness reads one directory (test/webview/modes.js) and because every one of these modes is the
// same thing the games are: one page, one script, one process.
'use strict';

// Every selector in the served stylesheet that hides `sel` outright. A rule that merely MENTIONS
// the name is not one of them (.mascot-wrap is a different element and a fixed box of its own), so
// the match is anchored to the end of a compound.
function RULES_HIDING(css, sel) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const tail = new RegExp('\\' + sel + '(?![\\w-])\\s*$');
  let m;
  while ((m = re.exec(css))) {
    if (!/display\s*:\s*none/.test(m[2])) continue;
    for (const g of m[1].split(',')) if (tail.test(g.trim())) { out.push(m[1].trim()); break; }
  }
  return out;
}

module.exports = {
  id: 'chrome',
  modes: ['badtab', 'compact', 'favs', 'header', 'header-reduce', 'nohero', 'resp', 'resume-bj', 'resume-list'],
  // what the webview had stored when the page was loaded: a reload resuming where it was
  // `door` is which side of the crossroads a stored view was on (docs/shop-spec.md, section 4-4).
  // `resume-bj` deliberately leaves it out: a view stored before the crossroads existed knows a
  // game and no door, and it has to come back to that game rather than to the crossroads
  state: {
    compact: { tab: 'usage', compact: true },
    badtab: { tab: 'bogus' },
    favs: { tab: 'games', door: 'games', lastTab: 'usage' },
    'resume-list': { tab: 'games', door: 'games', lastTab: 'usage' },
    'resume-bj': { tab: 'games', game: 'blackjack', lastTab: 'agents' }
  },
  // an asset catalog without the player sprite: the seat stays empty and nothing else breaks
  html: function (html, mode) {
    if (mode !== 'nohero') return html;
    const m = /data-json='([^']*)'/.exec(html);
    const decode = (x) => x.replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    const cat = JSON.parse(decode(m[1]));
    delete cat.npcs.player;
    return html.replace(m[1], JSON.stringify(cat).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;'));
  },

  run: function (h, MODE) {
    const { ok, advance, later, doc, $, notShown, bodyTabs, inGames, atTable, gameRow,
        openList, openTable, reopenTable, dealerCards, allCards, isBack, lineText, hdrBal,
        latchIdle, active, activeName, mouseClick, ledgerBalance, useSeed, standOut, watch,
        noStaleTimer, toWebview, sentOps, sentHl, errors, hostLog, roCbs, ext, bj, credits,
        registry, gs, config, EXT, path } = h;
    // WHAT THE LIST IS, which is not every game in the register any more: a game behind a door of
    // its own has no row (games/registry.js, and docs/shop-spec.md 2-7)
    const LISTED = registry.behind(registry.LIST_DOOR);

    if (MODE === 'header' || MODE === 'header-reduce') {
    // the header credits line, re-checked on the real HTML now that it is a button
    const R = MODE === 'header-reduce';
    const box = $('hdCredits'), bal = $('ccBal'), coin = box.querySelector('.cc-coin');
    const base = { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] } };
    const push = (c, extra) => { toWebview({ type: 'data', data: Object.assign({}, base, { credits: c }, extra || {}) }); };
    const C = (balance, frac, counting, today) => ({ balance, today: today || 0, frac: frac || 0, perCredit: 10000, counting: !!counting });
    const lit = () => doc.querySelectorAll('#hdCredits .cc-r.on').length;
    const clear = () => { bal.classList.remove('roll'); coin.classList.remove('flip'); advance(1000); };
    function paint(ms) { const out = []; for (let i = 0; i < ms; i += 16) { advance(16); out.push(bal.textContent); } return out.filter((v, i, a) => v !== a[i - 1]); }
    const num = (x) => Number(String(x).replace(/,/g, ''));
    push(C(0)); advance(600);
    ok('zero: "0", no rows', bal.textContent === '0' && lit() === 0, bal.textContent);
    ok('title: weighted wording and the way in', box.title === '0 credits · +0 today\n1 credit per 10k tokens, weighted by API price\nClick for games', JSON.stringify(box.title));
    clear(); push(C(12, 0.5, true)); advance(600);
    ok('counting: class, rows 3, title', box.classList.contains('counting') && lit() === 3 && box.title === 'Counting past sessions…\n12 credits so far\nClick for games', JSON.stringify(box.title));
    clear(); push(C(15370, 0.22)); const land = paint(600);
    ok('landing after counting: counted up, no flip, no roll', (R ? land.length === 1 : land.length > 3) && !coin.classList.contains('flip') && !bal.classList.contains('roll') && bal.textContent === '15,370', land.length + ' distinct');
    const mint = (from, to, frac) => { clear(); push(C(from, 0.9)); advance(700); clear(); push(C(to, frac || 0.05)); return { flip: coin.classList.contains('flip'), roll: bal.classList.contains('roll'), rows: lit() }; };
    let m = mint(15370, 15371);
    ok('+1: roll and coin flip (all rows lit)' + (R ? ' [reduced motion: none]' : ''), R ? (!m.flip && !m.roll) : (m.flip && m.roll && m.rows === 6), JSON.stringify(m));
    if (!R) { advance(200); ok('+1: fresh coin at 200ms', lit() === 0, 'rows ' + lit()); coin.dispatchEvent({ type: 'animationend', animationName: 'ccFlip' }); ok('flip class dropped on animationend', !coin.classList.contains('flip')); }
    m = mint(16000, 16019); ok('+19: still a mint' + (R ? ' [reduced motion: none]' : ''), R ? !m.flip : m.flip && m.roll, JSON.stringify(m));
    m = mint(17000, 17020); ok('+20: a landing, no flip, no roll', !m.flip && !m.roll, JSON.stringify(m));
    m = mint(18000, 18300); ok('+300: a landing, no flip, no roll', !m.flip && !m.roll, JSON.stringify(m));
    clear(); push(C(18300)); advance(700); clear(); push(C(18250)); const down = paint(600);
    ok('decrease: counts down, no flip, no roll', !coin.classList.contains('flip') && !bal.classList.contains('roll') && bal.textContent === '18,250' && down.every((v, i) => i === 0 || num(v) <= num(down[i - 1])), down.join('>'));
    // fit: the observer must watch the parent (.ttl), not the fit-content button
    const fitRec = roCbs.find((r) => r.targets.some((t) => t === box.parentNode));
    ok('fit observer watches the parent .ttl', !!fitRec && box.parentNode.classList.contains('ttl'));
    let W = 300; Object.defineProperty(box, 'clientWidth', { get: () => W, configurable: true });
    Object.defineProperty(box, 'scrollWidth', { get: () => 16 + (box.classList.contains('fit2') ? 0 : 4 + bal.textContent.length * 7) + (box.classList.contains('fit1') ? 0 : 49), configurable: true });
    const fit = () => fitRec.cb();
    fit(); ok('fit: wide -> nothing dropped', !box.classList.contains('fit1') && !box.classList.contains('fit2'));
    W = 70; fit(); ok('fit: 70px -> word dropped', box.classList.contains('fit1') && !box.classList.contains('fit2'));
    W = 30; fit(); ok('fit: 30px -> number dropped too', box.classList.contains('fit2'));
    W = 300; fit(); ok('fit: widening brings both back', !box.classList.contains('fit1') && !box.classList.contains('fit2'));
    push(C(18250), { cfg: { panelHidden: ['credits'] } }); advance(5);
    ok('hidden from settings', box.style.display === 'none');
    push(C(18250), { cfg: { panelHidden: [] } }); advance(5);
    ok('shown again', box.style.display === '');
    } else if (MODE === 'favs') {
    // The games list's one top: the star that lifts a game out of the list and puts it above it.
    //
    // THE LIST IS FLAT (docs/game-panels.md, section 7-2), so this mode is half what it was: the
    // headings and the folding they carried are gone, and with them the second memory (`gamesFold`
    // in getState) that used to be the other half of what was checked here. What is left is the one
    // memory that stayed, and it is the HOST's: globalState, so a second window cannot show a
    // different set of favourites. Starring therefore round-trips through the real host in this
    // harness, which is why every star click is followed by advance().
    const css = doc.querySelector('style').textContent;
    const listed = () => doc.querySelectorAll('#panelGames .gm-row').map((r) => r.getAttribute('data-game'));
    const rowsIn = (box) => doc.querySelectorAll('#' + box + ' .gm-row').map((r) => r.getAttribute('data-game'));
    const star = (id) => h.favFor(id);
    const kept = () => Object.keys(gs.data.gameFavoritesV1 || {}).join();
    const home = h.rowBox('market').getAttribute('data-home');
    const fig0 = $('fig-market');
    // ---------- nothing starred ----------
    ok('nothing starred: the box is not there at all (no empty box, no dotted slot)',
      $('gmFavRows').hidden && doc.querySelectorAll('#panelGames .gm-row.fav').length === 0
      && listed().join() === LISTED.map((g) => g.id).join(), listed().join());
    ok('every star is off and says so, and names the game it keeps',
      doc.querySelectorAll('#panelGames .gm-fav').every((s) => s.getAttribute('aria-pressed') === 'false')
      && star('market').getAttribute('aria-label') === 'Favourite Market'
      && star('market').querySelectorAll('path').length === 1
      && star('market').querySelector('svg').getAttribute('aria-hidden') === 'true',
      star('market').getAttribute('aria-label'));
    // the first paint has to be right on its own: the scripts run after it, and a star that only
    // says it is off once webview.js has been through the list is a star that says nothing at first
    ok('the markup itself says every star is off, and carries no heading and nothing to fold',
      (h.rawHtml.match(/class="gm-fav" data-fav="[a-z]+" aria-pressed="false"/g) || []).length === LISTED.length
      && h.rawHtml.indexOf('gm-sec') < 0 && h.rawHtml.indexOf('gm-fold') < 0,
      (h.rawHtml.match(/aria-pressed="false"/g) || []).length + ' stars, '
        + (h.rawHtml.match(/gm-sec/g) || []).length + ' headings');
    ok('two boxes and no headings: every row lives in the one below',
      doc.querySelectorAll('#panelGames .gm-rows').length === 2
      && doc.querySelectorAll('#panelGames .gm-sec').length === 0
      && rowsIn('gmRows').join() === LISTED.map((g) => g.id).join(),
      rowsIn('gmRows').join());
    ok('the box that SHOWS carries the top margin, not the hidden one',
      doc.querySelectorAll('#panelGames .gm-rows.gm-top').length === 1
      && !$('gmFavRows').classList.contains('gm-top'));
    ok('the list takes the focus on the open button, never on the row div',
      active() === h.rowFor('blackjack') && active().localName === 'button', activeName());
    // ---------- one star ----------
    mouseClick(star('market')); advance(20);
    ok('a star does not open the game it is on', $('panelGames').style.display === '' && notShown('panelTable') && inGames() && !atTable(), bodyTabs());
    ok('starring lifts the row out of the list and into the box above it',
      rowsIn('gmFavRows').join() === 'market' && rowsIn(home).indexOf('market') < 0 && !$('gmFavRows').hidden,
      rowsIn('gmFavRows').join() + ' | ' + rowsIn(home).join());
    ok('the HOST is what remembers it: globalState, not the webview’s own state', kept() === 'market', kept());
    ok('the row moved whole, so its figure came with it (same element, not a redraw)',
      $('fig-market') === fig0 && fig0.closest('.gm-rows').id === 'gmFavRows',
      fig0.closest('.gm-rows').id);
    // THE LIT STAR IS THE WHOLE MARKER. There is no heading saying Favourites, so a kept row has to
    // be legible as kept on its own: the star is filled, always shown, and says aria-pressed
    ok('the star is on, is still the focus, and the row says so too',
      star('market').getAttribute('aria-pressed') === 'true' && active() === star('market')
      && h.rowBox('market').classList.contains('fav'), activeName());
    ok('and the ember star is what shows it is kept, with no heading anywhere',
      /\.gm-row\.fav \.gm-fav\{opacity:1;color:#e8895a;\}/.test(css)
      && /\.gm-row\.fav \.gm-fav svg\{fill:currentColor;\}/.test(css)
      && doc.querySelectorAll('#panelGames .gm-sec').length === 0);
    ok('Favourites is now the box that carries the top margin', $('gmFavRows').classList.contains('gm-top'));
    // ---------- the second one ----------
    mouseClick(star('blackjack')); advance(20);
    ok('the box keeps the register’s order, not the order they were starred in',
      rowsIn('gmFavRows').join() === 'blackjack,market', rowsIn('gmFavRows').join());
    ok('and the rows left behind keep theirs, with every game still listed once',
      rowsIn(home).join() === LISTED.map((g) => g.id).filter((id) => ['blackjack', 'market'].indexOf(id) < 0).join()
      && listed().length === LISTED.length, rowsIn(home).join());
    // ---------- off again, from the keyboard ----------
    star('market').focus(); doc.pressKey('Enter'); advance(20);
    ok('Enter on the star unstars it and the row goes home, in its own order',
      rowsIn('gmFavRows').join() === 'blackjack' && rowsIn(home).join() === 'hilo,slots,wheel,market'
      && kept() === 'blackjack',
      rowsIn('gmFavRows').join() + ' | ' + rowsIn(home).join());
    star('blackjack').focus(); doc.pressKey('Enter'); advance(20);
    ok('the last one off takes the box away again',
      $('gmFavRows').hidden && kept() === '' && listed().join() === LISTED.map((g) => g.id).join(),
      listed().join());
    // every game starred: the list below is the empty box now, and the same rule hides it
    for (const g of LISTED) { mouseClick(star(g.id)); advance(20); }
    ok('every game starred: the list below is hidden rather than left as an empty box',
      $('gmRows').hidden && !$('gmFavRows').hidden
      && rowsIn('gmFavRows').join() === LISTED.map((g) => g.id).join(),
      rowsIn('gmFavRows').join());
    // out of the area and back in through the Games door: the list is one step inside the
    // crossroads now, so this is what "coming back to the list" costs
    $('hdCredits').click(); advance(5); openList();
    ok('and the focus still lands on a row that can be seen', active() === h.rowFor('blackjack'), activeName());
    // a push arrives every ten seconds: it must not undo what the host was told
    const base = { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] }, credits: { balance: 0, today: 0, frac: 0, perCredit: 10000 } };
    toWebview({ type: 'data', data: Object.assign({}, base, { favGames: gs.data.gameFavoritesV1 }) }); advance(20);
    ok('a data push leaves the starred rows where they are',
      rowsIn('gmFavRows').join() === LISTED.map((g) => g.id).join() && $('gmRows').hidden,
      rowsIn('gmFavRows').join());
    for (const g of LISTED) { mouseClick(star(g.id)); advance(20); }
    ok('and clearing them all puts every row back in the list', $('gmFavRows').hidden
      && rowsIn('gmRows').join() === LISTED.map((g) => g.id).join(), rowsIn('gmRows').join());
    // ---------- the ring, lowered for the light theme in one place ----------
    ok('no focus ring writes the ember straight into the rule any more',
      !/focus-visible[^{]*\{[^}]*#e8895a/.test(css) && (css.match(/outline:2px solid var\(--focus\)/g) || []).length >= 9,
      (css.match(/outline:2px solid var\(--focus\)/g) || []).length + ' rings on the token');
    ok('and the light theme lowers that one token', /body\.vscode-light\{[^}]*--focus:#c25a34/.test(css));
    // the single exception, and it has to stay single: a ring on a surface that does not follow
    // the theme cannot use a token the theme lowers. It is still a token, declared once
    ok('a ring on a theme-independent plate reads its own token, not a literal',
      /\.ws-note button:focus-visible\{outline:2px solid var\(--focus-plate\)/.test(css)
      && (css.match(/--focus-plate:/g) || []).length === 1
      && (css.match(/var\(--focus-plate\)/g) || []).length === 1,
      (css.match(/var\(--focus-plate\)/g) || []).length + ' uses');
    } else if (MODE === 'compact') {
    // Usage compact must survive the selector swap: tab-usage is on the body whenever Usage shows
    ok('initial load (stored tab usage, compact): body has tab-usage + compact', bodyTabs() === 'tab-usage compact', bodyTabs());
    $('hdCredits').click(); advance(20);
    ok('games: tab-usage gone (compact rules off), compact kept for later', bodyTabs() === 'tab-games compact', bodyTabs());
    ok('games: header chevron hidden by body:not(.tab-usage) rule', /body:not\(\.tab-usage\) \.toggle\{display:none;\}/.test(doc.querySelector('style').textContent));
    $('hdCredits').click(); advance(20);
    ok('back to usage: tab-usage + compact again', bodyTabs() === 'tab-usage compact', bodyTabs());
    $('tabAgents').click(); advance(5); ok('agents: tab-agents only', bodyTabs() === 'tab-agents compact', bodyTabs());
    $('tabUsage').click(); advance(5); ok('usage again', bodyTabs() === 'tab-usage compact', bodyTabs());
    const css = doc.querySelector('style').textContent;
    // ONE, where there used to be six. Five went in 1.32.0 and four of them were hiding something
    // a reader did not ask to compress: the crab (and the second drawing that stood in for it),
    // the whole .ttl, and the credits line inside it, which is the only way into the games, so one
    // press of this chevron shut that door (docs/header-fold-spec.md, 2-4). The fifth was the
    // section header, which now holds nothing but the notice that the readings have gone old, and
    // a folded panel is drawing those same readings: folding may not be a way to lose the notice.
    // What is left is the stat tiles, which are readings and are what compact is for.
    ok('no body:not(.tab-agents) selector left; one body.tab-usage.compact rule',
      !css.includes('body:not(.tab-agents)') && (css.match(/body\.tab-usage\.compact/g) || []).length === 1,
      (css.match(/body\.tab-usage\.compact [^{]+/g) || []).join(' | '));
    // the crab and the way into the games both survive the fold. The crab is the product's mark and
    // the credits button is the only door to five games
    ok('folded, the crab is still there and the credits are still clickable',
      !!doc.querySelector('.head .mascot img') && $('hdCredits').style.display !== 'none'
      && !/\.mascot\{display:none/.test(css.replace(/\s/g, '')), bodyTabs());
    ok('and no rule hides the crab on any tab or in compact',
      !RULES_HIDING(css, '.mascot').length, RULES_HIDING(css, '.mascot').join(' | '));
    ok('the second header crab is gone from the page and the stylesheet',
      !doc.querySelector('.sparkle-hd') && !/sparkle-hd\{/.test(css));
    } else if (MODE === 'nohero') {
    // no player sprite in the catalog: the seat is empty and everything else still works
    openTable();
    ok('no player sprite: nothing sits at the table', doc.querySelectorAll('#bjHands .bj-hero').length === 0);
    ok('no player sprite: the stake preview and Deal are there', doc.querySelector('#bjHands .bj-stake.preview b').textContent === '10' && !$('bjDeal').disabled);
    useSeed((st) => st.phase === 'player', 'nohero-');
    $('bjDeal').click(); advance(2); advance(1200);
    ok('no player sprite: a hand still deals and shows', allCards().length === 4 && lineText(0) && !$('bjPlay').hidden, 'cards ' + allCards().length);
    ok('no player sprite: still no hero after the deal', doc.querySelectorAll('#bjHands .bj-hero').length === 0);
    } else if (MODE === 'resp') {
    // THE PANEL'S LAYOUT MAY NOT BE DECIDED BY THE PANEL'S OWN HEIGHT.
    //
    // Two classes come off the width: `narrow` (232) drops the stat tiles, `wrapcols` (340) puts
    // the ring and the crab under the bars instead of beside them, which takes the card from 409
    // to 575. The width this was read off was the viewport WITHOUT the scrollbar, and whether
    // there is a scrollbar is decided by how tall the panel is, so the panel's own height came
    // back round as its layout: on a real sidebar sitting near 340 the context bar filling up
    // made a scrollbar appear, the reading dropped by the gutter, and the crab fell 166px under
    // the bars and came back when the figure settled.
    //
    // So this mode drives the loop rather than taking one reading: the width is held still and
    // the GUTTER is moved, which is what the panel's height does, and nothing may move.
    const ro = roCbs.find((r) => r.targets.includes(doc.body));
    ok('the page watches the body, which is what runs this at all', !!ro);
    const settle = () => { ro.cb(); advance(200); };          // the observer is debounced 160ms
    const has = (c) => doc.body.classList.contains(c);
    const cls = () => ['narrow', 'wrapcols'].filter(has).join(' ') || '(neither)';
    const at = (w) => { h.innerWidth = w; settle(); };

    // 1. the verdict at each width, with nothing scrolling: the same two thresholds as before
    at(400); ok('a 400px panel is neither narrow nor wrapped', cls() === '(neither)', cls());
    at(339); ok('under 340 the ring and the crab go under the bars', cls() === 'wrapcols', cls());
    at(231); ok('and under 232 the stat tiles go with them', has('narrow') && has('wrapcols'), cls());
    at(400); ok('and a wide panel gets both back', cls() === '(neither)', cls());

    // 2. the defect itself: the sidebar does not move here at all
    at(345);
    ok('a 345px sidebar is not wrapped', !has('wrapcols'), cls());
    let flips = 0;
    for (let i = 0; i < 8; i++) {
      h.scrollGutter = i % 2 ? 0 : 15;      // the panel grew tall enough to scroll, then did not
      const was = has('wrapcols');
      settle();
      if (has('wrapcols') !== was) flips++;
    }
    ok('and the panel filling up and emptying out eight times cannot move its layout',
      flips === 0 && !has('wrapcols'), flips + ' flip(s), ' + cls());

    // 3. ...and the same measurement over and over does not walk anywhere either
    h.scrollGutter = 15;
    at(339);
    const settled = cls();
    for (let i = 0; i < 6; i++) settle();
    ok('six passes at one width land where the first one did', cls() === settled, settled + ' -> ' + cls());

    // 4. HYSTERESIS. The width that turns a class on is not the width that turns it off, and the
    //    gap is the gutter this window was actually measured to have (15 above) rather than a
    //    number written down: that is the widest the reading could ever have jumped by on its own
    at(400);
    let on = null, off = null;
    for (let w = 345; w >= 330 && on == null; w--) { at(w); if (has('wrapcols')) on = w; }
    for (let w = on; w <= 365 && off == null; w++) { at(w); if (!has('wrapcols')) off = w; }
    ok('wrapping starts one pixel under the threshold', on === 339, 'on at ' + on);
    ok('and stops a measured gutter above it, not at the same number',
      off === 340 + 15 && off > on, 'off at ' + off + ', on at ' + on);
    // the other threshold keeps the same pair, since one edge is a defect wherever it is
    at(400);
    let nOn = null, nOff = null;
    for (let w = 240; w >= 225 && nOn == null; w--) { at(w); if (has('narrow')) nOn = w; }
    for (let w = nOn; w <= 260 && nOff == null; w++) { at(w); if (!has('narrow')) nOff = w; }
    ok('the stat tiles go at 231 and come back at 247, the same gutter apart',
      nOn === 231 && nOff === 232 + 15, 'on at ' + nOn + ', off at ' + nOff);
    at(400);
    ok('and a wide panel ends up with neither, whatever was walked over', cls() === '(neither)', cls());
    ok('no handler threw', errors.length === 0, errors.map((e) => e && e.message).join(' | '));
    } else if (MODE === 'badtab') {
    ok('an unknown stored tab falls back to Usage', bodyTabs() === 'tab-usage' && $('panelUsage').style.display === '' && $('panelGames').style.display === 'none' && notShown('panelTable'), bodyTabs());
    } else {
    // a reloaded webview comes back where it was
    if (MODE === 'resume-list') {
      ok('reload with the list stored: the list is back', inGames() && !atTable() && $('panelGames').style.display === '' && notShown('panelTable'), bodyTabs());
      ok('reload with the list stored: no game state asked for', sentOps.filter((o) => o === 'open').length === 0, sentOps.join(','));
      $('hdCredits').click(); advance(5);
      ok('and it still leaves to the stored last tab', bodyTabs() === 'tab-usage', bodyTabs());
    } else {
      ok('reload with blackjack stored: the table is back', atTable() && $('panelTable').style.display === '' && $('panelGames').style.display === 'none', bodyTabs());
      ok('reload with blackjack stored: the host was asked for the round', sentOps.filter((o) => o === 'open').length === 1, sentOps.join(','));
      $('bjBack').click(); advance(5);
      ok('back still goes to the list', inGames() && !atTable(), bodyTabs());
      $('hdCredits').click(); advance(5);
      ok('and leaving goes to the stored last tab (agents)', bodyTabs() === 'tab-agents', bodyTabs());
    }
    }
  }
};
