// THE PANEL THEME, on the real page: the shelf that sells it, the attribute that wears it, and the
// two states a reader can be in about it.
//
// Not a game, which is why the file is named for what it is. It lives beside the games for the
// reason _shop.js and _chrome.js do: the harness reads one directory, and a mode here is the same
// thing a game's mode is -- one page, one script, one process.
//
// WHAT IS PINNED HERE, and why each one would be expensive to get wrong:
//   1. A READER WHO HAS BOUGHT NOTHING IS ON THE FREE THEME FROM THE FIRST PAINT, and the page
//      carries not one rule about any other one. This is the panel the usage monitor is for.
//   2. THE SECOND SHELF IS SOLD BY THE SAME ONE BUTTON as the first. A theme is a priced row, so
//      pressing it aims the button, and what the block beside that button shows is the theme's own
//      cell rather than a crab, because a theme has no drawing.
//   3. BUYING IS NOT WEARING. The purchase is money and lands in the record; putting it on the
//      panel is a preference and lands in globalState, and the two are different presses.
//   4. THE HOST REFUSES, NOT THE SCREEN. A theme nobody bought cannot be worn however the message
//      was made.
//   5. THE LAYERS ARE BOXES AND NOT PAINT. They are on the page whatever is worn, they are inside
//      the card and before its content, and the badge is inside the crab's own box.
'use strict';

const shop = require('../../../shop.js');
const SHELF = shop.CATALOG.reduce((n, i) => n + i.price, 0);

