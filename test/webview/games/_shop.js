// The crossroads and the shop: the two screens the coin button now leads to.
//
// Neither is a game, which is why this file is named for what it is rather than for an id in the
// register (there is no entry there and there must not be one: docs/shop-spec.md, section 4-5). It
// lives beside the games because the harness reads one directory and because every mode here is
// the same thing the games' modes are: one page, one script, one process.
//
// WHAT IS PINNED HERE, and why each one would be expensive to get wrong:
//   1. the coin opens a CHOICE, not a screen: two doors, no numbers, no arrow, and leaving forgets
//      which door was taken, because what the reader asked for is the two ways in.
//   2. ONE ARROW IS ONE STEP, from four depths: a game's own depth, a game, the list, the shop.
//   3. the shop prices nothing. The row arrives with its price and whether it is owned.
//   4. A PURCHASE IS CHARGED ONCE AND IS NOT A WIN. The balance falls by the price, the ledger
//      holds the purchase and the money in one record, and the header does not celebrate it.
//   5. what cannot be afforded SAYS WHY, and says which of the two reasons it is: there are none,
//      or a table is holding them.
//   6. THE EMPTY SLOTS CANNOT BE BOUGHT AND CANNOT BE REACHED. Not by a press, not by the
//      keyboard, and not by a message sent past the screen: what refuses them is the catalog on the
//      host, which is the same rule that stops a hand-edited store holding a thousand items.
//   7. the purchase reaches the crab. That is what was bought, so if the panel does not draw it the
//      purchase bought nothing a reader can see.
'use strict';

