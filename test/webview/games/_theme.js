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
  // `theme-gone` is a theme that is NO LONGER SOLD, from both sides of it at once: the reader who
  // bought one before it was retired, and the reader who did not. Its own mode because the first of
  // those needs a RECORD holding a purchase nobody can make any more, which is a stored ledger and
  // not a press
  modes: ['theme', 'theme-off', 'theme-gone'],
  // enough for the whole shelf and change, read off the catalog rather than written: a row added
  // to either shelf must not quietly turn this into a purse that ran out
  start: { theme: SHELF + 5000, 'theme-off': 1000, 'theme-gone': SHELF + 5000 },
  state: {
    theme: { tab: 'games', door: 'shop', lastTab: 'usage' }
  },

  run: function (h, MODE) {
    const { ok, advance, doc, $, openList, openDoor } = h;
    const css = () => doc.querySelector('style').textContent;
    const themes = require(h.path.join(h.EXT, 'themes', 'registry.js'));
    const FREE = themes.FREE;
    const PAID = themes.THEMES.filter((t) => t.price);
    // ...AND THE TWO HALVES OF THAT, because a priced theme is not necessarily one that can be
    // bought any more (2026-11-26: five of the seven were taken off the price list, themes/README.md
    // section 7). Everything about buying below is written against SOLD, and GONE is its own block
    const SOLD = PAID.filter((t) => !t.retired);
    const GONE = PAID.filter((t) => t.retired);
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

    // ---------- A THEME THAT IS NO LONGER SOLD, from both sides ----------
    //
    // WHAT MUST NOT HAPPEN HERE is the reason this mode exists: a theme taken off the price list is
    // taken off the SHELF'S PRICE and off nobody's panel. The reader who paid for it goes on wearing
    // it, choosing it and seeing it marked in use; the reader who did not sees a grey cell with no
    // figure on it, cannot press it, and cannot buy it however the message is made.
    if (MODE === 'theme-gone') {
      // Both halves have to exist or this mode is checking nothing
      if (!GONE.length || !SOLD.length) {
        ok('this build retires a theme and still sells one, or this mode proves nothing',
          false, GONE.length + ' retired, ' + SOLD.length + ' still sold');
        return;
      }
      const paid = GONE[0];                       // bought before it was retired
      const never = GONE[1] || null;              // retired and nobody bought it
      // ---------- 1. THE RECORD IS SEEDED, BECAUSE THIS PURCHASE CANNOT BE MADE ANY MORE ----------
      // That is the whole subject of the mode, so the purchase is a STORED ledger rather than a
      // press: a reader who paid while it was on sale, read back by the host on its next sync
      // (shop.js, createHandler). `moves` is 1, which is what makes it the later of the two records
      h.gs.data.creditLedgerV1.shop = {
        by: 'abcdef0123456789', owned: { [shop.slotOf(paid.key)]: 1 }, moves: 1, spent: paid.price
      };
      h.hostSend({ type: 'panelTheme', id: paid.key }); advance(40);
      ok('a theme bought before it was retired is still worn, and the host allowed it',
        wornAttr() === paid.key && pref().theme === paid.key,
        wornAttr() + ' / ' + JSON.stringify(pref()));
      // ...and it is in force, which is what says the CSS did not go with the sale
      ok('and it is in force on the card it repaints, with its rules still in the page',
        h.bodyTabs().indexOf('tab-usage') >= 0
        && css().indexOf('body.tab-usage[data-theme="' + paid.key + '"]') >= 0,
        h.bodyTabs());
      // ---------- 2. AND IT IS STILL ON THE SHELF, AS THEIRS ----------
      openDoor('shop'); advance(20);
      ok('the shelf still holds every theme, the retired ones included',
        themeCells().length === themes.THEMES.length,
        themeCells().length + ' cell(s) against ' + themes.THEMES.length + ' theme(s)');
      ok('the one that was bought is pressable and says it is in use, with no word about the sale',
        themeCell(paid.key).localName === 'button'
        && themeCell(paid.key).classList.contains('on')
        && themeCell(paid.key).textContent.trim() === 'in use'
        && themeCell(paid.key).getAttribute('aria-label') === paid.name + ', in use',
        (themeCell(paid.key).getAttribute('class') || '') + ' | '
        + themeCell(paid.key).getAttribute('aria-label'));
      // ...AND IT CAN BE TAKEN OFF AND PUT BACK ON, which is the half a reader would notice first:
      // a theme they cannot return to is a theme they have lost by trying the free one
      themeCell(FREE).click(); advance(40);
      ok('pressing the free cell takes the panel off it, as it does for one still on sale',
        wornAttr() === FREE && !themeCell(paid.key).classList.contains('on'), wornAttr());
      themeCell(paid.key).click(); advance(40);
      ok('and pressing it again puts it back, so nothing was lost by looking away',
        wornAttr() === paid.key && pref().theme === paid.key
        && themeCell(paid.key).classList.contains('on'),
        wornAttr() + ' / ' + JSON.stringify(pref()));
      // ---------- 3. AND IT CANNOT BE BOUGHT BY ANYBODY ELSE ----------
      if (never) {
        ok('one nobody bought carries no figure, is not a button, and says why',
          themeCell(never.key).localName === 'span'
          && themeCell(never.key).classList.contains('gone')
          && themeCell(never.key).textContent.trim() === 'Gone'
          && themeCell(never.key).getAttribute('aria-label') === never.name + ', no longer sold',
          themeCell(never.key).localName + ' '
          + JSON.stringify(themeCell(never.key).getAttribute('aria-label')));
        // A PRESS DOES NOTHING AT ALL, which is the screen's half: the cell is not a button, so the
        // one control cannot be pointed at it and no message leaves the page
        const sentN = h.sent('shop').length;
        h.mouseClick(themeCell(never.key)); advance(40);
        ok('a press on it points the one button at nothing and sends the host nothing',
          $('shCtl').hidden && $('shTry').hidden
          && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 0
          && h.sent('shop').length === sentN,
          ($('shCtl').hidden ? 'no button' : 'BUTTON') + ', '
          + (h.sent('shop').length - sentN) + ' message(s)');
        // ...AND THE HOST IS WHAT REFUSES IT. The screen only ever draws what it was sent, so the
        // refusal is asked for on the MESSAGE: a hand-made buy is answered with the sentence and
        // not one credit moves (shop.js, whyNot)
        const spent0 = stored().spent, bal0 = h.ledgerBalance();
        h.hostSend({ type: 'shop', op: 'buy', key: never.key, n: 7101 }); advance(40);
        ok('and a message buying it is refused by the host, which says which theme and why',
          !$('shErr').hidden && new RegExp(never.name + ' is no longer sold').test($('shErr').textContent),
          ($('shErr').hidden ? '(no warning)' : $('shErr').textContent));
        ok('nothing was charged for it and nothing was added to the record',
          stored().spent === spent0 && h.ledgerBalance() === bal0
          && !stored().owned[shop.slotOf(never.key)],
          JSON.stringify(stored()));
        ok('and its cell did not become something bought',
          themeCell(never.key).textContent.trim() === 'Gone'
          && !themeCell(never.key).classList.contains('on'),
          themeCell(never.key).textContent.trim());
        // ---------- 3a. AN AIM THAT WAS SET WHILE IT WAS STILL ON SALE ----------
        // The one button is pointed at a KEY, and that key outlives the shelf being redrawn
        // (webview.js, sh.aim). So the aim is set on a shelf where this theme is still for sale,
        // which is the screen a window that was open before the retirement had, and then the real
        // shelf is drawn over it: what has to happen is that the button and the block go, because
        // the host would refuse that purchase and a Buy the host refuses is the worst button on
        // this screen. The answer is in what is FOR SALE rather than in how the cell is drawn
        // (webview.js, shopForSale), which is why it is checked through this path and not by eye
        h.intercept = (m) => {
          if (m.type !== 'shop') return false;
          const st = shop.view(shop.clean(h.gs.data.creditLedgerV1.shop));
          st.themes.opts = st.themes.opts.map((o) => (o.key === never.key
            ? Object.assign({}, o, { retired: false }) : o));
          h.toWebview({ type: 'shop', n: m.n, state: st,
            balance: h.ledgerBalance(), free: h.ledgerBalance() });
          return true;
        };
        openList(); advance(20); openDoor('shop'); advance(20);
        ok('on a shelf that still sells it, its cell is a price like any other',
          themeCell(never.key).localName === 'button'
          && themeCell(never.key).classList.contains('buy'),
          themeCell(never.key).localName + ' ' + (themeCell(never.key).getAttribute('class') || ''));
        h.mouseClick(themeCell(never.key)); advance(40);
        ok('and the one button can be aimed at it there',
          themeCell(never.key).classList.contains('aim') && !$('shCtl').hidden,
          ($('shCtl').hidden ? 'no button' : 'button'));
        h.intercept = null;
        openList(); advance(20); openDoor('shop'); advance(20);
        ok('and the real shelf takes the aim, the block and the button away with the price',
          $('shCtl').hidden && $('shTry').hidden
          && doc.querySelectorAll('#panelShop .sh-cell.aim').length === 0
          && themeCell(never.key).textContent.trim() === 'Gone',
          ($('shCtl').hidden ? 'no button' : 'BUTTON') + ', '
          + doc.querySelectorAll('#panelShop .sh-cell.aim').length + ' aimed, cell says '
          + themeCell(never.key).textContent.trim());
      }
      // ---------- 4. AND THE ONES STILL ON SALE ARE SOLD EXACTLY AS BEFORE ----------
      // The flag is per row, and this is what says so: a refusal written one line too wide would
      // close the shelf rather than five cells of it
      const sale = doc.querySelectorAll('#shThemes .sh-cell.buy').map((c) => c.getAttribute('data-theme'));
      ok('exactly the themes still on the price list wear a price, in the shelf’s own order',
        sale.join() === SOLD.map((t) => t.id).join(), sale.join() + ' vs ' + SOLD.map((t) => t.id).join());
      const buy = SOLD[0];
      const spentBefore = stored().spent;
      h.mouseClick(themeCell(buy.id)); advance(40);
      ok('pressing one of them aims the one button at it, as it always did',
        themeCell(buy.id).classList.contains('aim') && !$('shCtl').hidden
        && $('shName').textContent === buy.name,
        $('shName').textContent + ' | ' + ($('shCtl').hidden ? 'no button' : 'button'));
      btn().click(); advance(40);
      ok('and one press buys it, at its own price, beside the retired one in the same record',
        stored().spent === spentBefore + buy.price
        && stored().owned[shop.slotOf(buy.id)] === 1
        && stored().owned[shop.slotOf(paid.key)] === 1,
        JSON.stringify(stored()));
      ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
      return;
    }

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
    ok('every cell still for sale is a price, written the way the stake chips write a figure',
      SOLD.length > 0 && SOLD.every((t) => themeCell(t.id).classList.contains('buy')
        && themeCell(t.id).textContent.trim() === (t.price / 1000) + 'K'),
      SOLD.map((t) => t.id + ':' + themeCell(t.id).textContent.trim()).join(' '));
    // ...AND ONE THAT IS NO LONGER SOLD CARRIES NO FIGURE AT ALL. A price nothing will take is the
    // worst thing that cell could say, and a cell that cannot change anything is not a button and is
    // not in the tab order either (webview.js, shopThemeCellHtml). The `theme-gone` mode is where
    // the state an OWNER of one of these is in is checked, because that needs a record to exist
    ok('and one that is no longer sold says so in a word, with no price and nothing to press',
      GONE.every((t) => themeCell(t.id).localName === 'span'
        && themeCell(t.id).classList.contains('gone')
        && themeCell(t.id).textContent.trim() === 'Gone'
        && !themeCell(t.id).hasAttribute('aria-pressed')
        && themeCell(t.id).getAttribute('aria-label') === t.name + ', no longer sold'),
      GONE.map((t) => t.id + ':' + themeCell(t.id).localName + ':'
        + themeCell(t.id).textContent.trim()).join(' '));
    // ...so the one button can never be pointed at one: the shelf draws no mark on it and the list
    // of what is for sale does not hold it (webview.js, shopForSale)
    ok('and the one button cannot be aimed at a theme that is no longer sold',
      GONE.every((t) => !themeCell(t.id).classList.contains('buy')
        && !themeCell(t.id).classList.contains('aim')),
      GONE.map((t) => t.id + ':' + (themeCell(t.id).getAttribute('class') || '')).join(' '));
    // ...AND THE GREY IS ITS OWN COLOUR BEING TAKEN OFF rather than a colour being added. A chip at
    // full strength is how this shelf says a theme is on offer, and this screen is allowed one
    // accent, which is already spoken for twice (the ring and the aiming bar)
    ok('and what greys it is its own colour coming off, with no new colour spent on it',
      GONE.length > 0 && /\.sh-cell\.gone \.th-chip\{[^}]*filter:grayscale\(1\)/.test(css())
      && !/\.sh-cell\.gone[^}]*#[0-9a-f]{3,8}/i.test(css()),
      (/\.sh-cell\.gone[^}]*\}/.exec(css()) || ['(no rule)'])[0]);
    ok('and every cell says what it is for a reader who cannot see it',
      themeCells().every((c) => !!c.getAttribute('aria-label'))
      && themeCells().every((c) => c.hasAttribute('aria-pressed')
        || c.getAttribute('role') === 'img'),
      themeCells().map((c) => JSON.stringify(c.getAttribute('aria-label'))).join(' '));
    // A CELL SHOWS THE THEME'S COLOUR, because it cannot show a panel: the thing on sale is this
    // whole card repainted, so a 36px thumbnail of it would be a smudge
    ok('a cell carries its own chip rather than a picture of a crab',
      themeCells().every((c) => !!c.querySelector('.th-chip') && !c.querySelector('.sh-pic'))
      && themeCell(SOLD[0].id).querySelector('.th-chip').getAttribute('data-th') === SOLD[0].id,
      themeCells().map((c) => (c.querySelector('.th-chip') || {}).getAttribute
        ? c.querySelector('.th-chip').getAttribute('data-th') : '-').join(' '));

    // ---------- 3. IT IS SOLD BY THE SAME ONE BUTTON ----------
    const buyId = SOLD[0].id;
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
      && $('shName').textContent === SOLD[0].name,
      ($('shArt').hidden ? 'no art' : 'ART') + ', chip=' + $('shChip').getAttribute('data-th'));
    const bal0 = h.ledgerBalance();
    btn().click(); advance(20);
    ok('one press buys it, and the record holds the purchase and the price together',
      !!stored() && stored().owned[shop.slotOf(buyId)] === 1 && stored().spent === SOLD[0].price,
      JSON.stringify(stored()));
    ok('and the purse is down by exactly that, with the second prefix on the key',
      h.ledgerBalance() === bal0 - SOLD[0].price
      && Object.keys(stored().owned).join() === 'theme:' + buyId,
      bal0 + ' -> ' + h.ledgerBalance());
    ok('it said so out loud, once', new RegExp(SOLD[0].name + ' bought').test($('shLive').textContent),
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
      new RegExp(SOLD[0].name + ' is on the panel').test($('shLive').textContent), $('shLive').textContent);

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
    const notMine = SOLD[1] ? SOLD[1].id : null;
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