module.exports = {
  id: 'theme',
  // `theme-off` is a reader who has bought nothing, which is most readers and the one state that
  // has to be byte for byte what this product shipped before any of this existed. Its own mode
  // because it has to be a page NOBODY has pressed anything on
  modes: ['theme', 'theme-off'],
  // enough for the whole shelf and change, read off the catalog rather than written: a row added
  // to either shelf must not quietly turn this into a purse that ran out
  start: { theme: SHELF + 5000, 'theme-off': 1000 },
  state: {
    theme: { tab: 'games', door: 'shop', lastTab: 'usage' }
  },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openList, openDoor } = h;
    const css = () => doc.querySelector('style').textContent;
    const themes = require(h.path.join(h.EXT, 'themes', 'registry.js'));
    const FREE = themes.FREE;
    const PAID = themes.THEMES.filter((t) => t.price);
    const wornAttr = () => doc.body.getAttribute('data-theme');
    const themeCell = (id) => doc.querySelector('#shThemes .sh-cell[data-theme="' + id + '"]');
    const themeCells = () => doc.querySelectorAll('#shThemes .sh-cell');
    const stored = () => h.gs.data.creditLedgerV1.shop || null;
    const pref = () => h.gs.data.mascotSlotsV1 || {};
    const btn = () => $('shAct');

    // ---------- the layers, which are on every page whatever is worn ----------
    // THE BOXES ARE THE SHELL'S AND THE PAINT IS A THEME'S (styles.js, the .th-l block). So they
    // are here before anything has been bought, and they are empty
    const layers = doc.querySelectorAll('.th-l');
    ok('the four card-and-wrap layers are on the page, every one of them empty',
      layers.length === 4 && layers.every((e) => e.innerHTML === ''),
      layers.map((e) => e.getAttribute('class')).join(' | '));
    // THE FRAME IS A CHILD OF THE WRAP AND THE OTHER THREE ARE THE CARD'S, which is not a tidying
    // detail: the frame runs the full height of the panel and its outer strips are wider than the
    // card's own padding, so a frame boxed to the card could not reach the edge it draws
    {
      const frame = doc.querySelector('.th-frame');
      const scene = doc.querySelector('.th-scene');
      ok('the frame hangs off the wrap and the scene off the card',
        frame.parentNode.classList.contains('wrap') && scene.parentNode.classList.contains('card'),
        frame.parentNode.getAttribute('class') + ' / ' + scene.parentNode.getAttribute('class'));
      const kids = scene.parentNode.children.map((e) => e.id || e.getAttribute('class') || e.localName);
      ok('and the card layers come before everything the card says',
        kids.slice(0, 3).join(' ') === 'th-l th-scene th-l th-floor th-l th-motes'.replace(/ th-/g, ' th-'),
        kids.join(' > '));
    }
    // the badge is in the crab's own box, and the orbit in the ring: the two places a theme
    // reaches that are not the card itself
    ok('the badge is inside the mascot box and the orbit inside the ring',
      doc.querySelectorAll('.th-badge').length === 1 && !!doc.querySelector('#pm_mascot .th-badge')
      && doc.querySelectorAll('.th-orbit').length === 1 && !!doc.querySelector('.ringwrap .th-orbit'),
      doc.querySelectorAll('.th-badge').length + ' badge, ' + doc.querySelectorAll('.th-orbit').length + ' orbit');

    if (MODE === 'theme-off') {
      // ---------- 1. THE READER WHO HAS BOUGHT NOTHING ----------
      ok('the first paint already names the free theme, so a bought one never flashes the default',
        wornAttr() === FREE, JSON.stringify(wornAttr()));
      // AND NOT ONE RULE ABOUT ANY OTHER THEME IS IN FORCE. They are all in the page -- one
      // stylesheet, like the games' -- and none of them can match, because none of them is worn
      const sheet = css();
      ok('every theme’s CSS is in the page, and every one of it is behind its own attribute AND tab',
        PAID.every((t) => sheet.indexOf('body.tab-usage[data-theme="' + t.id + '"]') >= 0)
        && PAID.every((t) => sheet.split('body[data-theme="' + t.id + '"]').length === 1),
        PAID.map((t) => t.id).join(' '));
      ok('and the free theme has no rule at all, so the card is what it has always been',
        sheet.indexOf('data-theme="' + FREE + '"') < 0 && sheet.indexOf('data-th="' + FREE + '"') < 0,
        'free = ' + FREE);
      // the accent token is the ember and nothing moved it, which is what makes the bars, the ring
      // and the deltas render exactly what they rendered before the shelf existed
      ok('the accent is still the ember, and the ring reads it rather than its own attribute',
        /--accent:#e8895a/.test(sheet) && /#ringArc\{stroke:var\(--accent\)/.test(sheet),
        (/#ringArc\{[^}]*\}/.exec(sheet) || ['(no rule)'])[0]);
      // ...and a push that says nothing about a theme leaves it exactly where it was. A host older
      // than this build sends no `theme` at all, and the answer to that is the free one
      h.toWebview({ type: 'data', data: { agents: [], agentActivity: { instances: [], stats: {} }, xp: {}, today: {}, count: 0, cfg: { panelHidden: [] } } });
      advance(20);
      ok('a push with no theme on it leaves the panel on the free one',
        wornAttr() === FREE, JSON.stringify(wornAttr()));
      ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // ---------- 2. THE SECOND SHELF ----------
    ok('the stored door comes back as the shop, with the second shelf on it',
      !!$('shThemes') && themeCells().length === themes.THEMES.length,
      themeCells().length + ' cell(s) against ' + themes.THEMES.length + ' theme(s)');
    ok('it names itself and says when, the way the scenes do',
      $('shThemes').querySelector('.sh-sn').textContent === shop.THEME_NAME
      && $('shThemes').querySelector('.sh-sw').textContent === shop.THEME_WHEN,
      $('shThemes').querySelector('.sh-sn').textContent + '/' + $('shThemes').querySelector('.sh-sw').textContent);
    // THE SHELF HAS NO EMPTY CELLS, unlike the scenes above it: a theme is a directory, so the
    // shelf is however many there are and there is no fixed count for a missing one to leave a
    // hole in (themes/README.md)
    ok('and no empty slots on it, because there is no fixed number of themes',
      doc.querySelectorAll('#shThemes .sh-cell.soon').length === 0);
    ok('the free theme is the one in use and says so without a price',
      themeCell(FREE).classList.contains('on') && themeCell(FREE).textContent.trim() === 'in use',
      themeCell(FREE).getAttribute('aria-label'));
    // NO NAME IS PRINTED, which is the scenes' own rule: a cell carries a tag, and its name is in
    // the label. A theme may not grow words on this screen
    ok('every other cell is a price, written the way the stake chips write a figure',
      PAID.every((t) => themeCell(t.id).classList.contains('buy')
        && themeCell(t.id).textContent.trim() === (t.price / 1000) + 'K'),
      PAID.map((t) => t.id + ':' + themeCell(t.id).textContent.trim()).join(' '));
    ok('and every cell says what it is for a reader who cannot see it',
      themeCells().every((c) => !!c.getAttribute('aria-label') && c.hasAttribute('aria-pressed')),
      themeCells().map((c) => JSON.stringify(c.getAttribute('aria-label'))).join(' '));
    // A CELL SHOWS THE THEME'S COLOUR, because it cannot show a panel: the thing on sale is this
    // whole card repainted, so a 36px thumbnail of it would be a smudge
    ok('a cell carries its own chip rather than a picture of a crab',
      themeCells().every((c) => !!c.querySelector('.th-chip') && !c.querySelector('.sh-pic'))
      && themeCell(PAID[0].id).querySelector('.th-chip').getAttribute('data-th') === PAID[0].id,
      themeCells().map((c) => (c.querySelector('.th-chip') || {}).getAttribute
        ? c.querySelector('.th-chip').getAttribute('data-th') : '-').join(' '));

    // ---------- 3. IT IS SOLD BY THE SAME ONE BUTTON ----------
    const buyId = PAID[0].id;
    ok('nothing is aimed at until a price is pressed, on this shelf as on the one above',
      $('shCtl').hidden && $('shTry').hidden
      && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 0);
    h.mouseClick(themeCell(buyId)); advance(40);
    ok('pressing a theme’s price aims the one button at it, and marks only that cell',
      themeCell(buyId).classList.contains('aim')
      && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 1
      && !$('shCtl').hidden,
      doc.querySelectorAll('#panelShop .sh-cell.aim').map((c) => c.getAttribute('data-theme')
        || c.getAttribute('data-key') || c.getAttribute('data-pool')).join());
    // THE BLOCK BESIDE THE BUTTON SHOWS WHAT IS ON SALE IN THE FORM IT HAS. A drawing is shown in
    // the box it will be drawn in; a theme has no drawing, so what it shows is its own cell again
    ok('the block beside the button shows the theme’s chip, not an empty picture frame',
      $('shArt').hidden && !$('shChip').hidden
      && $('shChip').getAttribute('data-th') === buyId
      && $('shName').textContent === PAID[0].name,
      ($('shArt').hidden ? 'no art' : 'ART') + ', chip=' + $('shChip').getAttribute('data-th'));
    const bal0 = h.ledgerBalance();
    btn().click(); advance(20);
    ok('one press buys it, and the record holds the purchase and the price together',
      !!stored() && stored().owned[shop.slotOf(buyId)] === 1 && stored().spent === PAID[0].price,
      JSON.stringify(stored()));
    ok('and the purse is down by exactly that, with the second prefix on the key',
      h.ledgerBalance() === bal0 - PAID[0].price
      && Object.keys(stored().owned).join() === 'theme:' + buyId,
      bal0 + ' -> ' + h.ledgerBalance());
    ok('it said so out loud, once', new RegExp(PAID[0].name + ' bought').test($('shLive').textContent),
      $('shLive').textContent);

    // ---------- 4. BUYING IS NOT WEARING ----------
    // THE HALF THAT IS WORTH A TEST OF ITS OWN. A drawing bought goes into its scene at once,
    // because a scene holds exactly one and the purchase answers which. The panel also wears
    // exactly one theme, but putting it on is a SECOND press: a purchase that redrew the whole
    // card under the reader would be the shop changing the thing they were looking at
    ok('buying a theme does not put it on the panel: that is a second press',
      wornAttr() === FREE && !pref().theme, wornAttr() + ' / ' + JSON.stringify(pref()));
    ok('and its cell stopped being a price and became something to press',
      !themeCell(buyId).classList.contains('buy') && !themeCell(buyId).classList.contains('aim')
      && themeCell(buyId).localName === 'button' && themeCell(buyId).textContent.trim() === 'own',
      (themeCell(buyId).getAttribute('class') || '') + ' ' + themeCell(buyId).textContent.trim());
    // the button leaves with the purchase, the same as on the first shelf
    ok('the button and its block leave again, with the rest of the shelf still for sale',
      $('shCtl').hidden && $('shTry').hidden
      && doc.querySelectorAll('#panelShop .sh-cell.buy').length > 0,
      doc.querySelectorAll('#panelShop .sh-cell.buy').length + ' still for sale');

    const ledgerBefore = JSON.stringify(h.gs.data.creditLedgerV1);
    themeCell(buyId).focus();
    themeCell(buyId).click(); advance(40);
    ok('one press puts it on the panel, and the body is what carries it',
      wornAttr() === buyId && pref().theme === buyId,
      wornAttr() + ' / ' + JSON.stringify(pref()));
    ok('the cell says it is in use, and the free one stopped saying so',
      themeCell(buyId).classList.contains('on') && themeCell(buyId).textContent.trim() === 'in use'
      && !themeCell(FREE).classList.contains('on'),
      themeCell(buyId).textContent.trim() + ' / ' + themeCell(FREE).textContent.trim());
    // WEARING IS NOT MONEY. A reader changing their mind may not move the record that says what
    // they paid (shop.js: what was bought and what is worn are two questions with two homes)
    ok('and not one credit moved for it',
      JSON.stringify(h.gs.data.creditLedgerV1) === ledgerBefore, 'the ledger moved');
    ok('a repaint on a press hands the keyboard back to the cell that was pressed',
      doc.activeElement === themeCell(buyId),
      doc.activeElement && (doc.activeElement.getAttribute('aria-label') || doc.activeElement.localName));
    ok('it was read out, once, by its own name',
      new RegExp(PAID[0].name + ' is on the panel').test($('shLive').textContent), $('shLive').textContent);

    // ...and back. The free theme is always on the shelf, which is what makes every owned cell
    // pressable where a scene with one drawing is not: there is always somewhere to move to
    themeCell(FREE).click(); advance(40);
    ok('pressing the free cell takes the panel back, which is why it is on the shelf at all',
      wornAttr() === FREE && themeCell(FREE).classList.contains('on')
      && !themeCell(buyId).classList.contains('on'),
      wornAttr());

    // ---------- 5. THE HOST REFUSES, NOT THE SCREEN ----------
    // The screen only ever draws cells for what it was sent, so the refusal is asked for on the
    // MESSAGE: a theme nobody bought cannot be worn however that message was made
    const notMine = PAID[1] ? PAID[1].id : null;
    if (notMine) {
      h.hostSend({ type: 'panelTheme', id: notMine }); advance(20);
      ok('a theme nobody bought is refused by the host and nothing moves',
        wornAttr() === FREE && pref().theme !== notMine,
        wornAttr() + ' / ' + JSON.stringify(pref()));
    }
    for (const junk of ['', 'float', 'nope', '__proto__']) {
      h.hostSend({ type: 'panelTheme', id: junk }); advance(5);
    }
    ok('and so is a drawing’s key, an empty one and a name off a prototype',
      wornAttr() === FREE && pref().theme === FREE, wornAttr() + ' / ' + JSON.stringify(pref()));
    ok('nothing was charged for any of it',
      JSON.stringify(h.gs.data.creditLedgerV1) === ledgerBefore);

    // ---------- 6. IT FOLLOWS THE READER OUT OF THE SHOP ----------
    // The attribute rides the DATA PUSH and not the shop's replies, because the card it repaints is
    // on the Usage tab and most readers never open this screen at all
    themeCell(buyId).click(); advance(40);
    openList(); advance(20);
    // IT STAYS CHOSEN AND STOPS APPLYING, which is the point of scoping a theme's tokens to the
    // Usage tab: the attribute is what the reader picked and the class is where it means anything.
    // A theme that kept applying here would repaint the blackjack felt and the mine with it
    ok('the theme is still the chosen one on a game screen, and no longer in force',
      wornAttr() === buyId && h.bodyTabs().indexOf('tab-usage') < 0,
      wornAttr() + ' / ' + h.bodyTabs());
    {
      const css = doc.querySelector('style').textContent;
      const loose = css.split('body[data-theme="' + buyId + '"]');
      ok('and not one rule of it is on the body without that tab',
        loose.length === 1, (loose.length - 1) + ' rule(s) outside the tab');
    }
    doc.getElementById('tabUsage').click(); advance(40);
    ok('and it is still on when the reader is back on the card it repaints',
      wornAttr() === buyId && h.bodyTabs().indexOf('tab-usage') >= 0,
      wornAttr() + ' / ' + h.bodyTabs());

    // ---------- 7. FOLDED ----------
    // A fold takes the readings away and the theme stays: it is what the card IS, not one of the
    // things on it. The one layer that goes with them is the landscape, because the stat row it
    // stands behind is gone and there is no ground left for it (styles.js, .compact .th-floor)
    $('toggle').click(); advance(600);
    ok('folded, the panel keeps its theme',
      doc.body.classList.contains('compact') && wornAttr() === buyId,
      h.bodyTabs() + ' ' + (doc.body.classList.contains('compact') ? 'compact' : 'open'));
    ok('and the layers are still on the page, with the landscape switched off by a rule',
      doc.querySelectorAll('.th-l').length === 4
      && /\.compact \.th-floor\{height:0;\}/.test(css()),
      (/\.compact \.th-floor\{[^}]*\}/.exec(css()) || ['(no rule)'])[0]);
    $('toggle').click(); advance(600);
    ok('and unfolding brings it back', !doc.body.classList.contains('compact') && wornAttr() === buyId);
    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
  }
};