module.exports = {
  id: 'shop',
  modes: ['cross', 'shop', 'shop-poor', 'shop-held'],
  // 3,000 buys the one thing on the shelf and leaves something over. 5 is a purse that cannot
  // reach it, and 1,500 is a purse that can until a table is holding 1,000 of it, which is what
  // the two different short-purse sentences need
  start: { shop: 3000, 'shop-poor': 5, 'shop-held': 1500 },
  // the two shop modes RESUME INTO THE SHOP, which also says that the stored door comes back
  state: {
    shop: { tab: 'games', door: 'shop', lastTab: 'usage' },
    'shop-poor': { tab: 'games', door: 'shop', lastTab: 'usage' }
  },

  run: function (h, MODE) {
    const { ok, advance, doc, $, showing, notShown, bodyTabs, openList, openShop, openGame, active, activeName } = h;
    const css = () => doc.querySelector('style').textContent;
    const cells = () => doc.querySelectorAll('#shGrid .sh-cell');
    const soon = () => doc.querySelectorAll('#shGrid .sh-cell.soon');
    const item = () => doc.querySelector('#shGrid .sh-cell:not(.soon)');
    const tag = () => { const c = item(); return c && c.querySelector('.sh-tag').textContent; };
    const btn = () => $('shAct');
    const note = () => $('shNote');
    const stored = () => h.gs.data.creditLedgerV1.shop || null;
    const srcOf = (el) => el && el.getAttribute('src');

    if (MODE === 'cross') {
    // ---------- 1. the coin opens a choice ----------
    ok('the page starts on Usage, as it always has', bodyTabs() === 'tab-usage', bodyTabs());
    $('hdCredits').click(); advance(20);
    ok('the coin opens the crossroads and neither of the two screens behind it',
      showing('panelCross') && !showing('panelGames') && !showing('panelShop')
      && notShown('panelTable') && bodyTabs() === 'tab-games', bodyTabs());
    const doors = doc.querySelectorAll('#panelCross .cr-door');
    ok('two doors, each a picture with its name under it',
      doors.length === 2
      && doors.map((d) => d.querySelector('.cr-cap').textContent).join() === 'Games,Shop'
      && doors.every((d) => !!d.querySelector('.cr-art img')),
      doors.map((d) => d.querySelector('.cr-cap').textContent).join());
    ok('and they are the two drawings, not a glyph or a tile',
      doors.map((d) => /[^/]+$/.exec(d.querySelector('.cr-art img').getAttribute('src'))[0]).join()
        === 'hero-games.png,hero-shop.png',
      doors.map((d) => d.querySelector('.cr-art img').getAttribute('src')).join(' '));
    // NO NUMBERS. The balance is in the button directly above this screen, and a figure here would
    // be the same number twice (docs/shop-spec.md, section 2-1)
    ok('there is not one digit on the screen', !/\d/.test($('panelCross').textContent),
      JSON.stringify($('panelCross').textContent.trim()));
    // NO ARROW either: the way out is the same button that was pressed to come in, and a second
    // control for one step is what section 4-2 refuses
    ok('and no second way back: the coin is the only one', !doc.querySelector('#panelCross .bj-back'));
    ok('the first door takes the focus', active() === $('crDoorGames'), activeName());
    // the pictures have no pixel grid to preserve, so nearest-neighbour would drop their outlines
    ok('the heroes are scaled smoothly while the pixel art is not',
      /\.cr-art img\{[^}]*max-height:120px/.test(css())
      && !/\.cr-art img\{[^}]*image-rendering/.test(css())
      && /\.sparkle\{[^}]*image-rendering:pixelated/.test(css()),
      (/\.cr-art img\{[^}]*\}/.exec(css()) || [''])[0]);

    // ---------- 2. one arrow is one step, from every depth ----------
    $('crDoorGames').click(); advance(20);
    ok('the Games door opens the list', showing('panelGames') && !showing('panelCross'), bodyTabs());
    ok('and the list carries the arrow back to the crossroads', !!$('gmBack'));
    $('gmBack').click(); advance(20);
    ok('which is one step up, not out of the area', showing('panelCross') && bodyTabs() === 'tab-games', bodyTabs());
    $('crDoorShop').click(); advance(20);
    ok('the Shop door opens the shop', showing('panelShop') && !showing('panelCross') && !showing('panelGames'), bodyTabs());
    $('shBack').click(); advance(20);
    ok('and its arrow climbs to the same place', showing('panelCross'), bodyTabs());
    // a game is one step further in, and the arrow unwinds one depth at a time
    openGame('blackjack'); advance(20);
    ok('a game opens from the list, two steps in', h.atTable(), bodyTabs());
    $('bjBack').click(); advance(20);
    ok('its arrow goes to the list', showing('panelGames') && !h.atTable(), bodyTabs());
    $('gmBack').click(); advance(20);
    ok('and the next press to the crossroads', showing('panelCross'), bodyTabs());

    // ---------- the door is not remembered ----------
    $('crDoorShop').click(); advance(20);
    $('hdCredits').click(); advance(20);
    ok('the coin leaves for the tab it was pressed from', bodyTabs() === 'tab-usage', bodyTabs());
    $('hdCredits').click(); advance(20);
    ok('and coming back shows the choice again, not the door last taken',
      showing('panelCross') && !showing('panelShop'), bodyTabs());

    // ---------- Escape takes the same step the arrow does ----------
    $('crDoorGames').click(); advance(20);
    doc.pressKey('Escape'); advance(20);
    ok('Escape in the list climbs to the crossroads', showing('panelCross'), bodyTabs());
    doc.pressKey('Escape'); advance(20);
    ok('and Escape on the crossroads leaves the area, like the coin', bodyTabs() === 'tab-usage', bodyTabs());

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
    return;
    }

    // ---------- the shop ----------
    if (MODE === 'shop-held') {
      // 5. THE CREDITS ARE THERE AND STILL CANNOT BE SPENT, which is a different sentence from
      // having none. A bet of 1,000 against a purse of 1,500 leaves 500 free and the one thing on
      // the shelf out of reach, while the header still reads 1,500
      h.openTable();
      h.useSeed((st) => st.phase === 'player', 'held-');
      doc.querySelector('#bjStakes button[data-v="1000"]').click(); advance(5);
      $('bjDeal').click(); advance(2); advance(1200);
      ok('a round is live and holding its stake of 1,000',
        !$('bjPlay').hidden && h.sent('bj').filter((m) => m.op === 'deal').pop().bet === 1000, bodyTabs());
      openShop(); advance(20);
      ok('the purchase the balance covers is still refused', btn().disabled && !$('shCtl').hidden,
        btn().textContent + (btn().disabled ? ' (off)' : ' (on)'));
      ok('and the reason given is the table holding them, not an empty purse',
        !note().hidden && note().textContent === 'Another table is holding these credits.',
        JSON.stringify(note().textContent));
      ok('nothing was bought', stored() === null, JSON.stringify(stored()));
      ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
      return;
    }

    if (MODE === 'shop-poor') {
      ok('the stored door comes back as the shop', showing('panelShop') && bodyTabs() === 'tab-games', bodyTabs());
      ok('five credits: the shelf is still drawn, because what is on it is the point',
        cells().length > 1 && !!doc.querySelector('#shTry img'), String(cells().length));
      ok('nothing on it says it is owned', !doc.querySelector('#shGrid .sh-cell.owned') && tag() === '1K', tag());
      ok('five credits: the one thing on the shelf is off and asks for its own price',
        btn().disabled && !note().hidden && note().textContent === 'You need 1,000 credits.',
        JSON.stringify(note().textContent));
      ok('and the button is still on the screen, because there is still something to buy',
        !$('shCtl').hidden && btn().textContent === 'Buy', btn().textContent);
      ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
      return;
    }

    // ---------- 3. the screen, and what it asks the host ----------
    const shop = require(h.path.join(h.EXT, 'shop.js'));
    ok('the stored door comes back as the shop, and the list is not drawn under it',
      showing('panelShop') && !showing('panelGames') && !showing('panelCross'), bodyTabs());
    ok('and it asked the host once for what it sells',
      h.sent('shop').filter((m) => m.op === 'open').length === 1,
      h.sent('shop').map((m) => m.op).join(','));
    // the heading: one arrow, the shop's own glyph, and a corner that stays empty
    ok('the heading is an arrow, a glyph and the name',
      !!$('shBack') && doc.querySelectorAll('#panelShop .bj-back').length === 1
      && !!doc.querySelector('#panelShop .ihead .it svg')
      && doc.querySelector('#panelShop .bj-ttl').textContent === 'Shop'
      && doc.querySelector('#panelShop .bj-side').textContent === '',
      doc.querySelector('#panelShop .ihead').textContent.trim());
    // WHAT IS BEING BOUGHT, shown as the drawing it will be. Not a staged picture of it: the same
    // file the panel points at, so a preview cannot show something the panel never draws
    ok('the preview is the very drawing the panel would use',
      !!doc.querySelector('#shTry img') && srcOf(doc.querySelector('#shTry img')) === $('mascot').getAttribute('data-float'),
      srcOf(doc.querySelector('#shTry img')));
    ok('and it is the mascot box to the pixel, so the preview and the panel cannot disagree',
      /\.sh-try img\{[^}]*width:88px/.test(css()) && /\.sh-try img\{[^}]*height:74px/.test(css())
      && /\.sh-try img\{[^}]*object-fit:contain/.test(css())
      && /\.sh-try img\{[^}]*object-position:bottom/.test(css()),
      (/\.sh-try img\{[^}]*\}/.exec(css()) || [''])[0]);
    ok('the art is hidden from a reader who is being told instead',
      $('shTry').getAttribute('aria-hidden') === 'true' && !!$('shName').textContent,
      $('shName').textContent + ' / ' + $('shPrice').textContent);
    ok('the name and the price are the host\'s own figures',
      $('shName').textContent === shop.ITEMS[0].name
      && /1,000/.test($('shPrice').textContent), $('shName').textContent + ' ' + $('shPrice').textContent);

    // ---------- 6. the shelf: one thing on it, and slots whose contents are not decided ----------
    ok('one cell per catalog row, and the rest are empty slots',
      cells().length === shop.ITEMS.length + soon().length && soon().length >= 1,
      cells().length + ' cells, ' + soon().length + ' empty');
    ok('the shelf is one row at this width',
      /\.sh-grid\{[^}]*repeat\(3,/.test(css()) && cells().length <= 3, cells().length + ' cells');
    ok('an empty slot carries no picture, no price and no name for what might go in it',
      soon().every((c) => !c.querySelector('img') && c.textContent.trim() === 'Soon'),
      soon().map((c) => JSON.stringify(c.textContent)).join(' '));
    // NOT PRESSABLE AND NOT IN THE TAB ORDER: something that cannot be bought should not be
    // counted through by a reader on a keyboard
    ok('and it is not a button, not focusable and has no key to send',
      soon().every((c) => c.localName !== 'button' && !c.hasAttribute('tabindex')
        && !c.hasAttribute('data-key') && !c.disabled),
      soon().map((c) => c.localName + (c.hasAttribute('tabindex') ? '[tabindex]' : '')).join(' '));
    ok('the cell that IS on sale says what it costs, as the stake chips write a figure', tag() === '1K', tag());
    ok('and every cell says what it is for a reader who cannot see it',
      cells().every((c) => c.getAttribute('role') === 'img' && !!c.getAttribute('aria-label'))
      && item().getAttribute('aria-label') === 'Floating crab, 1,000 credits',
      cells().map((c) => JSON.stringify(c.getAttribute('aria-label'))).join(' '));
    ok('nothing is spent by arriving', stored() === null, JSON.stringify(stored()));
    // the keyboard goes from the arrow to the button and counts nothing in between
    ok('the button takes the focus, because it is the only thing in here to press',
      active() === btn(), activeName());
    ok('and nothing on the shelf can take it', !doc.querySelector('#shGrid button'),
      String(doc.querySelectorAll('#shGrid button').length) + ' button(s) on the shelf');

    // ---------- 4. the purchase ----------
    const price = shop.ITEMS[0].price;
    const bal0 = h.ledgerBalance();
    ok('it can be afforded, which is what the next few checks need', !btn().disabled, btn().textContent);
    btn().click(); advance(20);
    ok('buying charges the price exactly once',
      h.ledgerBalance() === bal0 - price, bal0 + ' -> ' + h.ledgerBalance());
    ok('and the ledger holds the purchase and the money in ONE record',
      !!stored() && stored().spent === price
      && Object.keys(stored().owned).join() === 'mascot:float' && stored().moves === 1,
      JSON.stringify(stored()));
    advance(700);   // the header counts down to its new figure; this is past the end of that
    ok('the header says the same thing the record does',
      h.hdrBal() === (bal0 - price).toLocaleString('en-US'), h.hdrBal());
    // A PURCHASE IS NOT AN EARNING: the coin does not flip and the figure does not roll, which is
    // what setCreditsQuiet is for (webview.js)
    ok('and the header does not celebrate it',
      !$('ccBal').classList.contains('roll')
      && !doc.querySelector('#hdCredits .cc-coin').classList.contains('flip'),
      $('ccBal').getAttribute('class') || '(no class)');
    // the three states of this screen are two now: there is nothing left to buy, so the control
    // row is gone and what is on the screen is that it is theirs
    ok('what is bought says so, in words, and the button it had is gone',
      tag() === 'own' && item().classList.contains('owned') && $('shCtl').hidden
      && !note().hidden && /^Bought\./.test(note().textContent),
      tag() + ' / ' + ($('shCtl').hidden ? 'no button' : 'button') + ' / ' + JSON.stringify(note().textContent));
    ok('and the price is gone with it, because it is a figure about the past',
      $('shPrice').textContent === '', JSON.stringify($('shPrice').textContent));
    ok('it said so out loud, once', /Floating crab bought/.test($('shLive').textContent), $('shLive').textContent);
    // 7. AND IT REACHES THE CRAB. The record's key is what the panel reads out of the data push to
    // choose the quiet drawing (webview.js, FLOAT_SLOT), so the two halves are pinned to the one
    // string: it is asserted above as what landed in the ledger, the host's push carries it
    // (test/host.test.js) and the picture it chooses is walked in test/webview/games/_usage.js
    ok('and what was stored is the key the panel looks for',
      Object.keys(stored().owned).join() === 'mascot:float', JSON.stringify(stored().owned));

    // the same press again is refused BY THE HOST, and the shelf does not move
    const spent1 = stored().spent;
    h.hostSend({ type: 'shop', op: 'buy', key: 'float', n: 9001 }); advance(20);
    ok('the host refuses a second purchase of the same thing, and nothing is charged',
      stored().spent === spent1 && h.ledgerBalance() === bal0 - price, JSON.stringify(stored()));
    // 6 again, from the far side: an empty slot has no name, so a message that invents one is
    // refused by the catalog and not by the screen
    for (const key of ['soon', 'witch', 'mascot:float', '']) {
      h.hostSend({ type: 'shop', op: 'buy', key, n: 9100 }); advance(20);
      ok('a message naming "' + key + '" buys nothing and costs nothing',
        stored().spent === spent1 && Object.keys(stored().owned).join() === 'mascot:float'
        && !$('shErr').hidden && /nothing is sold under that name/.test($('shErr').textContent),
        JSON.stringify(stored()) + ' / ' + $('shErr').textContent);
    }
    ok('and the shelf is what it was', cells().length === shop.ITEMS.length + soon().length && tag() === 'own',
      cells().length + ' cells, ' + tag());

    // ---------- the keyboard: this screen repaints on other windows' purchases ----------
    // The market's reported bug in this screen's shape. It re-asks the host whenever a push says
    // the shelf moved, and a repaint that pulls the keyboard out of the editor while somebody is
    // typing is exactly what CUC.refocus exists to prevent (webview.js, refocusIn)
    h.hasFocus = false;
    const moves0 = (doc.focusLog || []).length;
    h.hostSend({ type: 'shop', op: 'open', n: 9003 }); advance(20);
    ok('a repaint while the editor holds the focus takes nothing',
      (doc.focusLog || []).length === moves0 && active() === doc.body,
      ((doc.focusLog || []).length - moves0) + ' focus move(s), on ' + activeName());
    h.hasFocus = true;
    h.hostSend({ type: 'shop', op: 'open', n: 9004 }); advance(20);
    ok('and the same repaint hands it back once the webview holds it',
      $('panelShop').contains(active()), activeName());

    // ---------- a reply that cannot describe the shelf ----------
    // the shelf is drawn from the last reply that had one, so a reply that is only a reason leaves
    // what is on the screen exactly where it is (games/README.md, section 5)
    const shelf0 = cells().length;
    h.intercept = (m) => {
      if (m.type !== 'shop') return false;
      h.toWebview({ type: 'shop', n: m.n, balance: h.ledgerBalance(), free: h.ledgerBalance(), error: 'the shelf could not be read' });
      return true;
    };
    h.hostSend({ type: 'shop', op: 'open', n: 9005 }); advance(20);
    openList(); advance(20); openShop(); advance(20);
    ok('a reply with no shelf shows the reason and keeps what is drawn',
      !$('shErr').hidden && /could not be read/.test($('shErr').textContent) && cells().length === shelf0,
      $('shErr').textContent);
    // and when nothing answers at all, it says so
    h.intercept = (m) => m.type === 'shop';
    openList(); advance(20); openShop(); advance(5);
    ok('a message nobody answers leaves a clock running', h.pending() > 0, h.pending() + ' timer(s)');
    advance(4100);
    ok('and four seconds later the screen says so', /respond/.test($('shErr').textContent), $('shErr').textContent);
    // ---------- walking out with a message in flight ----------
    // A game drops its clock when it is left, and this screen has one too: without that, leaving
    // while a message is out there leaves it locked for the rest of the four seconds, and a reader
    // who comes straight back gets the stale shelf and nothing asked for a new one
    h.intercept = (m) => m.type === 'shop';
    openList(); advance(20); openShop(); advance(5);
    h.intercept = null;
    const asked = h.sent('shop').filter((m) => m.op === 'open').length;
    openList(); advance(20);          // out of the shop, one step up and across
    openShop(); advance(20);
    ok('leaving and coming back asks the host again rather than sitting out the wait',
      h.sent('shop').filter((m) => m.op === 'open').length === asked + 1 && $('shErr').hidden,
      (h.sent('shop').filter((m) => m.op === 'open').length - asked) + ' new ask(s), warning bar '
        + ($('shErr').hidden ? 'clear' : 'showing'));
    // the bar is HIDDEN rather than emptied, so what is read here is that state and not its text:
    // the sentence from four seconds ago is still in the element and says nothing about now
    advance(5000);
    ok('and the clock it left behind cannot fire into the new screen', $('shErr').hidden,
      $('shErr').hidden ? 'clear' : $('shErr').textContent);
    ok('nothing is still waiting to fire', h.pending() === 0, h.pending() + ' timer(s)');

    ok('no handler threw', h.errors.length === 0, h.errors.map((e) => e && e.message).join(' | '));
  }
};
